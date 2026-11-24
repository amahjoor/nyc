// A serving by its key, as one mesh: `plate-<dish>`, `drink-<drink>`, or the
// house `cup` and `mug` of coffee, with a suffix for the amount left.
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
  const base=portionBase(key),level=portionLevel(key),bench=kitchen(base,level>0?2:0,level/2),dish=dishOf(base);
  if(dish){
    if(!dishes[dish])throw Error('Missing dish geometry: '+dish);
    dishes[dish](bench);
  }else drink(bench,drinkOf(base));
  const made=bake(bench,{progressive:Boolean(dish)});cache.set(key,made);return made;
}
