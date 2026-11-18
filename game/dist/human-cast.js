// The people the sidewalks are peopled from.
//
// Nobody on the street is designed by hand. There is a cast of a hundred or
// so, each a number, and a number is a person: human-looks.js makes the same
// one from it every time. They are sorted by the census's five groups, by sex
// and by ten kinds (a child, two of them old, four as they come, two dressed
// for an office, one for a run), so that a block can be given the people its
// census tract says live there (demographics.js) without anybody having to be
// made before they are needed.
import { somebody, mulberry } from './human-looks.js';

export const GROUPS = ['white', 'black', 'asian', 'hispanic', 'other'];
export const KINDS = 10;
const CHILD = 0, OLD = 1, OLDER = 2, OFFICE = [7, 8], RUNNER = 9;
/** Two more, in uniform: a man and a woman of the police. */
export const OFFICERS = [GROUPS.length * 2 * KINDS, GROUPS.length * 2 * KINDS + 1];
export const MEMBERS = OFFICERS[1] + 1;

/** What a number says about who it is, without making them. */
export function memberInfo(id) {
  if (id >= OFFICERS[0]) return { officer: true, woman: id === OFFICERS[1], child: false, old: false, group: 'other', kind: 3 };
  const kind = id % KINDS, woman = Math.floor(id / KINDS) % 2 === 1, group = GROUPS[Math.floor(id / (KINDS * 2))];
  // The census's "Asian" is South Asia and East Asia both, and its "white" takes in the Middle East: a third of each cast is of the one, the rest of the other.
  const line = group === 'asian' ? (kind % 3 === 2 ? 'southAsian' : 'eastAsian') : group === 'white' && kind === 5 ? 'arab' : null;
  return { officer: false, woman, child: kind === CHILD, old: kind === OLD || kind === OLDER, group, kind, line, outfit: OFFICE.includes(kind) ? 'business' : kind === RUNNER ? 'athletic' : 'casual' };
}

/** The design a number stands for. `human` is the figure (human.js), for its dials. */
export function designOf(id, human) {
  const info = memberInfo(id), random = mulberry(0x9e3779b1 ^ Math.imul(id + 1, 2654435761));
  if (info.officer) {
    const design = somebody(random, human, { sex: info.woman ? 1 : 0, age: 28 + Math.floor(random() * 18), outfit: 'business' });
    return { ...design, weight: Math.min(.35, design.weight), top: 'male_casualsuit03-top', bottom: 'male_elegantsuit01-bottom', topColour: '#1b2a4a', bottomColour: '#141b2c', shoes: 'shoes01', hat: 'none', hair: info.woman ? 'ponytail01' : design.hair === 'long01' ? 'short02' : design.hair };
  }
  const shares = GROUPS.map(group => group === info.group ? 1 : 0);
  const age = info.kind === CHILD ? 10 + Math.floor(random() * 7) : info.kind === OLD ? 68 + Math.floor(random() * 18) : info.kind === OLDER ? 52 + Math.floor(random() * 14) : info.kind === RUNNER ? 19 + Math.floor(random() * 22) : 18 + Math.floor(random() * 32);
  return somebody(random, human, { shares, sex: info.woman ? 1 : 0, age, kind: info.line || (info.group === 'white' ? 'european' : null), outfit: info.outfit });
}

/**
 * Somebody for a place. `tones` is what demographics.js says of it ({ shares, languages }, or null where
 * nothing is known); `outfit` is how the crowd there is dressed ('suit', 'office', 'athletic', ...).
 */
export function memberFor(random, tones = null, outfit = 'casual', woman = random() < .5) {
  const shares = tones?.shares || [.313, .208, .145, .284, .049];
  let at = random() * shares.reduce((sum, share) => sum + share, 0), group = 0;
  for (; group < shares.length - 1; group++) { at -= shares[group]; if (at <= 0) break; }
  const r = random();
  let kind = outfit === 'suit' || outfit === 'office' ? (r < .8 ? OFFICE[r < .4 ? 0 : 1] : r < .9 ? OLDER : 3 + Math.floor(random() * 4))
    : outfit === 'athletic' ? (r < .75 ? RUNNER : 3 + Math.floor(random() * 4))
    : r < .06 ? CHILD : r < .15 ? OLD : r < .28 ? OLDER : r < .34 ? RUNNER : r < .42 ? OFFICE[r < .38 ? 0 : 1] : 3 + Math.floor(random() * 4);
  // Among those the census calls Asian here, how many speak the languages of the subcontinent at home.
  if (GROUPS[group] === 'asian' && tones?.languages) {
    const spoken = Object.fromEntries(tones.languages), east = (spoken.chinese || 0) + (spoken.korean || 0) + (spoken.vietnamese || 0) + (spoken.tagalog || 0) + (spoken.asian || 0) * .5, south = (spoken.indoeuropean || 0) * .8 + (spoken.asian || 0) * .3;
    const wantSouth = random() < Math.max(.05, Math.min(.9, south / (south + east || 1)));
    if ((kind % 3 === 2) !== wantSouth) for (const other of [3, 4, 5, 6]) if ((other % 3 === 2) === wantSouth && kind >= 3 && kind <= 6) { kind = other; break; }
  }
  return (group * 2 + (woman ? 1 : 0)) * KINDS + kind;
}
/** About how tall a number is, before they have been made. */
export function roughHeight(id, random = Math.random) { const info = memberInfo(id); return (info.child ? 1.46 : info.woman ? 1.62 : 1.76) * (.97 + random() * .06); }
