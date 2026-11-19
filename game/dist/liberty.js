import * as THREE from './vendor/three.module.min.js';

// The Statue of Liberty.
//
// The building survey measures her as it measures everything: an outline
// (twelve metres across, fifty-one points) and a height, 46.66 m, standing
// on a base at 47.57 m. The game seats every surveyed mass on the ground,
// so that one was buried inside the pedestal, and nothing stood on top.
//
// What is measured is used: where she stands, how high the pedestal's top is,
// how tall she is, and which way the fort faces (its outline mirrors about
// an axis 147 degrees from north, and she looks out along it to the harbour
// mouth). Her figure is drawn here, to the dimensions the National Park
// Service publishes: 33.86 m from heel to the top of the head, 46.05 m to
// the torch, a right arm of 12.8 m, a tablet 7.19 m by 4.14 m, seven rays.
// The folds of the robe, her face and the flame are sculpted by rule, not
// scanned.

export const STATUE = {
  // The middle of her surveyed outline (feature 339282).
  x: -3627.36, z: 3807.3,
  // The fort and pedestal are one surveyed mass (feature 339279): its middle, and its height above the ground it stands on.
  pedestal: { x: -3627.21, z: 3809.21, height: 43.218 },
  // Heel to the tip of the flame as the survey has it; the figure below is modelled to 46.05 m and scaled to this.
  height: 46.657,
  // The way she faces, as a turn about the vertical from due south toward east: 33 degrees, 147 by the compass.
  facing: .576,
  // Where a visitor is set down: on the flagpole plaza north-west of the fort, looking at her.
  arrival: { x: -3693.7, z: 3708.5, angle: .588 },
};

const MODELLED = 46.05;
// Copper a century and more in the salt air, in linear light; the gilded flame.
const PATINA = [.2, .415, .335], GILT = [1, .68, .17];

/** Collects triangles with a colour at every corner. Each part is shaded smooth within itself. */
class Sculpture {
  constructor() { this.position = []; this.normal = []; this.color = []; }
  /**
   * @param tone a colour, or a function of a vertex's position giving one
   * @param faceted keep each face flat: a slab, not a rounded form
   */
  add(geometry, tone, faceted = false) {
    geometry.computeVertexNormals();
    const flat = geometry.index ? geometry.toNonIndexed() : geometry, p = flat.attributes.position, n = flat.attributes.normal;
    if (!geometry.index && !faceted) {
      // A solid built face by face has no shared corners: give every corner at one place the mean of its faces' normals.
      const sums = new Map(), key = i => `${Math.round(p.getX(i) * 500)},${Math.round(p.getY(i) * 500)},${Math.round(p.getZ(i) * 500)}`;
      for (let i = 0; i < p.count; i++) { const k = key(i), sum = sums.get(k) || sums.set(k, [0, 0, 0]).get(k); sum[0] += n.getX(i); sum[1] += n.getY(i); sum[2] += n.getZ(i); }
      for (let i = 0; i < p.count; i++) { const sum = sums.get(key(i)), length = Math.hypot(sum[0], sum[1], sum[2]) || 1; n.setXYZ(i, sum[0] / length, sum[1] / length, sum[2] / length); }
    }
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), colour = typeof tone === 'function' ? tone(x, y, z) : tone;
      this.position.push(x, y, z); this.normal.push(n.getX(i), n.getY(i), n.getZ(i)); this.color.push(colour[0], colour[1], colour[2]);
    }
    geometry.dispose(); if (flat !== geometry) flat.dispose();
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
    return geometry;
  }
}

const smooth = t => t * t * (3 - 2 * t);
/** A value along a list of [at, value...] keys, eased between them. */
function along(keys, at) {
  if (at <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) if (at <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i], t = smooth((at - a[0]) / (b[0] - a[0]));
    return a.slice(1).map((value, k) => value + (b[k + 1] - value) * t);
  }
  return keys.at(-1).slice(1);
}

/**
 * A surface drawn round a rising spine: at each height an oval, pushed in and out by `relief`.
 * @param {number[][]} rings [y, x, z, rx, rz] upward
 * @param {(angle:number, y:number) => number} relief a factor on the radius
 */
