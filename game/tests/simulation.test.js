import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation } from '../dist/simulation.js';
import { vehicleAspect, stopDistance } from '../dist/signal-plan.js';

function city(overrides = {}) {
  return {
    bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
    roads: [],
    buildings: [],
    spawn: { x: 0, z: 0, angle: 0 },
    missionPoints: [{ x: 0, z: 140, name: 'Prince Street' }, { x: 110, z: 0, name: 'Broadway' }],
    ...overrides,
  };
}

function advance(simulation, seconds, input = {}, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) simulation.step(input, 1 / fps);
}

test('spawn leaves room beside a nearby driveable taxi', () => {
  const sim = new Simulation(city());
  assert.equal(sim.player.mode, 'walk');
  assert.equal(sim.getNearbyCar()?.id, 'player-taxi');
  assert.equal(sim._nearCar(sim.player.x, sim.player.z, 0.4), null);
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.mode, 'drive');
  assert.equal(sim.player.vehicleId, 'player-taxi');
});

test('acceleration and steering are consistent at 30, 60 and 144 Hz', () => {
  const states = [30, 60, 144].map(fps => {
    const sim = new Simulation(city());
    sim.interact();
    advance(sim, 4, { forward: 1 }, fps);
    advance(sim, 1, { forward: 1, turn: 0.3 }, fps);
    advance(sim, 1, { brake: true }, fps);
    return sim.player;
  });
  for (const state of states.slice(1)) {
    assert.ok(Math.abs(state.x - states[0].x) < 0.02);
    assert.ok(Math.abs(state.z - states[0].z) < 0.02);
    assert.ok(Math.abs(state.angle - states[0].angle) < 0.002);
    assert.ok(Math.abs(state.speed - states[0].speed) < 0.02);
  }
  assert.ok(states[0].x < 0, 'right steering moves toward screen-right when the chase camera looks along +Z');
});

test('forward and reverse follow the vehicle nose at every cardinal heading', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const forward of [-1, 1]) {
    const sim = new Simulation(city({ spawn: { x: 0, z: 0, angle } }));
    sim.interact();
    const start = { ...sim.player };
    advance(sim, 1, { forward });
    const dx = sim.player.x - start.x, dz = sim.player.z - start.z;
    assert.ok((dx * Math.sin(angle) + dz * Math.cos(angle)) * forward > 2);
    assert.ok(Math.abs(dx * Math.cos(angle) - dz * Math.sin(angle)) < 0.001, 'straight throttle has no lateral motion');
    assert.equal(Math.sign(sim.player.speed), forward);
  }
});

test('right and left steering follow the chase camera in forward and reverse at every heading', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const turn of [-1, 1]) for (const forward of [-1, 1]) {
    const sim = new Simulation(city({ spawn: { x: 0, z: 0, angle } }));
    sim.interact();
    const start = { ...sim.player }, car = sim.cars.find(car => car.controlled);
    advance(sim, 0.8, { forward, turn });
    // Camera-forward is +Z in the car's frame. Its right vector is -X.
    const rightX = -Math.cos(angle), rightZ = Math.sin(angle);
    const lateral = (sim.player.x - start.x) * rightX + (sim.player.z - start.z) * rightZ;
    assert.ok(lateral * turn > 0.1, `heading=${angle}, gear=${forward}, steering=${turn}`);
    const noseRight = Math.sin(sim.player.angle) * rightX + Math.cos(sim.player.angle) * rightZ;
    assert.ok(noseRight * turn * forward > 0, 'reverse changes nose yaw while the rear follows the steering direction');
    assert.equal(Math.sign(car._steering), -turn, 'physical wheel yaw can drive the visual steering directly');
  }
});

test('brake overrides either accelerator and holds a stationary vehicle still', () => {
  for (const forward of [-1, 1]) {
    const sim = new Simulation(city());sim.interact();
    const initial = { ...sim.player };
    advance(sim, 2, { forward, brake: true });
    assert.equal(sim.player.speed, 0);
    assert.equal(sim.player.x, initial.x);assert.equal(sim.player.z, initial.z);
    const car = sim.cars.find(car => car.controlled);car.speed = forward * 15;
    advance(sim, 1, { forward, brake: true });
    assert.equal(sim.player.speed, 0, 'a held throttle cannot weaken braking or cause creep');
  }
});

