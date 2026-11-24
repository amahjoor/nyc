const unit = value => Math.max(0, Math.min(1, value));

function whiteNoise(context) {
  const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

function loop(context, output, buffer, type, frequency, stereo = false) {
  const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = type;
  filter.frequency.value = frequency;
  gain.gain.value = 0;
  const pan = stereo ? context.createStereoPanner?.() : null;
  source.connect(filter).connect(gain);
  if (pan) gain.connect(pan).connect(output);
  else gain.connect(output);
  source.start(context.currentTime, Math.random() * buffer.duration);
  return { filter, gain: gain.gain, pan: pan?.pan };
}

/** Street layers follow the simulation's traffic, walkers and nearby water. */
export class EnvironmentAudio {
  constructor(context, output, rumble) {
    this.context = context;
    this.output = output;
    const noise = whiteNoise(context);
    this.air = loop(context, output, rumble, 'lowpass', 480);
    this.road = loop(context, output, noise, 'lowpass', 720, true);
    this.nextSample = this.nextShoreSample = this.nextMix = -Infinity;
  }

  update(sim, time, playing, { altitude = 0, yaw = 0, shore = () => 0 } = {}) {
    const now = this.context.currentTime;
    const player = sim.player;
    const subway = sim.subway?.enclosed || sim.subway?.journey.aboard;
    const sheltered = Boolean(sim.room || subway);
    const high = unit((altitude - 8) / 65);
    const immersed = player.water && player.y + 1.4 < player.water.level;
    const exterior = playing && !sheltered ? (player.mode === 'drive' ? .54 : 1) * (1 - high) : 0;

    if (playing && time >= this.nextSample) {
      this.nextSample = time + .12;
      let traffic = 0, loudest = 0, pan = 0, pitch = 500;
      if (exterior > 0) {
        for (const car of sim.cars) {
          const speed = Math.abs(car.speed);
          if (car.id === player.vehicleId || !(speed > 2) || car.destroyed) continue;
          const dx = car.x - player.x, dz = car.z - player.z;
          const distance = Math.hypot(dx, dz, (car.y || 0) - (player.y || 0));
          if (distance > 90) continue;
          const volume = unit(speed / 13) / (1 + (distance / 15) ** 2);
          traffic += volume;
          if (volume <= loudest) continue;
          loudest = volume;
          pan = (dz * Math.sin(yaw) - dx * Math.cos(yaw)) / Math.max(5, distance);
          pitch = 420 + speed * 30;
        }
      }
      this.trafficLevel = unit(traffic * .73);
      this.road.pan?.setTargetAtTime(pan * .82, now, .12);
      this.road.filter.frequency.setTargetAtTime(immersed ? 230 : pitch, now, .16);
      if (time >= this.nextShoreSample) {
        this.nextShoreSample = time + .48;
        this.waterLevel = exterior > 0 ? shore(player) : 0;
      }
    } else if (!playing) {
      this.nextSample = this.nextShoreSample = -Infinity;
    }

    if (playing !== this.playing || now >= this.nextMix) {
      this.playing = playing;
      this.nextMix = now + .08;
      const air = playing ? sheltered ? .05 : .22 + high * .22 : 0;
      this.air.gain.setTargetAtTime(air, now, .23);
      this.air.filter.frequency.setTargetAtTime(sheltered || immersed ? 180 : 480 + 490 * high, now, .24);
      this.road.gain.setTargetAtTime(exterior * (.32 * (this.trafficLevel || 0)) * (immersed ? .3 : 1), now, .18);
    }

  }
}
