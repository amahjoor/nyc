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

function movementInput(t, handleInterfaceKey, weaponControls){
  const original=new Map(['window','document','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const listeners=new Map(),actions=[];
  const target={captures:[],addEventListener(name,handler){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(handler);},
    emit(name,event={}){for(const handler of listeners.get(name)||[])handler(event);},setPointerCapture(id){this.captures.push(id);}};
  const pad={axes:[0,0,0,0],buttons:Array.from({length:12},()=>({pressed:false,value:0}))};
  const globals={window:target,document:{querySelectorAll:()=>[]},navigator:{getGamepads:()=>[pad]}};
  for(const [name,value] of Object.entries(globals))Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  return {input:new Input(target,action=>actions.push(action),handleInterfaceKey,weaponControls),pad,target,actions};
}

test('keyboard, touch and controller movement follow the actual camera screen axes',t=>{
  const {input,pad}=movementInput(t);
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2,.73]){
    const camera=new THREE.PerspectiveCamera();
    camera.position.set(-Math.sin(yaw)*10,5,-Math.cos(yaw)*10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);right.y=0;right.normalize();
    const ahead=new THREE.Vector3();camera.getWorldDirection(ahead);ahead.y=0;ahead.normalize();
    for(const [key,touch,axis,value,expected,turn] of [
      ['KeyD','right',0,1,right,1],['KeyA','left',0,-1,right.clone().negate(),-1],
      ['KeyW','forward',1,-1,ahead,0],['KeyS','back',1,1,ahead.clone().negate(),0],
    ]){
      for(const source of ['keyboard','touch','controller']){
        input.clear();pad.axes.fill(0);
        if(source==='keyboard')input.keys.add(key);
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
  assert.equal(controls.forward,.8);assert.ok(controls.turn>0&&controls.turn<.6);
  pad.buttons[7].value=0;pad.buttons[6].value=.7;
  controls=input.sample(0,1/60);
  assert.equal(controls.forward,-.7);assert.ok(controls.turn>0&&controls.turn<.6);
  pad.buttons[2].pressed=true;
  controls=input.sample(0,1/60);
  assert.equal(controls.handbrake,true);assert.equal(controls.brake,false);
});

test('analog steering is continuous at the deadzone, symmetric and reaches full lock',t=>{
  const {input,pad}=movementInput(t);
  for(const direction of [-1,1]){
    pad.axes[0]=direction*.159;
    assert.equal(Math.abs(input.sample(0,1/60).turn),0);
    pad.axes[0]=direction*.161;
    const edge=input.sample(0,1/60).turn;
    assert.equal(Math.sign(edge),direction);
    assert.ok(Math.abs(edge)<.002,'crossing the deadzone must allow a tiny steering correction');
    let previous=0;
    for(const amount of [.2,.3,.5,.75,1]){
      pad.axes[0]=direction*amount;
      const value=input.sample(0,1/60).turn;
      assert.equal(Math.sign(value),direction);
      assert.ok(Math.abs(value)>previous);
      previous=Math.abs(value);
    }
    assert.equal(previous,1);
  }
  for(const invalid of [NaN,Infinity,undefined]){
    pad.axes[0]=invalid;
    assert.equal(input.sample(0,1/60).turn,0);
  }
});

test('opposing triggers remain neutral despite a forward left stick',t=>{
  const {input,pad}=movementInput(t);
  pad.axes[1]=-1;pad.buttons[7].value=.8;pad.buttons[6].value=.8;
  const controls=input.sample(0,1/60);
  assert.equal(controls.forward,0);
  assert.equal(controls.moveZ,1,'walking keeps its camera-relative stick input');
});

test('Space, touch and controller X engage the handbrake separately from service braking',t=>{
  const {input,pad}=movementInput(t);
  for(const source of ['keyboard','touch','controller']){
    input.clear();pad.buttons[2].pressed=false;
    if(source==='keyboard')input.keys.add('Space');
    if(source==='touch')input.touch.add('brake');
    if(source==='controller')pad.buttons[2].pressed=true;
    input.keys.add('KeyW');
    const controls=input.sample(0,1/60);
    assert.equal(controls.handbrake,true,source);
    assert.equal(controls.brake,false,source);
    assert.equal(controls.forward,1,source);
  }
});

test('pointer camera look is enabled by default and stops when the drag ends',t=>{
  const {input,target}=movementInput(t);
  assert.equal(input.pointerLookEnabled,true);
  target.emit('pointerdown',{pointerId:7,clientX:100,clientY:80});
  target.emit('pointermove',{pointerId:7,clientX:120,clientY:110});
  assert.equal(input.dragging,true);
  assert.deepEqual(target.captures,[7]);
  assert.equal(input.lookDelta,-.1);assert.equal(input.lookVertical,.09);
  target.emit('pointerup',{pointerId:7});
  target.emit('pointermove',{pointerId:7,clientX:200,clientY:200});
  assert.equal(input.dragging,false);
  assert.equal(input.lookDelta,-.1);assert.equal(input.lookVertical,.09);
});

test('map selection disables pointer capture and camera rotation until a new enabled drag',t=>{
  const {input,target}=movementInput(t);
  input.pointerLookEnabled=false;
  target.emit('pointerdown',{pointerId:2,clientX:20,clientY:30});
  target.emit('pointermove',{pointerId:2,clientX:180,clientY:190});
  assert.equal(input.dragging,false);
  assert.deepEqual(target.captures,[]);
  assert.equal(input.lookDelta,0);assert.equal(input.lookVertical,0);
  input.pointerLookEnabled=true;
  target.emit('pointermove',{pointerId:2,clientX:200,clientY:210});
  assert.equal(input.lookDelta,0,'enabling look must not resume an old selection drag');
  target.emit('pointerdown',{pointerId:3,clientX:200,clientY:210});
  target.emit('pointermove',{pointerId:3,clientX:190,clientY:230});
  assert.deepEqual(target.captures,[3]);
  assert.equal(input.lookDelta,.05);assert.equal(input.lookVertical,.06);
});

test('disabling pointer look mid-drag clears pending rotation without disabling keyboard or gamepad input',t=>{
  const {input,target,pad,actions}=movementInput(t);
  target.emit('pointerdown',{pointerId:1,clientX:0,clientY:0});
  target.emit('pointermove',{pointerId:1,clientX:50,clientY:20});
  input.pointerLookEnabled=false;
  assert.equal(input.dragging,false);
  assert.equal(input.lookDelta,0);assert.equal(input.lookVertical,0);
  target.emit('pointermove',{pointerId:1,clientX:100,clientY:60});
  assert.equal(input.lookDelta,0);assert.equal(input.lookVertical,0);
  target.emit('keydown',{code:'KeyD',target:{tagName:'CANVAS'},repeat:false});
  target.emit('keydown',{code:'KeyE',target:{tagName:'CANVAS'},repeat:false});
  pad.axes[2]=.5;pad.axes[3]=.25;pad.buttons[7].value=.8;pad.buttons[5].pressed=true;
  const controls=input.sample(0,1/60);
  assert.equal(controls.turn,1);assert.equal(controls.forward,.8);
  assert.ok(input.lookDelta<0&&input.lookVertical>0,'controller look remains independent of pointer selection');
  assert.deepEqual(actions,['interact','view']);
  target.emit('keyup',{code:'KeyD',target:{tagName:'CANVAS'}});
  assert.equal(input.sample(0,1/60).turn,0);
});

test('only Up opens the phone and no arrow moves or steers the player',t=>{
  const {input,target,actions}=movementInput(t);
  for(const code of ['KeyP','ArrowLeft','ArrowDown','ArrowRight','ArrowUp']){
    input.clear();
    target.emit('keydown',{code,target:{tagName:'CANVAS'},repeat:false,preventDefault(){}});
    const {forward,turn,moveX,moveZ}=input.sample(.7,1/60);
    assert.deepEqual([forward,turn,moveX,moveZ],[0,0,0,0],code);
  }
  assert.deepEqual(actions,['phone']);
});

test('focused phone buttons share movement with the game and search fields accept typing', t => {
  const {input,target,actions} = movementInput(t, () => true);
  function press(code, tagName) {
    let prevented = false;
    target.emit('keydown', {code,target:{tagName},preventDefault(){ prevented = true; }});
    return prevented;
  }
  for (const code of ['KeyW','KeyD','ShiftLeft','KeyE']) press(code, 'BUTTON');
  assert.equal(press('Space', 'BUTTON'), true);
  const {forward,turn,run,handbrake} = input.sample(0, 1/60);
  assert.deepEqual([forward,turn,run,handbrake], [1,1,true,true]);
  assert.deepEqual(actions, []);
  for (const code of ['KeyW','KeyD','ShiftLeft','Space']) target.emit('keyup',{code,target:{tagName:'INPUT'}});
  for (const code of ['KeyS','KeyA','Space']) assert.equal(press(code, 'INPUT'), false);
  const typed = input.sample(0, 1/60);
  assert.deepEqual([typed.forward,typed.turn,typed.run,typed.handbrake], [0,0,false,false]);
});

test('typing an address does not trigger actions, movement, or browser-key suppression',t=>{
  const {input,target,actions}=movementInput(t);
  let prevented=0;
  for(const tagName of ['INPUT','TEXTAREA','SELECT']){
    for(const code of ['KeyW','KeyA','KeyS','KeyD','KeyE','KeyN','KeyR','KeyC','KeyV','KeyM','KeyH','Escape','Enter','ArrowDown','Space']){
      target.emit('keydown',{code,target:{tagName,id:'address-input'},repeat:false,preventDefault(){prevented++;}});
    }
  }
  assert.deepEqual(actions,[]);
  assert.equal(input.keys.size,0);
  assert.equal(prevented,0,'arrows, spaces and Escape remain available to the address field');
  const controls=input.sample(0,1/60);
  assert.equal(controls.forward,0);assert.equal(controls.turn,0);assert.equal(controls.brake,false);assert.equal(controls.handbrake,false);
  input.keys.add('KeyW');
  target.emit('keyup',{code:'KeyW',target:{tagName:'INPUT'}});
  assert.equal(input.keys.has('KeyW'),false,'releasing a movement key after focusing search cannot leave it stuck');
});

test('aim and fire use independent mouse buttons and controller trigger edges',t=>{
  let equipped=true;
  const {input,pad,actions,target}=movementInput(t,undefined,()=>equipped);
  target.emit('pointerdown',{button:2,pointerId:1,clientX:5,clientY:5});
  target.emit('mousedown',{button:2});
  assert.equal(input.aiming,true);
  target.emit('mousedown',{button:0});target.emit('mouseup',{button:0});
  assert.equal(input.aiming,true);assert.deepEqual(actions,['fire']);
  target.emit('mouseup',{button:2});target.emit('pointerup',{pointerId:1,clientX:5,clientY:5});
  assert.equal(input.aiming,false);assert.deepEqual(actions,['fire']);
  target.emit('pointerdown',{pointerId:2,clientX:0,clientY:0});
  target.emit('pointermove',{pointerId:2,clientX:18,clientY:0});
  target.emit('pointerup',{pointerId:2,clientX:0,clientY:0});
  assert.deepEqual(actions,['fire'],'a camera drag can finish where it started');
  pad.buttons[7].value=1;pad.buttons[6].value=.4;
  assert.equal(input.sample(0,.02).forward,0);input.sample(0,.02);
  assert.equal(input.aiming,true);assert.deepEqual(actions,['fire','fire']);
  equipped=false;assert.equal(input.sample(0,.02).forward,.6);
  pad.buttons[6].value=0;pad.buttons[7].value=0;input.sample(0,.02);
  equipped=true;pad.buttons[12]={pressed:true,value:1};input.sample(0,.02);input.sample(0,.02);
  assert.deepEqual(actions,['fire','fire','reload']);
});

test('tapping pace while moving toggles jog, holding sprints, and stopping resets the jog', t=>{
  const {input,pad,target}=movementInput(t);
  input.keys.add('KeyW');
  const shift=(kind,timestamp)=>target.emit(kind,{code:'ShiftLeft',timeStamp:timestamp,target:{tagName:'CANVAS'}});
  shift('keydown',1000);shift('keyup',1080);
  assert.equal(input.sample(0,.1).jog,true);
  shift('keydown',1600);assert.equal(input.sample(0,.1).run,true);shift('keyup',2500);
  assert.equal(input.sample(0,.1).jog,true);
  input.keys.clear();assert.equal(input.sample(0,.1).jog,false);
  pad.axes[1]=-.8;pad.buttons[10].pressed=true;input.sample(0,.1);
  pad.buttons[10].pressed=false;assert.equal(input.sample(0,.1).jog,true);
});

test('classic controller pacing holds a jog and sustains sprint only while presses continue', t=>{
  const {input,pad}=movementInput(t);input.tapSprint=true;pad.axes[1]=-1;
  pad.buttons[10].pressed=true;
  for(let i=0;i<10;i++){const state=input.sample(0,.1);assert.ok(state.jog && !state.run);}
  pad.buttons[10].pressed=false;input.sample(0,.1);
  for(let i=0;i<4;i++){
    pad.buttons[10].pressed=true;assert.equal(input.sample(0,.1).run,i>0);
    pad.buttons[10].pressed=false;input.sample(0,.1);
  }
  for(let i=0;i<6;i++)input.sample(0,.1);
  assert.equal(input.sample(0,.1).run,false);
});

test('on a board the pad pushes with either foot, brakes, flicks without moving the camera, and steps off',t=>{
  const {input,pad,actions}=movementInput(t);
  const sample=()=>input.sample(0,1/30,false,true);
  pad.buttons[0].pressed=true;assert.equal(sample().forward,1);assert.deepEqual(actions,[]);
  pad.buttons[0].pressed=false;pad.buttons[2].pressed=true;assert.equal(sample().pushFoot,-1);
  pad.buttons[2].pressed=false;pad.buttons[1].pressed=true;assert.equal(sample().forward,-1);
  pad.buttons[1].pressed=false;pad.axes[3]=.43;assert.equal(sample().manual,1);
  pad.axes[3]=1;for(let i=0;i<9;i++)sample();
  pad.axes[2]=-.65;pad.axes[3]=-.8;const pop=sample();
  assert.equal(pop.skateTrick,'kickflip');assert.ok(pop.charge>.7);
  assert.equal(sample().skateTrick,undefined);assert.equal(input.lookDelta,0);assert.equal(input.lookVertical,0);
  pad.buttons[7].value=1;assert.equal(sample().grab,1);assert.equal(sample().forward,0);
  pad.buttons[3].pressed=true;sample();assert.deepEqual(actions,['skate']);
});

test('Flickit distinguishes tail and nose pops, diagonal flips and scoops, and releases a cancelled setup',async()=>{
  const {flickStick}=await import('../dist/skate-tricks.js');
  for(const [load,x,y,trick] of [[1,0,-1,'ollie'],[-1,0,1,'nollie'],[1,-.7,-.8,'kickflip'],[1,.7,-.8,'heelflip'],[1,-1,0,'shove'],[1,1,0,'frontShove']]){
    const state={};flickStick(state,0,load,.15);
    assert.equal(flickStick(state,x,y,.04).trick,trick);
    assert.equal(flickStick(state,x,y,.04).trick,null);
  }
  const state={};flickStick(state,0,1,.13);flickStick(state,0,0,.17);
  assert.equal(flickStick(state,.8,-.5,.02).trick,null);
});
