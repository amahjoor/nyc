// The subway: where its entrances are, and riding it.
//
// Every station and street entrance is the MTA's own (scripts/build-transit.mjs).
// An entrance is drawn as the stair down from the sidewalk with its green
// railing and globe. Going down one puts the player on a train: a ride is to
// any station on a line that stops here, and comes up at one of its
// entrances. The tunnels, platforms and trains themselves are not modelled.
import * as THREE from './vendor/three.module.min.js';

/** The fare, in dollars. */
export const FARE = 2.9;
const CELL = 256;

/** The stations and their entrances, from transit.json. */
export function createSubway(data = null) {
  const stations = (data?.stations || []).map((station, index) => ({ ...station, index, lines: station.routes.split(' ') }));
  const grid = new Map();
  for (const station of stations) for (const [x, z, kind] of station.entrances) {
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({ x, z, kind, station });
  }
  return {
    stations,
    /** Entrances within `radius` of (x, z), nearest first: { x, z, kind, station }. */
    entrancesNear(x, z, radius = 200) {
      const found = [];
      for (let gx = Math.floor((x - radius) / CELL); gx <= Math.floor((x + radius) / CELL); gx++) for (let gz = Math.floor((z - radius) / CELL); gz <= Math.floor((z + radius) / CELL); gz++) {
        for (const entrance of grid.get(`${gx},${gz}`) || []) if (Math.hypot(entrance.x - x, entrance.z - z) <= radius) found.push(entrance);
      }
      return found.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    },
    /**
     * Where a train from `station` goes: every other station that shares a
     * line with it, nearest first, as { station, lines, distance }.
     */
    ridesFrom(station) {
      const rides = [];
      for (const other of stations) {
        if (other === station) continue;
        const lines = other.lines.filter(line => station.lines.includes(line));
        if (lines.length) rides.push({ station: other, lines, distance: Math.hypot(other.x - station.x, other.z - station.z) });
      }
      return rides.sort((a, b) => a.distance - b.distance);
    },
    /** Where the player comes up at a station: beside its first stair, or failing that any entrance. */
    exitOf(station) { const [x, z] = station.entrances.find(entrance => entrance[2] === 0) || station.entrances[0]; return { x, z }; },
  };
}

/**
 * Draw the stair entrances around the player. `subway` is createSubway();
 * `facing(x, z)` gives the direction [x, z] the stair should run in, along
 * the kerb it stands beside, or null.
 */
export function createSubwayEntrances({ scene = null, heightAt = () => 0, facing = () => null, range = 220, capacity = 96 } = {}) {
  const group = new THREE.Group(); group.name = 'Subway entrances'; scene?.add(group);
  // One entrance: the well of the stair, a railing round three sides, and a post with a green globe at its open end.
  const parts = [], add = (w, h, d, x, y, z, tone) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y, z); parts.push([g, tone]); };
  const GREEN = [.03, .2, .11], DARK = [.02, .02, .022];
  add(1.5, .04, 4.2, 0, .03, 0, DARK);
  for (let i = 0; i < 6; i++) add(1.5, .05, .5, 0, -.05 - i * .16, -1.6 + i * .55, [.09 - i * .012, .09 - i * .012, .09 - i * .012]);
  add(.06, 1.0, 4.3, -.78, .5, 0, GREEN); add(.06, 1.0, 4.3, .78, .5, 0, GREEN); add(1.6, 1.0, .06, 0, .5, 2.15, GREEN);
  add(.08, 2.6, .08, -.78, 1.3, -2.15, GREEN); add(.08, 2.6, .08, .78, 1.3, -2.15, GREEN);
  add(1.7, .32, .06, 0, 2.3, -2.15, DARK);
  const position = [], normal = [], color = [];
  for (const [g, tone] of parts) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { position.push(p.getX(i), p.getY(i), p.getZ(i)); normal.push(n.getX(i), n.getY(i), n.getZ(i)); color.push(...tone); } g.dispose(); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .3 }); paint.name = 'Subway entrance';
  const stairs = new THREE.InstancedMesh(geometry, paint, capacity); stairs.name = 'Subway stairs'; stairs.count = 0; stairs.frustumCulled = false; stairs.castShadow = true;
  const globe = new THREE.SphereGeometry(.17, 10, 8); globe.translate(0, 2.72, -2.15);
  const glow = new THREE.MeshBasicMaterial({ color: 0x35d06a, toneMapped: false }); glow.name = 'Subway globe';
  const globes = new THREE.InstancedMesh(globe, glow, capacity * 2); globes.name = 'Subway globes'; globes.count = 0; globes.frustumCulled = false;
  group.add(stairs, globes);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), offset = new THREE.Vector3();
  let at = null, shown = [];
  return {
    group,
    /** The entrances drawn, as { x, z, station }. */
    get entrances() { return shown; },
    update(subway, focus) {
      if (!subway || (at && at.subway === subway && Math.hypot(focus.x - at.x, focus.z - at.z) < 40)) return false;
      at = { subway, x: focus.x, z: focus.z };
      shown = subway.entrancesNear(focus.x, focus.z, range).filter(entrance => entrance.kind === 0).slice(0, capacity);
      shown.forEach((entrance, i) => {
        const way = facing(entrance.x, entrance.z), angle = way ? Math.atan2(way[0], way[1]) : 0;
        place.set(entrance.x, heightAt(entrance.x, entrance.z), entrance.z); turn.setFromAxisAngle(up, angle); matrix.compose(place, turn, one); stairs.setMatrixAt(i, matrix);
        for (const side of [-1, 1]) { offset.set(side * .78, 0, 0).applyQuaternion(turn); matrix.compose(place.clone().add(offset), turn, one); globes.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), matrix); }
      });
      stairs.count = shown.length; globes.count = shown.length * 2; stairs.instanceMatrix.needsUpdate = globes.instanceMatrix.needsUpdate = true;
      return true;
    },
    dispose() { geometry.dispose(); globe.dispose(); paint.dispose(); glow.dispose(); stairs.dispose(); globes.dispose(); group.removeFromParent(); },
  };
}
