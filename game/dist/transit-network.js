// Offline bus and subway route geometry, directed boarding patterns and nearby transfers.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const cell=(x,z)=>Math.floor(x/500)+','+Math.floor(z/500);
const DAY=86400;

export function createTransitNetwork(data) {
  const grid=new Map();
  const stops=data.stops.map(([x,z,name,id],index)=>{
    const stop={x,z,name,id,index,lines:new Set(),calls:[]},key=cell(x,z);
    if(!grid.has(key))grid.set(key,[]);
    grid.get(key).push(stop);return stop;
  });
  const shapes=data.shapes.map(flat=>{
    const points=[];
    let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
    for(let i=0;i<flat.length;i+=2){
      const x=flat[i],z=flat[i+1];points.push([x,z]);
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
    }
    return {points,minX,minZ,maxX,maxZ};
  });
  const lines=new Map(Object.entries(data.lines).map(([id,[name,description,color]])=>[id,{id,name,description,color:'#'+color,shapes:new Set()}]));
  const patterns=data.patterns.map((p,i)=>{
    const line=lines.get(p.line),shape=shapes[p.shape];
    line.shapes.add(shape);
    const pattern={...p,index:i,line,shape,noBoard:new Set(p.noBoard),noExit:new Set(p.noExit)};
    p.stops.forEach((id,k)=>{
      stops[id].lines.add(line);
      if(k+1<p.stops.length && !pattern.noBoard.has(k))stops[id].calls.push({pattern,k});
    });
    return pattern;
  });
  function nearby(point,radius) {
    const found=[];
    for(let x=Math.floor((point.x-radius)/500);x<=Math.floor((point.x+radius)/500);x++)
      for(let z=Math.floor((point.z-radius)/500);z<=Math.floor((point.z+radius)/500);z++)
        for(const s of grid.get(x+','+z)||[])if(distance(point,s)<=radius)found.push(s);
    return found.sort((a,b)=>distance(point,a)-distance(point,b));
  }
  // Walk to a stop, ride forward, and optionally change services twice. Walking
  // distances are straight-line estimates; the street navigator handles the walk.
  function commute(from,to) {
    const ends=new Map(nearby(to,650).map(s=>[s.index,distance(s,to)]));
    let frontier=new Map(nearby(from,650).map(s=>[s.index,{cost:distance(from,s)/1.3,legs:[]}]));
    let best=null;
    for(let round=0;round<3 && frontier.size && ends.size;round++){
      const reached=new Map();
      const active=new Map();
      for(const [id,state] of frontier)for(const {pattern,k} of stops[id].calls){
        if(!active.has(pattern))active.set(pattern,new Map());
        active.get(pattern).set(k,state);
      }
      for(const [p,boards] of active){
        let onboard=null;
        for(let k=0;k<p.stops.length;k++){
          const s=stops[p.stops[k]];
          if(onboard && k){
            onboard.cost+=15+distance(s,stops[p.stops[k-1]])/(p.line.id.startsWith('bus:')?5:10);
            if(!p.noExit.has(k) && onboard.cost<(reached.get(s.index)?.cost??Infinity)){
              const leg={pattern:p,first:onboard.first,last:k,from:stops[p.stops[onboard.first]],to:s};
              reached.set(s.index,{cost:onboard.cost,legs:[...onboard.previous,leg]});
            }
          }
          const board=boards.get(k);
          if(board && board.cost+180<(onboard?.cost??Infinity))onboard={cost:board.cost+180,previous:board.legs,first:k};
        }
      }
      frontier=new Map();
      for(const [id,state] of reached){
        const walk=ends.get(id);
        if(walk!==undefined && state.cost+walk/1.3<(best?.cost??Infinity))best={cost:state.cost+walk/1.3,legs:state.legs,walk};
        if(round===2 || state.cost+180>=(best?.cost??Infinity))continue;
        for(const next of nearby(stops[id],160)){
          const cost=state.cost+distance(stops[id],next)/1.3;
          if(cost<(frontier.get(next.index)?.cost??Infinity))frontier.set(next.index,{cost,legs:state.legs});
        }
      }
    }
    return best;
  }
  function departures(stop,now,timetable){
    const result=[];
    for(const {pattern,k} of stop.calls){
      let best=null;
      for(const [offsets,dwells,runs] of timetable.profiles[pattern.index]||[]){
        const dwell=dwells.find(([i])=>i===k)?.[1]||0;
        const offset=offsets[k]+dwell;
        for(let d=Math.floor(now/DAY)-1;d<=Math.floor(now/DAY)+7;d++){
          const midnight=d*DAY, mask=1<<((d%7+7)%7);
          if(best && midnight+offset>best.time)break;
          for(const [start,days] of runs){
            const time=midnight+start+offset;
            if(!(days&mask)||time<now)continue;
            if(!best||time<best.time)best={pattern,k,time,base:midnight+start,offsets,dwells};
            break;
          }
        }
      }
      if(best)result.push(best);
    }
    return result.sort((a,b)=>a.time-b.time);
  }
  const busData={stops:stops.filter(s=>s.id.startsWith('bus:')&&s.lines.size).map(s=>[s.x,s.z,s.name,[...s.lines].map(l=>l.name).sort().join(' '),s.index])};
  return {week:data.week,stops,lines,patterns,nearby,commute,departures,busData};
}

