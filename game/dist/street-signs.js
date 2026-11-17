// Traffic signals, pedestrian signals, stop signs, street-name signs and
// one-way arrows, as New York hangs them.
//
// The hardware is drawn from what stands on the city's corners: a galvanised
// octagonal pole on the far right of each approach with a mast arm over the
// roadway, yellow three-lamp heads with twelve-inch lenses, a pedestrian head
// showing an orange hand or a white walking figure, green street-name signs
// set parallel to the street they name, and black ONE WAY arrows beneath
// them. Which lamp is lit comes from signal-plan.js; where the hardware
// stands is worked out here from each junction's streets.
import * as THREE from './vendor/three.module.min.js';
import { vehicleAspect, crossingAspect } from './signal-plan.js';

const TAU = Math.PI * 2;
const mod = (value, n) => ((value % n) + n) % n;
const unit = angle => [Math.sin(angle), Math.cos(angle)];

/** Lens centres above the bottom of a three-lamp head, red on top: twelve-inch lenses. */
export const HEAD = { width: .36, height: 1.07, depth: .22, lens: .15, lamps: [.89, .535, .18] };
export const PEDESTRIAN_HEAD = { size: .46, depth: .16, height: 2.75 };
const MAST = { height: 6.5, pole: 7.3, reach: [3.6, 9] };
const SIGN_HEIGHT = 3.15, NAME = { width: 1.1, height: .24 }, ARROW = { width: .92, height: .31 }, STOP = { size: .76, height: 2.3 };

/**
 * Sign text the way the city sets it: "W 42 ST" becomes "W 42 St", avenues
 * are "Av", and names are in mixed case, as on signs made since 2012.
 */
export function signText(name) {
  const short = { AVENUE: 'Av', AVE: 'Av', STREET: 'St', ST: 'St', BOULEVARD: 'Blvd', BLVD: 'Blvd', PLACE: 'Pl', PL: 'Pl', ROAD: 'Rd', RD: 'Rd', PARKWAY: 'Pkwy', PKWY: 'Pkwy',
    DRIVE: 'Dr', DR: 'Dr', LANE: 'La', LA: 'La', COURT: 'Ct', CT: 'Ct', SQUARE: 'Sq', SQ: 'Sq', TERRACE: 'Ter', TER: 'Ter', EXPRESSWAY: 'Expwy', EXPY: 'Expwy', CONC: 'Concourse',
    BRIDGE: 'Br', BRG: 'Br', HIGHWAY: 'Hwy', HWY: 'Hwy', TURNPIKE: 'Tpke', TPKE: 'Tpke', PLAZA: 'Plz', PLZ: 'Plz', ALLEY: 'Alley', ALY: 'Alley' };
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.map((word, i) => {
    const upper = word.toUpperCase();
    // A leading "ST" is a saint; anywhere else it is a street.
    if (upper === 'ST' && i === 0 && words.length > 1) return 'St';
    if (short[upper] && i > 0) return short[upper];
    if (/^\d/.test(upper)) return upper.replace(/(ST|ND|RD|TH)$/, '');
    if (upper.length <= 2 && /^[NSEW]{1,2}$/.test(upper)) return upper;
    return upper[0] + upper.slice(1).toLowerCase();
  }).join(' ').slice(0, 22);
}

/**
 * Where a junction's hardware stands. `junction` is { x, z, plan, arms }
 * with arms as in signal-plan.js (angle out from the junction, width, name,
 * inbound, outbound, oneway). `raised(x, z)` says whether a point is on a
 * sidewalk, where that is known; a pole is nudged outward until it is.
 *
 * Returns positions in the plane; heights are added when drawn:
 *   corners     [{ x, z }] one for each pair of neighbouring streets
 *   signals     [{ x, z, heading, reach, across: [dx, dz], group, corner }] a mast for each approach
 *   crossings   [{ x, z, heading, group, corner }] pedestrian heads, `group` being the street crossed
 *   stops       [{ x, z, heading }] stop signs
 *   names       [{ x, z, heading, text }] street-name signs, readable from both sides
 *   arrows      [{ x, z, heading, right }] ONE WAY signs; `right` if the arrow points to the reader's right
 * `heading` is the way a face looks, toward whoever reads it.
 */
