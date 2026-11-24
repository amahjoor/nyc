import * as THREE from './vendor/three.module.min.js';
import { FullscreenPass, FULLSCREEN_VERTEX } from './gfx-common.js';

// The frame is rendered once into a multisampled floating-point target, then
// finished in screen space: ambient occlusion from the depth buffer, a wide
// bloom, light shafts toward a low sun, and a filmic transfer to the display.

const DEPTH_GLSL = /* glsl */`
uniform sampler2D tDepth;
uniform vec4 uProjection; // x: P[0][0], y: P[1][1], z: near, w: far
float viewZ( vec2 uv ) {
	float depth = texture2D( tDepth, uv ).x;
	return ( uProjection.z * uProjection.w ) / ( ( uProjection.w - uProjection.z ) * depth - uProjection.w );
}
vec3 viewPosition( vec2 uv ) {
	float z = viewZ( uv );
	vec2 ndc = uv * 2.0 - 1.0;
	return vec3( ndc.x * -z / uProjection.x, ndc.y * -z / uProjection.y, z );
}
float gradientNoise( vec2 pixel ) {
	return fract( 52.9829189 * fract( dot( pixel, vec2( 0.06711056, 0.00583715 ) ) ) );
}`;

const OCCLUSION_FRAGMENT = /* glsl */`
#define SAMPLES 12
varying vec2 vUv;
uniform vec2 uTexel;       // one full-resolution pixel
uniform vec2 uResolution;  // this pass's size in pixels
uniform float uRadius;
uniform float uIntensity;
${DEPTH_GLSL}
void main() {
	float depth = texture2D( tDepth, vUv ).x;
	if ( depth >= 0.99999 ) { gl_FragColor = vec4( 1.0 ); return; }
	vec3 p = viewPosition( vUv );
	// Rebuild the surface normal from the nearer neighbour on each axis, so
	// silhouettes do not smear two surfaces into one tilted plane.
	vec3 right = viewPosition( vUv + vec2( uTexel.x, 0.0 ) ) - p, left = p - viewPosition( vUv - vec2( uTexel.x, 0.0 ) );
	vec3 up = viewPosition( vUv + vec2( 0.0, uTexel.y ) ) - p, down = p - viewPosition( vUv - vec2( 0.0, uTexel.y ) );
	vec3 dx = abs( right.z ) < abs( left.z ) ? right : left;
	vec3 dy = abs( up.z ) < abs( down.z ) ? up : down;
	vec3 normal = normalize( cross( dx, dy ) );
	float radius = uRadius * ( 1.0 + clamp( -p.z / 60.0, 0.0, 3.0 ) );
	float radiusPixels = min( radius * uProjection.y * 0.5 * uResolution.y / -p.z, uResolution.y * 0.12 );
	float spin = gradientNoise( gl_FragCoord.xy ) * 6.2831853;
	float occlusion = 0.0;
	float bias = 0.012 * -p.z + 0.02;
	for ( int i = 0; i < SAMPLES; i ++ ) {
		float t = ( float( i ) + 0.5 ) / float( SAMPLES );
		float angle = spin + t * 6.2831853 * 3.61;
		vec2 offset = vec2( cos( angle ), sin( angle ) ) * ( radiusPixels * sqrt( t ) + 1.0 ) / uResolution;
		vec3 delta = viewPosition( vUv + offset ) - p;
		float distanceSquared = dot( delta, delta );
		float reach = max( radius * radius - distanceSquared, 0.0 );
		occlusion += reach * reach * reach * max( ( dot( delta, normal ) - bias ) / ( distanceSquared + 0.01 ), 0.0 );
	}
	float r2 = radius * radius;
	occlusion *= 5.0 / ( r2 * r2 * r2 * float( SAMPLES ) );
	float result = max( 0.0, 1.0 - occlusion * uIntensity );
	// Contact shading is meaningless inside distant haze.
	result = mix( result, 1.0, smoothstep( 260.0, 520.0, -p.z ) );
	gl_FragColor = vec4( result, 0.0, 0.0, 1.0 );
}`;

