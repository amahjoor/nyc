import {readdir,readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
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
const landscape=JSON.parse(await readFile(resolve(root,'dist/landscape-index.json'),'utf8'));
if(landscape.regions.length<5||new Set(landscape.regions.map(region=>region.borough)).size!==5)throw new Error('Missing detailed landscape borough coverage');
if(JSON.stringify(landscape.origin)!==JSON.stringify(index.origin))throw new Error('Landscape coordinate origin does not match buildings');
const landscapePaths=[landscape.baseTerrain.url,landscape.baseFeaturesUrl,...landscape.regions.flatMap(region=>[region.terrainUrl,region.featuresUrl])];
let landscapeBytes=0;
for(const path of landscapePaths){
  if(!/^\.\/landscape\/[a-z0-9-]+\.json$/.test(path))throw new Error(`Invalid landscape path: ${path}`);
  const bytes=await readFile(resolve(root,'dist',path));landscapeBytes+=bytes.length;
  const data=JSON.parse(bytes);
  if(data.heights){
    if(data.width*data.height!==data.heights.length||data.units!=='meters'||!data.sourceId||!data.verticalDatum.startsWith('NAVD88')
      ||data.heights.some(height=>height!==null&&!Number.isFinite(height)))throw new Error(`Invalid measured terrain: ${path}`);
  }else{
    for(const feature of [...data.water,...data.canopies])if(!feature.sourceId||feature.polygon.length<3)throw new Error(`Missing source geometry: ${path}`);
    for(const crown of data.canopies)if(crown.maxHeight<5||!Number.isFinite(crown.baseElevation))throw new Error(`Invalid measured crown: ${path}`);
  }
}
if(landscapeBytes!==landscape.stats.bytes)throw new Error('Landscape manifest byte count does not match its assets');
const review=JSON.parse(await readFile(resolve(root,'dist/reconstruction-review.json'),'utf8'));
// Check the reference and original tile hashes; require every exported mask and
// comparison image so packaging cannot omit the evidence behind this review.
for(const asset of [review.reference,...review.imagery.tiles]){
  if(!/^\.\/reconstruction\/[a-zA-Z0-9./-]+$/.test(asset.url)||asset.url.includes('..'))throw new Error('Invalid review asset path');
  const bytes=await readFile(resolve(root,'dist',asset.url));
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error(`Reconstruction asset checksum mismatch: ${asset.url}`);
}
for(const path of [review.imagery.url,review.overlay,...review.features.flatMap(feature=>[feature.candidateMask,feature.referenceMask,feature.approvedMask])]){
  if(!/^\.\/reconstruction\/[a-zA-Z0-9./-]+$/.test(path)||path.includes('..'))throw new Error('Invalid review image path');
  await stat(resolve(root,'dist',path));
}
if(review.features.filter(feature=>feature.accepted).length!==review.summary.accepted)throw new Error('Reconstruction review counts disagree');
await stat(resolve(root,'dist/reconstruction.html'));
console.log(`Source checks passed: ${index.nodes.length} geometry nodes, ${Object.keys(roads.cells).length} road cells, ${Object.keys(detail.cells).length} street detail cells, ${landscape.regions.length} measured landscape regions, verified AI review assets and all five boroughs.`);
