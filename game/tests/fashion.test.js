import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {FASHION_LOOKS} from '../dist/fashion.js';
import {fashionForMember,designOf,MEMBERS,memberInfo} from '../dist/human-cast.js';
import {tidyPerson,DEFAULT_PERSON} from '../dist/human-designs.js';
import {createHuman} from '../dist/human.js';
import {fittingStock,fittedLook,purchaseStock} from '../dist/shop-stock.js';

const assets=new URL('../dist/human/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('human.json',assets)));
const collection=JSON.parse(readFileSync(new URL('../data/fashion-pieces.json',import.meta.url)));
const slots=['top','bottom','shoes'];

test('every look can be saved and every new piece has a fitted mesh, skin mask and shipped texture',()=>{
  const parts=new Map(manifest.parts.filter(p=>p.kind==='shoes'||p.kind==='garment').map(p=>[p.id,p]));
  const used=new Set();
  for(const {name,clothes} of FASHION_LOOKS){
    const saved=tidyPerson({...DEFAULT_PERSON,...clothes});
    for(const slot of slots){
      const id=clothes[slot],part=parts.get(id);
      assert.equal(slot==='shoes'?part?.kind:part?.slot,slot,name+' / '+id);
      assert.equal(saved[slot],id);
      used.add(id);
    }
  }
  for(const piece of collection){
    const part=parts.get(piece.id);
    assert.ok(used.has(piece.id));
    assert.ok(part?.hidden?.[1]>0,piece.id+' skin mask');
    assert.equal(part.map,'fashion/'+piece.id+'.webp');
    for(const map of [part.map,part.normal].filter(Boolean))assert.ok(existsSync(new URL('tex/'+map,assets)),map);
  }
});

test('the adult cast wears every preset in the intended setting',()=>{
  const seen=new Set();
  for(let id=0;id<MEMBERS;id++){
    const member=memberInfo(id),look=fashionForMember(id);
    if(member.officer||member.child)assert.equal(look,undefined);
    if(!look)continue;
    assert.equal(member.outfit,look.occasion);
    const design=designOf(id,{dials:[]});
    for(const slot of slots)assert.equal(design[slot],look.clothes[slot]);
    seen.add(look);
  }
  assert.equal(seen.size,FASHION_LOOKS.length);
});

test('the fitting catalog sells each piece and remembers a purchased pair of cargos',()=>{
  const shop={kind:'clothes',name:'GU'}, stock=fittingStock(shop);
  for(const piece of collection)assert.ok(stock.some(item=>item.design?.[piece.slot]===piece.id),piece.id);
  const item=stock.find(item=>item.sku==='waxed-cargos');
  const person=fittedLook(DEFAULT_PERSON,item);
  assert.equal(person.bottom,'waxed-cargos');
  assert.equal(person.top,DEFAULT_PERSON.top);
  const sim={room:{place:shop},cash:item.price,buy(i){if(i.price>this.cash)return false;this.cash-=i.price;return true;}};
  assert.equal(purchaseStock(sim,shop,item).paid,item.price);
  assert.equal(purchaseStock(sim,shop,item).paid,0);
  assert.equal(sim.purchases[item.sku],1);
});

test('the offset tee clears the waistband without moving its neckline',()=>{
  const binary=name=>Uint8Array.from(readFileSync(new URL(name,assets))).buffer;
  const rig=JSON.parse(readFileSync(new URL('../dist/motion.json',import.meta.url)));
  const human=createHuman(manifest,binary('body.bin'),binary('parts.bin'),rig);
  const top='garment/offset-long-tee',bottom='garment/balloon-trousers';
  const build=wear=>human.build({sex:1,height:1.73,wear},{detail:'close'}).pieces;
  const boot='shoes/foldover-boots';
  const alone=build([top,boot]),paired=build([top,bottom,boot]);
  const bare=alone.find(p=>p.id==='offset-long-tee').position,layered=paired.find(p=>p.id==='offset-long-tee').position;
  let biggest=0;
  for(let i=0;i<bare.length;i+=3){
    const change=Math.hypot(bare[i]-layered[i],bare[i+2]-layered[i+2]);
    assert.ok(Number.isFinite(change));
    if(bare[i+1]>1.4)assert.equal(change,0);
    biggest=Math.max(biggest,change);
  }
  assert.ok(biggest>.005 && biggest<.12,'hem adjusts to the trousers');
  const covered=paired.find(p=>p.id==='foldover-boots').index.length;
  assert.ok(covered>0 && covered<alone.find(p=>p.id==='foldover-boots').index.length,'the trouser cuffs cover the boot shafts');
});
