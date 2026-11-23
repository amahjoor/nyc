import * as THREE from './vendor/three.module.min.js';
import { createLeafMaterial } from './foliage.js';

// The trees of a park, one for every crown the lidar found.
//
// What is measured is where each crown's top stands, how tall it is and how
// much ground it covers. A tree is drawn to that height and spread; its
// shape is one of a few drawn forms, turned and tinted by where it stands,
// since nothing here records a species.
//
// Tens of thousands of trees are in view at once from the middle of a park,
// so each is drawn at one of three levels: boughs and limbs for the few
// hundred nearest, three leafy masses on a trunk in the middle distance, one
// mass beyond that. The park is cut into cells; a cell is drawn at the middle
// level or, far off, four cells together at the last, and the nearest trees
// are lifted out of their cells one by one.

/** Metres from the camera within which a tree is drawn in full, a cell of trees at the middle level, and any tree at all. */
export const TREE_RANGE = { near: 48, mid: 170, far: 1500 };
/** Trees further off than this leave their shadows to the darkened ground beneath them. */
const SHADOW_RANGE = 150, NEAR_TREES = 900;
export const TREE_CELL = 140;
/** A tree's crown begins at this share of its height; trunk radius is this share of the crown's. */
const CROWN_BASE = .27, TRUNK = .05, CONIFER_BASE = .12;

