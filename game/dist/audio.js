import { noteContact } from './street-reactions.js';
import { WorldSounds } from './world-sounds.js';
import { EnvironmentAudio } from './environment-audio.js';
import { renderSceneCue } from './scene-audio.js';

// A filtered noise strike gives the switch its snap. Two quickly damped
// resonances give the confirmation more weight and the highlight a lighter tap.
function makeInterfaceClick(context, confirm) {
  const rate = 24000;
  const duration = confirm ? .049 : .027;
  const buffer = context.createBuffer(1, Math.round(rate * duration), rate);
  const samples = buffer.getChannelData(0);
  const bodyFrequency = confirm ? 480 : 1180;
  const shellFrequency = confirm ? 1270 : 2350;
  const bodyDecay = confirm ? .008 : .004;
  const bodyGain = confirm ? .17 : .058;
  const shellGain = confirm ? .065 : .04;
  const strikeGain = confirm ? .14 : .093;
  let seed = 34567, previousNoise = 0;
  for (let i = 0; i < samples.length; i++) {
    const time = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const strike = strikeGain * (noise - .55 * previousNoise) * Math.exp(-time / .0017);
    previousNoise = noise;
    const body = bodyGain * Math.sin(2 * Math.PI * bodyFrequency * time) * Math.exp(-time / bodyDecay);
    const shell = shellGain * Math.sin(2 * Math.PI * shellFrequency * time) * Math.exp(-time / .0028);
    const fade = Math.min(1, time / .0006, (samples.length - 1 - i) / (rate * .004));
    samples[i] = fade * (strike + body + shell);
  }
  return buffer;
}

function makePhoneClick(context, shutter) {
  const rate = 24000;
  const buffer = context.createBuffer(1, Math.round(rate * (shutter ? .118 : .028)), rate);
  const samples = buffer.getChannelData(0);
  let seed = 18631, previous = 0;
  const snap = (noise, age, pitch, strength, decay) => {
    if (age < 0) return 0;
    const attack = Math.min(1, age / .0008);
    const strike = noise * Math.exp(-age / (decay * .44));
    const ring = Math.sin(2 * Math.PI * pitch * age) * Math.exp(-age / decay);
    return attack * strength * (.7 * strike + .3 * ring);
  };
  for (let i = 0; i < samples.length; i++) {
    const time = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const edge = noise - .64 * previous;
    previous = noise;
    samples[i] = shutter
      ? snap(edge, time, 1080, .21, .010) + snap(edge, time - .035, 1730, .16, .008) + snap(edge, time - .053, 590, .065, .015)
      : snap(edge, time, 1640, .094, .006);
    samples[i] *= Math.min(1, (samples.length - 1 - i) / (rate * .004));
  }
  return buffer;
}

// A dry register latch followed by two struck metal notes. The higher
// partials die away first, leaving a short, pitched ring.
function makeCashCue(context) {
  const rate = 24000;
  const buffer = context.createBuffer(1, Math.round(rate * .48), rate);
  const samples = buffer.getChannelData(0);
  const ring = (age, hz) => {
    if (age <= 0) return 0;
    const phase = age * hz * 2 * Math.PI;
    return Math.min(1, age / .003) * (.18 * Math.sin(phase) * Math.exp(-age * 12)
      + .075 * Math.sin(phase * 2.76) * Math.exp(-age * 27)
      + .035 * Math.sin(phase * 4.12) * Math.exp(-age * 52));
  };
  let seed = 941;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const latch = (.17 * Math.sin(t * 2 * Math.PI * 183) + .13 * (seed / 2147483648 - 1)) * Math.exp(-t * 144);
    samples[i] = (latch + .78 * ring(t - .014, 698.46) + ring(t - .092, 1046.50))
      * Math.min(1, t / .0015, (samples.length - 1 - i) / (rate * .02));
  }
  return buffer;
}

