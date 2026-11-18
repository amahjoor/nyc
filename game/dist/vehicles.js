import * as THREE from './vendor/three.module.min.js';
import { catalogVehicles, vehicleName } from './fleet.js';
import { decodeVehicleMesh } from './vehicle-assets.js';
import { generateVehicle } from './vehicle-generator.js';
import { designFor } from './vehicle-designs.js';
import { createCar } from './world.js';

const el = id => document.getElementById(id);
const count = n => n.toLocaleString('en-US');
const shapes = { suv: 'SUV', sedan: 'sedan', minivan: 'minivan', hatch: 'hatchback', wagon: 'wagon', pickup: 'pickup', coupe: 'coupe', van: 'van' };
const paints = [['Steel blue', '#45718b'], ['White', '#e8e9e6'], ['Red', '#953b37'], ['Charcoal', '#454a50']];
let tint = paints[0][1], display, selected, request = 0;
const cache = new Map();
let areaWeights;

async function getFile(url) {
  const response = await fetch(url);
  if (!response.ok) throw Error('Could not load ' + url);
  return response;
}

function studio(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x829294);
  scene.fog = new THREE.FogExp2(0x829294, .065);
  const sky = document.createElement('canvas'); sky.width = 512; sky.height = 256;
  const ctx = sky.getContext('2d'), light = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [stop, color] of [[0, '#8fa4bb'], [.42, '#fbfcf7'], [.54, '#4b5a61'], [1, '#333c3d']]) light.addColorStop(stop, color);
  ctx.fillStyle = light; ctx.fillRect(0, 0, 512, 256);
  for (const x of [40, 180, 340]) { ctx.fillStyle = '#f8faf5'; ctx.fillRect(x, 65, 68, 53); }
  const reflection = new THREE.CanvasTexture(sky);
  reflection.mapping = THREE.EquirectangularReflectionMapping; reflection.colorSpace = THREE.SRGBColorSpace;
  scene.environment = reflection; scene.environmentIntensity = .85;
  scene.add(new THREE.HemisphereLight(0xf3fbff, 0xb6aaa2, 1.65));
  const sun = new THREE.DirectionalLight(0xfff4df, 2.4);
  sun.position.set(3, 7, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 18 });
  sun.shadow.normalBias = .012; scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0x697778, roughness: .95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const camera = new THREE.PerspectiveCamera(31, 1, .1, 120);
  let yaw = .83, elevation = .25, car;
  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const radius = Math.max(7.25, 6.15 / camera.aspect);
    camera.position.set(Math.sin(yaw) * Math.cos(elevation) * radius, .8 + Math.sin(elevation) * radius, Math.cos(yaw) * Math.cos(elevation) * radius);
    camera.lookAt(0, .75, 0); renderer.render(scene, camera);
  }
  function rotate(dx, dy) { yaw -= dx; elevation = Math.max(.055, Math.min(1.05, elevation + dy)); render(); }
  let previous;
  canvas.onpointerdown = e => { canvas.setPointerCapture(e.pointerId); previous = [e.clientX, e.clientY]; };
  canvas.onpointermove = e => {
    if (!previous) return;
    rotate((e.clientX - previous[0]) * .009, (e.clientY - previous[1]) * .006);
    previous = [e.clientX, e.clientY];
  };
  canvas.onlostpointercapture = () => { previous = null; };
  canvas.onkeydown = e => {
    const delta = { ArrowLeft: [.15, 0], ArrowRight: [-.15, 0], ArrowUp: [0, .08], ArrowDown: [0, -.08] }[e.key];
    if (delta) { e.preventDefault(); rotate(...delta); }
  };
  new ResizeObserver(render).observe(canvas);
  return (identity, model) => {
    if (car) scene.remove(car);
    car = createCar({ shape: identity.shape, color: tint, model }); scene.add(car); render();
  };
}

function link(label, href) {
  const a = document.createElement('a'); a.textContent = label; a.href = href; return a;
}

async function preview(v) {
  const token = ++request;
  const asset = v.asset;
  el('name').textContent = vehicleName(v);
  const zip = el('area').value;
  el('population').textContent = zip ? count(areaWeights.get(v.index) || 0) + ' registrations in ZIP ' + zip + ' · ' + count(v.total) + ' citywide for this year and body.'
    : count(v.total) + ' NYC passenger registrations for this model year and body.';
  const size = asset?.design && [asset.design.L, asset.design.W, asset.design.H].map(m => m.toFixed(2)).join(' × ') + ' m';
  el('credit').replaceChildren(...(!asset ? ['The game represents this model year with its shared ' + shapes[v.shape] + ' body.']
    : asset.generated ? [asset.known ? 'Drawn by the game for the ' + asset.years[0] + '–' + Math.min(asset.years[1], new Date().getFullYear() + 1) + ' generation, ' + size + ', with the make’s grille and lamps of those years. A likeness, not a survey of the car.'
      : 'Drawn by the game as a typical ' + shapes[v.shape] + ' with the make’s grille and lamps of its years. This model’s own dimensions are not in the game yet.']
    : ['Exterior for ' + asset.years.join('–') + '. ', link(asset.title, asset.source), ' by ' + asset.author + '. ', link(asset.license, asset.licenseUrl)]));
  if (!display) return;
  function show(mesh, status) { if (request === token) { display(v, mesh); el('status').textContent = status; } }
  if (!asset) { show(null, ''); return; }
  try {
    if (!cache.has(asset.id)) {
      show(null, 'Loading exterior…');
      cache.set(asset.id, asset.generated ? Promise.resolve().then(() => generateVehicle(asset)) : getFile(asset.url).then(r => r.arrayBuffer()).then(buffer => decodeVehicleMesh(buffer, asset)));
    }
    show(await cache.get(asset.id), '');
  } catch {
    cache.delete(asset.id); show(null, 'Exterior unavailable. Showing shared body.');
  }
}

