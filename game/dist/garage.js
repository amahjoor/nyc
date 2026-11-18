// What a garage does to a car, and what it charges.
//
// Auto repair shops and body shops are real places (places.js). A repair
// shop mends a car and fits a stronger engine, brakes and tyres; a body shop
// mends it and resprays it. How a car drives follows the body it has and
// what has been fitted. The prices and the figures are the game's.

/** How each body drives against a plain sedan: pull, top speed, braking and grip. */
export const BODY_HANDLING = {
  sedan: { power: 1, top: 1, brakes: 1, grip: 1 }, coupe: { power: 1.18, top: 1.12, brakes: 1.08, grip: 1.1 }, hatch: { power: .95, top: .95, brakes: 1.02, grip: 1.04 },
  wagon: { power: .95, top: .97, brakes: .98, grip: .98 }, suv: { power: .92, top: .93, brakes: .94, grip: .92 }, minivan: { power: .85, top: .9, brakes: .92, grip: .9 },
  pickup: { power: .9, top: .92, brakes: .9, grip: .88 }, van: { power: .78, top: .85, brakes: .86, grip: .84 },
};
/** Parts a repair shop fits, in three stages each: the price of each stage, and what a stage adds. */
export const PARTS = {
  engine: { label: 'ENGINE', prices: [400, 800, 1400], gain: { power: .09, top: .05 } },
  brakes: { label: 'BRAKES', prices: [250, 500, 900], gain: { brakes: .1 } },
  tyres: { label: 'TYRES', prices: [300, 600, 1000], gain: { grip: .08 } },
};
export const RESPRAY_PRICE = 180;
/** Paint a body shop keeps: name and colour. */
export const RESPRAYS = [['BLACK', '#15181b'], ['WHITE', '#e8e9e6'], ['SILVER', '#b4b9bd'], ['GREY', '#5b6166'], ['BLUE', '#1f3a6a'], ['RED', '#8a1f1f'], ['GREEN', '#27402f'], ['ORANGE', '#c4601a']];
/** What the mechanic charges to come out, on top of the repair, and to bring the player's cab round. */
export const CALL_OUT = 90, DELIVERY = 60;

/** What mending a car costs at a garage, from its condition out of 100. */
export const repairCost = health => Math.max(0, Math.round((100 - Math.max(0, Math.min(100, health))) * 3 / 5) * 5);

/** Which of repair, respray and parts a kind of place offers. */
export function offersAt(kind) {
  if (kind === 'repair') return { repair: true, respray: false, parts: true };
  if (kind === 'bodyshop') return { repair: true, respray: true, parts: false };
  return null;
}

/**
 * How a car drives: its own figures where its model's power and weight are known (`own`, from
 * vehicle-performance.js), otherwise its body's, raised by whatever has been fitted. `mods` is { engine, brakes, tyres } in stages.
 */
export function handlingFor(body, mods = {}, own = null) {
  const handling = { ...(own || BODY_HANDLING[body] || BODY_HANDLING.sedan) };
  for (const [part, { gain }] of Object.entries(PARTS)) {
    const stage = Math.max(0, Math.min(3, Math.floor(mods?.[part] || 0)));
    for (const [figure, each] of Object.entries(gain)) handling[figure] *= 1 + each * stage;
  }
  return handling;
}
