import { NEIGHBORHOOD_FIXTURES, NEIGHBORHOOD_ROOMS } from './neighborhood-rooms.js';
import { COUNTER_FIXTURES, furnishCounterService } from './counter-service.js';
import { KITCHEN_FIXTURES } from './kitchen-fixtures.js';
import { fitKitchen } from './kitchens.js';
import { checkoutAxes, drawCheckout } from './checkout-model.js';
// What a shop is for, in the things that stand in it.
//
// interiors.js lays every kind of place out in boxes: a counter, shelving,
// tables. This adds what tells one trade from another when you walk in. A
// pizzeria has a deck oven and round pies under glass; a clothes shop has
// dressed figures and round rails; a jeweller's cases hold watches and rings;
// an optician's wall is rows of frames beside an eye chart; a bodega has its
// grill, its coolers and its till. Nothing here is surveyed: a kind of place
// has the fittings that kind of place has, placed by the game.
//
// A prop is a thing in the room like any other ({ a, b, w, d, h, y, color,
// solid }) with a `shape` this module knows how to draw, a `face` it looks
// along, and sometimes `more` to say what it holds. Rooms that are too small
// drop what does not fit, as they do their boxes.
import * as THREE from './vendor/three.module.min.js';
import { servingGeometry } from './serving-models.js';
import { servingFor,portionKey } from './food-catalog.js';
import { roomPoint } from './room.js';
import { menuFor } from './menu.js';
import { fittingStock } from './shop-stock.js';
import { BUSINESS_FIXTURES } from './business-fixtures.js';
import { BANK_FIXTURES } from './bank.js';
import { productGeometry, chinaCup, sneaker, espressoStation, acousticGuitar, displayPhone, gemstoneRing } from './shop-products.js';
import { groceryStore, furnishGrocer } from './grocery-stock.js';
import { BUSINESS_ROOMS } from './business-rooms.js';
import { CORNER_FIXTURES, coldCaseDeck, dressCornerStore, sandwich } from './corner-store.js';
import { CARE_FIXTURES, furnishPharmacy, furnishSalon } from './personal-care.js';

const STEEL = '#9aa1a5', DARK = '#23272b', BLACK = '#17191b', WHITE = '#ecebe4', WOOD = '#6b4a32', GLASS = '#bfd9e4', CHROME = '#c6cbce', GOLD = '#c9a23f', FELT = '#1b2440';
const CLOTH = ['#1f2a44', '#7a1f2a', '#d9d2c0', '#2f5a45', '#c9a23f', '#3a3a40', '#b65a7a', '#5f7fa8'];
const BRIGHT = ['#d23a2a', '#f2c230', '#e0559a', '#f4f1e6', '#e07b2a', '#8a4b9e', '#2f8fd0'];
const SPINE = ['#7a1f2a', '#1f3a6a', '#2f5a45', '#c9a23f', '#d9d2c0', '#3a3a40', '#b65a7a', '#e07b2a', '#17191b'];

const unit = geometry => { if (!geometry.index) return geometry; const g = geometry.toNonIndexed(); geometry.dispose(); return g; };
let UNITS = null;
// One of each solid, a metre across: every prop is these, stretched and set down.
const units = () => UNITS ||= {
  ...Object.fromEntries(Object.entries(productGeometry()).map(([name, geometry]) => [name, unit(geometry)])),
  box: unit(new THREE.BoxGeometry(1, 1, 1)), post: unit(new THREE.CylinderGeometry(.5, .5, 1, 8)), round: unit(new THREE.CylinderGeometry(.5, .5, 1, 14)),
  cone: unit(new THREE.CylinderGeometry(.3, .5, 1, 8)), rodU: unit(new THREE.CylinderGeometry(.5, .5, 1, 6).rotateZ(Math.PI / 2)), rodV: unit(new THREE.CylinderGeometry(.5, .5, 1, 6).rotateX(Math.PI / 2)),
  // Shelf packs sit on a board against a back or the next row of stock.
  carton: unit((()=>{
    const geometry=new THREE.BoxGeometry(1,1,1), index=geometry.index.array;
    geometry.setIndex([...index.slice(0,18),...index.slice(24,30)]);
    geometry.clearGroups();return geometry;
  })()),
  basin: unit(new THREE.LatheGeometry([[.007,.20],[.19,.20],[.33,.49],[.41,.96],[.48,1],[.50,.91],[.46,.59],[.36,.20],[.19,.01]].map(([r,y])=>new THREE.Vector2(r,y)),20)),
  drum: unit(new THREE.CylinderGeometry(.5, .5, 1, 16).rotateX(Math.PI / 2)),
  ball: unit(new THREE.SphereGeometry(.5, 6, 4)), bud: unit(new THREE.SphereGeometry(.5, 4, 2)), hex: unit(new THREE.CylinderGeometry(.5, .5, 1, 6)), taper: unit(new THREE.CylinderGeometry(.3, .5, 1, 6)), plate: unit(new THREE.PlaneGeometry(1, 1)), ring: unit(new THREE.TorusGeometry(.5, .05, 4, 12)),
  // Half a drum lying on its flat side: an oven's arched mouth, a bread loaf.
  arch: unit(new THREE.CylinderGeometry(.5, .5, 1, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2)),
};

/**
 * Tools to draw props into a room's triangles. `position` and `color` are the
 * arrays buildRoom fills; `y` is the floor.
 * @returns {{draw(thing): boolean}} draw() answers false for a thing that is not a prop.
 */
export function roomProps(room, y, position, color, servingUV=null) {
  // The footprint ring can run either way: a room laid out mirrored has its triangles wound the other way.
  const mirrored = room.tx * room.nz - room.tz * room.nx > 0, order = mirrored ? [0, 2, 1] : [0, 1, 2], tone = new THREE.Color(), U = units();
  let A = 0, B = 0, cos = 1, sin = 0, floor = 0, checkout = null;
  /** Set down one unit solid: `size` along the prop's width, height and depth, centred at `at` (width, height above its foot, depth). */
  const put = (shape, size, at, hex, glow = false, pitchCos = 1, pitchSin = 0) => {
    const p = shape.attributes.position, n = shape.attributes.normal;
    const vertexColor = hex === null && shape.attributes.color;
    if (!vertexColor) tone.set(hex ?? '#686763');
    for (let i = 0; i < p.count; i += 3) for (const k of order) {
      const py = p.getY(i + k) * size[1], pz = p.getZ(i + k) * size[2];
      const lx = at[0] + p.getX(i + k) * size[0], ly = at[1] + py * pitchCos - pz * pitchSin, lz = at[2] + py * pitchSin + pz * pitchCos;
      const a = checkout ? lx*checkout.ua + lz*checkout.va : lx*cos + lz*sin;
      const b = checkout ? lx*checkout.ub + lz*checkout.vb : -lx*sin + lz*cos;
      const [x, z] = roomPoint(room, A+a, B+b);
      const ny = n.getY(i + k) * pitchCos - n.getZ(i + k) * pitchSin, nz = n.getY(i + k) * pitchSin + n.getZ(i + k) * pitchCos;
      const side = n.getX(i + k) * cos + nz * sin, front = nz * cos - n.getX(i + k) * sin;
      const shade = glow ? 1 : .71 + .37 * Math.max(0, .72 * ny + .36 * side - .60 * front) + .10 * Math.max(0, front);

      if (vertexColor) tone.fromBufferAttribute(vertexColor,i+k);
      position.push(x, y + floor + ly, z); color.push(tone.r * shade, tone.g * shade, tone.b * shade);
      if(servingUV){
        color.push(shape.attributes.color.itemSize===4?shape.attributes.color.getW(i+k):1);
        servingUV.push(shape.attributes.uv.getX(i+k),shape.attributes.uv.getY(i+k));
      }
    }
  };
  // The prop's own frame: u across it, v out of its front, heights from its foot.
  const t = {
    serving: key => put(servingGeometry(key),[1,1,1],[0,0,0],null),
    model: (name, u, v, up, hex) => put(U[name], [1, 1, 1], [u, up, v], hex),
    box: (u, v, wu, wv, h, up, hex, glow) => put(U.box, [wu, h, wv], [u, up + h / 2, v], hex, glow),
    slope(u, v0, y0, v1, y1, width, thickness, hex) {
      const rise = y1 - y0, run = v1 - v0, length = Math.hypot(rise, run);
      put(U.box, [width, length, thickness], [u, (y0 + y1) / 2, (v0 + v1) / 2], hex, false, rise / length, run / length);
    },
    label(u,v0,y0,v1,y1,width,hex,back=false) {
      const rise=y1-y0,run=v1-v0,length=Math.hypot(rise,run),sign=back?-1:1;
      put(U.plate,[width,length,1],[u,(y0+y1)/2,(v0+v1)/2],hex,true,sign*rise/length,sign*run/length);
    },
    post: (u, v, radius, h, up, hex, shape = U.post) => put(shape, [radius * 2, h, radius * 2], [u, up + h / 2, v], hex),
    disc: (u, v, radius, h, up, hex) => put(U.round, [radius * 2, h, radius * 2], [u, up + h / 2, v], hex),
    carton: (u,v,w,d,h,up,hex) => put(U.carton,[w,h,d],[u,up+h/2,v],hex),
    basin: (u,v,w,d,h,up,hex) => put(U.basin,[w,h,d],[u,up,v],hex),
    cone: (u, v, radius, h, up, hex) => put(U.cone, [radius * 2, h, radius * 2], [u, up + h / 2, v], hex),
    ball: (u, v, ru, rh, rv, up, hex) => put(U.ball, [ru * 2, rh * 2, rv * 2], [u, up, v], hex),
    // The same shapes in a handful of faces, for what is small or many.
    bud: (u, v, radius, up, hex) => put(U.bud, [radius * 2, radius * 2, radius * 2], [u, up, v], hex),
    can: (u, v, radius, h, up, hex) => put(U.hex, [radius * 2, h, radius * 2], [u, up + h / 2, v], hex),
    tub: (u, v, radius, h, up, hex) => put(U.taper, [radius * 2, h, radius * 2], [u, up + h / 2, v], hex),
    rodU: (u, v, length, radius, up, hex) => put(U.rodU, [length, radius * 2, radius * 2], [u, up, v], hex),
    rodV: (u, v, length, radius, up, hex) => put(U.rodV, [radius * 2, radius * 2, length], [u, up, v], hex),
    drum: (u, v, length, radius, up, hex) => put(U.drum, [radius * 2, radius * 2, length], [u, up, v], hex),
    /** A flat card standing up, seen from the front: a label, a lens, a spine, a screen. */
    plate: (u, v, wu, h, up, hex, glow) => put(U.plate, [wu, h, 1], [u, up + h / 2, v], hex, glow),
    /** A hoop standing up, `radius` to its outside. */
    ring: (u, v, radius, up, hex) => put(U.ring, [radius / .55, radius / .55, radius / .55], [u, up, v], hex),
    arch: (u, v, wu, h, wv, up, hex, glow) => put(U.arch, [wu, h * 2, wv], [u, up, v], hex, glow),
  };
  return {
    draw(thing) {
      const make = PROPS[thing.shape];
      if (!make) return false;
      const [fa, fb] = thing.face || [0, -1];
      checkout = thing.shape==='register' ? checkoutAxes(room,fa,fb) : null;
      A = thing.a; B = thing.b; cos = fb; sin = fa; floor = thing.y || 0;
      // Width is across the prop and depth out of its front, whichever way round it stands in the room.
      make(t, fb ? thing.w : thing.d, fb ? thing.d : thing.w, thing.h, thing.color, thing.more || {}, thing);
      return true;
    },
  };
}

