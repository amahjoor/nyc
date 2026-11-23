// Real names over real shop fronts.
//
// The facade shader draws a shop front every two bays along a street wall
// (facade.js). This module tells it whose each one is. Three textures do it:
//
//   a map of the ground around the player, a metre to the texel, holding at
//   each point the number of the place whose street front lies there;
//   a table with a row per place: sign colours, whether it is open, its
//   inspection grade, and where its lettering is in the atlas;
//   an atlas of lettering for the nearest places.
//
// The shader looks up the middle of each shop front in the map. A front that
// belongs to a place takes that place's sign; one that belongs to nobody
// stays as anonymous as it was.
import * as THREE from './vendor/three.module.min.js';
import { shared } from './gfx-common.js';
import { ATLAS_CELL_HEIGHT } from './facade.js';
import { isOpen, signFor, brandKey, placeName } from './places.js';
import { bankIdentity, drawBankName } from './bank.js';
import { roomPoint } from './room.js';
import { buildRoom } from './interiors.js';
import { planShopEntrance, treadHeight } from './shop-entrance.js';
import { buildShopSteps } from './shop-steps.js';

/** The map covers this many metres square, at a metre to the texel. */
export const MAP_SPAN = 512;
/** Rows in the place table; row 0 means nobody. */
export const TABLE_ROWS = 1024;
/** The lettering atlas, in pixels, and one sign's share of it: eight times as wide as it is high, like a sign band. */
export const ATLAS = { width: 2048, height: 4096, cellWidth: 8 * ATLAS_CELL_HEIGHT, cellHeight: ATLAS_CELL_HEIGHT, columns: 3, rows: 51 };
// How far either side of the wall line a front reaches in the map, in metres.
const FRONT_DEPTH = 1.6;
const TABLE_WIDTH = 5, ROW_SIZE = TABLE_WIDTH * 4;
const WINDOW_RANGE = 48, MAX_ROOMS = 14;
// Kinds of place with something of their own on the front, as the shader numbers them.
const TRIM = { barber: 1, bar: 2, pub: 2, club: 2 };

const linear = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => { const s = c / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); };

/**
 * Write the map: for every texel within a front, the row of the nearest one.
 * `fronts[i]` is given row i + 1. Returns nothing; fills `data` (two bytes a
 * texel, low then high) for a map whose corner is at (originX, originZ).
 */
export function rasterFronts(fronts, originX, originZ, data, nearest) {
  data.fill(0); nearest.fill(Infinity);
  for (let i = 0; i < fronts.length && i < TABLE_ROWS - 1; i++) {
    const front = fronts[i], half = front.width / 2, row = i + 1;
    const reachX = Math.abs(front.tx) * half + Math.abs(front.nx) * FRONT_DEPTH, reachZ = Math.abs(front.tz) * half + Math.abs(front.nz) * FRONT_DEPTH;
    const x0 = Math.max(0, Math.floor(front.x - reachX - originX)), x1 = Math.min(MAP_SPAN - 1, Math.ceil(front.x + reachX - originX));
    const z0 = Math.max(0, Math.floor(front.z - reachZ - originZ)), z1 = Math.min(MAP_SPAN - 1, Math.ceil(front.z + reachZ - originZ));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const dx = originX + x + .5 - front.x, dz = originZ + z + .5 - front.z, along = Math.abs(dx * front.tx + dz * front.tz), out = Math.abs(dx * front.nx + dz * front.nz);
      if (along > half + .5 || out > FRONT_DEPTH) continue;
      // The closest wall takes a corner texel. Neighbours on one wall split it along the frontage.
      const o = z * MAP_SPAN + x;
      const distance = out + .01 * along + (along > half ? 2 : 0);
      if (distance < nearest[o]) { nearest[o] = distance; data[o * 2] = row & 255; data[o * 2 + 1] = row >> 8; }
    }
  }
}

