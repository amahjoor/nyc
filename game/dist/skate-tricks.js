// Right-stick coordinates follow the Gamepad API: positive Y is toward the tail.
export const TRICKS = {
  ollie:{label:'Ollie',duration:.38}, nollie:{label:'Nollie',duration:.40},
  kickflip:{label:'Kickflip',roll:-1,duration:.54}, heelflip:{label:'Heelflip',roll:1,duration:.56},
  shove:{label:'Pop shove-it',yaw:1,duration:.47}, frontShove:{label:'Frontside shove-it',yaw:-1,duration:.49}
};

export function flickStick(state,x,y,dt) {
  const magnitude=Math.hypot(x,y);
  if(Math.abs(y)>.65 && Math.abs(x)<.54 && !state.end && !state.locked){
    state.end=Math.sign(y);state.charge=0;state.arc=0;state.neutral=0;state.travel=0;
  }
  let trick=null;
  if(state.end){
    state.charge=Math.min(1,state.charge+dt*2.8);
    if(y*state.end>.68 && Math.abs(x)<.42)state.travel=0;
    else state.travel+=Math.min(.12,dt);
    if(state.travel>.34){
      state.end=0;state.locked=true;
      return {trick:null,charge:0,loading:false,manual:0};
    }
    if(y*state.end>.12 && Math.abs(x)>.48)state.arc=Math.sign(x);
    if(magnitude<.24)state.neutral+=dt;else state.neutral=0;
    if(y*state.end<-.42 && magnitude>.72){
      trick=Math.abs(x)>.39 ? (x<0?'kickflip':'heelflip') : state.end<0?'nollie':'ollie';
    }else if(Math.abs(x)>.78 && Math.abs(y)<.42 && (state.arc || state.charge>.22)){
      trick=x<0?'shove':'frontShove';
    }
    if(trick||state.neutral>.15){state.end=0;state.locked=Boolean(trick);}
  }else if(magnitude<.25)state.locked=false;
  return {trick,charge:state.charge||0,loading:Boolean(state.end),manual:!state.end&&!state.locked&&Math.abs(x)<.35&&Math.abs(y)>.26&&Math.abs(y)<.64 ? Math.sign(y):0};
}

export function startTrick(board,name,charge){
  board.trick=name in TRICKS?name:'ollie';
  board.airTime=0;board.spin=0;board.roll=0;board.shove=0;board.grab=0;board.tuck=0;board.heldGrab=0;
  board.takeoff=3.25+1.65*Math.max(0,Math.min(1,charge));
  board.grind=null;board.manual=0;board.load=0;
}

export function animateAir(board,input,dt){
  board.airTime+=dt;
  const trick=TRICKS[board.trick];
  const t=Math.min(1,board.airTime/(trick?.duration||.45)), eased=t*t*(3-2*t);
  board.roll=(trick?.roll||0)*2*Math.PI*eased;
  board.shove=(trick?.yaw||0)*Math.PI*eased;
  board.spin-=input.turn*dt*5.15;
  const flipped=trick?.roll || trick?.yaw;
  board.grab=t>=(flipped ? .82 : .26) ? input.grab||0 : 0;
  board.tuck+=((board.grab?1:0)-board.tuck)*(1-Math.exp(-16*dt));
  if(board.grab)board.heldGrab=board.grab;
}

export function landTrick(board){
  const trick=TRICKS[board.trick], halfTurns=Math.round(board.spin/Math.PI);
  const error=Math.abs(board.spin-halfTurns*Math.PI);
  const caught=!trick || board.airTime>=trick.duration*.82;
  const clean=caught && error<.86;
  const labels=[];
  if(trick)labels.push(trick.label);
  if(halfTurns)labels.push(Math.abs(halfTurns)*180+'°');
  if(board.heldGrab)labels.push(board.heldGrab<0?'Melon grab':'Indy grab');
  if(clean && labels.length){board.last=labels.join(' · ');board.feedback=1.6;}
  if(clean && Math.abs(halfTurns)%2)board.switch=!board.switch;
  board.trick=null;board.grab=board.heldGrab=board.tuck=board.spin=board.roll=board.shove=0;
  return {clean,error};
}
