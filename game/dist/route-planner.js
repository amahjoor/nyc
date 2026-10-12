const EPS=1e-7,CELL=500;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function decodeGeometry(encoded){
  let offset=0,x=0,z=0;const points=[];
  const integer=()=>{let value=0,factor=1,character;do{if(offset>=encoded.length||factor>2**30)throw new Error('Invalid navigation geometry.');character=encoded.charCodeAt(offset++)-63;if(character<0||character>63)throw new Error('Invalid navigation geometry.');value+=(character&31)*factor;factor*=32;}while(character>=32);return value%2?-(value+1)/2:value/2;};
  while(offset<encoded.length){x+=integer();z+=integer();points.push([x/100,z/100]);}
  if(points.length<2)throw new Error('Navigation road has no segment.');return points;
}
function projection(point,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],length2=dx*dx+dz*dz,t=length2?clamp(((point.x-a[0])*dx+(point.z-a[1])*dz)/length2,0,1):0;const x=a[0]+t*dx,z=a[1]+t*dz;return {x,z,t,distance:Math.hypot(point.x-x,point.z-z)};}
function stations(points){const result=new Float64Array(points.length);for(let i=1;i<points.length;i++)result[i]=result[i-1]+distance(points[i-1],points[i]);return result;}
function pointAt(road,station){station=clamp(station,0,road.length);let i=1;while(i<road.points.length-1&&road.stations[i]<station)i++;const a=road.points[i-1],b=road.points[i],length=road.stations[i]-road.stations[i-1],t=length?(station-road.stations[i-1])/length:0;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
function roadSlice(road,from,to){const low=Math.min(from,to),high=Math.max(from,to),points=[pointAt(road,low)];for(let i=1;i<road.points.length-1;i++)if(road.stations[i]>low+EPS&&road.stations[i]<high-EPS)points.push([...road.points[i]]);const last=pointAt(road,high);if(distance(points.at(-1),last)>EPS)points.push(last);return to<from?points.reverse():points;}
class Heap{
  values=[];
  push(value){const a=this.values;let i=a.length;a.push(value);while(i){const p=(i-1)>>1;if(a[p].f<=value.f)break;a[i]=a[p];i=p;}a[i]=value;}
  pop(){const a=this.values,result=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].f<a[child].f)child++;if(a[child].f>=last.f)break;a[i]=a[child];i=child;}a[i]=last;}return result;}
}
function routeLeg(road,from,to){return {roadId:road.id,name:road.name,kind:road.kind,fromStation:from,toStation:to,distance:Math.abs(to-from),points:roadSlice(road,from,to)};}
function makeRoute(legs,start,end){
  legs=legs.filter(leg=>leg.distance>EPS);const points=[],instructions=[];let total=0,previous=null;
  for(const leg of legs){
    if(!previous)instructions.push({kind:'depart',text:`Head along ${leg.name}`,roadName:leg.name,point:[...leg.points[0]],atDistance:0});
    else{
      const a=previous.points.at(-2),b=previous.points.at(-1),c=leg.points[0],d=leg.points[1];
      const ax=b[0]-a[0],az=b[1]-a[1],bx=d[0]-c[0],bz=d[1]-c[1],angle=Math.atan2(ax*bz-az*bx,ax*bx+az*bz)*180/Math.PI;
      if(leg.name!==previous.name||Math.abs(angle)>35){
        const kind=Math.abs(angle)>150?'uturn':Math.abs(angle)<25?'continue':angle>0?'right':'left';
        const text=kind==='uturn'?`Make a U-turn onto ${leg.name}`:kind==='continue'?`Continue onto ${leg.name}`:`Turn ${kind} onto ${leg.name}`;
        instructions.push({kind,text,roadName:leg.name,point:[...leg.points[0]],atDistance:total});
      }
    }
    for(const point of leg.points)if(!points.length||distance(points.at(-1),point)>EPS)points.push([...point]);
    total+=leg.distance;previous=leg;
  }
  if(!points.length)points.push([start.x,start.z]);
  instructions.push({kind:'arrive',text:'Arrive at the marked street',roadName:legs.at(-1)?.name||end.name,point:[end.x,end.z],atDistance:total});
  return {ok:true,points,instructions,distance:total,start,end,legs,stations:stations(points)};
}

