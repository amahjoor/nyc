import { atmGlass } from './atm.js';
// The lobby, fittings and signs share one draw call. Atlas coordinates below
// are in pixels and the geometry is in metres in the storefront's local frame.
import * as THREE from './vendor/three.module.min.js';
import { CEILING, roomPoint } from './room.js';
import { drawBankName } from './bank.js';

const size = 1024;
const leaf = [4,812,180,200], literature = [192,812,169,199];
const wood = [4,4,378,378], stone = [389,4,378,378], mat = [780,8,235,176];
const carpet = [780,282,225,80];
const header = [780,200,235,59], white = [800,370,8,8];
const sign = [4,392,1016,150], display = [4,554,363,236], print = [378,554,636,424];
let surfaces;

function loadSurfaces() {
  if (!surfaces) surfaces = new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = new URL('./assets/bank-surfaces.jpg', import.meta.url).href;
  });
  return surfaces;
}

function bankAtlas(ctx, identity) {
  const fill = (rect,color) => { ctx.fillStyle=color; ctx.fillRect(...rect); };
  fill(white,'#ffffff'); fill(wood,'#b18c69'); fill(stone,'#c8c1b7'); fill(print,'#9faaa7');
  const greens=ctx.createLinearGradient(leaf[0],0,leaf[0]+leaf[2],0);
  greens.addColorStop(0,'#a0ae60'); greens.addColorStop(.10,'#537c4e');
  greens.addColorStop(.49,'#6e955e'); greens.addColorStop(.52,'#456e50'); greens.addColorStop(1,'#a5af65');
  fill(leaf,greens);
  for(let j=0;j<leaf[3];j+=7) for(let i=3;i<leaf[2]-10;i+=17) {
    ctx.fillStyle='rgba(47,77,50,.25)';
    ctx.fillRect(leaf[0]+i,leaf[1]+j+2*Math.sin(j+i*.031),11,2);
  }
  fill(mat,'#444746');
  for (let i=4;i<mat[3]-3;i+=4) {
    ctx.fillStyle='#686b66'; ctx.fillRect(mat[0]+3,mat[1]+i,mat[2]-6,1);
  }
  fill(carpet,'#a7a095');
  for(let j=0;j<carpet[3];j+=2) for(let i=0;i<carpet[2];i+=4) {
    ctx.fillStyle=(i+j)%3 ? '#979085' : '#b4ab9c';
    ctx.fillRect(carpet[0]+i+(j%4)/2,carpet[1]+j,2,1);
  }
  drawBankName(ctx,identity,...sign,'#e9e3d8');

  const [x,y,w,h]=display;
  const grad=ctx.createLinearGradient(x,y,x+w,y+h);
  grad.addColorStop(0,'#173443'); grad.addColorStop(1,identity.ink);
  fill(display,grad);
  ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillStyle='#f2f5f2'; ctx.font='600 14px Arial'; ctx.fillText(identity.title,x+22,y+27);
  ctx.fillStyle='#8fc2d0'; ctx.fillRect(x+22,y+59,w-44,1);
  ctx.fillStyle='#fff'; ctx.font='500 38px Arial'; ctx.fillText('Welcome',x+20,y+108);
  ctx.fillStyle='#e6eae5'; ctx.font='18px Arial'; ctx.fillText('Insert or tap your card',x+22,y+151);
  ctx.fillStyle='#91c7c5'; ctx.fillRect(x+22,y+h-25,40,3);
  // The writing ledge has printed account guides in wall-mounted pockets.
  const [bx,by,bw,bh]=literature;
  fill(literature,'#eeeae1');
  ctx.fillStyle=identity.ink; ctx.fillRect(bx,by,bw,59);
  ctx.fillStyle='#ffffff'; ctx.font='500 17px Arial'; ctx.textAlign='left';
  ctx.fillText('Personal banking',bx+12,by+30);
  const headings=['Checking','Savings','Home loans'];
  for(let i=0;i<3;i++){
    const px=bx+10+i*51, py=by+77;
    ctx.fillStyle='#b6b6af'; ctx.fillRect(px+2,py+3,45,95);
    ctx.fillStyle=i===1?'#ece2d1':'#fffefa'; ctx.fillRect(px,py,45,94);
    ctx.fillStyle=[identity.ink,'#736853',identity.accent][i]; ctx.fillRect(px,py,45,47);
    ctx.fillStyle='#fff'; ctx.font='600 7px Arial';ctx.fillText(headings[i],px+3,py+29);
    ctx.fillStyle='#a3a7a0';for(let k=0;k<3;k++)ctx.fillRect(px+5,py+58+6*k,30-4*k,1);
  }
  ctx.fillStyle='rgba(171,184,184,.60)';ctx.fillRect(bx+5,by+150,bw-10,23);
  ctx.fillStyle='#b1aaa0';ctx.fillRect(bx+5,by+173,bw-10,3);
  fill(header,identity.ink); ctx.fillStyle='#fff'; ctx.font='600 33px Arial';
  ctx.textAlign='center'; ctx.fillText('ATM',header[0]+header[2]/2,header[1]+header[3]/2);
}

