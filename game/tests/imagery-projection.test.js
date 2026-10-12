import test from 'node:test';
import assert from 'node:assert/strict';
import { mercatorCoefficients } from '../dist/imagery-projection.js';
import { CITY_ORIGIN, tileForPoint, tileBounds } from '../dist/city-ground.js';

const R=6371008.8, f=Math.fround;
function atlas(lon,lat,zoom,radius){
  const t=tileForPoint(lon,lat,zoom),north=tileBounds(t.column-radius,t.row-radius,zoom),south=tileBounds(t.column+radius,t.row+radius,zoom);
  const bounds={minX:north.minX,maxX:south.maxX,minZ:north.minZ,maxZ:south.maxZ};
  const originLat=CITY_ORIGIN.lat*Math.PI/180;
  const mercator={north:Math.asinh(Math.tan(originLat-bounds.minZ/R)),south:Math.asinh(Math.tan(originLat-bounds.maxZ/R)),originLat,radius:R};
  return {bounds,mercator};
}
function gpuUV(z,b,c){
  const t=f(f(f(f(b.maxZ)-f(z))/f(f(b.maxZ)-f(b.minZ)))-.5),v=c.map(f);
  return f(v[0]+f(t*f(v[1]+f(t*f(v[2]+f(t*v[3]))))));
}
function previousUV(z,b,m){
  const latitude=f(f(m.originLat)-f(f(z)/f(m.radius)));
  return f(f(f(Math.log(f(Math.tan(f(f(Math.PI/4)+f(latitude*.5))))))-f(m.south))/f(f(m.north)-f(m.south)));
}

test('float32 imagery projection stays below source pixel size across NYC at local and city scales',()=>{
  for(const [lon,lat] of [[-74.1,40.61],[-73.88,40.865],[-73.842,40.738],[-73.97,40.655],[-73.976,40.767]]){
    for(const [zoom,radius] of [[19,4],[12,4]]){
      const {bounds:b,mercator:m}=atlas(lon,lat,zoom,radius),c=mercatorCoefficients(b,m),height=b.maxZ-b.minZ;
      let error=0;
      for(let i=0;i<=1000;i++){
        const z=b.minZ+height*i/1000;
        const exact=(Math.asinh(Math.tan(m.originLat-z/R))-m.south)/(m.north-m.south);
        error=Math.max(error,Math.abs(gpuUV(z,b,c)-exact)*height);
      }
      assert.ok(error<.025,`${lon},${lat},z${zoom}: ${error} m exceeds 2.5 cm`);
    }
  }
});

test('nearby source pixels remain distinct instead of collapsing into metre-wide bands',()=>{
  const {bounds:b,mercator:m}=atlas(-73.842,40.738,19,4),c=mercatorCoefficients(b,m);
  const center=(b.minZ+b.maxZ)/2,old=new Set(),corrected=new Set();
  for(let i=0;i<100;i++){const z=center+i*.05;old.add(previousUV(z,b,m));corrected.add(gpuUV(z,b,c));}
  assert.ok(old.size<20,'the test must reproduce lost spatial precision in the old shader');
  assert.equal(corrected.size,100,'all five-centimetre movements retain distinct source positions');
});

test('invalid atlas parameters cannot produce nonfinite shader uniforms',()=>{
  const {bounds,mercator}=atlas(-74,40.7,19,4);
  for(const invalid of [null,{...mercator,radius:0},{...mercator,north:NaN},{...mercator,south:mercator.north}])assert.equal(mercatorCoefficients(bounds,invalid),null);
  assert.equal(mercatorCoefficients({...bounds,maxZ:bounds.minZ},mercator),null);
});
