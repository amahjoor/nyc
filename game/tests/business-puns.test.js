import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {aliasForPlace, KIND, packPlace, unpackPlace} from '../dist/places.js';
import {archiveName, archiveStock} from '../dist/archive-stock.js';
import {ARCHIVE} from '../dist/archive-collection.js';
import {parodyLabel, parodyFabric} from '../dist/business-puns.js';
import {bankIdentity} from '../dist/bank.js';

test('storefronts, map names and saved branch identities agree in both editions',()=>{
  for(const [name, alias] of [['LIFE TIME','Lift Time'],['Planet Fitness','Planet Fatness'],['Bank of America','Bank of A-merry-cash'],['ADIDAS','Daddydas'],['BALENCIAGA','Baloneyagah']]){
    const kind=name==='Bank of America'?'bank':name==='ADIDAS'||name==='BALENCIAGA'?'clothes':'gym';
    const row=[21,47,KIND[kind].index,name,123,800,''];
    const real=unpackPlace(row,'1,2:9',false), pun=unpackPlace(row,real.id,true);
    assert.equal(real.name,name);assert.equal(pun.name,alias);assert.equal(real.id,pun.id);
    assert.equal(aliasForPlace(name,KIND[kind],21,47),pun.name);
    assert.deepEqual(packPlace(pun),row);
    if(kind==='bank') assert.equal(bankIdentity(pun).key,'fictional-bank');
    if(kind==='clothes')assert.deepEqual(archiveStock(pun),archiveStock(real));
  }
  const row=[1,2,KIND.library.index,'NYPL'];
  assert.deepEqual(unpackPlace(row,'L',true),unpackPlace(row,'L',false));
  assert.ok(unpackPlace([1,2,KIND.pizza.index,''],'A',true).name);
});
test('every wardrobe house has a fictional label and every replaced print is local',()=>{
  assert.equal(parodyLabel('Raf Simons × Rick Owens × Nike'),'Rough Simmons × Brick Owns × Sike');
  for(const piece of ARCHIVE)assert.notEqual(archiveName(piece,true),archiveName(piece,false),piece.id);
  const source=new URL('../dist/human/',import.meta.url);
  const {parts}=JSON.parse(readFileSync(new URL('human.json',source)));
  for(const part of parts.filter(p=>p.map?.startsWith('archive/'))){
    const result=parodyFabric(part);
    assert.equal(part.id,result.id);assert.equal(result.normal,null);
    assert.match(result.map,/^fictional\//);
    assert.ok(existsSync(new URL('tex/'+result.map,source)),result.map);
    if(part.id==='supreme-box-logo-hoodie')assert.equal(result.map,'fictional/subordinate.png');
  }
});
