import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../dist/input.js';
import * as THREE from '../dist/vendor/three.module.min.js';

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

function movementInput(t){
  const original=new Map(['window','document','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const target={addEventListener(){}};
  const pad={axes:[0,0,0,0],buttons:Array.from({length:12},()=>({pressed:false,value:0}))};
  const globals={window:target,document:{querySelectorAll:()=>[]},navigator:{getGamepads:()=>[pad]}};
  for(const [name,value] of Object.entries(globals))Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  return {input:new Input(target,()=>{}),pad};
}

test('keyboard, arrows, touch and controller movement follow the actual camera screen axes',t=>{
  const {input,pad}=movementInput(t);
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2,.73]){
    const camera=new THREE.PerspectiveCamera();
    camera.position.set(-Math.sin(yaw)*10,5,-Math.cos(yaw)*10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);right.y=0;right.normalize();
    const ahead=new THREE.Vector3();camera.getWorldDirection(ahead);ahead.y=0;ahead.normalize();
    for(const [key,arrow,touch,axis,value,expected,turn] of [
      ['KeyD','ArrowRight','right',0,1,right,1],['KeyA','ArrowLeft','left',0,-1,right.clone().negate(),-1],
      ['KeyW','ArrowUp','forward',1,-1,ahead,0],['KeyS','ArrowDown','back',1,1,ahead.clone().negate(),0],
    ]){
      for(const source of ['keyboard','arrows','touch','controller']){
        input.clear();pad.axes.fill(0);
        if(source==='keyboard')input.keys.add(key);
        else if(source==='arrows')input.keys.add(arrow);
        else if(source==='touch')input.touch.add(touch);
        else pad.axes[axis]=value;
        const result=input.sample(yaw,1/60),movement=new THREE.Vector3(result.moveX,0,result.moveZ);
        assert.ok(movement.distanceTo(expected)<1e-9,`${source} ${key} must match the rendered view at yaw ${yaw}`);
        assert.equal(result.turn,turn);
      }
    }
  }
});

test('controller triggers preserve forward and reverse while horizontal stick steers',t=>{
  const {input,pad}=movementInput(t);
  pad.axes[0]=.6;pad.buttons[7].value=.8;
  let controls=input.sample(0,1/60);
  assert.equal(controls.forward,.8);assert.equal(controls.turn,.6);
  pad.buttons[7].value=0;pad.buttons[6].value=.7;
  controls=input.sample(0,1/60);
  assert.equal(controls.forward,-.7);assert.equal(controls.turn,.6);
  pad.buttons[2].pressed=true;
  assert.equal(input.sample(0,1/60).brake,true);
});
