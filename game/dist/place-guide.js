// Real-world data belongs to a particular branch. Names alone are ambiguous in NYC.
import { geographicToWorld, worldToGeographic } from './city-ground.js';
import { placeCellKey, tradeName, unpackPlace } from './places.js';

const normalized = name => String(name || '').normalize('NFKD').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
export function matchBranch(place, candidates) {
  const name=normalized(place.name);
  if(!name)return null;
  const matches=candidates.filter(row=>normalized(row.name)===name && Math.hypot(row.x-place.x,row.z-place.z)<35);
  return matches.length===1 ? matches[0] : null;
}

export function mapsURL(place,address) {
  const {lat,lon}=worldToGeographic(place.x,place.z);
  const location=address || [lat.toFixed(5),lon.toFixed(5)].join(',');
  const query=[place.name,location].filter(Boolean).join(' ');
  return 'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query});
}

const cityRecords=new Map();
export async function cityRecord(place,signal) {
  if(!place.name || !['food','dining','bar','cafe','bodega'].includes(place.group))return null;
  const key=[place.name,place.x,place.z].join('|');
  if(cityRecords.has(key))return cityRecords.get(key);
  const {lat,lon}=worldToGeographic(place.x,place.z);
  const fields='camis,dba,building,street,boro,zipcode,phone,cuisine_description,latitude,longitude';
  const query=new URLSearchParams({$select:fields,$group:fields,$limit:'100',
    $where:`latitude between ${lat-.0004} and ${lat+.0004} AND longitude between ${lon-.0005} and ${lon+.0005}`});
  const response=await fetch('https://data.cityofnewyork.us/resource/43nn-pn8j.json?'+query,{signal});
  if(!response.ok)return null;
  const rows=await response.json();
  const match=matchBranch(place,rows.map(row=>({...geographicToWorld(Number(row.longitude),Number(row.latitude)),
    name:tradeName(row.dba,{trading:true}),cuisine:row.cuisine_description,phone:row.phone,sources:['food'],address:[[row.building,row.street].filter(Boolean).join(' '),row.boro,row.zipcode].filter(Boolean).join(', ')})));
  if(cityRecords.size>=96)cityRecords.delete(cityRecords.keys().next().value);
  cityRecords.set(key,match);
  return match;
}

const contactTiles=new Map();
let available;
export async function bundledContact(place){
  if(!place.name)return null;
  const tile=Math.floor(place.x/2500)+'_'+Math.floor(place.z/2500);
  available??=fetch('./map-contacts/index.json').then(r=>r.json()).then(data=>new Set(data.cells)).catch(()=>{available=null;return new Set();});
  if(!(await available).has(tile))return null;
  if(!contactTiles.has(tile)){
    if(contactTiles.size>=8)contactTiles.delete(contactTiles.keys().next().value);
    contactTiles.set(tile,fetch('./map-contacts/'+tile+'.json').then(r=>r.json()).catch(()=>{contactTiles.delete(tile);return [];}));
  }
  return (await contactTiles.get(tile)).find(row=>row.x===place.x && row.z===place.z && row.name===place.name) || null;
}

export const contactSources={
  food:['NYC Health','https://data.cityofnewyork.us/d/43nn-pn8j'],retail:['NYS retail food stores','https://data.ny.gov/d/9a8c-vfzj'],
  beauty:['NYS appearance licenses','https://data.ny.gov/d/y3u4-jbgh'],liquor:['NYS Liquor Authority','https://data.ny.gov/d/9s3h-dpkz'],
  licenses:['NYC business licenses','https://data.cityofnewyork.us/d/w7w3-xahh'],motor:['NYS DMV','https://data.ny.gov/d/nhjr-rpi2'],
  facilities:['NYC facilities','https://data.cityofnewyork.us/d/ji82-xba5'],osm:['© OpenStreetMap contributors','https://www.openstreetmap.org/copyright']
};
export function contactLinks(record){
  const digits=(record?.phone || '').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
  const number=/^[2-9]\d{2}[2-9]\d{6}$/.test(digits) && !/^(\d)\1+$/.test(digits)?digits:'';
  let website;
  try{const raw=record?.website || '';if(raw && !/\s/.test(raw)){
    const url=new URL(/^[\w+.-]+:/.test(raw)?raw:'https://'+raw);
    if(['https:','http:'].includes(url.protocol) && url.hostname.includes('.') && !url.username && !url.password)website=url;
  }}catch{}
  return {number:number && '('+number.slice(0,3)+') '+number.slice(3,6)+'-'+number.slice(6),tel:number && 'tel:+1'+number,website};
}

// Citywide search stores a compact label, while stock and saved state use the
// original pin's ID. Resolve its small source tile without streaming the world.
export async function resolveMapPlace(place,signal){
  const cell=placeCellKey(place.x,place.z);
  const sources=await Promise.all(['places','shops'].map(async folder=>{
    try{
      const response=await fetch('./'+folder+'/'+cell.replace(',','_')+'.json',{signal});
      if(!response.ok)return null;
      const data=await response.json();
      for(const [i,row] of data.places.entries()){
        if(row[0]!==place.x || row[1]!==place.z)continue;
        const full=unpackPlace(row,(folder==='shops'?'o':'')+cell+':'+i);
        if(full?.kind===place.kind && full.name===place.name)return full;
      }
    }catch{}
    return null;
  }));
  return sources.find(Boolean) || place;
}