const OCCLUSION_BLUR_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tOcclusion;
uniform vec2 uStep;
${DEPTH_GLSL}
void main() {
	float center = viewZ( vUv );
	float total = texture2D( tOcclusion, vUv ).r * 0.2, weight = 0.2;
	for ( int i = 1; i <= 4; i ++ ) {
		float falloff = 0.2 - float( i ) * 0.035;
		for ( int side = -1; side <= 1; side += 2 ) {
			vec2 uv = vUv + uStep * float( i * side );
			// Reject samples across a depth edge so shading stays on its surface.
			float w = falloff * max( 0.0, 1.0 - abs( viewZ( uv ) - center ) / ( 0.035 * -center + 0.05 ) );
			total += texture2D( tOcclusion, uv ).r * w; weight += w;
		}
	}
	gl_FragColor = vec4( total / weight, 0.0, 0.0, 1.0 );
}`;

const BLOOM_DOWN_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uFirst;
vec3 fetch( vec2 offset ) { return min( texture2D( tSource, vUv + offset * uTexel ).rgb, vec3( 64.0 ) ); }
float karis( vec3 c ) { return 1.0 / ( 1.0 + dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) ); }
void main() {
	vec3 a = fetch( vec2( -2.0, 2.0 ) ), b = fetch( vec2( 0.0, 2.0 ) ), c = fetch( vec2( 2.0, 2.0 ) );
	vec3 d = fetch( vec2( -2.0, 0.0 ) ), e = fetch( vec2( 0.0 ) ), f = fetch( vec2( 2.0, 0.0 ) );
	vec3 g = fetch( vec2( -2.0, -2.0 ) ), h = fetch( vec2( 0.0, -2.0 ) ), i = fetch( vec2( 2.0, -2.0 ) );
	vec3 j = fetch( vec2( -1.0, 1.0 ) ), k = fetch( vec2( 1.0, 1.0 ) ), l = fetch( vec2( -1.0, -1.0 ) ), m = fetch( vec2( 1.0, -1.0 ) );
	vec3 color;
	if ( uFirst > 0.5 ) {
		// Weight each block by inverse brightness. One blazing pixel must not
		// become a flickering blob once it is spread over the screen.
		vec3 g0 = ( a + b + d + e ) * 0.25, g1 = ( b + c + e + f ) * 0.25, g2 = ( d + e + g + h ) * 0.25, g3 = ( e + f + h + i ) * 0.25, g4 = ( j + k + l + m ) * 0.25;
		float w0 = karis( g0 ) * 0.125, w1 = karis( g1 ) * 0.125, w2 = karis( g2 ) * 0.125, w3 = karis( g3 ) * 0.125, w4 = karis( g4 ) * 0.5;
		color = ( g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4 ) / ( w0 + w1 + w2 + w3 + w4 );
	} else {
		color = e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + k + l + m ) * 0.125;
	}
	gl_FragColor = vec4( color, 1.0 );
}`;

const BLOOM_UP_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uWeight;
void main() {
	vec4 o = uTexel.xyxy * vec4( 1.0, 1.0, -1.0, 0.0 );
	vec3 color = texture2D( tSource, vUv ).rgb * 4.0;
	color += ( texture2D( tSource, vUv - o.xw ).rgb + texture2D( tSource, vUv + o.xw ).rgb + texture2D( tSource, vUv - o.wy ).rgb + texture2D( tSource, vUv + o.wy ).rgb ) * 2.0;
	color += texture2D( tSource, vUv - o.xy ).rgb + texture2D( tSource, vUv - o.zy ).rgb + texture2D( tSource, vUv + o.zy ).rgb + texture2D( tSource, vUv + o.xy ).rgb;
	gl_FragColor = vec4( color * ( uWeight / 16.0 ), 1.0 );
}`;

const SHAFTS_FRAGMENT = /* glsl */`
#define STEPS 36
varying vec2 vUv;
uniform sampler2D tScene;
uniform vec2 uSun;
uniform float uAspect;
${DEPTH_GLSL}
void main() {
	vec2 toSun = uSun - vUv;
	vec2 stepUv = toSun * ( 0.9 / float( STEPS ) );
	vec2 uv = vUv + stepUv * gradientNoise( gl_FragCoord.xy );
	vec3 total = vec3( 0.0 );
	float weight = 1.0;
	for ( int i = 0; i < STEPS; i ++ ) {
		if ( uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0 ) {
			// Only open sky carries light; anything in front of it blocks the shaft.
			float open = step( 0.99999, texture2D( tDepth, uv ).x );
			total += min( texture2D( tScene, uv ).rgb, vec3( 24.0 ) ) * ( open * weight );
		}
		weight *= 0.955; uv += stepUv;
	}
	vec2 offset = toSun * vec2( uAspect, 1.0 );
	gl_FragColor = vec4( total / float( STEPS ) * exp( - dot( offset, offset ) * 1.6 ), 1.0 );
}`;

const COMPOSITE_FRAGMENT = /* glsl */`
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tOcclusion;
uniform sampler2D tShafts;
uniform float uExposure;
uniform float uBloom;
uniform float uBloomScale;
uniform float uOcclusion;
uniform float uShafts;
uniform float uAspect;
uniform float uTime;
uniform float uNight;
uniform float uVignette;
uniform float uSaturation;
uniform float uContrast;

