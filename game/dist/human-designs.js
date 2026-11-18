// The player's own design, as kept in this browser. What a design may say is in human-looks.js.
import { HAIR_COLOURS } from './human-looks.js';

/** Somebody ordinary, until the player says otherwise. */
export const DEFAULT_PERSON = { v: 2, sex: 0, age: 28, height: 1.78, weight: 0, muscle: .1, african: .2, asian: .1, european: .7, tone: '#c89a76', dials: {},
  hair: 'short02', hairColour: HAIR_COLOURS.darkBrown, browColour: HAIR_COLOURS.darkBrown, brows: 'eyebrow003', eyes: 'brown',
  top: 'male_casualsuit04-top', bottom: 'male_casualsuit04-bottom', shoes: 'shoes05', hat: 'none', topColour: '#d7774e', bottomColour: null };
const KEY = 'nyc.person', NUMBERS = { sex: [0, 1], age: [10, 90], height: [1.2, 2.1], weight: [-1, 1], muscle: [-1, 1], chest: [-1, 1], firm: [-1, 1], african: [0, 1], asian: [0, 1], european: [0, 1] };
const TEXTS = ['hair', 'brows', 'eyes', 'top', 'bottom', 'shoes', 'hat'], COLOURS = ['tone', 'hairColour', 'browColour', 'topColour', 'bottomColour'];

/** A design with nothing in it that the builder would not understand. */
export function tidyPerson(design) {
  const made = { ...DEFAULT_PERSON, dials: {} };
  if (!design || typeof design !== 'object' || design.v !== 2) return made;
  for (const [key, [low, high]] of Object.entries(NUMBERS)) if (Number.isFinite(design[key])) made[key] = Math.max(low, Math.min(high, design[key]));
  for (const key of TEXTS) if (typeof design[key] === 'string' && /^[\w-]{1,48}$/.test(design[key])) made[key] = design[key];
  for (const key of COLOURS) if (design[key] === null || /^#[0-9a-f]{6}$/i.test(design[key] || '')) made[key] = design[key];
  if (design.dials && typeof design.dials === 'object') for (const [id, value] of Object.entries(design.dials)) if (Number.isFinite(value) && /^[\w-]{1,64}$/.test(id) && Math.abs(value) > .005) made.dials[id] = Math.max(-1, Math.min(1, value));
  return made;
}
/** The player's own design, as last saved in this browser. */
export function loadPerson(storage = globalThis.localStorage) { try { return tidyPerson(JSON.parse(storage?.getItem(KEY) || 'null')); } catch { return tidyPerson(null); } }
export function savePerson(design, storage = globalThis.localStorage) { try { storage?.setItem(KEY, JSON.stringify(tidyPerson(design))); return true; } catch { return false; } }
