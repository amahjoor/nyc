import { groceries,groceryPrice } from './grocery-stock.js';
import { pantryItem,diningTable,beverage,preparedFood,heldFood } from './shopping.js';
import { isWrappedServing,isSliceServing } from './food-catalog.js';
import { bowls } from './food-dishes-bowls.js';
import { handheld } from './food-dishes-handheld.js';
import { sweets } from './food-dishes-sweets.js';
import { menuFor,plateStyle } from './menu.js';
import { startCounterOrder } from './facility-visits.js';
import { sharedShopPreview } from './shop-preview.js';
import { openTableService } from './table-service.js';

const money=n=>'$'+n.toFixed(2);
const stepName=item=>beverage(item)?'Take a sip':'Take a bite';
const finishName=item=>beverage(item)?'Finish drink':'Finish food';
function basketContents(basket){
  const counts=new Map();
  for(const slot of basket.units)counts.set(slot.id,(counts.get(slot.id)||0)+1);
  return [...counts].map(([id,count])=>count+' × '+groceries[id].name).join(' · ');
}
function paymentNote(bag,place){
  if(!place || bag.basket?.shop!==place.id)return '';
  const contents=basketContents(bag.basket),due=bag.charges(place);
  return [contents && 'Unpaid basket · '+contents,due && 'Payment due '+money(due)].filter(Boolean).join(' · ');
}
export function counterInReach(sim){
  const room=sim.room,reg=room?.register;
  if(!reg)return false;
  const da=room.a-reg.a,db=room.b-reg.b;
  return Math.hypot(da,db)<1.65;
}
function foodPreview($){
  const el=$('shop-preview'),status=$('mirror-status');
  let mirror,current,timer;
  function close(){clearTimeout(timer);current=null;mirror?.close();el.hidden=true;}
  function show(item,fromMenu=false){
    if(!item){close();return;}
    if(current===item)return;
    clearTimeout(timer);current=item;
    const carry=heldFood(item);
    if(!carry){close();return;}
    el.hidden=false;status.textContent='Loading…';
    try{
      mirror=sharedShopPreview($('shop-mirror'));
      $('mirror-left').onclick=()=>mirror.rotate(-.32);$('mirror-right').onclick=()=>mirror.rotate(.32);
      $('mirror-closer').onclick=()=>mirror.zoom(1.18);$('mirror-farther').onclick=()=>mirror.zoom(1/1.18);
      mirror.show({...item,model:'serving',carry},null).then(()=>{
        if(current===item)status.textContent=(fromMenu?(item.preparation||item.name)+' · ':'')+'Drag to rotate · Scroll to zoom';
      }).catch(()=>{if(current===item)status.textContent=item.size||'';});
    }catch{el.hidden=true;}
  }
  function focus(row){
    const item=groceries[row.item?.product]||row.item;
    clearTimeout(timer);
    if(!item || !heldFood(item)){close();return;}
    timer=setTimeout(()=>{show(item,true);document.activeElement?.closest?.('#interaction-options button')?.scrollIntoView?.({block:'nearest'});},100);
  }
  return {show,options:{onFocus:focus,onRotate:angle=>mirror?.rotate(angle),onClose:close}};
}
export const foodPreviewOptions=$=>foodPreview($).options;
function inspect(ctx,item,rows,back,available,message){
  const preview=foodPreview(ctx.$);
  const {onRotate,onClose}=preview.options;
  ctx.interaction.openList(item.name,[...rows,{name:'Back',run:back}],row=>row.run(),{message,available,onRotate,onClose});
  preview.show(item);
}

const servingIcons=Object.fromEntries([
  ['🍕',['pizza','pizza-pepperoni','pizza-sicilian','pizza-white','pizza-combo','pizza-margherita']],
  ['🍔',['burger','burger-deluxe','burger-double','bacon-burger','sliders']],
  ['🌭',['hot-dog','bratwurst']], ['🌮',['taco','tacos']], ['🌯',['burrito','gyro','shawarma']],
  ['🍟',['fries','fish-chips']], ['🍗',['fried-chicken','wings','tenders']],
  ['🍝',['pasta','meatballs','alfredo','lasagna','lo-mein']], ['🍣',['sushi','nigiri','kimbap','onigiri']],
  ['🥗',['greek-salad','caprese','caesar','wedge-salad','papaya-salad']],
  ['🍦',['cone','soft-serve','sundae','ice-cream-cup','banana-split','ice-cream-sandwich','italian-ice']],
  ['🍩',['doughnut','doughnut-chocolate','doughnut-sprinkle','doughnut-jelly','boston-cream','doughnut-box']],
  ['🍌',['banana']], ['🍊',['oranges']], ['🍎',['fruit']], ['🍫',['chocolate']], ['🍿',['popcorn']],
  ['☕',['cup','drink-espresso','drink-latte','drink-cappuccino','drink-matcha','drink-hot-chocolate']],
  ['🍵',['drink-tea','drink-green-tea','drink-barley-tea','drink-chai']], ['🧋',['drink-boba']],
  ['🍺',['drink-beer','drink-stout','drink-ginger-beer']], ['🍷',['drink-red-wine','drink-white-wine']],
  ['🍸',['drink-cocktail','drink-martini','drink-margarita','drink-mojito','drink-old-fashioned','drink-whiskey','drink-vodka-soda','drink-shot']],
  ['🍾',['drink-wine','drink-champagne','drink-sake','drink-soju']],
].flatMap(([icon,models])=>models.map(model=>[model,icon])));

