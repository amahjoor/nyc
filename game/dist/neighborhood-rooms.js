import { placeName } from './places.js';

export const NEIGHBORHOOD_FIXTURES = {
  toolChest(t, w, d, h, enamel) {
    t.box(0, 0, w, d, h - .13, .10, enamel);
    t.box(0, 0, w, d, .03, h - .03, '#505859');
    for (let i = 0; i < 5; i++) {
      const up = .17 + i * .14;
      t.plate(0, d / 2 + .002, w - .08, .12, up, '#782f32');
      t.rodU(0, d / 2 + .012, w - .19, .014, up + .1, '#b4bbba');
    }
    for (const side of [-1, 1]) t.drum(side * (w / 2 - .11), 0, d * .6, .08, .08, '#353738');
  },
  tyreDisplay(t, w, d, h) {
    t.box(0, 0, w, d, .12, 0, '#465557');
    for (const side of [-1, 1]) {
      const u = side * w * .24, radius = Math.min(w * .22, (h - .12) / 2);
      t.drum(u, 0, .22, radius, radius + .12, '#272a2b');
      t.drum(u, .12, .03, radius * .62, radius + .12, '#9ca5a4');
      t.drum(u, .14, .025, radius * .26, radius + .12, '#51585b');
      for (let j = 0; j < 5; j++) {
        const angle = j * Math.PI * .4;
        t.drum(u + radius * .44 * Math.cos(angle), .14, .016, radius * .085,
          .12 + radius + radius * .44 * Math.sin(angle), '#42494c');
      }
    }
  },
  copier(t, w, d, h, color) {
    t.box(0, 0, w * .94, d * .94, .10, .04, '#424a4c');
    t.box(0, 0, w, d, h * .51, .14, color);
    for (let i = 0; i < 3; i++) t.plate(0, d / 2 + .003, w * .84, .024, .24 + .15 * i, '#58656a');
    t.box(-w * .33, 0, w * .34, d, h * .24, h * .62, color);
    t.box(0, -d * .31, w, d * .38, h * .24, h * .62, '#444e52');
    t.box(w * .17, d * .08, w * .45, d * .57, .021, h * .62, '#f5f0de');
    t.box(0, 0, w, d, h * .09, h * .84, '#505d63');
    t.box(0, -d * .07, w * .94, d * .79, h * .07, h * .93, color);
    t.plate(w * .27, d / 2 + .005, w * .22, .066, h * .85, '#8ed2ce', true);
  },
  sewingMachine(t, w, d, h, enamel) {
    t.box(0, 0, w, d, .06, 0, enamel);
    t.box(w * .30, 0, w * .27, d * .78, h - .10, .06, enamel);
    t.box(0, 0, w * .82, d * .64, .10, h - .14, enamel);
    t.box(-w * .32, 0, .08, d * .55, .13, h - .20, enamel);
    t.post(-w * .32, 0, .008, h - .25, .06, '#bfc5c4');
    t.disc(w * .20, 0, .031, .06, h - .05, '#98534d');
    t.box(-w * .23, d * .21, .20, .11, .012, .063, '#566b86');
  },
  bottleShelf(t, w, d, h, timber) {
    t.box(0, 0, w, d, .04, 0, timber);
    const glass = ['#476a54', '#ab7547', '#879fa0', '#69463c'];
    const count = Math.floor(w / .19);
    for (let i = 0; i < count; i++) {
      const u = (i + .5) * w / count - w / 2, tall = h - .08 * (i % 2);
      t.post(u, 0, .057, tall * .60, .04, glass[i % 4]);
      t.post(u, 0, .024, tall * .25, .04 + tall * .60, glass[i % 4]);
      t.plate(u, .055, .082, .088, .095, i % 3 ? '#e0d4b1' : '#9e5550');
      t.can(u, 0, .027, .03, .04 + tall * .85, '#cab899');
    }
  },
  draftTaps(t, w, d, h) {
    t.box(0, 0, w, d, .025, 0, '#8c9696');
    t.post(0, -.05, .047, h * .51, .02, '#b9ac89');
    t.rodU(0, -.05, w * .82, .04, h * .49, '#cdbb8f');
    for (const [i, color] of ['#bb663b', '#253e42', '#e2c178'].entries()) {
      const u = (i - 1) * w * .32;
      t.rodV(u, 0, .14, .025, h * .49, '#bbc1be');
      t.post(u, .06, .022, h * .27, h * .34, '#aab1ae');
      t.post(u, .06, .035, h * .37, h * .61, color);
    }
  },
  djDeck(t, w, d, h, color) {
    t.box(0, 0, w, d, h * .54, 0, color);
    for (const side of [-1, 1]) {
      const u = side * w * .30;
      t.disc(u, .016, d * .36, .026, h * .54, '#a7aba7');
      t.disc(u, .016, d * .33, .015, h * .54 + .026, '#25262c');
      t.disc(u, .016, d * .087, .007, h * .54 + .041, '#b78a60');
      for (let j = 0; j < 4; j++)
        t.box(side * (.041 + j * .031), .025, .018, d * .32, .018, h * .54, '#908d93');
    }
  },
  clubSpeaker(t, w, d, h, color) {
    t.box(0, 0, w, d, h, 0, color);
    for (const [up, radius] of [[h * .35, w * .39], [h * .77, w * .23]]) {
      t.drum(0, d / 2, .015, radius, up, '#53545c');
      t.drum(0, d / 2 + .012, .012, radius * .82, up, '#23242b');
      t.drum(0, d / 2 + .022, .014, radius * .30, up, '#555660');
    }
  },
};

