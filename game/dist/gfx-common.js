import * as THREE from './vendor/three.module.min.js';
import { VEHICLE_LIGHT_GLSL } from './vehicle-lights.js';

// Rendering state shared by every material in the city. Three's built-in
// shader chunks are extended once, here, so stock and custom materials agree
// on haze, sun shadows and city light without each one re-implementing them.

/** Uniform objects are shared by identity: update a value once per frame. */
export const shared = {
  uNycTime: { value: 0 },
  uNycSunDir: { value: new THREE.Vector3(.3, .8, .5).normalize() },
  uNycKeyColor: { value: new THREE.Color(1, 1, 1) },
  uNycAmbientSky: { value: new THREE.Color(.5, .6, .8) },
  uNycAmbientGround: { value: new THREE.Color(.1, .1, .1) },
  uNycBounce: { value: new THREE.Color(0, 0, 0) },
  uNycNight: { value: 0 },
  uNycLights: { value: 0 },
  // 0 in the evening, rising to 1 in the small hours when most windows go dark.
  uNycLate: { value: 0 },
  // x: 1 / haze scale height, y: haze base altitude, z: sun glow tightness, w: sun glow amount.
  uNycFog: { value: new THREE.Vector4(1 / 520, 0, 6, 1) },
  uNycFogSunColor: { value: new THREE.Color(1, 1, 1) },
  uNycNoise: { value: null },
  uNycWet: { value: 0 },
  // Streetlamp pools and nearby vehicle lights, populated by streetlife.js.
  uNycLightMap: { value: null },
  uNycCarLights: { value: null },
  // xy: world position of the map's minimum corner, z: 1 / size, w: strength.
  uNycLightRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  // Shoreline masks, white on land: one for the whole city, one sharp one
  // around the player. Rects are min x, min z, 1 / size, enabled; see water.js.
  uNycLand: { value: null },
  uNycLandRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  uNycLandNear: { value: null },
  uNycLandNearRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  // Whose shop front is where, what its sign looks like and its lettering; see
  // storefronts.js. Rect: min x, min z, 1 / size, enabled. Glyphs: where in
  // the lettering the grade letters and OPEN are.
  uNycPlaceMap: { value: null },
  uNycPlaceRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  uNycPlaceTable: { value: null },
  uNycPlaceAtlas: { value: null },
  uNycPlaceGlyphs: { value: new THREE.Vector4(0, 0, 0, 0) },
};

export const CASCADES = 3;

/**
 * Can this renderer draw into floating-point targets? Everything beyond a
 * plain frame (the light map, the mirrored city, bloom) needs them. False for
 * a renderer without a GL context, as in tests.
 */
export function supportsFloatTargets(renderer) {
  return Boolean(renderer?.capabilities && typeof renderer.getContext === 'function'
    && (renderer.extensions?.has('EXT_color_buffer_float') || renderer.extensions?.has('EXT_color_buffer_half_float')));
}

