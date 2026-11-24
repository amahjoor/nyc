const rate = 24000;
const tau = 2 * Math.PI;

function renderZoomCue(context, inward) {
  const duration = inward ? .61 : .49;
  const buffer = context.createBuffer(2, Math.round(duration * rate), rate);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  const reflection = new Float32Array(left.length);
  const near = Math.round(.019 * rate), far = Math.round(.047 * rate);
  const hitAt = inward ? .14 : 0;
  let seed = 349891, air = 0, phase = 0;
  for (let i = 0; i < left.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    air += ((seed / 2147483648 - 1) - air) * .29;

    // The pullback snaps at the cut. The dive draws air into the hit.
    const motion = 1 - Math.exp(-t * 12);
    phase += tau * (inward ? 790 - 620 * motion : 210 + 720 * motion) / rate;
    const envelope = inward && t < hitAt ? (t / hitAt) ** 1.6 : Math.exp(-Math.max(0, t - hitAt) * 15);
    const scan = envelope * (.29 * air + .16 * Math.sin(phase + 1.3 * Math.sin(phase * .5)));

    const age = Math.max(0, t - hitAt);
    // A pitched drum transient with an upper harmonic audible on small speakers.
    const drumPhase = tau * (52 * age + 3.2 * (1 - Math.exp(-age * 55)));
    const drum = (.47 * Math.sin(drumPhase) + .16 * Math.sin(2 * drumPhase)) * Math.exp(-age * (inward ? 10 : 19));
    const click = .17 * Math.sin(tau * 1420 * age) * Math.exp(-age * 210);
    reflection[i] = scan + click;
    const fade = Math.min(1, t / .003, (left.length - 1 - i) / (.03 * rate));
    left[i] = fade * (drum + reflection[i] + .30 * (reflection[i - near] || 0));
    right[i] = fade * (drum + reflection[i] + .25 * (reflection[i - far] || 0));
  }
  return buffer;
}

function renderDeathCue(context) {
  const buffer = context.createBuffer(1, Math.round(1.85 * rate), rate);
  const samples = buffer.getChannelData(0);
  const echo = Math.round(.19 * rate);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const bassPhase = tau * (44 * t + 2.8 * (1 - Math.exp(-t * 38)));
    const impact = (.48 * Math.sin(bassPhase) + .17 * Math.sin(2 * bassPhase)) * Math.exp(-t * 7);
    // Two metallic partials sag in pitch together, with a longer ring after the hit.
    const bellPhase = tau * (218 * t + 16 * (1 - Math.exp(-t * 4)));
    const ring = (.19 * Math.sin(bellPhase) + .10 * Math.sin(bellPhase * 1.47)) * Math.exp(-t * 3.6);
    const fade = Math.min(1, t / .005, (samples.length - 1 - i) / (.05 * rate));
    samples[i] = fade * (impact + ring + .29 * (samples[i - echo] || 0));
  }
  return buffer;
}

// A scanner chirp slides into a muted mechanical stop on each map step.
function renderMapZoomCue(context, inward) {
  const duration = .115;
  const buffer = context.createBuffer(1, Math.round(duration * rate), rate);
  const samples = buffer.getChannelData(0);
  const startHz = inward ? 360 : 820, endHz = inward ? 940 : 310;
  const stopAt = inward ? .026 : .036;
  let seed = 90317, air = 0, phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const hz = endHz + (startHz - endHz) * Math.exp(-t * 48);
    phase += tau * hz / rate;
    air += (noise - air) * .17;
    const sweep = (.31 * Math.sin(phase) + .12 * Math.sin(phase * 1.53)) * Math.exp(-t * 37);
    const brush = .35 * air * Math.exp(-t * 88);

    const age = Math.max(0, t - stopAt);
    const stop = .27 * Math.sin(tau * (inward ? 178 : 118) * age) * Math.exp(-age * 86);
    const fade = Math.min(1, t / .002, (samples.length - 1 - i) / (.014 * rate));
    samples[i] = (sweep + brush + stop) * fade;
  }
  return buffer;
}

// Original short score cues. Render once per context so camera cuts can start on the same frame.
export function renderSceneCue(context, kind) {
  if (kind === 'zoomIn' || kind === 'zoomOut') return renderZoomCue(context, kind === 'zoomIn');
  if (kind === 'mapZoomIn' || kind === 'mapZoomOut') return renderMapZoomCue(context, kind === 'mapZoomIn');
  if (kind === 'wasted') return renderDeathCue(context);
  const duration = 1.25;
  const buffer = context.createBuffer(1, Math.ceil(duration * rate), rate);
  const samples = buffer.getChannelData(0);
  let seed = 349891, air = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    // Two short ratchet strikes followed by a muted low chord.
    const strike = t < 0.14 ? t : t - 0.14;
    air += (noise - air) * 0.47;
    const metal =
      (0.5 * air + 0.19 * Math.sin(tau * 1184 * strike) + 0.1 * Math.sin(tau * 1937 * strike)) *
      Math.exp(-strike * 46);
    const body = t - 0.15;
    const sample =
      metal +
      (body > 0
        ? (0.33 * Math.sin(tau * 82 * body) + 0.2 * Math.sin(tau * 110 * body)) * Math.exp(-3.8 * body)
        : 0);
    samples[i] = sample * Math.min(1, t / 0.004, (duration - t) / 0.035);
  }
  return buffer;
}
