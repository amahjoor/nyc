import {readdir,readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const name of await readdir(resolve(root,'dist'))){
  if(name.endsWith('.js')){
    const result=spawnSync(process.execPath,['--check',resolve(root,'dist',name)],{stdio:'inherit'});
    if(result.status)process.exit(result.status);
    const source=await readFile(resolve(root,'dist',name),'utf8');
    for(const match of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g))await stat(resolve(root,'dist',match[1]));
  }
}
const city=JSON.parse(await readFile(resolve(root,'dist/city.json'),'utf8'));
if(city.buildings.length<100||city.roads.length<10)throw new Error('City data is incomplete');
const survey=JSON.parse(await readFile(resolve(root,'dist/survey.json'),'utf8'));
if(survey.buildings.length<1500)throw new Error('Surveyed city geometry is incomplete');
const ortho=JSON.parse(await readFile(resolve(root,'dist/ortho.json'),'utf8'));
const profiles=JSON.parse(await readFile(resolve(root,'dist/facade-profiles.json'),'utf8'));
for(const asset of [...ortho.tiles,...profiles.profiles.flatMap(profile=>profile.refs)]){
  await stat(resolve(root,'dist',asset.url));
}
const html=await readFile(resolve(root,'dist/index.html'),'utf8');
for(const file of ['main.js','style.css'])if(!html.includes(file))throw new Error(`Missing entry: ${file}`);
const index=JSON.parse(await readFile(resolve(root,'dist/city-index.json'),'utf8'));
if(index.nodes.length<4000||index.roots.length<50)throw new Error('Citywide geometry index is incomplete');
const roads=JSON.parse(await readFile(resolve(root,'dist/road-index.json'),'utf8'));
const boroughs=JSON.parse(await readFile(resolve(root,'dist/boroughs.json'),'utf8'));
if(boroughs.boroughs.length!==5||new Set(roads.places.map(place=>place.borough)).size!==5)throw new Error('Missing borough coverage');
// Validate deployment paths and byte counts so a partial road import cannot ship.
for(const [key,cell] of Object.entries(roads.cells)){
  if(!/^\.\/roads\/-?\d+_-?\d+\.json$/.test(cell.url))throw new Error(`Invalid road cell path: ${key}`);
  const file=await stat(resolve(root,'dist',cell.url));
  if(file.size!==cell.bytes)throw new Error(`Incomplete road cell: ${key}`);
}
const detail=JSON.parse(await readFile(resolve(root,'dist/street-detail-index.json'),'utf8'));
let detailBytes=0;
for(const [key,cell] of Object.entries(detail.cells)){
  if(!/^\.\/street-detail\/-?\d+_-?\d+\.json$/.test(cell.url))throw new Error(`Invalid detail cell path: ${key}`);
  const file=await stat(resolve(root,'dist',cell.url));
  if(file.size!==cell.bytes)throw new Error(`Incomplete street detail cell: ${key}`);
  detailBytes+=file.size;
}
if(detailBytes!==detail.stats.bytes)throw new Error('Street detail manifest byte count does not match its assets');
console.log(`Source checks passed: ${index.nodes.length} geometry nodes, ${Object.keys(roads.cells).length} road cells, ${Object.keys(detail.cells).length} street detail cells, all five boroughs, and bundled source assets.`);
