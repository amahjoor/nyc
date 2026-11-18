import * as THREE from './vendor/three.module.min.js';
import { shared, supportsFloatTargets } from './gfx-common.js';

// The harbor, the rivers and the sea.
//
// The shoreline is the city's own: borough outlines clipped to the water's
// edge. They are drawn into two masks, a coarse one for the whole city and a
// sharp one around the player, which tell the terrain where to stop and the
// water where to begin. The surface itself is one large sheet with moving
// ripples that mirrors the sky, the sun's glitter path and, near the player,
// the city standing over it.

export const WATER_LEVEL = -.12;
const FAR_SIZE = 2048, NEAR_SIZE = 2048, NEAR_SPAN = 1536, NEAR_STEP = 256;

const WATER_VERTEX = /* glsl */`
#include <common>
#include <fog_pars_vertex>
varying vec3 vWaterWorld;
varying vec4 vWaterMirror;
uniform mat4 uMirrorMatrix;
void main() {
	vec4 world = modelMatrix * vec4( position, 1.0 );
	vWaterWorld = world.xyz;
	vWaterMirror = uMirrorMatrix * world;
	vec4 mvPosition = viewMatrix * world;
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}`;

const WATER_FRAGMENT = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec3 vWaterWorld;
varying vec4 vWaterMirror;
uniform sampler2D tSkyPanorama;
uniform sampler2D tMirror;
uniform float uMirror;
uniform vec3 uWaterTint;
uniform float uChop;
uniform sampler2D tContext;
uniform vec4 uContextRect;   // min x, min z, 1 / width, 1 / depth in metres; zero when absent
uniform vec2 uContextTexel;
uniform float uContextRelief;

