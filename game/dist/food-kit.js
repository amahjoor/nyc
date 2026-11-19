// The bench that dishes are made on. Everything is modelled in centimetres from
// lumpy solids, lofted slabs, tubes and sheets, set down on whatever is already
// on the plate, then baked into one mesh with its own contact shading.
import * as T from './vendor/three.module.min.js';

export const TAU=Math.PI*2;
export const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
export const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export function rng(seed){
  let a=seed>>>0||1;
  return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
}
export function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}

const h3=(x,y,z)=>{
  let h=Math.imul(x,0x27d4eb2d)^Math.imul(y,0x165667b1)^Math.imul(z,0x9e3779b1);
  h=Math.imul(h^h>>>15,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);return ((h^h>>>16)>>>0)/4294967296;
};
export function noise(x,y,z){
  const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);let u=x-xi,v=y-yi,w=z-zi;
  u=u*u*(3-2*u);v=v*v*(3-2*v);w=w*w*(3-2*w);
  const a=h3(xi,yi,zi),b=h3(xi+1,yi,zi),c=h3(xi,yi+1,zi),d=h3(xi+1,yi+1,zi);
  const e=h3(xi,yi,zi+1),f=h3(xi+1,yi,zi+1),g=h3(xi,yi+1,zi+1),h=h3(xi+1,yi+1,zi+1);
  const p=a+(b-a)*u,q=c+(d-c)*u,r=e+(f-e)*u,s=g+(h-g)*u;
  return p+(q-p)*v+((r+(s-r)*v)-(p+(q-p)*v))*w;
}
/** One octave and three, each from -1 to 1. */
export const sn=(x,y,z)=>2*noise(x,y,z)-1;
export const fbm=(x,y,z)=>(sn(x,y,z)+.5*sn(2*x+11.3,2*y+5.7,2*z+3.1)+.25*sn(4*x+1.9,4*y+9.2,4*z+7.7))/1.75;

// ---- solids -----------------------------------------------------------------
function finish(pos,idx,facet=false){
  let g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);
  if(facet)g=g.toNonIndexed();
  g.computeVertexNormals();return g;
}
const icos=[];
function ico(detail){
  if(icos[detail])return icos[detail];
  const t=(1+Math.sqrt(5))/2,unit=v=>{const l=Math.hypot(...v);return v.map(a=>a/l);};
  let verts=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(unit);
  let faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let d=0;d<detail;d++){
    const mid=new Map(),next=[];
    const half=(a,b)=>{const key=a<b?a*65536+b:b*65536+a;if(!mid.has(key)){mid.set(key,verts.length);verts.push(unit([0,1,2].map(i=>verts[a][i]+verts[b][i])));}return mid.get(key);};
    for(const [a,b,c] of faces){const ab=half(a,b),bc=half(b,c),ca=half(c,a);next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}
    faces=next;
  }
  return icos[detail]={pos:verts.flat(),idx:faces.flat()};
}
/** A lumpy ellipsoid. `flat` shaves that share of its underside off level. */
export function blob({r=1,bump=.1,freq=.6,seed=0,detail=2,flat=0}={}){
  const [rx,ry,rz]=typeof r==='number'?[r,r,r]:r,base=ico(detail),pos=new Float32Array(base.pos.length);
  const floor=-ry*(1-flat*2);
  for(let i=0;i<pos.length;i+=3){
    let x=base.pos[i]*rx,y=base.pos[i+1]*ry,z=base.pos[i+2]*rz;
    const s=1+(bump?bump*fbm(x*freq+seed*7.13,y*freq+seed*3.71,z*freq-seed*5.3):0);
    x*=s;y*=s;z*=s;if(flat && y<floor)y=floor;
    pos[i]=x;pos[i+1]=y;pos[i+2]=z;
  }
  return finish(pos,base.idx);
}
/** Skin a stack of rings, each the same number of points going round the same way. */
export function loft(rings,{closed=true,facet=false}={}){
  const n=rings[0].length,pos=[],idx=[],span=closed?n:n-1;
  for(const ring of rings)for(const p of ring)pos.push(p[0],p[1],p[2]);
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<span;i++){
    const a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;idx.push(a,c,b,b,c,d);
  }
  const g=finish(pos,idx,facet);
  if(!facet){
    // A ring drawn in to a point shares one normal.
    const nor=g.attributes.normal;
    rings.forEach((ring,j)=>{
      const [x,y,z]=ring[0];if(!ring.every(p=>Math.abs(p[0]-x)+Math.abs(p[1]-y)+Math.abs(p[2]-z)<1e-6))return;
      let ax=0,ay=0,az=0;for(let i=0;i<n;i++){ax+=nor.getX(j*n+i);ay+=nor.getY(j*n+i);az+=nor.getZ(j*n+i);}
      const l=Math.hypot(ax,ay,az)||1;for(let i=0;i<n;i++)nor.setXYZ(j*n+i,ax/l,ay/l,az/l);
    });
  }
  return g;
}
/**
 * Turn a profile of [radius, height] about the upright axis. List it up the
 * outside and back in across the top. `wave(angle, ring)` scales the radius.
 */
