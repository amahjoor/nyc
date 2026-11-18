import { roadFigures } from './vehicle-performance.js';
import { bodyShape, vehicleName } from './fleet.js';

const metrics = [
  ['topSpeed', 'Top speed', 'mph', 0], ['zeroToSixty', '0–60 mph', 's', 1],
  ['stoppingFeet', '60–0 mph', 'ft', 0], ['grip', 'Cornering grip', 'g', 2],
];

export function performanceName(car) {
  return vehicleName(car.identity) || (car.type === 'taxi' ? 'City cab' : bodyShape(car.type, car.id, car.shape).toUpperCase());
}

export function renderStats(list, handling) {
  const figures = roadFigures(handling);
  list.replaceChildren(...metrics.map(([key,label,unit,places]) => {
    const doc = list.ownerDocument;
    const row = doc.createElement('div'), term = doc.createElement('dt'), value = doc.createElement('dd');
    term.textContent = label; value.textContent = figures[key].toFixed(places) + ' ' + unit;
    row.append(term,value); return row;
  }));
}

export function upgradePreview(currentHandling, nextHandling) {
  const current = roadFigures(currentHandling), next = roadFigures(nextHandling);
  return metrics.filter(([key]) => current[key] !== next[key]).map(([key,label,unit,places]) =>
    label + ' ' + current[key].toFixed(places) + ' → ' + next[key].toFixed(places) + ' ' + unit).join(' · ');
}
