// One exterior draw call per stoop. The walking surface and these solids use
// the same landing, tread depth and riser heights.
import * as THREE from './vendor/three.module.min.js';

export function buildShopSteps(stairs,ground) {
  const {half,back,landing,toe,tread,count,rise,floor,point,turn}=stairs;
  const positions=[],colors=[],barriers=[],color=new THREE.Color();
  const cube=new THREE.BoxGeometry(1,1,1).toNonIndexed();
  const pipe=new THREE.CylinderGeometry(1,1,1,10).toNonIndexed();
  const matrix=new THREE.Matrix4(), rot=new THREE.Quaternion(), up=new THREE.Vector3(0,1,0);
  const vertex=new THREE.Vector3(), scale=new THREE.Vector3();
  function draw(unit,center,size,angle,tint){
    matrix.compose(center,angle,size);color.set(tint);
    const p=unit.attributes.position;
    for(let i=0;i<p.count;i++){
      vertex.fromBufferAttribute(p,i).applyMatrix4(matrix);
      positions.push(vertex.x,vertex.y,vertex.z);colors.push(color.r,color.g,color.b);
    }
  }
  function slab(s0,s1,t0,t1,y0,y1,tint){
    draw(cube,new THREE.Vector3((t0+t1)/2,(y0+y1)/2-floor,(s0+s1)/2),
      scale.set(t1-t0,y1-y0,s1-s0),rot.identity(),tint);
  }
  let base=floor;
  for(const s of [back,landing,toe])for(const t of [-half,0,half])base=Math.min(base,ground(...point(s,t)));
  base-=.11;
  for(let i=0;i<count;i++){
    const from=i===0?back:landing+(i-1)*tread, to=landing+i*tread, top=floor-i*rise;
    slab(from,to,-half,half,base,top-.034,'#8e8982');
    slab(from,to,-half,half,top-.034,top,'#b4b0a7');
    slab(to-.045,to-.030,-half+.025,half-.025,top,top+.001,'#88877f');
  }
  function rod(s0,t0,y0,s1,t1,y1,r){
    const a=new THREE.Vector3(t0,y0-floor,s0),b=new THREE.Vector3(t1,y1-floor,s1);
    const axis=b.clone().sub(a);
    draw(pipe,a.lerp(b,.5),scale.set(r,axis.length(),r),rot.setFromUnitVectors(up,axis.normalize()),'#4a5052');
  }
  function rail(s0,t0,y0,s1,t1,y1){
    rod(s0,t0,y0,s1,t1,y1,.024);
    const [x0,z0]=point(s0,t0),[x1,z1]=point(s1,t1),length=Math.hypot(s1-s0,t1-t0);
    // Fixed rail contact also keeps feet from walking into the high side of the stoop.
    barriers.push({kind:'rail',fixed:true,x:(x0+x1)/2,z:(z0+z1)/2,tx:(x1-x0)/length,tz:(z1-z0)/length,
      half:length/2,radius:.026,y:base,height:Math.max(y0,y1)-base});
  }
  if(count>=3){
    for(const side of [-half+.055,half-.055]){
      const start=turn && side<0 ? landing+.025 : back+.08;
      const top=landing-.008, end=toe-.09, high=floor+.89, low=high-(count-1)*rise;
      if(start<top){rail(start,side,high,top,side,high);rod(start,side,floor,start,side,high,.020);}
      rail(top,side,high,end,side,low);
      const spans=Math.ceil((end-top)/1.15);
      for(let j=0;j<=spans;j++){
        const k=j/spans, s=top+(end-top)*k, y=high+(low-high)*k;
        rod(s,side,floor-rise*Math.max(0,Math.ceil((s-landing)/tread)),s,side,y,.020);
      }
    }
    if(turn){
      rail(back+.08,-half+.055,floor+.89,back+.08,half-.055,floor+.89);
      rod(back+.08,-half+.055,floor,back+.08,-half+.055,floor+.89,.020);
    }
  }
  cube.dispose();pipe.dispose();
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();g.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.83});
  const mesh=new THREE.Mesh(g,material);
  const [x,z]=point(0,0),[sx,sz]=point(1,0),[tx,tz]=point(0,1);
  mesh.matrix.makeBasis(new THREE.Vector3(tx-x,0,tz-z),up,new THREE.Vector3(sx-x,0,sz-z));
  mesh.matrix.setPosition(x,floor,z);mesh.matrixAutoUpdate=false;
  mesh.name='Shop entrance steps';mesh.receiveShadow=true;mesh.castShadow=true;
  mesh.userData.barriers=barriers;
  return mesh;
}
