import { brandKey, placeName } from './places.js';

// Materials, equipment and circulation of the club's public floor.
const CLUBS = {
  gym:     { floor: '#444848', wall: '#d4d5ce', feature: '#3a4d50', ink: '#f1efdf', accent: '#de9b54', frame: '#53595a', entry: 'tile', title: '', line: 'STRENGTH   /   CONDITIONING' },
  planet:  { floor: '#424046', wall: '#dad6dd', feature: '#533182', ink: '#ffdd45', accent: '#ffcf27', frame: '#684093', entry: 'tile', title: 'planet fitness', line: 'CARDIO   /   STRENGTH' },
  equinox: { floor: '#333637', wall: '#b5b2aa', feature: '#232727', ink: '#f3f1ec', accent: '#b5a17c', frame: '#363a3b', entry: 'stone', title: 'EQUINOX', line: 'TRAINING FLOOR' },
  lifetime:{ floor: '#494540', wall: '#e0d9c8', feature: '#5d4638', ink: '#fff4e1', accent: '#bea17a', frame: '#514d46', entry: 'wood', title: 'LIFE TIME', line: 'ATHLETIC CLUB' },
  cycling: { floor: '#393b3e', wall: '#777978', feature: '#2b3337', ink: '#faf5dc', accent: '#e9ae4e', frame: '#41474a', entry: 'tile', title: '', line: 'CYCLE STUDIO' },
  yoga:    { floor: '#c5a180', wall: '#eee6d9', feature: '#737e6e', ink: '#fbf5e7', accent: '#a9b09c', frame: '#7b9083', entry: 'wood', title: '', line: 'YOGA STUDIO' },
  pilates: { floor: '#b29071', wall: '#e9e3d7', feature: '#816e60', ink: '#fff5e4', accent: '#baa07f', frame: '#b18761', entry: 'wood', title: '', line: 'PILATES STUDIO' },
};
const CHAINS = { 'planet-fitness': 'planet', 'equinox-fitness': 'equinox', 'life-time-fitness': 'lifetime' };
function clubOf(name) {
  const chain = CHAINS[brandKey(name)];
  if (chain) return chain;
  if (/pilates|solidcore|club lagree/i.test(name)) return 'pilates';
  if (/yoga/i.test(name)) return 'yoga';
  if (/soulcycle|cyclebar|\b(?:cycling|spin studio)\b/i.test(name)) return 'cycling';
  return 'gym';
}

function gym(r, prop) {
  const name = placeName(r.place), club = clubOf(name), design = CLUBS[club];
  const lounge = club === 'lifetime', dark = club === 'equinox', studio = ['yoga', 'pilates', 'cycling'].includes(club);
  const side = lounge ? 1 : -1, desk = side * (r.half - .93);
  r.wall = design.wall; r.floor = design.floor;
  r.light = { color: lounge || studio ? 0xffead4 : 0xf2f4ff, power: 72,
    ceiling: dark || club === 'cycling' ? '#383b3b' : '#dedcd4', strip: lounge || club === 'pilates' ? '#fff0ce' : '#fff9ed' };
  r.finish = { floor: studio && club !== 'cycling' ? 'wood' : 'rubber', entry: design.entry, entryDepth: lounge ? 3.2 : 2.3,
    feature: design.feature, ink: design.ink, accent: design.accent, title: design.title || name, line: design.line,
    slats: lounge || club === 'pilates', mirror: dark || studio,
    zones: lounge ? ['CYCLE', 'PILATES'] : studio ? ['CHECK-IN', design.line] : ['STRENGTH', 'CARDIO'] };

  // The check-in desk opens straight onto the central aisle. Its slats and
  // reader face the door, with the staff member on the other side.
  r.add(desk, 1.38, 1.53, .69, .99, design.feature);
  r.staff(desk, 2.09, 0, -1);
  for (let i = -3; i <= 3; i++) r.add(desk + i * .18, 1.024, .048, .022, .69, lounge ? '#a38162' : design.frame, .19, false);
  r.add(desk, 1.017, 1.39, .026, .038, design.accent, .87, false);
  r.add(desk - side * .53, 1.27, .16, .19, .045, '#3b4143', 1.0, false);

  // Keep the opposite window active even in the smallest footprint.
  const windowA = -side * (r.half - .89);
  const machine = (shape, a, b) => {
    const [w, d, h] = { treadmill: [.91, 1.88, 1.47], spinBike: [.54, 1.12, 1.17],
      reformer: [.72, 2.02, .72], exerciseMat: [.68, 1.68, .14] }[shape];
    prop(shape, a, b, w, d, h, design.frame, { accent: design.accent, solid: shape !== 'exerciseMat' });
  };
  if (lounge) {
    r.seat(windowA, 1.28, 0, 1, 0, '#ad9578', 1.24, .60);
    if (r.depth >= 5) prop('planter', -r.half + .44, 2.22, .60, .60, 1.43, '#998674');
    if (r.depth < 5.2) machine('spinBike', windowA, 2.53);
    prop('towelShelf', r.half - .82, r.depth - .32, 1.36, .52, 1.53, '#967654');
  } else {
    machine(club === 'pilates' ? 'reformer' : club === 'yoga' ? 'exerciseMat' : club === 'cycling' ? 'spinBike' : 'treadmill', windowA, 1.53);
  }

  if (studio) {
    const equipment = { cycling: 'spinBike', yoga: 'exerciseMat', pilates: 'reformer' }[club];
    const pitch = club === 'cycling' ? 1.6 : 2.4;
    for (let b = 3.75; b < r.depth - 1.58; b += pitch) {
      for (const lane of [-1, 1]) machine(equipment, lane * (r.half - 1.0), b);
    }
    prop('towelShelf', -r.half + .80, r.depth - .29, 1.31, .50, 1.53, '#93775e');
    return;
  }

  if (lounge) {
    // The lounge gives way to a wood-framed studio on one side and cardio
    // facing the training floor on the other.
    for (let b = 3.86; b <= r.depth - 1.66; b += 2.65) {
      machine('reformer', r.half - .98, b);
      machine('spinBike', -r.half + .93, b);
    }
  } else if (dark) {
    for (let b = 4.15; b <= r.depth - 1.05; b += 2.35) {
      if (b < r.depth - 2) {
        prop('dumbbells', -r.half + .42, b, .69, 1.78, .99, design.frame, { face: [1, 0] });
        if (r.width >= 6) prop('weightBench', -r.half + 1.62, b, .43, 1.38, .66, '#373b3b');
      }
      machine('treadmill', windowA, b);
    }
    prop('cableStation', -r.half + 1.05, r.depth - .58, 1.68, .94, 2.15, design.frame, { accent: design.accent });
  } else {
    // Cardio in paired lanes at Planet Fitness, a single lane at smaller clubs.
    for (let b = 3.79; b < r.depth - 1.05; b += 2.34) {
      machine('treadmill', windowA, b);
      if (club === 'planet' && r.width >= 6.8) machine('treadmill', windowA - 1.18, b);
    }
    prop('cableStation', -r.half + 1.02, r.depth - .57, 1.64, .94, 2.18, design.frame, { accent: design.accent });
    for (let b = 3.65; b < r.depth - 2.0; b += 2.25)
      prop('dumbbells', -r.half + .44, b, .70, 1.7, 1.02, design.frame, { face: [1, 0] });
  }
}

