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
import { paintStop, paintNoEntry } from './regulatory-signs.js';
import { paintOneWay } from './one-way-sign.js';
import { propId } from './street-objects.js';
import { laneLayout } from './lanes.js';
import { vehicleAspect, crossingAspect } from './signal-plan.js';

const TAU = Math.PI * 2;
const mod = (value, n) => ((value % n) + n) % n;
const unit = angle => [Math.sin(angle), Math.cos(angle)];

/** Lens centres above the bottom of a three-lamp head, red on top: twelve-inch lenses. */
export const HEAD = { width: .36, height: 1.07, depth: .22, lens: .15, lamps: [.89, .535, .18] };
export const PEDESTRIAN_HEAD = { size: .46, depth: .16, height: 2.75 };
const MAST = { height: 6.5, pole: 7.3, maxReach: 12 };
const POLE_HEAD_BOTTOM = 3.05;
const NAME = { width: 1.1, height: .24 }, ARROW = { width: .9144, height: .3048 }, STOP = { size: .76, height: 2.3 };

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
  }).join(' ');
}

/**
 * Where a junction's hardware stands. `junction` is { x, z, plan, arms }
 * with arms as in signal-plan.js (angle out from the junction, width, name,
 * inbound, outbound, oneway). `raised(x, z)` says whether a point is on a
 * sidewalk, where that is known; a pole is nudged outward until it is.
 *
 * Returns positions in the plane; heights are added when drawn:
 *   corners     [{ x, z }] one for each pair of neighbouring streets
 *   signals     [{ x, z, heading, reach, across: [dx, dz], heads, group, corner }] head distances along each mast
 *   crossings   [{ x, z, heading, group, corner }] pedestrian heads, `group` being the street crossed
 *   stops       [{ x, z, heading }] stop signs
 *   names       [{ x, z, heading, text }] street-name signs, readable from both sides
 *   arrows      [{ x, z, heading, right }] ONE WAY signs; `right` if the arrow points to the reader's right
 * `heading` is the way a face looks, toward whoever reads it.
 */
