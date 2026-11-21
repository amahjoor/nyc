import {counterMenu} from './counter-menu.js';
import {checkoutScreens,checkoutDrawer} from './checkout-display.js';
import {checkoutAxes} from './checkout-model.js';
import { viewHand } from './view-hand.js';
import { ingredientMap } from './food-surface.js';
import { buildGroceryDisplays } from './grocery-models.js';
import { buildPharmacyPrint } from './pharmacy-display.js';
import { buildShopPrint } from './shop-prints.js';
import { buildSalonMirrors } from './salon-mirrors.js';
// Going inside.
//
// No register holds the inside of a shop. A place's room is laid out by the
// game: as wide as its street front, as deep as its building allows, and
// furnished for its trade (see STYLE_OF). A place's name can also determine
// its fittings: a cycling studio and a Planet Fitness have different floors.
// The room is a box built behind the place's front wall. From inside, the
// street is seen through the doorway and the two windows in that wall.
import * as THREE from './vendor/three.module.min.js';
import { KIND, placeName } from './places.js';
import { CEILING, roomPoint, DOOR, ShopDoor } from './room.js';
import { roomProps, furnishRoom, OWN_STYLE_OF } from './room-props.js';
import { planRegister } from './register.js';
import { SHOP_WINDOW_GLSL } from './shop-window.js';
import { buildRoomFinish, lightRoomSurface } from './room-finish.js';
import { menuFor } from './menu.js';
import { openServiceWay } from './service-way.js';
import { KITCHEN_FIXTURES } from './kitchen-fixtures.js';
const KITCHEN_SHAPES=new Set(Object.keys(KITCHEN_FIXTURES));

/** Kinds of place with a room to walk into, by group. */
const ROOMS = { bodega: 'shop', market: 'shop', liquor: 'shop', shop: 'shop', food: 'eat', cafe: 'eat', dining: 'eat', bar: 'bar', beauty: 'chairs', barber: 'chairs', hotel: 'lobby', public: 'lobby' };
export const roomKind = place => ['gas', 'parking', 'storage', 'ferry'].includes(place.kind) ? null : ROOMS[KIND[place.kind]?.group] || null;

/** The manner of room each kind of place has. Kinds not named take the plain room of their group. */
export const STYLE_OF = {
  american: 'diner', european: 'diner', latin: 'steamtable', caribbean: 'steamtable', african: 'steamtable', kosher: 'steamtable',
  italian: 'fine', french: 'fine', seafood: 'fine', steakhouse: 'fine',
  chinese: 'takeout', chicken: 'takeout', burgers: 'takeout', sandwiches: 'takeout', indian: 'takeout', thai: 'takeout', asian: 'takeout', mexican: 'takeout', bbq: 'takeout',
  pizza: 'pizza', mediterranean: 'halal', japanese: 'sushi', korean: 'sushi', coffee: 'coffee', juice: 'coffee', bakery: 'bakery', donuts: 'bakery', bagels: 'bakery', icecream: 'bakery',
  bar: 'bar', pub: 'bar', club: 'club',
  bodega: 'bodega', grocery: 'market', supermarket: 'market', butcher: 'market', fishmarket: 'market', produce: 'market', liquor: 'liquor',
  clothes: 'clothes', shoes: 'clothes', department: 'clothes', sports: 'clothes', bags: 'clothes', tailor: 'clothes', cosmetics: 'clothes',
  secondhand: 'cases', pawn: 'cases', jewelry: 'cases', optician: 'cases', pharmacy: 'aisles', variety: 'aisles', hardware: 'aisles', pets: 'aisles', stationery: 'aisles', toys: 'aisles', housewares: 'aisles',
  bank: 'bank', cleaners: 'cleaners', phones: 'tech', electronics: 'tech',
  clinic: 'waiting', dentist: 'waiting', vet: 'waiting', massage: 'waiting', travel: 'waiting',
  salon: 'salon', nails: 'nails', barber: 'barber', tattoo: 'barber',
  hotel: 'hotel', cinema: 'cinema', theatre: 'cinema',
};
// Trades with fittings of their own (room-props.js): a jeweller is not a pawnbroker, nor a butcher a supermarket.
Object.assign(STYLE_OF, OWN_STYLE_OF);
const PLAIN = { shop: 'store', eat: 'diner', bar: 'bar', chairs: 'salon', lobby: 'lobby' };
/** The manner of room a place has, or null if it has none. */
export const roomStyle = place => { const kind = roomKind(place); return kind ? STYLE_OF[place.kind] || PLAIN[kind] : null; };

export { CEILING };
const hashOf = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h ^ (h >>> 15)) >>> 0; };

const WOOD = '#6b4a32', STEEL = '#8d9498', DARK = '#23272b', WHITE = '#e6e3da', GLASS = '#a9cbd8', BLACK = '#17191b';
const GOODS = ['#c8452e', '#e0b23a', '#3f7d4e', '#2f5f9e', '#d9d4c2', '#8a4b9e', '#e07b2a', '#3aa0a0'];
const CLOTH = ['#1f2a44', '#7a1f2a', '#d9d2c0', '#2f5a45', '#c9a23f', '#3a3a40', '#b65a7a', '#5f7fa8'];