const pick = (list, n) => list[((n % list.length) + list.length) % list.length];
// Goods small enough to lie in a case, each drawn at (u, v) on a surface `up` high. `k` varies one from the next.
const ITEMS = {
  deliRolls: sandwich,
  watches(t, u, v, up, k) {
    t.box(u,v,.034,.12,.023,up,k % 2 ? '#624737' : '#3c4447');
    t.disc(u,v,.024,.012,up+.019,k % 2 ? GOLD : CHROME);
    t.disc(u,v,.019,.003,up+.031,'#25343a');
    t.box(u-.004,v,.012,.002,.002,up+.034,WHITE); t.box(u,v+.007,.002,.015,.002,up+.034,WHITE);
  },
  rings(t,u,v,up,k) { t.box(u,v,.080,.073,.018,up,'#bdb0a1'); gemstoneRing(t,u,v,up+.016,k % 2 ? GOLD : CHROME); },
  chains(t,u,v,up,k) {
    t.box(u,v,.115,.15,.014,up,'#38363a');
    for (const side of [-1,1]) t.slope(u+side*.031,v-.052,up+.025,v+.041,up+.025,.005,.005,GOLD);
    t.rodU(u,v+.042,.067,.003,up+.025,GOLD); t.bud(u,v+.049,.010,up+.025,k % 2 ? GOLD : '#619585');
  },
  glasses(t, u, v, up, k) { const hex = pick([BLACK, '#5a3a22', '#7a1f2a', '#1f3a6a', GOLD], k); for (const s of [-1, 1]) t.box(u + s * .033, v, .05, .012, .034, up, hex); t.box(u, v, .018, .01, .006, up + .022, hex); },
  fruit(t,u,v,up,k) { t.ball(u,v,.055,.055,.048,up+.053,k%2 ? '#d89448' : '#92a362'); },
  phones(t, u, v, up, k) { t.box(u, v, .075, .15, .01, up, pick([BLACK, '#d9d4c2', '#1f3a6a', '#7a1f2a'], k)); t.box(u, v, .065, .13, .002, up + .01, '#2c3f58', true); },
  pastry(t,u,v,up,k) {
    if (k%3 === 0) { // A laminated crescent with tapered ends.
      for (let i=-2;i<=2;i++) t.ball(u+i*.025,v+i*i*.007,.026,.025-.004*Math.abs(i),.043-.007*Math.abs(i),up+.022, i%2 ? '#c9843c' : '#dfa152');
    } else if (k%3 === 1) {
      t.tub(u,v,.046,.036,up,'#aa6536'); t.ball(u,v,.048,.029,.048,up+.035,'#c58c53');
      for (const side of [-1,1]) t.bud(u+side*.017,v,.006,up+.061,'#574054');
    } else {
      t.box(u,v,.087,.076,.044,up,'#77432e'); t.box(u,v,.088,.077,.012,up+.044,'#51352e');
    }
  },
  meat(t, u, v, up, k) { t.box(u, v, .2, .14, .012, up, '#f4f4f0'); t.box(u, v, .15, .1, .04, up + .012, pick(['#a8322e', '#c8564e', '#8a2420', '#d98a80', '#b04038'], k)); },
  fish(t, u, v, up, k) { t.box(u, v, .22, .16, .03, up, '#eef4f6'); t.box(u - .01, v, .16, .05, .03, up + .03, pick(['#9aa8b0', '#c8ced2', '#d98a70', '#7a8a94'], k)); t.box(u + .09, v, .04, .07, .012, up + .036, '#7a8a94'); },
  sushi(t, u, v, up, k) { t.box(u, v, .14, .08, .012, up, BLACK); t.box(u, v, .11, .05, .022, up + .012, '#f4f1e6'); t.box(u, v, .11, .052, .01, up + .034, pick(['#e8704a', '#f2e0c0', '#c8322e', '#f2c230'], k)); },
  jars(t, u, v, up, k) { t.can(u, v, .045, .13, up, pick(['#5a7a3a', '#8a6a2a', '#3a5a2a', '#b8a04a', '#e9e4d6'], k)); },
};

/** A glazed case: goods on a pad under a pane, on a dark base. `items` names what lies in it. */
function showcase(t, w, d, h, hex, { items = 'watches', felt = FELT, seed = 0, deck } = {}) {
  const base = deck ?? Math.max(.045, h - .34);
  t.box(0, 0, w, d, base, 0, hex); t.box(0, 0, w - .06, d - .06, .02, base, felt);
  const jewelry = ['rings','watches','chains'].includes(items);
  const put = ITEMS[items] || ITEMS.watches, pitch = jewelry ? .34 : items === 'meat' || items === 'fish' ? .26 : items === 'deliRolls' ? .25 : items === 'pastry' ? .17 : .16, rows = d > .5 && !jewelry ? 2 : 1;
  if(deck!=null)coldCaseDeck(t,w,d,deck);
  const shelf=deck!=null?deck+.357:base+.02;
  for (let row = 0; row < rows; row++) for (let u = -w / 2 + pitch * .7, k = 0; u < w / 2 - pitch * .5 && k < 9; u += pitch, k++) put(t, u, (row - (rows - 1) / 2) * Math.min(.24, d * .4), shelf, seed + k + row * 5);
  t.box(0, -d / 2 + .029, w - .065, .015, .014, h - .039, '#fff4d9', true);
  // The glass is its frame: a post at each corner and a rail round the top, so what lies inside can be seen from above.
  for (const su of [-1, 1]) for (const sv of [-1, 1]) t.box(su * (w / 2 - .012), sv * (d / 2 - .012), .022, .022, h - base, base, CHROME);
  for (const sv of [-1, 1]) t.box(0, sv * (d / 2 - .012), w, .022, .022, h - .022, CHROME);
  for (const su of [-1, 1]) t.box(su * (w / 2 - .012), 0, .022, d, .022, h - .022, CHROME);
}

