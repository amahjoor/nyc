// Times are scheduled seconds from Monday midnight on a repeating service week.
// Trips after midnight can belong to the previous service day (e.g. 25:10).
const DAY=86400;
export const RAMP_FRACTION=.18;
// Real seconds for an occupied ride. GTFS times advance on the game clock.
// Bound both cruising speed (m/s) and starting/braking acceleration (m/s²).
function rideSeconds(distance,timetableSeconds){
  const cruise=distance/(24*(1-RAMP_FRACTION));
  const acceleration=Math.sqrt(distance/(1.25*RAMP_FRACTION*(1-RAMP_FRACTION)));
  return Math.max(4,timetableSeconds/12,cruise,acceleration);
}
export function createTimetable(data, stations) {
  const platforms=data?.platforms || {}, patterns=data?.patterns || [];
  const tracks=data?.tracks||[];
  const trackLengths=tracks.map(points=>{
    let metres=0;
    for(let i=2;i<points.length;i+=2)metres+=Math.hypot(points[i]-points[i-2],points[i+1]-points[i-1]);
    return metres;
  });
  const byId=new Map(stations.map(station=>[station.id,station])), calls=new Map();
  for(const pattern of patterns)pattern.stops.slice(0,-1).forEach((stop,index)=>{
    const id=platforms[stop].complex;
    if(!calls.has(id))calls.set(id,[]);
    calls.get(id).push({pattern,index});
  });
  function departures(station,now) {
    const options=new Map(), today=Math.floor(now/DAY);
    for(const {pattern,index} of calls.get(station.id)||[]){
      // Variants with different stops ahead are distinct passenger choices.
      const key=pattern.route+' '+pattern.headsign+' '+pattern.stops.slice(index).join('/');
      let best=options.get(key);
      for(let day=today-1;day<=today+7;day++){
        const midnight=day*DAY, mask=1<<((day%7+7)%7);
        if(best && midnight>best.time)break;
        for(const [start,days,profile] of pattern.runs){
          if(!(days&mask))continue;
          const offsets=pattern.profiles[profile], base=midnight+start;
          const time=base+offsets[index*2+1];
          if(time<now || best && time>=best.time)continue;
          best={pattern,index,base,offsets,time,route:data.routes[pattern.route],key};
        }
      }
      if(best)options.set(key,best);
    }
    const list=[...options.values()].sort((a,b)=>a.time-b.time);
    return list.filter(row=>row.time<=Math.max(list[0].time,now+3600));
  }
  return {departures,platforms,tracks,trackLengths,stationAt:stop=>byId.get(platforms[stop]?.complex)};
}

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
export const FARE=3;
export const fareStation=s=>!s.lines.includes('SIR') && !s.lines.includes('SI') || /^(St George|Tompkinsville)$/i.test(s.name);
export const clockTime=seconds=>{
  const minutes=Math.floor(seconds/60)%1440,hours=Math.floor(minutes/60);
  return (hours%12||12)+':'+String(minutes%60).padStart(2,'0')+(hours<12?' AM':' PM');
};

