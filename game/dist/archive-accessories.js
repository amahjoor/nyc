// What the archive collection sells that is neither cut nor a shoe: bags, a hat, a headpiece, necklaces and rings.
//
// Each is built here from plain shapes on the wearer's own measurements and hung on a bone, as the bags in
// human-accessories.js are. They are worn in the bag's place: one of them at a time. The names are the `bag`
// of their entries in data/archive-collection/.
import * as THREE from './vendor/three.module.min.js';

const SILVER = { color: 0xc9cacd, roughness: .3, metalness: .9 }, DARK_SILVER = { color: 0x77797d, roughness: .4, metalness: .85 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** A box pulled round at its corners, narrower toward the top by `taper`. */
function soft(width, height, depth, round = .55, taper = .22) {
  const g = new THREE.BoxGeometry(2, 2, 2, 6, 8, 5), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const ball = v.clone().normalize().multiplyScalar(1.25); v.lerp(ball, round);
    const up = (v.y + 1) / 2, k = 1 - taper * up * up + .06 * (1 - up) * up * 4;
    p.setXYZ(i, v.x * width * k, v.y * height, v.z * depth * k);
  }
  g.computeVertexNormals(); return g;
}
const tube = (points, radius, closed = false, around = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed), closed ? 48 : 16, radius, around, closed);
/** How far forward and back the dressed body reaches, near the middle, between two heights. */
function depthAt(built, x, low, high, half) {
  let back = Infinity, front = -Infinity;
  for (const piece of built.pieces) {
    if (piece.kind !== 'skin' && piece.kind !== 'garment') continue;
    const p = piece.position;
    for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - x) < half && p[i + 1] > low && p[i + 1] < high) { back = Math.min(back, p[i + 2]); front = Math.max(front, p[i + 2]); }
  }
  return { back, front };
}

