import test from 'node:test';
import { Scene,Triangle,Vector3 } from '../dist/vendor/three.module.min.js';
import { createContainerTosses } from '../dist/carried-items.js';
import { kitchen } from '../dist/food-kit.js';
import { orangeBag } from '../dist/food-fruit.js';
import { drink } from '../dist/food-drinks.js';
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

test('orange bag net clears the fruit in both filled states',()=>{
  const triangle=new Triangle(),closest=new Vector3();
  for(const [level,count] of [[2,5],[1,2]]){
    const bench=kitchen('plate-oranges',level);
    orangeBag(bench);
    const oranges=bench.parts.filter(part=>!part.ware && part.top-part.bottom>4);
    const bag=bench.parts.filter(part=>part.ware);
    assert.equal(oranges.length,count);
    for(const orange of oranges){
      const center=new Vector3(orange.cx,(orange.top+orange.bottom)/2,orange.cz);
      let radius=0,clearance=Infinity;
      for(let i=0;i<orange.pos.length;i+=3)radius=Math.max(radius,center.distanceTo(closest.fromArray(orange.pos,i)));
      for(const part of bag)for(let i=0;i<part.count;i+=3){
        const offset=j=>3*(part.idx?part.idx[i+j]:i+j);
        triangle.a.fromArray(part.pos,offset(0));triangle.b.fromArray(part.pos,offset(1));triangle.c.fromArray(part.pos,offset(2));
        if(triangle.getArea()<1e-8)continue;
        clearance=Math.min(clearance,center.distanceTo(triangle.closestPointToPoint(center,closest)));
      }
      assert.ok(clearance>=radius,`bag level ${level} penetrates the orange at ${orange.cx}, ${orange.cz}`);
    }
  }
});

test('each sip lowers wine inside the same glass',()=>{
  const glass=[],surface=[];
  for(const amount of [1,.75,.5,.25,0]){
    const bench=kitchen('drink-red-wine',amount?2:0,amount);
    drink(bench,'red-wine');
    glass.push(bench.parts.filter(part=>part.ware).map(part=>part.pos));
    surface.push(bench.parts.find(part=>!part.ware)?.top||0);
  }
  for(let i=1;i<surface.length;i++){
    assert.deepEqual(glass[i],glass[0]);
    assert.ok(surface[i]<surface[i-1]);
  }
});

test('successive bites cut into the same doughnut without moving what is untouched',()=>{
  let edge=Infinity,back;
  for(const level of [2,4/3,2/3]){
    const {position}=servingGeometry(portionKey('plate-doughnut',level)).attributes;
    let left=Infinity,right=-Infinity;
    for(let i=0;i<position.count;i++){
      if(position.getY(i)<.015)continue;
      left=Math.min(left,position.getX(i));
      right=Math.max(right,position.getX(i));
    }
    back??=left;
    assert.equal(left,back);
    assert.ok(Number.isFinite(right) && right<edge);
    edge=right;
  }
});

test('the same bottle shows four distinct liquid levels and keeps its label',()=>{
  let last=Infinity;
  const label=[];
  for(const level of [2,1.5,1,.5,0]){
    const {position,color,uv}=packageGeometry('grocery-water',false,level).attributes;
    let height=0;
    const printed=[];
    for(let i=0;i<position.count;i++){
      if(Math.abs(color.getW(i)-.68)<.01)height=Math.max(height,position.getY(i));
      if(uv.getX(i)!==uv.getX(0)||uv.getY(i)!==uv.getY(0))printed.push(position.getX(i),position.getY(i),position.getZ(i));
    }
    assert.ok(height<last);
    last=height;label.push(printed);
  }
  assert.ok(label[0].length>0);
  for(const printed of label.slice(1))assert.deepEqual(printed,label[0]);
});

test('a tossed wrapper stops at the shop wall and lands on the counter in that room',()=>{
  const scene=new Scene(),tosses=createContainerTosses(scene,1,()=>0,()=>false);
  const room={x:0,z:0,nx:0,nz:-1,tx:1,tz:0,width:5,depth:3,floor:10,place:{id:'bakery'},
    things:[{solid:true,a:0,b:2.4,w:2,d:1.2,h:.8}]};
  tosses.toss('plate-togo-doughnut@0',new Vector3(0,11.2,1.6),0,room);
  const wrapper=scene.children[0];
  for(let i=0;i<120;i++)tosses.update(1/60,room);
  assert.ok(wrapper.position.z>2.8 && wrapper.position.z<=3);
  assert.ok(Math.abs(wrapper.position.y-10.8)<.02);
  tosses.update(1/60,null);assert.equal(wrapper.visible,false);
  tosses.update(1/60,room);assert.equal(wrapper.visible,true);
});

test('takeout uses different ware for pastries, entrees and pies while slice orders retain their paper plates',()=>{
  for(const level of [2,1,0]){
    const model=(style,packed)=>hash(servingGeometry(portionKey((packed?'plate-togo-':'plate-')+style,level)));
    for(const style of ['doughnut','pasta','wonton-soup','pizza-margherita'])assert.notEqual(model(style,true),model(style,false),style);
    for(const style of ['pizza','pizza-pepperoni','pizza-white','pizza-sicilian','pizza-combo'])assert.equal(model(style,true),model(style,false),style);
  }
  assert.match(pantryItem('empty-togo-meal-pizza-slice').name,/paper plate/);
  assert.match(pantryItem('empty-togo-meal-pizza-margherita-pie').name,/pizza box/);
});
