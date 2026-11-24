import * as T from './vendor/three.module.min.js';
import { groceries,groceryPrice } from './grocery-stock.js';
import { roomPoint } from './room.js';
import { ingredientMap,PLAIN_UV,printUV } from './food-surface.js';
import { kitchen,bake } from './food-kit.js';
import { sodaCan,chipBag } from './food-packaging.js';

const shapes=new Map(), ink=new T.Color();
export function packageMaterial(street=false,id){
  const settings={map:ingredientMap(),vertexColors:true,side:T.DoubleSide};
  const bottle=id==='grocery-water';
  return street?new T.MeshBasicMaterial({...settings,fog:false}):new T.MeshStandardMaterial({...settings,roughness:bottle?.23:.46,transparent:bottle});
}
// Coordinates are in metres, +Z is the front with the printed label.
export function packageGeometry(id,shelf=false,level=2){
  const distant=shelf==='window',key=distant?id+'-window':shelf?id+'-shelf':id+'@'+level;
  if(shapes.has(key))return shapes.get(key);
  const item=groceries[id],amount=shelf?1:level/2;
  if(!shelf && (item.shape==='can' || id==='grocery-chips')){
    const bench=kitchen(id,level>0?2:0,amount);
    if(item.shape==='can')sodaCan(bench,item.tile);else chipBag(bench);
    const geometry=bake(bench);shapes.set(key,geometry);return geometry;
  }
  if(item.shape==='apple' && amount>0 && amount<1){
    const bench=kitchen(id,2,amount);
    bench.biteAngle=1.1;
    bench.add(packageGeometry(id),{scale:100,vertexColors:true,inside:0xead6a1,whole:false});
    const geometry=bake(bench,{progressive:true});shapes.set(key,geometry);return geometry;
  }
  const pos=[],uv=[],color=[];
  const clearBottle=item.shape==='bottle' && !shelf;let opacity=1;
  function vertex(p,c,u,v,label){
    pos.push(...p);ink.set(c);color.push(ink.r,ink.g,ink.b);
    if(clearBottle)color.push(opacity);
    uv.push(...(label?printUV(item.tile,u,v):PLAIN_UV));
  }
  function quad(a,b,c,d,tint,printed=false,u0=0,u1=1,v0=0,v1=1){
    for(const [p,u,v] of [[a,u0,v0],[b,u1,v0],[c,u1,v1],[a,u0,v0],[c,u1,v1],[d,u0,v1]])vertex(p,tint,u,v,printed);
  }
  function lathe(rings,tint,n=shelf?12:40){
    const before=pos.length;
    for(let j=1;j<rings.length;j++)for(let i=0;i<n;i++){
      const p=(k,r)=>[Math.sin(k/n*Math.PI*2)*r[1],r[0],Math.cos(k/n*Math.PI*2)*r[1]];
      quad(p(i,rings[j-1]),p(i+1,rings[j-1]),p(i+1,rings[j]),p(i,rings[j]),tint);
    }
    curves.push([before,pos.length]);
  }
  const curves=[];
  function band(radius,base,height,steps=14){
    // The front label spans the visible arc. A matching band wraps the back.
    for(const center of [0,Math.PI])for(let i=0;i<steps;i++){
      const p=(k,y)=>{const a=center+(k/steps-.5)*Math.PI;return [Math.sin(a)*radius,y,Math.cos(a)*radius];};
      quad(p(i,base),p(i+1,base),p(i+1,base+height),p(i,base+height),'#ffffff',true,i/steps,(i+1)/steps);
    }
  }
  function rect(x,y,z,w,h,d,tint){
    const a=x-w/2,b=x+w/2,f=z+d/2,k=z-d/2,top=y+h;
    quad([a,y,f],[b,y,f],[b,top,f],[a,top,f],tint);
    quad([b,y,k],[a,y,k],[a,top,k],[b,top,k],tint);
    quad([a,top,f],[b,top,f],[b,top,k],[a,top,k],tint);
    quad([b,y,f],[b,y,k],[b,top,k],[b,top,f],tint);
    quad([a,y,k],[a,y,f],[a,top,f],[a,top,k],tint);
    quad([a,y,k],[b,y,k],[b,y,f],[a,y,f],tint);
  }
  if(item.shape==='apple' && amount===0){
    lathe([[.003,.004],[.005,.021],[.014,.023],[.023,.010],[.050,.0086],[.063,.024],[.072,.017],[.071,.004]],'#ead6a1');
    lathe([[.064,.021],[.071,.017],[.072,.003]],item.color);lathe([[.067,.002],[.084,.0018],[.085,0]],'#635137');
    rect(.009,.031,.003,.003,.006,.002,'#775638');
  }else if(item.shape==='orange' && amount<1){
    for(let l=0;l<5;l++)for(let j=0;j<6;j++){
      const point=(side,k)=>{const v=k/6,a=l*1.257+side*(.55-.43*v),r=.012+v*.034;return [r*Math.sin(a),.004+.037*v*v,r*Math.cos(a)];};
      quad(point(-1,j),point(1,j),point(1,j+1),point(-1,j+1),j%2?'#e7a146':'#f0ac4e');
    }
    // Open the peel once, then remove wedges from the same segmented fruit.
    for(let n=0;n<Math.ceil(8*amount);n++){
      const center=n*Math.PI/4-.9;
      const point=(u,v)=>{
        const a=center+(u-.5)*.72,p=v*Math.PI,r=.034*Math.sin(p);
        return [Math.sin(a)*r,.038-.034*Math.cos(p),Math.cos(a)*r];
      };
      for(let j=0;j<8;j++){
        for(let i=0;i<4;i++)quad(point(i/4,j/8),point((i+1)/4,j/8),point((i+1)/4,(j+1)/8),point(i/4,(j+1)/8),'#ed9a35');
        const y=.038-.034*Math.cos(j/8*Math.PI),nextY=.038-.034*Math.cos((j+1)/8*Math.PI);
        for(const edge of [0,1])quad([0,y,0],point(edge,j/8),point(edge,(j+1)/8),[0,nextY,0],'#f2ae55');
      }
    }
  }else if(distant){
    if(item.shape==='bottle'){
      lathe([[0,.030],[.17,.032],[.20,.015],[.22,.014],[.22,0]],'#b7d9e4',6);band(.033,.061,.08,3);
    }else if(item.shape==='can'){
      lathe([[.108,.032],[.121,.029],[.121,0]],'#c2c8c4',6);band(.032,0,.108,3);
    }else if(item.shape==='apple'||item.shape==='orange'){
      lathe([[0,.016],[.027,.037],[.056,.036],[.074,.014],[.069,0]],item.color,7);
    }else{
      const carton=item.shape==='carton',w=carton?.072:.144,h=carton?.18:.205,d=carton?.071:.055;
      rect(0,0,0,w,h,d,item.color);
      quad([-w/2,0,d/2+.0002],[w/2,0,d/2+.0002],[w/2,h,d/2+.0002],[-w/2,h,d/2+.0002],'#fff',true);
    }
  }else if(item.shape==='orange'){
    const rings=[[.002,0],[.002,.011],[.009,.024],[.022,.035],[.040,.040],[.056,.037],[.069,.029],[.077,.015],[.079,.004],[.077,0]];
    lathe(rings,'#ec912d',shelf?13:36);
    lathe([[.076,.004],[.079,.0035],[.0792,0]],'#858046',7);
    if(!shelf){
      for(let i=0;i<220;i++){
        const a=i*2.4,z=(i+.5)/220*1.88-.94,r=.04*Math.sqrt(1-z*z),x=Math.sin(a)*r,f=Math.cos(a)*r,y=.040+.038*z;
        const dx=.00045*Math.cos(a),df=-.00045*Math.sin(a);
        quad([x-dx,y,f-df],[x,y-.0004,f],[x+dx,y,f+df],[x,y+.0004,f],i%3?'#d88329':'#f5aa47');
      }
    }
  }else if(item.shape==='apple'){
    const rings=[[.006,.001],[.002,.013],[.008,.024],[.021,.032],[.041,.038],[.057,.037],[.069,.030],[.074,.020],[.071,.010],[.063,.003],[.064,0]];
    const point=(j,i)=>{
      const [y,r]=rings[j],a=i*Math.PI/16,lobe=Math.cos(5*a);
      const radius=r*(1+.028*lobe);
      return [Math.sin(a)*radius,y+(j===7?.0025*lobe:0),Math.cos(a)*radius];
    };
    for(let j=1;j<rings.length;j++)for(let i=0;i<32;i+=shelf?2:1){
      const stripe=.5+.5*Math.cos(i*1.77+j*.33);
      ink.setRGB(.40+.16*stripe,.042+.045*stripe,.022+.014*stripe);
      const next=i+(shelf?2:1);
      quad(point(j-1,i),point(j-1,next),point(j,next),point(j,i),ink.getHex());
    }
    lathe([[.063,.002],[.079,.0023],[.085,.0017],[.085,0]],'#5c4127',9);
    quad([0,.078,0],[.009,.083,.004],[.022,.086,0],[.009,.082,-.005],'#697d32');
  }else if(item.shape==='bottle'){
    const rings=[[0,.023],[.003,.030],[.008,.032],[.017,.033],[.022,.030]];
    for(let y=.027;y<.155;y+=shelf?.046:.012)rings.push([y,.032],[y+.004,.031],[y+.008,.0325]);
    rings.push([.170,.031],[.179,.028],[.192,.018],[.200,.013],[.212,.013]);
    if(clearBottle && amount>0){
      const line=.014+.158*amount;
      opacity=.68;lathe([[.007,.026],[line-.005,.030],[line,.029],[line,0]],'#9bc9d4',32);
      opacity=.84;lathe([[line-.001,.029],[line+.001,.030],[line+.002,.029]],'#edf6f5',32);opacity=1;
    }
    opacity=.22;lathe(rings,'#dcebed');opacity=1;
    band(.0331,.061,.080);
    if(level===2)lathe([[.198,.014],[.201,.016],[.204,.015],[.205,.016],[.219,.016],[.221,.014],[.221,0]],'#e6ede4',20);
    if(level!==2)lathe([[.201,.013],[.210,.015],[.212,.0125],[.209,.0108]],'#d4e1de');
    if(!shelf && level===2)for(let i=0;i<34;i++){
      const a=i*Math.PI/17,b=a+.042,p=(t,y,r)=>[Math.sin(t)*r,y,Math.cos(t)*r];
      quad(p(a,.206,.0162),p(b,.206,.0163),p(b,.219,.0163),p(a,.219,.0162),'#d7e2de');
    }
  }else if(item.shape==='can'){
    lathe([[0,.024],[.004,.029],[.013,.032],[.108,.032],[.116,.029],[.119,.030],[.121,.030],[.121,.026],[.119,.025],[.119,0]],'#c5c7bf');
    band(.0323,.014,.094);
    rect(0,.119,level===2?-.002:-.008,.011,level===2?.002:.004,.017,'#a7afa9');
    rect(0,.1195,.011,.012,.001,.009,level===2?'#acb0a9':'#393c38');
  }else if(item.shape==='pouch'){
    const w=.147,h=.205;
    // Each foil face bows outward at the belly and pinches flat at the heat seals.
    for(const back of [false,true]){
      const point=(i,j)=>{
        const u=i/8,v=j/6,bulge=Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
        return [(u-.5)*w*(.92+.09*Math.sin(v*Math.PI)),.006+v*(h-.012),
          (back?-1:1)*(.003+(.006+.027*amount)*bulge+.003*Math.sin(i*2.5+j)*bulge+(amount<1?.019*v*v*Math.sin(Math.PI*u):0))];
      };
      for(let j=0;j<6;j++)for(let i=0;i<8;i++)quad(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1),back?item.color:'#ffffff',!back,i/8,(i+1)/8,j/6,(j+1)/6);
    }
    for(const y of (level===2?[0,h-.008]:[0])){rect(0,y,0,w,.008,.009,item.color);for(let k=-6;k<=6;k++)rect(k*.0108,y+.001,.005,.0015,.006,.001,'#bca67c');}
    if(amount>0 && amount<1){
      const count=Math.ceil(amount*6);
      for(let i=-2;i<count-2;i++){
        const x=i*.019,up=.018+(h-.034)*amount+Math.sin(i)*.003,z=.004*Math.cos(i);
        if(item.id==='grocery-pretzels'){
          // A single baked rope crosses its belly and loops back through two ears.
          const path=[[-.50,-.64],[.42,.29],[.48,.56],[.32,.78],[.05,.71],[-.59,.02],[-.57,-.30],[-.31,-.59],[.08,-.67],[.51,-.48],[.60,-.19],[.49,.09],[-.11,.68],[-.36,.76],[-.54,.61],[-.52,.36],[.43,-.65]];
          for(let j=1;j<path.length;j++){
            const ring=(point,angle)=>[x+.013*point[0]+.0017*Math.cos(angle),up+.011*point[1],z+.0021*Math.sin(angle)];
            for(let n=0;n<6;n++){
              const a=n*Math.PI/3,b=(n+1)*Math.PI/3;
              quad(ring(path[j-1],a),ring(path[j-1],b),ring(path[j],b),ring(path[j],a),j%4?'#a96934':'#b57840');
            }
          }
        }else{
          const rim=[];
          for(let j=0;j<12;j++){
            const a=j*Math.PI/6;rim.push([x+.0108*Math.cos(a),up+.010*Math.sin(a),z+.0032*Math.sin(a)**2]);
          }
          for(let j=0;j<rim.length;j++)quad([x,up,z-.0025],rim[j],rim[(j+1)%12],[x,up,z-.0025],j%4?'#d7af62':'#c79b52');
        }
      }
    }
  }else{
    const carton=item.shape==='carton',w=carton?.072:.144,h=carton?.147:.212,d=carton?.071:.055;
    if(amount===1)rect(0,0,0,w,h,d,item.color);
    else{
      rect(0,0,0,w,.002,d,item.color);
      for(const side of [-1,1]){
        rect(0,0,side*d/2,w,h,.0015,item.color);
        rect(side*w/2,0,0,.0015,h,d,item.color);
        if(!carton)quad([-w/2,h,side*d/2],[w/2,h,side*d/2],[w/2,h+.015,side*(d/2+.012)],[-w/2,h+.015,side*(d/2+.012)],'#c6a477');
      }
      if(amount>0){
        const height=h*(.10+.82*amount);
        const fill=carton?(id==='grocery-milk'?'#f2ecdc':'#eea330'):'#b89161';
        rect(0,height,0,w-.003,.002,d-.003,fill);
        if(!carton)for(let i=0;i<30;i++)rect(((i%10)-4.5)*.013,height+.004+.001*Math.sin(i),((i%3)-1)*.016,.009,.004,.006,'#cfa36a');
      }
    }
    quad([-w/2,0,d/2+.0002],[w/2,0,d/2+.0002],[w/2,h,d/2+.0002],[-w/2,h,d/2+.0002],'#ffffff',true);
    // Back-of-pack nutrition panel and barcode visible when turning the product.
    rect(0,h*.24,-d/2-.0003,w*.72,h*.55,.0005,'#eeeadd');
    for(let j=0;j<7;j++)rect(0,h*(.31+j*.062),-d/2-.0008,w*(j%2?.54:.60),.0017,.0005,'#47463f');
    for(let j=0;j<16;j++)rect((j-8)*w*.027,h*.07,-d/2-.0008,w*(j%3?.010:.019),.015,.0005,'#352e27');
    if(carton){
      const l=-w/2,r=w/2,peak=h+(level===2?.033:.019);
      for(const s of [-1,1])quad([l,h,s*d/2],[r,h,s*d/2],[r,peak,s*(level===2?.002:.014)],[l,peak,s*(level===2?.002:.014)],'#eee9d8');
      for(const x of [l,r])quad([x,h,-d/2],[x,h,d/2],[x,peak,.002],[x,peak,-.002],item.color);
      if(level===2)rect(0,peak,0,w,.009,.0045,item.color);
    }else if(level===2)rect(0,h*.975,0,w*.986,.002,d*1.03,'#ded5bd');
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(color,clearBottle?4:3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  // Smooth circumference while preserving the shoulders and horizontal moulded creases.
  const normals=g.attributes.normal.array;
  for(const [first,end] of curves)for(let i=first;i<end;i+=3){
    const r=Math.hypot(pos[i],pos[i+2]),h=Math.hypot(normals[i],normals[i+2]);
    if(r>.0001){normals[i]=pos[i]*h/r;normals[i+2]=pos[i+2]*h/r;}
  }
  shapes.set(key,g);return g;
}
const invisible=new T.Matrix4().makeScale(0,0,0);
export function buildGroceryDisplays(room,y,mask){
  const group=new T.Group(),material=packageMaterial(true),units=[],batches=new Map();
  group.name='Packaged groceries';
  material.onBeforeCompile=(shader,renderer)=>{
    mask?.(shader,renderer);
    shader.vertexShader='varying float packagingLight;\n'+shader.vertexShader
      .replace('vec3 local = position - shopFront.xyz','vec3 local = (instanceMatrix * vec4(position,1.)).xyz - shopFront.xyz')
      .replace('#include <begin_vertex>','#include <begin_vertex>\n packagingLight = .80 + .20 * dot(normalize(mat3(instanceMatrix)*normal),normalize(vec3(-.45,.9,.55)));');
    shader.fragmentShader='varying float packagingLight;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight *= packagingLight;\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey=()=>mask?'printed-stock-window':'printed-stock-indoor';
  const orient=slot=>Math.atan2(room.tx*slot.da-room.nx*slot.db,room.tz*slot.da-room.nz*slot.db);
  const matrixFor=(s,up)=>{const [x,z]=roomPoint(room,s.a,s.b);return new T.Matrix4().makeRotationY(orient(s)).setPosition(x,y+up,z);};
  for(const item of Object.values(groceries)){
    const slots=room.grocerySlots.filter(s=>s.id===item.id);
    if(!slots.length)continue;
    const batch=new T.InstancedMesh(packageGeometry(item.id,true),material,slots.length);batch.name=item.name;
    batch.instanceMatrix.setUsage(T.DynamicDrawUsage);batches.set(item.id,batch);group.add(batch);
    slots.forEach((s,i)=>{const matrix=matrixFor(s,s.y);units[s.index]={batch,i,matrix};batch.setMatrixAt(i,matrix);});
    batch.computeBoundingSphere();
  }
  let tickets=null,cardMap=null;
  if(typeof document!=='undefined'){
    const count=Object.keys(groceries).length,canvas=document.createElement('canvas');canvas.width=512;canvas.height=count*96;
    const ctx=canvas.getContext('2d');
    if(ctx){
      for(const item of Object.values(groceries)){
        const top=item.tile*96;ctx.fillStyle='#faf4d8';ctx.fillRect(0,top,512,96);
        ctx.fillStyle='#3b4934';ctx.fillRect(0,top,12,96);ctx.font='bold 30px sans-serif';ctx.fillText(item.name,23,top+41,329);
        ctx.font='23px sans-serif';ctx.fillText(item.size,24,top+76);ctx.font='bold 48px sans-serif';ctx.fillText('$'+groceryPrice(room.place,item).toFixed(2),360,top+65,141);
      }
      cardMap=new T.CanvasTexture(canvas);cardMap.colorSpace=T.SRGBColorSpace;
      const positions=[],uv=[];
      for(const s of room.groceryTickets){
        const m=matrixFor(s,s.y),tile=groceries[s.id].tile;
        for(const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
          const p=new T.Vector3((u-.5)*.28,v*.052,0).applyMatrix4(m);positions.push(p.x,p.y,p.z);uv.push(u,1-(tile+1-v)/count);
        }
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
      const mat=new T.MeshBasicMaterial({map:cardMap,side:T.DoubleSide,fog:false});if(mask)mat.onBeforeCompile=mask;
      tickets=new T.Mesh(g,mat);group.add(tickets);
    }
  }
  let revision=-1,near=true;
  return {group,sync(shop,close=true){
    if(near!==close){
      for(const [id,batch] of batches)batch.geometry=packageGeometry(id,close?true:'window');
      near=close;
    }
    if(revision===shop.revision)return;revision=shop.revision;
    units.forEach(({batch,i,matrix},index)=>batch.setMatrixAt(i,shop.missing(room.place.id,index,true)?invisible:matrix));
    for(const batch of batches.values())batch.instanceMatrix.needsUpdate=true;
  },dispose(){
    for(const batch of batches.values())batch.dispose();material.dispose();tickets?.geometry.dispose();tickets?.material.dispose();cardMap?.dispose();
  }};
}
