import { FARE, GATE_Z, clockTime, createSubwayJourney, fareStation } from './subway-service.js';
import { JOIN, HALL, LIFT_TRAVEL, localFloor, localPoint, worldPoint, stationFrame, platformAt, streetPassage, passage, cabinCamera, trainLeg, turnBetween, clamp } from './subway-space.js';
import { createSubwayRiders } from './subway-riders.js';

export function createSubwayVisit(table,entrance,now,{$,interaction,sim,pay,exit,chime,view,resolveExit,heightAt=()=>entrance.y,stairSurface,turnCamera}) {
  const j=createSubwayJourney(table,entrance,now);
  function dock(stop,portal){
    const platform=table.platforms[stop];
    return platformAt(platform,portal,heightAt(platform.x,platform.z));
  }
  let platformFrame=dock(j.stop,entrance),carFrame=platformFrame,leg=null,transfer=null;
  let entry=stationFrame(entrance),access=streetPassage(entrance,platformFrame,heightAt);
  let lift=entrance.kind===0?1:0,liftTarget=1,lastFloor,portalCheck=0;
  const at=localPoint(entry,sim.player);
  j.x=clamp(at.x,-.45,.45);j.z=at.z;
  function connect(frame){
    platformFrame=carFrame=frame;entry=stationFrame(frame.portal);
    access=streetPassage(frame.portal,frame,heightAt);lift=liftTarget=1;
  }
  function pose(){
    if(j.aboard)return {frame:carFrame,z:j.z,floor:0};
    if(transfer?.walking)return {frame:transfer.path.at(transfer.d),z:0,floor:0};
    if(j.z<JOIN)return {frame:entry,z:j.z,floor:localFloor(JOIN,entry.open)};
    if(j.z<HALL)return {frame:access.at((j.z-JOIN)*access.length/(HALL-JOIN)),z:0,floor:0};
    return {frame:platformFrame,z:j.z,floor:localFloor(j.z,!platformFrame.belowGrade)};
  }
  function select(service){
    if(service.pattern.stops[service.index]!==j.stop && j.z>=2){
      const stop=service.pattern.stops[service.index],dest=dock(stop,resolveExit(j.station,stop));
      const start={...worldPoint(platformFrame,0,0,2),angle:platformFrame.angle+Math.PI};
      const end={...worldPoint(dest,0,0,2),angle:dest.angle};
      transfer={service,dest,source:platformFrame,path:passage(start,end),d:0,walking:false};
      return;
    }
    transfer=null;
    if(!j.select(service)){
      const next=j.options().find(s=>s.key===service.key);
      if(next)j.select(next);else j.notice='That departure has left.';
    }
  }
  const riders=createSubwayRiders();j.clearRiders=riders.clear;
  const panel=$('subway-status'), title=$('subway-location'), detail=$('subway-service'), prompt=$('subway-action');
  panel.hidden=false;
  function fare(go){
    const cash=()=>sim.cash-(sim.rideHoldCents||0)/100;
    const rows=[{name:'Tap to pay',note:'$'+FARE.toFixed(2),disabled:cash()<FARE}];
    interaction.openList(j.station.name,rows,()=>{
      if(cash()<FARE)return;
      sim.cash-=FARE;go();pay();
    },{cash:sim.cash,message:'Fare control · Jump while moving through the gate to hop it.'});
  }
  function chooseTrain(){
    const choices=j.options().map(service=>{
      const {pattern,index,route}=service;
      const platform=table.platforms[pattern.stops[index]], next=table.platforms[pattern.stops[index+1]];
      const direction=pattern.direction===0?platform.north:platform.south;
      return {name:route.name+'  '+pattern.headsign,note:clockTime(service.time)+' · '+direction+' · Next '+next.name,
        color:'#'+route.color,service};
    });
    if(j.phase==='waiting' && j.remaining>4)choices.unshift({name:'Wait for selected train',note:j.service.route.name+'  '+j.service.pattern.headsign});
    interaction.openList(j.station.name+' · Departures',choices,row=>{
      if(!row.service)j.waitForTrain();
      else select(row.service);
    },{message:choices.length?'Choose a platform and direction.':'No scheduled departures from this stop.'});
  }
  function interact(){
    if(transfer?.walking)return;
    if(transfer && j.z>=2){chooseTrain();return;}
    switch(j.action){
      case 'gate':
        if(!j.entryPaid && fareStation(j.station))fare(()=>{j.entryPaid=true;});
        break;
      case 'leave':
        if(j.hasRidden && j.station.lines.includes('SIR') && fareStation(j.station))fare(()=>{j.hasRidden=false;});
        break;
      case 'board':j.board();break;
      case 'alight':j.alight();break;
      case 'services':chooseTrain();break;
    }
  }
  // The fixed-step walker supplies its normal acceleration, facing and jump.
  // Only its supporting floor and the horizontal contact bounds change here.
  function walk(p,dt){
    const before=pose(),wasTransferring=Boolean(transfer?.walking);
    const warn=j.phase==='dwell' && j.remaining>1.75;
    const wasRunning=j.phase==='running';
    j.update(dt);
    if(warn && j.remaining<=1.75)chime();
    if(j.phase==='running'){
      if(!leg){
        const pattern=j.service.pattern,next=pattern.stops[j.index+1],to=table.stationAt(next);
        const dest=dock(next,resolveExit(to,next));
        leg={from:platformFrame,to:dest,station:to,point:trainLeg(table,pattern,j.index,platformFrame,dest)};
      }
      const t=1-j.remaining/j.duration;
      carFrame=leg.point(t);
      platformFrame=t>.5?leg.to:leg.from;
    }else if(wasRunning && leg){
      connect(leg.to);leg=null;portalCheck=0;
    }
    // Streaming can refine an exit's pavement and kerb while the train is on
    // its way. Only move the street connection, never the occupied rail car.
    if(!leg && !transfer && (j.aboard || j.z>HALL+1) && (portalCheck-=dt)<=0){
      portalCheck=1;
      const p=resolveExit?.(j.station,j.stop),old=platformFrame.portal;
      if(p && (p.x!==old.x||p.y!==old.y||p.z!==old.z||p.angle!==old.angle) && j.hasRidden){
        connect({...platformFrame,portal:p});
      }
    }
    const visibleStation=leg && platformFrame===leg.to?leg.station:j.station;
    riders.step(j,visibleStation,dt);
    const c=Math.cos(before.frame.angle),s=Math.sin(before.frame.angle);
    const dx=(p.velocityX*c-p.velocityZ*s)*dt,dz=(p.velocityX*s+p.velocityZ*c)*dt;
    const beforeX=j.x,beforeZ=j.z;
    const paidExit=j.hasRidden && j.station.lines.includes('SIR') && fareStation(j.station);
    const gateFloor=platformFrame.y+localFloor(GATE_Z,!platformFrame.belowGrade);
    const jumpingGate=!p.grounded && p.y-gateFloor>.76;
    if(!j.aboard && (!fareStation(j.station)||Math.abs(j.x)<.78) && Math.abs(j.z-GATE_Z)<.36+Math.abs(dz)){
      if(!j.inside && dz>0 && (j.entryPaid||!fareStation(j.station)||jumpingGate)){
        if(!j.entryPaid && fareStation(j.station))sim.offence('fare',{x:p.x,y:p.y,z:p.z});
        j.entryPaid=false;j.enterPaidArea();
      }else if(j.inside && dz<0 && (!paidExit||jumpingGate)){
        if(paidExit)sim.offence('fare',{x:p.x,y:p.y,z:p.z});
        j.hasRidden=false;j.leavePaidArea();
      }
    }
    const portal=platformFrame.portal;
    if(!j.inside && portal.kind!==0 && j.z<JOIN){
      if(lift===1 && dz<0 && j.z<JOIN-.5)liftTarget=0;
      if(lift===0 && dz>0)liftTarget=1;
      if(lift!==liftTarget){
        lift+=Math.sign(liftTarget-lift)*Math.min(Math.abs(liftTarget-lift),dt*.66);
      }else j.walk(dx,dz);
    }else if(transfer?.walking){
      j.x=clamp(j.x+dx,-1.02,1.02);
      transfer.d+=dz;
      if(transfer.d>=transfer.path.length){
        const {dest,service}=transfer;transfer=null;connect(dest);
        j.stop=service.pattern.stops[service.index];j.z=2.05;j.service=null;j.phase='station';
        select(service);
      }else if(transfer.d<0){
        transfer.walking=false;transfer.d=0;j.x=-j.x;j.z=2.05;
      }
    }else{
      const onLink=!j.aboard && j.z>=JOIN && j.z<HALL;
      j.walk(dx,onLink?dz*(HALL-JOIN)/access.length:dz);
      if(transfer && beforeZ>=2 && j.z<2){
        transfer.walking=true;transfer.d=0;j.x=-j.x;j.z=2;
      }
    }
    const after=pose();
    if(after.frame.width)j.x=clamp(j.x,-after.frame.width+.24,after.frame.width-.24);
    const pos=worldPoint(after.frame,j.x,0,after.z);
    // Carry both the body and its velocity with a turning car or passage.
    // Crossing a transfer threshold reverses its local axes, not the viewer.
    const reversed=transfer && wasTransferring!==transfer.walking;
    const angleChange=turnBetween(before.frame.angle+(reversed?Math.PI:0),after.frame.angle);
    if(angleChange){
      p.angle+=angleChange;turnCamera(angleChange);
      const co=Math.cos(angleChange),si=Math.sin(angleChange),vx=p.velocityX,vz=p.velocityZ;
      p.velocityX=co*vx+si*vz;p.velocityZ=co*vz-si*vx;
    }
    let floor=after.frame.y+after.floor;
    if(!j.aboard && j.z<JOIN && portal.kind===0)floor=stairSurface(pos.x,pos.z)?.elevation??portal.y;
    if(!j.aboard && j.z<JOIN && portal.kind!==0)floor=portal.y+(portal.open?1:-1)*lift*LIFT_TRAVEL;
    const distance=j.aboard?Math.hypot(j.x-beforeX,j.z-beforeZ):Math.hypot(p.x-pos.x,p.z-pos.z);
    Object.assign(p,{x:pos.x,z:pos.z,speed:Math.min(distance/dt,Math.hypot(p.velocityX,p.velocityZ))});
    if(p.grounded)p.y=floor;
    else if(j.aboard && lastFloor!==undefined)p.y+=floor-lastFloor;
    lastFloor=floor;
    if(!j.inside && dz<0 && j.z<=JOIN-(portal.kind===0?4.36:1.42))exit();
    if(j.notice && (dx||dz))j.notice='';
    return floor;
  }
  function draw(){
    view.update(j,platformFrame,carFrame,lift,transfer?.walking?transfer.path:access);
    riders.draw(view,platformFrame);
    const train=j.service, name=train?train.route.name+'  '+train.pattern.headsign:'';
    title.textContent=j.aboard?name:j.station.name;
    const state=j.phase==='running'?'Next stop · '+j.nextPlatform.name:
      j.phase==='departing'?name+' · Departing':j.phase==='waiting'?name+' · '+clockTime(train.time):j.phase==='dwell'?(j.aboard?j.platform.name+' · ':name+' · ')+'Train at platform':
      j.station.routes+' · '+clockTime(j.now);
    detail.textContent=state;
    const hints={gate:j.entryPaid?'Fare paid · Walk through':fareStation(j.station)?'E · Pay fare   /   Jump + move · Hop gate':'Walk through to the platform',
      exit:j.leaving?'Follow the exit to the street':'Follow the passage to fare control',leave:'Walk through to exit fare control',board:'E · Board train',alight:'E · Step onto the platform',services:'E · Choose train or transfer'};
    if(j.action==='leave' && j.hasRidden && j.station.lines.includes('SIR') && fareStation(j.station))hints.leave='E · Pay exit fare   /   Jump + move · Hop gate';
    if(transfer){prompt.textContent=transfer.walking?'Follow the passage to the '+transfer.service.route.name+' platform':'Transfer to '+transfer.service.route.name+' · Walk to the stairs at the end of this platform';return;}
    prompt.textContent=j.notice||hints[j.action]||(j.aboard?'Stay aboard for the next stop':
      j.inside?'Follow the stairs to the platform':'Walk to the fare gates');
  }
  function cameraReach(yaw,pitch,eye){
    const {frame}=pose();
    const a=yaw-frame.angle,backX=-Math.sin(a),backZ=-Math.cos(a);
    const portal=platformFrame.portal;
    const street=portal.kind===0 && j.z<JOIN;
    const path=transfer?.walking?transfer.path:j.z>=JOIN && j.z<HALL?access:null;
    const along=transfer?.walking?transfer.d:(j.z-JOIN)*access.length/(HALL-JOIN);
    const reach=street?3.5+3*clamp((JOIN-j.z)/4.3,0,1):3.5;
    for(let d=.08;d<=reach;d+=.08){
      const x=j.x+backX*d,z=j.z+backZ*d;
      if(path){
        const point=worldPoint(frame,x,eye-frame.y+Math.sin(pitch)*d,backZ*d);
        if(!path.containsEye(point,along))return d-.08;
      }else{
        if(street && z<JOIN && eye+Math.sin(pitch)*d>portal.y+1.1)continue;
        const half=z<JOIN?.69:z < -14?1.42:1.77;
        if(z<2 && Math.abs(x)>half || z>=2 && (x>3.38||x< -7.1||z>40.5))return d-.08;
        const height=eye+Math.sin(pitch)*d-frame.y-localFloor(z,frame.belowGrade===undefined?frame.open:!frame.belowGrade);
        if(!frame.open && z>=JOIN && height>(z< -14?2.02:z<2?3.35:3.85))return d-.08;
      }
    }
    return reach;
  }
  return {
    journey:j,actors:riders.visible,walk,draw,interact,cameraReach,
    cabinEye:(yaw,pitch,eye)=>j.aboard?cabinCamera(j,carFrame,yaw,pitch,eye):null,
    get cabin(){return platformFrame.portal.kind!==0?platformFrame.portal:null;},
    get belowStreet(){
      const lower=platformFrame.belowGrade || (!j.aboard && !platformFrame.portal.open && j.z<2);
      return lower && (j.z>=JOIN || j.aboard || this.cabin && lift>.65);
    },
    get enclosed(){return this.belowStreet && (j.aboard || transfer?.walking || j.z>=HALL || (j.z-JOIN)*access.length/(HALL-JOIN)>2 || this.cabin && lift>.85);},
    get section(){return transfer?.walking?'transfer':j.aboard?'car':j.z<JOIN?'entrance':j.z<HALL?'passage':'station';},
    ceiling(floor){
      if(j.aboard)return floor+2.6;
      if(this.cabin && j.z<JOIN)return floor+2.2;
      if(transfer?.walking || platformFrame.belowGrade && j.z>=JOIN && j.z<HALL)return floor+(pose().frame.clearance??2.52)-.04;
      if(!platformFrame.open && j.z>=HALL)return floor+(j.z<2?3.4:3.9);
      return Infinity;
    },
    dispose(){panel.hidden=true;}
  };
}