const PROPS = {
  ...BUSINESS_FIXTURES, ...NEIGHBORHOOD_FIXTURES,
  ...BANK_FIXTURES,
  ...CARE_FIXTURES,
  ...COUNTER_FIXTURES,
  ...KITCHEN_FIXTURES,
  ...CORNER_FIXTURES,
  /** A shop figure on a stand, dressed in `hex`. */
  mannequin(t, w, d, h, hex, { skin = '#e2dccd', legs = null, seed = 0 }) {
    const s = h / 1.78, trousers = legs || pick(['#23272b', '#1f2a44', '#3a3a40', '#5a4632'], seed);
    t.can(0, 0, .17, .02, 0, CHROME); t.box(0, .09, .02, .02, .95 * s, 0, CHROME);
    for (const side of [-1, 1]) { t.box(side * .085 * s, 0, .12 * s, .13 * s, .8 * s, .04, trousers); t.box(side * .225 * s, 0, .075 * s, .09 * s, .56 * s, .82 * s, seed % 3 ? hex : skin); t.box(side * .225 * s, 0, .06 * s, .07 * s, .09 * s, .73 * s, skin); }
    t.box(0, 0, .36 * s, .2 * s, .2 * s, .82 * s, trousers); t.box(0, 0, .38 * s, .21 * s, .44 * s, 1.0 * s, hex); t.box(0, 0, .3 * s, .19 * s, .06 * s, 1.43 * s, hex);
    t.can(0, 0, .045 * s, .09 * s, 1.47 * s, skin); t.ball(0, .005, .1 * s, .12 * s, .11 * s, 1.66 * s, skin);
  },
  /** A neck form on a counter with a chain round it. */
  bust(t, w, d, h, hex, { seed = 0 }) { const metal = seed % 2 ? GOLD : CHROME; t.tub(0, 0, .085, h * .78, 0, hex); t.can(0, 0, .04, h * .2, h * .78, hex); t.plate(0, .06, .09, .012, h * .6, metal); for (const s of [-1, 1]) t.plate(s * .04, .058, .012, h * .2, h * .42, metal); t.plate(0, .062, .03, .04, h * .34, seed % 3 ? '#e8f4ff' : '#b0303a', true); },
  /** A pizzeria's deck oven: two mouths, one lit, on legs, under a hood. */
  oven(t, w, d, h, hex) {
    const top = Math.min(h, 1.75);
    for (const su of [-1, 1]) for (const sv of [-1, 1]) t.box(su * (w / 2 - .06), sv * (d / 2 - .06), .06, .06, .5, 0, DARK);
    t.box(0, 0, w, d, top - .5, .5, hex); t.box(0, d / 2 - .02, w - .1, .06, .05, .5, DARK);
    for (const [up, lit] of [[.66, true], [1.14, false]]) {
      t.box(0, d / 2 + .003, w - .22, .012, .26, up, BLACK); if (lit) { t.box(0, d / 2 + .006, w - .3, .012, .1, up + .02, '#ff8a2a', true); t.box(0, d / 2 + .009, w - .5, .012, .04, up + .03, '#ffd27a', true); }
      t.box(0, d / 2 + .05, w - .2, .1, .025, up - .03, STEEL); t.rodU(0, d / 2 + .06, w - .5, .014, up + .3, CHROME);
    }
    t.box(-w / 2 + .12, d / 2 + .004, .1, .01, .1, top - .2, '#e9e4d6'); t.box(-w / 2 + .12, d / 2 + .012, .04, .01, .04, top - .17, '#b0303a');
    if (h > top + .15) { t.box(0, .05, w + .1, d + .2, .18, top + .1, STEEL); t.box(0, -d / 4, .34, .34, Math.max(.05, h - top - .28), top + .28, STEEL); }
  },
  /** A pie on its tray: `more.kind` 0 plain, 1 pepperoni, 2 white; `more.cut` leaves a slice out. */
  pizza(t, w, d, h, hex, { kind = 0, cut = false }) {
    const radius = Math.min(w, d) / 2;
    t.disc(0, 0, radius, .008, 0, CHROME); t.disc(0, 0, radius * .93, .022, .008, '#d8a25a'); t.disc(0, 0, radius * .8, .006, .03, kind === 2 ? '#f1e6c8' : '#e8b84a');
    if (kind !== 2) t.disc(0, 0, radius * .5, .003, .036, '#d9792a');
    if (kind === 1) for (let i = 0; i < 6; i++) t.can(Math.cos(i * 1.05) * radius * .5, Math.sin(i * 1.05) * radius * .5, radius * .09, .004, .037, '#a8281e');
    if (cut) t.box(radius * .45, radius * .45, radius * .7, radius * .7, .03, .009, CHROME);
  },
  showcase,
  /** A wall of spectacle frames on a lit board. */
  frames(t, w, d, h, hex, { seed = 0 }) {
    t.box(0, 0, w, .04, h, 0, hex); t.box(0, .025, w - .08, .008, h - .08, .04, '#fbfaf4', true);
    for (let up = .14, row = 0; up < h - .1; up += .2, row++) {
      t.box(0, .05, w - .1, .04, .012, up - .03, '#d8d6cc');
      for (let u = -w / 2 + .16, k = 0; u < w / 2 - .1; u += .21, k++) { const tint = pick([BLACK, '#5a3a22', '#7a1f2a', '#1f3a6a', GOLD, '#3a3a40', '#2f5a45'], seed + k + row * 3), shade = (k + row) % 4 === 0; for (const s of [-1, 1]) { t.plate(u + s * .036, .06, .058, .038, up, tint); t.plate(u + s * .036, .062, .044, .026, up + .006, shade ? '#3a2a1e' : '#cfe6ee'); } t.plate(u, .06, .016, .008, up + .024, tint); }
    }
  },
  /** An eye chart: letters shrinking down a white card. */
  eyechart(t, w, d, h) {
    t.box(0, 0, w, .02, h, 0, '#f6f4ec', true);
    for (let row = 0, up = h - .12; row < 7 && up > .04; row++) { const size = Math.max(.012, .075 - row * .01), n = row + 1; for (let k = 0; k < n; k++) t.plate((k - (n - 1) / 2) * size * 1.7, .012, size, size, up, BLACK); up -= size + .035; }
  },
  /** Shoes one to a pair along shelves on a wall. */
  shoewall(t, w, d, h, hex, { seed = 0 }) {
    const stock=fittingStock('shoes');
    t.box(0, 0, w, .04, h, 0, hex);
    for (let row=0;row<3;row++) {
      const up=.31+row*.48;
      t.box(0,.14,w-.05,.27,.032,up,WHITE);
      for (const i of (row===1?[-1,0,1]:[-1,1])) {
        const shoe=pick(stock,seed+i+row).design;
        sneaker(t,i*w*.30,.14,up+.032,shoe.shoeColour,WHITE,shoe.shoes);
        t.box(i*w*.30,.262,.058,.004,.021,up+.005,'#ede5d4');
      }
    }
  },
  /** A bodega's grill: the flat-top with something on it, bottles, a toaster, the hood over it. */
  grill(t, w, d, h, hex) {
    t.box(0, 0, w, d, .86, 0, hex); t.box(0, 0, w - .08, d - .1, .03, .86, '#2a2c30'); t.box(0, -d / 2 + .02, w, .03, .3, .86, STEEL);
    t.box(-w * .2, .02, .14, .1, .012, .89, '#f2e6b8'); t.can(-w * .2, .02, .03, .014, .89, '#f2c230'); t.box(w * .05, -.04, .18, .05, .012, .89, '#a8322e'); t.box(w * .05, .05, .18, .05, .012, .89, '#a8322e'); t.box(w * .28, 0, .13, .12, .03, .89, '#c9772a');
    for (const [u, tint] of [[-w / 2 + .08, '#c8322e'], [-w / 2 + .17, '#f2c230']]) { t.can(u, d / 2 - .07, .028, .14, .86, tint); t.tub(u, d / 2 - .07, .016, .05, 1.0, WHITE); }
    t.box(w / 2 - .14, d / 2 - .1, .02, .24, .01, .9, CHROME);
    if (h > 1.7) { t.box(0, 0, w + .06, d + .16, .28, h - .28, STEEL); t.box(0, d / 2 + .06, w - .1, .012, .12, h - .26, '#5d6468'); }
  },
  /** A glass-door cooler of drinks, a door every 70 cm or so. */
  cooler(t, w, d, h, hex, { seed = 0, stock = null, openRack = false }) {
    if(openRack){
      t.box(0,-d/2+.025,w,.05,h,0,'#8c9f99');
      t.box(0,-d/2+.058,w-.08,.016,h-.32,.15,'#bdcfbf');
      t.box(0,0,w,d,.13,h-.13,hex);t.box(0,d/2-.035,w-.08,.025,.023,h-.155,'#fff6d9',true);return;
    }
    const doors = Math.max(1, Math.round(w / .72)), each = w / doors, cans = stock || ['#c8322e', '#2f8fd0', '#f2c230', '#3f7d4e', '#e07b2a', '#f4f4f0', '#8a4b9e', '#17191b'];
    t.box(0, 0, w, d, h, 0, hex); t.box(0, d / 2 + .003, w - .04, .008, .16, h - .2, '#2c3f58', true);
    for (let k = 0; k < doors; k++) {
      const u = -w / 2 + each * (k + .5);
      t.plate(u, d / 2 + .004, each - .08, h - .42, .14, '#dfeef2', true);
      for (let up = .2, row = 0; up < h - .5; up += .3, row++) { t.plate(u, d / 2 + .008, each - .1, .02, up - .02, '#aab4b8'); for (let c = -each / 2 + .1, i = 0; c < each / 2 - .08; c += .085, i++) t.plate(u + c, d / 2 + .008, .066, row % 2 ? .21 : .15, up, pick(cans, seed + k * 5 + row * 3 + Math.floor(i / 2))); }
      t.box(u + each / 2 - .07, d / 2 + .03, .02, .02, .5, h * .42, CHROME);
    }
  },
  /** The till: a drawer, a screen turned to whoever stands behind the counter, a card reader for whoever is in front. */
  register: drawCheckout,
  /** A round rail of clothes on a stand. */
  rack(t, w, d, h, hex, { seed = 0 }) {
    const radius = Math.min(w, d) / 2 - .04;
    t.can(0, 0, .2, .02, 0, CHROME); t.box(0, 0, .03, .03, h, 0, CHROME); t.disc(0, 0, radius, .014, h - .02, CHROME);
    for (let i = 0; i < 10; i++) { const turn = i / 10 * Math.PI * 2, u = Math.cos(turn) * radius * .86, v = Math.sin(turn) * radius * .86, along = Math.abs(Math.cos(turn)) > .7; t.box(u, v, along ? .3 : .05, along ? .05 : .3, .78 - (i % 3) * .14, h - .86 + (i % 3) * .14, pick(CLOTH, seed + i * 3)); }
  },
  /** A fish tank on a stand, lit. */
  tank(t, w, d, h, hex, { seed = 0 }) {
    const base = Math.min(.8, h * .45), tall = h - base - .05;
    t.box(0, 0, w, d, base, 0, hex); t.box(0, 0, w - .02, d - .02, tall, base, '#2f7f96', true); t.box(0, 0, w - .03, d - .03, .05, base, '#c9b88a'); t.box(0, 0, w, d, .05, base + tall, BLACK);
    for (let k = 0; k < 5; k++) { const u = (((seed + k * 37) % 100) / 100 - .5) * (w - .2), up = base + .12 + ((seed + k * 53) % 100) / 100 * (tall - .25); t.plate(u, d / 2 + .004, .07, .035, up, pick(['#ff8a2a', '#f2c230', '#f4f4f0', '#e0559a', '#4fd0ff'], seed + k), true); t.plate(u + .045, d / 2 + .004, .03, .045, up - .005, pick(['#ff8a2a', '#f2c230', '#f4f4f0', '#e0559a', '#4fd0ff'], seed + k), true); }
    for (let k = 0; k < 3; k++) t.plate((k - 1) * w * .3, d / 2 + .004, .04, tall * (.3 + k * .12), base + .05, '#3f9a4e', true);
  },
  /** A board of hand tools, and tins of paint on a shelf under it. */
  pegboard(t, w, d, h, hex, { seed = 0 }) {
    t.box(0, 0, w, .04, h - .7, .7, '#c9a876');
    for (let u = -w / 2 + .2, k = 0; u < w / 2 - .12; u += .26, k++) for (let up = .95, row = 0; up < h - .3; up += .52, row++) {
      const kind = (seed + k + row * 2) % 4, tint = pick(['#c8322e', '#f2c230', '#2f5f9e', BLACK], seed + k * 3 + row);
      if (kind === 0) { t.plate(u, .03, .035, .26, up, '#a8845c'); t.plate(u, .032, .13, .05, up + .24, '#5d6468'); }
      else if (kind === 1) { t.plate(u, .03, .03, .3, up, CHROME); t.plate(u, .032, .07, .06, up + .28, CHROME); }
      else if (kind === 2) { t.plate(u, .03, .05, .12, up, tint); t.plate(u, .032, .012, .2, up + .12, CHROME); }
      else { t.plate(u, .03, .2, .09, up + .1, CHROME); t.plate(u - .07, .032, .07, .12, up + .06, tint); }
    }
    t.box(0, .16, w, .32, .04, .66, hex);
    for (let u = -w / 2 + .14, k = 0; u < w / 2 - .1; u += .22, k++) { t.can(u, .16, .075, .19, .7, CHROME); t.plate(u, .237, .1, .09, .75, pick(BRIGHT, seed + k)); }
    for (const su of [-1, 1]) t.box(su * (w / 2 - .03), .16, .04, .3, .66, 0, hex);
  },
  /** Buckets of cut flowers on a stepped stand. */
  flowers(t, w, d, h, hex, { seed = 0 }) {
    for (let step = 0; step < 3; step++) {
      const up = step * .28, v = d / 2 - .16 - step * .26;
      t.box(0, v, w, .28, .04, up + .2, hex);
      for (let u = -w / 2 + .18, k = 0; u < w / 2 - .12; u += .36, k++) {
        const bloom = pick(['#d23a2a', '#f2c230', '#e0559a', '#f4f1e6', '#e07b2a', '#8a4b9e', '#f6a8c0'], seed + k * 2 + step * 3);
        t.tub(u, v, .09, .22, up + .24, step % 2 ? BLACK : '#2f5a3a'); t.box(u, v, .07, .07, .2, up + .44, '#3f8a45');
        for (const [du, dv, dy] of [[0, 0, .1], [-.055, .03, .03], [.055, -.02, .05]]) t.bud(u + du, v + dv, .055, up + .66 + dy, bloom);
      }
    }
  },
  /** Shelves of books, spines out. */
  bookcase(t, w, d, h, hex, { seed = 0 }) {
    t.box(0, -d / 2 + .02, w, .04, h, 0, hex); for (const su of [-1, 1]) t.box(su * (w / 2 - .02), 0, .04, d, h, 0, hex);
    for (let up = .06, row = 0; up < h - .2; up += .4, row++) {
      t.box(0, 0, w - .06, d, .03, up - .03, hex);
      for (let u = -w / 2 + .06, k = 0; u < w / 2 - .08; k++) { const thick = .045 + ((seed + k * 7 + row * 13) % 5) * .012, tall = .22 + ((seed + k * 3 + row * 5) % 4) * .025; t.plate(u + thick / 2, d / 2 - .02, thick - .003, tall, up, pick(SPINE, seed + k * 5 + row * 2)); u += thick; }
    }
    t.box(0, 0, w, d, .04, h - .04, hex);
  },
  /** A guitar hung on a wall. */
  guitar(t, w, d, h, hex, { seed = 0 }) { acousticGuitar(t, hex === WOOD ? pick(['#bf864a','#9b5737','#d2a163'],seed) : hex); },
  /** A television on a wall, on. */
  tv(t, w, d, h, hex, { seed = 0 }) { t.box(0, 0, w, .05, h, 0, BLACK); t.plate(0, .03, w - .06, h - .06, .03, pick(['#2f6f9e', '#3f8a6a', '#8a5a9e', '#c8784a', '#4a6ab0'], seed), true); t.plate(-w * .15, .032, w * .4, h * .3, h * .2, pick(['#f2c230', '#e8f4ff', '#ff8a2a', '#9fe0b0'], seed), true); },
  /** A bicycle, side on. */
  bike(t, w, d, h, hex, { seed = 0 }) {
    const r = Math.min(.34, h * .36), reach = w / 2 - r, frame = pick(['#c8322e', '#1f3a6a', BLACK, '#f2c230', '#2f5a45', '#f4f1e6'], seed);
    for (const s of [-1, 1]) { t.ring(s * reach, 0, r, r, BLACK); t.box(s * reach, 0, .03, .05, .03, r - .015, CHROME); }
    t.box(-reach * .45, 0, reach * 1.05, .03, .03, r, frame); t.box(0, 0, reach * 1.1, .03, .03, r + .34, frame); t.box(-reach * .08, 0, .03, .03, .5, r, frame); t.box(reach * .78, 0, .03, .03, .62, r, frame);
    t.box(-reach * .08, 0, .22, .09, .04, r + .52, BLACK); t.rodV(reach * .78, 0, .46, .014, r + .64, CHROME);
  },
  /** An espresso machine with its grinder, cups on top. */
  espresso: espressoStation,
  blenders(t,w,d,h) {
    for(const side of [-1,1]) {
      const u=side*w*.22;
      t.box(u,0,.19,.21,.15,0,'#454d49'); t.post(u,0,.079,.245,.15,side<0?'#97aa6d':'#d79166');
      t.disc(u,0,.084,.026,.395,'#363a38'); t.ring(u+.081,0,.045,.29,CHROME);
    }
  },
  garmentRail(t,w,d,h) {
    for(const side of [-1,1]) {
      const u=side*(w/2-.035);
      t.box(u,0,.073,d,.046,.035,DARK); t.post(u,0,.021,h-.085,.081,CHROME);
    }
    t.rodU(0,0,w,.019,h-.008,CHROME);
  },
  fittingRoom(t,w,d,h,hex) {
    t.box(-w/2+.03,0,.055,d,h,0,hex); t.box(0,-d/2+.03,w,.055,h,0,hex);
    t.rodU(0,d/2-.08,w,.025,h-.09,CHROME);
    for(let i=0;i<7;i++) t.box(-w*.12+i*w*.087,d/2-.08+(i%2)*.033,w*.09,.052,h-.30,.15,i%2?'#a69685':'#b1a28f');
  },
  cookline(t,w,d,h,hex) {
    t.box(0,0,w,d,.82,.04,hex); t.box(0,0,w+.02,d,.045,.86,'#c3cac4');
    for(const side of [-1,1]) {
      t.disc(side*w*.24,0,.128,.019,.905,DARK);
      t.disc(side*w*.24,.014,.115,.065,.924,'#5b6461');
      t.rodU(side*w*.24+.13,.014,.13,.012,.976,DARK);
      t.plate(side*w*.24,d/2+.002,w*.41,.45,.19,'#434d50');
      t.rodU(side*w*.24,d/2+.015,w*.34,.014,.69,CHROME);
    }
    t.box(0,-d*.22,w*.88,.28,.14,h-.16,hex); t.box(0,-d*.15,w*.74,.22,.018,h-.18,'#fff3d1',true);
  },
  plates(t,w,d,h,hex) {
    for(let i=0;i<5;i++) t.disc(0,0,.13,.012,i*.018,hex);
  },
  placeSetting(t,w,d,h,hex) {
    for(const side of [-1,1]) {
      const u=side*.17;
      t.disc(u,0,.104,.012,0,hex); t.disc(u,0,.083,.004,.012,'#d4cbb7');
      t.rodV(u+side*.121,0,.14,.004,.007,CHROME);
      t.post(u,-.144,.031,.085,0,'#b8cdca');
    }
  },
  cup(t) { t.model('saucer',0,0,0,WHITE); chinaCup(t,0,0,.009,true); },
  phone(t,w,d,h,hex) { displayPhone(t,hex); },
  drinkMug(t,w,d,h,hex,{dish,level=2}){t.serving(portionKey(servingFor(dish,true)||'mug',level));},
  paperCup(t,w,d,h,hex,{dish,level=2}){t.serving(portionKey(servingFor(dish)||'cup',level));},
  mealPlate(t,w,d,h,hex,{dish,style,level=2}){
    t.serving(portionKey(style?'plate-'+style:servingFor(dish)||'plate-lunch-special',level));
  },
  ringSample(t,w,d,h,hex) { gemstoneRing(t,0,0,0,hex); },
  sneaker(t,w,d,h,hex,{profile}) { sneaker(t,0,0,0,hex,WHITE,profile); },
  shirt(t,w,d,h,hex) {
    t.model('shirt',0,0,0,hex);
    t.box(0,.012,.072,.018,.012,.608,'#d3c6ae');
    t.box(0,0,.015,.015,.077,.62,WOOD);
  },
  /** Meat turning on an upright spit in front of its heat. */
  spit(t, w, d, h) {
    t.box(0, 0, w, d, .12, 0, STEEL); t.box(0, -d / 2 + .04, w, .08, h - .12, .12, STEEL); t.box(0, -d / 2 + .09, w - .12, .01, h - .3, .2, '#ff7a2a', true);
    t.box(0, .02, .02, .02, h - .1, .1, CHROME); t.cone(0, .02, Math.min(.16, w * .3), h - .42, .2, '#8a4a2a'); t.tub(0, .02, Math.min(.12, w * .22), .1, h - .23, '#a8603a'); t.can(0, .02, .05, .03, h - .13, '#c8322e');
    t.box(0, .02, w - .06, d - .12, .02, .12, '#5a3a22');
  },
  /** The lit menu over a counter: a line for each thing sold. */
  menuboard(t, w, d, h, hex, { lines = 4, seed = 0 }) {
    const boards = Math.max(1, Math.min(3, Math.round(w / 1.3))), each = w / boards, per = Math.max(2, Math.ceil(lines / boards) + 1);
    for (let k = 0; k < boards; k++) {
      const u = -w / 2 + each * (k + .5);
      t.box(u, 0, each - .06, .06, h, 0, BLACK); t.plate(u, .034, each - .12, h - .08, .04, '#fff6dc', true); t.plate(u, .037, each - .16, .1, h - .17, hex, true);
      for (let line = 0; line < per; line++) { const up = h - .28 - line * ((h - .34) / per), long = .45 + ((seed + k * 5 + line * 3) % 5) * .08; t.plate(u - (each - .2) * (1 - long) / 2 - .05, .037, (each - .3) * long, .035, up, '#3a2a1e'); t.plate(u + each / 2 - .16, .037, .09, .035, up, '#b0303a'); }
    }
  },
  /** Loaves and rolls on a baker's rack. */
  breadrack(t, w, d, h, hex, { seed = 0 }) {
    for (const su of [-1, 1]) for (const sv of [-1, 1]) t.box(su * (w / 2 - .02), sv * (d / 2 - .02), .03, .03, h, 0, CHROME);
    for (let up = .3; up < h - .1; up += .42) { t.box(0, 0, w, d, .02, up, hex); for (let u = -w / 2 + .15, k = 0; u < w / 2 - .1; u += .26, k++) t.rodV(u, 0, d - .1, .075, up + .09, pick(['#c9772a', '#b8642a', '#e0a23a', '#8a4a2a'], seed + k + Math.round(up * 3))); }
  },
  /** A chair to be examined in, and the lenses on an arm in front of it. */
  examchair(t, w, d, h) { t.can(0, 0, .28, .05, 0, DARK); t.can(0, 0, .06, .4, .05, CHROME); t.box(0, 0, .5, .5, .1, .45, '#2f3a46'); t.box(0, -.22, .5, .1, .62, .5, '#2f3a46'); t.box(0, -.24, .26, .08, .18, 1.12, '#2f3a46'); t.box(.34, -.2, .04, .04, 1.3, 0, CHROME); t.rodU(.17, .1, .36, .015, 1.3, CHROME); t.box(0, .14, .26, .06, .12, 1.2, BLACK); for (const s of [-1, 1]) t.can(s * .065, .14, .04, .07, 1.16, DARK); },
};
// The inspection counter uses the shop-floor product at its original scale.
export function inspectionMesh(item) {
  const frame={x:0,z:0,tx:1,tz:0,nx:0,nz:-1}, positions=[],colors=[];
  const props=roomProps(frame,0,positions,colors);
  const drawn=props.draw({shape:item.model,a:0,b:0,w:.4,d:.15,h:1,color:item.color,face:[0,1],more:item.more});
  if(!drawn) throw new Error('Missing display model for '+item.name);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox();
  return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.56,metalness:item.model==='ringSample'?.36:.07}));
}