function inventoryIcon(item,source){
  const model=heldFood(source);
  if(beverage(source))return servingIcons[model]||'🥤';
  if(item.effect==='empty')return isWrappedServing(model)?'📄':source.toGo && !isSliceServing(plateStyle(source.preparation||source.name))?'📦':'🍽️';
  const dish=model?.startsWith('plate-')?model.slice(6).replace(/^togo-/,''):null;
  if(servingIcons[dish])return servingIcons[dish];
  if(Object.hasOwn(bowls,dish))return '🍲';
  if(Object.hasOwn(sweets,dish))return '🍰';
  if(Object.hasOwn(handheld,dish))return '🥪';
  return '🍛';
}

export function openInventory(ctx){
  const {sim,interaction,save,sale}=ctx,bag=sim.shopping;
  const list=()=>{
    const rows=[];
    for(const [id,count] of Object.entries(bag.inventory)){
      const item=pantryItem(id);
      if(!item || !(count>0))continue;
      const empty=item.effect==='empty', source=item.source?pantryItem(item.source):item;
      const product=groceries[source.id];
      rows.push({name:item.name,note:'× '+count+(source.toGo?' · To go':'')+(item.remaining?' · '+item.remaining+(beverage(item)?' sips':' bites')+' left':''),item,product,icon:product?null:inventoryIcon(item,source),empty});
    }
    if(bag.eating)rows.unshift({name:bag.eating.drink?'Stop drinking':'Stop eating',run:()=>{bag.clearEating();save();}});
    else if(bag.held)rows.push({name:'Put away held item',run:()=>{bag.setHand(null);save();}});
    if(sim.room && bag.basket?.shop===sim.room.place.id)for(const id of new Set(bag.basket.units.map(slot=>slot.id))){
      const item=groceries[id];
      if(item.effect==='pantry')continue;
      rows.push({name:item.name,note:'Unpaid',product:item,item,unpaid:true});
    }
    const message=paymentNote(bag,sim.room?.place) || (rows.length?'':'Your bag is empty.');
    interaction.openList('Inventory',rows,row=>{
      if(row.run){row.run();return;}
      const {item}=row,available=()=>row.unpaid?bag.basket?.units.some(slot=>slot.id===item.id):Boolean(bag.inventory[item.id]);
      const actions=row.unpaid?[]:[{name:'Hold in hand',disabled:Boolean(bag.eating),run:()=>{bag.setHand(item.id);save();}}];
      if(item.effect==='empty')actions.push({name:'Discard',run:()=>{bag.discard(item.id);save();}});
      else if(item.effect!=='pantry'){
        const eat=finish=>()=>{
          if(row.unpaid?bag.eatFromBasket(item.id,sim.doorway,finish,sale):bag.consume(item.id,sim.doorway,finish))save();
        };
        actions.push({name:stepName(item),disabled:Boolean(bag.eating),run:eat(false)});
        if(item.remaining!==1)actions.push({name:finishName(item),disabled:Boolean(bag.eating),run:eat(true)});
      }
      inspect(ctx,item,actions,list,available,item.preparation||item.size||'');
    },{message});
  };list();
}

