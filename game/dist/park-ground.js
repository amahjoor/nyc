import * as THREE from './vendor/three.module.min.js';

// What the ground of a mapped park is, drawn into the terrain shader.
//
// The aerial photograph was taken in March: bare trees over leaf litter, and
// lawns the colour of straw. Read as it is, a park in that photograph is grey
// and brown, and the rule that tells turf from paving calls most of it
// paving. Inside a park that has its own ground maps (see
// scripts/build-park.py) the photograph is therefore not consulted
// at all. Two images in the park's frame say what is there:
//
//   surface  the distance, in metres, to the edge of the nearest path, lawn,
//            patch of bare earth and outcrop of rock, one in each channel.
//            A distance keeps an edge straight and sharp between pixels.
//   canopy   how much of each spot is under tree crowns, how much is mapped
//            woodland, how much court or playground, and where the park is.
//
// What each kind looks like is drawn here, for a July afternoon.

/** One set of uniforms, shared by every terrain material. */
export function createParkGroundUniforms() {
  return { parkUse: { value: false }, parkSurface: { value: null }, parkCanopy: { value: null }, parkFrame: { value: new THREE.Vector4(0, 0, 1, 0) },
    parkSize: { value: new THREE.Vector2(1, 1) }, parkReach: { value: 4 }, parkTreeFade: { value: new THREE.Vector2(0, 1) } };
}

/**
 * Point the terrain at a park's ground maps, or at none.
 * @param {object} uniforms from createParkGroundUniforms
 * @param {object|null} park { frame: { x, z, cos, sin }, size: { width, depth }, surface, canopy (textures), reach }
 */
export function bindParkGround(uniforms, park) {
  const valid = Boolean(park?.surface && park?.canopy && park.frame && park.size);
  uniforms.parkUse.value = valid;
  if (!valid) { uniforms.parkSurface.value = null; uniforms.parkCanopy.value = null; return; }
  uniforms.parkSurface.value = park.surface; uniforms.parkCanopy.value = park.canopy;
  uniforms.parkFrame.value.set(park.frame.x, park.frame.z, park.frame.cos, park.frame.sin);
  uniforms.parkSize.value.set(park.size.width, park.size.depth);
  uniforms.parkReach.value = park.reach ?? 4;
}

/**
 * Trees are drawn as meshes out to `far` metres; from `near` the canopy is
 * painted on the ground instead. With no trees drawn, pass 0 and 1.
 */
export function setParkTreeFade(uniforms, near, far) { uniforms.parkTreeFade.value.set(near, Math.max(near + 1, far)); }

export const PARK_GROUND_PARS_GLSL = /* glsl */`
uniform bool parkUse;
uniform sampler2D parkSurface;
uniform sampler2D parkCanopy;
uniform vec4 parkFrame;
uniform vec2 parkSize;
uniform float parkReach;
uniform vec2 parkTreeFade;
`;