test('opposing throttle stops before engaging the other direction', () => {
  for (const direction of [-1, 1]) for (const initialSpeed of [0.19, 10]) {
    const sim = new Simulation(city());sim.interact();
    const car = sim.cars.find(car => car.controlled);car.speed = direction * initialSpeed;
    let stopped = false, neutralSteps = 0;
    for (let step = 0; step < 120; step++) {
      sim.step({ forward: -direction }, 1 / 120);
      if (car.speed === 0) { stopped = true;neutralSteps++; }
      if (car.speed * direction < 0) {
        assert.ok(stopped, 'braking must reach an actual stop before reversing');
        break;
      }
    }
    assert.ok(neutralSteps >= 12, 'direction changes include a short predictable neutral hold');
    assert.ok(car.speed * direction < 0, 'holding the opposite throttle eventually changes direction');
  }
});

test('high-speed steering stays controlled and released steering recenters smoothly', () => {
  const high = new Simulation(city()), low = new Simulation(city());high.interact();low.interact();
  const highCar = high.cars.find(car => car.controlled), lowCar = low.cars.find(car => car.controlled);
  highCar.speed = 30;lowCar.speed = 4;
  high.step({ forward: 1, turn: 1 }, 1 / 120);
  assert.ok(highCar._steering < 0 && highCar._steering > -0.01, 'steering turns in progressively');
  advance(high, 1, { forward: 1, turn: 1 });advance(low, 1, { forward: 0.1, turn: 1 });
  assert.ok(Math.abs(high.player.angle) < 0.5, 'full steering at top speed cannot spin the car in one second');
  // Parking needs greater wheel lock, not a fixed yaw ratio: the faster car
  // travels much farther, and yaw now builds through a damped response.
  assert.ok(Math.abs(lowCar._steering) > Math.abs(highCar._steering) * 2, 'slow parking retains greater wheel lock');
  assert.ok(Math.abs(low.player.angle) > 0.45, 'parking steering still produces a useful maneuver');
  advance(high, 0.5, { forward: 1 });
  assert.ok(Math.abs(highCar._steering) < 0.0001);
  const settledAngle = high.player.angle;
  advance(high, 0.5, { forward: 1 });
  // The wheels recenter before the body finishes settling. Permit the small
  // physical yaw tail while excluding a persistent curve after release.
  assert.ok(Math.abs(high.player.angle - settledAngle) < 0.01, 'released steering settles without a persistent curve');
});

test('traffic lanes lie to each driver’s right on roads in every cardinal direction', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const dx = Math.sin(angle) * 150, dz = Math.cos(angle) * 150;
    const sim = new Simulation(city({ roads: [{ id: 'avenue', name: 'Avenue', points: [[-dx, -dz], [dx, dz]], width: 14 }] }));
    assert.equal(sim._graph.edges.length, 2);
    const points = [];
    for (const edge of sim._graph.edges) {
      const lane = sim._lanePoint(edge, 0.5);
      const rightOffset = lane.x * -Math.cos(edge.angle) + lane.z * Math.sin(edge.angle);
      assert.ok(rightOffset > 1, 'traffic occupies the right-hand side, including the reverse road direction');
      points.push(lane);
    }
    assert.ok(Math.hypot(points[0].x - points[1].x, points[0].z - points[1].z) > 3, 'opposing traffic has separated lanes');
  }
});

test('brakes stop without turning forward speed into reverse speed', () => {
  const sim = new Simulation(city());
  sim.interact();
  advance(sim, 2, { forward: 1 });
  assert.ok(sim.player.speed > 10);
  advance(sim, 3, { brake: true });
  assert.equal(sim.player.speed, 0);
});

test('high speed and a long frame cannot tunnel through a thin building', () => {
  const sim = new Simulation(city({ buildings: [{ polygon: [[-30, 22], [30, 22], [30, 22.3], [-30, 22.3]] }] }));
  sim.interact();
  const car = sim.cars.find(item => item.controlled);
  car.z = 18;
  car.speed = 30;
  sim.step({ forward: 1 }, 0.25);
  assert.ok(car.z < 20.1, `car should remain on its original side, got ${car.z}`);
  assert.equal(sim._carContact(car.x, car.z, car.angle), null);
  assert.ok(sim.health < 100);
  assert.ok(sim.heat > 0);
});