export function openFoodCounter(ctx){
  const {sim,interaction,sale,save}=ctx,room=sim.room,view=sim.doorway,bag=sim.shopping;
  // Seated at a table, the key is for the server.
  if(openTableService(ctx))return true;
  if(view?.plan?.place.id!==room?.place.id || !view?.clerk || (!room?.grocerySlots && !['eat','bar'].includes(room?.kind)))return false;
  const place=room.place,available=()=>sim.room?.place===place && !view.closed && !view.handoff && !sim.player.armed;
  if(!available()){sim._say('The counter is closed.');return true;}
  if(bag.eating){
    interaction.openList(bag.eating.item.name,[{name:bag.eating.drink?'Stop drinking':'Stop eating',run:()=>bag.clearEating()}],row=>row.run(),{available:()=>available() && Boolean(bag.eating)});
    return true;
  }
  const o=bag.order;
  if(o){
    const ready=o.ready && (o.table?diningTable(sim,view)===o.table:Math.hypot(sim.player.x-o.employee.x,sim.player.z-o.employee.z)<2.65);
    const rows=[];
    if(ready){
      if(o.table && o.food)rows.push({name:'Pay and '+(beverage(o.food)?'take a sip':'take a bite'),note:money(o.price),run:()=>{
        if(bag.accept(o)){bag.consume(o.food.id,view,false);save(place.name);}
      }});
      rows.push({name:o.table?'Pay and take away':o.pack && !o.packed?'Pay and eat here':'Pay and collect',note:money(o.price),run:()=>{if(bag.accept(o,Boolean(o.table)))save(place.name);}});
      if(!o.basket)rows.push({name:'Collect and pay later',note:money(o.price)+' due',run:()=>{if(bag.accept(o,Boolean(o.table),true))save(place.name);}});
      if(o.pack && !o.table && !o.packed)rows.push({name:'Pack my order to go',run:o.pack});
    }
    rows.push({name:'Keep waiting',run:()=>{}},{name:'Cancel order',run:()=>bag.cancelOrder()});
    interaction.openList(o.label,rows,r=>r.run(),{cash:sim.cash,message:o.phase,available});return true;
  }
  const near=bag.shelf(room),atCounter=counterInReach(sim),table=diningTable(sim,view);
  function shelves(){
    const rows=[];
    for(const id of new Set(near.map(s=>s.id))){
      const item=groceries[id],stock=near.filter(s=>s.id===id && !bag.missing(place.id,s.index));
      const canReturn=bag.basket?.units.some(unit=>unit.id===id && near.some(slot=>slot.index===unit.index));
      rows.push({name:item.name,product:item,note:money(groceryPrice(place,item))+' · '+(stock.length?'On shelf':'Sold out'),run:()=>{
        const next=()=>bag.shelf(room).find(s=>s.id===id && !bag.missing(place.id,s.index));
        const actions=[{name:'Add to basket',disabled:!stock.length,run:()=>{if(bag.take(room,next()))sim._say(item.name+' • Basket '+money(bag.total(place)));}}];
        if(item.effect!=='pantry')actions.push({name:stepName(item)+' before checkout',disabled:!stock.length && !canReturn,run:()=>{
          if(canReturn || bag.take(room,next())){if(bag.eatFromBasket(id,view,false,sale))save();}
        }});
        if(canReturn)actions.push({name:'Return one to shelf',run:()=>{bag.putBack(room,id);}});
        inspect(ctx,item,actions,shelves,()=>available() && bag.shelf(room).some(s=>s.id===id),item.size+' · '+money(groceryPrice(place,item)));
      }});
    }
    if(atCounter)rows.push({name:'Go to checkout',run:counter});
    interaction.openList('Shop the shelf',rows,r=>r.run(),{message:bag.basket?'Unpaid basket · '+money(bag.total(place)):'',available:()=>available() && bag.shelf(room).length>0});
  }
  function counter(){
    const menu=menuFor(place),rows=[];
    if(bag.basket?.units.length)rows.push({name:'Check out basket',note:bag.basket.units.length+' items · '+money(bag.total(place)),run:()=>{
      if(startCounterOrder(sim,view,{basket:true,sale}))sim._say('The clerk is scanning your basket.');
    }});
    else if(bag.charges(place))rows.push({name:'Pay outstanding bill',note:money(bag.charges(place)),run:()=>{if(bag.payCharges(place))save(place.name);}});
    for(const item of menu)rows.push({item,name:item.name,product:groceries[item.product],note:(item.preparation?item.preparation+' · ':'')+money(item.price),run:()=>{
      if(item.product || preparedFood(place,item)){
        if(startCounterOrder(sim,view,{item,sale}))sim._say(table?'Your server has your order.':'Order placed. Collect here or take a seat.',5);
      }else if(sim.buy(item,{sale}))save(place.name);
    }});
    if(near.length)rows.push({name:'Browse nearby shelf',run:shelves});
    const shift=atCounter && ctx.work?.counterShift(room);
    if(shift)rows.push(shift);
    interaction.openList(table?'Order at your table':place.name,rows,r=>r.run(),{...foodPreviewOptions(ctx.$),cash:sim.cash,message:paymentNote(bag,place),available:()=>available() && (counterInReach(sim)||Boolean(diningTable(sim,view)))});
  }
  if(atCounter||table)counter();else if(near.length)shelves();
  else sim._say(room.grocerySlots?'Walk up to a stocked shelf or checkout.':'Order at the counter or take a seat at a table.');
  return true;
}
