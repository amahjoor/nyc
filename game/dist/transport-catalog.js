// Original arcade vehicles. Dimensions and control rates are in metres and seconds.
// The airport starts use the same runway frames as the pavement renderer.
import { airports } from './airport-data.js';

export const TRANSPORT = {
  helicopter: { name: 'Tour helicopter', kind: 'rotor', speed: 62, accel: 8, turn: 1.1, radius: 4.8, view: 17, eye: [1.9, 1.15], controls: 'Space climb · Shift descend · W / S move · A / D turn' },
  jet: { name: 'Passenger jet', kind: 'plane', speed: 135, accel: 8, lift: 41, turn: .38, radius: 13, view: 56, eye: [4.1, 11], controls: 'W throttle · Space climb above 80 kt · Shift descend · S brake' },
  turboprop: { name: 'Commuter plane', kind: 'plane', speed: 92, accel: 7, lift: 30, turn: .55, radius: 7.4, view: 32, eye: [2.6, 4.3], controls: 'W throttle · Space climb above 59 kt · Shift descend · S brake' },
  seaplane: { name: 'Floatplane', kind: 'plane', floats: true, speed: 70, accel: 5.8, lift: 22, turn: .68, radius: 4.6, view: 21, eye: [2.35, 1.4], controls: 'W throttle · Space climb above 43 kt · Shift descend onto water · S brake' },
  ferry: { name: 'Commuter ferry', kind: 'boat', speed: 14, accel: 1.9, turn: .34, radius: 4, length: 26, view: 39, eye: [5.1, 4.8], controls: 'W ahead · S astern · A / D helm · Space brake · E at a landing' },
  yacht: { name: 'Motor yacht', kind: 'boat', speed: 10.3, accel: 1.3, turn: .24, radius: 4.2, length: 39, view: 53, eye: [6.6, 4.8], controls: 'W ahead · S astern · A / D helm · Space brake · E at a landing' },
  waterTaxi: { name: 'Water taxi', kind: 'boat', speed: 20, accel: 3.1, turn: .75, radius: 1.8, length: 10, view: 19, eye: [2.2, 2.8], controls: 'W ahead · S astern · A / D helm · Space brake · E at a landing' },
  kayak: { name: 'Touring kayak', kind: 'boat', speed: 3.6, accel: 1.8, turn: 1.55, radius: .38, length: 4.2, view: 8, eye: [.85, .2], controls: 'W paddle · S backpaddle · A / D turn · E at a landing' },
  scooter: { name: 'Electric kick scooter', kind: 'street', speed: 8, accel: 3.6, turn: 1.9, radius: .38, view: 6.5, eye: [1.76, .12], controls: 'W power · A / D steer · S or Space brake · E step off' },
  motorcycle: { name: 'Street motorcycle', kind: 'street', speed: 36, accel: 7.5, turn: 1.4, radius: .55, view: 8, eye: [1.53, .15], controls: 'W throttle · A / D steer · S or Space brake · E get off' },
  bus: { name: 'City bus', kind: 'street', speed: 23, accel: 2.7, turn: .63, radius: 1.25, length: 12, view: 21, eye: [2.02, 4.9], controls: 'W throttle · A / D steer · S brake / reverse · E step off' },
  tram: { name: 'Roosevelt Island Tram', kind: 'cable', speed: 15, view: 17, eye: [1.7, 2.3], controls: 'W depart · E get off at either terminal' },
  rail: { name: 'Commuter train', kind: 'rail', speed: 27, view: 38, eye: [2.45, 9.5], controls: 'W depart · E get off at Douglaston or Little Neck' },
};

const point = ([x, z]) => ({ x, z });
function stop(id, type, place, borough, board, berth, angle) {
  return { id, type, place, borough, board: point(board), berth: point(berth), angle };
}
function runway(airport, type) {
  const { code, runways } = airport;
  const [cx, cz, dx, dz, halfLength] = runways[0].frame;
  const x = cx - dx * (halfLength - 120), z = cz - dz * (halfLength - 120);
  const side = type === 'jet' ? 17 : 11;
  return stop(code, type, code + ' runway ' + runways[0].name, 'Queens', [x + dz * side, z - dx * side], [x, z], Math.atan2(dx, dz));
}

