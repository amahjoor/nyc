// Licence plates.
//
// Every car carries the plate a car of its kind carries in New York City: the
// white Excelsior plate issued since 2020, the Empire Gold plate before it or,
// on a few old cars, the blue and white Empire State plate; a medallion number
// on a yellow cab, a T&LC plate on a green cab, a commercial plate on a trade
// van; and, on about one car in eight, the plate of a state whose cars are
// in the city every day. A plate's number follows its issue: an Excelsior
// passenger plate begins with K or L, a gold one with F to J.
//
// This module is the plates themselves: which one a car has, what it says and
// how its artwork and its characters are painted. vehicle-plates.js puts them
// on cars. Nothing here needs a renderer.

/** Characters a plate is stamped with: digits, letters, a gap, and the marks that part its two groups. */
export const GLYPHS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
export const MARK = { gap: 36, newYork: 37, keystone: 38, newJersey: 39, dash: 40, dot: 41 };
/** How a mark reads when a plate's number is written out. */
const SPOKEN = { [MARK.gap]: ' ', [MARK.newYork]: '-', [MARK.keystone]: '-', [MARK.newJersey]: '-', [MARK.dash]: '-', [MARK.dot]: '·' };

// Each character is the centre line of its stroke in a box 40 wide and 70 high, as a die stamps it:
// one weight of line, round corners, no serifs.
const BOWL = 'M20 0Q40 0 40 20V50Q40 70 20 70Q0 70 0 50V20Q0 0 20 0Z', STEM = 'M0 70V0H26Q40 0 40 14V24Q40 38 26 38H0';
const STROKES = {
  0: 'M12 0H28Q40 0 40 12V58Q40 70 28 70H12Q0 70 0 58V12Q0 0 12 0Z', 1: 'M8 12L22 0V70', 2: 'M0 14Q0 0 14 0H26Q40 0 40 14V20Q40 30 30 36L8 50Q0 56 0 64V70H40',
  3: 'M0 10Q2 0 14 0H26Q40 0 40 13V20Q40 33 27 33H14M27 33Q40 33 40 46V57Q40 70 26 70H14Q2 70 0 60', 4: 'M30 70V0L0 48H40', 5: 'M38 0H4V30H24Q40 30 40 44V56Q40 70 26 70H14Q2 70 0 60',
  6: 'M38 8Q34 0 26 0H14Q0 0 0 14V56Q0 70 14 70H26Q40 70 40 56V44Q40 30 26 30H14Q0 30 0 44', 7: 'M0 0H40L16 70',
  8: 'M14 33Q2 33 2 20V13Q2 0 14 0H26Q38 0 38 13V20Q38 33 26 33H14Q0 33 0 46V57Q0 70 14 70H26Q40 70 40 57V46Q40 33 26 33',
  9: 'M2 62Q6 70 14 70H26Q40 70 40 56V14Q40 0 26 0H14Q0 0 0 14V26Q0 40 14 40H26Q40 40 40 26',
  A: 'M0 70V16Q0 0 20 0Q40 0 40 16V70M0 44H40', B: 'M0 0V70H26Q40 70 40 57V46Q40 33 26 33H0M26 33Q38 33 38 20V13Q38 0 26 0H0', C: 'M40 12Q38 0 26 0H14Q0 0 0 14V56Q0 70 14 70H26Q38 70 40 58',
  D: 'M0 0V70H24Q40 70 40 54V16Q40 0 24 0H0', E: 'M40 0H0V70H40M0 34H30', F: 'M40 0H0V70M0 34H30', G: 'M40 12Q38 0 26 0H14Q0 0 0 14V56Q0 70 14 70H26Q40 70 40 56V38H22',
  H: 'M0 0V70M40 0V70M0 34H40', I: 'M20 0V70M8 0H32M8 70H32', J: 'M40 0V54Q40 70 24 70H16Q0 70 0 54V48', K: 'M0 0V70M40 0L0 42M14 30L40 70', L: 'M0 0V70H40',
  M: 'M0 70V0L20 36L40 0V70', N: 'M0 70V0L40 70V0', O: BOWL, P: STEM, Q: BOWL + 'M24 52L40 70', R: STEM + 'M22 38L40 70',
  S: 'M40 12Q38 0 26 0H14Q0 0 0 13V20Q0 31 14 33L26 36Q40 38 40 50V57Q40 70 26 70H14Q2 70 0 58', T: 'M0 0H40M20 0V70', U: 'M0 0V54Q0 70 16 70H24Q40 70 40 54V0',
  V: 'M0 0L20 70L40 0', W: 'M0 0L9 70L20 30L31 70L40 0', X: 'M0 0L40 70M40 0L0 70', Y: 'M0 0L20 36L40 0M20 36V70', Z: 'M0 0H40L0 70H40',
};
// The marks between a plate's groups are filled shapes in the same box: New York's outline, Pennsylvania's keystone, New Jersey's outline.
const SHAPES = {
  [MARK.newYork]: 'M2 34L10 31L13 25L24 24L27 18L37 16L39 30L37 42L39 50L33 52L31 46L20 46L8 48L3 46L6 40Z',
  [MARK.keystone]: 'M6 22H13V16H27V22H34L31 32L34 50H24V44H16V50H6L9 32Z',
  [MARK.newJersey]: 'M14 14L26 17L30 26L25 32L31 40L26 54L18 58L13 50L17 42L11 36L15 28Z',
  [MARK.dash]: 'M8 30H32V40H8Z', [MARK.dot]: 'M14 29H26V41H14Z',
};

