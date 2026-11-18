/** Input is sampled each physics frame; one-shot actions run on key-down edges. */
export class Input {
  constructor(canvas, action, handleInterfaceKey = () => false) {
    this.keys = new Set();
    this.touch = new Set();
    this.lookDelta = 0;
    this.lookVertical = 0;
    this.dragging = false;
    this._pointerLookEnabled = true;
    this.padButtons = [];
    this.action = action;
    const actions = {KeyE:'interact',KeyN:'job',KeyZ:'cash',KeyR:'recover',KeyC:'camera',KeyB:'perspective',KeyV:'view',KeyM:'map',ArrowUp:'phone',KeyF:'fight',KeyG:'shop',KeyH:'horn',KeyT:'time',Escape:'pause'};
    window.addEventListener('keydown', e => {
      const interfaceHandled = handleInterfaceKey(e);
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.code === 'Space' && e.target.tagName === 'BUTTON' && !interfaceHandled) return;
      if (e.code === 'ArrowUp' || e.code === 'Space') e.preventDefault();
      // Sample held movement even while the phone owns shortcuts and app navigation.
      this.keys.add(e.code);
      if (!interfaceHandled && !e.repeat && actions[e.code]) action(actions[e.code], e);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('pointerdown', e => {
      if (!this.pointerLookEnabled) return;
      this.dragging = true;
      this._press = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.pointerLookEnabled || !this.dragging) return;
      this.lookDelta -= (e.clientX - this.pointerX) * .005;
      this.lookVertical += (e.clientY - this.pointerY) * .003;
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
    for (const event of ['pointercancel','lostpointercapture']) canvas.addEventListener(event, () => { this.dragging = false; this._press = null; });
    for (const button of document.querySelectorAll('[data-control]')) {
      const name = button.dataset.control;
      button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); this.touch.add(name); button.classList.add('pressed'); });
      for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, () => { this.touch.delete(name); button.classList.remove('pressed'); });
    }
  }
  get pointerLookEnabled() { return this._pointerLookEnabled; }
  set pointerLookEnabled(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this._pointerLookEnabled) return;
    this._pointerLookEnabled = enabled;
    if (!enabled) {
      // Map selection can take ownership mid-drag. Discard queued pointer
      // movement so returning to the street cannot rotate the camera later.
      this.dragging = false;
      this._press = null;
      this.lookDelta = 0;
      this.lookVertical = 0;
    }
  }
  clear() { this.keys.clear(); this.touch.clear(); this.dragging = false; this._press = null; }
  sample(cameraYaw, dt) {
    const has = (...keys) => keys.some(key => this.keys.has(key));
    // Arrows belong to the phone and map. WASD controls walking and vehicles.
    let forward = Number(has('KeyW') || this.touch.has('forward')) - Number(has('KeyS') || this.touch.has('back'));
    let turn = Number(has('KeyD') || this.touch.has('right')) - Number(has('KeyA') || this.touch.has('left'));
    let walkForward = forward;
    let handbrake = has('Space') || this.touch.has('brake');
    let run = has('ShiftLeft','ShiftRight');
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    if (pad) {
      // Remap the usable stick range continuously. Returning the raw axis
      // after the deadzone used to jump straight from zero to 16% steering.
      const dead = n => Number.isFinite(n) ? Math.sign(n) * Math.max(0, Math.min(1, (Math.abs(n) - .16) / .84)) : 0;
      const trigger = button => Number.isFinite(button?.value) ? Math.max(0, Math.min(1, button.value)) : 0;
      turn = dead(pad.axes[0]) || turn;
      walkForward = -dead(pad.axes[1]) || walkForward;
      const accelerator = trigger(pad.buttons[7]), reverse = trigger(pad.buttons[6]);
      // Equal trigger pressure means neutral; it must not fall through to
      // accidental left-stick acceleration while the player is steering.
      forward = accelerator || reverse ? accelerator - reverse : walkForward;
      handbrake ||= Boolean(pad.buttons[2]?.pressed);
      run ||= Boolean(pad.buttons[10]?.pressed);
      this.lookDelta -= dead(pad.axes[2]) * dt * 2;
      this.lookVertical += dead(pad.axes[3]) * dt;
      // Right bumper also exits the initial city overview, so a controller
      // can reach walking/driving without needing a keyboard camera shortcut.
      for (const [index, name] of [[0,'interact'],[1,'fight'],[3,'job'],[5,'view'],[9,'pause'],[8,'map'],[11,'perspective'],[13,'cash']]) {
        const pressed = Boolean(pad.buttons[index]?.pressed);
        if (pressed && !this.padButtons[index]) this.action(name);
        this.padButtons[index] = pressed;
      }
    } else this.padButtons = [];
    return {
      forward, turn, brake: false, handbrake, run,
      // The chase camera looks toward +Z at yaw zero. Its screen-right basis
      // is forward cross up = (-cos(yaw), 0, sin(yaw)), not world +X.
      moveX: Math.sin(cameraYaw) * walkForward - Math.cos(cameraYaw) * turn,
      moveZ: Math.cos(cameraYaw) * walkForward + Math.sin(cameraYaw) * turn,
    };
  }
}