// Boarding points are on the dry side of the bundled shoreline. Berths, parking
// spots and cable heights are staged for play. Each tram cabin has its own track.
export const BOARDINGS = [
  stop('pier6', 'helicopter', 'Downtown Manhattan Heliport', 'Manhattan', [-626, 2471], [-622, 2474], .55),
  ...airports.map(a => runway(a, a.code === 'JFK' ? 'jet' : 'turboprop')),
  stop('skyport', 'seaplane', 'East 23rd Street Skyport', 'Manhattan', [2407, -1294], [2425, -1283], .48),
  stop('pier11', 'ferry', 'Wall Street / Pier 11', 'Manhattan', [-418, 2242], [-435, 2256], .7),
  stop('fulton', 'waterTaxi', 'Fulton Ferry Landing', 'Brooklyn', [578, 2228], [570, 2228], 4.189),
  stop('pier26', 'kayak', 'Hudson River / Pier 26', 'Manhattan', [-979, 249], [-987, 246], 4.189),
  stop('ellis-ferry', 'ferry', 'Ellis Island ferry landing', 'Manhattan', [-3164,2827], [-3155,2818], .786),
  stop('liberty-ferry', 'ferry', 'Liberty Island ferry landing', 'Manhattan', [-3834,3741], [-3828,3749], -.992),
  stop('governors-ferry', 'ferry', 'Governors Island landing', 'Manhattan', [-1117,3356], [-1126,3349], 2.511),
  stop('chelsea-yacht', 'yacht', 'Chelsea Piers marina', 'Manhattan', [-867,-2441], [-879,-2442], 3.0),
  stop('stgeorge', 'ferry', 'St. George waterfront', 'Staten Island', [-6017, 8748], [-6014, 8724], 2.62),
  stop('grandconcourse', 'scooter', 'Grand Concourse', 'Bronx', [6632, -11553], [6633, -11553], .35),
  stop('greene', 'motorcycle', 'Greene Street', 'Manhattan', [131, -81], [130, -80], 2.57),
  stop('concourse-bus', 'bus', 'Grand Concourse / East 161st Street', 'Bronx', [6633, -11448], [6636, -11447], 2.703),
  stop('tram-west', 'tram', 'Second Avenue tram station', 'Manhattan', [3160, -4174], [3160, -4174], 0),
  stop('tram-east', 'tram', 'Roosevelt Island tram station', 'Manhattan', [3981, -3770], [3981, -3770], 0),
  stop('douglaston', 'rail', 'Douglaston LIRR station', 'Queens', [21239, -4959], [21243.7, -4955.8], 0),
  stop('little-neck', 'rail', 'Little Neck LIRR station', 'Queens', [21987, -5728], [21982.4, -5731.4], 0),
];

export const isAircraft = spec => spec?.kind === 'rotor' || spec?.kind === 'plane';
export const isWatercraft = spec => spec.kind === 'boat' || spec.floats === true;
export const transportDestination = stop => ({
  ...stop.board, name: TRANSPORT[stop.type].name + ' · ' + stop.place, borough: stop.borough, boarding: stop.id, exact: true,
  keywords: { rotor:'air helicopter', plane:'air aircraft airplane plane', boat:'boat harbor dock', street:'road street', cable:'aerial tram cable car', rail:'railroad train commuter rail' }[TRANSPORT[stop.type].kind],
});

// Cable anchor elevations in the city's vertical frame; two parallel tracks.
// The smooth span between towers sags slightly under the carriage.
export const TRAM_TERMINALS = BOARDINGS.filter(stop => stop.type === 'tram');
const RAIL_TERMINALS = BOARDINGS.filter(stop => stop.type === 'rail');
const cableHeights = [[0,19],[.22,66],[.48,80],[.79,71],[1,16]];
function linePosition(terminals,t,offset) {
  const a=terminals[0].berth,b=terminals[1].berth;
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  return {x:a.x+dx*t+offset*dz/length,z:a.z+dz*t-offset*dx/length,angle:Math.atan2(dx,dz)};
}
export function tramPosition(t, track) {
  const anchors = cableHeights;
  const i = anchors.findIndex(([end], i) => i && end >= t);
  const [start, low] = anchors[i - 1], [end, high] = anchors[i];
  const u = (t - start) / (end - start);
  return {...linePosition(TRAM_TERMINALS,t,track*3.3), y:low+(high-low)*u-10*u*(1-u)};
}

// This section of the Port Washington Branch is straight to within one metre
// of the MTA's Nov 16, 2026 GTFS shape 6F8FDD4A between stops 42 and 120.
// https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip
export function railPosition(t,track,heightAt) {
  const p=linePosition(RAIL_TERMINALS,t,track*2);
  return {...p,y:heightAt(p.x,p.z)+.27};
}
export const GUIDED_LINES = {
  tram:{terminals:TRAM_TERMINALS,position:tramPosition},
  rail:{terminals:RAIL_TERMINALS,position:railPosition},
};
