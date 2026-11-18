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
const KINDS = {
  // What the commoner kinds of place are known for.
  american: [['Coffee', 2.5, 'pep'], ['Eggs, home fries and toast', 11, 'meal'], ['Burger deluxe', 16, 'meal'], ['Slice of pie', 6, 'meal']],
  chinese: [['Egg roll', 2.5, 'pep'], ['Pork fried rice', 8, 'meal'], ['General Tso\'s chicken combo', 12.5, 'meal'], ['Can of soda', 1.5, 'pep']],
  mediterranean: [['Chicken over rice', 9, 'meal'], ['Lamb gyro', 8, 'meal'], ['Falafel sandwich', 7, 'meal'], ['Can of soda', 1.5, 'pep']],
  mexican: [['Taco', 4.5, 'meal'], ['Burrito', 12, 'meal'], ['Chips and guacamole', 7, 'pep'], ['Horchata', 4, 'pep']],
  latin: [['Pernil with rice and beans', 12, 'meal'], ['Empanada', 3, 'pep'], ['Cafe con leche', 2.5, 'pep'], ['Morir sonando', 5, 'pep']],
  caribbean: [['Beef patty', 3.5, 'pep'], ['Jerk chicken with rice and peas', 14, 'meal'], ['Oxtail', 19, 'meal'], ['Ginger beer', 3, 'pep']],
  japanese: [['Miso soup', 3.5, 'pep'], ['Salmon roll', 8, 'meal'], ['Ramen', 17, 'meal'], ['Green tea', 3, 'pep']],
  korean: [['Kimbap', 8, 'meal'], ['Bibimbap', 16, 'meal'], ['Barley tea', 2, 'pep']],
  indian: [['Samosa', 2.5, 'pep'], ['Chicken tikka masala', 15, 'meal'], ['Mango lassi', 5, 'pep']],
  thai: [['Pad thai', 15, 'meal'], ['Green curry', 16, 'meal'], ['Thai iced tea', 5, 'pep']],
  chicken: [['Three pieces and a biscuit', 9, 'meal'], ['Wings', 11, 'meal'], ['Fries', 4, 'pep']],
  burgers: [['Cheeseburger', 8, 'meal'], ['Fries', 4.5, 'pep'], ['Shake', 6.5, 'pep']],
  sandwiches: [['Turkey hero', 11, 'meal'], ['Soup', 6, 'meal'], ['Bag of chips', 2, 'pep']],
  bakery: [['Roll with butter', 1.75, 'pep'], ['Black and white cookie', 4, 'pep'], ['Loaf of rye', 6.5, 'gift'], ['Coffee', 2.5, 'pep']],
  donuts: [['Glazed doughnut', 2, 'pep'], ['Half dozen', 10, 'meal'], ['Coffee', 2.5, 'pep']],
  bagels: [['Bagel with cream cheese', 4.5, 'meal'], ['Bagel with lox', 15, 'meal'], ['Coffee', 2.5, 'pep']],
  juice: [['Green juice', 9, 'pep'], ['Smoothie', 8.5, 'pep'], ['Acai bowl', 13, 'meal']],
  icecream: [['Cone', 6, 'pep'], ['Sundae', 9.5, 'meal']],
  italian: [['Espresso', 4, 'pep'], ['Spaghetti pomodoro', 24, 'meal'], ['Veal parmigiana', 36, 'meal']],
  steakhouse: [['Martini', 19, 'drink'], ['Strip steak', 68, 'meal'], ['Creamed spinach', 14, 'meal']],
  club: [['Cover charge', 30, 'gift'], ['Vodka soda', 18, 'drink'], ['Bottle of water', 6, 'pep']],
  supermarket: [['Bottle of water', 1.5, 'pep'], ['Rotisserie chicken', 9, 'meal'], ['Bag of groceries', 38, 'gift']],
  clothes: [['Socks', 12, 'gift'], ['T-shirt', 35, 'gift'], ['Jacket', 180, 'gift']],
  shoes: [['Laces', 5, 'gift'], ['Sneakers', 120, 'gift']],
  secondhand: [['Used watch', 60, 'gift'], ['Gold chain', 240, 'gift']], pawn: [['Used watch', 60, 'gift'], ['Gold chain', 240, 'gift']], jewelry: [['Watch battery', 15, 'gift'], ['Silver ring', 85, 'gift']],
  laundromat: [['Wash', 4.5, 'gift'], ['Dry', 2.5, 'gift'], ['Wash and fold, by the bag', 18, 'gift']], cleaners: [['Shirt, laundered', 3.5, 'gift'], ['Suit, cleaned', 18, 'gift']],
  gym: [['Day pass', 25, 'meal'], ['Bottle of water', 3, 'pep']], phones: [['Charging cable', 20, 'gift'], ['Screen repair', 90, 'gift']], electronics: [['Batteries', 9, 'gift'], ['Headphones', 45, 'gift']],
  bank: [['Cash a cheque', 2, 'gift']], postoffice: [['Book of stamps', 14.6, 'gift']], books: [['Paperback', 18, 'gift'], ['Tote bag', 20, 'gift']], florist: [['Bunch of tulips', 15, 'gift'], ['Dozen roses', 60, 'gift']],
  hardware: [['Keys cut', 4, 'gift'], ['Roll of tape', 6, 'gift']], cinema: [['Ticket', 18.5, 'gift'], ['Popcorn', 9.5, 'pep']], theatre: [['Ticket', 139, 'gift']], dispensary: [['Pre-roll', 15, 'drink']], smoke: [['Lighter', 2.5, 'gift']],
  newsstand: [['Newspaper', 3, 'gift'], ['Bottle of water', 2, 'pep'], ['Candy bar', 2, 'pep'], ['Lottery scratch-off', 2, 'lottery']], fruitstand: [['Banana', .5, 'pep'], ['Bag of oranges', 4, 'pep'], ['Cut fruit', 5, 'meal']],
  pizza: [['Slice', 3.5, 'meal'], ['Two slices and a soda', 8, 'meal'], ['Soda', 2.5, 'pep']], coffee: MENUS.cafe, pharmacy: [['Bottle of water', 2.5, 'pep'], ['Aspirin', 7, 'gift']], hotel: [['A room for the night', 280, 'sleep']] };

/** What is sold at a place: rows of { name, price, effect }; none where nothing is sold over a counter. */
export function menuFor(place) {
  return (KINDS[place.kind] || MENUS[KIND[place.kind]?.group] || []).map(([name, price, effect]) => ({ name, price, effect }));
}
/** How long a coffee or a meal keeps the player quick on their feet, in seconds. */
export const PEP = { pep: 90, meal: 240 };
/** A scratch-off's prizes and the odds of each: about three in ten pay something, and it pays back half what it costs. */
export function scratch(r) { return r < .0005 ? 200 : r < .004 ? 20 : r < .03 ? 10 : r < .1 ? 3 : r < .3 ? 2 : 0; }
