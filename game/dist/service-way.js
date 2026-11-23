// Staff have to be able to walk out from behind the counter. A room whose
// furnishing shuts them in loses the dining furniture that stands in the way.
import { crossesFixture } from './room.js';
import { pathsFromDoor } from './room-walk.js';

const gap=(p,q)=>Math.hypot(p.a-q.a,p.b-q.b);
/** The staff of a room with no walkable way to the floor its guests use. */
export function shutIn(room) {
  const solids=room.things.filter(t=>t.solid), floor=pathsFromDoor(room,.25,.18,solids);
  if(!floor.length)return [];
  // The same test a walk begins with: a floor mark in plain sight of where they stand.
  const sees=spot=>floor.some(n=>!solids.some(t=>crossesFixture(spot,n,t,.14)));
  return room.staff.filter(spot=>!sees(spot));
}
/** Clear tables and stools until everyone on the staff can reach the dining floor. True once they can. */
export function openServiceWay(room) {
  for(let pass=0;pass<8;pass++){
    const stuck=shutIn(room);
    if(!stuck.length)return true;
    const near=thing=>Math.min(...stuck.map(spot=>gap(spot,thing)));
    const tables=room.things.filter(t=>t.shape==='table').sort((s,t)=>near(s)-near(t));
    const seatOf=spot=>spot.fixture ?? room.things.find(t=>t.solid && t.a===spot.a && t.b===spot.b);
    let gone;
    if(tables.length){
      const table=tables[0], seats=room.seats.filter(s=>gap(s,table)<1.2 && (table.a-s.a)*s.da+(table.b-s.b)*s.db>0);
      gone=new Set([table,...seats.map(seatOf),...room.things.filter(t=>!t.solid && t.y>=table.h-.02 && t.y<table.h+.3 && Math.abs(t.a-table.a)<=table.w/2 && Math.abs(t.b-table.b)<=table.d/2)]);
      room.seats=room.seats.filter(s=>!seats.includes(s));
    }else{
      const seat=[...room.seats].sort((s,t)=>near(s)-near(t))[0];
      if(!seat)return false;
      gone=new Set([seatOf(seat)]);room.seats=room.seats.filter(s=>s!==seat);
    }
    room.things=room.things.filter(t=>!gone.has(t));
  }
  return !shutIn(room).length;
}