function serviceShop(r, prop) {
  const copy = r.place.kind === 'copyshop', paint = r.place.kind === 'bodyshop';
  const desk = r.half - .94, counter = r.depth - 1.40;
  r.floor = copy ? '#b6b4a8' : '#888e8c'; r.wall = '#e1dfd5';
  r.finish = { floor: copy ? 'tile' : 'stone', feature: copy ? '#245967' : '#34484c', accent: '#c79351',
    ink: '#fff2da', title: placeName(r.place), line: copy ? 'PRINT & SHIP' : paint ? 'BODY & PAINT' : 'PARTS & SERVICE', zones: [] };
  prop('serviceDesk', desk, counter, 1.54, .69, .97, '#697673', { trim: '#98a5a1', top: '#c5c7bc' });
  prop('register', desk, counter, .40, .34, .38, '#465052', { y: .97, solid: false, face: [0, 1] });
  r.staff(desk, counter + .76, 0, -1);
  if (copy) {
    for (let b = 1.04; b < r.depth - .62; b += 1.7)
      prop('copier', -r.half + .55, b, .82, .86, 1.17, '#d7d9d4', { face: [1, 0] });
    if (counter > 4) prop('writingDesk', r.half - .45, 1.9, .67, 1.40, .86, '#927b63', { face: [-1, 0] });
    prop('mailSupplies', -r.half + .94, r.depth - .32, 1.57, .53, 1.66, '#71818a');
  } else {
    const work = -r.half + .52;
    prop('toolChest', work, 1.12, .66, 1.18, .95, '#af4540', { face: [1, 0] });
    prop('pegboard', -r.half + .20, 1.12, .4, 1.35, 1.3, '#6b6359', { face: [1, 0], y: .96, solid: false });
    if (paint) {
      for (let i = 0; i < 8; i++) r.add(-r.half + .42 + i % 4 * .27, r.depth - .06,
        .22, .06, .24, ['#718891', '#4b7166', '#bbaa84', '#af5141', '#d7dad3', '#666971', '#415867', '#944b50'][i],
        1.20 + Math.floor(i / 4) * .29, false);
    } else prop('tyreDisplay', -r.half + .91, r.depth - .37, 1.55, .56, .86, '#454c4b');
    if (counter > 3.1) r.seat(r.half - .42, 1.1, -1, 0, 0, '#596761', .54, .89);
  }
}