function laundromat(r, prop) {
  r.floor = '#c1c9c5'; r.wall = '#e0e9e2';
  r.finish = { floor: 'tile', feature: '#38686c', ink: '#f6f2d9', accent: '#aad5c8', title: placeName(r.place), line: 'WASH   •   DRY   •   FOLD', zones: ['WASHERS', 'DRYERS'] };
  const deskA = r.half - .93;
  r.add(deskA, r.depth - 1.38, 1.55, .66, .96, '#518987');
  r.staff(deskA, r.depth - .66, 0, -1);
  for (let b = .93; b < r.depth - .47; b += 1.0)
    prop('laundryMachine', -r.half + .54, b, .95, .88, 1.12, '#c8d0ce', { face: [1, 0] });
  for (let b = 1.0; b < r.depth - 2.3; b += 1.04)
    prop('laundryMachine', r.half - .55, b, .96, .93, 2.05, '#d6d8cf', { face: [-1, 0], stacked: true });
  if (r.depth > 5.7) {
    const a = r.width > 6 ? -.55 : 0, b = r.depth - 2.6;
    r.add(a, b, 1.10, 1.5, .86, '#c3ad91', 0, true, 'table');
    for (let i = 0; i < 3; i++) r.add(a + .21, b + .21, .44, .34, .048, i === 1 ? '#c1d1cf' : '#f1ede1', .86 + i * .05, false);
    prop('laundryCart', a, b - 1.25, .62, .8, .82, '#b7bfbc');
    prop('soapVendor', -r.half + 1.69, r.depth - .35, .75, .56, 1.60, '#578783');
    if (r.width >= 6.8) r.seat(.12, r.depth - .36, 0, -1, 0, '#687f80', 1.45, .50);
  }
}

function postoffice(r, prop) {
  r.floor = '#aaa9a2'; r.wall = '#dddcd3';
  r.finish = { floor: 'tile', feature: '#263e54', ink: '#f4f0e4', accent: '#c86055', title: placeName(r.place), line: 'RETAIL SERVICES', zones: ['PACKING TABLE', 'PO BOXES'] };
  const a = -r.half + 1.15, b = r.depth - 1.46;
  r.add(a, b, 1.98, .78, 1.03, '#687d87');
  r.staff(a, b + .76, 0, -1);
  // Postal scale, weighing pan and two taped cartons at the service window.
  r.add(a - .56, b, .42, .35, .08, '#505b60', 1.04, false);
  r.add(a - .56, b, .39, .33, .022, '#c5c9c8', 1.12, false);
  for (let i = 0; i < 2; i++) {
    const boxA = a + .58, up = 1.04 + i * .20;
    r.add(boxA, b, .42 - i * .06, .32, .20, '#b38f63', up, false);
    r.add(boxA, b, .064, .321, .008, '#e0c295', up + .20, false);
  }
  prop('parcelDrop', r.half - .64, 1.02, .9, .76, 1.32, '#355575');
  for (let depth = 2.45; depth < Math.min(6.4, r.depth - .65); depth += 1.38)
    prop('poBoxes', r.half - .19, depth, .33, 1.34, 1.66, '#53616a', { face: [-1, 0], y: .35 });
  if (b > 3.9) {
    r.add(-r.half + .53, 2.15, .76, 1.65, .95, '#9b8b75', 0, true, 'table');
    prop('mailSupplies', r.half - 1.04, r.depth - .34, 1.58, .55, 1.63, '#71818a');
    r.add(a, b + .30, 1.93, .08, .14, '#536772', 2.05, false);
    for (const side of [-1, 1]) r.add(a + side * .92, b + .30, .06, .07, 1.06, '#71818a', 1.01, false);
  }
}

export const BUSINESS_ROOMS = { gym, laundromat, postoffice };
