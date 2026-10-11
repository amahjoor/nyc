/** Input is sampled each physics frame; one-shot actions run on key-down edges. */
export class Input {
  constructor(canvas, action) {
    this.keys = new Set();
    this.touch = new Set();
    this.lookDelta = 0;
    this.lookVertical = 0;
    this.dragging = false;
    this.padButtons = [];
    this.action = action;
    const actions = {KeyE:'interact',KeyN:'job',KeyR:'recover',KeyC:'camera',KeyV:'view',KeyM:'map',KeyH:'horn',Escape:'pause'};
    window.addEventListener('keydown', e => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat && actions[e.code]) action(actions[e.code]);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('pointerdown', e => {
      this.dragging = true;
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      this.lookDelta -= (e.clientX - this.pointerX) * .005;
      this.lookVertical += (e.clientY - this.pointerY) * .003;
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event, () => this.dragging = false);
    for (const button of document.querySelectorAll('[data-control]')) {
      const name = button.dataset.control;
      button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); this.touch.add(name); button.classList.add('pressed'); });
      for (const event of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(event, () => { this.touch.delete(name); button.classList.remove('pressed'); });
    }
  }
  clear() { this.keys.clear(); this.touch.clear(); this.dragging = false; }
  sample(cameraYaw, dt) {
    const has = (...keys) => keys.some(key => this.keys.has(key));
    let forward = Number(has('KeyW','ArrowUp') || this.touch.has('forward')) - Number(has('KeyS','ArrowDown') || this.touch.has('back'));
    let turn = Number(has('KeyD','ArrowRight') || this.touch.has('right')) - Number(has('KeyA','ArrowLeft') || this.touch.has('left'));
    let walkForward = forward;
    let brake = has('Space') || this.touch.has('brake');
    let run = has('ShiftLeft','ShiftRight');
    const pad = Array.from(navigator.getGamepads?.() || []).find(Boolean);
    if (pad) {
      const dead = n => Math.abs(n || 0) > .16 ? n : 0;
      turn = dead(pad.axes[0]) || turn;
      walkForward = -dead(pad.axes[1]) || walkForward;
      forward = (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0) || walkForward;
      brake ||= Boolean(pad.buttons[2]?.pressed);
      run ||= Boolean(pad.buttons[10]?.pressed);
      this.lookDelta -= dead(pad.axes[2]) * dt * 2;
      this.lookVertical += dead(pad.axes[3]) * dt;
      for (const [index, name] of [[0,'interact'],[3,'job'],[9,'pause'],[8,'map']]) {
        const pressed = Boolean(pad.buttons[index]?.pressed);
        if (pressed && !this.padButtons[index]) this.action(name);
        this.padButtons[index] = pressed;
      }
    } else this.padButtons = [];
    return {
      forward, turn, brake, run,
      moveX: Math.sin(cameraYaw) * walkForward + Math.cos(cameraYaw) * turn,
      moveZ: Math.cos(cameraYaw) * walkForward - Math.sin(cameraYaw) * turn,
    };
  }
}
