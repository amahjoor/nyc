// A serving by its key, as one mesh: `plate-<dish>`, `drink-<drink>`, or the
// house `cup` and `mug` of coffee, with `@1` part eaten and `@0` finished.
import { kitchen,bake } from './food-kit.js';
import { dishes } from './food-dishes.js';
import { drink,drinkIds } from './food-drinks.js';
import { portionBase,portionLevel } from './food-catalog.js';

const cache=new Map(),poured=new Set(drinkIds);
const dishOf=base=>base?.startsWith('plate-')?base.slice(6):null;
const drinkOf=base=>base==='cup'||base==='mug'?base:base?.startsWith('drink-')?base.slice(6):null;
export function isServing(key){
  const base=portionBase(key),pour=drinkOf(base);
  return Boolean(dishes[dishOf(base)] || pour && (pour==='cup' || pour==='mug' || poured.has(pour)));
}
export function servingGeometry(key){
  if(cache.has(key))return cache.get(key);
  const base=portionBase(key),bench=kitchen(base,portionLevel(key)),dish=dishOf(base);
  if(dish){
    if(!dishes[dish])throw Error('Missing dish geometry: '+dish);
    dishes[dish](bench);
  }else drink(bench,drinkOf(base));
  const made=bake(bench);cache.set(key,made);return made;
}
