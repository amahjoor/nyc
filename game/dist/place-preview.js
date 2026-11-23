// Use the same room, counter stock, signs and sidewalk vendors used during play.
import * as T from './vendor/three.module.min.js';
import { buildRoom, planRoom, CEILING } from './interiors.js';
import { roomPoint } from './room.js';
import { frontWidth, signFor } from './places.js';
import { drawSign } from './storefronts.js';
import { STANDS, createStandMesh } from './stands.js';
import { servingFor } from './food-catalog.js';
import { servingGeometry } from './serving-models.js';
import { servingMaterial } from './food-surface.js';
import { packageGeometry, packageMaterial } from './grocery-models.js';
import { showroomModel, disposeSample } from './showroom-models.js';

function previewSign(stage,place,width,high){
  const sign=signFor(place),canvas=document.createElement('canvas');
  canvas.width=800;canvas.height=104;
  const ctx=canvas.getContext('2d');drawSign(ctx,sign,0,0,800,104);
  ctx.globalCompositeOperation='source-in';ctx.fillStyle=sign.lettering;ctx.fillRect(0,0,800,104);
  ctx.globalCompositeOperation='destination-over';ctx.fillStyle=sign.background;ctx.fillRect(0,0,800,104);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const board=new T.Mesh(new T.BoxGeometry(width,width*.13,.17),new T.MeshBasicMaterial({map:texture}));
  board.position.set(0,high,.12);stage.add(board);
  return ()=>{board.geometry.dispose();board.material.dispose();texture.dispose();};
}

export async function scenePhotos({renderer,scene,front,room,height=0},place,featured,signal){
  if(!renderer?.isWebGLRenderer || signal.aborted)return [];
  const width=420,h=248,camera=new T.PerspectiveCamera(59,width/h,.015,400);
  const target=new T.WebGLRenderTarget(width,h,{colorSpace:T.SRGBColorSpace});
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=h;
  const ctx=canvas.getContext('2d'),frame=ctx.createImageData(width,h),pixels=new Uint8Array(frame.data.length);
  const photos=[],release=[];
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  function shoot(subject,kind,caption,credit){
    const old=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
    const shadows=renderer.shadowMap.autoUpdate,xr=renderer.xr.enabled;
    try{
      renderer.shadowMap.autoUpdate=false;renderer.xr.enabled=false;
      renderer.setRenderTarget(target);renderer.clear();renderer.render(subject,camera);
      renderer.readRenderTargetPixels(target,0,0,width,h,pixels);
    }finally{
      renderer.setRenderTarget(old,face,mip);renderer.shadowMap.autoUpdate=shadows;renderer.xr.enabled=xr;
    }
    const stride=width*4;
    for(let y=0;y<h;y++)frame.data.set(pixels.subarray(y*stride,(y+1)*stride),(h-1-y)*stride);
    ctx.putImageData(frame,0,0);
    photos.push({kind,caption,credit,src:canvas.toDataURL('image/jpeg',.82)});
  }
  const staged=new T.Scene();staged.background=new T.Color(0xbbcbd0);
  staged.add(new T.HemisphereLight(0xfff6e6,0x968b81,1.65));
  const sun=new T.DirectionalLight(0xfff4db,1.8);sun.position.set(-4,7,4);staged.add(sun);
  try{
    const loaded=Boolean(front);
    if(!front){
      front={x:0,z:0,tx:1,tz:0,nx:0,nz:1,width:frontWidth(place),place};
      room=planRoom(front);
    }
    const stageBox=(w,y,d,color,x,b,z)=>{
      const mesh=new T.Mesh(new T.BoxGeometry(w,y,d),new T.MeshStandardMaterial({color,roughness:.87}));
      mesh.position.set(x,b,z);staged.add(mesh);
      release.push(()=>{mesh.geometry.dispose();mesh.material.dispose();});
    };
    if(room){
      const model=buildRoom(room,0);staged.add(model);release.push(()=>model.userData.dispose());
    }
    if(loaded){
      const distance=Math.min(11,Math.max(6,front.width*.82));
      camera.position.set(front.x+front.nx*distance,height+2,front.z+front.nz*distance);
      camera.lookAt(front.x,height+1.7,front.z);shoot(scene,'front','Street entrance','In-game photo');
    }else{
      stageBox(40,.14,19,'#adaaa1',0,-.1,0);
      const stand=STANDS[place.kind];
      if(stand){
        const kiosk=createStandMesh({scene:staged,capacity:64});kiosk.update([{...front,kind:place.kind,nz:-1}]);
        release.push(()=>kiosk.dispose());
      }else{
        if(room){
          stageBox(26,5,.6,'#827265',0,CEILING+2.5,-.28);
          for(const side of [-1,1])stageBox(9,CEILING,.6,'#827265',side*(room.width+9)/2,CEILING/2,-.28);
        }else stageBox(.16,2.5,.16,'#464e50',0,1.25,0);
        release.push(previewSign(staged,place,room?.width || 4,room?CEILING+.36:2.5));
      }
      camera.position.set(stand?1.25:1.65,stand?1.7:2.1,stand?3.8:(room?.width || 5)*.94);
      camera.lookAt(0,stand?1.2:room?2.05:2,0);
      shoot(staged,'front',stand?'Sidewalk stand':room?'Storefront':'Location sign','In-game model preview');
    }
    await nextFrame();if(signal.aborted)return [];
    if(room){
      const [x,z]=roomPoint(room,-room.width*.17,.75),[tx,tz]=roomPoint(room,.2,room.depth*.68);
      camera.position.set(x,1.55,z);camera.lookAt(tx,1.25,tz);
      shoot(staged,'inside','Inside',loaded?'In-game interior':'In-game model preview');
    }
    if(featured){
      await nextFrame();if(signal.aborted)return [];
      const key=servingFor(featured,true),product=featured.product;
      const object=product?new T.Mesh(packageGeometry(product),packageMaterial(false,product)):
        key?new T.Mesh(servingGeometry(key),servingMaterial()):showroomModel(featured);
      release.push(product || key?()=>object.material.dispose():()=>disposeSample(object));
      const table=room?.things.find(t=>t.shape==='table'),a=table?.a || 0,b=table?.b || 0;
      const [x,z]=table?roomPoint(room,a,b):[0,0];
      const bounds=new T.Box3().setFromObject(object),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
      const surface=table?table.y+table.h:1.0;
      if(!table)stageBox(1.6,.09,1.4,'#90745b',x,surface-.045,z);
      object.position.set(x-center.x,surface-bounds.min.y+.003,z-center.z);
      staged.add(object);
      const radius=Math.max(size.x,size.y,size.z,.03),aim=surface+size.y*.5;
      const tx=table?front.tx:1,tz=table?front.tz:0,nx=table?front.nx:0,nz=table?front.nz:1;
      camera.position.set(x+(.38*tx+1.16*nx)*radius,aim+radius*(key?.startsWith('plate-')?.86:.43),z+(.38*tz+1.16*nz)*radius);
      camera.lookAt(x,aim,z);shoot(staged,'product',featured.name,'In-game item');
    }else if(room?.seats?.length){
      const seat=room.seats[0],[x,z]=roomPoint(room,seat.a,seat.b);
      const [cx,cz]=roomPoint(room,seat.a*.55,Math.max(.55,seat.b-1.5));
      camera.position.set(cx,1.48,cz);camera.lookAt(x,.78,z);
      shoot(staged,'detail',place.kind==='barber'?'Barber station':'Seating','In-game interior');
    }
    return photos;
  }finally{
    for(const dispose of release.reverse())dispose();target.dispose();
  }
}