// Project successive stops onto the ordered route, preserving travel direction on loops.
function projectStops(network,pattern) {
  if(pattern.projection)return pattern.projection;
  const points=pattern.shape.points, distances=[0];
  for(let i=1;i<points.length;i++)distances.push(distances[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const along=[];let minimum=0;
  for(const id of pattern.stops){
    const stop=network.stops[id];let best=Infinity,match=minimum;
    for(let i=1;i<points.length;i++){
      const len=distances[i]-distances[i-1];
      if(len===0||distances[i]<minimum)continue;
      const [x,z]=points[i-1],dx=points[i][0]-x,dz=points[i][1]-z;
      const t=Math.max(0,(minimum-distances[i-1])/len,Math.min(1,((stop.x-x)*dx+(stop.z-z)*dz)/(len*len)));
      const error=Math.hypot(x+t*dx-stop.x,z+t*dz-stop.z);
      if(error<best-.3){best=error;match=distances[i-1]+t*len;}
    }
    minimum=match;along.push(match);
  }
  return pattern.projection={along,distances};
}

export function legGeometry(network,{pattern,first,last}){
  const {along,distances}=projectStops(network,pattern);
  const from=network.stops[pattern.stops[first]],to=network.stops[pattern.stops[last]];
  return [[from.x,from.z],...pattern.shape.points.filter((_,i)=>distances[i]>along[first]&&distances[i]<along[last]),[to.x,to.z]];
}

export function busJourney(network,service,last) {
  const {pattern,k,offsets,base,time,dwells}=service,points=pattern.shape.points;
  const {along,distances}=projectStops(network,pattern);
  const arrival=base+offsets[last],dwell=new Map(dwells);
  return {pattern,origin:network.stops[pattern.stops[k]],destination:network.stops[pattern.stops[last]],time,arrival,
    at(clock){
      let i=k;
      while(i+1<last && base+offsets[i+1]<=clock)i++;
      const depart=base+offsets[i]+(dwell.get(i)||0),next=base+offsets[i+1];
      const fraction=Math.min(1,Math.max(0,(clock-depart)/Math.max(1,next-depart)));
      const d=along[i]+(along[i+1]-along[i])*fraction;
      let lo=0,hi=distances.length-1;
      while(lo+1<hi){const mid=(lo+hi)>>1;if(distances[mid]<=d)lo=mid;else hi=mid;}
      const f=(d-distances[lo])/(distances[hi]-distances[lo]||1);
      return {x:points[lo][0]+f*(points[hi][0]-points[lo][0]),z:points[lo][1]+f*(points[hi][1]-points[lo][1]),next:network.stops[pattern.stops[i+1]].name};
    }};
}