function random(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Collects triangles in a tree's own space: x and z in crown radii, y in tree heights. */
class TreeWriter {
  constructor(base) { this.base = base; this.position = []; this.normal = []; this.crown = []; }
  /** A leafy mass: a lumpy ball centred at c with radii r, shaded partly as a ball of its own and partly as a bulge of the whole crown. */
  lump(c, r, detail, seed) {
    const ball = new THREE.IcosahedronGeometry(1, detail), source = ball.index ? ball.toNonIndexed() : ball, p = source.attributes.position;
    const middle = (this.base + 1) / 2, half = (1 - this.base) / 2;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const swell = 1 + .2 * Math.sin(x * 5.1 + seed) * Math.sin(y * 4.3 + seed * 2) + .17 * Math.sin(z * 6.7 + seed * 3) * Math.cos(x * 3.9 + seed)
        + .1 * Math.sin((x + y + z) * 9 + seed) + .07 * Math.sin(x * 13 + seed * 5) * Math.sin(z * 11 + y * 7);
      const px = c[0] + x * r[0] * swell, py = c[1] + y * r[1] * swell * (y < 0 ? .8 : 1), pz = c[2] + z * r[2] * swell;
      // Crown coordinates run -1 to 1 through the crown, as the leaf shader expects.
      const kx = px, ky = (py - middle) / half, kz = pz;
      let nx = x * .55 + kx * .45, ny = y * .55 + ky * .45 + .08, nz = z * .55 + kz * .45;
      const length = Math.hypot(nx, ny, nz) || 1;
      this.position.push(px, py, pz); this.normal.push(nx / length, ny / length, nz / length); this.crown.push(kx, ky, kz, 1);
    }
    ball.dispose(); if (source !== ball) source.dispose();
  }
  /** A tapering limb from a to b, of `sides` faces. */
  limb(a, b, ra, rb, sides) {
    const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), length = axis.length();
    if (length < 1e-6) return;
    axis.divideScalar(length);
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(axis.x) > .9) u.set(0, 0, 1);
    u.cross(axis).normalize();
    const v = new THREE.Vector3().crossVectors(axis, u);
    const ring = (centre, radius, k) => {
      const angle = k / sides * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      return [centre[0] + (u.x * c + v.x * s) * radius, centre[1] + (u.y * c + v.y * s) * radius * .3, centre[2] + (u.z * c + v.z * s) * radius, u.x * c + v.x * s, u.y * c + v.y * s, u.z * c + v.z * s];
    };
    for (let k = 0; k < sides; k++) {
      const a0 = ring(a, ra, k), a1 = ring(a, ra, k + 1), b0 = ring(b, rb, k), b1 = ring(b, rb, k + 1);
      for (const corner of [a0, b0, a1, a1, b0, b1]) { this.position.push(corner[0], corner[1], corner[2]); this.normal.push(corner[3], corner[4], corner[5]); this.crown.push(corner[0], corner[1], corner[2], 0); }
    }
  }
  /** The trunk, spreading into the ground at its foot. */
  trunk(top, sides, flare = true) {
    const rings = flare ? [[-.012, TRUNK * 1.9], [.018, TRUNK * 1.25], [.06, TRUNK], [top, TRUNK * .72]] : [[-.012, TRUNK * 1.3], [top, TRUNK * .75]];
    for (let i = 0; i + 1 < rings.length; i++) this.limb([0, rings[i][0], 0], [0, rings[i + 1][0], 0], rings[i][1], rings[i + 1][1], sides);
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute('aCrown', new THREE.Float32BufferAttribute(this.crown, 4));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// The three masses every broad-leaved form has in common: [centre, radii]. A
// form adds boughs of its own around them, so a tree that steps down to these
// three alone keeps its outline.
const MASSES = [[[0, .62, 0], [.82, .27, .82]], [[.16, .84, -.1], [.54, .15, .54]], [[-.2, .47, .14], [.62, .16, .6]]];

/**
 * Tree shapes in a tree's own space. `near` has four forms (three broad-leaved, one conifer),
 * `mid` two (broad-leaved, conifer), `far` one.
 */
export function buildTreeForms() {
  const broad = variant => {
    const next = random(977 + variant * 131), tree = new TreeWriter(CROWN_BASE), boughs = [];
    MASSES.forEach(([c, r], i) => tree.lump(c, r, 1, 1.7 + i * 2.3 + variant));
    // Boughs: lower and wider on one form, higher and closer on the next.
    const count = 5 + variant, reach = [.62, .5, .7][variant], level = [.5, .6, .43][variant];
    for (let i = 0; i < count; i++) {
      const angle = (i + next() * .7) / count * Math.PI * 2, out = reach * (.8 + .4 * next()), y = level + (next() - .4) * .26, size = .3 + .16 * next();
      const centre = [Math.cos(angle) * out, y, Math.sin(angle) * out];
      tree.lump(centre, [size, size * .36, size], 0, 3.1 + i * 1.9 + variant * 7);
      boughs.push(centre);
    }
    tree.trunk(CROWN_BASE + .2, 8);
    // Limbs fork from the trunk under the crown and run out into the boughs.
    for (const [i, centre] of boughs.entries()) if (i % 2 === 0 || variant === 2) tree.limb([0, CROWN_BASE - .06 + .05 * (i % 3), 0], [centre[0] * .82, centre[1] - .02, centre[2] * .82], TRUNK * .5, TRUNK * .16, 5);
    return tree.geometry();
  };
  const conifer = detail => {
    const tree = new TreeWriter(CONIFER_BASE), tiers = detail ? [[.24, .92], [.42, .74], [.6, .55], [.77, .36], [.92, .16]] : [[.3, .9], [.62, .55], [.9, .2]];
    tiers.forEach(([y, r], i) => tree.lump([0, y, 0], [r, .13, r], detail ? 1 : 0, 2.2 + i * 1.3));
    tree.trunk(.9, detail ? 6 : 4, Boolean(detail));
    return tree.geometry();
  };
  const middle = () => {
    const tree = new TreeWriter(CROWN_BASE);
    tree.lump(MASSES[0][0], MASSES[0][1], 1, 1.7); tree.lump(MASSES[1][0], MASSES[1][1], 0, 4); tree.lump(MASSES[2][0], MASSES[2][1], 0, 6.3);
    tree.trunk(CROWN_BASE + .2, 5, false);
    return tree.geometry();
  };
  const distant = () => {
    const tree = new TreeWriter(CROWN_BASE);
    tree.lump([0, .64, 0], [.94, .35, .94], 0, 1.7);
    tree.trunk(CROWN_BASE + .15, 3, false);
    return tree.geometry();
  };
  return { near: [broad(0), broad(1), broad(2), conifer(1)], mid: [middle(), conifer(0)], far: [distant()] };
}

/** The leaf material, taught to draw limbs as bark and to stir each tree on its own beat. */
export function createTreeMaterial() {
  const material = createLeafMaterial({ attribute: true });
  material.name = 'Park trees';
  const leaves = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    leaves(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
	if ( vCrown.w < 0.5 ) {
		// Bark: furrowed along the limb, the same grey-brown on every tree.
		float furrow = texture2D( uNycNoise, vec2( vCrown.x * 9.0 + vCrown.z * 7.0, vCrown.y * 1.3 ) ).r;
		diffuseColor.rgb = vec3( 0.13, 0.112, 0.094 ) * ( 0.62 + 0.76 * furrow );
	}`);
  };
  material.customProgramCacheKey = () => 'nyc-park-trees';
  return material;
}

/** What a tree is drawn as: which form, how it is turned, stretched and tinted. All from where it stands. */
export function treeLook(x, z, height, radius) {
  const a = ((x * 12.9898 + z * 78.233) % 1 + 1) % 1, b = (a * 57.31 + .13) % 1, c = (b * 31.7 + .29) % 1;
  // A crown is seldom wider than the tree is tall, whatever the segmentation made of it.
  const spread = Math.max(1.3, Math.min(radius * 1.08, height * .62, 11.5));
  const slender = height / spread;
  const form = slender > 9 && c > .5 ? 3 : slender > 3.4 ? (a < .6 ? 1 : a < .8 ? 0 : 2) : (a < .5 ? 0 : a < .8 ? 2 : 1);
  // July greens: most a middle green, some yellower, some blue-dark.
  const warm = b * b, light = .8 + .5 * c;
  return { form, turn: a * Math.PI * 2, spread, sx: spread * (.9 + .22 * b), sz: spread * (.9 + .22 * c),
    tint: form === 3 ? [.05 * light, .11 * light, .05 * light] : [(.082 + .07 * warm) * light, (.168 + .075 * warm) * light, (.048 + .03 * warm - .012 * c) * light] };
}

/**
 * @param {object} options
 * @param {Uint16Array} options.records six numbers a tree (see park.json `trees`)
 * @param {number[]} options.scale and options.offset: how to read them
 * @param {{x:number,z:number,cos:number,sin:number}} options.frame the park's frame
 * @param {string} [options.name] what its trunks are called among the street's objects: one name a park
 */
export async function createParkTrees({ scene = null, records, scale, offset, frame, physics = null, cell = TREE_CELL, range = TREE_RANGE, pause = null, name = 'park-trees' } = {}) {
  // Fifty thousand trees take a tenth of a second to lay out: given `pause`, that is spread over frames.
  let since = performance.now();
  const breathe = async () => { if (pause && performance.now() - since > 6) { await pause(); since = performance.now(); } };
  const count = Math.floor(records.length / 6), group = new THREE.Group(), cells = new Map(), blocks = new Map();
  group.name = 'Park trees'; scene?.add(group);
  const forms = buildTreeForms(), material = createTreeMaterial();
  const trees = new Array(count), dummy = new THREE.Object3D(), tint = new THREE.Color(), sphere = new THREE.Sphere(), hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) {
    const read = k => records[i * 6 + k] * scale[k] + offset[k];
    const lx = read(0), lz = read(1), x = frame.x + lx * frame.cos - lz * frame.sin, z = frame.z + lx * frame.sin + lz * frame.cos;
    const tree = { x, y: read(2), z, height: read(3), radius: read(4), look: null, matrix: new THREE.Matrix4(), mesh: null, slot: 0, near: false };
    const look = tree.look = treeLook(x, z, tree.height, tree.radius);
    dummy.position.set(x, tree.y, z); dummy.rotation.set(0, look.turn, 0); dummy.scale.set(look.sx, tree.height, look.sz); dummy.updateMatrix();
    tree.matrix.copy(dummy.matrix);
    trees[i] = tree;
    const cx = Math.floor(lx / cell), cz = Math.floor(lz / cell), key = `${cx},${cz}`;
    if (!cells.has(key)) cells.set(key, Object.assign([], { block: `${cx >> 1},${cz >> 1}` }));
    cells.get(key).push(tree);
    if (i % 2000 === 1999) await breathe();
  }
  const instanced = (geometry, list, name, own = false) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.name = name; mesh.receiveShadow = true; mesh.visible = false;
    list.forEach((tree, i) => {
      mesh.setMatrixAt(i, tree.matrix); mesh.setColorAt(i, tint.setRGB(tree.look.tint[0], tree.look.tint[1], tree.look.tint[2]));
      if (own) { tree.mesh = mesh; tree.slot = i; }
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  const pieces = [];
  for (const list of cells.values()) {
    const mid = [instanced(forms.mid[0], list.filter(tree => tree.look.form !== 3), 'Park trees, middle distance', true),
      instanced(forms.mid[1], list.filter(tree => tree.look.form === 3), 'Park trees, middle distance', true)].filter(Boolean);
    sphere.copy(mid[0].boundingSphere);
    for (const mesh of mid) sphere.union(mesh.boundingSphere);
    const piece = { mid, far: instanced(forms.far[0], list, 'Park trees, far'), x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, radius: sphere.radius, trees: list, shown: false };
    pieces.push(piece);
    await breathe();
    if (!blocks.has(list.block)) blocks.set(list.block, { pieces: [], trees: [], far: null });
    const block = blocks.get(list.block);
    block.pieces.push(piece); for (const tree of list) block.trees.push(tree);
  }
  // The simplest trees are kept twice: by the cell, and for four cells together when all four are far off.
  for (const block of blocks.values()) {
    block.far = instanced(forms.far[0], block.trees, 'Park trees, far');
    sphere.copy(block.far.boundingSphere);
    Object.assign(block, { x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, radius: sphere.radius });
    await breathe();
  }
  // The nearest trees, whichever cells they stand in, are drawn from these.
  const near = forms.near.map(geometry => {
    const mesh = new THREE.InstancedMesh(geometry, material, NEAR_TREES);
    mesh.name = 'Park trees, near'; mesh.count = 0; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, tint.setRGB(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  });
  let nearAt = null, nearList = [], stemsAt = null, shown = false;
  const away = (part, eye) => Math.hypot(part.x - eye.x, part.y - (eye.y ?? part.y), part.z - eye.z) - part.radius;
  function liftNearest(eye) {
    nearAt = { x: eye.x, y: eye.y ?? 0, z: eye.z };
    const next = [], touched = new Set();
    for (const piece of pieces) {
      if (!piece.shown || away(piece, eye) > range.near) continue;
      for (const tree of piece.trees) {
        const distance = Math.hypot(tree.x - eye.x, tree.y + tree.height * .5 - (eye.y ?? tree.y), tree.z - eye.z);
        // A tree already lifted stays so a little further out, so that none flickers at the edge.
        if (distance < (tree.near ? range.near + 6 : range.near)) next.push([distance, tree]);
      }
    }
    if (next.length > NEAR_TREES) next.sort((a, b) => a[0] - b[0]);
    next.length = Math.min(next.length, NEAR_TREES);
    const chosen = new Set(next.map(entry => entry[1]));
    for (const tree of nearList) if (!chosen.has(tree)) { tree.near = false; tree.mesh.setMatrixAt(tree.slot, tree.matrix); touched.add(tree.mesh); }
    const counts = near.map(() => 0);
    nearList = [];
    for (const tree of chosen) {
      if (!tree.near) { tree.near = true; tree.mesh.setMatrixAt(tree.slot, hidden); touched.add(tree.mesh); }
      const mesh = near[tree.look.form], slot = counts[tree.look.form]++;
      mesh.setMatrixAt(slot, tree.matrix); mesh.setColorAt(slot, tint.setRGB(tree.look.tint[0], tree.look.tint[1], tree.look.tint[2]));
      nearList.push(tree);
    }
    near.forEach((mesh, form) => { mesh.count = counts[form]; mesh.visible = counts[form] > 0; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; });
    for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
  }
  return {
    group, material, count, cells: pieces.length, blocks: blocks.size,
    /** How much is drawn at each level: trees in full, cells of trees at the other two. */
    get drawn() {
      let mid = 0, far = 0;
      for (const piece of pieces) if (piece.shown) mid++;
      for (const block of blocks.values()) for (const piece of block.pieces) if (block.far.visible || piece.far.visible) far++;
      return { near: nearList.length, mid, far };
    },
    /**
     * @param {{x:number,y:number,z:number}} eye where the camera is
     * @param {{x:number,z:number}} focus where the player is: trunks near it can be run into
     */
    update(eye, focus = eye, visible = true) {
      group.visible = visible;
      if (!visible) { if (shown && physics) { physics.replace(name, []); stemsAt = null; } shown = false; return; }
      shown = true;
      let changed = false;
      for (const block of blocks.values()) {
        const distance = away(block, eye), level = distance < range.mid ? 'cells' : distance < range.far ? 'far' : null;
        block.far.visible = level === 'far';
        for (const piece of block.pieces) {
          const reach = level === 'cells' ? away(piece, eye) : Infinity, show = reach < range.mid;
          if (show !== piece.shown) { piece.shown = show; changed = true; }
          piece.far.visible = level === 'cells' && !show;
          for (const mesh of piece.mid) { mesh.visible = show; mesh.castShadow = reach < SHADOW_RANGE; }
        }
      }
      if (changed || !nearAt || Math.hypot(eye.x - nearAt.x, (eye.y ?? 0) - nearAt.y, eye.z - nearAt.z) > 5) liftNearest(eye);
      if (physics && (!stemsAt || Math.hypot(focus.x - stemsAt.x, focus.z - stemsAt.z) > 25)) {
        stemsAt = { x: focus.x, z: focus.z };
        const stems = [];
        for (const piece of pieces) {
          if (Math.hypot(piece.x - focus.x, piece.z - focus.z) - piece.radius > 90) continue;
          for (const tree of piece.trees) if (Math.hypot(tree.x - focus.x, tree.z - focus.z) < 90) {
            stems.push({ kind: 'tree', x: tree.x, y: tree.y, z: tree.z, radius: Math.max(.12, tree.look.spread * TRUNK * .9), height: tree.height * CROWN_BASE });
          }
        }
        physics.replace(name, stems);
      }
    },
    /** Trees whose trunks stand within `radius` of a point. */
    near(x, z, radius) { return trees.filter(tree => Math.hypot(tree.x - x, tree.z - z) <= radius); },
    dispose() {
      physics?.replace(name, []);
      for (const piece of pieces) for (const mesh of [...piece.mid, piece.far]) mesh.dispose();
      for (const block of blocks.values()) block.far.dispose();
      for (const mesh of near) mesh.dispose();
      for (const list of Object.values(forms)) for (const geometry of list) geometry.dispose();
      material.dispose(); group.removeFromParent();
    },
  };
}
