// The character page: the player's design, every dial of it, and the body it makes.
import * as THREE from './vendor/three.module.min.js';
import { createBodyShop } from './body.js';
import { createBodyMesh } from './body-mesh.js';
import { createMotion, createAnimator, fitPose } from './body-motion.js';
import { previewSeats } from './seating.js';
import { writeMovements } from './body-moves.js';
import { FIELDS, DEFAULT_DESIGN, loadDesign, saveDesign, randomDesign, tidy } from './body-designs.js';

const el = id => document.getElementById(id), canvas = el('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x829294);
const camera = new THREE.PerspectiveCamera(30, 1, .05, 50);
scene.add(new THREE.HemisphereLight(0xdfe9f0, 0x5b5348, 1.5));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.6); sun.position.set(2.2, 4, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -.5 }); sun.shadow.bias = -.0005; scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd4ff, .7); fill.position.set(-3, 2, -2); scene.add(fill);
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x6f7d7e, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const meta = await (await fetch('./motion.json')).json();
const moves = writeMovements(createMotion(meta, new Int16Array(await (await fetch('./motion.bin')).arrayBuffer())));
const grow = createBodyShop(meta), animator = createAnimator(moves), fitted = { q: [], pelvis: [0, 0, 0] };
let body = null, design = loadDesign(), request = 0, movement = 'idle', frozen = null, saved = true;
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
    body = createBodyMesh(built); scene.add(body.mesh);
    el('status').textContent = '';
    return { vertices: built.position.length / 3, height: built.height };
  });
}
let timer = 0;
function changed(quick = true) {
  saved = false; el('save').textContent = 'Save'; clearTimeout(timer);
  if (quick) { regrow('near'); timer = setTimeout(() => regrow('close'), 450); } else regrow('close');
}

// --- The dials ------------------------------------------------------------------------------
const number = (key, value) => key === 'age' ? String(Math.round(value)) : key === 'height' ? value.toFixed(2) : (value > 0 ? '+' : '') + Math.round(value * 100);
function build() {
  const host = el('fields'); host.textContent = '';
  FIELDS.forEach(({ group, sliders = [], choices = [], colours = [] }, index) => {
    const section = document.createElement('details'); section.open = index === 0 || index >= 6;
    section.append(Object.assign(document.createElement('summary'), { textContent: group }));
    for (const [key, text, list] of colours) {
      const row = document.createElement('div'); row.className = 'swatches'; row.append(Object.assign(document.createElement('span'), { textContent: text }));
      const mark = () => { for (const button of row.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.c === design[key])); custom.value = design[key] || list[0]; };
      for (const colour of list) { const button = document.createElement('button'); button.style.setProperty('--c', colour); button.dataset.c = colour; button.title = colour; button.setAttribute('aria-label', `${text} ${colour}`); button.addEventListener('click', () => { design[key] = colour; mark(); changed(false); }); row.append(button); }
      const custom = Object.assign(document.createElement('input'), { type: 'color', title: 'Any colour' }); custom.setAttribute('aria-label', `${text}: any colour`);
      custom.addEventListener('input', () => { design[key] = custom.value; mark(); changed(); }); row.append(custom); mark(); section.append(row);
    }
    for (const [key, text, list] of choices) {
      const label = document.createElement('label'); label.className = 'pick'; label.append(text);
      const select = document.createElement('select'); for (const option of list) select.append(new Option(option, option));
      select.value = design[key]; select.addEventListener('change', () => { design[key] = select.value; changed(false); }); label.append(select); section.append(label);
    }
    for (const [key, text, low, high, step] of sliders) {
      const label = document.createElement('label'); label.append(text);
      const value = design[key] ?? 0, input = Object.assign(document.createElement('input'), { type: 'range', min: low, max: high, step, value }), shown = Object.assign(document.createElement('output'), { textContent: number(key, value) });
      input.addEventListener('input', () => { design[key] = Number(input.value); shown.textContent = number(key, design[key]); changed(); });
      label.append(input, shown); section.append(label);
    }
    host.append(section);
  });
}
build();
for (const id of [...moves.clips.keys()].sort()) el('movement').append(new Option(id, id));
el('movement').value = 'idle';
el('movement').addEventListener('change', () => { movement = el('movement').value; clock = 0; frozen = null; });
el('random').addEventListener('click', () => { design = randomDesign(); build(); changed(false); });
el('reset').addEventListener('click', () => { design = { ...DEFAULT_DESIGN }; build(); changed(false); });
el('save').addEventListener('click', () => { saveDesign(design); saved = true; el('save').textContent = 'Saved'; });
el('view-body').addEventListener('click', () => Object.assign(view, { target: [0, .95, 0], distance: 5.2, pitch: .08 }));
el('view-face').addEventListener('click', () => Object.assign(view, { target: [0, (body?.rig.height || 1.76) - .13, 0], distance: 1.05, pitch: .02 }));
addEventListener('beforeunload', event => { if (!saved) { event.preventDefault(); event.returnValue = ''; } });

// --- Looking at it ----------------------------------------------------------------------------
let drag = null;
canvas.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => { if (!drag) return; view.yaw -= (event.clientX - drag.x) * .008; view.pitch = Math.max(-.3, Math.min(1.1, view.pitch + (event.clientY - drag.y) * .005)); drag = { x: event.clientX, y: event.clientY }; });
for (const name of ['pointerup', 'pointercancel']) canvas.addEventListener(name, () => { drag = null; });
canvas.addEventListener('wheel', event => { event.preventDefault(); view.distance = Math.max(.6, Math.min(8, view.distance * Math.exp(event.deltaY * .001))); }, { passive: false });
canvas.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') view.yaw -= .15; else if (event.key === 'ArrowRight') view.yaw += .15; });

let clock = 0, before = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - before) / 1000); before = now;
  if (body && !frozen) {
    clock += dt;
    const clip = moves.clip(movement), pose = movement === 'idle' ? animator.update(dt, { speed: 0 }) : moves.sample(movement, clip.loop ? clock : clock % (clip.seconds + .6));
    body.pose(fitPose(moves, body.rig, pose, fitted, previewSeats[movement]));
  }
  draw(); requestAnimationFrame(frame);
}
// What the checks drive this page with.
window.character = {
  THREE, scene, view, draw, moves,
  set(next, detail = 'close') { design = tidy(next); for (const key of Object.keys(next)) if (!(key in design)) design[key] = next[key]; build(); const t = performance.now(); return regrow(detail).then(info => ({ ...info, ms: Math.round(performance.now() - t) })); },
  get body() { return body; },
  look(next) { Object.assign(view, next); draw(); },
  pose(id, time) { frozen = [id, time]; body.pose(fitPose(moves, body.rig, moves.sample(id, time), fitted, previewSeats[id])); draw(); return moves.clip(id).seconds; },
};
await regrow('close');
requestAnimationFrame(frame);
window.ready = true;
