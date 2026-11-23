// The player's own design, as kept in this browser. What a design may say is in human-looks.js.
import { tidy as tidyLegacy, EYE_TONES } from './body-designs.js';
import { heightOf, BEARDS, GLASSES, BAGS } from './body.js';
import { HAIR_COLOURS, ARCHIVE_BAGS } from './human-looks.js';

/** Somebody ordinary, until the player says otherwise. */
export const DEFAULT_PERSON = { v: 2, walkStyle: 'natural', sex: 0, age: 28, height: 1.78, weight: 0, muscle: .1, african: .2, asian: .1, european: .7, tone: '#c89a76', dials: {},
  hair: 'short02', hairColour: HAIR_COLOURS.darkBrown, browColour: HAIR_COLOURS.darkBrown, brows: 'eyebrow003', eyes: 'brown',
  top: 'gallery-box-tee', bottom: 'male_casualsuit04-bottom', shoes: 'shoes05', hat: 'none', beard:'none', glasses:'none', bag:'none',
  trimColour:null, topColour: '#d7774e', bottomColour: null };
const KEY = 'nyc.person', NUMBERS = { sex: [0, 1], age: [6, 95], height: [1.1, 2.15], weight: [-1, 1], muscle: [-1, 1], chest: [-1, 1], firm: [-1, 1], african: [0, 1], asian: [0, 1], european: [0, 1] };
const TEXTS = ['hair', 'brows', 'eyes', 'top', 'bottom', 'shoes', 'hat'], COLOURS = ['tone', 'hairColour', 'browColour', 'topColour', 'bottomColour', 'shoeColour', 'hatColour','trimColour'];

