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
    $('street-talk').hidden=true;
    $('street-history').replaceChildren();$('street-choices').replaceChildren();
    $('street-compose').onsubmit=null;
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
    $('street-talk').hidden=true;
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
      if(row.product || row.icon){
        const thumb=document.createElement('i');
        thumb.setAttribute('aria-hidden','true');
        const glyph=row.icon || ({apple:'🍎',orange:'🍊'}[row.product?.shape]);
        thumb.className=`item-thumb ${glyph?'item-glyph':'package-thumb'}${row.empty?' empty-item':''}`;
        if(glyph)thumb.textContent=glyph;
        else{
          const {tile}=row.product;
          thumb.style.backgroundPosition=(tile%3*49.24)+'% '+(Math.floor(tile/3)*50)+'%';
        }
        label.prepend(thumb);
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

  function openTalk(name,available,onClose) {
    if (!openList(name,[],()=>{}, {available,onClose})) return;
    const current=session, talk=$('street-talk'), field=$('street-line'), sendButton=$('street-send');
    const choices=$('street-choices'), history=$('street-history'), status=$('street-reply-status');
    talk.hidden=false;
    current.chat=true;
    field.value='';
    let submit;
    function send() {
      const text=field.value.trim();
      if(!text || current.busy || session!==current || !available()) return;
      field.value='';
      submit(text);
    }
    $('street-compose').onsubmit=e=>{e.preventDefault();send();};
    current.send=send;
    let partialLine=null;
    return {close,partial(text) {
      if(session!==current) return;
      if(!partialLine){
        partialLine=document.createElement('div');partialLine.className='street-npc';
        const label=document.createElement('strong');label.textContent=name;
        partialLine.append(label,document.createElement('span'));history.append(partialLine);
      }
      partialLine.lastElementChild.textContent=text;
      status.textContent='';history.scrollTop=history.scrollHeight;
    },render(rows,options,pending,onSend) {
      partialLine=null;
      if (session!==current) return;
      submit=onSend;
      const hadFocus=field===document.activeElement || choices.contains(document.activeElement) ||
        sendButton===document.activeElement;
      history.replaceChildren(...rows.map(row=>{
        const line=document.createElement('div'), speaker=document.createElement('strong');
        line.className=row.who==='me'?'street-player':'street-npc';
        speaker.textContent=row.who==='me'?'You':name;
        const words=document.createElement('span');words.textContent=row.text;
        line.append(speaker,words);return line;
      }));
      history.scrollTop=history.scrollHeight;
      status.textContent=pending?name+' is thinking…':'';
      current.busy=pending; sendButton.disabled=pending;
      const buttons=options.map(option=>{
        const button=document.createElement('button');
        button.type='button';button.textContent=option.name;
        button.onclick=()=>{if(session===current && available())option.choose();};
        return button;
      });
      choices.replaceChildren(...buttons);
      controls=[...buttons,field,...(pending?[]:[sendButton]),leave];
      for (const control of controls) control.onfocus=()=>{selected=controls.indexOf(control);};
      if(hadFocus || document.activeElement===leave) {
        if(field===document.activeElement || !buttons.length) focus(controls.indexOf(field));
        else focus(0);
      }
    }};
  }

  leave.addEventListener('focus', () => { selected = controls.indexOf(leave); });
  leave.addEventListener('click', close);

  function handleKey(event) {
    if (!session) return false;
    const key = event.key || event.code;
    if (session.chat && document.activeElement===$('street-line')) {
      if (event.isComposing) return true;
      if (key==='Enter') { event.preventDefault();if(!event.repeat && !session.busy)session.send();return true; }
      if (!['ArrowUp','ArrowDown','Tab','Escape'].includes(key)) return true;
    }
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
  return { get open() { return Boolean(session); }, openList, openTalk, close, update, handleKey, focus:()=>{if(session)focus(selected);} };
}
