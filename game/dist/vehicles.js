import * as THREE from './vendor/three.module.min.js';
import { catalogVehicles, vehicleName } from './fleet.js';
import { decodeVehicleMesh } from './vehicle-assets.js';
import { generateVehicle } from './vehicle-generator.js';
import { designFor } from './vehicle-designs.js';
import { renderStats } from './vehicle-stats.js';
import { carPerformance, describePowertrain } from './vehicle-performance.js';
import { createCar } from './world.js';
import { BOARDINGS, TRANSPORT } from './transport-catalog.js';
import { createTransportModel } from './transport-models.js';

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
  scene.background = new THREE.Color(0x374146);
  scene.fog = new THREE.FogExp2(0x374146, .06);
  // Long overhead softboxes give the roof and shoulder lines distinct
  // reflections. HDR values preserve bright strips in the clear coat.
  const width = 256, height = 128, pixels = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    const softbox = (cx, cy, sx, sy) => Math.exp(-(((u-cx)/sx)**8 + ((v-cy)/sy)**8));
    const key = 5.5*softbox(.64,.70,.17,.034), strip = 3.2*softbox(.19,.53,.09,.017);
    const fill = .12 + 1.1*softbox(.92,.68,.07,.16) + .30*v;
    const i = (y*width+x)*4;
    for (const [k, light] of [fill+key+strip*.77,fill+key*.95+strip*.9,fill+key*.85+strip].entries())
      pixels[i+k] = THREE.DataUtils.toHalfFloat(light);
    pixels[i+3] = THREE.DataUtils.toHalfFloat(1);
  }
  const reflection = new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat,THREE.HalfFloatType);
  reflection.mapping = THREE.EquirectangularReflectionMapping; reflection.needsUpdate = true;
  scene.environment = reflection;
  scene.add(new THREE.HemisphereLight(0xe2efff, 0x49423c, .85));
  const sun = new THREE.DirectionalLight(0xfff1d9, 2.25);
  sun.position.set(3, 7, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 18 });
  sun.shadow.normalBias = .008; scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0x455055, roughness: .85 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const contact = document.createElement('canvas'); contact.width = contact.height = 128;
  const ctx = contact.getContext('2d'), shade = ctx.createRadialGradient(64,64,12,64,64,64);
  shade.addColorStop(0,'rgba(0,0,0,.72)'); shade.addColorStop(.62,'rgba(0,0,0,.5)'); shade.addColorStop(1,'transparent');
  ctx.fillStyle = shade; ctx.fillRect(0,0,128,128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8,5.8),new THREE.MeshBasicMaterial({
    map:new THREE.CanvasTexture(contact),transparent:true,depthWrite:false }));
  shadow.rotation.x = -Math.PI/2; shadow.position.y = .008; scene.add(shadow);
  const camera = new THREE.PerspectiveCamera(31, 1, .1, 120);
  let yaw = .83, elevation = .25, car, focusY = .75;
  function render() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    const radius = Math.max(7.25, 6.15 / camera.aspect);
    camera.position.set(Math.sin(yaw) * Math.cos(elevation) * radius, focusY+.05 + Math.sin(elevation) * radius, Math.cos(yaw) * Math.cos(elevation) * radius);
    camera.lookAt(0, focusY, 0); renderer.render(scene, camera);
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
  return (mesh, aim = .75) => {
    if (car) scene.remove(car);
    car = mesh; focusY = aim; if (car) scene.add(car); render();
  };
}

function link(label, href) {
  const a = document.createElement('a'); a.textContent = label; a.href = href; return a;
}

