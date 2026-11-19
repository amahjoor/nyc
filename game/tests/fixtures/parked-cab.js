import { Simulation } from '../../dist/simulation.js';

// Driving scenarios start with an explicitly parked vehicle beside the actor.
export function parkCab(sim) {
  const cab=sim.ownedCab,p=sim.player,angle=p.angle||0;
  for(const [side,front] of [[0,3.8],[3.2,0],[-3.2,0],[0,-3.8],[4.5,0],[-4.5,0]]){
    const x=p.x+Math.cos(angle)*side+Math.sin(angle)*front, z=p.z-Math.sin(angle)*side+Math.cos(angle)*front;
    if(sim._carContact(x,z,angle))continue;
    Object.assign(cab,{x,z,angle,y:undefined,transportId:null,parked:true});
    if(!sim.cars.includes(cab))sim.cars.unshift(cab);
    sim.updateGrounding();
    return cab;
  }
  throw new Error('No room for the driving fixture');
}
export function drivingCity(city,options) {
  const sim=new Simulation(city,options);
  parkCab(sim);
  return sim;
}
