// Bus stop poles, curb placement and route labels. Scheduled boarding uses transit-network.js.
import * as THREE from './vendor/three.module.min.js';

const CELL = 256;

/** The stops, from bus-stops.json. */
export function createBuses(data = null) {
  const stops = (data?.stops || []).map(([x, z, name, routes, networkIndex]) => ({ x, z, name, routes, networkIndex, lines: routes.split(' ').filter(Boolean) }));
  const grid = new Map(), byLine = new Map();
  for (const stop of stops) {
    const key = `${Math.floor(stop.x / CELL)},${Math.floor(stop.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(stop);
    for (const line of stop.lines) { if (!byLine.has(line)) byLine.set(line, []); byLine.get(line).push(stop); }
  }
  let parkingCache;
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
    /** Reserve one bus length at the boarding kerb, including clearance for a parked car's nose. */
    availableParking(spaces, kerbs, snap) {
      if (parkingCache?.spaces === spaces && parkingCache.kerbs === kerbs) return parkingCache.available;
      const snapped = new Map();
      const available = spaces.filter(space => {
        for (const stop of this.stopsNear(space.x, space.z, 30)) {
          if (!snapped.has(stop)) snapped.set(stop, snap(stop.x, stop.z));
          const curb = snapped.get(stop);
          if (!curb) continue;
          const dx = space.x - curb.x, dz = space.z - curb.z;
          const across = dx * curb.nx + dz * curb.nz;
          if (across < 0 || across > 3.1 || Math.abs(dx * curb.tx + dz * curb.tz) > 10.5) continue;
          if (Math.abs(Math.sin(space.angle) * curb.tx + Math.cos(space.angle) * curb.tz) > .8) return false;
        }
        return true;
      });
      parkingCache = { spaces, kerbs, available };
      return available;
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

// Each stop gets a tile on the shared sign texture. Both plate faces read the same tile.
const TILE_W = 160, TILE_H = 320;
function paintBusPlate(ctx, lines) {
  const blue = '#134880', white = '#f7f8f4';
  ctx.fillStyle = white; ctx.beginPath(); ctx.arc(80, 80, 76, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = blue; ctx.beginPath(); ctx.arc(80, 80, 70, 0, Math.PI * 2); ctx.fill();
  // Front elevation of a bus, with destination strip, windshield, lamps and wheels.
  const box = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
  ctx.fillStyle = white; box(43, 32, 74, 86, 10); box(47, 108, 13, 18, 4); box(100, 108, 13, 18, 4);
  ctx.fillStyle = blue; box(61, 39, 38, 6, 2); box(50, 52, 60, 39, 5);
  box(50, 100, 10, 6, 3); box(100, 100, 10, 6, 3);
  // The red band is part of the bus-stop marker and reads from both approaches.
  ctx.fillStyle = '#ad202a'; box(9, 125, 142, 29, 3);
  ctx.fillStyle = white; ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('NO STANDING', 80, 140, 134);
  ctx.fillStyle = blue; box(9, 159, 142, 157, 6);
  ctx.fillStyle = white; box(13, 163, 134, 149, 4);
  const cols = lines.length > 6 ? 2 : 1, rows = Math.max(1, Math.ceil(lines.length / cols));
  const rowHeight = Math.min(52, 143 / rows), colWidth = 130 / cols;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold ' + Math.min(42, Math.floor(rowHeight * .87)) + 'px Arial, sans-serif';
  for (let i = 0; i < lines.length; i++) {
    const col = Math.floor(i / rows), row = i % rows;
    const y = 237.5 + (row + .5 - rows / 2) * rowHeight;
    ctx.fillStyle = '#11263e';
    ctx.fillText(lines[i], 15 + (col + .5) * colWidth, y, colWidth - 5);
  }
}

/**
 * Draw the stops around the player. `kerb(x, z)` gives the kerb a stop stands
 * at as { x, z, nx, nz, tx, tz }, or null where there is none in reach.
 */
export function createBusStops({ scene = null, heightAt = () => 0, kerb = () => null, range = 200, capacity = 64, createCanvas = () => document.createElement('canvas') } = {}) {
  const group = new THREE.Group(); group.name = 'Bus stops'; scene?.add(group);
  const pole = new THREE.CylinderGeometry(.03, .03, 2.9, 6); pole.translate(0, 1.45, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x7d8286, roughness: .5, metalness: .7 }); steel.name = 'Bus stop pole';
  const poles = new THREE.InstancedMesh(pole, steel, capacity); poles.name = 'Bus stop poles'; poles.count = 0; poles.frustumCulled = false; poles.castShadow = true;
  const cols = Math.max(1, Math.ceil(Math.sqrt(capacity))), rows = Math.max(1, Math.ceil(capacity / cols));
  const canvas = createCanvas(); canvas.width = cols * TILE_W; canvas.height = rows * TILE_H;
  const ctx = canvas.getContext('2d'), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const sign = new THREE.BufferGeometry(), positions = [], normals = [], uvs = [];
  for (const side of [1, -1]) {
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
      positions.push((u - .5) * .54 * side, 1.91 + v * 1.08, side * .035);
      normals.push(0, 0, side); uvs.push(u, v);
    }
  }
  sign.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sign.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  sign.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const tiles = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
  for (let i = 0; i < capacity; i++) tiles.setXY(i, i % cols, rows - 1 - Math.floor(i / cols));
  sign.setAttribute('aTile', tiles);
  const enamel = new THREE.MeshStandardMaterial({ map: texture, alphaTest: .45, roughness: .5 });
  enamel.name = 'Bus stop sign';
  enamel.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec2 aTile;\n' + shader.vertexShader.replace('#include <uv_vertex>',
      `#include <uv_vertex>\nvMapUv = (aTile + vMapUv) / vec2(${cols}.0, ${rows}.0);`);
  };
  enamel.customProgramCacheKey = () => 'bus-sign-' + cols + '-' + rows;
  const painted = [];
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
        const slot = shown.length;
        if (painted[slot] !== stop.routes) {
          ctx.save(); ctx.translate(slot % cols * TILE_W, Math.floor(slot / cols) * TILE_H);
          ctx.clearRect(0, 0, TILE_W, TILE_H); paintBusPlate(ctx, stop.lines); ctx.restore();
          painted[slot] = stop.routes; texture.needsUpdate = true;
        }
        poles.setMatrixAt(shown.length, matrix); signs.setMatrixAt(shown.length, matrix); shown.push({ x, z, stop });
      }
      poles.count = signs.count = shown.length; poles.instanceMatrix.needsUpdate = signs.instanceMatrix.needsUpdate = true;
      return true;
    },
    dispose() { texture.dispose(); pole.dispose(); sign.dispose(); steel.dispose(); enamel.dispose(); poles.dispose(); signs.dispose(); group.removeFromParent(); },
  };
}