/** The sheet of characters: `COLUMNS` cells across, each `CELL` pixels, in a square of `SHEET` pixels. */
export const SHEET = 1024, CELL = [80, 208], COLUMNS = 12;
/**
 * Paint the characters, white on black, onto a 2D context `SHEET` pixels square. Each cell is as narrow
 * as a stamped character is, so that a plate's eight places are eight cells side by side.
 */
export function paintGlyphs(context, Path = globalThis.Path2D, Matrix = globalThis.DOMMatrix) {
  context.fillStyle = '#000'; context.fillRect(0, 0, SHEET, SHEET);
  context.strokeStyle = context.fillStyle = '#fff'; context.lineWidth = 21; context.lineJoin = context.lineCap = 'round';
  const cell = code => [(code % COLUMNS) * CELL[0], Math.floor(code / COLUMNS) * CELL[1]];
  [...GLYPHS].forEach((glyph, code) => {
    if (!STROKES[glyph]) return;
    // The box is stretched to the cell before the stroke is drawn, so the line keeps one weight.
    const [x, y] = cell(code), path = new Path();
    path.addPath(new Path(STROKES[glyph]), new Matrix([54 / 40, 0, 0, 174 / 70, x + 13, y + 17]));
    context.stroke(path);
  });
  for (const [code, shape] of Object.entries(SHAPES)) {
    const [x, y] = cell(+code), path = new Path();
    path.addPath(new Path(shape), new Matrix([1.9, 0, 0, 2.3, x + 2, y + 24]));
    context.fill(path);
  }
}

const NAVY = '#0c2a63', GOLD = '#f2b21b';
/**
 * The plates there are. `ink` is the colour of the number; `paint(context)` draws everything else on a
 * plate 512 by 256. `first` are the letters a number of that issue begins with.
 */
export const DESIGNS = [
  { id: 'excelsior', state: 'NY', ink: NAVY, first: 'KL', legend: 'EXCELSIOR' },
  { id: 'gold', state: 'NY', ink: '#0e1f4d', first: 'FGHJ', legend: 'EMPIRE STATE' },
  { id: 'empire', state: 'NY', ink: '#12306e', first: 'DE', legend: 'EMPIRE STATE' },
  { id: 'excelsior-commercial', state: 'NY', ink: NAVY, legend: 'COMMERCIAL' },
  { id: 'gold-commercial', state: 'NY', ink: '#0e1f4d', legend: 'COMMERCIAL' },
  { id: 'gold-taxi', state: 'NY', ink: '#0e1f4d', legend: 'T&LC' },
  { id: 'excelsior-hire', state: 'NY', ink: NAVY, legend: 'T&LC' },
  { id: 'new-jersey', state: 'NJ', ink: '#141414' },
  { id: 'pennsylvania', state: 'PA', ink: '#0c2c73', rearOnly: true },
  { id: 'connecticut', state: 'CT', ink: '#0d2a66' },
  { id: 'florida', state: 'FL', ink: '#17603a', rearOnly: true },
];
const DESIGN = Object.fromEntries(DESIGNS.map((design, index) => [design.id, index]));
/** The artwork sheet: `ACROSS` plates to a row, each `PLATE` pixels. */
export const PLATE = [512, 256], ACROSS = 4;

