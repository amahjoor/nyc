// Who people are: what a design may say, the player's own, and the cast the sidewalks are peopled from.
//
// A design is a flat list of plain values. Numbers run from -1 to 1 about an
// ordinary person unless said otherwise; anything left out is ordinary.
import { TOPS, COATS, BOTTOMS, SHOES, HAIR, BEARDS, HATS, GLASSES, BAGS } from './body.js';

export const SKIN_TONES = ['#3b2417', '#4f311f', '#6b4630', '#8d5b3f', '#a8734f', '#b98563', '#c79a7b', '#d9ae8c', '#e0b99a', '#ecc9ad'];
export const HAIR_TONES = ['#0e0c0b', '#1c1512', '#2a211c', '#3b2a1e', '#5a3b25', '#7a5533', '#8a6a45', '#b89b6a', '#d8c08a', '#9a9a98', '#d8d6d0', '#6e2a1c', '#a8452a', '#2a4a8a', '#7a3a8a', '#c0407a'];
export const EYE_TONES = ['#2a1a10', '#4a3323', '#6b4a2a', '#7a6a3a', '#5a7a4a', '#4a6a8a', '#7a95ad', '#6f7377'];
export const CLOTH_TONES = ['#e9e7e1', '#d7d4cc', '#9a9d9f', '#55595f', '#1d1e22', '#101114', '#27364f', '#30486e', '#47607f', '#7d8fa8', '#9b3b34', '#c24a3b', '#f07a2c', '#c9a23f', '#f2c230', '#4d7a56', '#2d6a6a', '#34a36a', '#7a4f86', '#e0559a', '#8a7d62', '#b9ac8e', '#6e4a2e', '#d7774e'];