/** A pack on the back: its body, what is sewn on it (`extras(put, w, h, d)`), and two straps over the shoulders. */
function pack({ built, attach, at, s }, { w, h, d, low = .035, body, strap, round = .55, taper = .22 }, extras) {
  const chest = at('spine_03'), lh = at('upperarm_l'), rh = at('upperarm_r'), half = lh.distanceTo(rh) / 2;
  const { back, front } = depthAt(built, chest.x, chest.y - .14 * s, chest.y + .14 * s, half * .6);
  w *= s; h *= s; d *= s;
  const centre = V(chest.x, chest.y - low * s, back - d - .006 * s);
  const put = (name, geometry, x, y, z, material) => { geometry.translate(centre.x + x, centre.y + y, centre.z + z); attach('spine_03', name, geometry, material); };
  put('Bag', soft(w, h, d, round, taper), 0, 0, 0, body);
  extras(put, w, h, d);
  for (const sign of [-1, 1]) {
    const top = lh.clone().lerp(rh, sign > 0 ? .16 : .84); top.y += .046 * s;
    const start = centre.clone().add(V(sign * w * .45, h * .82, d * .7)), end = centre.clone().add(V(sign * w * .78, -h * .8, d * .6));
    const rear = top.clone(); rear.z = back + .004 * s; rear.y -= .04 * s;
    const chestFront = top.clone(); chestFront.z = front + .01 * s; chestFront.y -= .11 * s;
    const lower = chestFront.clone(); lower.y = end.y + .03 * s; lower.x = chest.x + sign * half * .98; lower.z = (front + back) / 2;
    attach('spine_03', 'Bag strap', tube([start, rear, top, chestFront, lower, end], .012 * s), strap);
  }
}
/** A bag hung from one shoulder to lie at the hip: returns where it lies and how to put things on it. */
function slung({ built, attach, at, s }, { side = 1, drop = .02, strap, radius = .008, out = .04 }) {
  const chest = at('spine_03'), hip = at('pelvis'), lh = at('upperarm_l'), rh = at('upperarm_r'), half = lh.distanceTo(rh) / 2;
  const { back, front } = depthAt(built, chest.x, chest.y - .13 * s, chest.y + .13 * s, half * .65);
  const centre = V(chest.x + side * (half + out * s), hip.y - drop * s, hip.z);
  const put = (name, geometry, x, y, z, material) => { geometry.translate(centre.x + x, centre.y + y, centre.z + z); attach('spine_03', name, geometry, material); };
  const handle = (z0, z1, lift) => {
    const top = lh.clone().lerp(rh, side > 0 ? .1 : .9); top.y += .046 * s;
    const a = centre.clone().add(V(0, lift, z0)), b = centre.clone().add(V(0, lift, z1));
    const rear = top.clone(); rear.z = back; rear.y -= .05 * s; const fore = top.clone(); fore.z = front + .009 * s; fore.y -= .11 * s;
    attach('spine_03', 'Bag strap', tube([a, rear, top, fore, b], radius * s), strap);
  };
  return { centre, put, handle };
}
/** A chain or cord round the neck that hangs to `drop` below it on the chest. Returns where its lowest point lies. */
function necklace({ built, attach, at, s }, { drop = .14, radius = .0016, material }) {
  const neck = at('neck_01'), lh = at('upperarm_l'), rh = at('upperarm_r'), half = lh.distanceTo(rh) / 2;
  const high = neck.y + .035 * s, low = high - drop * s;
  const nape = depthAt(built, neck.x, high - .02 * s, high + .02 * s, half * .3), chest = depthAt(built, neck.x, low - .02 * s, low + .03 * s, half * .25);
  const points = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, forward = (1 + Math.cos(a)) / 2;
    const z = THREE.MathUtils.lerp(nape.back - .003 * s, chest.front + .005 * s, forward ** 1.5);
    points.push(V(neck.x + Math.sin(a) * half * (.3 - .1 * forward), THREE.MathUtils.lerp(high, low, forward ** 2), z));
  }
  attach('spine_03', 'Necklace', tube(points, radius * s, true, 5), material);
  return V(neck.x, low, chest.front + .006 * s);
}
/** A band round a finger, between two of its joints; `face(g)` may add to it. Returns the frame it lies in. */
function ring({ attach, at, s }, finger, side, { where = .45, radius = .0105, thick = .0028, wide = 1, material, bone = 1 }) {
  const a = at(`${finger}_0${bone}_${side}`), b = at(`${finger}_0${bone + 1}_${side}`), along = b.clone().sub(a).normalize();
  const centre = a.clone().lerp(b, where), turn = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), along);
  const band = new THREE.TorusGeometry(radius * s, thick * s, 8, 20); band.scale(1, 1, wide);
  band.applyQuaternion(turn); band.translate(centre.x, centre.y, centre.z);
  attach(`${finger}_0${bone}_${side}`, 'Ring', band, material);
  // The back of the hand faces up in the pose a figure is fitted in.
  const up = V(0, 1, 0).sub(along.clone().multiplyScalar(along.y)).normalize();
  const set = (name, geometry, lift = 1, material2 = material) => {
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), up));
    const p = centre.clone().add(up.clone().multiplyScalar(radius * s * lift)); geometry.translate(p.x, p.y, p.z);
    attach(`${finger}_0${bone}_${side}`, name, geometry, material2);
  };
  return { centre, along, up, set };
}
/** A flared cross lying flat (in XZ), `size` across. */
function crossShape(size, flare = .42, depth = .0012) {
  const shape = new THREE.Shape(), a = size / 2, b = a * flare, c = size * .09;
  const arms = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  shape.moveTo(-c, -c);
  for (const [dx, dy] of arms) { const px = -dy, py = dx; shape.lineTo(dx * a - px * b, dy * a - py * b); shape.lineTo(dx * a * 1.1, dy * a * 1.1); shape.lineTo(dx * a + px * b, dy * a + py * b); shape.lineTo((dx + px) * c, (dy + py) * c); }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g;
}

export function fitPlainJewelry(item, wearer) {
  if (item.endsWith('ring')) ring(wearer, 'ring', 'r', {material:SILVER});
  else if (/necklace|pendant/.test(item)) necklace(wearer, {material:SILVER});
  else return false;
  return true;
}

