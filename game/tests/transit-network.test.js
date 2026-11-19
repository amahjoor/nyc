import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransitNetwork, busJourney, legGeometry } from '../dist/transit-network.js';

function fixture(){
  return createTransitNetwork({
    stops:[[0,0,'Bus origin','bus:1'],[1500,0,'Bus transfer','bus:2'],[1600,0,'Train transfer','rail:1'],[3200,0,'Destination','rail:2']],
    lines:{'bus:B':['B','Crosstown','00AEEF'],'rail:R':['R','Downtown','F6BC26']},
    shapes:[[0,0,750,200,1500,0],[1600,0,3200,0]],
    patterns:[{line:'bus:B',head:'East',shape:0,stops:[0,1]},{line:'rail:R',head:'South',shape:1,stops:[2,3]}]
  });
}

test('a commute changes from bus to subway on foot and respects both directions',()=>{
  const n=fixture(),trip=n.commute(n.stops[0],n.stops[3]);
  assert.deepEqual(trip.legs.map(l=>[l.pattern.line.name,l.from.name,l.to.name]),[['B','Bus origin','Bus transfer'],['R','Train transfer','Destination']]);
  assert.deepEqual(legGeometry(n,trip.legs[0]),[[0,0],[750,200],[1500,0]]);
  assert.equal(n.commute(n.stops[3],n.stops[0]),null);
  n.patterns[0].noExit.add(1);
  assert.equal(n.commute(n.stops[0],n.stops[3]),null);
});

test('a Sunday night trip boards on Monday morning and follows its bend to the scheduled arrival',()=>{
  const n=fixture(),table={profiles:[[[[0,600],[],[[25*3600,64]]]],null]};
  const [service]=n.departures(n.stops[0],3599,table);
  assert.equal(service.time,3600);
  const ride=busJourney(n,service,1);
  assert.equal(ride.arrival,4200);
  const mid=ride.at(3900),end=ride.at(4200);
  assert.equal(mid.next,'Bus transfer');
  assert.ok(Math.hypot(mid.x-750,mid.z-200)<.001);
  assert.ok(Math.hypot(end.x-1500,end.z)<.001);
  assert.equal(n.departures(n.stops[0],3601,table)[0].time,7*86400+3600);
});
