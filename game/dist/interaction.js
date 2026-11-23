import { drawKitchen } from './kitchen-counter.js';
import { heatLine } from './kitchen-shift.js';
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
    $('kitchen-worktop').hidden=true;
    $('work-slip').hidden=true;
    options.replaceChildren();
    onOpenChange(false);
  }

  function update(dt=0) {
    if (session && !session.available()) close();
    const kitchen=session?.kitchen;
    if(!kitchen)return;
    kitchen.advance(dt);
    drawKitchen($('kitchen-surface'),kitchen);
    const {state:k,ticket:t}=kitchen, menu=t.menu;
    const status=(done,active,clock,goal)=>done?'On tray':active?heatLine(clock,goal):'Prep';
    const statuses=[];
    if(t.wantsMain)statuses.push(menu.station+' · '+status(k.main===5,k.main===2 || k.main===3,k.heat,3));
    if(t.wantsSide)statuses.push(menu.sideStation+' · '+status(k.side===2,k.side===1,k.fry,4));
    if(t.wantsDrink)statuses.push('Fountain · '+status(k.drink===2,k.drink===1,k.fill,2));
    const line=statuses.join('  /  ');
    if($('kitchen-status').textContent!==line)$('kitchen-status').textContent=line;
  }

  const surface=$('kitchen-surface');
  let touch=null;
  function surfacePoint(event){
    const rect=surface.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*640/rect.width,y:(event.clientY-rect.top)*350/rect.height};
  }
  surface.addEventListener('pointerdown',event=>{
    if(!session?.kitchen || event.button!==0)return;
    const at=surfacePoint(event);
    touch={...at,session,id:event.pointerId,carrying:session.kitchen.ready && at.y>=180 && at.y<=278 && at.x>166};
    surface.setPointerCapture?.(event.pointerId);
  });
  surface.addEventListener('pointermove',event=>{
    if(!touch?.carrying || touch.id!==event.pointerId || touch.session!==session)return;
    session.kitchen.slide=Math.max(-235,Math.min(0,surfacePoint(event).x-touch.x));
  });
  surface.addEventListener('pointercancel',()=>{
    if(session?.kitchen)session.kitchen.slide=0;
    touch=null;
  });
  surface.addEventListener('pointerup',event=>{
    const start=touch;touch=null;
    if(!start || start.id!==event.pointerId || start.session!==session || !session.available())return;
    const k=session.kitchen,{x,y}=surfacePoint(event);k.slide=0;
    if(y>=289 && start.y>=289){
      const i=Math.floor((x-15)/(610/k.actions.length));
      k.actions[i]?.choose();return;
    }
    if(y>=178 && y<=279){
      if(k.ready && x<166){k.serve();return;}
      k.select('tray');return;
    }
    if(y>168 || y<12)return;
    const bays=k.ticket.drink<0?2:3,i=Math.floor((x-14)/(600/bays));
    if(i<0 || i>=bays)return;
    if(![k.ticket.wantsMain,k.ticket.wantsSide,k.ticket.wantsDrink][i])return;
    const id=['main','side','drink'][i];
    if(k.station===id && k.actions.length===1)k.actions[0].choose();
    else k.select(id);
  });

  const paper=$('work-slip');
  let drag=null;
  const placeSlip=(event,done=false)=>{
    if(!drag || drag.id!==event.pointerId)return;
    if(session===drag.session){
      paper.style.transform=done?'':`translate(${event.clientX-drag.x}px,${event.clientY-drag.y}px) rotate(-2deg)`;
      if(done){
        const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('button');
        if(target?.dataset.drop==='true' && options.contains(target))target.click();
      }
    }
    if(done){paper.classList.remove('moving');drag=null;}
  };
  paper.addEventListener('pointerdown',event=>{
    if(event.button!==0 || !session?.slip?.sorting)return;
    drag={id:event.pointerId,session,x:event.clientX,y:event.clientY};
    paper.setPointerCapture(event.pointerId);paper.classList.add('moving');
  });
  paper.addEventListener('pointermove',event=>placeSlip(event));
  paper.addEventListener('pointerup',event=>placeSlip(event,true));
  paper.addEventListener('pointercancel',()=>{paper.style.transform='';paper.classList.remove('moving');drag=null;});

  function focus(index) {
    selected = (index + controls.length) % controls.length;
    controls[selected].focus();
  }

  function openList(title, rows, onPick, { message = '', cash, available = () => true, index = 0, onClose, onRotate, onFocus, kitchen, slip } = {}) {
    if (!available()) { close(); return; }
    const opening = !session;
    session?.onClose?.();
    const current = { available, onClose, onRotate, kitchen, slip };
    paper.hidden=!slip;paper.style.transform='';paper.classList.remove('moving');
    if(slip){
      $('work-slip-from').textContent=slip.from;$('work-slip-item').textContent=slip.item;
      $('work-slip-result').textContent=slip.result;paper.dataset.sorting=String(slip.sorting);
    }
    $('kitchen-worktop').hidden=!kitchen;
    session = current;
    $('interaction-title').textContent = title;
    $('interaction-message').textContent = message;
    $('interaction-message').hidden = !message;
    $('interaction-balance').hidden = cash == null;
    $('interaction-balance').textContent = cash == null ? '' : formatMoney(cash);

    const buttons = rows.map((row, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      if(slip?.sorting && i<rows.length-1)button.dataset.drop='true';
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
    if(kitchen)update();
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