test('a sideways impact with a parked car cancels closing velocity and rotation', () => {
  const sim = new Simulation(city());sim.interact();
  const car = sim.cars.find(item => item.controlled);
  car.speed = 3;sim.step({}, 1 / 120);
  Object.assign(car, { x: 0, z: 0, velocityX: 18 });
  const parked = sim._makeCar('parked-test', 'sedan', { x: 3, z: 0 }, 0);
  sim.cars.push(parked);
  sim.step({ handbrake: true }, .25);
  assert.ok(car.x < 1.161, 'the moving car stays outside the parked vehicle');
  assert.equal(sim._nearCar(car.x, car.z, .92, car.id), null);
  assert.equal(car.velocityX, 0, 'contact removes motion into the other vehicle');
  assert.equal(car.yawRate, 0);
  assert.ok(sim.health < 100 && sim.heat > 0, 'sideways impact energy still counts');
  const stoppedX = car.x;advance(sim, .5);
  assert.equal(car.x, stoppedX, 'damped motion cannot keep pushing into the parked car');
});

test('walking slides along a wall and cannot cross it', () => {
  const sim = new Simulation(city({ buildings: [{ polygon: [[3, -60], [20, -60], [20, 60], [3, 60]] }] }));
  sim.cars = [];
  advance(sim, 3, { moveX: 1, moveZ: 1, run: true });
  assert.ok(sim.player.x <= 2.601);
  assert.ok(sim.player.z > 10);
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, 0.4), false);
});

test('a car stays inside world bounds without damage or heat from the map limit', () => {
  const sim = new Simulation(city({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 } }));
  sim.interact();
  advance(sim, 6, { forward: 1 });
  assert.ok(sim.player.z <= 37.961);
  assert.ok(sim.player.z > 30);
  assert.equal(sim.health, 100);
  assert.equal(sim.heat, 0);
});

test('safe exit requires low speed and chooses the unblocked side', () => {
  const sim = new Simulation(city({ buildings: [{ polygon: [[-8, -8], [-1.5, -8], [-1.5, 12], [-8, 12]] }] }));
  assert.equal(sim.interact(), true);
  const car = sim.cars.find(item => item.controlled);
  car.speed = 10;
  assert.equal(sim.interact(), false);
  assert.equal(sim.player.mode, 'drive');
  car.speed = 0;
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.mode, 'walk');
  assert.ok(sim.player.x > car.x);
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, 0.4), false);
  assert.equal(car.speed, 0);
  assert.equal(car.controlled, false);
});

test('delivery pays once, can be repeated, and will not complete at high speed', () => {
  const sim = new Simulation(city());
  sim.interact();
  assert.equal(sim.startMission(), true);
  assert.equal(sim.startMission(), false);
  const car = sim.cars.find(item => item.controlled);
  Object.assign(car, { x: sim.mission.target.x, z: sim.mission.target.z, speed: 10 });
  sim.step({}, 1 / 60);
  assert.equal(sim.mission.phase, 'active');
  car.speed = 0;
  sim.step({}, 1 / 60);
  assert.equal(sim.mission.phase, 'complete');
  assert.equal(sim.deliveries, 1);
  const cash = sim.cash;
  advance(sim, 2);
  assert.equal(sim.cash, cash);
  const firstTarget = sim.mission.target.name;
  assert.equal(sim.startMission(), true);
  assert.notEqual(sim.mission.target.name, firstTarget);
  Object.assign(car, { x: sim.mission.target.x, z: sim.mission.target.z, speed: 0 });
  sim.step({}, 1 / 60);
  assert.equal(sim.deliveries, 2);
  assert.ok(sim.cash > cash);
});

test('an expired delivery fails without paying', () => {
  const sim = new Simulation(city());
  sim.startMission();
  sim.mission.timeLeft = 0.01;
  sim.step({}, 1 / 30);
  assert.equal(sim.mission.phase, 'failed');
  assert.equal(sim.cash, 0);
  assert.equal(sim.deliveries, 0);
});

test('heat clears after escaping patrol sight', () => {
  const sim = new Simulation(city());
  sim.heat = 2;
  sim._timeSinceCrime = 0;
  advance(sim, 8);
  assert.equal(sim.heat, 2);
  advance(sim, 20);
  assert.equal(sim.heat, 0);
});

