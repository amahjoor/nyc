// How a street's roadway divides into lanes.
//
// The lines painted on a street, the cars parked at its kerbs and the traffic
// that drives along it all take their places from this one layout, so that a
// moving car is in a lane and not astride a line. The city publishes each
// street's width and direction, not its markings: the layout is the usual one
// for that width, a parking lane at each kerb and travel lanes of about 3.3 m.

/** What a row of parked cars takes from each side of the roadway, in metres. */
export const PARKING_LANE = 2.3;
/** A street narrower than this from kerb to kerb keeps its whole width for moving traffic. */
export const PARKED_FROM = 9;
/** Traffic runs in several files only where there is a parking lane to keep clear of the kerb, and each lane is at least this wide. */
export const DRIVEN_LANE = 2.9;

/**
 * The lanes for traffic going one way along a street `width` metres from kerb
 * to kerb. On a one-way street they fill the roadway; on a two-way street,
 * the half to the right of the centreline.
 *
 * `count` lanes, each `width` wide. Lane `i` is centred `first + i * step`
 * metres to the driver's right of the centreline: on a one-way street lane 0
 * is the right-hand lane and the rest lie to its left; on a two-way street
 * lane 0 is the one beside the centreline and the rest lie nearer the kerb.
 * `driven` says whether traffic uses them all, or keeps to a single file.
 */
export function laneLayout(width, oneWay) {
  const travelled = width - (width >= PARKED_FROM ? 2 * PARKING_LANE : 0), share = oneWay ? travelled : travelled / 2;
  const count = Math.max(1, Math.round(share / 3.3)), each = share / count;
  return { count, width: each, first: oneWay ? (count / 2 - .5) * each : each / 2, step: oneWay ? -each : each, driven: width >= PARKED_FROM && count > 1 && each >= DRIVEN_LANE };
}