/** What the designer shows, in order: sliders are [key, label, low, high, step], choices [key, label, list], colours [key, label, list]. */
export const FIELDS = [
  { group: 'Frame', sliders: [['sex', 'Masculine to feminine', 0, 1, .01], ['age', 'Age', 6, 95, 1], ['height', 'Height when grown (m)', 1.45, 2.05, .01], ['weight', 'Thin to heavy', -1, 1, .01], ['muscle', 'Slight to muscular', -1, 1, .01]] },
  { group: 'Build', sliders: [['shoulders', 'Shoulders', -1, 1, .01], ['chest', 'Chest', -1, 1, .01], ['bust', 'Bust', -1, 1, .01], ['waist', 'Waist', -1, 1, .01], ['belly', 'Belly', -1, 1, .01], ['hips', 'Hips', -1, 1, .01], ['seat', 'Seat', -1, 1, .01], ['armGirth', 'Arms', -1, 1, .01], ['legGirth', 'Legs', -1, 1, .01], ['neck', 'Neck', -1, 1, .01]] },
  { group: 'Proportions', sliders: [['legs', 'Leg length', -1, 1, .01], ['torso', 'Torso length', -1, 1, .01], ['arms', 'Arm length', -1, 1, .01], ['head', 'Head size', -1, 1, .01], ['hands', 'Hands', -1, 1, .01], ['feet', 'Feet', -1, 1, .01]] },
  { group: 'Head', sliders: [['headWidth', 'Width', -1, 1, .01], ['headDepth', 'Depth', -1, 1, .01], ['forehead', 'Forehead', -1, 1, .01], ['cheekbones', 'Cheekbones', -1, 1, .01], ['cheeks', 'Cheeks', -1, 1, .01], ['jawWidth', 'Jaw width', -1, 1, .01], ['jawline', 'Jaw corners', -1, 1, .01], ['chinLength', 'Chin length', -1, 1, .01], ['chinWidth', 'Chin width', -1, 1, .01], ['chinProjection', 'Chin forward', -1, 1, .01], ['ears', 'Ears', -1, 1, .01]] },
  { group: 'Eyes and brow', sliders: [['eyeSize', 'Eye size', -1, 1, .01], ['eyeOpen', 'Lids', -1, 1, .01], ['eyeSpacing', 'Spacing', -1, 1, .01], ['eyeHeight', 'Height', -1, 1, .01], ['browRidge', 'Brow ridge', -1, 1, .01], ['browHeight', 'Brow height', -1, 1, .01], ['brows', 'Eyebrow weight', -1, 1, .01], ['browArch', 'Eyebrow arch', -1, 1, .01]], colours: [['eyes', 'Eyes', EYE_TONES]] },
  { group: 'Nose and mouth', sliders: [['noseLength', 'Nose length', -1, 1, .01], ['noseWidth', 'Nose width', -1, 1, .01], ['noseBridge', 'Bridge', -1, 1, .01], ['noseProjection', 'Projection', -1, 1, .01], ['noseTip', 'Tip up or down', -1, 1, .01], ['mouthHeight', 'Mouth height', -1, 1, .01], ['lipWidth', 'Mouth width', -1, 1, .01], ['lipFullness', 'Lips', -1, 1, .01], ['smile', 'Corners', -1, 1, .01]] },
  { group: 'Skin and hair', colours: [['skin', 'Skin', SKIN_TONES], ['hair', 'Hair', HAIR_TONES]], choices: [['hairStyle', 'Hair', HAIR], ['beard', 'Beard', BEARDS]] },
  { group: 'Clothes', choices: [['top', 'Top', TOPS], ['coat', 'Over it', COATS], ['bottom', 'Legs', BOTTOMS], ['shoes', 'Shoes', SHOES], ['hat', 'Hat', HATS], ['glasses', 'Glasses', GLASSES], ['bag', 'Bag', BAGS]], sliders: [['fit', 'Tight to loose', -1, 1, .01]],
    colours: [['topColour', 'Top', CLOTH_TONES], ['coatColour', 'Over it', CLOTH_TONES], ['bottomColour', 'Legs', CLOTH_TONES], ['shoeColour', 'Shoes', CLOTH_TONES], ['hatColour', 'Hat', CLOTH_TONES], ['trimColour', 'Bag and belt', CLOTH_TONES]] },
];
export const DEFAULT_DESIGN = { sex: 0, age: 30, height: 1.76, weight: 0, muscle: 0, skin: '#b98563', hair: '#1c1512', eyes: '#4a3323', hairStyle: 'short', beard: 'none', top: 'tee', coat: 'none', bottom: 'jeans', shoes: 'sneakers', hat: 'none', glasses: 'none', bag: 'none',
  topColour: '#d7774e', coatColour: '#1d1e22', bottomColour: '#1d1e22', shoeColour: '#e9e7e1', hatColour: '#27364f', trimColour: '#1d1e22' };