// Each manner of room, furnished with what the tools below put down. `r` is
// the room being made: its half-width, depth, the place's own number, and
// add / seat / staff / panel to put things in it.
const STYLES = {
  // A deli grocery: the counter and till by the door, coolers along one wall, aisles of shelves, the drinks at the back.
  bodega(r) {
    r.floor = '#9a968c';
    r.add(-r.half + 1.3, 1.9, 2.2, .7, 1.0, WOOD); r.add(-r.half + 1.3, 1.9, .5, .4, .35, DARK, 1.0, false); r.staff(-r.half + 1.3, 1.15, 0, 1);
    // Lottery and cigarettes behind the till, the grill and its hood beside it.
    r.panel(-1, 1.2, 1.6, 1.3, 1.0, '#e0b23a'); r.add(-r.half + .35, 3.2, .6, 1.2, .9, STEEL); r.add(-r.half + .35, 3.2, .62, 1.2, .3, '#5d6468', 1.9, false);
    r.shelves(1, 2.6, r.depth - 1.6, '#d7dde0', ['#7fb0c9', '#bcd6e4', '#7fb0c9']);
    r.aisles(-r.half + 2.4, r.half - 1.5, 4.2, r.depth - 1.6, 2.1);
    r.add(0, r.depth - .45, r.width - .6, .7, 2.1, '#cfd6da'); r.add(0, r.depth - .82, r.width - .8, .04, 1.5, '#7fb0c9', .4, false);
    r.add(r.half - .35, 1.9, .6, .5, 1.5, '#2f3a46');
  },
  // A grocery or supermarket: produce by the door, checkouts, long aisles, the meat and dairy cases at the back.
  market(r) {
    r.floor = '#b9b5a8'; r.wall = '#e4e0d2';
    for (const lane of [-1, 1]) { const a = lane * Math.min(1.9, r.half - 1.4); r.add(a + lane * .1, 2.4, .7, 1.6, .9, '#4a6a54'); r.add(a + lane * .1, 1.9, .3, .3, .3, DARK, .9, false); }
    r.staff(Math.min(1.9, r.half - 1.4) + .85, 2.4, -1, 0);
    for (let i = 0; i < 3; i++) { r.add(-r.half + .6, 3.6 + i * 1.3, 1.0, 1.1, .7, '#6a5a3a'); r.add(-r.half + .6, 3.6 + i * 1.3, .9, 1.0, .18, ['#d23a2a', '#4f9a3a', '#ee7a22'][(r.seed + i) % 3], .7, false); }
    r.aisles(-r.half + 2.2, r.half - .7, 4.4, r.depth - 1.7, 1.9);
    r.add(0, r.depth - .5, r.width - .6, .8, 1.0, '#e9edf0'); r.add(0, r.depth - .5, r.width - .8, .7, .25, '#b0303a', 1.0, false); r.panel(0, 0, r.width - 1.2, .5, 2.3, '#2f6b3a');
  },
  // Wine and liquor: bottles on every wall, bins down the middle, the counter behind a screen by the door.
  liquor(r) {
    r.floor = '#5a4636'; r.wall = '#cdbf9f';
    r.add(-r.half + 1.3, 1.9, 2.2, .7, 1.05, WOOD); r.add(-r.half + 1.3, 2.22, 2.2, .04, 1.2, GLASS, 1.05, false); r.staff(-r.half + 1.3, 1.15, 0, 1);
    r.shelves(-1, 3.2, r.depth - .5, '#3a2a1e', ['#2f5a3a', '#7a1f2a', '#c9a23f', '#3a2a1e']); r.shelves(1, 1.2, r.depth - .5, '#3a2a1e', ['#7a1f2a', '#2f5a3a', '#d9d2c0', '#c9a23f']);
    for (let b = 4.2; b < r.depth - 1.6; b += 1.7) { r.add(0, b, 1.5, .9, .75, '#4a3626'); r.add(0, b, 1.4, .8, .22, ['#2f5a3a', '#7a1f2a', '#c9a23f'][(r.seed + Math.round(b)) % 3], .75, false); }
  },
  // Any other shop: goods on the walls and on tables, the till at the back.
  store(r) {
    r.shelves(-1, 1.4, r.depth - 2.4, '#b8b2a4', GOODS); r.shelves(1, 1.4, r.depth - 2.4, '#b8b2a4', GOODS.slice(3).concat(GOODS));
    for (let b = 3.4; b < r.depth - 3; b += 2.2) { r.add(0, b, Math.min(2.2, r.width - 3.4), 1.0, .8, WOOD); r.add(0, b, Math.min(2.0, r.width - 3.6), .8, .16, GOODS[(r.seed + Math.round(b)) % GOODS.length], .8, false); }
    r.add(0, r.depth - 1.5, Math.min(3, r.width - 2), .7, 1.0, WOOD); r.staff(0, r.depth - .8, 0, -1);
  },
  // A chemist's, a discount store, a hardware shop: rows of shelves, and a counter across the back with what is kept behind it.
  aisles(r) {
    r.floor = '#c6c2b6'; r.wall = '#eceade';
    r.add(-r.half + 1.2, 1.9, 2.0, .7, 1.0, WHITE); r.staff(-r.half + 1.2, 1.15, 0, 1);
    r.aisles(-r.half + 1.0, r.half - .7, 3.6, r.depth - 2.8, 1.8);
    r.add(0, r.depth - 1.5, r.width - 1.4, .7, 1.15, WHITE); r.add(0, r.depth - .3, r.width - .4, .5, 2.2, '#dfe5e8'); r.panel(0, 0, r.width - 1.6, .45, 2.4, '#b0303a', .56); r.staff(0, r.depth - .9, 0, -1);
  },
  // A pawnbroker, a jeweller, a buy-and-sell: glass cases round three sides, what is too big for them on the wall behind.
  cases(r) {
    r.floor = '#4a4a4e'; r.wall = '#d9d4c6';
    const run = Math.max(2, r.depth - 3.6);
    for (const side of [-1, 1]) { r.add(side * (r.half - 1.45), 2.2 + run / 2, .6, run, .85, '#2a2c30'); r.add(side * (r.half - 1.45), 2.2 + run / 2, .56, run - .1, .3, GLASS, .85, false); r.shelves(side, 2.2, 2.2 + run, '#3a3a3e', ['#c9a23f', '#b8bcc0', '#2f5f9e', '#7a1f2a']); }
    r.add(0, r.depth - 1.5, r.width - 3.4, .6, .85, '#2a2c30'); r.add(0, r.depth - 1.5, r.width - 3.5, .56, .3, GLASS, .85, false);
    r.staff(0, r.depth - .8, 0, -1); r.staff(-(r.half - .65), 2.2 + run / 2, 1, 0);
    r.panel(0, 0, r.width - 2, .9, 1.7, '#c9a23f');
  },
  // Dry cleaners: a counter across the room, and the clothes in their bags on a rail behind it.
  cleaners(r) {
    r.floor = '#9c988c'; r.wall = '#e9e6dc';
    const back = Math.min(r.depth - 1.2, 4.2);
    r.add(0, back - 1.2, r.width - 1.6, .7, 1.05, WHITE); r.staff(0, back - .5, 0, -1);
    for (let row = 0; row * .7 + back + .3 < r.depth - .3; row++) { const b = back + .3 + row * .7; r.add(0, b, r.width - .6, .05, .04, STEEL, 2.0, false); for (let a = -r.half + .5; a < r.half - .4; a += .34) r.add(a, b, .28, .1, 1.2, row % 2 ? '#dfe6ea' : CLOTH[(r.seed + Math.round(a * 3)) % CLOTH.length], .78, false); }
    r.add(-r.half + .7, 1.6, .5, 1.6, .45, '#3f4a5a');
  },
  // Take-out: the counter straight ahead under a lit menu, the kitchen behind it, a fridge of drinks, a few seats.
  takeout(r) {
    r.floor = '#b5aa94'; r.wall = '#efe6cf'; r.light = { color: 0xfff6e0, power: 75 };
    const back = Math.min(r.depth - 2.2, 5.2), tone = ['#c81e1e', '#e07b12', '#0b6b2f', '#b01515'][r.seed % 4];
    r.add(.34, back, r.width - 1.9, .7, 1.1, tone); r.add(.34, back, r.width - 1.8, .8, .05, STEEL, 1.1, false); r.add(r.half - 1.6, back - .1, .5, .4, .32, DARK, 1.15, false);
    r.staff(Math.min(1, r.half - 1.6), back + .75, 0, -1);
    r.boardAt = back + .1;
    r.add(0, r.depth - .3, r.width - .4, .5, 2.0, '#b9bec2'); r.add(-.8, r.depth - 1.0, 1.6, .7, .9, STEEL); r.add(1.1, r.depth - 1.0, .9, .7, .9, '#2a2c30');
    r.add(r.half - .4, 2.2, .7, 1.1, 1.9, '#d7dde0'); r.add(r.half - .76, 2.2, .04, .95, 1.5, '#7fb0c9', .3, false);
    for (let b = 1.8; b < back - 1.4; b += 1.5) r.table(-r.half + 1.25, b, '#d9d2c0', tone);
  },
  // Latin and Caribbean lunch counters: the food on show in a steam table along one side, eaten at tables along the other.
  steamtable(r) {
    r.floor = '#a39884'; r.wall = '#f1e3c0'; r.light = { color: 0xfff1d0, power: 70 };
    const from = 1.9, to = r.depth - 1.6;
    r.add(-r.half + 1.25, (from + to) / 2, .8, to - from, .95, STEEL);
    for (let b = from + .4; b < to - .3; b += .62) r.add(-r.half + 1.25, b, .6, .5, .08, ['#c9772a', '#e0b23a', '#7a3a1f', '#4f8a3a', '#d9d2a0', '#b0303a'][(r.seed + Math.round(b * 2)) % 6], .95, false);
    r.add(-r.half + 1.55, (from + to) / 2, .04, to - from, .45, GLASS, 1.05, false);
    r.staff(-r.half + .45, from + 1, 1, 0); r.staff(-r.half + .45, to - 1, 1, 0);
    for (let b = 2.4; b < r.depth - 1.6; b += 1.9) r.table(r.half - 1.3, b, '#d9d2c0', '#2f5a45');
    r.panel(1, 2, r.depth - 4, 1.0, 1.5, ['#e0b23a', '#2f8fd0', '#c8452e'][r.seed % 3]);
  },
  // A pizzeria: pies under glass on the counter, the ovens behind, a ledge to eat at standing, and a few tables.
  pizza(r) {
    r.floor = '#a8442e'; r.wall = '#f2ecdc'; r.light = { color: 0xfff1d6, power: 72 };
    const from = 2.2, to = Math.max(from + 2.4, r.depth - 2.6);
    r.add(-r.half + 1.5, (from + to) / 2, .8, to - from, 1.05, WHITE);
    for (let b = from + .5; b < to - .3; b += .85) { r.add(-r.half + 1.5, b, .66, .66, .05, '#e0a23a', 1.05, false); r.add(-r.half + 1.5, b, .5, .5, .03, ['#c8452e', '#d9c9a0', '#b8402a'][(r.seed + Math.round(b)) % 3], 1.1, false); }
    r.add(-r.half + 1.85, (from + to) / 2, .04, to - from, .4, GLASS, 1.12, false);
    const ovenB=to-.65;
    r.add(-r.half + .4, ovenB, .7, 1.26, 1.9, '#3a3d42'); r.add(-r.half + .76, ovenB, .04, 1.2, .3, '#e07b2a', 1.0, false);
    r.staff(-r.half + .65, ovenB-1.13, 1, 0);
    for (let b = 2.4; b < r.depth - 1.5; b += 2.0) r.table(r.half - 1.3, b, '#c8452e', '#23272b');
    r.panel(0, 0, r.width - 2, .9, 1.7, '#0b6b2f'); r.add(r.half - .4, r.depth - .8, .7, 1.0, 1.9, '#d7dde0');
  },
  // Chicken and rice: the grill and the spit behind the counter, the platters on a board above, a counter to eat at.
  halal(r) {
    r.floor = '#b9b09a'; r.wall = '#f0ead6'; r.light = { color: 0xfff6e0, power: 75 };
    const back = Math.min(r.depth - 2.2, 5.0);
    r.add(.34, back, r.width - 1.9, .7, 1.1, '#f2c400'); r.add(.34, back, r.width - 1.8, .8, .05, STEEL, 1.1, false); r.staff(0, back + .75, 0, -1);
    r.add(-r.half + 1.1, r.depth - .8, 1.6, .8, .9, STEEL); r.add(r.half - 1.0, r.depth - .7, .45, .45, 1.0, STEEL); r.add(r.half - 1.0, r.depth - .7, .34, .34, .8, '#8a4a2a', 1.0, false);
    r.boardAt = back + .1;
    r.add(0, r.depth - .2, r.width - .4, .3, 2.0, '#b9bec2');
    r.add(r.half - .35, 2.6, .5, 2.4, .05, WOOD, 1.02); for (let b = 1.8; b < Math.min(3.6, r.depth - 1.15); b += .8) r.seat(r.half - .95, b, 1, 0, .28, DARK, .36, .36, .73);
    if(r.width<4.8){
      const a=-r.half+.53;
      r.add(a,2.22,.70,.65,.74,'#d9d2c0',0,true,'table');
      for(const side of [-1,1])r.seat(a,2.22+.54*side,0,-side,0,'#0b5d2a');
    }else r.table(-r.half + 1.25, 2.2, '#d9d2c0', '#0b5d2a');
  },
  // Sushi and ramen: the bar with the chef behind it, stools along it, small tables, pale wood.
  sushi(r) {
    r.floor = '#5a4a3a'; r.wall = '#e9dcc0'; r.light = { color: 0xffe6c0, power: 50 };
    const from = 2.6, to = r.depth - 1.4;
    r.add(-r.half + 1.3, (from + to) / 2, .7, to - from, 1.05, '#c9a876'); r.add(-r.half + 1.35, (from + to) / 2, .3, to - from - .2, .22, GLASS, 1.05, false);
    for (let b = from + .5; b < to - .2; b += .9) r.seat(-r.half + 2.05, b, -1, 0, .28, '#2a1a14', .36, .36, .73);
    r.staff(-r.half + .55, (from + to) / 2, 1, 0);
    for (let b = 2.4; b < r.depth - 1.6; b += 1.9) r.table(r.half - 1.3, b, '#c9a876', '#2a1a14');
    r.panel(-1, from, to - from, .5, 2.2, '#7a1f2a'); r.panel(0, 0, 1.6, 1.2, 1.2, '#17191b');
  },
  // A bakery, a doughnut or bagel shop, an ice-cream parlour: the case full of what they make, the racks behind, somewhere to perch.
  bakery(r) {
    r.floor = '#c9b8a0'; r.wall = '#f6efe0'; r.light = { color: 0xfff1dc, power: 68 };
    const back = Math.min(r.depth - 2.0, 4.8);
    r.add(0, back, r.width - 1.6, .8, 1.15, '#e9e4d6'); r.add(0, back - .2, r.width - 1.7, .45, .5, GLASS, .55, false);
    for (let a = -r.half + 1.3; a < r.half - 1.2; a += .5) r.add(a, back - .22, .4, .36, .12, ['#c9772a', '#e0a23a', '#8a4a2a', '#e8b8c8', '#f1e3c0'][(r.seed + Math.round(a * 2)) % 5], .7, false);
    r.staff(Math.min(.8, r.half - 1.4), back + .8, 0, -1); r.boardAt = back + .15;
    r.add(0, r.depth - .3, r.width - .6, .5, 2.0, '#b8a888'); for (let y = .5; y < 1.9; y += .45) r.add(0, r.depth - .5, r.width - .9, .3, .14, ['#c9772a', '#e0a23a', '#8a4a2a'][Math.round(y * 2) % 3], y, false);
    for (let b = 1.7; b < back - 1.3; b += 1.5) r.table(-r.half + 1.2, b, '#f1e3c0', '#8a4a2a');
  },
  // A bar: the bar down one side with its bottles, stools, high tables, a booth or two, kept dim.
  bar(r) {
    r.wall = '#3a2a24'; r.floor = '#3b2f2a'; r.light = { color: 0xffc890, power: 30 };
    r.add(-r.half + 1.1, r.depth / 2 + .6, .7, r.depth - 3.2, 1.1, '#2b1a12'); r.add(-r.half + .25, r.depth / 2 + .6, .3, r.depth - 3.2, 1.6, '#1a1210', .9, false);
    for (let b = 2.3; b < r.depth - 1.4; b += .8) r.add(-r.half + .28, b, .2, .5, .3, ['#2f5a3a', '#c9a23f', '#7a1f2a', '#d9d2c0'][(r.seed + Math.round(b * 3)) % 4], 1.7, false);
    for (let b = 2.6; b < r.depth - 1.2; b += 1.1) r.seat(-r.half + 1.9, b, -1, 0, .3, DARK, .38, .38, .75);
    r.staff(-r.half + .62, r.depth / 2, 1, 0);
    if (r.half > 2.9) for (let b = 2.4; b < r.depth - 3.4; b += 2.2) r.table(r.half - 1.3, b, WOOD, DARK);
    if (r.depth > 9) r.booth(r.half - .85, r.depth - 2.2, '#5a1a1a');
    r.panel(1, 2, 1.4, .8, 1.6, '#2f8fd0');
  },
  // A club: a rope at the door, the bar along one wall, a lit floor to dance on, the booth for whoever plays the records.
  club(r) {
    r.wall = '#14121a'; r.floor = '#101014'; r.light = { color: 0xb070ff, power: 26 };
    r.add(-1.1, 1.7, .08, .08, .95, '#c9a23f'); r.add(-1.1, 2.6, .08, .08, .95, '#c9a23f'); r.add(-1.1, 2.15, .04, .9, .04, '#7a1f2a', .85, false); r.staff(-1.7, 2.1, 1, 0);
    r.add(-r.half + 1.0, r.depth / 2 + 1, .7, r.depth - 4.4, 1.1, '#1a1a22'); r.add(-r.half + 1.0, r.depth / 2 + 1, .76, r.depth - 4.3, .05, '#b070ff', 1.1, false);
    for (let b = 3.4; b < r.depth - 1.6; b += .8) r.add(-r.half + .25, b, .2, .5, .3, ['#ff4fa0', '#4fd0ff', '#b070ff', '#ffe04f'][(r.seed + Math.round(b * 3)) % 4], 1.6, false);
    r.staff(-r.half + .5, r.depth / 2 + 1, 1, 0);
    const size = 1.1, cols = Math.max(2, Math.floor((r.half * 2 - 3.2) / size)), rows = Math.max(2, Math.floor((r.depth - 6.2) / size));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) r.add(-r.half + 2.5 + (i + .5) * size, 3.6 + (j + .5) * size, size - .06, size - .06, .04, ['#ff4fa0', '#4fd0ff', '#b070ff', '#ffe04f', '#3a2a5a'][(r.seed + i * 3 + j * 5) % 5], .03, false);
    r.add(Math.min(1, r.half - 1.6), r.depth - .8, 2.2, .8, 1.1, '#1a1a22'); r.add(Math.min(1, r.half - 1.6), r.depth - .8, 1.2, .5, .1, '#4fd0ff', 1.1, false); r.staff(Math.min(1, r.half - 1.6), r.depth - .25, 0, -1);
    for (const y of [1.2, 2.0]) r.panel(1, 3, r.depth - 5, .12, y, y > 1.5 ? '#ff4fa0' : '#4fd0ff');
    if (r.half > 3) r.seat(r.half - .5, r.depth - 2.6, -1, 0, 0, '#5a1a4a', .7, 1.8);
  },

  // A hair salon: styling chairs facing mirrors down both walls, the basins at the back, dryers, the desk by the door.
  salon(r) {
    r.wall = '#f1dfe6'; r.floor = '#b8b2a8';
    r.add(r.half - 1.2, 1.6, 1.6, .6, 1.05, WHITE); r.staff(r.half - 1.2, .95, 0, 1);
    for (let b = Math.min(3.2,r.depth-1.4); b < Math.max(r.depth-2.6,3.24); b += 1.9) for (const side of [-1, 1]) { r.seat(side * (r.half - 1.1), b, side, 0, .1, '#2b2b30', .65, .65, .55); r.add(side * (r.half - 1.1), b + .28, .6, .12, .6, '#2b2b30', .55, false); r.add(side * (r.half - .12), b, .06, 1.0, 1.1, '#bcd3da', 1.0, false); r.add(side * (r.half - .25), b, .35, 1.1, .05, WHITE, .85, false); }
    for (let a = -r.half + 1.0; a < r.half - .6; a += 1.3) { r.add(a, r.depth - .45, .7, .6, .85, '#17191b'); r.add(a, r.depth - .45, .5, .4, .12, WHITE, .85, false); }
    r.staff(-r.half + 1.9, 3.2, -1, 0);
    r.seat(-r.half + .4, 1.7, 1, 0, 0, '#b65a7a', .55, 1.4);
  },
  // A nail salon: manicure tables in a row, the big pedicure chairs along the wall, bottles of polish by the desk.
  nails(r) {
    r.wall = '#f6e6ee'; r.floor = '#d9d2c8'; r.light = { color: 0xfff4f8, power: 72 };
    r.add(r.half - 1.2, 1.6, 1.6, .6, 1.05, WHITE); r.staff(r.half - 1.2, .95, 0, 1);
    for (let i = 0; i < 2; i++) r.add(r.half - .15, 1.3, .12, 1.2, .03, '#ffffff', 1.45 + i * .22, false);
    for (let i = 0; i < 12; i++) r.add(r.half - .2, .85 + (i % 6) * .18, .08, .1, .14, ['#e0559a', '#c8452e', '#8a4b9e', '#e8b8c8', '#b0303a', '#f2c230'][i % 6], 1.48 + Math.floor(i / 6) * .22, false);
    for (let b = 3.0; b < r.depth - 1.0; b += 1.5) { r.add(-r.half + 1.7, b, 1.0, .55, .76, WHITE); r.seat(-r.half + 2.55, b, -1, 0, 0, '#3a3a40', .42, .42); r.add(-r.half + 1.7, b, .14, .14, .3, '#b8bcc0', .76, false); if (b < r.depth - 1.6) r.staff(-r.half + .85, b, 1, 0); }
    for (let b = 3.2; b < r.depth - 1.0; b += 1.5) { r.seat(r.half - .75, b, -1, 0, .15, '#8a6a5a', .9, .95, .6); r.add(r.half - .35, b, .3, .95, 1.2, '#8a6a5a', .6, false); r.add(r.half - 1.45, b, .5, .6, .3, '#bcd6e4'); }
  },
  // A barber's: three or four chairs facing one long mirror, a bench to wait on, the pole's colours on the wall.
  barber(r) {
    r.wall = '#e8e4da'; r.floor = '#2f3236';
    r.panel(-1, 2.6, Math.max(2, r.depth - 4), 1.2, 1.0, '#bcd3da'); r.add(-r.half + .25, r.depth / 2 + .6, .4, Math.max(2, r.depth - 4), .05, WOOD, .9, false);
    for (let b = Math.min(3.2,r.depth-1.1); b < r.depth - .72; b += 1.9) { r.seat(-r.half + 1.3, b, -1, 0, .1, '#7a1f1f', .65, .65, .55); r.add(-r.half + 1.62, b, .12, .6, .6, '#7a1f1f', .55, false); r.add(-r.half + 1.3, b, .2, .2, .12, STEEL, 0, false); }
    r.staff(-r.half + 1.9, 3.2 + .9, -1, 0);
    r.people.at(-1).role='barber';
    for (let b = 2.2; b < r.depth - 1.2; b += .7) r.seat(r.half - .4, b, -1, 0, 0, '#23272b', .55, .62);
    const desk=r.half-.72;
    r.add(desk, 1.62, Math.min(1.2,r.half-1.15), .5, 1.0, BLACK); r.staff(desk,.94,0,1);
    for (let i = 0; i < 3; i++) r.add(-.9 + i * .9, r.depth - .04, .5, .05, 1.3, ['#b01515', '#f4f1e6', '#1a3fa0'][i], 1.1, false);
  },

  // A hotel lobby: the desk, somewhere to sit, the lifts.
  hotel(r) {
    r.wall = '#d6ccb8'; r.floor = '#5a4a3e'; r.light = { color: 0xffe2b8, power: 48 };
    r.add(-r.half + 1.6, r.depth - 1.6, 2.6, .8, 1.1, '#3a2a1e'); r.add(-r.half + 1.6, r.depth - 1.6, 2.7, .9, .05, '#d9c9a8', 1.1, false); r.staff(-r.half + 1.6, r.depth - .9, 0, -1);
    for (let i = 0; i < 2; i++) { r.add(r.half - 1.0 - i * 1.3, r.depth - .06, 1.0, .1, 2.2, '#b8a888', 0, false); r.add(r.half - 1.0 - i * 1.3, r.depth - .1, .04, .04, 2.2, '#3a2a1e', 0, false); }
    // Armchairs round a low table to one side, clear of the way to the desk.
    const at = r.half - 1.3;
    r.add(at, 3.6, .9, .7, .42, WOOD); r.seat(at, 2.55, 0, 1, 0, '#3f4a5a', 1.5, .7); r.seat(at, 4.65, 0, -1, 0, '#3f4a5a', 1.5, .7);
    r.add(-r.half + .5, 1.4, .5, .5, 1.3, '#2f5a3a'); r.add(at, 3.6, 2.2, 3.2, .02, '#7a1f2a', .02, false);
  },
  // A cinema or theatre lobby: the box office, the counter with the popcorn, posters, the doors to the house.
  cinema(r) {
    r.wall = '#3a1a1e'; r.floor = '#5a1f24'; r.light = { color: 0xffd6a0, power: 40 };
    r.add(-r.half + 1.2, 2.0, 1.8, .7, 1.1, '#17191b'); r.add(-r.half + 1.2, 2.32, 1.8, .04, 1.0, GLASS, 1.1, false); r.staff(-r.half + 1.2, 1.3, 0, 1);
    r.add(r.half - 1.6, r.depth - 2.2, 2.6, .7, 1.1, '#c8452e'); r.add(r.half - 2.2, r.depth - 2.2, .7, .6, .8, '#f2c230', 1.1, false); r.staff(r.half - 1.6, r.depth - 1.5, 0, -1);
    for (let i = 0; i < 2; i++) r.add(-r.half + 1.2 + i * 1.5, r.depth - .06, 1.2, .1, 2.2, '#2a1014', 0, false);
    for (let b = 3.4; b < r.depth - 1.6; b += 1.8) r.panel(-1, b, 1.1, 1.5, 1.0, GOODS[(r.seed + Math.round(b)) % GOODS.length]);
    for (let b = 3.6; b < r.depth - 3.2; b += 1.3) for (const a of [-.8, .8]) r.add(a, b, .08, .08, .95, '#c9a23f');
  },
  // A school, a library, a station house: a desk and somewhere to wait.
  lobby(r) {
    r.wall = '#ddd6c6'; r.floor = '#6f685e';
    r.add(0, r.depth - 1.6, Math.min(4, r.width - 2), .8, 1.1, WOOD); r.staff(0, r.depth - .9, 0, -1);
    const benchLength = Math.min(2, r.depth - 2.75);
    const sides = r.depth < 5 ? [-1] : [-1, 1];
    for (const side of sides) r.seat(side * (r.half - .9), Math.min(2.6, r.depth - 2.55 - benchLength/2), -side, 0, 0, '#3f4a5a', .9, benchLength);
    r.panel(0, 0, Math.min(3, r.width - 2), .9, 1.6, '#2f5f9e');
  },
};