export function layoutJunction(junction, { raised = null, crossings = [] } = {}) {
  const { x, z, plan, arms } = junction, layout = { corners: [], signals: [], crossings: [], stops: [], names: [], arrows: [], noEntry: [] };
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
    if (raised) {
      let surface = raised(px, pz);
      for (let step = 0; step < 6 && surface === false; step++) {
        px += outward[0] / length * .6; pz += outward[1] / length * .6;
        surface = raised(px, pz);
      }
      if (surface === false) continue;
    }
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
      const lateral = (corner.x - x) * right[0] + (corner.z - z) * right[1];
      const lanes = laneLayout(arm.width, !arm.outbound);
      const offsets = lanes.driven
        ? Array.from({ length: lanes.count }, (_, i) => lanes.first + i * lanes.step)
        : [Math.min(2.5, Math.max(.65, arm.width * .19))];
      // At a T the available pole may be on the left. Reach toward the lanes from either kerb.
      const direction = lateral >= (offsets[0] + offsets.at(-1)) / 2 ? -1 : 1;
      const spans = offsets.map(offset => (offset - lateral) * direction)
        .filter(span => span >= HEAD.width && span + .18 <= MAST.maxReach).sort((a, b) => a - b);
      const heads = spans.length > 1 ? [spans[0], spans.at(-1)] : spans;
      const reach = heads.length ? heads.at(-1) + .18 : 0;
      layout.signals.push({ x: corner.x, z: corner.z, heading: angle, reach, heads, across: [direction * right[0], direction * right[1]], group, corner: layout.corners.indexOf(corner) });
      used.add(corner);
    } else if (plan.control === 'allway' || group === 1) {
      // Near side, driver's right, before the crossing.
      const corner = best((dx, dz) => dx * (u[0] + right[0]) + dz * (u[1] + right[1]));
      layout.stops.push({ x: corner.x, z: corner.z, heading: angle });
      used.add(corner);
    }
  }
  // Stand on the right of a driver about to enter against traffic. If that corner
  // is missing at a T, only the other corner of the same street mouth is eligible.
  const noEntryCorners = new Map();
  for (const { arm, index, angle } of order) {
    if (!arm.oneway || !arm.inbound || arm.outbound) continue;
    const corner = layout.corners.find(c => c.between[1] === index) ?? layout.corners.find(c => c.between[0] === index);
    if (!corner) continue;
    if (!noEntryCorners.has(corner)) noEntryCorners.set(corner, []);
    noEntryCorners.get(corner).push(angle + Math.PI);
    used.add(corner);
  }
  layout.corners.forEach((corner, n) => {
    const [a, b] = corner.between, [angleA, angleB] = corner.angles;
    if (plan.control === 'signal') {
      // Each corner shows a head to whoever is walking toward it on either crossing.
      if (!crossings[a]) layout.crossings.push({ x: corner.x, z: corner.z, heading: angleB + Math.PI, group: plan.groups[a], corner: n });
      if (!crossings[b]) layout.crossings.push({ x: corner.x, z: corner.z, heading: angleA + Math.PI, group: plan.groups[b], corner: n });
    }
    // Names and arrows on alternate corners, as the city spaces them; on every corner that already has a pole at a stop sign.
    if (plan.control !== 'signal' && !used.has(corner)) return;
    const roadsideHead = layout.signals.some(signal => signal.corner === n && !signal.reach);
    const hardwareTop = roadsideHead ? POLE_HEAD_BOTTOM + HEAD.height : plan.control === 'signal'
      ? PEDESTRIAN_HEAD.height + PEDESTRIAN_HEAD.size / 2 : STOP.height + STOP.size / 2;
    const poleInset = layout.signals.some(signal => signal.corner === n && signal.reach) ? .135 : .055;
    let bladeBottom = hardwareTop + .12;
    for (const heading of noEntryCorners.get(corner) || []) {
      const height = bladeBottom + STOP.size / 2;
      layout.noEntry.push({ x: corner.x, z: corner.z, heading, height });
      bladeBottom += STOP.size + .08;
      corner.signTop = bladeBottom;
    }
    if (n % 2 && plan.control === 'signal') return;
    for (const [index, angle] of [[a, angleA], [b, angleB]]) {
      const arm = arms[index], text = signText(arm.name);
      // A sign names the street it is parallel to, and reads from both sides.
      const mount = size => {
        const [dx, dz] = unit(angle), reach = size.width / 2 + poleInset;
        const position = { x: corner.x, z: corner.z, dx: dx * reach, dz: dz * reach, height: bladeBottom + size.height / 2 };
        bladeBottom += size.height + .05;
        return position;
      };
      if (arm.oneway && arm.inbound !== arm.outbound) {
        const position = mount(ARROW);
        // Traffic on this street runs toward the junction along an inbound arm, away along an outbound one.
        const flow = arm.inbound ? unit(angle + Math.PI) : unit(angle);
        for (const heading of [angle + Math.PI / 2, angle - Math.PI / 2]) {
          const reader = [Math.cos(heading), -Math.sin(heading)];
          layout.arrows.push({ ...position, heading, right: flow[0] * reader[0] + flow[1] * reader[1] > 0 });
        }
      }
      if (text) {
        const width = bladeWidth(text), position = mount({ width, height: NAME.height });
        for (const heading of [angle + Math.PI / 2, angle - Math.PI / 2]) layout.names.push({ ...position, heading, text, width });
      }
    }
    corner.signTop = bladeBottom;
  });
  layout.poles = layout.corners.map(corner => ({ x: corner.x, z: corner.z, height: Math.max(plan.control === 'signal' ? POLE_HEAD_BOTTOM + HEAD.height : 3.85, corner.signTop || 0), mast: layout.signals.some(signal => signal.reach && layout.corners[signal.corner] === corner) }))
    .filter((pole, n) => pole.mast || plan.control === 'signal' || used.has(layout.corners[n]));
  if (plan.control === 'signal') crossings.forEach((stripe, arm) => {
    const ends = [stripe.a, stripe.b];
    for (const [side, end] of ends.entries()) {
      const opposite = ends[1 - side], dx = end.x - opposite.x, dz = end.z - opposite.z;
      const span = Math.hypot(dx, dz);
      // Reuse a corner pole only on this bank of this crossing.
      let post = null, nearest = Math.min(5, span / 2);
      for (const corner of layout.corners) {
        if (!corner.between.includes(arm)) continue;
        const d = Math.hypot(corner.x - end.x, corner.z - end.z);
        if (d < nearest) { nearest = d; post = corner; }
      }
      if (!post) {
        for (let inset = 1.2; inset <= 4.2; inset += .5) {
          const px = end.x + dx / span * inset, pz = end.z + dz / span * inset;
          if (raised?.(px, pz) === false) continue;
          post = { x: px, z: pz, height: 3.05, mast: false };
          const existing = layout.poles.find(p => Math.hypot(p.x - px, p.z - pz) < .85);
          if (existing) post = existing; else layout.poles.push(post);
          break;
        }
      }
      if (post) layout.crossings.push({ x: post.x, z: post.z, heading: Math.atan2(opposite.x - post.x, opposite.z - post.z), group: plan.groups[arm] });
    }
  });
  return layout;
}

