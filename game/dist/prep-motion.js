// Distances are metres from the workpiece, +X to the worker's left and +Z
// away from their apron. Tool origins are inside the hand at the grip.
import { Vector3, Quaternion, Euler, Matrix4 } from './vendor/three.module.min.js';
import { qmul,qaxis,qinv,qrot,qslerp } from './body.js';
import { fingerPose,pinchOffset } from './hand-poses.js';
import { portionKey } from './food-catalog.js';
import { limbFit } from './limb-fit.js';

const clamp=n=>Math.max(0,Math.min(1,n));
const smooth=n=>clamp(n)**2*(3-2*clamp(n));
const hand=(x,y,z,grip='wrap',tool=null,tilt=0,pitch=0)=>({x,y,z,grip,tool,tilt,pitch});
const rest=side=>hand(side*.16,.13,-.18,'support');
const pair=(l,r)=>({l,r});
const holder=(y=.075,tool=null)=>hand(.088,y,-.012,'wrap',tool);
const onBoard=()=>hand(.078,.048,.008,'pinch');
const rim=y=>hand(.123,y,-.006,'support');
const spare=()=>rest(1);
const scoop=(a,h,tool='prepLadle')=>pair(rim(h+.01),hand(-.04+.07*a.wave,h+.13+.105*a.lift,-.045+.055*a.wave,'wrap',tool,-.32*a.wave));
const swipe=(a,tool,rise=.04)=>pair(onBoard(),hand(-.045,.055+rise*a.lift,-.115+.084*a.wave,'wrap',tool,0,.18*a.wave));
const turn=(a,press=false)=>pair(spare(),hand(-.053,.048+(press?.03:.082)*a.lift,-.13+.075*a.wave,'wrap','prepTurner',press?0:1.3*a.lift));
const pinch=(a,h=.05)=>pair(onBoard(),hand(-.07+.052*a.wave,h+.07*a.lift,.018*a.wave,'pinch'));
const circle=(a,h,r=.045,tool='prepSpoon')=>pair(rim(h),hand(r*a.wave,h+.122,r*a.cos,'wrap',tool,-.16*a.wave,.16*a.cos));
const push=(a,tool,ht=.06)=>pair(rim(ht),hand(-.028,ht+.135+.07*a.lift,-.013,'wrap',tool));
const carry=(a,width=.14)=>pair(...[1,-1].map(side=>hand(side*width,.041+.062*a.arch,-.08+.14*a.p,'support')));
const mouthHeight=cup=>/wine|champagne/.test(cup)?.16:/beer|stout|soda|mojito|iced/.test(cup)?.15:
  /martini|cocktail|margarita/.test(cup)?.13:cup==='prepJigger'?.05:.09;
// Lip offsets from the grip. Align the lip over the receiving vessel as the
// wrist turns, lowering it near the surface for the final stroke of latte art.
const lips={prepPitcher:[.094,.059,0],prepJug:[.093,.082,0],prepBottle:[0,.180,0],prepWineBottle:[0,.180,0],prepTin:[.040,.081,0],prepMixGlass:[.047,.080,0],prepJigger:[.025,.049,0]};
function pouringHand(a,tool,x,y,z,art=false){
  const tipped=smooth(Math.min(a.p/.26,(1-a.p)/.22));
  const angle=-(tool.includes('Bottle')?1.82:1.12)*tipped;
  const [lx,ly]=lips[tool];
  const wiggle=art?.008*a.wave*tipped:0;
  return hand(x+wiggle-.09*(1-tipped)-lx*Math.cos(angle)+ly*Math.sin(angle),
    y+(art?.075*(1-a.p):.047)+.018-ly*Math.cos(angle)-lx*Math.sin(angle),z,'wrap',tool,angle);
}
const pour=(a,tool,glass,art=false)=>pair(holder(.074,glass),pouringHand(a,tool,.063,.018+mouthHeight(glass),-.012,art));
const fill=(a,angle=0)=>pair(hand(.025,.075,-.045,'wrap',a.cup,angle),hand(-.012,.31,-.006,'wrap'));
const cap=(a,tool)=>pair(holder(.115,tool),hand(.068,.241+.045*a.p,-.01,'pinch',null,.55*a.wave));