/** How many metres of building lie straight in from a front's door, up to 13. `inside(x, z)` says whether a point is within its building. */
export function roomDepth(front, inside = () => true) {
  let depth = 0;
  if (front.width < 4) return 0;
  const edge = Math.min(9, front.width) / 2 - .07;
  const lanes = [-edge, -edge / 2, 0, edge / 2, edge];
  while (depth < 13 && lanes.every(a => inside(...roomPoint(front, a, depth + 1)))) depth++;
  return depth;
}
/** Whether a street front has a room to walk into: a kind of place that has one, with four metres of building behind its door. */
export const hasRoom = (front, inside = () => true) => Boolean(roomKind(front.place)) && roomDepth(front, inside) >= 4;

/**
 * Lay out a place's room. `front` is its street front (places.js);
 * `inside(x, z)` says whether a point is within its building.
 *
 * Room coordinates: `a` runs along the front wall from its middle, `b` runs
 * in from the wall. Things in the room are boxes { a, b, w, d, h, y, color,
 * solid }: centred at (a, b), w along the wall and d deep, from y up to y + h.
 * `staff` and `seats` are where people stand and sit: { a, b, da, db } with
 * (da, db) the way they face; a seat is `lift` above the floor.
 * @returns {null | {name, kind, style, x, z, tx, tz, nx, nz, width, depth, things, staff, seats, wall, floor, light}}
 */