function loft(rings, around, relief = () => 1, { capTop = true, capBottom = true } = {}) {
  const position = [], index = [];
  for (const [y, x, z, rx, rz] of rings) for (let j = 0; j < around; j++) {
    const angle = j / around * Math.PI * 2, r = relief(angle, y);
    position.push(x + Math.cos(angle) * rx * r, y, z + Math.sin(angle) * rz * r);
  }
  for (let i = 0; i + 1 < rings.length; i++) for (let j = 0; j < around; j++) {
    const a = i * around + j, b = i * around + (j + 1) % around, c = a + around, d = b + around;
    index.push(a, c, b, b, c, d);
  }
  for (const [cap, ring, flip] of [[capBottom, 0, false], [capTop, rings.length - 1, true]]) {
    if (!cap) continue;
    const centre = position.length / 3, [y, x, z] = rings[ring];
    position.push(x, y, z);
    for (let j = 0; j < around; j++) { const a = ring * around + j, b = ring * around + (j + 1) % around; index.push(...(flip ? [centre, b, a] : [centre, a, b])); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setIndex(index);
  return geometry;
}

/** A limb: a tube through points [x, y, z, radius], rounded off at both ends. */
function limb(points, sides = 12) {
  const position = [], index = [], up = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), tangent = new THREE.Vector3();
  const at = points.map(point => new THREE.Vector3(point[0], point[1], point[2]));
  // Close each end with a small ring a little beyond it.
  const first = at[0].clone().addScaledVector(at[1].clone().sub(at[0]).normalize(), -points[0][3] * .55), last = at.at(-1).clone().addScaledVector(at.at(-1).clone().sub(at.at(-2)).normalize(), points.at(-1)[3] * .55);
  const path = [[first, points[0][3] * .45], ...at.map((point, i) => [point, points[i][3]]), [last, points.at(-1)[3] * .45]];
  path.forEach(([centre, radius], i) => {
    tangent.copy(path[Math.min(path.length - 1, i + 1)][0]).sub(path[Math.max(0, i - 1)][0]).normalize();
    up.set(0, 0, 1); if (Math.abs(tangent.z) > .9) up.set(1, 0, 0);
    u.crossVectors(up, tangent).normalize(); v.crossVectors(tangent, u);
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2, c = Math.cos(angle) * radius, s = Math.sin(angle) * radius;
      position.push(centre.x + u.x * c + v.x * s, centre.y + u.y * c + v.y * s, centre.z + u.z * c + v.z * s);
    }
  });
  for (let i = 0; i + 1 < path.length; i++) for (let j = 0; j < sides; j++) {
    const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
    index.push(a, b, c, b, d, c);
  }
  for (const [ring, centre, flip] of [[0, first, true], [path.length - 1, last, false]]) {
    const middle = position.length / 3;
    position.push(centre.x, centre.y, centre.z);
    for (let j = 0; j < sides; j++) { const a = ring * sides + j, b = ring * sides + (j + 1) % sides; index.push(...(flip ? [middle, b, a] : [middle, a, b])); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setIndex(index);
  return geometry;
}

const ball = (centre, radii, detail = 4) => new THREE.IcosahedronGeometry(1, detail).scale(radii[0], radii[1], radii[2]).translate(centre[0], centre[1], centre[2]);
const shade = (tone, amount) => [tone[0] * amount, tone[1] * amount, tone[2] * amount];

/**
 * The figure and her flame, in her own frame: metres, y up from the soles of her feet,
 * +z the way she faces, +x toward her left hand.
 * @returns {{ figure: THREE.BufferGeometry, flame: THREE.BufferGeometry }}
 */
export function buildStatueGeometry() {
  const figure = new Sculpture(), flame = new Sculpture();

  // --- The robe: one surface from the hem to the neck, [height, x, z, half-width, half-depth].
  const profile = [[0, 0, -.2, 5.3, 5.2], [1.2, 0, -.15, 5.0, 4.8], [5, 0, 0, 4.5, 4.2], [10, .1, .1, 4.3, 3.9], [14.5, .15, -.1, 4.4, 3.8], [18.5, .1, 0, 4.0, 3.4],
    [22.5, 0, .35, 4.3, 3.6], [25.2, 0, .1, 4.9, 3.1], [26.4, 0, -.1, 4.6, 2.7], [27.2, 0, -.1, 3.3, 2.3], [27.9, 0, 0, 2.0, 1.8], [28.6, 0, .15, 1.4, 1.4], [29.3, 0, .25, 1.25, 1.3]];
  const rings = [];
  for (let i = 0; i <= 58; i++) { const y = 29.3 * i / 58; rings.push([y, ...along(profile, y)]); }
  // Folds fall from the shoulders and deepen toward the hem; a heavier mantle crosses from the right hip to the left shoulder.
  const fold = (angle, y) => {
    const depth = y < 20 ? .105 - .003 * y : Math.max(.012, .045 - .0055 * (y - 20));
    const narrow = Math.sin(angle * 13 + .6 * Math.sin(y * .35) + y * .05), broad = Math.sin(angle * 5 + y * .12 + 1.3);
    return depth * (Math.sign(narrow) * Math.abs(narrow) ** .7 + .55 * broad);
  };
  const mantle = (angle, y) => .075 * Math.exp(-(((y - (21 + 4.6 * Math.cos(angle - .35))) / 1.25) ** 2)) * (y > 12 ? 1 : 0);
  // Her right knee comes forward: she is in mid-stride.
  const knee = (angle, y) => .07 * Math.exp(-(((y - 9.5) / 3.2) ** 2)) * Math.max(0, Math.cos(angle - 2.05)) ** 3;
  // The robe trails behind her, and the mantle hangs heavy over the arm that holds the tablet.
  const train = (angle, y) => .13 * Math.exp(-((y / 3.6) ** 2)) * Math.max(0, -Math.sin(angle)) ** 2;
  const drape = (angle, y) => .07 * Math.exp(-(((y - 19) / 4.5) ** 2)) * Math.max(0, Math.cos(angle)) ** 4;
  const relief = (angle, y) => 1 + fold(angle, y) + mantle(angle, y) + knee(angle, y) + train(angle, y) + drape(angle, y);
  figure.add(loft(rings, 72, relief), (x, y, z) => {
    // Deep in a fold the copper is darker; rain has streaked it paler down the ridges.
    const angle = Math.atan2(z / 4, x / 4.4), ridge = fold(angle, y) / (y < 20 ? .105 - .003 * y : .045);
    return shade(PATINA, .86 + .16 * Math.max(-1, Math.min(1, ridge)) + .05 * Math.sin(angle * 31 + y * .7));
  });
  // The plinth she stands on.
  figure.add(loft([[-.9, 0, 0, 5.9, 5.6], [-.05, 0, 0, 5.75, 5.45]], 12), shade(PATINA, .78));

  // --- Her right arm, raised, and the torch in its hand.
  figure.add(ball([-3.9, 25.5, -.1], [2.15, 1.9, 2.0]), shade(PATINA, .93));
  figure.add(ball([3.9, 25.2, 0], [2.05, 1.8, 2.0]), shade(PATINA, .93));
  figure.add(limb([[-3.7, 25.3, -.1, 1.95], [-4.9, 28.4, .2, 1.75], [-5.5, 31.6, .5, 1.5], [-5.5, 34.6, .7, 1.3], [-5.3, 37.4, .8, 1.1], [-5.1, 39.3, .85, .95]], 14), shade(PATINA, .96));
  // The sleeve falls back from the raised arm.
  figure.add(limb([[-4.3, 26.6, -.9, 1.5], [-5.1, 28.8, -1.5, 1.2], [-5.6, 30.6, -1.2, .7]], 10), shade(PATINA, .84));
  figure.add(ball([-5.05, 40.15, .9], [.98, 1.02, .98]), shade(PATINA, 1));
  figure.add(limb([[-5.05, 38.3, .9, .5], [-5.05, 42.2, .9, .5]], 10), shade(PATINA, .9));
  figure.add(ball([-5.05, 38.1, .9], [.62, .5, .62], 1), shade(PATINA, .88));
  figure.add(loft([[42.1, -5.05, .9, .55, .55], [42.7, -5.05, .9, 1.2, 1.2], [43.25, -5.05, .9, 1.75, 1.75], [43.45, -5.05, .9, 1.85, 1.85]], 16), shade(PATINA, .95));
  // The gallery round the flame, and its rail.
  figure.add(loft([[43.45, -5.05, .9, 1.95, 1.95], [44.15, -5.05, .9, 1.95, 1.95], [44.15, -5.05, .9, 1.8, 1.8], [43.5, -5.05, .9, 1.8, 1.8]], 16, () => 1, { capTop: false, capBottom: false }), shade(PATINA, .82));
  const blaze = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, r = 1.18 * Math.sin(Math.PI * t ** .72) * (1 - .3 * t) + .04;
    blaze.push([43.5 + 2.55 * t, -5.05 + .28 * Math.sin(t * 5), .9 + .22 * Math.cos(t * 6.5), r, r]);
  }
  flame.add(loft(blaze, 14, (angle, y) => 1 + .14 * Math.sin(angle * 5 + y * 2.2)), (x, y) => shade(GILT, .82 + .2 * (y - 43.5) / 2.55));

  // --- Her left arm, bent to hold the tablet against her side.
  figure.add(limb([[3.7, 25.2, 0, 1.9], [4.9, 23.0, .5, 1.65], [5.4, 20.8, 1.1, 1.4], [4.8, 19.8, 2.6, 1.15], [3.9, 19.6, 3.7, .95]], 14), shade(PATINA, .95));
  figure.add(ball([3.5, 19.75, 4.15], [.95, .85, .9]), shade(PATINA, 1));
  const tablet = new THREE.BoxGeometry(4.14, 7.19, .61).rotateX(-.24).rotateY(.5).translate(4.75, 23.3, 3.2);
  figure.add(tablet.toNonIndexed(), shade(PATINA, 1.04), true);
  tablet.dispose();

  // --- Head: the face forward, hair drawn back to a knot, the diadem and its seven rays.
  const head = new THREE.IcosahedronGeometry(1, 14), hp = head.attributes.position;
  const bump = (u, v, cu, cv, su, sv) => Math.exp(-(((u - cu) / su) ** 2) - (((v - cv) / sv) ** 2));
  // What the face is at a point of the head: [how far it stands out or in, how dark the copper is there].
  const face = (u, v, front) => {
    if (front < .25) return [0, 1];
    const eyes = bump(Math.abs(u), v, .37, .13, .17, .075), mouth = bump(u, v, 0, -.43, .3, .04), lips = bump(u, v, 0, -.43, .26, .1);
    const ridge = Math.exp(-((u / .12) ** 2)) * (v > -.27 && v < .2 ? .1 + .2 * (.2 - v) / .47 : 0), tip = bump(u, v, 0, -.24, .15, .07) * .1;
    const brow = bump(Math.abs(u), v, .36, .245, .26, .055) * .07, chin = bump(u, v, 0, -.78, .3, .16) * .1, cheek = bump(Math.abs(u), v, .5, -.2, .22, .2) * .05;
    return [ridge + tip + brow + chin + cheek + lips * .05 - eyes * .09 - mouth * .03, 1 - .42 * eyes - .34 * mouth - .1 * bump(u, v, 0, -.3, .2, .03)];
  };
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    // Narrow to the chin and flatten the front, then raise brow, nose, lips and chin from it and sink the eyes.
    const jaw = y < 0 ? 1 - .22 * y * y : 1, flat = z > .3 ? 1 - .09 * (z - .3) : 1, [relief] = face(x, y, z);
    hp.setXYZ(i, x * 1.52 * jaw, y * 2.55, (z * jaw * flat + relief) * 1.85);
  }
  head.translate(0, 31.3, .35);
  figure.add(head, (x, y, z) => shade(PATINA, .98 * face(x / 1.52, (y - 31.3) / 2.55, (z - .35) / 1.85 > .45 ? 1 : 0)[1]));
  // Hair: waved back over the head and gathered at the nape.
  figure.add(ball([0, 31.95, -.3], [1.62, 2.02, 1.9]), (x, y, z) => shade(PATINA, .8 + .08 * Math.sin(z * 9 + x * 5)));
  figure.add(ball([0, 30.7, -2.0], [1.05, 1.0, .95]), shade(PATINA, .78));
  // The diadem sits tilted back on the hair.
  const tilt = -.2, band = [];
  for (const [h, r] of [[-.42, 1.0], [.42, 1.04]]) band.push([h, 0, 0, 1.78 * r, 2.08 * r]);
  const diadem = loft(band, 28, () => 1, { capTop: false, capBottom: false }).rotateX(tilt).translate(0, 32.75, .2);
  figure.add(diadem, shade(PATINA, 1.02));
  const inner = loft(band.map(([h, x, z, rx, rz]) => [h, x, z, rx * .93, rz * .93]).reverse(), 28, () => 1, { capTop: false, capBottom: false }).rotateX(tilt).translate(0, 32.75, .2);
  figure.add(inner, shade(PATINA, .7));
  // Its windows: twenty-five in all, the front ones seen from the ground.
  for (let k = 0; k < 25; k++) {
    const angle = k / 25 * Math.PI * 2 + Math.PI / 2, pane = new THREE.BoxGeometry(.2, .36, .06);
    pane.rotateY(Math.PI / 2 - angle).translate(Math.cos(angle) * 1.84, 0, Math.sin(angle) * 2.15).rotateX(tilt).translate(0, 32.75, .2);
    figure.add(pane.toNonIndexed(), shade(PATINA, .32), true);
    pane.dispose();
  }
  // Seven rays, for the seven seas and continents, fanned across the top of the head and leaning back with the diadem.
  for (let k = 0; k < 7; k++) {
    const spread = (k - 3) * .46, length = k === 3 ? 3.0 : 2.75 - .08 * Math.abs(k - 3);
    const ray = new THREE.ConeGeometry(.3, length, 7).translate(0, length / 2, 0).rotateZ(-spread).translate(Math.sin(spread) * 1.5, Math.cos(spread) * .55 + .25, .1).rotateX(tilt - .32).translate(0, 32.75, .2);
    figure.add(ray, shade(PATINA, 1.05));
  }
  return { figure: figure.geometry(), flame: flame.geometry() };
}

