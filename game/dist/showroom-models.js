// Full-size samples seen on the inspection turntable. The sales floor uses
// the same silhouettes in fewer triangles for rooms seen across the street.
import * as THREE from './vendor/three.module.min.js';
import { guitarBody } from './shop-products.js';

const finish=(color,metalness=0,roughness=.45)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
function piece(group,geometry,material,x=0,y=0,z=0){
  const part=new THREE.Mesh(geometry,material);part.position.set(x,y,z);group.add(part);return part;
}
function rod(group,start,end,radius,material,sides=12){
  const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),delta=b.clone().sub(a);
  const mesh=piece(group,new THREE.CylinderGeometry(radius,radius,delta.length(),sides),material);
  mesh.position.copy(a).lerp(b,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
}
function rounded(w,h,r,depth,bevel){
  const shape=new THREE.Shape(),x=-w/2,y=-h/2;
  shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
  shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);
  shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3,curveSegments:10});
}

function solitaire(group,color){
  const gold=finish(color,.93,.18);
  // A comfort-fit shank with a rounded inside edge and a broad polished face.
  const bandProfile=[[.0087,-.0011],[.0089,-.00145],[.0096,-.00158],[.0102,-.00131],[.0106,-.00068],
    [.0107,0],[.0106,.00068],[.0102,.00131],[.0096,.00158],[.0089,.00145],[.0087,.0011],[.00865,0],[.0087,-.0011]];
  const band=new THREE.LatheGeometry(bandProfile.map(([x,y])=>new THREE.Vector2(x,y)),96).rotateX(Math.PI/2);
  piece(group,band,gold,0,.0107);
  // Staggered crown and pavilion facets, a level table, and four tipped prongs.
  const rows=[[.00001,.0199,0],[.00335,.0230,0],[.00338,.02315,0],[.00268,.02403,Math.PI/12],[.00156,.02466,0]];
  const pos=[],colors=[],count=12,point=(row,i)=>{const [r,y,offset]=rows[row],t=i*2*Math.PI/count+offset;return [r*Math.cos(t),y,r*Math.sin(t)];};
  const shades=[0xb9d1e0,0xf1fafc,0x90a2bf,0xc1d0d3,0xe4ebf9,0xc5c3dd].map(c=>new THREE.Color(c));
  function facet(a,b,c,index){pos.push(...a,...b,...c);const tint=shades[index%shades.length];for(let i=0;i<3;i++)colors.push(tint.r,tint.g,tint.b);}
  for(let i=0;i<count;i++){
    for(let row=0;row<rows.length-1;row++){
      facet(point(row,i),point(row+1,i),point(row,i+1),i+row*2);
      facet(point(row,i+1),point(row+1,i),point(row+1,i+1),i*3+row);
    }
    facet(point(4,i),[0,rows[4][1],0],point(4,i+1),1);
  }
  const gem=new THREE.BufferGeometry();
  gem.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));gem.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));gem.computeVertexNormals();
  piece(group,gem,new THREE.MeshPhysicalMaterial({vertexColors:true,side:THREE.DoubleSide,metalness:.20,roughness:.07,clearcoat:1,ior:2.42}));
  const orbit=piece(group,new THREE.TorusGeometry(.0026,.00024,8,40),gold,0,.02215);orbit.rotation.x=Math.PI/2;
  for(let i=0;i<4;i++){
    const t=(i+.5)*Math.PI/2,dx=Math.cos(t),dz=Math.sin(t);
    rod(group,[dx*.0018,.0197,dz*.00095],[dx*.00305,.02365,dz*.00305],.00027,gold);
    piece(group,new THREE.SphereGeometry(.00036,10,8),gold,dx*.0030,.02364,dz*.0030);
  }
}