// --- Sign faces, painted once -------------------------------------------------------
const GREEN = '#00694b', ROWS = 64;
function bladeWidth(text) {
  return Math.max(.68, Math.min(3.6, .22 + text.length * .086));
}
function paintAtlas(canvas, names, columns) {
  const context = canvas.getContext('2d'), width = canvas.width / columns, row = canvas.height / ROWS;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'middle'; context.textAlign = 'center';
  // Rows 0 and 1 hold the ONE WAY arrows. Street names begin at row 5.
  paintOneWay(context, width, row, true);
  context.save(); context.translate(0, row);
  paintOneWay(context, width, row, false);
  context.restore();
  context.font = `600 ${Math.round(row * .62)}px "Helvetica Neue", Arial, sans-serif`;
  names.forEach((text, n) => {
    const cell = n + 5, y = cell % ROWS * row;
    context.save(); context.translate(Math.floor(cell / ROWS) * width, 0);
    context.fillStyle = '#f3f3ee'; context.fillRect(0, y, width, row);
    context.fillStyle = GREEN; context.fillRect(4, y + 3, width - 8, row - 6);
    // Paint in physical blade proportions before stretching into the atlas row.
    const pixels = row * bladeWidth(text) / NAME.height;
    context.save(); context.scale(width / pixels, 1);
    context.fillStyle = '#f6f6f1'; context.fillText(text, pixels / 2, y + row / 2 + 1, pixels - 12);
    context.restore(); context.restore();
  });
}
function paintSymbols(canvas) {
  // Atlas cells: STOP, raised hand, walking figure, DO NOT ENTER.
  const context = canvas.getContext('2d'), s = canvas.height;
  context.clearRect(0, 0, canvas.width, s);
  paintStop(context, s);
  context.save(); context.translate(3 * s, 0); paintNoEntry(context, s); context.restore();
  // Filled silhouettes from FHWA MUTCD Figure 4I-1, panel B, in a 100-unit square.
  // Upraised hand.
  context.save();
  context.translate(s * 1, 0); context.scale(s / 100, s / 100);
  context.fillStyle = '#fff'; context.beginPath();
  context.moveTo(27.5, 91.4);
  context.bezierCurveTo(28.3, 90.4, 29.1, 89.4, 29.2, 87.8);
  context.lineTo(29.2, 75.8);
  context.bezierCurveTo(29.2, 70.6, 27.4, 69.7, 25.7, 68.1);
  context.bezierCurveTo(22.9, 65.4, 23.3, 61.7, 23.5, 56.9);
  context.bezierCurveTo(23.9, 43.5, 24.4, 35.4, 24.5, 22.9);
  context.bezierCurveTo(24.5, 21.3, 25.8, 20.0, 27.4, 20.0);
  context.bezierCurveTo(29.0, 20.0, 30.3, 21.3, 30.3, 22.9);
  context.lineTo(31.3, 43.2);
  context.lineTo(32.6, 43.2);
  context.bezierCurveTo(32.8, 33.9, 33.2, 24.5, 33.2, 15.2);
  context.bezierCurveTo(33.2, 13.6, 34.5, 12.3, 36.1, 12.3);
  context.bezierCurveTo(37.7, 12.3, 39.0, 13.6, 39.0, 15.2);
  context.bezierCurveTo(39.0, 15.2, 39.0, 15.3, 39.0, 15.3);
  context.lineTo(39.4, 43.2);
  context.lineTo(40.8, 43.2);
  context.bezierCurveTo(41.1, 32.7, 41.9, 21.9, 41.9, 11.4);
  context.bezierCurveTo(41.9, 9.8, 43.2, 8.5, 44.8, 8.5);
  context.bezierCurveTo(46.4, 8.5, 47.7, 9.8, 47.7, 11.4);
  context.bezierCurveTo(47.7, 11.4, 47.7, 11.4, 47.7, 11.4);
  context.lineTo(48.3, 43.2);
  context.lineTo(50.1, 43.2);
  context.bezierCurveTo(50.2, 33.8, 50.3, 24.4, 50.4, 15.1);
  context.bezierCurveTo(50.4, 13.5, 51.7, 12.3, 53.3, 12.3);
  context.bezierCurveTo(54.8, 12.3, 56.1, 13.6, 56.2, 15.2);
  context.lineTo(57.6, 52.5);
  context.bezierCurveTo(57.6, 53.2, 58.2, 53.7, 58.9, 53.7);
  context.bezierCurveTo(59.3, 53.7, 60.2, 53.5, 60.9, 52.4);
  context.lineTo(67.4, 42.9);
  context.bezierCurveTo(69.9, 39.4, 73.2, 38.7, 77.1, 40.2);
  context.bezierCurveTo(74.7, 44.7, 69.7, 55.9, 64.7, 62.1);
  context.bezierCurveTo(62.0, 66.3, 53.1, 70.4, 53.1, 75.8);
  context.lineTo(53.1, 86.7);
  context.bezierCurveTo(53.1, 89.0, 55.4, 91.5, 55.3, 91.4);
  context.closePath();
  context.moveTo(27.5, 91.4);
  context.fill(); context.restore();
  // Walking person.
  context.save();
  context.translate(s * 2, 0); context.scale(s / 100, s / 100);
  context.fillStyle = '#fff'; context.beginPath();
  context.moveTo(53.6, 8.5);
  context.bezierCurveTo(50.3, 8.5, 47.6, 11.2, 47.6, 14.6);
  context.bezierCurveTo(47.6, 17.9, 50.3, 20.6, 53.6, 20.6);
  context.bezierCurveTo(57.0, 20.6, 59.7, 17.9, 59.7, 14.6);
  context.bezierCurveTo(59.7, 11.2, 57.0, 8.5, 53.6, 8.5);
  context.moveTo(72.0, 46.8);
  context.lineTo(59.3, 38.3);
  context.bezierCurveTo(58.7, 35.8, 56.2, 24.8, 51.3, 22.2);
  context.bezierCurveTo(46.5, 19.0, 28.6, 32.2, 28.5, 32.3);
  context.lineTo(28.5, 51.5);
  context.lineTo(32.4, 50.8);
  context.lineTo(33.9, 35.5);
  context.bezierCurveTo(35.4, 35.2, 36.8, 34.9, 38.3, 34.6);
  context.bezierCurveTo(35.1, 42.9, 33.9, 50.8, 35.7, 56.1);
  context.lineTo(28.0, 87.8);
  context.lineTo(33.2, 91.5);
  context.lineTo(44.5, 62.1);
  context.lineTo(49.7, 67.7);
  context.lineTo(57.0, 89.8);
  context.lineTo(63.9, 87.3);
  context.lineTo(57.7, 64.0);
  context.lineTo(50.4, 51.0);
  context.lineTo(53.2, 41.4);
  context.lineTo(56.2, 45.3);
  context.lineTo(70.0, 49.8);
  context.closePath();
  context.moveTo(72.0, 46.8);
  context.fill(); context.restore();
}

