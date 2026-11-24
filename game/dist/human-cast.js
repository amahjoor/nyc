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
import { UNIT, UNIFORMS, unitHash } from './police-units.js';
import { FASHION_LOOKS } from './fashion.js';
import { ARCHIVE_LOOKS } from './archive-looks.js';

export const GROUPS = ['white', 'black', 'asian', 'hispanic', 'other'];
export const KINDS = 10;
/** Visible kit bits on the lightweight crowd mesh. */
export const KIT = { backpack: 1, bag: 2, cap: 4, longHair: 8, shortSleeves: 16, shorts: 32, woman: 64, patrol: 128 };
const CHILD = 0, OLD = 1, OLDER = 2, OFFICE = [7, 8], RUNNER = 9;
// The same roster supplies the patrol-car occupants and the crew on foot.
const patrol = [
  ['white',1.79,0xd2a78a,'short02'], ['black',1.66,0x875c46,'ponytail01'],
  ['hispanic',1.74,0xb98565,'short04'], ['asian',1.63,0xc59778,'short02'],
  ['black',1.83,0x694731,'short01'], ['white',1.70,0xd9b393,'ponytail01'],
];
export const OFFICERS = patrol.map((_,i) => GROUPS.length * 2 * KINDS + i);
const wardrobes = Object.keys(UNIFORMS);
// Specialist units share two fitted people per wardrobe, keeping the number
// of GPU pose sheets independent of the number of units on the roster.
const uniformCast = patrol.map((_,slot)=>({wardrobe:'patrol',slot}));
for (let i=1;i<wardrobes.length;i++) for (let j=0;j<2;j++)
  uniformCast.push({wardrobe:wardrobes[i],slot:(i*2+j)%patrol.length});
export const MEMBERS = OFFICERS[0] + uniformCast.length;

export function patrolLookForMember(member) {
  const {slot,wardrobe}=uniformCast[member-OFFICERS[0]], [,height,skin] = patrol[slot];
  const style=UNIFORMS[wardrobe];
  return {member,outfit:'patrol',wardrobe,top:parseInt(style.coat.slice(1),16),bottom:0x202939,hair:0x211d1b,
    skin,height,build:1,pace:1.4,kit:(style.cap==='none'?0:KIT.patrol|KIT.cap) | (slot % 2 ? KIT.woman : 0)};
}

export function patrolAppearance(carId, seat = 0, unitId = 'patrol') {
  const unit=UNIT[unitId] || UNIT.patrol, family=wardrobes.indexOf(unit.uniform), hash=unitHash(carId)+seat;
  const member=family===0 ? OFFICERS[hash%patrol.length] : OFFICERS.at(-1)+1+(family-1)*2+hash%2;
  return {...patrolLookForMember(member),unit:unit.id};
}

/** What a number says about who it is, without making them. */
export function memberInfo(id) {
  if (id >= OFFICERS[0]) {
    const {slot,wardrobe}=uniformCast[id-OFFICERS[0]];
    return {officer:true,woman:Boolean(slot%2),child:false,old:false,group:patrol[slot][0],kind:3,slot,wardrobe};
  }
  const kind = id % KINDS, woman = Math.floor(id / KINDS) % 2 === 1, group = GROUPS[Math.floor(id / (KINDS * 2))];
  // The census's "Asian" is South Asia and East Asia both, and its "white" takes in the Middle East: a third of each cast is of the one, the rest of the other.
  const line = group === 'asian' ? (kind % 3 === 2 ? 'southAsian' : 'eastAsian') : group === 'white' && kind === 5 ? 'arab' : null;
  return { officer: false, woman, child: kind === CHILD, old: kind === OLD || kind === OLDER, group, kind, line, outfit: OFFICE.includes(kind) ? 'business' : kind === RUNNER ? 'athletic' : 'casual' };
}

const walkStyles = Array.from({length:MEMBERS}, (_,id)=>{
  const roll=mulberry(Math.imul(id+1,0x9e3779b1))();
  return roll<.35?'relaxed':roll>.68?'purposeful':'natural';
});
export const castWalkStyle = id => walkStyles[id] ?? 'natural';

