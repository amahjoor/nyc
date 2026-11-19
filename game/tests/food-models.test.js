import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { KINDS } from '../dist/places.js';
import { menuFor } from '../dist/menu.js';
import { foodId,pantryItem,heldFood } from '../dist/shopping.js';
import { servingFor,portionKey } from '../dist/food-catalog.js';
import { servingGeometry } from '../dist/serving-models.js';
import { packageGeometry } from '../dist/grocery-models.js';

const hash=geo=>createHash('sha256').update(Buffer.from(geo.attributes.position.array.buffer)).update(Buffer.from(geo.attributes.color.array.buffer)).digest('hex');
test('every food and drink in the city menus has buildable full, partial and empty models',()=>{
  const tested=new Set();
  for(const {id:kind} of KINDS)for(const item of menuFor({kind})){
    const edible=['meal','pep','drink'].includes(item.effect) || ['Bottle of wine','Loaf of rye'].includes(item.name);
    if(item.effect==='pantry'){
      assert.equal(heldFood(pantryItem(item.product)),item.product);
      assert.ok(packageGeometry(item.product).attributes.position.count>0);
    }
    if(!edible || ['Pre-roll','Day pass'].includes(item.name))continue;
    const id=foodId({kind},item),food=pantryItem(id),key=item.product||servingFor(item);
    assert.ok(key && food,kind+' '+item.name);assert.equal(heldFood(food),key);
    if(tested.has(key))continue;tested.add(key);
    const shapes=new Set();
    for(const level of [2,1,0]){
      const geo=item.product?packageGeometry(key,false,level):servingGeometry(portionKey(key,level));
      geo.computeBoundingBox();const {min,max}=geo.boundingBox;
      assert.ok([min.x,min.y,min.z,max.x,max.y,max.z].every(Number.isFinite),key);
      assert.ok(max.y-min.y>.002 && max.x-min.x>.015 && max.x-min.x<.50,key);
      shapes.add(hash(geo));
    }
    assert.equal(shapes.size,3,item.name+' has three physically distinct serving states');
  }
  assert.ok(tested.size>90);
  assert.equal(servingFor('Two slices and a soda'),'plate-pizza-combo');
  assert.equal(servingFor('Cover charge'),null);
  assert.equal(heldFood(pantryItem('meal-seafood-dinner')),'plate-grilled-salmon');
  assert.equal(heldFood(pantryItem('meal-kosher-1')),'plate-pastrami');
  assert.equal(heldFood(pantryItem('meal-bbq-lunch-special')),'plate-bbq-ribs');
});