// Each method describes the contact at work, including the other hand.
export const techniques={
  chop:a=>swipe(a,'prepKnife',.09), slice:a=>swipe(a,'prepKnife',.018),
  carve:a=>pair(hand(.10,.07,.01,'wrap','prepFork'),hand(-.035,.12+.13*a.lift,-.11+.055*a.wave,'wrap','prepKnife',0,.7)),
  shuck:a=>pair(onBoard(),hand(-.057,.051,-.08+.035*a.wave,'wrap','prepKnife',.62*a.wave)),
  grate:a=>pair(hand(.075,.108,.025,'wrap','prepGrater'),hand(.028,.12+.054*a.wave,-.012+.06*a.wave,'pinch')),
  shred:a=>pair(hand(.06+.024*a.lift,.14,.025,'wrap','prepFork'),hand(-.06-.055*a.lift,.14,-.015,'wrap','prepFork')),
  turn:a=>turn(a), press:a=>turn(a,true),
  scrape:a=>pair(hand(.075,.06+.025*a.lift,-.12,'wrap','prepTurner'),hand(-.033,.05+.06*a.lift,-.13+.06*a.wave,'wrap','prepTurner')),
  stir:a=>circle(a,a.height), whisk:a=>pair(rim(.073),hand(.032*a.wave,.189,.014*a.cos,'wrap','prepWhisk')),
  toss:a=>pair(hand(0,.105+.055*a.lift,-.19-.035*a.wave,'wrap'),hand(-.052,.19+.05*a.lift,-.08+.06*a.cos,'wrap','prepSpoon')),
  tongs:a=>pair(spare(),hand(-.045+.055*a.wave,a.height+.10+.065*a.lift,-.105+.04*a.wave,'wrap','prepTongs',.4*a.lift,.35)),
  scoop:a=>scoop(a,a.height,'prepScoop'),ladle:a=>scoop(a,a.height),baste:a=>scoop(a,.07,'prepSpoon'),
  lower:a=>pair(spare(),hand(0,.20+.065*(1-a.p),-.18,'wrap')),
  drain:a=>pair(spare(),hand(0,.20+.11*a.arch,-.18-.025*a.arch,'wrap')),
  tray:a=>carry(a), peel:a=>pair(hand(.008,.119,-.20,'wrap','prepPeel'),hand(-.018,.125,-.34,'wrap')),
  stretch:a=>pair(...[1,-1].map(s=>hand(s*(.052+.075*a.lift),.075+.045*a.lift,.02*a.cos,'support'))),
  roll:a=>pair(...[1,-1].map(s=>hand(.065*s,.054+.014*a.lift,-.045+.10*a.p,'support'))),
  fold:a=>pair(hand(.075-.032*a.p,.056+.035*a.arch,.004,'pinch'),hand(-.089+.05*a.p,.049+.045*a.arch,-.055+.055*a.p,'pinch')),
  shape:a=>pair(hand(.052,.079,-.005,'ball'),hand(-.023,.115-.033*a.lift,.016*a.wave,'ball')),
  dredge:a=>pair(rim(.072),hand(-.025+.053*a.wave,.08+.075*a.lift,.023*a.cos,'pinch')),
  spread:a=>swipe(a,'prepSpreader',.008),brush:a=>swipe(a,'prepBrush',.014),
  garnish:a=>pinch(a,.15),place:a=>pinch(a,.06),
  fetch:a=>pair(spare(),hand(-.04,a.height+.07+.065*a.p,.04-.16*a.p,'wrap',a.pack)),
  mash:a=>push(a,'prepPestle'),pound:a=>push(a,'prepMallet',.025),
  pipe:a=>pair(hand(.02,.102,.008,'pinch'),hand(-.014,.20+.018*a.wave,-.026,'wrap','prepBag')),
  drizzle:a=>pair(rim(.04),hand(.06*a.wave,.177,.035*a.cos,'wrap','prepSqueeze',0,2.55)),
  invert:a=>pair(hand(.09,.09+.09*a.arch,0,'support'),hand(-.09,.09+.09*a.arch,0,'support',null,Math.PI*a.p)),
  crack:a=>pair(hand(.02+.055*a.p,.125+.02*a.arch,.01,'pinch'),hand(-.02-.055*a.p,.125+.02*a.arch,.01,'pinch')),
  torch:a=>pair(spare(),hand(-.06+.043*a.wave,.171,-.10,'wrap','prepTorch',0,.74)),
  rest:()=>pair(rest(1),rest(-1)),
  dose:()=>pair(hand(.007,.105,-.093,'wrap','prepFilter'),hand(-.05,.19,-.018,'point')),
  tamp:a=>pair(hand(.018,.055,-.09,'wrap','prepFilter'),hand(.018,.118-.028*a.arch,.007,'wrap','prepTamper')),
  lock:a=>pair(spare(),hand(.045*(1-a.p),.252-.045*(1-a.p),-.098,'wrap','prepFilter',.20*(1-a.p))),
  extract:a=>pair(spare(),hand(-.006,.355,-.045-.13*a.p,'point')),
  steam:a=>pair(hand(.037,.090-.022*a.arch,-.050,'ball'),hand(-.052,.121-.022*a.arch,-.052,'wrap','prepPitcher',-.15)),
  steamFoam:a=>pair(hand(.036,.088-.034*a.arch,-.050,'ball'),hand(-.052,.119-.034*a.arch,-.052,'wrap','prepPitcher',-.21)),
  milkArt:a=>pour(a,'prepPitcher',a.cup,true),milkPour:a=>pour(a,'prepPitcher',a.cup),
  pour:a=>a.drink?pour(a,'prepJug',a.cup):pair(rim(a.height),pouringHand(a,'prepJug',0,a.height+.045,0)), bottlePour:a=>pour(a,'prepBottle',a.cup),winePour:a=>pour(a,'prepWineBottle',a.cup),
  measure:a=>pour(a,'prepBottle','prepJigger'),
  decant:a=>pair(holder(.071,'prepTin'),pouringHand(a,'prepJigger',.088,.154,-.012)),
  strain:a=>pair(hand(.055,.166,-.054,'pinch','prepStrainer'),pouringHand(a,a.cup==='drink-martini'?'prepMixGlass':'prepTin',.055,.177,-.012)),
  stirGlass:a=>pair(holder(.08,a.cup),hand(.064+.018*a.wave,.193,-.012+.018*a.cos,'pinch','prepBarSpoon')),
  shake:a=>pair(hand(.091+.065*a.wave,.294+.054*a.wave,-.145,'wrap'),hand(-.021+.065*a.wave,.24+.054*a.wave,-.145,'wrap','prepShaker',-.98)),
  barStir:a=>pair(holder(.083,'prepMixGlass'),hand(.056+.021*a.wave,.229,.021*a.cos,'pinch','prepBarSpoon')),
  muddle:a=>pair(holder(.082,a.cup),hand(.079,.235+.042*a.lift,0,'wrap','prepMuddler')),
  twist:a=>pair(hand(.034,.172,0,'pinch'),hand(-.025,.17,.022*a.wave,'pinch','prepPeelZest',.55*a.wave)),
  rim:a=>pair(hand(.016,.113,-.03,'wrap',a.cup,2.85),hand(-.058,.079,0,'pinch')),
  tap:a=>fill(a,-Math.PI/4*(1-a.p)),topOff:a=>fill(a),settle:()=>pair(rest(1),rest(-1)),
  dispense:a=>fill(a), open:a=>cap(a,a.pack||'prepBottle'),uncork:a=>cap(a,'prepWineBottle'),
  steep:a=>pair(rim(.08),hand(.017,.18+.022*a.wave,0,'pinch')),
  seal:a=>pair(holder(.066,a.cup),hand(.073,.149-.025*a.arch,-.01,'support')),
  blend:a=>pair(hand(0,a.blender?.427:.236,0,'support'),hand(-.035,.071,-.105,'point')),
  juice:a=>pair(hand(.072,.14,-.02,'support'),hand(0,.248-.065*a.arch,.005,'wrap','prepPusher')),
  crank:a=>pair(rim(.10),hand(-.084,.15+.046*a.cos,-.032+.046*a.wave,'wrap'))
};
const wareHeight={pot:.15,bowl:.085,ladle:.08,wok:.085,tray:.035,pan:.073,cup:.13,board:.023,basket:.12};
export function prepHands(work){
  const p=clamp(1-work.task.time/work.duration),angle=2*Math.PI*(work.duration-work.task.time)*({whisk:4,shake:3,slice:1.55,chop:2.7}[work.action]||1.3);
  const arch=Math.sin(Math.PI*p);
  return techniques[work.action]({p,arch,wave:Math.sin(angle),cos:Math.cos(angle),lift:(1-Math.cos(angle))*.5,
    height:wareHeight[work.ware]??.025,drink:work.drink,blender:work.station==='blenders',cup:work.cup,pack:work.pack});
}

