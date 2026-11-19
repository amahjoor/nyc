import { flickStick } from './skate-tricks.js';
/** Input is sampled each physics frame; one-shot actions run on key-down edges. */
export class Input {
  constructor(canvas, action, handleInterfaceKey = () => false, weaponControls = () => false, phoneButton = () => false) {
    this.keys = new Set();
    this.touch = new Set();
    this.tapSprint=false;
    this.stick={};this.skateKeys={Digit1:"kickflip",Digit2:"heelflip",Digit3:"shove",Digit4:"nollie",Digit5:"frontShove"};
    this.lookDelta = 0;
    this.lookVertical = 0;
    this.dragging = false;
    this._pointerLookEnabled = true;
    this.padButtons = [];
    this.action = action;
    this.weaponControls = weaponControls;
    this.phoneButton = phoneButton;
    const actions = {KeyE:'interact',KeyK:'skate',KeyN:'job',KeyZ:'cash',KeyR:'reloadOrRecover',KeyC:'camera',KeyB:'perspective',KeyV:'view',KeyM:'map',ArrowUp:'phone',KeyF:'fight',KeyQ:'kick',KeyX:'draw',KeyG:'shop',KeyI:'inventory',KeyH:'horn',KeyT:'time',Escape:'pause'};
    window.addEventListener('keydown', e => {
      const interfaceHandled = handleInterfaceKey(e);
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space' && e.target.tagName === 'BUTTON' && !interfaceHandled) return;
      if (e.code === 'ArrowUp' || e.code === 'Space') e.preventDefault();
      // Sample held movement even while the phone owns shortcuts and app navigation.
      if (!e.repeat && e.code.startsWith('Shift') && this.shiftDown == null) this.shiftDown = e.timeStamp;
      this.keys.add(e.code);
      if(this.skating && !interfaceHandled && !e.repeat){
        if(e.code==='Space')this.spaceDown=e.timeStamp;
        if(this.skateKeys[e.code] && this.spaceDown!=null)this.spaceTrick=true;
        if(this.skateKeys[e.code])this.nextTrick={name:this.skateKeys[e.code],charge:this.spaceDown==null ? .32 : Math.min(1,(e.timeStamp-this.spaceDown)/380)};
      }
      if (!interfaceHandled && !e.repeat && actions[e.code]) action(actions[e.code], e);
    });
    window.addEventListener('keyup', e => {
      this.keys.delete(e.code);
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
    canvas.addEventListener('pointerdown', e => {
      if (!this.pointerLookEnabled) return;
      this.dragging = true;
      this._press = (e.button??0)===0 ? { id:e.pointerId, x:e.clientX, y:e.clientY } : null;
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    // Pointer events describe the whole mouse. Mouse button events also fire
    // when the primary button is pressed while the secondary one is held.
    canvas.addEventListener('mousedown', e => {
      if (!this.pointerLookEnabled || !weaponControls()) return;
      if (e.button===2) {this.mouseAim=true;this._press=null;}
      if (e.button===0 && this.mouseAim) {this._press=null;action('fire');}
    });
    window.addEventListener('mouseup', e => {if(e.button===2)this.mouseAim=false;});
    canvas.addEventListener('contextmenu', e => {if(this.pointerLookEnabled && weaponControls())e.preventDefault();});
    canvas.addEventListener('pointermove', e => {
      if (!this.pointerLookEnabled || !this.dragging) return;
      this.lookDelta -= (e.clientX - this.pointerX) * .005;
      this.lookVertical += (e.clientY - this.pointerY) * .003;
      if (this._press && Math.hypot(e.clientX-this._press.x,e.clientY-this._press.y)>=7) this._press=null;
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    });
    canvas.addEventListener('pointerup', e => {
      const press = this._press;
      this._press = null;
      this.dragging = false;
      // A click punches. A drag is the camera, and it should not swing.
      if (!this._pointerLookEnabled || !press || e.pointerId !== press.id) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 7) this.action('fight');
    });
    for (const event of ['pointercancel','lostpointercapture']) canvas.addEventListener(event, () => { this.dragging = false; this._press = null; this.mouseAim=false; });
    for (const button of document.querySelectorAll('[data-control]')) {
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
  get aiming() { return this.weaponControls() && Boolean(this.mouseAim || this.padAim || this.touch.has('aim')); }
  get pointerLookEnabled() { return this._pointerLookEnabled; }
  set pointerLookEnabled(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this._pointerLookEnabled) return;
    this._pointerLookEnabled = enabled;
    if (!enabled) {
      // Map selection can take ownership mid-drag. Discard queued pointer
      // movement so returning to the street cannot rotate the camera later.
      this.dragging = false;
      this.mouseAim = false;
      this._press = null;
      this.lookDelta = 0;
      this.lookVertical = 0;
    }
  }
  clear() { this.stick={};this.nextTrick=null;this.spaceDown=null;this.spaceTrick=false;this.finger=null;this.skating=false; this.jogging=false; this.shiftDown=null; this.padPace=this.tapWindow=this.sprintWindow=0; this.keys.clear(); this.touch.clear(); this.dragging = false; this._press = null; this.mouseAim=false;this.padAim=false; }
  sample(cameraYaw, dt, onFoot = true, skating = false) {
    if(!skating){this.stick={};this.nextTrick=null;this.spaceDown=null;this.finger=null;this.spaceTrick=false;}
    this.skating=skating;
    let manual=0, grab=0, load=0, pushFoot=1;
    const has = (...keys) => keys.some(key => this.keys.has(key));
    // Arrows belong to the phone and map. WASD controls walking and vehicles.
    let forward = Number(has('KeyW') || this.touch.has('forward')) - Number(has('KeyS') || this.touch.has('back'));
    let turn = Number(has('KeyD') || this.touch.has('right')) - Number(has('KeyA') || this.touch.has('left'));
    let walkForward = forward, padJog=false;
    let handbrake = has('Space') || this.touch.has('brake');
    let run = has('ShiftLeft','ShiftRight') || this.touch.has('run');
    let climb = has('Space') || this.touch.has('climb'), descend = run || this.touch.has('descend');
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    this.padAim=false;
    if (pad) {
      // Remap the usable stick range continuously. Returning the raw axis
      // after the deadzone used to jump straight from zero to 16% steering.
      const dead = n => Number.isFinite(n) ? Math.sign(n) * Math.max(0, Math.min(1, (Math.abs(n) - .16) / .84)) : 0;
      const trigger = button => Number.isFinite(button?.value) ? Math.max(0, Math.min(1, button.value)) : 0;
      turn = dead(pad.axes[0]) || turn;
      walkForward = -dead(pad.axes[1]) || walkForward;
      const accelerator = trigger(pad.buttons[7]), reverse = trigger(pad.buttons[6]);
      this.padAim=reverse>.25 || Boolean(pad.buttons[6]?.pressed);
      for (const [index,name,pressed] of [[7,'fire',accelerator>.25 || Boolean(pad.buttons[7]?.pressed)],[12,'reload',Boolean(pad.buttons[12]?.pressed)]]) {
        if (pressed && !this.padButtons[index] && !this.phoneButton(index) && this.weaponControls()) this.action(name);
        this.padButtons[index]=pressed;
      }
      // Equal trigger pressure means neutral; it must not fall through to
      // accidental left-stick acceleration while the player is steering.
      forward = !this.weaponControls() && (accelerator || reverse) ? accelerator - reverse : walkForward;
      if(skating){
        pushFoot=pad.buttons[2]?.pressed?-1:1;
        const pushing=pad.buttons[0]?.pressed || pad.buttons[2]?.pressed;
        if(pad.buttons[1]?.pressed)forward=-1;else if(pushing)forward=1;
        else forward=Number(has('KeyW')||this.touch.has('forward'))-Number(has('KeyS')||this.touch.has('back'));
        const flick=flickStick(this.stick,pad.axes[2]||0,pad.axes[3]||0,dt);
        if(flick.trick)this.nextTrick={name:flick.trick,charge:flick.charge};
        load=flick.loading?flick.charge:0;manual=flick.manual;
        grab=reverse>.22?-1:accelerator>.22?1:0;
      }else handbrake ||= Boolean(pad.buttons[2]?.pressed);
      climb ||= Boolean(pad.buttons[2]?.pressed);
      descend ||= Boolean(pad.buttons[4]?.pressed);
      const pace = Boolean(pad.buttons[10]?.pressed);
      if(this.tapSprint && onFoot){
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
      // Right bumper also exits the initial city overview, so a controller
      // can reach walking/driving without needing a keyboard camera shortcut.
      for (const [index, name] of [[4,'skate'],[0,'interact'],[1,'fight'],[15,'kick'],[14,'draw'],[3,'job'],[5,'view'],[9,'pause'],[8,'map'],[11,'perspective'],[13,'cash']]) {
        const pressed = Boolean(pad.buttons[index]?.pressed);
        if (pressed && !this.padButtons[index] && !this.phoneButton(index)){
          if(skating && index===3)this.action('skate');
          else if(!skating || ![0,1].includes(index))this.action(name);
        }
        this.padButtons[index] = pressed;
      }
    } else {this.padButtons=[];this.stick={};this.padPace=this.tapWindow=this.sprintWindow=0;}
    if (!onFoot || Math.hypot(walkForward, turn) < .01) {this.jogging=false;this.tapWindow=this.sprintWindow=0;}
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
