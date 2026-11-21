// Game stock. Garment and haircut options use IDs from the player character
// catalog, so the fitting mirror and the character on the street wear the same mesh.
import { FASHION_LOOKS } from './fashion.js';
import { archiveStock } from './archive-stock.js';
const shirts = [
  { sku:'tee-chalk', name:'Cotton crew · Chalk', price:25, slot:'top', design:{top:'male_casualsuit04-top',topColour:'#dfd8ca'} },
  { sku:'shirt-indigo', name:'Button-down · Indigo', price:38, slot:'top', design:{top:'male_casualsuit03-top',topColour:'#425571'} },
  { sku:'knit-sage', name:'Knit pullover · Sage', price:48, slot:'top', design:{top:'male_casualsuit06-top',topColour:'#718075'} },
  { sku:'hoodie-clay', name:'Hoodie · Clay', price:55, slot:'top', design:{top:'male_casualsuit05-top',topColour:'#a3634a'} },
];
const sneakers = [
  { sku:'low-chalk', name:'Low tops · Chalk', price:80, slot:'shoes', design:{shoes:'shoes05',shoeColour:'#e7e1d2'} },
  { sku:'high-oxblood', name:'High tops · Oxblood', price:120, slot:'shoes', design:{shoes:'shoes06',shoeColour:'#823f42'} },
  { sku:'runner-graphite', name:'Runners · Graphite', price:95, slot:'shoes', design:{shoes:'shoes02',shoeColour:'#555c61'} },
];
const haircuts = [['Close crop','short01',25],['Side part','short03',30],['Short curls','short04',35],['Rounded afro','afro01',35],['Chin-length bob','bob01',40],['Braids','braid01',65]]
  .map(([name,hair,price])=>({sku:'cut-'+hair,name,price,slot:'hair',design:{hair,hat:'none'},effect:'groom'}));
const phones = [
  { sku:'phone-slate', name:'Handset · Slate', price:199, model:'phone', color:'#6e7d86' },
  { sku:'phone-rose', name:'Handset · Rose', price:249, model:'phone', color:'#aa8277' },
];
const jewels = [
  { sku:'ring-gold', name:'Gold solitaire', price:185, model:'ringSample',color:'#d8b875' },
  { sku:'ring-silver', name:'Silver solitaire', price:85, model:'ringSample',color:'#c6cdce' },
];
const instruments = [
  { sku:'guitar-honey', name:'Acoustic guitar · Honey', price:195, model:'guitar',color:'#c49357' },
  { sku:'guitar-mahogany', name:'Acoustic guitar · Mahogany', price:240, model:'guitar',color:'#924f36' },
];
const archivePrices={
  top:{'gallery-box-tee':28,'auditorium-tee':42,'river-survey-tee':38,'offset-long-tee':48,'tucked-ringer':25,
    'service-polo':40,'relay-polo':44,'breakwater-crew':68,'nightshift-knit':72,'bias-halter':36,'bound-camisole':29,
    'chalkline-jacket':155,'long-vent-jacket':175},
  bottom:{'switchback-cargos':78,'waxed-cargos':92,'balloon-trousers':85,'broadcloth-trousers':65,
    'knife-stripe-trousers':88,'repair-cutoffs':45,'bias-full-skirt':76,'basement-tier-skirt':58,'wrap-mini':48},
  shoes:{'foldover-boots':145,'welt-ankle-boots':125,'piped-flats':64}
};
const archive=Object.entries(archivePrices).flatMap(([slot,prices])=>Object.entries(prices).map(([id,price])=>{
  const dye=slot==='shoes'?'shoeColour':slot+'Colour';
  const firstLook=FASHION_LOOKS.find(look=>look.clothes[slot]===id);
  const name=id[0].toUpperCase()+id.slice(1).replaceAll('-',' ');
  return {sku:id,name,price,slot,design:{[slot]:id,[dye]:firstLook.clothes[dye]}};
}));
const stock={clothes:[...shirts,...archive],department:[...shirts,...sneakers,...archive],shoes:sneakers,barber:haircuts,salon:haircuts,phones,jewelry:jewels,music:instruments};
const dyed=(base,sku,name,price,topColour)=>({...base,sku,name,price,design:{...base.design,topColour}});
const oldNavy=[
  dyed(shirts[0],'crew-navy','Everyday crew · Navy',18,'#324766'),
  dyed(shirts[1],'shirt-chambray','Chambray shirt · Washed blue',32,'#7290a5'),
  dyed(shirts[3],'hoodie-heather','Hoodie · Heather gray',35,'#938f88'),shirts[0],
];
const tjMaxx=[
  dyed(shirts[2],'knit-wine','Knit pullover · Wine',26,'#803f50'),
  dyed(shirts[1],'shirt-olive','Button-down · Olive',24,'#69735a'),
  dyed(shirts[0],'crew-sand','Cotton crew · Sand',14,'#c3ac8c'),...sneakers,
];
export function fittingStock(place) {
  const kind=typeof place==='string'?place:place.kind;
  // A house's own shop and the resale shops sell the archive collection; a department store adds its houses to the rest.
  const found=archiveStock(place);
  if(found)return found.only?found.items:[...(stock[kind] || []),...found.items];
  if(kind==='clothes' || kind==='department'){
    if(/\bold navy\b/i.test(place.name))return oldNavy;
    if(/\bt\.?\s*j\.?\s*maxx\b/i.test(place.name))return tjMaxx;
  }
  return stock[kind] || [];
}
export function fittedLook(person,item) {
  return item.design ? {...person,...item.design} : null;
}

export function ownsWearable(sim,item) {
  return ['top','bottom','shoes','bag'].includes(item.slot) && sim.purchases?.[item.sku] > 0;
}

export function purchaseStock(sim, shop, item) {
  if (sim.room?.place !== shop || !fittingStock(shop).some(row=>row.sku===item.sku)) return null;
  if (ownsWearable(sim,item)) return {paid:0};
  if (!sim.buy(item)) return null;
  if (item.slot !== 'hair') {
    sim.purchases ??= {};
    sim.purchases[item.sku]=(sim.purchases[item.sku] || 0) + 1;
  }
  return {paid:item.price};
}
