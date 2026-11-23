import { KIND, isOpen } from './places.js';
import { menuFor } from './menu.js';

// Casteel and Peek-Asa (2016), pp. 35, 43: reported cash taken in Las Vegas
// commercial robberies in 2008–2012. The drawer fractions are game tuning for
// the cash kept at one counter. https://stacks.cdc.gov/view/cdc/219031
const RETAIL_CASH = 275, CONVENIENCE_CASH = 274, BANK_CASH = 4314;
// BLS annual CPI-U for 2025 divided by 2010, the midpoint of the study period.
const HISTORICAL_CASH_TO_2025 = 321.943 / 218.056;
const SIMULATED_DRAWER_SCALE = 1.7;
// Fictional progression for high-value shops. Industry losses include merchandise.
const HIGH_VALUE_DRAWER_SCALE = new Map([
  ['jewelry', 3.5], ['department', 1.55], ['electronics', 1.5], ['phones', 1.5], ['pawn', 1.4],
]);
const profiles={
  // Daily transactions, typical basket, cash payment share, historical cash
  // reference, and fraction of that reference used for a single game drawer.
  bank:        [34, 265, .88, BANK_CASH,        .32],
  bodega:      [75,  13, .28, CONVENIENCE_CASH, .60],
  gas:         [60,  18, .16, CONVENIENCE_CASH, .45],
  cafe:        [69,   7, .29, RETAIL_CASH,       .24],
  food:        [49,  14, .26, RETAIL_CASH,       .32],
  dining:      [30,  30, .16, RETAIL_CASH,       .51],
  market:      [65,  19, .21, RETAIL_CASH,       .48],
  supermarket: [96,  28, .18, RETAIL_CASH,       .67],
  liquor:      [42,  24, .23, RETAIL_CASH,       .52],
  pharmacy:    [58,  18, .18, RETAIL_CASH,       .40],
  apparel:     [26,  51, .11, RETAIL_CASH,       .36],
  jewelry:     [15, 185, .06, RETAIL_CASH,       .41],
  department:  [70,  58, .12, RETAIL_CASH,       .55],
  stand:       [40,   8, .29, RETAIL_CASH,       .18],
  appointment: [16,  43, .20, RETAIL_CASH,       .34],
  retail:      [35,  23, .19, RETAIL_CASH,       .37],
};
const profileCache=new WeakMap();
function unit(seed){
  const h=Math.imul(seed^(seed>>>16),0x85ebca6b);
  return ((h^(h>>>13))>>>0)/4294967296;
}
function profileFor(shop){
  if(Object.hasOwn(profiles,shop.kind))return profiles[shop.kind];
  if(['clothes','shoes','bags'].includes(shop.kind))return profiles.apparel;
  const group=KIND[shop.kind]?.group;
  if(['beauty','barber'].includes(group))return profiles.appointment;
  if(group==='bar')return profiles.dining;
  return profiles[group]??profiles.retail;
}

function tradingProfile(shop){
  const cached=profileCache.get(shop);
  if(cached && cached.id===shop.id && cached.kind===shop.kind && cached.name===shop.name && cached.area===shop.area)return cached;
  const [customers,basket,share,cashReference,drawerFraction]=profileFor(shop);
  const prices=menuFor(shop).map(i=>i.price).filter(p=>p>0).sort((a,b)=>a-b);
  const middle=prices[Math.floor(prices.length/2)]||basket;
  // Bank fees on the menu exclude the principal handled by a teller.
  const ticket=shop.kind==='bank'?basket:.78*basket+.22*Math.min(basket*2,middle);
  let h=2166136261;
  for(const c of String(shop.id))h=Math.imul(h^c.charCodeAt(0),16777619);
  // Branches of the same trade have different foot traffic and payment habits.
  const demand=.52+.96*unit(h^0x5bc45f37);
  const cashShare=Math.min(.98,share*(.58+.84*unit(h^0x35ca91e7)));
  const areaFactor=shop.area>0?Math.max(.85,Math.min(1.18,1+Math.log(shop.area/1200)*.05)):1;
  const drawerCash=cashReference*drawerFraction;
  const change=drawerCash*.45*demand;
  const retainedShare=Math.min(1,drawerCash*.55/(customers*basket*share));
  const cumulative=[0];
  for(let i=0;i<48;i++)cumulative.push(cumulative[i]+Number(isOpen(shop.kind,(i+.5)/2)));
  const value={id:shop.id,kind:shop.kind,name:shop.name,area:shop.area,seed:h,gross:customers*ticket*demand*areaFactor,share:cashShare,change,retainedShare,cumulative};
  profileCache.set(shop,value);return value;
}

// Repeatable tender selection for simulated pedestrians. Player purchases use
// the tender supplied by their actual payment path.
export function customerUsesCash(shop,day,previousCents){
  let h=Math.imul((day+1)^previousCents,0x9e3779b1);
  for(const c of String(shop.id))h=Math.imul(h^c.charCodeAt(0),16777619);
  return unit(h)<tradingProfile(shop).share;
}

function backgroundSales(profile,day){
  return profile.gross*(.38+1.24*unit(profile.seed^Math.imul(day+1,0x9e3779b1)));
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
  const forecast=.45*p.weekAverage+.55*p.today;
  const recordedSales=previous.reduce((sum,row)=>sum+row[1],0)/700;
  const slot=Math.min(47,Math.floor(minute/30)), elapsed=p.cumulative[slot]+(p.cumulative[slot+1]-p.cumulative[slot])*(minute%30)/30;
  const progress=elapsed/Math.max(1,p.cumulative[48]);
  const retainedCash=p.share*p.retainedShare*progress;
  const scale=HISTORICAL_CASH_TO_2025*SIMULATED_DRAWER_SCALE*(HIGH_VALUE_DRAWER_SCALE.get(shop.kind)??1);
  const simulatedCash=(p.change+forecast*retainedCash)*scale;
  const recordedCash=.70*recordedSales*retainedCash;
  // Explicit cash payments enter the drawer at face value.
  return Math.round((Math.round(simulatedCash+recordedCash)+cash)*100)/100;
}
