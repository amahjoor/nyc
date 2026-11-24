// A serving by its key, as one mesh: `plate-<dish>`, `drink-<drink>`, or the
// house `cup` and `mug` of coffee, with a suffix for the amount left.
import { kitchen,bake } from './food-kit.js';
import { dishes } from './food-dishes.js';
import { drink,drinkIds } from './food-drinks.js';
import { portionBase,portionLevel,portionKey,isSliceServing } from './food-catalog.js';

const cache=new Map(),poured=new Set(drinkIds);
const dishOf=base=>base?.startsWith('plate-')?base.slice(6).replace(/^(togo|hand)-/,''):null;
const drinkOf=base=>base==='cup'||base==='mug'?base:base?.startsWith('drink-')?base.slice(6).replace(/^(togo|hand)-/,''):null;
export function isServing(key){
  const base=portionBase(key),pour=drinkOf(base);
  return Boolean(dishes[dishOf(base)] || pour && (pour==='cup' || pour==='mug' || poured.has(pour)));
}
export function servingGeometry(key){
  if(cache.has(key))return cache.get(key);
  const base=portionBase(key),level=portionLevel(key),dish=dishOf(base);
  const takeaway=base.startsWith('plate-togo-');
  // A slice shop uses the same paper plate for both orders, including the leftovers.
  if(takeaway && isSliceServing(dish))return servingGeometry(portionKey('plate-'+dish,level));
  const bench=kitchen(dish?'plate-'+dish:base,level>0?2:0,level/2);
  if(dish){
    if(!dishes[dish])throw Error('Missing dish geometry: '+dish);
    bench.takeaway=takeaway;
    dishes[dish](bench);
    // At a table the plate is a separate prop while a pastry is lifted to the mouth.
    if(base.startsWith('plate-hand-'))bench.parts=bench.parts.filter(part=>!part.ware);
  }else drink(bench,drinkOf(base));
  const made=bake(bench,{progressive:Boolean(dish)});cache.set(key,made);return made;
}