const legend = (c, text, y, size, colour, weight = 700, spread = 3) => {
  c.fillStyle = colour; c.font = `${weight} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  if ('letterSpacing' in c) c.letterSpacing = spread + 'px';
  c.fillText(text, 256 + spread / 2, y);
};
const band = (c, y, h, colour) => { c.fillStyle = colour; c.fillRect(0, y, 512, h); };
/** Pale shapes along the foot of an Excelsior plate: the falls, the mountains, the statue, the skyline, the lighthouse. */
function landmarks(c) {
  c.fillStyle = '#b9cde6'; c.strokeStyle = '#8fb0d6'; c.lineWidth = 2;
  // Niagara: a ledge and the water falling from it.
  c.fillRect(22, 184, 74, 5); for (let x = 26; x < 96; x += 7) c.fillRect(x, 189, 3, 21);
  // The Adirondacks.
  c.beginPath(); c.moveTo(104, 210); c.lineTo(132, 178); c.lineTo(146, 192); c.lineTo(168, 170); c.lineTo(200, 210); c.closePath(); c.fill();
  // Liberty on her pedestal, torch up.
  c.fillRect(246, 196, 20, 14); c.fillRect(251, 176, 10, 20); c.fillRect(253, 168, 6, 8); c.fillRect(260, 160, 3, 18); c.fillRect(258, 156, 7, 5);
  // The skyline, a spire among it.
  for (const [x, w, h] of [[300, 12, 22], [314, 10, 32], [326, 14, 26], [342, 8, 44], [352, 14, 30], [368, 12, 20], [382, 10, 28]]) c.fillRect(x, 210 - h, w, h);
  c.fillRect(345, 156, 2, 12);
  // Montauk light.
  c.beginPath(); c.moveTo(452, 210); c.lineTo(457, 176); c.lineTo(467, 176); c.lineTo(472, 210); c.closePath(); c.fill(); c.fillRect(455, 168, 14, 8); c.fillRect(425, 204, 70, 6);
}
const ARTWORK = {
  excelsior(c, legendText = 'EXCELSIOR') {
    band(c, 0, 256, '#fbfbf8'); landmarks(c);
    legend(c, 'NEW YORK', 33, 40, NAVY, 800, 5);
    for (const x of [20, 418]) { c.fillStyle = GOLD; c.fillRect(x, 26, 74, 5); c.fillStyle = NAVY; c.fillRect(x, 35, 74, 3); }
    c.fillStyle = GOLD; c.fillRect(0, 212, 512, 34); c.fillStyle = NAVY; c.fillRect(0, 210, 512, 3); c.fillRect(0, 245, 512, 3);
    legend(c, legendText, 230, 25, NAVY, 800, 4);
  },
  gold(c, legendText = 'EMPIRE STATE') {
    band(c, 0, 256, '#f5b216'); band(c, 0, 60, '#10214d');
    legend(c, 'NEW YORK', 33, 40, '#f5b216', 800, 5);
    legend(c, legendText, 232, 27, '#10214d', 800, 4);
  },
  empire(c) {
    band(c, 0, 256, '#fcfcfa');
    const sky = c.createLinearGradient(0, 0, 0, 62); sky.addColorStop(0, '#0d2a6b'); sky.addColorStop(1, '#2f5fae');
    c.fillStyle = sky; c.fillRect(0, 0, 512, 60); band(c, 212, 44, '#12306e');
    // The falls, the mountains and the skyline, drawn in one pale line across the middle.
    c.strokeStyle = '#c3d3ea'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 150);
    for (const [x, y] of [[60, 150], [90, 120], [120, 150], [170, 104], [210, 150], [300, 150], [300, 118], [318, 118], [318, 96], [330, 96], [330, 132], [352, 132], [352, 150], [512, 150]]) c.lineTo(x, y);
    c.stroke();
    legend(c, 'NEW YORK', 33, 40, '#fff', 800, 5); legend(c, 'EMPIRE STATE', 234, 25, '#fff', 800, 4);
  },
  'excelsior-commercial': c => ARTWORK.excelsior(c, 'COMMERCIAL'), 'gold-commercial': c => ARTWORK.gold(c, 'COMMERCIAL'),
  'gold-taxi': c => ARTWORK.gold(c, 'T&LC'), 'excelsior-hire': c => ARTWORK.excelsior(c, 'T&LC'),
  'new-jersey'(c) {
    const fade = c.createLinearGradient(0, 0, 0, 256); fade.addColorStop(0, '#f3d24c'); fade.addColorStop(.5, '#fbf3cf'); fade.addColorStop(1, '#f6e08a');
    c.fillStyle = fade; c.fillRect(0, 0, 512, 256);
    legend(c, 'NEW JERSEY', 34, 36, '#141414', 800, 4); legend(c, 'Garden State', 228, 28, '#141414', 700, 2);
  },
  pennsylvania(c) {
    band(c, 0, 256, '#fcfcfa'); band(c, 0, 58, '#0c3f9a'); band(c, 204, 52, '#f3c613');
    legend(c, 'PENNSYLVANIA', 31, 36, '#fff', 800, 4); legend(c, 'visitPA.com', 230, 28, '#0c3f9a', 700, 2);
  },
  connecticut(c) {
    const fade = c.createLinearGradient(0, 0, 0, 256); fade.addColorStop(0, '#2f6fc0'); fade.addColorStop(.55, '#bcd5f0'); fade.addColorStop(1, '#fbfcfe');
    c.fillStyle = fade; c.fillRect(0, 0, 512, 256);
    legend(c, 'Connecticut', 34, 38, '#fff', 700, 2); legend(c, 'Constitution State', 230, 26, '#0d2a66', 700, 1);
  },
  florida(c) {
    band(c, 0, 256, '#fcfcfa');
    // An orange and its blossom between the two groups of the number.
    c.fillStyle = '#f08a1c'; c.beginPath(); c.arc(256, 136, 34, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2f8a47'; c.beginPath(); c.moveTo(250, 104); c.quadraticCurveTo(228, 84, 212, 98); c.quadraticCurveTo(232, 112, 250, 104); c.fill();
    c.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(274 + Math.cos(k * 1.257) * 9, 104 + Math.sin(k * 1.257) * 9, 6, 0, Math.PI * 2); c.fill(); }
    legend(c, 'FLORIDA', 33, 40, '#17603a', 800, 6); legend(c, 'Sunshine State', 230, 27, '#17603a', 700, 2);
  },
};

/** Paint every plate's artwork onto a 2D context, `ACROSS` to a row. */
export function paintPlates(context) {
  DESIGNS.forEach((design, index) => {
    context.save(); context.translate((index % ACROSS) * PLATE[0], Math.floor(index / ACROSS) * PLATE[1]);
    context.beginPath(); context.rect(0, 0, PLATE[0], PLATE[1]); context.clip();
    ARTWORK[design.id](context);
    // The pressed rim, and the four holes it is bolted through.
    context.strokeStyle = 'rgba(20,24,34,.55)'; context.lineWidth = 5; context.beginPath(); context.roundRect(4.5, 4.5, 503, 247, 16); context.stroke();
    context.strokeStyle = 'rgba(255,255,255,.35)'; context.lineWidth = 2; context.beginPath(); context.roundRect(8.5, 8.5, 495, 239, 13); context.stroke();
    context.fillStyle = 'rgba(40,44,50,.8)';
    for (const [x, y] of [[98, 17], [414, 17], [98, 239], [414, 239]]) { context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill(); }
    context.restore();
  });
}

const hash = text => { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
/** A stream of numbers in [0, 1) that is the same for the same seed. */
function stream(seed) {
  let a = hash(seed) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// No I, O or Q in a number: they read as 1 and 0.
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ', MEDALLION = 'ABCDEGHJKLMNPTUVWY';
const code = glyph => GLYPHS.indexOf(glyph);

/** The numbers each kind of plate is issued with, as lists of characters and marks. */
const SERIAL = {
  passenger: (r, first) => [pick(r, first), pick(r, LETTERS), pick(r, LETTERS), MARK.newYork, ...digits(r, 4)],
  commercial: (r, first) => [...digits(r, 5), MARK.dash, pick(r, first), pick(r, LETTERS)],
  // A yellow cab's plate is its medallion number and a letter.
  medallion: r => [String(1 + Math.floor(r() * 9)), pick(r, MEDALLION), ...digits(r, 2), pick(r, 'HJ')],
  hire: (r, first = 'T') => [first, ...digits(r, 6), 'C'],
  'new-jersey': r => [pick(r, LETTERS), ...digits(r, 2), MARK.newJersey, pick(r, LETTERS), pick(r, LETTERS), pick(r, LETTERS)],
  pennsylvania: r => [pick(r, 'KLM'), pick(r, LETTERS), pick(r, LETTERS), MARK.keystone, ...digits(r, 4)],
  connecticut: r => [pick(r, 'AB'), pick(r, LETTERS), MARK.dot, ...digits(r, 5)],
  florida: r => [pick(r, LETTERS), pick(r, LETTERS), pick(r, LETTERS), MARK.gap, pick(r, LETTERS), ...digits(r, 2)],
};
const pick = (r, from) => from[Math.floor(r() * from.length)];
const digits = (r, n) => Array.from({ length: n }, () => String(Math.floor(r() * 10)));

const issued = new WeakMap();
/**
 * The plate a car carries: `{ text, design, codes, front }`. `design` indexes DESIGNS, `codes` are the
 * places of its number in GLYPHS and MARK, and `front` is false for a state that issues one plate.
 * It is the same plate every time for the same car, until a body shop fits new ones (`car.plates`
 * counts the sets it has had).
 */
export function plateFor(car) {
  const issue = car.plates || 0, year = car.identity?.year || 0, kind = car.type === 'taxi' ? 'taxi' : car.identity?.asset?.livery === 'cargo' || car.working ? 'trade' : 'car';
  const known = typeof car === 'object' && issued.get(car);
  if (known && known.issue === issue && known.kind === kind && known.year === year && known.color === car.color) return known.plate;
  const r = stream(`${car.id}/${issue}`), chance = r();
  let design, places;
  if (kind === 'taxi') {
    // Green cabs and the newest yellow ones carry T&LC numbers; the rest of the yellow fleet its medallions.
    const green = /^#?74b541$/i.test(String(car.color || ''));
    if (green) { design = 'excelsior-hire'; places = SERIAL.hire(r); }
    else if (chance < .3) { design = 'excelsior-hire'; places = SERIAL.hire(r, 'Y'); }
    else { design = 'gold-taxi'; places = SERIAL.medallion(r); }
  } else if (kind === 'trade') {
    design = year >= 2020 || chance < .4 ? 'excelsior-commercial' : 'gold-commercial';
    places = SERIAL.commercial(r, design === 'excelsior-commercial' ? 'NP' : 'JKM');
  } else if (car.type !== 'police' && chance < .13) {
    // Cars from the states next door, and the one a good many New Yorkers register theirs in.
    const where = r(); design = where < .5 ? 'new-jersey' : where < .7 ? 'pennsylvania' : where < .85 ? 'connecticut' : 'florida';
    places = SERIAL[design](r);
  } else {
    // A car sold since the Excelsior plate came out has one; an older car has whichever was current when it was last registered.
    const age = r(); design = year >= 2021 || age < .45 ? 'excelsior' : age > .96 && year && year <= 2010 ? 'empire' : 'gold';
    places = SERIAL.passenger(r, DESIGNS[DESIGN[design]].first);
  }
  const codes = places.map(place => typeof place === 'number' ? place : code(place));
  const plate = { text: places.map(place => typeof place === 'number' ? SPOKEN[place] : place).join(''), design: DESIGN[design], codes, front: !DESIGNS[DESIGN[design]].rearOnly };
  if (typeof car === 'object') issued.set(car, { issue, kind, year, color: car.color, plate });
  return plate;
}

/** What a body shop charges for a new set of plates. */
export const PLATES_PRICE = 120;