vec3 agxContrast( vec3 x ) {
	vec3 x2 = x * x, x4 = x2 * x2;
	return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
// AgX: highlights roll off and desaturate together, so a sunset or a neon
// sign brightens toward white instead of clipping into a flat primary.
// The result is display-encoded.
vec3 agx( vec3 color ) {
	const mat3 inset = mat3( 0.842479062253094, 0.0423282422610123, 0.0423756549057051,
		0.0784335999999992, 0.878468636469772, 0.0784336,
		0.0792237451477643, 0.0791661274605434, 0.879142973793104 );
	const mat3 outset = mat3( 1.19687900512017, -0.0528968517574562, -0.0529716355144438,
		-0.0980208811401368, 1.15190312990417, -0.0980434501171241,
		-0.0990297440797205, -0.0989611768448433, 1.15107367264116 );
	color = inset * color;
	color = clamp( ( log2( max( color, 1e-10 ) ) + 12.47393 ) / 16.5, 0.0, 1.0 );
	color = agxContrast( color );
	float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = pow( max( color, 0.0 ), vec3( uContrast ) );
	color = luma + uSaturation * ( color - luma );
	return clamp( outset * color, 0.0, 1.0 );
}
float hash( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
void main() {
	vec3 hdr = texture2D( tScene, vUv ).rgb;
	float luma = dot( hdr, vec3( 0.2126, 0.7152, 0.0722 ) ) * uExposure;
	// Occlusion belongs to ambient light. Lit windows, lamps and sunlit
	// highlights keep their brightness.
	float occlusion = mix( texture2D( tOcclusion, vUv ).r, 1.0, smoothstep( 0.55, 2.2, luma ) );
	hdr *= mix( 1.0, occlusion, uOcclusion );
	hdr = mix( hdr, texture2D( tBloom, vUv ).rgb * uBloomScale, uBloom );
	hdr += texture2D( tShafts, vUv ).rgb * uShafts;
	vec3 color = agx( hdr * uExposure );
	// Cool shadows against warm highlights; stronger after dark.
	float tone = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	vec3 shadowTint = mix( vec3( 0.985, 1.0, 1.02 ), vec3( 0.95, 1.0, 1.07 ), uNight );
	vec3 highlightTint = mix( vec3( 1.02, 1.0, 0.975 ), vec3( 1.035, 1.0, 0.96 ), uNight );
	color *= mix( shadowTint, highlightTint, smoothstep( 0.05, 0.75, tone ) );
	vec2 lens = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
	color *= 1.0 - uVignette * smoothstep( 0.35, 1.25, length( lens ) );
	// Half a code value of noise hides banding in smooth sky gradients.
	float noise = hash( gl_FragCoord.xy + fract( uTime ) * 61.0 ) + hash( gl_FragCoord.yx + fract( uTime * 1.31 ) * 47.0 ) - 1.0;
	gl_FragColor = vec4( clamp( color + noise / 255.0, 0.0, 1.0 ), 1.0 );
}`;

const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms,
  depthTest: false, depthWrite: false, toneMapped: false, fog: false });

export const BLOOM_LEVELS = 6;

export class PostPipeline {
  constructor(renderer, { samples = 4 } = {}) {
    this.renderer = renderer; this.samples = samples;
    this.fullscreen = new FullscreenPass();
    this.size = new THREE.Vector2(1, 1);
    this.projection = new THREE.Vector4();
    this.sunScreen = new THREE.Vector3();
    this.settings = { occlusion: true, shafts: true, bloomLevels: BLOOM_LEVELS };
    const depth = { tDepth: { value: null }, uProjection: { value: this.projection } };
    this.occlusion = pass(OCCLUSION_FRAGMENT, { ...depth, uTexel: { value: new THREE.Vector2() }, uResolution: { value: new THREE.Vector2() },
      uRadius: { value: 1.35 }, uIntensity: { value: 1.25 } });
    this.occlusionBlur = pass(OCCLUSION_BLUR_FRAGMENT, { ...depth, tOcclusion: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.bloomDown = pass(BLOOM_DOWN_FRAGMENT, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.bloomUp = pass(BLOOM_UP_FRAGMENT, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } });
    this.bloomUp.blending = THREE.AdditiveBlending; this.bloomUp.transparent = true;
    this.shafts = pass(SHAFTS_FRAGMENT, { ...depth, tScene: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } });
    this.composite = pass(COMPOSITE_FRAGMENT, { tScene: { value: null }, tBloom: { value: null }, tOcclusion: { value: null }, tShafts: { value: null },
      uExposure: { value: 1 }, uBloom: { value: .07 }, uBloomScale: { value: 1 }, uOcclusion: { value: 1 }, uShafts: { value: 0 }, uAspect: { value: 1 }, uTime: { value: 0 },
      uNight: { value: 0 }, uVignette: { value: .3 }, uSaturation: { value: 1.26 }, uContrast: { value: 1.22 } });
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true;
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
    this.white = white; this.black = black;
    this.targets = null;
  }

  _allocate(width, height) {
    this._release();
    const linear = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
    const depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    const scene = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples: this.samples,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, depthTexture, generateMipmaps: false });
    scene.texture.name = 'Scene radiance';
    const halfWidth = Math.max(1, width >> 1), halfHeight = Math.max(1, height >> 1);
    const small = () => new THREE.WebGLRenderTarget(halfWidth, halfHeight, { ...linear, type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
    const occlusion = this.settings.occlusion ? small() : null, occlusionSwap = occlusion ? small() : null;
    const shafts = this.settings.shafts ? new THREE.WebGLRenderTarget(halfWidth, halfHeight, { ...linear, type: THREE.HalfFloatType, format: THREE.RGBAFormat }) : null;
    const bloom = [];
    for (let level = 0, w = halfWidth, h = halfHeight; level < this.settings.bloomLevels && w >= 2 && h >= 2; level++, w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) {
      bloom.push(new THREE.WebGLRenderTarget(w, h, { ...linear, type: THREE.HalfFloatType, format: THREE.RGBAFormat }));
    }
    this.targets = { scene, occlusion, occlusionSwap, shafts, bloom };
    this.size.set(width, height);
  }

  _release() {
    if (!this.targets) return;
    const { scene, occlusion, occlusionSwap, shafts, bloom } = this.targets;
    scene.depthTexture?.dispose();
    for (const target of [scene, occlusion, occlusionSwap, shafts, ...bloom]) target?.dispose();
    this.targets = null;
  }

  setQuality({ samples, occlusion, shafts, bloomLevels }) {
    const old = this.settings;
    if (this.samples === samples && old.occlusion === occlusion && old.shafts === shafts && old.bloomLevels === bloomLevels) return;
    this.samples = samples;
    this.settings = { occlusion, shafts, bloomLevels };
    this._release();
  }

  /**
   * @param {object} look exposure, bloom, night and sun direction for this frame.
   */
  render(scene, camera, look = {}) {
    const renderer = this.renderer, size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const width = Math.max(2, Math.floor(size.x)), height = Math.max(2, Math.floor(size.y));
    if (!this.targets || this.size.x !== width || this.size.y !== height) this._allocate(width, height);
    const { scene: sceneTarget, occlusion, occlusionSwap, shafts, bloom } = this.targets;
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(sceneTarget);
    renderer.render(scene, camera);

    const elements = camera.projectionMatrix.elements;
    this.projection.set(elements[0], elements[5], camera.near, camera.far);
    const depth = sceneTarget.depthTexture, aspect = width / height;

    const useOcclusion = this.settings.occlusion && look.occlusion !== 0;
    if (useOcclusion) {
      const u = this.occlusion.uniforms;
      u.tDepth.value = depth; u.uTexel.value.set(1 / width, 1 / height); u.uResolution.value.set(occlusion.width, occlusion.height);
      this.fullscreen.render(renderer, this.occlusion, occlusion);
      const blur = this.occlusionBlur.uniforms; blur.tDepth.value = depth;
      blur.tOcclusion.value = occlusion.texture; blur.uStep.value.set(1 / occlusion.width, 0);
      this.fullscreen.render(renderer, this.occlusionBlur, occlusionSwap);
      blur.tOcclusion.value = occlusionSwap.texture; blur.uStep.value.set(0, 1 / occlusion.height);
      this.fullscreen.render(renderer, this.occlusionBlur, occlusion);
    }

    // Bloom: a chain of half-size blurs, then summed back up from the widest.
    const down = this.bloomDown.uniforms, levels = Math.min(bloom.length, this.settings.bloomLevels);
    for (let i = 0; i < levels; i++) {
      const source = i ? bloom[i - 1] : sceneTarget;
      down.tSource.value = source.texture; down.uTexel.value.set(1 / source.width, 1 / source.height); down.uFirst.value = i ? 0 : 1;
      this.fullscreen.render(renderer, this.bloomDown, bloom[i]);
    }
    const up = this.bloomUp.uniforms;
    renderer.autoClear = false;
    for (let i = levels - 1; i > 0; i--) {
      up.tSource.value = bloom[i].texture; up.uTexel.value.set(1 / bloom[i].width, 1 / bloom[i].height); up.uWeight.value = 1;
      this.fullscreen.render(renderer, this.bloomUp, bloom[i - 1]);
    }
    renderer.autoClear = true;

    // Shafts only exist while the sun is in front of the lens.
    let shaftStrength = 0;
    if (this.settings.shafts && look.sunDirection && look.shafts > 0) {
      this.sunScreen.copy(camera.position).addScaledVector(look.sunDirection, 1000).project(camera);
      const forward = camera.getWorldDirection(new THREE.Vector3()).dot(look.sunDirection);
      const inFront = THREE.MathUtils.smoothstep(forward, .15, .55);
      const onScreen = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(this.sunScreen.x), Math.abs(this.sunScreen.y)), 1.1, 1.9);
      shaftStrength = look.shafts * inFront * onScreen;
      if (shaftStrength > .002) {
        const u = this.shafts.uniforms;
        u.tDepth.value = depth; u.tScene.value = sceneTarget.texture; u.uAspect.value = aspect;
        u.uSun.value.set(this.sunScreen.x * .5 + .5, this.sunScreen.y * .5 + .5);
        this.fullscreen.render(renderer, this.shafts, shafts);
      }
    }

    const c = this.composite.uniforms;
    c.tScene.value = sceneTarget.texture;
    c.tBloom.value = levels ? bloom[0].texture : this.black;
    // Each level adds one blurred copy of the frame, so the sum is 'levels' times too bright.
    c.uBloom.value = levels ? (look.bloom ?? .07) : 0;
    c.uBloomScale.value = levels ? 1 / levels : 0;
    c.tOcclusion.value = useOcclusion ? occlusion.texture : this.white;
    c.uOcclusion.value = useOcclusion ? (look.occlusion ?? 1) : 0;
    c.tShafts.value = shaftStrength > .002 ? shafts.texture : this.black;
    c.uShafts.value = shaftStrength > .002 ? shaftStrength : 0;
    c.uExposure.value = look.exposure ?? 1; c.uAspect.value = aspect; c.uTime.value = look.time ?? 0; c.uNight.value = look.night ?? 0;
    this.fullscreen.render(renderer, this.composite, null);
    renderer.autoClear = autoClear;
  }

  dispose() {
    this._release(); this.fullscreen.dispose(); this.white.dispose(); this.black.dispose();
    for (const material of [this.occlusion, this.occlusionBlur, this.bloomDown, this.bloomUp, this.shafts, this.composite]) material.dispose();
  }
}