// Fit the grip centre, not the wrist joint, to each target. Return actual
// contact points after reach limiting so a utensil always follows its hand.
export function fitPrepHands(rig,pose,work,matrix){
  const {frame,solve}=limbFit(rig,pose),inverse=matrix.clone().invert();
  const anchor=new Vector3(work.x,work.y,work.z).applyMatrix4(inverse);
  const scale=new Vector3().setFromMatrixScale(matrix).x;
  const yaw=new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix));
  const hands=prepHands(work),props=[];
  let source,receiving;
  const p=clamp(1-work.task.time/work.duration);
  const [before,after]=work.level||[0,1];
  const level=Math.round(8*(before+(after-before)*smooth(p)))/4;
  const engage=smooth(Math.min(p,1-p)*work.duration/.14);
  // Hinge at the waist to keep a tall worker's elbows bent above a low board.
  const spine=rig.index.get('spine_01'),parent=frame(rig.bones[spine].parent).q;
  const lean=clamp((anchor.z-.24)*1.9+(1.02-anchor.y)*.7)*.69*engage;
  pose.q[spine]=qmul(qmul(qmul(qinv(parent),qaxis([1,0,0],lean)),parent),pose.q[spine]);
  if(work.mesh){
    const height=work.action==='toss'?hands.l.y-.105:work.action==='drain'||work.action==='lower'?hands.r.y-.20:0;
    work.mesh.position.y=height;
  }
  for(const side of ['l','r']){
    const h=hands[side],sign=side==='l'?1:-1,id=name=>rig.index.get(name+'_'+side);
    const tilt=new Quaternion().setFromEuler(new Euler(h.pitch,0,h.tilt));
    const target=anchor.clone().add(new Vector3(h.x,h.y,h.z).divideScalar(scale));
    const i=id('hand'),knuckle=rig.bones[id('middle_01')].t;
    const grip=h.grip==='pinch'?pinchOffset(rig,side):knuckle.map((v,k)=>v*.73+(k===0 && h.grip==='wrap'?sign*.025:0));
    const restQ=rig.world[i].q;
    const toward=new Vector3(...qrot(restQ,knuckle)).normalize();
    const direction=new Vector3(-sign*.24,h.grip==='support'?-.24:-.47,.78).normalize().applyQuaternion(tilt);
    const aligned=qmul(new Quaternion().setFromUnitVectors(toward,direction).toArray(),restQ);
    const palm=new Vector3(...qrot(aligned,[sign,0,0]));
    const inward=h.grip==='wrap'||h.grip==='ball';
    const normal=new Vector3(inward?-sign:0,inward?-.22:-1,0).applyQuaternion(tilt);
    for(const v of [palm,normal])v.addScaledVector(direction,-v.dot(direction)).normalize();
    const twist=Math.atan2(direction.dot(palm.clone().cross(normal)),palm.dot(normal));
    const wrist=qmul(qaxis(direction.toArray(),twist),aligned);
    target.sub(new Vector3(...qrot(wrist,grip)));
    const joints=[id('upperarm'),id('lowerarm'),i],base=joints.map(j=>pose.q[j]);
    solve(id('upperarm'),id('lowerarm'),i,target,wrist,new Vector3(sign*.67,-1,-.48));
    for(const [k,j] of joints.entries())pose.q[j]=qslerp(base[k],pose.q[j],engage);
    for(const [joint,q] of fingerPose(rig,h.grip,side))pose.q[joint]=qslerp(pose.q[joint],q,engage);
    if(h.tool){
      const actual=frame(i);
      const atWork=actual.p.add(new Vector3(...qrot(actual.q,grip))).applyMatrix4(matrix);
      const rotation=yaw.clone().multiply(new Quaternion(...qmul(actual.q,qinv(wrist)))).multiply(tilt);
      let tool=h.tool;
      if(tool===work.cup){
        // The model origin is its foot. Grip the bowl or stem as appropriate.
        const stem=/wine|martini|champagne|cocktail/.test(tool);
        const offset=new Vector3(side==='l'?-.025:.025,stem?-.063:-.056,0).applyQuaternion(rotation);
        atWork.add(offset);
        if(tool!==work.pack){
          tool=portionKey(tool,level);
        }
      }
      props.push({tool,point:atWork,rotation});
      if(side==='r' && lips[tool] && h.tilt<-.74)source=new Vector3(...lips[tool]).applyQuaternion(rotation).add(atWork);
      if(side==='l' && (h.tool===work.cup || ['prepJigger','prepTin'].includes(h.tool))){
        const rim=h.tool==='prepTin'?.081:mouthHeight(h.tool);
        receiving=new Vector3(0,rim-.011,0).applyQuaternion(rotation).add(atWork);
      }
    }
  }
  if(work.cup && ![hands.l.tool,hands.r.tool].includes(work.cup) && ['strain','settle','twist','garnish','extract'].includes(work.action) && work.drink){
    const point=(work.action==='extract'?new Vector3(0,.11,.005):new Vector3(.055,0,-.012)).applyQuaternion(yaw).add(new Vector3(work.x,work.y,work.z));
    const vessel=work.action==='extract'?'drink-espresso':work.cup;
    props.push({tool:portionKey(vessel,work.action==='extract'?Math.round(p*8)/4:level),point,rotation:yaw});
    receiving=point.clone();receiving.y+=mouthHeight(vessel)-.015;
    if(work.action==='extract'){
      source=point.clone();source.y+=.145;
      props.push({tool:'prepFilter',point:new Vector3(0,.25,-.097).applyQuaternion(yaw).add(new Vector3(work.x,work.y,work.z)),rotation:yaw});
    }
  }
  if(['tap','topOff'].includes(work.action) && work.station==='draftTaps'){
    source=new Vector3(work.x,work.y+.15,work.z);
  }
  if(source && receiving && engage>.98 && source.y>receiving.y+.003){
    const delta=source.clone().sub(receiving),length=delta.length();
    const tool=work.action==='extract'?'prepCoffeeFlow':work.action.startsWith('milk')?'prepMilkFlow':work.cup==='drink-red-wine'?'prepWineFlow':'prepPourFlow';
    props.push({tool,point:source.lerp(receiving,.5),rotation:new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize()),size:new Vector3(1,length,1)});
  }
  return props;
}