export function lathe(profile,seg=32,{wave=null,bump=0,freq=.5,seed=0}={}){
  return loft(profile.map(([r,y],j)=>Array.from({length:seg},(_,i)=>{
    const a=i/seg*TAU;let rr=r*(wave?wave(a,j):1);
    if(bump && r>0)rr*=1+bump*fbm(Math.cos(a)*r*freq+seed*3.1,y*freq,Math.sin(a)*r*freq+seed*1.7);
    return [Math.cos(a)*rr,y,Math.sin(a)*rr];
  })));
}
const roundPath=(points,n)=>new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,0,z)),true,'centripetal').getSpacedPoints(n).slice(0,n).map(p=>[p.x,p.z]);
function edgePath(points,n){
  const lengths=points.map((p,i)=>Math.hypot(points[(i+1)%points.length][0]-p[0],points[(i+1)%points.length][1]-p[1])),total=lengths.reduce((a,b)=>a+b,0),out=[];
  points.forEach((p,i)=>{
    const q=points[(i+1)%points.length],steps=Math.max(1,Math.round(n*lengths[i]/total));
    for(let s=0;s<steps;s++)out.push([p[0]+(q[0]-p[0])*s/steps,p[1]+(q[1]-p[1])*s/steps]);
  });
  return out;
}
export const circle=(r,n=10,rz=r)=>Array.from({length:n},(_,i)=>[Math.cos(i/n*TAU)*r,Math.sin(i/n*TAU)*rz]);
/**
 * A slab cut to an outline of [x, z] points: rounded edge, domed and lumpy top.
 * This is a patty, a fillet, a slice of toast, a cutlet, a cookie.
 */
export function puck(outline,h,{edge=.25,dome=0,bump=0,freq=.5,seed=0,n=28,sharp=false,sag=0}={}){
  let path=sharp?edgePath(outline,n):roundPath(outline,n);
  let area=0;path.forEach((p,i)=>{const q=path[(i+1)%path.length];area+=p[0]*q[1]-q[0]*p[1];});
  if(area<0)path.reverse();
  const cx=path.reduce((s,p)=>s+p[0],0)/path.length,cz=path.reduce((s,p)=>s+p[1],0)/path.length;
  const mean=path.reduce((s,p)=>s+Math.hypot(p[0]-cx,p[1]-cz),0)/path.length,e=Math.min(edge,h*.5),inset=Math.min(.45,e/mean);
  const ring=(s,y,lift)=>path.map(([x,z])=>{
    const px=cx+(x-cx)*(1-s),pz=cz+(z-cz)*(1-s);
    const wobble=bump?bump*fbm(px*freq+seed*5.1,seed*2.3,pz*freq-seed*3.7):0;
    const droop=sag?-sag*Math.max(0,1-s*3)*(.5+.5*sn(px*.4+seed,0,pz*.4)):0;
    return [px,y+lift*(dome*(1-(1-s)*(1-s))+wobble)+droop*lift,pz];
  });
  return loft([ring(1,0,0),ring(inset*1.6,0,0),ring(0,e,0),ring(0,h-e,.35),ring(inset,h,.8),ring(.16,h,1),ring(.3,h,1),ring(.45,h,1),ring(.6,h,1),ring(.75,h,1),ring(.9,h,1),ring(1,h,1)]);
}
/**
 * A tube along a path of [x, y, z]. `ry` flattens it, `taper(t)` scales it along
 * its length, `section(around, along)` shapes its outline, and `sides` of 4 with
 * `facet` gives a square stick.
 */
