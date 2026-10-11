/** Small original synthesized soundscape. No music or third-party recordings. */
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
  }
  update(sim, time, playing) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const driving = playing && sim.player.mode === 'drive';
    this.engine.frequency.setTargetAtTime(34 + Math.abs(sim.player.speed)*3.4, now, .1);
    this.engineGain.gain.setTargetAtTime(driving ? .13 : 0, now, .12);
    this.engineFilter.frequency.setTargetAtTime(180 + Math.abs(sim.player.speed)*13, now, .1);
    this.siren.frequency.setTargetAtTime(620 + Math.sin(time*4)*260, now, .04);
    this.sirenGain.gain.setTargetAtTime(playing && sim.heat > .6 ? .035 : 0, now, .15);
    this.ambientGain.gain.setTargetAtTime(playing ? .075 : .02, now, .2);
  }
  horn() {
    if (!this.ctx || !this.enabled) return;
    const c=this.ctx, gain=c.createGain(), osc=c.createOscillator();
    osc.type='sawtooth'; osc.frequency.value=220;
    gain.gain.setValueAtTime(.14,c.currentTime); gain.gain.exponentialRampToValueAtTime(.001,c.currentTime+.35);
    osc.connect(gain).connect(this.master); osc.start(); osc.stop(c.currentTime+.36);
  }
}
