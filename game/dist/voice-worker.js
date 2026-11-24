// Single-threaded inference keeps speech off the rendering thread, including on
// hosts without cross-origin isolation.
import { env, InferenceSession, Tensor } from './vendor/onnx/ort.wasm.min.mjs';

env.wasm.numThreads = 1;
env.wasm.wasmPaths = new URL('./vendor/onnx/', import.meta.url).href;
env.logLevel = 'error';
const base = new URL('./assets/audio/voices/', import.meta.url);
const engine = Promise.all([
  InferenceSession.create(new URL('libritts-r.onnx', base).href, {executionProviders: ['wasm']}),
  fetch(new URL('phonemes.json', base)).then(response => {
    if (!response.ok) throw new Error('Dialogue pronunciations unavailable');
    return response.json();
  }),
]);
engine.catch(() => self.postMessage({failed: true}));

function pcmForPlayback(raw) {
  let peak = 0;
  for (const v of raw) peak = Math.max(peak, Math.abs(v));
  if (!Number.isFinite(peak) || peak === 0) throw new Error('Empty speech');
  const threshold = peak * .008;
  let first = 0, last = raw.length;
  while (first < last && Math.abs(raw[first]) < threshold) first++;
  while (last > first && Math.abs(raw[last - 1]) < threshold) last--;
  const pcm = raw.slice(Math.max(0, first - 180), Math.min(raw.length, last + 420));
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] *= (.72 / peak) * Math.min(1, i / 32, (pcm.length - 1 - i) / 96);
  }
  return pcm;
}

const integer = (values, dims) => new Tensor('int64', BigInt64Array.from(values, BigInt), dims);

async function speak(session, phones, speaker) {
  const sentences = [];
  // Piper gives each sentence its own start and end token. Run them separately
  // so a two-sentence reaction has a natural pause before the second sentence.
  let start = 0;
  for (let end = 0; end < phones.length; end++) {
    if (phones[end] !== 2) continue;
    const ids = phones.slice(start, end + 1);
    const result = await session.run({
      input: integer(ids, [1, ids.length]),
      input_lengths: integer([ids.length], [1]),
      scales: new Tensor('float32', Float32Array.of(.333, 1, .333), [3]),
      sid: integer([speaker], [1]),
    });
    sentences.push(pcmForPlayback(result[session.outputNames[0]].data));
    start = end + 1;
  }
  if (sentences.length === 1) return sentences[0];
  const pause = Math.round(.16 * 22050);
  const length = sentences.reduce((sum, pcm) => sum + pcm.length, pause * (sentences.length - 1));
  const samples = new Float32Array(length);
  let offset = 0;
  for (const sentence of sentences) {
    samples.set(sentence, offset);
    offset += sentence.length + pause;
  }
  return samples;
}

let next = null, running = false;
self.onmessage = async ({data}) => {
  next = data;
  if (running) return;
  running = true;
  try {
    const [session, pronunciations] = await engine;
    while (next) {
      const {ticket, text, speaker, phones} = next;
      next = null;
      const pcm = await speak(session, phones ?? pronunciations[text], speaker);
      self.postMessage({ticket, pcm}, [pcm.buffer]);
    }
  } catch {
    self.postMessage({failed: true});
  } finally {
    running = false;
  }
};
