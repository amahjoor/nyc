import { flickStick } from './skate-tricks.js';

const browserModifier = event => event.ctrlKey || event.metaKey || event.altKey;
const textEntry = event => ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName);
const CITY_VIEW_HOLD = .35;

/** Input is sampled each physics frame; one-shot actions run on key-down edges. */
export class Input {
  constructor(canvas, action, handleInterfaceKey = () => false, weaponControls = () => false, phoneButton = () => false, context = () => this.sampledMode || 'walk') {
    this.canvas = canvas;
    this.keys = new Set();
    this.touch = new Set();
    this.tapSprint=true;
    this.context=context;
    this.stick={};this.skateKeys={Digit1:"kickflip",Digit2:"heelflip",Digit3:"shove",Digit4:"nollie",Digit5:"frontShove"};
    this.lookDelta = 0;
    this.lookVertical = 0;
    this.dragPointer = null;
    this.viewHold = null;
    this._pointerLookEnabled = true;
    this.padButtons = [];
    this.action = action;
    this.weaponControls = weaponControls;
    this.phoneButton = phoneButton;
    const actions = {
      KeyF:'vehicle',KeyE:'interact',KeyR:'lightOrReload',KeyQ:'heavy',Digit1:'unarmed',Digit6:'pistol',
      F7:'map',KeyV:'nextCamera',KeyP:'pause',Escape:'pause',KeyM:'interactionMenu',KeyH:'lights',ArrowUp:'phone',
      KeyK:'skate',KeyN:'job',KeyZ:'status',KeyG:'shop',KeyI:'inventory',KeyT:'time',
      // Shortcuts for this city's additional views and equipment.
      KeyB:'perspective',KeyX:'draw',KeyL:'reload',
    };
    window.addEventListener('keydown', e => {
      if (e.code==='ControlLeft' && !e.repeat && !e.altKey && !e.metaKey && !textEntry(e) && this.context()==='walk'){
        this.stealthPending=true;return;
      }
      if (e.ctrlKey) this.stealthPending=false;
      if (browserModifier(e)) return;
      const interfaceHandled = handleInterfaceKey(e);
      if (textEntry(e)) return;
      if (e.code==='F6') {
        if (!interfaceHandled)e.preventDefault?.();
        if (!interfaceHandled && !e.repeat && this.viewHold===null) this.viewHold=0;
        return;
      }
      if (!interfaceHandled && e.code==='Tab' && this.context()==='walk') {
        if (!e.repeat && action('weaponOpen')!==false) { this.keyWheel=true;e.preventDefault(); }
        else if (this.keyWheel) e.preventDefault();
        return;
      }
      if (e.code === 'Space' && e.target.tagName === 'BUTTON' && !interfaceHandled) return;
      if (e.code === 'F7')e.preventDefault?.();
      if (e.code === 'ArrowUp' || e.code === 'Space') e.preventDefault();
      // Sample held movement even while the phone owns shortcuts and app navigation.
      if (!e.repeat && e.code.startsWith('Shift') && this.shiftDown == null) this.shiftDown = e.timeStamp;
      if (!e.repeat) this.keys.add(e.code);
      if(this.skating && !interfaceHandled && !e.repeat){
        if(e.code==='Space')this.spaceDown=e.timeStamp;
        if(this.skateKeys[e.code] && this.spaceDown!=null)this.spaceTrick=true;
        if(this.skateKeys[e.code])this.nextTrick={name:this.skateKeys[e.code],charge:this.spaceDown==null ? .32 : Math.min(1,(e.timeStamp-this.spaceDown)/380)};
      }
      if (!interfaceHandled && !e.repeat && !(this.skating && this.skateKeys[e.code]) && actions[e.code]) action(actions[e.code], e);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
      if(e.code==='KeyF' && this.cabPress?.source==='keyboard'){
        if(textEntry(e) || browserModifier(e))this.cabPress=null;
        else this.updateCabPress(false,0,e.timeStamp);
      }
      if(e.code==='ControlLeft' && this.stealthPending){
        this.stealthPending=false;if(!textEntry(e) && this.context()==='walk')action('stealth');
      }
      if(e.code==='Tab' && this.keyWheel){this.keyWheel=false;action('weaponClose');}
      if (e.code==='F6') {
        const tap=this.viewHold!==null;
        this.viewHold=null;
        if (tap && !browserModifier(e) && !textEntry(e)) action('viewToggle',e);
      }
      if(e.code==='Space' && this.spaceDown!=null){
        if(this.skating && !this.spaceTrick)this.nextTrick={name:'ollie',charge:Math.min(1,(e.timeStamp-this.spaceDown)/380)};
        this.spaceDown=null;this.spaceTrick=false;
      }
      if (e.code.startsWith('Shift') && !this.keys.has('ShiftLeft') && !this.keys.has('ShiftRight')) {
        if (this.shiftDown != null && e.timeStamp - this.shiftDown < 220) this.jogging = !this.jogging;
        this.shiftDown = null;
      }
    });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    canvas.addEventListener('pointerdown', e => {
      const button=e.button??0;
      if (document.pointerLockElement===canvas || !this.pointerLookEnabled || e.isPrimary===false) return;
      if (this.dragging) {
        if (e.pointerId!==this.dragPointer) return;
        this.cancelPointer();
      }
      if (browserModifier(e) || (button!==0 && button!==2)) return;
      this.dragPointer = e.pointerId;
      this._press = button===0 ? { x:e.clientX, y:e.clientY } : null;
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    // Pointer events describe the whole mouse. Mouse button events also fire
    // when the primary button is pressed while the secondary one is held.
    canvas.addEventListener('mousedown', e => {
      // Middle-click autoscroll can keep tracking the mouse after release.
      if (e.button===1) {
        e.preventDefault();
        if(this.pointerLookEnabled && !browserModifier(e) && this.context()!=='menu')action('phone',e);
        return;
      }
      if (!this.pointerLookEnabled || browserModifier(e) || this.context()!=='walk') return;
      if (document.pointerLockElement===canvas && e.button===0){action(weaponControls()?'fire':'fight');return;}
      if (e.button===2) {this.mouseAim=true;this._press=null;}
      if (e.button===0 && this.mouseAim) {this._press=null;action(weaponControls()?'fire':'fight');}
    });
    window.addEventListener('mouseup', e => {if(e.button===2)this.mouseAim=false;});
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (e.button!==2 || browserModifier(e)) this.cancelPointer();
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.pointerLookEnabled || !this.dragging || e.pointerId!==this.dragPointer) return;
      // Browser UI can swallow the release. Read the actual button state
      // before treating a mouse movement as part of the drag.
      if (e.pointerType==='mouse' && typeof e.buttons==='number') {
        if (!(e.buttons&3)) { this.cancelPointer(); return; }
        if (!(e.buttons&2)) this.mouseAim=false;
      }
      this.lookDelta -= (e.clientX - this.pointerX) * .005;
      this.lookVertical += (e.clientY - this.pointerY) * .003;
      if (this._press && Math.hypot(e.clientX-this._press.x,e.clientY-this._press.y)>=7) this._press=null;
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    });
    canvas.addEventListener('pointerup', e => {
      if (!this.dragging || e.pointerId!==this.dragPointer) return;
      const press = this._press;
      this._press = null;
      this.dragPointer = null;
      this.mouseAim = false;
      // A click punches. A drag is the camera, and it should not swing.
      if (!this._pointerLookEnabled || !press || (e.button??0)!==0 || browserModifier(e)) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 7) {
        if(e.pointerType==='mouse' && this.context()!=='menu') canvas.requestPointerLock?.()?.catch?.(()=>{});
        this.action('fight');
      }
    });
    document.addEventListener('mousemove',e=>{
      if(document.pointerLockElement!==canvas || !this.pointerLookEnabled)return;
      if(this.keyWheel || this.padWheel){
        if(Math.abs(e.movementX)>2) action(e.movementX>0?'wheelPistol':'wheelUnarmed');
      }else{
        this.lookDelta-=(e.movementX||0)*.005;this.lookVertical+=(e.movementY||0)*.003;
      }
    });
    document.addEventListener('pointerlockchange',()=>{
      const captured=document.pointerLockElement===canvas;
      const releasedByUser=this.captured && !captured && !this.releasingLook;
      this.captured=captured;
      this.releasingLook=false;
      this.cancelPointer();
      if(releasedByUser && this.context()!=='menu')this.action('pause');
    });
    for (const event of ['pointercancel','lostpointercapture']) canvas.addEventListener(event, e => {
      if (e.pointerId===this.dragPointer) this.cancelPointer();
    });
    this.controlButtons = document.querySelectorAll('[data-control]');
    for (const button of this.controlButtons) {
      const name = button.dataset.control;
      button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); this.touch.add(name); button.classList.add('pressed'); });
      for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, () => { this.touch.delete(name); button.classList.remove('pressed'); });
    }
    const pad=document.getElementById?.('touch-brake');
    pad?.addEventListener('pointerdown',e=>{if(this.skating)this.finger={x:e.clientX,y:e.clientY,at:e.timeStamp};});
    pad?.addEventListener('pointerup',e=>{
      if(!this.finger)return;
      const dx=e.clientX-this.finger.x,dy=e.clientY-this.finger.y;
      const name=Math.abs(dx)>18 ? dx<0?'kickflip':'heelflip' : dy>20?'shove':'ollie';
      this.nextTrick={name,charge:Math.min(1,(e.timeStamp-this.finger.at)/380)};this.finger=null;
    });
    pad?.addEventListener('pointercancel',()=>{this.finger=null;});
  }
  get lookingBack() { return this.keys.has('KeyC') || this.padLookBack; }
  get focusing() { return Boolean(this.mouseAim || this.padAim); }
  get aiming() { return this.weaponControls() && Boolean(this.mouseAim || this.padAim || this.touch.has('aim')); }
  get dragging() { return this.dragPointer!==null; }
  get pointerLookEnabled() { return this._pointerLookEnabled; }
  set pointerLookEnabled(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this._pointerLookEnabled) return;
    this._pointerLookEnabled = enabled;
    if (!enabled) {
      // Map selection can take ownership mid-drag. Discard queued pointer
      // movement so returning to the street cannot rotate the camera later.
      this.cancelPointer();
    }
  }
  cancelPointer() {
    const pointer = this.dragPointer;
    this.dragPointer = null;
    this._press = null;
    this.mouseAim = false;
    this.lookDelta = 0;
    this.lookVertical = 0;
    if (pointer!==null && this.canvas.hasPointerCapture?.(pointer)) this.canvas.releasePointerCapture(pointer);
  }
  releaseLook() {
    if(document.pointerLockElement!==this.canvas || this.releasingLook)return;
    this.releasingLook=true;
    document.exitPointerLock?.();
  }
  startCabPress(car,event,source=event.fromPad?'pad':'keyboard') {
    if(this.cabPress)return;
    this.cabPress={car,id:car.id,source,context:this.context(),at:event.timeStamp,elapsed:0};
  }
  updateCabPress(down,dt,timeStamp) {
    const press=this.cabPress;
    if(!press)return;
    if(this.context()!==press.context || press.car.id!==press.id){this.cabPress=null;return;}
    press.elapsed+=dt;
    const held=Math.max(press.elapsed,Number.isFinite(timeStamp-press.at)?(timeStamp-press.at)/1000:0);
    if(down && held<CAB_TAKEOVER_HOLD)return;
    this.cabPress=null;
    this.action(held>=CAB_TAKEOVER_HOLD?'takeCab':'boardCab',{car:press.car});
  }
  clear() {
    this.cabPress=null;
    this.psControls.reset();this.cancelPointer();this.stealthPending=false;
    this.releaseLook();
    if (this.keyWheel || this.padWheel) this.action('weaponCancel');
    this.keyWheel=this.padWheel=false;this.viewPress=null;this.padLookBack=false;
    this.viewHold=null;
    this.stick={};this.nextTrick=null;this.spaceDown=null;this.spaceTrick=false;this.finger=null;this.skating=false;
    this.jogging=false;this.shiftDown=null;this.padPace=this.tapWindow=this.sprintWindow=0;this.padAim=false;
    this.keys.clear();this.touch.clear();
    for (const button of this.controlButtons) button.classList.remove('pressed');
  }
  sample(cameraYaw, dt, onFoot = true, skating = false) {
    if(this.context()==='menu')this.releaseLook();
    if(this.cabPress && this.cabPress.source!=='pad')this.updateCabPress(true,dt);
    if(!skating){this.stick={};this.nextTrick=null;this.spaceDown=null;this.finger=null;this.spaceTrick=false;}
    this.skating=skating;this.sampledMode=skating?'skate':onFoot?'walk':'drive';
    let manual=0, grab=0, load=0, pushFoot=1;
    const has = (...keys) => keys.some(key => this.keys.has(key));
    // Arrows belong to the phone and map. WASD controls walking and vehicles.
    let forward = Number(has('KeyW') || this.touch.has('forward')) - Number(has('KeyS') || this.touch.has('back'));
    let turn = Number(has('KeyD') || this.touch.has('right')) - Number(has('KeyA') || this.touch.has('left'));
    let walkForward = forward, padJog=false;
    let handbrake = has('Space') || this.touch.has('brake');
    let run = has('ShiftLeft','ShiftRight') || this.touch.has('run');
    const cycling=this.context()==='bike';
    let handbrake=(cycling?has('KeyQ','KeyS'):has('Space')) || this.touch.has('brake');
    let run=(cycling?has('CapsLock'):has('ShiftLeft','ShiftRight')) || this.touch.has('run');
    let climb=this.touch.has('climb'), descend=this.touch.has('descend');
    if(activity==='rotor'){climb ||= has('KeyW');descend ||= has('KeyS');}
    else if(activity==='plane'){climb ||= pitchInput>0;descend ||= pitchInput<0;}
    else {climb ||= has('Space');descend ||= run;}
    const pads=Array.from(navigator.getGamepads?.() || []).filter(Boolean);
    let pad=pads[0];
    if(pads.length>1){
      const active=p=>p.buttons.some(b=>b?.pressed || b?.value>.25) || p.axes.some(axis=>Math.abs(axis)>.22);
      const current=pads.find(p=>p.index===this.padIndex);
      pad=current && active(current) ? current : pads.find(active) || current || pads.find(dualSense) || pad;
    }
    this.padIndex=pad?.index;
    const ps5=this.controllerLayout==='ps5' || this.controllerLayout==='auto' && dualSense(pad);
    const device=pad ? [pad.index,pad.id,ps5].join('/') : null;
    if(device!==this.padDevice){
      if(this.cabPress?.source==='pad')this.cabPress=null;
      if(this.padWheel)this.action('weaponCancel');
      this.padWheel=false;this.padButtons=[];this.viewPress=null;this.psControls.reset();
      this.padPace=this.tapWindow=this.sprintWindow=0;this.padLookBack=false;
      this.padDevice=device;
    }
    this.ps5=ps5;this.padAim=false;this.padGrapple=false;
    let padLift=0;
    if (pad) {
      // Remap the usable stick range continuously. Returning the raw axis
      // after the deadzone used to jump straight from zero to 16% steering.
      const dead = n => Number.isFinite(n) ? Math.sign(n) * Math.max(0, Math.min(1, (Math.abs(n) - .16) / .84)) : 0;
      const trigger = button => Number.isFinite(button?.value) ? Math.max(0, Math.min(1, button.value)) : 0;
      turn = dead(pad.axes[0]) || turn;
      walkForward = -dead(pad.axes[1]) || walkForward;
      const accelerator = trigger(pad.buttons[7]), reverse = trigger(pad.buttons[6]);
      this.padAim=reverse>.25 || Boolean(pad.buttons[6]?.pressed);
      const mode=this.context(), driving=mode==='drive', walking=mode==='walk';
      const pressed=i=>Boolean(pad.buttons[i]?.pressed);
      const combat=walking && this.padAim && !this.weaponControls();
      forward = !walking && (accelerator || reverse) ? accelerator-reverse : walkForward;
      if(cycling){
        forward=pressed(0) ? 1 : Number(has('KeyW') || this.touch.has('forward'));
        handbrake ||= accelerator>.1 || reverse>.1;
      }
      if(skating){
        pushFoot=pad.buttons[2]?.pressed?-1:1;
        const pushing=pad.buttons[0]?.pressed || pad.buttons[2]?.pressed;
        if(pad.buttons[1]?.pressed)forward=-1;else if(pushing)forward=1;
        else forward=Number(has('KeyW')||this.touch.has('forward'))-Number(has('KeyS')||this.touch.has('back'));
        const flick=flickStick(this.stick,pad.axes[2]||0,pad.axes[3]||0,dt);
        if(flick.trick)this.nextTrick={name:flick.trick,charge:flick.charge};
        load=flick.loading?flick.charge:0;manual=flick.manual;
        grab=reverse>.22?-1:accelerator>.22?1:0;
      }else handbrake ||= driving ? pressed(5) : pressed(2);
      climb ||= Boolean(pad.buttons[2]?.pressed);
      descend ||= Boolean(pad.buttons[4]?.pressed);
      const pace = (cycling || walking && !combat) && pressed(0);
      if(cycling || this.tapSprint && onFoot){
        this.tapWindow=Math.max(0,(this.tapWindow||0)-dt);
        this.sprintWindow=Math.max(0,(this.sprintWindow||0)-dt);
        if(pace && !this.padPace){
          if(this.tapWindow>0)this.sprintWindow=.55;
          this.tapWindow=.55;
        }
        padJog=pace || this.sprintWindow>0;
        run ||= this.sprintWindow>0;
      } else {
        if(!pace && this.padPace>0 && this.padPace<.22)this.jogging=!this.jogging;
        run ||= pace;
      }
      this.padPace=pace ? (this.padPace||0)+dt : 0;
      if(!skating){this.lookDelta-=dead(pad.axes[2])*dt*2;this.lookVertical+=dead(pad.axes[3])*dt;}
      // Keep the wheel's selection independent of the D-pad's world and menu actions.
      const bindings={
        0:combat?'heavy':null,1:walking ? (this.weaponControls()?'reload':'lightOrReload') : null,
        3:skating?'skate':'vehicle',4:walking?'weaponOpen':null,5:walking?'cover':null,
        7:walking?(this.weaponControls()?'fire':'fight'):null,9:'pause',
        10:driving?'horn':walking?'stealth':null,12:'phone',13:'status',15:driving?'lights':'interact',
      };
      this.padLookBack=pressed(11);
      for(let i=0;i<16;i++){
        const down=i===7 ? accelerator>.25 || pressed(i) : pressed(i);
        if(down && !this.padButtons[i]){
          if((i===14 || i===15) && this.padWheel)this.action('wheelCycle');
          else if(!this.phoneButton(i)){
            if(i===8)this.viewPress=0;
            else if(i===4 && walking)this.padWheel=this.action('weaponOpen')!==false;
            else if(bindings[i])this.action(bindings[i],{fromPad:true});
          }
        }
        if(i===8 && this.viewPress!=null){
          if(!down){this.viewPress=null;this.action('nextCamera');}
          else if((this.viewPress+=dt)>=.38){this.viewPress=null;this.action('interactionMenu');}
        }
        if(!down && i===4 && this.padWheel){this.padWheel=false;this.action('weaponClose');}
        this.padButtons[i]=down;
      }
      if(this.cabPress?.source==='pad')this.updateCabPress(pressed(3),dt);
      if(this.padWheel && Math.abs(pad.axes[2]||0)>.45)this.action(pad.axes[2]>0?'wheelPistol':'wheelUnarmed');
    } else {if(this.padWheel)this.action('weaponCancel');this.padWheel=false;this.viewPress=null;this.padLookBack=false;this.padButtons=[];this.stick={};this.padPace=this.tapWindow=this.sprintWindow=0;}
    if (!cycling && (!onFoot || Math.hypot(walkForward, turn) < .01)) {this.jogging=false;this.tapWindow=this.sprintWindow=0;}
    const pop=this.nextTrick;this.nextTrick=null;
    if(skating){
      if(this.spaceDown!=null||this.finger)load=Math.min(1,(performance.now()-(this.spaceDown??this.finger.at))/380);
      manual=manual||(run?1:0);grab=grab||(has('KeyJ')?-1:has('KeyL')?1:0);handbrake=false;
    }
    return {
      skateTrick:pop?.name,charge:pop?.charge??load,load,manual,grab,pushFoot,
      jog: Boolean(this.jogging || padJog), forward, turn, lift: Number(climb) - Number(descend), brake: false, handbrake, run,
      // The chase camera looks toward +Z at yaw zero. Its screen-right basis
      // is forward cross up = (-cos(yaw), 0, sin(yaw)), not world +X.
      moveX: Math.sin(cameraYaw) * walkForward - Math.cos(cameraYaw) * turn,
      moveZ: Math.cos(cameraYaw) * walkForward + Math.sin(cameraYaw) * turn,
    };
  }
}