test('recovery retains completed progress and cancels an active job', () => {
  const sim = new Simulation(city());
  sim.cash = 250;
  sim.deliveries = 2;
  sim.startMission();
  sim.heat = 2;
  sim.health = 25;
  sim.reset();
  assert.equal(sim.cash, 250);
  assert.equal(sim.deliveries, 2);
  assert.equal(sim.health, 100);
  assert.equal(sim.heat, 0);
  assert.equal(sim.mission.phase, 'failed');
  assert.equal(sim.player.mode, 'walk');
});

test('road crossings become junctions and directed police routes obey one-way streets', () => {
  const roads = [
    { id: 'east', name: 'Prince Street', points: [[-80, 0], [80, 0]], width: 12, oneway: true },
    { id: 'north', name: 'Broadway', points: [[0, -80], [0, 80]], width: 14, oneway: true },
  ];
  const sim = new Simulation(city({ roads }));
  const junction = sim._graph.nodes.find(node => Math.abs(node.x) < 0.1 && Math.abs(node.z) < 0.1);
  assert.ok(junction, 'the crossing exists even without an explicit shared OSM vertex');
  assert.equal(junction.edges.length, 2);
  for (const edge of sim._graph.edges) {
    if (edge.road.id === 'east') assert.ok(edge.to.x > edge.from.x);
    if (edge.road.id === 'north') assert.ok(edge.to.z > edge.from.z);
  }
  const approach = sim._graph.edges.find(edge => edge.from.x === -80);
  const police = sim._makeCar('test-police', 'police', sim._lanePoint(approach, 0.5), approach.angle, approach);
  sim.player.x = 0;
  sim.player.z = 70;
  sim._routePolice(police);
  assert.ok(police._route.length > 0);
  assert.equal(police._route[0].road.id, 'north');
  assert.equal(police._route.at(-1).to.z, 80);
  assert.equal(sim.getStreet(), 'Broadway');
});

test('polygons with either winding and boundary points block placement', () => {
  const polygon = [[10, 10], [20, 10], [20, 20], [10, 20]];
  for (const ring of [polygon, [...polygon].reverse()]) {
    const sim = new Simulation(city({ buildings: [{ polygon: ring }] }));
    assert.equal(sim.isBlocked(15, 15), true);
    assert.equal(sim.isBlocked(10, 15), true);
    assert.equal(sim.isBlocked(9.7, 15, 0.4), true);
    assert.equal(sim.isBlocked(9, 15, 0.4), false);
    const point = sim._resolvePosition(10, 15, 0.4);
    assert.equal(sim.isBlocked(point.x, point.z, 0.4), false);
  }
});

test('clipped one-way exits recycle offscreen and keep actual SoHo traffic moving', () => {
  const soho = JSON.parse(readFileSync(new URL('../dist/city.json', import.meta.url), 'utf8'));
  const sim = new Simulation(soho);
  assert.equal(sim.cars.length, 16);
  assert.ok(sim.getNearbyCar(), 'the real spawn provides an immediately accessible cab');
  const taxi = sim.cars.find(car => car.id === 'player-taxi');
  assert.equal(sim._carContact(taxi.x, taxi.z, taxi.angle), null);
  for (let second = 0; second < 120; second++) {
    advance(sim, 1);
    for (const car of sim.cars) assert.equal(sim._carContact(car.x, car.z, car.angle), null, `${car.id} entered a building or crossed the world boundary`);
  }
  assert.ok(sim.cars.filter(car => car.speed > 2).length >= 8, 'traffic continues instead of accumulating permanently at map exits');
  assert.equal(sim.startMission(), true);
  assert.equal(sim.isBlocked(sim.mission.target.x, sim.mission.target.z, 1), false);
});