// Local station coordinates share the floor, edge and doors drawn by the view.
export const PLATFORM_EDGE=-3.5, TRAIN_X=-5.05, GATE_Z=-6.5;
export const BENCHES=[9,24,35];
export const WAITING_RIDERS=[[-1.15,8.6],[.9,17.4],[-1.6,23.1],[1.25,31.4],[-.55,37.5]];
export const CAR_CENTRES=[-8,12,32], DOORS=CAR_CENTRES.flatMap(z=>[-6,0,6].map(offset=>z+offset));
export function createSubwayJourney(table,entrance,now) {
  const journey={
    origin:entrance,station:entrance.station,stop:entrance.stop||entrance.station.stops[0],now,
    x:0,z:-10.5,inside:false,aboard:false,service:null,index:0,
    phase:'station',remaining:0,duration:0,notice:'',
    get platform(){return table.platforms[this.stop];},
    get nextPlatform(){return this.service && table.platforms[this.service.pattern.stops[this.index+1]];},
    options(){return table.departures(this.station,this.now);},
    select(service){
      if(!this.inside || this.aboard || !service || service.time<this.now ||
          table.stationAt(service.pattern.stops[service.index])!==this.station)return false;
      this.service=service;this.index=service.index;this.stop=service.pattern.stops[this.index];
      this.phase='waiting';this.remaining=Math.max(0,(service.time-this.now)/12);
      return true;
    },
    enterPaidArea(){
      if(this.inside)return;
      this.inside=true;this.leaving=false;this.z=GATE_Z+.7;this.notice='';
      this.select(this.options().find(s=>s.pattern.stops[s.index]===this.stop));
    },
    get atDoor(){return this.x< -1.2 && DOORS.some(z=>Math.abs(z-this.z)<1.8);},
    get doorsOpen(){return this.phase==='dwell' && this.duration-this.remaining>=.7 && this.remaining>.7;},
    board(){
      if(!this.inside || this.aboard || !this.doorsOpen || !this.atDoor)return false;
      this.aboard=true;this.hasRidden=true;this.x=TRAIN_X+.62;
      this.z=DOORS.reduce((a,b)=>Math.abs(b-this.z)<Math.abs(a-this.z)?b:a);
      return true;
    },
    alight(){
      if(!this.aboard || !this.doorsOpen)return false;
      this.aboard=false;this.x=PLATFORM_EDGE+.48;this.z=clamp(this.z,2.2,39.8);
      this.notice='';return true;
    },
    walk(dx,dz){
      if(this.aboard){
        const centre=CAR_CENTRES.reduce((a,b)=>Math.abs(b-this.z)<Math.abs(a-this.z)?b:a);
        const x=clamp(this.x+dx,TRAIN_X-.55,TRAIN_X+.78),z=clamp(this.z+dz,centre-9.3,centre+9.3);
        if(!this.clearRiders || this.clearRiders(x,this.z,true))this.x=x;
        if(!this.clearRiders || this.clearRiders(this.x,z,true))this.z=z;
        return;
      }
      // The hall meets one end of the platform. Its side walls continue around the stairs.
      const wide=this.z>=2;
      const clear=(x,z)=>!BENCHES.some(bench=>Math.abs(z-bench)<1.72 && Math.abs(x-2.2)<.59) &&
        !(x>2.31 && x<3.19 && z>=3.55 && z<=40.45 && Math.abs((z-4)-6*Math.round((z-4)/6))<.45) &&
        (!this.clearRiders || this.clearRiders(x,z,false));
      const half=this.z < -20 ? .45 : 1.4;
      const nextX=clamp(this.x+dx,wide?PLATFORM_EDGE+.36:-half,wide?3.1:half);
      if(clear(nextX,this.z))this.x=nextX;
      const min=this.z>=2 && Math.abs(this.x)>1.4 ? 2 : this.inside ? GATE_Z+.35 : -26;
      const nextZ=clamp(this.z+dz,min,this.inside?40:GATE_Z-.35);
      if(clear(this.x,nextZ))this.z=nextZ;
    },
    get action(){
      if(this.aboard)return this.doorsOpen?'alight':null;
      if(!this.inside)return this.z<-10.9?'exit':this.z>=GATE_Z-2.4?'gate':null;
      if(this.z<GATE_Z+1.9)return 'leave';
      if(this.z<2)return null;
      if(this.doorsOpen && this.atDoor)return 'board';
      return 'services';
    },
    leavePaidArea(){
      this.inside=false;this.leaving=true;this.service=null;this.phase='station';this.z=GATE_Z-.8;
      this.notice='';
    },
    waitForTrain(){
      if(this.phase!=='waiting' || this.remaining<=4)return;
      this.now+=(this.remaining-4)*12;this.remaining=4;
    },
    update(dt){
      if(dt<=0)return;
      const service=this.service;
      if(!service){this.now+=dt*12;return;}
      this.remaining=Math.max(0,this.remaining-dt);
      // A scheduled ride uses the published times between calls. Give riders
      // a playable door interval even where GTFS has zero scheduled dwell.
      if(this.phase==='running'){
        const arrive=service.base+service.offsets[(this.index+1)*2];
        this.now+=Math.min(Math.max(0,arrive-this.now),dt*this.legRate);
      }else if(this.phase==='waiting' || this.phase==='departing')this.now+=dt*12;
      if(this.remaining>0)return;
      if(this.phase==='departing'){
        this.now+=.01;this.service=null;this.phase='station';this.select(this.options().find(s=>s.pattern.stops[s.index]===this.stop));return;
      }
      if(this.phase==='running' || this.phase==='waiting'){
        if(this.phase==='running'){
          this.index++;this.stop=service.pattern.stops[this.index];this.station=table.stationAt(this.stop);
        }
        this.phase='dwell';this.remaining=this.duration=Math.max(8,(service.offsets[this.index*2+1]-service.offsets[this.index*2])/12);
        return;
      }
      this.now=Math.max(this.now,service.base+service.offsets[this.index*2+1])+.01;
      if(this.aboard && this.index+1<service.pattern.stops.length){
        const seconds=Math.max(1,service.base+service.offsets[(this.index+1)*2]-this.now);
        const metres=table.trackLengths[service.pattern.tracks[this.index]];
        this.phase='running';this.remaining=this.duration=rideSeconds(metres,seconds);this.legRate=seconds/this.duration;
      }else{
        if(this.aboard){this.aboard=false;this.x=PLATFORM_EDGE+.48;this.z=clamp(this.z,2.2,39.8);this.notice='Last stop. All passengers off.';}
        this.phase='departing';this.remaining=this.duration=4;
      }
    },
  };
  return journey;
}
