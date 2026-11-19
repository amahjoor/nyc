import { formatMoney } from './money.js';

/** In-world choices at a counter, boarding point or in conversation. */
export function createInteraction({ $, onOpenChange }) {
  const panel = $('interaction'), options = $('interaction-options'), leave = $('interaction-close');
  let session = null, controls = [], selected = 0;

  function close() {
    if (!session) return;
    session.onClose?.();
    session = null;
    controls = [];
    panel.hidden = true;
    options.replaceChildren();
    onOpenChange(false);
  }

  function update() {
    if (session && !session.available()) close();
  }

  function focus(index) {
    selected = (index + controls.length) % controls.length;
    controls[selected].focus();
  }

  function openList(title, rows, onPick, { message = '', cash, available = () => true, index = 0, onClose, onRotate, onFocus } = {}) {
    if (!available()) { close(); return; }
    const opening = !session;
    session?.onClose?.();
    const current = { available, onClose, onRotate };
    session = current;
    $('interaction-title').textContent = title;
    $('interaction-message').textContent = message;
    $('interaction-message').hidden = !message;
    $('interaction-balance').hidden = cash == null;
    $('interaction-balance').textContent = cash == null ? '' : formatMoney(cash);

    const buttons = rows.map((row, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = Boolean(row.disabled);
      const label = document.createElement('strong');
      label.textContent = row.name;
      button.append(label);
      if(row.product){
        const pack=document.createElement('i');pack.className='package-thumb';pack.setAttribute('aria-hidden','true');
        const tile=row.product.tile;
        if(['apple','orange'].includes(row.product.shape)){pack.style.backgroundImage='none';pack.textContent=row.product.shape==='apple'?'🍎':'🍊';}
        else pack.style.backgroundPosition=(tile%3*49.24)+'% '+(Math.floor(tile/3)*50)+'%';
        label.prepend(pack);
      }
      if (row.color) {
        const swatch = document.createElement('i');
        swatch.className = 'interaction-swatch';
        swatch.style.backgroundColor = row.color;
        label.prepend(swatch);
      }
      if (row.note) {
        const note = document.createElement('span');
        note.textContent = row.note;
        button.append(note);
      }
      button.addEventListener('focus', () => { selected = controls.indexOf(button); onFocus?.(row); });
      if(onFocus)button.addEventListener('pointerenter',()=>{if(session===current)onFocus(row);});
      button.addEventListener('click', () => {
        if (session !== current || button.disabled) return;
        const valid = available();
        close();
        if (valid) onPick(row, i);
      });
      return button;
    });
    options.replaceChildren(...buttons);
    const refresh = () => { controls = [...buttons.filter(button => !button.disabled), leave]; };
    refresh();
    panel.hidden = false;
    if (opening) onOpenChange(true);
    focus(Math.max(0, controls.indexOf(buttons[index])));
    const initialFocus=document.activeElement;
    return { enable(i) {
      if (session !== current) return;
      const focusDefault=index===i && document.activeElement===initialFocus;
      buttons[i].disabled = false; refresh();
      if(focusDefault){focus(controls.indexOf(buttons[i]));return;}
      selected = Math.max(0, controls.indexOf(document.activeElement));
    } };
  }

  leave.addEventListener('focus', () => { selected = controls.indexOf(leave); });
  leave.addEventListener('click', close);

  function handleKey(event) {
    if (!session) return false;
    const key = event.key || event.code;
    if (session.onRotate && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      event.preventDefault(); session.onRotate(key === 'ArrowLeft' ? -.22 : .22); return true;
    }
    if (['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Backspace', 'Escape'].includes(key)) {
      event.preventDefault();
      if (key === 'ArrowUp' || (key === 'Tab' && event.shiftKey)) focus(selected - 1);
      else if (key === 'ArrowDown' || key === 'Tab') focus(selected + 1);
      else if (!event.repeat) {
        if (key === 'Enter') controls[selected].click();
        else close();
      }
    }
    return true;
  }
  return { get open() { return Boolean(session); }, openList, close, update, handleKey, focus:()=>{if(session)focus(selected);} };
}
