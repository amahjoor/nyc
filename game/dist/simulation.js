import { Shopping,foodId,pantryItem } from './shopping.js';
import { carCondition, collisionLoad, impactVehicle, repairVehicle, stepVehicleFire, doorPanel, tearDoor } from './vehicle-damage.js';
import { resetVehicleDynamics, stepVehicleDynamics, stopVehicleRotation, vehicleTravelSpeed } from './vehicle-dynamics.js';
import { startKick, tryVault, beginEntry, stepMove, fireGun, reloadGun, toggleGun, carUnder } from './player-moves.js';
import { planJunction, junctionArms, vehicleAspect, stopDistance } from './signal-plan.js';
import { laneLayout } from './lanes.js';
import { StreetObjects } from './street-objects.js';
import { roadLevelAt, trafficAtHeight } from './road-level.js';
import { drawVehicle, drawPaint, drawTaxi, WHEEL } from './fleet.js';
import { walkRoom, roomPoint, roomLocal, DOOR } from './room.js';
import { seatApproach, seatClip, stepSeating } from './seating.js';
import { PEP, scratch,menuFor } from './menu.js';
import { Police, MAX_STARS } from './police.js';
import { vehicleHandling, repairCost, offersAt, PARTS, RESPRAY_PRICE, RESPRAYS, CALL_OUT, DELIVERY, WHEELS, WHEELS_PRICE, PLATES_PRICE } from './garage.js';
import { plateFor } from './license-plates.js';

// Simulation units are metres and seconds. A heading of zero points along +Z.
// This module deliberately has no renderer or browser dependencies.
const TAU = Math.PI * 2;
const FIXED_STEP = 1 / 120;
const PLAYER_RADIUS = 0.4;
const CAR_RADIUS = 0.92;
// On foot: a short hop, then gravity. A curb is a step; anything taller is a fall.
const GRAVITY = 18, JUMP_SPEED = 6.4, STEP_DROP = 0.65, FALL_HURT = 10;
const CAR_HALF_AXLE = 1.12;
// What stands at a New York kerb: mostly black, white and shades of grey.
const KERB_PAINT = ['#15181b', '#15181b', '#2b2f33', '#5b6166', '#8f969b', '#8f969b', '#c9cdd0', '#e8e9e6', '#e8e9e6', '#1f2f45', '#3a5a7a', '#7a1f1f', '#27402f', '#8a7a5c'];
// Yellow cabs, and the apple-green ones that serve everywhere outside the Manhattan core.
export const YELLOW_CAB = '#f2b91c', GREEN_CAB = '#74b541';
// A red-light camera's fine. About one signalled junction in twelve has a camera here; the city has far fewer.
const CAMERA_FINE = 50, CAMERA_SHARE = 12;
const TRAFFIC_PAINT = ['#172e35', '#d8d0be', '#a64438', '#427374', '#d6dce0', '#33413e'];
// Moving traffic is kept where it can be seen: within TRAFFIC_REACH of where
// the player will be TRAFFIC_LEAD seconds from now. Cars are drawn to
// TRAFFIC_SIGHT. One joins a street heading in, no nearer than
// TRAFFIC_JOIN.ahead where the player is looking (a car is a few pixels wide
// there) or TRAFFIC_JOIN.aside where they are not. One that has strayed past
// TRAFFIC_STRAY is brought back, and one too many is retired, by the same rule.
export const TRAFFIC_SIGHT = 400;
const TRAFFIC_JOIN = { ahead: 330, aside: 150 }, TRAFFIC_REACH = 400, TRAFFIC_STRAY = 460, TRAFFIC_LEAD = 8, TRAFFIC_PASS = 70;
// The player is taken to see this far to either side of where they look: cos 60°.
const LOOKOUT = .5;
// How long a car stands behind one that is going nowhere before the block counts as shut, and for how long after.
const BLOCK_PATIENCE = 4, BLOCK_MEMORY = 6;
// And how long before it pulls out into the next lane, where there is one.
const PULL_OUT = 2;
// Buildings do not move. A car in traffic is tested against them each time it
// has travelled this far, and at every step while it is touching one.
const TRAFFIC_CHECK = .25;
// Kerbside cars stand still, so only one in this many is re-seated on the ground each step.
const KERB_GROUNDING_TURNS = 24;
// Traffic within this distance of the player is set on the road at every step; the rest, every fourth.
const TRAFFIC_GROUNDING_TURNS = 4, TRAFFIC_GROUNDED_WITHIN = 60;
const GRID_SIZE = 24;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const turnDelta = (from, to) => ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
// A change of heading smaller than this is the same street carrying on, not a turn.
const STRAIGHT_ON = .6;
const emptyMission = () => ({ phase: 'idle', target: null, timeLeft: 0, totalTime: 0, reward: 0 });
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const playerTravelSpeed = player => player.mode === 'drive' ? Math.hypot(player.velocityX, player.velocityZ) : Math.abs(player.speed);

