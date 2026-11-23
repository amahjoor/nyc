// Rejoin public contact fields to the existing business pins without changing their identity.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {tradeName} from '../dist/places.js';
import {geographicToWorld} from '../dist/city-ground.js';

const root=new URL('../dist/',import.meta.url),out=new URL('map-contacts/',root);
const read=async url=>JSON.parse(await readFile(url,'utf8'));
const clean=s=>tradeName(s,{trading:true}).replace(/[^A-Z0-9]/g,'');
const locations=new Map(),records=new Map();
for(const folder of ['places','shops']){
  for(const file of await readdir(new URL(folder+'/',root))){
    for(const [x,z,,name] of (await read(new URL(folder+'/'+file,root))).places){
      if(!name)continue;
      const code=clean(name),id=JSON.stringify([name,x,z]);
      if(!locations.has(code))locations.set(code,new Map());
      locations.get(code).set(id,{x,z,name,id});
    }
  }
}
const street=(...fields)=>fields.filter(Boolean).join(' ').trim();
const address=(line,city,zip)=>line?[line,street(city,zip)].filter(Boolean).join(', '):'';
function join(name,geo,source,fields){
  const [lon,lat]=geo || [],point=geographicToWorld(+lon,+lat);
  const nearby=[...(locations.get(clean(name))?.values() || [])].filter(p=>Math.hypot(p.x-point.x,p.z-point.z)<30);
  const exact=nearby.filter(p=>Math.hypot(p.x-point.x,p.z-point.z)<1);
  const matches=exact.length?exact:nearby;
  if(matches.length!==1)return;
  const p=matches[0],row=records.get(p.id) || {name:p.name,x:p.x,z:p.z,sources:[]};
  let added=false;
  for(const [field,value] of Object.entries(fields))if(value && !row[field]){row[field]=String(value).trim();added=true;}
  if(added){if(!row.sources.includes(source))row.sources.push(source);records.set(p.id,row);}
}
const food='dba,latitude,longitude,building,street,boro,zipcode,phone,cuisine_description';
const box='within_box(georeference,40.93,-74.27,40.49,-73.68)';
const city='https://data.cityofnewyork.us/resource/',state='https://data.ny.gov/resource/';
const sources=[
  ['food',city+'43nn-pn8j',{$select:food,$group:food,$where:'latitude > 0',$order:food},r=>[r.dba,[r.longitude,r.latitude],{address:address(street(r.building,r.street),r.boro,r.zipcode),phone:r.phone,cuisine:r.cuisine_description}]],
  ['retail',state+'9a8c-vfzj',{$where:box,$select:'dba_name,entity_name,georeference,street_number,street_name,city,zip_code'},r=>[r.dba_name || r.entity_name,r.georeference?.coordinates,{address:address(street(r.street_number,r.street_name),r.city,r.zip_code)}]],
  ['beauty',state+'y3u4-jbgh',{$where:box+" AND license_type in('DOSAEBUSINESS','DOSBARSHOPOWNER')",$select:'business_name,georeference,business_address_1,business_city,business_zip'},r=>[r.business_name,r.georeference?.coordinates,{address:address(r.business_address_1,r.business_city,r.business_zip)}]],
  ['liquor',state+'9s3h-dpkz',{$where:box,$select:'dba,legalname,georeference,actualaddressofpremises,city,zipcode'},r=>[r.dba || r.legalname,r.georeference?.coordinates,{address:address(r.actualaddressofpremises,r.city,r.zipcode)}]],
  ['licenses',city+'w7w3-xahh',{$where:"license_status='Active' AND latitude IS NOT NULL AND license_type='Business'",$select:'dba_trade_name,business_name,longitude,latitude,address_building,address_street_name,address_city,address_zip,contact_phone'},r=>[r.dba_trade_name || r.business_name,[r.longitude,r.latitude],{address:address(street(r.address_building,r.address_street_name),r.address_city,r.address_zip),phone:r.contact_phone}]],
  ['motor',state+'nhjr-rpi2',{$where:box,$select:'facility_name,facility_name_overflow,georeference,facility_street,facility_city,facility_zip_code'},r=>[street(r.facility_name,r.facility_name_overflow),r.georeference?.coordinates,{address:address(r.facility_street,r.facility_city,r.facility_zip_code)}]],
  ['facilities',city+'ji82-xba5',{$where:'latitude IS NOT NULL',$select:'facname,longitude,latitude,address,boro,zipcode'},r=>[r.facname,[r.longitude,r.latitude],{address:address(r.address,r.boro,r.zipcode)}]]
];
async function load([source,endpoint,query]){
  const all=[];
  for(let offset=0;;offset+=25000){
    const params=new URLSearchParams({$order:':id',...query,$limit:'25000',$offset:String(offset)});
    const response=await fetch(endpoint+'.json?'+params,{signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error(source+' '+response.status+' '+(await response.text()).slice(0,120));
    const rows=await response.json();all.push(...rows);if(rows.length<25000)break;
  }
  console.log(source,all.length);return all;
}
const loaded=await Promise.all(sources.map(load));
for(const [i,[source,,,extract]] of sources.entries())for(const row of loaded[i]){
  const [name,geo,fields]=extract(row);join(name,geo,source,fields);
}
const osm=await read(new URL('../assets-src/osm/shops.json',import.meta.url));
for(const node of osm.elements){
  const t=node.tags||{},p=node.center||node;
  if(Object.keys(t).some(k=>/^(disused|abandoned|was|construction|proposed):/.test(k)))continue;
  join(t.name||t.brand,[p.lon,p.lat],'osm',{address:address(t['addr:full'] || (t['addr:housenumber'] && street(t['addr:housenumber'],t['addr:street'])),t['addr:city'],t['addr:postcode']),
    phone:t['contact:phone']||t.phone,website:t['contact:website']||t.website||t.url,hours:t.opening_hours});
}
await mkdir(out,{recursive:true});
const cells=new Map();
for(const row of records.values()){
  const cell=Math.floor(row.x/5000)+'_'+Math.floor(row.z/5000);
  if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(row);
}
for(const [cell,data] of cells)await writeFile(new URL(cell+'.json',out),JSON.stringify(data)+'\n');
await writeFile(new URL('index.json',out),JSON.stringify({cells:[...cells.keys()].sort()})+'\n');
console.log(records.size+' matched places in '+cells.size+' cells');
