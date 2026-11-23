// July 2026 Times Square Alliance daily counts on the two sides of each block.
// Ordered south to north, starting with W 42nd–43rd. These are passages.
const blockCounts = [[48944, 53536], [46873, 58288], [35842, 49822], [56931, 36734], [56538, 22171]];
const plazaBlock = new Map([
  ['plaza:354:0', 0],
  ['plaza:353:0', 1],
  ['plaza:355:0', 2],
  ['plaza:324:0', 3],
  ['plaza:440:0', 4],
  ['duffy-paving', 4],
]);
export const isBroadwayPlaza = (id) => plazaBlock.has(id);

// Average local subway entries per hour, weekdays, Saturdays and Sundays.
// MTA hourly ridership, July 2026, complex 611, summed across fare classes
// by local hour and day type, then divided by 23 weekdays / 4 Saturdays / 4 Sundays.
// These supply the shape of hours without street observations.
const entries = [
  [
    2189, 981, 463, 256, 381, 2539,
    5983, 8812, 11798, 9268, 6073, 5363,
    5352, 5610, 6559, 7727, 10417, 15218,
    11854, 7636, 6266, 7914, 6936, 4078,
  ],
  [
    3716, 1829, 926, 508, 429, 643,
    1232, 1762, 2765, 3956, 4888, 5261,
    5212, 5474, 5860, 6481, 8073, 8090,
    7228, 7001, 6421, 5762, 7391, 5695,
  ],
  [
    3520, 1823, 996, 479, 410, 466,
    915, 1416, 2216, 3386, 4300, 4875,
    5367, 5663, 5803, 6030, 6606, 6963,
    8136, 6658, 6002, 6300, 5650, 3880,
  ],
];
// Mean histogram heights for 08:00–18:59, read from Pushkarev & Zupan's
// Times Square walkway observations, reproduced in FHWA Figure 5-7.
// The Alliance also identifies noon–2 and 4–7 as its busiest periods.
const daytime = [1.36, 1.40, 1.38, 1.58, 2.72, 2.99, 2.28, 2.18, 2.22, 2.83, 2.16];
const hourlyWeights = entries.map((hours, day) =>
  hours.map((value, hour) => {
    if (day !== 0) return value;
    if (hour < 8) return value / hours[8] * daytime[0];
    if (hour <= 18) return daytime[hour - 8];
    return value / hours[18] * daytime.at(-1);
  })
);

// March 2025 field survey, FEIS Appendix C tables TA-P1–3. Both sites
// counted two-way traffic on the WEST sidewalk only. Each pin is one hour.
const westPins = {
  1: [{ 19: 6446 }, { 16: 5813, 19: 7277 }, {}],
  2: [{ 19: 5994 }, { 16: 4478, 19: 5671 }, {}],
};
function allocateDay(total, weights, pins) {
  let remainder = total, sum = 0;
  for (let h = 0; h < 24; h++) {
    if (pins[h] !== undefined) remainder -= pins[h];
    else sum += weights[h];
  }
  return weights.map((w, h) => pins[h] ?? remainder * w / sum);
}
const hourShares = hourlyWeights.map((weights) => {
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / total);
});
const busiestShare = Math.max(...hourShares.flat());
const westFlows = blockCounts.map(([west], block) =>
  hourlyWeights.map((weights, day) => allocateDay(west, weights, westPins[block]?.[day] ?? {}))
);
const dayType = (weekday) => weekday === 6 ? 2 : weekday === 5 ? 1 : 0;
function sampleHour(values, hours) {
  const t = ((hours - .5) % 24 + 24) % 24, h = Math.floor(t);
  return values[h] + (values[(h + 1) % 24] - values[h]) * (t - h);
}

// Convert passages on a single sidewalk into the number simultaneously
// walking on a metre of it. The game uses the existing two-side DOT model elsewhere.
export function countedSidewalkDensity(at, hours, weekday, pace) {
  const dx = at.x - 1304.87, dz = at.z + 3763.69;
  if (Math.abs(dx) > 65 || Math.abs(dz) > 88) return null;
  const along = dx * .48 - dz * .877, across = dx * .877 + dz * .48;
  if (across > -3 || across < -21 || Math.abs(at.tx * .48 - at.tz * .877) < .9 || along < -77 || along > 78) return null;
  return sampleHour(westFlows[along < 0 ? 1 : 2][dayType(weekday)], hours) / (3600 * pace);
}

// DOT's 44th–45th St snapshots found 100–150 people staying in mid-afternoon.
// 125 is the midpoint. Transfer it to the other plazas by area and by the
// relative passage counts on their block. An estimated quarter of plaza
// visitors are walking at any instant. The interactive crowd has a render cap.
export function plazaVisitorsPerMetre(run, hours, weekday) {
  const block = plazaBlock.get(run.plaza), [west, east] = blockCounts[block];
  const dailyShare = hours === null ? busiestShare : sampleHour(hourShares[dayType(weekday)], hours);
  const referenceShare = hourShares[0][15];
  const relativeFlow = (west + east) / (blockCounts[2][0] + blockCounts[2][1]);
  return run.plazaArea / run.length * (125 / 571.42) * relativeFlow * dailyShare / referenceShare / .75;
}
