import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import { createCityNavigation, intersectTerrainRay } from '../dist/city-navigation.js';

test('map rays intersect raised and sloping measured ground rather than the sea-level plane', () => {
  const direction=new THREE.Vector3(1,-1,0).normalize();
  const ray=new THREE.Ray(new THREE.Vector3(0,100,0),direction);
  const point=intersectTerrainRay(ray,x=>20+x*.25);
  // y=100-x intersects y=20+.25x at x=64, y=36.
  assert.ok(Math.abs(point.x-64)<.01);assert.ok(Math.abs(point.y-36)<.01);
  const elevated=intersectTerrainRay(new THREE.Ray(new THREE.Vector3(0,100,0),new THREE.Vector3(0,-1,0)),()=>80,30);
  assert.equal(elevated.y,80,'terrain can be reached before a range limit even when the sea-level plane cannot');
  assert.equal(intersectTerrainRay(new THREE.Ray(new THREE.Vector3(0,100,0),new THREE.Vector3(1,0,0))),null);
});

test('map intersection falls back to a bracketed solve when a steep slope makes iteration oscillate', () => {
  const ray=new THREE.Ray(new THREE.Vector3(0,100,0),new THREE.Vector3(1,-1,0).normalize());
  const point=intersectTerrainRay(ray,x=>Math.max(0,20+2*x));
  assert.ok(Math.abs(point.x-80/3)<.01);
  assert.ok(Math.abs(point.y-(20+2*point.x))<.01);
  const fallback=intersectTerrainRay(ray,()=>NaN);
  assert.ok(Math.abs(fallback.y)<.01,'missing streamed elevation uses the existing flat fallback');
});

test('map selection and screen pin both follow terrain, including a later elevation update', t => {
  const previousDocument=globalThis.document;
  const elements=new Map();
  function element(){
    const listeners=new Map();
    return {listeners,style:{},hidden:false,value:'',classList:{toggle(){}},
      addEventListener(name,listener){listeners.set(name,listener);},setAttribute(){},
      replaceChildren(){},append(){},setPointerCapture(){},
      getBoundingClientRect:()=>({left:0,top:0,width:800,height:800})};
  }
  globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);}};
  t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
  const canvas=element(),camera=new THREE.PerspectiveCamera(60,1,.1,10000);
  camera.position.set(0,100,100);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  let elevation=20;
  const navigation=createCityNavigation({canvas,camera,input:{clear(){},pointerLookEnabled:true},
    bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000},onTravel(){},heightAt:()=>elevation});
  navigation.setVisible(true);elements.get('pick-spawn-button').listeners.get('click')();
  canvas.listeners.get('pointerdown')({clientX:400,clientY:400,pointerId:1,button:0,preventDefault(){}});
  const selected=navigation.getState().selected;
  assert.ok(Math.abs(selected.x)<.01);assert.ok(Math.abs(selected.z-20)<.01,'elevation shifts the selected horizontal location along the ray');
  const pin=elements.get('spawn-pin');assert.equal(pin.hidden,false);
  assert.ok(Math.abs(parseFloat(pin.style.top)-400)<.01,'the pin remains beneath the pointer on the raised terrain');
  elevation=35;navigation.updatePin();
  const expected=new THREE.Vector3(selected.x,35,selected.z).project(camera);
  assert.ok(Math.abs(parseFloat(pin.style.top)-(1-expected.y)*400)<1e-6);
  assert.ok(parseFloat(pin.style.top)<400,'streamed terrain updates move the projected pin without changing its geographic selection');
});
