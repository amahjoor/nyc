import { roomPoint } from './room.js';
import { formatMoney } from './money.js';

// Screen dimensions in the fixture's own frame, shared with its painted face.
export function atmGlass(shape, w, d, h) {
  return shape === 'branchATM'
    ? {width:w*.65, height:.35, bottom:1.09, depth:d/2-.05}
    : {width:w*.65, height:.28, bottom:h-.545, depth:d*.23+.009};
}

function glassInRoom(room, machine) {
  const [a,b] = machine.face;
  const glass = atmGlass(machine.shape,b ? machine.w : machine.d,b ? machine.d : machine.w,machine.h);
  const [x,z] = roomPoint(room,machine.a+a*glass.depth,machine.b+b*glass.depth);
  const [edgeX,edgeZ] = roomPoint(room,machine.a+a*glass.depth+b,machine.b+b*glass.depth-a);
  const across = Math.hypot(edgeX-x,edgeZ-z);
  // On a skewed storefront the prop's width and depth axes may not be perpendicular.
  let nx=(edgeZ-z)/across, nz=(x-edgeX)/across;
  const [frontX,frontZ]=roomPoint(room,machine.a+a*(glass.depth+1),machine.b+b*(glass.depth+1));
  if(nx*(frontX-x)+nz*(frontZ-z)<0){nx=-nx;nz=-nz;}
  return {x,z,y:room.floor+(machine.y||0)+glass.bottom+glass.height/2,nx,nz,width:glass.width*across,height:glass.height};
}

