// What a place sells over its counter. The registers say what kind of place
// each is, not its prices: the menus and what they cost are the game's.
import { dishStyle,drinkStyle } from './food-catalog.js';
export {plateStyles} from './food-catalog.js';
import { KIND } from './places.js';
import { groceries, groceryPrice, groceryStore } from './grocery-stock.js';
import { fittingStock } from './shop-stock.js';

// Each list starts with what every such place has; the rest of it is what one
// place or another also makes. A place offers the staples and a share of the rest.
const pool=(staples,rows)=>Object.assign(rows,{staples});
const MENUS = {
  bodega: pool(5,[['Coffee, regular', 1.5, 'pep'], ['Bacon, egg and cheese', 5.5, 'meal'], ['Chopped cheese', 7, 'meal'], ['Lottery scratch-off', 2, 'lottery'], ['Bottle of water', 2, 'pep'],
    ['Egg and cheese on a roll', 4.5, 'meal'], ['Chicken cutlet hero', 9, 'meal'], ['Roll with butter', 1.5, 'pep']]),
  market: [['Bottle of water', 2, 'pep'], ['Fruit', 3, 'pep'], ['Sandwich from the deli counter', 9, 'meal']],
  cafe: pool(4,[['Coffee', 3.5, 'pep'], ['Iced coffee', 4.5, 'pep'], ['Bagel with cream cheese', 4.5, 'meal'], ['Pastry', 4, 'meal'],
    ['Latte', 5, 'pep'], ['Cappuccino', 5, 'pep'], ['Espresso', 3.5, 'pep'], ['Matcha latte', 6, 'pep'], ['Hot chocolate', 4.5, 'pep'], ['Tea', 3, 'pep'],
    ['Blueberry muffin', 4, 'pep'], ['Avocado toast', 12, 'meal'], ['Chocolate chip cookie', 3.5, 'pep']]),
  food: [['Slice or small plate', 4, 'meal'], ['Lunch special', 12, 'meal'], ['Soda', 2.5, 'pep']],
  dining: [['Lunch', 28, 'meal'], ['Dinner', 55, 'meal'], ['Coffee', 4, 'pep']],
  bar: pool(3,[['Beer', 8, 'drink'], ['Cocktail', 16, 'drink'], ['Soda', 3, 'pep'],
    ['Old fashioned', 16, 'drink'], ['Margarita', 15, 'drink'], ['Glass of red wine', 13, 'drink'], ['Whiskey', 12, 'drink'], ['Mozzarella sticks', 10, 'meal'], ['Sliders', 14, 'meal'], ['Fries', 6, 'pep']]),
  liquor: [['Bottle of wine', 15, 'gift']],
  beauty: [['Manicure', 20, 'groom'], ['Haircut and style', 65, 'groom']],
  barber: [['Haircut', 30, 'groom'], ['Shave', 20, 'groom']],
};
const KINDS = {
  tailor: [['Trouser hem', 18, 'gift'], ['Button replacement', 5, 'gift']],
  copyshop: [['Black and white copies', 1, 'gift'], ['Color print', 2, 'gift'], ['Padded mailer', 3, 'gift']],
  repair: [['Tyre pressure gauge', 8, 'gift'], ['Shop towel', 3, 'gift']],
  bodyshop: [['Microfiber cloth', 5, 'gift'], ['Polishing compound', 12, 'gift']],
  american: pool(4,[['Coffee', 2.5, 'pep'], ['Eggs, home fries and toast', 11, 'meal'], ['Burger deluxe', 16, 'meal'], ['Slice of pie', 6, 'meal'],
    ['Pancakes', 13, 'meal'], ['Western omelette', 14, 'meal'], ['Turkey club', 16, 'meal'], ['Grilled cheese', 9, 'meal'], ['Meatloaf', 19, 'meal'], ['Caesar salad', 13, 'meal'], ['Cheesecake', 8, 'pep'], ['Shake', 7, 'pep']]),
  chinese: pool(4,[['Egg roll', 2.5, 'pep'], ['Pork fried rice', 8, 'meal'], ['General Tso\'s chicken combo', 12.5, 'meal'], ['Spring rolls', 4.5, 'meal'],
    ['Can of soda', 1.5, 'pep'], ['Chicken lo mein', 10.5, 'meal'], ['Beef with broccoli', 13.5, 'meal'], ['Pork dumplings', 8, 'meal'], ['Wonton soup', 5.5, 'meal'], ['Roast pork bun', 2.5, 'pep'], ['Hot tea', 1.5, 'pep']]),
  mediterranean: pool(3,[['Chicken over rice', 9, 'meal'], ['Lamb gyro', 8, 'meal'], ['Falafel sandwich', 7, 'meal'],
    ['Can of soda', 1.5, 'pep'], ['Lamb over rice', 10, 'meal'], ['Chicken shawarma', 9, 'meal'], ['Hummus and pita', 7, 'meal'], ['Greek salad', 9, 'meal'], ['Spinach pie', 5, 'meal'], ['Baklava', 4, 'pep'], ['Lemonade', 3, 'pep']]),
  mexican: pool(3,[['Taco', 4.5, 'meal'], ['Burrito', 12, 'meal'], ['Chips and guacamole', 7, 'pep'],
    ['Horchata', 4, 'pep'], ['Carnitas tacos', 13, 'meal'], ['Quesadilla', 11, 'meal'], ['Nachos', 12, 'meal'], ['Elote', 5, 'pep'], ['Tamales', 8, 'meal'], ['Churros', 5, 'pep'], ['Agua de jamaica', 4, 'pep'], ['Bottle of soda', 3.5, 'pep']]),
  latin: pool(3,[['Pernil with rice and beans', 12, 'meal'], ['Empanada', 3, 'pep'], ['Cafe con leche', 2.5, 'pep'],
    ['Morir sonando', 5, 'pep'], ['Pollo guisado', 12, 'meal'], ['Mofongo', 15, 'meal'], ['Cubano', 11, 'meal'], ['Tostones', 5, 'pep'], ['Sweet plantains', 5, 'pep'], ['Arepa', 8, 'meal'], ['Flan', 5, 'pep']]),
  caribbean: pool(3,[['Beef patty', 3.5, 'pep'], ['Jerk chicken with rice and peas', 14, 'meal'], ['Oxtail', 19, 'meal'],
    ['Ginger beer', 3, 'pep'], ['Curry goat', 17, 'meal'], ['Doubles', 4, 'pep'], ['Chicken roti', 12, 'meal'], ['Festival', 3, 'pep'], ['Sorrel', 4, 'pep']]),
  bbq: pool(3,[['Cornbread', 4, 'meal'], ['Barbecue ribs with slaw', 24, 'meal'], ['Soda', 2.5, 'pep'],
    ['Brisket plate', 22, 'meal'], ['Pulled pork sandwich', 14, 'meal'], ['Mac and cheese', 7, 'meal'], ['Collard greens', 6, 'pep'], ['Banana pudding', 6, 'pep'], ['Sweet tea', 3, 'pep'], ['Beer', 7, 'drink']]),
  kosher: pool(3,[['Potato knish', 5, 'meal'], ['Pastrami on rye', 24, 'meal'], ['Can of soda', 2.5, 'pep'],
    ['Matzo ball soup', 9, 'meal'], ['Corned beef Reuben', 23, 'meal'], ['Potato latkes', 9, 'meal'], ['Hot dog', 5, 'meal'], ['Half-sour pickles', 4, 'pep'], ['Egg cream', 4.5, 'pep']]),
  asian: pool(3,[['Scallion pancake', 7, 'meal'], ['Vegetable stir-fry', 13, 'meal'], ['Soda', 2.5, 'pep'],
    ['Pho', 14, 'meal'], ['Banh mi', 9.5, 'meal'], ['Summer rolls', 7.5, 'meal'], ['Pork dumplings', 8, 'meal'], ['Bubble tea', 6, 'pep'], ['Vietnamese iced coffee', 5, 'pep']]),
  african: pool(3,[['Fried plantains', 6, 'meal'], ['Jollof rice with chicken', 15, 'meal'], ['Soda', 2.5, 'pep'],
    ['Suya', 12, 'meal'], ['Egusi with fufu', 16, 'meal'], ['Injera platter', 18, 'meal'], ['Meat pie', 4, 'pep'], ['Puff puff', 4, 'pep'], ['Bissap', 4, 'pep']]),
  japanese: pool(4,[['Miso soup', 3.5, 'pep'], ['Salmon roll', 8, 'meal'], ['Ramen', 17, 'meal'], ['Green tea', 3, 'pep'],
    ['Nigiri set', 18, 'meal'], ['Chicken katsu curry', 15, 'meal'], ['Gyoza', 7, 'meal'], ['Shrimp tempura', 11, 'meal'], ['Edamame', 5, 'pep'], ['Onigiri', 4, 'pep'], ['Mochi', 5, 'pep'], ['Sake', 9, 'drink']]),
  korean: pool(3,[['Kimbap', 8, 'meal'], ['Bibimbap', 16, 'meal'], ['Barley tea', 2, 'pep'],
    ['Korean fried chicken', 14, 'meal'], ['Bulgogi', 18, 'meal'], ['Tteokbokki', 10, 'meal'], ['Kimchi stew', 14, 'meal'], ['Japchae', 13, 'meal'], ['Soju', 12, 'drink']]),
  indian: pool(3,[['Samosa', 2.5, 'pep'], ['Chicken tikka masala', 15, 'meal'], ['Mango lassi', 5, 'pep'],
    ['Saag paneer', 14, 'meal'], ['Chicken biryani', 15, 'meal'], ['Garlic naan', 4, 'pep'], ['Masala dosa', 12, 'meal'], ['Chana masala', 12, 'meal'], ['Gulab jamun', 5, 'pep'], ['Masala chai', 3, 'pep']]),
  thai: pool(3,[['Pad thai', 15, 'meal'], ['Green curry', 16, 'meal'], ['Thai iced tea', 5, 'pep'],
    ['Tom yum soup', 8, 'meal'], ['Papaya salad', 10, 'meal'], ['Chicken satay', 9, 'meal'], ['Mango sticky rice', 8, 'pep'], ['Beer', 7, 'drink']]),
  chicken: pool(3,[['Three pieces and a biscuit', 9, 'meal'], ['Wings', 11, 'meal'], ['Fries', 4, 'pep'],
    ['Chicken sandwich', 7, 'meal'], ['Tenders', 8, 'meal'], ['Mac and cheese', 4.5, 'meal'], ['Coleslaw', 3, 'pep'], ['Lemonade', 3, 'pep'], ['Soda', 2.5, 'pep']]),
  burgers: pool(3,[['Cheeseburger', 8, 'meal'], ['Fries', 4.5, 'pep'], ['Shake', 6.5, 'pep'],
    ['Double cheeseburger', 11, 'meal'], ['Bacon burger', 10.5, 'meal'], ['Hot dog', 5, 'meal'], ['Onion rings', 5, 'pep'], ['Soda', 2.5, 'pep']]),
  sandwiches: pool(3,[['Turkey hero', 11, 'meal'], ['Soup', 6, 'meal'], ['Bag of chips', 2, 'pep'],
    ['Italian hero', 12, 'meal'], ['Chicken cutlet hero', 11.5, 'meal'], ['Grilled cheese', 7, 'meal'], ['BLT', 9, 'meal'], ['Chocolate chip cookie', 3, 'pep'], ['Can of soda', 2, 'pep'], ['Iced tea', 3, 'pep']]),
  bakery: pool(4,[['Roll with butter', 1.75, 'pep'], ['Black and white cookie', 4, 'pep'], ['Loaf of rye', 6.5, 'gift'], ['Coffee', 2.5, 'pep'],
    ['Croissant', 4, 'pep'], ['Cheesecake', 7, 'pep'], ['Cannoli', 5, 'pep'], ['Cupcake', 4.5, 'pep'], ['Rugelach', 4, 'pep'], ['Challah', 9, 'gift'], ['Chocolate babka', 14, 'gift']]),
  donuts: pool(3,[['Glazed doughnut', 2, 'pep'], ['Half dozen', 10, 'meal'], ['Coffee', 2.5, 'pep'],
    ['Chocolate frosted doughnut', 2.5, 'pep'], ['Sprinkle doughnut', 2.5, 'pep'], ['Jelly doughnut', 2.75, 'pep'], ['Boston cream', 3, 'pep'], ['Blueberry muffin', 3.5, 'pep'], ['Iced coffee', 3.5, 'pep']]),
  bagels: pool(3,[['Bagel with cream cheese', 4.5, 'meal'], ['Bagel with lox', 15, 'meal'], ['Coffee', 2.5, 'pep'],
    ['Everything bagel with butter', 3, 'meal'], ['Bacon, egg and cheese on a bagel', 7.5, 'meal'], ['Bialy', 2.5, 'pep'], ['Orange juice', 4.5, 'pep']]),
  juice: pool(3,[['Green juice', 9, 'pep'], ['Smoothie', 8.5, 'pep'], ['Acai bowl', 13, 'meal'],
    ['Orange juice', 6, 'pep'], ['Carrot juice', 8, 'pep'], ['Wheatgrass shot', 4, 'pep'], ['Avocado toast', 11, 'meal'], ['Fruit cup', 6, 'pep']]),
  icecream: pool(2,[['Cone', 6, 'pep'], ['Sundae', 9.5, 'meal'],
    ['Soft serve', 5, 'pep'], ['Two scoops in a cup', 7.5, 'pep'], ['Banana split', 12, 'meal'], ['Ice cream sandwich', 5, 'pep'], ['Italian ice', 4, 'pep'], ['Shake', 7, 'pep']]),
  italian: pool(3,[['Espresso', 4, 'pep'], ['Spaghetti pomodoro', 24, 'meal'], ['Veal parmigiana', 36, 'meal'],
    ['Spaghetti and meatballs', 26, 'meal'], ['Lasagna', 27, 'meal'], ['Fettuccine Alfredo', 25, 'meal'], ['Margherita pizza', 21, 'meal'], ['Caprese salad', 16, 'meal'], ['Fried calamari', 18, 'meal'], ['Tiramisu', 11, 'pep'], ['Cannoli', 8, 'pep'], ['Glass of red wine', 14, 'drink']]),
  french: pool(3,[['Quiche Lorraine', 19, 'meal'], ['Steak frites', 38, 'meal'], ['Coffee', 4, 'pep'],
    ['French onion soup', 14, 'meal'], ['Croque monsieur', 18, 'meal'], ['Moules frites', 27, 'meal'], ['Duck confit', 34, 'meal'], ['Creme brulee', 12, 'pep'], ['Crepe', 12, 'pep'], ['Glass of red wine', 15, 'drink']]),
  seafood: pool(3,[['Fish sandwich', 17, 'meal'], ['Grilled salmon with potatoes', 32, 'meal'], ['Coffee', 4, 'pep'],
    ['Fish and chips', 22, 'meal'], ['Lobster roll', 34, 'meal'], ['Oysters on the half shell', 21, 'meal'], ['Clam chowder', 11, 'meal'], ['Fried calamari', 17, 'meal'], ['Shrimp cocktail', 19, 'meal'], ['Steamed lobster', 48, 'meal'], ['Glass of white wine', 14, 'drink']]),
  european: pool(3,[['Mushroom soup', 11, 'meal'], ['Roast chicken with potatoes', 26, 'meal'], ['Coffee', 4, 'pep'],
    ['Pierogi', 14, 'meal'], ['Bratwurst with sauerkraut', 16, 'meal'], ['Schnitzel', 24, 'meal'], ['Borscht', 10, 'meal'], ['Goulash', 21, 'meal'], ['Apple strudel', 9, 'pep'], ['Beer', 8, 'drink']]),
  steakhouse: pool(3,[['Martini', 19, 'drink'], ['Strip steak', 68, 'meal'], ['Creamed spinach', 14, 'meal'],
    ['Ribeye', 74, 'meal'], ['Wedge salad', 16, 'meal'], ['Shrimp cocktail', 24, 'meal'], ['Baked potato', 12, 'meal'], ['Thick-cut bacon', 18, 'meal'], ['Cheesecake', 14, 'pep'], ['Glass of red wine', 18, 'drink'], ['Old fashioned', 19, 'drink']]),
  pub: pool(3,[['Beer', 8, 'drink'], ['Stout', 9, 'drink'], ['Soda', 3, 'pep'],
    ['Wings', 13, 'meal'], ['Pub burger', 17, 'meal'], ['Fish and chips', 19, 'meal'], ['Nachos', 13, 'meal'], ['Soft pretzel', 7, 'pep'], ['Shepherd\'s pie', 18, 'meal'], ['Whiskey', 12, 'drink']]),
  club: pool(3,[['Cover charge', 30, 'gift'], ['Vodka soda', 18, 'drink'], ['Bottle of water', 6, 'pep'], ['Champagne', 22, 'drink'], ['Tequila shot', 12, 'drink'], ['Mojito', 18, 'drink']]),
  supermarket: [['Bottle of water', 1.5, 'pep'], ['Rotisserie chicken', 9, 'meal'], ['Bag of groceries', 38, 'gift']],
  clothes: [['Socks', 12, 'gift'], ['T-shirt', 35, 'gift'], ['Jacket', 180, 'gift']],
  shoes: [['Laces', 5, 'gift'], ['Sneakers', 120, 'gift']],
  secondhand: [['Used watch', 60, 'gift'], ['Gold chain', 240, 'gift']], pawn: [['Used watch', 60, 'gift'], ['Gold chain', 240, 'gift']], jewelry: [['Watch battery', 15, 'gift'], ['Silver ring', 85, 'gift']],
  laundromat: [['Wash', 4.5, 'gift'], ['Dry', 2.5, 'gift'], ['Wash and fold, by the bag', 18, 'gift']], cleaners: [['Shirt, laundered', 3.5, 'gift'], ['Suit, cleaned', 18, 'gift']],
  gym: [['Day pass', 25, 'meal'], ['Bottle of water', 3, 'pep'], ['Protein shake', 8, 'pep']], phones: [['Charging cable', 20, 'gift'], ['Screen repair', 90, 'gift']], electronics: [['Batteries', 9, 'gift'], ['Headphones', 45, 'gift']],
  bank: [['Cash a cheque', 2, 'gift']], postoffice: [['Book of stamps', 14.6, 'gift']], books: [['Paperback', 18, 'gift'], ['Tote bag', 20, 'gift']], florist: [['Bunch of tulips', 15, 'gift'], ['Dozen roses', 60, 'gift']],
  hardware: [['Keys cut', 4, 'gift'], ['Roll of tape', 6, 'gift']], cinema: [['Ticket', 18.5, 'gift'], ['Popcorn', 9.5, 'pep'], ['Soda', 6.5, 'pep'], ['Nachos', 8.5, 'meal'], ['Hot dog', 7.5, 'meal'], ['Candy bar', 5, 'pep']], theatre: [['Ticket', 139, 'gift']], dispensary: [['Pre-roll', 15, 'drink']], smoke: [['Lighter', 2.5, 'gift']],
  newsstand: [['Newspaper', 3, 'gift'], ['Bottle of water', 2, 'pep'], ['Candy bar', 2, 'pep'], ['Lottery scratch-off', 2, 'lottery'], ['Bag of chips', 2, 'pep'], ['Can of soda', 2, 'pep']], fruitstand: [['Banana', .5, 'pep'], ['Bag of oranges', 4, 'pep'], ['Cut fruit', 5, 'meal'], ['Apple', 1, 'pep'], ['Mango with chili', 6, 'pep']],
  pizza: pool(3,[['Slice', 3.5, 'meal'], ['Two slices and a soda', 8, 'meal'], ['Soda', 2.5, 'pep'],
    ['Pepperoni slice', 4.25, 'meal'], ['Sicilian slice', 4.5, 'meal'], ['White slice', 4.5, 'meal'], ['Garlic knots', 4, 'pep'], ['Calzone', 9, 'meal'], ['Margherita pie', 18, 'meal'], ['Can of soda', 1.5, 'pep']]), coffee: MENUS.cafe, pharmacy: [['Bottle of water', 2.5, 'pep'], ['Aspirin', 7, 'gift']], hotel: [['A room for the night', 280, 'sleep']] };