async function preview(v) {
  const token = ++request;
  const asset = v.asset || designFor(v.make,v.model,v.year,v.shape);
  el('name').textContent = vehicleName(v);
  const zip = el('area').value;
  el('population').textContent = zip ? count(areaWeights.get(v.index) || 0) + ' registrations in ZIP ' + zip + ' · ' + count(v.total) + ' citywide for this year and body.'
    : count(v.total) + ' NYC passenger registrations for this model year and body.';
  el('stock-specs').hidden = !v.performance;
  if (v.performance) {
    renderStats(el('stock-stats'),v.performance.handling);
    el('stock-powertrain').textContent = describePowertrain(v.performance);
    el('stock-basis').textContent = v.performance.reference
      ? 'Stock top speed based on ' + v.performance.reference + '.'
      : 'Estimated stock performance for this model year.';
  }
  const size = asset?.design && [asset.design.L, asset.design.W, asset.design.H].map(m => m.toFixed(2)).join(' × ') + ' m';
  el('credit').replaceChildren(...(asset.generated ? [asset.known ? 'Drawn by the game for the ' + asset.years[0] + '–' + Math.min(asset.years[1], new Date().getFullYear() + 1) + ' generation, ' + size + ', with the make’s grille and lamps of those years. A likeness, not a survey of the car.'
      : 'Drawn by the game as a typical ' + shapes[v.shape] + ' with the make’s grille and lamps of its years. This model’s own dimensions are not in the game yet.']
    : ['Exterior for ' + asset.years.join('–') + '. ', link(asset.title, asset.source), ' by ' + asset.author + '. ', link(asset.license, asset.licenseUrl)]));
  if (!display) return;
  function show(mesh, status) { if (request === token) { display(mesh ? createCar({ shape:v.shape,color:tint,model:mesh }) : null); el('status').textContent = status; } }
  try {
    if (!cache.has(asset.id)) {
      show(null, 'Loading exterior…');
      cache.set(asset.id, asset.generated ? Promise.resolve().then(() => generateVehicle(asset)) : getFile(asset.url).then(r => r.arrayBuffer()).then(buffer => decodeVehicleMesh(buffer, asset)));
    }
    show(await cache.get(asset.id), '');
  } catch {
    cache.delete(asset.id);
    if (request === token && !asset.generated) show(generateVehicle(designFor(v.make,v.model,v.year,v.shape)), 'Showing the generated exterior.');
    else show(null, 'Exterior unavailable.');
  }
}

function options(id, entries, current) {
  const select = el(id);
  select.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
  select.value = current;
}

async function start() {
  const json = async url => (await getFile(url)).json();
  const [data, art, performance] = await Promise.all([
    json('./vehicle-catalog.json'), json('./assets/vehicles/index.json'), json('./vehicle-performance.json').catch(() => null),
  ]);
  const vehicles = catalogVehicles(data, art.models, designFor, performance?.variants?.length === data.variants.length ? performance : null);
  for (const car of vehicles) car.performance ??= carPerformance(car, null, car.asset?.design);
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
  const totals = el('summary').textContent;
  options('city-transport',Object.entries(TRANSPORT).map(([id,spec]) => [id,spec.name]),'helicopter');
  function collection() {
    const transport = el('collection').value === 'transport';
    el('transport-filter').hidden = !transport;
    for (const id of ['passenger-filters','passenger-credits','passenger-ranking']) el(id).hidden = transport;
    el('summary').textContent = transport ? 'Choose a vehicle to see its exterior, boarding points and controls.' : totals;
    if (!transport) { preview(selected); return; }
    ++request;
    const type = el('city-transport').value, spec = TRANSPORT[type];
    el('stock-specs').hidden = true;
    el('name').textContent = spec.name;
    el('population').textContent = BOARDINGS.filter(s=>s.type===type).map(s=>s.place).join(' / ');
    el('credit').textContent = spec.controls;
    if (!display) return;
    const mesh = createTransportModel(type), bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const scale = Math.min(4.6/Math.max(size.x,size.z),2.7/size.y);
    mesh.scale.setScalar(scale); mesh.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    display(mesh,size.y*scale*.5); el('status').textContent = '';
  }
  el('collection').onchange = collection;
  el('city-transport').onchange = collection;
  if (location.hash === '#transport') { el('collection').value = 'transport'; collection(); }
}
start().catch(() => { el('summary').textContent = 'The vehicle catalog could not be loaded.'; });