test('terrain grounding follows walking, vehicle wheel supports, exits and travel', () => {
  const elevation=(x,z)=>18+x*.08+z*.12;
  const sim=new Simulation(city({sampleSurface:(x,z)=>({elevation:elevation(x,z)})}));
  assert.equal(sim.player.y,elevation(sim.player.x,sim.player.z));
  advance(sim,.5,{moveZ:1});
  assert.equal(sim.player.y,elevation(sim.player.x,sim.player.z));
  sim.reset();assert.ok(sim.interact());
  advance(sim,2,{forward:1,turn:.2});
  const car=sim.cars.find(car=>car.controlled),s=Math.sin(car.angle),c=Math.cos(car.angle);
  assert.ok(Math.abs(car.pitch+Math.atan(.08*s+.12*c))<1e-10);
  assert.ok(Math.abs(car.roll-Math.atan(.08*c-.12*s))<1e-10);
  assert.ok(Math.abs(car.y-elevation(car.x-.035*s,car.z-.035*c))<1e-10);
  assert.equal(sim.player.y,car.y);
  car.speed=0;sim.player.speed=0;assert.ok(sim.interact());
  assert.equal(sim.player.y,elevation(sim.player.x,sim.player.z));
  sim.travelTo({x:100,z:150,angle:0});
  assert.equal(sim.player.y,elevation(sim.player.x,sim.player.z));
  sim.setActiveCity({sampleSurface:()=>({elevation:NaN})});
  assert.equal(sim.player.y,0,'unavailable measurements retain a finite fallback');
});

test('mapped inland water stops cars without damage and retains mapped crossings', () => {
  const water=(x,z,r)=>z+r>22?{kind:'water',nx:0,nz:-1,depth:z+r-22}:null;
  const sim=new Simulation(city({landscapeContact:water}));
  sim.interact();advance(sim,5,{forward:1});
  assert.ok(sim.player.z<22);assert.equal(sim.health,100);assert.equal(sim.heat,0);
  const crossing=new Simulation(city({landscapeContact:water,roads:[{id:'bridge',name:'Mapped crossing',width:12,points:[[0,-100],[0,100]]}]}));
  assert.equal(crossing.isBlocked(0,40,.5),false);
  assert.equal(crossing.isBlocked(20,40,.5),true);
  assert.equal(crossing.isBlocked(20,40,.5,{ignoreWater:true}),false,'camera can look above the water');
  crossing.setActiveCity({buildings:[{polygon:[[18,38],[22,38],[22,42],[18,42]]}]});
  assert.equal(crossing.isBlocked(20,40,.5,{ignoreWater:true}),true,'camera still avoids walls beside the pond');
});

test('kerbside cars appear in free spaces, leave with them, and stay once driven', () => {
  const sim = new Simulation(city());
  const before = sim.cars.length, spaces = [{ id: 'kerb:a', x: 40, z: 31 , angle: Math.PI / 2 }, { id: 'kerb:b', x: 47, z: 31, angle: Math.PI / 2 }, { id: 'kerb:bad', x: NaN, z: 0, angle: 0 }];
  const placed = sim.syncParkedCars(spaces);
  assert.ok(placed >= 1 && placed <= 2);
  const parked = sim.cars.filter(car => car._kerb);
  assert.equal(parked.length, placed);
  for (const car of parked) { assert.equal(car.parked, true); assert.equal(car.type, 'sedan'); assert.ok(Number.isFinite(car.y ?? 0)); }
  assert.equal(sim.syncParkedCars(spaces), placed, 'syncing again changes nothing');
  assert.equal(sim.cars.length, before + placed);
  // A space next to the player, or on top of another car, is left empty.
  assert.equal(sim.syncParkedCars([...spaces, { id: 'kerb:me', x: sim.player.x + 1, z: sim.player.z, angle: 0 }, { id: 'kerb:dup', x: parked[0].x + .5, z: parked[0].z, angle: parked[0].angle }]), placed);
  // Once driven, a kerbside car is the player's and outlives its space.
  parked[0].controlled = true;
  assert.equal(sim.syncParkedCars([]), 0);
  assert.ok(sim.cars.includes(parked[0]) && !parked[0]._kerb);
  assert.equal(sim.cars.length, before + 1);
  parked[0].controlled = false;
  sim.syncParkedCars([]);
  assert.ok(sim.cars.includes(parked[0]), 'it is not swept away when the player gets out');
});

