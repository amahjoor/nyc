import * as T from '../vendor/three.module.min.js';
import { KINDS, KIND, signFor, unpackPlace } from '../places.js';
import { buildRoom, planRoom, roomKind, roomStyle } from '../interiors.js';
import { drawSign } from '../storefronts.js';
import { bankIdentity, drawBankName } from '../bank.js';
import { inspectionMesh, PROP_SHAPES, roomProps } from '../room-props.js';
import { servingMaterial } from '../food-surface.js';
import { fittingStock, fittedLook } from '../shop-stock.js';
import { showroomModel, disposeSample } from '../showroom-models.js';
import { createHumanShop } from '../human-shop.js';
import { createHumanMesh } from '../human-mesh.js';
import { DEFAULT_PERSON } from '../human-designs.js';
import { createMotion, fitPose, gripOffsetFor } from '../body-motion.js';
import { fitPrepHands } from '../prep-motion.js';
import { writeMovements } from '../body-moves.js';
import { seatClip } from '../seating.js';
import { sceneEntries } from './business-scenes.js';
import { designOf } from '../human-cast.js';
import { memberOf } from '../crowd.js';
import { populateShop } from '../shop-life.js';

// Selected records from the city's packed place tiles. Unpack them through the
// same trade correction as the game, retaining the coordinates used for design seeds.
const locations = [
  ['Verizon', [-9232,10442,77,'VERIZON']],
  ['Old Navy', [-9189,17409,68,'OLD NAVY']],
  ['TJ Maxx', [-9103,17124,89,'TJ MAXX']],
  ['GU', [346,-109,68,'GU']],
  ['Foot Locker', [-13901,15811,69,'FOOT LOCKER']],
  ['Guitar Center', [577,-1440,43,'GUITAR CENTER',1015290]],
  ['Frank Anson Jewelers', [-9765,16642,78,'FRANK ANSON JEWELERS']],
  ['Planet Fitness', [-13015,10960,79,'PLANET FITNESS']],
  ['Equinox', [-30,-1563,79,'EQUINOX']],
  ['Life Time', [209,-4226,79,'LIFE TIME']],
  ['SoulCycle', [-948,818,79,'SOULCYCLE']],
  ['5 Boro Power Yoga', [-9771,16740,79,'5 BORO POWER YOGA']],
  ['Club Pilates', [-9386,17563,79,'CLUB PILATES']],
  ['Retro Fitness', [-9201,17305,79,'RETRO FITNESS']],
  ['Elite Barbell NYC', [325,7048,79,'ELITE BARBELL NYC']],
  ['Elevated Pilates NY', [-10659,17646,12,'ELEVATED PILATES NY',5152189]],
  ['Bank of America', [-9631,17750,70,'BANK OF AMERICA']],
  ['Citibank', [-10626,12336,70,'CITIBANK']],
  ['TD Bank', [-10340,12316,70,'TD BANK']],
  ['Chase Bank', [16032,-4610,70,'CHASE BANK']],
  ['Wells Fargo', [-254,-2026,70,'WELLS FARGO']],
  ['Capital One', [-1707,10125,70,'CAPITAL ONE']],
  ['CVS Pharmacy', [-9440,17444,34,'CVS PHARMACY',0,8000]],
  ['Walgreens', [-10908,10804,34,'WALGREENS',0,18000]],
  ['Duane Reade', [-11034,17765,34,'DUANE READE',0,8200]],
  ['Trader Joe’s', [-13874,14852,33,'TRADER JOES',0,16500]],
  ['Starbucks', [-9160,17067,2,'STARBUCKS',5161539,0,'A']],
];
const kindNames = { american:'American restaurant', european:'European restaurant', latin:'Latin restaurant', coffee:'Café' };
const sector = { food:'Counter service', dining:'Dining rooms', cafe:'Cafés and bakeries', bar:'Bars and clubs', market:'Food markets', bodega:'Food markets', liquor:'Food markets', stand:'Street retail', shop:'Retail and services', beauty:'Hair and beauty', barber:'Hair and beauty', auto:'Automotive', hotel:'Hotels and entertainment', public:'Public facilities' };
const slug = label => label.toLowerCase().replaceAll(/[^a-z0-9]+/g,'-').replace(/-$/,'');
const words = key => key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll(/[_-]/g,' ').replace(/^./,c=>c.toUpperCase());
const footprints = { interior:[7,10], narrow:[4.4,6], wide:[9,13], street:[7,10], service:[7,12] };
const roomVariants = [{id:'interior',label:'Interior'},{id:'street',label:'Storefront'},{id:'narrow',label:'Narrow floor plan'},{id:'wide',label:'Wide floor plan'}];
const release = new WeakMap();
function owned(object,dispose){ release.set(object,dispose); return object; }
export function dispose(object){ release.get(object)?.(); release.delete(object); }
function makePlan(place,variant='interior'){
  const [width,depth]=footprints[variant]||footprints.interior;
  return planRoom({place,x:0,z:0,tx:1,tz:0,nx:0,nz:1,width},(_x,z)=>z>=-depth);
}
function fascia(place,width){
  const canvas=document.createElement('canvas');
  canvas.width=1024; canvas.height=Math.round(1024*.64/width);
  const ctx=canvas.getContext('2d'),sign=signFor(place),bank=place.kind==='bank'&&bankIdentity(place);
  if(bank)drawBankName(ctx,bank,0,0,canvas.width,canvas.height,'#f1eee4');
  else {
    drawSign(ctx,sign,0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='source-in'; ctx.fillStyle=sign.lettering; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='destination-over'; ctx.fillStyle=sign.background; ctx.fillRect(0,0,canvas.width,canvas.height);
  }
  const map=new T.CanvasTexture(canvas); map.colorSpace=T.SRGBColorSpace; map.anisotropy=4;
  const mesh=new T.Mesh(new T.PlaneGeometry(width,.64),new T.MeshBasicMaterial({map}));
  mesh.name='Street fascia'; mesh.position.set(0,2.61,.08);
  return mesh;
}
function roomObject(place,id){
  const plan=makePlan(place,id),object=buildRoom(plan);
  const street=id==='street',sign=street&&typeof document!=='undefined'&&fascia(place,plan.width);
  if(sign)object.add(sign);
  object.userData.inspectionView=street
    ? {position:[.35,1.8,plan.width*1.25],target:[0,1.48,0]}
    : {position:[.16,1.62,-.13],target:[0,1.10,-Math.min(5,plan.depth*.6)]};
  return owned(object,()=>{if(sign)disposeSample(sign);object.userData.dispose();});
}
function venues(){
  const templates=KINDS.map(kind=>({
    id:kind.id,name:kindNames[kind.id]||kind.label,
    place:{kind:kind.id,x:0,z:0,name:'',group:kind.group}
  })).filter(v=>roomKind(v.place));
  return [...templates,...locations.map(([name,row])=>({id:slug(name),name,place:unpackPlace(row,slug(name)),record:true}))];
}
function roomEntry(v){
  const {place,name}=v,kind=KIND[place.kind],style=roomStyle(place);
  return {id:'interior-'+v.id,name,collection:'Interiors',group:place.kind==='gym'?'Fitness':sector[kind.group]||kind.label,
    source:'interiors.js',model:style,view:'room',places:[v.record?name:kind.label],tags:[place.kind,style,kind.label,place.name],
    detail:v.record?'City business record · adjustable footprint':'Facility template · adjustable footprint',
    variants:roomVariants, build:id=>roomObject(place,id),dispose};
}

let humanStudio;
async function data(file,format){
  const response=await fetch(new URL('../'+file,import.meta.url));
  if(!response.ok)throw new Error(file+' returned HTTP '+response.status);
  return response[format]();
}
function avatarStudio(){
  return humanStudio??=Promise.all([data('motion.json','json'),data('motion.bin','arrayBuffer')])
    .then(([meta,bytes])=>{const moves=writeMovements(createMotion(meta,new Int16Array(bytes)));return {moves,grow:createHumanShop(meta,{worker:false,moves})};})
    .catch(error=>{humanStudio=null;throw error;});
}
export async function avatar(designFor,clip='idle',item=null,isolated=false,actor=null){
  const {moves,grow}=await avatarStudio();
  const design=await designFor(grow),built=await grow(design,'close'),body=createHumanMesh(built,built.look);
  const object=body.mesh;
  try{
    const pose=fitPose(moves,body.rig,moves.sample(actor?.preparation?'idle':clip,actor?.time??.36),undefined,actor?.seat,actor?.carry);
    if(actor){
      object.position.set(actor.x,actor.y||actor.lift||0,actor.z);
      object.rotation.y=actor.heading||0;
      object.updateMatrix();
      if(actor.preparation)object.userData.prepProps=fitPrepHands(body.rig,pose,actor.preparation,object.matrix);
    }
    body.pose(pose);
    if(actor?.carry){
        const palm=body.bones[body.rig.index.get('hand_l')];
        object.userData.carryPoint=palm.localToWorld(new T.Vector3(...gripOffsetFor(body.rig,actor.carry)));
    }
    object.updateMatrixWorld(true);
    if(isolated){
      const id=item.design[item.slot],kind=['top','bottom'].includes(item.slot)?'garment':item.slot;
      const prefix=kind+'/'+id,selected=body.meshes.filter(part=>part.name===prefix ||
        (kind==='garment' && !/\d$/.test(id) && part.name.startsWith(prefix) && /^\d+$/.test(part.name.slice(prefix.length))));
      if(!selected.length)throw new Error('No equipped mesh for '+item.sku);
      const keep=new Set(selected);
      const hidden=[];
      object.traverse(part=>{if(part.isMesh&&!keep.has(part))hidden.push(part);});
      for(const part of hidden)part.removeFromParent();
    }
    if(item?.slot==='hair'&&!isolated){
      const eyes=body.eyePosition(new T.Vector3());
      object.userData.inspectionView={position:[eyes.x+.20,eyes.y+.045,eyes.z+.72],target:[eyes.x,eyes.y+.015,eyes.z-.03]};
    }
    return owned(object,()=>body.dispose());
  }catch(error){body.dispose();throw error;}
}
function merchandise(all){
  const products=new Map();
  for(const {name,place} of all){
    for(const item of fittingStock(place)){
      if(item.archive)continue; // The archive collection has a section of its own (fashion.js).
      let row=products.get(item.sku);
      if(!row){row={item,shops:new Set()}; products.set(item.sku,row);}
      row.shops.add(name);
    }
  }
  return [...products.values()].map(({item,shops})=>{
    const wearable=Boolean(item.slot),hair=item.slot==='hair';
    const groups={top:'Tops',bottom:'Bottoms',shoes:'Footwear',hair:'Hairstyles',phone:'Phones',guitar:'Instruments',ringSample:'Jewelry'};
    const model=item.model||item.design[item.slot];
    return {id:'product-'+item.sku,name:item.name,collection:'Merchandise',group:groups[item.slot||item.model],
      source:wearable?'shop-stock.js':'showroom-models.js',model,detail:'$'+item.price,places:[...shops],tags:[item.sku,model,...shops],
      variants:wearable?(hair?[{id:'worn',label:'Barber mirror'},{id:'item',label:'Hair model'}]:
        [{id:'item',label:'Product'},{id:'worn',label:'Fitting mirror'}]):[{id:'model',label:'Inspection model'},{id:'floor',label:'Shop-floor model'}],
      build(id){
        if(wearable)return avatar(()=>fittedLook(DEFAULT_PERSON,item),'idle',item,id==='item'||(!id&&!hair));
        const object=id==='floor'?inspectionMesh(item):showroomModel(item);
        return owned(object,()=>disposeSample(object));
      },dispose};
  });
}

const fixtureNames={
  espresso:'Espresso workstation',showcase:'Glass display case',shoewall:'Sneaker wall',breadrack:'Bakery rack',hotServery:'Hot food counter',
  ringSample:'Display solitaire',cup:'Cup and saucer',paperCup:'Takeaway cup',drinkMug:'Dine-in mug',mealPlate:'Served plate',
  poBoxes:'Post office boxes',eyechart:'Eye chart',rxCabinet:'Prescription cabinet',
  examchair:'Examination chair',tellerPane:'Teller window',tv:'Television',blenders:'Blender station',cookline:'Kitchen cookline',
  deliCups:'Deli cup station',menuboard:'Menu board',placeSetting:'Table setting',
};
const fixtureShell={x:0,z:0,tx:1,tz:0,nx:0,nz:-1,width:7,depth:8,things:[],staff:[],seats:[],kind:'shop',
  place:{kind:'variety',name:'',x:0,z:0},style:'inspection',wall:'#e5dfd0',floor:'#858585'};
let shellVertices;
function shellMesh(room){ return room.children.find(mesh=>mesh.material?.name==='Room'); }
function fixtureObject(thing){
  const side=Boolean(thing.face?.[0]);
  const model={...thing,a:0,b:0,y:0,w:side?thing.d:thing.w,d:side?thing.w:thing.d,face:[0,1]};
  // The register and servings normally enter the room through their live service
  // callbacks. Draw those at inspection scale with the same geometry and UVs.
  const serving=['paperCup','drinkMug','mealPlate'].includes(model.shape);
  if(model.shape==='register'||serving){
    const p=[],c=[],uv=serving?[]:null;
    roomProps(fixtureShell,0,p,c,uv).draw(model);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(c,serving?4:3));
    if(uv)geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.computeVertexNormals();
    const material=serving?servingMaterial():new T.MeshStandardMaterial({vertexColors:true,roughness:.52});
    return owned(new T.Mesh(geometry,material),()=>{geometry.dispose();material.dispose();});
  }
  // buildRoom bakes architecture first, then the ordered fixtures. Keep the
  // fixture vertices and its separate glass while preserving native surface IDs.
  if(shellVertices===undefined){
    const empty=buildRoom(fixtureShell);
    shellVertices=shellMesh(empty).geometry.attributes.position.count;
    empty.userData.dispose();
  }
  const baked=buildRoom({...fixtureShell,things:[model]});
  const batch=shellMesh(baked),geometry=new T.BufferGeometry(),object=new T.Group();
  for(const [name,attr] of Object.entries(batch.geometry.attributes)){
    geometry.setAttribute(name,new T.BufferAttribute(attr.array.slice(shellVertices*attr.itemSize),attr.itemSize,attr.normalized));
  }
  if(geometry.attributes.position.count)object.add(new T.Mesh(geometry,batch.material));
  const glass=baked.getObjectByName('Display case glass');
  if(glass)object.add(glass);
  return owned(object,()=>{geometry.dispose();baked.userData.dispose();});
}
function fixtureEntries(all){
  const samples=new Map();
  for(const venue of all){
    const plan=makePlan(venue.place,'wide');
    for(const thing of plan.things){
      const shape=thing.shape;
      if(!shape||thing.more?.pickup)continue;
      let record=samples.get(shape);
      if(!record){record={variants:new Map(),shops:new Set()};samples.set(shape,record);}
      record.shops.add(venue.name);
      const more=thing.more||{};
      const option=more.items||more.section||more.sku||more.profile||more.kind||'model';
      if(!record.variants.has(option))record.variants.set(option,thing);
    }
  }
  for(const shape of PROP_SHAPES){
    if(samples.has(shape))continue;
    const fallback={shape,color:'#c9b497',w:1.4,d:.60,h:1.65};
    samples.set(shape,{variants:new Map([['model',fallback]]),shops:new Set()});
  }
  return [...samples].map(([shape,{variants,shops}])=>{
    const options=[...variants.keys()].map(key=>({id:String(key),label:key==='model'?'Model':words(String(key))}));
    const name=fixtureNames[shape]||words(shape);
    const group=/barbell|treadmill|dumbbell|weightBench|cableStation|spinBike|exerciseMat|reformer|towelShelf/.test(shape)?'Fitness equipment':
      /branch|teller|ATM|cashMachine|queueRail|writingDesk/.test(shape)?'Banking':
      /salon|styling|shampoo|cuttingChair|rxCabinet|careShelves|examchair|eyeChart|eyechart/.test(shape)?'Personal care':
      /espres|kitchen|grill|oven|servery|plate|mug|cup|pizza|cook|meal|bread|spit|blender|deli|menu/i.test(shape)?'Food service':
      /chair|table|stool|bench|lamp|plant/i.test(shape)?'Furniture':'Shop floor';
    return {id:'fixture-'+slug(shape),name,collection:'Fixtures',group,model:shape,source:PROP_SHAPES.includes(shape)?'room-props.js':'interiors.js',
      places:[...shops],tags:[shape,...shops,...variants.keys()],variants:options,
      build:id=>fixtureObject(variants.get(id)||variants.values().next().value),dispose};
  });
}
const people=[
  ['barista','Barista','coffee',v=>v.actors.find(a=>a.machine?.shape==='espresso')],
  ['cafe-guest','Café guest','coffee',v=>v.actors.find(a=>a.sitting)],
  ['clerk','Grocery cashier','bodega',v=>v.actors.find(a=>a.spot.role==='cashier')],
  ['deli-cook','Deli cook','bodega',v=>v.actors.find(a=>a.spot.role==='deliCook')],
  ['chef','Restaurant cook','italian',v=>v.actors.find(a=>a.spot.role==='cook')],
  ['server','Restaurant server','italian',v=>v.actors.find(a=>a.spot.role==='server')],
  ['barber','Barber','barber',v=>v.actors.find(a=>a.spot.role==='barber')],
  ['jeweler','Jewelry sales associate','jewelry',v=>v.clerk],
  ['runner','Gym runner','gym',v=>v.actors.find(a=>a.spot.treadmill)],
];
function actorObject(actor,clip,placeInRoom=false){
  const member=memberOf(actor.look),colour=n=>'#'+n.toString(16).padStart(6,'0');
  const movement=actor.sitting && actor.seat?seatClip(actor.seat):clip||'idle';
  return avatar(async grow=>({...designOf(member,await grow.human()),topColour:colour(actor.look.top),
    bottomColour:colour(actor.look.bottom)}),placeInRoom?movement:clip,null,false,placeInRoom?actor:null);
}
function peopleEntries(){
  return people.map(([id,name,kind,actorFor])=>{
    const place={kind,x:0,z:0,name:''};
    const view={plan:makePlan(place),actors:[],occupied:new Set(),floor:0};
    populateShop(view);
    const actor=actorFor(view),member=memberOf(actor.look);
    const clips=id==='runner'?[{id:'jog',label:'Running'},{id:'idle',label:'Standing'}]:
      [{id:'idle',label:'Standing'},{id:'walk',label:'Walking'}];
    return {id:'person-'+id,name,collection:'People',group:['runner','cafe-guest'].includes(id)?'Customers':'Employees',
      source:'shop-life.js',model:'Cast member '+member,places:[kindNames[kind]||KIND[kind].label],tags:[kind,id,actor.look.outfit],
      variants:clips, build:clip=>actorObject(actor,clip||clips[0].id),dispose};
  });
}

export function businessEntries(){
  const all=venues();
  return [...all.map(roomEntry),...merchandise(all),...fixtureEntries(all),...peopleEntries(),...sceneEntries({makePlan,actorObject,owned,dispose})];
}
