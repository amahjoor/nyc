import * as THREE from './vendor/three.module.min.js';

// The same projected routes feed street paint and both map scales.
const CELL = 256;
function eachCell(bounds, visit) {
  for(let x=Math.floor(bounds.minX/CELL);x<=Math.floor(bounds.maxX/CELL);x++)
    for(let z=Math.floor(bounds.minZ/CELL);z<=Math.floor(bounds.maxZ/CELL);z++) visit(x+','+z);
}

export async function indexBikeLanes(data) {
  const grid = new Map(), departures=new Map();
  let deadline=performance.now()+4;
  for(let row=0;row<data.lines.length;row++){
    // Give movement and rendering a turn while the citywide layer loads.
    if(row%128===0 && performance.now()>=deadline){
      await new Promise(resolve=>setTimeout(resolve,0));
      deadline=performance.now()+4;
    }
    const [kind,level,...coords]=data.lines[row];
    const points=[], bounds={minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity};
    for(let i=0;i<coords.length;i+=2){
      const x=coords[i]/10,z=coords[i+1]/10;
      points.push([x,z]);
      bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);
      bounds.minZ=Math.min(bounds.minZ,z);bounds.maxZ=Math.max(bounds.maxZ,z);
    }
    if(points.length<2)continue;
    const [from,to,street,flags=0,entry=0,exit=0]=data.links?.[row] || [];
    const cumulative=[0];
    for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    const length=cumulative.at(-1);
    if(length<.05)continue;
    const both=Boolean(flags&1),halfWidth=both?(kind==='path'?1.65:1.5):kind==='protected'?1:kind==='path'?1.25:.85;
    const lane={id:row,kind,level,points,bounds,cumulative,length,halfWidth,both,trafficSide:flags&2?1:-1,
      curbside:Boolean(flags&4),street:data.streets?.[street],entry:entry/10,exit:exit/10,edges:[]};
    for(const reverse of (both?[false,true]:[false])){
      const start=reverse?to:from,end=reverse?from:to,edge={lane,reverse,start,end,junction:data.nodes?.[end]};
      lane.edges.push(edge);
      if(start!==undefined){if(!departures.has(start))departures.set(start,[]);departures.get(start).push(edge);}
    }
    eachCell(bounds,key=>{if(!grid.has(key))grid.set(key,[]); grid.get(key).push(lane);});
  }
  return {departures,within(bounds){
    const lanes=new Set();
    eachCell(bounds,key=>{for(const lane of grid.get(key)||[]){
      const b=lane.bounds;
      if(b.minX<=bounds.maxX && b.maxX>=bounds.minX && b.minZ<=bounds.maxZ && b.maxZ>=bounds.minZ)lanes.add(lane);
    }});
    return lanes;
  }};
}

export function lanePoint(lane,along,offset=0){
  const d=Math.max(0,Math.min(lane.length,along));
  let low=0,high=lane.points.length-1;
  while(high-low>1){const mid=(low+high)>>1;if(lane.cumulative[mid]<=d)low=mid;else high=mid;}
  const a=lane.points[low],b=lane.points[high],length=lane.cumulative[high]-lane.cumulative[low]||1;
  const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length,t=(d-lane.cumulative[low])/length;
  return {x:a[0]+(b[0]-a[0])*t-dz*offset,z:a[1]+(b[1]-a[1])*t+dx*offset,dx,dz};
}

// Keep a car's door and body out of the bike lane. Where a mapped parking
// space overlaps a protected lane, put it on the traffic side of its buffer.
export function bikeLaneParking(index,space,roadAt) {
  const {x,z}=space;
  let nearest=null,gap=Infinity;
  for(const lane of index.within({minX:x-4,maxX:x+4,minZ:z-4,maxZ:z+4})){
    if(['path','shared','signed'].includes(lane.kind)||lane.level!==13)continue;
    for(let i=1;i<lane.points.length;i++){
      const a=lane.points[i-1],b=lane.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      if(!len)continue;
      const along=((x-a[0])*dx+(z-a[1])*dz)/len;
      if(along<-.2||along>len+.2)continue;
      const side=((x-a[0])*(-dz)+(z-a[1])*dx)/len;
      if(Math.abs(side)<gap){gap=Math.abs(side);nearest={lane,side,nx:-dz/len,nz:dx/len,d:lane.cumulative[i-1]+along};}
    }
  }
  if(!nearest)return space;
  const {lane,side,nx,nz,d}=nearest,protectedLane=lane.kind==='protected';
  if(gap>=lane.halfWidth+(protectedLane?1.8:1.02))return space;
  if(!protectedLane||d<lane.entry+3||d>lane.length-lane.exit-3)return null;
  const delta=lane.trafficSide*(lane.halfWidth+2.05)-side;
  const px=x+nx*delta,pz=z+nz*delta;
  if(!roadAt(px,pz)||!roadAt(px+nx*lane.trafficSide*2.65,pz+nz*lane.trafficSide*2.65))return null;
  return {...space,x:px,z:pz};
}

