// Real-world data belongs to a particular branch. Names alone are ambiguous in NYC.
import { geographicToWorld, worldToGeographic } from './city-ground.js';
import { tradeName } from './places.js';

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
  const fields='camis,dba,building,street,boro,zipcode,cuisine_description,latitude,longitude';
  const query=new URLSearchParams({$select:fields,$group:fields,$limit:'100',
    $where:`latitude between ${lat-.0004} and ${lat+.0004} AND longitude between ${lon-.0005} and ${lon+.0005}`});
  const response=await fetch('https://data.cityofnewyork.us/resource/43nn-pn8j.json?'+query,{signal});
  if(!response.ok)return null;
  const rows=await response.json();
  const match=matchBranch(place,rows.map(row=>({...geographicToWorld(Number(row.longitude),Number(row.latitude)),
    name:tradeName(row.dba,{trading:true}),cuisine:row.cuisine_description,address:[[row.building,row.street].filter(Boolean).join(' '),row.boro,row.zipcode].filter(Boolean).join(', ')})));
  if(cityRecords.size>=96)cityRecords.delete(cityRecords.keys().next().value);
  cityRecords.set(key,match);
  return match;
}