/** Letter a sign into its cell of the atlas: the name, and under it what else the sign says. White on nothing. */
export function drawSign(context, sign, x, y, width, height) {
  context.clearRect(x, y, width, height);
  context.fillStyle = '#ffffff'; context.textAlign = 'center'; context.textBaseline = 'middle';
  const fit = (text, size, weight, limit) => {
    context.font = `${weight} ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    const measured = context.measureText(text).width;
    if (measured > limit) { size = Math.max(14, Math.floor(size * limit / measured)); context.font = `${weight} ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; }
  };
  if (sign.tagline) {
    fit(sign.name, Math.round(height * .7), 800, width * .96); context.fillText(sign.name, x + width / 2, y + height * .38);
    fit(sign.tagline, Math.round(height * .25), 700, width * .94); context.fillText(sign.tagline, x + width / 2, y + height * .85);
  } else { fit(sign.name, Math.round(height * .86), 800, width * .96); context.fillText(sign.name, x + width / 2, y + height * .53); }
}

/**
 * Draw a chain's logo as its sign: the image as large as fits, on the plain
 * ground it was made to stand on. Unlike lettering, which is kept as ink to
 * be coloured, a logo is kept in its own colours and fills its cell.
 */
export function drawLogo(context, logo, x, y, width, height) {
  context.fillStyle = logo.background; context.fillRect(x, y, width, height);
  const scale = Math.min(width * .9 / logo.width, height * .84 / logo.height), w = logo.width * scale, h = logo.height * scale;
  context.drawImage(logo.image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}
/** Added to a front's trim number in the table when its sign is a logo in its own colours. */
export const LOGO_TRIM = 8;

/**
 * Keep the three textures in step with the street fronts around the player.
 * `createCanvas` makes the canvas the lettering is drawn on.
 */
export function createStorefronts({ createCanvas = () => document.createElement('canvas'), scene, roomFor, floorFor, groundAt, clearApproach, physics, populate, isClosed = () => false, policeUsing = () => false } = {}) {
  const mapData = new Uint8Array(MAP_SPAN * MAP_SPAN * 2), nearest = new Float32Array(MAP_SPAN * MAP_SPAN);
  const map = new THREE.DataTexture(mapData, MAP_SPAN, MAP_SPAN, THREE.RGFormat, THREE.UnsignedByteType);
  map.name = 'Whose shop front is where'; map.magFilter = map.minFilter = THREE.NearestFilter; map.generateMipmaps = false; map.needsUpdate = true;
  const tableData = new Float32Array(ROW_SIZE * TABLE_ROWS);
  const table = new THREE.DataTexture(tableData, TABLE_WIDTH, TABLE_ROWS, THREE.RGBAFormat, THREE.FloatType);
  table.name = 'Shop signs'; table.magFilter = table.minFilter = THREE.NearestFilter; table.generateMipmaps = false; table.needsUpdate = true;
  const canvas = createCanvas(); canvas.width = ATLAS.width; canvas.height = ATLAS.height;
  const context = canvas.getContext('2d');
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.name = 'Shop sign lettering'; atlas.colorSpace = THREE.NoColorSpace; atlas.anisotropy = 8; atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter;
  const cells = ATLAS.columns * ATLAS.rows;
  const rect = cell => { const px = (cell % ATLAS.columns) * ATLAS.cellWidth, py = Math.floor(cell / ATLAS.columns) * ATLAS.cellHeight; return { px, py, u: px / ATLAS.width, v: 1 - (py + ATLAS.cellHeight) / ATLAS.height, w: ATLAS.cellWidth / ATLAS.width, h: ATLAS.cellHeight / ATLAS.height }; };
  // Cell 0 is not a sign: the letters of the inspection grades, and OPEN, a quarter of the cell each.
  if (context) {
    const { px, py } = rect(0), quarter = ATLAS.cellWidth / 4;
    context.clearRect(px, py, ATLAS.cellWidth, ATLAS.cellHeight); context.fillStyle = '#ffffff'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = `800 ${Math.round(ATLAS.cellHeight * .9)}px Arial, sans-serif`;
    ['A', 'B', 'C'].forEach((letter, i) => context.fillText(letter, px + quarter * (i + .5), py + ATLAS.cellHeight * .54));
    context.font = `800 ${Math.round(ATLAS.cellHeight * .52)}px Arial, sans-serif`; context.fillText('OPEN', px + quarter * 3.5, py + ATLAS.cellHeight * .54);
  }
  const glyphs = rect(0);
  shared.uNycPlaceMap.value = map; shared.uNycPlaceTable.value = table; shared.uNycPlaceAtlas.value = atlas;
  shared.uNycPlaceGlyphs.value.set(glyphs.u, glyphs.v, glyphs.w, glyphs.h);
  // Which sign each lettering cell holds, by place.
  const held = new Array(cells).fill(null), where = new Map();
  let shown = [], source = null, at = null, openAt = -1, lettered = 0;
  const rooms = new Map(), brokenGlass = new Map();
  const entries = new Map();
  let pending = [], windowsVisible = false, floorRevision = -1, closureRevision = -1;
  let faces = [], faceRows = new Map(), active = null, closingDoor = null;
  const sameFront=(a,b)=>a===b || ['x','z','tx','tz','nx','nz','width','skew'].every(k=>a[k]===b[k]) &&
    JSON.stringify(a.returns)===JSON.stringify(b.returns);
  function removeSteps(entry){
    if(!entry.mesh)return;
    physics?.replace(entry,[]);
    entry.mesh.removeFromParent();entry.mesh.geometry.dispose();entry.mesh.material.dispose();
    entry.mesh=null;
  }
  function entranceFor(front,plan){
    const id=front.place.id;
    let entry=entries.get(id);
    if(entry && sameFront(entry.front,front)){
      if(entry.revision===floorRevision)return entry;
      plan??=entry.plan;
    }
    plan??=roomFor(front);
    if(!plan)return null;
    const nominal=floorFor(plan);
    const {floor,stairs}=groundAt ? planShopEntrance(plan,nominal,groundAt,clearApproach) : {floor:nominal,stairs:null};
    if(!entry){entry={};entries.set(id,entry);}
    const old=entry.stairs;
    if(!old || !stairs || entry.plan!==plan || old.turn!==stairs.turn || old.count!==stairs.count || old.tread!==stairs.tread ||
      Math.abs(old.floor-floor)>.001 || Math.abs(old.rise-stairs.rise)>.0005){
      removeSteps(entry);
      if(stairs){
        entry.mesh=buildShopSteps(stairs,groundAt);scene.add(entry.mesh);
        physics?.replace(entry,entry.mesh.userData.barriers);
      }
    }
    Object.assign(entry,{front,plan,floor,stairs,revision:floorRevision});
    return entry;
  }
  function release(view) {
    for (const person of new Set([...(view.visitors||[]), view.visitor])) {
      if (person?.visit?.view !== view) continue;
      person.visit.detach?.(); person.visit=null;
      if (person.driverCar?.errand) {
        const front=view.front;
        Object.assign(person,{x:front.x+front.nx*1.4,z:front.z+front.nz*1.4,state:'walk',sitting:false,seat:null});
        person.driverCar.errand.closed=true;
      } else person.gone=true;
    }
    view.group.userData.dispose(); rooms.delete(view.plan.place.id);
  }
  function ensure(front, plan = null) {
    let view = rooms.get(front.place.id);
    if (view) return view;
    const entry=entranceFor(front,plan);
    if (!entry) return null;
    plan=entry.plan;
    const group = buildRoom(plan, 0, { streetView: true }), floor = entry.floor;
    group.position.y = floor; scene.add(group);
    view = { plan, front, group, floor, entry, groundAt, door: group.userData.door, actors: [], occupied: new Set() };
    const broken = brokenGlass.get(plan.place.id);
    if (broken) group.userData.setBrokenGlass(broken);
    populate?.(view); rooms.set(front.place.id, view);
    return view;
  }
  function panes(view) {
    for (const row of faceRows.get(view.plan.place.id) || []) {
      const face = faces[row - 1], offset = row * ROW_SIZE;
      let width = view.plan.width / 2;
      if (face.side) {
        const length = view.plan.returns.find(edge => edge.side === face.side)?.length;
        if (!length) continue;
        width = -length * Math.hypot(1,view.plan.skew) / 2;
        tableData.set(roomPoint(view.plan,face.side * view.plan.width / 2,length / 2),offset + 12);
      }
      tableData.set([face.nx, face.nz, view.floor, width], offset + 16);
    }
    table.needsUpdate = true;
  }
  function updateRooms(focus, visible, hours, walker) {
    const wanted = new Set(), outside=new Set();
    pending = [];
    for (let row = 1; row <= faces.length; row++) tableData[row * ROW_SIZE + 19] = 0;
    for (const front of shown) {
      const id = front.place.id;
      const existing=rooms.get(id);
      const visiting = existing?.visitor?.visit || existing?.cleanups?.length || existing?.actors.some(actor=>actor.escape && !actor.gone) || (existing?.handoff && existing.clerk && !existing.clerk.gone);
      const occupied = active?.plan.place.id === id || closingDoor?.plan.place.id === id || (existing && policeUsing(existing));
      const distance=Math.hypot(front.x-focus.x,front.z-focus.z);
      if(!visiting && !occupied){
        if(!visible || distance>WINDOW_RANGE)continue;
        if(!isOpen(front.place.kind,hours) || isClosed(front.place)){
          // The shutters can close while the stoop still belongs to the street.
          if(groundAt && outside.size<MAX_ROOMS && entranceFor(front))outside.add(id);
          continue;
        }
        if(wanted.size>=MAX_ROOMS)continue;
      }
      if (visiting && (!visible || distance>WINDOW_RANGE+12) && !occupied) continue;
      let view = rooms.get(id);
      if (view && !visiting && view !== active && view.front !== front &&
          !sameFront(view.front,front)) {
        release(view); view = null;
      }
      if (view) {
        // Finish the visit against the doorway its occupants are walking through.
        if (!visiting) view.front = front;
        view.entry=entranceFor(view.front,view.plan);
        view.floor=view.entry.floor; view.group.position.y = view.floor;
        panes(view); wanted.add(id);
      } else {
        const plan = entranceFor(front)?.plan;
        if (plan) { pending.push({ front, plan }); wanted.add(id); }
      }
    }
    for (const [id, view] of rooms) if (view !== active && view !== closingDoor && !wanted.has(id) && !policeUsing(view)) release(view);
    for(const [id,entry] of entries)if(!wanted.has(id) && !outside.has(id) && !rooms.has(id)){
      if(walker && treadHeight(entry.stairs,walker.x,walker.z)!==null)continue;
      removeSteps(entry);entries.delete(id);
    }
    table.needsUpdate = true;
  }
  // Logos fetched to this machine, by chain: { image, width, height, background }. Empty unless build-logos.mjs has been run.
  let logos = new Map();
  const state = {
    textures: { map, table, atlas },
    /** How many places have a front in the map, and how many of those are lettered. */
    get counts() { return { fronts: shown.length, lettered }; },
    /** The fronts in the table, row 1 first. */
    get fronts() { return shown; },
    get rooms() { return rooms.values(); },
    breakGlass(view,id) {
      const key = view.plan.place.id, broken = brokenGlass.get(key) ?? new Set();
      if (broken.has(id)) return false;
      broken.add(id); brokenGlass.set(key,broken);
      view.group.userData.setBrokenGlass(broken);
      return true;
    },
    stepHeightAt(x,z,referenceHeight){
      let highest=null;
      for(const {stairs,plan} of entries.values()){
        if(!stairs || Math.abs(x-plan.x)>stairs.toe+2 || Math.abs(z-plan.z)>stairs.toe+2)continue;
        const h=treadHeight(stairs,x,z);
        if(h!==null && (!Number.isFinite(referenceHeight) || referenceHeight>=h-.34) && (highest===null || h>highest))highest=h;
      }
      return highest;
    },
    get closingDoor() { return closingDoor; },
    get(id) { return rooms.get(id); },
    prepare(front) {
      const view = ensure(front);
      if (view) panes(view);
      return view;
    },
    setActive(view) {
      if (active === view) return;
      const pendingClose = active && (isClosed(active.plan.place) || tableData[(faceRows.get(active.plan.place.id)?.[0] || 0) * ROW_SIZE + 3] === 0);
      if (active) { active.group.userData.indoors.value = 0; active.group.name = 'Through the windows of ' + active.plan.name; }
      closingDoor = !view && pendingClose ? active : null;
      active = view;
      if (active) { active.group.userData.indoors.value = 1; active.group.name = 'Inside ' + active.plan.name; }
      if (!windowsVisible) floorRevision = -1;
    },
    /** Give the logos that have been fetched: a Map of chain key to { image, width, height, background }. Signs are drawn again. */
    setLogos(next) { logos = next || new Map(); for (let cell = 1; cell < cells; cell++) held[cell] = null; where.clear(); source = null; },
    /**
     * `fronts` is solveFrontages()'s answer for the places around `focus`;
     * pass the same array until it changes. `hours` is the time of day.
     */
    update(fronts = [], focus = { x: 0, z: 0 }, hours = 12, showWindows = true, revision = 0, closures = 0, walker = null) {
      if (closures !== closureRevision) { closureRevision=closures; openAt=-1; }
      if (closingDoor && (!showWindows || Math.hypot(focus.x-closingDoor.plan.x,focus.z-closingDoor.plan.z)>1.4)) {
        closingDoor = null; floorRevision = -1;
      }
      const moved = !at || Math.hypot(focus.x - at.x, focus.z - at.z) > 12;
      if (fronts !== source || moved) {
        source = fronts; at = { x: focus.x, z: focus.z };
        shown = fronts.map(front => ({ front, distance: Math.hypot(front.x - focus.x, front.z - focus.z) })).filter(entry => entry.distance < MAP_SPAN / 2 - 8)
          .sort((a, b) => a.distance - b.distance).slice(0, TABLE_ROWS - 1).map(entry => entry.front);
        // The map is laid on whole metres, so a texel is always the same square of ground.
        const originX = Math.round(focus.x) - MAP_SPAN / 2, originZ = Math.round(focus.z) - MAP_SPAN / 2;
        faces = [...shown]; faceRows = new Map();
        for (const front of shown) for (const { side, length } of front.returns || []) {
          if (faces.length >= TABLE_ROWS - 1) break;
          const half = Math.min(9, front.width) / 2;
          const skew = front.skew || 0, scale = Math.hypot(1,skew);
          const [x,z] = roomPoint(front,side * half,length / 2);
          faces.push({ ...front, x, z, side, width: length * scale,
            nx: side * (front.tx + skew * front.nx) / scale, nz: side * (front.tz + skew * front.nz) / scale,
            tx: (-front.nx + skew * front.tx) / scale, tz: (-front.nz + skew * front.tz) / scale });
        }
        faces.forEach((face, i) => {
          if (!faceRows.has(face.place.id)) faceRows.set(face.place.id, []);
          faceRows.get(face.place.id).push(i + 1);
        });
        rasterFronts(faces, originX, originZ, mapData, nearest);
        map.needsUpdate = true;
        shared.uNycPlaceRect.value.set(originX, originZ, 1 / MAP_SPAN, shown.length ? 1 : 0);
        // Lettering for the nearest: a place keeps its cell for as long as it is among them.
        const wanted = new Set(shown.slice(0, cells - 1).map(front => front.place.id));
        for (let cell = 1; cell < cells; cell++) if (held[cell] && !wanted.has(held[cell])) { where.delete(held[cell]); held[cell] = null; }
        let free = 1, drawn = false;
        tableData.fill(0); lettered = 0;
        faces.forEach((front, i) => {
          const logo = logos.get(brandKey(placeName(front.place))) || null;
          const identity = !logo && front.place.kind === 'bank' ? bankIdentity(front.place) : null;
          const wordmark = identity?.key === 'bank-of-america' || identity?.key === 'chase-bank';
          const sign = signFor(front.place, front.language || null), o = (i + 1) * ROW_SIZE, [br, bg, bb] = linear(logo ? logo.background : sign.background), [lr, lg, lb] = linear(sign.lettering);
          tableData[o] = br; tableData[o + 1] = bg; tableData[o + 2] = bb; tableData[o + 3] = 1;
          tableData[o + 4] = lr; tableData[o + 5] = lg; tableData[o + 6] = lb; tableData[o + 7] = { A: 1, B: 2, C: 3 }[front.place.grade] || 0;
          tableData[o + 16] = front.nx; tableData[o + 17] = front.nz;
          tableData[o + 12] = front.x; tableData[o + 13] = front.z; tableData[o + 14] = front.width / 2; tableData[o + 15] = (TRIM[front.place.kind] || 0) + (logo || wordmark ? LOGO_TRIM : 0);
          if (!wanted.has(front.place.id) || !context) return;
          let cell = where.get(front.place.id);
          if (cell === undefined) {
            while (free < cells && held[free]) free++;
            if (free >= cells) return;
            cell = free; held[cell] = front.place.id; where.set(front.place.id, cell);
            const { px, py } = rect(cell);
            if (logo) drawLogo(context, logo, px, py, ATLAS.cellWidth, ATLAS.cellHeight);
            else if (wordmark) drawBankName(context, identity, px, py, ATLAS.cellWidth, ATLAS.cellHeight, sign.background);
            else drawSign(context, sign, px, py, ATLAS.cellWidth, ATLAS.cellHeight);
            drawn = true;
          }
          const r = rect(cell);
          tableData[o + 8] = r.u; tableData[o + 9] = r.v; tableData[o + 10] = r.w; tableData[o + 11] = r.h; if (!front.side) lettered++;
        });
        if (drawn) atlas.needsUpdate = true;
        openAt = -1;
      }
      // Who is open changes with the hour; look again every quarter of one.
      const quarter = Math.floor(hours * 4);
      if (scene && (quarter !== openAt || windowsVisible !== showWindows || floorRevision !== revision)) {
        windowsVisible = showWindows; floorRevision = revision;
        updateRooms(focus, showWindows, hours, walker);
      }
      if (quarter !== openAt) {
        openAt = quarter;
        faces.forEach((front, i) => { tableData[(i + 1) * ROW_SIZE + 3] = isOpen(front.place.kind, hours) && !isClosed(front.place) ? 1 : 0; });
        table.needsUpdate = true;
      }
      // Build at most one new room per frame. Open its panes only once its
      // furniture is in the scene, including on the first frame after travel.
      if (pending.length) {
        const { front, plan } = pending.shift();
        panes(ensure(front, plan));
      }
      shared.uNycPlaceRect.value.w = rooms.size ? 2 : shown.length ? 1 : 0;
    },
    dispose() {
      for (const view of rooms.values()) release(view);
      for(const entry of entries.values())removeSteps(entry);
      entries.clear();
      rooms.clear(); pending = [];
      map.dispose(); table.dispose(); atlas.dispose();
      if (shared.uNycPlaceMap.value === map) { shared.uNycPlaceMap.value = null; shared.uNycPlaceTable.value = null; shared.uNycPlaceAtlas.value = null; shared.uNycPlaceRect.value.w = 0; }
    },
  };
  return state;
}
