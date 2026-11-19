// Simulated trading profiles. Ticket sizes are in game dollars. Bank fees on
// the player menu are not the principal that passes across a teller counter.
import { KIND, isOpen } from './places.js';
import { menuFor } from './menu.js';

const designer=/\b(?:GUCCI|PRADA|CHANEL|HERMES|DIOR|LOUIS VUITTON|SAINT LAURENT|BALENCIAGA|BOTTEGA VENETA|BURBERRY|FENDI|VALENTINO|LOEWE|BALMAIN|MIU MIU)\b/i;
const profiles={
  // Daily transactions, typical basket, cash share, opening change.
  bank:[34,265,.88,570], designer:[19,290,.18,150], jewelry:[15,185,.23,130],
  apparel:[26,51,.24,64], cafe:[69,7,.36,34], food:[49,14,.32,39],
  dining:[30,30,.23,48], grocery:[75,13,.38,55], market:[96,22,.26,80],
  appointment:[16,43,.30,48], retail:[35,23,.27,46],
};
const profileCache=new WeakMap();
function profileFor(shop){
  const group=KIND[shop.kind]?.group, name=String(shop.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(shop.kind==='bank')return 'bank';
  if(['clothes','shoes','bags','jewelry','department','secondhand','watches'].includes(shop.kind) && designer.test(name))return 'designer';
  if(shop.kind==='jewelry')return 'jewelry';
  if(['clothes','shoes','bags','department'].includes(shop.kind))return 'apparel';
  if(shop.kind==='bodega')return 'grocery';
  if(['supermarket','grocery'].includes(shop.kind))return 'market';
  if(['beauty','barber'].includes(group))return 'appointment';
  if(group==='bar')return 'dining';
  return profiles[group]?group:'retail';
}

function tradingProfile(shop){
  const cached=profileCache.get(shop);
  if(cached && cached.id===shop.id && cached.kind===shop.kind && cached.name===shop.name && cached.area===shop.area)return cached;
  const type=profileFor(shop), [customers,basket,share,change]=profiles[type];
  const prices=menuFor(shop).map(i=>i.price).filter(p=>p>0).sort((a,b)=>a-b);
  const middle=prices[Math.floor(prices.length/2)]||basket;
  const ticket=['bank','designer'].includes(type)?basket:.78*basket+.22*Math.min(basket*2,middle);
  let h=2166136261;
  for(const c of String(shop.id))h=Math.imul(h^c.charCodeAt(0),16777619);
  const demand=.87+.26*((h>>>0)%997)/996;
  const areaFactor=shop.area>0?Math.max(.85,Math.min(1.18,1+Math.log(shop.area/1200)*.05)):1;
  const cumulative=[0];
  for(let i=0;i<48;i++)cumulative.push(cumulative[i]+Number(isOpen(shop.kind,(i+.5)/2)));
  const value={id:shop.id,kind:shop.kind,name:shop.name,area:shop.area,seed:h,gross:customers*ticket*demand*areaFactor,share,change:change*demand,cumulative};
  profileCache.set(shop,value);return value;
}

// Repeatable tender selection for simulated pedestrians. Player purchases use
// the tender supplied by their actual payment path.
export function customerUsesCash(shop,day,previousCents){
  let h=Math.imul((day+1)^previousCents,0x9e3779b1);
  for(const c of String(shop.id))h=Math.imul(h^c.charCodeAt(0),16777619);
  h=Math.imul(h^(h>>>16),0x85ebca6b);
  return ((h^(h>>>13))>>>0)/4294967296<tradingProfile(shop).share;
}

function backgroundSales(profile,day){
  let h=profile.seed^Math.imul(day+1,0x9e3779b1);
  h=Math.imul(h^(h>>>16),0x85ebca6b);
  return profile.gross*(.76+.48*((h^(h>>>13))>>>0)/4294967296);
}

// History contains additional, completed transactions in cents. Unloaded
// branches trade in the background without allocating a ledger for every POI.
export function drawerBalance(shop,day,minute,days,cash){
  const p=tradingProfile(shop);
  const previous=(days||[]).filter(([d])=>d<day && d>=day-7);
  if(p.forecastDay!==day){
    let week=0;
    for(let d=day-7;d<day;d++)week+=backgroundSales(p,d);
    p.forecastDay=day;p.weekAverage=week/7;p.today=backgroundSales(p,day);
  }
  const average=p.weekAverage+previous.reduce((sum,row)=>sum+row[1],0)/700;
  const slot=Math.min(47,Math.floor(minute/30)), elapsed=p.cumulative[slot]+(p.cumulative[slot+1]-p.cumulative[slot])*(minute%30)/30;
  const progress=elapsed/Math.max(1,p.cumulative[48]);
  const float=Math.round(p.change+average*p.share*.042);
  // Periodic deposits keep only a working portion of the background cash on
  // hand. Explicit cash payments enter the drawer at face value.
  const takings=Math.round((.70*average+.30*p.today)*p.share*.34*progress);
  return Math.round((float+takings+cash)*100)/100;
}
