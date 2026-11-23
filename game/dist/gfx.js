import * as THREE from './vendor/three.module.min.js';
import { skyState, formatClock, TIME_PRESETS, DAY_HOURS, ENVIRONMENT_INTENSITY } from './atmosphere.js';
import { shared, CASCADES, installShaderChunks, shareSceneUniforms, createNoiseTexture, supportsFloatTargets } from './gfx-common.js';
import { Sky } from './sky.js';
import { PostPipeline } from './post.js';

// Three's stock chunks are extended before any material can compile.
installShaderChunks();

export { TIME_PRESETS, formatClock };

/** Half-width in metres of each sun shadow cascade, nearest first. */
export const CASCADE_EXTENTS = [48, 190, 900];
export const QUALITY = {
  balanced: { pixelRatio: 1.15, samples: 4, shadowSizes: [2048, 2048, 1024], occlusion: true, shafts: true, bloomLevels: 5 },
  high: { pixelRatio: 1.65, samples: 4, shadowSizes: [4096, 2048, 2048], occlusion: true, shafts: true, bloomLevels: 6 },
};
/** Game hours that pass per real second while the clock is running. */
export const DEFAULT_TIME_RATE = 1 / 75;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Owns the look of the frame: time of day, sun and sky light, shadows, haze
 * and the screen-space finish. Works with a stub renderer (tests) by falling
 * back to a plain render call.
 */