export function layoutJunction(junction, { raised = null } = {}) {
  const { x, z, plan, arms } = junction, layout = { corners: [], signals: [], crossings: [], stops: [], names: [], arrows: [] };
  if (!plan || !Array.isArray(arms)) return layout;
  const order = arms.map((arm, index) => ({ arm, index, angle: mod(arm.angle, TAU) })).filter(entry => plan.groups[entry.index] >= 0).sort((a, b) => a.angle - b.angle);
  if (order.length < 3) return layout;
  // A corner lies where the kerb lines of two neighbouring streets meet.
  for (let i = 0; i < order.length; i++) {
    const a = order[i], b = order[(i + 1) % order.length], turn = mod(b.angle - a.angle, TAU), sine = Math.sin(turn);
    if (turn > 2.62 || sine < .5) continue; // the flat side of a T: one kerb, no corner
    const ua = unit(a.angle), ub = unit(b.angle), alpha = b.arm.width / 2 / sine, beta = a.arm.width / 2 / sine;
    const outward = [ua[0] + ub[0], ua[1] + ub[1]], length = Math.hypot(...outward) || 1;
    let px = x + ua[0] * alpha + ub[0] * beta + outward[0] / length * 1.7, pz = z + ua[1] * alpha + ub[1] * beta + outward[1] / length * 1.7;
    // Corners are rounded, and outlines differ from centrelines: step back onto the sidewalk.
    if (raised) for (let step = 0; step < 6 && !raised(px, pz); step++) { px += outward[0] / length * .6; pz += outward[1] / length * .6; }
    layout.corners.push({ x: px, z: pz, between: [a.index, b.index], angles: [a.angle, b.angle] });
  }
  if (!layout.corners.length) return layout;
  const best = score => layout.corners.reduce((pick, corner) => { const value = score(corner.x - x, corner.z - z); return !pick || value > pick.value ? { corner, value } : pick; }, null).corner;
  const used = new Set();
  for (const { arm, index, angle } of order) {
    if (!arm.inbound) continue;
    const u = unit(angle), right = [Math.cos(angle), -Math.sin(angle)], group = plan.groups[index];
    if (plan.control === 'signal') {
      // Far side, driver's right: where the eye already is when waiting at the line.
      const corner = best((dx, dz) => dx * (-u[0] + right[0]) + dz * (-u[1] + right[1]));
      const reach = Math.max(MAST.reach[0], Math.min(MAST.reach[1], arm.width * .62));
      layout.signals.push({ x: corner.x, z: corner.z, heading: angle, reach, across: [-right[0], -right[1]], group, corner: layout.corners.indexOf(corner) });
      used.add(corner);
    } else if (plan.control === 'allway' || group === 1) {
      // Near side, driver's right, before the crossing.
      const corner = best((dx, dz) => dx * (u[0] + right[0]) + dz * (u[1] + right[1]));
      layout.stops.push({ x: corner.x, z: corner.z, heading: angle });
      used.add(corner);
    }
  }
  layout.corners.forEach((corner, n) => {
    const [a, b] = corner.between, [angleA, angleB] = corner.angles;
    if (plan.control === 'signal') {
      // Each corner shows a head to whoever is walking toward it on either crossing.
      layout.crossings.push({ x: corner.x, z: corner.z, heading: angleB + Math.PI, group: plan.groups[a], corner: n });
      layout.crossings.push({ x: corner.x, z: corner.z, heading: angleA + Math.PI, group: plan.groups[b], corner: n });
    }
    // Names and arrows on alternate corners, as the city spaces them; on every corner that already has a pole at a stop sign.
    if (n % 2 && plan.control === 'signal') return;
    if (plan.control !== 'signal' && !used.has(corner)) return;
    for (const [index, angle] of [[a, angleA], [b, angleB]]) {
      const arm = arms[index], text = signText(arm.name);
      // A sign names the street it is parallel to, and reads from both sides.
      if (text) layout.names.push({ x: corner.x, z: corner.z, heading: angle + Math.PI / 2, text }, { x: corner.x, z: corner.z, heading: angle - Math.PI / 2, text });
      if (arm.oneway && arm.inbound !== arm.outbound) {
        // Traffic on this street runs toward the junction along an inbound arm, away along an outbound one.
        const flow = arm.inbound ? unit(angle + Math.PI) : unit(angle);
        for (const heading of [angle + Math.PI / 2, angle - Math.PI / 2]) {
          const reader = [Math.cos(heading), -Math.sin(heading)];
          layout.arrows.push({ x: corner.x, z: corner.z, heading, right: flow[0] * reader[0] + flow[1] * reader[1] > 0 });
        }
      }
    }
  });
  layout.poles = layout.corners.map(corner => ({ x: corner.x, z: corner.z, mast: layout.signals.some(signal => layout.corners[signal.corner] === corner) }))
    .filter((pole, n) => pole.mast || plan.control === 'signal' || used.has(layout.corners[n]));
  return layout;
}