test('kerbside cars keep their identity and leave the traffic sequence alone', () => {
  const spaces = Array.from({ length: 12 }, (_, i) => ({ id: `kerb:${i}`, x: 60 + i * 6, z: 40, angle: Math.PI / 2 }));
  const a = new Simulation(city()), b = new Simulation(city());
  const sequence = a._rngState;
  assert.equal(a.syncParkedCars(spaces), 12);
  assert.equal(a._rngState, sequence, 'parking cars draws nothing from the traffic generator');
  b.syncParkedCars([...spaces].reverse());
  const paint = sim => Object.fromEntries(sim.cars.filter(car => car._kerb).map(car => [car.id, car.color]));
  assert.deepEqual(paint(a), paint(b), 'a space holds the same car whatever order it was filled in');
  assert.ok(new Set(Object.values(paint(a))).size >= 4, 'the kerb is not one colour');
  // Traffic then behaves exactly as it would on empty kerbs far away.
  const plain = new Simulation(city());
  advance(a, 2); advance(plain, 2);
  const traffic = sim => sim.cars.filter(car => !car._kerb).map(car => [car.id, +car.x.toFixed(6), +car.z.toFixed(6)]);
  assert.deepEqual(traffic(a), traffic(plain));
});

test('getting into a kerbside car makes it an ordinary car at once', () => {
  const sim = new Simulation(city());
  sim.syncParkedCars([{ id: 'kerb:mine', x: sim.player.x - 3.2, z: sim.player.z - 8, angle: 0 }]);
  const car = sim.cars.find(item => item.id === 'kerb:mine');
  assert.ok(car?._kerb);
  sim.player.x = car.x - 2.2; sim.player.z = car.z;
  assert.equal(sim.getNearbyCar(), car);
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.vehicleId, 'kerb:mine');
  assert.equal(car._kerb, false, 'so it is drawn and simulated as the player\'s car from this frame');
});

test('standing kerbside cars are re-seated on the ground a few at a time', () => {
  let samples = 0;
  const sim = new Simulation(city({ sampleSurface: (x, z) => { samples++; return { elevation: x * .01 }; } }));
  const spaces = Array.from({ length: 96 }, (_, i) => ({ id: `kerb:${i}`, x: -300 + (i % 48) * 6, z: i < 48 ? 200 : 230, angle: Math.PI / 2 }));
  assert.equal(sim.syncParkedCars(spaces), 96);
  for (const car of sim.cars.filter(item => item._kerb)) assert.ok(Math.abs(car.y - car.x * .01) < .05, 'each is on the ground from the start');
  const others = sim.cars.length - 96;
  samples = 0; sim.updateGrounding();
  // Five samples a car: every other car each time, and one kerbside car in twenty-four.
  assert.ok(samples <= (others + 96 / 24 + 2) * 5, `${samples} samples for ${sim.cars.length} cars`);
  // Over a full rotation the ground under every one of them is read again.
  const seen = new Set(), original = sim._sampleSurface;
  sim._sampleSurface = (x, z, options) => { for (const car of sim.cars) if (car._kerb && Math.abs(car.x - x) < 1e-9 && Math.abs(car.z - z) < 1e-9) seen.add(car.id); return original(x, z, options); };
  for (let i = 0; i < 24; i++) sim.updateGrounding();
  assert.equal(seen.size, 96);
});

// A one-way avenue running north (toward -Z), crossed by a two-way street at the origin.
const street = (id, name, points, width, oneway = false) => ({ id, name, points, width, oneway, kind: 'residential', roadwayType: 1, fromLevel: 13, toLevel: 13 });
const crossing = (extra = {}) => city({ roads: [street('ave', '7 AVE', [[0, 400], [0, -400]], 18, 'yes'), street('st', 'W 42 ST', [[-400, 0], [400, 0]], 9)], spawn: { x: 150, z: 150, angle: 0 }, ...extra });
const edgeInto = (sim, from, to) => sim._graph.edges.find(edge => Math.hypot(edge.from.x - from[0], edge.from.z - from[1]) < 1 && Math.hypot(edge.to.x - to[0], edge.to.z - to[1]) < 1);
function lone(sim, edge, back) {
  // One car on `edge`, `back` metres before its end, and nothing else on the road.
  sim.cars = sim.cars.filter(car => car.id === 'player-taxi');
  const t = 1 - back / edge.length, point = sim._lanePoint(edge, t);
  const car = sim._makeCar('probe', 'sedan', point, edge.angle, edge);
  car.speed = car._cruise; sim.cars.push(car);
  return car;
}

