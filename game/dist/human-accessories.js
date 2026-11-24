import * as THREE from './vendor/three.module.min.js';
import { punMode } from './business-puns.js';
import { ARCHIVE_ACCESSORIES, fitPlainJewelry } from './archive-accessories.js';

// Accessory geometry is measured in the character's fitted bind pose. Applying
// the inverse bind matrix once lets a rigid frame or strap follow its own bone.
export function fitAccessories(built,look,bones,inverses){
  const meshes=[], {rig,marks}=built;
  function attach(joint,name,geometry,options){
    const index=rig.index.get(joint);
    geometry.applyMatrix4(inverses[index]);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial(options));
    mesh.name=name; mesh.castShadow=true; bones[index].add(mesh); meshes.push(mesh);
  }
  const at=name=>new THREE.Vector3(...rig.bind[rig.index.get(name)].p);
  function tube(points,radius,closed=false){
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed),closed?32:16,radius,6,closed);
  }
  if(look.glasses && look.glasses!=='none'){
    const left=new THREE.Vector3(...marks.eye_l), right=new THREE.Vector3(...marks.eye_r);
    const gap=left.distanceTo(right), dark=['shades','aviators'].includes(look.glasses);
    const round=look.glasses==='round', w=gap*.45, h=gap*(round?.39:dark?.34:.27);
    const skin=built.pieces[0].position;
    let bridgeZ=left.z;
    for(let i=0;i<skin.length;i+=3){
      if(Math.abs(skin[i])<gap && Math.abs(skin[i+1]-left.y)<h)bridgeZ=Math.max(bridgeZ,skin[i+2]);
    }
    // Eye landmarks sit inside the socket; clear the bridge and cheekbones.
    const lensZ=bridgeZ+gap*.045;
    const frame={color:look.glasses==='aviators'?0x988657:0x292629,metalness:.45,roughness:.4};
    for(const [eye,sign] of [[left,1],[right,-1]]){
      const point=(x,y,z)=>new THREE.Vector3(eye.x+x,eye.y+y,lensZ+z);
      const rim=[];
      for(let i=0;i<24;i++){
        const a=i*Math.PI/12, c=Math.cos(a), s=Math.sin(a);
        const x=w*Math.sign(c)*Math.abs(c)**(round?1:.73);
        const y=h*Math.sign(s)*Math.abs(s)**(round?1:.73);
        rim.push(point(x,y,-x*sign*.12));
      }
      attach('Head','Glasses frame',tube(rim,.0017*gap/.06,true),frame);
      const lens=new THREE.Shape(rim.map(v=>new THREE.Vector2(v.x-eye.x,v.y-eye.y)));
      const glass=new THREE.ShapeGeometry(lens);
      glass.rotateY(sign*.12); glass.translate(eye.x,eye.y,lensZ);
      attach('Head','Glasses lens',glass,{color:dark?0x222835:0xb3d4ce,transparent:true,opacity:dark?.86:.13,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,roughness:.2});
      attach('Head','Glasses temple',tube([point(sign*w,0,-w*.12),point(sign*gap*.62,.002,-gap*.40),
        point(sign*gap*.70,.003,-gap*1.4),point(sign*gap*.68,-gap*.13,-gap*1.65)],gap*.03),frame);
    }
    const middle=left.clone().lerp(right,.5), bridge=[];middle.z=lensZ;
    for(const x of [-1,0,1]) bridge.push(middle.clone().add(new THREE.Vector3(x*(gap*.5-w),h*(x?.24:.4),gap*.065)));
    attach('Head','Glasses bridge',tube(bridge,gap*.033),frame);
  }
  if(look.beard && look.beard!=='none'){
    const skin=built.pieces[0], {position,normal,index}=skin, [cx,chinY]=marks.chin;
    const height=marks.eye_l[1]-chinY, width=Math.abs(marks.eye_l[0]-marks.eye_r[0]);
    const coords=[],normals=[],colours=[], alpha=new Float32Array(position.length/3);
    const style=look.beard;
    const ramp=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);
    // A feathered mask follows the actual face surface. Interpolate coverage
    // across triangles so jaw and lip edges remain smooth on a narrow chin.
    for(let j=0;j<position.length;j+=3){
      const u=Math.abs(position[j]-cx)/width,v=(position[j+1]-chinY)/height;
      if(v<-.14 || v>.83 || u>1.4)continue;
      const band=(low,high)=>ramp(low-.045,low+.02,v)*(1-ramp(high-.02,high+.055,v));
      const moustache=(1-ramp(.39,.59,u))*band(.36-.065*u,.455-.12*u);
      const chin=(1-ramp(.23,.42,u))*band(-.045,.21);
      const cheeks=(1-ramp(1.05,1.31,u))*band(-.08,.19+.50*Math.min(1,u));
      const lips=ramp(.15,.24,v)*(1-ramp(.36,.40,v))*(1-ramp(.37,.53,u));
      const coverage=style==='moustache'?moustache:style==='goatee'?Math.max(chin,moustache):
        style==='chinstrap'?cheeks*band(-.06,.12+.34*u):Math.max(moustache,cheeks);
      const nearChin=style==='goatee'||style==='moustache';
      const back=nearChin ? marks.chin[2]-.23*height : marks.jaw[2]-.05*width;
      alpha[j/3]=coverage*(1-lips)*ramp(back,back+.012,position[j+2]);
    }
    for(let i=0;i<index.length;i+=3){
      const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3;
      if(Math.max(alpha[a/3],alpha[b/3],alpha[c/3])<.008) continue;
      for(const j of [a,b,c]){
        const v=(position[j+1]-chinY)/height;
        const depth=height*(style==='stubble'?.003:style==='long beard'?.093:.026);
        const sag=style==='long beard'?height*.28*Math.max(0,1-v/.60):0;
        coords.push(position[j]+normal[j]*depth,position[j+1]+normal[j+1]*depth-sag,position[j+2]+normal[j+2]*depth);
        normals.push(normal[j],normal[j+1],normal[j+2]);
        const grain=.65+.35*Math.abs(Math.sin(j*8.321));colours.push(grain,grain,grain,alpha[j/3]);
      }
    }
    if(coords.length){
      const hair=new THREE.BufferGeometry();
      for(const [name,data] of [['position',coords],['normal',normals],['color',colours]])hair.setAttribute(name,new THREE.Float32BufferAttribute(data,name==='color'?4:3));
      const color=new THREE.Color(look.hair).lerp(new THREE.Color(.10,.06,.04),.12);
      attach('Head','Facial hair',hair,{color,vertexColors:true,roughness:1,transparent:true,alphaTest:.015,depthWrite:false,opacity:style==='stubble'?.52:.94});
    }
  }
  if (punMode && /backpack|rucksack/.test(look.bag)) look = {...look, bag:'backpack'};
  if (punMode && ['prism tote', 'city bag'].includes(look.bag)) look = {...look, bag:'tote'};
  if(look.bag==='nylon backpack'){
    // A small black nylon rucksack: a soft body gathered under a flap, two buckled pockets, and a triangle of enamel on the flap.
    const chest=at('spine_03'),lh=at('upperarm_l'),rh=at('upperarm_r'),s=rig.height/1.76,half=lh.distanceTo(rh)/2;
    let back=chest.z,front=chest.z;
    for(const piece of built.pieces.filter(p=>p.kind==='skin'||p.kind==='garment')){
      const p=piece.position;
      for(let i=0;i<p.length;i+=3)if(Math.abs(p[i]-chest.x)<half*.6 && Math.abs(p[i+1]-chest.y)<.14*s){back=Math.min(back,p[i+2]);front=Math.max(front,p[i+2]);}
    }
    const nylon={color:look.trimColour||0x151517,roughness:.5},leather={color:0x0c0c0d,roughness:.36},metal={color:0xc9cacc,roughness:.28,metalness:.9};
    const w=.145*s,h=.17*s,d=.075*s,centre=new THREE.Vector3(chest.x,chest.y-.035*s,back-d-.006*s);
    // A box pulled round at its corners, narrower toward the drawn top and fuller low down.
    const soft=(width,height,depth,round=.55,taper=.22)=>{
      const g=new THREE.BoxGeometry(2,2,2,6,8,5),p=g.attributes.position,v=new THREE.Vector3();
      for(let i=0;i<p.count;i++){
        v.fromBufferAttribute(p,i);const ball=v.clone().normalize().multiplyScalar(1.25);v.lerp(ball,round);
        const up=(v.y+1)/2,k=1-taper*up*up+.06*(1-up)*up*4;
        p.setXYZ(i,v.x*width*k,v.y*height,v.z*depth*k);
      }
      g.computeVertexNormals();return g;
    };
    const put=(name,geometry,x,y,z,material)=>{geometry.translate(centre.x+x,centre.y+y,centre.z+z);attach('spine_03',name,geometry,material);};
    put('Bag',soft(w,h,d),0,0,0,nylon);
    // The flap comes over the top and a third of the way down the outside.
    const flap=soft(w*.93,h*.36,d*.9,.6,-.1);flap.rotateX(.5);put('Bag flap',flap,0,h*.74,-d*.34,nylon);
    for(const side of [-1,1]){
      put('Bag pocket',soft(w*.42,h*.34,d*.42,.5,.05),side*w*.47,-h*.52,-d*.92,nylon);
      put('Bag pocket flap',soft(w*.44,h*.13,d*.3,.5,0),side*w*.47,-h*.22,-d*1.12,nylon);
      put('Bag strap',new THREE.BoxGeometry(.018*s,h*.34,.004*s),side*w*.47,-h*.3,-d*1.37,leather);
      put('Bag buckle',new THREE.BoxGeometry(.026*s,.02*s,.007*s),side*w*.47,-h*.33,-d*1.4,metal);
    }
    put('Bag strap',new THREE.BoxGeometry(.022*s,h*.62,.004*s),0,h*.38,-d*1.05,leather);
    put('Bag buckle',new THREE.BoxGeometry(.03*s,.022*s,.007*s),0,h*.12,-d*1.1,metal);
    // The plaque: a silver triangle with a black one set in it, point down.
    const triangle=(size)=>{const shape=new THREE.Shape();shape.moveTo(-size,size*.55);shape.lineTo(size,size*.55);shape.lineTo(0,-size*.75);shape.closePath();const g=new THREE.ShapeGeometry(shape);g.rotateY(Math.PI);g.rotateX(-.5);return g;};
    put('Bag plaque',triangle(.032*s),0,h*.6,-d*1.47,{...metal,side:THREE.DoubleSide});
    put('Bag plaque',triangle(.025*s),0,h*.6,-d*1.47-.0015*s,{color:0x0b0b0c,roughness:.3,side:THREE.DoubleSide});
    put('Bag handle',tube([new THREE.Vector3(-.03*s,0,0),new THREE.Vector3(-.02*s,.04*s,0),new THREE.Vector3(.02*s,.04*s,0),new THREE.Vector3(.03*s,0,0)],.006*s),0,h*1.02,d*.5,leather);
    for(const sign of [-1,1]){
      const top=lh.clone().lerp(rh,sign>0?.16:.84);top.y+=.046*s;
      const start=centre.clone().add(new THREE.Vector3(sign*w*.45,h*.82,d*.7)),end=centre.clone().add(new THREE.Vector3(sign*w*.78,-h*.8,d*.6));
      const rear=top.clone();rear.z=back+.004*s;rear.y-=.04*s;
      const chestFront=top.clone();chestFront.z=front+.01*s;chestFront.y-=.11*s;
      const lower=chestFront.clone();lower.y=end.y+.03*s;lower.x=chest.x+sign*half*.98;lower.z=(front+back)/2;
      const strap=tube([start,rear,top,chestFront,lower,end],.012*s);strap.scale(1,1,1);
      attach('spine_03','Bag strap',strap,nylon);
    }
  }else if(ARCHIVE_ACCESSORIES[look.bag]){
    // The archive collection's other bags, its hat, its necklaces and its rings (archive-accessories.js).
    const wearer = {built,look,rig,marks,attach,at,s:rig.height/1.76};
    if (!punMode || !fitPlainJewelry(look.bag, wearer)) ARCHIVE_ACCESSORIES[look.bag](wearer);
  }else if(look.bag && look.bag!=='none'){
    const chest=at('spine_03'),hip=at('pelvis'),lh=at('upperarm_l'),rh=at('upperarm_r');
    const s=rig.height/1.76, half=lh.distanceTo(rh)/2, backpack=look.bag==='backpack', tote=look.bag==='tote';
    let back=chest.z,front=chest.z;
    for(const piece of built.pieces.filter(p=>p.kind==='skin'||p.kind==='garment')){
      const p=piece.position;
      for(let i=0;i<p.length;i+=3)if(Math.abs(p[i]-chest.x)<half*.65 && Math.abs(p[i+1]-chest.y)<.13*s){
        back=Math.min(back,p[i+2]);front=Math.max(front,p[i+2]);
      }
    }
    const bag=new THREE.SphereGeometry(1,20,14), material={color:look.trimColour||0x343238,roughness:.92};
    const side=tote?1:-1;
    const center=new THREE.Vector3(backpack?chest.x:chest.x+side*(half+.03*s),backpack?chest.y:hip.y+.04*s,backpack?back-.040*s:hip.z);
    bag.scale((backpack?.145:.052)*s,(backpack?.20:.14)*s,(backpack?.09:.12)*s);bag.translate(center.x,center.y,center.z);
    attach('spine_03','Bag',bag,material);
    for(const sign of (backpack?[-1,1]:[tote?1:-1])){
      const top=lh.clone().lerp(rh,backpack?(sign>0?.15:.85):tote?.12:.1);top.y+=.046*s;
      const start=center.clone(),end=center.clone();
      if(backpack){start.x+=sign*.10*s;start.y+=.12*s;end.x+=sign*.12*s;end.y-=.13*s;}
      else {start.z-=.08*s;end.z+=.08*s;start.y+=.09*s;end.y+=.09*s;}
      const rear=top.clone(),chestFront=top.clone();rear.z=back;rear.y-=.05*s;chestFront.z=front+.009*s;chestFront.y-=.11*s;
      const lower=chestFront.clone();lower.y=end.y;lower.x=backpack?sign*half:end.x;
      attach('spine_03','Bag strap',tube([start,rear,top,chestFront,lower,end],(backpack?.013:.009)*s),material);
    }
  }
  return meshes;
}