const flexible = snippet => new RegExp(snippet.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'));

/** Replace a snippet regardless of how the vendored build collapsed whitespace. */
export function replaceChunk(source, snippet, replacement, label) {
  const pattern = flexible(snippet);
  if (!pattern.test(source)) throw new Error(`Shader chunk no longer matches: ${label}`);
  return source.replace(pattern, () => replacement);
}

export const NYC_COMMON_GLSL = /* glsl */`
uniform float uNycTime;
uniform vec3 uNycSunDir;
uniform vec3 uNycKeyColor;
uniform vec3 uNycAmbientSky;
uniform vec3 uNycAmbientGround;
uniform vec3 uNycBounce;
uniform float uNycNight;
uniform float uNycLights;
uniform float uNycLate;
uniform vec4 uNycFog;
uniform vec3 uNycFogSunColor;
uniform sampler2D uNycNoise;
uniform float uNycWet;
uniform sampler2D uNycLightMap;
uniform vec4 uNycLightRect;
uniform sampler2D uNycLand;
uniform vec4 uNycLandRect;
uniform sampler2D uNycLandNear;
uniform vec4 uNycLandNearRect;
uniform sampler2D uNycPlaceMap;
uniform vec4 uNycPlaceRect;
uniform sampler2D uNycPlaceTable;
uniform sampler2D uNycPlaceAtlas;
uniform vec4 uNycPlaceGlyphs;
// 1 on dry land, 0 over open water. Everything is land until a shoreline is supplied.
float nycLand( vec2 xz ) {
	if ( uNycLandRect.w < 0.5 ) return 1.0;
	vec2 close = ( xz - uNycLandNearRect.xy ) * uNycLandNearRect.z;
	if ( uNycLandNearRect.w > 0.5 && close.x > 0.004 && close.x < 0.996 && close.y > 0.004 && close.y < 0.996 ) return textureLod( uNycLandNear, close, 0.0 ).r;
	vec2 wide = ( xz - uNycLandRect.xy ) * uNycLandRect.z;
	if ( wide.x < 0.0 || wide.x > 1.0 || wide.y < 0.0 || wide.y > 1.0 ) return 0.0;
	return textureLod( uNycLand, wide, 0.0 ).r;
}
#define NYC_CSM ${CASCADES}
// Surfaces with relief of their own (window reveals, cornices) set this to
// the share of direct sun that reaches them.
float nycSunMask = 1.0;
float nycHash12( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
vec2 nycHash22( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.xx + p3.yz ) * p3.zy );
}
// Height haze with a glow toward the sun. 'ray' runs from the eye to the
// surface in world axes. Returns the haze colour and how much of it to use.
vec4 nycHaze( vec3 ray, float eyeHeight, vec3 hazeColor, float density ) {
	float span = length( ray );
	vec3 direction = ray / max( span, 1e-4 );
	float falloff = uNycFog.x;
	float atEye = exp( - falloff * max( eyeHeight - uNycFog.y, -60.0 ) );
	float atSurface = exp( - falloff * max( eyeHeight + ray.y - uNycFog.y, -60.0 ) );
	float rise = falloff * ray.y;
	float column = abs( rise ) > 1e-3 ? ( atEye - atSurface ) / rise : atEye;
	float amount = 1.0 - exp( - density * span * column );
	float glow = uNycFog.w * pow( max( dot( direction, uNycSunDir ), 0.0 ), uNycFog.z );
	return vec4( mix( hazeColor, uNycFogSunColor, clamp( glow, 0.0, 1.0 ) ), amount );
}
`;

const FOG_PARS_VERTEX = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vNycFogRay;
#endif`;

const FOG_VERTEX = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vNycFogRay = mvPosition.xyz * mat3( viewMatrix );
#endif`;

const FOG_PARS_FRAGMENT = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vNycFogRay;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;

const FOG_FRAGMENT = /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
		vec4 nycHazeResult = nycHaze( vNycFogRay, cameraPosition.y, fogColor, fogDensity );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, nycHazeResult.rgb, nycHazeResult.a );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
	#endif
#endif`;