vec2 waterPanoramaUV( vec3 d ) {
	float elevation = asin( clamp( d.y, -1.0, 1.0 ) );
	return vec2( atan( d.x, -d.z ) / PI2 + 0.5, 0.5 + 0.5 * sign( elevation ) * sqrt( abs( elevation ) / PI_HALF ) );
}
void main() {
	vec3 toEye = cameraPosition - vWaterWorld;
	float range = length( toEye );
	toEye /= range;
	// The sheet runs on under the city's land, which hides it: a bank seen from
	// the water shows water at its foot, not a gap. It is drawn before the
	// terrain, so where distance blurs their depths together the land wins.
	float city = nycLand( vWaterWorld.xz );
	// Beyond the city line the same sheet is the surrounding country: New
	// Jersey, Long Island, Westchester, as a plain lit silhouette.
	vec2 around = ( vWaterWorld.xz - uContextRect.xy ) * uContextRect.zw;
	if ( uContextRect.z > 0.0 && city < 0.5 && around.x > 0.0 && around.x < 1.0 && around.y > 0.0 && around.y < 1.0 ) {
		float level = texture2D( tContext, around ).r;
		if ( level > 0.0022 ) {
			float metres = ( level * 255.0 - 1.0 ) / 0.6;
			float east = texture2D( tContext, around + vec2( uContextTexel.x, 0.0 ) ).r - texture2D( tContext, around - vec2( uContextTexel.x, 0.0 ) ).r;
			float south = texture2D( tContext, around + vec2( 0.0, uContextTexel.y ) ).r - texture2D( tContext, around - vec2( 0.0, uContextTexel.y ) ).r;
			vec3 slope = normalize( vec3( - east * uContextRelief, 1.0, - south * uContextRelief ) );
			float patchy = texture2D( uNycNoise, vWaterWorld.xz * 0.00037 ).r, grain = texture2D( uNycNoise, vWaterWorld.xz * 0.0041 ).g;
			// Built-up lowland is grey-green; the hills behind it are wooded.
			float wooded = clamp( 0.8 * smoothstep( 18.0, 110.0, metres ) + 0.3 * smoothstep( 0.45, 0.65, patchy ), 0.0, 1.0 );
			vec3 ground = mix( vec3( 0.1, 0.105, 0.095 ), vec3( 0.045, 0.08, 0.04 ), wooded ) * ( 0.76 + 0.48 * grain );
			vec3 lit = ground * ( uNycAmbientSky + uNycKeyColor * max( dot( slope, uNycSunDir ), 0.0 ) ) * RECIPROCAL_PI;
			// Towns show as scattered light once lamps come on.
			float town = step( 0.6, texture2D( uNycNoise, vWaterWorld.xz * 0.0029 ).g ) * texture2D( uNycNoise, vWaterWorld.xz * 0.021 ).b;
			lit += vec3( 1.0, 0.66, 0.34 ) * ( 0.011 * uNycLights * town * ( 1.0 - wooded ) );
			gl_FragColor = vec4( lit, 1.0 );
			#include <fog_fragment>
			return;
		}
	}
	vec2 p = vWaterWorld.xz;
	float t = uNycTime;
	// Three trains of ripples drift across each other. The finest fades with
	// distance, so far water is calm instead of a field of sparkling noise.
	vec2 swell = texture2D( uNycNoise, p * 0.0031 + vec2( t * 0.0021, t * 0.0013 ) ).rg - 0.5;
	vec2 wave = texture2D( uNycNoise, p * 0.017 + vec2( - t * 0.007, t * 0.0052 ) ).gb - 0.5;
	vec2 ripple = texture2D( uNycNoise, p * 0.083 + vec2( t * 0.021, - t * 0.017 ) ).rb - 0.5;
	vec2 slope = swell * 0.22 + wave * 0.42 / ( 1.0 + range * 0.0016 ) + ripple * 0.5 / ( 1.0 + range * 0.011 );
	vec3 normal = normalize( vec3( slope.x * uChop, 1.0, slope.y * uChop ) );
	float facing = max( dot( normal, toEye ), 0.0 );
	float fresnel = 0.02 + 0.98 * pow( 1.0 - facing, 5.0 );
	vec3 mirrored = reflect( - toEye, normal );
	mirrored.y = abs( mirrored.y ) + 0.002;
	vec3 sky = texture2D( tSkyPanorama, waterPanoramaUV( normalize( mirrored ) ) ).rgb;
	// The city standing over the water, pushed about by the ripples.
	vec3 scene = sky;
	if ( uMirror > 0.5 ) {
		vec2 uv = vWaterMirror.xy / vWaterMirror.w + slope * vec2( 0.05, 0.09 ) * uChop;
		vec4 hit = texture2D( tMirror, clamp( uv, 0.001, 0.999 ) );
		scene = mix( sky, hit.rgb, hit.a );
	}
	// The sun's glitter path: a tight highlight scattered by every facet.
	float glint = max( dot( mirrored, uNycSunDir ), 0.0 );
	vec3 sun = uNycKeyColor * ( 26.0 * pow( glint, 900.0 ) + 0.9 * pow( glint, 90.0 ) );
	// Light scattered back out of the water column gives it its own colour.
	vec3 body = uWaterTint * ( uNycAmbientSky * 0.5 + uNycKeyColor * max( uNycSunDir.y, 0.0 ) * 0.35 );
	gl_FragColor = vec4( mix( body, scene, fresnel ) + sun * ( 0.25 + 0.75 * fresnel ), 1.0 );
	#include <fog_fragment>
}`;

/** Fill shoreline polygons into a canvas covering `rect` ({ minX, minZ, size }). */
export function drawLandMask(context, pixels, polygons, rect) {
  const scale = pixels / rect.size;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = '#000'; context.fillRect(0, 0, pixels, pixels);
  context.fillStyle = '#fff';
  let drawn = 0;
  for (const { outer, holes, bounds } of polygons) {
    if (bounds.maxX < rect.minX || bounds.minX > rect.minX + rect.size || bounds.maxZ < rect.minZ || bounds.minZ > rect.minZ + rect.size) continue;
    context.beginPath();
    for (const ring of [outer, ...holes]) {
      ring.forEach(([x, z], i) => { const px = (x - rect.minX) * scale, py = (z - rect.minZ) * scale; if (i) context.lineTo(px, py); else context.moveTo(px, py); });
      context.closePath();
    }
    context.fill('evenodd'); drawn++;
  }
  return drawn;
}

/** Shoreline polygons with bounds, from the borough outline file. */
export function landPolygons(boroughs) {
  const polygons = [];
  for (const borough of boroughs || []) for (const polygon of borough.polygons || []) {
    if (!Array.isArray(polygon.outer) || polygon.outer.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of polygon.outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    polygons.push({ outer: polygon.outer, holes: polygon.holes || [], bounds: { minX, maxX, minZ, maxZ } });
  }
  return polygons;
}

/**
 * @param {object} options scene; borough outlines; the city's bounds; the sky panorama texture.
 */
export function createWater({ scene, boroughs, bounds, panorama = null, createCanvas = () => document.createElement('canvas') } = {}) {
  const polygons = landPolygons(boroughs);
  const centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const farRect = { size: Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) + 2400 };
  farRect.minX = centerX - farRect.size / 2; farRect.minZ = centerZ - farRect.size / 2;
  const mask = (pixels, name) => {
    const canvas = createCanvas(); canvas.width = canvas.height = pixels;
    const texture = new THREE.CanvasTexture(canvas);
    // Row zero is north: sample with v = (z - minZ) / size, unflipped.
    texture.flipY = false; texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.colorSpace = THREE.NoColorSpace; texture.name = name;
    return { canvas, context: canvas.getContext('2d'), texture };
  };
  const far = mask(FAR_SIZE, 'Shoreline, citywide'), near = mask(NEAR_SIZE, 'Shoreline, local');
  drawLandMask(far.context, FAR_SIZE, polygons, farRect); far.texture.needsUpdate = true;
  shared.uNycLand.value = far.texture; shared.uNycLandRect.value.set(farRect.minX, farRect.minZ, 1 / farRect.size, polygons.length ? 1 : 0);
  shared.uNycLandNear.value = near.texture; shared.uNycLandNearRect.value.set(0, 0, 0, 0);

  const mirrorMatrix = new THREE.Matrix4(), mirrorCamera = new THREE.PerspectiveCamera();
  const uniforms = { ...shared, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), tSkyPanorama: { value: panorama }, tMirror: { value: null }, uMirror: { value: 0 },
    uMirrorMatrix: { value: mirrorMatrix }, uWaterTint: { value: new THREE.Color(.018, .05, .056) }, uChop: { value: 1 },
    tContext: { value: null }, uContextRect: { value: new THREE.Vector4(0, 0, 0, 0) }, uContextTexel: { value: new THREE.Vector2() }, uContextRelief: { value: 1 } };
  const material = new THREE.ShaderMaterial({ vertexShader: WATER_VERTEX, fragmentShader: WATER_FRAGMENT, uniforms, fog: true, toneMapped: false });
  material.name = 'Harbor and river water';
  // A single harbor-wide quad can clip across the eye and write water depth
  // in front of nearby streets. Keep each triangle within the street camera's range.
  const geometry = new THREE.PlaneGeometry(260000, 260000, 64, 64); geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Harbor and river water'; mesh.position.set(centerX, WATER_LEVEL, centerZ); mesh.frustumCulled = false; mesh.renderOrder = -5;
  scene?.add(mesh);

  let nearKey = '', mirrorTarget = null, disposed = false, waterNearby = false;
  const point = new THREE.Vector3(), eye = new THREE.Vector3(), look = new THREE.Vector3(), rotation = new THREE.Matrix4(), up = new THREE.Vector3(), size = new THREE.Vector2();
  const normal = new THREE.Vector3(0, 1, 0), plane = new THREE.Vector3(0, WATER_LEVEL, 0);
  const inLand = (x, z) => polygons.some(({ outer, holes, bounds: b }) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && inRing(x, z, outer) && !holes.some(hole => inRing(x, z, hole)));
  return {
    mesh, material,
    /** True where the shoreline says dry land. */
    isLand: inLand,
    /**
     * Supply the land silhouette around the city: an image whose red channel is
     * zero over water, with the bounds and size from context-land.json.
     */
    setContext(image, manifest) {
      const b = manifest?.bounds;
      if (disposed || !image || !b || !(b.maxX > b.minX) || !(b.maxZ > b.minZ) || !(manifest.width > 0) || !(manifest.height > 0)) return false;
      const texture = new THREE.Texture(image);
      texture.flipY = false; texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.colorSpace = THREE.NoColorSpace; texture.name = 'Land around the city'; texture.needsUpdate = true;
      uniforms.tContext.value?.dispose(); uniforms.tContext.value = texture;
      uniforms.uContextRect.value.set(b.minX, b.minZ, 1 / (b.maxX - b.minX), 1 / (b.maxZ - b.minZ));
      uniforms.uContextTexel.value.set(1 / manifest.width, 1 / manifest.height);
      // Height difference across two cells, back in metres, and exaggerated so low hills read.
      uniforms.uContextRelief.value = 255 / (manifest.encoding?.heightScale || .6) / (2 * (manifest.cellMeters || 100)) * 3;
      return true;
    },
    get waterNearby() { return waterNearby; },
    update(focus, { overview = false } = {}) {
      if (disposed) return;
      // Re-centre the sharp mask in whole steps, so its texels stay put on the world.
      const cx = Math.round(focus.x / NEAR_STEP) * NEAR_STEP, cz = Math.round(focus.z / NEAR_STEP) * NEAR_STEP, key = overview ? 'overview' : `${cx},${cz}`;
      if (key === nearKey) return;
      nearKey = key;
      if (overview) { shared.uNycLandNearRect.value.w = 0; waterNearby = false; return; }
      const rect = { minX: cx - NEAR_SPAN / 2, minZ: cz - NEAR_SPAN / 2, size: NEAR_SPAN };
      drawLandMask(near.context, NEAR_SIZE, polygons, rect); near.texture.needsUpdate = true;
      shared.uNycLandNearRect.value.set(rect.minX, rect.minZ, 1 / NEAR_SPAN, 1);
      // Mirroring the city costs a second pass; only pay for it near open water.
      waterNearby = false;
      for (let ring = 1; ring <= 3 && !waterNearby; ring++) for (let i = 0; i < 12 && !waterNearby; i++) {
        const angle = i / 12 * Math.PI * 2;
        waterNearby = !inLand(focus.x + Math.cos(angle) * ring * 420, focus.z + Math.sin(angle) * ring * 420);
      }
    },
    /** Draw the scene as the water sees it. Call before the main pass. */
    renderMirror(renderer, scene, camera, { enabled = true, scale = .5 } = {}) {
      uniforms.uMirror.value = 0;
      if (disposed || !enabled || !waterNearby || camera.position.y < WATER_LEVEL + .4 || !supportsFloatTargets(renderer)) return false;
      renderer.getDrawingBufferSize(size);
      const width = Math.max(2, Math.floor(size.x * scale)), height = Math.max(2, Math.floor(size.y * scale));
      if (!mirrorTarget || mirrorTarget.width !== width || mirrorTarget.height !== height) {
        mirrorTarget?.dispose();
        mirrorTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
        mirrorTarget.texture.name = 'City mirrored in the water';
      }
      // Place a camera at the eye's reflection below the surface, looking back up.
      point.setFromMatrixPosition(camera.matrixWorld);
      eye.subVectors(plane, point).reflect(normal).negate().add(plane);
      rotation.extractRotation(camera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rotation).add(point);
      look.subVectors(plane, look).reflect(normal).negate().add(plane);
      up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      mirrorCamera.position.copy(eye); mirrorCamera.up.copy(up); mirrorCamera.lookAt(look);
      mirrorCamera.near = camera.near; mirrorCamera.far = camera.far; mirrorCamera.updateMatrixWorld();
      mirrorCamera.projectionMatrix.copy(camera.projectionMatrix); mirrorCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      mirrorMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse);
      const target = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate, autoClear = renderer.autoClear;
      mesh.visible = false; renderer.shadowMap.autoUpdate = false; renderer.autoClear = true;
      renderer.setRenderTarget(mirrorTarget); renderer.render(scene, mirrorCamera);
      renderer.setRenderTarget(target); renderer.shadowMap.autoUpdate = shadows; renderer.autoClear = autoClear; mesh.visible = true;
      uniforms.tMirror.value = mirrorTarget.texture; uniforms.uMirror.value = 1;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene?.remove(mesh); geometry.dispose(); material.dispose(); mirrorTarget?.dispose(); far.texture.dispose(); near.texture.dispose(); uniforms.tContext.value?.dispose();
      if (shared.uNycLand.value === far.texture) { shared.uNycLand.value = null; shared.uNycLandRect.value.w = 0; shared.uNycLandNear.value = null; shared.uNycLandNearRect.value.w = 0; }
    },
  };
}

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Ripples and a mirror finish for a stock material: used for lakes and ponds. */
export const STILL_WATER_GLSL = /* glsl */`
	{
		vec3 nycAt = cameraPosition - vViewPosition * mat3( viewMatrix );
		float nycRange = length( vViewPosition );
		vec2 nycRipple = texture2D( uNycNoise, nycAt.xz * 0.021 + vec2( uNycTime * 0.006, uNycTime * 0.004 ) ).rg
			+ texture2D( uNycNoise, nycAt.xz * 0.09 + vec2( - uNycTime * 0.017, uNycTime * 0.013 ) ).gb - 1.0;
		normal = normalize( normal + ( viewMatrix * vec4( nycRipple.x, 0.0, nycRipple.y, 0.0 ) ).xyz * ( 0.16 / ( 1.0 + nycRange * 0.006 ) ) );
		diffuseColor.rgb = vec3( 0.012, 0.03, 0.028 );
		roughnessFactor = 0.07;
		metalnessFactor = 0.0;
	}`;
