// A ticket owns its griddle, basket, fountain and tray until the handoff.
const lines = {
  kitchen:{station:'Flat top', mains:['Beef patty','Black bean patty'], dishes:['Beef burger','Black bean burger'],
    finishes:['Cheddar','Pickles','Lettuce'], prep:'Toast bun and grill patty', turn:'Flip patty', lift:'Lift patty onto bun',
    dress:'Close bun with', sideStation:'Fryer', sides:['Fries','Onion rings'], lower:'Lower basket of', drain:'Drain and portion', drinks:['Cola','Lemonade','Iced tea']},
  pizza:{station:'Pizza oven', mains:['Thin dough','Sicilian dough'], dishes:['Thin crust pizza','Sicilian pizza'],
    finishes:['Basil','Parmesan','Oregano'], prep:'Stretch, sauce and load pie', turn:'Rotate the pie', lift:'Slide pie onto peel',
    dress:'Slice and finish with', sideStation:'Side oven', sides:['Garlic knots','Breadsticks'], lower:'Bake', drain:'Box', drinks:['Cola','Lemonade','Iced tea']},
  barista:{station:'Espresso bar', mains:['House beans','Decaf beans'], dishes:['House latte','Decaf latte'],
    finishes:['Oat milk','Whole milk','Soy milk'], prep:'Grind, tamp and lock basket', turn:'Stop shot and steam milk', lift:'Stop wand and lift pitcher',
    dress:'Finish latte with', sideStation:'Pastry warmer', sides:['Croissant','Cinnamon roll'], lower:'Warm', drain:'Bag', drinks:[]},
  bakery:{station:'Bake oven', mains:['White dough','Rye dough'], dishes:['White loaf','Rye loaf'],
    finishes:['Salted butter','Strawberry jam','Honey butter'], prep:'Shape, score and load loaf', turn:'Turn baking tray', lift:'Move loaf to cooling rack',
    dress:'Slice and pack with', sideStation:'Pastry warmer', sides:['Croissant','Cinnamon roll'], lower:'Warm', drain:'Bag', drinks:[]},
};
export const kitchenRole = kind => ({burgers:'kitchen',pizza:'pizza',coffee:'barista',bakery:'bakery'})[kind];
export const hasKitchen = job => Object.hasOwn(lines,job);
const names=['Ren','Lena','Dev','Casey','Amara','Jo','Eli','Nina'];
export function kitchenTicket(shift){
  const menu=lines[shift.job], n=(shift.seed+shift.block)>>>0;
  const main=n%menu.mains.length, finish=(Math.floor(shift.seed/7)+shift.block)%menu.finishes.length;
  const side=(Math.floor(shift.seed/13)+shift.block)%menu.sides.length;
  const drink=menu.drinks.length?(Math.floor(shift.seed/5)+2*shift.block)%menu.drinks.length:-1;
  // The grill also gets sandwich-only and side-and-drink orders during the rush.
  const wantsMain=shift.job!=='kitchen' || shift.block!==2;
  const wantsSide=shift.job!=='kitchen' || shift.block!==1;
  const wantsDrink=drink>=0 && (wantsSide || shift.seed%2===0);
  return {menu,main,finish,side,drink,wantsMain,wantsSide,wantsDrink,customer:names[n%names.length],number:100+n%900,
    dish:menu.dishes[main],garnish:menu.finishes[finish],sideName:menu.sides[side],drinkName:menu.drinks[drink]};
}
export function kitchenState(saved={}){
  saved=saved || {};
  const stage=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max?n:0;
  const timer=n=>Number.isFinite(n)?Math.max(0,Math.min(15,n)):0;
  return {main:stage(saved.main,5),side:stage(saved.side,2),drink:stage(saved.drink,2),
    heat:timer(saved.heat),fry:timer(saved.fry),fill:timer(saved.fill),clean:saved.clean!==false};
}
export function heatLine(clock,target){
  return clock<target?'Working':clock<=target+3?'Ready':'Over';
}
export function advanceKitchen(k,dt){
  if(k.main===2 || k.main===3)k.heat=Math.min(15,k.heat+dt);
  if(k.side===1)k.fry=Math.min(15,k.fry+dt);
  if(k.drink===1)k.fill=Math.min(15,k.fill+dt);
}
export function kitchenActions(t,k,station){
  const {menu}=t;
  const rows=[];
  if(station==='main' && !t.wantsMain || station==='side' && !t.wantsSide || station==='drink' && !t.wantsDrink)return rows;
  function action(name,run){rows.push({name,run});}
  function select(items,expected,verb,next){
    for(const [i,item] of items.entries())action(verb+' '+item,()=>{
      if(i!==expected){k.clean=false;return 'Check the ticket. '+item+' is for a different order.';}
      next();return '';
    });
  }
  function timed(clock,target,next){
    if(clock<target)return 'Give it a moment. Watch for the green band.';
    if(clock>target+3)k.clean=false;
    next();
    return clock>target+3?'Past the green band. This ticket loses its quality bonus.':'';
  }
  if(station==='main'){
    if(k.main===0)select(menu.mains,t.main,'Take',()=>k.main=1);
    if(k.main===1)action(menu.prep,()=>{k.main=2;k.heat=0;});
    if(k.main===2 || k.main===3)action(k.main===2?menu.turn:menu.lift,()=>timed(k.heat,3,()=>{k.main++;k.heat=0;}));
    if(k.main===4)select(menu.finishes,t.finish,menu.dress,()=>k.main=5);
  }else if(station==='side'){
    if(k.side===0)select(menu.sides,t.side,menu.lower,()=>{k.side=1;k.fry=0;});
    if(k.side===1)action(menu.drain+' '+t.sideName,()=>timed(k.fry,4,()=>k.side=2));
  }else if(station==='drink'){
    if(k.drink===0)select(menu.drinks,t.drink,'Fill cup with',()=>{k.drink=1;k.fill=0;});
    if(k.drink===1)action('Release tap and lid cup',()=>timed(k.fill,2,()=>k.drink=2));
  }
  return rows;
}
export function trayReady(t,k){return (!t.wantsMain || k.main===5) && (!t.wantsSide || k.side===2) && (!t.wantsDrink || k.drink===2);}
