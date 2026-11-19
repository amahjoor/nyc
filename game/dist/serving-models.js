// Models are authored in centimetres and baked to metres once per dish and portion.
// Porcelain, paper and glass stay put. Only food is intersected by the bite plane.
import * as T from './vendor/three.module.min.js';
import {drinkRecipes,portionBase,portionLevel} from './food-catalog.js';

const tau=2*Math.PI,cache=new Map(),solids=new Map();
function solid(key,build){if(!solids.has(key))solids.set(key,build());return solids.get(key);}
function turned(profile,n=32){return new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),n);}
function outline(points,thickness,bevel=.09){
  const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  return new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:2}).rotateX(-Math.PI/2);
}
const palette={china:0xf4ede2,rim:0xd2c8b6,bread:0xc98b45,toast:0xa36532,crumb:0xf1d79c,beef:0x76422c,chicken:0xb87232,leaf:0x638244,tomato:0xc94f31,cheese:0xedb44f,rice:0xf0e0b7,white:0xf5ece0};
const {china,rim,bread,toast,crumb,beef,chicken,leaf,tomato,cheese,rice,white}=palette;

const swatches=new Map([
  [0,[0xb57b36,0xd6a24e,0xc88a3e,0xd6a240,0xb97a35,0xdcae55,0xc58c46,0xddb264,0xbf883f,0xd6a24e]],
  [1,[bread,toast,crumb,0xd99950,0xd69b55,0xd9ab76,0xd1a36a,0xc08740,0xe3b165,0xdbac68,0x966b44,0xe3cda1,0xd9b57b,0xb07348,0xc69656]],
  [2,[beef,chicken,0xc99a84,0xb36347,0x925437,0x9f612f,0xaf773b,0xbb803e,0xb57c3e,0xb66636,0xa6502d,0x704935,0xb07b59,0x74452d,0x8a6246,0x9d692d]],
  [3,[rice,0xb7874a,0xe6cd94]]
].flatMap(([index,colors])=>colors.map(color=>[color,index])));
function kitchen(){
  const parts=[];let permanent=false, opacity=1, yaw=0, ox=0, oy=0, oz=0;
  const orient=new T.Euler(),rot=new T.Quaternion(),matrix=new T.Matrix4(),v=new T.Vector3(),scale=new T.Vector3();
  function add(geometry,x,y,z,w,h,d,color,rx=0,ry=0,rz=0){
    orient.set(rx,ry,rz,'YXZ');rot.setFromEuler(orient);
    matrix.compose(v.set(x,y,z),rot,scale.set(w,h,d));
    const frame=new T.Matrix4().makeRotationY(yaw).setPosition(ox,oy,oz);
    parts.push({geometry,matrix:frame.multiply(matrix),color,permanent,opacity});
  }
  const ball=(x,y,z,w,h,d,c,ry=0)=>{
    const small=Math.max(w,h,d)<1.15;
    add(solid(small?'seed':'sphere',()=>new T.SphereGeometry(1,small?9:24,small?5:12)),x,y,z,w,h,d,c,0,ry);
  };
  const box=(x,y,z,w,h,d,c,ry=0,rz=0)=>add(solid('box',()=>new T.BoxGeometry(1,1,1)),x,y,z,w,h,d,c,0,ry,rz);
  const cyl=(x,y,z,rt,rb,h,c,rx=0,rz=0)=>add(solid('cyl'+rt+'/'+rb,()=>new T.CylinderGeometry(rt,rb,1,28)),x,y,z,1,h,1,c,rx,0,rz);
  const hoop=(x,y,z,r,t,c,rx=Math.PI/2,rz=0)=>add(solid('ring'+r+'/'+t,()=>new T.TorusGeometry(r,t,8,32)),x,y,z,1,1,1,c,rx,0,rz);
  function line(points,r,c){
    const key='tube'+JSON.stringify(points)+'/'+r;
    add(solid(key,()=>new T.TubeGeometry(new T.CatmullRomCurve3(points.map(a=>new T.Vector3(...a))),Math.min(48,points.length*3),r,5,false)),0,0,0,1,1,1,c);
  }
  function form(key,g,x,y,z,w,h,d,c,ry=0){add(solid(key,g),x,y,z,w,h,d,c,0,ry);}
  function at(x,y,z,angle,fn){
    const prev=[ox,oy,oz,yaw];ox+=Math.cos(yaw)*x+Math.sin(yaw)*z;oz+=-Math.sin(yaw)*x+Math.cos(yaw)*z;oy+=y;yaw+=angle;fn();[ox,oy,oz,yaw]=prev;
  }
  function ware(fn){const was=permanent;permanent=true;fn();permanent=was;}
  function glass(fn){opacity=.16;fn();opacity=1;}
  const plate=(scale=1)=>ware(()=>form('stoneware',()=>turned([[0,.15],[6,.15],[8,.30],[12.9,1.18],[13.2,1.37],[13,1.55],[12.4,1.48],[8,.61],[0,.52]]),0,0,0,scale,1,scale,china));
  function bowl(r=9,h=5,c=china){ware(()=>form('bowl',()=>turned([[0,.03],[.38,.03],[.53,.12],[.79,.47],[1,.96],[.99,1],[.95,1],[.90,.85],[.71,.46],[.45,.15],[0,.13]]),0,0,0,r,h,r,c));}
  function scatter(n,x,y,z,spread,fn){
    for(let i=0;i<n;i++){const a=i*2.4,r=spread*Math.sqrt((i+.4)/n);fn(x+r*Math.cos(a),y+.12*Math.sin(3*i),z+r*Math.sin(a),i);}
  }
  return {parts,ball,box,cyl,hoop,line,form,at,ware,glass,plate,bowl,scatter};
}