function options(id, entries, current) {
  const select = el(id);
  select.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
  select.value = current;
}

async function start() {
  const [data, art] = await Promise.all(['./vehicle-catalog.json', './assets/vehicles/index.json'].map(async url => (await getFile(url)).json()));
  const vehicles = catalogVehicles(data, art.models, designFor);
  for (let i = 0; i < data.city.length; i += 2) {
    const v = vehicles[data.city[i]];
    if (v) { v.total = data.city[i + 1]; v.index = data.city[i]; }
  }
  // Input order is citywide frequency. The first variant of a model is its most common year/body.
  const byMake = new Map(), byAsset = new Map();
  for (const v of vehicles) {
    if (!byMake.has(v.make)) byMake.set(v.make, new Map());
    const models = byMake.get(v.make);
    if (!models.has(v.model)) models.set(v.model, []);
    models.get(v.model).push(v);
    if (v.asset && !v.asset.generated && !byAsset.has(v.asset.id)) byAsset.set(v.asset.id, v);
  }
  const makes = [...byMake.keys()].sort();
  el('summary').textContent = count(byMake.size) + ' makes and ' + count([...byMake.values()].reduce((n, models) => n + models.size, 0)) + ' models from ' + count(data.registrations) + ' NYC passenger registrations on ' + data.snapshot.date + '.';
  const drawn = new Set(vehicles.filter(v => v.asset?.generated).map(v => v.asset.id)).size;
  el('method').textContent = art.models.length + ' licensed 3D exteriors cover specific model years. ' + art.changes + ' The game draws the other ' + count(drawn) + ' exteriors itself, one for each generation of each model, from the car’s size and its make’s styling.';
  options('make', makes.map(s => [s, s]), makes[0]);
  options('exteriors', [['', 'Choose an exterior…'], ...[...byAsset.entries()].sort((a, b) => a[1].make.localeCompare(b[1].make)).map(([id, v]) => [id, v.make + ' ' + v.model + ' · ' + v.asset.years.join('–')])], '');
  function select(v) {
    selected = v;
    el('make').value = v.make;
    options('model', [...byMake.get(v.make).keys()].sort().map(s => [s, s]), v.model);
    const siblings = [...byMake.get(v.make).get(v.model)].sort((a, b) => b.year - a.year || b.total - a.total);
    options('variant', siblings.map(s => [s.index, s.year + ' · ' + shapes[s.shape]]), v.index);
    el('exteriors').value = v.asset && !v.asset.generated ? v.asset.id : '';
    preview(v);
  }
  el('make').onchange = e => select(byMake.get(e.target.value).values().next().value[0]);
  el('model').onchange = e => select(byMake.get(selected.make).get(e.target.value)[0]);
  el('variant').onchange = e => select(vehicles[+e.target.value]);
  el('exteriors').onchange = e => { if (e.target.value) select(byAsset.get(e.target.value)); };
  options('area', [['', 'All five boroughs'], ...Object.keys(data.zips).sort().map(zip => [zip, 'ZIP ' + zip])], '');
  function rankArea() {
    const pairs = el('area').value ? data.zips[el('area').value] : data.city;
    areaWeights = new Map();
    for (let i = 0; i < pairs.length; i += 2) if (pairs[i] >= 0) areaWeights.set(pairs[i], pairs[i + 1]);
    const rows = [...areaWeights].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 8).map(([index, n]) => {
      const v = vehicles[index], row = document.createElement('tr'), title = row.insertCell(), button = document.createElement('button');
      button.type = 'button'; button.textContent = vehicleName(v) + ' · ' + shapes[v.shape];
      button.onclick = () => { select(v); el('preview').scrollIntoView({ block: 'center' }); el('preview').focus({ preventScroll: true }); };
      title.append(button); row.insertCell().textContent = count(n); return row;
    });
    el('ranking').replaceChildren(...rows);
  }
  el('area').onchange = () => { rankArea(); preview(selected); };
  rankArea();
  for (const [name, value] of paints) {
    const label = document.createElement('label'), input = document.createElement('input'), dot = document.createElement('i');
    input.type = 'radio'; input.name = 'paint'; input.checked = value === tint; input.setAttribute('aria-label', name);
    label.title = name; dot.style.setProperty('--paint', value); label.append(input, dot); el('paints').append(label);
    input.onchange = () => { tint = value; preview(selected); };
  }
  try { display = studio(el('preview')); }
  catch { el('status').textContent = '3D preview needs WebGL.'; }
  select(byAsset.values().next().value || vehicles[0]);
}
start().catch(() => { el('summary').textContent = 'The vehicle catalog could not be loaded.'; });
