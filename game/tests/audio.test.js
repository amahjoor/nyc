import test from 'node:test';
import assert from 'node:assert/strict';
import { CityAudio } from '../dist/audio.js';

test('interface cues start on confirmation and have their own mute setting', async t => {
  const param = () => ({
    value: 0, setValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime() {}, setTargetAtTime(value) { this.value = value; },
  });
  const node = () => ({ connect(destination) { return destination; }, disconnect() {} });
  class AudioContext {
    state = 'suspended';
    currentTime = 0;
    sampleRate = 100;
    destination = node();
    tones = [];
    async resume() { this.state = 'running'; }
    createGain() { return { ...node(), gain: param() }; }
    createOscillator() {
      return { ...node(), frequency: param(), start: time => this.tones.push(time), stop() {} };
    }
    createBiquadFilter() { return { ...node(), frequency: param() }; }
    createBuffer() { return { getChannelData: () => new Float32Array(300) }; }
    createBufferSource() { return { ...node(), start() {} }; }
  }
  const originalWindow = globalThis.window;
  globalThis.window = { AudioContext };
  t.after(() => { globalThis.window = originalWindow; });

  const audio = new CityAudio();
  await audio.interfaceCue('select');
  assert.equal(audio.ctx, undefined);
  await audio.interfaceCue('confirm');
  const context = audio.ctx;
  assert.deepEqual(context.tones, [0, .027]);
  assert.equal(audio.enabled, false);
  assert.doesNotThrow(() => audio.update(null, 0, false), 'interface audio alone needs no city audio graph');

  await audio.interfaceCue('select');
  assert.equal(context.tones.length, 2, 'selection immediately after confirmation stays quiet');
  context.currentTime = .2;
  await audio.interfaceCue('select');
  assert.deepEqual(context.tones, [0, .027, .2]);

  assert.equal(await audio.toggle(), true);
  assert.equal(audio.ctx, context);
  audio.interfaceEnabled = false;
  const count = context.tones.length;
  await audio.interfaceCue('confirm');
  assert.equal(context.tones.length, count);
  assert.equal(audio.master.gain.value, .35);
  assert.equal(await audio.toggle(), false);
});