/** City ambience, a club loop, and original synthesized interface cues. */
export class CityAudio {
  constructor() {
    this.enabled = false;
    this.interfaceEnabled = true;
    this.lastInterfaceCue = -Infinity;
    this.sceneBuffers = new Map();
  }
  context() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('Audio unavailable');
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }
  async setEnabled(enabled) {
    const request = this.soundRequest = Symbol();
    if (!enabled) {
      this.enabled = false;
      this.world?.releaseHorn();
      if (this.sceneVoice) this.sceneVoice.source.stop();
      this.sceneVoice = null;
      this.master?.gain.setTargetAtTime(0, this.ctx.currentTime, .045);
      return false;
    }
    try {
      const context = this.context();
      if (context.state !== 'running') await context.resume();
      if (this.soundRequest !== request) return this.enabled;
      if (!this.master) this.init();
      this.enabled = true;
      this.world.loadBells().catch(() => {});
      this.world.loadRideSounds().catch(() => {});
      this.world.synthesis.warm();
      this.master.gain.setTargetAtTime(.35, context.currentTime, .1);
      return true;
    } catch {
      if (this.soundRequest === request) this.enabled = false;
      return this.enabled;
    }
  }
  init() {
    const c = this.context();
    this.master = c.createGain(); this.master.gain.value = 0;
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 4;
    compressor.attack.value = .006;
    compressor.release.value = .18;
    this.master.connect(compressor).connect(c.destination);
    this.engine = c.createOscillator(); this.engine.type = 'sawtooth';
    this.engineFilter = c.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 220;
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
    this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master); this.engine.start();
    const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const samples = buffer.getChannelData(0); let last = 0;
    for (let i=0; i<samples.length; i++) { last = (last + (Math.random()*2-1)*.02)/1.02; samples[i] = last * 3; }
    this.world = new WorldSounds(c, this.master);
    this.environment = new EnvironmentAudio(c, this.master, buffer);
    // Rotor blades: the same noise, low, chopped a dozen times a second.
    const rotor = c.createBufferSource(); rotor.buffer = buffer; rotor.loop = true;
    const rotorFilter = c.createBiquadFilter(); rotorFilter.type = 'lowpass'; rotorFilter.frequency.value = 160;
    const chop = c.createGain(); chop.gain.value = .5;
    const beat = c.createOscillator(); beat.type = 'square'; beat.frequency.value = 13;
    const depth = c.createGain(); depth.gain.value = .5;
    beat.connect(depth).connect(chop.gain); beat.start();
    this.rotorGain = c.createGain(); this.rotorGain.gain.value = 0;
    rotor.connect(rotorFilter).connect(chop).connect(this.rotorGain).connect(this.master); rotor.start();
    this.noise = buffer;
  }
  async interfaceCue(cue) {
    if (!this.interfaceEnabled) return;
    const select = cue === 'select';
    if (this.ctx?.state !== 'running') {
      // A hover cannot unlock Web Audio. The first activation can.
      if (select) return;
      const requested = performance.now();
      try { await this.context().resume(); } catch { return; }
      if (!this.interfaceEnabled || performance.now() - requested > 250) return;
    }
    const c = this.ctx, now = c.currentTime;
    if (cue === 'cash') {
      if (now - (this.lastCashCue ?? -Infinity) < .09) return;
      this.lastCashCue = now;
    }
    // Navigation can move focus again during a click. Leave room for the click cue.
    if (select && now - this.lastInterfaceCue < .075) return;
    this.lastInterfaceCue = now;
    const click = c.createBufferSource();
    if (cue === 'cash') click.buffer = this.cashCue ||= makeCashCue(c);
    else if (cue === 'phoneTap') click.buffer = this.phoneTap ||= makePhoneClick(c, false);
    else if (cue === 'phoneShutter') click.buffer = this.phoneShutter ||= makePhoneClick(c, true);
    else click.buffer = select
      ? (this.selectClick ||= makeInterfaceClick(c, false))
      : (this.confirmClick ||= makeInterfaceClick(c, true));
    click.connect(c.destination);
    click.onended = () => click.disconnect();
    click.start(now);
  }
  sceneCue(kind, level = 1) {
    if (!this.enabled || !this.master) return;
    const c=this.ctx, now=c.currentTime, zoom=kind==='zoomIn'||kind==='zoomOut';
    if (zoom && (now < (this.endingCueUntil || 0) ||
        (this.lastZoom===kind && now-this.zoomAt<.24))) return;
    if(zoom){this.lastZoom=kind;this.zoomAt=now;}
    else this.endingCueUntil=now+(kind==='wasted'?1.6:1);
    if (this.sceneVoice) {
      this.sceneVoice.gain.gain.setTargetAtTime(0,now,.018);
      this.sceneVoice.source.stop(now+.08);
    }
    if(!this.sceneBuffers.has(kind))this.sceneBuffers.set(kind,renderSceneCue(c,kind));
    const source=c.createBufferSource(),gain=c.createGain();
    source.buffer=this.sceneBuffers.get(kind);
    gain.gain.value=(zoom ? .76 : 1.1)*level;
    source.connect(gain).connect(this.master);
    this.sceneVoice={source,gain};
    source.onended=()=>{source.disconnect();gain.disconnect();if(this.sceneVoice?.source===source)this.sceneVoice=null;};
    source.start(now);
  }
  /** One step of the map's zoom. A tick of its own: the camera's rise and fall is far too long to repeat at a wheel's pace. */
  mapZoomCue(inward) {
    if (!this.enabled || !this.master) return;
    const c=this.ctx, now=c.currentTime;
    if (now < (this.endingCueUntil || 0) || now-(this.mapZoomAt ?? -Infinity) < .06) return;
    this.mapZoomAt=now;
    const kind=inward ? 'mapZoomIn' : 'mapZoomOut';
    if(!this.sceneBuffers.has(kind))this.sceneBuffers.set(kind,renderSceneCue(c,kind));
    const source=c.createBufferSource(),gain=c.createGain();
    source.buffer=this.sceneBuffers.get(kind);
    gain.gain.value=.5;
    source.connect(gain).connect(this.master);
    source.onended=()=>{source.disconnect();gain.disconnect();};
    source.start(now);
  }
  cameraStep(stage, level) {
    const cue=stage==='rise'?'zoomOut':stage==='fall'||stage==='land'?'zoomIn':null;
    const step=cue?stage+level:null;
    if(step!==this.shotStep && cue)this.sceneCue(cue,stage==='land' ? .82 : .9);
    this.shotStep=step;
  }
  makeClubLoop() {
    const c = this.ctx, rate = 22050, beat = .5;
    const buffer = c.createBuffer(1, 8 * beat * rate, rate);
    const wave = buffer.getChannelData(0);
    const bass = [55, 55, 65.406, 49, 55, 73.416, 65.406, 49];
    let seed = 37, lastNoise = 0;
    for (let i = 0; i < wave.length; i++) {
      const t = i / rate, step = Math.floor(t / beat), phase = t - step * beat;
      const hat = (phase + beat / 2) % beat;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      const kick = Math.sin(2 * Math.PI * (47 * phase + 1.8 * (1 - Math.exp(-40 * phase))));
      const note = Math.sin(2 * Math.PI * bass[step] * hat);
      wave[i] = .48 * kick * Math.exp(-20 * phase) + .19 * note * Math.exp(-18 * hat)
        + .08 * (noise - lastNoise) * Math.exp(-85 * hat);
      lastNoise = noise;
    }
    return buffer;
  }
  trainDoors() {
    if(!this.ctx || !this.enabled)return;
    const c=this.ctx;
    for(const [delay,pitch] of [[0,690],[.27,490]]){
      const start=c.currentTime+delay,tone=c.createOscillator(),gain=c.createGain();
      tone.type='sine';tone.frequency.value=pitch;
      gain.gain.setValueAtTime(.001,start);gain.gain.exponentialRampToValueAtTime(.13,start+.018);
      gain.gain.exponentialRampToValueAtTime(.001,start+.34);
      tone.connect(gain).connect(this.master);tone.start(start);tone.stop(start+.35);
      tone.onended=()=>{tone.disconnect();gain.disconnect();};
    }
  }
  gunshot() {
    if (!this.ctx || !this.enabled) return;
    // A pistol shot in four parts: the crack of the round, the bark of the gun, its thump, and what the street gives back.
    const c = this.ctx, t = c.currentTime, out = this.master;
    const noise = (type, frequency, q, level, attack, length) => {
      const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
      source.buffer = this.noise; filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(level, t + attack); gain.gain.exponentialRampToValueAtTime(.0001, t + length);
      source.connect(filter).connect(gain).connect(out); source.start(t, Math.random() * 1.2, length + .05);
    };
    noise('highpass', 2600 + Math.random() * 600, .7, 1, .001, .045);
    noise('bandpass', 700 + Math.random() * 300, .8, .8, .002, .16);
    noise('lowpass', 420, .5, .26, .03, .75);
    const thump = c.createOscillator(), body = c.createGain();
    thump.type = 'sine'; thump.frequency.setValueAtTime(150, t); thump.frequency.exponentialRampToValueAtTime(48, t + .09);
    body.gain.setValueAtTime(.9, t); body.gain.exponentialRampToValueAtTime(.0001, t + .13);
    thump.connect(body).connect(out); thump.start(t); thump.stop(t + .15);
  }
  update(sim, time, playing, surroundings) {
    if (!this.master) return;
    playing &&= this.enabled;
    const now = this.ctx.currentTime;
    const inClub = playing && this.enabled && sim.room?.style === 'club';
    if (inClub && !this.clubSource) {
      this.clubBuffer ||= this.makeClubLoop();
      this.clubGain = this.ctx.createGain();
      this.clubGain.connect(this.master);
      this.clubGain.gain.setValueAtTime(0, now);
      this.clubGain.gain.setTargetAtTime(.38, now, .12);
      this.clubSource = this.ctx.createBufferSource();
      this.clubSource.buffer = this.clubBuffer;
      this.clubSource.loop = true;
      this.clubSource.connect(this.clubGain);
      this.clubSource.start(now, now % this.clubBuffer.duration);
    } else if (!inClub && this.clubSource) {
      const source = this.clubSource, gain = this.clubGain;
      gain.gain.setTargetAtTime(0, now, .045);
      source.stop(now + .18);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      this.clubSource = null;
    }
    const ride = sim.transport?.active, kind = ride?.spec.kind;
    const motor = (sim.player.mode === 'drive' && !sim.vehicle?.destroyed && sim.vehicle?.burningSince == null) || kind === 'plane' || ride?.home.type === 'motorcycle' || ride?.home.type === 'bus' || (kind === 'boat' && ride.home.type !== 'kayak');
    const electric = sim.vehicle?.identity?.performance?.fuel === 'E';
    const base = kind === 'plane' ? 74 : kind === 'boat' ? 25 : electric ? 70 : 34;
    const speed = Math.abs(sim.player.speed);
    this.engine.type = electric ? 'sine' : 'sawtooth';
    this.engine.frequency.setTargetAtTime(base + speed*(kind === 'plane' ? .95 : electric ? 5 : 3.4), now, .1);
    const volume = electric ? .038*Math.min(1,speed/3) : .13;
    this.engineGain.gain.setTargetAtTime(playing && motor && (sim.player.mode !== 'drive' || electric) ? volume : 0, now, .12);
    this.engineFilter.frequency.setTargetAtTime(180 + Math.abs(sim.player.speed)*13, now, .1);
    const police = sim.police, helicopter = police?.helicopter;
    // The helicopter is heard before it is seen, and louder overhead.
    if (this.rotorGain) {
      const away = helicopter ? Math.hypot(helicopter.x - sim.player.x, helicopter.z - sim.player.z) : Infinity;
      this.rotorGain.gain.setTargetAtTime(playing ? Math.max(kind === 'rotor' ? .3 : 0,.22 * Math.max(0, 1 - away / 420)) : 0, now, .2);
    }
    if (police && police.shotsFired !== this.shotsHeard) { if (playing && this.shotsHeard !== undefined) this.gunshot(); this.shotsHeard = police.shotsFired; }
    this.environment.update(sim, time, playing, surroundings);
    if (this.enabled && (!this.world.buffer || !this.world.detailBuffer || !this.world.streetBank || !this.world.rideBank) && now >= (this.retrySamples || 0)) {
      this.retrySamples = now + 5;
      this.world.load().catch(() => {});
      this.world.load(true).catch(() => {});
      this.world.load('street').catch(() => {});
      this.world.loadRideSounds().catch(() => {});
    }
    this.world.trafficLevel = this.environment.trafficLevel;
    this.world.shoreLevel = this.environment.waterLevel || 0;
    this.world.update(sim, time, playing, surroundings);
  }
  explosion(distance) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, now = c.currentTime, gain = c.createGain(), rumble = c.createOscillator();
    const amp = .65 / (1 + distance * .045);
    rumble.frequency.setValueAtTime(105,now); rumble.frequency.exponentialRampToValueAtTime(34,now+.5);
    gain.gain.setValueAtTime(amp,now); gain.gain.exponentialRampToValueAtTime(.001,now+.85);
    const crack = c.createBufferSource(); crack.buffer = this.noise;
    crack.connect(gain); rumble.connect(gain); gain.connect(this.master);
    crack.start(now,0,.65); rumble.start(now); rumble.stop(now+.86);
  }
  horn(car, gesture) {
    if (this.enabled) this.world?.horn(car, gesture);
  }
  releaseHorn() {
    this.world?.releaseHorn(true);
  }
  async bikeBell(actor, player = false) {
    if (!this.enabled || !this.world?.playing) return;
    const now = this.ctx.currentTime;
    const key = player ? 'nextPlayerBell' : 'nextTrafficBell';
    if (now < this[key] || (!player && this.world.position(actor,42,true).gain < .015)) return;
    this[key] = now + (player ? .28 : 1.4);
    const bank = this.world.bells || await this.world.loadBells().catch(() => null);
    if (!bank || !this.enabled || !this.world.playing || this.ctx.currentTime - now > .7 || (player && actor.mode !== 'bike')) return;
    const clips = Object.keys(bank.regions);
    const clip = clips[(actor.id || 0) % clips.length] || clips[0];
    this.world.play(clip, actor, player ? .72 : .8, 42, .985 + Math.random()*.03, !player, bank);
  }
  wingbeats(at) {
    this.effect('wings', at, .58, 20, true);
  }
  bump(person, pace, time = this.ctx?.currentTime ?? 0) {
    const situation = noteContact(person, pace, time);
    if (situation && this.enabled) this.world?.bump(person, pace, situation);
  }
  vehicleContact(kind, car, other, speed) {
    if (this.enabled) this.world?.vehicleContact(kind, car, other, speed);
  }
  effect(family, actor, level, range, exterior = false) {
    if (this.enabled) this.world?.effect(family, actor, level, range, exterior);
  }
  reply(actor, text, phones, signal) {
    if (this.enabled) this.world?.say(actor, text, true, phones, signal);
  }
}