// Runs inside the ground finish, where these are in scope: w (world xz),
// size (metres to a pixel), close (1 near the eye), span (distance from it).
export const PARK_GROUND_GLSL = /* glsl */`
      {
        vec2 parkOffset = w - parkFrame.xy;
        vec2 parkLocal = vec2( parkOffset.x * parkFrame.z + parkOffset.y * parkFrame.w, parkOffset.y * parkFrame.z - parkOffset.x * parkFrame.w );
        vec2 parkUV = clamp( parkLocal / parkSize, 0.0, 1.0 );
        vec4 parkOver = texture2D( parkCanopy, parkUV );
        vec4 parkEdge = ( texture2D( parkSurface, parkUV ) - 0.5 ) * ( 2.0 * parkReach );
        float parkInside = parkUse ? smoothstep( 0.42, 0.58, parkOver.a ) : 0.0;
        if ( parkInside > 0.0 ) {
          float soften = clamp( size * 1.2, 0.05, 2.0 );
          float mottleP = texture2D( uNycNoise, w * 0.17 ).g, gritP = texture2D( uNycNoise, w * 2.3 ).b, fineP = texture2D( uNycNoise, w * 7.7 ).a;
          float clumpP = texture2D( uNycNoise, w * 0.41 ).r, fieldP = texture2D( uNycNoise, w * 0.023 ).b, bladeP = texture2D( uNycNoise, w * vec2( 3.1, 5.3 ) ).g;
          float broadP = texture2D( uNycNoise, w * 0.0063 ).g, patchP = texture2D( uNycNoise, w * 0.071 ).r;
          // Edges are ragged where one living thing gives way to another, and clean where one of them is laid.
          float paved = smoothstep( - soften, soften, parkEdge.r );
          float lawn = smoothstep( - soften, soften, parkEdge.g + 0.5 * ( mottleP - 0.5 ) );
          float bare = smoothstep( - soften, soften, parkEdge.b + 0.4 * ( mottleP - 0.5 ) );
          float rock = smoothstep( - soften, soften, parkEdge.a + 0.9 * ( patchP - 0.5 ) );
          float court = smoothstep( 0.4, 0.6, parkOver.b );
          float wood = smoothstep( 0.25, 0.75, parkOver.g + 0.3 * ( patchP - 0.5 ) );
          float shade = parkOver.r;

          // Mown lawn: two greens in drifts, the mower's stripes, and straw where it is worn.
          vec3 turfP = mix( vec3( 0.058, 0.108, 0.03 ), vec3( 0.125, 0.19, 0.056 ), 0.4 * fieldP + 0.6 * clumpP );
          float stripe = sin( parkLocal.x * 1.31 + 2.0 * broadP );
          turfP *= 1.0 + 0.055 * stripe * ( 1.0 - smoothstep( 0.2, 1.2, size ) );
          turfP = mix( turfP, vec3( 0.2, 0.185, 0.085 ), 0.4 * smoothstep( 0.66, 0.82, broadP + 0.25 * ( patchP - 0.5 ) ) );
          turfP *= 1.0 + close * 0.6 * ( bladeP - 0.5 );
          // The rest of the park: rougher grass, thin and trodden to earth where the crowns close over it.
          vec3 soilP = mix( vec3( 0.085, 0.068, 0.046 ), vec3( 0.13, 0.105, 0.07 ), patchP ) * ( 1.0 + close * 0.5 * ( gritP - 0.5 ) );
          vec3 roughP = mix( vec3( 0.048, 0.092, 0.027 ), vec3( 0.105, 0.165, 0.05 ), 0.5 * fieldP + 0.5 * clumpP ) * ( 1.0 + close * 0.7 * ( bladeP - 0.5 ) );
          roughP = mix( roughP, soilP, shade * smoothstep( 0.35, 0.75, mottleP + 0.5 * shade - 0.25 ) * 0.8 );
          // Woodland floor: last year's leaves, with ivy and seedlings in the lighter places.
          vec3 litterP = mix( vec3( 0.07, 0.056, 0.038 ), vec3( 0.12, 0.095, 0.058 ), texture2D( uNycNoise, w * 0.31 ).r ) * ( 1.0 + close * 0.6 * ( fineP - 0.5 ) );
          vec3 ivyP = mix( vec3( 0.03, 0.068, 0.024 ), vec3( 0.07, 0.125, 0.04 ), clumpP ) * ( 1.0 + close * 0.7 * ( bladeP - 0.5 ) );
          vec3 woodP = mix( litterP, ivyP, smoothstep( 0.4, 0.62, texture2D( uNycNoise, w * 0.047 ).b + 0.3 * ( clumpP - 0.5 ) ) );
          // Bare earth, infield clay and the bridle path.
          vec3 dirtP = mix( vec3( 0.2, 0.15, 0.1 ), vec3( 0.31, 0.24, 0.16 ), 0.6 * patchP + 0.4 * fieldP ) * ( 0.92 + 0.16 * mottleP ) * ( 1.0 + close * 0.35 * ( gritP - 0.5 ) );
          // Manhattan schist: grey, banded along its grain, glittering, with lichen in the hollows.
          vec2 grain = vec2( dot( w, vec2( 0.87, 0.49 ) ) * 0.045, dot( w, vec2( -0.49, 0.87 ) ) * 0.7 );
          float band = texture2D( uNycNoise, grain ).r;
          vec3 rockP = mix( vec3( 0.105, 0.105, 0.11 ), vec3( 0.29, 0.285, 0.275 ), 0.65 * band + 0.35 * mottleP );
          rockP = mix( rockP, vec3( 0.1, 0.12, 0.07 ), 0.3 * smoothstep( 0.55, 0.8, texture2D( uNycNoise, w * 0.11 ).g ) );
          rockP *= 1.0 + close * ( 0.5 * ( gritP - 0.5 ) + 0.5 * step( 0.9, fineP ) );
          // Courts and playgrounds: a laid, even surface.
          vec3 courtP = vec3( 0.075, 0.15, 0.115 ) * ( 0.9 + 0.2 * mottleP ) * ( 1.0 + close * 0.2 * ( gritP - 0.5 ) );
          // Paths: weathered asphalt, paler than a street, patched here and there.
          vec3 pathP = vec3( 0.135, 0.135, 0.138 ) * ( 0.84 + 0.3 * mottleP ) * ( 0.9 + 0.2 * step( 0.6, texture2D( uNycNoise, w * 0.035 ).b ) );
          pathP *= 1.0 + close * ( 0.45 * ( gritP - 0.5 ) + 0.25 * ( fineP - 0.5 ) );

          vec3 parkGround = mix( roughP, woodP, wood );
          parkGround = mix( parkGround, turfP, lawn );
          parkGround = mix( parkGround, dirtP, bare );
          // A slope too steep to hold soil shows the rock under the park.
          vec3 parkUp = normalize( ( vec4( normalize( vNormal ), 0.0 ) * viewMatrix ).xyz );
          float steep = 1.0 - smoothstep( 0.66, 0.8, abs( parkUp.y ) + 0.08 * ( patchP - 0.5 ) );
          parkGround = mix( parkGround, rockP, max( rock, steep ) );
          parkGround = mix( parkGround, courtP, court );
          parkGround = mix( parkGround, pathP, paved );
          // Beyond the reach of the sun's own shadows the ground under the trees is simply darker;
          // further still the crowns themselves are painted, where no tree is drawn.
          float painted = smoothstep( parkTreeFade.x, parkTreeFade.y, span );
          parkGround *= 1.0 - 0.36 * shade * smoothstep( 200.0, 420.0, span ) * ( 1.0 - painted );
          vec3 crownP = mix( vec3( 0.04, 0.078, 0.028 ), vec3( 0.098, 0.158, 0.05 ), 0.55 * texture2D( uNycNoise, w * 0.052 ).r + 0.45 * texture2D( uNycNoise, w * 0.19 ).g );
          parkGround = mix( parkGround, crownP, painted * smoothstep( 0.2, 0.62, shade + 0.25 * ( mottleP - 0.5 ) ) );
          diffuseColor.rgb = mix( diffuseColor.rgb, parkGround, parkInside );
        }
      }`;