/** Decode source roads once. Endpoint level codes keep stacked roads separate. */
export function createRoutePlanner(data){
  if(data?.version!==1||data.encoding!=='cscl-centimeter-polyline-v1'||!Array.isArray(data.roads)||!Array.isArray(data.names)||!Array.isArray(data.kinds)||!Array.isArray(data.levels))throw new Error('Unsupported navigation source data.');
  const roads=[],nodes=[],nodeIds=new Map(),roadIds=new Map(),cells=new Map();
  const node=(point,level)=>{const key=`${Math.round(point[0]*100)},${Math.round(point[1]*100)},${level}`;if(!nodeIds.has(key)){nodeIds.set(key,nodes.length);nodes.push({point,level,edges:[]});}return nodeIds.get(key);};
  for(const row of data.roads){
    if(!Array.isArray(row)||row.length!==4||!Number.isInteger(row[1])||!Number.isInteger(row[2])||typeof row[3]!=='string')throw new Error('Invalid navigation source row.');
    // Flags store borough, two independent source endpoint levels, road kind
    // and legal travel direction. Centimeter endpoint keys are exact source
    // junctions; polyline intersections are deliberately never synthesized.
    let flags=row[2];const borough=flags%8;flags=Math.floor(flags/8);const toLevel=data.levels[flags%16];flags=Math.floor(flags/16);const fromLevel=data.levels[flags%16];flags=Math.floor(flags/16);const direction=flags%3,kind=data.kinds[Math.floor(flags/3)],name=data.names[row[1]];
    const id=`cscl:${row[0]}`;if(roadIds.has(id)||typeof name!=='string'||typeof kind!=='string'||!Number.isFinite(fromLevel)||!Number.isFinite(toLevel)||borough<1||borough>5)throw new Error('Invalid navigation source identity or levels.');
    const points=decodeGeometry(row[3]),lengths=stations(points),road={id,name,points,kind,borough,oneway:direction===1?'yes':direction===2?'-1':false,fromLevel,toLevel,stations:lengths,length:lengths.at(-1)};
    roadIds.set(id,roads.length);roads.push(road);
    if(kind==='tunnel'||road.length<=EPS)continue;
    road.from=node(points[0],fromLevel);road.to=node(points.at(-1),toLevel);
    // Signed (index + 1) references share one measured road in both directions.
    if(direction!==2)nodes[road.from].edges.push(roads.length);if(direction!==1)nodes[road.to].edges.push(-roads.length);
    const touched=new Set();
    for(let i=1;i<points.length;i++)for(let x=Math.floor(Math.min(points[i-1][0],points[i][0])/CELL);x<=Math.floor(Math.max(points[i-1][0],points[i][0])/CELL);x++)for(let z=Math.floor(Math.min(points[i-1][1],points[i][1])/CELL);z<=Math.floor(Math.max(points[i-1][1],points[i][1])/CELL);z++)touched.add(`${x},${z}`);
    for(const key of touched){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(roads.length-1);}
  }
  function snap(point,{maxSnapDistance=400,roadId=null,level=null}={}){
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z)||!Number.isFinite(maxSnapDistance)||maxSnapDistance<0||maxSnapDistance>5000)return null;
    const candidates=new Set();
    if(roadId&&roadIds.has(roadId))candidates.add(roadIds.get(roadId));
    else for(let x=Math.floor((point.x-maxSnapDistance)/CELL);x<=Math.floor((point.x+maxSnapDistance)/CELL);x++)for(let z=Math.floor((point.z-maxSnapDistance)/CELL);z<=Math.floor((point.z+maxSnapDistance)/CELL);z++)for(const id of cells.get(`${x},${z}`)||[])candidates.add(id);
    let best=null;
    for(const index of candidates){const road=roads[index];if(road.from===undefined||(level!==null&&road.fromLevel!==level&&road.toLevel!==level))continue;
      for(let i=1;i<road.points.length;i++){const p=projection(point,road.points[i-1],road.points[i]);if(p.distance>maxSnapDistance)continue;const station=road.stations[i-1]+p.t*(road.stations[i]-road.stations[i-1]);
        // Equal-distance endpoints prefer ordinary streets. An explicit source
        // road ID can disambiguate an actor already on an elevated route.
        const penalty=['bridge','ramp','motorway'].includes(road.kind)?0.001:0;
        if(!best||p.distance+penalty<best.score)best={...p,score:p.distance+penalty,station,index,roadId:road.id,name:road.name};
      }
    }
    return best;
  }
  function plan(startPoint,endPoint,options={}){
    const start=snap(startPoint,{maxSnapDistance:options.maxSnapDistance,roadId:options.startRoadId||startPoint?.roadId,level:options.startLevel??null});
    const end=snap(endPoint,{maxSnapDistance:options.maxSnapDistance,roadId:options.endRoadId||endPoint?.roadId,level:options.endLevel??null});
    if(!start||!end)return {ok:false,reason:'no-road',message:!start?'No mapped drivable street near your position.':'No mapped drivable street near this pin. Choose a point closer to a street.'};
    // Virtual start/end connectors retain the actual projected partial road,
    // rather than jumping to its nearest junction or driving against one-way
    // traffic. Exactly-at-junction connectors may have zero length.
    const first=roads[start.index],last=roads[end.index],starts=[],ends=[];
    if(first.oneway!=='yes'||start.station<=EPS)starts.push({node:first.from,leg:routeLeg(first,start.station,0)});
    if(first.oneway!=='-1'||first.length-start.station<=EPS)starts.push({node:first.to,leg:routeLeg(first,start.station,first.length)});
    if(last.oneway!=='-1'||end.station<=EPS)ends.push({node:last.from,leg:routeLeg(last,0,end.station)});
    if(last.oneway!=='yes'||last.length-end.station<=EPS)ends.push({node:last.to,leg:routeLeg(last,last.length,end.station)});
    let best=Infinity,result=null;
    if(first===last&&((end.station>=start.station&&first.oneway!=='-1')||(end.station<=start.station&&first.oneway!=='yes')||Math.abs(end.station-start.station)<EPS)){
      result=[routeLeg(first,start.station,end.station)];best=Math.abs(end.station-start.station);
    }
    // Euclidean distance is an admissible heuristic for measured road lengths.
    // Multiple legal starting endpoints share one search and one best route.
    const costs=new Float64Array(nodes.length);costs.fill(Infinity);const previous=new Int32Array(nodes.length);previous.fill(-1);const previousEdge=new Int32Array(nodes.length),roots=new Map(),heap=new Heap();
    const heuristic=id=>Math.hypot(nodes[id].point[0]-end.x,nodes[id].point[1]-end.z);
    for(const entry of starts)if(entry.leg.distance<costs[entry.node]){costs[entry.node]=entry.leg.distance;roots.set(entry.node,entry.leg);heap.push({node:entry.node,g:entry.leg.distance,f:entry.leg.distance+heuristic(entry.node)});}
    let visited=0;
    while(heap.values.length){const current=heap.pop();if(current.g!==costs[current.node])continue;if(current.f>=best-EPS)break;
      if(++visited>(options.maxVisited||250000))return {ok:false,reason:'search-limit',message:'This route is too complex to calculate. Choose a closer point.'};
      for(const target of ends)if(target.node===current.node&&current.g+target.leg.distance<best){
        const path=[target.leg];let cursor=current.node;
        while(previous[cursor]!==-1){const edge=previousEdge[cursor],road=roads[Math.abs(edge)-1];path.push(routeLeg(road,edge>0?0:road.length,edge>0?road.length:0));cursor=previous[cursor];}
        path.push(roots.get(cursor));result=path.reverse();best=current.g+target.leg.distance;
      }
      for(const edge of nodes[current.node].edges){const road=roads[Math.abs(edge)-1],next=edge>0?road.to:road.from,cost=current.g+road.length;if(cost>=costs[next]-EPS)continue;costs[next]=cost;previous[next]=current.node;previousEdge[next]=edge;heap.push({node:next,g:cost,f:cost+heuristic(next)});}
    }
    if(!result)return {ok:false,reason:'unreachable',message:'No connected driving route exists in the mapped network. Tunnels and roads outside NYC are unavailable.'};
    const clean=s=>({x:s.x,z:s.z,roadId:s.roadId,name:s.name,snapDistance:s.distance});return makeRoute(result,clean(start),clean(end));
  }
  return {roads,bounds:data.bounds,origin:data.origin,plan,snap,progress:routeProgress,stats:{roads:roads.length,nodes:nodes.length,routableRoads:roads.filter(road=>road.from!==undefined).length}};
}