export function planRoom(front, inside = () => true) {
  const place = front.place, kind = roomKind(place);
  if (!kind) return null;
  // As deep as the building goes behind the door, within reason.
  let depth = roomDepth(front, inside);
  if (depth < 4) return null;
  depth = Math.min(12, depth - .4);
  const width = Math.min(9, front.width), half = width / 2, seed = hashOf(`${placeName(place)}|${place.x}|${place.z}`), style = roomStyle(place);
  const r = { width, half, depth, seed, place, things: [], people: [], seats: [], wall: '#d8d2c4', floor: '#8a8378', light: { color: 0xfff1dc, power: 60 } };
  // `shape` says how a thing is drawn where it is more than a box: 'table', 'chair', 'bench', 'stool'; `face` is the way a seat faces.
  r.add = (a, b, w, d, h, color, y = 0, solid = true, shape = null, face = null) => { const thing = { a, b, w, d, h, y, color, solid }; if (color === GLASS && !solid) thing.glass = true; if (shape) thing.shape = shape; if (face) thing.face = face; r.things.push(thing); };
  r.staff = (a, b, da, db) => { r.people.push({ a, b, da, db, facing: db < 0 ? 0 : db > 0 ? 2 : da > 0 ? 3 : 1 }); };
  /** Something to sit on, w by d and `top` high, with someone perhaps on it facing (da, db). */
  r.seat = (a, b, da, db, lift = 0, color = DARK, w = .4, d = .4, top = .45, kind) => {
    const shape = top >= .7 ? 'stool' : w > .62 || d > .62 ? 'bench' : 'chair';
    const seatKind = kind ?? (shape === 'bench' && (da ? w : d) >= .64 ? 'lounge' : shape);
    r.add(a, b, w, d, top, color, 0, true, shape, [da, db]);
    r.seats.push({ a, b, da, db, lift, seatKind, seatHeight: top, seatWidth: da ? d : w, seatDepth: da ? w : d });
  };
  /** A table for two: its chairs to either side along the wall, facing each other. */
  r.table = (a, b, top = WOOD, chair = DARK) => { r.add(a, b, .8, .8, .74, top, 0, true, 'table'); r.seat(a - .65, b, 1, 0, 0, chair); r.seat(a + .65, b, -1, 0, 0, chair); };
  /** A booth against a side wall at a: two benches with a table between them, facing each other along the wall. */
  r.booth = (a, b, color) => { r.add(a, b, 1.2, .7, .74, '#d9d2c0', 0, true, 'table'); for (const way of [-1, 1]) r.seat(a, b + way * .75, 0, -way, 0, color, 1.2, .5, .45, 'booth'); };
  /** Something flat on a wall: side -1 or 1 for a side wall (from b = `from`, `along` wide), 0 for the back wall (centred at a = `from`); `inset` brings it out in front of what stands there. */
  r.panel = (side, from, along, high, up, color, inset = 0) => { if (side) r.add(side * (half - .03 - inset), from + along / 2, .04, along, high, color, up, false); else r.add(from, depth - .03 - inset, along, .04, high, color, up, false); };
  /** Shelving down a side wall from b = from to b = to, its goods in bands of colour. */
  r.shelves = (side, from, to, body, colours) => { if (to - from < .8) return; r.add(side * (half - .22), (from + to) / 2, .4, to - from, 2.0, body); for (let shelf = 0; shelf < 4; shelf++) r.add(side * (half - .24), (from + to) / 2, .42, to - from - .1, .24, colours[(seed + shelf) % colours.length], .22 + shelf * .44, false); };
  /** Free-standing shelves in rows running into the room, between a = from and a = to. */
  r.aisles = (from, to, near, far, pitch) => { if (far - near < 1.2) return; for (let a = from, i = 0; a <= to; a += pitch, i++) { r.add(a, (near + far) / 2, .55, far - near, 1.7, STEEL); for (let shelf = 0; shelf < 4; shelf++) r.add(a, (near + far) / 2, .62, far - near - .2, .22, GOODS[(seed + i * 3 + shelf) % GOODS.length], .25 + shelf * .4, false); } };
  /** Bottles along the back of a bar. */
  r.bottles = (a, b, along) => { for (let x = -along / 2 + .2; x < along / 2; x += .32) r.add(a + x, b, .14, .14, .32, ['#2f5a3a', '#c9a23f', '#7a1f2a', '#d9d2c0', '#3a2a1e'][(seed + Math.round(x * 5)) % 5], 1.72, false); };
  furnishRoom(STYLES, style, r);
  // Whatever a manner of room asks for, the room is the size it is: anything that would stand in the doorway,
  // poke through a wall or reach the ceiling is left out, and so is anyone who would then be standing in the furniture.
  const fits = thing => Math.abs(thing.a) + thing.w / 2 <= half + .005 && thing.b - thing.d / 2 >= -.005 && thing.b + thing.d / 2 <= depth + .005 && thing.y >= 0 && thing.y + thing.h <= CEILING && thing.w > 0 && thing.d > 0 && thing.h > 0;
  const blocks = thing => thing.solid && Math.abs(thing.a) < thing.w / 2 + .45 && thing.b - thing.d / 2 < 1.45;
  let things = r.things.filter(thing => fits(thing) && !blocks(thing));
  const within = (spot, thing, margin = 0) => thing.solid && Math.abs(spot.a - thing.a) < thing.w / 2 + margin && Math.abs(spot.b - thing.b) < thing.d / 2 + margin;
  let staff = r.people.filter(spot => Math.abs(spot.a) < half - .2 && spot.b > .4 && spot.b < depth - .2 && !things.some(thing => within(spot, thing)));
  let seats = r.seats.filter(spot => things.some(thing => thing.solid && thing.h <= .8 && thing.a === spot.a && thing.b === spot.b));
  // A room too small for its manner of furnishing still has a counter across the back and someone behind it.
  if (!staff.length || things.length < 3 || things.filter(thing => thing.solid).length < 2) {
    const counter = { a: 0, b: depth - 1.35, w: width - 1.8, d: .6, h: 1.05, y: 0, color: WOOD, solid: true };
    things = things.filter(thing => !thing.solid || (!within({ a: 0, b: depth - .6 }, thing, .3) && (thing.b + thing.d / 2 < counter.b - counter.d / 2 - .9 || Math.abs(thing.a) - thing.w / 2 > counter.w / 2)));
    things.push(counter, { a: 0, b: depth - .2, w: width - .6, d: .3, h: 1.9, y: 0, color: STEEL, solid: true }, { a: 0, b: depth - .37, w: width - .9, d: .05, h: .3, y: 1.2, color: GOODS[seed % GOODS.length], solid: false });
    staff = [{ a: 0, b: depth - .75, da: 0, db: -1, facing: 0 }];
  }
  seats = seats.filter(spot => things.some(thing => thing.solid && thing.h <= .8 && thing.a === spot.a && thing.b === spot.b));
  // What is sold is written up where it can be read from the door: over the counter a manner of room has in its
  // middle, or else on the back wall, in front of whatever stands against it.
  const menu = menuFor(place), board = menu.length && ['eat','bar'].includes(kind) ? { a: 0, b: r.boardAt != null ? r.boardAt - .06 : depth - .62, w: Math.min(3.4, width - 1.4), h: .78, up: 2.12, lines: menu.map(item => [item.name, item.price]) } : null;
  if (kind==='eat' && style!=='coffee' && seats.length && staff.length) {
    staff[0].role??='cook';
    // A second cook on the line stays a cook: the floor is someone else's.
    const server=staff.find(s=>s.role==='server') || staff.find(s=>s!==staff[0] && !s.role);
    if(server)server.role='server';
    else {
      // An open station beside the pass, with enough clearance to step into service.
      const spots=[];
      for(let b=.9;b<depth-.4;b+=.4) for(let a=-half+.45;a<=half-.45;a+=.4)
        if(!things.some(t=>within({a,b},t,.24)) && Math.hypot(a-staff[0].a,b-staff[0].b)>.8)spots.push({a,b,da:0,db:-1,role:'server',facing:0});
      spots.sort((s,t)=>Math.hypot(s.a,s.b-(depth-2.4))-Math.hypot(t.a,t.b-(depth-2.4)));
      if(spots.length)staff.push(spots[0]);
    }
  }
  const returns = (front.returns || []).map(({ side, length }) => ({ side, length: Math.min(depth, length) }));
  const room = { name: placeName(place), kind, style, board, place, returns, skew: front.skew || 0, x: front.x, z: front.z, tx: front.tx, tz: front.tz, nx: front.nx, nz: front.nz, width, depth, things, staff, seats, wall: r.wall, floor: r.floor, light: r.light };
  const softFloor = ['bar','chairs','lobby'].includes(kind) || ['books','clothes','liquor','music','sushi'].includes(style);
  room.finish = { floor:softFloor ? 'wood' : 'tile', feature:r.wall, accent:r.floor, ink:'#444440',
    title:'', line:'', zones:[], ...r.finish, seed };
  if(r.grocerySlots){room.grocerySlots=r.grocerySlots;room.groceryTickets=r.groceryTickets;}
  if(r.kitchen)room.kitchen={...r.kitchen,stations:r.kitchen.stations.filter(s=>things.includes(s.thing))};
  room.register = planRegister(room);
  if(room.register?.podium)room.things.push(room.register.podium);
  if(room.register?.attendant)room.staff.push(room.register.attendant);
  if(kind==='eat' || kind==='bar')openServiceWay(room);
  return room;
}