// Three sun cascades share one direction. Only the first carries light; the
// other two exist for their shadow maps. Each fragment uses the sharpest map
// that contains it and cross-fades near that map's edge.
const SUN_SHADOW_GLSL = /* glsl */`
#if defined( USE_SHADOWMAP ) && defined( NYC_CSM )
#if NUM_DIR_LIGHT_SHADOWS >= NYC_CSM
	float nycCascadeWeight( vec4 coord ) {
		vec3 c = coord.xyz / coord.w;
		float edge = min( min( c.x, 1.0 - c.x ), min( c.y, 1.0 - c.y ) );
		return ( c.z >= 0.0 && c.z <= 1.0 ) ? clamp( edge / 0.06, 0.0, 1.0 ) : 0.0;
	}
	float nycCascade0() { return getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] ); }
	float nycCascade1() { return getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, vDirectionalShadowCoord[ 1 ] ); }
	float nycCascade2() { return getShadow( directionalShadowMap[ 2 ], directionalLightShadows[ 2 ].shadowMapSize, directionalLightShadows[ 2 ].shadowIntensity, directionalLightShadows[ 2 ].shadowBias, directionalLightShadows[ 2 ].shadowRadius, vDirectionalShadowCoord[ 2 ] ); }
	float nycSunShadow() {
		float w0 = nycCascadeWeight( vDirectionalShadowCoord[ 0 ] );
		if ( w0 >= 1.0 ) return nycCascade0();
		float w1 = nycCascadeWeight( vDirectionalShadowCoord[ 1 ] );
		float outer;
		if ( w1 >= 1.0 ) outer = nycCascade1();
		else {
			outer = mix( 1.0, nycCascade2(), nycCascadeWeight( vDirectionalShadowCoord[ 2 ] ) );
			if ( w1 > 0.0 ) outer = mix( outer, nycCascade1(), w1 );
		}
		return w0 > 0.0 ? mix( outer, nycCascade0(), w0 ) : outer;
	}
#endif
#endif`;

const DIRECTIONAL_SHADOW = `
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );`;

const DIRECTIONAL_SHADOW_CASCADED = /* glsl */`
		#if defined( NYC_CSM ) && ( NUM_DIR_LIGHT_SHADOWS >= NYC_CSM )
			#if UNROLLED_LOOP_INDEX == 0
				#if defined( USE_SHADOWMAP )
				directLight.color *= ( directLight.visible && receiveShadow ) ? nycSunShadow() : 1.0;
				#endif
				directLight.color *= nycSunMask;
				RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
			#elif UNROLLED_LOOP_INDEX >= NYC_CSM
				RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
			#endif
		#else
			#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
			directionalLightShadow = directionalLightShadows[ i ];
			directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
			#endif
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		#endif`;

// Static street lights use a pooled texture. Each car lights its own road level.
const CITY_LIGHT_GLSL = /* glsl */`
#if defined( RE_IndirectDiffuse )
	// Sunlight returned by the walls and pavements around.
	irradiance += uNycBounce;
	if ( uNycLightRect.w > 0.0 ) {
		vec3 nycWorld = cameraPosition - vViewPosition * mat3( viewMatrix );
		vec2 nycLightUV = ( nycWorld.xz - uNycLightRect.xy ) * uNycLightRect.z;
		if ( nycLightUV.x > 0.0 && nycLightUV.x < 1.0 && nycLightUV.y > 0.0 && nycLightUV.y < 1.0 ) {
			vec4 nycLight = textureLod( uNycLightMap, nycLightUV, 0.0 );
			// Alpha stores the ground height the light was placed on, in units of 256 m.
			float nycAbove = nycWorld.y - ( nycLight.a * 256.0 - 16.0 );
			// A street lamp throws its light down: little of it reaches above the lamp head.
			float nycReach = exp( - max( nycAbove, 0.0 ) * 0.085 ) * smoothstep( -3.0, -0.5, nycAbove ) * ( 1.0 - 0.7 * smoothstep( 5.0, 13.0, nycAbove ) );
			vec2 nycEdge = min( nycLightUV, 1.0 - nycLightUV );
			vec3 nycLocalLight = nycLight.rgb * nycReach + nycVehicleLight( nycWorld, nycLightUV, ( geometryNormal * mat3( viewMatrix ) ).y, uNycLights );
			irradiance += nycLocalLight * ( uNycLightRect.w * smoothstep( 0.0, 0.06, min( nycEdge.x, nycEdge.y ) ) );
		}
	}
#endif`;

