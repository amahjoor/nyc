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
const roadIndexBytes=await readFile(resolve(root,'dist/road-index.json'));
const roads=JSON.parse(roadIndexBytes);
const boroughs=JSON.parse(await readFile(resolve(root,'dist/boroughs.json'),'utf8'));
if(boroughs.boroughs.length!==5||new Set(roads.places.map(place=>place.borough)).size!==5)throw new Error('Missing borough coverage');
// Validate deployment paths and byte counts so a partial road import cannot ship.
const navigationSourceHash=createHash('sha256');
for(const [key,cell] of Object.entries(roads.cells).sort(([a],[b])=>a.localeCompare(b,'en'))){
  if(!/^\.\/roads\/-?\d+_-?\d+\.json$/.test(cell.url))throw new Error(`Invalid road cell path: ${key}`);
  const bytes=await readFile(resolve(root,'dist',cell.url));
  if(bytes.length!==cell.bytes)throw new Error(`Incomplete road cell: ${key}`);
  navigationSourceHash.update(cell.url+'\0').update(bytes);
}
// Validate the compact map source without rebuilding its routing graph or
// repeating the exhaustive coordinate round-trip covered by routing tests.
const navigationBytes=await readFile(resolve(root,'dist/navigation-roads.json')),navigation=JSON.parse(navigationBytes);
if(navigation.version!==1||navigation.encoding!=='cscl-centimeter-polyline-v1'||navigationBytes.length>6_000_000
  ||navigation.stats.roads!==roads.stats.roads||navigation.roads.length!==navigation.stats.roads||navigation.stats.points!==roads.stats.vertices
  ||JSON.stringify(navigation.origin)!==JSON.stringify(roads.origin)||JSON.stringify(navigation.bounds)!==JSON.stringify(roads.bounds)
  ||navigation.names.length!==navigation.stats.names||Object.keys(navigation.stats.byBorough).length!==5
  ||navigation.source.indexSha256!==createHash('sha256').update(roadIndexBytes).digest('hex')
  ||navigation.source.tilesSha256!==navigationSourceHash.digest('hex'))throw new Error('Navigation dataset does not match its source manifest and tiles');