export function tube(points,r,{sides=6,ry=null,taper=null,caps=true,curve=true,steps=null,facet=false,spin=0,section=null}={}){
  const path=curve && points.length>2?new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'centripetal').getPoints(steps??points.length*4):points.map(p=>new T.Vector3(...p));
  const up=new T.Vector3(0,1,0),t=new T.Vector3(),side=new T.Vector3(),nrm=new T.Vector3(),rings=[],m=path.length;
  path.forEach((p,k)=>{
    t.copy(path[Math.min(m-1,k+1)]).sub(path[Math.max(0,k-1)]).normalize();
    side.crossVectors(Math.abs(t.y)>.95?up.set(1,0,0):up.set(0,1,0),t).normalize();nrm.crossVectors(t,side);
    const s=taper?taper(k/(m-1)):1,ring=[];
    for(let i=0;i<sides;i++){
      const a=spin-i/sides*TAU,f=section?section(i/sides,k/(m-1)):1,cu=Math.cos(a)*r*s*f,cv=Math.sin(a)*(ry??r)*s*f;
      ring.push([p.x+side.x*cu+nrm.x*cv,p.y+side.y*cu+nrm.y*cv,p.z+side.z*cu+nrm.z*cv]);
    }
    if(caps && k===0)rings.push(ring.map(()=>[p.x,p.y,p.z]));
    rings.push(ring);
    if(caps && k===m-1)rings.push(ring.map(()=>[p.x,p.y,p.z]));
  });
  return loft(rings,{facet});
}
/** A surface from `fn(u, v)` over the unit square. Turned so that it faces up. */
export function sheet(fn,nu=12,nv=12){
  const pos=[],idx=[];
  for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++)pos.push(...fn(i/nu,j/nv));
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;idx.push(a,c,b,b,c,d);}
  let g=finish(pos,idx);const nor=g.attributes.normal;let up=0;
  for(let i=0;i<nor.count;i++)up+=nor.getY(i);
  if(up<0){for(let i=0;i<idx.length;i+=3){const s=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=s;}g=finish(pos,idx);}
  return g;
}
/** A brick with eased edges, standing on y=0. */
export const brick=(w,h,d,edge=.12,o={})=>puck([[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],h,{sharp:true,edge,n:16,...o});

const bits=new Map();
/** Small things scattered by the dozen, a few triangles each, all about one unit long. */
export function bit(kind){
  if(bits.has(kind))return bits.get(kind);
  let g;
  if(kind==='grain')g=loft([circle(0,4),circle(.2,4),circle(0,4)].map((ring,j)=>ring.map(([x,z])=>[(j-1)*.5,z,x])));
  else if(kind==='fleck')g=finish([-.5,0,0, 0,0,.3, .5,0,0, 0,0,-.3],[0,1,2,0,2,3]);
  else if(kind==='leaf')g=finish([-.5,.02,0, 0,0,.28, .5,.1,0, 0,0,-.28, 0,.12,0],[0,1,4,1,2,4,2,3,4,3,0,4]);
  else if(kind==='cube')g=new T.BoxGeometry(1,1,1);
  else if(kind==='bead')g=blob({detail:0,bump:0});
  else if(kind==='seed')g=blob({r:[.5,.2,.27],detail:0,bump:0});
  else if(kind==='pea')g=blob({detail:1,bump:0});
  else if(kind==='ring')g=loft([circle(.5,8),circle(.5,8),circle(.3,8),circle(.3,8)].map((ring,j)=>ring.map(([x,z])=>[x,j===1||j===2?.22:0,z])));
  else if(kind==='shard')g=finish([-.5,0,-.3, .5,0,-.25, .1,.06,.45, 0,.12,0],[0,3,1,1,3,2,2,3,0,0,1,2]);
  else throw Error('No such bit: '+kind);
  if(g.index && kind!=='pea' && kind!=='bead' && kind!=='seed'){g=g.toNonIndexed();g.computeVertexNormals();}
  bits.set(kind,g);return g;
}

// ---- paint ------------------------------------------------------------------
// A paint is (colour, position, normal, local position) and alters the colour.
const tint=hex=>hex instanceof T.Color?hex:new T.Color(hex);
/** Blotches of lighter and darker. */
export const mottle=(amp=.12,freq=.9,seed=0)=>(c,P)=>c.multiplyScalar(1+amp*fbm(P.x*freq+seed,P.y*freq+seed*.37,P.z*freq));
/** Toward `hex` by an amount worked out from the place. */
export const toward=(hex,amount)=>{const t=tint(hex);return (c,P,N,L)=>c.lerp(t,clamp(amount(P,N,L)));};
/** Browned where it faced the oven: the top, patchily. */
export const browned=(hex,strength=.7,freq=.8)=>toward(hex,(P,N)=>strength*smooth(-.1,.9,N.y)*(.55+.45*fbm(P.x*freq,P.y*freq,P.z*freq+3)));
/** Paler underneath and at the waist, as bread is. */
export const pale=(hex,strength=.6)=>toward(hex,(P,N)=>strength*smooth(.35,-.5,N.y));
/** Spots of `hex` where the noise runs high: char, pepper, herbs, grease. */
export const spots=(hex,cover=.3,freq=2.2,seed=0)=>toward(hex,P=>smooth(1-cover*2,1-cover*2+.25,.5+.5*sn(P.x*freq+seed,P.y*freq-seed,P.z*freq+seed*2)));
/** Toward `hex` outward from the middle of the piece itself. */
export const outward=(hex,r0,r1,strength=1)=>toward(hex,(P,N,L)=>strength*smooth(r0,r1,Math.hypot(L.x,L.z)));
/** Toward `hex` up the piece. */
export const upward=(hex,y0,y1,strength=1)=>toward(hex,(P,N,L)=>strength*smooth(y0,y1,L.y));

// ---- the bench ----------------------------------------------------------------
const GRID=128,HALF=18,CELL=2*HALF/GRID;
function heightField(){
  const H=new Float32Array(GRID*GRID);
  const cell=v=>Math.floor((v+HALF)/CELL);
  function mark(x,y,z){const i=cell(x),j=cell(z);if(i>=0&&j>=0&&i<GRID&&j<GRID&&y>H[j*GRID+i])H[j*GRID+i]=y;}
  return {
    at(x,z){const i=cell(x),j=cell(z);return i<0||j<0||i>=GRID||j>=GRID?0:H[j*GRID+i];},
    /** Lay a triangle in by sampling it more finely than the cells. */
    tri(ax,ay,az,bx,by,bz,cx,cy,cz){
      const span=Math.max(Math.abs(ax-bx),Math.abs(az-bz),Math.abs(bx-cx),Math.abs(bz-cz),Math.abs(cx-ax),Math.abs(cz-az));
      const n=Math.min(40,Math.ceil(span/(CELL*.7))+1);
      for(let i=0;i<=n;i++)for(let j=0;j<=n-i;j++){
        const u=i/n,v=j/n,w=1-u-v;mark(ax*w+bx*u+cx*v,ay*w+by*u+cy*v,az*w+bz*u+cz*v);
      }
    },
    mesh(pos,idx,count){
      for(let i=0;i<count;i+=3){
        const a=(idx?idx[i]:i)*3,b=(idx?idx[i+1]:i+1)*3,c=(idx?idx[i+2]:i+2)*3;
        this.tri(pos[a],pos[a+1],pos[a+2],pos[b],pos[b+1],pos[b+2],pos[c],pos[c+1],pos[c+2]);
      }
    },
  };
}

/** Smooth normals for points that have been moved since they were modelled. */
function facing(pos,idx){
  const nor=new Float32Array(pos.length);
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
    const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    for(const q of [a,b,c]){nor[q]+=nx;nor[q+1]+=ny;nor[q+2]+=nz;}
  }
  for(let i=0;i<nor.length;i+=3){const l=Math.hypot(nor[i],nor[i+1],nor[i+2])||1;nor[i]/=l;nor[i+1]/=l;nor[i+2]/=l;}
  return nor;
}

