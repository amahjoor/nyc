// Which junctions are controlled, and how their signals run.
//
// New York's signals are, with few exceptions, fixed-time: every junction
// repeats one cycle, and junctions along an avenue start theirs a little
// after one another so that a driver holding the speed limit meets green
// after green. This module is that timing and nothing else: no drawing, no
// vehicles. The simulation asks it whether an approach may go; the renderer
// asks it which lamp is lit; pedestrians ask whether to walk.
//
// What is real: where signals give pedestrians a head start and where all
// traffic stops for them, from the city's own lists (see street-life.json).
// What is assumed: which other junctions have signals (from street widths),
// cycle lengths, and the share of each cycle a street gets.

const TAU = Math.PI * 2;
const mod = (value, n) => ((value % n) + n) % n;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Yellow lasts three seconds at the city's 25 mph limit; then every approach is red for two. */
export const YELLOW = 3, ALL_RED = 2;
/** A leading pedestrian interval: walkers start this long before the traffic beside them. */
export const LEAD = 7;
/** Signals along a street are offset for a driver at the 25 mph limit, in metres a second. */
export const PROGRESSION = 25 * .44704;
/** The walking speed crossing times are set for: 3.5 feet a second. */
export const WALK_SPEED = 3.5 * .3048;
/** How far back from the crossing street's kerb line a stop line is painted. */
export const CROSSWALK = 3.6;

/** The smallest angle between two headings taken as lines, not directions: 0 to pi/2. */
const between = (a, b) => { const d = Math.abs(mod(a - b + Math.PI / 2, Math.PI) - Math.PI / 2); return d; };

/**
 * Decide how one junction is controlled.
 *
 * `arms` are the streets that meet there: { angle, width, inbound, outbound },
 * with `angle` the heading from the junction out along the street (0 is +Z,
 * as everywhere in the game) and `inbound` true if traffic can arrive by it.
 * `hints` says what the city's lists show within a few metres: `lpi` for a
 * head start, `exclusive` for an all-walk phase. `core` marks the part of
 * Manhattan where almost every corner is signalled. A boulevard is mapped as
 * several carriageways side by side, each meeting the cross street at its
 * own point: `boulevard` gives the heading and full `breadth` of such a
 * street, so that each of those points is timed as part of the one junction.
 *
 * Returns null where nothing is needed, or a plan:
 *   control   'signal', 'stop' (the lesser street stops) or 'allway'
 *   axis      heading of the main street, as a line: 0 to pi
 *   groups    for each arm, 0 if it lies on the main street, 1 if it crosses it
 *   widths    [main, cross] carriageway widths in metres
 * and for signals also cycle, offset, green[2], lead[2], clearance[2] and
 * exclusive, all in seconds.
 */
export function planJunction({ x = 0, z = 0, arms = [], hints = {}, core = false, boulevard = null } = {}) {
  const streets = arms.filter(arm => Number.isFinite(arm?.angle) && arm.width > 0);
  if (streets.length < 3) return null;
  // The widest street sets the main axis, or the boulevard if this is one of
  // its carriageways; an arm within 35 degrees of it is part of it.
  const widest = streets.reduce((best, arm) => arm.width > best.width ? arm : best, streets[0]);
  const axis = mod(boulevard ? boulevard.angle : widest.angle, Math.PI);
  const groups = arms.map(arm => Number.isFinite(arm?.angle) && arm.width > 0 ? (between(arm.angle, axis) < .61 ? 0 : 1) : -1);
  const width = group => Math.max(0, ...arms.filter((arm, i) => groups[i] === group).map(arm => arm.width));
  const widths = [width(0), width(1)];
  // Five streets meeting at one point, or a bend with a driveway: without a
  // second axis there is nothing for the main street to give way to.
  if (!widths[1]) return null;
  const arrivals = group => arms.some((arm, i) => groups[i] === group && arm.inbound);
  const listed = Boolean(hints.lpi || hints.exclusive);
  // How wide the main street is in all, for deciding how it is run.
  const breadth = Math.max(widths[0], boulevard?.breadth || 0);
  const signal = listed || breadth >= 12 || (core && widths[0] >= 7.5);
  if (!signal) {
    // Equal streets all stop. Otherwise the lesser one does, if anything arrives by it.
    const control = widths[0] - widths[1] < 2 ? 'allway' : 'stop';
    if (control === 'stop' && !arrivals(1)) return null;
    return { control, axis, groups, widths };
  }
  // Boulevards run two-minute cycles, most signals ninety seconds, and the
  // quiet corners of the outer boroughs sixty.
  const cycle = breadth >= 22 ? 120 : breadth >= 12 || core ? 90 : 60;
  // Time to walk across each street; the flashing hand lasts that long.
  const clearance = [clamp(widths[1] / WALK_SPEED, 6, 22), clamp(widths[0] / WALK_SPEED, 6, 30)];
  const exclusive = hints.exclusive ? Math.round(clamp(Math.max(widths[0], widths[1]) * 1.25 / WALK_SPEED + LEAD, 18, 34)) : 0;
  const lead = hints.lpi && !exclusive ? [LEAD, LEAD] : [0, 0];
  const shared = cycle - 2 * (YELLOW + ALL_RED) - lead[0] - lead[1] - exclusive;
  // The wider street gets more of the cycle, but never so much that the
  // other cannot be crossed on foot during it.
  const share = clamp(.5 + .2 * (widths[0] - widths[1]) / widths[0], .5, .64);
  const green = [Math.round(shared * share), 0];
  green[1] = shared - green[0];
  // The same clock for every signal on a street: its place along the street,
  // at the speed the street is timed for. A one-way street's wave runs the
  // way its traffic does.
  const flow = arms.find((arm, i) => groups[i] === 0 && arm.outbound && !arm.inbound) || arms.find((arm, i) => groups[i] === 0 && arm.outbound);
  const heading = flow ? flow.angle : axis;
  const along = x * Math.sin(heading) + z * Math.cos(heading);
  const offset = mod(along / PROGRESSION, cycle);
  return { control: 'signal', axis, groups, widths, cycle, offset, green, lead, clearance, exclusive };
}

