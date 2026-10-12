import test from 'node:test';
import assert from 'node:assert/strict';
import {updateRide,updateChaseHeight} from '../dist/vehicle-presentation.js';

test('terrain ripple is absorbed by the body without changing physical support values',()=>{
  let ride, previousRaw=0,previousVisual=0,rawVariation=0,visualVariation=0;
  for(let i=0;i<300;i++){
    const car={x:0,z:i/6,y:20+.12*Math.sin(i/60*8*Math.PI*2),pitch:.09*Math.sin(i/60*8*Math.PI*2),roll:0};
    const raw={...car};ride=updateRide(ride,car,1/60);
    if(i>60){rawVariation+=Math.abs(car.pitch-previousRaw);visualVariation+=Math.abs(ride.pitch-previousVisual);}
    assert.deepEqual(car,raw);assert.ok(Math.abs(ride.height-car.y)<=.1800001);
    previousRaw=car.pitch;previousVisual=ride.pitch;
  }
  assert.ok(visualVariation<rawVariation*.3);
});

test('constant slope settling is independent of refresh rate and pause holds the pose',()=>{
  const results=[];
  for(const hz of [30,60,120,144]){
    let ride=updateRide(null,{x:0,z:0,y:10,pitch:0,roll:0},0);
    for(let i=0;i<hz;i++)ride=updateRide(ride,{x:0,z:0,y:10.1,pitch:.1,roll:-.08},1/hz);
    results.push(ride);
    const saved={...ride};updateRide(ride,{x:0,z:0,y:10.2,pitch:.2,roll:0},0);assert.deepEqual(ride,saved);
  }
  for(const pose of results)assert.ok(Math.abs(pose.pitch-results[0].pitch)<1e-12&&Math.abs(pose.height-results[0].height)<1e-12);
});

test('travel and recovery reset ride and camera elevation rather than easing across the city',()=>{
  const ride=updateRide(null,{x:0,z:0,y:20,pitch:.1},0);
  const next=updateRide(ride,{x:1000,z:5000,y:8,pitch:0},1/60);
  assert.equal(next.height,8);assert.equal(next.pitch,0);
  const height=updateChaseHeight(null,{x:0,z:0,y:20},0,'car:1');
  assert.equal(updateChaseHeight(height,{x:1000,z:5000,y:8},1/60,'car:1').height,8);
  assert.equal(updateChaseHeight(height,{x:0,z:0,y:21},1/60,'walk').height,21);
});

test('shared chase elevation keeps the eye-to-target angle constant across terrain bumps and climbs',()=>{
  for(const hz of [30,60,120,144]){
    let anchor,firstAngle;
    for(let i=0;i<hz*3;i++){
      const t=i/hz,point={x:0,z:0,y:20+t*.5+.2*Math.sin(t*8*Math.PI*2)};
      anchor=updateChaseHeight(anchor,point,1/hz,'car:1');
      const eyeY=anchor.height+5,targetY=anchor.height+1.1;
      const angle=Math.atan2(targetY-eyeY,9.3);firstAngle??=angle;
      assert.ok(Math.abs(angle-firstAngle)<1e-14);
    }
    assert.ok(anchor.height>21.2,'the camera still follows sustained ascent');
  }
});