/** A clean bench for one serving at one stage of being eaten: 2 full, 1 partly, 0 finished. */
export function kitchen(key,level=2){
  const R=rng(hashString(key)),parts=[],field=heightField();
  const P=new T.Vector3(),N=new T.Vector3(),L=new T.Vector3(),m4=new T.Matrix4(),m3=new T.Matrix3(),quat=new T.Quaternion(),euler=new T.Euler(),size=new T.Vector3(),c=new T.Color(),base=new T.Color();
  let frame=null;
  const local=(x,z)=>frame?P.set(x,0,z).applyMatrix4(frame):P.set(x,0,z);
  const k={
    key,level,parts,
    /** Whether a part-eaten serving is cut through, and where. Dishes that are eaten some other way turn it off. */
    cut:true,biteAngle:.32,biteAt:.4,
    rand:(a=1,b)=>b===undefined?R()*a:a+R()*(b-a),
    pick:list=>list[Math.floor(R()*list.length)],
    /** A spot in a disc, crowded toward the middle by `bias` above 1. */
    spot(x,z,r,bias=1){const a=R()*TAU,d=r*Math.pow(R(),.5*bias);return [x+Math.cos(a)*d,z+Math.sin(a)*d];},
    /** How high the serving stands at a spot so far, above the frame being worked in. */
    top(x,z){const w=local(x,z);return field.at(w.x,w.z)-w.y;},
    /**
     * Work in a frame set down at a spot on the serving and turned by `yaw`:
     * what `fn` adds is placed from there. `tilt` [x, z] leans it, `y` lifts it.
     */
    at(x,z,yaw,fn,{y=0,tilt=null}={}){
      const was=frame,w=local(x,z),rest=field.at(w.x,w.z)-w.y;
      euler.set(tilt?tilt[0]:0,yaw,tilt?tilt[1]:0,'YXZ');
      const next=new T.Matrix4().compose(new T.Vector3(x,rest+y,z),new T.Quaternion().setFromEuler(euler),new T.Vector3(1,1,1));
      frame=was?was.clone().multiply(next):next;
      try{fn();}finally{frame=was;}
    },
    /**
     * Put a solid on the bench.
     * at, rot [x, y, z], scale; color and paint; gloss 0 matt to 1 wet;
     * ware for crockery, cutlery and wrappers, which outlast the food;
     * drop to rest it on what is under it (at[1] then lifts or sinks it; settle 1
     * perches it on the highest point, 0 beds it into the heap);
     * drape to lay it over what is under it, sagging no more than that many centimetres;
     * inside for the colour it shows when bitten; whole to be eaten in one piece.
     */
    add(g,o={}){
      const ware=Boolean(o.ware);
      if(!ware && level===0)return null;
      const at=o.at||[0,0,0],rot=o.rot||[0,0,0],s=o.scale??1,opacity=o.opacity??1;
      euler.set(rot[0],rot[1],rot[2],'YXZ');quat.setFromEuler(euler);
      m4.compose(P.set(at[0],o.drop?0:at[1],at[2]),quat,typeof s==='number'?size.set(s,s,s):size.set(s[0],s[1],s[2]));
      if(frame)m4.premultiply(frame);
      m3.getNormalMatrix(m4);
      const gp=g.attributes.position,gn=g.attributes.normal,n=gp.count;
      const pos=new Float32Array(n*3),nor=new Float32Array(n*3),col=new Float32Array(n*3),paints=o.paint?[o.paint].flat():[];
      let minY=Infinity,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,maxY=-Infinity;
      for(let i=0;i<n;i++){
        P.fromBufferAttribute(gp,i).applyMatrix4(m4);pos[i*3]=P.x;pos[i*3+1]=P.y;pos[i*3+2]=P.z;
        if(P.y<minY)minY=P.y;if(P.y>maxY)maxY=P.y;if(P.x<minX)minX=P.x;if(P.x>maxX)maxX=P.x;if(P.z<minZ)minZ=P.z;if(P.z>maxZ)maxZ=P.z;
      }
      let cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
      if(o.drop){
        // Settle into what is under the footprint: nearer its middle height than its
        // highest point, or a heap would climb into a tower.
        const rx=(maxX-minX)*.3,rz=(maxZ-minZ)*.3,settle=o.settle??.35,under=new Array(7);
        const restAt=(px,pz)=>{
          under[0]=field.at(px,pz);for(let i=0;i<6;i++)under[i+1]=field.at(px+Math.cos(i*TAU/6)*rx,pz+Math.sin(i*TAU/6)*rz);
          under.sort((a,b)=>a-b);return under[3]+(under[6]-under[3])*settle;
        };
        let rest=restAt(cx,cz),sx=0,sz=0;
        const bounds=o.within&&local(o.within[0],o.within[1]).clone();
        // A piece on a heap rolls to the lowest place nearby, inside the heap's bounds.
        for(let pass=0;pass<(o.roll||0);pass++){
          let best=rest,bx=sx,bz=sz;const step=Math.max(rx,rz)*2.2,turn=R()*TAU;
          for(let i=0;i<6;i++){
            const tx=sx+Math.cos(turn+i*TAU/6)*step,tz=sz+Math.sin(turn+i*TAU/6)*step;
            if(bounds && Math.hypot(cx+tx-bounds.x,cz+tz-bounds.z)>o.within[2])continue;
            const h=restAt(cx+tx,cz+tz);if(h<best-.15){best=h;bx=tx;bz=tz;}
          }
          if(best===rest)break;
          rest=best;sx=bx;sz=bz;
        }
        if(sx||sz){for(let i=0;i<pos.length;i+=3){pos[i]+=sx;pos[i+2]+=sz;}minX+=sx;maxX+=sx;minZ+=sz;maxZ+=sz;}
        const lift=rest-minY+at[1];for(let i=1;i<pos.length;i+=3)pos[i]+=lift;
        minY+=lift;maxY+=lift;cx+=sx;cz+=sz;
      }
      if(o.drape){
        // `wide` keeps it up a little past an edge before it falls.
        // Heights were modelled above the surface, so a frame already standing on it is not counted twice.
        const limit=o.drape===true?Infinity:o.drape,hang=field.at(cx,cz)-limit,w=o.wide||0,stood=frame?frame.elements[13]:0;
        if(stood)for(let i=1;i<pos.length;i+=3)pos[i]-=stood;
        for(let i=0;i<pos.length;i+=3){
          const x=pos[i],z=pos[i+2];let under=field.at(x,z);
          if(w)under=Math.max(under,field.at(x+w,z),field.at(x-w,z),field.at(x,z+w),field.at(x,z-w));
          pos[i+1]+=Math.max(under,hang);
        }
        minY=Infinity;maxY=-Infinity;for(let i=1;i<pos.length;i+=3){if(pos[i]<minY)minY=pos[i];if(pos[i]>maxY)maxY=pos[i];}
      }
      base.set(o.color??0xffffff);
      const draped=o.drape && g.index?facing(pos,g.index.array):null;
      for(let i=0;i<n;i++){
        if(draped)N.set(draped[i*3],draped[i*3+1],draped[i*3+2]);
        else N.fromBufferAttribute(gn,i).applyMatrix3(m3).normalize();
        nor[i*3]=N.x;nor[i*3+1]=N.y;nor[i*3+2]=N.z;
        c.copy(base);
        if(paints.length){
          // Faceted pieces can take one colour a face, from the middle of it.
          const f=o.flat?i-i%3:i,m=o.flat?3:1;P.set(0,0,0);L.set(0,0,0);
          for(let q=f;q<f+m;q++){P.x+=pos[q*3]/m;P.y+=pos[q*3+1]/m;P.z+=pos[q*3+2]/m;L.x+=gp.getX(q)/m;L.y+=gp.getY(q)/m;L.z+=gp.getZ(q)/m;}
          for(const paint of paints)paint(c,P,N,L);
        }
        col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;
      }
      const idx=g.index?g.index.array:null,count=idx?idx.length:n;
      const reach=Math.max(maxX-minX,maxZ-minZ,maxY-minY);
      const part={pos,nor,col,idx,count,ware,opacity,gloss:o.gloss??.2,inside:o.inside??null,whole:o.whole??reach<2.6,cx,cz,top:maxY,bottom:minY,shade:o.shade!==false};
      if(opacity===1 && o.cast!==false)field.mesh(pos,idx,count);
      parts.push(part);return part;
    },
    /** Rest a solid on the serving at a spot. */
    drop(g,x,z,o={}){return k.add(g,{...o,at:[x,o.lift||0,z],drop:true});},
    /** Crockery and other things that stay when the food is gone. */
    ware(g,o={}){return k.add(g,{gloss:.72,...o,ware:true});},
    /** Scatter `n` small bits over a disc, each lying on whatever is there. */
    sprinkle(kind,n,{x=0,z=0,r=4,color=0xffffff,size=.4,onFood=0,flat=false,gloss=.2,ware=false,lift=.02,bias=1,stretch=1,tilt=.9}={}){
      const g=bit(kind),colors=[color].flat();
      for(let i=0;i<n;i++){
        const [px,pz]=k.spot(x,z,r,bias),y=k.top(px,pz);
        if(y<onFood)continue;
        const s=size*(.75+.5*R());
        k.add(g,{at:[px,y+lift+(flat?0:s*.12),pz],rot:[flat?0:(R()-.5)*tilt,R()*TAU,flat?0:(R()-.5)*tilt],scale:[s*stretch,s,s],color:colors[Math.floor(R()*colors.length)],gloss,ware,cast:false,whole:true});
      }
    },
    /** Trail a sauce over the serving along [x, z] points. */
    drizzle(points,r,color,{gloss=.75,ry=r*.45}={}){
      // Sampled closely enough to run down the sides of what it crosses.
      const line=new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,0,z))),path=line.getSpacedPoints(Math.max(8,Math.ceil(line.getLength()/.4)));
      const high=path.map(p=>k.top(p.x,p.z));
      // Thick sauce bridges a narrow gap and does not run to the bottom of it.
      for(let pass=0;pass<4;pass++)for(let i=1;i<high.length-1;i++)high[i]=Math.max(high[i],(high[i-1]+high[i+1])/2-.12);
      k.add(tube(path.map((p,i)=>[p.x,high[i]+ry*.5,p.z]),r,{sides:5,ry,curve:false}),{color,gloss,cast:false,whole:false});
    },
  };
  return k;
}