// Deal outfits across the existing adult cast, independently of their face,
// ancestry and walk cycle. A returning customer keeps the same garments.
// The full skirt was on every third person behind a counter. A skirt is now for women, and the full one for one woman in three.
const wearsSkirt = (id, look) => !/skirt|mini/.test(look.clothes.bottom || '') || (memberInfo(id).woman && (!/bias-full-skirt/.test(look.clothes.bottom) || id % 3 === 0));
const streetLooks=new Map(), deal=mulberry(0x5b0f2179);
for(const occasion of ['casual','business','athletic']){
  const members=Array.from({length:OFFICERS[0]},(_,id)=>id).filter(id=>{
    const info=memberInfo(id);
    return !info.child && info.outfit===occasion;
  });
  for(let i=members.length-1;i>0;i--){
    const j=Math.floor(deal()*(i+1));
    [members[i],members[j]]=[members[j],members[i]];
  }
  const looks=FASHION_LOOKS.filter(look=>look.occasion===occasion);
  const count=Math.max(looks.length,Math.ceil(members.length*.68));
  for(let i=0;i<count;i++){
    const look=looks[i%looks.length];
    const at=members.findIndex(id=>wearsSkirt(id,look));
    if(at>=0)streetLooks.set(members.splice(at,1)[0],look);
  }
}
export const fashionForMember=id=>streetLooks.get(id);

// The adults the presets passed over wear the archive collection: each a look
// of their own (archive-looks.js), the most wanted looks first, and nobody a
// look cut for somebody else. Runners run in what they had.
const archiveLooks=new Map();
{
  const wearers=Array.from({length:OFFICERS[0]},(_,id)=>id).filter(id=>{
    const info=memberInfo(id);
    return !info.child && info.outfit!=='athletic' && !streetLooks.has(id);
  });
  const dealt=mulberry(0x41c7e3a9);
  for(let i=wearers.length-1;i>0;i--){
    const j=Math.floor(dealt()*(i+1));
    [wearers[i],wearers[j]]=[wearers[j],wearers[i]];
  }
  for(const look of ARCHIVE_LOOKS){
    const at=wearers.findIndex(id=>{
      const info=memberInfo(id);
      return info.outfit===look.occasion && (look.woman===null || look.woman===info.woman) && !(look.young && info.old);
    });
    if(at>=0)archiveLooks.set(wearers.splice(at,1)[0],look);
  }
}
/** The archive look a member of the cast wears on the street, if they wear one. */
export const archiveForMember=id=>archiveLooks.get(id);

// Nobody owns one outfit. Each grown member of the cast has a wardrobe: the look they were dealt (0), plain everyday
// clothes (1), and then every look that suits them, followed by outfits put together from those looks: the top of one
// with the trousers and shoes of another. That is dozens apiece. A figure is drawn for a member in one outfit, and is
// known by the member's number plus VARIANT_STEP for each step along their list.
export const VARIANT_STEP = 1000;
const MIXED = 36;
const wardrobesOf = new Map();
for (let id = 0; id < OFFICERS[0]; id++) {
  const info = memberInfo(id);
  if (info.child) continue;
  const first = streetLooks.get(id) || archiveLooks.get(id);
  const suits = [...ARCHIVE_LOOKS, ...FASHION_LOOKS].filter(look => look !== first && look.occasion === info.outfit
    && (look.woman == null || look.woman === info.woman) && !(look.young && info.old) && wearsSkirt(id, look));
  const outfits = suits.map(look => look.clothes), roll = mulberry(Math.imul(id + 7, 0x85ebca6b)), seen = new Set();
  // Mixed outfits: nobody is given the same pairing twice, and a suit is not split from its own trousers by chance alone.
  for (let tries = 0; outfits.length < suits.length + MIXED && tries < MIXED * 6 && suits.length > 1; tries++) {
    const a = suits[Math.floor(roll() * suits.length)].clothes, b = suits[Math.floor(roll() * suits.length)].clothes, c = suits[Math.floor(roll() * suits.length)].clothes;
    // A top stays with the trousers or skirt it was cut to be worn with: a short top over somebody else's low trousers
    // leaves a gap of skin at the waist and the seat. What changes from one mixed outfit to the next is the shoes.
    const key = a.top + '|' + a.bottom + '|' + c.shoes;
    if (a === c || seen.has(key)) continue;
    seen.add(key);
    outfits.push({ ...a, shoes: c.shoes ?? a.shoes, shoeColour: c.shoeColour ?? a.shoeColour });
  }
  wardrobesOf.set(id, outfits);
}
/** The clothes a member wears in one of their outfits, or null for plain everyday clothes. */
export function clothesFor(id, variant = 0) {
  const dealt = streetLooks.get(id) || archiveLooks.get(id), first = dealt && wearsSkirt(id, dealt) ? dealt.clothes : null;
  if (variant === 1) return null;
  return variant >= 2 ? wardrobesOf.get(id)?.[variant - 2] || first : first;
}
/** How many outfits a member has, the look they were dealt and their plain clothes included. */
export const outfitCount = id => 2 + (wardrobesOf.get(id)?.length || 0);
/**
 * Which of their outfits somebody has on today. `style` (0 to 1) is how dressed the street they are on is: on a shopping
 * street or a street of bars nearly everybody is in a look; on a quiet block more are in plain clothes.
 */