export function createATM({$, balances, transfer, available, onChange}) {
  const root=$('atm-screen'), amount=$('atm-amount');
  let machine=null, glass=null, page='home', direction='deposit';
  const control=id=>$('atm-'+id);
  function show(next) {
    page=next;
    for(const name of ['home','entry','digits','receipt'])control(name).hidden=name!==page;
  }
  function home() {
    const funds=balances();
    control('checking').textContent=formatMoney(funds.checking/100);
    control('cash').textContent=formatMoney(funds.cash/100);
    show('home');
    control('deposit').focus();
  }
  const source=()=>direction==='deposit' ? balances().availableCash : balances().availableChecking;
  function entry(next) {
    direction=next;
    const verb=next==='deposit'?'Deposit':'Withdraw', availableCents=source();
    control('label').textContent=verb+' amount ($)';
    control('confirm').textContent=verb+' cash';
    control('available').textContent=formatMoney(availableCents/100)+' available';
    for(const n of [20,100])control(n).disabled=availableCents<n*100;
    control('all').disabled=availableCents<1;
    amount.value='';control('error').textContent='';
    show('entry');
    const preset=control('20');
    (preset.disabled ? control('keypad') : preset).focus();
  }
  function close() {
    if(!machine)return;
    machine=null;glass=null;root.hidden=true;onChange(false);
  }
  function check() {
    if(machine && !available(machine))close();
    return Boolean(machine);
  }
  function button(id,section,run) {
    control(id).addEventListener('click',()=>{if(check() && (!section || section===page))run();});
  }
  button('exit',null,close);
  button('deposit','home',()=>entry('deposit'));
  button('withdraw','home',()=>entry('withdraw'));
  button('back','entry',home);
  button('again','receipt',home);
  for(const id of ['20','100','all'])button(id,'entry',()=>{
    amount.value=id==='all'?(source()/100).toFixed(2):id;
    control('error').textContent='';
  });
  const digits=['1','2','3','4','5','6','7','8','9','.','0','delete'];
  const digitIds=digits.map(digit=>digit==='.'?'decimal':digit==='delete'?'delete':'digit-'+digit);
  const focusOrder={
    home:['deposit','withdraw','exit'],
    entry:['amount','keypad','20','100','all','back','confirm','exit'],
    digits:[...digitIds,'accept','exit'],
    receipt:['again','exit'],
  };
  let draft='';
  function displayDraft(){control('draft').textContent='$'+(draft || '0');}
  button('keypad','entry',()=>{
    draft=amount.value;displayDraft();show('digits');control('digit-1').focus();
  });
  function editDigit(digit) {
    if(digit==='delete')draft=draft.slice(0,-1);
    else {
      const next=(draft || (digit==='.'?'0':''))+digit;
      if(!/^\d{1,12}(?:\.\d{0,2})?$/.test(next))return;
      draft=next;
    }
    displayDraft();
  }
  digits.forEach((digit,i)=>button(digitIds[i],'digits',()=>editDigit(digit)));
  button('accept','digits',()=>{
    amount.value=draft.replace(/\.$/,'');control('error').textContent='';
    show('entry');control('confirm').focus();
  });
  amount.addEventListener('input',()=>{control('error').textContent='';});
  button('confirm','entry',()=>{
    const raw=amount.value,error=transfer(direction,raw);
    if(error){control('error').textContent=error;return;}
    control('result').textContent=formatMoney(Number(raw))+(direction==='deposit'?' deposited to checking.':' withdrawn in cash.');
    control('remaining').textContent='Checking balance '+formatMoney(balances().checking/100);
    show('receipt');control('again').focus();
  });
  function key(event) {
    const key=event.key || event.code;
    const active=root.ownerDocument.activeElement;
    if(key==='Escape'){event.preventDefault?.();close();return true;}
    if(page==='digits' && (/^[0-9.]$/.test(key) || key==='Backspace')){
      event.preventDefault?.();editDigit(key==='Backspace'?'delete':key);return true;
    }
    const buttons=focusOrder[page].map(control).filter(el=>!el.disabled);
    const index=buttons.indexOf(active);
    if(['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(key)){
      if(active===amount && event.target===amount && ['ArrowLeft','ArrowRight'].includes(key))return true;
      event.preventDefault?.();
      const step=(key==='Tab'?event.shiftKey:['ArrowLeft','ArrowUp'].includes(key))?-1:1;
      if(page==='digits' && (key==='ArrowUp' || key==='ArrowDown')){
        const next=index+(key==='ArrowUp'?-3:3);
        buttons[Math.max(0,Math.min(buttons.length-1,next))].focus();
      }else buttons[(index+step+buttons.length)%buttons.length].focus();
    }else if(key==='Enter' || key===' ' || key==='Space'){
      event.preventDefault?.();
      const selected=active===amount ? control('confirm') : buttons[index] || buttons[0];
      if(!event.repeat)selected.click();
    }
    return true;
  }
  return {
    get active(){return Boolean(machine);}, close, check, key,
    pad(index) {
      const name=({0:'Enter',1:'Escape',9:'Escape',12:'ArrowUp',13:'ArrowDown',14:'ArrowLeft',15:'ArrowRight'})[index];
      if(index===0 && page==='entry' && root.ownerDocument.activeElement===amount)control('keypad').click();
      else if(name)key({key:name});
      return true;
    },
    open(room,fixture) {
      if(machine || !available(fixture))return;
      machine=fixture;glass=glassInRoom(room,fixture);
      control('bank').textContent=room.finish?.bank?.title || room.place?.name || 'Branch ATM';
      onChange(true);root.hidden=false;home();
    },
    frame(camera,width,height) {
      const {x,y,z,nx,nz}=glass;
      // Fit the actual glass on either a wide monitor or a portrait phone.
      const planeHeight=Math.max(glass.height/.57,glass.width/(camera.aspect*.89));
      const distance=planeHeight/(2*Math.tan(48*Math.PI/360));
      camera.position.set(x+nx*distance,y,z+nz*distance);
      camera.up.set(0,1,0);camera.lookAt(x,y,z);
      camera.near=.025;camera.fov=48;camera.updateProjectionMatrix();
      const sx=width*glass.width/(planeHeight*camera.aspect*460), sy=height*glass.height/(planeHeight*246);
      root.style.transform='translate(-50%, -50%) scale('+sx+', '+sy+')';
    },
  };
}