function handset(group,color){
  const frame=finish(color,.80,.24),dark=finish('#20282c',.48,.25);
  piece(group,rounded(.073,.151,.0085,.0064,.00075),frame);
  piece(group,rounded(.0715,.149,.008,.0005,.00028),dark,0,0,.0067);
  piece(group,rounded(.0718,.149,.008,.0005,.00030),finish(color,.41,.32),0,0,-.001);
  const drawing=document.createElement('canvas');drawing.width=352;drawing.height=740;const ctx=drawing.getContext('2d');
  const wash=ctx.createLinearGradient(0,0,310,700);wash.addColorStop(0,'#1a354c');wash.addColorStop(.48,'#477985');wash.addColorStop(1,'#29294c');
  ctx.fillStyle=wash;ctx.fillRect(0,0,352,740);ctx.fillStyle='#ffffff';ctx.font='55px sans-serif';ctx.fillText('9:41',28,128);
  ctx.font='18px sans-serif';ctx.fillText('Wednesday',30,164);ctx.font='bold 17px sans-serif';ctx.fillText('5G',265,35);ctx.fillRect(302,23,22,10);
  const apps=['☎','☀','♪','✉','◷','◉','▦','⌖'],swatches=['#527c68','#c38b4e','#a45963','#527c9a','#64737b','#957974','#537471','#5c6c8b'];
  apps.forEach((symbol,i)=>{const x=24+(i%4)*80,y=495+Math.floor(i/4)*80;ctx.fillStyle=swatches[i];ctx.beginPath();ctx.roundRect(x,y,59,59,14);ctx.fill();ctx.fillStyle='#fff';ctx.font='32px sans-serif';ctx.textAlign='center';ctx.fillText(symbol,x+30,y+41);});
  ctx.fillStyle='#e0e2da';ctx.fillRect(123,714,106,5);const map=new THREE.CanvasTexture(drawing);map.colorSpace=THREE.SRGBColorSpace;
  const screen=rounded(.0674,.144,.007,.00005,0),uv=screen.attributes.uv,p=screen.attributes.position;
  for(let i=0;i<uv.count;i++)uv.setXY(i,p.getX(i)/.0674+.5,p.getY(i)/.144+.5);
  piece(group,screen,new THREE.MeshBasicMaterial({map}),0,0,.00756);
  piece(group,rounded(.013,.0028,.0014,.00005,0),dark,0,.067,.00768);
  piece(group,rounded(.027,.033,.006,.0008,.001),frame,-.019,.051,-.003);
  for(const [x,y] of [[-.025,.056],[-.015,.046]]){
    piece(group,new THREE.CylinderGeometry(.0063,.0063,.0017,40).rotateX(Math.PI/2),frame,x,y,-.0048);
    piece(group,new THREE.SphereGeometry(.005,24,12).scale(1,1,.24),finish('#183a46',.55,.08),x,y,-.006);
  }
  for(const [x,y,h] of [[.037,.018,.015],[-.037,.030,.009],[-.037,.017,.009]])
    piece(group,new THREE.BoxGeometry(.0016,h,.003),frame,x,y,.003);
}

function acoustic(group,color){
  const top=finish(color,0,.34),side=finish('#6f412f',0,.35),neck=finish('#795139',0,.4),board=finish('#352b25',0,.5);
  const soundboard=top.clone();
  if(typeof Image!=='undefined'){
    const wood=new THREE.TextureLoader().load(new URL('./assets/shop-materials.jpg',import.meta.url).href);
    wood.colorSpace=THREE.SRGBColorSpace;wood.matrixAutoUpdate=false;
    wood.matrix.set(0,.94,.018, .95,0,.75, 0,0,1);
    soundboard.map=wood;soundboard.color.lerp(new THREE.Color('#fff8ee'),.50);
  }
  const brass=finish('#c7a46d',.88,.22),nickel=finish('#cbc7b9',.90,.21),ivory=finish('#e6d9ba',0,.33);
  piece(group,guitarBody(true),[soundboard,side]);
  const ring=(r,t,material,z)=>piece(group,new THREE.TorusGeometry(r,t,8,88),material,0,.30,z);
  ring(.054,.0013,ivory,.035);ring(.056,.001,board,.035);ring(.059,.0008,ivory,.035);
  piece(group,new THREE.CircleGeometry(.053,64),finish('#201811',0,.96),0,.30,-.025);
  piece(group,rounded(.050,.468,.004,.033,.003),neck,0,.613,-.003);
  piece(group,rounded(.052,.456,.002,.009,.001),board,0,.612,.032);
  piece(group,rounded(.077,.126,.012,.026,.002),top,0,.897,.003);
  piece(group,rounded(.125,.030,.006,.011,.002),board,0,.139,.034);
  piece(group,new THREE.BoxGeometry(.091,.004,.004),ivory,0,.144,.048);
  piece(group,new THREE.BoxGeometry(.054,.006,.007),ivory,0,.835,.044);
  for(let i=1;i<=20;i++){
    const y=.835-.691*(1-2**(-i/12));rod(group,[-.025,y,.043],[.025,y,.043],.00076,nickel,8);
    if([3,5,7,9,12,15].includes(i))piece(group,new THREE.CircleGeometry(.0035,16),ivory,0,y+.012,.043);
  }
  for(let i=0;i<6;i++){
    const x=(i-2.5)*.0076,h=.865+(i%3)*.035,s=i<3?-1:1;
    rod(group,[x,.139,.051],[x,.838,.049],.00030+i*.000065,brass,8);
    rod(group,[x,.838,.049],[s*.028,h,.036],.00043,brass,8);
    rod(group,[s*.027,h,.019],[s*.048,h,.019],.003,nickel,10);
    piece(group,new THREE.SphereGeometry(.0085,12,8).scale(1,.64,.56),nickel,s*.05,h,.019);
    piece(group,new THREE.SphereGeometry(.0024,10,6),ivory,x,.131,.049);
  }
}

export function showroomModel(item){
  const group=new THREE.Group();
  ({ringSample:solitaire,phone:handset,guitar:acoustic})[item.model](group,item.color);
  return group;
}

export function disposeSample(group){
  const materials=new Set();
  group.traverse(part=>{part.geometry?.dispose();if(part.material)for(const m of [].concat(part.material))materials.add(m);});
  for(const mat of materials){mat.map?.dispose();mat.dispose();}
}