/** Build a room as it stands in the world, its floor at height `y`. Returns a group; dispose() frees it. */
export function buildRoom(room, y = 0, { streetView = false } = {}) {
  const group = new THREE.Group(); group.name = `Inside ${room.name}`;
  const position = [], color = [], tone = new THREE.Color();
  // The footprint ring can run either way. Mapping local depth to the
  // inward normal reflects the triangles for one of those two windings.
  const mirrored = room.tx * room.nz - room.tz * room.nx > 0;
  const outwardOrder = mirrored ? [0, 2, 1] : [0, 1, 2];
  const inwardOrder = mirrored ? [0, 1, 2] : [0, 2, 1];
  // Boxes are shaded by which way each face looks: there is no sun indoors.
  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const box = (a, b, w, d, h, y0, hex, inward = false, da = 0, db = 1) => {
    const p = unitBox.attributes.position, n = unitBox.attributes.normal;
    tone.set(hex);
    const order = inward ? inwardOrder : outwardOrder;
    for (let i = 0; i < p.count; i += 3) for (const k of order) {
      const u=w*p.getX(i+k), v=d*p.getZ(i+k);
      const la = a + u*db + v*da, lb = b - u*da + v*db, [x, z] = roomPoint(room, la, lb), ny = n.getY(i + k) * (inward ? -1 : 1), shade = ny > .5 ? 1.08 : ny < -.5 ? .7 : Math.abs(n.getX(i + k)) > .5 ? .86 : .96;
      position.push(x, y + y0 + h / 2 + h * p.getY(i + k), z); color.push(tone.r * shade, tone.g * shade, tone.b * shade);
    }
  };
  const half = room.width / 2, wall = .055, sill = .64, head = 2.27, dark = '#303638';
  box(0, room.depth + wall / 2, room.width, wall, CEILING, 0, room.wall);
  for (const side of [-1, 1]) {
    const a = side * (half + wall / 2), length = room.returns?.find(edge => edge.side === side)?.length || 0;
    if (length) {
      box(a, length / 2, wall, length, sill, 0, room.wall);
      box(a, length / 2, wall, length, CEILING - head, head, room.wall);
      for (const b of [.11, length - .11]) box(a, b, wall, .22, head - sill, sill, room.wall);
      box(a, length / 2, wall, .05, head - sill, sill, dark);
    }
    if (length < room.depth) box(a, (length + room.depth) / 2, wall, room.depth - length, CEILING, 0, room.wall);
    const mid = side * (half + DOOR / 2) / 2, width = half - DOOR / 2;
    box(mid, .04, width, wall, sill, 0, room.wall);
    box(mid, .04, width, wall, CEILING - head, head, room.wall);
    box(side * (.7 + DOOR / 2) / 2, .04, .7 - DOOR / 2, wall, head - sill, sill, dark);
    box(side * (half - .11), .04, .22, wall, head - sill, sill, room.wall);
    if (half > 3) box(side * (half + .48) / 2, .04, .05, wall, head - sill, sill, dark);
  }
  box(0, .04, DOOR, wall, CEILING - 2.22, 2.22, room.wall);
  // A dim room has a dark ceiling and its lights turned low.
  const dim = (room.light?.power ?? 60) < 45, above = dim ? tone.set(room.wall).multiplyScalar(.55).getHexString() : 'f2efe6';
  box(0, room.depth / 2, room.width - .02, room.depth - .02, .03, 0, room.floor); box(0, room.depth / 2, room.width - .02, room.depth - .02, .03, CEILING - .04, room.light?.ceiling || '#' + above);
  const pendants=['coffee','jewelry','fine','diner'].includes(room.style);
  if(room.finish?.counterService){
    // Suspended tiles and recessed fluorescent troffers over the service line.
    for(let a=-half+.61;a<half;a+=.61)box(a,room.depth/2,.014,room.depth-.03,.007,CEILING-.047,'#aea99e');
    for(let b=1.22;b<room.depth;b+=1.22)box(0,b,room.width-.03,.016,.007,CEILING-.047,'#aea99e');
    const column=Math.max(1,Math.floor(room.width*.25/.61));
    for(let b=1.83;b<room.depth-.58;b+=3.66)for(const side of [-1,1]){
      const a=side*(half-(column+.5)*.61);
      box(a,b,.60,1.20,.017,CEILING-.061,'#a8a79f');
      box(a,b,.55,1.15,.009,CEILING-.070,'#fff8df');
    }
  }else if (room.light?.strip) {
    for (const side of [-1, 1]) {
      const a = side * room.width * .26, length = room.depth - .8;
      box(a, room.depth / 2, .14, length, .06, CEILING - .13, '#676967');
      box(a, room.depth / 2, .084, length - .07, .022, CEILING - .15, room.light.strip);
    }
  } else if (!pendants && !room.light?.recessed) {
    for (let b = 1.5; b < room.depth; b += 3) box(0, b, room.width * (dim ? .12 : .5), dim ? .12 : .5, .05, CEILING - .1, dim ? '#ffd9a0' : '#fffbe8');
  }
  // A cylinder standing on end, shaded like the boxes.
  const post = (a, b, radius, h, y0, hex, sides = 10) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, h, sides).toNonIndexed(), p = geometry.attributes.position, n = geometry.attributes.normal;
    tone.set(hex);
    for (let i = 0; i < p.count; i += 3) for (const k of outwardOrder) {
      const [x, z] = roomPoint(room, a + p.getX(i + k), b + p.getZ(i + k)), ny = n.getY(i + k), shade = ny > .5 ? 1.08 : ny < -.5 ? .7 : .84 + .14 * Math.abs(n.getX(i + k));
      position.push(x, y + y0 + h / 2 + p.getY(i + k), z); color.push(tone.r * shade, tone.g * shade, tone.b * shade);
    }
    geometry.dispose();
  };
  if (room.light?.recessed && !room.finish?.counterService) {
    for (let b = 1.5; b < room.depth; b += 3) for (const side of [-1,1]) {
      const a = side * room.width * .24;
      post(a,b,.085,.014,CEILING-.054,'#95928a');
      post(a,b,.060,.007,CEILING-.061,'#fff2d3');
    }
  }
  if(pendants) for(let b=1.5;b<room.depth-.25;b+=3){
    for(const side of [-1,1]){
      const a=side*room.width*.24;
      box(a,b,.018,.018,.32,CEILING-.35,'#494441');
      post(a,b,.057,.07,CEILING-.39,'#a48964',8);
      post(a,b,.142,.073,CEILING-.452,'#4f554b',8);
      post(a,b,.13,.013,CEILING-.464,'#ffe8b9',8);
    }
  }
  const LEG = '#2a2c30', props = roomProps(room, y, position, color);
  const paneVertices = [], surfaces=[];
  const till=room.register;
  if (till) {
    if(till.mounted){
      const wallGap=.225/Math.hypot(1,till.da*(room.skew||0));
      const bracket=(u,v,w,d,h,up,hex)=>{
        const axes=checkoutAxes(room,till.da,till.db);
        box(till.a+axes.ua*u+axes.va*v,till.b+axes.ub*u+axes.vb*v,w,d,h,till.up+up,hex,false,till.da,till.db);
      };
      bracket(0,0,.50,wallGap*2,.035,-.035,'#8e8270');
      for(const side of [-1,1]){
        bracket(side*.178,-wallGap+.038,.032,.06,.176,-.207,'#69716d');
        bracket(side*.178,-.01,.032,.31,.023,-.058,'#69716d');
      }
    }
    props.draw({shape:'register',a:till.a,b:till.b,y:till.up,face:[till.da,till.db]});
  }
  for (const thing of room.things) {
    // A single material attribute selects close-up grain on surfaces with
    // an identifiable finish. Thin metal parts retain their original colour.
    let tile=0;
    if(['shirt','chair','bench','stool','fittingRoom','weightBench'].includes(thing.shape))tile=3;
    else if(['exerciseMat','treadmill'].includes(thing.shape))tile=4;
    else if(['espresso','cookline','kitchenRange','packingBench','hotServery','oven','ringSample','spinBike','barbellRack','cableStation','dumbbells'].includes(thing.shape) || KITCHEN_SHAPES.has(thing.shape))tile=5;
    else if(['phone','cup','plates','placeSetting'].includes(thing.shape))tile=6;
    else if(['guitar','table','towelShelf','showcase','shoewall','breadrack'].includes(thing.shape) ||
      !thing.shape && parseInt(thing.color.slice(1,3),16)-parseInt(thing.color.slice(5,7),16)>24)tile=1;
    surfaces.push([position.length/3,tile]);
    const { a, b, w, d, h, y: up, color: hex, shape, face } = thing;
    // The working checkout below replaces the decorative register in the layout.
    if (shape==='register' || thing.more?.pickup) continue;
    if (shape === 'branchPartition') {
      const [lx,lz]=roomPoint(room,a-w/2+.038,b), [rx,rz]=roomPoint(room,a+w/2-.038,b);
      const low=y+up+.07, high=y+up+h-.04;
      paneVertices.push(lx,low,lz,rx,low,rz,rx,high,rz,lx,low,lz,rx,high,rz,lx,high,lz);
    }
    if (shape === 'tellerPane') {
      const [lx, lz] = roomPoint(room, a - w / 2, b), [rx, rz] = roomPoint(room, a + w / 2, b);
      const low = y + up, high = low + h;
      paneVertices.push(lx,low,lz, rx,low,rz, rx,high,rz, lx,low,lz, rx,high,rz, lx,high,lz);
      continue;
    }
    // What marks the trade is drawn as itself (room-props.js): an oven, a dressed figure, a case of watches.
    if (props.draw(thing)) continue;
    if (shape === 'table') {
      // A top on a pedestal, or on four legs if it is long.
      box(a, b, w, d, .05, up + h - .05, hex);
      if (Math.max(w, d) > 1.3) for (const sa of [-1, 1]) for (const sb of [-1, 1]) box(a + sa * (w / 2 - .08), b + sb * (d / 2 - .08), .06, .06, h - .05, up, LEG);
      else { post(a, b, .05, h - .07, up + .02, LEG); post(a, b, Math.min(w, d) * .32, .02, up, LEG); }
    } else if (shape === 'chair') {
      // Seat, four legs, and a back on the side away from the way it faces.
      box(a, b, w, d, .05, up + h - .05, hex);
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) box(a + sa * (w / 2 - .03), b + sb * (d / 2 - .03), .035, .035, h - .05, up, LEG);
      if (face) box(a - face[0] * (w / 2 - .02), b - face[1] * (d / 2 - .02), face[0] ? .04 : w, face[1] ? .04 : d, .42, up + h, hex);
    } else if (shape === 'stool') {
      // A round seat on a post with a foot ring.
      const radius = Math.min(w, d) / 2;
      post(a, b, radius, .07, up + h - .07, hex, 14); post(a, b, .03, h - .08, up + .01, '#8d9498'); post(a, b, radius * .8, .02, up, '#8d9498', 14); post(a, b, radius * .7, .02, up + h * .38, '#8d9498', 14);
    } else if (shape === 'bench') {
      // An upholstered seat on a plinth, with a back on the side away from the way it faces.
      box(a, b, w - .04, d - .04, h - .14, up, LEG); box(a, b, w, d, .14, up + h - .14, hex);
      if (face) box(a - face[0] * (w / 2 - .05), b - face[1] * (d / 2 - .05), face[0] ? .1 : w, face[1] ? .1 : d, .5, up + h, hex);
    } else if (thing.solid && h >= .84 && h <= 1.2 && up === 0 && Math.max(w, d) >= 1.2) {
      // A counter: a recessed kick at the floor and a top that overhangs a little.
      box(a, b, w - .06, d - .06, .1, 0, '#1b1d20'); box(a, b, w, d, h - .14, .1, hex); box(a, b, w + .06, d + .06, .04, h - .04, '#d9d4c8');
    } else box(a, b, w, d, h, up, hex);
  }
  // Display cases and teller windows share a transparent batch.
  surfaces.push([position.length/3,0]);
  for (const t of room.things) if (t.shape === 'showcase' || t.shape==='hotServery') {
    const [da,db] = t.face, w = db ? t.w : t.d, d = db ? t.d : t.w;
    const point = (u,v,up) => {
      const [x,z]=roomPoint(room,t.a+db*u+da*v,t.b-da*u+db*v);
      return [x,y+t.y+up,z];
    };
    const left=-w/2+.012, right=-left, front=d/2-.011, top=t.h-.014, base=t.more?.deck??Math.max(.045,t.h-.34);
    const quad=(a,b,c,e)=>paneVertices.push(...a,...b,...c,...a,...c,...e);
    if(t.shape==='hotServery'){
      const edge=d*.43, sill=t.more.countertop?.15:1.01;
      quad(point(left,edge,sill),point(right,edge,sill),point(right,edge,top),point(left,edge,top));
      quad(point(left,edge,top),point(right,edge,top),point(right,-d*.12,top),point(left,-d*.12,top));continue;
    }
    quad(point(left,front,base),point(right,front,base),point(right,front,top),point(left,front,top));
    quad(point(left,front,top),point(right,front,top),point(right,-front,top),point(left,-front,top));
  }
  let drawer, notes, takeArm;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  const tiles=new Uint8Array(position.length/3);
  surfaces.forEach(([start,id],i)=>tiles.fill(id,start,surfaces[i+1]?.[0]??tiles.length));
  geometry.setAttribute('surfaceTile',new THREE.BufferAttribute(tiles,1));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }); material.name = 'Room';
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = streetView; group.add(mesh);
  // Merchandise used during service has its own visibility. Bake it in the
  // same coordinates as the permanent fixtures so the street-window mask applies.
  const serviceMeshes=new Map();
  let foodMaterial=null,windowMask=null;
  function showProduct(fixture,shape,visible,item,level=2) {
    let product=serviceMeshes.get(fixture);
    if(product && (product.userData.shape!==shape || visible && (level!==product.userData.level || item?.name!==product.userData.order) || fixture.temporary && !visible || shape==='mealPlate' &&
      (item && product.userData.order!==item.name || (!visible && fixture.index!==undefined)))){
      product.removeFromParent();product.geometry.dispose();serviceMeshes.delete(fixture);product=null;
    }
    if(!product && visible){
      const positions=[],colors=[];
      const isMeal=shape==='mealPlate', isRing=shape==='ringSample';
      const uv=isRing?null:[];
      roomProps(room,y,positions,colors,uv).draw({shape,a:fixture.a+(isMeal?.1:0),b:fixture.b+(isRing?.08:0),
        w:.32,d:.28,h:.09,y:isRing?fixture.y+fixture.h-.314:isMeal?fixture.y+fixture.h+.022:fixture.y,face:fixture.face,color:'#ddba79',more:{dish:item?.preparation||item?.name||'',level}});
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,uv?4:3));
      if(uv){
        g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        if(!foodMaterial){
          foodMaterial=new THREE.MeshBasicMaterial({map:ingredientMap(),vertexColors:true,transparent:true,fog:false,side:THREE.DoubleSide});
          if(windowMask)foodMaterial.onBeforeCompile=windowMask;
          lightRoomSurface(foodMaterial,room,y,true);
        }
      }
      g.setAttribute('surfaceTile',new THREE.BufferAttribute(new Uint8Array(positions.length/3).fill(isRing?5:6),1));
      product=new THREE.Mesh(g,isRing?material:foodMaterial);product.name=isMeal?'Served plate':isRing?'Solitaire on display':'Drink at pickup';
      product.userData.shape=shape;product.userData.level=level;
      product.userData.order=item?.name;serviceMeshes.set(fixture,product);group.add(product);
    }
    if(product) product.visible=visible;
  }
  group.userData.drinkAt=(pickup,kind,visible,item,level=2)=>showProduct(pickup,kind==='mug'?'drinkMug':'paperCup',visible,item,level);
  group.userData.mealAt=(table,visible,item,level=2)=>showProduct(table,'mealPlate',visible,item,level);
  group.userData.mealRemaining=(table,item,level)=>showProduct(table,'mealPlate',true,item,level);
  group.userData.sampleAt=(display,visible)=>showProduct(display,'ringSample',visible);
  // What a cook has on the heat or under the knife, where they are working: `ware` null takes it away.
  group.userData.cookAt=(spot,ware,tone='#c98a4b')=>{
    const old=serviceMeshes.get(spot);
    if(old){old.removeFromParent();old.geometry.dispose();serviceMeshes.delete(spot);}
    if(!ware)return;
    const positions=[],colors=[];
    roomProps(room,y,positions,colors).draw({shape:'cookware',a:spot.a,b:spot.b,w:.34,d:.34,h:.3,y:spot.y,face:spot.face,color:tone,more:{ware,tone}});
    if(!positions.length)return;
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    g.setAttribute('surfaceTile',new THREE.BufferAttribute(new Uint8Array(positions.length/3).fill(5),1));
    const pan=new THREE.Mesh(g,material);pan.name='Cookware in use';pan.frustumCulled=mesh.frustumCulled;
    pan.userData.shape='cookware';pan.userData.ware=ware;serviceMeshes.set(spot,pan);group.add(pan);
  };
  if(room.style==='jewelry') for(const display of room.things.filter(t=>t.more?.items==='rings'))group.userData.sampleAt(display,true);
  // The menu, lettered, where the plan puts it. Drawn only where there is a page to draw on.
  let menuBoard = null;
  let releaseMenu;
  if (room.board && typeof document !== 'undefined') {
    const { a, b, w, h, up, lines } = room.board, canvas = document.createElement('canvas'), scale = 256;
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const context = canvas.getContext('2d');
    context.fillStyle = '#16181a'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.textBaseline = 'middle'; context.fillStyle = '#f2c230'; context.font = `800 ${Math.round(canvas.height * .15)}px Arial, sans-serif`; context.textAlign = 'center';
    context.fillText(room.name.slice(0, 34), canvas.width / 2, canvas.height * .12, canvas.width * .94);
    // Two columns where there is much to list.
    const columns = lines.length > 4 ? 2 : 1, rows = Math.ceil(lines.length / columns), rowHeight = canvas.height * .74 / rows, size = Math.min(canvas.height * .13, rowHeight * .72), columnWidth = canvas.width / columns;
    context.font = `600 ${Math.round(size)}px Arial, sans-serif`;
    lines.forEach(([name, price], i) => {
      const column = Math.floor(i / rows), x0 = column * columnWidth + canvas.width * .03, x1 = (column + 1) * columnWidth - canvas.width * .03, yy = canvas.height * .26 + (i % rows + .5) * rowHeight;
      context.textAlign = 'left'; context.fillStyle = '#f4f1e6'; context.fillText(name, x0, yy, (x1 - x0) * .76);
      context.textAlign = 'right'; context.fillStyle = '#f2c230'; context.fillText(`$${price.toFixed(2)}`, x1, yy);
    });
    const lettering = new THREE.CanvasTexture(canvas); lettering.colorSpace = THREE.SRGBColorSpace; lettering.anisotropy = 4;
    if(room.finish.counterService)releaseMenu=counterMenu(canvas,context,room,lettering);
    // Read from the door, the room's `a` runs to the right or to the left according to which way round its wall was drawn.
    const right = Math.sign(room.tx * room.nz - room.tz * room.nx) || 1, corner = (u, v) => { const [x, z] = roomPoint(room, a + (u - .5) * w * right, b); return [x, y + up + v * h, z]; };
    const plane = new THREE.BufferGeometry();
    plane.setAttribute('position', new THREE.Float32BufferAttribute([...corner(0, 0), ...corner(1, 0), ...corner(1, 1), ...corner(0, 0), ...corner(1, 1), ...corner(0, 1)], 3));
    plane.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    menuBoard = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: lettering, side: THREE.DoubleSide, fog: false })); menuBoard.name = 'Menu board'; menuBoard.frustumCulled = streetView; group.add(menuBoard);
  }
  let caseGlass;
  if (paneVertices.length) {
    const surface=new THREE.BufferGeometry();
    surface.setAttribute('position',new THREE.Float32BufferAttribute(paneVertices,3));
    caseGlass=new THREE.Mesh(surface,new THREE.MeshBasicMaterial({color:0xb4d9d9,opacity:.10,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false}));
    caseGlass.name='Display case glass'; group.add(caseGlass);
  }
  const terminal=till && checkoutScreens(room,till,y);
  if(terminal)group.add(terminal);
  const print=buildPharmacyPrint(room,y);
  if(print)group.add(print);
  const finish = buildRoomFinish(room, y);
  if (finish) group.add(finish);
  if (streetView) {
    group.name = 'Through the windows of ' + room.name;
    // Each exterior sightline must enter through a pane belonging to this
    // room. A customer already inside sees the whole room in the same mesh.
    const indoors = { value: 0 };
    group.userData.indoors = indoors;
    material.onBeforeCompile = shader => {
      shader.uniforms.shopInside = indoors;
      shader.uniforms.shopSkew = { value: room.skew || 0 };
      shader.uniforms.shopFront = { value: new THREE.Vector4(room.x, y, room.z, half) };
      shader.uniforms.shopAxes = { value: new THREE.Vector4(room.tx, room.tz, room.nx, room.nz) };
      shader.uniforms.shopReturns = { value: new THREE.Vector2(...[-1, 1].map(side => room.returns?.find(r => r.side === side)?.length || 0)) };
      const vars = 'varying vec3 vShopPoint; flat varying vec3 vShopEye; uniform vec4 shopFront;\n';
      shader.vertexShader = vars + 'uniform vec4 shopAxes; uniform float shopSkew;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 local = position - shopFront.xyz;
        vec3 eye = cameraPosition - ( modelMatrix * vec4( shopFront.xyz, 1.0 ) ).xyz;
        vShopPoint = vec3( dot( local.xz, shopAxes.xy ), local.y, dot( local.xz, shopAxes.zw ) );
        vShopEye = vec3( dot( eye.xz, shopAxes.xy ), eye.y, dot( eye.xz, shopAxes.zw ) );
        vShopPoint.x += shopSkew * vShopPoint.z; vShopEye.x += shopSkew * vShopEye.z;`);
      shader.fragmentShader = vars + 'uniform float shopInside; uniform vec2 shopReturns;\n' + SHOP_WINDOW_GLSL + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        bool insideEye = vShopEye.z <= 0.035 && abs(vShopEye.x) <= shopFront.w + 0.06;
        if (shopInside < 1.5 && (shopInside < 0.5 || !insideEye)) {
          vec3 ray = vShopEye - vShopPoint;
          float edge = -1.0;
          if (vShopEye.z > 0.0 && ray.z > 0.001) {
            vec2 pane = vShopPoint.xy - ray.xy * (vShopPoint.z / ray.z);
            edge = nycShopPane(pane, shopFront.w);
          }
          float signX = sign(vShopEye.x);
          float span = signX < 0.0 ? shopReturns.x : shopReturns.y;
          if (span > 0.0 && abs(vShopEye.x) > shopFront.w && ray.x * signX > 0.001) {
            vec3 hit = vShopPoint + ray * ((signX * shopFront.w - vShopPoint.x) / ray.x);
            edge = max(edge, nycShopPane(vec2(-hit.z - span * 0.5, hit.y), -span * 0.5));
          }
          if (edge <= 0.0) discard;
        }
        diffuseColor.rgb *= mix(0.94, 0.72, uNycNight);`);
    };
    windowMask=material.onBeforeCompile;
    if (menuBoard) menuBoard.material.onBeforeCompile = material.onBeforeCompile;
    if (caseGlass) caseGlass.material.onBeforeCompile = material.onBeforeCompile;
    if (finish) finish.material.onBeforeCompile = material.onBeforeCompile;
    if (print) print.material.onBeforeCompile = material.onBeforeCompile;
    if (terminal) terminal.material.onBeforeCompile = material.onBeforeCompile;
  } else {
    const lamp = new THREE.PointLight(room.light?.color ?? 0xfff1dc, room.light?.power ?? 60, room.depth * 2.5, 1.6), [lx, lz] = roomPoint(room, 0, room.depth / 2);
    lamp.position.set(lx, y + CEILING - .5, lz); group.add(lamp);
  }
  const artwork=buildShopPrint(room,y);
  if(artwork){
    for(const m of artwork.material){
      if(streetView)m.onBeforeCompile=material.onBeforeCompile;
      lightRoomSurface(m,room,y,true);
    }
    group.add(artwork);
  }
  const disposeMirrors=buildSalonMirrors(room,y,group,streetView?material.onBeforeCompile:null);
  const groceries=room.grocerySlots && buildGroceryDisplays(room,y,streetView?material.onBeforeCompile:null);
  if(groceries){group.add(groceries.group);group.userData.syncGroceries=groceries.sync;}
  lightRoomSurface(material,room,y);
  if(print)lightRoomSurface(print.material,room,y,true);
  if(finish)lightRoomSurface(finish.material,room,y,true);
  // Origin at the jamb. The rotation sign follows the footprint winding.
  const hinge = new THREE.Group(), leaf = new THREE.Group(), [hx, hz] = roomPoint(room, -DOOR / 2, 0);
  hinge.position.set(hx, y, hz); hinge.rotation.y = Math.atan2(-room.tz, room.tx); hinge.add(leaf); group.add(hinge);
  const frame = new THREE.MeshBasicMaterial({ color: 0x39434a });
  const glass = new THREE.MeshBasicMaterial({ color: 0x9fc8d5, transparent: true, opacity: .13, depthWrite: false });
  // One draw for the moving frame, one for its glass.
  const frameVertices = [];
  const block = (x, up, w, h, d) => {
    const pos = unitBox.attributes.position;
    for (let i=0; i<pos.count; i++) frameVertices.push(x+w*pos.getX(i), up+h*pos.getY(i), d*pos.getZ(i));
  };
  block(.026, 1.09, .052, 2.18, .045); block(DOOR - .026, 1.09, .052, 2.18, .045);
  block(DOOR / 2, .105, DOOR - .1, .21, .045); block(DOOR / 2, 2.145, DOOR - .1, .07, .045);
  block(DOOR - .13, 1.05, .035, .27, .14); unitBox.dispose();
  const frameGeometry = new THREE.BufferGeometry();
  frameGeometry.setAttribute('position', new THREE.Float32BufferAttribute(frameVertices, 3));
  leaf.add(new THREE.Mesh(frameGeometry, frame));
  const pane = new THREE.Mesh(new THREE.BoxGeometry(DOOR - .1, 1.9, .018), glass);
  pane.position.set(DOOR / 2,1.16,0); leaf.add(pane);
  const door = new ShopDoor();
  group.userData.door = door;
  group.userData.updateDoor = () => { leaf.rotation.y = (mirrored ? 1 : -1) * door.angle; };
  if (till) {
    const movingPart=(w,h,d,color)=>{
      const part=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color}));
      group.add(part);return part;
    };
    drawer=checkoutDrawer();group.add(drawer);
    notes=movingPart(.158,.028,.073,0x92aa83);notes.name='Cash from clerk';
    const band=new THREE.Mesh(new THREE.BoxGeometry(.034,.029,.075),new THREE.MeshBasicMaterial({color:0xe7dcc1}));
    notes.add(band);
    const [x,z]=roomPoint(room,till.a,till.b);
    const axes=checkoutAxes(room,till.da,till.db);
    const [tx,tz]=roomPoint(room,till.a+axes.va,till.b+axes.vb);
    const heading=Math.atan2(tx-x,tz-z);
    drawer.rotation.y=notes.rotation.y=heading;
    let slide=0;
    group.userData.updateTill=(open,cash,dt,hand,player,amount=0,receipt=null)=>{
      terminal?.userData.receipt(receipt);
      if(open)drawer.userData.showCash(amount);
      slide=THREE.MathUtils.damp(slide,open ? .25 : 0,12,dt);
      drawer.position.set(x+(.06+slide)*Math.sin(heading),y+till.up+.045,z+(.06+slide)*Math.cos(heading));
      notes.visible=Boolean(cash);
      if (cash) notes.position.set(cash.x,y+cash.y,cash.z);
      if (hand) {
        if (!takeArm) {
          takeArm=new THREE.Group(); takeArm.name='Reaching hand'; group.add(takeArm);
          const handModel=viewHand();
          handModel.group.rotation.set(0,0,-Math.PI/2);
          handModel.group.rotateX(Math.PI/2);
          takeArm.add(handModel.group);takeArm.userData.hand=handModel;
          const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.042,.069,1,10),new THREE.MeshBasicMaterial({color:0x4b5558}));
          group.add(sleeve);takeArm.userData.sleeve=sleeve;
        }
        takeArm.userData.hand.pose('pinch','index_03_l');
        const sleeve=takeArm.userData.sleeve, angle=Math.atan2(x-player.x,z-player.z);
        takeArm.position.set(hand.x,y+hand.y+.018,hand.z); takeArm.rotation.y=angle;
        const wrist=takeArm.position.clone().add(new THREE.Vector3(-.075*Math.sin(angle),0,-.075*Math.cos(angle)));
        const elbow=new THREE.Vector3(player.x+.23*Math.cos(angle),y+1.07,player.z-.23*Math.sin(angle));
        const towards=wrist.clone().sub(elbow);
        sleeve.scale.y=towards.length(); sleeve.position.copy(elbow).lerp(wrist,.5);
        sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),towards.normalize());
      }
      if (takeArm) takeArm.visible=takeArm.userData.sleeve.visible=Boolean(hand);
    };
    group.userData.updateTill(false,false,0);
  }
  group.userData.dispose = () => {
    takeArm?.userData.hand.dispose();
    for(const root of [drawer,notes,takeArm?.userData.sleeve])root?.traverse(part=>{part.geometry?.dispose();part.material?.dispose();});
    groceries?.dispose();
    disposeMirrors?.();
    if(artwork){artwork.geometry.dispose();for(const m of artwork.material)m.dispose();}
    for(const product of serviceMeshes.values())product.geometry.dispose();
    foodMaterial?.dispose();
    for (const part of leaf.children) part.geometry.dispose();
    if (caseGlass) { caseGlass.geometry.dispose(); caseGlass.material.dispose(); }
    releaseMenu?.();
    if (menuBoard) { menuBoard.geometry.dispose(); menuBoard.material.map.dispose(); menuBoard.material.dispose(); }
    terminal?.userData.dispose();
    if (print) { print.material.map.dispose(); print.material.dispose(); print.geometry.dispose(); }
    if (finish) { finish.material.map.dispose(); finish.material.dispose(); finish.geometry.dispose(); }
    frame.dispose(); glass.dispose(); geometry.dispose(); material.dispose(); group.removeFromParent();
  };
  return group;
}
