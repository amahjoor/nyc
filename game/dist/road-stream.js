export function cellsAround(index, point, radius = 850) {
  const size=index.cellSize, cells=[];
  for(let x=Math.floor((point.x-radius)/size);x<=Math.floor((point.x+radius)/size);x++){
    for(let z=Math.floor((point.z-radius)/size);z<=Math.floor((point.z+radius)/size);z++){
      const key=`${x},${z}`,cell=index.cells[key];if(cell)cells.push({key,...cell});
    }
  }
  return cells;
}

export function nearestStreet(roads, point, maxDistance = 500) {
  let nearest=null;
  for(const road of roads){
    if(road.kind==='tunnel'||road.roadwayType===4)continue;
    for(let i=1;i<road.points.length;i++){
      const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az,length2=dx*dx+dz*dz;
      if(!length2)continue;
      const t=Math.max(.08,Math.min(.92,((point.x-ax)*dx+(point.z-az)*dz)/length2));
      const x=ax+dx*t,z=az+dz*t,distance=Math.hypot(x-point.x,z-point.z);
      if(distance>maxDistance||nearest&&distance>=nearest.distance)continue;
      nearest={x,z,name:road.name,angle:Math.atan2(dx,dz)+(road.oneway==='-1'?Math.PI:0),distance};
    }
  }
  return nearest;
}

export function localDestinations(roads, focus) {
  const found=[],seen=new Set();
  for(const road of roads){
    if(!road.name||seen.has(road.name)||road.kind==='tunnel'||road.points.length<2)continue;
    // Use an actual segment; the chord across a curved street can cross buildings.
    const middle=Math.floor(road.points.length/2),a=road.points[middle-1],b=road.points[middle],x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
    const distance=Math.hypot(x-focus.x,z-focus.z);
    if(distance<80||distance>700)continue;
    found.push({name:road.name,x,z});seen.add(road.name);
    if(found.length>=20)break;
  }
  return found;
}

export function createRoadStream(index,{fetcher=fetch}={}) {
  const cache=new Map(),pending=new Map();let serial=0;
  async function read(cell){
    if(cache.has(cell.key)){const entry=cache.get(cell.key);entry.used=++serial;return entry.roads;}
    if(pending.has(cell.key))return pending.get(cell.key);
    const promise=(async()=>{
      const response=await fetcher(cell.url);if(!response.ok)throw new Error('The streets could not load. Try this location again.');
      const data=await response.json();if(!Array.isArray(data.roads))throw new Error('The street data is incomplete.');
      cache.set(cell.key,{roads:data.roads,used:++serial});return data.roads;
    })();
    pending.set(cell.key,promise);
    try{return await promise;}finally{pending.delete(cell.key);}
  }
  return {
    async loadAround(point,radius=850){
      const cells=cellsAround(index,point,radius),roads=new Map();
      const results=await Promise.all(cells.map(read));
      for(const group of results)for(const road of group)roads.set(road.id,road);
      const keep=new Set(cells.map(cell=>cell.key));
      for(const [key] of [...cache].sort((a,b)=>a[1].used-b[1].used)){
        if(cache.size<=36)break;if(!keep.has(key))cache.delete(key);
      }
      return [...roads.values()];
    },
    getStatus:()=>({cachedCells:cache.size,pendingCells:pending.size}),
  };
}
