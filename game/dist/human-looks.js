// Who somebody is, as a design (human.js makes the body), and what a design
// puts on: which skin, hair, brows, eyes and clothes, and in what colours.
//
// A design:
//   sex 0 (a man) to 1 (a woman), age in years, height in metres (or by age),
//   weight and muscle from -1 to 1, chest and firm for a woman's bust,
//   african, asian, european: where their forebears came from, as shares,
//   tone: the colour of their skin,
//   dials: { id: -1 to 1 } for every measure of the face and the body (human.dials),
//   hair, hairColour, brows, eyes: what grows on them and the colour of their irises,
//   top, bottom, shoes, hat: what they wear, and topColour, bottomColour.
//
// No DOM and no three.js here.

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const srgb = hex => { const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); };
const toHex = linear => '#' + linear.map(c => { const v = clamp(c, 0, 1), s = v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055; return Math.round(s * 255).toString(16).padStart(2, '0'); }).join('');
const luma = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
const blend = (colours, shares) => { const out = [0, 0, 0]; colours.forEach((colour, i) => { const c = srgb(colour); for (let k = 0; k < 3; k++) out[k] += c[k] * shares[i]; }); return out; };

// Skin, where each line of forebears has left it on average; people range well either side.
const TONE = { african: '#6a4027', asian: '#dfb690', european: '#e8c2a4', southAsian: '#a8754c', arab: '#c99c74', indigenous: '#b98558' };
export const HAIR_COLOURS = { black: '#15110f', darkBrown: '#2c1f17', brown: '#4d3423', chestnut: '#6d4429', auburn: '#7d3b22', red: '#a04a25', darkBlond: '#96744a', blond: '#c9a66b', grey: '#8f8f8f', white: '#d9d6cf', pink: '#c9609a', blue: '#3f6fb5' };
/** Bags worn on this body that the older figure never had. */
export const ARCHIVE_BAGS = ['nylon backpack'];
export const EYES = ['brown', 'brownlight', 'green', 'grey', 'blue', 'bluegreen', 'lightblue', 'deepblue', 'ice'];
export const TOP_COLOURS = ['#f2f0ea', '#1b1c1f', '#7d8288', '#22304f', '#8c2b2b', '#2f5b3c', '#d9b24a', '#3e6ea8', '#b65c2f', '#5d3a6e', '#d98ca0', '#3a7f86', '#c9c2b0', '#40454d'];
export const BOTTOM_COLOURS = [null, null, null, '#1a1b1e', '#2a2f3a', '#6f6a5c', '#a59676', '#4a4f57', '#3a4636', '#22304f'];

/** The skin picture nearest a design, and what it is multiplied by to make the tone asked for. */
export function skinFor(design, skins) {
  const woman = (design.sex ?? 0) > .5 ? 'female' : 'male', years = design.age ?? 30, age = years < 42 ? 'young' : years < 63 ? 'middleage' : 'old';
  const shares = ancestry(design), want = srgb(design.tone || toneOf(design)), light = luma(want);
  let best = null, least = Infinity;
  for (const skin of skins) {
    if (skin.sex !== woman || skin.age !== age) continue;
    const mean = srgb(skin.mean), score = Math.abs(Math.log(Math.max(light,.00001) / luma(mean))) - .2 * (shares[skin.race === 'caucasian' ? 'european' : skin.race] || 0) + (skin.variant - 1) * .01;
    if (score < least) { least = score; best = skin; }
  }
  const mean = srgb(best.mean);
  return { map: best.map, tone: want.map((c, k) => clamp(c / mean[k], .25, 1.5)) };
}
function ancestry(design) {
  const a = Math.max(0, design.african ?? 0), s = Math.max(0, design.asian ?? 0), e = Math.max(0, design.european ?? 0), sum = a + s + e || 1;
  return a + s + e > 0 ? { african: a / sum, asian: s / sum, european: e / sum } : { african: 1 / 3, asian: 1 / 3, european: 1 / 3 };
}
/** The skin a design's forebears would give it, if it does not say. */
export function toneOf(design) { const shares = ancestry(design); return toHex(blend([TONE.african, TONE.asian, TONE.european], [shares.african, shares.asian, shares.european])); }