// A place makes its own choice from the rest of the list: the same one every visit.
const OFFERED=5;
function offered(rows,place){
  const staples=rows.staples??rows.length;
  if(place.id==null || rows.length<=staples+OFFERED)return rows;
  let h=2166136261;for(const c of String(place.id))h=Math.imul(h^c.charCodeAt(0),16777619);
  const rest=rows.slice(staples).map((row,i)=>[Math.imul(h^Math.imul(i+1,0x9e3779b1),0x85ebca6b)>>>0,i]).sort((a,b)=>a[0]-b[0]).slice(0,OFFERED).map(([,i])=>i).sort((a,b)=>a-b);
  return [...rows.slice(0,staples),...rest.map(i=>rows[staples+i])];
}
// Kitchens that once sold under a generic heading still honour orders saved under it.
const HEADINGS={'slice-or-small-plate':0,'lunch-special':1,lunch:0,dinner:1};
/** The row an older save means by a heading or a position on the menu of this kind of place. */
export function legacyDish(kind,key){
  const rows=KINDS[kind] || MENUS[KIND[kind]?.group],at=/^\d+$/.test(key)?Number(key):HEADINGS[key];
  const row=rows?.[at];
  return row?{name:row[0],price:row[1],effect:row[2]}:null;
}
/**
 * What is sold at a place: rows of { name, price, effect }; none where nothing
 * is sold over a counter. Asked of a kind alone, it is everything such places sell.
 */