/**
 * A material that draws the park's ground on something other than the terrain: the lid over a cutting,
 * which carries lawn and path across at the height the ground had. It reads the same uniforms.
 */
export function createParkGroundMaterial(uniforms) {
  const material = new THREE.MeshStandardMaterial({ color: 0x2c3a1c, roughness: 1, side: THREE.DoubleSide });
  material.name = 'Park ground carried over a cutting';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vParkXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvParkXZ = position.xz;');
    shader.fragmentShader = `varying vec2 vParkXZ;\n${PARK_GROUND_PARS_GLSL}\n` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        vec2 w = vParkXZ;
        float size = max( fwidth( w.x ), fwidth( w.y ) ), close = 1.0 - smoothstep( 0.012, 0.07, size ), span = length( vViewPosition );
        ${PARK_GROUND_GLSL}
      }`);
  };
  material.customProgramCacheKey = () => 'nyc-park-ground';
  return material;
}

/** Load a park's two ground maps, from the folder `base`, as data textures (no colour management, no flipping). */
export function loadParkTextures(manifest, base, loader = new THREE.TextureLoader()) {
  const load = (entry, mipmaps) => new Promise((resolve, reject) => {
    loader.load(base + entry.url.replace(/^\.\//, ''), texture => {
      texture.colorSpace = THREE.NoColorSpace; texture.flipY = false; texture.premultiplyAlpha = false;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.generateMipmaps = mipmaps;
      texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 4; texture.needsUpdate = true;
      resolve(texture);
    }, undefined, () => reject(new Error(`Park ground map unavailable: ${entry.url}`)));
  });
  return Promise.all([load(manifest.surface, true), load(manifest.canopy, true)]).then(([surface, canopy]) => ({ surface, canopy }));
}