// A separate lapel cut from the same cloth follows its jacket's dye.
// A shirt under that jacket can share the image but have a different ground colour.
export function sharesGarmentDye(piece, main) {
  return main && (piece.id===main.id || (main.dyeBase && piece.dyeBase===main.dyeBase &&
    piece.slot===main.slot && piece.map===main.map));
}

/**
 * What a design wears and how it is coloured.
 * @returns {{wear: string[], look: object}} for human.build({ ...design, wear }) and human-mesh.js
 */
// One stock tee is not worn by anybody, in any colour: a design that names it, or names nothing, gets the boxy tee.
const RETIRED_TOP = 'male_casualsuit04-top';
/** The top a design is drawn in. */
export const wornTop = design => !design.top || design.top === RETIRED_TOP ? 'gallery-box-tee' : design.top;
export function lookOf(design, human) {
  const wear = [], colours = {}, garments = human.parts.filter(part => part.kind === 'garment');
  const put = (id, colour) => {
    if (!id || id === 'none') return;
    // What comes with a garment is worn with it: the shirt under a jacket, its collar.
    const stem = id.replace(/\d*$/, ''), main=garments.find(p=>p.id===id);
    for (const part of garments) if (part.id === id || (part.id.startsWith(stem) && part.id !== id && /\d$/.test(part.id) && !/\d$/.test(id))) {
      wear.push('garment/'+part.id);
      // An archive piece is the colour it is: nobody dyes a museum piece.
      if (colour && sharesGarmentDye(part,main) && !part.ownColour) colours['garment/'+part.id]=colour;
    }
  };
  put(design.bottom || 'male_casualsuit04-bottom', design.bottomColour); put(wornTop(design), design.topColour);
  if (design.shoes !== 'none') wear.push('shoes/' + (design.shoes || 'shoes02'));
  if (design.hat && design.hat !== 'none') wear.push('hat/' + design.hat);
  if (design.shoeColour && !human.parts.find(part => part.kind === 'shoes' && part.id === design.shoes)?.ownColour) colours['shoes/' + design.shoes] = design.shoeColour;
  if (design.hatColour) colours['hat/' + design.hat] = design.hatColour;
  if (design.hair && design.hair !== 'none') wear.push('hair/' + design.hair);
  wear.push('eyes/low-poly', 'brows/' + (design.brows || 'eyebrow001'), 'lashes/' + ((design.sex ?? 0) > .5 ? 'eyelashes02' : 'eyelashes01'), 'teeth/teeth_base');
  const skin = skinFor(design, human.skins), hair = design.hairColour || HAIR_COLOURS.darkBrown;
  return { wear: wear.filter(key => human.has(key)), look: { skin: skin.map, tone: skin.tone, hair, brows: design.browColour || hair, iris: (design.eyes || 'brown') + '_eye.webp', colours,
    beard:design.beard, glasses:design.glasses, bag:design.bag, trimColour:design.trimColour } };
}

// --- Somebody -------------------------------------------------------------------------------------
const gauss = random => (random() + random() + random() + random() - 2) * .87;
const pick = (random, list) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
/** Draw from [[thing, weight], ...]. */
function draw(random, table) {
  let sum = 0; for (const [, weight] of table) sum += Math.max(0, weight);
  let at = random() * sum;
  for (const [thing, weight] of table) { at -= Math.max(0, weight); if (at <= 0) return thing; }
  return table[table.length - 1][0];
}
const FACE = new Set(['head', 'forehead', 'eyebrows', 'neck', 'eyes', 'nose', 'mouth', 'ears', 'chin', 'cheek']);
// How far each kind of measure strays from the middle, person to person.
const STRAY = { head: .22, forehead: .3, eyebrows: .3, neck: .2, eyes: .3, nose: .36, mouth: .32, ears: .3, chin: .32, cheek: .32, torso: .16, hip: .16, stomach: .14, buttocks: .3 };

/**
 * A person nobody designed. `shares` is the block's mix of the census's five
 * groups (white, black, asian, hispanic, other) and `languages` what is spoken
 * at home there, as [name, share] (demographics.js): they settle the odds of
 * where somebody's forebears came from, and the person is then themselves,
 * with a face of their own. Nothing but looks is drawn from this.
 */