test('junctions are planned from the streets that meet, and from what the city lists', () => {
  const sim = new Simulation(crossing());
  assert.equal(sim.junctions.length, 1);
  const [junction] = sim.junctions;
  assert.deepEqual([junction.x, junction.z, junction.plan.control, junction.plan.cycle], [0, 0, 'signal', 90]);
  assert.deepEqual(junction.plan.widths, [18, 9]);
  assert.equal(junction.arms.length, 4);
  assert.deepEqual(junction.arms.map(arm => arm.name).sort(), ['7 AVE', '7 AVE', 'W 42 ST', 'W 42 ST']);
  // Each edge knows which street it arrives by: the avenue is the main one.
  assert.equal(edgeInto(sim, [0, 400], [0, 0]).arrives, 0); assert.equal(edgeInto(sim, [400, 0], [0, 0]).arrives, 1);
  // Two side streets get stop signs; the city's list makes the same corner a signal with a head start.
  const quiet = [street('a', 'A ST', [[0, 300], [0, -300]], 9), street('b', 'B ST', [[-300, 0], [300, 0]], 9)];
  assert.equal(new Simulation(city({ roads: quiet })).junctions[0].plan.control, 'allway');
  const listed = new Simulation(city({ roads: quiet, signalHints: (x, z) => ({ lpi: Math.hypot(x, z) < 30, exclusive: false, core: false }) })).junctions[0].plan;
  assert.equal(listed.control, 'signal'); assert.deepEqual(listed.lead, [7, 7]);
  // A plan depends only on place: reloading the streets does not restart the cycle.
  const again = new Simulation(crossing());
  again.setActiveCity({ roads: crossing().roads.map(road => ({ ...road })) });
  assert.deepEqual(again.junctions[0].plan, junction.plan);
  // A bridge passing over a street is not a junction.
  const over = new Simulation(city({ roads: [street('a', 'A ST', [[0, 300], [0, -300]], 18), { ...street('b', 'RAMP', [[-300, 0], [300, 0]], 12), kind: 'bridge', fromLevel: 15, toLevel: 15 }] }));
  assert.equal(over.junctions.length, 0);
});

test('traffic waits at a red light behind the stop line and goes on green', () => {
  const sim = new Simulation(crossing()), plan = sim.junctions[0].plan;
  const edge = edgeInto(sim, [400, 0], [0, 0]), line = stopDistance(plan, 1);
  // Start the side street's wait just after its green has ended.
  const greenStart = plan.offset + plan.lead[0] + plan.green[0] + 5 + plan.lead[1];
  sim.elapsed = greenStart + plan.green[1] + 3.5;
  assert.equal(vehicleAspect(plan, 1, sim.elapsed).aspect, 'red');
  const car = lone(sim, edge, 60);
  const wait = vehicleAspect(plan, 1, sim.elapsed).remaining;
  advance(sim, wait - 2);
  assert.ok(car.speed < .2, `stopped: ${car.speed.toFixed(2)} m/s`);
  const nose = car.x - 2.3;
  assert.ok(nose > line - .3 && nose < line + 3.5, `nose ${nose.toFixed(1)} m from the junction, line at ${line.toFixed(1)}`);
  advance(sim, 8);
  assert.ok(car.speed > 3 && car.x < line - 2, 'green: it has set off and crossed the line');
  // A patrol answering a call does not wait.
  sim.elapsed = greenStart + plan.green[1] + 3.5;
  const patrol = lone(sim, edge, 60); patrol.type = 'police'; sim.heat = 1;
  advance(sim, 9);
  assert.ok(patrol._edge !== edge || patrol.x < line - 3, 'the patrol went through on red');
});

