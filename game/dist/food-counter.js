import { groceries,groceryPrice } from './grocery-stock.js';
import { pantryItem,diningTable,beverage,preparedFood,heldFood } from './shopping.js';
import { menuFor } from './menu.js';
import { startCounterOrder } from './facility-visits.js';
import { sharedShopPreview } from './shop-preview.js';
import { openTableService } from './table-service.js';

const money=n=>'$'+n.toFixed(2);
function basketContents(basket){
  const counts=new Map();
  for(const slot of basket.units)counts.set(slot.id,(counts.get(slot.id)||0)+1);
  return [...counts].map(([id,count])=>count+' × '+groceries[id].name).join(' · ');
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

export function openInventory(ctx){
  const {sim,interaction,save}=ctx,bag=sim.shopping;
  const list=()=>{
    const rows=Object.entries(bag.inventory).filter(([,n])=>n>0).map(([id,n])=>({name:pantryItem(id).name,note:'× '+n,id,product:groceries[id]}));
    if(bag.held)rows.push({name:'Put away held item',run:()=>{bag.setHand(null);save();}});
    const unpaid=bag.basket?.units.length||0;
    interaction.openList('Inventory',rows,row=>{
      if(row.run){row.run();return;}
      const item=pantryItem(row.id),available=()=>Boolean(bag.inventory[row.id]);
      const actions=[{name:'Hold in hand',disabled:Boolean(bag.eating),run:()=>{bag.setHand(row.id);save();}}];
      if(item.effect==='empty')actions.push({name:'Discard',run:()=>{bag.discard(row.id);save();}});
      else if(item.effect!=='pantry')actions.push({name:beverage(item)?'Drink':'Eat',disabled:Boolean(bag.eating),run:()=>{bag.consume(row.id,sim.doorway);save();}});
      inspect(ctx,item,actions,list,available,item.preparation||item.size||'');
    },{message:unpaid?'Unpaid basket · '+basketContents(bag.basket):rows.length?'':'Your bag is empty.'});
  };list();
}

export function openFoodCounter(ctx){
  const {sim,interaction,sale,save}=ctx,room=sim.room,view=sim.doorway,bag=sim.shopping;
  // Seated at a table, the key is for the server.
  if(openTableService(ctx))return true;
  if(view?.plan?.place.id!==room?.place.id || !view?.clerk || (!room?.grocerySlots && !['eat','bar'].includes(room?.kind)))return false;
  const place=room.place,available=()=>sim.room?.place===place && !view.closed && !view.handoff && !sim.player.armed;
  if(!available()){sim._say('The counter is closed.');return true;}
  if(bag.eating){sim._say('Finish your '+(bag.eating.drink?'drink':'food')+' to order again.');return true;}
  const o=bag.order;
  if(o){
    const ready=o.ready && (o.table?diningTable(sim,view)===o.table:Math.hypot(sim.player.x-o.employee.x,sim.player.z-o.employee.z)<2.65);
    const rows=[];
    if(ready){
      if(o.table)rows.push({name:'Pay and '+(beverage(o.food)?'drink':'eat'),note:money(o.price),run:()=>{
        if(bag.accept(o)){bag.consume(o.food.id,view);save(place.name);}
      }});
      rows.push({name:o.table?'Pay and take away':'Pay and collect',note:money(o.price),run:()=>{if(bag.accept(o,Boolean(o.table)))save(place.name);}});
      if(o.pack && !o.table && !o.packed)rows.push({name:'Ask for a bag to go',run:o.pack});
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
    for(const item of menu)rows.push({item,name:item.name,product:groceries[item.product],note:(item.preparation?item.preparation+' · ':'')+money(item.price),run:()=>{
      if(item.product || preparedFood(place,item)){
        if(startCounterOrder(sim,view,{item,sale}))sim._say(table?'Your server has your order.':'Order placed. Collect here or take a seat.',5);
      }else if(sim.buy(item)){sale(place,item.price);save(place.name);}
    }});
    if(near.length)rows.push({name:'Browse nearby shelf',run:shelves});
    const shift=atCounter && ctx.work?.counterShift(room);
    if(shift)rows.push(shift);
    interaction.openList(table?'Order at your table':place.name,rows,r=>r.run(),{...foodPreviewOptions(ctx.$),cash:sim.cash,message:bag.basket?'Unpaid basket · '+basketContents(bag.basket):'',available:()=>available() && (counterInReach(sim)||Boolean(diningTable(sim,view)))});
  }
  if(atCounter||table)counter();else if(near.length)shelves();
  else sim._say(room.grocerySlots?'Walk up to a stocked shelf or checkout.':'Order at the counter or take a seat at a table.');
  return true;
}