export function buildBankFinish(room,y) {
  const canvas=document.createElement('canvas');
  canvas.width=size; canvas.height=size;
  const ctx=canvas.getContext('2d');
  if (!ctx) return null;
  bankAtlas(ctx,room.finish.bank);
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace; map.anisotropy=4;
  if (typeof Image !== 'undefined') {
    let alive=true;
    map.addEventListener('dispose',()=>{ alive=false; });
    loadSurfaces().then(image=>{
      if (!alive || !image) return;
      ctx.drawImage(image,0,0,384,384,...wood);
      ctx.drawImage(image,384,0,384,384,...stone);
      ctx.drawImage(image,768,0,576,384,...print);
      map.needsUpdate=true;
    });
  }

  const positions=[], colors=[], uv=[], indices=[], tint=new THREE.Color();
  const {width,depth}=room, half=width/2, handed=room.tx*room.nz-room.tz*room.nx>0?1:-1;
  const solids=room.things.filter(t=>t.solid && t.y<.08);
  function floorLight(a,b) {
    let distance=Math.min(half-Math.abs(a),depth-b)+.12;
    for (const t of solids) {
      const x=Math.max(0,Math.abs(t.a-a)-t.w/2), z=Math.max(0,Math.abs(t.b-b)-t.d/2);
      distance=Math.min(distance,Math.hypot(x,z));
    }
    return .75+.25*Math.min(1,distance/.32);
  }
  // Points run from the lower left around the visible face. floorLight is
  // sampled at tile vertices so shadows sit where the fixtures actually fit.
  function quad(points,area,color='#ffffff',floor=false) {
    const start=positions.length/3;
    const [u,v,w,h]=area;
    for(let i=0;i<4;i++){
      const [a,b,up]=points[i], [x,z]=roomPoint(room,a,b);
      positions.push(x,y+up,z);
      uv.push((u+(i===1||i===2?w-.7:.7))/size,1-(v+(i<2?h-.7:.7))/size);
      tint.set(color);
      const light=floor?floorLight(a,b):1;
      colors.push(tint.r*light,tint.g*light,tint.b*light);
    }
    indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  const flat=(a0,a1,b0,b1,up,rect,color,shadow)=>quad([[a0,b0,up],[a1,b0,up],[a1,b1,up],[a0,b1,up]],rect,color,shadow);
  const back=(left,right,b,lo,hi,rect,color)=>quad([[left*handed,b,lo],[right*handed,b,lo],[right*handed,b,hi],[left*handed,b,hi]],rect,color);
  function sideWall(side,b0,b1,lo,hi,inset,rect,color) {
    const a=side*(half-inset), [l,r]=side*handed>0?[b1,b0]:[b0,b1];
    quad([[a,l,lo],[a,r,lo],[a,r,hi],[a,l,hi]],rect,color);
  }

  const cols=Math.ceil(width/.82), rows=Math.ceil(depth/.82), tileW=width/cols, tileD=depth/rows;
  for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
    const a=-half+col*tileW, b=row*tileD, hash=(row*31+col*23)%97;
    const offsetX=stone[0]+(hash*13)%141, offsetY=stone[1]+(hash*7)%141;
    for(let i=0;i<2;i++) for(let j=0;j<2;j++) {
      const left=a+tileW*i/2+(i?0:.005), right=a+tileW*(i+1)/2-(i?.005:0);
      const near=b+tileD*j/2+(j?0:.005), far=b+tileD*(j+1)/2-(j?.005:0);
      flat(left,right,near,far,.034,[offsetX+i*116,offsetY+(1-j)*116,116,116],'#f9f8f4',true);
    }
  }
  flat(-.69,.69,.09,Math.min(1.10,depth*.24),.038,mat);
  const desk=room.things.find(t=>t.shape==='branchDesk');
  if(desk) {
    const left=-half+.09, right=desk.a+1.38, near=desk.b-1.08, far=desk.b+1.08;
    for(let row=0;row<4;row++) for(let col=0;col<5;col++) {
      flat(left+(right-left)*col/5,left+(right-left)*(col+1)/5,
        near+(far-near)*row/4,near+(far-near)*(row+1)/4,.041,carpet,(col+row)%2?'#f5f2ec':'#fffffc',true);
    }
  }
  // A central plaster pier carries the lettering. Narrow walnut leaves at
  // either end return into the wall with dark reveals between the panels.
  const pier=Math.min(width*.55,3.85);
  back(-half,half,depth-.012,0,CEILING,white,'#67594b');
  for (const direction of [-1,1]) {
    const span=half-pier/2, count=Math.ceil(span/.66);
    for(let i=0;i<count;i++){
      const x=pier/2+i*span/count+.009, edge=pier/2+(i+1)*span/count-.009;
      back(direction>0?x:-edge,direction>0?edge:-x,depth-.021,.11,CEILING-.085,
        [wood[0]+i*12,wood[1],wood[2]*.68,wood[3]]);
    }
  }
  back(-pier/2,pier/2,depth-.036,.1,CEILING-.079,white,'#e9e3d8');
  const signW=pier*.92, signH=signW*sign[3]/sign[2];
  back(-signW/2,signW/2,depth-.04,2.12-signH/2,2.12+signH/2,sign);
  back(-half,half,depth-.044,.03,.115,white,'#817d75');

  const writingDesk=room.things.find(t=>t.shape==='writingDesk');
  const machines=room.things.filter(t=>t.shape==='branchATM');
  for(const side of [-1,1]){
    const start=Math.max(.07,room.returns?.find(e=>e.side===side)?.length||0);
    if(depth-start<.06) continue;
    sideWall(side,start,depth,.035,.147,.012,white,'#989086');
    if(side===-1 && machines.length) {
      const from=Math.max(start,machines[0].b-machines[0].d/2-.21);
      const to=machines.at(-1).b+machines.at(-1).d/2+.22;
      if(to-from>.36) {
        sideWall(side,from,to,.14,2.22,.019,white,'#a9a9a0');
        sideWall(side,from+.015,to-.015,.15,2.19,.024,white,'#bfc0b9');
        sideWall(side,from+.06,to-.06,2.14,2.16,.032,white,'#fff0c8');
      }
    }
    if(side===1 && writingDesk && writingDesk.b-.815>=start) {
      const b=writingDesk.b;
      // Timber backing and metal reveals tie the form ledge and literature
      // rack together, all on the opaque part of the wall.
      for(let i=0;i<3;i++) {
        const a=b-.815+i*.545;
        sideWall(side,a,a+.538,.151,2.48,.017,[wood[0]+i*30,wood[1],208,wood[3]],'#f0e7da');
      }
      sideWall(side,b-.417,b+.417,1.21,2.231,.028,white,'#554f46');
      sideWall(side,b-.402,b+.402,1.228,2.214,.033,literature);
    }
    const artSide=desk ? -1 : 1;
    if(side!==artSide || depth-start<1.72) continue;
    const artEnd=side===1 && writingDesk ? writingDesk.b-.90 : depth;
    const length=Math.min(2.08,artEnd-start-.52);
    if(length<1) continue;
    const center=Math.max(start+length/2+.22,Math.min(artEnd-length/2-.25,desk ? desk.b+.48 : 2.83));
    const height=length*.67, lo=1.54-height*.43;
    // A narrow metal frame, an ivory mount and a monochrome local print.
    sideWall(side,center-length/2+.018,center+length/2+.018,lo-.032,lo+height-.032,.014,white,'#9c9589');
    sideWall(side,center-length/2,center+length/2,lo,lo+height,.031,white,'#403e39');
    sideWall(side,center-length/2+.024,center+length/2-.024,lo+.024,lo+height-.024,.034,white,'#f2eee5');
    const pad=Math.min(.095,length*.06);
    sideWall(side,center-length/2+pad,center+length/2-pad,lo+pad,lo+height-pad,.037,print);
  }

  for(const t of room.things) {
    const [fa,fb]=t.face||[0,-1], w=fb?t.w:t.d, d=fb?t.d:t.w;
    function face(u0,u1,v,lo,hi,rect,color) {
      const point=(u,up)=>[t.a-fb*u*handed+fa*v,t.b+fa*u*handed+fb*v,t.y+up];
      quad([point(u0,lo),point(u1,lo),point(u1,hi),point(u0,hi)],rect,color);
    }
    if(t.shape==='branchPlant') {
      // Upright folded blades splay from the soil, each with its own tip.
      for(let i=0;i<16;i++) {
        const angle=i*2.40, ca=Math.cos(angle), sa=Math.sin(angle);
        const height=t.h*(.36+.31*((i*7)%16)/15), lean=t.w*(.17+.30*((i*5)%16)/15);
        const blade=(v,u)=>{
          const r=.043+lean*v*v, spread=.038*(.35+.65*Math.sin(Math.PI*v))*(v===1?.035:1);
          return [t.a+r*ca-spread*u*sa,t.b+r*sa+spread*u*ca,t.h*.32+v*height];
        };
        for(let j=0;j<4;j++) {
          const v=j/4, end=(j+1)/4;
          quad([blade(v,-1),blade(v,1),blade(end,1),blade(end,-1)],
            [leaf[0],leaf[1]+(1-end)*leaf[3],leaf[2],leaf[3]/4]);
        }
      }
    } else if(t.shape==='tellerPod') {
      const count=3, leaf=(w-.08)/count;
      for(let i=0;i<count;i++) face(-w/2+.045+i*leaf,-w/2+.04+(i+1)*leaf,d/2-.029,.115,t.h-.085,
        [wood[0]+i*46,wood[1]+8,174,358],'#eee6db');
    } else if(t.shape==='branchATM') {
      const glass=atmGlass(t.shape,w,d,t.h);
      face(-glass.width/2,glass.width/2,glass.depth,glass.bottom,glass.bottom+glass.height,display);
      face(-w*.43,w*.43,d/2-.002,t.h-.208,t.h-.039,header);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  const material=new THREE.MeshBasicMaterial({map,vertexColors:true,side:THREE.DoubleSide,fog:false});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Branch materials and lettering';
  return mesh;
}
