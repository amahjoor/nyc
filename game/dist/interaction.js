import { formatMoney } from './money.js';

/** In-world choices at a counter, boarding point or in conversation. */
export function createInteraction({ $, onOpenChange }) {
  const panel = $('interaction'), options = $('interaction-options'), leave = $('interaction-close');
  let session = null, controls = [], selected = 0;

  function close() {
    if (!session) return;
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

  function openList(title, rows, onPick, { message = '', cash, available = () => true, index = 0 } = {}) {
    if (!available()) { close(); return; }
    const opening = !session;
    const current = { available };
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
      button.addEventListener('focus', () => { selected = controls.indexOf(button); });
      button.addEventListener('click', () => {
        if (session !== current || button.disabled) return;
        const valid = available();
        close();
        if (valid) onPick(row, i);
      });
      return button;
    });
    options.replaceChildren(...buttons);
    controls = [...buttons.filter(button => !button.disabled), leave];
    panel.hidden = false;
    if (opening) onOpenChange(true);
    focus(Math.max(0, controls.indexOf(buttons[index])));
  }

  leave.addEventListener('focus', () => { selected = controls.indexOf(leave); });
  leave.addEventListener('click', close);

  function handleKey(event) {
    if (!session) return false;
    const key = event.key || event.code;
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
  return { get open() { return Boolean(session); }, openList, close, update, handleKey };
}