export const PROP_SHAPES = Object.keys(PROPS);

// ---------------------------------------------------------------------------
// Laying them out. `r` is the room being made (interiors.js planRoom).

const prop = (r, shape, a, b, w, d, h, color, { y = 0, solid = true, face = [0, -1], ...more } = {}) => { r.things.push({ a, b, w, d, h, y, color, solid, shape, face, more: { seed: r.seed + r.things.length, ...more } }); };
/** Take out the first thing a test finds, and hand it back: a box this module can do better. */
const take = (r, test) => { const i = r.things.findIndex(test); return i < 0 ? null : r.things.splice(i, 1)[0]; };
const takeAll = (r, test) => { const out = r.things.filter(test); r.things = r.things.filter(thing => !test(thing)); return out; };
const isColor = (...hexes) => thing => hexes.includes(thing.color);
/** A counter with a till on it and someone behind, across the back of the room. */
const backCounter = (r, hex = WOOD, wide = Math.min(3, r.width - 2)) => { r.add(0, r.depth - 1.5, wide, .7, 1.0, hex); prop(r, 'register', wide / 2 - .4, r.depth - 1.5, .5, .5, .35, DARK, { y: 1.0, solid: false, face: [0, 1] }); r.staff(0, r.depth - .8, 0, -1); };
/** Glass cases down both sides with a way between, holding `items`. */
const caseRows = (r, from, to, items, hex = '#2a2c30', felt = FELT) => { if (to - from < 1.2) return; for (const side of [-1, 1]) for (let b = from + .7; b < to - .5; b += 1.5) prop(r, 'showcase', side * (r.half - 1.25), b, .6, 1.3, .95, hex, { face: [-side, 0], items: Array.isArray(items) ? pick(items, Math.round(b) + (side > 0 ? 1 : 0)) : items, felt }); };