const DIRS=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[.71,0,.71],[-.71,0,.71],[.71,0,-.71],[-.71,0,-.71],[0,1,0],[.6,.53,.6],[-.6,.53,.6],[.6,.53,-.6],[-.6,.53,-.6],[.85,.53,0],[-.85,.53,0],[0,.53,.85],[0,.53,-.85],[0,-1,0]];
const STEPS=[[.5,1],[1.2,.75],[2.4,.5]];

/** Keep the near side of a part cut by the bite, closing the cut with what it is like inside. */
function bitten(part,plane,insideOf){
  const {pos,nor,col,idx,count}=part,out={pos:[],nor:[],col:[]},cuts=[];
  const side=i=>plane.nx*pos[i*3]+plane.nz*pos[i*3+2]-plane.d;
  const vert=i=>[pos[i*3],pos[i*3+1],pos[i*3+2],nor[i*3],nor[i*3+1],nor[i*3+2],col[i*3],col[i*3+1],col[i*3+2]];
  const put=v=>{out.pos.push(v[0],v[1],v[2]);out.nor.push(v[3],v[4],v[5]);out.col.push(v[6],v[7],v[8]);};
  for(let i=0;i<count;i+=3){
    const ids=[0,1,2].map(j=>idx?idx[i+j]:i+j),s=ids.map(side);
    if(s.every(v=>v<=0)){ids.forEach(id=>put(vert(id)));continue;}
    if(s.every(v=>v>0))continue;
    const face=[],edge=[];
    for(let j=0;j<3;j++){
      const a=vert(ids[j]),b=vert(ids[(j+1)%3]),sa=s[j],sb=s[(j+1)%3];
      if(sa<=0)face.push(a);
      if((sa<=0)!==(sb<=0)){const t=sa/(sa-sb),p=a.map((v,q)=>v+t*(b[q]-v));face.push(p);edge.push(p);}
    }
    for(let j=2;j<face.length;j++){put(face[0]);put(face[j-1]);put(face[j]);}
    if(edge.length===2)cuts.push(edge);
  }
  // Join the cut edges into loops and fill each one.
  const key=p=>Math.round(p[0]*200)+','+Math.round(p[1]*200)+','+Math.round(p[2]*200),ends=new Map();
  for(const seg of cuts)for(const p of seg){const q=key(p);if(!ends.has(q))ends.set(q,[]);ends.get(q).push(seg);}
  const used=new Set(),inside=insideOf(part);
  for(const first of cuts){
    if(used.has(first))continue;
    const loop=[first[0]];let seg=first,tip=first[1];used.add(first);
    for(let guard=0;guard<2000;guard++){
      loop.push(tip);
      const next=ends.get(key(tip)).find(other=>!used.has(other));
      if(!next)break;
      used.add(next);tip=key(next[0])===key(tip)?next[1]:next[0];seg=next;
    }
    if(loop.length<3)continue;
    const mid=[0,0,0];for(const p of loop)for(let q=0;q<3;q++)mid[q]+=p[q]/loop.length;
    const face=p=>{
      const grain=1+.10*sn(p[1]*3.1,p[2]*3.1,p[0]*3.1);
      return [p[0],p[1],p[2],plane.nx,0,plane.nz,inside.r*grain,inside.g*grain,inside.b*grain];
    };
    for(let i=0;i<loop.length;i++){put(face(mid));put(face(loop[i]));put(face(loop[(i+1)%loop.length]));}
  }
  return {...part,pos:Float32Array.from(out.pos),nor:Float32Array.from(out.nor),col:Float32Array.from(out.col),idx:null,count:out.pos.length/3};
}