// Each ingredient is clipped independently. Closing its section keeps fillings visible
// inside a bitten sandwich and leaves the plate underneath intact.
function bake(parts,level,cut){
  const pos=[],colors=[],normals=[],uv=[],ink=new T.Color(),v=new T.Vector3(),n=new T.Vector3(),nm=new T.Matrix3();
  let tile,alpha;
  const translucent=parts.some(part=>part.opacity<1);
  function write(a,b,c,tint){
    // Project onto the dominant plane of this triangle in dish space so a cut
    // section keeps the same grain scale as the food around it.
    const nx=Math.abs(a[3]+b[3]+c[3]),ny=Math.abs(a[4]+b[4]+c[4]),nz=Math.abs(a[5]+b[5]+c[5]);
    const axisU=nx>ny && nx>nz?2:0,axisV=ny>=nx && ny>=nz?2:1;
    for(const p of [a,b,c]){
      pos.push(p[0]*.01,p[1]*.01,p[2]*.01);normals.push(p[3],p[4],p[5]);colors.push(tint.r,tint.g,tint.b);
      if(translucent)colors.push(alpha);
      if(tile===undefined)uv.push(.994,.5);
      else{
        const u=Math.max(.01,Math.min(.99,.50+p[axisU]/26)),v=Math.max(.01,Math.min(.99,.50+p[axisV]/26));
        uv.push(((tile%2)+u)*.5*1024/1040,1-(Math.floor(tile/2)+v)*.5);
      }
    }
  }
  // Draw translucent walls after their contents, including when merged into
  // an instanced serving. The inner liquid remains visible through the shell.
  for(const part of translucent?[...parts.filter(p=>p.opacity===1),...parts.filter(p=>p.opacity<1)]:parts){
    if(!level && !part.permanent)continue;
    const {geometry:g,matrix}=part,p=g.attributes.position,normal=g.attributes.normal,ix=g.index;
    ink.setHex(part.color);nm.getNormalMatrix(matrix);tile=part.permanent?undefined:swatches.get(part.color);alpha=part.opacity;
    const verts=Array.from({length:p.count},(_,i)=>{v.fromBufferAttribute(p,i).applyMatrix4(matrix);n.fromBufferAttribute(normal,i).applyNormalMatrix(nm);return [v.x,v.y,v.z,n.x,n.y,n.z];});
    const edges=[],slice=!part.permanent && level===1 && cut;
    for(let i=0;i<(ix?.count??p.count);i+=3){
      const tri=[0,1,2].map(k=>verts[ix?ix.getX(i+k):i+k]);
      if(!slice||tri.every(a=>a[0]<=0)){write(...tri,ink);continue;}
      if(tri.every(a=>a[0]>0))continue;
      const face=[];
      for(let j=0;j<3;j++){
        const a=tri[j],b=tri[(j+1)%3];if(a[0]<=0)face.push(a);
        if((a[0]<=0)!==(b[0]<=0)){const t=a[0]/(a[0]-b[0]),pt=a.map((val,k)=>val+t*(b[k]-val));face.push(pt);edges.push(pt);}
      }
      for(let j=2;j<face.length;j++)write(face[0],face[j-1],face[j],ink);
    }
    if(edges.length){
      const cy=edges.reduce((s,p)=>s+p[1],0)/edges.length,cz=edges.reduce((s,p)=>s+p[2],0)/edges.length;
      const end=edges.map(a=>[0,a[1],a[2],1,0,0]).sort((a,b)=>Math.atan2(a[2]-cz,a[1]-cy)-Math.atan2(b[2]-cz,b[1]-cy));
      ink.lerp(new T.Color(crumb),.13);
      for(let i=0;i<end.length;i++)write([0,cy,cz,1,0,0],end[i],end[(i+1)%end.length],ink);
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,translucent?4:3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeBoundingBox();return g;
}
function ricePile(k,x,z,r,up=.6,brown=false){
  k.ball(x,up+.9,z,r,1.4,r*.78,brown?0xb7874a:rice);
  k.scatter(78,x,up+.9,z,r*.96,(a,y,b,i)=>{
    const depth=Math.max(0,1-((a-x)/r)**2-((b-z)/r)**2);
    k.ball(a,y+1.4*Math.sqrt(depth),z+(b-z)*.78,.38,.16,.16,brown && i%9===0?leaf:brown && i%9===1?0xda8840:i%2?rice:0xe6cd94,i*.63);
  });
}
function greens(k,x,z,r,up){
  k.scatter(13,x,up,z,r,(a,y,b,i)=>k.ball(a,y+.25,b,.76,.42,.53,i%3?leaf:0x8d9b50,i));
}
function fries(k,x,z,n=13){
  k.scatter(n,x,1.3,z,3,(a,y,b,i)=>k.box(a,y+(i%3)*.45,b,.58,.64,3.8+i%4,i%3?0xe5b456:0xc98e41,.15*Math.sin(i)));
}
function noodleNest(k,x,z,up,pad=false){
  const points=Array.from({length:28},(_,i)=>[Math.cos(i*.58)*(1.5+i*.055),.24+i*.045,Math.sin(i*.58)*(1.5+i*.055)]);
  k.scatter(9,x,up,z,4.7,(a,y,b,i)=>k.at(a,y,b,i*.71,()=>k.line(points,pad?.23:.18,pad?0xc89252:0xe9bc67)));
}
function roll(k,x,z,up,angle,egg=false,fraction=1){
  k.at(x,up,z,angle,()=>{
    const r=egg?2.10:1.44,length=(egg?10.5:8.75)*fraction;
    k.form('folded-wrapper-'+egg,()=>{
      const outer=turned([[0,0],[.72,.005],[.94,.03],[1,.10],[.95,.31],[1,.52],[.97,.74],[1,.94],[.91,1],[.83,1],[.79,.96]],28);
      return outer.translate(0,-.5,0).rotateX(Math.PI/2);
    },0,r,0,r,r,length,egg?0xb57b36:0xd6a24e);
    // The folded seam circles the crisp wrapper diagonally.
    const seam=Array.from({length:16},(_,i)=>{const a=-.4+i*.27;return [Math.cos(a)*r,r+Math.sin(a)*r,-length*.48+i*length*.065];});
    k.line(seam,.068,egg?0x96662d:0xb98437);
    for(let i=0;i<16;i++){const a=.14+(i*2.4)%2.9;k.ball(Math.cos(a)*r,r+Math.sin(a)*r,(i%7-3)*length*.12,.13,.055,.16,i%3?0xbc8a43:0xe2bc72);}
    const end=length/2+.014;k.cyl(0,r,end,r*.87,r*.87,.035,0xc4a375,Math.PI/2);
    for(let i=0;i<12;i++){const a=i*2.4,rad=r*.71*Math.sqrt(i/12);k.box(rad*Math.cos(a),r+rad*Math.sin(a),end+.06,.21+(i%3)*.12,.12+(i%2)*.09,.18,[0xe9cf8e,0x86974c,0xd8823d,0x875c39][i%4],.15*i,a);}
  });
}
function sauce(k,x,z,c,level=2){
  k.at(x,.5,z,0,()=>{k.ware(()=>k.form('ramekin',()=>turned([[0,0],[1.55,0],[2.3,1.6],[2.12,1.65],[1.52,.38],[0,.38]]),0,0,0,1,1,1,china));if(level)k.cyl(0,level===2?1.17:.63,0,level===2?1.98:1.64,level===2?1.86:1.58,.22,c);});
}
function chickenPiece(k,x,y,z,s,c,drum=false){
  k.ball(x,y,z,s,s*.7,s*.81,c,.5);k.scatter(13,x,y+s*.47,z,s*.75,(a,h,b,i)=>k.ball(a,h,b,.48,.32,.41,i%3?c:0x9f612f,i));
  if(drum){k.ball(x+s*.89,y-.17,z+.25,s*.66,s*.31,s*.34,c);k.ball(x+s*1.51,y-.18,z+.35,.62,.47,.54,0xe8d6aa);}
}
function sandwich(k,id){
  const burger=id.startsWith('burger'),roll=bread,hero=['hero','chopped-cheese','deli-sandwich'].includes(id),w=hero?7.9:4.8,d=hero?3.25:4.7;
  k.ball(0,1.65,0,w,1.12,d,roll);
  k.ball(0,2.52,0,w*.95,.35,d*.93,crumb);
  k.ball(0,3.16,0,w*.99,.78,d*.99,id==='hero'?0xc99a84:id==='bec'?0xb36347:beef);
  if(id==='bec'){k.ball(.2,4.13,0,w*.97,.65,d*.92,0xeec456);k.box(0,4.65,0,6.7,.23,6.5,cheese,.17);}
  else{
    for(let i=0;i<5;i++)k.ball((i-2)*w*.28,3.99,d*.31*Math.cos(i),w*.46,.26,d*.70,i%2?leaf:0x899d51,i*.33);
    k.ball(0,4.43,0,w*.88,.29,d*.88,tomato);
    if(burger || id==='chopped-cheese')k.box(0,3.95,0,w*1.60,.26,d*1.78,cheese,.24);
  }
  k.ball(0,5.25,0,w,1.84,d,0xd99950);
  k.scatter(19,0,6.80,0,Math.min(w,d)*.65,(x,y,z,i)=>k.ball(x,y,z,.15,.07,.09,i%2?crumb:0xf7deb0,i));
  if(id==='burger-deluxe'){fries(k,7,2,10);k.ball(-7.5,1.3,2,1.1,.7,2.6,0x718743);}
}
function wrapped(k,id){
  const burrito=id==='burrito',falafel=id==='falafel';
  k.at(0,0,0,-.30,()=>{
    // An open tortilla curls around the filling with both lips visible.
    const shell=()=>{const path=new T.Shape();path.moveTo(-3.4,4.5);path.quadraticCurveTo(-4.4,-2,0,-2.3);path.quadraticCurveTo(4.3,-2,3.6,4.1);path.lineTo(3.18,4);path.quadraticCurveTo(3.6,-1.5,0,-1.85);path.quadraticCurveTo(-3.7,-1.9,-3.02,4.4);path.closePath();return new T.ExtrudeGeometry(path,{depth:10,bevelEnabled:false,curveSegments:16}).translate(0,0,-5);};
    if(burrito){k.cyl(0,3.30,0,2.7,2.65,12,0xe3cda1,Math.PI/2);k.cyl(0,3.3,6.06,2.39,2.39,.13,0xd4bb85,Math.PI/2);}
    else k.form('taco-shell',shell,0,3.05,0,1,1,1,id==='taco'?0xdcae55:0xd9b57b);
    for(let i=0;i<14;i++){
      const x=Math.sin(i*2.4)*(burrito?1.6:1.88),z=(i%7-3)*1.27;
      if(burrito){k.ball(x,3.2+Math.cos(i*2.4)*1.6,6.17,.48,.42,.15,[rice,leaf,beef,tomato][i%4]);}
      else k.ball(x,4.45+i%2*.45,z,falafel?1.1:.91,falafel?1:.65,1.13,falafel?0x926530:id==='gyro'?0x8a6246:beef,i);
    }
    if(!burrito)k.scatter(16,0,5.35,0,3.65,(a,y,b,i)=>k.ball(a*.51,y,b,.48,.21,.49,i%3?leaf:tomato,i));
  });
}
function wedge(k,x,y,z,w,d,h,color,angle=0){
  k.form('wedge',()=>outline([[-.5,.4],[-.28,.52],[.24,.52],[.5,.37],[0,-.57]],1,.025),x,y,z,w,h,d,color,angle);
}
function pizza(k,x,z,angle,scale){
  k.at(x,.58,z,angle,()=>{wedge(k,0,0,0,12*scale,17*scale,.9,bread);wedge(k,0,.9,0,11.4*scale,16.4*scale,.26,tomato);
    wedge(k,0,1.16,0,11*scale,16*scale,.30,cheese);
    k.line([[-5.6*scale,1.1,6.4*scale],[0,1.52,8.0*scale],[5.6*scale,1.1,6.4*scale]],.63*scale,bread);
    for(const [u,v] of [[-2.5,3.2],[1.9,4.5],[0,-2]])k.cyl(u*scale,1.52,v*scale,1.25*scale,1.25*scale,.18,0xad543c);
  });
}
function foldedPastry(k,id){
  const halfmoon=id!=='samosa',color=id==='beef-patty'?0xd6a240:bread;
  const profile=halfmoon?[[-4.2,1.6],[-4,-.7],[-3,-2.3],[-1.7,-3.0],[0,-3.3],[1.9,-2.9],[3.6,-1.6],[4.2,1.6]]:
    [[-3.3,2.4],[.2,-3.5],[3.4,2.4]];
  for(const [x,z,r] of [[-3.5,-1,.46],[3.7,2,-.55]])k.at(x,.72,z,r,()=>{
    k.form(id+'-crust',()=>outline(profile,1.15,.33),0,0,0,1,1,1,color);
    if(halfmoon){k.ball(0,1.15,-.22,3.65,1.0,2.35,color);for(let i=0;i<12;i++){const a=Math.PI*(i+.4)/12;k.ball(3.9*Math.cos(a),1.36,1.35-4*Math.sin(a),.30,.19,.45,0xb97a35,-a);}}
    else{k.form('samosa-peak',()=>new T.ConeGeometry(3.75,3.45,3),0,2.3,.3,1,1,1,0xc88a3e,.04);}
  });
}
function maki(k,korean,count){
  for(let i=0;i<count;i++){
    const x=(i%3-1)*4.95,z=(Math.floor(i/3)-.5)*4.95;
    k.cyl(x,2.22,z,2.32,2.33,3.24,korean?0x344136:0x39463b);
    k.cyl(x,3.86,z,2.08,2.10,.10,rice);
    for(const [j,color] of (korean?[cheese,leaf,beef,0xe99542]:[0xe78d70,0xecac8d,0x809758]).entries()){
      const a=j*2.5;k.box(x+.65*Math.cos(a),3.98,z+.64*Math.sin(a),1.13,.20,1.37,color,a);
    }
    k.scatter(12,x,3.95,z,1.92,(a,y,b,j)=>{if(Math.hypot(a-x,b-z)>1.25)k.ball(a,4.0,b,.21,.115,.13,white,j);});
  }
}
function bowlMeal(k,id,level){
  const h=6,r=10; k.bowl(r,h,id==='ramen'?0x4d625d:china);if(!level)return;
  const y=level===2?5.18:2.94,rad=level===2?8.88:7.1;
  const soup=['soup','mushroom-soup','miso','ramen','green-curry','tikka','spinach','acai','sundae'].includes(id);
  if(soup){
    const colors={'mushroom-soup':0xb9a383,soup:0xb17f48,miso:0xb5986d,ramen:0xad7848,'green-curry':0x95a36a,tikka:0xc47145,spinach:0x6c8453,acai:0x833e70,sundae:0xb98267};
    k.cyl(0,y,0,rad,rad-.1,.22,colors[id]);
    if(id==='ramen'){noodleNest(k,-1,1,y-.57);k.ball(3,y+.44,-3.5,1.95,.52,2.38,white,.4);k.ball(3,y+.94,-3.6,.99,.22,1.12,0xe8aa48);k.box(-4,y+1.3,-2.4,3.9,3,.22,0x384b3e,.4,-.25);}
    else if(id==='miso'){for(let i=0;i<5;i++){const a=i*2.4;k.box(3.7*Math.sin(a),y+.19,4.2*Math.cos(a),1.7,.9,1.6,0xebe3bd,a);}}
    else if(id==='mushroom-soup'){for(let i=0;i<5;i++){const a=i*2.4,x=4*Math.cos(a),z=4.4*Math.sin(a);k.ball(x,y+.13,z,1.01,.43,.68,0x98795f,a);k.box(x,y+.12,z+.61,.46,.20,.81,0xd5c2a3,a);}}
    else if(id==='acai'){for(let i=0;i<5;i++){k.cyl(i*1.68-3.8,y+.45,-2,1.16,1.14,.5,0xf0d994);k.ball(i*1.56-3.4,y+.52,1.5,.66,.55,.66,0x49415d);}k.scatter(22,0,y+.44,3.5,2.1,(x,h,z)=>k.ball(x,h,z,.26,.16,.3,toast));return;}
    else if(id==='sundae'){k.ball(-2,y+1.1,0,3.1,2.6,3.1,0xf2d7aa);k.ball(2,y+.9,1,2.9,2.48,3,0xdfa39b);k.line([[-3,y+3,0],[-1,y+3.5,.8],[1,y+3.1,1],[2,y+3.2,.8]],.3,0x70422f);k.ball(-1,y+3.55,0,.65,.65,.65,tomato);return;}
    else if(id==='tikka'||id==='green-curry'){for(let i=0;i<5;i++){const a=i*2.4;chickenPiece(k,4.7*Math.cos(a),y+.19,4.8*Math.sin(a),1.15,id==='tikka'?0xba693d:0xafa16c);} }
    else if(id==='spinach')k.scatter(27,0,y+.19,0,rad*.89,(x,h,z,i)=>k.ball(x,h,z,1.1,.25,.66,i%3?0x64824e:0xb4b581,i));
    else k.scatter(12,0,y+.10,0,rad*.73,(x,h,z,i)=>k.box(x,h,z,.78,.28,.64,i%2?0xd78a43:rice,i));
    k.scatter(9,0,y+.38,0,rad*.69,(x,h,z,i)=>k.hoop(x,h,z,.32,.09,i%2?leaf:0x819c54));return;
  }
  ricePile(k,0,0,rad*.94,y-1.65,id==='fried-rice');
  if(id==='fried-rice'){k.scatter(19,0,y+.5,0,rad*.80,(x,h,z,i)=>k.box(x,h,z,.64,.44,.60,[beef,cheese,leaf,0xe49047][i%4],i));}
  if(id==='bibimbap'){
    for(let i=0;i<5;i++){const a=i*tau/5;k.scatter(9,4.4*Math.cos(a),y+.66,4.6*Math.sin(a),1.45,(x,h,z,j)=>k.box(x,h,z,.35,.32,1.35,[0xdb8b45,leaf,0x805547,0xd8b57b,0x9b4c34][i],j*.72));}
    k.ball(0,y+.72,0,2.5,.44,2.11,white);k.ball(0,y+1.02,0,1.20,.61,1.18,0xf4ba46);
  }
}
const bowls=new Set(['miso','ramen','soup','mushroom-soup','tikka','green-curry','acai','sundae','spinach','fried-rice','bibimbap']);
function entree(k,id){
  const isChicken=['chicken-rice','tso','jerk','roast-chicken','fried-chicken','wings'].includes(id);
  if(id==='steak'||id==='dinner'){
    k.ball(-2,2.51,0,6.4,1.92,4.62,0x925437,-.32);
    for(let i=-2;i<=2;i++)k.box(-2+i*1.48,4.26-Math.abs(i)*.24,0,.24,.14,5.65,0x653e29,-.32);
    greens(k,6,-2,2.4,1.2);for(let i=0;i<3;i++)k.ball(5.8+i*.86,1.45,2+i*.61,1.25,1.05,1.26,0xc49958);return;
  }
  if(id==='parm'){
    k.ball(0,1.93,0,6.9,1.33,4.6,0xaf773b);k.ball(0,3.1,0,6.05,.43,4.03,tomato);
    k.ball(.2,3.57,.1,5.6,.34,3.51,0xf2d99d);k.scatter(12,0,3.89,0,3.3,(x,y,z)=>k.ball(x,y,z,.32,.10,.35,0xb78142));return;
  }
  if(id==='roast-chicken'){
    k.ball(0,3.92,0,5.5,3.35,7.45,0xbb803e);
    for(const sign of [-1,1]){chickenPiece(k,sign*4.7,2.68,3.9,2.45,0xb57c3e,true);k.ball(sign*4.7,3.6,-2.7,1.8,1.6,3.3,0x9d692d,sign*.44);}return;
  }
  if(id==='fried-chicken'||id==='wings'){
    for(let i=0;i<(id==='wings'?5:3);i++){const a=i*2.4;chickenPiece(k,4.9*Math.cos(a),2.26,4.2*Math.sin(a),id==='wings'?1.86:2.75,id==='wings'?0xb66636:0xbf883f,i%2===0);}
    if(id==='fried-chicken'){k.cyl(-4.4,1.98,4.6,2.30,2.4,2.65,0xd1a36a);k.ball(-4.4,3.26,4.6,2.33,.50,2.33,crumb);}return;
  }
  ricePile(k,-4,0,4.3);const c=id==='tso'?0xa6502d:id==='jerk'?0x704935:id==='pernil'?0xb07b59:id==='oxtail'?0x74452d:chicken;
  for(let i=0;i<5;i++){
    const a=i*2.4,x=3.4+2.42*Math.cos(a),z=2.9*Math.sin(a);
    if(isChicken)chickenPiece(k,x,1.95,z,1.53,c,id==='jerk'&&i===0);
    else if(id==='pernil')k.at(x,1.65,z,a,()=>{
      for(let j=0;j<6;j++)k.ball((j-2.5)*.38,.1+.15*Math.sin(j),.29*Math.sin(j*1.7),.34,.32,1.65-j*.11,j%3?c:0x9f612f,j*.08);
    });
    else {k.ball(x,2.1,z,1.86,1.48,1.65,c,a);if(id==='oxtail')k.cyl(x,3.43,z,.68,.57,.28,0xc8ac87);}
  }
  if(id==='jerk'||id==='pernil')k.scatter(15,-4,2.74,0,3.3,(x,y,z,i)=>k.ball(x,y,z,.31,.20,.46,0x8e5445,i));
  if(id==='chicken-rice')k.line([[1.1,3,2],[3,3.48,1],[5,3.25,0],[2,3.42,-1.2],[5.1,3.25,-2]],.23,white);
  greens(k,3,-5.5,2.55,1.1);
}
function bakery(k,id,level){
  if(['bagel','lox','doughnut','doughnut-box'].includes(id)){
    const donut=id.startsWith('doughnut'),count=id==='doughnut-box'?6:1;
    if(count===6)k.ware(()=>{k.box(0,.48,0,20,.52,13,0xe7bfad);for(const sign of [-1,1]){k.box(0,1.50,sign*6.3,20,2.1,.28,0xe8c4b3);k.box(sign*9.86,1.50,0,.28,2.1,12.6,0xe8c4b3);}});
    for(let i=0;i<(count===6?level*3:count);i++){const x=count===1?0:(i%3-1)*6,z=count===1?0:(Math.floor(i/3)-.5)*6,r=count===1?3.65:1.69,t=count===1?1.35:.91;
      k.hoop(x,2.13,z,r,t,bread);
      if(donut)k.hoop(x,2.65,z,r,t*.91,i%3===1?0xca8a89:0xd9ab76);
      else{k.hoop(x,2.87,z,r,t*.89,white);if(id==='lox'){
          for(let j=0;j<6;j++){
            const a=j*tau/6,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
            k.ball(xx,3.30,zz,1.74,.30,2.47,0xd38363,a);k.ball(xx+.44,3.56,zz,1.25,.11,1.63,0xebac89,a+.25);
          }
        }k.hoop(x,3.84,z,r,t,0xd69b55);
        for(let a=0;a<22;a++){const theta=a*2.4,rad=r+.4*Math.sin(a);k.ball(x+rad*Math.cos(theta),5.14,z+rad*Math.sin(theta),.13,.07,.085,crumb,theta);}
      }
    }return;
  }
  if(id==='croissant'){
    for(let i=-3;i<=3;i++)k.ball(i*1.64,2.13-.22*Math.abs(i),i*i*.29,1.71,2.03-.37*Math.abs(i),2.93-.49*Math.abs(i),i%2?0xc08740:0xe3b165,i*.22);return;
  }
  if(id==='bw-cookie'){
    k.cyl(0,1.38,0,4.8,4.95,1.3,bread);
    for(let i=0;i<2;i++)k.form('half-disc'+i,()=>new T.CylinderGeometry(1,1,1,32,1,false,i*Math.PI,Math.PI),0,2.08,0,4.73,.16,4.73,i?white:0x54392f);return;
  }
  if(id==='pie'){wedge(k,0,.7,0,10,13,1,bread);wedge(k,0,1.6,0,9.8,12.9,2.35,0xb07348);wedge(k,0,3.9,0,10,13,.57,0xdbac68);for(let i=0;i<3;i++)k.box(-1.25+i*1.42,4.61,1.4,.26,.1,1.75,toast,-.3);return;}
  k.ball(0,id==='rye'?3.8:2.3,0,id==='rye'?7.5:4, id==='rye'?3.3:1.9, id==='rye'?4.6:3.2,id==='rye'?0x966b44:bread);
  if(id==='rye'){for(let i=-2;i<=2;i++)k.box(i*2.16,6.98-Math.abs(i)*.46,0,.31,.20,3.7,crumb,.45);}
  else k.box(0,4.35,0,2.26,.48,1.85,0xf0d672,.17);
}
function fruit(k,id){
  if(id==='banana'){k.ware(()=>{
    const tips=[[-4.8,.26,0],[3.4,.20,1.76],[1.72,.25,-2.69]];
    for(const [x,y,z] of tips)k.line([[0,.3,0],[x*.48,.49,z*.61],[x,y,z]],.38,0xcda449);
    k.line([[-4.65,.22,0],[-5.34,.48,0]],.20,0x776442);
  });k.line([[-5,3.3,0],[-3.8,1.82,0],[-.4,1.27,0],[2.85,2.2,0],[4.85,4.64,0]],1.10,0xecc555);k.line([[4.7,4.3,0],[5.36,5.67,0]],.40,0x827145);return;}
  if(id==='oranges'){for(let i=0;i<5;i++){const a=i*2.4;k.ball(3.02*Math.cos(a),i===4?4.7:2.71,2.94*Math.sin(a),2.28,2.27,2.3,0xe99637);}k.ware(()=>{for(let i=0;i<9;i++){const a=i*tau/9;k.line([[0,.64,0],[5.4*Math.cos(a),2.4,5.4*Math.sin(a)],[3.86*Math.cos(a+.46),5.34,3.86*Math.sin(a+.46)],[0,7.95,0]],.076,0xc69853);}});return;}
  if(id==='fruit'){k.ball(0,3.34,0,3,2.78,3,0xba4c36);k.line([[0,5.64,0],[.22,6.71,0]],.15,0x69553b);return;}
  for(let i=0;i<12;i++){const a=i*2.4,r=Math.sqrt(i)*1.86;k.box(r*Math.cos(a),1.36,r*Math.sin(a),1.98,1.64,2.1,[0xe68870,0xe0b15d,0xa1b869][i%3],a);}
}
function potatoes(k,x,z){
  for(let i=0;i<5;i++){const a=i*2.4;k.ball(x+1.7*Math.cos(a),1.48,z+1.6*Math.sin(a),1.32,.96,1.13,i%2?0xbe8e50:0xcc9d61,a);}
}
function housePlate(k,id){
  if(id==='bbq-ribs'){
    k.at(-2,.9,0,-.4,()=>{
      for(let i=0;i<5;i++){
        const u=(i-2)*1.64;
        k.ball(u,1.44,0,1.28,1.08,4.74,0x74452d,.08*i);
        k.line([[u-.19,2.3,-3.4],[u+.15,2.55,-.9],[u-.12,2.38,2.96]],.26,0x974a31);
        k.ball(u+.10,1.30,4.22,.52,.40,1.2,0xe6d2ae);
      }
    });
    k.scatter(25,5.8,1.35,-2,2.8,(x,y,z,i)=>k.box(x,y+i%3*.30,z,.26,.24,1.44,[0xb7ba7f,0xd4c49a,0xd08d52][i%3],i));return;
  }
  if(id==='cornbread'||id==='knish'){
    for(const [x,z,a] of [[-3,-1,.2],[3,1.5,-.24]])k.at(x,.74,z,a,()=>{
      k.form('baked-square',()=>outline([[-2.4,-2.4],[2.2,-2.3],[2.57,-1.83],[2.51,2.07],[2.0,2.48],[-2.2,2.41],[-2.55,1.89],[-2.60,-1.98]],2.41,.24),0,0,0,1,1,1,id==='knish'?bread:0xd9aa59);
      if(id==='knish'){k.ball(0,2.40,0,2.18,.56,2.16,0xd99950);k.line([[-1.6,2.83,-1.23],[0,2.90,.3],[1.65,2.72,1.35]],.09,toast);}
      else{k.box(.1,2.81,-.2,1.67,.29,1.39,0xf0d379,.22);}
    });return;
  }
  if(id==='pastrami'||id==='fish-sandwich'){
    const rye=id==='pastrami';
    k.at(0,.72,0,-.21,()=>{
      const slice=()=>outline([[-4.9,-3.3],[-4.6,-4.1],[.3,-4.5],[4.4,-4],[5,-3.1],[4.8,3.8],[-4.7,3.8]],.91,.18);
      for(const y of [0,4.6]){k.form('deli-slice',slice,0,y,0,1,1,1,rye?0x966b44:bread);k.form('deli-slice',slice,0,y+.19,0,.94,1,.92,rye?0xc7a276:crumb);}
      if(rye){
        for(let i=0;i<13;i++)k.ball(Math.sin(i*1.9)*.72,1.12+i*.28,Math.cos(i)*.70,4.45,.25,3.61,i%3?0xae6c63:0x8a5548,.23*Math.sin(i));
        k.line([[-3.85,4.65,2.45],[-.14,4.6,3.74],[3.32,4.61,2.41]],.18,0xc29a47);
      }else{
        k.ball(0,2.71,0,5.02,1.19,4,0xbf883f);greens(k,-1,0,3.8,3.82);
        k.scatter(8,0,4.18,0,3.47,(x,y,z)=>k.ball(x,y,z,.83,.19,.55,white));
      }
    });return;
  }
  if(id==='scallion-pancake'){
    for(let i=0;i<6;i++){
      const a=i*tau/6;k.at(4.4*Math.sin(a),.70,4.4*Math.cos(a),a,()=>{
        wedge(k,0,0,0,4.75,7.55,.62,0xd6a24e);
        k.scatter(7,0,.83,.5,1.77,(x,y,z,j)=>k.box(x,y,z,.19,.08,.55,j%2?leaf:0x859347,j));
      });
    }return;
  }
  if(id==='stir-fry'||id==='jollof'){
    ricePile(k,-4,0,4.75,.75,id==='jollof');
    if(id==='jollof'){
      k.scatter(42,-4,2.77,0,3.6,(x,y,z,i)=>k.ball(x,y,z,.37,.17,.18,i%3?0xcf8043:0xb76432,i));
      chickenPiece(k,3.81,2.36,0,2.85,0x9f612f,true);greens(k,3.44,-4.9,2.1,1.19);
    }else for(let i=0;i<15;i++){
      const a=i*2.4,x=3.7+Math.cos(a)*Math.sqrt(i)*.79,z=Math.sin(a)*Math.sqrt(i)*1.28;
      if(i%3===0){k.box(x,1.61,z,.57,1.34,.54,0x92985a);greens(k,x,z,1.03,2.29);}
      else k.line([[x-1,1.3,z-.55],[x-.3,1.89,z+.24],[x+.91,1.53,z+.67]],.31,i%3===1?tomato:0xd99649);
    }return;
  }
  if(id==='plantains'){
    for(let i=0;i<7;i++){const a=i*2.4,x=4.5*Math.cos(a),z=3.7*Math.sin(a);
      k.ball(x,1.38+i%2*.27,z,1.62,.72,2.3,0xb57b36,a);k.ball(x,1.93+i%2*.27,z,1.27,.22,1.92,0xd9ad59,a);
      k.scatter(4,x,2.17+i%2*.27,z,.83,(u,y,v,j)=>k.ball(u,y,v,.23,.07,.14,toast,j));
    }return;
  }
  if(id==='quiche'){
    wedge(k,0,.72,0,12.3,12.3,1.3,bread);wedge(k,0,1.57,0,11.7,11.8,2.78,0xe9c47b);
    k.scatter(15,0,4.45,1.61,2.95,(x,y,z,i)=>k.ball(x,y,z,.43,.15,.51,i%3?0xaa7151:leaf,i));return;
  }
  if(id==='steak-frites'){entree(k,'steak');fries(k,6,1.5,14);return;}
  if(id==='grilled-salmon'){
    const fillet=()=>outline([[-4.84,-2.77],[-3.45,-3.4],[3.7,-2.55],[5.02,-1.9],[4.23,2.67],[1.98,3.3],[-4.0,2.56]],1.95,.18);
    k.at(-2,.79,0,-.38,()=>{k.form('salmon-side',fillet,0,0,0,1,.33,1,0x716959);k.form('salmon-side',fillet,0,.43,0,1,1,1,0xe29a79);
      for(let i=-2;i<=2;i++)k.line([[i*1.52-1,2.42,-2.3],[i*1.52+.16,2.51,-.22],[i*1.52-.66,2.42,2.46]],.09,0xf6c4a0);});
    potatoes(k,5.59,1.4);wedge(k,4.67,1,-3.57,3.52,3.14,1.31,0xe3c658);return;
  }
  chickenPiece(k,-2.6,2.11,0,3.64,0xbb803e,true);potatoes(k,5.1,.35);greens(k,2,-4.66,2.5,1.27);
}
function dish(k,id,level){
  if(bowls.has(id)){bowlMeal(k,id,level);return false;}
  if(!['chips','cone','popcorn','doughnut-box','banana','oranges','chocolate'].includes(id)){
    const small=['spring-rolls','egg-roll','pie','samosa','bw-cookie','lox','bagel','butter-roll','doughnut','croissant','empanada','beef-patty','fruit'];
    k.plate(small.includes(id)?.77:1);
  }
  switch(id){
    case 'bbq-ribs':case 'cornbread':case 'knish':case 'pastrami':case 'scallion-pancake':case 'stir-fry':case 'plantains':case 'jollof':
    case 'quiche':case 'steak-frites':case 'fish-sandwich':case 'grilled-salmon':case 'chicken-potatoes':housePlate(k,id);break;
    case 'egg-roll':case 'spring-rolls':{
      const egg=id==='egg-roll',count=egg?1:level===2?3:2;
      for(let i=0;level && i<count;i++){
        const lastBite=level===1 && i===count-1;
        roll(k,(i-(egg?0:1))*3.26,1.1+i*.55-(lastBite?1.1:0),.80,-.36+i*.13,egg,lastBite?.52:1);
      }
      sauce(k,4.4,-5.2,0xb84b2d,level);return false;}
    case 'burger':case 'burger-deluxe':case 'hero':case 'bec':case 'deli-sandwich':case 'chopped-cheese':sandwich(k,id);break;
    case 'burrito':case 'gyro':case 'falafel':case 'taco':wrapped(k,id);break;
    case 'empanada':case 'beef-patty':case 'samosa':foldedPastry(k,id);break;
    case 'sushi':case 'kimbap':maki(k,id==='kimbap',level*3);return false;
    case 'pizza':case 'small-plate':pizza(k,0,0,.13,1);break;
    case 'pizza-combo':if(level) pizza(k,-3.85,0,.20,.75);if(level===2) pizza(k,3.75,0,-.19,.75);k.at(4.65,0,-7.7,0,()=>drinkModel(k,'soda-can',level));return false;
    case 'pasta':case 'pad-thai':noodleNest(k,0,0,1.0,id==='pad-thai');
      if(id==='pasta'){
        k.scatter(14,0,2.74,0,3.3,(x,y,z,i)=>k.ball(x,y+.34*Math.cos(i),z,1.27,.48,1.13,i%3?tomato:0xba5032,i));
        for(let i=0;i<3;i++)k.ball(.43*i-.55,3.42,.31*i,.52,.16,.86,leaf,i*1.8);
      }
      else{k.scatter(15,0,2.57,0,5.85,(x,y,z,i)=>k.box(x,y,z,.43,.31,1.0,i%3?crumb:leaf,i));wedge(k,6.55,.7,2,2.8,3,1.23,0x9ab456);}break;
    case 'eggs':k.ball(-2.6,1.33,0,4.6,.64,3.73,white);k.ball(-2.7,2.04,-.2,1.72,.90,1.66,0xeeb444);
      k.box(4.6,1.34,-3.2,5.29,1.32,5.25,toast,.3);k.box(4.6,2.03,-3.2,4.53,.1,4.49,crumb,.3);k.scatter(7,4.35,1.43,3.46,2.14,(x,y,z,i)=>k.box(x,y,z,1.54,1.22,1.49,0xc69656,i));break;
    case 'fries':fries(k,0,0,24);break;
    case 'bagel':case 'lox':case 'doughnut':case 'doughnut-box':case 'croissant':case 'butter-roll':case 'rye':case 'pie':case 'bw-cookie':bakery(k,id,level);return id!=='doughnut-box';
    case 'chips':{
      k.ware(()=>{
        const w=4.3,d=2.25,h=11.2;
        for(const s of [-1,1]){
          k.box(0,h*.5,s*d,2*w,h,.12,0xcca244);
          k.box(s*w,h*.5,0,.13,h,2*d,0xb58e3e);
        }
        k.box(0,.2,0,2*w,.38,2*d,0xb58e3e);k.box(0,h*.60,d+.09,6.45,3.15,.10,0xf4e6bd);
        for(let i=-2;i<=2;i++)k.box(i*.72,h*.59,d+.16,.39,1.32-.12*Math.abs(i),.045,0x9a6739);
      });
      k.scatter(14,0,level===2?11.25:6.6,0,2.87,(x,y,z,i)=>wedge(k,x,y+.42*Math.sin(i),z*.54,1.72,1.95,.26,0xddb264,i));
      return false;
    }
    case 'guacamole':
      k.scatter(13,-2,1.65,0,5.7,(x,y,z,i)=>wedge(k,x,y+(i%3)*.39,z,2.91,3.26,.25,0xddb264,i));
      sauce(k,5.0,-1,0x91aa66);k.scatter(8,5,1.93,-1,1.52,(x,y,z,i)=>k.ball(x,y,z,.30,.18,.26,i%3?leaf:tomato));break;
    case 'banana':case 'fruit':case 'cut-fruit':case 'oranges':fruit(k,id);break;
    case 'cone':k.ware(()=>k.form('cone-sleeve',()=>turned([[.04,0],[1,1],[.94,1],[.01,.05]]),0,0,0,1.55,4.15,1.55,0xe5cbaa));k.cyl(0,4.2,0,2.72,.32,7.3,0xc58c46);for(let i=1;i<6;i++)k.hoop(0,1.1+i,0,.39+i*.32,.072,0xe1b274);
      k.ball(0,8.39,0,3.15,2.70,3.13,0xf1cfab);break;
    case 'popcorn':{
      k.ware(()=>{
        k.box(0,.65,0,7.4,.20,6.4,white);
        for(const sign of [-1,1]){
          k.box(0,4.5,sign*3.15,7.4,7.8,.14,white);
          k.box(sign*3.65,4.5,0,.14,7.8,6.4,white);
          for(let i=-2;i<=2;i++)k.box(i*1.40,4.5,sign*3.24,.68,7.8,.04,tomato);
        }
      });
      k.scatter(32,0,level===1?4.4:8.15,0,3.43,(x,y,z,i)=>{
        k.ball(x,y+.33*Math.sin(i),z*.81,.72,.69,.63,i%3?0xf0db9d:white);
        k.ball(x+.31,y+.48,z*.81,.45,.36,.42,0xf5e6bb);
      });return false;
    }
    case 'chocolate':k.ware(()=>{
      k.box(0,.52,0,6.4,.1,10.9,0xbbb6ac);
      for(const side of [-1,1]){
        k.box(side*3.24,.64,.11,.49,.20,10.5,0xa25843,.03*side);
        k.box(.05,.67,side*5.43,6.4,.22,.57,0xbd7055);
      }
    });k.box(0,1.3,0,5.3,1.05,9.5,0x573c2e);for(let i=0;i<8;i++)k.box((i%2-.5)*2.64,2.02,(Math.floor(i/2)-1.5)*2.34,2.40,.53,2.05,0x77503b);break;
    case 'lunch':sandwich(k,'deli-sandwich');greens(k,6,1,2.5,1.4);break;
    case 'lunch-special':entree(k,'chicken-rice');break;
    case 'chicken-rice':case 'tso':case 'jerk':case 'oxtail':case 'pernil':case 'fried-chicken':case 'wings':case 'roast-chicken':case 'steak':case 'dinner':case 'parm':entree(k,id);break;
    default:throw Error('Missing dish geometry: '+id);
  }
  return true;
}
function drinkModel(k,id,level,mug=false){
  let [vessel,color,topping]=drinkRecipes[id];
  if(mug)vessel='china';
  const ceramic=['paper','china','demitasse','teacup'].includes(vessel),stem=['martini','coupe','wine'].includes(vessel);
  const h=id==='wine'?26:({paper:11,china:8.4,demitasse:6,teacup:6.9,can:11.7,bottle:18,pint:14,fluted:15,highball:13})[vessel]||11.8;
  const r=id==='wine'?3.65:({demitasse:3.4,teacup:4.0,martini:5.1,coupe:4.6,bottle:3.0,can:3.1})[vessel]||4.1;
  const base=stem?5:.25, height=stem?h-base:h, bottom=stem?.22:vessel==='teacup'?.5:.78;
  k.ware(()=>{
    if(stem){k.cyl(0,.22,0,2.9,3.1,.44,0xafc0bc);k.cyl(0,2.8,0,.27,.32,5.12,0xc4d1ca);}
    if(ceramic){
      k.form('cupwall'+bottom,()=>turned([[0,0],[bottom,0],[bottom+.035,.06],[1,.97],[1,1],[.935,1],[.90,.92],[bottom-.08,.09],[0,.09]]),0,base,0,r,height,r,china);
      if(vessel==='china'||vessel==='demitasse')k.hoop(r*.95,base+h*.55,0,r*.48,.38,china,0);
      if(vessel==='paper'){k.cyl(0,h*.47,0,r*.91,r*.84,h*.30,0xb99470);k.hoop(0,base+h,0,r*.98,.13,white);}
    }else if(vessel==='can'){
      const tall=level===0?h*.77:h,waist=level===0?.79:1;
      k.form('can-wall-'+level,()=>turned([[0,.01],[.88,.01],[1,.09],[waist,.50],[1,.90],[.92,.95],[.89,.98]]),0,0,0,r,tall,r,0xa54d38);
      k.cyl(0,tall*.98,0,r*.90,r*.91,.14,0xc3c4b8);k.hoop(0,tall,0,r*.93,.11,0xdbd8c8);
      k.ball(0,tall-.06,.91,.82,.10,.53,level===2?0xafafa4:0x403731);
      k.hoop(0,tall+.12,level===2?.08:-.60,.51,.14,0xdfdece,level===2?Math.PI/2:1.12);
      k.hoop(0,.35,0,r*.94,.14,0xd0cbbf);
    }else{
      // Clear blown glass is outlined by its lip, foot and a pair of narrow reflections.
      const bottle=vessel==='bottle',top=bottle?r*.38:r;
      const profile=bottle?[[.78,0],[.94,.04],[1,.10],[1,.71],[.93,.76],[.40,.86],[.38,.99],[.42,1]]:
        [[bottom,0],[bottom+.045,.06],[stem?.64:.91,.47],[.99,.96],[1,1]];
      k.glass(()=>k.form('glass-'+vessel,()=>turned(profile),0,base,0,r,height,r,id==='wine'?0x71865b:0xd2e4e2));
      if(bottle){
        if(level===2)k.cyl(0,base+height+.13,0,top*1.12,top*1.12,.58,id==='wine'?0x70363a:0xdce2d5);
        k.form('bottle-label',()=>turned([[1,.36],[1,.58]]),0,base,0,r*1.008,height,r*1.008,id==='wine'?0xe3cfaa:id==='water'?0x6b9cac:0xcaad7c);
      }
      k.hoop(0,base+.13,0,r*bottom,.12,0xc2d3cf);k.hoop(0,base+height,0,top,.11,0xc9d8d3);
      for(const a of [.45,2.90,4.84]){const pts=[[r*bottom,base+.16],[r*(stem?.64:.91),base+height*.47],[r,base+height*(bottle?.75:.96)],[top,base+height]];
        k.line(pts.map(([w,y])=>[w*Math.cos(a),y,w*Math.sin(a)]),.055,0xbacac6);}
    }
  });
  if(!level || vessel==='can')return;
  const amount=level===2?(vessel==='bottle'?.74:.90):.39,y=base+height*amount,rt=r*(bottom+(1-bottom)*amount)*.95;
  k.cyl(0,base+height*amount/2,0,rt,r*bottom*.92,height*amount,color);
  if(topping==='ice'||topping==='lime'||topping==='cinnamon'||topping==='citrus'){for(let i=0;i<3;i++){const a=i*2.2;k.box(rt*.48*Math.cos(a),y+.17,rt*.47*Math.sin(a),1.05,.45,1.06,0xd0c7ae,a);}}
  if(topping==='cinnamon')k.line([[-1.2,y+.16,0],[.8,y+.18,1.15]],.13,0x9a6945);
  if(['head','crema','foam','cream'].includes(topping)){k.cyl(0,y+.19,0,rt,rt,.36,topping==='crema'?0xb88b50:0xf2dfb8);if(topping==='cream')k.ball(0,y+.71,0,1.58,1.05,1.58,white);}
  if(['lime','citrus'].includes(topping)){k.ball(r*.75,y+.47,0,1.16,.22,1.26,topping==='lime'?leaf:0xea9c45);}
  if(topping==='olive'){k.line([[-2.9,y+.22,-.57],[3.6,y+1.4,.62]],.07,crumb);k.ball(.41,y+.93,.06,.66,.53,.49,0x889451);}
  if(topping==='straw')k.line([[1.7,base+.6,0],[2.55,h+1.75,0],[3.59,h+3.23,0]],.16,0xe9ddd2);
}
export function isServing(key){const base=portionBase(key);return base==='cup'||base==='mug'||base?.startsWith('plate-')||base?.startsWith('drink-');}
export function servingGeometry(key){
  if(cache.has(key))return cache.get(key);
  const base=portionBase(key),level=portionLevel(key),k=kitchen();let cut=false;
  if(base.startsWith('plate-'))cut=dish(k,base.slice(6),level);
  else drinkModel(k,base==='cup'||base==='mug'?'coffee':base.slice(6),level,base==='mug');
  const g=bake(k.parts,level,cut);cache.set(key,g);return g;
}
