// The character page: the player's design, every dial of it, and the body it makes.
import * as THREE from './vendor/three.module.min.js';
import { createHumanShop } from './human-shop.js';
import { createHumanMesh } from './human-mesh.js';
import { createMotion, createAnimator, fitPose, WALK_STYLES, walkClip } from './body-motion.js';
import { previewSeats } from './seating.js';
import { WALK_SPEED, JOG_SPEED, RUN_SPEED } from './character-physics.js';
import { writeMovements } from './body-moves.js';
import { loadPerson, savePerson, tidyPerson, migratePerson } from './human-designs.js';
import { somebody, EYES, TOP_COLOURS, HAIR_COLOURS } from './human-looks.js';
import { SKIN_TONES } from './body-designs.js';
import { BEARDS, GLASSES, BAGS } from './body.js';
import { FASHION_LOOKS } from './fashion.js';

const el = id => document.getElementById(id), canvas = el('view');
// The pause menu shows this page in a frame, over the paused city.
const embedded = new URLSearchParams(location.search).has('embed');
if (embedded) document.documentElement.classList.add('embed');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: embedded });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = embedded ? null : new THREE.Color(0x829294);
const camera = new THREE.PerspectiveCamera(30, 1, .05, 50);
scene.add(new THREE.HemisphereLight(0xdfe9f0, 0x5b5348, 1.5));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.6); sun.position.set(2.2, 4, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -.5 }); sun.shadow.bias = -.0005; scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd4ff, .7); fill.position.set(-3, 2, -2); scene.add(fill);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), embedded ? new THREE.ShadowMaterial({ opacity: .4 }) : new THREE.MeshStandardMaterial({ color: 0x6f7d7e, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const meta = await (await fetch('./motion.json')).json();
const moves = writeMovements(createMotion(meta, new Int16Array(await (await fetch('./motion.bin')).arrayBuffer())));
const grow = createHumanShop(meta), animator = createAnimator(moves), fitted = { q: [], pelvis: [0, 0, 0] };
let body = null, design = loadPerson(), request = 0, movement = 'idle', frozen = null, saved = true;
const view = { target: [0, .95, 0], distance: 5.2, yaw: .5, pitch: .08 };

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  camera.position.set(view.target[0] + Math.sin(view.yaw) * Math.cos(view.pitch) * view.distance, view.target[1] + Math.sin(view.pitch) * view.distance, view.target[2] + Math.cos(view.yaw) * Math.cos(view.pitch) * view.distance);
  camera.lookAt(...view.target); renderer.render(scene, camera);
}
/** Grow the body the design asks for: a quick rough one at once, and the finished one when the dials are let go. */
function regrow(detail = 'close') {
  const mine = ++request; el('status').textContent = 'Growing…';
  return grow(design, detail).then(built => {
    if (mine !== request) return null;
    if (body) { scene.remove(body.mesh); body.dispose(); }
    body = createHumanMesh(built, built.look); scene.add(body.mesh);
    el('status').textContent = '';
    return { vertices: built.pieces.reduce((n,p)=>n+p.position.length/3,0), height: built.height };
  });
}
let timer = 0, outfitSelect;
function syncOutfit(){
  const matching=FASHION_LOOKS.find(look=>Object.entries(look.clothes).every(([k,v])=>(design[k]??null)===v));
  outfitSelect.value=matching?.name || '';
}
function changed(quick = true) {
  syncOutfit(); renderOutfits();
  saved = embedded && savePerson(design); el('save').textContent = saved ? 'Saved' : 'Save'; clearTimeout(timer);
  if (quick) timer = setTimeout(() => regrow('close'), 100); else regrow('close');
}

// --- Outfits: the looks the city sells, and the player's own -------------------------------
const OUTFITS_KEY = 'nyc.outfits', MAX_OUTFITS = 24;
const CLOTHES = ['top', 'bottom', 'shoes', 'hat', 'glasses', 'bag', 'topColour', 'bottomColour', 'shoeColour', 'hatColour', 'trimColour'];
const OCCASIONS = [['casual', 'Everyday'], ['business', 'Tailoring'], ['athletic', 'Sport']];
function loadOutfits() {
  try {
    const list = JSON.parse(localStorage.getItem(OUTFITS_KEY) || '[]');
    return Array.isArray(list) ? list.filter(o => typeof o?.name === 'string' && o.clothes && typeof o.clothes === 'object').slice(0, MAX_OUTFITS) : [];
  } catch { return []; }
}
function storeOutfits(list) { try { localStorage.setItem(OUTFITS_KEY, JSON.stringify(list)); return true; } catch { return false; } }
const wearing = clothes => Object.entries(clothes).every(([key, value]) => (design[key] ?? null) === (value ?? null));
function wear(clothes) {
  const next = tidyPerson({ ...design, ...clothes });
  design = { ...design, ...Object.fromEntries(Object.keys(clothes).map(key => [key, next[key]])) };
  build(); changed(false);
}
function outfitRow(name, clothes, remove) {
  const row = document.createElement('div'); row.className = 'outfit';
  const button = Object.assign(document.createElement('button'), { type: 'button', textContent: name });
  button.setAttribute('aria-pressed', String(wearing(clothes))); button.addEventListener('click', () => wear(clothes));
  row.append(button);
  if (remove) {
    const cut = Object.assign(document.createElement('button'), { type: 'button', className: 'remove', textContent: '×' });
    cut.setAttribute('aria-label', 'Delete ' + name); cut.addEventListener('click', remove); row.append(cut);
  }
  return row;
}
function renderOutfits() {
  const mine = loadOutfits(), host = el('my-outfits'), presets = el('preset-outfits');
  host.textContent = ''; presets.textContent = '';
  if (!mine.length) host.append(Object.assign(document.createElement('p'), { className: 'empty', textContent: 'Nothing saved yet.' }));
  mine.forEach((outfit, i) => host.append(outfitRow(outfit.name, outfit.clothes, () => { mine.splice(i, 1); storeOutfits(mine); renderOutfits(); })));
  el('save-outfit').disabled = mine.length >= MAX_OUTFITS;
  for (const [occasion, title] of OCCASIONS) {
    presets.append(Object.assign(document.createElement('h3'), { textContent: title }));
    for (const look of FASHION_LOOKS.filter(look => look.occasion === occasion)) presets.append(outfitRow(look.name, look.clothes));
  }
}
el('save-outfit').addEventListener('click', () => {
  const mine = loadOutfits(), used = mine.map(o => Number(o.name.match(/^Outfit (\d+)$/)?.[1]) || 0);
  mine.push({ name: 'Outfit ' + (Math.max(0, ...used) + 1), clothes: Object.fromEntries(CLOTHES.map(key => [key, design[key] ?? null])) });
  el('status').textContent = storeOutfits(mine) ? '' : 'Browser storage is unavailable.';
  renderOutfits();
});
for (const [id, other, panel, hide] of [['side-outfits', 'side-design', 'wardrobe', 'designer'], ['side-design', 'side-outfits', 'designer', 'wardrobe']]) {
  el(id).addEventListener('click', () => { el(id).setAttribute('aria-pressed', 'true'); el(other).setAttribute('aria-pressed', 'false'); el(panel).hidden = false; el(hide).hidden = true; });
}
if (embedded) addEventListener('keydown', event => {
  if (event.target.closest?.('select, input') && event.code !== 'Escape') return;
  if (['Escape', 'KeyQ', 'KeyE'].includes(event.code)) { event.preventDefault(); parent.postMessage({ type: 'pause-key', code: event.code }, location.origin); }
});

// --- The dials ------------------------------------------------------------------------------
const catalog = await (await fetch('./human/human.json')).json();
const {dials} = catalog.body;
const list = (kind, slot) => ['none', ...catalog.parts.filter(p => p.kind === kind && (!slot || p.slot === slot && !/\d$/.test(p.id))).map(p => p.id)];
const labelOf = name => name.replace(/_/g,' ').replace(/([a-z])(\d+)/g,'$1 $2').replace(/-/g,' ').replace(/^./, c=>c.toUpperCase());
const FIELDS = [
  {group:'Frame', choices:[['walkStyle','Walking style',WALK_STYLES]], sliders:[['sex','Masculine to feminine',0,1,.01],['age','Age',6,95,1],['height','Height (m)',1.1,2.15,.01],
    ['weight','Build',-1,1,.01],['muscle','Muscle',-1,1,.01],['chest','Bust',-1,1,.01],['firm','Firmness',-1,1,.01],
    ['african','African ancestry',0,1,.01],['asian','Asian ancestry',0,1,.01],['european','European ancestry',0,1,.01]]},
  {group:'Skin, hair and eyes', choices:[['hair','Hair style',list('hair')],['brows','Eyebrows',list('brows').slice(1)],['eyes','Eyes',EYES],['beard','Facial hair',BEARDS]],
    colours:[['tone','Skin',SKIN_TONES],['hairColour','Hair colour',Object.values(HAIR_COLOURS)],['browColour','Brow colour',Object.values(HAIR_COLOURS)]]},
  {group:'Clothes',choices:[['top','Top',list('garment','top')],['bottom','Bottom',list('garment','bottom')],
    ['shoes','Shoes',list('shoes')],['hat','Hat',list('hat')],['glasses','Glasses',GLASSES],['bag','Bag',BAGS]],colours:[...['top','bottom','shoe','hat'].map(key=>[key+'Colour',labelOf(key)+' colour',TOP_COLOURS,true]),['trimColour','Bag colour',TOP_COLOURS,true]]},
  ...Array.from(new Set(dials.map(d=>d.group)), group=>({group:labelOf(group), measured:true,
    sliders:dials.filter(d=>d.group===group).map(d=>[d.id,labelOf(d.id.replace(/-decr-incr$/,'')),d.low?-1:0,d.high?1:0,.01])})),
];
const number = (key, value) => key === 'age' ? String(Math.round(value)) : key === 'height' ? value.toFixed(2) : (value > 0 ? '+' : '') + Math.round(value * 100);
function build() {
  const host = el('fields'); host.textContent = '';
  FIELDS.forEach(({ group, sliders = [], choices = [], colours = [], measured }, index) => {
    const section = document.createElement('details'); section.open = index < 3;
    section.append(Object.assign(document.createElement('summary'), { textContent: group }));
    if(group==='Clothes'){
      const label=document.createElement('label');label.className='pick';label.append('Outfit');
      const select=outfitSelect=document.createElement('select');
      select.append(new Option('Individual pieces',''));
      select.options[0].disabled=true;
      for(const [occasion,title] of [['casual','Everyday'],['business','Tailoring'],['athletic','Sport']]){
        const group=document.createElement('optgroup');group.label=title;
        for(const look of FASHION_LOOKS.filter(look=>look.occasion===occasion))group.append(new Option(look.name,look.name));
        select.append(group);
      }
      syncOutfit();
      select.addEventListener('change',()=>{
        Object.assign(design,FASHION_LOOKS.find(look=>look.name===select.value).clothes);
        build();changed(false);
      });
      label.append(select);section.append(label);
    }
    for (const [key, text, list, optional] of colours) {
      const row = document.createElement('div'); row.className = 'swatches'; row.append(Object.assign(document.createElement('span'), { textContent: text }));
      const mark = () => { for (const button of row.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.c === design[key])); custom.value = design[key] || list[0]; };
      for (const colour of list) { const button = document.createElement('button'); button.style.setProperty('--c', colour); button.dataset.c = colour; button.title = colour; button.setAttribute('aria-label', `${text} ${colour}`); button.addEventListener('click', () => { design[key] = colour; mark(); changed(false); }); row.append(button); }
      const custom = Object.assign(document.createElement('input'), { type: 'color', title: 'Any colour' }); custom.setAttribute('aria-label', `${text}: any colour`);
      custom.addEventListener('input', () => { design[key] = custom.value; mark(); changed(); }); row.append(custom);
      if (optional) {
        const original = document.createElement('button'); original.className = 'original'; original.textContent = 'Fabric colour';
        original.addEventListener('click', () => { design[key] = null; mark(); changed(false); }); row.append(original);
      }
      mark(); section.append(row);
    }
    for (const [key, text, list] of choices) {
      const label = document.createElement('label'); label.className = 'pick'; label.append(text);
      const select = document.createElement('select'); for (const option of list) select.append(new Option(labelOf(option), option));
      select.value = design[key]; select.addEventListener('change', () => { design[key] = select.value;
        if(key==='walkStyle'){movement='walk';el('movement').value='walk';frozen=null;}
        changed(false); }); label.append(select); section.append(label);
    }
    for (const [key, text, low, high, step] of sliders) {
      const label = document.createElement('label'); label.append(text);
      const values = measured ? design.dials : design;
      const value = values[key] ?? 0, input = Object.assign(document.createElement('input'), { type: 'range', min: low, max: high, step, value }), shown = Object.assign(document.createElement('output'), { textContent: number(key, value) });
      input.addEventListener('input', () => { values[key] = Number(input.value); shown.textContent = number(key, values[key]); changed(); });
      label.append(input, shown); section.append(label);
    }
    host.append(section);
  });
}
build(); renderOutfits();
for (const id of [...moves.clips.keys()].sort()) el('movement').append(new Option(id, id));
el('movement').value = 'idle';
el('movement').addEventListener('change', () => { movement = el('movement').value; clock = 0; frozen = null; });
el('random').addEventListener('click', () => {
  design = tidyPerson(somebody(Math.random, {dials}));
  if(Math.random()<.65)Object.assign(design,FASHION_LOOKS[Math.floor(Math.random()*FASHION_LOOKS.length)].clothes);
  build(); changed(false);
});
el('reset').addEventListener('click', () => { design = tidyPerson(null); build(); changed(false); });
el('save').addEventListener('click', () => { saved = savePerson(design); el('save').textContent = saved ? 'Saved' : 'Save'; el('status').textContent = saved ? '' : 'Browser storage is unavailable.'; });
el('view-body').addEventListener('click', () => Object.assign(view, { target: [0, .95, 0], distance: 5.2, pitch: .08 }));
el('view-face').addEventListener('click', () => Object.assign(view, { target: [0, (body?.rig.height || 1.76) - .13, 0], distance: 1.05, pitch: .02 }));
addEventListener('beforeunload', event => { if (!saved && !embedded) { event.preventDefault(); event.returnValue = ''; } });

