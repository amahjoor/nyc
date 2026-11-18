// A bench for looking at people: one or a row of them, from a design given in the address.
//   ?d=<json design>[&d=...]  designs (a row if several)   &view=body|face|bust   &clip=idle|walk|modelled   &t=seconds   &yaw=radians
import * as THREE from './vendor/three.module.min.js';
import { loadHuman } from './human.js';
import { createHumanMesh } from './human-mesh.js';
import { createMotion, fitPose } from './body-motion.js';
import { previewSeats } from './seating.js';
import { writeMovements } from './body-moves.js';
import { somebody, lookOf, mulberry } from './human-looks.js';

const canvas = document.getElementById('view'), query = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x829294);
const camera = new THREE.PerspectiveCamera(28, 1, .05, 60);
scene.add(new THREE.HemisphereLight(0xdfe9f0, 0x5b5348, 1.5));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.6); sun.position.set(2.2, 4, 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 2.5, bottom: -.5 }); sun.shadow.bias = -.0005; scene.add(sun);
const fill = new THREE.DirectionalLight(0xbfd4ff, .7); fill.position.set(-3, 2, -2); scene.add(fill);
const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshStandardMaterial({ color: 0x6f7d7e, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const meta = await (await fetch('./motion.json')).json();
const moves = writeMovements(createMotion(meta, new Int16Array(await (await fetch('./motion.bin')).arrayBuffer())));
const human = await loadHuman(meta);
const designs = query.getAll('d').map(text => JSON.parse(text));
// &n=8&seed=3&shares=313,208,145,284,49: that many people nobody designed, from a block with that mix.
if (query.get('n')) { const random = mulberry(Number(query.get('seed') || 1)), shares = (query.get('shares') || '313,208,145,284,49').split(',').map(Number); for (let i = 0; i < Number(query.get('n')); i++) designs.push(somebody(random, human, { shares })); }
if (!designs.length) designs.push({ sex: 0, age: 30, european: 1, wear: ['suit/male_casualsuit02', 'shoes/shoes02', 'hair/short02', 'eyes/high-poly', 'brows/eyebrow001', 'lashes/eyelashes01', 'teeth/teeth_base'], look: { skin: 'young_lightskinned_male_diffuse.webp' } });
const clip = query.get('clip') || 'idle', time = Number(query.get('t') || 0), people = [];
designs.forEach((design, i) => {
  const dressed = design.wear ? { wear: design.wear, look: design.look || {} } : lookOf(design, human);
  const built = human.build({ ...design, wear: dressed.wear }, { detail: query.get('detail') || 'close' }), body = createHumanMesh(built, dressed.look);
  body.marks = built.marks; body.mesh.position.x = (i - (designs.length - 1) / 2) * (query.get('view') === 'face' ? .42 : .9); scene.add(body.mesh); people.push(body);
  if (clip === 'modelled') body.modelled(); else if (clip === 'rest') body.rest();
  else { const pose = moves.sample(clip, time); body.pose(fitPose(moves, body.rig, pose, undefined, previewSeats[clip])); }
});
const view = query.get('view') || 'body', tall = people[0].rig.height, yaw = Number(query.get('yaw') || .35);
const eye = people[0].marks.eye_l[1];
const target = view === 'face' ? [0, eye - .02, .05] : view === 'bust' ? [0, eye - .12, 0] : [0, tall * .52, 0];
const distance = Number(query.get('dist')) || (view === 'face' ? .95 + designs.length * .28 : view === 'bust' ? 2.3 : 4.6 + designs.length * .75);
function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  camera.position.set(target[0] + Math.sin(yaw) * distance, target[1] + (view === 'body' ? .25 : .03), target[2] + Math.cos(yaw) * distance); camera.lookAt(...target);
  renderer.render(scene, camera);
}
let frames = 0; (function loop() { draw(); if (++frames > 20) window.ready = true; requestAnimationFrame(loop); })();
window.lab = { human, people, scene, camera, renderer, designs };
