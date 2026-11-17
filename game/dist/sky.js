import * as THREE from './vendor/three.module.min.js';
import { SKY_GLSL, SUN_IRRADIANCE, MOON_IRRADIANCE } from './atmosphere.js';
import { shared, FullscreenPass, FULLSCREEN_VERTEX } from './gfx-common.js';

// The sky is integrated into a small panorama whenever the sun moves, then
// drawn behind the city with the sun, moon, stars and drifting cloud added at
// full resolution. The same dome lights the city through its reflection map.

const LUT_WIDTH = 256, LUT_HEIGHT = 128;

const PANORAMA_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform vec3 uSkySun;
uniform vec3 uSkyMoon;
uniform float uSunIrradiance;
uniform float uMoonIrradiance;
uniform float uSkyNight;
uniform float uSunElevation;
${SKY_GLSL}
void main() {
	// Rows crowd toward the horizon, where the sky changes fastest.
	float azimuth = ( vUv.x - 0.5 ) * 6.28318530718;
	float s = ( vUv.y - 0.5 ) * 2.0;
	float elevation = sign( s ) * s * s * 1.57079632679;
	vec3 view = vec3( sin( azimuth ) * cos( elevation ), sin( elevation ), -cos( azimuth ) * cos( elevation ) );
	vec3 radiance = atmoScatter( view, uSkySun ) * uSunIrradiance;
	if ( uMoonIrradiance > 0.0 ) radiance += atmoScatter( view, uSkyMoon ) * uMoonIrradiance;
	radiance += atmoCityGlow( view ) * uSkyNight + atmoTwilight( view, uSkySun, uSunElevation );
	gl_FragColor = vec4( radiance, 1.0 );
}`;

const DOME_VERTEX = /* glsl */`
varying vec3 vSkyRay;
void main() {
	// Unproject this corner to a view ray, then rotate it into world axes.
	vec3 ray = vec3( ( position.x + projectionMatrix[ 2 ][ 0 ] ) / projectionMatrix[ 0 ][ 0 ],
		( position.y + projectionMatrix[ 2 ][ 1 ] ) / projectionMatrix[ 1 ][ 1 ], -1.0 );
	vSkyRay = ray * mat3( viewMatrix );
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`;

const DOME_FRAGMENT = /* glsl */`
#include <common>
varying vec3 vSkyRay;
uniform sampler2D tSkyPanorama;
uniform vec3 uSkySun;
uniform vec3 uSkyMoon;
uniform vec3 uSunDisc;
uniform vec3 uMoonDisc;
uniform float uStars;
uniform float uCloudCover;
uniform vec3 uCloudSun;
uniform vec3 uCloudAmbient;
uniform vec3 uCloudGlow;
uniform vec3 uGroundColor;
uniform vec3 uHorizonColor;
uniform float uSkySaturation;
uniform float uReflection;

vec2 panoramaUV( vec3 d ) {
	float elevation = asin( clamp( d.y, -1.0, 1.0 ) );
	return vec2( atan( d.x, -d.z ) / PI2 + 0.5, 0.5 + 0.5 * sign( elevation ) * sqrt( abs( elevation ) / PI_HALF ) );
}
float starField( vec3 d ) {
	vec3 q = d * 150.0, cell = floor( q ), f = fract( q ) - 0.5;
	float h = nycHash12( cell.xy + cell.z * 17.31 );
	if ( h < 0.965 ) return 0.0;
	vec3 jitter = vec3( nycHash12( cell.yz + 3.1 ), nycHash12( cell.zx + 7.7 ), nycHash12( cell.xy + 11.3 ) ) - 0.5;
	float magnitude = pow( nycHash12( cell.zy + 5.5 ), 5.0 );
	float twinkle = 0.72 + 0.28 * sin( uNycTime * ( 1.6 + h * 40.0 ) + h * 900.0 );
	return ( 1.0 - smoothstep( 0.0, 0.2, length( f - jitter * 0.6 ) ) ) * ( 0.2 + 2.4 * magnitude ) * twinkle;
}
float cloudShape( vec2 p, vec2 wind ) {
	float n = texture2D( uNycNoise, p * 0.043 + wind ).r * 0.62;
	n += texture2D( uNycNoise, p * 0.127 + wind * 1.7 ).g * 0.27;
	return n;
}
void main() {
	vec3 d = normalize( vSkyRay );
	vec3 sky = texture2D( tSkyPanorama, panoramaUV( d ) ).rgb;
	sky = mix( vec3( dot( sky, vec3( 0.2126, 0.7152, 0.0722 ) ) ), sky, uSkySaturation );
	vec3 color = sky;
	float lift = smoothstep( 0.02, 0.32, d.y );

	if ( uReflection < 0.5 ) {
		if ( uStars > 0.0 && d.y > 0.0 ) color += vec3( 0.86, 0.92, 1.0 ) * ( starField( d ) * uStars * 0.22 * lift );
		// The moon is drawn about four times its true size, as films do.
		float moonCos = dot( d, uSkyMoon );
		const float moonRadius = 0.0185;
		if ( moonCos > cos( moonRadius ) && uMoonDisc.b > 0.0 ) {
			vec3 mx = normalize( cross( vec3( 0.0, 1.0, 0.0 ), uSkyMoon ) ), my = cross( uSkyMoon, mx );
			vec2 m = vec2( dot( d, mx ), dot( d, my ) ) / sin( moonRadius );
			float r2 = dot( m, m );
			float z = sqrt( max( 1.0 - r2, 0.0 ) );
			float maria = texture2D( uNycNoise, m * 0.15 + vec2( 0.37, 0.61 ) ).r;
			float albedo = mix( 0.5, 1.0, smoothstep( 0.4, 0.62, maria ) );
			color += uMoonDisc * ( albedo * ( 0.8 + 0.2 * z ) * ( 1.0 - smoothstep( 0.9, 1.0, r2 ) ) );
		}
		color += uMoonDisc * ( 0.045 * pow( max( moonCos, 0.0 ), 700.0 ) + 0.01 * pow( max( moonCos, 0.0 ), 60.0 ) );
		float sunAngle = acos( clamp( dot( d, uSkySun ), -1.0, 1.0 ) );
		float disc = 1.0 - smoothstep( 0.0078, 0.0096, sunAngle );
		float limb = sqrt( max( 1.0 - ( sunAngle / 0.0096 ) * ( sunAngle / 0.0096 ), 0.0 ) );
		color += uSunDisc * ( disc * ( 0.55 + 0.45 * limb ) + 0.02 * exp( - sunAngle * 90.0 ) );
	}

	if ( d.y > 0.004 && uCloudCover > 0.0 ) {
		// Project onto a shallow dome so clouds recede toward the horizon.
		vec2 p = d.xz / ( d.y + 0.11 );
		vec2 wind = vec2( 0.0052, 0.0021 ) * uNycTime;
		float fine = texture2D( uNycNoise, p * 0.39 + wind * 2.3 ).b * 0.11;
		float shape = cloudShape( p, wind ) + fine;
		float threshold = mix( 0.74, 0.44, uCloudCover );
		float density = smoothstep( threshold, threshold + 0.15, shape );
		if ( density > 0.001 ) {
			// A second tap toward the sun stands in for self-shadowing.
			vec2 toSun = uSkySun.xz / max( abs( uSkySun.y ), 0.18 ) * 0.22;
			float shade = exp( - 5.0 * smoothstep( threshold - 0.04, threshold + 0.2, cloudShape( p + toSun, wind ) + fine ) * 0.55 );
			float forward = pow( max( dot( d, uSkySun ), 0.0 ), 9.0 );
			vec3 cloud = uCloudSun * ( 0.2 + 0.8 * shade ) * ( 1.0 + 2.4 * forward * ( 1.0 - 0.65 * density ) )
				+ uCloudAmbient * ( 1.0 - 0.4 * density ) + uCloudGlow;
			// Distant cloud sinks into the same air as the sky behind it.
			float air = 1.0 - exp( - 0.045 / ( d.y + 0.035 ) );
			cloud = mix( cloud, sky, clamp( air, 0.0, 1.0 ) );
			color = mix( color, cloud, density * smoothstep( 0.004, 0.09, d.y ) );
		}
	}

	if ( uReflection > 0.5 ) {
		// Reflections need something other than sky near eye level: a broken
		// band of rooftops, speckled with lit windows once lamps come on.
		float skyline = 0.035 + 0.15 * texture2D( uNycNoise, vec2( atan( d.x, d.z ) * 1.9, 0.37 ) ).g
			* step( 0.35, texture2D( uNycNoise, vec2( atan( d.x, d.z ) * 0.7, 0.71 ) ).r );
		if ( d.y < skyline ) {
			vec3 city = uGroundColor * 1.25 + uCloudAmbient * 0.22;
			float lit = step( 0.8, nycHash12( floor( vec2( atan( d.x, d.z ) * 60.0, d.y * 90.0 ) ) ) );
			city += vec3( 1.0, 0.72, 0.42 ) * ( 0.16 * lit * uNycLights * step( 0.0, d.y ) );
			color = mix( color, city, 1.0 - smoothstep( skyline - 0.012, skyline, d.y ) );
		}
	}
	// Under the horizon: haze thinning to the dull tone of far ground.
	color = mix( color, uHorizonColor, exp( - abs( d.y ) * 46.0 ) * 0.7 );
	color = mix( color, uGroundColor, 1.0 - smoothstep( -0.12, 0.0, d.y ) );
	gl_FragColor = vec4( color, 1.0 );
}`;

const scale = (rgb, factor) => new THREE.Color(rgb[0] * factor, rgb[1] * factor, rgb[2] * factor);

export class Sky {
  constructor() {
    this.fullscreen = new FullscreenPass();
    this.panorama = new THREE.WebGLRenderTarget(LUT_WIDTH, LUT_HEIGHT, { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false, generateMipmaps: false });
    this.panorama.texture.name = 'Sky panorama';
    this.panoramaMaterial = new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader: PANORAMA_FRAGMENT, depthTest: false, depthWrite: false,
      uniforms: { uSkySun: { value: new THREE.Vector3(0, 1, 0) }, uSkyMoon: { value: new THREE.Vector3(0, -1, 0) }, uSunIrradiance: { value: SUN_IRRADIANCE },
        uMoonIrradiance: { value: 0 }, uSkyNight: { value: 0 }, uSunElevation: { value: 60 } } });
    this.uniforms = { ...shared, tSkyPanorama: { value: this.panorama.texture },
      uSkySun: this.panoramaMaterial.uniforms.uSkySun, uSkyMoon: this.panoramaMaterial.uniforms.uSkyMoon,
      uSunDisc: { value: new THREE.Color() }, uMoonDisc: { value: new THREE.Color() }, uStars: { value: 0 }, uCloudCover: { value: .42 },
      uCloudSun: { value: new THREE.Color() }, uCloudAmbient: { value: new THREE.Color() }, uCloudGlow: { value: new THREE.Color() },
      uGroundColor: { value: new THREE.Color() }, uHorizonColor: { value: new THREE.Color() }, uSkySaturation: { value: .9 }, uReflection: { value: 0 } };
    const dome = reflection => {
      const material = new THREE.ShaderMaterial({ vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT,
        uniforms: { ...this.uniforms, uReflection: { value: reflection ? 1 : 0 }, uSkySaturation: { value: reflection ? .5 : .9 } },
        depthWrite: false, depthFunc: THREE.LessEqualDepth, fog: false, toneMapped: false });
      const mesh = new THREE.Mesh(this.fullscreen.mesh.geometry, material);
      // Drawn after the city, so only pixels that still show sky are shaded.
      mesh.frustumCulled = false; mesh.renderOrder = 1000; mesh.name = reflection ? 'Sky for reflections' : 'Sky';
      mesh.castShadow = false; mesh.receiveShadow = false;
      return mesh;
    };
    this.mesh = dome(false);
    this.reflectionMesh = dome(true);
    this.reflectionScene = new THREE.Scene(); this.reflectionScene.add(this.reflectionMesh);
    this.panoramaDirty = true; this.reflectionDirty = true; this.reflectionTarget = null; this.generator = null;
    this.lastSun = new THREE.Vector3(); this.lastReflectionSun = new THREE.Vector3(); this.lastReflectionLights = -1; this.lastReflectionTime = -Infinity;
  }

  /** Copy a skyState() result into the dome. */
  update(state) {
    const u = this.uniforms, p = this.panoramaMaterial.uniforms;
    p.uSkySun.value.fromArray(state.sunDirection); p.uSkyMoon.value.fromArray(state.moonDirection);
    p.uMoonIrradiance.value = state.night > 0 && state.moonElevation > -2 ? MOON_IRRADIANCE * state.night : 0;
    p.uSkyNight.value = state.night; p.uSunElevation.value = state.sunElevation;
    if (this.lastSun.distanceToSquared(p.uSkySun.value) > 1e-7) { this.lastSun.copy(p.uSkySun.value); this.panoramaDirty = true; }
    // The disc is far brighter than anything a display can show; this keeps
    // enough headroom for bloom without one pixel dominating the blur.
    const sunFade = THREE.MathUtils.smoothstep(state.sunElevation, -1.2, 1.4), sun = state.sunColor;
    u.uSunDisc.value.setRGB(sun[0] * 15, sun[1] * 15, sun[2] * 15).multiplyScalar(sunFade > 0 ? 1 : 0);
    // The moon shows once it has risen and the sun is well down.
    const moonUp = THREE.MathUtils.smoothstep(state.moonElevation, -1, 3) * (1 - THREE.MathUtils.smoothstep(state.sunElevation, -6, 2));
    u.uMoonDisc.value.setRGB(.82, .88, 1).multiplyScalar(.75 * moonUp);
    u.uStars.value = state.starVisibility;
    u.uCloudSun.value.copy(scale(state.keyIsMoon ? state.moonColor : state.sunColor, .98 / Math.PI));
    u.uCloudAmbient.value.copy(scale(state.ambientSky, .62 / Math.PI));
    u.uCloudGlow.value.setRGB(.034, .022, .015).multiplyScalar(state.night);
    u.uGroundColor.value.fromArray(state.groundRadiance);
    u.uHorizonColor.value.fromArray(state.fogColor);
  }

  /** Re-integrate the panorama if the sun moved. Needs a real WebGL renderer. */
  renderPanorama(renderer) {
    if (!this.panoramaDirty) return false;
    const target = renderer.getRenderTarget();
    this.fullscreen.render(renderer, this.panoramaMaterial, this.panorama);
    renderer.setRenderTarget(target);
    this.panoramaDirty = false; this.reflectionDirty = true;
    return true;
  }

  /** Refresh the reflection map the city is lit by. Returns its texture. */
  renderReflection(renderer, state, now, force = false) {
    const sun = this.panoramaMaterial.uniforms.uSkySun.value;
    // About a degree of sun travel, or lamps coming on, is enough to notice.
    const moved = this.lastReflectionSun.distanceToSquared(sun) > 2.4e-4 || Math.abs(this.lastReflectionLights - state.lightsOn) > .06;
    // Rebuilding costs most of a frame, so it is rationed. Clouds drift, so
    // refresh occasionally even under a still sun.
    if (!force && this.reflectionTarget && !(moved && now - this.lastReflectionTime > 1.5) && now - this.lastReflectionTime < 30) return this.reflectionTarget.texture;
    this.generator ||= new THREE.PMREMGenerator(renderer);
    const previous = this.reflectionTarget, target = renderer.getRenderTarget();
    this.reflectionTarget = this.generator.fromScene(this.reflectionScene, 0, .1, 100, { size: 128 });
    renderer.setRenderTarget(target);
    previous?.dispose();
    this.lastReflectionSun.copy(sun); this.lastReflectionLights = state.lightsOn; this.lastReflectionTime = now; this.reflectionDirty = false;
    return this.reflectionTarget.texture;
  }

  dispose() {
    this.panorama.dispose(); this.panoramaMaterial.dispose(); this.mesh.material.dispose(); this.reflectionMesh.material.dispose();
    this.reflectionTarget?.dispose(); this.generator?.dispose(); this.fullscreen.dispose();
  }
}