export function chooseVariant(id, random, style = .3) {
  if (id >= OFFICERS[0] || memberInfo(id).child) return 0;
  const dressed = .45 + .45 * Math.max(0, Math.min(1, style)), roll = random(), more = wardrobesOf.get(id)?.length || 0;
  // Of a wardrobe of dozens, each person is going about in one of a handful at any one time, and the handful moves on
  // every ten minutes: the street stays varied without a new figure having to be made for nearly everybody who appears.
  const IN_USE = 4, turn = Math.floor(Date.now() / 600000);
  if (roll < dressed && more) return 2 + (turn * IN_USE + id * 7 + Math.floor(random() * Math.min(IN_USE, more))) % more;
  return roll < dressed + .15 ? 0 : 1;
}

/** The design a number stands for: a member of the cast, in the outfit its thousands say. */
export function designOf(id, human) {
  const variant = id >= OFFICERS[0] && id < VARIANT_STEP ? 0 : Math.floor(id / VARIANT_STEP);
  id %= VARIANT_STEP;
  // Past their own two outfits, each outfit in a member's wardrobe is worn by somebody else of the same kind: another
  // face, age, build, hair and colouring. A hundred members are then several thousand different people.
  const info = memberInfo(id), face=info.officer ? OFFICERS[info.slot] : variant >= 2 ? id + variant * 131 : id;
  const random = mulberry(0x9e3779b1 ^ Math.imul(face + 1, 2654435761));
  if (info.officer) {
    const [,height,skin,hair] = patrol[info.slot];
    const design = somebody(random, human, { sex: Number(info.woman), shares: GROUPS.map(g => Number(g===info.group)), age: 28 + Math.floor(random() * 18) });
    return { ...design, walkStyle:castWalkStyle(id), uniform:info.wardrobe, height, tone:'#'+skin.toString(16), hair,
      top:'male_casualsuit02-top', topColour:null, bottom:'male_elegantsuit01-bottom', bottomColour:'#202939',
      shoes:'shoes01', shoeColour:'#25292d', hat:'none' };
  }
  const shares = GROUPS.map(group => group === info.group ? 1 : 0);
  const age = info.kind === CHILD ? 10 + Math.floor(random() * 7) : info.kind === OLD ? 68 + Math.floor(random() * 18) : info.kind === OLDER ? 52 + Math.floor(random() * 14) : info.kind === RUNNER ? 19 + Math.floor(random() * 22) : 18 + Math.floor(random() * 32);
  return {...somebody(random, human, { shares, sex: info.woman ? 1 : 0, age, kind: info.line || (info.group === 'white' ? 'european' : null), outfit: info.outfit }),
    ...clothesFor(id, variant),walkStyle:castWalkStyle(id)};
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
  let kind = outfit === 'staff' ? OFFICE[r < .5 ? 0 : 1] : outfit === 'suit' || outfit === 'office' ? (r < .8 ? OFFICE[r < .4 ? 0 : 1] : r < .9 ? OLDER : 3 + Math.floor(random() * 4))
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