const navigationIds=new Set(),navigationKinds={},navigationBoroughs={};
for(const row of navigation.roads){
  if(!Array.isArray(row)||row.length!==4||!/^\d+(?::\d+)?$/.test(String(row[0]))||navigationIds.has(String(row[0]))
    ||!Number.isInteger(row[1])||typeof navigation.names[row[1]]!=='string'||!Number.isInteger(row[2])||row[2]<0
    ||typeof row[3]!=='string'||!row[3].length||!/^[?-~]+$/.test(row[3]))throw new Error('Invalid compact navigation row');
  navigationIds.add(String(row[0]));let flags=row[2];const borough=flags%8;flags=Math.floor(flags/8);
  const toLevel=navigation.levels[flags%16];flags=Math.floor(flags/16);const fromLevel=navigation.levels[flags%16];flags=Math.floor(flags/16);
  const kind=navigation.kinds[Math.floor(flags/3)];
  if(borough<1||borough>5||!Number.isFinite(fromLevel)||!Number.isFinite(toLevel)||!['residential','service','motorway','ramp','bridge','tunnel'].includes(kind))throw new Error('Invalid navigation levels or classification');
  navigationKinds[kind]=(navigationKinds[kind]||0)+1;navigationBoroughs[borough]=(navigationBoroughs[borough]||0)+1;
}
for(const [kind,count] of Object.entries(navigation.stats.byKind))if(navigationKinds[kind]!==count)throw new Error('Navigation classification totals disagree');
for(const [borough,count] of Object.entries(navigation.stats.byBorough))if(navigationBoroughs[borough]!==count)throw new Error('Navigation borough totals disagree');
const detail=JSON.parse(await readFile(resolve(root,'dist/street-detail-index.json'),'utf8'));
let detailBytes=0;
const detailFeatures=new Map();
if(detail.coverageRegions.length!==7||new Set(detail.coverageRegions.map(region=>region.borough)).size!==5)throw new Error('Missing street-detail sample coverage');
if(JSON.stringify(detail.origin)!==JSON.stringify(index.origin))throw new Error('Street-detail origin does not match buildings');
for(const [key,cell] of Object.entries(detail.cells)){
  if(!/^\.\/street-detail\/-?\d+_-?\d+\.json$/.test(cell.url))throw new Error(`Invalid detail cell path: ${key}`);
  const file=await stat(resolve(root,'dist',cell.url));
  if(file.size!==cell.bytes)throw new Error(`Incomplete street detail cell: ${key}`);
  detailBytes+=file.size;
  const tile=JSON.parse(await readFile(resolve(root,'dist',cell.url),'utf8'));
  const features=[...tile.surfaces,...tile.curbs,...tile.structures];
  if(features.length!==cell.count||new Set(features.map(feature=>feature.id)).size!==features.length)throw new Error(`Street detail count or identities disagree: ${key}`);
  for(const feature of features){
    const rings=feature.kind==='curb'?[feature.points]:[feature.polygon,...feature.holes];
    if(!feature.sourceRowId||!['curb','roadbed','sidewalk','parking','transport'].includes(feature.kind)
      ||rings.some(ring=>ring.length<2||ring.some(point=>point.length!==2||!point.every(Number.isFinite))))throw new Error(`Invalid surveyed street geometry: ${feature.id}`);
    if(feature.kind==='transport'){
      if(!['surveyed','unavailable'].includes(feature.elevationStatus))throw new Error(`Missing transport elevation status: ${feature.id}`);
      if(feature.elevationStatus==='surveyed'){
        const heights=[feature.elevations.polygon,...feature.elevations.holes];
        const raw=[feature.sourceElevations.polygon,...feature.sourceElevations.holes];
        if(feature.elevationUnits!=='meters'||feature.verticalDatum!=='NAVD88'||feature.sourceElevationUnits!=='US survey feet'
          ||heights.length!==rings.length||raw.length!==rings.length
          ||heights.some((values,i)=>values.length!==rings[i].length||raw[i].length!==values.length
            ||values.some((value,j)=>!Number.isFinite(value)||!Number.isFinite(raw[i][j])||raw[i][j]===0||Math.abs(raw[i][j]*1200/3937-value)>0.000006)))throw new Error(`Invalid surveyed deck heights: ${feature.id}`);
      }else if(feature.elevations)throw new Error(`Unverified transport heights were exported: ${feature.id}`);
    }
    const serialized=JSON.stringify(feature);
    if(detailFeatures.has(feature.id)&&detailFeatures.get(feature.id)!==serialized)throw new Error(`Repeated source geometry disagrees: ${feature.id}`);
    detailFeatures.set(feature.id,serialized);
  }
}
if(detailBytes!==detail.stats.bytes||detailFeatures.size!==detail.stats.features||Object.keys(detail.cells).length!==detail.stats.cells)throw new Error('Street detail manifest counts do not match its assets');
const detailCounts={};let measuredStructures=0,missingStructures=0;
for(const value of detailFeatures.values()){
  const feature=JSON.parse(value);detailCounts[feature.kind]=(detailCounts[feature.kind]||0)+1;
  measuredStructures+=feature.elevationStatus==='surveyed';missingStructures+=feature.elevationStatus==='unavailable';
}
for(const [kind,count] of Object.entries(detail.stats.byKind))if(detailCounts[kind]!==count)throw new Error(`Street detail source count mismatch: ${kind}`);
if(measuredStructures!==detail.stats.surveyedStructures||missingStructures!==detail.stats.structuresWithoutVerifiedElevation)throw new Error('Transport elevation status counts disagree');
for(const layer of detail.source.layers)if(!/^[a-f0-9]{64}$/.test(layer.sha256)||!detail.coverageRegions.some(region=>region.id===layer.regionId))throw new Error('Invalid street source provenance');
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
// Both reviews retain evidence for accepted and rejected candidates. A rejected
// model result must stay rejected in the package, including its empty geometry.
for(const [reportPath,assetFolder] of [['reconstruction-review.json','reconstruction'],['road-reconstruction-review.json','road-reconstruction']]){
  const review=JSON.parse(await readFile(resolve(root,'dist',reportPath),'utf8'));
  const validAsset=path=>typeof path==='string'&&path.startsWith(`./${assetFolder}/`)&&/^[a-zA-Z0-9./-]+$/.test(path)&&!path.includes('..');
  for(const asset of [review.reference,...review.imagery.tiles]){
    if(!validAsset(asset.url))throw new Error(`Invalid review asset path: ${reportPath}`);
    const bytes=await readFile(resolve(root,'dist',asset.url));
    if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error(`Reconstruction asset checksum mismatch: ${asset.url}`);
  }
  for(const path of [review.imagery.url,review.overlay,...review.features.flatMap(feature=>[feature.candidateMask,feature.referenceMask,feature.approvedMask])]){
    if(!validAsset(path))throw new Error('Invalid review image path');
    await stat(resolve(root,'dist',path));
  }
  if(review.features.filter(feature=>feature.accepted).length!==review.summary.accepted
    ||review.features.length!==review.summary.candidates
    ||review.summary.accepted+review.summary.rejected!==review.summary.candidates)throw new Error(`Reconstruction review counts disagree: ${reportPath}`);
  for(const feature of review.features){
    if(!feature.accepted&&(feature.approvedPixels!==0||feature.geometry!==null||feature.localGeometry!==null))throw new Error(`Rejected AI geometry leaked into exported world: ${feature.id}`);
    if(assetFolder==='road-reconstruction'&&!detailFeatures.has(feature.sourceFeatureId))throw new Error(`Road review lacks a bundled source feature: ${feature.sourceFeatureId}`);
  }
}
await stat(resolve(root,'dist/reconstruction.html'));
const pilotIndex=JSON.parse(await readFile(resolve(root,'dist/road-pilot-index.json'),'utf8'));
const pilot=JSON.parse(await readFile(resolve(root,'dist/road-pilot.json'),'utf8'));
const appearance=JSON.parse(await readFile(resolve(root,'dist/road-pilot-appearance.json'),'utf8'));
const localAsset=path=>typeof path==='string'&&/^\.\/[a-zA-Z0-9./-]+$/.test(path)&&!path.includes('..');
const verifiedAsset=async asset=>{
  const path=asset.snapshotUrl||asset.url;
  if(!localAsset(path))throw new Error('Invalid road pilot source path');
  const bytes=await readFile(resolve(root,'dist',path));
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error(`Road pilot source hash mismatch: ${path}`);
};
for(const path of [pilotIndex.manifestUrl,pilotIndex.terrainUrl,pilotIndex.appearanceUrl]){
  if(!localAsset(path))throw new Error('Invalid road pilot load path');await stat(resolve(root,'dist',path));
}
if(pilot.version!==1||pilotIndex.id!==pilot.id||pilot.verticalDatum!=='NAVD88'||pilot.elevationUnits!=='meters'
  ||JSON.stringify(pilot.origin)!==JSON.stringify(index.origin)||JSON.stringify(appearance.origin)!==JSON.stringify(index.origin)
  ||JSON.stringify(pilotIndex.bounds)!==JSON.stringify(pilot.terrain.bounds)||JSON.stringify(pilotIndex.spawn)!==JSON.stringify(pilot.spawn)
  ||pilot.features.length!==pilot.stats.features||pilot.features.some(feature=>!detailFeatures.has(feature.sourceFeatureId)))throw new Error('Road pilot coordinate or source identity mismatch');
