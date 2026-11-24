import * as THREE from './vendor/three.module.min.js';
import { POLICE_UNITS, UNIT } from './police-units.js';
import { ridingPose } from './police-details.js';
import { patrolAppearance } from './human-cast.js';
import { createMotion, fitPose } from './body-motion.js';
import { writeMovements } from './body-moves.js';
import { createHumanShop } from './human-shop.js';
import { createHumanMesh } from './human-mesh.js';
import { equipmentFor, placeEquipment, createPoliceHelicopter } from './police-equipment.js';

const el = id => document.getElementById(id);
const list = el('units'), search = el('query'), group = el('group'), canvas = el('view');
for (const name of new Set(POLICE_UNITS.map(unit => unit.bureau))) group.add(new Option(name,name));
let selected, token = 0, stage, redraw = () => {}, yaw = .38;
const posts = {street:'street beats', community:'community visits', precinct:'precinct visits', school:'school entrances',
  park:'park beats', parking:'kerbside parking checks', junction:'busy signalized junctions', road:'roadside duties', housing:'residential visits', case:'incident follow-up', air:'heliports',
  water:'harbor launches', waterfront:'waterfront visits', subway:'subway entrances'};
const searchNames = {esu:'SWAT tactical rescue',crc:'counterterrorism',k9:'K-9 K9 police dog', 'transit-canine':'K-9 K9 police dog',mounted:'horseback',scuba:'divers',highway:'motorcycle'};
function renderList() {
  const query = search.value.toLowerCase().trim();
  const matches = POLICE_UNITS.filter(unit => (!group.value || group.value === unit.bureau) &&
    [unit.id,unit.name,unit.duty,unit.uniform,searchNames[unit.id]].join(' ').toLowerCase().includes(query));
  list.replaceChildren(...matches.map(unit => {
    const link = document.createElement('a');
    link.textContent = unit.name; link.href = '#'+unit.id;
    if (unit === selected) link.setAttribute('aria-current','true');
    return link;
  }));
  el('count').textContent = matches.length ? matches.length+' of '+POLICE_UNITS.length+' assignments' : 'No matching units';
}
async function makeStage() {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30,1,.05,100);
  scene.background = new THREE.Color(0xb5c3bf);
  scene.add(new THREE.HemisphereLight(0xf0f6ff,0xcabda7,1.7));
  const sun = new THREE.DirectionalLight(0xffecd3,2.4); sun.position.set(2,4,3); scene.add(sun);
  const rim = new THREE.DirectionalLight(0xc5daee,1.4); rim.position.set(-3,3,-2); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(50,64),new THREE.MeshStandardMaterial({color:0x95a8a6}));
  floor.rotation.x = -Math.PI/2; floor.position.y = -.02; scene.add(floor);
  const [meta,bin] = await Promise.all([fetch('./motion.json').then(r=>r.json()),fetch('./motion.bin').then(r=>r.arrayBuffer())]);
  const moves = writeMovements(createMotion(meta,new Int16Array(bin))), shop = createHumanShop(meta,{moves});
  const state = {scene, camera, shop, moves, body:null, gear:null, target:new THREE.Vector3(0,.9,0), distance:4.4};
  // Redraw after textures arrive, while rotating, and when the viewport changes.
  let queued=false;
  function draw() {
    queued=false;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w || !h)return;
    if(w!==state.w || h!==state.h){
      state.w=w;state.h=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    }
    const d=state.distance*Math.max(1,1/camera.aspect), t=state.target;
    camera.position.set(t.x+d*Math.sin(yaw),t.y+d*.13,t.z+d*Math.cos(yaw));
    camera.lookAt(t);renderer.render(scene,camera);
  }
  redraw=()=>{if(!queued){queued=true;requestAnimationFrame(draw);}};
  new ResizeObserver(redraw).observe(canvas);
  THREE.DefaultLoadingManager.onLoad=redraw;
  return state;
}
async function selectUnit() {
  const id=location.hash.slice(1), unit=Object.hasOwn(UNIT,id)?UNIT[id]:UNIT.patrol;
  selected=unit; const request=++token;
  el('name').textContent=unit.name; el('bureau').textContent=unit.bureau; el('duty').textContent=unit.duty;
  el('source').href=unit.source;
  el('portrayal').textContent=unit.post==='office' ? 'Headquarters or training assignment · Directory preview' :
    'In-game assignment · '+posts[unit.post]+'. Uniforms and scenes are game interpretations.';
  el('status').textContent='Loading uniform…';
  renderList();
  try {
    const view=await (stage ||= makeStage());
    if(request!==token)return;
    if(view.body){view.scene.remove(view.body.mesh);view.body.dispose();view.body=null;}
    if(view.gear){view.gear.removeEventListener('animal-ready',redraw);view.scene.remove(view.gear);view.gear=null;}
    redraw();
    const look=patrolAppearance(unit.id,0,unit.id), built=await view.shop.member(look.member,'near');
    if(request!==token)return;
    const body=createHumanMesh(built,built.look), job=unit.activity;
    const ride=ridingPose(job,look.height), clip=ride?.clip || (job==='direct'?'reach':'idle');
    body.pose(fitPose(view.moves,body.rig,view.moves.sample(clip,ride?.18:.4)));
    const height=ride?.lift ?? (job==='boat'?1.05:0);
    body.mesh.position.y=height;
    view.scene.add(body.mesh);view.body=body;
    view.gear=equipmentFor(job);
    if(view.gear){
      placeEquipment(view.gear,{x:0,y:0,z:0,heading:0,phase:0,stride:0,post:{unit}});
      view.gear.addEventListener('animal-ready',redraw);view.scene.add(view.gear);
    }
    view.target.set(job==='dog'?.22:0,job==='boat'?1.35:(body.rig.height+height)*.52,job==='boat'?-.45:0);
    if(job==='flight'){
      view.gear=createPoliceHelicopter();
      view.gear.position.set(-1.8,1.55,-1.8);view.scene.add(view.gear);
      view.target.set(-1.0,1.7,-2.6);
    }
    view.distance=job==='flight'?17:job==='boat'?12:ride?6.3:4.25;
    yaw=job==='flight'?.87:job==='boat'||ride?1.04:.38;
    el('status').textContent='';canvas.dataset.unit=unit.id;redraw();
  } catch(error) {
    if(request===token)el('status').textContent='3D preview unavailable';
    console.error(error);
  }
}
search.addEventListener('input',renderList);group.addEventListener('change',renderList);
window.addEventListener('hashchange',selectUnit);
el('rotate').addEventListener('click',()=>{yaw+=Math.PI/4;redraw();});
let dragX;
canvas.addEventListener('pointerdown',e=>{dragX=e.clientX;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(dragX!==undefined){yaw-=(e.clientX-dragX)*.012;dragX=e.clientX;redraw();}});
canvas.addEventListener('lostpointercapture',()=>{dragX=undefined;});
selectUnit();