const green=new THREE.Color(0x537f65), white=new THREE.Color(0xd9d8ca), path=new THREE.Color(0x626864), yellow=new THREE.Color(0xc39c4d);
export function createLaneMarkings(scene,index,heightAt) {
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-5});
  const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);
  mesh.name='NYC DOT bike lanes';mesh.receiveShadow=true;mesh.renderOrder=3;scene.add(mesh);
  let cell='',surfaceRevision=-1,lastBuild=-Infinity;
  return {mesh,update(point,visible,revision){
    mesh.visible=visible;
    if(!visible)return;
    const cx=Math.floor(point.x/96)*96+48,cz=Math.floor(point.z/96)*96+48;
    const key=cx+','+cz,now=performance.now();
    if(key===cell && (revision===surfaceRevision || now-lastBuild<450))return;
    cell=key;surfaceRevision=revision;lastBuild=now;
    const radius=280,bounds={minX:cx-radius,maxX:cx+radius,minZ:cz-radius,maxZ:cz+radius},positions=[],colors=[];
    function band(a,b,l,r,color,lift=0){
      for(const [end,side] of [[a,l],[a,r],[b,l],[a,r],[b,r],[b,l]]){
        positions.push(end.x-end.dz*side,end.y+lift,end.z+end.dx*side);colors.push(color.r,color.g,color.b);
      }
    }
    function stroke(a,b,w,color){
      const length=Math.hypot(b.x-a.x,b.z-a.z)||1,dir={dx:(b.x-a.x)/length,dz:(b.z-a.z)/length};
      band({...a,...dir},{...b,...dir},-w/2,w/2,color,.014);
    }
    function stencil(p,sign,offset,shared=false){
      const at=(u,v)=>({x:p.x+(v*p.dx-u*p.dz)*sign-p.dz*offset,z:p.z+(v*p.dz+u*p.dx)*sign+p.dx*offset,y:p.y});
      const mark=(u,v,s,t,w=.09)=>stroke(at(u,v),at(s,t),w,white);
      // Pavement stencil, with two wheels, frame, saddle and bars below the travel arrow.
      for(const u of [-.36,.36])for(let j=0;j<10;j++){
        const a=j*Math.PI/5,b=(j+1)*Math.PI/5;
        mark(u+.235*Math.cos(a),.38*Math.sin(a),u+.235*Math.cos(b),.38*Math.sin(b),.065);
      }
      mark(-.36,0,-.14,.60);mark(-.14,.60,.03,0);mark(.03,0,-.36,0);mark(.03,0,.27,.56);mark(-.14,.51,.27,.56);mark(.36,0,.26,.67);mark(.26,.67,.15,.67);mark(-.24,.64,-.06,.64);
      if(shared){mark(-.38,1.36,0,1.77,.12);mark(.38,1.36,0,1.77,.12);}
      else mark(0,1.35,0,2.38,.13);
      mark(-.29,1.97,0,2.38,.12);mark(.29,1.97,0,2.38,.12);
    }
    for(const lane of index.within(bounds)){
      const {kind,level,length,halfWidth:w,trafficSide:side}=lane,off=kind==='path';
      if(kind==='signed')continue;
      const buffer=kind==='buffer'||kind==='protected',bufferWidth=kind==='protected' ? .95 : .64;
      let previous=null,lastSymbol=-1;
      // Insert exact source vertices so paint follows bends even on short segments.
      for(let i=1;i<lane.points.length;i++){
        const start=lane.cumulative[i-1],span=lane.cumulative[i]-start,steps=Math.ceil(span/2);
        const a=lane.points[i-1],end=lane.points[i];
        if(!steps || Math.max(a[0],end[0])<bounds.minX-5 || Math.min(a[0],end[0])>bounds.maxX+5 ||
           Math.max(a[1],end[1])<bounds.minZ-5 || Math.min(a[1],end[1])>bounds.maxZ+5){previous=null;continue;}
        for(let j=previous?1:0;j<=steps;j++){
          const d=start+span*j/steps,b=lanePoint(lane,d);
          if(Math.abs(b.x-cx)>radius+5||Math.abs(b.z-cz)>radius+5){previous=null;continue;}
          const y=heightAt(b.x,b.z,level);
          if(!Number.isFinite(y)){previous=null;continue;}
          b.y=y+.038;
          const cross=!off && (d<lane.entry||d>length-lane.exit);
          if(previous){
            if(off || kind==='protected'&&!cross || kind!=='shared' && cross && Math.floor(d/2)%2===0)band(previous,b,-w,w,off?path:green);
            if(kind!=='shared' && (!cross || Math.floor(d/2)%2===0))for(const edge of [-w,w])band(previous,b,edge-.055,edge+.055,white,.008);
            if(lane.both && Math.floor(d/3)%2===0)band(previous,b,-.054,.054,yellow,.012);
            if(buffer&&!cross){
              const edge=side*(w+bufferWidth);band(previous,b,edge-.06,edge+.06,white,.008);
              if(Math.floor(d/5)!==Math.floor(previous.d/5)){
                const end={...b,x:b.x-b.dz*edge,z:b.z+b.dx*edge};
                stroke({...b,x:b.x-b.dz*w*side-b.dx*.92,z:b.z+b.dx*w*side-b.dz*.92},end,.12,white);
              }
            }
            const symbol=Math.floor((d-7)/47);
            if(!cross && symbol!==lastSymbol && d>=7 && d<length-lane.exit-3){
              stencil(b,1,lane.both?w*.5:0,kind==='shared');
              if(lane.both)stencil(b,-1,-w*.5);lastSymbol=symbol;
            }
          }
          b.d=d;previous=b;
        }
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();mesh.geometry.dispose();mesh.geometry=geometry;
  }};
}