function tailor(r, prop) {
  r.floor = '#aa8b71'; r.wall = '#ede3ce';
  r.finish = { floor: 'wood', feature: '#485e58', accent: '#bc9362', ink: '#f7efda',
    title: placeName(r.place), line: 'ALTERATIONS & FITTINGS', zones: [] };
  const desk = r.half - 1.08, back = r.depth - 1.38;
  r.add(desk, back, 1.82, .74, .87, '#946f52', 0, true, 'table');
  prop('sewingMachine', desk + .37, back, .56, .26, .37, '#c3c5b8', { y: .87, solid: false, face: [0, 1] });
  r.staff(desk, back + .73, 0, -1);
  const rail = -r.half + .54;
  prop('garmentRail', rail, 1.16, .64, 1.64, 1.52, '#797574', { face: [1, 0] });
  for (const [i, tint] of ['#3d4957', '#aa835f', '#566659'].entries())
    prop('shirt', rail, .75 + i * .41, .31, .61, .71, tint, { y: .81, solid: false, face: [1, 0] });
  prop('fittingRoom', -r.half + .69, r.depth - .68, 1.23, 1.21, 2.18, '#756553');
  if (back > 3.3) r.seat(r.half - .47, 1.16, -1, 0, 0, '#67776c', .60, .59);
}

function nightlife(r, prop) {
  const club = r.place.kind === 'club', pub = r.place.kind === 'pub';
  const timber = club ? '#393042' : '#715038', accent = club ? '#ac7abb' : '#b59a69';
  r.wall = club ? '#302939' : '#544539'; r.floor = club ? '#3d3848' : '#705841';
  r.light = { color: club ? 0xd7b7f2 : 0xffdcab, power: club ? 38 : 47, ceiling: '#443d3f' };
  const bar = -r.half + 1.00, end = club ? Math.max(2.1, r.depth - 2.25) : r.depth - .53;
  const start = .65, length = end - start, middle = (end + start) / 2;
  prop('serviceDesk', bar, middle, .60, length, 1.04, timber, { face: [1, 0], trim: accent, top: '#554941' });
  r.staff(bar - .60, middle, 1, 0);
  r.people.at(-1).role = 'cashier';
  prop('draftTaps', bar, middle, .32, .63, .44, accent, { face: [-1, 0], y: 1.04, solid: false });
  for (let b = start + .75; b + .70 <= end; b += 1.85)
    prop('bottleShelf', -r.half + .16, b, .28, 1.44, .39, timber, { y: 1.48, face: [1, 0], solid: false });
  if (!club) {
    for (let b = 1.8; b < end - .25; b += 1.18) r.seat(bar + .72, b, -1, 0, .3, '#644939', .4, .4, .76);
    for (let b = 1.75; b < r.depth - 1; b += 2.70) r.booth(r.half - .80, b, pub ? '#37594d' : '#783e43');
    const back = r.depth - .24;
    prop('bottleShelf', 0, back, Math.min(2.8, r.width - 1.6), .31, .39, timber, { y: 1.63, solid: false });
    for (const side of [-1, 1]) prop('wallSconce', side * (r.half - .30), back, .16, .14, .56, accent, { y: 1.85, solid: false });
    return;
  }
  const booth = r.half - 1.14, b = r.depth - 1.12;
  r.add(booth, b, 1.72, .67, .99, '#39343f');
  prop('djDeck', booth, b, 1.35, .53, .14, '#25232b', { y: .99, solid: false, face: [0, 1] });
  r.staff(booth, b + .65, 0, -1);
  for (const side of [-1, 1])
    prop('clubSpeaker', side * (r.half - .29), r.depth - .24, .42, .34, .76, '#292831', { y: 1.18, solid: false });
  const lounge = r.width >= 6 && b >= 4.3;
  if (lounge) {
    for (let at = 2.20; at < b - 1.0; at += 1.9)
      r.seat(r.half - .39, at, -1, 0, 0, '#693e5b', .62, 1.46);
    prop('queueRail', r.half - 1.35, .87, .25, 1.12, .89, '#71465b');
  }
  const from = bar + .48, to = r.half - (lounge ? .92 : .25);
  for (let a = from + .30; a < to - .28; a += .64)
    for (let at = 1.0, i = 0; at < b - .72; at += .64, i++)
      r.add(a, at, .60, .60, .018, ['#726393', '#906581', '#54838c'][(Math.round((a - from) / .64) + i) % 3], .038, false);
  for (const y of [1.6, 2.1]) r.panel(1, .6, r.depth - 1.3, .055, y, y > 2 ? '#bc72ac' : '#77aab8');
}

export const NEIGHBORHOOD_ROOMS = { workshop: serviceShop, copyshop: serviceShop, tailor, bar: nightlife, club: nightlife };
