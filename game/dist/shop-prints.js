import * as THREE from './vendor/three.module.min.js';
import {CEILING,roomPoint} from './room.js';

let photography;
function editorialTexture(){
  if(!photography)photography=new THREE.TextureLoader().load(new URL('./assets/shop-editorials.jpg',import.meta.url).href);
  photography.colorSpace=THREE.SRGBColorSpace;photography.anisotropy=4;
  return photography;
}

// Only these printed faces share this immutable, local photo texture. Frames
// and shadows come from strips of vertex colour around each print.
export function buildShopPrint(room,y){
  if(typeof Image==='undefined' || !room.finish?.portrait && !room.finish?.pharmacy)return null;
  const {width,depth}=room, handed=Math.sign(room.tx*room.nz-room.tz*room.nx)||1;
  const pharmacy=room.finish.pharmacy, island=pharmacy && room.things.find(t=>t.shape==='careShelves' && t.h<1.5 && t.face[0]===1);
  const tile=pharmacy?2:room.place.kind==='barber'?1:0, vertices=[],uv=[],frames=[],images=[],colors=[];
  function panel(print,off,lo,wide,height,gap,color,photo=false){
    const start=vertices.length/3, shade=new THREE.Color(color);
    for(const [sx,sy] of [[0,0],[1,0],[1,1],[0,1]]){
      const across=(off+(sx-.5)*wide)*handed;
      const [x,z]=print.side?roomPoint(room,print.a-gap,print.b-across):roomPoint(room,print.a+across,print.b-gap);
      vertices.push(x,lo+y+sy*height,z);colors.push(shade.r,shade.g,shade.b);
      uv.push((print.tile+.006+sx*.988)/3,.003+sy*.994);
    }
    (photo?images:frames).push(start,start+1,start+2,start,start+2,start+3);
  }
  const prints=[{tile,a:island?island.a-island.w/2:pharmacy?Math.min(width*.33,width/2-.47)*handed:0,
    b:island?island.b-island.d/2:depth,h:pharmacy?1.12:1.53,up:island?.13:pharmacy?1.08:.88}];
  const start=room.returns?.find(edge=>edge.side===1)?.length||0;
  if(!pharmacy && depth-3.18>Math.max(4,start+.82)+1.20)prints.push({tile:1-tile,a:width/2,b:depth-3.18,h:1.21,up:1.22,side:true});
  for(const print of prints){
    const {h,up}=print,w=h*.57;
    panel(print,.018,up-.026,w+.052,h+.054,.022,'#999183');
    panel(print,0,up,w+.044,h+.044,.03,'#494743');
    panel(print,0,up+.018,w+.013,h+.010,.033,'#f5eedf');
    panel(print,0,up+.040,w-.044,h-.039,.036,'#ffffff',true);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex([...frames,...images]);geo.addGroup(0,frames.length,0);geo.addGroup(frames.length,images.length,1);
  const frame=new THREE.MeshBasicMaterial({vertexColors:true,fog:false,side:THREE.DoubleSide});
  const image=new THREE.MeshBasicMaterial({map:editorialTexture(),fog:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geo,[frame,image]);mesh.name='Framed shop photograph';
  return mesh;
}

export function paintSalonWall(ctx,room){
  const barber=room.place.kind==='barber', w=room.width,f=room.finish;
  ctx.fillStyle=barber?'#ddd6c5':'#ddd3c2';ctx.fillRect(0,0,w,CEILING);
  ctx.fillStyle=barber?'#48534a':'#ad977e';ctx.fillRect(0,2.1,w,CEILING-2.1);
  for(let x=.15;x<w;x+=.67){
    ctx.strokeStyle=barber?'#627064':'#a18a6b';ctx.lineWidth=.012;ctx.strokeRect(x,2.19,.56,.65);
  }
  ctx.fillStyle='#a49a83';ctx.fillRect(0,2.075,w,.026);
  const signW=Math.min(w-.42,Math.max(2.10,w*.73)), x=(w-signW)/2;
  ctx.fillStyle=barber?'#37483e':'#e7ddca';ctx.fillRect(x,.19,signW,.49);
  ctx.save();ctx.scale(.01,.01);ctx.fillStyle=barber?'#f1e2bd':'#4d463d';
  ctx.font=barber?'600 28px Georgia':'400 34px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(f.title,w*50,44,(signW-.18)*100);ctx.restore();
  ctx.fillStyle=barber?'#ad9769':'#baa382';
  ctx.fillRect(x,.165,signW,.018);ctx.fillRect(x,.688,signW,.018);
}

export function paintServiceMenu(ctx,room,side,span){
  if(!room.finish.specials?.length || span<1.6)return;
  const salon=room.finish.portrait, light=salon && room.place.kind==='salon';
  const right=room.tx*room.nz-room.tz*room.nx>0?1:-1, start=room.depth-span;
  const actual=Math.max(start+.82,Math.min(room.depth-.83,salon?4.0:2.60)), center=side*right>0?room.depth-actual:actual-start;
  const w=Math.min(1.54,span-.05),x=Math.min(span-w,Math.max(0,center-w/2)),top=salon?.72:.40;
  ctx.fillStyle=salon?'#a3906e':'#886a47';ctx.fillRect(x,top,w,.83);
  ctx.fillStyle=light?'#eee4d1':'#313b33';ctx.fillRect(x+.025,top+.025,w-.05,.78);
  ctx.save();ctx.scale(.01,.01);ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle=light?'#4c4640':'#f7e2b0';ctx.font='italic bold 15px Georgia';
  ctx.fillText(salon?'Services':'From the grill',(x+.10)*100,(top+.17)*100,(w-.22)*100);
  ctx.font='italic 10px Georgia';ctx.fillStyle=light?'#49443e':'#fcf4dd';
  room.finish.specials.slice(0,3).forEach((item,i)=>{
    const yy=(top+.36+i*.15)*100;
    ctx.textAlign='left';ctx.fillText(item.name,(x+.10)*100,yy,(w-.50)*100);
    ctx.textAlign='right';ctx.fillText('$'+item.price.toFixed(2),(x+w-.08)*100,yy,32);
  });
  ctx.restore();
}
