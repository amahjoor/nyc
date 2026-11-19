// Printed carton faces, price rails and department headers on the actual shelf
// geometry. One texture and one draw call serve every bay in a branch.
import * as THREE from './vendor/three.module.min.js';
import {careProducts,shelfFacings} from './personal-care.js';
import {CEILING,roomPoint} from './room.js';

export function paintPrescriptionWall(ctx,room){
  const {width:w,finish:f}=room;
  ctx.fillStyle=room.wall;ctx.fillRect(0,0,w,CEILING);
  const cvs=f.title==='CVS pharmacy', dr=f.title==='Duane Reade', script=f.title==='Walgreens';
  ctx.fillStyle=dr?'#d9c9ae':'#e7e1d5';ctx.fillRect(0,.92,w,CEILING-.92);
  for(let x=.55;x<w;x+=.86){
    ctx.fillStyle=dr?'#aea38f':'#d7d0c4';ctx.fillRect(x,1.02,.012,CEILING-1.02);
  }
  ctx.fillStyle=cvs?f.ink:dr?'#194b68':'#f2eee3';ctx.fillRect(0,.16,w,.89);
  ctx.fillStyle=f.accent;ctx.fillRect(0,1.015,w,.042);
  ctx.save();ctx.scale(.01,.01);ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=cvs||dr?'#fff8eb':f.ink;
  ctx.font='600 36px Arial';ctx.fillText('Prescription pickup',w*50,73,w*89);
  ctx.font=script?'italic bold 23px Georgia':'bold 19px Arial';ctx.fillText(f.title,w*50,34,w*85);
  ctx.restore();
}

export function buildPharmacyPrint(room,y){
  if(!room.finish?.pharmacy || typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const boxes=[], labels=new Map(), rails=[];
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
  function text(str,x,y,size,font,color,max){
    ctx.fillStyle=color;ctx.textBaseline='middle';ctx.font=font+' '+size+'px Arial';ctx.fillText(str,x,y,max);
  }
  for(const [i,[name,line,ground,ink]] of careProducts.entries()){
    const x=(i%8)*127+2, y=Math.floor(i/8)*164+2,w=122,h=158;
    boxes.push([x,y,w,h]);
    rect(x,y,w,h,ground);rect(x+4,y+4,w-8,h-8,'#f7f3e8');
    rect(x+5,y+5,w-10,34,ink);
    text(name,x+10,y+21,16,'bold','#fffaf1',w-20);
    rect(x+9,y+52,w-18,35,ground);
    text(line,x+11,y+71,17,'bold',ink,w-23);
    rect(x+12,y+101,64,3,ink);rect(x+12,y+109,54,2,'#96988b');
    text('NET WT',x+12,y+137,8,'bold',ink,38);
    for(let j=0;j<13;j++)rect(x+w-38+j*2,y+126,(i+j)%3===0?1.7:.8,18,'#50514c');
    const rx=(i%5)*194+3,ry=335+Math.floor(i/5)*25,rw=187,rh=21;
    rails.push([rx,ry,rw,rh]);rect(rx,ry,rw,rh,'#d6d1bf');
    rect(rx+4,ry+1,62,rh-2,'#fffbe6');text(line,rx+6,ry+6,7,'bold','#30312e',48);
    text('$'+(3+i)+'.99',rx+6,ry+15,10,'bold','#242724',46);
  }
  const shelves=room.things.filter(t=>t.shape==='careShelves');
  for(const t of shelves){
    const title=t.more.label;if(labels.has(title))continue;
    const n=labels.size,x=n%4*255+2,y=394+Math.floor(n/4)*56,w=250,h=47;
    labels.set(title,[x,y,w,h]);rect(x,y,w,h,t.more.accent);
    text(title,x+14,y+23,28,'600','#fff9ea',w-30);
  }

  const vertices=[],uv=[],indices=[];
  const handed=Math.sign(room.tx*room.nz-room.tz*room.nx)||1;
  for(const t of shelves){
    const [fa,fb]=t.face,w=fb?t.w:t.d,d=fb?t.d:t.w;
    function face(u,v,up,wide,high,area){
      const base=vertices.length/3,[x,y0,sw,sh]=area;
      for(const [sx,sy] of [[0,0],[1,0],[1,1],[0,1]]){
        const across=u+(sx-.5)*wide*-handed;
        const [xw,zw]=roomPoint(room,t.a+fb*across+fa*v,t.b-fa*across+fb*v);
        vertices.push(xw,y+t.y+up+sy*high,zw);
        uv.push((x+1+sx*(sw-2))/1024,1-(y0+1+(1-sy)*(sh-2))/512);
      }
      indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    face(0,-d/2+.079,t.h-.176,w-.025,.163,labels.get(t.more.label));
    shelfFacings(w,d,t.h,t.more.section,(u,v,up,wide,tall,index)=>{
      face(u,v+.0545,up+.003,wide-.003,tall-.005,boxes[index]);
      face(u,d/2+.003,up-.043,wide,.034,rails[index]);
    });
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  const material=new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide,fog:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Pharmacy packaging and department signs';
  return mesh;
}