export function somebody(random, human, { shares = [313, 208, 145, 284, 49], languages = null, sex = null, age = null, kind = null, outfit = 'casual' } = {}) {
  const spoken = Object.fromEntries(languages || []), group = draw(random, [['white', shares[0]], ['black', shares[1]], ['asian', shares[2]], ['hispanic', shares[3]], ['other', shares[4]]]);
  const d = { v: 2, sex: sex ?? (random() < .5 ? 1 : 0), dials: {} };
  d.age = age ?? Math.round(draw(random, [[10 + random() * 8, 8], [18 + random() * 17, 34], [35 + random() * 20, 32], [55 + random() * 15, 17], [70 + random() * 18, 9]]));
  // Where their forebears came from, and the skin that goes with it.
  let tone, darkHair = .97;
  if (group === 'white') {
    const arab = (spoken.arabic || 0) / Math.max(.05, shares[0] / 1000);
    d.european = 1; d.african = random() * .06; d.asian = random() * .05;
    if (kind ? kind === 'arab' : random() < clamp(arab, 0, .8)) { tone = TONE.arab; darkHair = .95; } else { tone = TONE.european; darkHair = .42; }
  } else if (group === 'black') {
    d.african = .72 + random() * .28; d.european = 1 - d.african; d.asian = random() * .04; tone = toneOf(d);
  } else if (group === 'asian') {
    // South Asia and East Asia are one line in the census; what is spoken at home on the block tells them apart.
    const east = (spoken.chinese || 0) + (spoken.korean || 0) + (spoken.vietnamese || 0) + (spoken.tagalog || 0) + (spoken.asian || 0) * .5, south = (spoken.indoeuropean || 0) * .8 + (spoken.asian || 0) * .3;
    if (kind ? kind === 'southAsian' : random() < (languages ? clamp(south / (south + east || 1), .05, .9) : .3)) { d.european = .62 + random() * .15; d.african = .12 + random() * .14; d.asian = .1 + random() * .12; tone = TONE.southAsian; }
    else { d.asian = .86 + random() * .14; d.european = 1 - d.asian; d.african = 0; tone = TONE.asian; }
  } else if (group === 'hispanic') {
    d.european = .25 + random() * .55; d.african = random() * random() * .7; d.asian = .08 + random() * .4;
    tone = toHex(blend([TONE.european, TONE.african, TONE.indigenous], (s => [d.european / s, d.african / s, d.asian / s])(d.european + d.african + d.asian)));
  } else {
    d.european = random(); d.african = random(); d.asian = random(); tone = toneOf(d);
  }
  // Lighter or deeper than that by a good deal, person to person.
  const shade = clamp(Math.exp(gauss(random) * .2), .7, 1.18); d.tone = toHex(srgb(tone).map(c => clamp(c * shade, .008, .92)));
  const woman = d.sex > .5, grown = d.age >= 18, shareOf = ancestry(d);
  d.weight = clamp(.12 + gauss(random) * .45 + (d.age > 40 ? .1 : 0) - (grown ? 0 : .2), -1, 1);
  d.muscle = clamp(-.12 + gauss(random) * .32 + (woman ? -.1 : .08), -1, 1);
  d.height = clamp((woman ? 1.625 : 1.76) * (grown ? 1 : .8 + .2 * (d.age - 10) / 8) * (1 + gauss(random) * .038) - shareOf.asian * .025 - Math.max(0, d.age - 60) * .001, 1.2, 2.06);
  if (woman) { d.chest = clamp(gauss(random) * .45 + d.weight * .3, -1, 1); d.firm = clamp(.2 - Math.max(0, d.age - 30) * .012 + gauss(random) * .2, -1, 1); }
  // A face of their own: every measure a little off the middle, both sides alike.
  const face = Math.floor(random() * 0x7fffffff);
  for (const dial of human.dials) {
    const stray = STRAY[dial.group]; if (!stray || /pregnant|navel|scale-vert|trans-|nubian/.test(dial.id)) continue;
    // The left ear and the right are the same ear.
    const value = clamp(gauss(mulberry(hashOf(dial.id.replace(/^[lr]-/, '')) ^ face)) * stray, -1, 1);
    if (Math.abs(value) > .04) d.dials[dial.id] = Number(value.toFixed(2));
  }
  d.dials['head-age-decr-incr'] = Number(clamp((d.age - 38) / 45 + gauss(random) * .12, -.6, 1).toFixed(2));
  d.dials['head-fat-decr-incr'] = Number(clamp(d.weight * .6 + gauss(random) * .15, -1, 1).toFixed(2));
  if (d.weight > .35) d.dials['neck-double-decr-incr'] = Number(clamp((d.weight - .3) * 1.1, 0, 1).toFixed(2));
  // Hair: what grows, how it is worn, and what the years have done to it.
  const coily = shareOf.african > .5, grey = clamp((d.age - 38) / 34 + gauss(random) * .2, 0, 1), dark = random() < Math.max(darkHair, shareOf.african, shareOf.asian);
  d.hairColour = random() < grey ? (random() < grey * .5 ? HAIR_COLOURS.white : HAIR_COLOURS.grey) : dark ? pick(random, [HAIR_COLOURS.black, HAIR_COLOURS.black, HAIR_COLOURS.darkBrown]) : draw(random, [[HAIR_COLOURS.darkBrown, 30], [HAIR_COLOURS.brown, 28], [HAIR_COLOURS.chestnut, 12], [HAIR_COLOURS.darkBlond, 12], [HAIR_COLOURS.blond, 10], [HAIR_COLOURS.auburn, 4], [HAIR_COLOURS.red, 4]]);
  if (d.age > 14 && d.age < 40 && random() < .03) d.hairColour = pick(random, [HAIR_COLOURS.pink, HAIR_COLOURS.blue, HAIR_COLOURS.blond]);
  d.browColour = random() < grey * .6 ? HAIR_COLOURS.grey : dark || coily ? HAIR_COLOURS.black : HAIR_COLOURS.brown;
  const balding = !woman ? clamp((d.age - 28) / 90, 0, .5) : 0;
  d.hair = woman
    ? draw(random, [['long01', coily ? 8 : 30], ['ponytail01', coily ? 10 : 22], ['bob01', coily ? 6 : 14], ['bob02', coily ? 6 : 12], ['braid01', coily ? 30 : 8], ['afro01', coily ? 30 : 1], ['short02', 5], ['short04', 4], ['short01', d.age > 55 ? 14 : 3],
      // The community's styles: bobs, braids, a bun, long and shaggy cuts.
      ['toigo_blunt_bob', coily ? 2 : 9], ['toigo_blunt_bob_with_bangs', coily ? 2 : 9], ['toigo_curled_under_bob', coily ? 2 : 8], ['toigo_curled_under_bob_with_bangs', coily ? 2 : 7],
      ['toigo_inverted_bob', coily ? 2 : 8], ['toigo_inverted_bob_with_bangs', coily ? 2 : 8], ['littleright_bobcut_hair', coily ? 2 : 7], ['cortu_straight_bangs', coily ? 1 : 8],
      ['elvs_double_mh_braid', coily ? 14 : 5], ['elvs_french_braid_variation', coily ? 12 : 6], ['elvs_unkempt_french_braid', coily ? 10 : 6], ['elvs_reverse_french_braid_bun', coily ? 8 : 4],
      ['rehmanpolanski_hair_bun_brown', d.age > 40 ? 12 : 6], ['culturalibre_hair_01', coily ? 2 : 9], ['sonntag78_junglebook_hair', 7], ['faydaen_hair_1', coily ? 1 : 6],
      ['cortu_shaggy_green_hair', d.age < 40 ? 5 : 1], ['cortu_short_messy_hair', 4]])
    : draw(random, [['short01', 18], ['short02', 24], ['short03', 22], ['short04', 22], ['afro01', coily ? 22 : .5], ['none', 6 + balding * 100 + (coily ? 10 : 0)], ['long01', 2], ['ponytail01', 2],
      ['culturalibre_hair_02', 16], ['culturalibre_hair_05', 12], ['cortu_short_messy_hair', coily ? 2 : 12], ['sonntag78_junglebook_hair', d.age < 45 ? 4 : 1],
      ['cortu_shaggy_green_hair', d.age < 35 ? 3 : 0], ['culturalibre_hair_01', d.age < 40 ? 2 : 0], ['elvs_double_mh_braid', coily && d.age < 40 ? 6 : 0]]);
  d.brows = 'eyebrow' + String(1 + Math.floor(random() * 12)).padStart(3, '0');
  d.eyes = random() < shareOf.european * shareOf.european * .5 && !dark ? pick(random, EYES.slice(2)) : random() < .2 ? 'brownlight' : 'brown';
  // Clothes.
  const tops = woman ? [['female_casualsuit01-top', 22], ['female_casualsuit02-top', 14], ['female_elegantsuit01-top', 12], ['female_sportsuit01-top', d.age < 45 ? 8 : 1], ['male_casualsuit02-top', 30], ['male_casualsuit03-top', 8], ['male_casualsuit05-top', 8]]
    : [['male_casualsuit02-top', 48], ['male_casualsuit03-top', 16], ['male_casualsuit05-top', 14], ['male_casualsuit06-top', 14], ['male_elegantsuit01-top', 8]];
  // Grown people in their everyday clothes mostly wear the game's own basics, not the plain stock tee: a boxy tee, a
  // knit, a polo, with trousers or cargos to go with them. Children keep the stock clothes, which are cut to fit them.
  // Only tops long enough to be worn loose over any trousers: the ones cut to be tucked in, or cropped, are left to the looks that pair them.
  if (d.age >= 18) tops.push(['gallery-box-tee', 30], ['offset-long-tee', 26], ['breakwater-crew', 24], ['service-polo', 16]);
  d.top = outfit === 'business' ? (woman ? draw(random, [['female_elegantsuit01-top', 60], ['male_casualsuit03-top', 40]]) : draw(random, [['male_elegantsuit01-top', 55], ['male_casualsuit03-top', 45]]))
    : outfit === 'athletic' ? (woman ? draw(random, [['female_sportsuit01-top', 60], ['relay-polo', 40]]) : 'relay-polo') : draw(random, tops);
  const bottoms = woman ? [['female_casualsuit01-bottom', 46], ['female_casualsuit02-bottom', d.age < 50 ? 14 : 3], ['female_elegantsuit01-bottom', 18], ['male_elegantsuit01-bottom', 14]]
    : [['male_casualsuit04-bottom', 62], ['male_elegantsuit01-bottom', 30], ['male_worksuit01-bottom', 3]];
  if (d.age >= 18) bottoms.push(['broadcloth-trousers', 34], ['switchback-cargos', 24]);
  if (outfit === 'business') bottoms.splice(0, bottoms.length, ...(woman ? [['female_elegantsuit01-bottom', 55], ['male_elegantsuit01-bottom', 45]] : [['male_elegantsuit01-bottom', 1]]));
  if (outfit === 'athletic' && woman) bottoms.splice(0, bottoms.length, ['female_casualsuit02-bottom', 50], ['female_sportsuit01-bottom', 50]);
  d.bottom = d.top === 'male_elegantsuit01-top' ? 'male_elegantsuit01-bottom' : d.top === 'female_sportsuit01-top' ? 'female_sportsuit01-bottom' : draw(random, bottoms);
  if (d.bottom === 'male_worksuit01-bottom') d.top = 'male_worksuit01-top';
  d.topColour = d.top === 'male_elegantsuit01-top' ? pick(random, ['#1c1d21', '#22283a', '#3b3d42']) : outfit === 'business' ? pick(random, ['#f2f0ea', '#dfe6ee', '#c9d6e6', '#e9dfe2', '#1b1c1f']) : pick(random, TOP_COLOURS);
  d.bottomColour = d.top === 'male_elegantsuit01-top' ? d.topColour : /elegant/.test(d.bottom) ? pick(random, ['#1c1d21', '#2a2f3a', '#4a4f57', '#6f6a5c', '#22304f']) : pick(random, BOTTOM_COLOURS);
  d.shoes = draw(random, [['shoes01', /elegant/.test(d.bottom) ? 40 : 8], ['shoes04', /elegant/.test(d.bottom) ? 40 : 8], ['shoes02', 20], ['shoes05', 22], ['shoes06', 22], ['shoes03', 10]]);
  d.hat = random() < .02 ? 'fedora01' : 'none';
  for (const key of ['african', 'asian', 'european', 'weight', 'muscle', 'height', 'chest', 'firm']) if (Number.isFinite(d[key])) d[key] = Number(d[key].toFixed(3));
  return d;
}
function hashOf(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** A small seeded source of numbers from 0 to 1. */
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