// --- Looking at it ----------------------------------------------------------------------------
let drag = null;
canvas.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => { if (!drag) return; view.yaw -= (event.clientX - drag.x) * .008; view.pitch = Math.max(-.3, Math.min(1.1, view.pitch + (event.clientY - drag.y) * .005)); drag = { x: event.clientX, y: event.clientY }; });
for (const name of ['pointerup', 'pointercancel']) canvas.addEventListener(name, () => { drag = null; });
canvas.addEventListener('wheel', event => { event.preventDefault(); view.distance = Math.max(.6, Math.min(8, view.distance * Math.exp(event.deltaY * .001))); }, { passive: false });
canvas.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') view.yaw -= .15; else if (event.key === 'ArrowRight') view.yaw += .15; });

const gaitSpeeds={idle:0,walk:WALK_SPEED,jog:JOG_SPEED,sprint:RUN_SPEED};
let clock = 0, before = performance.now();
function frame(now) {
  const dt = Math.min(.25, (now - before) / 1000); before = now;
  if (body && !frozen) {
    clock += dt;
    const clip = moves.clip(movement);
    const gaitSpeed = gaitSpeeds[movement];
    const pose = gaitSpeed !== undefined ? animator.update(dt,{speed:gaitSpeed,walkStyle:design.walkStyle,strideScale:body.rig.stride}) :
      moves.sample(movement, clip.loop ? clock : clock % (clip.seconds + .6));
    body.pose(fitPose(moves, body.rig, pose, fitted, previewSeats[movement]));
  }
  draw(); requestAnimationFrame(frame);
}
// What the checks drive this page with.
window.character = {
  THREE, scene, view, draw, moves,
  set(next, detail = 'close') { design = next.v === 2 ? tidyPerson(next) : migratePerson(next); build(); const t = performance.now(); return regrow(detail).then(info => ({ ...info, ms: Math.round(performance.now() - t) })); },
  get body() { return body; },
  get design() { return structuredClone(design); },
  look(next) { Object.assign(view, next); draw(); },
  pose(id, time) { frozen = [id, time]; body.pose(fitPose(moves, body.rig, moves.sample(id==='walk'?walkClip(design.walkStyle):id, time), fitted, previewSeats[id])); draw(); return moves.clip(id).seconds; },
};
await regrow('close');
requestAnimationFrame(frame);
window.ready = true;