/** What this module adds to a manner of room that interiors.js has already furnished. */
const DRESS = {
  // The dark box of an oven becomes a deck oven, the square pies round ones, and the menu goes up on the back wall.
  pizza(r) {
    const old = take(r, thing => thing.color === '#3a3d42' && thing.h === 1.9);
    takeAll(r, thing => thing.color === '#e07b2a' && thing.d === 1.2 && !thing.solid);
    if (old) prop(r, 'oven', old.a, old.b, old.w, Math.min(old.d, 1.7), 2.5, '#8d9498', { face: [1, 0] });
    const pies = takeAll(r, thing => thing.h === .05 && thing.color === '#e0a23a');
    takeAll(r, thing => thing.h === .03 && thing.w === .5 && thing.y === 1.1);
    pies.forEach((pie, i) => prop(r, 'pizza', pie.a, pie.b, .62, .62, .05, '#d8a25a', { y: 1.05, solid: false, kind: (r.seed + i) % 3, cut: (r.seed + i) % 2 === 0 }));
    if (old) prop(r, 'register', old.a + 1.1, Math.max(2.5, old.b - old.d / 2 - .1), .5, .5, .35, DARK, { y: 1.05, solid: false, face: [-1, 0] });
    prop(r, 'menuboard', 0, r.depth - .1, Math.min(3.6, r.width - 2.4), .1, .8, '#0b6b2f', { y: 1.95, solid: false, lines: menuFor(r.place).length });
  },
  // A buy-and-sell: what is in the cases, and the guitars and televisions too big for them on the wall.
  cases(r) {
    const tops = takeAll(r, thing => thing.color === '#a9cbd8' && thing.h === .3), bases = takeAll(r, thing => thing.color === '#2a2c30' && thing.h === .85);
    bases.forEach((base, i) => prop(r, 'showcase', base.a, base.b, base.w, base.d, 1.0, '#2a2c30', { face: Math.abs(base.a) > .5 ? [-Math.sign(base.a), 0] : [0, -1], items: pick(['watches', 'chains', 'phones', 'rings'], r.seed + i) }));
    if (!bases.length) for (const top of tops) r.things.push(top);
    takeAll(r, thing => thing.color === '#c9a23f' && thing.d === .04);
    for (let a = -r.half + 1.9, i = 0; a < r.half - 1.6; a += .75, i++) i % 3 === 2 ? prop(r, 'tv', a + .15, r.depth - .06, .95, .1, .55, BLACK, { y: 1.5, solid: false }) : prop(r, 'guitar', a, r.depth - .06, .4, .1, 1.05, WOOD, { y: 1.35, solid: false });
  },
  // The grill, the coolers and the till are the things themselves.
  bodega(r) {
    const hood = take(r, thing => thing.color === '#5d6468' && thing.y === 1.9), plate = take(r, thing => thing.color === '#8d9498' && thing.h === .9 && thing.d === 1.2);
    if (plate) prop(r, 'grill', plate.a, plate.b, .65, 1.3, 2.3, '#8d9498', { face: [1, 0] }); else if (hood) r.things.push(hood);
    const wall = take(r, thing => thing.color === '#d7dde0' && thing.h === 2.0); takeAll(r, thing => ['#7fb0c9', '#bcd6e4'].includes(thing.color) && thing.h === .24);
    if (wall) prop(r, 'cooler', wall.a, wall.b, wall.w + .25, wall.d, 2.05, '#e9edf0', { face: [-Math.sign(wall.a), 0] });
    const back = take(r, thing => thing.color === '#cfd6da' && thing.h === 2.1); takeAll(r, thing => thing.color === '#7fb0c9' && thing.h === 1.5);
    if (back) prop(r, 'cooler', back.a, back.b, back.w, back.d, 2.05, '#e9edf0', { face: [0, -1] });
    const till = take(r, thing => thing.color === '#23272b' && thing.y === 1.0 && thing.h === .35);
    if (till) { prop(r, 'register', till.a, till.b, .5, .5, .35, DARK, { y: 1.0, solid: false, face: [0, -1] }); prop(r, 'espresso', till.a - .75, till.b, .7, .4, .5, CHROME, { y: 1.0, solid: false, face: [0, 1] }); }
  },
  // The case is full of what they bake, and the racks behind hold loaves.
  bakery(r) {
    const glass = take(r, thing => thing.color === '#a9cbd8' && thing.h === .5); takeAll(r, thing => thing.h === .12 && thing.d === .36);
    if (glass) prop(r, 'showcase', glass.a, glass.b, glass.w, glass.d, .5, '#e9e4d6', { y: .55, solid: false, face: [0, -1], items: 'pastry', felt: '#f6efe0' });
    takeAll(r, thing => thing.h === .14 && thing.d === .3); const racks = take(r, thing => thing.color === '#b8a888' && thing.h === 2.0);
    if (racks) for (let a = -r.half + 1.0; a < r.half - .7; a += 1.25) prop(r, 'breadrack', a, r.depth - .35, 1.1, .5, 1.9, '#d8d2c4', { face: [0, -1] });
    const counter = r.things.find(thing => thing.color === '#e9e4d6' && thing.h === 1.15);
    if (counter) prop(r, 'register', counter.a + counter.w / 2 - .4, counter.b + .1, .5, .5, .35, DARK, { y: 1.15, solid: false, face: [0, 1] });
  },
  // The spit turns behind the counter, and the platters are up on the board.
  halal(r) {
    const stand = take(r, thing => thing.color === '#8d9498' && thing.w === .45), meat = take(r, thing => thing.color === '#8a4a2a' && thing.y === 1.0);
    if (stand) prop(r, 'spit', stand.a, stand.b, .55, .5, 1.0, STEEL, { y: 1.0, solid: false, face: [0, -1] }), r.things.push(stand); else if (meat) r.things.push(meat);
    if (r.boardAt != null) prop(r, 'menuboard', 0, r.boardAt, r.width - 2.2, .1, .75, '#0b5d2a', { y: 2.1, solid: false, lines: menuFor(r.place).length });
  },
  takeout(r) {
    if (r.boardAt != null) prop(r, 'menuboard', 0, r.boardAt, r.width - 2.2, .1, .75, pick(['#c81e1e', '#e07b12', '#0b6b2f', '#b01515'], r.seed), { y: 2.1, solid: false, lines: menuFor(r.place).length });
    const till = take(r, thing => thing.color === '#23272b' && thing.y === 1.15);
    if (till) prop(r, 'register', till.a, till.b, .5, .5, .35, DARK, { y: 1.15, solid: false, face: [0, 1] });
    const fridge = take(r, thing => thing.color === '#d7dde0' && thing.h === 1.9); take(r, thing => thing.color === '#7fb0c9' && thing.h === 1.5);
    if (fridge) prop(r, 'cooler', fridge.a, fridge.b, fridge.w, fridge.d, 1.95, '#e9edf0', { face: [-1, 0] });
  },
  sushi(r) {
    const glass = take(r, thing => thing.color === '#a9cbd8' && thing.h === .22);
    if (glass) prop(r, 'showcase', glass.a, glass.b, glass.w, glass.d, .26, '#c9a876', { y: 1.05, solid: false, face: [1, 0], items: 'sushi', felt: '#e9dcc0' });
  },
  liquor(r) { const counter = r.things.find(thing => thing.h === 1.05 && thing.solid); if (counter) prop(r, 'register', counter.a + .6, counter.b, .5, .5, .35, DARK, { y: 1.05, solid: false, face: [0, -1] }); },
};

