// Resolve the citywide itinerary a leg at a time, as the street simulation
// streams in its lane layouts, junction signals and intermediate intersections.
export class RideRoute {
  constructor(legs) {
    this.legs=legs;
    this.next=0;
    this.unloaded=legs.reduce((sum,leg)=>sum+leg.distance,0);
  }

  fill(sim,car) {
    while(car._route.length<2 && this.next<this.legs.length) {
      const leg=this.legs[this.next++];
      this.unloaded-=leg.distance;
      if(this.graph!==sim._graph){
        this.graph=sim._graph;
        this.roads=new Map();
        for(const edge of this.graph.edges){
          if(!this.roads.has(edge.road.id))this.roads.set(edge.road.id,[]);
          this.roads.get(edge.road.id).push(edge);
        }
      }
      const local=this.roads.get(leg.roadId)||[];
      for(let i=1;i<leg.points.length;i++){
        const [ax,az]=leg.points[i-1], [bx,bz]=leg.points[i];
        const length=Math.hypot(bx-ax,bz-az);
        if(length<.4)continue;
        const dx=(bx-ax)/length, dz=(bz-az)/length;
        const station=p=>(p.x-ax)*dx+(p.z-az)*dz;
        const cross=p=>Math.abs((p.x-ax)*dz-(p.z-az)*dx);
        const edges=local.filter(e=>cross(e.from)<.6 && cross(e.to)<.6 && station(e.to)>station(e.from)
          && station(e.to)>.15 && station(e.from)<length-.15).sort((a,b)=>station(a.from)-station(b.from));
        if(!edges.length){
          const road={id:leg.roadId,name:leg.name,kind:leg.kind};
          car._route.push({from:{x:ax,z:az},to:{x:bx,z:bz},angle:Math.atan2(dx,dz),length,lanes:1,lane:1.9,step:0,road,arrives:-1});
          continue;
        }
        for(const edge of edges){
          const clipStart=station(edge.from)<-.15, clipEnd=station(edge.to)>length+.15;
          if(!clipStart && !clipEnd){car._route.push(edge);continue;}
          const from=clipStart?{x:ax,z:az}:edge.from, to=clipEnd?{x:bx,z:bz}:edge.to;
          car._route.push({...edge,from,to,length:Math.hypot(to.x-from.x,to.z-from.z)});
        }
      }
    }
  }
}