/** Weathered copper, lit from the ground after dark as the statue is. */
export function createStatueMaterials() {
  const copper = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .12 });
  copper.name = 'Statue of Liberty copper';
  copper.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vStatueAt;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStatueAt = position;');
    shader.fragmentShader = 'varying vec3 vStatueAt;\n' + shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
	{
		// The patina is not one colour: paler where rain runs, darker and bluer where it does not reach.
		float streak = texture2D( uNycNoise, vec2( vStatueAt.x * 0.9 + vStatueAt.z * 0.7, vStatueAt.y * 0.035 ) ).r;
		float blotch = texture2D( uNycNoise, vStatueAt.xy * 0.11 + vStatueAt.z * 0.07 ).g;
		diffuseColor.rgb *= 0.82 + 0.3 * streak;
		diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.82, 0.96, 1.08 ), smoothstep( 0.45, 0.8, blotch ) );
	}`).replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	// Floodlights on the fort's points light her from below once the city's lights come on.
	totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.97, 0.9 ) * uNycLights * ( 0.4 - 0.2 * smoothstep( 0.0, 46.0, vStatueAt.y ) );`);
  };
  copper.customProgramCacheKey = () => 'nyc-liberty-copper';
  const gilt = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .3, metalness: .85, emissive: new THREE.Color(1, .62, .16), emissiveIntensity: .12 });
  gilt.name = 'Statue of Liberty flame';
  gilt.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	// The flame is gold leaf by day and lit from within the torch by night.
	totalEmissiveRadiance *= 1.0 + 26.0 * uNycLights;`);
  };
  gilt.customProgramCacheKey = () => 'nyc-liberty-flame';
  return { copper, gilt };
}

/**
 * Stand the statue on the pedestal.
 * @param {object} options
 * @param {(x:number, z:number) => number} options.heightAt the terrain: the pedestal is seated on it, and she on the pedestal
 */
export function createStatueOfLiberty({ scene = null, heightAt = () => 0 } = {}) {
  const group = new THREE.Group(), { figure, flame } = buildStatueGeometry(), { copper, gilt } = createStatueMaterials();
  group.name = 'Statue of Liberty';
  const body = new THREE.Mesh(figure, copper), torch = new THREE.Mesh(flame, gilt);
  body.name = 'Statue of Liberty'; torch.name = 'Statue of Liberty: flame';
  for (const mesh of [body, torch]) { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  group.scale.setScalar(STATUE.height / MODELLED);
  group.rotation.y = STATUE.facing;
  // The plinth under her feet is 0.9 m of the modelled figure; it rests on the pedestal's top.
  const lift = .9 * STATUE.height / MODELLED;
  let seated = null;
  const seat = () => {
    const ground = heightAt(STATUE.pedestal.x, STATUE.pedestal.z), top = (Number.isFinite(ground) ? ground : 0) + STATUE.pedestal.height;
    if (top !== seated) { seated = top; group.position.set(STATUE.x, top + lift, STATUE.z); group.updateMatrixWorld(); }
  };
  seat();
  scene?.add(group);
  return {
    group,
    /** The height of the pedestal's top, on which she stands. */
    get base() { return seated; },
    /** The terrain can change under the fort as measured ground loads: keep her on the pedestal. */
    update() { seat(); },
    setTerrainSampler(sampler) { heightAt = typeof sampler === 'function' ? sampler : () => 0; seat(); },
    dispose() { figure.dispose(); flame.dispose(); copper.dispose(); gilt.dispose(); group.removeFromParent(); },
  };
}