/**
 * Draw the hardware for the junctions near the player.
 * `heightAt(x, z)` is the surface people stand on; `raised(x, z)` whether a point is on a sidewalk.
 */
export function createStreetSigns({ scene, physics = null, heightAt = () => 0, raised = null, createCanvas = () => document.createElement('canvas'), range = 260, farRange = 800, capacity = 3400 } = {}) {
  const group = new THREE.Group(); group.name = 'Signals and street signs'; scene?.add(group);
  const steel = new THREE.MeshStandardMaterial({ color: 0x8b9193, metalness: .55, roughness: .5 }); steel.name = 'Galvanised signal pole';
  const housing = new THREE.MeshStandardMaterial({ color: 0xc99a06, metalness: .1, roughness: .55 }); housing.name = 'Signal head';
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: .2, roughness: .6 }); dark.name = 'Pedestrian signal housing';
  // A lit lamp is brighter than daylight on the wall behind it; an unlit one is nearly black.
  const lamp = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }); lamp.name = 'Signal lamps';
  const atlasCanvas = createCanvas(); atlasCanvas.width = 512; atlasCanvas.height = ROWS * 64;
  const symbolCanvas = createCanvas(); symbolCanvas.width = 1024; symbolCanvas.height = 256;
  const atlas = new THREE.CanvasTexture(atlasCanvas), symbols = new THREE.CanvasTexture(symbolCanvas);
  for (const texture of [atlas, symbols]) { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; }
  paintSymbols(symbolCanvas);
  // One quad for every flat sign; each instance picks its own rectangle of a texture.
  const cut = (material, attribute) => {
    material.onBeforeCompile = shader => {
      shader.vertexShader = `attribute vec4 ${attribute};\n${shader.vertexShader}`.replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = ${attribute}.xy + vMapUv * ${attribute}.zw;\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = vMapUv;\n#endif`);
    };
    return material;
  };
  // Retroreflective sheeting: lit like anything else by day, and never quite dark at night.
  const face = cut(new THREE.MeshStandardMaterial({ map: atlas, alphaTest: .4, roughness: .55, metalness: 0, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: .12 }), 'aCell'); face.name = 'Street sign faces';
  const stopFace = cut(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: symbols, roughness: .55, metalness: 0, alphaTest: .5, emissive: 0xffffff, emissiveMap: symbols, emissiveIntensity: .12 }), 'aCell'); stopFace.name = 'Stop sign faces';
  const mapBoard = stopFace.onBeforeCompile;
  stopFace.onBeforeCompile = shader => {
    mapBoard(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = vec3(0.38);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (!gl_FrontFacing) totalEmissiveRadiance = vec3(0.0);');
  };
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
    faces: make('Street sign faces', quad(), face, capacity, 'aCell'), noEntry: make('Do not enter signs', quad(), stopFace, capacity >> 2, 'aCell'), stops: make('Stop signs', quad(), stopFace, capacity >> 2, 'aCell'),
  };
  for (const name of ['poles', 'arms', 'heads', 'walkers']) meshes[name].castShadow = true;
  meshes.lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2 * 3), 3);
  meshes.figures.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);

  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const place = (mesh, i, x, y, z, heading, sx, sy, sz, tilt = 0) => {
    position.set(x, y, z); euler.set(0, heading, tilt); quaternion.setFromEuler(euler); scale.set(sx, sy, sz);
    matrix.compose(position, quaternion, scale); mesh.setMatrixAt(i, matrix);
  };
  // Keep the plan and approach group for each live display.
  let lamps = [], figures = [], shown = '', names = null;
  const OFF = [.035, .03, .03], LIT = { red: [5.2, .25, .12], yellow: [5.2, 3.1, .12], green: [.1, 4.6, 1.5] }, HAND = [3.2, .20, .008], WALK = [4.6, 4.6, 4.3];

  function rebuild(junctions, distant) {
    const count = { poles: 0, arms: 0, heads: 0, lamps: 0, walkers: 0, figures: 0, faces: 0, stops: 0, noEntry: 0 };
    const bodies=[];
    lamps = []; figures = [];
    const wanted = [...new Set(junctions.flatMap(junction => junction.layout.names.map(name => name.text)))];
    const columns = Math.ceil((wanted.length + 5) / ROWS);
    if (!names || wanted.join('|') !== names.join('|')) {
      names = wanted;
      const width = Math.min(4096, 512 * columns);
      if (atlasCanvas.width !== width) { atlas.dispose(); atlasCanvas.width = width; }
      paintAtlas(atlasCanvas, names, columns); atlas.needsUpdate = true;
    }
    const cells = meshes.faces.geometry.getAttribute('aCell'), stopCells = meshes.stops.geometry.getAttribute('aCell');
    const room = (name, n = 1) => count[name] + n <= meshes[name].instanceMatrix.count;
    function drawSignal(signal, plan, detailed) {
      const headCount = signal.heads.length || 1;
      if (!room('lamps', headCount * 3)) return;
      if (detailed && (!room('heads', headCount) || (signal.reach && !room('arms')))) return;
      const y = heightAt(signal.x, signal.z), [ax, az] = signal.across, facing = unit(signal.heading);
      // The arm rises a little toward its tip, as a cantilever is built to.
      const armHeading = Math.atan2(ax, az) - Math.PI / 2, rise = Math.atan2(.45, signal.reach);
      if (detailed && signal.reach) place(meshes.arms, count.arms++, signal.x, y + MAST.height, signal.z, armHeading, Math.hypot(signal.reach, .45), 1, 1, rise);
      // When no lane is within cantilever reach, keep a roadside signal on the pole.
      const spots = signal.heads.length ? signal.heads.map(along => [along, MAST.height + .45 * along / signal.reach - HEAD.height]) : [[.28, POLE_HEAD_BOTTOM]];
      for (const [along, bottom] of spots) {
        const hx = signal.x + ax * along, hz = signal.z + az * along;
        if (detailed) place(meshes.heads, count.heads++, hx - facing[0] * .02, y + bottom + HEAD.height / 2, hz - facing[1] * .02, signal.heading, HEAD.width, HEAD.height, HEAD.depth);
        ['red', 'yellow', 'green'].forEach((colour, n) => {
          place(meshes.lamps, count.lamps, hx + facing[0] * (HEAD.depth / 2 + .012), y + bottom + HEAD.lamps[n], hz + facing[1] * (HEAD.depth / 2 + .012), signal.heading, HEAD.lens, HEAD.lens, 1);
          lamps[count.lamps++] = { plan, group: signal.group, colour };
        });
      }
    }
    for (const junction of junctions) {
      const { layout, plan } = junction;
      const ground = (x, z) => heightAt(x, z);
      for (const item of layout.poles || []) {
        if (!room('poles')) break;
        const y = ground(item.x, item.z), tall = item.mast ? MAST.pole : item.height;
        if(physics)bodies.push({id:propId('signalPole',item.x,item.z),x:item.x,y,z:item.z,height:tall,
          radius:item.mast ? .175 : .09,fixed:true});
        place(meshes.poles, count.poles++, item.x, y, item.z, 0, item.mast ? 1.25 : .62, tall, item.mast ? 1.25 : .62);
      }
      for (const signal of layout.signals) drawSignal(signal, plan, true);
      for (const crossing of layout.crossings) {
        if (!room('walkers') || !room('figures')) break;
        const y = ground(crossing.x, crossing.z), facing = unit(crossing.heading), size = PEDESTRIAN_HEAD.size;
        const cx = crossing.x + facing[0] * .2, cz = crossing.z + facing[1] * .2;
        place(meshes.walkers, count.walkers++, cx, y + PEDESTRIAN_HEAD.height, cz, crossing.heading, size, size, PEDESTRIAN_HEAD.depth);
        place(meshes.figures, count.figures, cx + facing[0] * (PEDESTRIAN_HEAD.depth / 2 + .01), y + PEDESTRIAN_HEAD.height, cz + facing[1] * (PEDESTRIAN_HEAD.depth / 2 + .01), crossing.heading, size * .86, size * .86, 1);
        figures[count.figures++] = { plan, group: crossing.group };
      }
      for (const name of ['stops', 'noEntry']) {
        const mesh = meshes[name], cells = mesh.geometry.getAttribute('aCell');
        for (const sign of layout[name]) {
          if (!room(name)) break;
          const facing = unit(sign.heading), offset = name === 'stops' ? .1 : .18;
          place(mesh, count[name], sign.x + facing[0] * offset, ground(sign.x, sign.z) + (sign.height ?? STOP.height), sign.z + facing[1] * offset, sign.heading, STOP.size, STOP.size, 1);
          cells.setXYZW(count[name]++, name === 'stops' ? 0 : .75, 0, .25, 1);
        }
      }
      for (const [list, size, row] of [[layout.names, NAME, null], [layout.arrows, ARROW, 0]]) for (const sign of list) {
        if (!room('faces')) break;
        const facing = unit(sign.heading), y = ground(sign.x, sign.z) + sign.height;
        place(meshes.faces, count.faces, sign.x + sign.dx + facing[0] * .005, y, sign.z + sign.dz + facing[1] * .005, sign.heading, sign.width ?? size.width, size.height, 1);
        const index = row === null ? names.indexOf(sign.text) + 5 : (sign.right ? 0 : 1);
        cells.setXYZW(count.faces++, Math.floor(index / ROWS) / columns, 1 - (index % ROWS + 1) / ROWS, 1 / columns, 1 / ROWS);
      }
    }
    // Further down the avenue only the lamps can be seen: the string of
    // lights that runs to the horizon on every long street.
    for (const junction of distant) for (const signal of junction.layout.signals) drawSignal(signal, junction.plan, false);
    for (const [name, mesh] of Object.entries(meshes)) { mesh.count = count[name]; mesh.instanceMatrix.needsUpdate = true; }
    cells.needsUpdate = stopCells.needsUpdate = meshes.noEntry.geometry.getAttribute('aCell').needsUpdate = true;
    physics?.replace('signalPole', bodies);
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
     * is the simulation's clock in seconds. A change in sidewalkRevision refreshes the pole positions.
     */
    update(junctions = [], focus = { x: 0, z: 0 }, time = 0, sidewalkRevision = null, paintedCrossings = null) {
      // Which junctions are in range is looked at again only when the player
      // has moved a few metres or the junctions themselves have changed.
      const roadsChanged = junctions !== sorted?.junctions;
      const sidewalksChanged = sidewalkRevision !== sorted?.sidewalkRevision || paintedCrossings !== sorted?.paintedCrossings;
      const moved = roadsChanged || sidewalksChanged || junctions.length !== sorted.count || Math.hypot(focus.x - sorted.x, focus.z - sorted.z) > 6;
      if (moved) {
        const near = [], beyond = [];
        for (const junction of junctions) {
          if (!junction.plan) continue;
          const d = Math.hypot(junction.x - focus.x, junction.z - focus.z);
          if (d < range) near.push(junction); else if (d < farRange && junction.plan.control === 'signal') beyond.push(junction);
        }
        sorted = { junctions, sidewalkRevision, paintedCrossings, count: junctions.length, x: focus.x, z: focus.z, near, beyond, key: `${near.map(junction => junction.id).join(',')}|${beyond.map(junction => junction.id).join(',')}` };
      }
      const { near, beyond, key } = sorted;
      if (key !== shown || roadsChanged || sidewalksChanged) {
        // Reuse layouts while their road graph and local sidewalk survey are current.
        const next = new Map(), nextFar = new Map();
        for (const junction of near) next.set(junction.id, (!roadsChanged && !sidewalksChanged && known.get(junction.id)) || { ...junction, layout: layoutJunction(junction, { raised, crossings: paintedCrossings?.get(junction.plan) }) });
        for (const junction of beyond) nextFar.set(junction.id, (!roadsChanged && (far.get(junction.id) || known.get(junction.id))) || { ...junction, layout: layoutJunction(junction) });
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
      const figureCells = meshes.figures.geometry.getAttribute('aCell');
      for (let i = 0; i < figures.length; i++) {
        const figure = figures[i], aspect = ask(figure.plan)[2 + figure.group];
        const blank = aspect === 'flash' && !blink;
        const cell = blank ? 0 : aspect === 'walk' ? 2 : 1;
        if (figure.cell === cell) continue;
        figure.cell = cell; changed = true;
        // During the dark half of a flash, sample a single transparent texel.
        figureCells.setXYZW(i, blank ? .26 : cell / 4, blank ? .02 : 0, blank ? 0 : .25, blank ? 0 : 1);
        const colour = cell === 2 ? WALK : HAND;
        glow.setXYZ(i, ...colour);
      }
      if (changed) glow.needsUpdate = figureCells.needsUpdate = true;
    },
    dispose() {
      physics?.replace('signalPole',[]);
      for (const mesh of Object.values(meshes)) { mesh.geometry.dispose(); mesh.dispose(); }
      for (const material of [steel, housing, dark, lamp, face, stopFace, figure]) material.dispose();
      atlas.dispose(); symbols.dispose(); group.removeFromParent();
    },
  };
}