/** A design with nothing in it that the builder would not understand. */
export function tidyPerson(design) {
  const made = { ...DEFAULT_PERSON, dials: {} };
  if (!design || typeof design !== 'object' || design.v !== 2) return made;
  for (const [key, [low, high]] of Object.entries(NUMBERS)) if (Number.isFinite(design[key])) made[key] = Math.max(low, Math.min(high, design[key]));
  if(['relaxed','purposeful'].includes(design.walkStyle)) made.walkStyle=design.walkStyle;
  for (const key of TEXTS) if (typeof design[key] === 'string' && /^[\w-]{1,48}$/.test(design[key])) made[key] = design[key];
  for(const [key,choices] of Object.entries({beard:BEARDS,glasses:GLASSES,bag:[...BAGS,...ARCHIVE_BAGS]}))made[key]=choices.includes(design[key])?design[key]:'none';
  for (const key of COLOURS) if (design[key] === null || /^#[0-9a-f]{6}$/i.test(design[key] || '')) made[key] = design[key];
  if (design.dials && typeof design.dials === 'object') for (const [id, value] of Object.entries(design.dials)) if (Number.isFinite(value) && /^[\w-]{1,64}$/.test(id) && Math.abs(value) > .005) made.dials[id] = Math.max(-1, Math.min(1, value));
  return made;
}
// Old saves used garment names and a flat list of measurements. Keep the original
// record intact so an accessory with no textured equivalent is still recoverable.
const measures = {
  shoulders: 'torso-vshape', chest: 'torso-scale-depth', waist: 'torso-scale-horiz', hips: 'hip-scale-horiz',
  belly: 'stomach-pregnant', seat: 'buttocks-volume', neck: 'neck-scale-horiz', torso: 'torso-scale-vert',
  headWidth: 'head-scale-horiz', headDepth: 'head-scale-depth', forehead: 'forehead-scale-vert',
  chinLength: 'chin-height', chinWidth: 'chin-width', chinProjection: 'chin-prominent', jawWidth: 'chin-bones', jawline:'chin-jaw-drop',
  noseLength: 'nose-scale-vert', noseWidth: 'nose-scale-horiz', noseProjection: 'nose-scale-depth', noseBridge:'nose-hump', noseTip:'nose-point-down-up',
  mouthHeight: 'mouth-trans-down-up', lipWidth: 'mouth-scale-horiz', lipFullness: ['mouth-upperlip-volume','mouth-lowerlip-volume'], smile:'mouth-angles-down-up',
  browHeight: 'eyebrows-trans-down-up', browRidge: 'eyebrows-trans-backward-forward', browArch:'eyebrows-angle-down-up',
  eyeSpacing:['l-eye-trans-in-out','r-eye-trans-in-out'], eyeHeight:['l-eye-trans-down-up','r-eye-trans-down-up'], eyeOpen:['l-eye-height2','r-eye-height2'],
  head: ['head-scale-vert','head-scale-horiz','head-scale-depth'],
  legs: ['upperlegs-height','lowerlegs-height'], arms: ['l-upperarm-scale-vert','r-upperarm-scale-vert','l-lowerarm-scale-vert','r-lowerarm-scale-vert'],
  hands: ['l-hand-scale','r-hand-scale'], feet: ['l-foot-scale','r-foot-scale'], eyeSize: ['l-eye-scale','r-eye-scale'],
  cheeks: ['l-cheek-volume','r-cheek-volume'], cheekbones: ['l-cheek-bones','r-cheek-bones'],
  ears: ['l-ear-scale','r-ear-scale'], armGirth: ['l-upperarm-fat','r-upperarm-fat'], legGirth: ['l-upperleg-fat','r-upperleg-fat'],
};
const styles = { bald:'none', buzz:'short01', crop:'short01', short:'short02', 'side part':'short03', curls:'short04', afro:'afro01',
  bob:'bob01', long:'long01', ponytail:'ponytail01', bun:'ponytail01', locs:'braid01', braids:'braid01', 'top knot':'ponytail01', receding:'short01' };
export function migratePerson(saved) {
  const old = tidyLegacy(saved), coat = old.coat !== 'none';
  const tops = { bare:'none', tank:'female_sportsuit01', tee:'male_casualsuit04', longsleeve:'male_casualsuit02', shirt:'male_casualsuit03',
    polo:'male_casualsuit03', sweater:'male_casualsuit06', hoodie:'male_casualsuit05' };
  const bottoms = { slacks:'male_elegantsuit01', skirt:'female_casualsuit02', 'long skirt':'female_elegantsuit01',
    shorts:'female_sportsuit01', 'long shorts':'female_casualsuit02', sweats:'female_sportsuit01', leggings:'female_casualsuit01' };
  const jacket = old.coat === 'blazer' || old.coat === 'overcoat' ? 'male_elegantsuit01' : 'male_casualsuit05';
  const top = coat ? jacket : tops[old.top], dials = {};
  for (const [key, ids] of Object.entries(measures)) if (old[key]) {
    for (const base of [ids].flat()) {
      const id = /-(?:down-up|in-out|backward-forward)$/.test(base) ? base : base+'-decr-incr';
      dials[id] = (dials[id] || 0) + old[key];
    }
  }
  const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
  const eye = rgb(old.eyes);
  const nearest = EYE_TONES.map(hex => rgb(hex).reduce((sum,c,i)=>sum+(c-eye[i])**2,0));
  return tidyPerson({ ...DEFAULT_PERSON, sex:old.sex, age:old.age, height:heightOf(old), weight:old.weight, muscle:old.muscle,
    chest:old.bust, tone:old.skin, hairColour:old.hair, browColour:old.hair, hair:styles[old.hairStyle] || 'short04',
    eyes:['brown','brown','brownlight','brownlight','green','blue','lightblue','grey'][nearest.indexOf(Math.min(...nearest))],
    dials, top:top === 'none' ? top : top+'-top', topColour:coat ? old.coatColour : old.topColour,
    bottom:(bottoms[old.bottom] || 'male_casualsuit04')+'-bottom', bottomColour:old.bottomColour,
    shoes:({bare:'none',dress:'shoes01',boots:'shoes04',heels:'shoes01',sandals:'shoes03','high tops':'shoes06'})[old.shoes] || 'shoes05',
    shoeColour:old.shoeColour, hat:old.hat === 'none' ? 'none' : 'fedora01', hatColour:old.hatColour,
    beard:old.beard, glasses:old.glasses, bag:old.bag, trimColour:old.trimColour });
}
export function loadPerson(storage) {
  try {
    storage ??= globalThis.localStorage;
    const current = JSON.parse(storage?.getItem(KEY) || 'null');
    if (current?.v === 2) return tidyPerson(current);
  } catch { /* Try the previous editor's record. */ }
  try {
    const old = JSON.parse(storage?.getItem('nyc.character') || 'null');
    if (old && typeof old === 'object') return migratePerson(old);
  } catch { /* Storage may be disabled. */ }
  return tidyPerson(null);
}
export function savePerson(design, storage) {
  try { (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(tidyPerson(design))); return true; }
  catch { return false; }
}
