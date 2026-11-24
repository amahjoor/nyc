const rate = 24000;
const tau = 2 * Math.PI;

function renderZoomCue(context, inward) {
  const duration = inward ? .64 : .53;
  const buffer = context.createBuffer(2, Math.round(duration * rate), rate);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  const wind = new Float32Array(left.length);
  const early = Math.round(.011 * rate), late = Math.round(.026 * rate);
  const impactAt = inward ? .12 : .017;
  let seed = 349891, lowAir = 0, highAir = 0, rumble = 0, sweepPhase = 0, impactPhase = 0;
  for (let i = 0; i < left.length; i++) {
    const t = i / rate;
    const motion = 1 - Math.exp(-t * 8);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;

    // A widening gust on the pullback, a closing gust on the drop.
    const opening = inward ? 1 - motion : motion;
    const cutoff = 320 + 1640 * opening * opening;
    highAir += (noise - highAir) * (1 - Math.exp(-tau * cutoff / rate));
    lowAir += (highAir - lowAir) * .028;
    wind[i] = (highAir - lowAir) * (1 - Math.exp(-t * 41)) * Math.exp(-t * (inward ? 5.2 : 6.5));

    const sweepHz = inward ? 54 + 131 * (1 - motion) ** 2 : 65 + 85 * motion;
    sweepPhase += tau * sweepHz / rate;
    const swell = (1 - Math.exp(-t * 22)) * Math.exp(-t * 5.3);
    const sweep = swell * (.24 * Math.sin(sweepPhase) + .11 * Math.sin(2 * sweepPhase + .18));

    // A short pressure pulse gives each step weight, with a heavier arrival.
    const hitAge = Math.max(0, t - impactAt);
    impactPhase += tau * (39 + 49 * Math.exp(-hitAge * 20)) / rate;
    rumble += (noise - rumble) * .045;
    const pulse = (1 - Math.exp(-hitAge * 115)) * Math.exp(-hitAge * (inward ? 11 : 17));
    const pressure = pulse * ((inward ? .43 : .32) * Math.sin(impactPhase) +
      .095 * Math.sin(2 * impactPhase) + .19 * rumble);

    // Keep the pressure centered and give the air short, unequal reflections.
    const fade = Math.min(1, t / .006, (left.length - 1 - i) / (.076 * rate));
    left[i] = fade * (sweep + pressure + .58 * wind[i] + .24 * (wind[i - early] || 0));
    right[i] = fade * (sweep + pressure + .58 * wind[i] + .24 * (wind[i - late] || 0));
  }
  return buffer;
}

// One step of the map's zoom: a short, dry tick with a small voiced body, the kind a console map makes for each notch.
// It climbs going in and drops going out, so the direction is heard without looking. Unlike the camera's rise and fall
// it has no air and no tail: a wheel can step the map a dozen times a second.
function renderMapZoomCue(context, inward) {
  const duration = .085;
  const buffer = context.createBuffer(1, Math.round(duration * rate), rate);
  const samples = buffer.getChannelData(0);
  let seed = 90317, soft = 0, phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    // The contact: a few milliseconds of bright noise.
    soft += (noise - soft) * .34;
    const contact = .2 * (noise - soft) * Math.exp(-t * 620);
    // The body: a rounded tone that settles a fourth up going in, a fourth down going out.
    const glide = 1 - Math.exp(-t * 58);
    const hz = inward ? 590 + 290 * glide : 740 - 280 * glide;
    phase += tau * hz / rate;
    const voiced = (1 - Math.exp(-t * 1100)) * Math.exp(-t * (inward ? 54 : 46));
    const body = voiced * (.46 * Math.sin(phase) + .13 * Math.sin(2 * phase + .4));
    // A little weight under it, so it reads as a notch and not a beep.
    const weight = .17 * Math.sin(tau * 148 * t) * Math.exp(-t * 85);
    samples[i] = (contact + body + weight) * Math.min(1, t / .0012, (samples.length - 1 - i) / (.012 * rate));
  }
  return buffer;
}

// Original short score cues. Render once per context so camera cuts can start on the same frame.
export function renderSceneCue(context, kind) {
  if (kind === 'zoomIn' || kind === 'zoomOut') return renderZoomCue(context, kind === 'zoomIn');
  if (kind === 'mapZoomIn' || kind === 'mapZoomOut') return renderMapZoomCue(context, kind === 'mapZoomIn');
  const duration = kind === 'wasted' ? 1.95 : 1.25;
  const buffer = context.createBuffer(1, Math.ceil(duration * rate), rate);
  const samples = buffer.getChannelData(0);
  let seed = 349891,
    air = 0,
    bass = 0,
    phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    let sample;
    if (kind === 'wasted') {
      bass += (noise - bass) * 0.023;
      phase += (tau * (33 + 57 * Math.exp(-t * 5.6))) / rate;
      const pulse = Math.exp(-2.6 * t) + 0.34 * (t >= 0.43 ? Math.exp(-(t - 0.43) * 6) : 0);
      sample = pulse * (0.73 * Math.sin(phase) + 0.48 * bass) + 0.11 * Math.sin(tau * 64 * t) * Math.exp(-2 * t);
    } else {
      // Two short ratchet strikes followed by a muted low chord.
      const strike = t < 0.14 ? t : t - 0.14;
      air += (noise - air) * 0.47;
      const metal =
        (0.5 * air + 0.19 * Math.sin(tau * 1184 * strike) + 0.1 * Math.sin(tau * 1937 * strike)) *
        Math.exp(-strike * 46);
      const body = t - 0.15;
      sample =
        metal +
        (body > 0
          ? (0.33 * Math.sin(tau * 82 * body) + 0.2 * Math.sin(tau * 110 * body)) * Math.exp(-3.8 * body)
          : 0);
    }
    samples[i] = sample * Math.min(1, t / 0.004, (duration - t) / 0.035);
  }
  return buffer;
}
