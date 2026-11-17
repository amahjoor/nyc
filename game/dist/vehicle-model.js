import * as THREE from './vendor/three.module.min.js';

// Car bodies, lofted from a side profile.
//
// A body is a row of cross-sections from nose to tail. Each section is the
// same rounded outline, stretched to that station's sill, belt line, roof
// height and widths, so the hood, cabin and deck flow into one surface with
// tumblehome and wheel arches. Paint, glass and trim are chosen per panel.
// All bodies face +Z, sit on y = 0 and share the wheel positions the
// simulation drives.

export const WHEEL = { radius: .35, x: .9, front: 1.3, rear: -1.37 };
const FINISH = { paint: [.34, .22, 1], glass: [.06, .9, 1], trim: [.55, .1, 0], chrome: [.22, 1, 0], rubber: [.9, 0, 0] };
const GLASS = [.11, .15, .17], TRIM = [.035, .037, .04], CHROME = [.62, .64, .66];

const lerp = (a, b, t) => a + (b - a) * t;
/** Piecewise-linear lookup in a table of [z, value] rows sorted by descending z. */
function along(table, z) {
  if (z >= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (z >= table[i][0]) {
    const [z0, v0] = table[i - 1], [z1, v1] = table[i];
    return lerp(v0, v1, (z0 - z) / (z0 - z1));
  }
  return table.at(-1)[1];
}

// Each shape: tables of [z, value] from nose to tail, the cabin's glass
// spans, and where its pillars stand.
const SHAPES = {
  sedan: {
    belt: [[2.2, .6], [2.05, .7], [1.7, .79], [.98, .87], [.3, .92], [-1.05, .93], [-1.62, .93], [-2.05, .86], [-2.2, .72]],
    top: [[2.2, .64], [2.05, .75], [1.7, .84], [.98, .92], [.3, 1.43], [-.2, 1.47], [-1.02, 1.42], [-1.62, .99], [-2.05, .92], [-2.2, .8]],
    wide: [[2.2, .76], [2.05, .9], [1.6, .925], [-1.7, .925], [-2.05, .9], [-2.2, .78]],
    narrow: [[2.2, .7], [2.05, .82], [.98, .86], [.3, .71], [-1.02, .7], [-1.62, .84], [-2.05, .84], [-2.2, .74]],
    screen: [.98, .3], rear: [-1.02, -1.62], pillars: [[.3, .2], [-.36, -.46], [-.98, -1.1]], sill: .27,
  },
  suv: {
    belt: [[2.2, .72], [2.05, .86], [1.7, .97], [.95, 1.04], [.35, 1.06], [-1.9, 1.06], [-2.12, 1.0], [-2.2, .86]],
    top: [[2.2, .76], [2.05, .9], [1.7, 1.02], [.95, 1.1], [.35, 1.7], [-.2, 1.74], [-1.75, 1.7], [-2.12, 1.1], [-2.2, .92]],
    wide: [[2.2, .8], [2.05, .93], [1.6, .96], [-1.9, .96], [-2.12, .93], [-2.2, .84]],
    narrow: [[2.2, .74], [2.05, .86], [.95, .9], [.35, .78], [-1.75, .77], [-2.12, .86], [-2.2, .8]],
    screen: [.95, .35], rear: [-1.75, -2.12], pillars: [[.35, .25], [-.42, -.52], [-1.18, -1.3]], sill: .36,
  },
  van: {
    belt: [[2.2, .8], [2.08, .98], [1.75, 1.1], [1.3, 1.14], [-2.1, 1.14], [-2.2, 1.0]],
    top: [[2.2, .86], [2.08, 1.04], [1.75, 1.18], [1.3, 1.24], [.75, 1.95], [.3, 2.02], [-2.08, 2.02], [-2.2, 1.9]],
    wide: [[2.2, .82], [2.08, .94], [1.6, .97], [-2.1, .97], [-2.2, .93]],
    narrow: [[2.2, .76], [2.08, .88], [1.3, .92], [.75, .86], [-2.08, .86], [-2.2, .84]],
    screen: [1.3, .75], rear: [-9, -9], pillars: [[.75, .65], [-.2, -9]], sill: .38,
  },
};

/** Underside height: the sill, lifted into an arch over each wheel. */
function underside(z, sill) {
  let y = sill;
  for (const wheel of [WHEEL.front, WHEEL.rear]) {
    const d = Math.abs(z - wheel) / .44;
    if (d < 1) y = Math.max(y, sill + (WHEEL.radius * 2 + .07 - sill) * Math.sqrt(1 - d * d));
  }
  return y;
}

/** Half of one cross-section, from the keel up to the roof centre. */
function section(z, shape) {
  const belt = along(shape.belt, z), top = Math.max(belt + .02, along(shape.top, z)), wide = along(shape.wide, z), narrow = along(shape.narrow, z);
  const low = underside(z, shape.sill), cabin = top - belt;
  // Over a wheel the arch rises almost to the belt: keep the side's points in
  // climbing order there, or the panel between them folds back on itself.
  const lip = Math.min(low + .09, belt - .03), waist = Math.max(belt - .13, lip + .005);
  return [[0, low], [wide * .9, low], [wide, lip], [wide, waist], [wide * .985, belt],
    [lerp(wide, narrow, .55), belt + cabin * .52], [narrow, top - Math.min(.07, cabin * .3)], [narrow * .72, top], [0, top + .02]];
}

const RING = 9;
/** Loft a body. Returns flat, per-panel-coloured triangles with smooth normals. */
export function carBody(shapeName, paint) {
  const shape = SHAPES[shapeName] || SHAPES.sedan, stations = new Set();
  for (const table of [shape.belt, shape.top, shape.wide, shape.narrow]) for (const [z] of table) stations.add(z);
  for (const [a, b] of shape.pillars) { stations.add(a); stations.add(b); }
  // Enough stations over each wheel for a round arch.
  for (const wheel of [WHEEL.front, WHEEL.rear]) for (const step of [-1, -.82, -.5, 0, .5, .82, 1]) stations.add(Math.round((wheel + step * .44) * 1000) / 1000);
  const zs = [...stations].filter(z => z <= 2.2 && z >= -2.2).sort((a, b) => b - a);
  // The full ring runs keel, right side, roof, left side.
  const rings = zs.map(z => { const half = section(z, shape); return [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])]; });
  const count = rings[0].length, point = (i, j) => [rings[i][j % count][0], rings[i][j % count][1], zs[i]];
  // Smooth normals from the neighbouring grid points.
  const normalAt = (i, j) => {
    const a = point(Math.max(i - 1, 0), j), b = point(Math.min(i + 1, zs.length - 1), j), c = point(i, j + count - 1), d = point(i, j + 1);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - c[0], vy = d[1] - c[1], vz = d[2] - c[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], length = Math.hypot(...n) || 1;
    return n.map(value => value / length);
  };
  const position = [], normal = [], color = [], finish = [];
  const emit = (p, n, tone, surface) => { position.push(...p); normal.push(...n); color.push(...tone); finish.push(...surface); };
  const inSpan = (z, [from, to]) => z <= from && z >= to;
  for (let i = 0; i < zs.length - 1; i++) {
    const mid = (zs[i] + zs[i + 1]) / 2, pillar = shape.pillars.some(span => inSpan(mid, span));
    const cabin = mid < shape.screen[1] && mid > shape.rear[0], glazed = inSpan(mid, shape.screen) || inSpan(mid, shape.rear);
    for (let j = 0; j < count; j++) {
      // Fold the ring index back onto one half to find which panel this is.
      const half = j < RING - 1 ? j : count - 1 - j;
      let tone = paint, surface = FINISH.paint;
      if (half === 0) { tone = TRIM; surface = FINISH.trim; }                              // floor pan
      else if (half === 1 || half === 2) { if (half === 1) { tone = TRIM; surface = FINISH.trim; } } // sill
      else if (half === 4 || half === 5) { if (cabin && !pillar) { tone = GLASS; surface = FINISH.glass; } } // side windows
      else if (half >= 6 && glazed) { tone = GLASS; surface = FINISH.glass; }                // windscreen and rear window
      const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      for (const k of [0, 1, 2, 0, 2, 3]) { const [a, b] = corners[k]; emit(point(a, b), normalAt(a, b), tone, surface); }
    }
  }
  // Close the nose and tail.
  for (const [i, facing] of [[0, 1], [zs.length - 1, -1]]) {
    const centre = [0, (rings[i][0][1] + rings[i][RING - 1][1]) / 2, zs[i]];
    for (let j = 0; j < count; j++) {
      const a = point(i, j), b = point(i, j + 1);
      // The ring runs keel, right side, roof, left side: anticlockwise seen
      // from ahead, clockwise seen from behind. Each cap must face outward.
      // Body colour: the bumper, grille and lamps are set on top of it.
      for (const p of facing > 0 ? [centre, a, b] : [centre, b, a]) emit(p, [0, 0, facing], paint, FINISH.paint);
    }
  }
  return { position, normal, color, finish };
}

