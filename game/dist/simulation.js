import { resetVehicleDynamics, stepVehicleDynamics, stopVehicleRotation, vehicleTravelSpeed } from './vehicle-dynamics.js';

// Simulation units are metres and seconds. A heading of zero points along +Z.
// This module deliberately has no renderer or browser dependencies.
const TAU = Math.PI * 2;
const FIXED_STEP = 1 / 120;
const PLAYER_RADIUS = 0.4;
const CAR_RADIUS = 0.92;
const CAR_HALF_AXLE = 1.12;
const GRID_SIZE = 24;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const turnDelta = (from, to) => ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
const emptyMission = () => ({ phase: 'idle', target: null, timeLeft: 0, totalTime: 0, reward: 0 });
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const playerTravelSpeed = player => player.mode === 'drive' ? Math.hypot(player.velocityX, player.velocityZ) : Math.abs(player.speed);

function buildingGrid(buildings) {
  const grid = new Map();
  for (const building of buildings || []) {
    if (!building.polygon || building.polygon.length < 3) continue;
    const xs = building.polygon.map(point => point[0]);
    const zs = building.polygon.map(point => point[1]);
    for (let gx = Math.floor(Math.min(...xs) / GRID_SIZE); gx <= Math.floor(Math.max(...xs) / GRID_SIZE); gx++) {
      for (let gz = Math.floor(Math.min(...zs) / GRID_SIZE); gz <= Math.floor(Math.max(...zs) / GRID_SIZE); gz++) {
        const key = `${gx},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(building);
      }
    }
  }
  return grid;
}

function validBounds(bounds) {
  return bounds && ['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(bounds[key])) && bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ;
}

function closestOnSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq ? clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1) : 0;
  return { x: ax + dx * t, z: az + dz * t, t };
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, az] = polygon[i];
    const [bx, bz] = polygon[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

function circlePolygonContact(x, z, radius, polygon, holes = []) {
  let nearest;
  let minimum = Infinity;
  // Survey ground surfaces include open courtyards. Their inner boundaries are
  // solid walls, but their interiors must stay walkable regardless of winding.
  const inSolid = (px, pz) => pointInPolygon(px, pz, polygon) && !holes.some(hole => pointInPolygon(px, pz, hole));
  for (const ring of [polygon, ...holes]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, az] = ring[j];
      const [bx, bz] = ring[i];
      const point = closestOnSegment(x, z, ax, az, bx, bz);
      const d = Math.hypot(x - point.x, z - point.z);
      if (d < minimum) {
        minimum = d;
        nearest = { ...point, ax, az, bx, bz };
      }
    }
  }
  if (!nearest) return null;
  const inside = inSolid(x, z);
  if (!inside && minimum >= radius) return null;
  if (minimum > 0.000001) {
    const sign = inside ? -1 : 1;
    return { nx: sign * (x - nearest.x) / minimum, nz: sign * (z - nearest.z) / minimum, depth: inside ? radius + minimum : radius - minimum };
  }
  // A point exactly on an edge has no separation vector. Probe the edge normal
  // to pick its exterior, independent of clockwise/counterclockwise OSM rings.
  const length = Math.hypot(nearest.bx - nearest.ax, nearest.bz - nearest.az) || 1;
  let nx = (nearest.bz - nearest.az) / length;
  let nz = -(nearest.bx - nearest.ax) / length;
  if (inSolid(x + nx * 0.01, z + nz * 0.01)) { nx = -nx; nz = -nz; }
  return { nx, nz, depth: radius };
}

function segmentIntersection(a, b) {
  const rx = a.bx - a.ax, rz = a.bz - a.az;
  const sx = b.bx - b.ax, sz = b.bz - b.az;
  const cross = rx * sz - rz * sx;
  if (Math.abs(cross) < 0.00001) return null;
  const qx = b.ax - a.ax, qz = b.az - a.az;
  const t = (qx * sz - qz * sx) / cross;
  const u = (qx * rz - qz * rx) / cross;
  return t >= -0.00001 && t <= 1.00001 && u >= -0.00001 && u <= 1.00001 ? { t: clamp(t, 0, 1), u: clamp(u, 0, 1) } : null;
}

/** Build directed edges at shared OSM nodes and geometric street crossings. */
function buildRoadGraph(roads) {
  const segments = [];
  for (const road of roads) {
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
      if (Math.hypot(bx - ax, bz - az) < 0.5) continue;
      segments.push({ ax, az, bx, bz, road, cuts: [0, 1] });
    }
  }
  // Most streets already share vertices. The grid also joins crossings in
  // simplified map extracts without a quadratic whole-city intersection pass.
  const buckets = new Map();
  const pairs = new Set();
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    for (let gx = Math.floor(Math.min(segment.ax, segment.bx) / 64); gx <= Math.floor(Math.max(segment.ax, segment.bx) / 64); gx++) {
      for (let gz = Math.floor(Math.min(segment.az, segment.bz) / 64); gz <= Math.floor(Math.max(segment.az, segment.bz) / 64); gz++) {
        const key = `${gx},${gz}`;
        const others = buckets.get(key) || [];
        for (const otherIndex of others) {
          const pair = `${otherIndex}:${index}`;
          if (pairs.has(pair)) continue;
          pairs.add(pair);
          const intersection = segmentIntersection(segment, segments[otherIndex]);
          if (intersection) {
            segment.cuts.push(intersection.t);
            segments[otherIndex].cuts.push(intersection.u);
          }
        }
        others.push(index);
        buckets.set(key, others);
      }
    }
  }
  const nodes = [];
  const nodeKeys = new Map();
  const nodeAt = (x, z) => {
    const key = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    if (!nodeKeys.has(key)) {
      nodeKeys.set(key, nodes.length);
      nodes.push({ id: nodes.length, x, z, edges: [] });
    }
    return nodes[nodeKeys.get(key)];
  };
  const edges = [];
  const addEdge = (from, to, road) => {
    const length = distance(from, to);
    if (from === to || length < 0.4) return;
    const edge = { id: edges.length, from, to, road, length, angle: Math.atan2(to.x - from.x, to.z - from.z) };
    edge.lane = clamp(finite(road.width, 10) * 0.19, 0.65, 2.5);
    edges.push(edge);
    from.edges.push(edge);
  };
  for (const segment of segments) {
    const cuts = [...new Set(segment.cuts.map(cut => Math.round(cut * 100000) / 100000))].sort((a, b) => a - b);
    const oneWay = segment.road.oneway;
    for (let i = 1; i < cuts.length; i++) {
      const a = nodeAt(segment.ax + (segment.bx - segment.ax) * cuts[i - 1], segment.az + (segment.bz - segment.az) * cuts[i - 1]);
      const b = nodeAt(segment.ax + (segment.bx - segment.ax) * cuts[i], segment.az + (segment.bz - segment.az) * cuts[i]);
      if (oneWay !== '-1' && oneWay !== -1) addEdge(a, b, segment.road);
      if (oneWay !== true && oneWay !== 'yes' && oneWay !== '1' && oneWay !== 1) addEdge(b, a, segment.road);
    }
  }
  return { nodes, edges };
}

export class Simulation {
  constructor(city) {
    this.city = city;
    this.bounds = city.bounds;
    this.loadedBounds = city.loadedBounds || null;
    this._isReadyAt = typeof city.isReadyAt === 'function' ? city.isReadyAt : null;
    this._sampleSurface = typeof city.sampleSurface === 'function' ? city.sampleSurface : null;
    this._landscapeContact = typeof city.landscapeContact === 'function' ? city.landscapeContact : null;
    this._rngState = 0x51f05a;
    this._buildings = buildingGrid(city.buildings);
    this._graph = buildRoadGraph(city.roads || []);
    this.player = { x: city.spawn.x, z: city.spawn.z, angle: city.spawn.angle || 0, speed: 0, mode: 'walk', vehicleId: null, velocityX: 0, velocityZ: 0 };
    this.cars = [];
    this.heat = 0;
    this.health = 100;
    this.cash = 0;
    this.deliveries = 0;
    this.mission = emptyMission();
    this.notice = 'Welcome to SoHo. Walk to the yellow cab and press E.';
    this.noticeTime = 8;
    this.distanceTravelled = 0;
    this.elapsed = 0;
    this._accumulator = 0;
    this._impactCooldown = 0;
    this._timeSinceCrime = 100;
    this._policeRouteTimer = 0;
    this._lastTarget = null;
    this._bustedTime = 0;
    this._lastBoundaryNotice = -Infinity;
    this._seedCars();
    const safeSpawn = this._findSafePoint(city.spawn.x, city.spawn.z, PLAYER_RADIUS);
    this.player.x = safeSpawn.x;
    this.player.z = safeSpawn.z;
    this.updateGrounding();
  }

  /** Replace loaded map data without resetting a trip, job, or saved progress. */
  setActiveCity(city = {}, { spawn } = {}) {
    if (city.bounds !== undefined && !validBounds(city.bounds)) throw new Error('Invalid city bounds.');
    if (city.loadedBounds != null && !validBounds(city.loadedBounds)) throw new Error('Invalid loaded city bounds.');
    if (spawn && (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.z))) throw new Error('Travel requires finite map coordinates.');
    // Build replacements first. Traffic edges reference graph objects, so an
    // old graph must never survive through a car after its roads are unloaded.
    const graph = city.roads === undefined ? this._graph : buildRoadGraph(city.roads || []);
    const buildings = city.buildings === undefined ? this._buildings : buildingGrid(city.buildings);
    this.city = { ...this.city, ...city };
    this.bounds = this.city.bounds;
    this.loadedBounds = this.city.loadedBounds || null;
    this._isReadyAt = typeof this.city.isReadyAt === 'function' ? this.city.isReadyAt : null;
    this._sampleSurface = typeof this.city.sampleSurface === 'function' ? this.city.sampleSurface : null;
    this._landscapeContact = typeof this.city.landscapeContact === 'function' ? this.city.landscapeContact : null;
    this._buildings = buildings;
    const roadsChanged = graph !== this._graph;
    this._graph = graph;
    if (spawn) this.travelTo(spawn);
    else if (roadsChanged) this._rebindTraffic();
    this.updateGrounding();
    return { player: { x: this.player.x, z: this.player.z }, cars: this.cars.length, loadedBounds: this.loadedBounds };
  }

  _rebindTraffic() {
    for (const car of this.cars) {
      const wasTraffic = !car.parked || car._streamParked;
      car._route = [];
      car._edge = null;
      if (car.controlled || !wasTraffic) continue;
      let nearest = null;
      for (const edge of this._graph.edges) {
        // Opposite directions can share their centerline. Match heading as
        // well as distance so streaming never reverses a legal one-way route.
        const angle = Math.abs(turnDelta(car.angle, edge.angle));
        if (angle > Math.PI * 0.6) continue;
        const point = closestOnSegment(car.x, car.z, edge.from.x, edge.from.z, edge.to.x, edge.to.z);
        const gap = Math.hypot(car.x - point.x, car.z - point.z);
        const score = gap + angle * 3;
        if (gap < Math.max(12, finite(edge.road.width, 10)) && (!nearest || score < nearest.score)) nearest = { edge, score };
      }
      car._edge = nearest?.edge || null;
      if (!car._edge && this._recycleTraffic(car)) car._streamParked = false;
      else car._streamParked = !car._edge;
      car.parked = car._streamParked;
      if (car.parked) resetVehicleDynamics(car);
    }
    this._policeRouteTimer = 0;
  }

  _travelSpawn(spawn) {
    if (!Number.isFinite(spawn?.x) || !Number.isFinite(spawn?.z)) throw new Error('Travel requires finite map coordinates.');
    if (spawn.exact) {
      if (!this._mappedLand(spawn.x, spawn.z, PLAYER_RADIUS)) throw new Error('Choose dry land inside New York City. This pin is outside the mapped shoreline.');
      // Pin travel starts on the ground, without a selected deck elevation.
      // A road corridor crossing water therefore cannot make the water a safe
      // spawn, even though that corridor remains traversable during driving.
      if (this._landscapeContact?.(spawn.x, spawn.z, PLAYER_RADIUS)?.kind === 'water') throw new Error('This pin is in water. Choose clear, dry ground.');
      if (this.isBlocked(spawn.x, spawn.z, PLAYER_RADIUS)) throw new Error('This pin is blocked or has not finished loading. Choose clear ground or try again when the city is ready.');
      return { x: spawn.x, z: spawn.z, angle: finite(spawn.angle), name: spawn.name, exact: true };
    }
    const candidates = [];
    for (const edge of this._graph.edges) {
      const point = closestOnSegment(spawn.x, spawn.z, edge.from.x, edge.from.z, edge.to.x, edge.to.z);
      if (distance(point, spawn) > 250) continue;
      for (const offset of [0, 8, -8, 20, -20]) {
        const lane = this._lanePoint(edge, clamp(point.t + offset / edge.length, 0.08, 0.92));
        candidates.push({ ...lane, angle: edge.angle, gap: distance(lane, spawn) });
      }
    }
    candidates.sort((a, b) => a.gap - b.gap);
    // With no road extract (older callers/tests), retain a clear requested
    // position. Citywide callers preload roads and surveyed collision first.
    if (!this._graph.edges.length) candidates.push({ x: spawn.x, z: spawn.z, angle: finite(spawn.angle), gap: 0 });
    for (const candidate of candidates) {
      if (this.isBlocked(candidate.x, candidate.z, PLAYER_RADIUS)) continue;
      for (const offset of [3.8, -3.8]) {
        const taxi = { x: candidate.x + Math.sin(candidate.angle) * offset, z: candidate.z + Math.cos(candidate.angle) * offset };
        if (!this._carContact(taxi.x, taxi.z, candidate.angle)) return { x: candidate.x, z: candidate.z, angle: candidate.angle, name: spawn.name };
      }
    }
    throw new Error('This destination has no loaded, clear street. Choose a nearby street or wait for the city to load.');
  }

  /** Call after destination collision/roads are loaded; active jobs survive. */
  travelTo(spawn) {
    const target = this._travelSpawn(spawn);
    this.city = { ...this.city, spawn: target };
    this.cars = [];
    Object.assign(this.player, { x: target.x, z: target.z, y: undefined, transportId: null, angle: target.angle, speed: 0, mode: 'walk', vehicleId: null, velocityX: 0, velocityZ: 0 });
    this._seedCars();
    const safe = target.exact ? target : this._findSafePoint(target.x, target.z, PLAYER_RADIUS);
    Object.assign(this.player, { x: safe.x, z: safe.z });
    this.updateGrounding();
    this._accumulator = 0;
    this._policeRouteTimer = 0;
    this._bustedTime = 0;
    const arrival = target.exact ? this.cars.some(car => car.id === 'player-taxi')
      ? 'A cab is waiting on a nearby street.' : 'Explore on foot.' : 'Your cab is nearby.';
    this._say(`Arrived${target.name ? ` at ${target.name}` : ''}. ${arrival}`);
    return { x: this.player.x, z: this.player.z, angle: this.player.angle };
  }

  _random() {
    this._rngState = (Math.imul(this._rngState, 1664525) + 1013904223) >>> 0;
    return this._rngState / 4294967296;
  }

  _contact(x, z, radius, ignoreWater = false) {
    let contact = null;
    const keep = hit => { if (hit && (!contact || hit.depth > contact.depth)) contact = hit; };
    const bounds = this.bounds;
    if (x - radius < bounds.minX) keep({ nx: 1, nz: 0, depth: bounds.minX - x + radius, kind: 'boundary' });
    if (x + radius > bounds.maxX) keep({ nx: -1, nz: 0, depth: x + radius - bounds.maxX, kind: 'boundary' });
    if (z - radius < bounds.minZ) keep({ nx: 0, nz: 1, depth: bounds.minZ - z + radius, kind: 'boundary' });
    if (z + radius > bounds.maxZ) keep({ nx: 0, nz: -1, depth: z + radius - bounds.maxZ, kind: 'boundary' });
    const loaded = this.loadedBounds;
    if (loaded) {
      if (x - radius < loaded.minX) keep({ nx: 1, nz: 0, depth: loaded.minX - x + radius, kind: 'loading' });
      if (x + radius > loaded.maxX) keep({ nx: -1, nz: 0, depth: x + radius - loaded.maxX, kind: 'loading' });
      if (z - radius < loaded.minZ) keep({ nx: 0, nz: 1, depth: loaded.minZ - z + radius, kind: 'loading' });
      if (z + radius > loaded.maxZ) keep({ nx: 0, nz: -1, depth: z + radius - loaded.maxZ, kind: 'loading' });
    }
    if (this._isReadyAt && !this._isReadyAt(x, z, radius)) keep({ nx: 0, nz: 0, depth: radius, kind: 'loading' });
    const landscape = this._landscapeContact?.(x, z, radius);
    if (landscape && !(ignoreWater && landscape.kind === 'water')) {
      // The measured road network can cross a mapped water polygon on a
      // bridge. Preserve that existing route until a surveyed deck is loaded;
      // water remains impassable away from a mapped road corridor.
      const road = landscape.kind === 'water' ? this._nearestEdge(x, z) : null;
      if (!road || road.distance > Math.max(1, finite(road.edge.road.width, 8) / 2 - radius)) keep(landscape);
    }
    const checked = new Set();
    for (let gx = Math.floor((x - radius) / GRID_SIZE); gx <= Math.floor((x + radius) / GRID_SIZE); gx++) {
      for (let gz = Math.floor((z - radius) / GRID_SIZE); gz <= Math.floor((z + radius) / GRID_SIZE); gz++) {
        for (const building of this._buildings.get(`${gx},${gz}`) || []) {
          if (checked.has(building)) continue;
          checked.add(building);
          keep(circlePolygonContact(x, z, radius, building.polygon, building.holes));
        }
      }
    }
    return contact;
  }

  /** Static map collision query for cameras and pedestrian placement. */
  isBlocked(x, z, radius = 0.5, { ignoreWater = false } = {}) {
    // A camera above the surface can look across a pond. Actors still use
    // shoreline collision; water must not become an infinitely tall wall.
    return Boolean(this._contact(x, z, Math.max(0.01, radius), ignoreWater));
  }

  groundHeight(x, z) {
    return finite(this._sampleSurface?.(x, z)?.elevation);
  }

  updateGrounding() {
    // Reuse the same sampled surface as the renderer. Four wheel contact
    // points establish the support plane while suspension remains visual.
    for (const car of this.cars) {
      const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
      // A new or teleported actor has no previous level. Its first sample is
      // ground-only; carrying an old Y could capture an unrelated overpass.
      const options = Number.isFinite(car.y) ? { referenceHeight: car.y, mode: 'drive', transportId: car.transportId } : undefined;
      const center = this._sampleSurface?.(car.x, car.z, options);
      const wheelOptions = center?.transportId ? { referenceHeight: center.elevation, mode: 'drive', transportId: center.transportId } : undefined;
      const supported = [];
      const height = (side, along) => {
        const x = car.x + cos * side + sin * along, z = car.z - sin * side + cos * along;
        // Pick one level for the entire axle assembly. Independent wheel
        // capture previously combined a bridge's left side with the lower
        // road on its right side, producing abrupt 40+ degree body rotations.
        const sample = this._sampleSurface?.(x, z, wheelOptions);
        const sameLevel = !center?.transportId || sample?.transportId === center.transportId;
        supported.push(Boolean(sameLevel && Number.isFinite(sample?.elevation)));
        if (!sameLevel) {
          // A wheel just beyond a deck edge is unsupported, not resting on
          // the road far below. Retain the chassis support plane under its
          // center instead of averaging two separate road levels together.
          const normal = center.normal;
          if (normal && [normal.x, normal.y, normal.z].every(Number.isFinite) && normal.y > .1) {
            return center.elevation - (normal.x * (x - car.x) + normal.z * (z - car.z)) / normal.y;
          }
          return center.elevation;
        }
        return finite(sample?.elevation);
      };
      const rl = height(-.90, -1.37), fl = height(-.90, 1.30), rr = height(.90, -1.37), fr = height(.90, 1.30);
      car.wheelHeights = [rl, fl, rr, fr];car.wheelSupported = supported;
      car.supportSurface = center || null;car.transportId = center?.transportId || null;
      car.y = (fl + fr + rl + rr) / 4;
      car.pitch = -Math.atan2((fl + fr - rl - rr) / 2, 2.67);
      car.roll = Math.atan2((fr + rr - fl - rl) / 2, 1.80);
    }
    const vehicle = this.player.mode === 'drive' && this.cars.find(car => car.id === this.player.vehicleId);
    const options = Number.isFinite(this.player.y) ? { referenceHeight: this.player.y, mode: 'walk', transportId: this.player.transportId } : undefined;
    const surface = vehicle ? vehicle.supportSurface : this._sampleSurface?.(this.player.x, this.player.z, options);
    this.player.y = vehicle ? vehicle.y : finite(surface?.elevation);
    this.player.transportId = surface?.transportId || null;
  }

  _unsupportedDeckExit(actor, x, z, mode) {
    if (!actor?.transportId || !Number.isFinite(actor.y)) return false;
    const surface = this._sampleSurface?.(x, z, { referenceHeight: actor.y, mode, transportId: actor.transportId });
    return !Number.isFinite(surface?.elevation) || Math.abs(surface.elevation - actor.y) > 1.5;
  }

  _carContact(x, z, angle) {
    let best = null;
    for (const offset of [-CAR_HALF_AXLE, 0, CAR_HALF_AXLE]) {
      const hit = this._contact(x + Math.sin(angle) * offset, z + Math.cos(angle) * offset, CAR_RADIUS);
      if (hit && (!best || hit.depth > best.depth)) best = hit;
    }
    return best;
  }

  _nearCar(x, z, radius, ignoredId = null, referenceHeight = undefined) {
    for (const car of this.cars) {
      if (car.id === ignoredId || Math.hypot(x - car.x, z - car.z) > 3 + radius) continue;
      if (Number.isFinite(referenceHeight) && Number.isFinite(car.y) && Math.abs(car.y - referenceHeight) > 2.5) continue;
      const dx = Math.sin(car.angle) * CAR_HALF_AXLE;
      const dz = Math.cos(car.angle) * CAR_HALF_AXLE;
      const closest = closestOnSegment(x, z, car.x - dx, car.z - dz, car.x + dx, car.z + dz);
      const gap = Math.hypot(x - closest.x, z - closest.z);
      if (gap < CAR_RADIUS + radius) {
        return { car, nx: gap ? (x - closest.x) / gap : Math.cos(car.angle), nz: gap ? (z - closest.z) / gap : -Math.sin(car.angle), depth: CAR_RADIUS + radius - gap };
      }
    }
    return null;
  }

  _resolvePosition(x, z, radius, angle = null, previous = null) {
    // Vertical falls are not simulated. Stop an actor already on a measured
    // deck before an unsupported drop instead of snapping it onto a road below.
    if (previous && this._unsupportedDeckExit(previous, x, z, angle === null ? 'walk' : 'drive')) {
      const dx = previous.x - x, dz = previous.z - z, length = Math.hypot(dx, dz) || 1;
      return { x: previous.x, z: previous.z, hit: { kind: 'surface', nx: dx / length, nz: dz / length, depth: 0 } };
    }
    let hit = null;
    for (let iteration = 0; iteration < 5; iteration++) {
      const contact = angle === null ? this._contact(x, z, radius) : this._carContact(x, z, angle);
      if (!contact) break;
      // A missing I3S region has no wall normal. Stop at the last verified
      // position rather than guessing a push direction through unloaded data.
      if (contact.kind === 'loading' && previous) {
        const dx = previous.x - x, dz = previous.z - z, length = Math.hypot(dx, dz) || 1;
        return { x: previous.x, z: previous.z, hit: { ...contact, nx: dx / length, nz: dz / length } };
      }
      if (!hit || contact.depth > hit.depth) hit = contact;
      x += contact.nx * (contact.depth + 0.0001);
      z += contact.nz * (contact.depth + 0.0001);
    }
    return { x, z, hit };
  }

  _findSafePoint(x, z, radius, ignoreCar = null) {
    for (let ring = 0; ring < 24; ring++) {
      for (let i = 0; i < (ring ? 16 : 1); i++) {
        const angle = i / 16 * TAU;
        const point = { x: x + Math.sin(angle) * ring * 1.5, z: z + Math.cos(angle) * ring * 1.5 };
        if (!this.isBlocked(point.x, point.z, radius) && !this._nearCar(point.x, point.z, radius, ignoreCar)) return point;
      }
    }
    return this._resolvePosition(x, z, radius);
  }

  _lanePoint(edge, fraction) {
    // Heading zero faces +Z; the driver's right is -X, not +X. Both road
    // directions therefore occupy their own right-hand lane in NYC traffic.
    return { x: edge.from.x + (edge.to.x - edge.from.x) * fraction - Math.cos(edge.angle) * edge.lane, z: edge.from.z + (edge.to.z - edge.from.z) * fraction + Math.sin(edge.angle) * edge.lane };
  }

  _makeCar(id, type, point, angle, edge = null) {
    const palette = ['#172e35', '#d8d0be', '#a64438', '#427374', '#d6dce0', '#33413e'];
    const car = { id, type, x: point.x, z: point.z, angle, speed: 0, color: type === 'taxi' ? '#f2b91c' : type === 'police' ? '#f1f2e9' : palette[Math.floor(this._random() * palette.length)], parked: !edge, controlled: false, radius: CAR_RADIUS, siren: false, _edge: edge, _route: [], _stuckTime: 0, _cruise: 6 + this._random() * 3, _wait: 0, _steering: 0, _shiftHold: 0 };
    resetVehicleDynamics(car);
    return car;
  }

  _mappedLand(x, z, radius = 0) {
    if (!Array.isArray(this.city.boroughs)) return true;
    return [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].every(([dx, dz]) =>
      this.city.boroughs.some(borough => borough.polygons?.some(polygon => pointInPolygon(x + dx, z + dz, polygon.outer)
        && !(polygon.holes || []).some(hole => pointInPolygon(x + dx, z + dz, hole)))));
  }

  _pinTaxiPlacement(spawn) {
    const candidates = [];
    for (const edge of this._graph.edges) {
      // Exact ground pins do not establish access to a raised bridge, tunnel
      // floor or pedestrian path. Keep the courtesy cab on a nearby street.
      if (['tunnel', 'bridge', 'footway', 'pedestrian', 'path', 'steps', 'cycleway'].includes(edge.road.kind)
        || edge.road.roadwayType === 3 || edge.road.roadwayType === 4) continue;
      const nearest = closestOnSegment(spawn.x, spawn.z, edge.from.x, edge.from.z, edge.to.x, edge.to.z);
      if (distance(nearest, spawn) > 120) continue;
      for (const offset of [0, 8, -8, 20, -20]) {
        const point = this._lanePoint(edge, clamp(nearest.t + offset / edge.length, .08, .92));
        const gap = distance(point, spawn);
        if (gap >= 4 && gap <= 120) candidates.push({ point, angle: edge.angle, gap });
      }
    }
    candidates.sort((a, b) => a.gap - b.gap);
    return candidates.find(({ point, angle }) => this._mappedLand(point.x, point.z, CAR_RADIUS)
      && this._landscapeContact?.(point.x, point.z, CAR_RADIUS)?.kind !== 'water'
      && !this._carContact(point.x, point.z, angle)
      && !this._nearCar(point.x, point.z, CAR_RADIUS, 'player-taxi', this.groundHeight(point.x, point.z))) || null;
  }

  _seedCars() {
    const spawn = this.city.spawn;
    let taxiPoint = null;
    let taxiAngle = spawn.angle || 0;
    if (spawn.exact) {
      const placement = this._pinTaxiPlacement(spawn);
      if (placement) { taxiPoint = placement.point;taxiAngle = placement.angle; }
    } else {
      // Keep the cab close enough for the first interaction, with enough space
      // between its body and the on-foot spawn that they never begin overlapping.
      for (const offset of [[0, 3.8], [3.2, 0], [-3.2, 0], [0, -3.8], [4.5, 0], [-4.5, 0]]) {
        const point = { x: spawn.x + Math.cos(taxiAngle) * offset[0] + Math.sin(taxiAngle) * offset[1], z: spawn.z - Math.sin(taxiAngle) * offset[0] + Math.cos(taxiAngle) * offset[1] };
        if (!this._carContact(point.x, point.z, taxiAngle)) { taxiPoint = point; break; }
      }
      if (!taxiPoint) {
        const nearest = this._nearestEdge(spawn.x, spawn.z);
        if (nearest) { taxiPoint = this._lanePoint(nearest.edge, nearest.t); taxiAngle = nearest.edge.angle; }
        else taxiPoint = this._findSafePoint(spawn.x + 4, spawn.z, 2.1);
      }
    }
    if (taxiPoint) this.cars.push(this._makeCar('player-taxi', 'taxi', taxiPoint, taxiAngle));
    const edges = this._graph.edges.filter(edge => edge.length > 16);
    if (!edges.length) return;
    for (let i = 0; i < 15; i++) {
      const police = i >= 12;
      for (let attempt = 0; attempt < 50; attempt++) {
        const edge = edges[Math.floor(this._random() * edges.length)];
        const point = this._lanePoint(edge, 0.15 + this._random() * 0.7);
        if (distance(point, spawn) < (police ? 50 : 16) || this._carContact(point.x, point.z, edge.angle) || this._nearCar(point.x, point.z, 5)) continue;
        const car = this._makeCar(`${police ? 'police' : 'traffic'}-${i}`, police ? 'police' : i % 4 === 0 ? 'taxi' : 'sedan', point, edge.angle, edge);
        resetVehicleDynamics(car, car._cruise * 0.65);
        this.cars.push(car);
        break;
      }
    }
  }

  _nearestEdge(x, z) {
    let nearest = null;
    for (const edge of this._graph.edges) {
      const point = closestOnSegment(x, z, edge.from.x, edge.from.z, edge.to.x, edge.to.z);
      const d = Math.hypot(x - point.x, z - point.z);
      if (!nearest || d < nearest.distance) nearest = { edge, ...point, distance: d };
    }
    return nearest;
  }

  getStreet() {
    return this._nearestEdge(this.player.x, this.player.z)?.edge.road.name || this.city.name || 'New York City';
  }

  getNearbyCar() {
    if (this.player.mode === 'drive') return null;
    let nearest = null;
    let best = 5;
    for (const car of this.cars) {
      if (car.type === 'police' || car.controlled) continue;
      if (Number.isFinite(car.y) && Math.abs(car.y - this.player.y) > 2.5) continue;
      const d = distance(this.player, car);
      if (d < best) { nearest = car; best = d; }
    }
    return nearest;
  }

  _say(message, seconds = 4) { this.notice = message; this.noticeTime = seconds; }

  interact() {
    const player = this.player;
    if (player.mode === 'walk') {
      const car = this.getNearbyCar();
      if (!car) { this._say('Move closer to a taxi or parked car.'); return false; }
      if (vehicleTravelSpeed(car) > 4) { this._say('Wait for the car to slow down.'); return false; }
      car.controlled = true;
      car.parked = true;
      car._route = [];
      resetVehicleDynamics(car, car.speed);
      Object.assign(player, { mode: 'drive', vehicleId: car.id, x: car.x, z: car.z, angle: car.angle, speed: car.speed, velocityX: car.velocityX, velocityZ: car.velocityZ });
      this.updateGrounding();
      this._say('W accelerate. S brake / reverse. A / D steer. Space handbrake.');
      return true;
    }
    const car = this.cars.find(item => item.id === player.vehicleId);
    if (!car) { this.reset(); return false; }
    if (vehicleTravelSpeed(car) > 4) { this._say('Slow down before getting out.'); return false; }
    for (const [side, front] of [[-2.2, 0], [2.2, 0], [-2.5, -1.8], [2.5, -1.8], [0, -3.2], [0, 3.2]]) {
      const x = car.x + Math.cos(car.angle) * side + Math.sin(car.angle) * front;
      const z = car.z - Math.sin(car.angle) * side + Math.cos(car.angle) * front;
      const surface = this._sampleSurface?.(x, z, { referenceHeight: car.y, mode: 'walk', transportId: car.transportId });
      // Clear horizontal space beside a bridge is not a supported exit. Check
      // the actual walking surface before switching out of the vehicle so a
      // door beyond the deck cannot teleport its passenger to the road below.
      if (Number.isFinite(car.y) && Math.abs(finite(surface?.elevation) - car.y) > 1.5) continue;
      if (this.isBlocked(x, z, PLAYER_RADIUS) || this._nearCar(x, z, PLAYER_RADIUS, car.id, car.y)) continue;
      car.controlled = false;
      car.parked = true;
      resetVehicleDynamics(car);
      Object.assign(player, { x, z, mode: 'walk', vehicleId: null, transportId: car.transportId || null, speed: 0, velocityX: 0, velocityZ: 0 });
      this.updateGrounding();
      this._say('On foot. Hold Shift to run. E to get back in.');
      return true;
    }
    this._say('Both doors are blocked. Move the car into an open space.');
    return false;
  }

  startMission() {
    if (this.mission.phase === 'active') { this._say('Finish your current delivery first.'); return false; }
    const all = (this.city.missionPoints || []).filter(point => Number.isFinite(point.x) && Number.isFinite(point.z) && !this.isBlocked(point.x, point.z, 1));
    let options = all.filter(point => distance(point, this.player) > 45 && point.name !== this._lastTarget);
    if (!options.length) options = all.filter(point => distance(point, this.player) > 20);
    if (!options.length) { this._say('No reachable delivery destination is available.'); return false; }
    const target = options[Math.floor(this._random() * options.length)];
    const routeDistance = distance(this.player, target);
    const totalTime = Math.round(clamp(55 + routeDistance / 7, 65, 180));
    const reward = Math.round((120 + routeDistance * 0.45) / 5) * 5;
    this.mission = { phase: 'active', target: { ...target }, timeLeft: totalTime, totalTime, reward };
    this._lastTarget = target.name;
    this._say(`Delivery accepted: ${target.name}. Follow the gold marker and stop inside it.`, 7);
    return true;
  }

  reset() {
    // Recovery must remain in the loaded neighborhood after driving away from
    // the last arrival point. Teleporting to an unloaded old spawn is unsafe.
    if ((this.loadedBounds || this._isReadyAt) && this.isBlocked(this.city.spawn.x, this.city.spawn.z, PLAYER_RADIUS)) {
      try { this.travelTo(this.player); }
      catch {
        // Sparse extracts can have no routable edge; the current position was
        // already checked by movement, whereas the old spawn was not loaded.
        this.city = { ...this.city, spawn: { x: this.player.x, z: this.player.z, angle: this.player.angle } };
      }
    }
    const car = this.cars.find(item => item.id === this.player.vehicleId);
    if (car) { car.controlled = false; car.parked = true; resetVehicleDynamics(car); }
    const taxi = this.cars.find(item => item.id === 'player-taxi');
    if (taxi) {
      const placement = this.city.spawn.exact ? this._pinTaxiPlacement(this.city.spawn) : null;
      if (this.city.spawn.exact && !placement) this.cars = this.cars.filter(car => car !== taxi);
      else {
        const angle = placement?.angle ?? this.city.spawn.angle ?? 0;
        const recovered = placement?.point || this._resolvePosition(this.city.spawn.x + Math.sin(angle) * 3.8, this.city.spawn.z + Math.cos(angle) * 3.8, CAR_RADIUS, angle);
        Object.assign(taxi, { x: recovered.x, z: recovered.z, y: undefined, transportId: null, angle, speed: 0, parked: true, controlled: false });
        resetVehicleDynamics(taxi);
      }
    }
    const point = this._findSafePoint(this.city.spawn.x, this.city.spawn.z, PLAYER_RADIUS);
    Object.assign(this.player, { ...point, y: undefined, transportId: null, angle: this.city.spawn.angle || 0, speed: 0, mode: 'walk', vehicleId: null, velocityX: 0, velocityZ: 0 });
    this.updateGrounding();
    this.health = 100;
    this.heat = 0;
    this._timeSinceCrime = 100;
    this._impactCooldown = 0;
    this._bustedTime = 0;
    if (this.mission.phase === 'active') this.mission.phase = 'failed';
    this._say('Recovered nearby. Your earnings and completed deliveries are saved.');
  }

  step(input = {}, dt = 0) {
    // A fixed accumulator makes handling independent of display refresh rate.
    // Capping a background-tab pause avoids simulating a long unattended chase.
    this._accumulator += clamp(finite(dt), 0, 0.25);
    const normalized = { forward: clamp(finite(input.forward), -1, 1), turn: clamp(finite(input.turn), -1, 1), moveX: clamp(finite(input.moveX), -1, 1), moveZ: clamp(finite(input.moveZ), -1, 1), brake: Boolean(input.brake), handbrake: Boolean(input.handbrake), run: Boolean(input.run) };
    while (this._accumulator + 1e-10 >= FIXED_STEP) {
      this._tick(normalized, FIXED_STEP);
      this._accumulator -= FIXED_STEP;
    }
  }

  _tick(input, dt) {
    this.elapsed += dt;
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    this._impactCooldown = Math.max(0, this._impactCooldown - dt);
    this._timeSinceCrime += dt;
    const before = { x: this.player.x, z: this.player.z };
    if (this.player.mode === 'drive') this._drive(input, dt);
    else this._walk(input, dt);
    this.distanceTravelled += distance(before, this.player);
    this._policeRouteTimer -= dt;
    const refreshRoutes = this._policeRouteTimer <= 0;
    if (refreshRoutes) this._policeRouteTimer = 1.2;
    for (const car of this.cars) {
      if (car.controlled || car.parked) continue;
      if (refreshRoutes && car.type === 'police' && this.heat > 0.05) this._routePolice(car);
      this._traffic(car, dt);
    }
    this.updateGrounding();
    this._updateHeat(dt);
    this._updateMission(dt);
    if (this.health <= 0) {
      const charge = Math.min(this.cash, 75);
      this.cash -= charge;
      this.reset();
      this._say(`Vehicle recovered. Repairs: $${charge}.`, 6);
    }
  }

  _walk(input, dt) {
    const player = this.player;
    const magnitude = Math.hypot(input.moveX, input.moveZ);
    const divisor = Math.max(1, magnitude);
    const topSpeed = input.run ? 7.3 : 4.25;
    const desiredX = input.moveX / divisor * topSpeed;
    const desiredZ = input.moveZ / divisor * topSpeed;
    const blend = 1 - Math.exp(-13 * dt);
    player.velocityX += (desiredX - player.velocityX) * blend;
    player.velocityZ += (desiredZ - player.velocityZ) * blend;
    if (magnitude > 0.02) player.angle += turnDelta(player.angle, Math.atan2(desiredX, desiredZ)) * (1 - Math.exp(-16 * dt));
    let next = this._resolvePosition(player.x + player.velocityX * dt, player.z + player.velocityZ * dt, PLAYER_RADIUS, null, player);
    const carHit = this._nearCar(next.x, next.z, PLAYER_RADIUS, null, player.y);
    if (carHit) {
      next = this._resolvePosition(next.x + carHit.nx * (carHit.depth + 0.001), next.z + carHit.nz * (carHit.depth + 0.001), PLAYER_RADIUS, null, player);
    }
    player.speed = Math.hypot(next.x - player.x, next.z - player.z) / dt;
    if (next.hit) {
      const inward = player.velocityX * next.hit.nx + player.velocityZ * next.hit.nz;
      if (inward < 0) { player.velocityX -= inward * next.hit.nx; player.velocityZ -= inward * next.hit.nz; }
    }
    player.x = next.x;
    player.z = next.z;
  }

  _drive(input, dt) {
    const car = this.cars.find(item => item.id === this.player.vehicleId);
    if (!car) { this.reset(); return; }
    const previousAngle = car.angle;
    stepVehicleDynamics(car, input, dt);
    const next = this._resolvePosition(car.x + car.velocityX * dt, car.z + car.velocityZ * dt, CAR_RADIUS, car.angle, car);
    if (next.hit) {
      const approach = -(car.velocityX * next.hit.nx + car.velocityZ * next.hit.nz);
      const loadingBoundary = next.hit.kind === 'boundary' || next.hit.kind === 'loading' || next.hit.kind === 'water' || next.hit.kind === 'surface';
      if (approach > 0.3) {
        // Lateral impacts count too. Loading and geographic limits never cause
        // damage or heat, and must not store motion that launches after loading.
        if (!loadingBoundary) this._impact(approach, 'building');
        else if (this.elapsed - this._lastBoundaryNotice > 6) {
          this._lastBoundaryNotice = this.elapsed;
          this._say(next.hit.kind === 'loading' ? 'Loading the next streets. Please wait.' : next.hit.kind === 'water' ? 'Water ahead. Stay on the mapped shore or road.' : next.hit.kind === 'surface' ? 'Deck edge. Stay on the supported road.' : 'New York City map edge.', 4);
        }
      }
      const inward = Math.max(0, approach);
      // Missing coverage rejects the entire pose. Rolling back only position
      // could leave the rotated front or rear capsule inside an unloaded tile.
      if (next.hit.kind === 'loading' || next.hit.kind === 'surface') car.angle = previousAngle;
      stopVehicleRotation(car,
        loadingBoundary ? 0 : car.velocityX + next.hit.nx * inward,
        loadingBoundary ? 0 : car.velocityZ + next.hit.nz * inward);
    }
    car.x = next.x;
    car.z = next.z;
    for (const offset of [-CAR_HALF_AXLE, CAR_HALF_AXLE]) {
      const collision = this._nearCar(car.x + Math.sin(car.angle) * offset, car.z + Math.cos(car.angle) * offset, CAR_RADIUS, car.id, car.y);
      if (!collision) continue;
      const otherX = Math.sin(collision.car.angle) * collision.car.speed;
      const otherZ = Math.cos(collision.car.angle) * collision.car.speed;
      const relativeSpeed = Math.hypot(car.velocityX - otherX, car.velocityZ - otherZ);
      const corrected = this._resolvePosition(car.x + collision.nx * (collision.depth + 0.01), car.z + collision.nz * (collision.depth + 0.01), CAR_RADIUS, car.angle, car);
      car.x = corrected.x;
      car.z = corrected.z;
      this._impact(relativeSpeed, collision.car.type === 'police' ? 'police' : 'vehicle');
      let velocityX = car.velocityX * 0.4, velocityZ = car.velocityZ * 0.4;
      const closing = Math.min(0, (velocityX - otherX * .55) * collision.nx + (velocityZ - otherZ * .55) * collision.nz);
      velocityX -= collision.nx * closing;
      velocityZ -= collision.nz * closing;
      if (corrected.hit) {
        // A vehicle can push us against a wall or a streaming limit. Keep the
        // corrected position and velocity consistent within this same tick.
        if (corrected.hit.kind === 'loading' || corrected.hit.kind === 'boundary' || corrected.hit.kind === 'water' || corrected.hit.kind === 'surface') {
          velocityX = 0; velocityZ = 0;
        } else {
          const inward = Math.min(0, velocityX * corrected.hit.nx + velocityZ * corrected.hit.nz);
          velocityX -= corrected.hit.nx * inward; velocityZ -= corrected.hit.nz * inward;
        }
      }
      stopVehicleRotation(car, velocityX, velocityZ);
      resetVehicleDynamics(collision.car, collision.car.speed * 0.55);
      collision.car._wait = 0.7;
      break;
    }
    Object.assign(this.player, { x: car.x, z: car.z, angle: car.angle, speed: car.speed, velocityX: car.velocityX, velocityZ: car.velocityZ });
  }

  _impact(speed, kind) {
    if (this._impactCooldown > 0 || speed < 4) return;
    this._impactCooldown = 0.8;
    this.health = Math.max(0, this.health - Math.max(1, (speed - 3) * 0.75));
    if (speed > 9 || kind === 'police') {
      this.heat = clamp(this.heat + (kind === 'police' ? 0.9 : kind === 'vehicle' ? 0.65 : 0.4), 0, 3);
      this._timeSinceCrime = 0;
      this._say(kind === 'police' ? 'Police collision. Lose the patrols to clear your heat.' : 'Reckless driving reported. Lose the patrols to clear your heat.');
    }
  }

  _pickNextEdge(car) {
    const edge = car._edge;
    if (car.type === 'police' && this.heat > 0.05 && car._route.length) {
      const next = car._route.shift();
      if (next.from.id === edge.to.id) return next;
      car._route = [];
    }
    const options = edge.to.edges.filter(option => option.to.id !== edge.from.id);
    if (!options.length) return edge.to.edges[0] || null;
    let total = 0;
    const weighted = options.map(option => {
      const turn = Math.abs(turnDelta(edge.angle, option.angle));
      const weight = turn < 0.25 ? 3 : 1;
      total += weight;
      return { edge: option, weight };
    });
    let pick = this._random() * total;
    for (const option of weighted) { pick -= option.weight; if (pick <= 0) return option.edge; }
    return options[0];
  }

  _atBoundary(point, margin = 5) {
    return point.x < this.bounds.minX + margin || point.x > this.bounds.maxX - margin || point.z < this.bounds.minZ + margin || point.z > this.bounds.maxZ - margin;
  }

  _recycleTraffic(car) {
    if (distance(car, this.player) < 95) return false;
    // The OSM extract clips streets at its borders. Let cars leave and enter
    // outside the player's view so finite one-way streets do not fill with
    // permanently stopped traffic. Both locations remain on legal road lanes.
    let entrances = this._graph.edges.filter(edge => this._atBoundary(edge.from, 8) && !this._atBoundary(edge.to, 8));
    if (!entrances.length) entrances = this._graph.edges.filter(edge => edge.length > 20);
    for (let i = 0; i < Math.min(30, entrances.length * 2); i++) {
      const edge = entrances[Math.floor(this._random() * entrances.length)];
      const point = this._lanePoint(edge, clamp(9 / edge.length, 0.15, 0.75));
      if (distance(point, this.player) < 120 || this._carContact(point.x, point.z, edge.angle) || this._nearCar(point.x, point.z, 6, car.id)) continue;
      Object.assign(car, { x: point.x, z: point.z, y: undefined, transportId: null, angle: edge.angle, speed: car._cruise * 0.6, _edge: edge, _route: [], _stuckTime: 0, _steering: 0, _shiftHold: 0 });
      resetVehicleDynamics(car, car.speed);
      return true;
    }
    return false;
  }

  _traffic(car, dt) {
    if (!car._edge) return;
    car.siren = car.type === 'police' && this.heat > 0.05;
    car._wait = Math.max(0, car._wait - dt);
    let edge = car._edge;
    let start = this._lanePoint(edge, 0), end = this._lanePoint(edge, 1);
    let projection = closestOnSegment(car.x, car.z, start.x, start.z, end.x, end.z);
    if (this._atBoundary(edge.to) && distance(car, end) < 7) {
      if (!this._recycleTraffic(car)) car.speed = Math.max(0, car.speed - 16 * dt);
      return;
    }
    if ((projection.t > 0.96 && distance(car, end) < 5) || distance(car, end) < 2.8) {
      const next = this._pickNextEdge(car);
      if (next) {
        edge = car._edge = next;
        start = this._lanePoint(edge, 0); end = this._lanePoint(edge, 1);
        projection = closestOnSegment(car.x, car.z, start.x, start.z, end.x, end.z);
      } else {
        // A clipped one-way street can end at the map boundary. Keep its car
        // stopped there instead of inventing a U-turn against the OSM direction.
        car.speed = Math.max(0, car.speed - 14 * dt);
        this._recycleTraffic(car);
        return;
      }
    }
    const lookAhead = Math.max(3.5, Math.abs(car.speed) * 0.7);
    const target = this._lanePoint(edge, clamp(projection.t + lookAhead / edge.length, 0, 1));
    const desiredAngle = Math.atan2(target.x - car.x, target.z - car.z);
    const delta = turnDelta(car.angle, desiredAngle);
    car.angle += clamp(delta, -1.9 * dt, 1.9 * dt);
    let desiredSpeed = (car.siren ? 13 + this.heat * 1.8 : car._cruise) / (1 + Math.abs(delta) * 1.8);
    if (car._wait > 0) desiredSpeed = 0;
    for (const other of this.cars) {
      if (other === car) continue;
      if (Number.isFinite(car.y) && Number.isFinite(other.y) && Math.abs(car.y - other.y) > 2.5) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const along = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
      const across = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
      if (along > 0 && along < 6 + car.speed * 0.55 && across < 1.95) desiredSpeed = Math.min(desiredSpeed, Math.max(0, (along - 5) * 1.2));
    }
    if (this.player.mode === 'walk' && Math.abs(this.player.y - finite(car.y, this.player.y)) <= 2.5) {
      const dx = this.player.x - car.x, dz = this.player.z - car.z;
      const along = dx * Math.sin(car.angle) + dz * Math.cos(car.angle);
      const across = Math.abs(dx * Math.cos(car.angle) - dz * Math.sin(car.angle));
      if (along > 0 && along < 9 && across < 2.2) desiredSpeed = Math.min(desiredSpeed, Math.max(0, (along - 3.8) * 1.2));
    }
    car.speed += (desiredSpeed - car.speed) * (1 - Math.exp(-2.8 * dt));
    const beforeX = car.x, beforeZ = car.z;
    const resolved = this._resolvePosition(car.x + Math.sin(car.angle) * car.speed * dt, car.z + Math.cos(car.angle) * car.speed * dt, CAR_RADIUS, car.angle, car);
    car.x = resolved.x; car.z = resolved.z;
    if (resolved.hit) { car.speed *= 0.9; car._stuckTime += dt; }
    else car._stuckTime = Math.max(0, car._stuckTime - dt);
    if (car._stuckTime > 3 && Math.hypot(car.x - beforeX, car.z - beforeZ) < 0.015) {
      // Rejoin the same legal lane when a tight imported corner traps a patrol.
      // Recovery is constrained to a nearby clear point, never through a block.
      const rejoin = this._lanePoint(edge, clamp(projection.t + 3 / edge.length, 0.08, 0.92));
      if (distance(car, rejoin) < 5 && !this._unsupportedDeckExit(car, rejoin.x, rejoin.z, 'drive') && !this._carContact(rejoin.x, rejoin.z, edge.angle) && !this._nearCar(rejoin.x, rejoin.z, 3, car.id)) {
        car.x = rejoin.x; car.z = rejoin.z; car.angle = edge.angle;
      }
      car._stuckTime = 0;
    }
  }

  _routePolice(car) {
    const nearest = this._nearestEdge(this.player.x, this.player.z);
    if (!nearest || !car._edge) return;
    const destination = nearest.t < 0.5 ? nearest.edge.from : nearest.edge.to;
    const start = car._edge.to;
    if (start === destination) { car._route = []; return; }
    const cost = new Map([[start.id, 0]]);
    const previous = new Map();
    const open = [start];
    const visited = new Set();
    while (open.length) {
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) if (cost.get(open[i].id) < cost.get(open[bestIndex].id)) bestIndex = i;
      const node = open.splice(bestIndex, 1)[0];
      if (visited.has(node.id)) continue;
      if (node === destination) break;
      visited.add(node.id);
      for (const edge of node.edges) {
        const candidate = cost.get(node.id) + edge.length;
        if (candidate >= (cost.get(edge.to.id) ?? Infinity)) continue;
        cost.set(edge.to.id, candidate);
        previous.set(edge.to.id, edge);
        open.push(edge.to);
      }
    }
    const route = [];
    let cursor = destination;
    while (cursor !== start && previous.has(cursor.id)) {
      const edge = previous.get(cursor.id);
      route.unshift(edge);
      cursor = edge.from;
    }
    car._route = cursor === start ? route : [];
  }

  _hasSight(a, b) {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 5));
    for (let i = 1; i < steps; i++) {
      if (this.isBlocked(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps, 0.05)) return false;
    }
    return true;
  }

  _updateHeat(dt) {
    if (this.heat <= 0) return;
    const visiblePatrol = this.cars.find(car => car.type === 'police' && distance(car, this.player) < 85 && this._hasSight(car, this.player));
    if (!visiblePatrol && this._timeSinceCrime > 10) {
      this.heat = Math.max(0, this.heat - dt * 0.14);
      if (this.heat === 0) this._say('You lost the police. Heat cleared.');
    }
    if (visiblePatrol && distance(visiblePatrol, this.player) < 8 && playerTravelSpeed(this.player) < 1.2) this._bustedTime += dt;
    else this._bustedTime = Math.max(0, this._bustedTime - dt * 2);
    if (this._bustedTime > 5) {
      const fine = Math.min(this.cash, Math.round(50 + this.heat * 50));
      this.cash -= fine;
      this.reset();
      this._say(`Busted. Fine: $${fine}. Your cab is waiting at the start.`, 7);
    }
  }

  _updateMission(dt) {
    if (this.mission.phase !== 'active') return;
    this.mission.timeLeft = Math.max(0, this.mission.timeLeft - dt);
    if (this.mission.timeLeft <= 0) {
      this.mission.phase = 'failed';
      this._say('Delivery timed out. Press N to try another job.', 6);
      return;
    }
    if (distance(this.player, this.mission.target) < 10 && playerTravelSpeed(this.player) < 3) {
      const bonus = Math.round(this.mission.timeLeft / this.mission.totalTime * 50 / 5) * 5;
      const payout = this.mission.reward + bonus;
      this.cash += payout;
      this.deliveries += 1;
      this.mission.phase = 'complete';
      this.mission.payout = payout;
      this._say(`Delivery complete. +$${payout}. Press N for your next job.`, 7);
    }
  }
}
