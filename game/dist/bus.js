// The buses: where they stop, and riding one.
//
// Every stop and the routes that call there are the MTA's own
// (scripts/build-transit.mjs). A stop is drawn as its pole and round blue
// sign at the kerb. Waiting at one, a ride is to any other stop a route from
// here also calls at. The list does not say in what order a route makes its
// stops, so there is no telling which way a bus is going: either way is
// offered. The buses themselves are not modelled.
import * as THREE from './vendor/three.module.min.js';

const CELL = 256;

/** The stops, from bus-stops.json. */
export function createBuses(data = null) {
  const stops = (data?.stops || []).map(([x, z, name, routes]) => ({ x, z, name, routes, lines: routes.split(' ').filter(Boolean) }));
  const grid = new Map(), byLine = new Map();
  for (const stop of stops) {
    const key = `${Math.floor(stop.x / CELL)},${Math.floor(stop.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(stop);
    for (const line of stop.lines) { if (!byLine.has(line)) byLine.set(line, []); byLine.get(line).push(stop); }
  }
  return {
    stops,
    /** Stops within `radius` of (x, z), nearest first. */
    stopsNear(x, z, radius = 200) {
      const found = [];
      for (let gx = Math.floor((x - radius) / CELL); gx <= Math.floor((x + radius) / CELL); gx++) for (let gz = Math.floor((z - radius) / CELL); gz <= Math.floor((z + radius) / CELL); gz++) {
        for (const stop of grid.get(`${gx},${gz}`) || []) if (Math.hypot(stop.x - x, stop.z - z) <= radius) found.push(stop);
      }
      return found.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    },
    /**
     * Where a bus from `stop` goes: the other stops its routes call at, nearest
     * first, as { stop, lines, distance }. The stop across the street, and any
     * other within `least` metres, is not a ride.
     */
    ridesFrom(stop, least = 150) {
      const rides = new Map();
      for (const line of stop.lines) for (const other of byLine.get(line) || []) {
        if (other === stop) continue;
        const distance = Math.hypot(other.x - stop.x, other.z - stop.z);
        if (distance < least) continue;
        if (!rides.has(other)) rides.set(other, { stop: other, lines: [], distance });
        rides.get(other).lines.push(line);
      }
      return [...rides.values()].sort((a, b) => a.distance - b.distance);
    },
  };
}

/**
 * Draw the stops around the player. `kerb(x, z)` gives the kerb a stop stands
 * at as { x, z, nx, nz, tx, tz }, or null where there is none in reach.
 */
export function createBusStops({ scene = null, heightAt = () => 0, kerb = () => null, range = 200, capacity = 64 } = {}) {
  const group = new THREE.Group(); group.name = 'Bus stops'; scene?.add(group);
  const pole = new THREE.CylinderGeometry(.03, .03, 2.9, 6); pole.translate(0, 1.45, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x7d8286, roughness: .5, metalness: .7 }); steel.name = 'Bus stop pole';
  const poles = new THREE.InstancedMesh(pole, steel, capacity); poles.name = 'Bus stop poles'; poles.count = 0; poles.frustumCulled = false; poles.castShadow = true;
  // The sign: a blue disc with a white bus on it, over a panel that lists the routes; read from either side.
  const disc = new THREE.CylinderGeometry(.26, .26, .03, 20).toNonIndexed(); disc.rotateX(Math.PI / 2); disc.translate(0, 2.72, 0);
  const panel = new THREE.BoxGeometry(.4, .62, .025).toNonIndexed(); panel.translate(0, 2.1, 0);
  const parts = [[disc, [.03, .2, .55]], [panel, [.03, .2, .55]]];
  for (const z of [-.02, .02]) {
    const bus = new THREE.BoxGeometry(.26, .16, .004).toNonIndexed(); bus.translate(0, 2.73, z); parts.push([bus, [.92, .93, .94]]);
    for (let i = 0; i < 3; i++) { const row = new THREE.BoxGeometry(.3, .09, .004).toNonIndexed(); row.translate(0, 2.3 - i * .16, z * .8); parts.push([row, i === 0 ? [.92, .93, .94] : [.75, .8, .88]]); }
  }
  const position = [], normal = [], color = [];
  for (const [g, tone] of parts) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { position.push(p.getX(i), p.getY(i), p.getZ(i)); normal.push(n.getX(i), n.getY(i), n.getZ(i)); color.push(...tone); } g.dispose(); }
  const sign = new THREE.BufferGeometry();
  sign.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); sign.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3)); sign.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  const enamel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .1 }); enamel.name = 'Bus stop sign';
  const signs = new THREE.InstancedMesh(sign, enamel, capacity); signs.name = 'Bus stop signs'; signs.count = 0; signs.frustumCulled = false;
  group.add(poles, signs);
  const matrix = new THREE.Matrix4(), place = new THREE.Vector3(), turn = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  let at = null, shown = [];
  return {
    group,
    /** The stops drawn, as { x, z, stop }: where each pole stands and which stop it is. */
    get stops() { return shown; },
    update(buses, focus, kerbs = null) {
      if (!buses || (at && at.buses === buses && at.kerbs === kerbs && Math.hypot(focus.x - at.x, focus.z - at.z) < 40)) return false;
      at = { buses, kerbs, x: focus.x, z: focus.z }; shown = [];
      for (const stop of buses.stopsNear(focus.x, focus.z, range)) {
        if (shown.length >= capacity) break;
        // Half a metre in from the kerb, the sign across the sidewalk so it is read walking along it.
        const edge = kerb(stop.x, stop.z), x = edge ? edge.x - edge.nx * .55 : stop.x, z = edge ? edge.z - edge.nz * .55 : stop.z;
        place.set(x, heightAt(x, z), z); turn.setFromAxisAngle(up, edge ? Math.atan2(edge.tx, edge.tz) : 0); matrix.compose(place, turn, one);
        poles.setMatrixAt(shown.length, matrix); signs.setMatrixAt(shown.length, matrix); shown.push({ x, z, stop });
      }
      poles.count = signs.count = shown.length; poles.instanceMatrix.needsUpdate = signs.instanceMatrix.needsUpdate = true;
      return true;
    },
    dispose() { pole.dispose(); sign.dispose(); steel.dispose(); enamel.dispose(); poles.dispose(); signs.dispose(); group.removeFromParent(); },
  };
}