export function menuFor(place) {
  const stock=fittingStock(place);
  const extras=offered(KINDS[place.kind] || MENUS[KIND[place.kind]?.group] || [],place).map(([name, price, effect]) => ({ name, price, effect }));
  const replaced = new Set(['Haircut','Haircut and style','T-shirt','Sneakers','Silver ring']);
  if(groceryStore(place))return [...Object.values(groceries).map(p=>({name:p.name,price:groceryPrice(place,p),effect:p.effect,product:p.id})),...extras.filter(i=>!['Bottle of water','Fruit','Bag of groceries'].includes(i.name))];
  return [...stock.map(item=>({effect:'gift',...item})), ...extras.filter(item=>!stock.length || !replaced.has(item.name))];
}
// The kitchen pass, server and table all show the same preparation.
export const plateStyle=name=>dishStyle(name)||'entree';
export function carriedOrder(item) {
  if(item.product)return item.product;
  if(drinkStyle(item.name))return 'cup';
  return dishStyle(item.name)?'tray':null;
}
/** How long a coffee or a meal keeps the player quick on their feet, in seconds. */
export const PEP = { pep: 90, meal: 240 };
/** A scratch-off's prizes and the odds of each: about three in ten pay something, and it pays back half what it costs. */
export function scratch(r) { return r < .0005 ? 200 : r < .004 ? 20 : r < .03 ? 10 : r < .1 ? 3 : r < .3 ? 2 : 0; }
