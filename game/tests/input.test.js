import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../dist/input.js';

test('right bumper emits camera changes on press edges, including from city overview', () => {
  const original = new Map(['window', 'document', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 12 }, () => ({ pressed: false, value: 0 })) };
  const target = { addEventListener() {} };
  const globals = { window: target, document: { querySelectorAll: () => [] }, navigator: { getGamepads: () => [pad] } };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true });
  try {
    const actions = [];
    const input = new Input(target, action => actions.push(action));
    input.sample(0, 1 / 60);
    assert.deepEqual(actions, []);
    pad.buttons[5].pressed = true;
    input.sample(0, 1 / 60);
    assert.deepEqual(actions, ['view'], 'the camera action must be accessible without movement or another button');
    input.clear();
    for (let i = 0; i < 30; i++) input.sample(0, 1 / 60);
    assert.deepEqual(actions, ['view'], 'clearing input on camera change must not repeatedly cycle a held bumper');
    pad.buttons[5].pressed = false;
    input.sample(0, 1 / 60);
    pad.buttons[5].pressed = true;
    input.sample(0, 1 / 60);
    assert.deepEqual(actions, ['view', 'view']);
    pad.buttons[5].pressed = false;
    pad.buttons[8].pressed = true;
    input.sample(0, 1 / 60);
    assert.deepEqual(actions, ['view', 'view', 'map'], 'the existing map binding remains separate from camera changes');
  } finally {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
