#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const KINDS=['residential','service','motorway','ramp','bridge','tunnel'];
function encodeGeometry(points){
  let x=0,z=0,result='';
  const integer=value=>{let n=value<0?-value*2-1:value*2;while(n>=32){result+=String.fromCharCode((n%32)+95);n=Math.floor(n/32);}result+=String.fromCharCode(n+63);};
  for(const point of points){const nx=Math.round(point[0]*100),nz=Math.round(point[1]*100);integer(nx-x);integer(nz-z);x=nx;z=nz;}
  return result;
}

export function encodeNavigationData(roads,{origin,bounds,source={}}={}){
  const names=[...new Set(roads.map(road=>road.name))].sort(),nameIds=new Map(names.map((name,i)=>[name,i]));
  const levels=[...new Set(roads.flatMap(road=>[road.fromLevel,road.toLevel]))].sort((a,b)=>a-b),levelIds=new Map(levels.map((level,i)=>[level,i]));
  if(levels.length>16)throw new Error('Navigation packing supports at most sixteen source level codes.');
  const byBorough={},byKind={},rows=[];
  for(const road of [...roads].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
    if(!/^cscl:\d+(?::\d+)?$/.test(road.id)||!KINDS.includes(road.kind)||!Number.isInteger(road.borough)||road.borough<1||road.borough>5
      ||!Number.isFinite(road.fromLevel)||!Number.isFinite(road.toLevel)||!Array.isArray(road.points)||road.points.length<2
      ||road.points.some(point=>point.length!==2||!point.every(Number.isFinite)))throw new Error(`Invalid navigation source road: ${road.id}`);
    const direction=road.oneway==='yes'?1:road.oneway==='-1'?2:road.oneway===false?0:null;
    if(direction===null)throw new Error(`Unknown source traffic direction: ${road.id}`);
    // Source levels are preserved independently at each endpoint. Packing is
    // lossless and does not infer junctions from crossing projected lines.
    const flags=(((KINDS.indexOf(road.kind)*3+direction)*16+levelIds.get(road.fromLevel))*16+levelIds.get(road.toLevel))*8+road.borough;
    const suffix=road.id.slice(5);rows.push([suffix.includes(':')?suffix:Number(suffix),nameIds.get(road.name),flags,encodeGeometry(road.points)]);
    byBorough[road.borough]=(byBorough[road.borough]||0)+1;byKind[road.kind]=(byKind[road.kind]||0)+1;
  }
  return {version:1,encoding:'cscl-centimeter-polyline-v1',origin,bounds,names,kinds:KINDS,levels,roads:rows,
    source:{...source,modifications:'Deduplicated existing source segments by ID. Coordinates remain at the original centimeter precision, encoded as signed delta strings. Names, directions, endpoint levels and boroughs are preserved. Routing excludes tunnel segments; mapped line crossings do not create new junctions.'},
    stats:{roads:rows.length,points:roads.reduce((total,road)=>total+road.points.length,0),names:names.length,byBorough,byKind}};
}

export async function buildNavigationData(directory=resolve(ROOT,'dist')){
  const rawIndex=await readFile(resolve(directory,'road-index.json')),index=JSON.parse(rawIndex),unique=new Map(),tileHash=createHash('sha256');
  for(const [key,cell] of Object.entries(index.cells).sort(([a],[b])=>a.localeCompare(b,'en'))){
    if(!/^\.\/roads\/-?\d+_-?\d+\.json$/.test(cell.url))throw new Error(`Unexpected source path: ${key}`);
    const raw=await readFile(resolve(directory,cell.url));if(raw.length!==cell.bytes)throw new Error(`Incomplete source road tile: ${key}`);
    tileHash.update(cell.url+'\0').update(raw);
    for(const road of JSON.parse(raw).roads){
      const previous=unique.get(road.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(road))throw new Error(`Source road identity disagrees across tiles: ${road.id}`);
      unique.set(road.id,road);
    }
  }
  const data=encodeNavigationData([...unique.values()],{origin:index.origin,bounds:index.bounds,source:{title:'NYC OTI Citywide Street Centerline navigation graph',url:index.source.url||'https://data.cityofnewyork.us/City-Government/NYC-Street-Centerline-CSCL-/inkn-q76z',indexSha256:createHash('sha256').update(rawIndex).digest('hex'),tilesSha256:tileHash.digest('hex')}});
  const bytes=JSON.stringify(data)+'\n';await writeFile(resolve(directory,'navigation-roads.json'),bytes);
  return {...data.stats,bytes:Buffer.byteLength(bytes)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildNavigationData(process.argv[2]&&resolve(process.argv[2])),null,2));