/** Manners of room this module furnishes by itself, for kinds of place interiors.js gave a room shared with others. */
const OWN = {
  ...BUSINESS_ROOMS, ...NEIGHBORHOOD_ROOMS,
  // An optician: frames up both walls, more under glass, the chart and the chair at the back, a desk by the door.
  optician(r) {
    r.floor = '#b8b4a8'; r.wall = '#f2f0e8'; r.light = { color: 0xf6faff, power: 82 };
    const to = r.depth - 3.4;
    for (const side of [-1, 1]) for (let b = 1.9; b + 1.9 < to; b += 2.1) prop(r, 'frames', side * (r.half - .05), b + .95, .1, 1.9, 1.3, '#d8d6cc', { y: .8, solid: false, face: [-side, 0] });
    for (let b = 3.2; b < to - .6; b += 2.3) prop(r, 'showcase', 0, b, Math.min(1.8, r.width - 3.4), .6, .95, WHITE, { items: 'glasses', felt: '#e9e6dc' });
    r.add(-r.half + 1.2, 1.9, 1.8, .7, 1.0, WHITE); prop(r, 'register', -r.half + .7, 1.9, .5, .5, .35, DARK, { y: 1.0, solid: false }); r.staff(-r.half + 1.2, 1.2, 0, 1);
    prop(r, 'examchair', -r.half + 1.4, r.depth - 1.5, .9, .9, 1.5, '#2f3a46', { face: [1, 0] });
    prop(r, 'eyechart', r.half - .04, r.depth - 1.5, .06, .5, .9, WHITE, { y: 1.1, solid: false, face: [-1, 0] });
    r.add(0, r.depth - .3, 1.0, .1, 2.1, '#cfd6da', 0, false); r.staff(-r.half + 2.2, r.depth - 1.2, -1, 0);
  },
  // A pawnbroker: the counter behind glass, cases of what was pledged, guitars and tools on the walls.
  pawn(r) {
    r.floor = '#4a4a4e'; r.wall = '#d9d4c6';
    caseRows(r, 2.0, r.depth - 2.6, ['watches', 'chains', 'phones', 'rings']);
    // The counter is behind a grille: what hangs on the wall can still be seen through it.
    r.add(-.35, r.depth - 1.7, r.width - 1.3, .7, 1.1, '#2a2c30'); for (let a = -r.half + .45; a < r.half - 1; a += .32) r.add(a, r.depth - 1.4, .03, .03, 1.1, STEEL, 1.1, false); r.add(-.35, r.depth - 1.4, r.width - 1.3, .04, .04, STEEL, 2.2, false); r.staff(0, r.depth - .9, 0, -1);
    for (let a = -r.half + .8, i = 0; a < r.half - .5; a += 1.05, i++) i % 3 === 1 ? prop(r, 'tv', a + .1, r.depth - .06, .9, .1, .52, BLACK, { y: 1.55, solid: false }) : prop(r, 'guitar', a, r.depth - .06, .4, .1, 1.05, WOOD, { y: 1.35, solid: false });
    for (const side of [-1, 1]) prop(r, 'pegboard', side * (r.half - .05), 3.2, .1, 1.6, 2.0, '#3a3a3e', { solid: false, face: [-side, 0] });
    r.panel(0, 0, Math.min(2.6, r.width - 2), .5, 2.3, '#c9a23f', .08);
  },
  // Books: cases round the walls and back to back down the room, a table of new ones by the door.
  books(r) {
    r.floor = '#6b5a48'; r.wall = '#e9e2d2'; r.light = { color: 0xffeccc, power: 58 };
    for (const side of [-1, 1]) for (let b = 1.7; b + 1.3 < r.depth - .4; b += 1.35) prop(r, 'bookcase', side * (r.half - .18), b + .65, .34, 1.3, 2.1, WOOD, { face: [-side, 0] });
    for (let b = 4.4; b + 1.3 < r.depth - 2.6; b += 1.35) for (const way of [-1, 1]) prop(r, 'bookcase', way * .19, b + .65, .34, 1.3, 1.6, WOOD, { face: [way, 0] });
    r.add(0, 2.9, Math.min(1.8, r.width - 3.4), .9, .78, WOOD); for (let i = 0; i < 4; i++) r.add(-.6 + i * .4, 2.9, .22, .3, .06 + (i % 3) * .05, pick(SPINE, r.seed + i), .78, false);
    backCounter(r, WOOD, Math.min(2.2, r.width - 3));
  },
  // A florist: buckets on stepped stands each side, the cooler of arrangements, the bench where they are wrapped.
  florist(r) {
    r.floor = '#7a8078'; r.wall = '#eef0e4'; r.light = { color: 0xfffaf0, power: 70 };
    for (const side of [-1, 1]) for (let b = 1.9; b + 1.7 < r.depth - 2.8; b += 1.9) prop(r, 'flowers', side * (r.half - .5), b + .85, .9, 1.7, 1.2, '#5a4632', { face: [-side, 0] });
    prop(r, 'cooler', -r.half + 1.3, r.depth - .4, 2.2, .7, 2.05, '#e9edf0', { stock: ['#d23a2a', '#f2c230', '#e0559a', '#f4f1e6', '#3f8a45', '#8a4b9e'] });
    r.add(Math.min(1.4, r.half - 1.4), r.depth - 1.5, Math.min(2, r.width - 3.65), .8, .95, WOOD); r.add(Math.min(1.4, r.half - 1.4), r.depth - 1.5, .5, .3, .06, '#d9c9a8', .95, false); r.staff(Math.min(1.4, r.half - 1.4), r.depth - .7, 0, -1);
    prop(r, 'register', Math.min(2.1, r.half - .7), r.depth - 1.5, .5, .5, .35, DARK, { y: .95, solid: false, face: [0, 1] });
  },
  // Bicycles: a row of them nose to tail each side, wheels and helmets on the wall, the stand where they are mended.
  bikes(r) {
    r.floor = '#5a5a58'; r.wall = '#e6e6de'; r.light = { color: 0xf4f8ff, power: 76 };
    for (const side of [-1, 1]) for (let b = 2.0; b + 1.8 < r.depth - 2.4; b += 1.95) prop(r, 'bike', side * (r.half - .75), b + .9, .5, 1.8, 1.05, BLACK, { face: [-side, 0] });
    for (let a = -r.half + 1.2, i = 0; a < r.half - .9; a += .8, i++) r.add(a, r.depth - .08, .5, .1, .5, pick(BRIGHT, r.seed + i), 1.6, false);
    r.add(-r.half + 1.4, r.depth - 1.5, 2.0, .8, .95, '#3a3d42'); r.staff(-r.half + 1.4, r.depth - .7, 0, -1);
    prop(r, 'register', -r.half + .8, r.depth - 1.5, .5, .5, .35, DARK, { y: .95, solid: false, face: [0, 1] });
    prop(r, 'pegboard', r.half - .05, r.depth - 1.6, .1, 1.6, 2.0, '#3a3a3e', { solid: false, face: [-1, 0] });
  },
  // Pets: tanks along one wall, sacks of feed in aisles, the counter with the till.
  pets(r) {
    r.floor = '#a8a294'; r.wall = '#eceade';
    for (let b = 1.9; b + 1.2 < r.depth - 2.6; b += 1.3) prop(r, 'tank', -r.half + .3, b + .6, .5, 1.2, 1.5, '#2a2c30', { face: [1, 0] });
    r.aisles(-r.half + 2.3, r.half - .7, 3.4, r.depth - 2.8, 1.9);
    for (let i = 0; i < 4; i++) r.add(r.half - .5, 1.9 + i * .55, .7, .5, .22, pick(['#c8452e', '#2f5f9e', '#e0b23a', '#3f7d4e'], r.seed + i), 0, i === 0);
    backCounter(r, WHITE, Math.min(2.6, r.width - 2.4));
  },
  // Hardware: tools on boards and tins of paint down the walls, aisles of fittings, keys cut at the counter.
  hardware(r) {
    r.floor = '#7a766c'; r.wall = '#e6e2d4';
    for (const side of [-1, 1]) for (let b = 1.8; b + 1.8 < r.depth - 2.6; b += 1.9) prop(r, 'pegboard', side * (r.half - .05), b + .9, .1, 1.8, 2.1, '#5a4632', { solid: false, face: [-side, 0] });
    r.aisles(-r.half + 1.6, r.half - 1.2, 3.6, r.depth - 3.0, 1.8);
    r.add(0, r.depth - 1.5, r.width - 1.4, .7, 1.05, '#b0303a'); r.add(r.half - 1.3, r.depth - 1.5, .4, .4, .35, '#3a3d42', 1.05, false); r.staff(0, r.depth - .85, 0, -1);
    prop(r, 'register', -r.half + 1.3, r.depth - 1.5, .5, .5, .35, DARK, { y: 1.05, solid: false, face: [0, 1] });
    r.add(0, r.depth - .2, r.width - .6, .3, 2.0, '#8a7a66'); for (let a = -r.half + .8, i = 0; a < r.half - .5; a += .3, i++) r.add(a, r.depth - .38, .2, .06, .2, pick(BRIGHT, r.seed + i), 1.2 + (i % 3) * .26, false);
  },
  pharmacy: furnishPharmacy,
  // Electronics: televisions up the walls, all on, tables of small things, the counter at the back.
  electronics(r) {
    r.floor = '#3a3d42'; r.wall = '#e9e9e4'; r.light = { color: 0xf4f8ff, power: 80 };
    for (const side of [-1, 1]) for (let b = 1.9; b + 1.2 < r.depth - 2.2; b += 1.35) for (const up of [.9, 1.65]) prop(r, 'tv', side * (r.half - .05), b + .6, .1, 1.15, .66, BLACK, { y: up, solid: false, face: [-side, 0], seed: r.seed + Math.round(b * 3) + (up > 1 ? 5 : 0) + (side > 0 ? 2 : 0) });
    for (let b = 3.0; b < r.depth - 3.2; b += 2.2) prop(r, 'showcase', 0, b, Math.min(2.2, r.width - 3.2), .7, .95, WHITE, { items: 'phones', felt: '#d9d9d2' });
    backCounter(r, WHITE, Math.min(2.6, r.width - 2.4)); r.panel(0, 0, 2.2, .5, 2.2, '#2f5f9e');
  },
  // Instruments: guitars on every wall, amplifiers under them, a keyboard on its stand.
  music(r) {
    r.floor='#745d46'; r.wall='#ddd2bd';
    r.finish={floor:'wood',feature:'#524135',ink:'#f2e6c9',accent:'#bc9864',title:r.place.name,line:'',zones:['ACOUSTICS','PLAY ROOM']};
    const left=-r.half+.78, stock=fittingStock('music');
    r.add(left,1.02,1.12,.6,.54,'#5d4536');
    prop(r,'guitar',left,1.02,.42,.18,.99,stock[0].color,{y:.54,solid:false,sku:stock[0].sku});
    for(let b=2.65,i=0;b<r.depth-1.37;b+=1.65,i++) {
      const side=i%2 ? 1 : -1;
      const item=stock[(i+1)%stock.length];
      prop(r,'guitar',side*(r.half-.11),b,.20,.41,.99,item.color,{face:[-side,0],y:.95,solid:false,sku:item.sku});
      r.add(side*(r.half-.28),b,.41,.57,.45,'#514b46');
    }
    r.seat(r.half-.78,1.58,-1,0,.28,'#835740',.38,.38,.73);
    backCounter(r,WOOD,Math.min(2.2,r.width-2.5));
  },
  // A butcher: the meat laid out in a long cold case, the block and the scale behind it, a few shelves of the rest.
  butcher(r) { fresh(r, 'meat', '#b0303a'); },
  // A fishmonger: the catch on ice in the case.
  fishmarket(r) { fresh(r, 'fish', '#2f6f9e'); },
  // Cosmetics: counters of small things under glass with mirrors on them, shelves of bottles round the walls.
  cosmetics(r) {
    r.floor = '#d2c8c0'; r.wall = '#f6ecee'; r.light = { color: 0xfff4f8, power: 80 };
    r.shelves(-1, 1.6, r.depth - 2.2, '#f4f1ec', ['#e0559a', '#f6a8c0', '#c9a23f', '#f4f1e6']); r.shelves(1, 1.6, r.depth - 2.2, '#f4f1ec', ['#8a4b9e', '#f6a8c0', '#17191b', '#c9a23f']);
    for (let b = 3.2; b < r.depth - 3.2; b += 2.2) { prop(r, 'showcase', 0, b, Math.min(2.0, r.width - 3.4), .7, .95, WHITE, { items: 'jars', felt: '#f6ecee' }); r.add(0, b, .3, .04, .4, '#bcd3da', .95, false); }
    backCounter(r, WHITE, Math.min(2.2, r.width - 3));
  },
  // A smoke shop or dispensary: jars and small things under glass, more jars behind the counter.
  smoke(r) {
    r.floor = '#3a3a3e'; r.wall = '#dcd8cc'; r.light = { color: 0xeaffea, power: 64 };
    caseRows(r, 2.0, r.depth - 2.4, 'jars', '#2a2c30', '#17191b');
    r.add(0, r.depth - 1.5, r.width - 2.6, .7, 1.05, '#2a2c30'); prop(r, 'register', Math.max(-.8, -(r.width - 2.6) / 2 + .4), r.depth - 1.5, .5, .5, .35, DARK, { y: 1.05, solid: false, face: [0, 1] }); r.staff(0, r.depth - .8, 0, -1);
    r.add(0, r.depth - .2, r.width - .8, .3, 2.0, '#2a2c30'); for (let y = .9; y < 1.9; y += .32) for (let a = -r.half + .7, i = 0; a < r.half - .6; a += .2, i++) r.add(a, r.depth - .38, .12, .08, .2, pick(['#5a7a3a', '#8a6a2a', '#3a5a2a', '#b8a04a', '#c8452e'], r.seed + i + Math.round(y * 5)), y, false);
    r.panel(0, 0, Math.min(2.2, r.width - 2), .4, 2.3, '#3f9a4e', .32);
  },
};
function fresh(r, items, sign) {
  r.floor = '#c9c6ba'; r.wall = '#f2f0e6'; r.light = { color: 0xf8fbff, power: 82 };
  const from = 2.0, to = Math.max(from + 2.2, r.depth - 2.4), a = -r.half + 1.5;
  for (let b = from + .7; b < to - .4; b += 1.45) prop(r, 'showcase', a, b, .9, 1.4, 1.2, '#f4f4f0', { face: [1, 0], items, felt: '#eef4f6' });
  r.add(-r.half + .35, (from + to) / 2, .6, Math.min(1.4, to - from), .9, WOOD); r.add(-r.half + .35, (from + to) / 2 + 1.1, .4, .4, .3, STEEL, .9, false); r.staff(-r.half + .8, from + 1, 1, 0);
  r.shelves(1, 1.6, r.depth - 1.6, '#d8d2c4', ['#c8452e', '#e0b23a', '#3f7d4e', '#d9d4c2']);
  // The till on a stand of its own at the end of the case.
  r.add(a, Math.min(to + .3, r.depth - .8), .7, .7, .9, WHITE); prop(r, 'register', a, Math.min(to + .3, r.depth - .8), .5, .5, .35, DARK, { y: .9, solid: false, face: [1, 0] });
  r.panel(0, 0, Math.min(2.6, r.width - 2), .5, 2.3, sign);
}