export class Graphics {
  constructor({ renderer, scene, camera, hours = 19.55, timeRate = DEFAULT_TIME_RATE, quality = 'balanced' }) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    // A stub has no GL context: no render targets, no shader programs.
    // Likewise a context that cannot draw into floating-point targets: the
    // frame is then drawn straight to the canvas with a stock tone curve.
    this.accelerated = supportsFloatTargets(renderer);
    if (!this.accelerated && renderer.capabilities) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9; }
    this.hours = hours; this.timeRate = timeRate; this.clockRunning = true;
    this.elapsed = 0; this.state = null; this.stateHours = NaN;
    this.shadowsEnabled = true; this.localShadows = false; this.quality = QUALITY[quality] ? quality : 'balanced';
    this.focus = new THREE.Vector3(); this.frame = 0;
    /** Extra passes drawn before the frame, such as the water's mirror: (renderer, scene, camera) => void. */
    this.passes = [];

    scene.background = null;
    this.fog = new THREE.FogExp2(0xbbcbd3, .00012); scene.fog = this.fog;
    shared.uNycNoise.value ||= createNoiseTexture();

    // One sun, three shadow maps. Only the first cascade carries light.
    this.cascades = [];
    for (let i = 0; i < CASCADES; i++) {
      const light = new THREE.DirectionalLight(0xffffff, i ? 0 : 1);
      light.name = `Sun cascade ${i}`; light.castShadow = true;
      light.shadow.bias = -.00012 * (i + 1);
      // Push the lookup off the surface by about a texel to stop acne.
      light.shadow.normalBias = [.035, .16, .9][i];
      scene.add(light, light.target);
      this.cascades.push(light);
    }
    this.sun = this.cascades[0];
    // Fill light for renderers that cannot build a reflection map.
    this.fill = new THREE.HemisphereLight(0xffffff, 0x444444, 0); this.fill.name = 'Sky fill'; scene.add(this.fill);

    this.sky = new Sky(); scene.add(this.sky.mesh);
    this.post = this.accelerated ? new PostPipeline(renderer, { samples: QUALITY[this.quality].samples }) : null;
    if (this.accelerated) {
      renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.info.autoReset = false;
    }
    this._right = new THREE.Vector3(); this._up = new THREE.Vector3(); this._center = new THREE.Vector3(); this._forward = new THREE.Vector3();
    this._sunDirection = new THREE.Vector3();
    this.applyQuality();
    this._refreshState(true);
  }

  get clock() { return formatClock(this.hours); }
  /** The sky as a panorama texture, for anything that reflects it directly. */
  get skyPanorama() { return this.sky.panorama.texture; }
  /** The preset nearest the current hour, for the HUD. */
  get period() {
    let best = TIME_PRESETS[0], gap = Infinity;
    for (const preset of TIME_PRESETS) {
      const d = Math.abs(((preset.hours - this.hours + DAY_HOURS * 1.5) % DAY_HOURS) - DAY_HOURS / 2);
      if (d < gap) { gap = d; best = preset; }
    }
    return best;
  }

  setHours(hours) { this.hours = ((hours % DAY_HOURS) + DAY_HOURS) % DAY_HOURS; this._refreshState(true); this._pendingJump = true; }
  setClockRunning(running) { this.clockRunning = Boolean(running); }
  /** Jump to the next named time of day. */
  nextPreset() {
    const index = TIME_PRESETS.indexOf(this.period);
    const next = TIME_PRESETS[(index + 1) % TIME_PRESETS.length];
    this.setHours(next.hours);
    return next;
  }

  setQuality(name) { if (QUALITY[name]) { this.quality = name; this.applyQuality(); } }
  applyQuality() {
    const q = QUALITY[this.quality];
    this.cascades.forEach((light, i) => {
      const size = q.shadowSizes[i];
      if (light.shadow.mapSize.x !== size) { light.shadow.map?.dispose(); light.shadow.map = null; light.shadow.mapSize.set(size, size); }
    });
    if (this.post) { this.post.setSamples(q.samples); Object.assign(this.post.settings, { occlusion: q.occlusion, shafts: q.shafts, bloomLevels: q.bloomLevels }); }
  }
  get pixelRatioLimit() { return QUALITY[this.quality].pixelRatio; }

  /** Shadows are only worth their cost at street scale. */
  setShadows(enabled, local = this.localShadows) {
    this.shadowsEnabled = Boolean(enabled); this.localShadows = Boolean(local);
    const active = this.shadowsEnabled && this.localShadows;
    if (this.renderer.shadowMap.enabled === active) return false;
    this.renderer.shadowMap.enabled = active;
    // Three picks shadow shader variants when a material updates.
    this.scene.traverse(object => {
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.needsUpdate = true;
    });
    return true;
  }
  get shadowsActive() { return Boolean(this.renderer.shadowMap.enabled); }

  /** True once after setHours(), so the reflection map follows a skipped clock immediately. */
  _jumped() { const jumped = this._pendingJump; this._pendingJump = false; return Boolean(jumped); }

  _refreshState(force = false) {
    // The sky drifts slowly. Re-solve it about every seven game seconds.
    if (!force && Math.abs(this.hours - this.stateHours) < .002) return;
    const state = this.state = skyState(this.hours); this.stateHours = this.hours;
    shared.uNycSunDir.value.fromArray(state.keyDirection);
    shared.uNycKeyColor.value.fromArray(state.keyColor);
    shared.uNycAmbientSky.value.fromArray(state.ambientSky);
    shared.uNycAmbientGround.value.fromArray(state.ambientGround);
    shared.uNycBounce.value.fromArray(state.bounce);
    shared.uNycNight.value = state.night; shared.uNycLights.value = state.lightsOn;
    shared.uNycLate.value = state.late;
    shared.uNycFogSunColor.value.fromArray(state.fogSunColor);
    // The haze glow belongs to the sun, not the moon.
    shared.uNycFog.value.w = state.keyIsMoon ? .15 : 1;
    this.fog.color.fromArray(state.fogColor); this.fog.density = state.fogDensity;
    this.sun.color.fromArray(state.keyColor); this.sun.intensity = 1;
    this._sunDirection.fromArray(state.keyDirection);
    if (this.accelerated) {
      // After dark a street is never only moonlit: windows, signs and
      // shopfronts fill it with a low warm light from every side.
      this.fill.color.setRGB(.075, .06, .045); this.fill.groundColor.setRGB(.05, .04, .03); this.fill.intensity = state.lightsOn;
    } else { this.fill.color.fromArray(state.ambientSky); this.fill.groundColor.fromArray(state.ambientGround); }
    this.sky.update(state);
  }

  /** Fit each cascade around the area in view, snapped to its own texels. */
  _placeCascades(overview, height = 0) {
    const direction = this._sunDirection;
    // Light-space axes, matching the look-at the shadow camera will perform.
    this._right.crossVectors(UP, direction).normalize(); this._up.crossVectors(direction, this._right).normalize();
    this.camera.getWorldDirection(this._forward); this._forward.y = 0;
    if (this._forward.lengthSq() < 1e-6) this._forward.set(0, 0, -1); this._forward.normalize();
    const q = QUALITY[this.quality];
    this.cascades.forEach((light, i) => {
      const extent = CASCADE_EXTENTS[i] * (overview ? 1 : 1), texel = extent * 2 / q.shadowSizes[i];
      // Look further ahead than behind: the road in front matters most.
      this._center.copy(this.focus).addScaledVector(this._forward, extent * .55);
      const x = Math.round(this._center.dot(this._right) / texel) * texel, y = Math.round(this._center.dot(this._up) / texel) * texel;
      const z = this._center.dot(direction);
      this._center.set(0, 0, 0).addScaledVector(this._right, x).addScaledVector(this._up, y).addScaledVector(direction, z);
      // A low sun throws a tower's shadow well over a kilometre.
      const reach = 2600;
      light.target.position.copy(this._center);
      light.position.copy(this._center).addScaledVector(direction, reach);
      const camera = light.shadow.camera;
      if (camera.right !== extent || camera.far !== reach + extent * 2.5) {
        camera.left = -extent; camera.right = extent; camera.top = extent; camera.bottom = -extent;
        camera.near = 1; camera.far = reach + extent * 2.5; camera.updateProjectionMatrix();
      }
      // The outer maps change slowly; redraw them on alternating frames.
      // From high above, a map's whole reach is a patch of the picture and nothing in it is seen to move: all three
      // are then redrawn only now and then. A map keeps the placing it was last drawn with, so it stays true meanwhile.
      const far = height > 700;
      light.shadow.autoUpdate = i === 0 && !far;
      if (i === 0 && far) light.shadow.needsUpdate = this.frame % 16 === 3;
      if (i === 1) light.shadow.needsUpdate = far ? this.frame % 16 === 7 : this.frame % 2 === 0;
      if (i === 2) light.shadow.needsUpdate = far ? this.frame % 8 === 1 : this.frame % 4 === 1;
    });
  }

  /**
   * @param {number} dt seconds since the last frame
   * @param {object} view focus point of the action and whether this is the whole-city overview
   */
  update(dt, { focus, overview = false, paused = false, underwater = false, height = 0 } = {}) {
    this.elapsed += dt; this.frame++;
    shared.uNycTime.value = this.elapsed;
    if (this.clockRunning && !paused) this.hours = (this.hours + dt * this.timeRate) % DAY_HOURS;
    this._refreshState();
    if (focus) this.focus.set(focus.x, focus.y || 0, focus.z);
    // Seen from 40 km up, ground haze would read as a grey sheet.
    this.fog.color.fromArray(this.state.fogColor);
    this.fog.density = this.state.fogDensity * (overview ? .45 : 1);
    if (underwater) {
      this.fog.color.setRGB(.028,.095,.084).multiplyScalar(1-.72*this.state.night);
      this.fog.density=.14;
    }
    this.overview = overview;
    if (this.shadowsActive) this._placeCascades(overview, height);
  }

  render() {
    const { renderer, scene, camera } = this;
    shareSceneUniforms(scene);
    const exposure=this.subwayInterior?1.12:this.state.exposure;
    if (!this.accelerated) {
      this.fill.intensity = 1;
      if (renderer.capabilities) renderer.toneMappingExposure = Math.min(3,exposure);
      renderer.render(scene, camera);
      return;
    }
    renderer.info.reset();
    this.sky.renderPanorama(renderer);
    // A jump in the time of day must relight at once; drift can wait its turn.
    const environment = this.sky.renderReflection(renderer, this.state, this.elapsed, this._jumped());
    if (scene.environment !== environment) scene.environment = environment;
    scene.environmentIntensity = this.subwayInterior ? .12 : ENVIRONMENT_INTENSITY;
    for (const pass of this.passes) pass(renderer, scene, camera);
    const state = this.state;
    // Shafts belong to a low sun; a high one only washes the frame out.
    const lowSun = THREE.MathUtils.smoothstep(state.sunElevation, -1.5, 2) * (1 - THREE.MathUtils.smoothstep(state.sunElevation, 16, 34));
    this.post.render(scene, camera, {
      exposure, night: state.night, time: this.elapsed,
      bloom: this.subwayInterior ? .025 : THREE.MathUtils.lerp(.06,.13,state.night),
      // Indoors the contact shading meant for streets blots a room's furniture: most of it is let go.
      occlusion: this.overview ? 0 : 1 - .7 * (this.indoorDepth || 0),
      sunDirection: state.keyIsMoon ? null : this._sunDirection, shafts: this.subwayInterior || this.overview ? 0 : .5 * lowSun,
    });
  }

  dispose() {
    this.post?.dispose(); this.sky.dispose();
    for (const light of this.cascades) { light.shadow.map?.dispose(); this.scene.remove(light, light.target); }
    this.scene.remove(this.fill, this.sky.mesh);
    if (this.scene.fog === this.fog) this.scene.fog = null;
  }
}

export function createGraphics(options) { return new Graphics(options); }