// --- Sign faces, painted once -------------------------------------------------------
const GREEN = '#00694b', ROWS = 64;
function paintAtlas(canvas, names) {
  const context = canvas.getContext('2d'), width = canvas.width, row = canvas.height / ROWS;
  context.clearRect(0, 0, width, canvas.height);
  context.textBaseline = 'middle'; context.textAlign = 'center';
  // Row 0: ONE WAY, arrow to the right; row 1: to the left. Rows 2 and 3 and 4: STOP, the hand, the walking figure.
  for (const [n, direction] of [[0, 1], [1, -1]]) {
    const y = n * row;
    context.fillStyle = '#0c0c0c'; context.fillRect(0, y, width, row);
    context.save(); context.translate(width / 2, y + row / 2); context.scale(direction, 1);
    context.fillStyle = '#f3f3ee'; context.beginPath();
    const w = width * .44, h = row * .3;
    context.moveTo(-w, -h); context.lineTo(w * .52, -h); context.lineTo(w * .52, -row * .43); context.lineTo(w, 0); context.lineTo(w * .52, row * .43); context.lineTo(w * .52, h); context.lineTo(-w, h); context.closePath(); context.fill();
    context.restore();
    context.fillStyle = '#0c0c0c'; context.font = `700 ${Math.round(row * .42)}px "Arial Narrow", Arial, sans-serif`;
    context.fillText('ONE WAY', width / 2 - direction * width * .07, y + row / 2 + 1);
  }
  context.font = `600 ${Math.round(row * .62)}px "Helvetica Neue", Arial, sans-serif`;
  names.forEach((text, n) => {
    const y = (n + 5) * row;
    context.fillStyle = '#f3f3ee'; context.fillRect(0, y, width, row);
    context.fillStyle = GREEN; context.fillRect(4, y + 3, width - 8, row - 6);
    context.fillStyle = '#f6f6f1'; context.fillText(text, width / 2, y + row / 2 + 1, width - 28);
  });
}
function paintSymbols(canvas) {
  // Three squares side by side: STOP, the raised hand, the walking figure.
  const context = canvas.getContext('2d'), s = canvas.height;
  context.clearRect(0, 0, canvas.width, s);
  context.save(); context.translate(s / 2, s / 2);
  const octagon = radius => { context.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; context[i ? 'lineTo' : 'moveTo'](Math.cos(a) * radius, Math.sin(a) * radius); } context.closePath(); };
  context.fillStyle = '#f3f3ee'; octagon(s * .5); context.fill();
  context.fillStyle = '#b01c22'; octagon(s * .455); context.fill();
  context.fillStyle = '#f6f6f1'; context.font = `700 ${Math.round(s * .3)}px "Arial Narrow", Arial, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.fillText('STOP', 0, s * .015);
  context.restore();
  // The hand: a palm and four fingers, thumb to the side.
  context.save(); context.translate(s * 1.5, s / 2); context.fillStyle = '#ffffff';
  const bar = (x, y, w, h, r) => { context.beginPath(); context.roundRect ? context.roundRect(x, y, w, h, r) : context.rect(x, y, w, h); context.fill(); };
  bar(-s * .17, -s * .02, s * .34, s * .32, s * .08);
  [[-.165, -.24, .2], [-.075, -.31, .3], [.015, -.3, .29], [.105, -.23, .22]].forEach(([fx, fy, fh]) => bar(s * fx, s * fy, s * .068, s * (fh + .1), s * .034));
  context.save(); context.rotate(-.75); bar(-s * .30, s * .0, s * .075, s * .2, s * .037); context.restore();
  context.restore();
  // The walking figure, mid-stride.
  context.save(); context.translate(s * 2.5, s / 2); context.fillStyle = '#ffffff'; context.strokeStyle = '#ffffff'; context.lineCap = 'round'; context.lineJoin = 'round';
  context.beginPath(); context.arc(s * .03, -s * .3, s * .065, 0, TAU); context.fill();
  const stroke = (points, w) => { context.lineWidth = s * w; context.beginPath(); points.forEach(([px, py], i) => context[i ? 'lineTo' : 'moveTo'](s * px, s * py)); context.stroke(); };
  stroke([[.01, -.2], [-.03, .03]], .1);                     // body
  stroke([[-.03, .03], [.09, .17], [.07, .34]], .065);       // leading leg
  stroke([[-.03, .03], [-.1, .18], [-.2, .31]], .065);       // trailing leg
  stroke([[0, -.17], [.13, -.06], [.19, .04]], .05);         // forward arm
  stroke([[0, -.17], [-.12, -.08], [-.15, .03]], .05);       // back arm
  context.restore();
}

/**
 * Draw the hardware for the junctions near the player.
 * `heightAt(x, z)` is the surface people stand on; `raised(x, z)` whether a point is on a sidewalk.
 */
export function createStreetSigns({ scene, heightAt = () => 0, raised = null, createCanvas = () => document.createElement('canvas'), range = 260, farRange = 800, capacity = 3400 } = {}) {
  const group = new THREE.Group(); group.name = 'Signals and street signs'; scene?.add(group);
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9193, metalness: .55, roughness: .5 }); steel.name = 'Galvanised signal pole';
  const housing = new THREE.MeshStandardMaterial({ color: 0xc99a06, metalness: .1, roughness: .55 }); housing.name = 'Signal head';
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: .2, roughness: .6 }); dark.name = 'Pedestrian signal housing';
  // A lit lamp is brighter than daylight on the wall behind it; an unlit one is nearly black.
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }); lamp.name = 'Signal lamps';
  const atlasCanvas = createCanvas(); atlasCanvas.width = 512; atlasCanvas.height = ROWS * 64;
  const symbolCanvas = createCanvas(); symbolCanvas.width = 768; symbolCanvas.height = 256;
  const atlas = new THREE.CanvasTexture(atlasCanvas), symbols = new THREE.CanvasTexture(symbolCanvas);
  for (const texture of [atlas, symbols]) { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; }
  paintSymbols(symbolCanvas);
  // One quad for every flat sign; each instance picks its own rectangle of a texture.
  const cut = (material, attribute) => {
    material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute vec4 ${attribute};\n${shader.vertexShader}`.replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = ${attribute}.xy + vMapUv * ${attribute}.zw;\n#endif`);
    };
    return material;
  };
  // Retroreflective sheeting: lit like anything else by day, and never quite dark at night.
  const face = cut(new THREE.MeshStandardMaterial({ map: atlas, roughness: .55, metalness: 0, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: .12 }), 'aCell'); face.name = 'Street sign faces';
  const stopFace = cut(new THREE.MeshStandardMaterial({ map: symbols, roughness: .55, metalness: 0, alphaTest: .5, emissive: 0xffffff, emissiveMap: symbols, emissiveIntensity: .12 }), 'aCell'); stopFace.name = 'Stop sign faces';
  const figure = cut(new THREE.MeshBasicMaterial({ map: symbols, transparent: true, depthWrite: false, toneMapped: false, fog: false }), 'aCell'); figure.name = 'Pedestrian signal figures';

  const quad = () => new THREE.PlaneGeometry(1, 1);
  const pole = new THREE.CylinderGeometry(.09, .14, 1, 8); pole.translate(0, .5, 0);
  const beam = new THREE.CylinderGeometry(.055, .075, 1, 6); beam.rotateZ(Math.PI / 2); beam.translate(.5, 0, 0);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CircleGeometry(1, 14);
  const make = (name, geometry, material, count, extra = null) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name; mesh.count = 0; mesh.frustumCulled = false;
    if (extra) geometry.setAttribute(extra, new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
    group.add(mesh); return mesh;
  };
  const meshes = {
    poles: make('Signal poles', pole, steel, capacity >> 2), arms: make('Signal mast arms', beam, steel, capacity >> 3),
    heads: make('Signal heads', box, housing, capacity >> 1), lamps: make('Signal lamps', disc, lamp, capacity * 2),
    walkers: make('Pedestrian signal housings', box.clone(), dark, capacity >> 1), figures: make('Pedestrian signal figures', quad(), figure, capacity, 'aCell'),
    faces: make('Street sign faces', quad(), face, capacity, 'aCell'), stops: make('Stop signs', quad(), stopFace, capacity >> 2, 'aCell'),
  };
  for (const name of ['poles', 'arms', 'heads', 'walkers']) meshes[name].castShadow = true;
  meshes.lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2 * 3), 3);
  meshes.figures.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);

  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const place = (mesh, i, x, y, z, heading, sx, sy, sz, tilt = 0) => {
    position.set(x, y, z); euler.set(0, heading, tilt); quaternion.setFromEuler(euler); scale.set(sx, sy, sz);
    matrix.compose(position, quaternion, scale); mesh.setMatrixAt(i, matrix);
  };
  // What each lamp and figure is waiting on: [junction, kind, group, role].
  let lamps = [], figures = [], shown = '', names = [];
  const OFF = [.035, .03, .03], LIT = { red: [5.2, .25, .12], yellow: [5.2, 3.1, .12], green: [.1, 4.6, 1.5] }, HAND = [5.4, 1.5, .08], WALK = [4.6, 4.6, 4.3];

  function rebuild(junctions, distant) {
    const count = { poles: 0, arms: 0, heads: 0, lamps: 0, walkers: 0, figures: 0, faces: 0, stops: 0 };
    lamps = []; figures = [];
    const wanted = [...new Set(junctions.flatMap(junction => junction.layout.names.map(name => name.text)))].slice(0, ROWS - 5);
    if (wanted.join('|') !== names.join('|')) { names = wanted; paintAtlas(atlasCanvas, names); atlas.needsUpdate = true; }
    const cells = meshes.faces.geometry.getAttribute('aCell'), stopCells = meshes.stops.geometry.getAttribute('aCell'), figureCells = meshes.figures.geometry.getAttribute('aCell');
    const room = (name, n = 1) => count[name] + n <= meshes[name].instanceMatrix.count;
    for (const junction of junctions) {
      const { layout, plan } = junction;
      const ground = (x, z) => heightAt(x, z);
      for (const item of layout.poles || []) {
        if (!room('poles')) break;
        const y = ground(item.x, item.z), tall = item.mast ? MAST.pole : SIGN_HEIGHT + .7;
        place(meshes.poles, count.poles++, item.x, y, item.z, 0, item.mast ? 1.25 : .62, tall, item.mast ? 1.25 : .62);
      }
      for (const signal of layout.signals) {
        if (!room('arms') || !room('heads', 3) || !room('lamps', 9)) break;
        const y = ground(signal.x, signal.z), [ax, az] = signal.across, facing = unit(signal.heading);
        // The arm rises a little toward its tip, as a cantilever is built to.
        const armHeading = Math.atan2(ax, az) - Math.PI / 2, rise = Math.atan2(.45, signal.reach);
        place(meshes.arms, count.arms++, signal.x, y + MAST.height, signal.z, armHeading, Math.hypot(signal.reach, .45), 1, 1, rise);
        // Two heads over the roadway and one on the pole.
        const spots = [[signal.reach * .96, MAST.height + .45 * .96 - HEAD.height - .12], [signal.reach * .52, MAST.height + .45 * .52 - HEAD.height - .12], [.34, 3.05]];
        for (const [along, bottom] of spots) {
          const hx = signal.x + ax * along, hz = signal.z + az * along;
          place(meshes.heads, count.heads++, hx - facing[0] * .02, y + bottom + HEAD.height / 2, hz - facing[1] * .02, signal.heading, HEAD.width, HEAD.height, HEAD.depth);
          ['red', 'yellow', 'green'].forEach((colour, n) => {
            place(meshes.lamps, count.lamps, hx + facing[0] * (HEAD.depth / 2 + .012), y + bottom + HEAD.lamps[n], hz + facing[1] * (HEAD.depth / 2 + .012), signal.heading, HEAD.lens, HEAD.lens, 1);
            lamps[count.lamps++] = { plan, group: signal.group, colour };
          });
        }
      }
      for (const crossing of layout.crossings) {
        if (!room('walkers') || !room('figures', 2)) break;
        const y = ground(crossing.x, crossing.z), facing = unit(crossing.heading), size = PEDESTRIAN_HEAD.size;
        const cx = crossing.x + facing[0] * .2, cz = crossing.z + facing[1] * .2;
        place(meshes.walkers, count.walkers++, cx, y + PEDESTRIAN_HEAD.height, cz, crossing.heading, size, size, PEDESTRIAN_HEAD.depth);
        ['hand', 'walk'].forEach((role, n) => {
          place(meshes.figures, count.figures, cx + facing[0] * (PEDESTRIAN_HEAD.depth / 2 + .01), y + PEDESTRIAN_HEAD.height, cz + facing[1] * (PEDESTRIAN_HEAD.depth / 2 + .01), crossing.heading, size * .86, size * .86, 1);
          figureCells.setXYZW(count.figures, (n + 1) / 3, 0, 1 / 3, 1);
          figures[count.figures++] = { plan, group: crossing.group, role };
        });
      }
      for (const stop of layout.stops) {
        if (!room('stops', 1)) break;
        const y = ground(stop.x, stop.z), facing = unit(stop.heading);
        place(meshes.stops, count.stops, stop.x + facing[0] * .1, y + STOP.height, stop.z + facing[1] * .1, stop.heading, STOP.size, STOP.size, 1);
        stopCells.setXYZW(count.stops++, 0, 0, 1 / 3, 1);
      }
      // Names above, arrows below; two streets share a pole at different heights.
      const stacked = new Map();
      for (const [list, size, row] of [[layout.names, NAME, null], [layout.arrows, ARROW, 0]]) for (const sign of list) {
        if (!room('faces')) break;
        const key = `${sign.x.toFixed(1)},${sign.z.toFixed(1)},${mod(sign.heading, Math.PI).toFixed(2)},${row === null ? 'n' : 'a'}`, pole = `${sign.x.toFixed(1)},${sign.z.toFixed(1)},${row === null ? 'n' : 'a'}`;
        if (!stacked.has(key)) { stacked.set(key, stacked.get(pole) || 0); stacked.set(pole, (stacked.get(pole) || 0) + 1); }
        const level = stacked.get(key), facing = unit(sign.heading), base = row === null ? SIGN_HEIGHT + .42 : SIGN_HEIGHT - .12;
        const y = ground(sign.x, sign.z) + base + level * (size.height + .05) * (row === null ? 1 : -1);
        // A blade is bolted to the pole by one end and reaches out along its street.
        const out = [Math.cos(sign.heading), -Math.sin(sign.heading)], side = row === null ? size.width / 2 + .1 : 0;
        const lean = Math.sign(Math.sin(mod(sign.heading, Math.PI) - .01)) || 1;
        place(meshes.faces, count.faces, sign.x + out[0] * side * lean * (sign.heading === mod(sign.heading, Math.PI) ? 1 : -1) + facing[0] * .02, y, sign.z + out[1] * side * lean * (sign.heading === mod(sign.heading, Math.PI) ? 1 : -1) + facing[1] * .02, sign.heading, size.width, size.height, 1);
        const index = row === null ? names.indexOf(sign.text) + 5 : (sign.right ? 0 : 1);
        cells.setXYZW(count.faces++, 0, 1 - (Math.max(index, 0) + 1) / ROWS, 1, 1 / ROWS);
      }
    }
    // Further down the avenue only the lamps can be seen: the string of
    // lights that runs to the horizon on every long street.
    for (const junction of distant) for (const signal of junction.layout.signals) {
      if (!room('lamps', 6)) break;
      const y = heightAt(signal.x, signal.z), [ax, az] = signal.across, facing = unit(signal.heading);
      for (const along of [signal.reach * .96, signal.reach * .52]) {
        const hx = signal.x + ax * along, hz = signal.z + az * along, bottom = MAST.height + .45 * along / signal.reach - HEAD.height - .12;
        ['red', 'yellow', 'green'].forEach((colour, n) => {
          place(meshes.lamps, count.lamps, hx + facing[0] * (HEAD.depth / 2 + .012), y + bottom + HEAD.lamps[n], hz + facing[1] * (HEAD.depth / 2 + .012), signal.heading, HEAD.lens, HEAD.lens, 1);
          lamps[count.lamps++] = { plan: junction.plan, group: signal.group, colour };
        });
      }
    }
    for (const [name, mesh] of Object.entries(meshes)) { mesh.count = count[name]; mesh.instanceMatrix.needsUpdate = true; }
    cells.needsUpdate = stopCells.needsUpdate = figureCells.needsUpdate = true;
    lamps.length = count.lamps; figures.length = count.figures;
  }

  let known = new Map(), far = new Map(), standing = [], sorted = null;
  const state = new Map();
  return {
    group, meshes,
    get junctions() { return known.size; },
    /** Where poles stand near the player, for whatever else wants a place on the sidewalk; the same array until they change. */
    get poles() { return standing; },
    /**
     * `junctions` is the simulation's list ({ id, x, z, plan, arms }); `time`
     * is the simulation's clock in seconds, the one traffic obeys.
     */
    update(junctions = [], focus = { x: 0, z: 0 }, time = 0) {
      // Which junctions are in range is looked at again only when the player
      // has moved a few metres or the junctions themselves have changed.
      const moved = !sorted || junctions !== sorted.junctions || junctions.length !== sorted.count || Math.hypot(focus.x - sorted.x, focus.z - sorted.z) > 6;
      if (moved) {
        const near = [], beyond = [];
        for (const junction of junctions) {
          if (!junction.plan) continue;
          const d = Math.hypot(junction.x - focus.x, junction.z - focus.z);
          if (d < range) near.push(junction); else if (d < farRange && junction.plan.control === 'signal') beyond.push(junction);
        }
        sorted = { junctions, count: junctions.length, x: focus.x, z: focus.z, near, beyond, key: `${near.map(junction => junction.id).join(',')}|${beyond.map(junction => junction.id).join(',')}` };
      }
      const { near, beyond, key } = sorted;
      if (key !== shown) {
        // Layouts are kept: a junction's hardware does not move. Up close it
        // is laid out again, now that the sidewalks around it are known.
        const next = new Map(), nextFar = new Map();
        for (const junction of near) next.set(junction.id, known.get(junction.id) || { ...junction, layout: layoutJunction(junction, { raised }) });
        for (const junction of beyond) nextFar.set(junction.id, far.get(junction.id) || known.get(junction.id) || { ...junction, layout: layoutJunction(junction) });
        known = next; far = nextFar; shown = key;
        standing = [...known.values()].flatMap(junction => junction.layout.poles || []);
        rebuild([...known.values()], [...far.values()]);
      }
      // Each plan is asked once a frame, however many lamps hang on it.
      state.clear();
      const ask = plan => {
        let entry = state.get(plan);
        if (!entry) state.set(plan, entry = [vehicleAspect(plan, 0, time).aspect, vehicleAspect(plan, 1, time).aspect, crossingAspect(plan, 0, time).aspect, crossingAspect(plan, 1, time).aspect]);
        return entry;
      };
      const colours = meshes.lamps.instanceColor, glow = meshes.figures.instanceColor, blink = Math.floor(time * 2) % 2 === 0;
      let changed = false;
      for (let i = 0; i < lamps.length; i++) {
        const lamp = lamps[i], on = ask(lamp.plan)[lamp.group] === lamp.colour;
        if (lamp.on === on) continue;
        lamp.on = on; changed = true;
        const lit = on ? LIT[lamp.colour] : OFF;
        colours.setXYZ(i, lit[0], lit[1], lit[2]);
      }
      if (changed) colours.needsUpdate = true;
      changed = false;
      for (let i = 0; i < figures.length; i++) {
        const figure = figures[i], aspect = ask(figure.plan)[2 + figure.group], hand = figure.role === 'hand';
        // Walk: the figure. Don't walk: the hand, flashing while there is still time to finish crossing.
        const on = hand ? aspect === 'dont' || (aspect === 'flash' && blink) : aspect === 'walk';
        if (figure.on === on) continue;
        figure.on = on; changed = true;
        const value = on ? (hand ? HAND : WALK) : [0, 0, 0];
        glow.setXYZ(i, value[0], value[1], value[2]);
      }
      if (changed) glow.needsUpdate = true;
    },
    dispose() {
      for (const mesh of Object.values(meshes)) { mesh.geometry.dispose(); mesh.dispose(); }
      for (const material of [steel, housing, dark, lamp, face, stopFace, figure]) material.dispose();
      atlas.dispose(); symbols.dispose(); group.removeFromParent();
    },
  };
}