const KEY = 'nyc.character';
/** A design with nothing in it that the generator would not understand. */
export function tidy(design) {
  const made = { ...DEFAULT_DESIGN };
  if (!design || typeof design !== 'object') return made;
  for (const { sliders = [], choices = [], colours = [] } of FIELDS) {
    for (const [key, , low, high] of sliders) if (Number.isFinite(design[key])) made[key] = Math.max(low, Math.min(high, design[key]));
    for (const [key, , list] of choices) if (list.includes(design[key])) made[key] = design[key];
    for (const [key] of colours) if (/^#[0-9a-f]{6}$/i.test(design[key] || '')) made[key] = design[key];
  }
  return made;
}
/** The player's own design, as last saved in this browser. */
export function loadDesign(storage = globalThis.localStorage) { try { return tidy(JSON.parse(storage?.getItem(KEY) || 'null')); } catch { return tidy(null); } }
export function saveDesign(design, storage = globalThis.localStorage) { try { storage?.setItem(KEY, JSON.stringify(tidy(design))); } catch { /* a browser that keeps nothing */ } }

const pick = (list, random) => list[Math.floor(random() * list.length) % list.length];
const spread = random => (random() + random() + random()) / 1.5 - 1;
/** The small ways one face differs from the next. */
export function someFace(random) {
  const face = {};
  for (const key of ['headWidth', 'headDepth', 'forehead', 'cheekbones', 'cheeks', 'jawWidth', 'jawline', 'chinLength', 'chinWidth', 'chinProjection', 'ears', 'eyeSize', 'eyeOpen', 'eyeSpacing', 'eyeHeight', 'browRidge', 'browHeight', 'brows', 'browArch', 'noseLength', 'noseWidth', 'noseBridge', 'noseProjection', 'noseTip', 'mouthHeight', 'lipWidth', 'lipFullness']) face[key] = Number((spread(random) * .8).toFixed(2));
  return face;
}
/** Anybody at all. */
export function randomDesign(random = Math.random) {
  const sex = random() < .5 ? Math.min(1, random() * .25) : Math.max(0, 1 - random() * .25), woman = sex > .5, roll = random(), age = roll < .08 ? 7 + random() * 10 : roll < .85 ? 18 + random() * 45 : 63 + random() * 25;
  return tidy({ ...someFace(random), sex, age: Math.round(age), height: (woman ? 1.63 : 1.76) + spread(random) * .12, weight: Math.max(-1, Math.min(1, .15 + spread(random) * .9)), muscle: spread(random) * .7,
    shoulders: spread(random) * .6, hips: spread(random) * .6, belly: spread(random) * .5, legs: spread(random) * .6, torso: spread(random) * .5,
    skin: pick(SKIN_TONES, random), hair: pick(HAIR_TONES.slice(0, 9), random), eyes: pick(EYE_TONES, random),
    hairStyle: pick(woman ? ['bob', 'long', 'ponytail', 'bun', 'curls', 'afro', 'braids', 'short', 'locs'] : ['short', 'crop', 'buzz', 'side part', 'curls', 'afro', 'bald', 'receding', 'locs', 'mohawk', 'top knot'], random), beard: woman || random() < .55 ? 'none' : pick(BEARDS.slice(1), random),
    top: pick(TOPS.slice(0, 7), random), coat: random() < .6 ? 'none' : pick(COATS.slice(1), random), bottom: pick(woman ? BOTTOMS : BOTTOMS.filter(kind => !/skirt|leggings/.test(kind)), random), shoes: pick(woman ? SHOES.slice(0, 6) : SHOES.slice(0, 5), random),
    hat: random() < .75 ? 'none' : pick(HATS.slice(1), random), glasses: random() < .8 ? 'none' : pick(GLASSES.slice(1), random), bag: random() < .7 ? 'none' : pick(BAGS.slice(1), random), fit: spread(random) * .6,
    topColour: pick(CLOTH_TONES, random), coatColour: pick(CLOTH_TONES.slice(2, 12), random), bottomColour: pick(CLOTH_TONES.slice(3, 10), random), shoeColour: pick(CLOTH_TONES.slice(0, 6), random), hatColour: pick(CLOTH_TONES, random) });
}

// --- The cast ------------------------------------------------------------------------------
// The sidewalks are peopled from these: each a body and a way of dressing, worn in any colours. A row is
// [kinds of outfit it suits (citylife's names), sex, age, weight, muscle, hair, beard, top, over it, legs, shoes, hat, bag, glasses].
// Weights are kept to a few steps so that bodies of a build share the poses worked out for it.
const ROWS = [
  ['casual summer', 0, 27, 0, 0, 'short', 'none', 'tee', 'none', 'jeans', 'sneakers', 'none', 'none', 'none'],
  ['casual', 0, 34, .6, 0, 'buzz', 'beard', 'tee', 'none', 'jeans', 'sneakers', 'none', 'none', 'none'],
  ['casual evening', 0, 22, -.5, 0, 'curls', 'none', 'hoodie', 'none', 'slim', 'sneakers', 'none', 'none', 'none'],
  ['casual', 0, 45, .9, 0, 'bald', 'goatee', 'longsleeve', 'none', 'jeans', 'sneakers', 'none', 'none', 'none'],
  ['casual', 1, 25, -.3, 0, 'long', 'none', 'tee', 'none', 'jeans', 'sneakers', 'none', 'none', 'none'],
  ['casual', 1, 38, .6, 0, 'bob', 'none', 'longsleeve', 'none', 'leggings', 'sneakers', 'none', 'tote', 'none'],
  ['casual', 1, 30, .3, 0, 'ponytail', 'none', 'hoodie', 'none', 'sweats', 'sneakers', 'none', 'none', 'none'],
  ['casual office', 1, 52, .6, 0, 'curls', 'none', 'sweater', 'none', 'slacks', 'sneakers', 'none', 'tote', 'glasses'],
  ['casual', 0, 71, .3, 0, 'receding', 'none', 'shirt', 'jacket', 'slacks', 'dress', 'none', 'none', 'glasses'],
  ['casual', 1, 74, .3, 0, 'bun', 'none', 'sweater', 'none', 'long skirt', 'dress', 'none', 'tote', 'none'],
  ['casual summer visitor', 0, 10, 0, 0, 'short', 'none', 'tee', 'none', 'shorts', 'sneakers', 'none', 'backpack', 'none'],
  ['casual summer visitor', 1, 9, 0, 0, 'ponytail', 'none', 'tee', 'none', 'skirt', 'sneakers', 'none', 'none', 'none'],
  ['casual evening', 0, 30, .3, 0, 'crop', 'stubble', 'tee', 'bomber', 'jeans', 'sneakers', 'cap', 'none', 'none'],
  ['casual evening', 1, 28, 0, 0, 'long', 'none', 'tee', 'jacket', 'slim', 'boots', 'none', 'crossbody', 'none'],
  ['casual', 0, 19, -.3, 0, 'short', 'none', 'hoodie', 'none', 'baggy', 'high tops', 'hood', 'none', 'none'],
  ['casual', 1, 44, .9, 0, 'short', 'none', 'longsleeve', 'none', 'long skirt', 'sandals', 'headscarf', 'tote', 'none'],
  ['casual', 0, 58, .6, 0, 'short', 'moustache', 'polo', 'none', 'slacks', 'sneakers', 'cap', 'none', 'none'],
  ['casual', 1, 21, -.5, 0, 'braids', 'none', 'tee', 'puffer', 'leggings', 'sneakers', 'none', 'backpack', 'none'],
  ['casual', 0, 40, .3, .5, 'locs', 'beard', 'tee', 'puffer', 'sweats', 'boots', 'beanie', 'none', 'none'],
  ['casual', 1, 63, .9, 0, 'bob', 'none', 'sweater', 'overcoat', 'slacks', 'sneakers', 'none', 'tote', 'glasses'],
  ['suit', 0, 41, .3, 0, 'side part', 'none', 'shirt', 'blazer', 'slacks', 'dress', 'none', 'none', 'none'],
  ['suit', 0, 56, .6, 0, 'receding', 'none', 'shirt', 'blazer', 'slacks', 'dress', 'none', 'none', 'glasses'],
  ['suit', 1, 36, 0, 0, 'bun', 'none', 'shirt', 'blazer', 'slacks', 'heels', 'none', 'tote', 'none'],
  ['suit office', 1, 47, .3, 0, 'bob', 'none', 'shirt', 'blazer', 'skirt', 'heels', 'none', 'none', 'none'],
  ['office', 0, 33, 0, 0, 'crop', 'none', 'shirt', 'none', 'slacks', 'dress', 'none', 'backpack', 'glasses'],
  ['office', 0, 50, .9, 0, 'bald', 'none', 'polo', 'none', 'slacks', 'dress', 'none', 'none', 'none'],
  ['office', 1, 29, -.3, 0, 'long', 'none', 'shirt', 'none', 'skirt', 'heels', 'none', 'crossbody', 'none'],
  ['summer', 0, 24, -.3, .5, 'buzz', 'none', 'tank', 'none', 'shorts', 'sneakers', 'none', 'none', 'shades'],
  ['summer visitor', 0, 40, .9, 0, 'short', 'stubble', 'tee', 'none', 'long shorts', 'sandals', 'cap', 'none', 'none'],
  ['summer', 1, 23, -.3, 0, 'ponytail', 'none', 'tank', 'none', 'shorts', 'sandals', 'none', 'crossbody', 'shades'],
  ['summer', 1, 35, .6, 0, 'afro', 'none', 'tee', 'none', 'skirt', 'sandals', 'none', 'tote', 'none'],
  ['athletic', 0, 31, -.3, .5, 'crop', 'none', 'tank', 'none', 'shorts', 'sneakers', 'none', 'none', 'none'],
  ['athletic', 1, 27, -.5, 0, 'ponytail', 'none', 'tank', 'none', 'leggings', 'sneakers', 'none', 'none', 'none'],
  ['athletic', 0, 46, .3, 0, 'bald', 'none', 'tee', 'none', 'shorts', 'sneakers', 'none', 'none', 'none'],
  ['evening', 0, 28, 0, 0, 'side part', 'none', 'shirt', 'jacket', 'slim', 'boots', 'none', 'none', 'none'],
  ['evening', 1, 26, -.3, 0, 'long', 'none', 'tank', 'none', 'skirt', 'heels', 'none', 'crossbody', 'none'],
  ['evening', 1, 31, .3, 0, 'bob', 'none', 'tee', 'jacket', 'slim', 'boots', 'none', 'none', 'none'],
  ['evening', 0, 37, .6, 0, 'buzz', 'beard', 'tee', 'bomber', 'jeans', 'boots', 'none', 'none', 'none'],
  ['visitor', 0, 48, .6, 0, 'short', 'none', 'polo', 'none', 'shorts', 'sneakers', 'cap', 'backpack', 'none'],
  ['visitor', 1, 45, .3, 0, 'bob', 'none', 'tee', 'none', 'long shorts', 'sneakers', 'bucket', 'crossbody', 'shades'],
  ['visitor', 0, 26, 0, 0, 'curls', 'none', 'tee', 'none', 'jeans', 'sneakers', 'none', 'backpack', 'none'],
  ['visitor', 1, 24, 0, 0, 'long', 'none', 'tee', 'none', 'shorts', 'sneakers', 'none', 'backpack', 'none'],
  ['worker', 0, 39, .3, .5, 'buzz', 'stubble', 'tee', 'vest', 'jeans', 'boots', 'hard hat', 'none', 'none'],
  ['worker', 0, 29, 0, 0, 'short', 'beard', 'longsleeve', 'vest', 'jeans', 'boots', 'hard hat', 'none', 'none'],
  ['worker scrubs', 1, 34, .3, 0, 'bun', 'none', 'tee', 'none', 'slacks', 'sneakers', 'none', 'none', 'none'],
  ['worker scrubs', 0, 44, .6, 0, 'buzz', 'none', 'tee', 'none', 'slacks', 'sneakers', 'none', 'none', 'none'],
  ['officer', 0, 36, .3, .5, 'buzz', 'none', 'shirt', 'none', 'slacks', 'boots', 'cap', 'none', 'none'],
  ['officer', 1, 33, 0, 0, 'bun', 'none', 'shirt', 'none', 'slacks', 'boots', 'cap', 'none', 'none'],
];
const seeded = seed => { let state = seed >>> 0; return () => { state = (state + 0x6D2B79F5) >>> 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
/** The cast: [{ id, suits: Set, woman, child, design }]. Colours in a cast design are placeholders: a person wears their own. */
export const CAST = ROWS.map(([suits, sex, age, weight, muscle, hairStyle, beard, top, coat, bottom, shoes, hat, bag, glasses], id) => {
  const random = seeded(7919 * (id + 1)), face = someFace(random);
  return { id, suits: new Set(suits.split(' ')), woman: sex > .5, child: age < 14, old: age > 62, hat: hat !== 'none', coat: coat !== 'none',
    design: { ...face, sex: sex ? .92 : .06, age, weight, muscle, height: sex ? 1.63 : 1.76, hairStyle, beard, top, coat, bottom, shoes, hat, bag, glasses } };
});
/** One of the cast for a kind of outfit; `woman` asks for one or the other where it matters. */
export function castFor(outfit, random = Math.random, woman = null) {
  let fits = CAST.filter(member => member.suits.has(outfit) && (woman === null || member.woman === woman));
  if (!fits.length) fits = CAST.filter(member => member.suits.has('casual') && (woman === null || member.woman === woman));
  return fits[Math.floor(random() * fits.length) % fits.length].id;
}
