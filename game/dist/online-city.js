import { SCENE_INTERVAL, MAX_CARS, MAX_ACTORS, packActor, packCar, unpackActor, validCar, validActor } from './shared-scene.js';
import { strikeVehicleGlass } from './vehicle-damage.js';
import { figureOf } from './crowd.js';

// A neighbourhood has one running game simulation. Followers use its live cars in
// the normal collision/vehicle lists and its cast in the regular crowd renderer.
export function createOnlineCity(sim, crowd, gfx, getExtras, setDay, environment) {
  let replica = null, actors = [], air = null, lastFrameAt=0;
  const tracked = new Set(), ids=new WeakMap(), bodies=new Map(), replicas=new Map();
  let serial=0;
  function actorRow(person,pedestrian) {
    const actor=person.contactActor || person;
    if(!ids.has(actor))ids.set(actor,++serial);
    const id=ids.get(actor);
    bodies.set(id,actor);
    return packActor(person,person.member ?? figureOf(person.look),id,pedestrian);
  }
  const carIndex = new Map();
  function updateCar(row) {
    const [id,type,x,y,z,angle,speed,color,shape,make,model,year,unit,flags,damage,missingDoors,doorOpen,doorSide,plates,glassDamage,shotGlass,brokenGlass,rims,identityShape] = row;
    let car = carIndex.get(id);
    if (!car) car = sim._makeCar(id,type,{x,z},angle);
    const bodyShape = identityShape || shape || 'sedan';
    if (!car.identity || car.identity.make!==make || car.identity.model!==model ||
        car.identity.year!==year || car.identity.shape!==bodyShape) {
      const plain={make,model,year,shape:bodyShape};
      car.identity=type==='taxi'?{...plain,plain}:plain;
    }
    Object.assign(car,{type,x,y,z,angle,speed,color,shape:shape||undefined,unit:unit||undefined,rims:rims||undefined,
      parked:!!(flags&1),_kerb:!!(flags&2),siren:!!(flags&4),destroyed:!!(flags&8),driverEjected:!!(flags&16),
      damage,missingDoors,doorOpen,doorSide,plates,glassDamage,shotGlass,brokenGlass,velocityX:Math.sin(angle)*speed,velocityZ:Math.cos(angle)*speed});
    carIndex.set(id,car);
    return car;
  }
  function indexCars() {
    carIndex.clear();
    for(const car of sim.cars) carIndex.set(String(car.id),car);
  }
  return {
    get replica(){return replica;}, get actors(){return actors;}, get air(){return air;},
    capture() {
      const visible = p=>Number.isFinite(p.x) && Number.isFinite(p.z) && !p.gone;
      const gap = p=>(p.x-sim.player.x)**2+(p.z-sim.player.z)**2;
      const cars = sim.cars.filter(visible).sort((a,b)=>gap(a)-gap(b)).slice(0,MAX_CARS).map(packCar).filter(validCar);
      const walking=new Set(crowd?.people);
      const people = [...walking,...getExtras()].filter(p=>p.look && visible(p));
      people.sort((a,b)=>gap(a)-gap(b));
      const helicopter=sim.police.helicopter;
      bodies.clear();
      const {bikes, rooms,fronts,policeScene}=environment();
      const props=[];
      for(const [id,p] of sim.streetObjects.damage){
        const body=sim.streetObjects.byId.get(id);
        if(body && gap(body)<240**2)props.push([id,...[p.dx,p.dz,p.lift,p.tilt,p.nx,p.nz,p.vx,p.vz,p.vy,p.air,p.spin,p.restTilt].map(v=>Math.round((v||0)*1000)/1000),Number(!!p.settled)]);
      }
      return {props:props.slice(-64),cars,actors:people.slice(0,MAX_ACTORS).map(p=>actorRow(p,walking.has(p))).filter(validActor),
        bikes:(bikes?.bicycles || []).slice(0,64).map(b=>[b.x,b.y||0,b.z,b.angle,Number(b.personal),
          (b.owner?.look?.height || 1.76)/1.76,b.owner?.pedal||0]),
        equipment:policeScene.captureEquipment(),
        glass:[...(fronts?.brokenPanes || [])].flatMap(([key,panes])=>[...panes].map(pane=>[String(key),pane])).slice(-96),
        doors:[...(rooms || [])].filter(v=>Math.abs(v.door.angle)>.008 || Math.abs(v.door.velocity)>.02)
          .slice(0,64).map(v=>[String(v.plan.place.id),v.door.angle,v.door.velocity]),
        air:helicopter?[helicopter.x,helicopter.y,helicopter.z,helicopter.angle,helicopter.vx,helicopter.vz,
          helicopter.light.x,helicopter.light.z,Number(!!helicopter.leaving)]:null};
    },
    receive(frame) {
      indexCars();
      const local=sim.vehicle;
      const next=[];
      for(const row of frame.cars) {
        if(local && row[0]===String(local.id))continue;
        next.push(updateCar(row));
      }
      if(local)next.push(local);
      sim.cars=next;
      const keep=new Set();
      actors=frame.actors.map(row=>{
        const key=row[17], actor=replicas.get(key) || {};
        Object.assign(actor,unpackActor(row));
        replicas.set(key,actor);keep.add(key);return actor;
      });
      for(const key of replicas.keys())if(!keep.has(key))replicas.delete(key);
      for(const [key,...pose] of frame.props)sim.streetObjects.applyPose(key,pose);
      const doors=new Map(frame.doors.map(d=>[d[0],d]));
      const {rooms,fronts}=environment(), views=new Map();
      for(const view of rooms || []){
        views.set(String(view.plan.place.id),view);
        const door=doors.get(String(view.plan.place.id));
        if(door){view.door.angle=door[1];view.door.velocity=door[2];}
      }
      for(const [key,pane] of frame.glass)if(views.has(key))fronts.breakGlass(views.get(key),pane);
      const a=frame.air;
      air=a?{x:a[0],y:a[1],z:a[2],angle:a[3],vx:a[4],vz:a[5],light:{x:a[6],z:a[7]},leaving:!!a[8]}:null;
      lastFrameAt=performance.now();replica=frame;sim.onlineReplica=true;
    },
    contact(event, source) {
      const [kind,id,dx,dz,zone]=event;
      if(kind==='prop'){
        const body=sim.streetObjects.byId.get(id);
        if(body && Math.hypot(body.x+(body.pose?.dx||0)-source.x,body.z+(body.pose?.dz||0)-source.z)<12)
          sim.streetObjects.strike({body,nx:zone[0],nz:zone[1]},source,dx,dz,zone[2],sim.elapsed);
        return;
      }
      if(kind==='window'){
        const car=sim.cars.find(c=>String(c.id)===id);
        if(car && Math.hypot(car.x-source.x,car.z-source.z)<160)strikeVehicleGlass(car,dx,dz);
        return;
      }
      if(kind==='glass'){
        const {rooms,fronts}=environment();
        const view=[...(rooms || [])].find(v=>String(v.plan.place.id)===id);
        if(view && Math.hypot(view.plan.x-source.x,view.plan.z-source.z)<160)fronts.breakGlass(view,zone);
        return;
      }
      if(kind==='door'){
        const view=[...(environment().rooms || [])].find(v=>String(v.plan.place.id)===id);
        if(view && Math.hypot(view.plan.x-source.x,view.plan.z-source.z)<25){
          view.door.angle=dx;view.door.velocity=dz;
        }
        return;
      }
      const actor=bodies.get(id);
      if(!actor || Math.hypot(actor.x-source.x,actor.z-source.z)>(kind==='strike'?5:160))return;
      if(kind==='shot'){
        if(sim.police.officers.includes(actor) || sim.police.fieldOfficers.includes(actor))sim.police.hitByShot(actor,zone);
        else crowd.hitByShot(actor,{x:dx,z:dz},zone);
      }else if(kind==='strike'){
        if(sim.police.officers.includes(actor) || sim.police.fieldOfficers.includes(actor))sim.police.strike(source.x,source.z,dx,1,source.y,false,actor);
        else crowd.strike(source.x,source.z,dx,{target:actor,y:source.y,time:sim.elapsed,bystanders:[actor]});
      }
    },
    advance(dt) {
      if(!replica || performance.now()-lastFrameAt>SCENE_INTERVAL*1.5)return;
      for(const car of sim.cars){
        if(car.controlled || car.onlineDriver || car.parked || car.destroyed)continue;
        car.x+=car.velocityX*dt;car.z+=car.velocityZ*dt;
      }
    },
    denyDrive(id) {
      if(sim.player.mode==='drive' && String(sim.vehicle?.id)===id)sim.interact();
    },
    drivers(rows) {
      indexCars();
      const next=new Set();
      for(const row of rows) {
        if(sim.vehicle && String(sim.vehicle.id)===row[0])continue;
        const exists=carIndex.has(row[0]);
        const car=updateCar(row);
        car.onlineDriver=true;
        if(!exists)sim.cars.push(car);
        next.add(car);
      }
      for(const car of tracked.keys())if(!next.has(car)) {
        delete car.onlineDriver;
        car.parked=true;car.speed=0;car._edge=null;
      }
      tracked.clear();
      for(const car of next)tracked.add(car);
    },
    time(seconds) {
      const hours=19.55+seconds/75;
      gfx.hours=hours%24;
      sim.onlineClock=seconds;
      setDay((2+Math.floor(hours/24))%7);
    },
    release(resume=false) {
      if(replica) {
        sim.onlineReplica=false;
        if(resume)crowd?.resumePedestrians(actors);
        for(const car of sim.cars){
          const serial=/^traffic-(\d+)$/.exec(car.id);
          if(serial)sim._trafficSerial=Math.max(sim._trafficSerial||100,Number(serial[1]));
        }
        sim._rebindTraffic();
      }
      replica=null;actors=[];replicas.clear();air=null;
    },
    disconnect() {
      this.release();this.drivers([]);delete sim.onlineClock;carIndex.clear();
    }
  };
}