/**
 * Where a signal plan is in its cycle. Returns the phase name and the seconds
 * into it: 'lead0', 'green0', 'yellow0', 'red0' (all red), then the same for
 * the cross street, then 'walk' where every direction stops for pedestrians.
 */
export function phaseAt(plan, time) {
  let t = mod(time - plan.offset, plan.cycle);
  const steps = [['lead0', plan.lead[0]], ['green0', plan.green[0]], ['yellow0', YELLOW], ['red0', ALL_RED],
    ['lead1', plan.lead[1]], ['green1', plan.green[1]], ['yellow1', YELLOW], ['red1', ALL_RED], ['walk', plan.exclusive]];
  for (const [name, length] of steps) {
    if (t < length) return { name, elapsed: t, remaining: length - t };
    t -= length;
  }
  return { name: 'red1', elapsed: 0, remaining: 0 };
}

/**
 * What a driver arriving on an arm of `group` (0 main, 1 cross) sees.
 * 'stop' is a stop sign: halt, then go when clear. `remaining` is how long the
 * present colour lasts, for signals.
 */
export function vehicleAspect(plan, group, time) {
  if (!plan) return { aspect: 'green', remaining: Infinity };
  if (plan.control === 'allway') return { aspect: 'stop', remaining: Infinity };
  if (plan.control === 'stop') return { aspect: group === 1 ? 'stop' : 'green', remaining: Infinity };
  const phase = phaseAt(plan, time);
  if (phase.name === `green${group}`) return { aspect: 'green', remaining: phase.remaining };
  if (phase.name === `yellow${group}`) return { aspect: 'yellow', remaining: phase.remaining };
  return { aspect: 'red', remaining: redFor(plan, group, time) };
}

function redFor(plan, group, time) {
  // Seconds until this approach's green begins.
  const start = group === 0 ? plan.lead[0] : plan.lead[0] + plan.green[0] + YELLOW + ALL_RED + plan.lead[1];
  return mod(start - mod(time - plan.offset, plan.cycle), plan.cycle);
}

/**
 * What a pedestrian about to cross the street of `group` sees: 'walk',
 * 'flash' (the flashing hand: finish crossing, do not start) or 'dont'.
 * People cross the cross street while main-street traffic runs beside them,
 * and the other way about; where every direction stops for them, only then.
 * At a stop sign, and where nothing controls the junction, there is no
 * pedestrian signal: `null`.
 */
export function crossingAspect(plan, group, time) {
  if (!plan || plan.control !== 'signal') return { aspect: null, remaining: Infinity };
  const phase = phaseAt(plan, time);
  if (plan.exclusive) {
    if (phase.name !== 'walk') return { aspect: 'dont', remaining: Infinity };
    const clear = Math.min(plan.exclusive - LEAD, Math.max(plan.clearance[0], plan.clearance[1]));
    return phase.remaining > clear ? { aspect: 'walk', remaining: phase.remaining - clear } : { aspect: 'flash', remaining: phase.remaining };
  }
  // Crossing street `group` happens alongside the other street's traffic.
  const beside = 1 - group, clear = Math.min(plan.clearance[beside === 0 ? 0 : 1], plan.lead[beside] + plan.green[beside] - 4);
  if (phase.name === `lead${beside}`) return { aspect: 'walk', remaining: phase.remaining + plan.green[beside] - clear };
  if (phase.name === `green${beside}`) return phase.remaining > clear ? { aspect: 'walk', remaining: phase.remaining - clear } : { aspect: 'flash', remaining: phase.remaining };
  return { aspect: 'dont', remaining: Infinity };
}

/** How far before the junction's centre an arriving driver stops, along the arm. */
export function stopDistance(plan, group) {
  return plan.widths[1 - group] / 2 + CROSSWALK;
}

/**
 * The arms of a node in the simulation's road graph: one for each street that
 * leaves it at grade. `edges` is every edge of the graph that touches it.
 * Bridges and tunnels pass over or under without meeting the street.
 */
export function junctionArms(node, edges) {
  const arms = [];
  const add = (angle, road, inbound) => {
    if (!road || road.kind === 'bridge' || road.kind === 'tunnel' || (road.roadwayType ?? 1) !== 1 || (road.fromLevel ?? 13) !== 13 || (road.toLevel ?? 13) !== 13) return;
    const heading = mod(angle, TAU);
    let arm = arms.find(other => Math.abs(mod(other.angle - heading + Math.PI, TAU) - Math.PI) < .35);
    if (!arm) arms.push(arm = { angle: heading, width: 0, inbound: false, outbound: false, name: road.name || '', oneway: Boolean(road.oneway) });
    arm.width = Math.max(arm.width, Number.isFinite(road.width) ? road.width : 10);
    if (inbound) arm.inbound = true; else arm.outbound = true;
  };
  for (const edge of edges) {
    if (edge.from === node) add(edge.angle, edge.road, false);
    else if (edge.to === node) add(edge.angle + Math.PI, edge.road, true);
  }
  return arms;
}
