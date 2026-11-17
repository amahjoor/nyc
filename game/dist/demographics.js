// Who is on the street.
//
// The Census Bureau's American Community Survey counts the residents of every
// census tract by race and Hispanic origin and by the language spoken at home
// (scripts/build-demographics.mjs). The crowd on a block takes its mix of
// faces from the people who live there, blended toward the whole city's
// where most of those on the street have come from somewhere else to work,
// shop or look around.
//
// The survey's categories say nothing about how one person looks. Each is
// given a wide, overlapping range of skin and hair, so a block's crowd shifts
// in its proportions and no person can be read back to a category. Nothing
// else about a person, what they wear or what they do, is drawn from this.

/** Skin, light to deep, and hair, as painted. */
export const SKIN_TONES = [0xf1d3bd, 0xe6bf9f, 0xd9a981, 0xc68e63, 0xa9744d, 0x8a5a3a, 0x6b432b, 0x4a2e1f];
export const HAIR_TONES = [0x14110f, 0x2a211c, 0x4a3323, 0x6b4a2e, 0x9a7446, 0xc9a66b, 0x8a8a8c, 0xa5482a];
// For each of the survey's groups, how its range falls over those tones. Rows need not sum to anything.
const SKIN_OF = { white: [30, 30, 20, 10, 5, 2, 0, 0], black: [0, 1, 4, 10, 20, 28, 24, 13], asian: [14, 30, 30, 18, 7, 1, 0, 0], hispanic: [8, 18, 26, 24, 14, 7, 2, 1], other: [10, 16, 20, 20, 14, 10, 6, 4] };
const HAIR_OF = { white: [10, 22, 22, 16, 10, 9, 9, 2], black: [58, 28, 6, 1, 0, 0, 6, 1], asian: [58, 28, 5, 1, 0, 0, 7, 1], hispanic: [38, 34, 14, 4, 1, 1, 7, 1], other: [34, 30, 14, 8, 4, 2, 7, 1] };

const totals = shares => { const sum = shares.reduce((a, b) => a + b, 0) || 1; let running = 0; return shares.map(share => (running += share / sum)); };
/** The entry a number from 0 to 1 falls on. */
export const drawTone = (tones, running, r) => { for (let i = 0; i < running.length; i++) if (r < running[i]) return tones[i]; return tones[tones.length - 1]; };

/** `data` is demographics.json. Without it everyone is drawn from one even range, as before. */
export function createDemographics(data = null) {
  const groups = data?.groups || Object.keys(SKIN_OF), size = 600, grid = new Map();
  const tracts = (data?.tracts || []).map(([x, z, residents, shares, languages]) => ({ x, z, residents, shares, languages }));
  for (const tract of tracts) { const key = `${Math.floor(tract.x / size)},${Math.floor(tract.z / size)}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(tract); }
  const city = (data?.city || [20, 20, 20, 20, 20]).map(share => share / 1000);
  const tractAt = (x, z) => {
    let nearest = null, best = Infinity;
    for (let ring = 1; ring <= 3 && !nearest; ring++) for (let gx = Math.floor(x / size) - ring; gx <= Math.floor(x / size) + ring; gx++) for (let gz = Math.floor(z / size) - ring; gz <= Math.floor(z / size) + ring; gz++) {
      for (const tract of grid.get(`${gx},${gz}`) || []) { const d = (tract.x - x) ** 2 + (tract.z - z) ** 2; if (d < best) { best = d; nearest = tract; } }
    }
    return nearest;
  };
  return {
    tracts: tracts.length, groups, languages: data?.languages || [],
    /** The census tract whose middle is nearest, or null where none is within reach. */
    tractAt,
    /**
     * The mix of skin and hair on the street at (x, z). `visitors` (0 to 1)
     * is the share of people there who do not live there.
     * @returns {{skins:number[], skin:number[], hairs:number[], hair:number[], shares:number[]}} tones and running totals of their shares
     */
    tonesAt(x, z, visitors = 0) {
      const tract = tractAt(x, z), away = tract ? Math.max(0, Math.min(1, visitors)) : 1;
      const shares = city.map((share, i) => (tract ? tract.shares[i] / 1000 : 0) * (1 - away) + share * away);
      const mix = table => SKIN_TONES.map((_, tone) => groups.reduce((sum, group, i) => sum + shares[i] * (table[group]?.[tone] || 0) / table[group].reduce((a, b) => a + b, 0), 0));
      return { shares, skins: SKIN_TONES, skin: totals(mix(SKIN_OF)), hairs: HAIR_TONES, hair: totals(mix(HAIR_OF)) };
    },
    /** The languages spoken at home round (x, z), most spoken first, as [name, share]; English first if nothing is known. */
    languagesAt(x, z) {
      const tract = tractAt(x, z), names = data?.languages || ['english'];
      if (!tract) return [['english', 1]];
      return names.map((name, i) => [name, (tract.languages[i] || 0) / 1000]).sort((a, b) => b[1] - a[1]);
    },
  };
}
