// What a place sells over its counter. The registers say what kind of place
// each is, not its prices: the menus and what they cost are the game's.
import { KIND } from './places.js';

const MENUS = {
  bodega: [['Coffee, regular', 1.5, 'pep'], ['Bacon, egg and cheese', 5.5, 'meal'], ['Chopped cheese', 7, 'meal'], ['Lottery scratch-off', 2, 'lottery'], ['Bottle of water', 2, 'pep']],
  market: [['Bottle of water', 2, 'pep'], ['Fruit', 3, 'pep'], ['Sandwich from the deli counter', 9, 'meal']],
  cafe: [['Coffee', 3.5, 'pep'], ['Iced coffee', 4.5, 'pep'], ['Bagel with cream cheese', 4.5, 'meal'], ['Pastry', 4, 'meal']],
  food: [['Slice or small plate', 4, 'meal'], ['Lunch special', 12, 'meal'], ['Soda', 2.5, 'pep']],
  dining: [['Lunch', 28, 'meal'], ['Dinner', 55, 'meal'], ['Coffee', 4, 'pep']],
  bar: [['Beer', 8, 'drink'], ['Cocktail', 16, 'drink'], ['Soda', 3, 'pep']],
  liquor: [['Bottle of wine', 15, 'gift']],
  beauty: [['Manicure', 20, 'groom'], ['Haircut and style', 65, 'groom']],
  barber: [['Haircut', 30, 'groom'], ['Shave', 20, 'groom']],
};
const KINDS = { newsstand: [['Newspaper', 3, 'gift'], ['Bottle of water', 2, 'pep'], ['Candy bar', 2, 'pep'], ['Lottery scratch-off', 2, 'lottery']], fruitstand: [['Banana', .5, 'pep'], ['Bag of oranges', 4, 'pep'], ['Cut fruit', 5, 'meal']],
  pizza: [['Slice', 3.5, 'meal'], ['Two slices and a soda', 8, 'meal'], ['Soda', 2.5, 'pep']], coffee: MENUS.cafe, pharmacy: [['Bottle of water', 2.5, 'pep'], ['Aspirin', 7, 'gift']], hotel: [['A room for the night', 280, 'sleep']] };

/** What is sold at a place: rows of { name, price, effect }; none where nothing is sold over a counter. */
export function menuFor(place) {
  return (KINDS[place.kind] || MENUS[KIND[place.kind]?.group] || []).map(([name, price, effect]) => ({ name, price, effect }));
}
/** How long a coffee or a meal keeps the player quick on their feet, in seconds. */
export const PEP = { pep: 90, meal: 240 };
/** A scratch-off's prizes and the odds of each: about three in ten pay something, and it pays back half what it costs. */
export function scratch(r) { return r < .0005 ? 200 : r < .004 ? 20 : r < .03 ? 10 : r < .1 ? 3 : r < .3 ? 2 : 0; }