/** Pure tracking: optional prior distance resolves loops without skipping turns. */
export function routeProgress(route,player,{previousDistance=0,offRouteDistance=35}={}){
  if(!route?.ok||!player||!Number.isFinite(player.x)||!Number.isFinite(player.z))return null;
  let nearest={distance:Infinity,station:0};
  if(route.points.length===1)nearest={distance:Math.hypot(player.x-route.points[0][0],player.z-route.points[0][1]),station:0};
  for(let i=1;i<route.points.length;i++){const p=projection(player,route.points[i-1],route.points[i]),station=route.stations[i-1]+p.t*(route.stations[i]-route.stations[i-1]);
    if(p.distance<nearest.distance-0.5||(Math.abs(p.distance-nearest.distance)<=0.5&&Math.abs(station-previousDistance)<Math.abs(nearest.station-previousDistance)))nearest={distance:p.distance,station};
  }
  const remainingDistance=Math.max(0,route.distance-nearest.station),offRoute=nearest.distance>offRouteDistance,arrived=!offRoute&&remainingDistance<12&&Math.hypot(player.x-route.end.x,player.z-route.end.z)<20;
  const nextInstruction=route.instructions.find(instruction=>instruction.atDistance>nearest.station+3)||route.instructions.at(-1);
  return {remainingDistance,distanceToRoute:nearest.distance,passedDistance:nearest.station,offRoute,arrived,nextInstruction,distanceToInstruction:Math.max(0,nextInstruction.atDistance-nearest.station)};
}
