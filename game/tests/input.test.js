import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../dist/input.js';
import * as THREE from '../dist/vendor/three.module.min.js';

function movementInput(t, handleInterfaceKey, weaponControls){
  const original=new Map(['window','document','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const listeners=new Map(),actions=[];
  const target={captures:[],captured:null,addEventListener(name,handler){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(handler);},
    emit(name,event={}){for(const handler of listeners.get(name)||[])handler(event);},
    setPointerCapture(id){this.captures.push(id);this.captured=id;},
    hasPointerCapture(id){return this.captured===id;},releasePointerCapture(){this.captured=null;}};
  const pad={axes:[0,0,0,0],buttons:Array.from({length:12},()=>({pressed:false,value:0}))};
  const document={hidden:false,querySelectorAll:()=>[],addEventListener:target.addEventListener};
  const globals={window:target,document,navigator:{getGamepads:()=>[pad]}};
  for(const [name,value] of Object.entries(globals))Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  return {input:new Input(target,action=>actions.push(action),handleInterfaceKey,weaponControls),pad,target,actions,document};
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
  let controls=input.sample(0,1/60,false);
  assert.equal(controls.forward,.8);assert.ok(controls.turn>0&&controls.turn<.6);
  pad.buttons[7].value=0;pad.buttons[6].value=.7;
  controls=input.sample(0,1/60,false);
  assert.equal(controls.forward,-.7);assert.ok(controls.turn>0&&controls.turn<.6);
  pad.buttons[5].pressed=true;
  controls=input.sample(0,1/60,false);
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
  const controls=input.sample(0,1/60,false);
  assert.equal(controls.forward,0);
  assert.equal(controls.moveZ,1,'walking keeps its camera-relative stick input');
});

test('Space, touch and controller RB engage the handbrake separately from service braking',t=>{
  const {input,pad}=movementInput(t);
  for(const source of ['keyboard','touch','controller']){
    input.clear();pad.buttons[5].pressed=false;
    if(source==='keyboard')input.keys.add('Space');
    if(source==='touch')input.touch.add('brake');
    if(source==='controller')pad.buttons[5].pressed=true;
    input.keys.add('KeyW');
    const controls=input.sample(0,1/60,false);
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

test('browser shortcuts and context gestures do not activate gameplay input over the world',t=>{
  const {input,target,actions}=movementInput(t);
  let prevented=0;
  const preventDefault=()=>{prevented++;};
  target.emit('keydown',{code:'KeyC',target:{tagName:'CANVAS'},ctrlKey:true,shiftKey:true,preventDefault});
  target.emit('keydown',{code:'KeyD',target:{tagName:'CANVAS'},altKey:true,preventDefault});
  assert.equal(prevented,0,'browser shortcuts keep their default behavior');
  assert.equal(input.sample(0,1/60).turn,0);
  for (const event of [{button:0,ctrlKey:true},{button:1}]) {
    const click={...event,pointerId:1,clientX:10,clientY:20,preventDefault};
    target.emit('pointerdown',click);
    target.emit('mousedown',click);
    target.emit('pointerup',click);
  }
  assert.equal(prevented,1,'middle-click cannot start autoscroll');
  target.emit('contextmenu',{button:2,preventDefault});
  assert.equal(prevented,2,'the canvas context menu is blocked even without a weapon');
  assert.deepEqual(target.captures,[]);
  assert.deepEqual(actions,['phone']);
});

test('a missing mouse release cancels the drag and leaves the next click usable',t=>{
  const {input,target,actions}=movementInput(t,undefined,()=>true);
  const mouse={pointerId:1,pointerType:'mouse',clientX:10,clientY:20};
  target.emit('pointerdown',{...mouse,button:2,buttons:2});
  target.emit('mousedown',{...mouse,button:2,buttons:2});
  target.emit('contextmenu',{...mouse,button:2,buttons:2,preventDefault(){}});
  assert.equal(input.aiming,true,'suppressing the context menu preserves right-button aiming');
  target.emit('pointermove',{...mouse,buttons:2,clientX:25});
  assert.ok(input.lookDelta<0);
  target.emit('pointermove',{...mouse,buttons:0,clientX:200});
  assert.equal(input.dragging,false);
  assert.equal(input.aiming,false);
  assert.equal(input.lookDelta,0);
  assert.equal(target.captured,null);
  target.emit('pointerup',{...mouse,button:2,buttons:0});
  target.emit('pointerdown',{...mouse,button:2,buttons:2});
  target.emit('mousedown',{...mouse,button:2,buttons:2});
  assert.equal(input.aiming,true);
  // A fresh press also recovers when the browser never sent a hover event.
  target.emit('pointerdown',{...mouse,button:0,buttons:1});
  assert.equal(input.aiming,false);
  target.emit('pointerup',{...mouse,button:0,buttons:0});
  assert.deepEqual(actions,['fight']);
});

test('losing window focus or hiding the tab clears movement and pending camera input',t=>{
  const {input,target,document,actions}=movementInput(t);
  const key={code:'KeyW',target:{tagName:'CANVAS'}};
  const mouse={pointerId:1,clientX:10,clientY:20};
  for (const event of ['blur','visibilitychange']) {
    target.emit('keydown',key);
    input.touch.add('right');
    target.emit('pointerdown',mouse);
    target.emit('pointermove',{...mouse,clientX:30,clientY:50});
    const moving=input.sample(0,1/60);
    assert.deepEqual([moving.forward,moving.turn],[1,1]);
    document.hidden=event==='visibilitychange';
    target.emit(event);
    document.hidden=false;
    target.emit('keydown',{...key,repeat:true});
    target.emit('pointerup',mouse);
    const standing=input.sample(0,1/60);
    assert.deepEqual([standing.forward,standing.turn,input.lookDelta,input.lookVertical],[0,0,0,0]);
    assert.equal(target.captured,null);
  }
  assert.deepEqual(actions,[]);
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
  const controls=input.sample(0,1/60,false);
  assert.equal(controls.turn,1);assert.equal(controls.forward,.8);
  assert.ok(input.lookDelta<0&&input.lookVertical>0,'controller look remains independent of pointer selection');
  assert.deepEqual(actions,['interact']);
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
  assert.deepEqual(actions,['pause','phone']);
});

test('F6 taps toggle the character and aerial views, while a hold opens the city once',t=>{
  const {input,target,actions}=movementInput(t);
  const key={code:'F6',target:{tagName:'CANVAS'}};
  target.emit('keydown',key);input.sample(0,.1);
  assert.deepEqual(actions,[]);
  target.emit('keyup',key);
  assert.deepEqual(actions,['viewToggle']);
  target.emit('keydown',key);
  input.sample(0,.2);input.sample(0,.2);
  target.emit('keydown',{...key,repeat:true});input.sample(0,.5);
  target.emit('keyup',key);
  assert.deepEqual(actions,['viewToggle','viewCity']);
  target.emit('keydown',key);target.emit('blur');input.sample(0,.5);target.emit('keyup',key);
  target.emit('keydown',{...key,code:'KeyV'});
  assert.deepEqual(actions,['viewToggle','viewCity','nextCamera']);
  target.emit('keydown',{...key,code:'KeyR'});
  assert.deepEqual(actions,['viewToggle','viewCity','nextCamera','lightOrReload']);
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
  const controls=input.sample(0,1/60,false);
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
  equipped=false;assert.equal(input.sample(0,.02).forward,0);
  pad.buttons[6].value=0;pad.buttons[7].value=0;input.sample(0,.02);
  equipped=true;pad.buttons[1]={pressed:true,value:1};input.sample(0,.02);input.sample(0,.02);
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
  input.tapSprint=false;pad.axes[1]=-.8;pad.buttons[0].pressed=true;input.sample(0,.1);
  pad.buttons[0].pressed=false;assert.equal(input.sample(0,.1).jog,true);
});

test('classic controller pacing holds a jog and sustains sprint only while presses continue', t=>{
  const {input,pad}=movementInput(t);input.tapSprint=true;pad.axes[1]=-1;
  pad.buttons[0].pressed=true;
  for(let i=0;i<10;i++){const state=input.sample(0,.1);assert.ok(state.jog && !state.run);}
  pad.buttons[0].pressed=false;input.sample(0,.1);
  for(let i=0;i<4;i++){
    pad.buttons[0].pressed=true;assert.equal(input.sample(0,.1).run,i>0);
    pad.buttons[0].pressed=false;input.sample(0,.1);
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

test('View tap cycles the camera, hold opens the menu, and aiming changes A from pace to heavy',t=>{
  const {input,pad,actions}=movementInput(t);
  const sample=()=>input.sample(0,.1);
  pad.buttons[8].pressed=true;sample();pad.buttons[8].pressed=false;sample();
  pad.buttons[8].pressed=true;for(let i=0;i<6;i++)sample();pad.buttons[8].pressed=false;sample();
  pad.buttons[0].pressed=true;sample();pad.buttons[0].pressed=false;sample();
  pad.buttons[6].value=1;pad.buttons[0].pressed=true;sample();sample();
  assert.deepEqual(actions,['nextCamera','interactionMenu','heavy']);
});

test('captured mouse movement turns the camera, and Escape returns control to the pause menu',t=>{
  const {input,target,actions,document}=movementInput(t);
  document.pointerLockElement=target;
  target.emit('pointerlockchange');
  target.emit('mousemove',{movementX:30,movementY:-10});
  assert.ok(input.lookDelta<0 && input.lookVertical<0);
  target.emit('mousedown',{button:0});
  assert.deepEqual(actions,['fight']);
  document.pointerLockElement=null;target.emit('pointerlockchange');
  assert.deepEqual(actions,['fight','pause']);
  document.pointerLockElement=target;target.emit('pointerlockchange');
  document.exitPointerLock=()=>{document.pointerLockElement=null;target.emit('pointerlockchange');};
  input.clear();
  assert.deepEqual(actions,['fight','pause']);
});

test('bicycle controls pedal with A, sprint on repeated presses and brake with either trigger',t=>{
  const {input,pad}=movementInput(t);
  input.context=()=>'bike';
  const sample=()=>input.sample(0,.1,false);
  pad.buttons[0].pressed=true;assert.equal(sample().forward,1);
  pad.buttons[0].pressed=false;assert.equal(sample().forward,0);
  pad.buttons[0].pressed=true;assert.equal(sample().run,true);
  for(const i of [6,7]){
    pad.buttons[i].value=.7;assert.equal(sample().handbrake,true);
    pad.buttons[i].value=0;
  }
  input.keys.add('KeyQ');assert.equal(sample().handbrake,true);
});
