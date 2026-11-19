import * as THREE from './vendor/three.module.min.js';
import {Parts,createTransportModel} from './transport-models.js';

const navy=0x233a50, black=0x232525, silver=0xadb8bc, white=0xe8ecec, leather=0x4d3026;
const templates=new Map();
const animals=new Map();
const coatMaterial=new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:.94});

// Quaternius' animated animals, sampled in metres. Each animal shares geometry
// across its instances and keeps its own walk phase.
export function animalGeometry(data){
  const bytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  const frame=text=>new THREE.Float32BufferAttribute(Float32Array.from(new Int16Array(bytes(text).buffer),n=>n/1000),3);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',frame(data.rest));
  g.setAttribute('color',new THREE.Uint8BufferAttribute(bytes(data.colors),3,true));
  g.setIndex(new THREE.Uint16BufferAttribute(new Uint16Array(bytes(data.indices).buffer),1));
  g.morphAttributes.position=data.walk.map(frame);
  g.computeVertexNormals();
  return g;
}
function attachAnimal(group,job){
  if(!animals.has(job)){
    const load=fetch(new URL('./assets/police/'+job+'.json',import.meta.url))
      .then(response=>{if(!response.ok)throw Error(response.statusText);return response.json();})
      .then(animalGeometry);
    animals.set(job,load);
  }
  animals.get(job).then(geometry=>{
    const animal=new THREE.Mesh(geometry,coatMaterial);
    animal.name='Working animal';animal.castShadow=animal.receiveShadow=true;
    group.add(animal);group.userData.animal=animal;group.visible=true;
    group.dispatchEvent({type:'animal-ready'});
  }).catch(()=>{animals.delete(job);});
}
function tack(p,horse){
  if(horse){
    p.oval([0,1.618,-.08],[.32,.075,.35],navy);
    p.oval([0,1.68,-.08],[.25,.045,.27],leather);
    for(const side of [-1,1]){
      p.box([side*.26,1.44,-.08],[.034,.39,.52],navy,[0,0,side*.12]);
      p.lettering('NYPD',[side*.287,1.47,-.16],.28,.09,side*Math.PI/2,'#233a50','#e9e4d0');
      p.rod([side*.20,1.65,-.05],[side*.31,1.07,-.03],.014,leather);
      p.rod([side*.31,1.06,-.10],[side*.31,1.06,.04],.014,silver);
      p.rod([side*.09,1.84,1.34],[side*.17,1.87,.35],.009,leather);
    }
  }else{
    p.oval([0,.52,.08],[.137,.098,.17],navy);
    for(const side of [-1,1])p.lettering('K-9',[side*.136,.535,.055],.135,.061,side*Math.PI/2,'#233a50','#e9e4d0');
  }
}
export function createPoliceHelicopter(){
  const aircraft=createTransportModel('helicopter',{paint:0x214572});
  // The flight simulation tracks the centre of the fuselage, while the
  // transport model places its origin at the skids.
  aircraft.position.y=-1.55;
  const group=new THREE.Group(), trim=new Parts();
  group.name='NYPD Aviation Unit';group.add(aircraft);
  for(const side of [-1,1]){
    trim.lettering('NYPD',[side*1.045,1.50,.03],.68,.17,side*Math.PI/2,'#f0ede2','#1e3854');
    trim.box([side*.22,1.71,-3.65],[.016,.055,1.30],white);
  }
  aircraft.add(trim.finish());
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.14,10,8),new THREE.MeshBasicMaterial({color:0xfff1c8}));
  lamp.position.set(0,-.71,1.55);group.add(lamp);
  const red=new THREE.Mesh(new THREE.SphereGeometry(.08,8,6),new THREE.MeshBasicMaterial({color:0xf54940}));
  red.position.set(-.91,.07,-.95);group.add(red);
  group.userData={rotor:aircraft.getObjectByName('mainRotor'),tail:aircraft.getObjectByName('tailRotor'),red,lamp};
  return group;
}

function launch(p){
  const hull=[[1,1],[-1,1],[-1,.76],[-.70,.18],[0,0],[.70,.18],[1,.76]];
  p.loft([[-3.8,1.24,-.32,.82],[-2.6,1.5,-.52,1.03],[1.3,1.5,-.52,1.03],[2.9,1.0,-.24,1.20],[3.95,.09,.37,1.34]],hull,navy);
  p.box([0,1.04,-.45],[2.66,.055,4.95],white);
  p.box([0,1.54,1.12],[1.46,.94,.85],white);
  p.box([0,2.16,1.30],[1.55,.48,.08],0x71969d,[-.2,0,0],'glass');
  for(const side of [-1,1]){
    p.rod([side*.95,1.06,1.55],[side*.95,2.7,1.55],.04,silver);
    p.rod([side*.95,1.06,-.63],[side*.95,2.7,-.63],.04,silver);
    p.lettering('NYPD HARBOR',[side*1.508,.76,-.5],2.05,.34,side*Math.PI/2,'#233a50','#f7f7f2');
    p.box([side*.51,.59,-3.98],[.52,.86,.65],black);
  }
  p.box([0,2.72,.44],[2.25,.10,2.72],white);
  p.box([0,2.84,.78],[.64,.13,.25],0x4c7fae);
}
export function equipmentFor(job){
  if(!['dog','horse','boat','motor','inspect'].includes(job))return null;
  if(!templates.has(job)){
    const p=new Parts();
    if(job==='dog'||job==='horse')tack(p,job==='horse');
    if(job==='boat')launch(p);
    if(job==='motor'){
      p.root.add(createTransportModel('motorcycle', {paint:white}));
      for(const side of [-1,1]){
        p.box([side*.30,.58,-.51],[.23,.35,.48],white);
        p.lettering('NYPD',[side*.417,.59,-.51],.39,.11,side*Math.PI/2,'#23416b','#f9f6ec');
      }
      p.box([0,1.22,.46],[.44,.34,.04],0x86a6ac,[-.22,0,0],'glass');
    }
    if(job==='inspect'){
      p.box([0,.13,0],[.40,.24,.21],navy);p.rod([-.075,.27,0],[.075,.27,0],.019,black);
      for(const side of [-1,1])p.box([side*.13,.18,.11],[.039,.044,.012],silver);
    }
    const model=p.finish();model.name='Police '+job;templates.set(job,model);
  }
  const model=templates.get(job).clone();
  if((job==='horse'||job==='dog') && typeof document!=='undefined'){
    model.visible=false;attachAnimal(model,job);
  }
  return model;
}
export function placeEquipment(model,actor,waterLevel=0){
  const job=actor.post.unit.activity,h=actor.heading;
  const side=job==='dog'?.68:job==='inspect'?.48:0, ahead=job==='motor'?.20:0;
  model.position.set(actor.x+Math.cos(h)*side+Math.sin(h)*ahead,job==='boat'?waterLevel:actor.y,actor.z-Math.sin(h)*side+Math.cos(h)*ahead);
  model.rotation.y=h;
  const animal=model.userData.animal;
  if(animal){
    const weights=animal.morphTargetInfluences;
    const t=(actor.phase/(2*Math.PI)%1)*weights.length, index=Math.floor(t);
    weights.fill(0);
    weights[index]=actor.stride*(1-t+index);
    weights[(index+1)%weights.length]=actor.stride*(t-index);
  }
}