for(const asset of [...Object.values(pilot.sources),pilot.terrain,appearance.imagery,appearance.reference])await verifiedAsset(asset);
const pilotTerrain=JSON.parse(await readFile(resolve(root,'dist',pilot.terrain.url),'utf8'));
if(!Array.isArray(pilot.terrain.requiredRegions)||!pilot.terrain.requiredRegions.length)throw new Error('Road pilot background terrain dependencies are missing');
for(const id of pilot.terrain.requiredRegions){
  const region=landscape.regions.find(region=>region.id===id);
  if(!region)throw new Error(`Road pilot background region is missing: ${id}`);
  if(id==='meadow-lake')await verifiedAsset({url:region.terrainUrl,sha256:pilotTerrain.baselineHashes.meadowLake});
}
await verifiedAsset({url:landscape.baseTerrain.url,sha256:pilotTerrain.baselineHashes.base});
const candidateBytes=await readFile(resolve(root,'dist/road-pilot-vision/paint-candidates.json'));
if(createHash('sha256').update(candidateBytes).digest('hex')!==appearance.review.candidatesFileSha256
  ||appearance.review.imageSha256!==appearance.imagery.sha256)throw new Error('Paint review no longer matches its source imagery/candidates');
if(appearance.markings.length!==appearance.summary.paintAccepted||appearance.surfaces.length!==appearance.summary.surfaceMaterials
  ||appearance.occluders.filter(mask=>mask.accepted).length!==appearance.summary.vehicleMasksAccepted
  ||appearance.markings.some(mark=>mark.reviewStatus!=='accepted'||!detailFeatures.has(mark.sourceFeatureId)
    ||appearance.review.rejectedCandidateIds.includes(mark.evidence.candidateId)))throw new Error('Rejected or unverified imagery evidence leaked into road appearance');
for(const path of [appearance.review.contactSheet,appearance.review.overlay,...appearance.occluders.map(mask=>mask.mask),
  './road-pilot-source/survey-review.json','./road-pilot-review.html']){
  if(!localAsset(path))throw new Error('Invalid road pilot evidence path');await stat(resolve(root,'dist',path));
}
console.log(`Source checks passed: ${index.nodes.length} geometry nodes, ${Object.keys(roads.cells).length} road cells, ${navigation.stats.roads} navigation segments, ${Object.keys(detail.cells).length} street detail cells, ${landscape.regions.length} measured landscape regions, verified AI review assets and all five boroughs.`);