export const ARCHIVE_ACCESSORIES = {
  // Raf Simons × Eastpak: an outsized top-loading pack with a suede base and a square front pocket.
  'eastpak backpack'(c) {
    const { s, look } = c, nylon = { color: look.trimColour || 0x1f2433, roughness: .62 }, suede = { color: 0x6b5a48, roughness: .95 }, web = { color: 0x111114, roughness: .7 };
    pack(c, { w: .17, h: .245, d: .1, low: .06, body: nylon, strap: web, round: .5, taper: .12 }, (put, w, h, d) => {
      put('Bag base', soft(w * 1.01, h * .26, d * 1.02, .5, -.05), 0, -h * .78, 0, suede);
      put('Bag pocket', soft(w * .62, h * .3, d * .3, .35, 0), 0, -h * .2, -d * 1.0, nylon);
      put('Bag zip', new THREE.BoxGeometry(w * 1.1, .004 * s, .004 * s), 0, -h * .02, -d * 1.27, SILVER);
      put('Bag label', new THREE.BoxGeometry(.045 * s, .022 * s, .003 * s), 0, h * .36, -d * 1.08, { color: 0xe8e5dc, roughness: .8 });
      put('Bag handle', tube([V(-.03 * s, 0, 0), V(-.02 * s, .04 * s, 0), V(.02 * s, .04 * s, 0), V(.03 * s, 0, 0)], .006 * s), 0, h * 1.0, d * .5, web);
      for (const side of [-1, 1]) put('Bag strap', new THREE.BoxGeometry(.02 * s, h * .9, .004 * s), side * w * .62, -h * .1, -d * .86, web);
    });
  },
  // Junya Watanabe Man × Seil Marschall: a waxed canvas rucksack with a buckled flap and leather straps.
  'canvas rucksack'(c) {
    const { s, look } = c, canvas = { color: look.trimColour || 0x5a5a40, roughness: .9 }, leather = { color: 0x5c3a1f, roughness: .5 }, brass = { color: 0xb99a4a, roughness: .35, metalness: .85 };
    pack(c, { w: .15, h: .19, d: .085, low: .04, body: canvas, strap: leather, round: .5, taper: .16 }, (put, w, h, d) => {
      const flap = soft(w * .96, h * .42, d * .95, .55, -.08); flap.rotateX(.45); put('Bag flap', flap, 0, h * .7, -d * .3, canvas);
      for (const side of [-1, 1]) {
        put('Bag pocket', soft(w * .2, h * .34, d * .5, .5, .05), side * w * 1.02, -h * .4, 0, canvas);
        put('Bag strap', new THREE.BoxGeometry(.018 * s, h * .78, .004 * s), side * w * .4, h * .12, -d * 1.2, leather);
        put('Bag buckle', new THREE.BoxGeometry(.028 * s, .022 * s, .007 * s), side * w * .4, -h * .16, -d * 1.24, brass);
      }
      put('Bag patch', new THREE.BoxGeometry(w * .7, h * .3, .004 * s), 0, -h * .55, -d * 1.12, { color: 0x3f5670, roughness: .9 });
      put('Bag roll', soft(w * 1.05, .035 * s, .035 * s, .8, 0), 0, h * 1.12, d * .1, { color: 0x6b2a26, roughness: .95 });
    });
  },
  // Prada Sport: a slim technical pack with a moulded panel and the red line.
  'sport backpack'(c) {
    const { s, look } = c, nylon = { color: look.trimColour || 0x17171a, roughness: .45 }, rubber = { color: 0x0c0c0d, roughness: .3 }, red = { color: 0xc2261c, roughness: .5 };
    pack(c, { w: .125, h: .2, d: .06, low: .03, body: nylon, strap: rubber, round: .6, taper: .3 }, (put, w, h, d) => {
      put('Bag panel', soft(w * .7, h * .62, d * .35, .6, .3), 0, -h * .12, -d * .85, rubber);
      put('Bag line', new THREE.BoxGeometry(.05 * s, .008 * s, .003 * s), 0, h * .5, -d * 1.02, red);
      put('Bag zip', tube([V(-w * .7, h * .2, -d * .55), V(-w * .45, h * .72, -d * .5), V(w * .45, h * .72, -d * .5), V(w * .7, h * .2, -d * .55)], .0022 * s), 0, 0, 0, DARK_SILVER);
      put('Bag strap', new THREE.BoxGeometry(w * 1.9, .018 * s, .004 * s), 0, -h * .62, -d * .7, rubber);
    });
  },
  // Issey Miyake BAO BAO: a tote of triangular tiles that folds wherever it is set down.
  'prism tote'(c) {
    const { s, look } = c, side = 1, { put, handle } = slung(c, { side, drop: .05, strap: { color: 0x151517, roughness: .6 }, radius: .004, out: .03 });
    const n = 6, size = .046 * s, shine = { color: look.trimColour || 0xb9babd, roughness: .25, metalness: .7, flatShading: true }, base = { color: 0x151517, roughness: .8 };
    put('Bag', new THREE.BoxGeometry(.008 * s, n * size, n * size), 0, 0, 0, base);
    // Each square of the grid is two triangles, each a low pyramid of its own.
    const coords = [];
    for (const face of [-1, 1]) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (const half of [0, 1]) {
      const y0 = (i - n / 2) * size, z0 = (j - n / 2) * size, g = .0025 * s, x = face * .0045 * s;
      const corners = half ? [[y0 + g, z0 + g], [y0 + size - g, z0 + g], [y0 + g, z0 + size - g]] : [[y0 + size - g, z0 + size - g], [y0 + g, z0 + size - g], [y0 + size - g, z0 + g]];
      const mid = [(corners[0][0] + corners[1][0] + corners[2][0]) / 3, (corners[0][1] + corners[1][1] + corners[2][1]) / 3], peak = x + face * (.004 + .004 * ((i * 7 + j * 3 + half) % 3)) * s;
      for (let k = 0; k < 3; k++) { const a = corners[k], b = corners[(k + 1) % 3], order = face > 0 ? [a, b] : [b, a]; coords.push(x, order[0][0], order[0][1], x, order[1][0], order[1][1], peak, mid[0], mid[1]); }
    }
    const tiles = new THREE.BufferGeometry(); tiles.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3)); tiles.computeVertexNormals();
    put('Bag tiles', tiles, 0, 0, 0, shine);
    handle(-.05 * s, .05 * s, n * size / 2);
  },
  // Balenciaga's Motorcycle City: a slouching lambskin satchel with a zipped pocket, studs and tassels.
  'city bag'(c) {
    const { s, look } = c, leather = { color: look.trimColour || 0x23201e, roughness: .55 }, brass = { color: 0x9a8246, roughness: .4, metalness: .8 };
    const { put, handle } = slung(c, { side: -1, drop: .03, strap: leather, radius: .006, out: .05 });
    const w = .1 * s, h = .075 * s, d = .19 * s;
    put('Bag', soft(w * .42, h, d * .5, .45, .2), 0, 0, 0, leather);
    put('Bag pocket', soft(w * .1, h * .5, d * .36, .4, 0), -w * .42, -h * .2, 0, leather);
    put('Bag zip', new THREE.BoxGeometry(.004 * s, .005 * s, d * .7), -w * .5, h * .34, 0, brass);
    for (const z of [-1, 1]) {
      put('Bag stud', new THREE.SphereGeometry(.007 * s, 8, 6), -w * .5, -h * .55, z * d * .3, brass);
      put('Bag stud', new THREE.SphereGeometry(.007 * s, 8, 6), -w * .44, h * .7, z * d * .4, brass);
      put('Bag tassel', new THREE.BoxGeometry(.003 * s, .07 * s, .006 * s), -w * .52, h * .0, z * d * .33, leather);
    }
    put('Bag top', new THREE.BoxGeometry(w * .2, .008 * s, d * .86), 0, h * .98, 0, brass);
    handle(-d * .22, d * .22, h * .9);
  },
  // Vivienne Westwood's Buffalo hat: a tall crown pinched in at the front and a wide rolled brim.
  'buffalo hat'({ attach, marks, look, s }) {
    const felt = { color: look.trimColour || 0x6b4a2c, roughness: .95, side: THREE.DoubleSide }, crown = V(...marks.crown), eyes = V(...marks.eye_l).lerp(V(...marks.eye_r), .5);
    const r = .09 * s, base = crown.y - .082 * s, centreZ = crown.z + (eyes.z - crown.z) * .1;
    const profile = [[r, 0], [r * .99, .05], [r * .95, .11], [r * .82, .165], [r * .5, .19], [r * .18, .175], [0, .155]].map(([x, y]) => new THREE.Vector2(x, y * s));
    const top = new THREE.LatheGeometry(profile, 28), p = top.attributes.position;
    // The dent down the front of the crown.
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), up = y / (.19 * s); if (z > 0) p.setZ(i, z * (1 - .28 * up * Math.exp(-((x / (r * .5)) ** 2)))); }
    top.scale(1, 1, 1.12); top.computeVertexNormals(); top.translate(crown.x, base, centreZ); attach('Head', 'Hat crown', top, felt);
    const brim = new THREE.LatheGeometry([[r * .97, .004], [r * 1.35, -.003], [r * 1.66, .006], [r * 1.75, .02], [r * 1.7, .027]].map(([x, y]) => new THREE.Vector2(x, y * s)), 32);
    brim.scale(1, 1, 1.12); brim.translate(crown.x, base, centreZ); attach('Head', 'Hat brim', brim, felt);
    const band = new THREE.CylinderGeometry(r * 1.0, r * 1.01, .022 * s, 28, 1, true); band.scale(1, 1, 1.12); band.translate(crown.x, base + .016 * s, centreZ); attach('Head', 'Hat band', band, { color: 0x2a1c10, roughness: .8, side: THREE.DoubleSide });
  },
  // Alexander McQueen, Widows of Culloden: a pair of antlers rising from a band, as under the show's lace veil.
  'horned headpiece'({ attach, marks, look, s }) {
    const horn = { color: look.trimColour || 0xd9cdb3, roughness: .7 }, crown = V(...marks.crown), eyes = V(...marks.eye_l).lerp(V(...marks.eye_r), .5), z = crown.z + (eyes.z - crown.z) * .25;
    const band = new THREE.TorusGeometry(.082 * s, .006 * s, 6, 28); band.rotateX(Math.PI / 2 - .25); band.scale(1, 1, 1.15); band.translate(crown.x, crown.y - .05 * s, z - .01 * s);
    attach('Head', 'Headpiece band', band, { color: 0x1b1b1d, roughness: .6 });
    for (const side of [-1, 1]) {
      const root = V(crown.x + side * .055 * s, crown.y - .02 * s, z), at = (x, y, dz) => root.clone().add(V(side * x * s, y * s, dz * s));
      attach('Head', 'Antler', tube([root, at(.03, .07, -.01), at(.09, .15, -.03), at(.13, .25, -.02), at(.12, .34, .01)], .0095 * s, false, 7), horn);
      for (const [from, to] of [[[.03, .07, -.01], [.02, .16, .05]], [[.09, .15, -.03], [.17, .2, .03]], [[.13, .25, -.02], [.2, .31, -.04]], [[.12, .3, 0], [.07, .38, .04]]])
        attach('Head', 'Antler tine', tube([at(...from), at((from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + .01, (from[2] + to[2]) / 2), at(...to)], .006 * s, false, 6), horn);
    }
  },
  // Maison Martin Margiela: shards of broken porcelain strung on wire.
  'plate necklace'(c) {
    const { attach, s } = c, low = necklace(c, { drop: .15, radius: .0012, material: DARK_SILVER }), china = { color: 0xf1efe6, roughness: .2, side: THREE.DoubleSide };
    const shards = [[-.05, .035, .5], [-.028, .012, -.3], [0, 0, .1], [.03, .014, -.6], [.052, .04, .4], [-.014, -.03, .9], [.018, -.026, -.2]];
    shards.forEach(([x, y, turn], i) => {
      const shape = new THREE.Shape(), n = 5, size = (.017 + .006 * (i % 3)) * s;
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + turn, r = size * (.6 + .4 * ((k * 5 + i * 3) % 4) / 3); k ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      const g = new THREE.ExtrudeGeometry(shape, { depth: .0025 * s, bevelEnabled: false }); g.rotateZ(turn); g.translate(low.x + x * s, low.y + y * s + .012 * s, low.z + .001 * s * (i % 2));
      attach('spine_03', 'Necklace shard', g, china);
      if (i % 2 === 0) { const line = new THREE.TorusGeometry(size * .45, .0007 * s, 4, 14); line.translate(low.x + x * s, low.y + y * s + .012 * s, low.z + .0035 * s); attach('spine_03', 'Necklace glaze', line, { color: 0x2f4a8c, roughness: .3 }); }
    });
  },
  // Ann Demeulemeester: one long black feather on a leather cord.
  'feather necklace'(c) {
    const { attach, s, look } = c, cord = { color: 0x151517, roughness: .8 }, low = necklace(c, { drop: .17, radius: .0013, material: cord });
    const vane = new THREE.Shape(); vane.moveTo(0, 0); vane.bezierCurveTo(.02 * s, -.03 * s, .024 * s, -.12 * s, .004 * s, -.19 * s); vane.bezierCurveTo(-.02 * s, -.12 * s, -.018 * s, -.03 * s, 0, 0);
    const feather = new THREE.ShapeGeometry(vane, 10); feather.rotateZ(.12); feather.translate(low.x, low.y, low.z + .002 * s);
    attach('spine_03', 'Necklace feather', feather, { color: look.trimColour || 0x17171a, roughness: .55, side: THREE.DoubleSide });
    attach('spine_03', 'Necklace quill', tube([low.clone().add(V(0, .004 * s, .003 * s)), low.clone().add(V(.004 * s, -.09 * s, .004 * s)), low.clone().add(V(.012 * s, -.185 * s, .003 * s))], .0012 * s), { color: 0xb9b3a3, roughness: .5 });
    const cap = new THREE.CylinderGeometry(.003 * s, .003 * s, .012 * s, 8); cap.translate(low.x, low.y + .004 * s, low.z + .003 * s); attach('spine_03', 'Necklace cap', cap, SILVER);
  },
  // Chrome Hearts: a silver dagger on a chain.
  'dagger pendant'(c) {
    const { attach, s } = c, low = necklace(c, { drop: .16, radius: .0018, material: SILVER }), z = low.z + .003 * s;
    const blade = new THREE.Shape(); blade.moveTo(-.005 * s, 0); blade.lineTo(.005 * s, 0); blade.lineTo(.0035 * s, -.035 * s); blade.lineTo(0, -.052 * s); blade.lineTo(-.0035 * s, -.035 * s);
    const b = new THREE.ExtrudeGeometry(blade, { depth: .002 * s, bevelEnabled: false }); b.translate(low.x, low.y - .016 * s, z); attach('spine_03', 'Pendant blade', b, SILVER);
    const guard = new THREE.BoxGeometry(.022 * s, .004 * s, .004 * s); guard.translate(low.x, low.y - .014 * s, z + .001 * s); attach('spine_03', 'Pendant guard', guard, DARK_SILVER);
    const grip = new THREE.CylinderGeometry(.0026 * s, .0026 * s, .014 * s, 8); grip.translate(low.x, low.y - .006 * s, z + .001 * s); attach('spine_03', 'Pendant grip', grip, DARK_SILVER);
    const pommel = new THREE.SphereGeometry(.0042 * s, 8, 6); pommel.translate(low.x, low.y + .002 * s, z + .001 * s); attach('spine_03', 'Pendant pommel', pommel, SILVER);
  },
  // Vivienne Westwood: a jointed silver finger of armour, from the knuckle to the nail.
  'armour ring'(c) {
    const { s } = c;
    for (const [bone, radius, wide] of [[1, .0112, 5.2], [2, .0102, 4.2], [3, .0092, 3.2]]) {
      const made = ring(c, 'middle', 'l', { bone: Math.min(bone, 2), where: bone === 3 ? 1.45 : .5, radius, thick: .0022, wide, material: SILVER });
      const ridge = new THREE.ConeGeometry(.0036 * s, .008 * s, 4); made.set('Ring point', ridge, 1.15);
    }
  },
  // Chrome Hearts: a heavy band with crosses cut round it.
  'cemetery ring'(c) {
    const { s } = c, made = ring(c, 'ring', 'r', { radius: .0108, thick: .0034, wide: 2.3, material: SILVER });
    made.set('Ring cross', crossShape(.011 * s, .5, .0012 * s), 1.34, { color: 0x2a2a2d, roughness: .6, metalness: .6 });
  },
  // Chrome Hearts: a band carrying a raised floral cross.
  'floral cross ring'(c) {
    const { s } = c, made = ring(c, 'index', 'r', { radius: .0108, thick: .003, wide: 1.5, material: SILVER });
    made.set('Ring plate', new THREE.CylinderGeometry(.0085 * s, .0085 * s, .002 * s, 14), 1.3, DARK_SILVER);
    made.set('Ring cross', crossShape(.019 * s, .55, .002 * s), 1.42, SILVER);
  },
};