let installed = false;
/** Extend Three's shader chunks. Idempotent; must run before the first program compiles. */
export function installShaderChunks() {
  if (installed) return;
  const chunk = THREE.ShaderChunk;
  chunk.common += NYC_COMMON_GLSL;
  chunk.fog_pars_vertex = FOG_PARS_VERTEX;
  chunk.fog_vertex = FOG_VERTEX;
  chunk.fog_pars_fragment = FOG_PARS_FRAGMENT;
  chunk.fog_fragment = FOG_FRAGMENT;
  chunk.shadowmap_pars_fragment += SUN_SHADOW_GLSL;
  chunk.lights_fragment_begin = replaceChunk(chunk.lights_fragment_begin, DIRECTIONAL_SHADOW, DIRECTIONAL_SHADOW_CASCADED, 'directional light loop');
  chunk.lights_pars_begin += '\n' + VEHICLE_LIGHT_GLSL;
  chunk.lights_fragment_end = CITY_LIGHT_GLSL + '\n' + chunk.lights_fragment_end;
  installed = true;
}

const patched = new WeakSet();
/**
 * Give a stock material the shared uniforms. Existing onBeforeCompile hooks
 * keep working; the cache key keeps differently hooked materials apart.
 */
export function shareUniforms(material) {
  if (!material?.isMaterial || patched.has(material)) return false;
  patched.add(material);
  if (material.isShaderMaterial) return false; // Custom shaders bind what they declare.
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey.call(material);
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    Object.assign(shader.uniforms, shared);
  };
  material.customProgramCacheKey = () => `${key}|nyc`;
  material.needsUpdate = true;
  return true;
}

/** Share uniforms with every material currently in a scene graph. */
export function shareSceneUniforms(root) {
  root.traverse(object => {
    const material = object.material;
    if (!material) return;
    if (Array.isArray(material)) for (const entry of material) shareUniforms(entry);
    else shareUniforms(material);
  });
}

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable fractal value noise, one layer per channel. Deterministic. */
export function noisePixels(size = 256, seed = 20240712) {
  const random = mulberry32(seed), data = new Uint8Array(size * size * 4);
  const layer = (basePeriod, octaves, gain) => {
    const out = new Float32Array(size * size);
    let amplitude = 1, total = 0;
    for (let octave = 0; octave < octaves; octave++) {
      const period = basePeriod * 2 ** octave, lattice = new Float32Array(period * period);
      for (let i = 0; i < lattice.length; i++) lattice[i] = random();
      const cell = size / period;
      for (let y = 0; y < size; y++) {
        const gy = y / cell, y0 = Math.floor(gy), fy = gy - y0, wy = fy * fy * (3 - 2 * fy);
        const row0 = (y0 % period) * period, row1 = ((y0 + 1) % period) * period;
        for (let x = 0; x < size; x++) {
          const gx = x / cell, x0 = Math.floor(gx), fx = gx - x0, wx = fx * fx * (3 - 2 * fx);
          const c0 = x0 % period, c1 = (x0 + 1) % period;
          const top = lattice[row0 + c0] + (lattice[row0 + c1] - lattice[row0 + c0]) * wx;
          const bottom = lattice[row1 + c0] + (lattice[row1 + c1] - lattice[row1 + c0]) * wx;
          out[y * size + x] += (top + (bottom - top) * wy) * amplitude;
        }
      }
      total += amplitude; amplitude *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  };
  const layers = [layer(4, 5, .55), layer(16, 4, .55), layer(64, 2, .6)];
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(layers[c][i] * 255)));
    data[i * 4 + 3] = Math.floor(random() * 256);
  }
  return data;
}

export function createNoiseTexture(size = 256) {
  const texture = new THREE.DataTexture(noisePixels(size), size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.colorSpace = THREE.NoColorSpace; texture.needsUpdate = true;
  texture.name = 'Shared tileable noise';
  return texture;
}

/** One oversized triangle covers the viewport without a diagonal seam. */
export class FullscreenPass {
  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mesh = new THREE.Mesh(geometry, null); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, material, target = null) {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }
  dispose() { this.mesh.geometry.dispose(); }
}

export const FULLSCREEN_VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = position.xy * 0.5 + 0.5;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;