/** Append an axis-aligned box of trim, chrome or a lamp to a part list. */
function box(part, x, y, z, sx, sy, sz, tone, surface = FINISH.trim) {
  const geometry = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); geometry.translate(x, y, z);
  const p = geometry.attributes.position.array, n = geometry.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) { part.position.push(p[i], p[i + 1], p[i + 2]); part.normal.push(n[i], n[i + 1], n[i + 2]); part.color.push(...tone); part.finish?.push(...surface); }
  geometry.dispose();
}

function toGeometry(part) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(part.color, 3));
  if (part.finish) geometry.setAttribute('aFinish', new THREE.Float32BufferAttribute(part.finish, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

const linear = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export const HEADLAMP = 0xffe2a4, TAILLAMP = 0xb54130;

/**
 * Geometry for one vehicle: the body with its trim, and its lamps.
 * @param {{type:string, shape:string, paint:number}} options
 */
export function buildCar({ type = 'sedan', shape = 'sedan', paint = 0xbcc5bd } = {}) {
  const tone = linear(paint), body = carBody(shape, tone), lamps = { position: [], normal: [], color: [] };
  const s = SHAPES[shape] || SHAPES.sedan, noseBelt = along(s.belt, 2.12), tailBelt = along(s.belt, -2.12), wide = along(s.wide, 2.1);
  const head = linear(HEADLAMP), tail = linear(TAILLAMP);
  // Bumpers, grille and plates.
  box(body, 0, s.sill + .13, 2.19, wide * 1.98, .2, .12, TRIM); box(body, 0, s.sill + .13, -2.19, wide * 1.98, .2, .12, TRIM);
  box(body, 0, noseBelt - .08, 2.185, wide * .9, .16, .06, TRIM); box(body, 0, noseBelt - .08, 2.2, wide * .86, .03, .05, CHROME, FINISH.chrome);
  box(body, 0, s.sill + .2, 2.255, .36, .12, .02, [.8, .78, .6]); box(body, 0, tailBelt - .16, -2.255, .36, .12, .02, [.8, .78, .6]);
  for (const side of [-1, 1]) {
    // Lamps sit in the corners, a hand's width proud of the body ends.
    box(lamps, side * wide * .72, noseBelt - .06, 2.2, wide * .42, .15, .08, head);
    box(lamps, side * wide * .74, tailBelt - .04, -2.2, wide * .4, .13, .08, tail);
    // Door mirrors and handles.
    const mirrorZ = s.screen[1] + .32, mirrorY = along(s.belt, mirrorZ) + .08;
    box(body, side * (along(s.wide, mirrorZ) + .09), mirrorY, mirrorZ, .2, .12, .11, tone, FINISH.paint);
    for (const z of [s.pillars[0][1] - .5, (s.pillars[1]?.[1] ?? -.5) - .45]) if (z > -2) box(body, side * (along(s.wide, z) + .012), along(s.belt, z) - .12, z, .02, .035, .2, CHROME, FINISH.chrome);
    // Wheel wells: dark behind each tyre so the arch is not a hole.
    for (const z of [WHEEL.front, WHEEL.rear]) box(body, side * .5, s.sill + .2, z, .72, .5, .86, [.012, .012, .014], FINISH.rubber);
  }
  if (type === 'taxi') {
    // The roof light and the medallion band along the doors.
    const roof = along(s.top, -.25);
    box(body, 0, roof + .1, -.25, .7, .16, .3, [.03, .03, .03]); box(lamps, 0, roof + .1, -.25, .6, .11, .32, linear(0xffe5ad));
    for (const side of [-1, 1]) for (let i = 0; i < 12; i++) box(body, side * (along(s.wide, 0) + .006), along(s.belt, 0) - .3, -1.4 + i * .25, .012, .1, .125, i % 2 ? tone : [.02, .02, .02]);
  }
  if (type === 'police') {
    const roof = along(s.top, -.2);
    box(body, 0, roof + .05, -.2, 1.2, .06, .28, [.03, .035, .04]);
    for (const side of [-1, 1]) box(body, side * (along(s.wide, 0) + .006), along(s.belt, 0) - .28, -.1, .012, .2, 2.7, linear(0x254571), FINISH.paint);
  }
  return { body: toGeometry(body), lamps: toGeometry(lamps), roof: along(s.top, -.2) };
}

/**
 * Paint, glass and trim in one material; the finish of each panel rides on a vertex attribute.
 * With `instancedPaint`, a body built in white takes each instance's colour from `aPaint`.
 */
export function createCarMaterial({ instancedPaint = false } = {}) {
  const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .4, metalness: .2, clearcoat: 1, clearcoatRoughness: .07 });
  material.name = 'Car paint, glass and trim';
  if (instancedPaint) material.defines.NYC_INSTANCED_PAINT = '';
  material.onBeforeCompile = shader => {
    shader.vertexShader = `attribute vec3 aFinish;\nvarying vec3 vFinish;\n#ifdef NYC_INSTANCED_PAINT\nattribute vec3 aPaint;\n#endif\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinish = aFinish;')
      // Lacquered and not mirror-smooth: that is the paint, and only the paint takes the colour.
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef NYC_INSTANCED_PAINT\nvColor.rgb *= mix( vec3( 1.0 ), aPaint, step( .5, aFinish.z ) * step( .2, aFinish.x ) );\n#endif');
    shader.fragmentShader = `varying vec3 vFinish;\n${shader.fragmentShader}`
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nroughnessFactor = vFinish.x; metalnessFactor = vFinish.y;')
      // Lacquer on the paint and glass only; trim and rubber stay matt.
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= vFinish.z;');
  };
  return material;
}

/** Lamps glow in their own colour: amber-white ahead, red behind. */
export function createLampMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: .55, roughness: .25 });
  material.name = 'Vehicle lamps';
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  return material;
}

/** A tyre with a rounded shoulder and a dished alloy wheel, axle along X. */
export function wheelGeometry() {
  const r = WHEEL.radius, tyre = new THREE.LatheGeometry([[r * .58, -.12], [r * .9, -.125], [r, -.085], [r, .085], [r * .9, .125], [r * .58, .12]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  tyre.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * .6, r * .6, .2, 16); rim.rotateZ(Math.PI / 2);
  return { tyre, rim };
}