test('at a stop sign traffic comes to a full stop, then goes', () => {
  const sim = new Simulation(city({ roads: [street('a', 'A ST', [[0, 300], [0, -300]], 9), street('b', 'B ST', [[-300, 0], [300, 0]], 9)], spawn: { x: 150, z: 150, angle: 0 } }));
  const plan = sim.junctions[0].plan, edge = edgeInto(sim, [300, 0], [0, 0]), line = stopDistance(plan, edge.arrives);
  assert.equal(vehicleAspect(plan, edge.arrives, 0).aspect, 'stop');
  const car = lone(sim, edge, 50);
  let halted = 0, slowest = Infinity, where = null;
  for (let i = 0; i < 60 * 30 && car._edge === edge; i++) {
    sim.step({}, 1 / 60);
    if (car.speed < .3) { halted += 1 / 60; where = car.x; }
    slowest = Math.min(slowest, car.speed);
  }
  assert.ok(halted > .9 && halted < 6, `halted for ${halted.toFixed(1)} s`);
  assert.ok(where - 2.3 > line - .5 && where - 2.3 < line + 3, `stopped with its nose ${(where - 2.3).toFixed(1)} m out, line at ${line.toFixed(1)}`);
  assert.ok(car._edge !== edge, 'and then drove on');
});

test('running a red light is noticed by a camera or a patrol; yellow and green are not', () => {
  const drive = (setup = () => {}) => {
    const sim = new Simulation(crossing({ spawn: { x: 60, z: 2, angle: -Math.PI / 2 } }));
    sim.cars = sim.cars.filter(car => car.id === 'player-taxi');
    const cab = sim.cars[0]; Object.assign(cab, { x: 60, z: 2.2, angle: -Math.PI / 2 });
    sim.player.x = 58; sim.player.z = 4; sim.interact();
    assert.equal(sim.player.mode, 'drive');
    sim.cash = 80; setup(sim);
    return sim;
  };
  const plan = new Simulation(crossing()).junctions[0].plan;
  const red = plan.offset + plan.lead[0] + 4, green = plan.offset + plan.lead[0] + plan.green[0] + 5 + plan.lead[1] + 4;
  const through = sim => { for (let i = 0; i < 60 * 14 && sim.player.x > -25; i++) sim.step({ forward: 1 }, 1 / 60); assert.ok(sim.player.x < -20, 'drove through the junction'); return sim; };
  // On the side street's red, with a camera at the junction.
  const caught = through(drive(sim => { sim.elapsed = red; sim.junctions[0].camera = true; }));
  assert.equal(caught.redLights, 1); assert.equal(caught.cash, 30); assert.match(caught.notice, /camera/i);
  assert.ok(caught.cameraFlash && caught.cameraFlash.x === 0);
  // No camera, nobody watching: it is counted and nothing more.
  const unseen = through(drive(sim => { sim.elapsed = red; sim.junctions[0].camera = false; }));
  assert.equal(unseen.redLights, 1); assert.equal(unseen.cash, 80); assert.equal(unseen.heat, 0);
  // A patrol with a view of it gives chase.
  const seen = through(drive(sim => { sim.elapsed = red; sim.junctions[0].camera = false; sim.cars.push(sim._makeCar('police-9', 'police', { x: 30, z: 30 }, 0)); }));
  assert.ok(seen.heat >= .5); assert.match(seen.notice, /patrol/i);
  // On green nothing happens.
  const legal = through(drive(sim => { sim.elapsed = green; sim.junctions[0].camera = true; }));
  assert.equal(legal.redLights || 0, 0); assert.equal(legal.cash, 80);
});

test('the carriageways of a boulevard share one signal plan with the street that crosses them', () => {
  // Four one-way carriageways 14 m apart, as on the Grand Concourse, crossed by one street.
  const roads = [street('x', 'E 161 ST', [[-300, 0], [300, 0]], 11)];
  [-21, -7, 7, 21].forEach((x, i) => roads.push(street(`c${i}`, 'GRAND CONC', i < 2 ? [[x, -300], [x, 300]] : [[x, 300], [x, -300]], 10, 'yes')));
  const sim = new Simulation(city({ roads, spawn: { x: 150, z: 150, angle: 0 } }));
  assert.equal(sim.junctions.length, 4);
  for (const junction of sim.junctions) {
    assert.equal(junction.plan.control, 'signal'); assert.equal(junction.plan.cycle, 120);
    const boulevard = junction.arms.findIndex(a => a.name === 'GRAND CONC');
    assert.equal(junction.plan.groups[boulevard], 0, 'the Concourse is the main street at each of them');
  }
  // All four change together, so a car crossing the boulevard is not stopped in the middle of it.
  for (let t = 0; t < 120; t += 1.5) assert.equal(new Set(sim.junctions.map(junction => vehicleAspect(junction.plan, 1, t).aspect)).size, 1, `at ${t} s`);
});