/**
 * Weld the bench into one mesh in metres: position, normal, colour (with alpha
 * where there is glass), gloss, and the uv of the plain patch of the surface atlas.
 */
export function bake(k){
  const plane=k.level===1 && k.cut?{nx:Math.cos(k.biteAngle),nz:Math.sin(k.biteAngle),d:k.biteAt}:null;
  const crumb=new T.Color(0xf1dfb6),tone=new T.Color();
  const insideOf=part=>{
    if(part.inside!==null)return tone.set(part.inside).clone();
    let r=0,g=0,b=0;const n=part.col.length/3;for(let i=0;i<part.col.length;i+=3){r+=part.col[i];g+=part.col[i+1];b+=part.col[i+2];}
    return tone.setRGB(r/n,g/n,b/n).lerp(crumb,.3).clone();
  };
  const kept=[];
  for(const part of k.parts){
    if(!plane || part.ware){kept.push(part);continue;}
    if(part.whole){if(plane.nx*part.cx+plane.nz*part.cz<=plane.d)kept.push(part);continue;}
    const rest=bitten(part,plane,insideOf);if(rest.count)kept.push(rest);
  }
  const field=heightField();
  for(const part of kept)if(part.opacity===1)field.mesh(part.pos,part.idx,part.count);
  // Shade each point by how much of the sky the rest of the serving hides from it.
  for(const part of kept){
    if(part.opacity<1 || !part.shade)continue;
    const {pos,nor,col}=part;
    for(let i=0;i<pos.length;i+=3){
      const x=pos[i],y=pos[i+1],z=pos[i+2],nx=nor[i],ny=nor[i+1],nz=nor[i+2];
      let hidden=0,open=0;
      for(const d of DIRS){
        const w=d[0]*nx+d[1]*ny+d[2]*nz;if(w<.12)continue;
        open+=w;
        for(const [reach,weight] of STEPS){
          if(field.at(x+nx*.14+d[0]*reach,z+nz*.14+d[2]*reach)>y+ny*.14+d[1]*reach+.06){hidden+=w*weight;break;}
        }
      }
      let shade=open?hidden/open:0;
      if(field.at(x,z)>y+.45)shade=Math.max(shade,.8);
      col[i]*=1-.60*shade;col[i+1]*=1-.66*shade;col[i+2]*=1-.71*shade;
    }
  }
  const translucent=kept.some(part=>part.opacity<1);
  const total=kept.reduce((sum,part)=>sum+part.count,0);
  const position=new Float32Array(total*3),normal=new Float32Array(total*3),color=new Float32Array(total*(translucent?4:3)),gloss=new Float32Array(total),uv=new Float32Array(total*2);
  let at=0;
  // Glass is drawn after what it holds.
  for(const part of [...kept.filter(p=>p.opacity===1),...kept.filter(p=>p.opacity<1)]){
    const {pos,nor,col,idx,count}=part,step=translucent?4:3;
    for(let i=0;i<count;i++,at++){
      const v=(idx?idx[i]:i)*3;
      position[at*3]=pos[v]*.01;position[at*3+1]=pos[v+1]*.01;position[at*3+2]=pos[v+2]*.01;
      normal[at*3]=nor[v];normal[at*3+1]=nor[v+1];normal[at*3+2]=nor[v+2];
      color[at*step]=col[v];color[at*step+1]=col[v+1];color[at*step+2]=col[v+2];if(translucent)color[at*step+3]=part.opacity;
      gloss[at]=part.gloss;uv[at*2]=.994;uv[at*2+1]=.5;
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(position,3));g.setAttribute('normal',new T.BufferAttribute(normal,3));
  g.setAttribute('color',new T.BufferAttribute(color,translucent?4:3));g.setAttribute('uv',new T.BufferAttribute(uv,2));
  g.setAttribute('gloss',new T.BufferAttribute(gloss,1));g.computeBoundingBox();g.computeBoundingSphere();
  return g;
}
