/** City ambience and an original synthesized club loop. */
export class CityAudio {
  constructor() { this.enabled = false; }
  async toggle() {
    try {
      if (!this.ctx) this.init();
      await this.ctx.resume();
      this.enabled = !this.enabled;
      this.master.gain.setTargetAtTime(this.enabled ? .35 : 0, this.ctx.currentTime, .15);
      return this.enabled;
    } catch { this.enabled = false; return false; }
  }
  init() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Audio unavailable');
    this.ctx = new AudioContext();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    this.engine = c.createOscillator(); this.engine.type = 'sawtooth';
    this.engineFilter = c.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 220;
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
    this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master); this.engine.start();
    this.siren = c.createOscillator(); this.siren.type = 'sine';
    this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
    this.siren.connect(this.sirenGain).connect(this.master); this.siren.start();
    const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const samples = buffer.getChannelData(0); let last = 0;
    for (let i=0; i<samples.length; i++) { last = (last + (Math.random()*2-1)*.02)/1.02; samples[i] = last * 3; }
    const ambient = c.createBufferSource(); ambient.buffer = buffer; ambient.loop = true;
    this.ambientGain = c.createGain(); this.ambientGain.gain.value = .075;
    ambient.connect(this.ambientGain).connect(this.master); ambient.start();
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
    const c = this.ctx, source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = this.noise; filter.type = 'bandpass'; filter.frequency.value = 900 + Math.random() * 500; filter.Q.value = .6;
    gain.gain.setValueAtTime(.9, c.currentTime); gain.gain.exponentialRampToValueAtTime(.001, c.currentTime + .16);
    source.connect(filter).connect(gain).connect(this.master); source.start(c.currentTime, Math.random() * 2, .2);
  }
  update(sim, time, playing) {
    if (!this.ctx) return;
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
    this.engineGain.gain.setTargetAtTime(playing && motor ? volume : 0, now, .12);
    this.engineFilter.frequency.setTargetAtTime(180 + Math.abs(sim.player.speed)*13, now, .1);
    this.siren.frequency.setTargetAtTime(620 + Math.sin(time*4)*260, now, .04);
    this.sirenGain.gain.setTargetAtTime(playing && sim.heat > 0 ? (sim.spotted ? .045 : .02) : 0, now, .15);
    const police = sim.police, helicopter = police?.helicopter;
    // The helicopter is heard before it is seen, and louder overhead.
    if (this.rotorGain) {
      const away = helicopter ? Math.hypot(helicopter.x - sim.player.x, helicopter.z - sim.player.z) : Infinity;
      this.rotorGain.gain.setTargetAtTime(playing ? Math.max(kind === 'rotor' ? .3 : 0,.22 * Math.max(0, 1 - away / 420)) : 0, now, .2);
    }
    if (police && police.shotsFired !== this.shotsHeard) { if (playing && this.shotsHeard !== undefined) this.gunshot(); this.shotsHeard = police.shotsFired; }
    this.ambientGain.gain.setTargetAtTime(playing ? .075 : .02, now, .2);
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
  horn(distance = 0) {
    if (!this.ctx || !this.enabled) return;
    const c=this.ctx, gain=c.createGain(), osc=c.createOscillator();
    osc.type='sawtooth'; osc.frequency.value=220;
    gain.gain.setValueAtTime(.14/(1+(distance/13)**2),c.currentTime); gain.gain.exponentialRampToValueAtTime(.001,c.currentTime+.35);
    osc.connect(gain).connect(this.master); osc.start(); osc.stop(c.currentTime+.36);
  }
}
