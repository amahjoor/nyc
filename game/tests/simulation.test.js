import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation, YELLOW_CAB, GREEN_CAB } from '../dist/simulation.js';
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
    advance(sim, 2, { forward, brake: true });
    assert.equal(sim.player.speed, 0, 'a held throttle cannot weaken braking or cause creep');
  }
});

test('opposing throttle stops before engaging the other direction', () => {
  for (const direction of [-1, 1]) for (const initialSpeed of [0.19, 10]) {
    const sim = new Simulation(city());sim.interact();
    const car = sim.cars.find(car => car.controlled);car.speed = direction * initialSpeed;
    let stopped = false, neutralSteps = 0;
    for (let step = 0; step < 240; step++) {
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
  advance(sim, 3, { forward: 1 });
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

test('you can bail out of a moving car, and a stop still uses the open door', () => {
  const sim = new Simulation(city({ buildings: [{ polygon: [[-8, -8], [-1.5, -8], [-1.5, 12], [-8, 12]] }] }));
  assert.equal(sim.interact(), true);
  const car = sim.cars.find(item => item.controlled);
  const started = { x: car.x, z: car.z };
  car.speed = 10;
  assert.equal(sim.interact(), true, 'a moving car can be exited');
  assert.equal(sim.player.mode, 'walk');
  assert.equal(car.controlled, false);
  assert.ok(Math.hypot(sim.player.velocityX, sim.player.velocityZ) > 4, 'you keep the car\'s speed');
  assert.equal(sim.player.grounded, false);
  advance(sim, 0.4);
  assert.ok(Math.hypot(car.x - started.x, car.z - started.z) > 1, 'the empty car keeps rolling');
  car.speed = 0; car.velocityX = 0; car.velocityZ = 0; car._loose = 0; car.parked = true;
  Object.assign(sim.player, { x: car.x + 2.2, z: car.z, velocityX: 0, velocityZ: 0, slide: 0, grounded: true });
  assert.equal(sim.interact(), true);
  car.speed = 0;
  assert.equal(sim.interact(), true);
  assert.equal(sim.player.mode, 'walk');
  assert.ok(sim.player.x > car.x);
  assert.equal(sim.isBlocked(sim.player.x, sim.player.z, 0.4), false);
  assert.equal(car.speed, 0);
  assert.equal(car.controlled, false);
});

test('jumping leaves the ground and a ledge becomes a fall', () => {
  const flat = new Simulation(city({ sampleSurface: () => ({ elevation: 3 }) }));
  assert.equal(flat.player.y, 3);
  flat.step({ handbrake: true }, 1 / 60);
  assert.equal(flat.player.grounded, false);
  assert.ok(flat.player.y > 3.08);
  for (let i = 0; i < 180 && flat.player.grounded === false; i++) flat.step({}, 1 / 120);
  assert.equal(flat.player.grounded, true);
  assert.equal(flat.player.y, 3);
  assert.equal(flat.health, 100, 'a hop is not a fall');
  const ledge = new Simulation(city({ sampleSurface: (x, z) => ({ elevation: z < 2 ? 8 : 0 }) }));
  assert.equal(ledge.player.y, 8);
  advance(ledge, 2, { moveZ: 1 });
  assert.ok(ledge.player.z > 2, 'you can walk off the ledge');
  assert.ok(ledge.player.y < 1, 'and fall to the ground below');
  assert.ok(ledge.health < 100, 'a long fall hurts');
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
  advance(sim, 8);
  assert.equal(sim.heat, 2);
  advance(sim, 30);
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

test('traffic thins and thickens with the hour, and its cabs are the right colour', () => {
  const roads = [];
  for (let i = -3; i <= 3; i++) { roads.push(street(`a${i}`, `A${i}`, [[i * 120, -420], [i * 120, 420]], 9)); roads.push(street(`s${i}`, `S${i}`, [[-420, i * 120], [420, i * 120]], 9)); }
  const sim = new Simulation(city({ roads, spawn: { x: 5, z: 5, angle: 0 } }));
  const moving = () => sim.cars.filter(car => car._edge && car.type !== 'police' && !car.controlled);
  const seeded = moving().length;
  advance(sim, 20);
  assert.equal(moving().length, seeded, 'untouched until the hour is given');
  sim.setTraffic({ level: 1, taxis: .9, green: true });
  advance(sim, 60);
  assert.ok(moving().length >= 54 && moving().length <= 62, `${moving().length} cars in the rush`);
  // Whatever came onto the map since is mostly cabs, and here they are green.
  const fresh = moving().filter(car => /^traffic-\d{3,}$/.test(car.id));
  assert.ok(fresh.length >= 8);
  assert.ok(fresh.filter(car => car.type === 'taxi').length / fresh.length > .6);
  assert.ok(fresh.filter(car => car.type === 'taxi').every(car => car.color === GREEN_CAB));
  assert.equal(new Set(sim.cars.map(car => car.id)).size, sim.cars.length, 'every car keeps a distinct identity');
  sim.setTraffic({ level: .15, taxis: .5, green: false });
  advance(sim, 120);
  assert.ok(moving().length <= 20, `${moving().length} cars in the small hours`);
  assert.ok(sim.cars.some(car => car.id === 'player-taxi' && car.color === YELLOW_CAB), 'the player\'s cab is never retired');
});

test('traffic is kept within a few blocks of the player, and comes and goes out of sight', () => {
  // Two kilometres of grid: left alone, a dozen cars would be scattered across all of it.
  const roads = [];
  for (let i = -8; i <= 8; i++) { roads.push(street(`a${i}`, `A${i}`, [[i * 120, -1000], [i * 120, 1000]], 9)); roads.push(street(`s${i}`, `S${i}`, [[-1000, i * 120], [1000, i * 120]], 9)); }
  const sim = new Simulation(city({ bounds: { minX: -1100, maxX: 1100, minZ: -1100, maxZ: 1100 }, roads, spawn: { x: 60, z: 6, angle: 0 } }));
  const moving = () => sim.cars.filter(car => car._edge && car.type !== 'police' && !car.controlled);
  const from = car => Math.hypot(car.x - sim.player.x, car.z - sim.player.z);
  advance(sim, 5);
  const before = moving().filter(car => from(car) < 230).length;
  sim.setTraffic({ level: .6, taxis: .3 });
  // Watch every car that appears, jumps or goes: none may do so nearer than 330 m, where a car is a few pixels
  // wide, since the player is taken to be looking everywhere until the game says otherwise.
  const watch = (seconds, input, nearest) => {
    let last = new Map(sim.cars.map(car => [car.id, { x: car.x, z: car.z, seen: from(car) }])), arrivals = 0, departures = 0;
    for (let i = 0; i < seconds * 30; i++) {
      sim.step(input, 1 / 30);
      const now = new Map();
      for (const car of sim.cars) {
        const was = last.get(car.id);
        if (!car.controlled && (!was || Math.hypot(car.x - was.x, car.z - was.z) > 20)) { arrivals++; assert.ok(from(car) >= nearest(car) - 1, `${car.id} appeared ${from(car).toFixed(0)} m away`); }
        now.set(car.id, { x: car.x, z: car.z, seen: from(car) });
      }
      for (const [id, was] of last) if (!now.has(id)) { departures++; assert.ok(was.seen >= nearest(was) - 1, `${id} vanished ${was.seen.toFixed(0)} m away`); }
      last = now;
    }
    return { arrivals, departures };
  };
  const first = watch(90, {}, () => 330);
  assert.ok(first.arrivals > 25, `${first.arrivals} arrivals`);
  assert.equal(moving().length, 41, 'as many as the hour calls for');
  const near = moving().filter(car => from(car) < 230).length, reach = moving().filter(car => from(car) < 460).length;
  assert.ok(before <= 3 && near >= 12, `${before} cars within 230 m before, ${near} after`);
  assert.ok(reach >= 38, `${reach} of 41 within a few blocks`);
  assert.equal(new Set(sim.cars.map(car => car.id)).size, sim.cars.length);
  // Told where the player is looking, traffic joins much nearer everywhere else.
  sim.setLookout(0, 2);
  const ahead = car => (car.z - sim.player.z) > .5 * from(car);
  const second = watch(90, {}, car => ahead(car) ? 330 : 150);
  const close = moving().filter(car => from(car) < 230).length;
  assert.ok(second.arrivals > 10 && close >= 12, `${close} within 230 m, ${second.arrivals} arrivals`);
  sim.setLookout(0, 0);
  assert.equal(sim._lookout, null, 'a camera looking straight down looks everywhere');
  sim.setLookout(0, 2);
  // Driving off flat out, the traffic keeps up: there is as much in sight five blocks on, and some of it ahead.
  sim.interact();
  const third = watch(20, { forward: 1 }, car => ahead(car) ? 330 : 150);
  const sight = moving().filter(car => from(car) < 400).length;
  assert.ok(from({ x: 60, z: 6 }) > 400, 'the player has left the neighbourhood');
  assert.ok(third.arrivals > 10 && sight >= 24 && moving().filter(ahead).length >= 8, `${sight} in sight, ${moving().filter(ahead).length} of ${moving().length} ahead`);
});

test('a car left standing in the only lane shuts its block: those behind wait, the rest turn off', () => {
  const sim = new Simulation(crossing());
  // The street has one lane each way. A car is left in the eastbound one, 80 m past the junction.
  const beyond = edgeInto(sim, [0, 0], [400, 0]), into = edgeInto(sim, [-400, 0], [0, 0]);
  assert.equal(beyond.lanes, 1);
  const first = lone(sim, beyond, 400 - 40);
  const spot = sim._lanePoint(beyond, 80 / 400), left = sim._makeCar('left', 'sedan', spot, beyond.angle);
  sim.cars.push(left);
  assert.equal(left.parked, true);
  const choose = () => { const probe = sim._makeCar('chooser', 'sedan', sim._lanePoint(into, 1), into.angle, into); return sim._pickNextEdge(probe); };
  const straight = () => Array.from({ length: 60 }, choose).filter(edge => edge === beyond).length;
  assert.ok(straight() > 20, 'most traffic goes straight on while the street is open');
  advance(sim, 12);
  assert.ok(first.speed < .1 && first.x < spot.x - 4 && first.x > spot.x - 9, `waiting ${(spot.x - first.x).toFixed(1)} m behind it`);
  assert.equal(straight(), 0, 'nobody else comes into the block');
  // A second car already on the block queues behind the first, and keeps the block shut.
  const second = sim._makeCar('second', 'sedan', sim._lanePoint(beyond, 20 / 400), beyond.angle, beyond); second.speed = 6; sim.cars.push(second);
  advance(sim, 14);
  assert.ok(second.speed < .1 && second._held > 4 && straight() === 0);
  // The car is driven away: the queue moves off and the block opens again.
  sim.cars.splice(sim.cars.indexOf(left), 1);
  advance(sim, 10);
  assert.ok(first.speed > 3 && second.speed > 3, 'the queue has moved off');
  assert.ok(straight() > 20, 'and the street is open again');
  // Waiting at a red light shuts nothing.
  const plan = sim.junctions[0].plan, side = edgeInto(sim, [400, 0], [0, 0]);
  sim.elapsed = plan.offset + plan.lead[0] + plan.green[0] + 5 + plan.lead[1] + plan.green[1] + 3.5;
  const leader = lone(sim, side, 60), follower = sim._makeCar('follower', 'sedan', sim._lanePoint(side, 1 - 75 / side.length), side.angle, side); follower.speed = 6; sim.cars.push(follower);
  advance(sim, 15);
  assert.ok(leader.speed < .2 && follower.speed < .2, 'both stand at the red light');
  assert.ok(!(follower._held > 0) && !(sim.elapsed - side._blockedAt < 60), 'and the block stays open');
});

test('a wide street carries traffic in every lane: turns are made from the lane on that side, and the files run abreast', () => {
  const sim = new Simulation(crossing());
  // The avenue is 18 m wide and runs one way toward -Z; the street is 9 m wide and runs both ways.
  const avenue = edgeInto(sim, [0, 400], [0, 0]), beyond = edgeInto(sim, [0, 0], [0, -400]), fromEast = edgeInto(sim, [400, 0], [0, 0]), fromWest = edgeInto(sim, [-400, 0], [0, 0]);
  assert.deepEqual([avenue.lanes, fromEast.lanes], [4, 1]);
  const near = (actual, expected) => actual.length === expected.length && actual.every((value, i) => Math.abs(value - expected[i]) < .02);
  // Between its parking lanes the avenue has four lanes of 3.35 m. Heading -Z the driver's right is +X: lane 0 is the right-hand one.
  const files = [5.025, 1.675, -1.675, -5.025];
  assert.ok(near([0, 1, 2, 3, 9].map(lane => sim._lanePoint(avenue, .5, lane).x), [...files, -5.025]));
  assert.ok(near([0, 3].map(lane => sim._lanePoint(fromEast, .5, lane).z), [-1.71, -1.71]), 'a narrow street has the one file');
  // A two-way street 19 m wide has two lanes each way, the second nearer the kerb.
  const broad = new Simulation(city({ roads: [street('b', 'HOUSTON ST', [[-300, 0], [300, 0]], 19)], spawn: { x: 0, z: 60, angle: 0 } }));
  const east = broad._graph.edges.find(edge => edge.to.x > edge.from.x), west = broad._graph.edges.find(edge => edge.to.x < edge.from.x);
  assert.deepEqual([east.lanes, west.lanes], [2, 2]);
  assert.ok(near([0, 1].map(lane => broad._lanePoint(east, .5, lane).z), [1.8, 5.4]) && near([0, 1].map(lane => broad._lanePoint(west, .5, lane).z), [-1.8, -5.4]));
  // A street with no room for parking lanes, a bridge, and a street the data says little about keep to a single file.
  const single = new Simulation(city({ roads: [street('n', 'GREENE ST', [[-300, 0], [300, 0]], 7.9, 'yes'), { ...street('k', 'BKLYN BRIDGE', [[-300, 80], [300, 80]], 18, 'yes'), kind: 'bridge' }, { id: 'p', name: 'PLAIN', points: [[-300, 160], [300, 160]], width: 18, oneway: 'yes' }], spawn: { x: 0, z: 40, angle: 0 } }));
  assert.ok(single._graph.edges.length === 3 && single._graph.edges.every(edge => edge.lanes === 1));
  // At the junction the right-hand lane may turn right (toward +X), the left-hand lane left, and the lanes between neither.
  const goes = lane => {
    const seen = new Set();
    for (let i = 0; i < 300; i++) { const probe = sim._makeCar('chooser', 'sedan', sim._lanePoint(avenue, 1, lane), avenue.angle, avenue); probe._lane = lane; const next = sim._pickNextEdge(probe); seen.add(next.to.x > 1 ? 'right' : next.to.x < -1 ? 'left' : 'on'); }
    return [...seen].sort().join(' ');
  };
  assert.deepEqual([goes(0), goes(1), goes(2), goes(3)], ['on right', 'on', 'on', 'left on']);
  const patrol = sim._makeCar('patrol', 'police', sim._lanePoint(avenue, 1), avenue.angle, avenue), ways = new Set();
  for (let i = 0; i < 300; i++) ways.add(sim._pickNextEdge(patrol).to.x);
  assert.equal(ways.size, 3, 'a patrol goes where it likes');
  // Going straight on, a car keeps its lane; coming round a corner it takes the near one.
  assert.deepEqual([0, 1, 2, 3].map(lane => sim._laneOnto(avenue, beyond, lane)), [0, 1, 2, 3]);
  assert.equal(sim._laneOnto(fromEast, beyond, 0), 0, 'a right turn into the right-hand lane');
  assert.equal(sim._laneOnto(fromWest, beyond, 0), 3, 'a left turn into the left-hand lane');
  assert.equal(sim._laneOnto(avenue, edgeInto(sim, [0, 0], [400, 0]), 3), 0, 'and onto a narrow street, into its one lane');
  assert.equal(broad._laneOnto(east, east, 1), 1);
  // Four cars abreast neither hold each other up nor drift together, and all four stop at the same line.
  const plan = sim.junctions[0].plan, line = stopDistance(plan, 0);
  sim.elapsed = plan.offset + plan.lead[0] + plan.green[0] + 3.5;
  assert.equal(vehicleAspect(plan, 0, sim.elapsed).aspect, 'red');
  sim.cars = sim.cars.filter(car => car.id === 'player-taxi');
  const abreast = [0, 1, 2, 3].map(lane => { const car = sim._makeCar(`file-${lane}`, 'sedan', sim._lanePoint(avenue, 1 - 90 / avenue.length, lane), avenue.angle, avenue); car._lane = lane; car._cruise = 8; car.speed = 8; sim.cars.push(car); return car; });
  advance(sim, 4);
  assert.ok(abreast.every(car => car.speed > 6.5), `still at speed side by side: ${abreast.map(car => car.speed.toFixed(1))}`);
  assert.ok(near(abreast.map(car => car.x), files));
  advance(sim, 14);
  assert.ok(abreast.every(car => car.speed < .2), 'all four stand at the red light');
  const noses = abreast.map(car => car.z - 2.3);
  assert.ok(noses.every(nose => nose > line - .3 && nose < line + 3.5) && Math.max(...noses) - Math.min(...noses) < .5, `noses ${noses.map(nose => nose.toFixed(1))} at a line ${line.toFixed(1)} m out`);
  assert.ok(near(abreast.map(car => car.x), files));
  // On green each goes its own way: the two in the middle straight on, in their lanes.
  advance(sim, vehicleAspect(plan, 0, sim.elapsed).remaining + 12);
  for (const lane of [1, 2]) assert.ok(abreast[lane]._edge === beyond && Math.abs(abreast[lane].x - files[lane]) < .3, 'a middle lane carries on in its lane');
  assert.ok(abreast[0]._edge === beyond ? Math.abs(abreast[0].x - files[0]) < .3 : abreast[0].x > 6, 'the right-hand lane went on or right');
  assert.ok(abreast[3]._edge === beyond ? Math.abs(abreast[3].x - files[3]) < .3 : abreast[3].x < -6, 'the left-hand lane went on or left');
});

test('on a street with several lanes, traffic pulls out round a car left standing in one of them', () => {
  const sim = new Simulation(crossing());
  const beyond = edgeInto(sim, [0, 0], [0, -400]);
  // A car is left in the right-hand lane 150 m down the avenue, and another stands a lane over, just short of it.
  sim.cars = sim.cars.filter(car => car.id === 'player-taxi');
  const spot = sim._lanePoint(beyond, 150 / 400, 0), left = sim._makeCar('left', 'sedan', spot, beyond.angle);
  const alongside = sim._makeCar('alongside', 'sedan', sim._lanePoint(beyond, 144 / 400, 1), beyond.angle);
  const behind = sim._makeCar('behind', 'sedan', sim._lanePoint(beyond, 110 / 400, 0), beyond.angle, beyond); behind._cruise = 8; behind.speed = 8;
  sim.cars.push(left, alongside, behind);
  advance(sim, 9);
  assert.ok(behind.speed < .2 && behind.z > spot.z + 4 && behind.z < spot.z + 9, 'it has stopped behind the standing car');
  assert.ok((behind._lane || 0) === 0 && behind._held > 2, 'and stays there while the next lane is taken alongside it');
  // That lane clears.
  sim.cars.splice(sim.cars.indexOf(alongside), 1);
  advance(sim, 9);
  assert.equal(behind._lane, 1, 'with the lane clear it pulls out');
  assert.ok(behind.z < spot.z - 8 && behind.speed > 4, `and goes by: ${(spot.z - behind.z).toFixed(0)} m past at ${behind.speed.toFixed(1)} m/s`);
  assert.ok(Math.abs(behind.x - sim._lanePoint(beyond, .5, 1).x) < .4, 'in the next lane');
  assert.ok(!(sim.elapsed - beyond._blockedAt < 5), 'and the street is open');
  // With every lane stopped up there is nowhere to go: it waits, and the block is shut after all.
  const wall = [1, 2, 3].map(lane => sim._makeCar(`left-${lane}`, 'sedan', sim._lanePoint(beyond, 250 / 400, lane), beyond.angle));
  const row = sim._makeCar('left-0', 'sedan', sim._lanePoint(beyond, 250 / 400, 0), beyond.angle);
  sim.cars.push(...wall, row);
  advance(sim, 25);
  assert.ok(behind.speed < .2 && behind._held > 4 && sim.elapsed - beyond._blockedAt < 1, 'it stands behind the row and the block is shut');
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