function buildingGrid(buildings) {
  const grid = new Map();
  for (const building of buildings || []) {
    if (!building.polygon || building.polygon.length < 3) continue;
    const xs = building.polygon.map(point => point[0]);
    const zs = building.polygon.map(point => point[1]);
    const entry={building,minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};
    for (let gx = Math.floor(entry.minX / GRID_SIZE); gx <= Math.floor(entry.maxX / GRID_SIZE); gx++) {
      for (let gz = Math.floor(entry.minZ / GRID_SIZE); gz <= Math.floor(entry.maxZ / GRID_SIZE); gz++) {
        const key = `${gx},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(entry);
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

const STILL = Object.freeze({ forward: 0, turn: 0, lift: 0, moveX: 0, moveZ: 0, brake: false, handbrake: false, run: false });

// One car footprint for pedestrians, bicycles and vehicle-to-vehicle contacts.
function carContact(car, x, z, radius, height) {
  const dx = x - car.x, dz = z - car.z, reach = CAR_HALF_AXLE + CAR_RADIUS + radius;
  if (Math.abs(dx) > reach || Math.abs(dz) > reach || (Number.isFinite(height) && !trafficAtHeight(car, height))) return null;
  const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
  const along = clamp(dx * sin + dz * cos, -CAR_HALF_AXLE, CAR_HALF_AXLE);
  const ax = dx - along * sin, az = dz - along * cos, gap = Math.hypot(ax, az);
  if (gap >= CAR_RADIUS + radius) return null;
  return { car, nx: gap > 1e-8 ? ax / gap : cos, nz: gap > 1e-8 ? az / gap : -sin, depth: CAR_RADIUS + radius - gap };
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
  const addEdge = (from, to, road, oneWay) => {
    const length = distance(from, to);
    if (from === to || length < 0.4) return;
    const edge = { id: edges.length, from, to, road, length, angle: Math.atan2(to.x - from.x, to.z - from.z) };
    edge.lane = clamp(finite(road.width, 10) * 0.19, 0.65, 2.5);
    // An ordinary street wide enough for it carries traffic in the lanes it
    // is painted with (lanes.js); every other keeps to the single file above.
    const painted = road.roadwayType === 1 && road.kind !== 'bridge' && road.kind !== 'tunnel' && road.fromLevel === 13 && road.toLevel === 13 && road.width >= 7.5;
    const layout = painted ? laneLayout(road.width, oneWay) : null;
    edge.lanes = layout?.driven ? layout.count : 1;
    edge.first = edge.lanes > 1 ? layout.first : edge.lane;
    edge.step = edge.lanes > 1 ? layout.step : 0;
    edges.push(edge);
    from.edges.push(edge);
  };
  for (const segment of segments) {
    const cuts = [...new Set(segment.cuts.map(cut => Math.round(cut * 100000) / 100000))].sort((a, b) => a - b);
    const oneWay = segment.road.oneway;
    for (let i = 1; i < cuts.length; i++) {
      const a = nodeAt(segment.ax + (segment.bx - segment.ax) * cuts[i - 1], segment.az + (segment.bz - segment.az) * cuts[i - 1]);
      const b = nodeAt(segment.ax + (segment.bx - segment.ax) * cuts[i], segment.az + (segment.bz - segment.az) * cuts[i]);
      const forward = oneWay !== '-1' && oneWay !== -1, backward = oneWay !== true && oneWay !== 'yes' && oneWay !== '1' && oneWay !== 1;
      if (forward) addEdge(a, b, segment.road, !backward);
      if (backward) addEdge(b, a, segment.road, !forward);
    }
  }
  return { nodes, edges };
}

export class Simulation {
  constructor(city, { onRecovery } = {}) {
    this.city = city;
    this.onRecovery = onRecovery;
    this.bystanders = [];
    this.streetObjects = new StreetObjects();
    this.bounds = city.bounds;
    this.loadedBounds = city.loadedBounds || null;
    this._isReadyAt = typeof city.isReadyAt === 'function' ? city.isReadyAt : null;
    this._sampleSurface = typeof city.sampleSurface === 'function' ? city.sampleSurface : null;
    this._landscapeContact = typeof city.landscapeContact === 'function' ? city.landscapeContact : null;
    this._rngState = 0x51f05a;
    this._buildings = buildingGrid(city.buildings);
    this._graph = buildRoadGraph(city.roads || []);
    this._signalHints = typeof city.signalHints === 'function' ? city.signalHints : null;
    this._planJunctions();
    this.player = { x: city.spawn.x, z: city.spawn.z, angle: city.spawn.angle || 0, speed: 0, mode: 'walk', vehicleId: null, velocityX: 0, velocityZ: 0, vy: 0, grounded: true, slide: 0, swing: 0 };
    this.spotted = false;
    this.threats = [];
    this.melee = false;
    this.cars = [];
    this.heat = 0;
    this.health = 100;
    this.cash = 0;
    this.shopping=new Shopping(this);
    this.deliveries = 0;
    this.mission = emptyMission();
    this.notice = 'Welcome to SoHo. Walk to the yellow cab and press E.';
    this.noticeTime = 8;
    this.distanceTravelled = 0;
    this.elapsed = 0;
    this._accumulator = 0;
    this._impactCooldown = 0;
    this._timeSinceCrime = 100;
    this._lastTarget = null;
    this._lastBoundaryNotice = -Infinity;
    this.police = new Police(this);
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
    if (typeof this.city.signalHints === 'function') this._signalHints = this.city.signalHints;
    if (roadsChanged || city.signalHints !== undefined) this._planJunctions();
    if (spawn) this.travelTo(spawn);
    else if (roadsChanged) this._rebindTraffic();
    this.updateGrounding();
    return { player: { x: this.player.x, z: this.player.z }, cars: this.cars.length, loadedBounds: this.loadedBounds };
  }

  /**
   * Decide how every junction of the loaded streets is controlled. A plan
   * depends only on where the junction is and what meets there, so a signal
   * keeps its place in its cycle when streets are streamed out and in again.
   */
  _planJunctions() {
    const touching = new Map();
    for (const edge of this._graph.edges) for (const node of [edge.from, edge.to]) {
      let list = touching.get(node);
      if (!list) touching.set(node, list = []);
      list.push(edge);
    }
    this.junctions = [];
    this._junctionGrid = new Map();
    const meeting = new Map(), nearby = new Map();
    for (const [node, edges] of touching) {
      node.plan = null;
      const arms = junctionArms(node, edges);
      if (arms.length < 3) continue;
      meeting.set(node, arms);
      const key = `${Math.floor(node.x / 64)},${Math.floor(node.z / 64)}`;
      if (!nearby.has(key)) nearby.set(key, []);
      nearby.get(key).push(node);
    }
    // A boulevard's carriageways cross a street at points a few metres apart.
    // Find, for each such point, the street that has others running beside it.
    const boulevardAt = (node, arms) => {
      let found = null;
      for (const arm of arms) {
        if (!arm.name) continue;
        const sin = Math.sin(arm.angle), cos = Math.cos(arm.angle);
        let beside = 0;
        for (let gx = Math.floor((node.x - 50) / 64); gx <= Math.floor((node.x + 50) / 64); gx++) for (let gz = Math.floor((node.z - 50) / 64); gz <= Math.floor((node.z + 50) / 64); gz++) {
          for (const other of nearby.get(`${gx},${gz}`) || []) {
            if (other === node) continue;
            const dx = other.x - node.x, dz = other.z - node.z, along = Math.abs(dx * sin + dz * cos), across = Math.abs(dx * cos - dz * sin);
            if (across < 6 || across > 50 || along > 12) continue;
            if (meeting.get(other).some(twin => twin.name === arm.name && Math.abs(Math.sin(twin.angle - arm.angle)) < .35)) beside++;
          }
        }
        if (beside && (!found || beside > found.beside)) found = { beside, angle: arm.angle, breadth: arm.width * (1 + Math.min(beside, 3)) };
      }
      return found;
    };
    for (const [node, arms] of meeting) {
      // What the city's lists say about this corner, where the game was given them.
      const listed = this._signalHints ? this._signalHints(node.x, node.z) : null;
      const plan = planJunction({ x: node.x, z: node.z, arms, hints: listed || {}, core: Boolean(listed?.core), boulevard: boulevardAt(node, arms) });
      if (!plan) continue;
      node.plan = plan; node.arms = arms;
      const id = `${Math.round(node.x)},${Math.round(node.z)}`;
      let hash = 0;
      for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
      const junction = { id, x: node.x, z: node.z, plan, arms, radius: Math.max(plan.widths[0], plan.widths[1]) / 2 + 1, camera: plan.control === 'signal' && hash % CAMERA_SHARE === 0 };
      this.junctions.push(junction);
      const key = `${Math.floor(node.x / 64)},${Math.floor(node.z / 64)}`;
      if (!this._junctionGrid.has(key)) this._junctionGrid.set(key, []);
      this._junctionGrid.get(key).push(junction);
    }
    // Which of a junction's two streets each edge arrives by.
    for (const edge of this._graph.edges) {
      edge.arrives = -1;
      const plan = edge.to.plan;
      if (!plan) continue;
      const back = edge.angle + Math.PI;
      const index = edge.to.arms.findIndex(arm => Math.abs(turnDelta(arm.angle, back)) < .4);
      if (index >= 0) edge.arrives = plan.groups[index];
    }
    this._insideJunction = null;
  }

  /** The signalled junction a point lies inside, if any. */
  _junctionAt(x, z) {
    for (let gx = Math.floor((x - 20) / 64); gx <= Math.floor((x + 20) / 64); gx++) for (let gz = Math.floor((z - 20) / 64); gz <= Math.floor((z + 20) / 64); gz++) {
      for (const junction of this._junctionGrid.get(`${gx},${gz}`) || []) if (Math.hypot(junction.x - x, junction.z - z) < junction.radius) return junction;
    }
    return null;
  }

  /**
   * A driver who enters a junction against a red light is seen by any patrol
   * with a view of it, and photographed where there is a camera. Yellow is
   * legal; so, here, is rolling a stop sign.
   */
  _watchSignals(car) {
    const junction = this._junctionAt(car.x, car.z), entered = junction && this._insideJunction !== junction.id;
    this._insideJunction = junction ? junction.id : null;
    if (!entered || junction.plan.control !== 'signal' || vehicleTravelSpeed(car) < 2.5) return;
    // The arm the car came in by is the one it is still standing on.
    const from = Math.atan2(car.x - junction.x, car.z - junction.z);
    let index = -1, best = .9;
    junction.arms.forEach((arm, i) => { const d = Math.abs(turnDelta(arm.angle, from)); if (d < best) { best = d; index = i; } });
    if (index < 0 || vehicleAspect(junction.plan, junction.plan.groups[index], this.elapsed).aspect !== 'red') return;
    this.redLights = (this.redLights || 0) + 1;
    const patrol = this.cars.find(other => other.type === 'police' && distance(other, car) < 85 && this._hasSight(other, this.player));
    if (patrol) {
      this.offence('redLight', { seen: true, message: 'A patrol saw you run that red light.' });
    } else if (junction.camera) {
      const fine = Math.min(this.cash, CAMERA_FINE);
      this.cash -= fine;
      this.cameraFlash = { x: junction.x, z: junction.z, at: this.elapsed };
      this._say(fine ? `Red-light camera. Fine: $${fine}.` : 'Red-light camera.');
    }
  }

  /** People in the roadway, as { x, z }. Traffic slows and stops for them. */
  setWalkers(walkers = [], people = walkers) { this._walkers = walkers; this._people = people; }

  /**
   * How much traffic there is and what it is made of. `level` runs from
   * about .15 in the small hours to 1 in the rush; `taxis` is the share of
   * cars that are cabs; `green` says the cabs here are the green ones.
   * Until this is called the simulation keeps the traffic it was seeded with.
   */
  setTraffic({ level = 1, taxis = .25, green = false } = {}) {
    this._trafficMix = { taxis: clamp(finite(taxis), 0, 1), green: Boolean(green) };
    this._trafficTarget = Math.round(10 + 52 * clamp(finite(level), 0, 1.2));
  }

  _styleTraffic(car) {
    // A new identity, so that whatever draws the car builds the right model.
    const taxi = this._random() < this._trafficMix.taxis;
    car.id = `traffic-${this._trafficSerial = (this._trafficSerial || 100) + 1}`;
    repairVehicle(car);
    car.mods = car.handling = undefined; car.driverEjected = car._driven = car._jacked = car.resprays = false;
    // Another car altogether: its own wheels again, and the next number.
    car.rims = undefined; car.plates = (car.plates || 0) + 1;
    car.type = taxi ? 'taxi' : 'sedan';
    // A cab is one of the city's cabs. Any other car is one of those registered round here, or a van or a pickup at work.
    const fleet = taxi ? null : this._fleetAt(car);
    const drawn = fleet ? drawVehicle(fleet, this._random(), true) : { shape: undefined, identity: null };
    car.shape = drawn.shape; car.identity = drawn.identity;
    car.color = taxi ? (this._trafficMix.green ? GREEN_CAB : YELLOW_CAB) : fleet ? drawPaint(fleet, this._random(), drawn.working) : TRAFFIC_PAINT[Math.floor(this._random() * TRAFFIC_PAINT.length)];
    if (taxi) this._serviceIdentity(car);
  }

  /** Which model a cab or a patrol car is. Drawn from its name, so the same car is the same model whenever the fleet arrives. */
  _serviceIdentity(car) {
    if (car.type === 'police') {
      car.identity = (car.unit==='esu' ? this._fleet?.emergencyService : this._fleet?.patrol) || null;
      return;
    }
    const paintedCab = car.id === 'player-taxi' && car.resprays > 0;
    if (car.type !== 'taxi' && !paintedCab) return;
    let hash = 0;
    for (const character of String(car.id)) hash = (hash * 33 + character.charCodeAt(0)) >>> 0;
    car.identity = drawTaxi(this._fleetAt(car), (Math.imul(hash ^ hash >>> 16, 0x85ebca6b) >>> 0) / 4294967296, car.color === GREEN_CAB && !paintedCab).identity;
    if (paintedCab) { car.identity = car.identity?.plain || null; car.shape = car.identity?.shape || 'sedan'; }
  }

  /**
   * Buy something over the counter of the room the player is in, or with
   * `street` at a stand on the sidewalk: `item` is a row of menuFor().
   * Returns whether it was bought.
   */
  buy(item, { street = false, place = this.room?.place } = {}) {
    // Over a counter indoors, or at a stand on the sidewalk on foot.
    if (!item || !(this.room || (street && this.player.mode === 'walk'))) return false;
    if (this.cash < item.price) { this._say(`${item.name} is $${item.price.toFixed(2)}. You have $${Math.floor(this.cash)}.`); return false; }
    this.cash -= item.price; this.spent = (this.spent || 0) + item.price;
    if(street && !place)place=[{kind:'fruitstand'},{kind:'newsstand'}].find(stand=>menuFor(stand).some(row=>row.name===item.name));
    const id=place && foodId(place,item);
    if(id && pantryItem(id)){
      this.shopping.receive(id);
      this._say(`${item.name}. $${item.price.toFixed(2)}. Added to inventory.`);
    }else if (PEP[item.effect]) { this.pep = Math.max(this.pep || 0, PEP[item.effect]); this._say(`${item.name}. $${item.price.toFixed(2)}.`); }
    else if (item.effect === 'lottery') { const prize = scratch(this._random()); this.cash += prize; this._say(prize ? `Scratched it: $${prize}.` : 'Scratched it: nothing.'); }
    else if (item.effect === 'sleep') { this.health = 100; this.heat = 0; this.pep = PEP.meal; this._say('A night in a bed. The police have lost interest.', 6); }
    else if (item.effect === 'drink') { this.pep = 0; this._say(`${item.name}. $${item.price.toFixed(2)}. Take the subway home.`); }
    else this._say(`${item.name}. $${item.price.toFixed(2)}.`);
    return true;
  }

  /** Walk in through the door of a room laid out by planRoom(). On foot only. */
  enterRoom(room, at) {
    if (!room || this.player.mode !== 'walk' || this.room || (this.doorway?.closed && this.doorway.plan.place.id === room.place?.id)) return false;
    at ??= roomLocal(room, this.player.x, this.player.z);
    if (Math.abs(at.a) > DOOR / 2 || Math.abs(at.b) > .8) return false;
    this.room = { ...room, a: at.a, b: at.b };
    this._say(room.name, 3);
    return true;
  }

  leaveRoom() {
    if (!this.room || this.room.b > 0 || Math.abs(this.room.a) > DOOR / 2) return false;
    this.shopping.leave(this.doorway);
    this.room = null;
    return true;
  }

  sit(seat) {
    const p = this.player;
    if (!seat || this.seat || this.ending || p.mode !== 'walk' || p.move || p.swing > .08 || p.grounded === false) return false;
    const distance = Math.hypot(seat.x - p.x, seat.z - p.z), y = seat.y ?? p.y;
    if (!(distance <= 1.45 && Math.abs(y - p.y) <= 1.2 && Number.isFinite(seat.heading))) return false;
    const path=seat.path??seatApproach(p,seat);
    if (!path) return false;
    this.seat = { ...seat, y, path, clip: seatClip(seat), fromX: p.x, fromY: p.y, fromZ: p.z, fromAngle: p.angle,
      turn: turnDelta(p.angle, seat.heading), duration: .8 + path.length * .42, progress: 0, weight: 0, leaving: false };
    Object.assign(p, { velocityX: 0, velocityZ: 0, vy: 0, speed: 0, slide: 0, guard: 0, standing: null });
    return true;
  }
  stand() {
    if (!this.seat || this.seat.leaving) return false;
    this.seat.leaving = true;
    return true;
  }

  /** The car the player is driving, if any. */
  get vehicle() { return this.player.mode === 'drive' ? this.cars.find(car => car.id === this.player.vehicleId) || null : null; }

  /**
   * Have a garage of `kind` (places.js) do `job` to the car being driven:
   * 'repair', 'respray' (with `choice` a colour it keeps) or a part to fit.
   * Returns whether it was done; says why not.
   */
  garage(kind, job, choice = null) {
    const car = this.vehicle, offers = offersAt(kind);
    if (!car || !offers) { this._say('Drive a car into an auto shop first.'); return false; }
    if (vehicleTravelSpeed(car) > 1) { this._say('Stop the car first.'); return false; }
    const pay = (price, done) => { if (this.cash < price) { this._say(`That is $${price}. You have $${Math.floor(this.cash)}.`); return false; } this.cash -= price; this._say(done); return true; };
    if (job === 'repair' && offers.repair) {
      const price = repairCost(carCondition(car));
      if (!price) { this._say('Nothing needs mending.'); return false; }
      if (!pay(price, `Mended. $${price}.`)) return false;
      repairVehicle(car); return true;
    }
    if (job === 'respray' && offers.respray && RESPRAYS.some(([, colour]) => colour === choice)) {
      if (car.color === choice) { this._say('It is that colour already.'); return false; }
      if (!pay(RESPRAY_PRICE, `Resprayed. $${RESPRAY_PRICE}.`)) return false;
      // A cab out of its livery is a car like any other: the same model without the roof light.
      car.color = choice;
      if (car.type === 'taxi') { car.type = 'sedan'; car.identity = car.identity?.plain || null; car.shape = car.identity?.shape || 'sedan'; }
      car.resprays = (car.resprays || 0) + 1; return true;
    }
    if (job === 'plates' && offers.respray) {
      if (this.cash < PLATES_PRICE) return pay(PLATES_PRICE, '');
      // The next set issued to this car: a new number on whichever plate a car of its kind is given.
      car.plates = (car.plates || 0) + 1;
      return pay(PLATES_PRICE, 'New plates: ' + plateFor(car).text + '. $' + PLATES_PRICE + '.');
    }
    if (job === 'wheels' && offers.respray && WHEELS.some(([, pattern]) => pattern === choice)) {
      if (car.rims === choice) { this._say('It is on those already.'); return false; }
      if (!pay(WHEELS_PRICE, `Wheels fitted. $${WHEELS_PRICE}.`)) return false;
      car.rims = choice; return true;
    }
    if (PARTS[job] && offers.parts) {
      const stage = car.mods?.[job] || 0, price = PARTS[job].prices[stage];
      if (price === undefined) { this._say('Nothing better to fit.'); return false; }
      if (!pay(price, `${PARTS[job].label[0]}${PARTS[job].label.slice(1).toLowerCase()} stage ${stage + 1} fitted. $${price}.`)) return false;
      car.mods = { ...car.mods, [job]: stage + 1 };
      car.handling = vehicleHandling(car); return true;
    }
    this._say('They do not do that here.'); return false;
  }

  /** Call the mechanic out to the car being driven: it is mended where it stands, for the call-out on top. */
  callMechanic() {
    const cab = this.cars.find(item => item.id === 'player-taxi');
    const car = this.vehicle || (cab?.destroyed && distance(cab,this.player) < 30 ? cab : null);
    if (!car) { this._say('The mechanic needs a car to come out to. Get in one first.'); return false; }
    const price = repairCost(carCondition(car)) + CALL_OUT;
    if (carCondition(car) >= 100) { this._say('Nothing needs mending.'); return false; }
    if (this.cash < price) { this._say(`The call-out and the repair come to $${price}. You have $${Math.floor(this.cash)}.`); return false; }
    this.cash -= price; repairVehicle(car); this._say(`The mechanic came out and mended it. $${price}.`, 6); return true;
  }

  /** Have the player's own cab brought to the nearest street. */
  summonCab() {
    const cab = this.cars.find(car => car.id === 'player-taxi'), nearest = this._nearestEdge(this.player.x, this.player.z);
    if (!cab || !nearest) { this._say('There is no street near enough to bring it to.'); return false; }
    if (cab.controlled) { this._say('You are sitting in it.'); return false; }
    if (distance(cab, this.player) < 30) { this._say('Your cab is right here.'); return false; }
    if (this.cash < DELIVERY) { this._say(`Bringing it round is $${DELIVERY}. You have $${Math.floor(this.cash)}.`); return false; }
    for (const offset of [6, -6, 12, -12, 18]) {
      const point = this._lanePoint(nearest.edge, clamp(nearest.t + offset / nearest.edge.length, .05, .95));
      if (this._carContact(point.x, point.z, nearest.edge.angle) || this._nearCar(point.x, point.z, 4, cab.id)) continue;
      Object.assign(cab, { x: point.x, z: point.z, y: undefined, transportId: null, angle: nearest.edge.angle, speed: 0 });
      resetVehicleDynamics(cab); this.updateGrounding();
      this.cash -= DELIVERY; this._say(`Your cab is waiting on ${nearest.edge.road.name || 'the street'}. $${DELIVERY}.`, 6); return true;
    }
    this._say('There is no room at the kerb here. Try from the next block.'); return false;
  }

  /**
   * Look up registrations at each car's location. An already selected
   * mix is also accepted for callers modelling a single neighbourhood.
   */
  setFleet(source = null) {
    if (this._fleet === source) return;
    const lookup = typeof source?.at === 'function' && !Array.isArray(source);
    this._fleet = lookup || Array.isArray(source?.bodies) ? source : null;
    // Counts may arrive after the initial cars. Use the same stable draw as
    // a fresh spawn, including for kerb spaces already occupied at load time.
    if (lookup) for (const car of this.cars) {
      if (car.type === 'sedan' && !car.controlled && (car._kerb || car._edge)) this._registeredAppearance(car, !car._kerb);
      else this._serviceIdentity(car);
      if (car.controlled) car.handling = vehicleHandling(car);
    }
  }

  _fleetAt(point) { return this._fleet?.at ? this._fleet.at(point.x, point.z) : this._fleet; }

  _registeredAppearance(car, moving = false) {
    let hash = 0;
    for (const character of String(car.id)) hash = (hash * 33 + character.charCodeAt(0)) >>> 0;
    const mix = this._fleetAt(car);
    if (!mix) { car.color = KERB_PAINT[hash % KERB_PAINT.length]; return; }
    // Mix adjacent space IDs before sampling a catalog with thousands of rows.
    const shuffled = Math.imul(hash ^ hash >>> 16, 0x85ebca6b) >>> 0;
    const drawn = drawVehicle(mix, shuffled / 4294967296, moving);
    car.shape = drawn.shape; car.identity = drawn.identity;
    car.color = drawPaint(mix, (Math.imul(hash, 2654435761) >>> 0) / 4294967296, drawn.working);
  }

  /**
   * Which way the player is looking, as [x, z] on the ground. Traffic joins
   * nearer by where they are not looking. Until this is given, they are
   * taken to be looking everywhere.
   */
  setLookout(x, z) {
    const length = Math.hypot(x, z);
    this._lookout = length > 1e-6 && Number.isFinite(length) ? [x / length, z / length] : null;
  }

  /** Where the player will be in a few seconds; traffic is gathered about this point. */
  _trafficFocus() {
    const player = this.player, vx = finite(player.velocityX), vz = finite(player.velocityZ), speed = Math.hypot(vx, vz);
    const lead = speed > 1 ? Math.min(TRAFFIC_LEAD, 110 / speed) : 0;
    return { x: player.x + vx * lead, z: player.z + vz * lead };
  }

  /** How near the player a car may appear at this point without being seen to. */
  _joinDistance(point) {
    const look = this._lookout;
    if (!look) return TRAFFIC_JOIN.ahead;
    const dx = point.x - this.player.x, dz = point.z - this.player.z;
    return dx * look[0] + dz * look[1] > LOOKOUT * Math.hypot(dx, dz) ? TRAFFIC_JOIN.ahead : TRAFFIC_JOIN.aside;
  }

  /**
   * Put a car on a street a few blocks from the player, heading in toward
   * them, where its arrival will not be seen. False if no such place is clear.
   */
  _joinTraffic(car) {
    const focus = this._trafficFocus(), found = [];
    let total = 0;
    for (const edge of this._graph.edges) {
      if (edge.length < 16 || this.elapsed - edge._blockedAt < BLOCK_MEMORY) continue;
      const point = this._lanePoint(edge, clamp(9 / edge.length, 0.15, 0.75)), reach = distance(point, focus);
      if (reach > TRAFFIC_REACH || distance(point, this.player) < this._joinDistance(point)) continue;
      // Inbound: the street leads toward the player, not away.
      const dx = focus.x - point.x, dz = focus.z - point.z, sin = Math.sin(edge.angle), cos = Math.cos(edge.angle);
      if (dx * sin + dz * cos <= .35 * reach) continue;
      // An avenue carries several times what a side street does. And traffic is
      // wanted most on the streets the player can see down: those that, followed
      // straight, pass within TRAFFIC_PASS of them.
      total += clamp(finite(edge.road.width, 10), 6, 30) ** 2 * (Math.abs(dx * cos - dz * sin) < TRAFFIC_PASS ? 8 : 1);
      found.push(edge, total);
    }
    for (let i = 0; i < 12 && found.length; i++) {
      let pick = this._random() * total, k = 0;
      while (k + 2 < found.length && found[k + 1] < pick) k += 2;
      const edge = found[k], lane = car.type === 'police' ? 0 : Math.floor(this._random() * edge.lanes), point = this._lanePoint(edge, clamp(9 / edge.length, 0.15, 0.75), lane);
      if (this._carContact(point.x, point.z, edge.angle) || this._nearCar(point.x, point.z, 6, car.id)) continue;
      Object.assign(car, { x: point.x, z: point.z, y: undefined, transportId: null, angle: edge.angle, speed: car._cruise * 0.6, _edge: edge, _lane: lane, _route: [], _stuckTime: 0, _steering: 0, _shiftHold: 0, _halted: null, _held: 0 });
      resetVehicleDynamics(car, car.speed);
      // What comes round the corner next need not be what left.
      if (car.type !== 'police') this._styleTraffic(car);
      return true;
    }
    return false;
  }

  /**
   * Keep the traffic the hour calls for around the player: bring in cars that
   * have strayed out of reach, add one, or retire one, where it will not be
   * seen to happen.
   */
  _balanceTraffic() {
    if (!this._trafficMix || !this._graph.edges.length) return;
    const focus = this._trafficFocus(), strays = [];
    let moving = 0, farthest = null, unseen = 0;
    for (const car of this.cars) {
      if (!car._edge || car._kerb || car.controlled || car.siren) continue;
      // A car may go from wherever one may appear.
      const seen = distance(car, this.player), hidden = seen >= this._joinDistance(car);
      if (car.type !== 'police') { moving++; if (hidden && seen > unseen) { farthest = car; unseen = seen; } }
      if (hidden && distance(car, focus) > TRAFFIC_STRAY) strays.push(car);
    }
    if (moving > this._trafficTarget) { if (farthest) this.cars.splice(this.cars.indexOf(farthest), 1); return; }
    // A few at a time, farthest first: enough to keep up with a car at speed.
    strays.sort((a, b) => distance(b, focus) - distance(a, focus));
    for (const car of strays.slice(0, 3)) this._joinTraffic(car);
    if (moving < this._trafficTarget) {
      const car = this._makeCar('traffic-new', 'sedan', { x: this.player.x + 1e6, z: this.player.z }, 0, this._graph.edges[0]);
      if (this._joinTraffic(car)) this.cars.push(car);
    }
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
    for (const car of this.cars) if (car.type === 'police') car._routeAt = 0;
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
    this.transport?.abandon();
    this.bike = null;
    this.shopping.interrupt();
    this.room = null; this.seat = null; this.doorway = null;
    const previousCab = this.cars.find(car => car.id === 'player-taxi');
    this.city = { ...this.city, spawn: target };
    this.cars = [];
    this.police.clear();
    Object.assign(this.player, { x: target.x, z: target.z, y: undefined, transportId: null, angle: target.angle, speed: 0, mode: 'walk', vehicleId: null, velocityX: 0, velocityZ: 0, vy: 0, grounded: true, slide: 0, swing: 0 });
    this._seedCars(previousCab);
    const safe = target.exact ? target : this._findSafePoint(target.x, target.z, PLAYER_RADIUS);
    Object.assign(this.player, { x: safe.x, z: safe.z });
    this.updateGrounding();
    this._accumulator = 0;
    const arrival = target.exact ? this.cars.some(car => car.id === 'player-taxi')
      ? 'A cab is waiting on a nearby street.' : 'Explore on foot.' : 'Your cab is nearby.';
    this._say(`Arrived${target.name ? ` at ${target.name}` : ''}. ${arrival}`);
    return { x: this.player.x, z: this.player.z, angle: this.player.angle };
  }

  _random() {
    this._rngState = (Math.imul(this._rngState, 1664525) + 1013904223) >>> 0;
    return this._rngState / 4294967296;
  }

  _contact(x, z, radius, ignoreWater = false, baseHeight, actor) {
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
    if (this._isReadyAt && !this._isReadyAt(x, z, radius, baseHeight)) keep({ nx: 0, nz: 0, depth: radius, kind: 'loading' });
    const landscape = this._landscapeContact?.(x, z, radius);
    if (landscape && !(ignoreWater && landscape.kind === 'water')) {
      // The measured road network can cross a mapped water polygon on a
      // bridge. Preserve that existing route until a surveyed deck is loaded;
      // water remains impassable away from a mapped road corridor.
      const road = landscape.kind === 'water' ? this._nearestEdge(x, z) : null;
      if (!road || road.distance > Math.max(1, finite(road.edge.road.width, 8) / 2 - radius)) keep(landscape);
    }
    if (this.streetObjects.grid.size) keep(this.streetObjects.contact(x,z,radius,baseHeight,actor,this.elapsed));
    const checked = new Set();
    for (let gx = Math.floor((x - radius) / GRID_SIZE); gx <= Math.floor((x + radius) / GRID_SIZE); gx++) {
      for (let gz = Math.floor((z - radius) / GRID_SIZE); gz <= Math.floor((z + radius) / GRID_SIZE); gz++) {
        for (const entry of this._buildings.get(`${gx},${gz}`) || []) {
          if(x+radius<entry.minX || x-radius>entry.maxX || z+radius<entry.minZ || z-radius>entry.maxZ)continue;
          const building=entry.building;
          if (checked.has(building)) continue;
          checked.add(building);
          if (Number.isFinite(baseHeight) && Number.isFinite(building.height)
              && baseHeight > this.groundHeight(x,z) + building.height + .6) continue;
          keep(circlePolygonContact(x, z, radius, building.polygon, building.holes));
        }
      }
    }
    return contact;
  }

  /** Static map collision query for cameras and pedestrian placement. */
  isBlocked(x, z, radius = 0.5, { ignoreWater = false, baseHeight } = {}) {
    // A camera above the surface can look across a pond. Actors still use
    // shoreline collision; water must not become an infinitely tall wall.
    return Boolean(this._contact(x, z, Math.max(0.01, radius), ignoreWater, baseHeight));
  }

  groundHeight(x, z) {
    return finite(this._sampleSurface?.(x, z)?.elevation);
  }

  /**
   * The decks over the streets have changed. Traffic takes its level afresh
   * from the street it is following, so a car that was put on the ground
   * before a viaduct loaded is lifted onto it.
   */
  regroundTraffic() {
    for (const car of this.cars) if (car._edge && !car.controlled && car.id !== this.player.vehicleId) { car.y = undefined;car.transportId = null; }
    this.updateGrounding();
  }

  updateGrounding() {
    // Reuse the same sampled surface as the renderer. Four wheel contact
    // points establish the support plane while suspension remains visual.
    const due = this._kerbTurn = ((this._kerbTurn || 0) + 1) % KERB_GROUNDING_TURNS;
    const turn = this._trafficTurn = ((this._trafficTurn || 0) + 1) % TRAFFIC_GROUNDING_TURNS;
    let kerbside = 0, traffic = 0;
    for (const car of this.cars) {
      // Kerbside cars take turns, so streaming terrain still reaches each one.
      if (car._kerb && Number.isFinite(car.y) && kerbside++ % KERB_GROUNDING_TURNS !== due) continue;
      // So does traffic too far from the player for a centimetre to show.
      if (car._edge && !car.controlled && Number.isFinite(car.y) && traffic++ % TRAFFIC_GROUNDING_TURNS !== turn && distance(car, this.player) > TRAFFIC_GROUNDED_WITHIN) continue;
      const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
      // A new or teleported actor has no previous level. Its first sample is
      // ground-only; carrying an old Y could capture an unrelated overpass.
      // Traffic following a street takes that street's level, so a car put
      // down in the middle of a viaduct is on it and not on the ground below.
      const level = car._edge && !car.controlled ? roadLevelAt(car._edge.road, car.x, car.z) : undefined;
      const options = Number.isFinite(car.y) ? { referenceHeight: car.y, mode: 'drive', transportId: car.transportId, level }
        : level > 13 ? { mode: 'drive', level } : undefined;
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
      const axle = car.identity?.asset?.wheels || WHEEL;
      const rl = height(-axle.x, axle.rear), fl = height(-axle.x, axle.front), rr = height(axle.x, axle.rear), fr = height(axle.x, axle.front);
      car.wheelHeights = [rl, fl, rr, fr];car.wheelSupported = supported;
      car.supportSurface = center || null;car.transportId = center?.transportId || null;
      car.y = (fl + fr + rl + rr) / 4;
      car.pitch = -Math.atan2((fl + fr - rl - rr) / 2, axle.front - axle.rear);
      car.roll = Math.atan2((fr + rr - fl - rl) / 2, axle.x * 2);
    }
    if (this.player.mode === 'transport' || this.room || this.seat) return;
    const vehicle = this.player.mode === 'drive' && this.cars.find(car => car.id === this.player.vehicleId);
    const options = Number.isFinite(this.player.y) ? { referenceHeight: this.player.y, mode: 'walk', transportId: this.player.transportId } : undefined;
    if (vehicle) {
      this.player.y = vehicle.y;
      this.player.transportId = vehicle.transportId || null;
      this.player.vy = 0;
      this.player.grounded = true;
      return;
    }
    // A jump or a fall owns its height until the feet meet a surface again.
    if (this.player.grounded === false || this.player.standing) return;
    const surface = this._sampleSurface?.(this.player.x, this.player.z, options);
    this.player.y = finite(surface?.elevation);
    if (this.doorway && this.player.mode === 'walk' && Math.abs(this.player.y - this.doorway.floor) < 1.6) {
      const at = roomLocal(this.doorway.plan, this.player.x, this.player.z);
      if (at.b < 0 && at.b > -1 && Math.abs(at.a) < DOOR / 2) {
        this.player.y += (this.doorway.floor - this.player.y) * (1 + at.b);
      }
    }
    this.player.transportId = surface?.transportId || null;
    this.player.grounded = true;
    this.player.vy = 0;
  }

  _unsupportedDeckExit(actor, x, z, mode) {
    if (!actor?.transportId || !Number.isFinite(actor.y)) return false;
    const surface = this._sampleSurface?.(x, z, { referenceHeight: actor.y, mode, transportId: actor.transportId });
    return !Number.isFinite(surface?.elevation) || Math.abs(surface.elevation - actor.y) > 1.5;
  }

  _carContact(x, z, angle, actor) {
    let best = null;
    for (const offset of [-CAR_HALF_AXLE, 0, CAR_HALF_AXLE]) {
      const hit = this._contact(x + Math.sin(angle) * offset, z + Math.cos(angle) * offset, CAR_RADIUS, false, actor?.y, actor);
      if (hit && (!best || hit.depth > best.depth)) best = hit;
    }
    return best;
  }

  _nearCar(x, z, radius, ignoredId = null, referenceHeight = undefined) {
    for (const car of this.cars) {
      if (car.id === ignoredId) continue;
      const hit = carContact(car, x, z, radius, referenceHeight);
      if (hit) return hit;
    }
    return null;
  }

  _vehicleHit(car) {
    const dx = Math.sin(car.angle) * CAR_HALF_AXLE, dz = Math.cos(car.angle) * CAR_HALF_AXLE;
    for (const other of this.cars) {
      const reach = 2 * (CAR_HALF_AXLE + CAR_RADIUS);
      if (other === car || Math.abs(other.x - car.x) > reach || Math.abs(other.z - car.z) > reach) continue;
      const hit = carContact(other, car.x + dx, car.z + dz, CAR_RADIUS, car.y)
        || carContact(other, car.x - dx, car.z - dz, CAR_RADIUS, car.y);
      if (hit) return hit;
      // At a T-bone the other car's bumper can touch the middle of this car.
      const ox = Math.sin(other.angle) * CAR_HALF_AXLE, oz = Math.cos(other.angle) * CAR_HALF_AXLE;
      const reverse = carContact(car, other.x + ox, other.z + oz, CAR_RADIUS, other.y)
        || carContact(car, other.x - ox, other.z - oz, CAR_RADIUS, other.y);
      if (reverse) return { car: other, depth: reverse.depth, nx: -reverse.nx, nz: -reverse.nz };
    }
    return null;
  }

  _resolvePosition(x, z, radius, angle = null, previous = null, allowDrop = false, movementDt = 0) {
    // Cars stop at a deck edge. On foot, the same step is allowed through so
    // the walker can leave the deck and fall to whatever is below.
    if (!allowDrop && previous && this._unsupportedDeckExit(previous, x, z, angle === null ? 'walk' : 'drive')) {
      const dx = previous.x - x, dz = previous.z - z, length = Math.hypot(dx, dz) || 1;
      return { x: previous.x, z: previous.z, hit: { kind: 'surface', nx: dx / length, nz: dz / length, depth: 0 } };
    }
    const vx = movementDt ? (x-previous.x)/movementDt : 0, vz = movementDt ? (z-previous.z)/movementDt : 0;
    let hit = null;
    for (let iteration = 0; iteration < 5; iteration++) {
      const contact = angle === null ? this._contact(x, z, radius, false, previous?.y, previous) : this._carContact(x, z, angle, previous);
      if (!contact) break;
      if (contact.kind === 'prop' && movementDt) {
        const retained = this.streetObjects.strike(contact, previous, vx, vz, angle !== null, this.elapsed);
        if (retained !== null) {
          if (previous.controlled || previous._loose > 0) {
            stopVehicleRotation(previous, previous.velocityX * retained, previous.velocityZ * retained);
            const force = -(vx * contact.nx + vz * contact.nz) * (1 - retained);
            impactVehicle(previous, force, contact.nx, contact.nz, this.elapsed);
            if (previous.controlled) this._impact(force, 'prop');
          }
          else {
            previous.speed *= retained;
            if (Number.isFinite(previous.velocityX)) { previous.velocityX *= retained; previous.velocityZ *= retained; }
          }
          continue;
        }
      }
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

  _lanePoint(edge, fraction, lane = 0) {
    // Heading zero faces +Z; the driver's right is -X, not +X. Both road
    // directions therefore occupy their own right-hand lane in NYC traffic.
    // A street with several lanes has them where they are painted: lane 0
    // the right-hand one of a one-way street, or the one beside the centreline.
    const offset = edge.lanes > 1 ? edge.first + edge.step * Math.min(lane, edge.lanes - 1) : edge.lane;
    return { x: edge.from.x + (edge.to.x - edge.from.x) * fraction - Math.cos(edge.angle) * offset, z: edge.from.z + (edge.to.z - edge.from.z) * fraction + Math.sin(edge.angle) * offset };
  }

  /** The lane a car in `lane` of `edge` takes on going into `next`. */
  _laneOnto(edge, next, lane) {
    const turn = turnDelta(edge.angle, next.angle), lanes = next.lanes || 1;
    // Straight on: the same lane, or the nearest there is.
    if (Math.abs(turn) < STRAIGHT_ON) return Math.min(lane, lanes - 1);
    // Round a corner: into the near lane, the right-hand one after a right turn.
    // Lanes count leftward on a one-way street and rightward on a two-way one.
    return (next.step < 0) === (turn < 0) ? 0 : lanes - 1;
  }

  _makeCar(id, type, point, angle, edge = null) {
    const palette = TRAFFIC_PAINT;
    const car = { id, type, x: point.x, z: point.z, angle, speed: 0, color: type === 'taxi' ? YELLOW_CAB : type === 'police' ? '#f1f2e9' : palette[Math.floor(this._random() * palette.length)], parked: !edge, controlled: false, radius: CAR_RADIUS, siren: false, _edge: edge, _route: [], _stuckTime: 0, _cruise: 6 + this._random() * 3, _wait: 0, _steering: 0, _shiftHold: 0 };
    resetVehicleDynamics(car);
    this._serviceIdentity(car);
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

  _seedCars(previousCab) {
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
    if (taxiPoint) {
      const cab = this._makeCar('player-taxi', 'taxi', taxiPoint, taxiAngle);
      if (previousCab) {
        const { type, shape, color, resprays, mods, identity } = previousCab;
        Object.assign(cab, { type, shape, color, resprays, mods, identity: identity ?? cab.identity });
      }
      this.cars.push(cab);
    }
    const edges = this._graph.edges.filter(edge => edge.length > 16);
    if (!edges.length) return;
    for (let i = 0; i < 15; i++) {
      const police = i >= 12;
      for (let attempt = 0; attempt < 50; attempt++) {
        const edge = edges[Math.floor(this._random() * edges.length)];
        const point = this._lanePoint(edge, 0.15 + this._random() * 0.7);
        if (distance(point, spawn) < (police ? 50 : 16) || this._carContact(point.x, point.z, edge.angle) || this._nearCar(point.x, point.z, 5)) continue;
        const car = this._makeCar(`${police ? 'police' : 'traffic'}-${i}`, police ? 'police' : i % 4 === 0 ? 'taxi' : 'sedan', point, edge.angle, edge);
        if (car.type === 'sedan' && this._fleet) this._registeredAppearance(car, true);
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

  /**
   * Keep kerbside parked cars in step with the parking spaces near the player.
   * Spaces are { id, x, z, angle }. A space is skipped if anything is in the
   * way. A parked car the player has driven becomes theirs and is left alone.
   * The same space always holds the same car, and traffic's random sequence
   * is not disturbed.
   * @returns {number} kerbside cars now present
   */
  syncParkedCars(spaces = []) {
    const wanted = new Set(spaces.map(space => space.id));
    let changed = false, present = 0;
    this.cars = this.cars.filter(car => {
      if (!car._kerb) return true;
      if (car.controlled) { car._kerb = false; return true; }
      if (wanted.has(car.id)) { present++; return true; }
      changed = true; return false;
    });
    const ids = new Set(this.cars.map(car => car.id)), sequence = this._rngState;
    for (const space of spaces) {
      if (ids.has(space.id) || !Number.isFinite(space.x) || !Number.isFinite(space.z) || !Number.isFinite(space.angle)) continue;
      // Bumper to bumper is fine; overlapping is not.
      if (distance(space, this.player) < 7 || this._carContact(space.x, space.z, space.angle) || this._nearCar(space.x, space.z, 3.6)) continue;
      const car = this._makeCar(space.id, 'sedan', space, space.angle);
      this._registeredAppearance(car);
      car._kerb = true; this.cars.push(car); ids.add(space.id); present++; changed = true;
    }
    this._rngState = sequence;
    if (changed) this.updateGrounding();
    return present;
  }

  getNearbyCar() {
    if (this.player.mode !== 'walk') return null;
    let nearest = null;
    let best = 5;
    for (const car of this.cars) {
      if (car.type === 'police' || car.controlled || car.destroyed || car.burningSince != null) continue;
      if (!trafficAtHeight(car, this.player.y)) continue;
      const d = distance(this.player, car);
      if (d < best) { nearest = car; best = d; }
    }
    return nearest;
  }

  getNearbyBike(car = this.getNearbyCar()) {
    const p = this.player;
    if (p.mode !== 'walk' || this.room || !p.grounded) return null;
    let nearest = null, reach = Math.min(2.4, car ? distance(car, p) : Infinity);
    const consider = bike => {
      const d = distance(bike, p);
      if (d < reach && Math.abs(p.y - bike.y) < 1.5 && !this.isBlocked(bike.x, bike.z, .5)
          && !this._nearCar(bike.x, bike.z, .5, null, bike.y)) { nearest = bike; reach = d; }
    };
    if (this.bike) consider(this.bike);
    for (const bike of this.dockedBikes || []) if (bike.id !== this.bike?.id) consider(bike);
    return nearest;
  }

  _dismountBike() {
    const p = this.player;
    for (const side of [-1, 1]) {
      const x = p.x + side * Math.cos(p.angle) * .85, z = p.z - side * Math.sin(p.angle) * .85;
      if (this.isBlocked(x, z, PLAYER_RADIUS) || this._nearCar(x, z, PLAYER_RADIUS, null, p.y)
          || this._unsupportedDeckExit(p, x, z, 'walk')) continue;
      Object.assign(this.bike, { x: p.x, y: p.y, z: p.z, angle: p.angle });
      Object.assign(p, { mode: 'walk', x, z, velocityX: 0, velocityZ: 0, speed: 0 });
      this.updateGrounding();
      return true;
    }
    this._say('Move the bike into an open space to get off.');
    return false;
  }

  _say(message, seconds = 4) { this.notice = message; this.noticeTime = seconds; }

  /** A swing on foot. Returns whether the punch comes out; a caller resolves who it hits. */
  fight() {
    const player = this.player;
    if (player.mode !== 'walk' || this.room || this.seat || this.ending || player.move || (player.swing || 0) > 0.08) return false;
    if (player.armed) return fireGun(this);
    player.swing = 0.34;
    player.guard = 4;
    return true;
  }

  /** Take the pistol out or put it away (player-moves.js). */
  draw() { return toggleGun(this); }
  reload() { return reloadGun(this); }

  /** A kick on foot (player-moves.js): slower than a punch, and it lands harder. */
  kick() { return startKick(this); }

  /** Punching someone is a crime. Heat climbs the same way a collision with a patrol does. */
  assault(x, z) {
    return this.offence('assault', { x, z, message: 'Somebody called that in.' });
  }

  /**
   * Something the player has done that the police would come for, if they
   * hear of it (police.js, OFFENCES): seen by a patrol it counts at once, seen
   * by a bystander it counts when their call gets through, and with nobody
   * about it never happened.
   */
  offence(kind, options) { return this.police.offence(kind, options); }

  /** How many people are near enough to a place, and can see it, to tell the police what happened there. */
  witnesses(x, z, reach, y) {
    const at = { x, z }; let count = 0;
    const sees = other => { const d = distance(other, at); return d < reach && (!Number.isFinite(y) || trafficAtHeight(other, y)) && (d < 10 || this._hasSight(other, at)); };
    for (const person of this._people || []) { if (person.state !== 'down' && !person.dead && sees(person) && ++count >= 6) return count; }
    for (const person of this.bystanders) { if (!(person.downUntil > this.elapsed) && sees(person) && ++count >= 6) return count; }
    // Somebody at the wheel sees what happens on the street in front of them.
    for (const car of this.cars) { if (car._edge && !car.parked && !car.controlled && car.type !== 'police' && distance(car, at) < reach * .6 && (!Number.isFinite(y) || trafficAtHeight(car, y)) && ++count >= 6) return count; }
    return count;
  }

  /**
   * Something the police already know of. `amount` is in stars, and parts of a
   * star add up; the report tells them where the player is at this moment.
   * What happens on the street goes through offence(), which needs a witness.
   */
  crime(amount, message = '') {
    this.heat = clamp(this.heat + amount, 0, MAX_STARS);
    this._timeSinceCrime = 0;
    this.police.report();
    if (message) this._say(message);
  }

  /** Stars showing: 0 to 5. */
  get stars() { return this.police.stars; }

  hurt(amount, cause = 'fight') {
    if (!(amount > 0) || this.health <= 0 || this.ending) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this._downed = cause;
  }

  interact() {
    const player = this.player;
    if (this.ending) return false;
    if (player.mode === 'transport') return this.transport.leave();
    if (player.mode === 'bike') return this._dismountBike();
    if (player.mode === 'walk') {
      if (this.seat) return this.stand();
      if (this.room) return false;
      const ride = this._entering ? null : this.transport?.nearby();
      if (ride) return this.transport.board(ride);
      const car = this._entering || this.getNearbyCar();
      const bike = this._entering ? null : this.getNearbyBike(car);
      if (bike) {
        this.bike = { ...bike };
        Object.assign(player, { mode: 'bike', x: bike.x, y: bike.y, z: bike.z, angle: bike.angle, speed: 0, velocityX: 0, velocityZ: 0, vy: 0, slide: 0, swing: 0 });
        this._say('W pedal · A / D steer · S or Space brake · E get off');
        return true;
      }
      if (!car) { this._say('Move closer to a taxi or parked car.'); return false; }
      if (car.destroyed || car.burningSince != null) { this._say(car.destroyed ? 'This car is burned out.' : 'The car is on fire.'); return false; }
      if (vehicleTravelSpeed(car) > 4) { this._say('Wait for the car to slow down.'); return false; }
      // With moves on, getting in takes a moment: a door opened, a window broken or a driver hauled out (player-moves.js).
      if (this.moves && this._entering !== car) return beginEntry(this, car);
      car.controlled = car._driven = true;
      car.parked = true;
      car._loose = 0;
      car._kerb = false;
      car._route = [];
      car.handling = vehicleHandling(car);
      resetVehicleDynamics(car, car.speed);
      Object.assign(player, { mode: 'drive', vehicleId: car.id, x: car.x, z: car.z, angle: car.angle, speed: car.speed, velocityX: car.velocityX, velocityZ: car.velocityZ, vy: 0, grounded: true, slide: 0, swing: 0 });
      this.updateGrounding();
      this._say('W accelerate. S brake / reverse. A / D steer. Space handbrake.');
      return true;
    }
    const car = this.cars.find(item => item.id === player.vehicleId);
    if (!car) { this.reset(); return false; }
    const bailing = vehicleTravelSpeed(car) > 4;
    let spot = null;
    for (const [side, front] of [[2.2, 0], [-2.2, 0], [2.5, -1.8], [-2.5, -1.8], [0, -3.2], [0, 3.2]]) {
      const x = car.x + Math.cos(car.angle) * side + Math.sin(car.angle) * front;
      const z = car.z - Math.sin(car.angle) * side + Math.cos(car.angle) * front;
      const surface = this._sampleSurface?.(x, z, { referenceHeight: car.y, mode: 'walk', transportId: car.transportId });
      // A stopped exit still needs a real surface beside the door. Bailing out
      // of a moving car can leave the deck; the fall that follows is the landing.
      const unsupported = Number.isFinite(car.y) && Math.abs(finite(surface?.elevation) - car.y) > 1.5;
      const blocked = this.isBlocked(x, z, PLAYER_RADIUS) || this._nearCar(x, z, PLAYER_RADIUS, car.id, car.y);
      if (unsupported && !bailing) continue;
      if (blocked && !bailing) continue;
      const candidate = { x, z, surface, unsupported, blocked, side };
      if (!unsupported && !blocked) { spot = candidate; break; }
      if (bailing && !spot) spot = candidate;
    }
    if (!spot) { this._say('Both doors are blocked. Move the car into an open space.'); return false; }
    car.doorSide = Math.sign(spot.side) || 1;
    car.doorOpen = (car.missingDoors & doorPanel(car.doorSide)) ? 0 : 1;
    car.doorHold = bailing ? 3 : .55;
    car.controlled = false;
    car._route = [];
    if (bailing) {
      const travel = vehicleTravelSpeed(car);
      if (Math.hypot(car.velocityX, car.velocityZ) < travel * 0.5) {
        car.velocityX = Math.sin(car.angle) * car.speed;
        car.velocityZ = Math.cos(car.angle) * car.speed;
      }
      car.parked = false;
      car._loose = 3.2;
      const speed = Math.hypot(car.velocityX, car.velocityZ);
      Object.assign(player, {
        x: spot.x, z: spot.z, y: Number.isFinite(car.y) ? car.y : player.y, mode: 'walk', vehicleId: null,
        transportId: spot.unsupported ? null : (car.transportId || null),
        speed, velocityX: car.velocityX, velocityZ: car.velocityZ,
        vy: Math.min(3.2, 1.4 + speed * 0.06), grounded: false, slide: Math.min(1.15, 0.3 + speed * 0.05), swing: 0,
      });
      this._say('You bailed out. The car is still rolling.');
    } else {
      car.parked = true;
      car._loose = 0;
      resetVehicleDynamics(car);
      Object.assign(player, { x: spot.x, z: spot.z, mode: 'walk', vehicleId: null, transportId: car.transportId || null, speed: 0, velocityX: 0, velocityZ: 0, vy: 0, grounded: true, slide: 0, swing: 0 });
      if (this.moves) {
        const from = { x:car.x+.38*Math.cos(car.angle), z:car.z-.38*Math.sin(car.angle) };
        player.move = { kind:'getOut', t:0, T:.55, car:car.id, from, to:{ x:spot.x,z:spot.z } };
        Object.assign(player,from);
        player.angle = Math.atan2(spot.x-from.x,spot.z-from.z);
      }
      this._say('On foot. Shift runs. Space jumps. F punches.');
    }
    this.updateGrounding();
    return true;
  }

  startMission(food = null) {
    if (this.mission.phase === 'active') { this._say('Finish your current delivery first.'); return false; }
    const all = (this.city.missionPoints || []).filter(point => Number.isFinite(point.x) && Number.isFinite(point.z) && !this.isBlocked(point.x, point.z, 1));
    const origin = food?.pickup || this.player;
    let options = all.filter(point => distance(point, origin) > 45 && point.name !== this._lastTarget);
    if (!options.length) options = all.filter(point => distance(point, origin) > 20);
    if (!options.length) { this._say('No reachable delivery destination is available.'); return false; }
    const target = options[Math.floor(this._random() * options.length)];
    const routeDistance = distance(origin, target) + distance(this.player, origin);
    const totalTime = Math.round(clamp(55 + routeDistance / 7, 65, 180));
    const reward = Math.round((120 + routeDistance * 0.45) / 5) * 5;
    this.mission = { phase: 'active', target: { ...target }, timeLeft: totalTime, totalTime, reward };
    if (food) {
      Object.assign(this.mission, { meal: food.meal, dropoff: { ...target }, target: { ...food.pickup }, stage: 'pickup',
        reward: 15 + Math.round(Math.min(distance(origin, target), 2500) * .025) });
      this.mission.totalTime = this.mission.timeLeft = Math.max(totalTime, 90 + Math.ceil(routeDistance / 4));
    }
    this._lastTarget = target.name;
    this._say(food ? `Pick up ${food.meal} at ${origin.name}. Stop at the gold marker.` : `Delivery accepted: ${target.name}. Follow the gold marker and stop inside it.`, 7);
    return true;
  }

  startPaperRoute() {
    if(this.mission.phase==='active' || this.player.mode==='passenger'){
      this._say('Finish your current trip first.');return false;
    }
    const stops=[];
    let last=this.player, length=0;
    const blocks=(this.city.missionPoints||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&distance(p,this.player)<1200);
    while(stops.length<3){
      const options=blocks.filter(p=>distance(p,this.player)>30 && stops.every(stop=>distance(stop,p)>35)
        && !this.isBlocked(p.x,p.z,.6)).sort((a,b)=>distance(last,a)-distance(last,b));
      if(!options.length)break;
      const next=options[Math.floor(this._random()*Math.min(3,options.length))];
      length+=distance(last,next);stops.push(next);last=next;
    }
    if(stops.length<2){this._say('No paper round available on these blocks.');return false;}
    const totalTime=90+Math.ceil(length/2.8);
    this.mission={phase:'active',kind:'paper',stops,index:0,target:stops[0],reward:stops.length*18,totalTime,timeLeft:totalTime};
    this._say('Papers loaded. Take the first bundle to '+stops[0].name+'.',6);
    return true;
  }

  reset() {
    if (this.transport?.active) {
      const stop = this.transport.active.home;
      this._restoreCondition();
      try { this.travelTo({ ...stop.board, name:stop.place, exact:true }); }
      catch { this._say('Recovered aboard. Use the phone to travel to a boarding point.'); }
      return;
    }
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
    if (car) { car.controlled = false; car.parked = true; car._loose = 0; resetVehicleDynamics(car); }
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
    Object.assign(this.player, { ...point, y: undefined, transportId: null, angle: this.city.spawn.angle || 0, speed: 0, mode: 'walk', vehicleId: null, velocityX: 0, velocityZ: 0, vy: 0, grounded: true, slide: 0, swing: 0 });
    this.updateGrounding();
    this._restoreCondition();
    this._say('Recovered nearby. Your earnings and completed deliveries are saved.');
  }

  _restoreCondition() {
    this.shopping.interrupt();
    this.room = null; this.seat = null; this.doorway = null;
    if (this.player.mode === 'bike') this.player.mode = 'walk';
    this.bike = null;
    this._downed = null; this.ending = null;
    this.player.armed = false; this.player.reloading = 0; this.player.standing = null;
    this.health = 100;
    this.heat = 0;
    this.spotted = false;
    this.police.clear();
    this._timeSinceCrime = 100;
    this._impactCooldown = 0;
    if (this.mission.phase === 'active') this.mission.phase = 'failed';
  }

  recoverAt(facility, message) {
    this._accumulator = 0;
    if (this.onRecovery) this._restoreCondition();
    else this.reset();
    this._say(this.onRecovery ? `${message} Heading to the ${facility}…` : message, 7);
    this.onRecovery?.({ facility, message });
  }

  step(input = {}, dt = 0) {
    // A fixed accumulator makes handling independent of display refresh rate.
    // Capping a background-tab pause avoids simulating a long unattended chase.
    this._accumulator += clamp(finite(dt), 0, 0.25);
    const normalized = { forward: clamp(finite(input.forward), -1, 1), turn: clamp(finite(input.turn), -1, 1), lift: clamp(finite(input.lift), -1, 1), moveX: clamp(finite(input.moveX), -1, 1), moveZ: clamp(finite(input.moveZ), -1, 1), brake: Boolean(input.brake), handbrake: Boolean(input.handbrake), run: Boolean(input.run) };
    while (this._accumulator + 1e-10 >= FIXED_STEP) {
      this._accumulator -= FIXED_STEP;
      this._tick(normalized, FIXED_STEP);
    }
  }

  _tick(input, dt) {
    this.elapsed += dt;
    this.shopping.tick();
    if (this.streetObjects.moving.size) this.streetObjects.step(dt,
      (x,z,r,y)=>this._contact(x,z,r,false,y), (x,z)=>this.groundHeight(x,z));
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    this._impactCooldown = Math.max(0, this._impactCooldown - dt);
    this._timeSinceCrime += dt;
    const before = { x: this.player.x, z: this.player.z };
    if (this.ending) {
      this.ending.t += dt;
      if (this.ending.t >= this.ending.T) { const ending = this.ending; this.ending = null; ending.finish(); return; }
      // Nobody is at the controls: a car rolls on, somebody on foot stays where they are.
      input = STILL;
    }
    const jumping = Boolean(input.handbrake) && !this._jumpHeld;
    this._jumpHeld = Boolean(input.handbrake);
    if (this.player.swing > 0) this.player.swing = Math.max(0, this.player.swing - dt);
    if (this.player.mode === 'drive') {
      this._drive(input, dt);
      const vehicle = this.cars.find(car => car.id === this.player.vehicleId);
      if (vehicle) { this._watchSignals(vehicle); this._hitPeople(vehicle); }
    } else {
      if (this.player.mode === 'transport') this.transport.step(input,dt);
      else if (this.player.mode === 'bike') this._cycle(input, dt);
      else this._walk(input, dt, jumping);
      this._insideJunction = null;
    }
    this.distanceTravelled += distance(before, this.player);
    this._trafficTimer = (this._trafficTimer || 0) - dt;
    if (this._trafficTimer <= 0) { this._trafficTimer = .5; this._balanceTraffic(); }
    for (const car of this.cars) {
      if (car.burningSince != null) {
        if (car.evacuating && this.elapsed-car.burningSince > 1 && Math.abs(car.speed) < 5) {
          car.evacuating = false; car.driverEjected = true; car.doorSide = 1;
          car.doorOpen = car.missingDoors & doorPanel(1) ? 0 : 1; car.doorHold = 1.5;
          const x = car.x + 1.55*Math.cos(car.angle), z = car.z - 1.55*Math.sin(car.angle);
          (this.moveEvents ||= []).push({ kind:'escapeFire', x, z, car, heading:car.angle+Math.PI/2 });
        }
        if (stepVehicleFire(car, this.elapsed)) {
          resetVehicleDynamics(car);
          car.explodedAt = this.elapsed;
          const p = this.player, distance = Math.hypot(car.x-p.x, (car.y||0)-(p.y||0), car.z-p.z);
          if (distance < 7) this.hurt(100 * (1 - distance / 7), 'fire');
        } else if (car.controlled && this.elapsed - car.burningSince < 1) this._say('Engine fire. Get out of the car!', 4);
        else if (!car.controlled && !car.parked && !(car._loose > 0)) {
          resetVehicleDynamics(car, car.speed); car._loose = 2; car._edge = null;
        }
      }
      if (car.destroyed) continue;
      if (car.doorOpen > 0 && this.player.move?.car !== car.id) {
        car.doorHold = Math.max(0, (car.doorHold || 0) - dt);
        if (!car.doorHold) car.doorOpen = Math.max(0, car.doorOpen - 2 * dt);
      }
      if (car.doorOpen > .3) {
        const reach = car.doorSide * (.9 + .95 * Math.sin(car.doorOpen * 1.05));
        const x = car.x + Math.cos(car.angle) * reach, z = car.z - Math.sin(car.angle) * reach;
        const other = this._nearCar(x, z, .18, car.id, car.y)?.car;
        const obstacle = Math.abs(car.speed) > 4 && this._contact(x, z, .18, false, car.y, car);
        const relativeSpeed = other ? Math.hypot(Math.sin(car.angle)*car.speed-Math.sin(other.angle)*other.speed,
          Math.cos(car.angle)*car.speed-Math.cos(other.angle)*other.speed) : 0;
        if (relativeSpeed > 4 || obstacle && ['building','prop'].includes(obstacle.kind)) tearDoor(car);
      }
      if (car._shoved && car.parked && !(car._loose > 0) && !car.controlled) this._recover(car);
      if (car.controlled || (car.parked && !(car._loose > 0))) continue;
      const x = car.x, z = car.z, angle = car.angle;
      if (car._loose > 0) this._coast(car, dt);
      else if (!(car.type === 'police' && this.police.drive(car, dt))) this._traffic(car, dt);
      if (car.x === x && car.z === z && car.angle === angle) continue;
      const hit = this._vehicleHit(car);
      if (hit) {
        // Reject the approaching pose. A car already touching can pull away.
        if ((car.x - x) * hit.nx + (car.z - z) * hit.nz <= 0) {
          const other = hit.car, loose = car._loose > 0;
          const vx = loose ? car.velocityX : Math.sin(car.angle) * car.speed;
          const vz = loose ? car.velocityZ : Math.cos(car.angle) * car.speed;
          const dynamic = other.controlled || other._loose > 0;
          const ox = dynamic ? other.velocityX : Math.sin(other.angle) * other.speed;
          const oz = dynamic ? other.velocityZ : Math.cos(other.angle) * other.speed;
          const closing = (ox - vx) * hit.nx + (oz - vz) * hit.nz;
          if (closing > 1 && !other.parked && !other.controlled) {
            resetVehicleDynamics(other, other.speed * .6); other._wait = .25;
          }
          impactVehicle(car, closing*collisionLoad(car,other), hit.nx, hit.nz, this.elapsed);
          impactVehicle(other, closing*collisionLoad(other,car), -hit.nx, -hit.nz, this.elapsed);
          if (other.controlled) this._impact(closing, car.type === 'police' ? 'police' : 'vehicle');
          car.x = x; car.z = z; car.angle = angle;
          resetVehicleDynamics(car); car._wait = .35;
        }
      }
      this._hitPeople(car);
    }
    this.updateGrounding();
    this.police.update(dt);
    this._updateMission(dt);
    if (this.health <= 0 && !this.ending) {
      const cause = this._downed || 'wreck';
      const reason = { fire: 'Caught in a vehicle fire.', fight: 'You got knocked out.', police: 'Shot by the police.', fall: 'That fall put you down.', traffic: 'You were run down.' };
      this.end('wasted', cause === 'wreck' ? 'Your car was wrecked.' : reason[cause] || 'You were injured.', () => {
        const charge = Math.min(this.cash, cause === 'wreck' ? 75 : 40);
        this.cash -= charge;
        this.recoverAt('hospital', cause === 'wreck' ? `Your car was wrecked. Repairs cost $${charge}.` : `${reason[cause] || 'You were injured.'} Hospital bill $${charge}.`);
      });
    }
  }

  /**
   * The player is finished for now: dead ('wasted') or in handcuffs ('busted').
   * With `endingSeconds` set, the world runs on for that long with nobody at
   * the controls, so that it can be watched, and then `finish` deals with what
   * comes after; without it, that happens at once.
   */
  end(kind, line, finish) {
    if (this.ending) return;
    if (!(this.endingSeconds > 0)) { finish(); return; }
    this.ending = { kind, line, t: 0, T: this.endingSeconds, finish };
    if (this.player.move) { this.player.move = null; this.player.lift = 0; }
  }

  _hitPeople(car) {
    const speed = vehicleTravelSpeed(car);
    if (!(speed > .02)) return;
    if (!car.controlled && !this.room && this.player.mode !== 'drive' && this.player.mode !== 'transport') this._hitPerson(car, this.player, speed);
    // A crowd that answers for itself (crowd.js) is thrown, staggered and scared there.
    if (!this.peopleReact) for (const person of this._people || []) this._hitPerson(car, person, speed);
    for (const person of this.bystanders) this._hitPerson(car, person, speed, true);
  }

  _hitPerson(car, person, speed, bystander = false) {
    const hit = carContact(car, person.x, person.z, PLAYER_RADIUS, person.y);
    if (!hit) return;
    const player = person === this.player, hard = speed > 3;
    const first = !(person.trafficHitUntil > this.elapsed);
    const push = hit.depth + (hard && first ? .55 : .015);
    const next = this._resolvePosition(person.x + hit.nx * push, person.z + hit.nz * push, PLAYER_RADIUS, null, person);
    person.x = next.x; person.z = next.z;
    person.trafficHitUntil = this.elapsed + .7;
    if (player) {
      if (hard && first) this.hurt(Math.min(36, speed * 1.5), 'traffic');
    } else if (person.state !== 'down' && !(person.downUntil > this.elapsed)) {
      if (bystander) {
        person.sitting = false;
        if (hard) person.downUntil = this.elapsed + 3;
      } else {
        person.state = hard ? 'down' : 'flee'; person.down = hard ? 3 : 0; person.mad = 2;
      }
      if (hard && first && car.controlled) this.offence('runDown', { x: person.x, y: person.y, z: person.z, message: 'Pedestrian collision reported.' });
    }
    if ((first && hard) || next.hit) {
      const trapped = next.hit && carContact(car, person.x, person.z, PLAYER_RADIUS, person.y);
      if (trapped) {
        const corrected = this._resolvePosition(car.x - trapped.nx * trapped.depth, car.z - trapped.nz * trapped.depth, CAR_RADIUS, car.angle, car);
        car.x = corrected.x; car.z = corrected.z;
      }
      const factor = next.hit ? 0 : .65;
      if (car.controlled || car._loose > 0) stopVehicleRotation(car, car.velocityX * factor, car.velocityZ * factor);
      else car.speed *= factor;
      if (car.controlled) Object.assign(this.player, { x: car.x, z: car.z, speed: car.speed, velocityX: car.velocityX, velocityZ: car.velocityZ });
    }
  }

  /** A car someone just jumped out of keeps its speed, then rolls to a stop. */
  _coast(car, dt) {
    car._loose -= dt;
    const drag = Math.exp(-0.45 * dt);
    car.velocityX *= drag;
    car.velocityZ *= drag;
    const speed = Math.hypot(car.velocityX, car.velocityZ);
    car.speed = speed;
    if (car._spin) { car.angle += car._spin * dt; car._spin *= Math.exp(-2.2 * dt); if (Math.abs(car._spin) < .02) car._spin = 0; }
    const next = this._resolvePosition(car.x + car.velocityX * dt, car.z + car.velocityZ * dt, CAR_RADIUS, car.angle, car, false, dt);
    if (next.hit) {
      if (next.hit.kind === 'building' || next.hit.kind === 'prop') impactVehicle(car, -(car.velocityX * next.hit.nx + car.velocityZ * next.hit.nz), next.hit.nx, next.hit.nz, this.elapsed);
      car.velocityX *= 0.45; car.velocityZ *= 0.45; car.speed = Math.hypot(car.velocityX, car.velocityZ); }
    car.x = next.x;
    car.z = next.z;
    if (car._loose <= 0 || speed < 0.7) {
      car._loose = 0;
      car.parked = true;
      resetVehicleDynamics(car);
    }
  }

  _cycle(input, dt) {
    const p = this.player;
    const acceleration = input.brake || input.handbrake || input.forward < 0 ? -8 : input.forward * 3.5 - .4 - .035 * p.speed * p.speed;
    p.speed = clamp(p.speed + acceleration * dt, 0, 10);
    p.angle -= input.turn * clamp(p.speed * .7, .65, 2) * dt;
    p.velocityX = Math.sin(p.angle) * p.speed;
    p.velocityZ = Math.cos(p.angle) * p.speed;
    const next = this._resolvePosition(p.x + p.velocityX * dt, p.z + p.velocityZ * dt, .55, null, p, false, dt);
    if (next.hit || this._nearCar(next.x, next.z, .55, null, p.y)) {
      p.speed = p.velocityX = p.velocityZ = 0;
      return;
    }
    p.x = next.x; p.z = next.z;
  }

  _walk(input, dt, jumping = false) {
    const player = this.player;
    // A kick, a vault, a climb or a car door owns the player until it is done.
    if (this.seat) {
      stepSeating(player, this.seat, dt);
      if (this.room) Object.assign(this.room, roomLocal(this.room, player.x, player.z));
      if (this.seat.leaving && this.seat.progress === 0) this.seat = null;
      return;
    }
    if (stepMove(this, dt) || player.mode !== 'walk') return;
    if (jumping && this.moves && tryVault(this)) return;
    // Standing on a car, the player goes where it goes.
    const stood = player.standing;
    if (stood) {
      const car = player.grounded !== false && this.cars.find(item => item.id === stood.id);
      if (car) { player.x += car.x - stood.x; player.z += car.z - stood.z; stood.x = car.x; stood.z = car.z; }
      else player.standing = null;
    }
    const magnitude = Math.hypot(input.moveX, input.moveZ);
    const divisor = Math.max(1, magnitude);
    // Fed or with a coffee inside them, the player walks and runs a little faster.
    this.pep = Math.max(0, (this.pep || 0) - dt);
    const topSpeed = (input.run ? 8.6 : 4.25) * (this.pep > 0 ? 1.15 : 1);
    const desiredX = input.moveX / divisor * topSpeed;
    const desiredZ = input.moveZ / divisor * topSpeed;
    const air = player.grounded === false;
    const sliding = (player.slide || 0) > 0;
    if (sliding) player.slide = Math.max(0, player.slide - dt);
    // A bail-out slide keeps its momentum. In the air, steering still works, just less of it.
    const blend = 1 - Math.exp(-(sliding ? 1.8 : air ? 4 : 13) * dt);
    if (sliding) {
      player.velocityX = player.velocityX * (1 - blend) + desiredX * blend * 0.35;
      player.velocityZ = player.velocityZ * (1 - blend) + desiredZ * blend * 0.35;
    } else {
      player.velocityX += (desiredX - player.velocityX) * blend;
      player.velocityZ += (desiredZ - player.velocityZ) * blend;
    }
    if (magnitude > 0.02 && !sliding) player.angle += turnDelta(player.angle, Math.atan2(desiredX, desiredZ)) * (1 - Math.exp(-16 * dt));
    const view = this.doorway, room = this.room || view?.plan;
    if (room) {
      const at = roomLocal(room, player.x, player.z);
      const db = -(player.velocityX * room.nx + player.velocityZ * room.nz) * dt;
      const skew = room.skew || 0;
      const da = (player.velocityX * room.tx + player.velocityZ * room.tz) * dt - skew * db;
      const b = at.b + db, a = at.a + da;
      const passage = Math.abs(a) <= DOOR / 2 - .10 && at.b >= -1.1 && b > -1.1 && b < .65;
      if (this.room || passage && (player.grounded !== false && Math.abs(player.y - view.floor) < 1.6)) {
        const moved = passage ? { a, b } : walkRoom(room, at.a, at.b, da, db, PLAYER_RADIUS);
        if (!this.room && view?.closed) moved.b=Math.min(moved.b,-.01);
        if (passage && Math.abs(b) < PLAYER_RADIUS) {
          const gap = DOOR / 2 - Math.sqrt(PLAYER_RADIUS ** 2 - b ** 2);
          moved.a = clamp(a + skew * b, -gap, gap) - skew * b;
        }
        if (view) {
          view.door.push(at.a + skew * at.b, at.b, moved.a + skew * moved.b, moved.b, PLAYER_RADIUS, dt);
          if (moved.b >= 0) player.y = view.floor;
        }
        const [x, z] = roomPoint(room, moved.a, moved.b);
        player.speed = Math.hypot(x - player.x, z - player.z) / dt;
        Object.assign(player, { x, z, vy: 0, grounded: true, slide: 0 });
        if (!this.room && moved.b >= 0) this.enterRoom(room, moved);
        if (this.room) {
          this.room.a = moved.a; this.room.b = moved.b;
          if (moved.b < 0) this.leaveRoom();
        }
        return;
      }
    }
    let next = this._resolvePosition(player.x + player.velocityX * dt, player.z + player.velocityZ * dt, PLAYER_RADIUS, null, player, true, dt);
    const carHit = this._nearCar(next.x, next.z, PLAYER_RADIUS, null, player.y);
    // High enough to be on it or over it, a car is not in the way.
    if (carHit && !(player.y > carHit.car.y + .8)) {
      next = this._resolvePosition(next.x + carHit.nx * (carHit.depth + 0.001), next.z + carHit.nz * (carHit.depth + 0.001), PLAYER_RADIUS, null, player, true);
    }
    player.speed = Math.hypot(next.x - player.x, next.z - player.z) / dt;
    if (next.hit) {
      const inward = player.velocityX * next.hit.nx + player.velocityZ * next.hit.nz;
      if (inward < 0) { player.velocityX -= inward * next.hit.nx; player.velocityZ -= inward * next.hit.nz; }
    }
    player.x = next.x;
    player.z = next.z;
    this._fall(player, dt, jumping);
  }

  /** Jump, step down a curb, or fall off a ledge. Grounded feet are seated by updateGrounding. */
  _fall(player, dt, jumping) {
    const surface = this._sampleSurface?.(player.x, player.z, {
      referenceHeight: Number.isFinite(player.y) ? player.y : 0,
      mode: 'walk',
      transportId: player.transportId || null,
    });
    let ground = Number.isFinite(surface?.elevation) ? surface.elevation : (this._sampleSurface ? null : 0);
    // A car underfoot is ground too.
    const under = this.moves && Number.isFinite(player.y) ? carUnder(this, player.x, player.z, player.y) : null;
    if (under && (ground === null || under.top > ground)) ground = under.top;
    else if (player.grounded !== false) player.standing = null;
    if (player.grounded !== false) {
      if (under && ground === under.top && !jumping && Math.abs(ground - player.y) <= STEP_DROP) {
        player.y = ground;
        if (player.standing?.id !== under.car.id) player.standing = { id: under.car.id, x: under.car.x, z: under.car.z };
      }
      if (jumping) {
        player.vy = JUMP_SPEED;
        player.grounded = false;
        player.y = (Number.isFinite(player.y) ? player.y : ground || 0) + player.vy * dt;
        return;
      }
      if (ground !== null && Number.isFinite(player.y) && ground < player.y - STEP_DROP) {
        player.grounded = false;
        player.transportId = null;
        player.vy = Math.min(0, player.vy || 0) - GRAVITY * dt;
        player.y += player.vy * dt;
      }
      return;
    }
    player.vy = Math.max(-32, (player.vy || 0) - GRAVITY * dt);
    player.y = (Number.isFinite(player.y) ? player.y : 0) + player.vy * dt;
    if (ground === null || player.vy > 0 || player.y > ground) return;
    const impact = -player.vy;
    player.y = ground;
    player.vy = 0;
    player.grounded = true;
    player.transportId = surface?.transportId || null;
    player.standing = under && ground === under.top ? { id: under.car.id, x: under.car.x, z: under.car.z } : null;
    if (impact > FALL_HURT) {
      this.health = Math.max(0, this.health - (impact - (FALL_HURT - 1)) * 3.5);
      if (this.health <= 0) this._downed = 'fall';
      else this._say(impact > 16 ? 'That was a bad fall.' : 'You landed hard.');
      player.slide = Math.max(player.slide || 0, 0.35);
    }
  }

  _drive(input, dt) {
    const car = this.cars.find(item => item.id === this.player.vehicleId);
    if (!car) { this.reset(); return; }
    const previousAngle = car.angle;
    if (car.destroyed) resetVehicleDynamics(car);
    else {
      const factor = car.burningSince != null || car.damage >= 1 ? 0 : 1 - Math.max(0, (car.damage || 0) - .45) * 1.4;
      stepVehicleDynamics(car, factor === 1 || car.speed * input.forward < 0 ? input : { ...input, forward: input.forward * factor }, dt);
    }
    const next = this._resolvePosition(car.x + car.velocityX * dt, car.z + car.velocityZ * dt, CAR_RADIUS, car.angle, car, false, dt);
    if (next.hit) {
      const approach = -(car.velocityX * next.hit.nx + car.velocityZ * next.hit.nz);
      const loadingBoundary = next.hit.kind === 'boundary' || next.hit.kind === 'loading' || next.hit.kind === 'water' || next.hit.kind === 'surface';
      if (approach > 0.3) {
        // Lateral impacts count too. Loading and geographic limits never cause
        // damage or heat, and must not store motion that launches after loading.
        if (!loadingBoundary) { this._impact(approach, 'building'); impactVehicle(car, approach, next.hit.nx, next.hit.nz, this.elapsed); }
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
    const collision = this._vehicleHit(car);
    if (collision) {
      const otherX = Math.sin(collision.car.angle) * collision.car.speed;
      const otherZ = Math.cos(collision.car.angle) * collision.car.speed;
      const relativeSpeed = Math.max(0, -((car.velocityX - otherX) * collision.nx + (car.velocityZ - otherZ) * collision.nz));
      impactVehicle(car, relativeSpeed*collisionLoad(car,collision.car), collision.nx, collision.nz, this.elapsed);
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
      this._knock(collision.car, car, collision, relativeSpeed, otherX, otherZ);
      stopVehicleRotation(car, velocityX, velocityZ);
    }
    Object.assign(this.player, { x: car.x, z: car.z, angle: car.angle, speed: car.speed, velocityX: car.velocityX, velocityZ: car.velocityZ, vy: 0, grounded: true });
  }

  /**
   * What being driven into does to a car: it is dented by how hard, and hit
   * hard enough it is shoved off its line and turned, to roll to a stop where
   * it will. Whoever was driving it sits a while before going on, and a car
   * hit too often does not go on at all.
   */
  _knock(other, by, contact, speed, otherX, otherZ) {
    impactVehicle(other, speed*collisionLoad(other,by), -contact.nx, -contact.nz, this.elapsed);
    if (other.destroyed) return;
    const patrol = other.type === 'police' && !other._abandoned;
    if (patrol || speed < 4.5 || other.controlled) {
      resetVehicleDynamics(other, other.speed * 0.55);
      other._wait = 0.7;
      return;
    }
    const push = collisionLoad(other,by) * Math.max(0, -((by.velocityX - otherX) * contact.nx + (by.velocityZ - otherZ) * contact.nz));
    const moving = Boolean(other._edge) && !other.parked && !other._kerb;
    resetVehicleDynamics(other);
    other.velocityX = otherX * .45 - contact.nx * push * .62 + by.velocityX * .12;
    other.velocityZ = otherZ * .45 - contact.nz * push * .62 + by.velocityZ * .12;
    other.speed = Math.hypot(other.velocityX, other.velocityZ);
    // Caught off its middle, it turns as it goes.
    const rx = by.x - other.x, rz = by.z - other.z, twist = rx * contact.nz - rz * contact.nx;
    other._spin = clamp(twist * push * .09, -1.7, 1.7);
    other._loose = 2.4;
    if (moving || other._shoved) { other._shoved = true; other._restUntil = this.elapsed + 5 + other.damage * 9; }
  }

  /** The player's car loses some of its speed to something soft it has hit. */
  brush(factor) {
    const car = this.player.mode === 'drive' && this.cars.find(item => item.id === this.player.vehicleId);
    if (car) stopVehicleRotation(car, car.velocityX * factor, car.velocityZ * factor);
  }

  /** A car that was knocked off the road and has sat long enough goes on its way, if it still can. */
  _recover(car) {
    if (car.damage >= 1) { car._shoved = false; car._wrecked = true; car._edge = null; car._route = []; return; }
    if (this.elapsed < car._restUntil || distance(car, this.player) < 5) return;
    car._shoved = false; car.parked = false;
    this.police._rebind(car);
  }

  _impact(speed, kind) {
    if (this._impactCooldown > 0 || speed < 4) return;
    this._impactCooldown = 0.8;
    this.health = Math.max(0, this.health - Math.max(1, (speed - 3) * 0.75));
    if (speed > 9 || kind === 'police') {
      // In a chase the patrols do the ramming, and each knock counts for less.
      const chased = this.police.state === 'chase';
      this.offence(kind === 'police' ? 'ramPatrol' : kind === 'vehicle' ? 'collision' : 'reckless',
        { message: chased ? '' : kind === 'police' ? 'You hit a patrol car. Get out of sight to lose them.' : 'Reckless driving reported. Get out of sight to lose them.' });
    }
  }

  _pickNextEdge(car) {
    const edge = car._edge;
    if (car.type === 'police' && this.heat > 0.05 && car._route.length) {
      const next = car._route.shift();
      if (next.from.id === edge.to.id) return next;
      car._route = [];
    }
    let options = edge.to.edges.filter(option => option.to.id !== edge.from.id);
    if (!options.length) return edge.to.edges[0] || null;
    // Nobody turns into a block that a standing car has shut, if there is another way.
    const open = options.filter(option => !(this.elapsed - option._blockedAt < BLOCK_MEMORY));
    if (open.length) options = open;
    // Where there are several lanes a turn is made from the lane on that side,
    // and the lanes between carry on. A patrol goes where it likes.
    if (edge.lanes > 1 && car.type !== 'police') {
      const lane = Math.min(car._lane || 0, edge.lanes - 1), last = lane === edge.lanes - 1;
      const right = edge.step < 0 ? lane === 0 : last, left = edge.step < 0 ? last : lane === 0;
      const lawful = options.filter(option => { const turn = turnDelta(edge.angle, option.angle); return Math.abs(turn) < STRAIGHT_ON || (turn < 0 ? right : left); });
      if (lawful.length) options = lawful;
    }
    let total = 0;
    const weighted = options.map(option => {
      const turn = Math.abs(turnDelta(edge.angle, option.angle));
      // Most traffic goes straight on, and more of it turns onto a wide street than off one.
      const weight = (turn < 0.25 ? 3 : 1) * clamp(finite(option.road.width, 10) / finite(edge.road.width, 10), .5, 2.5);
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
    // Once the game has said how much traffic there should be, it is kept near the player.
    if (this._trafficMix) return this._joinTraffic(car);
    // The OSM extract clips streets at its borders. Let cars leave and enter
    // outside the player's view so finite one-way streets do not fill with
    // permanently stopped traffic. Both locations remain on legal road lanes.
    let entrances = this._graph.edges.filter(edge => this._atBoundary(edge.from, 8) && !this._atBoundary(edge.to, 8));
    if (!entrances.length) entrances = this._graph.edges.filter(edge => edge.length > 20);
    for (let i = 0; i < Math.min(30, entrances.length * 2); i++) {
      const edge = entrances[Math.floor(this._random() * entrances.length)];
      const point = this._lanePoint(edge, clamp(9 / edge.length, 0.15, 0.75));
      if (distance(point, this.player) < 120 || this._carContact(point.x, point.z, edge.angle) || this._nearCar(point.x, point.z, 6, car.id)) continue;
      Object.assign(car, { x: point.x, z: point.z, y: undefined, transportId: null, angle: edge.angle, speed: car._cruise * 0.6, _edge: edge, _route: [], _stuckTime: 0, _steering: 0, _shiftHold: 0, _halted: null });
      resetVehicleDynamics(car, car.speed);
      return true;
    }
    return false;
  }

  _traffic(car, dt) {
    if (!car._edge) return;
    car.siren = car.type === 'police' && this.heat > 0.05;
    car._wait = Math.max(0, car._wait - dt);
    let edge = car._edge, lane = car._lane || 0;
    let start = this._lanePoint(edge, 0, lane), end = this._lanePoint(edge, 1, lane);
    let projection = closestOnSegment(car.x, car.z, start.x, start.z, end.x, end.z);
    if (this._atBoundary(edge.to) && distance(car, end) < 7) {
      if (!this._recycleTraffic(car)) car.speed = Math.max(0, car.speed - 16 * dt);
      return;
    }
    if ((projection.t > 0.96 && distance(car, end) < 5) || distance(car, end) < 2.8) {
      const next = this._pickNextEdge(car);
      if (next) {
        lane = car._lane = this._laneOnto(edge, next, lane);
        edge = car._edge = next;
        start = this._lanePoint(edge, 0, lane); end = this._lanePoint(edge, 1, lane);
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
    const target = this._lanePoint(edge, clamp(projection.t + lookAhead / edge.length, 0, 1), lane);
    // A patrol held up behind traffic goes round it on the wrong side of the road.
    if (car._passing > 0) { car._passing -= dt; target.x += Math.cos(edge.angle) * 2.7; target.z -= Math.sin(edge.angle) * 2.7; }
    const desiredAngle = Math.atan2(target.x - car.x, target.z - car.z);
    const delta = turnDelta(car.angle, desiredAngle);
    car.angle += clamp(delta, -1.9 * dt, 1.9 * dt);
    let desiredSpeed = (car.siren ? this.police.cruise() : car._cruise) / (1 + Math.abs(delta) * 1.8);
    if (car._wait > 0) desiredSpeed = 0;
    // Signals and stop signs. A patrol answering a call goes through.
    const plan = edge.to.plan;
    if (plan && edge.arrives >= 0 && !car.siren) {
      // From the car's nose to the stop line.
      const gap = (1 - projection.t) * edge.length - stopDistance(plan, edge.arrives) - 2.3;
      if (gap > -1.5 && gap < 45) {
        const { aspect } = vehicleAspect(plan, edge.arrives, this.elapsed);
        // Yellow: stop if that can be done gently, otherwise clear the junction.
        if (aspect === 'red' || (aspect === 'yellow' && gap > car.speed * 1.4)) desiredSpeed = Math.min(desiredSpeed, Math.max(0, gap * 1.1));
        else if (aspect === 'stop' && car._halted !== edge.id) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, gap * 1.1));
          // A full stop at the line, a look both ways, then on.
          if (gap < 1 && car.speed < .3) { car._halted = edge.id; car._wait = 1; }
        }
      }
    }
    let leader = null;
    const sin = Math.sin(car.angle), cos = Math.cos(car.angle), sight = 6 + car.speed * 0.55, reach = sight + 2, level = Number.isFinite(car.y);
    for (const other of this.cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
      if (level && !trafficAtHeight(other, car.y)) continue;
      const along = dx * sin + dz * cos;
      const across = Math.abs(dx * cos - dz * sin);
      if (along > 0 && along < sight && across < 1.95) {
        // From two stars a patrol does not brake for the car it is chasing.
        if (car.siren && other.controlled && this.police.rams) continue;
        // Nor, once it has pulled out to pass, for the queue it is squeezing by.
        if (car._passing > 0 && !other.controlled && other.type !== 'police') continue;
        const limit = Math.max(0, (along - 5) * 1.2);
        if (limit < desiredSpeed) { desiredSpeed = limit; leader = other; }
      }
    }
    if (car.siren) {
      car._queued = leader && car.speed < 3 ? (car._queued || 0) + dt : 0;
      if (car._queued > 0.7 && !(car._passing > 0)) { car._passing = 4; car._queued = 0; }
      if (car._passing > 0) desiredSpeed = Math.min(desiredSpeed, 9);
    }
    let afoot = false;
    if (this.player.mode !== 'drive' && !this.room && trafficAtHeight(car, this.player.y)) {
      const dx = this.player.x - car.x, dz = this.player.z - car.z;
      const along = dx * sin + dz * cos;
      const across = Math.abs(dx * cos - dz * sin);
      if (along > 0 && along < 9 && across < 2.2) {
        const limit = Math.max(0, (along - 3.8) * 1.2);
        if (limit < desiredSpeed) { desiredSpeed = limit; afoot = true; }
      }
    }
    // Standing behind something that is going nowhere (a car left in the lane,
    // the player on foot, or a car itself standing behind one of those) shuts
    // the block: others turn off before it.
    const shut = car.speed < .3 && (afoot || (leader && (leader.parked || leader._crewOut || (leader.controlled && Math.abs(leader.speed) < .5) || leader._held > BLOCK_PATIENCE)));
    car._held = shut ? (car._held || 0) + dt : 0;
    // Where there is another lane, it pulls out into it as soon as there is a gap.
    if (car._held > PULL_OUT && edge.lanes > 1 && !car.siren) {
      const forward = Math.sin(edge.angle), sideways = Math.cos(edge.angle);
      for (const to of [lane + 1, lane - 1]) {
        if (to < 0 || to >= edge.lanes) continue;
        // How far to the driver's right the other lane is, and whether anyone is in it alongside.
        const shift = edge.step * (to - lane);
        let clear = true;
        for (const other of this.cars) {
          if (other === car || !trafficAtHeight(other, car.y)) continue;
          const dx = other.x - car.x, dz = other.z - car.z, ahead = dx * forward + dz * sideways;
          if (ahead > 10 || ahead < -8 - 1.2 * Math.abs(other.speed)) continue;
          if (Math.abs(-dx * sideways + dz * forward - shift) < 2.2) { clear = false; break; }
        }
        if (clear) { car._lane = to; car._held = 0; break; }
      }
    }
    if (car._held > BLOCK_PATIENCE) edge._blockedAt = this.elapsed;
    for (const walker of this._walkers || []) {
      const dx = walker.x - car.x, dz = walker.z - car.z;
      if (Math.abs(dx) > 14 || Math.abs(dz) > 14 || !trafficAtHeight(car, walker.y)) continue;
      const along = dx * sin + dz * cos;
      const across = Math.abs(dx * cos - dz * sin);
      if (along > 0 && along < 11 && across < 2.4) desiredSpeed = Math.min(desiredSpeed, Math.max(0, (along - 4.2) * 1.2));
    }
    car.speed += (desiredSpeed - car.speed) * (1 - Math.exp(-2.8 * dt));
    const beforeX = car.x, beforeZ = car.z;
    let x = car.x + sin * car.speed * dt, z = car.z + cos * car.speed * dt, hit = null;
    car._unchecked = (car._unchecked || 0) + Math.abs(car.speed) * dt;
    if (car._touching || car._unchecked >= TRAFFIC_CHECK) {
      const resolved = this._resolvePosition(x, z, CAR_RADIUS, car.angle, car, false, dt);
      x = resolved.x; z = resolved.z; hit = resolved.hit;
      car._unchecked = 0; car._touching = Boolean(hit);
    }
    car.x = x; car.z = z;
    if (hit) { car.speed *= 0.9; car._stuckTime += dt; }
    else car._stuckTime = Math.max(0, car._stuckTime - dt);
    if (hit?.kind !== 'prop' && car._stuckTime > 3 && Math.hypot(car.x - beforeX, car.z - beforeZ) < 0.015) {
      // Rejoin the same legal lane when a tight imported corner traps a patrol.
      // Recovery is constrained to a nearby clear point, never through a block.
      const rejoin = this._lanePoint(edge, clamp(projection.t + 3 / edge.length, 0.08, 0.92), lane);
      if (distance(car, rejoin) < 5 && !this._unsupportedDeckExit(car, rejoin.x, rejoin.z, 'drive') && !this._carContact(rejoin.x, rejoin.z, edge.angle) && !this._nearCar(rejoin.x, rejoin.z, 3, car.id)) {
        car.x = rejoin.x; car.z = rejoin.z; car.angle = edge.angle;
      }
      car._stuckTime = 0;
    }
  }

  /** Give a patrol the shortest legal way along the streets to `target`: the player unless told otherwise. */
  _routePolice(car, target = this.player) {
    const nearest = this._nearestEdge(target.x, target.z);
    if (!nearest || !car._edge) return;
    const destination = nearest.t < 0.5 ? nearest.edge.from : nearest.edge.to;
    const start = car._edge.to;
    if (start === destination) { car._route = []; return; }
    const cost = new Map([[start.id, 0]]), previous = new Map(), visited = new Set();
    // A binary heap of [cost, node]: a chase can have a dozen cars asking for routes.
    const heap = [[0, start]];
    const push = item => {
      let i = heap.push(item) - 1;
      while (i > 0) { const up = (i - 1) >> 1; if (heap[up][0] <= item[0]) break; heap[i] = heap[up]; i = up; }
      heap[i] = item;
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        for (;;) {
          let child = i * 2 + 1;
          if (child >= heap.length) break;
          if (child + 1 < heap.length && heap[child + 1][0] < heap[child][0]) child++;
          if (heap[child][0] >= last[0]) break;
          heap[i] = heap[child]; i = child;
        }
        heap[i] = last;
      }
      return top;
    };
    while (heap.length) {
      const [reached, node] = pop();
      if (visited.has(node.id)) continue;
      if (node === destination) break;
      visited.add(node.id);
      for (const edge of node.edges) {
        const candidate = reached + edge.length;
        if (candidate >= (cost.get(edge.to.id) ?? Infinity)) continue;
        cost.set(edge.to.id, candidate);
        previous.set(edge.to.id, edge);
        push([candidate, edge.to]);
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

  _updateMission(dt) {
    if (this.mission.phase !== 'active') return;
    this.mission.timeLeft = Math.max(0, this.mission.timeLeft - dt);
    if (this.mission.timeLeft <= 0) {
      this.mission.phase = 'failed';
      this._say('Delivery timed out. Press N to try another job.', 6);
      return;
    }
    if (this.player.mode === 'transport' && !this.player.grounded) return;
    if (distance(this.player, this.mission.target) < 10 && playerTravelSpeed(this.player) < 3) {
      if ((this.mission.meal || this.mission.kind==='paper') && this.room) return;
      if(this.mission.kind==='paper' && this.mission.index+1<this.mission.stops.length){
        this.mission.target=this.mission.stops[++this.mission.index];
        this._say('Bundle delivered. Next stop: '+this.mission.target.name+'.',5);return;
      }
      if (this.mission.stage === 'pickup') {
        this.mission.target = this.mission.dropoff;
        this.mission.stage = 'dropoff';
        this._say(`Order collected. Deliver to ${this.mission.target.name}.`, 6);
        return;
      }
      const bonus = this.mission.meal || this.mission.kind==='paper' ? Math.round(12 * this.mission.timeLeft / this.mission.totalTime) :
        Math.round(this.mission.timeLeft / this.mission.totalTime * 50 / 5) * 5;
      const payout = this.mission.reward + bonus;
      this.cash += payout;
      this.deliveries += 1;
      this.mission.phase = 'complete';
      this.mission.payout = payout;
      this._say(this.mission.meal ? `Food delivered. +$${payout} including a $${bonus} tip.` :
        `Delivery complete. +$${payout}. Press N for your next job.`, 7);
    }
  }
}
