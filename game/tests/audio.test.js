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
    clips = [];
    async resume() { this.state = 'running'; }
    createGain() { return { ...node(), gain: param() }; }
    createOscillator() {
      return { ...node(), frequency: param(), start() {} };
    }
    createBiquadFilter() { return { ...node(), frequency: param() }; }
    createBuffer(channels, length, rate) {
      const samples = new Float32Array(length);
      return { getChannelData: () => samples, duration: length / rate };
    }
    createBufferSource() {
      const clips = this.clips;
      return { ...node(), start(time) { clips.push({ time, buffer: this.buffer }); } };
    }
  }
  const originalWindow = globalThis.window;
  globalThis.window = { AudioContext };
  t.after(() => { globalThis.window = originalWindow; });

  const audio = new CityAudio();
  await audio.interfaceCue('select');
  assert.equal(audio.ctx, undefined);
  await audio.interfaceCue('confirm');
  const context = audio.ctx;
  assert.deepEqual(context.clips.map(clip => clip.time), [0]);
  const confirm = context.clips[0].buffer;
  assert.equal(audio.enabled, false);
  assert.doesNotThrow(() => audio.update(null, 0, false), 'interface audio alone needs no city audio graph');

  await audio.interfaceCue('select');
  assert.equal(context.clips.length, 1, 'selection immediately after confirmation stays quiet');
  context.currentTime = .2;
  await audio.interfaceCue('select');
  const select = context.clips[1].buffer;
  assert.ok(select.duration < confirm.duration && confirm.duration < .06);
  const peak = buffer => Math.max(...buffer.getChannelData(0).map(Math.abs));
  assert.ok(peak(select) > 0 && peak(select) < peak(confirm) && peak(confirm) < 1);
  context.currentTime = .4;
  await audio.interfaceCue('confirm');
  assert.deepEqual(context.clips.map(clip => clip.time), [0, .2, .4]);
  assert.equal(context.clips[2].buffer, confirm, 'repeat clicks reuse the rendered sound');

  assert.equal(await audio.toggle(), true);
  assert.equal(audio.ctx, context);
  audio.interfaceEnabled = false;
  const count = context.clips.length;
  await audio.interfaceCue('confirm');
  assert.equal(context.clips.length, count);
  assert.equal(audio.master.gain.value, .35);
  assert.equal(await audio.toggle(), false);
});