/** Kinds of place that get a manner of room of their own here, in place of the one interiors.js shares among several. */
export const OWN_STYLE_OF = { jewelry: 'jewelry', optician: 'optician', pawn: 'pawn', shoes: 'shoes', books: 'books', florist: 'florist', bikes: 'bikes', pets: 'pets', hardware: 'hardware', pharmacy: 'pharmacy',
  electronics: 'electronics', music: 'music', butcher: 'butcher', fishmarket: 'fishmarket', cosmetics: 'cosmetics', smoke: 'smoke', dispensary: 'smoke',
  repair: 'workshop', bodyshop: 'workshop', copyshop: 'copyshop', tailor: 'tailor', gym: 'gym', laundromat: 'laundromat', postoffice: 'postoffice' };
export const OWN_STYLES = Object.keys(OWN), DRESSED_STYLES = Object.keys(DRESS);

/** Furnish `r` in a manner of room: this module's own where it has one, otherwise `styles[style]` and then what this adds to it. */
export function furnishRoom(styles, style, r) {
  furnishStyle(styles, style, r);
  // Then the kitchen that kind of place cooks in.
  fitKitchen(r, (...args) => prop(r, ...args), style);
}
function furnishStyle(styles, style, r) {
  if(style==='takeout'||style==='steamtable'){
    furnishCounterService(r,(...args)=>prop(r,...args),style==='steamtable');return;
  }
  if (groceryStore(r.place)) {
    const add=(...args)=>prop(r,...args);
    furnishGrocer(r,add);
    if(r.place.kind==='bodega')dressCornerStore(r,add);
    return;
  }
  if (r.place.kind==='salon' || r.place.kind==='barber') { furnishSalon(r,(...args)=>prop(r,...args)); return; }
  if (OWN[style]) { OWN[style](r, (...args) => prop(r, ...args)); return; }
  styles[style](r);
  DRESS[style]?.(r);
}
