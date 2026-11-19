import * as THREE from './vendor/three.module.min.js';
import {roomPoint,roomLocal} from './room.js';

// The stations share one vertical plane. Capture the room and its figures once
// for the whole wall, and project that view into each framed opening.
export function buildSalonMirrors(room,y,group,clip){
  const stations=room.things.filter(t=>t.shape==='stylingStation');
  if(!stations.length)return null;
  const planeA=stations[0].a-stations[0].w/2+.133, points=[], indices=[];
  for(const t of stations){
    const start=points.length/3, half=(t.d-.141)/2;
    for(const [b,up] of [[t.b-half,1.105],[t.b+half,1.105],[t.b+half,2.288],[t.b-half,2.288]]){
      const [x,z]=roomPoint(room,planeA,b);points.push(x,y+up,z);
    }
    indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setIndex(indices);
  const material=new THREE.MeshBasicMaterial({color:'#abb6b2',side:THREE.DoubleSide,fog:false});
  const texture={value:null}, project={value:new THREE.Matrix4()}, ready={value:0};
  material.customProgramCacheKey=()=>'salon-mirror-'+Boolean(clip);
  material.onBeforeCompile=shader=>{
    clip?.(shader);
    shader.uniforms.salonReflection=texture;shader.uniforms.salonProject=project;shader.uniforms.salonReady=ready;
    shader.vertexShader='varying vec4 salonUv; uniform mat4 salonProject;\n'+shader.vertexShader.replace(
      '#include <project_vertex>','#include <project_vertex>\n salonUv=salonProject*modelMatrix*vec4(transformed,1.);');
    shader.fragmentShader='varying vec4 salonUv; uniform sampler2D salonReflection; uniform float salonReady;\n'+
      shader.fragmentShader.replace('#include <opaque_fragment>',`if(salonReady>.5){
        vec3 reflection=texture2DProj(salonReflection,salonUv).rgb;
        outgoingLight=reflection*vec3(.91,.95,.93)+vec3(.022,.027,.025);
      }
      #include <opaque_fragment>`);
  };
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Styling mirrors';
  const virtual=new THREE.PerspectiveCamera(), plane=new THREE.Plane(), c=new THREE.Vector4(), q=new THREE.Vector4();
  virtual.userData.salonReflection=true;
  const eye=new THREE.Vector3(), direction=new THREE.Vector3(), up=new THREE.Vector3(), anchor=new THREE.Vector3();
  const [px,pz]=roomPoint(room,planeA,0), skew=room.skew||0;
  const normal=new THREE.Vector3(room.tx+skew*room.nx,0,room.tz+skew*room.nz).normalize();
  const bias=new THREE.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  const diffuse=new THREE.HemisphereLight(0xfff3dd,0xaaa695,2.1);
  diffuse.layers.set(1);diffuse.visible=false;group.add(diffuse);
  let target,last=-Infinity;
  mesh.onBeforeRender=(renderer,scene,camera)=>{
    if(!camera.isPerspectiveCamera || camera.userData.salonReflection || !renderer.isWebGLRenderer || renderer.xr.isPresenting)return;
    eye.setFromMatrixPosition(camera.matrixWorld);
    const local=roomLocal(room,eye.x,eye.z);
    if(local.a<=planeA+.03 || Math.abs(local.a)>room.width/2+.5 || local.b<-.9 || local.b>room.depth+.4 ||
      Math.abs(eye.y-group.matrixWorld.elements[13]-y-1.6)>1.7){ready.value=0;return;}
    const now=performance.now();if(ready.value && now-last<32)return;
    target??=new THREE.WebGLRenderTarget(512,384,{depthBuffer:true});
    anchor.set(px,y,pz).applyMatrix4(group.matrixWorld);plane.setFromNormalAndCoplanarPoint(normal,anchor);
    camera.getWorldDirection(direction).reflect(normal);
    up.setFromMatrixColumn(camera.matrixWorld,1).reflect(normal);
    virtual.position.copy(eye).addScaledVector(normal,-2*plane.distanceToPoint(eye));
    virtual.up.copy(up);virtual.lookAt(direction.add(virtual.position));virtual.updateMatrixWorld();
    virtual.layers.set(1);virtual.projectionMatrix.copy(camera.projectionMatrix);
    const projection=virtual.projectionMatrix.elements, near=camera.near, far=room.depth+room.width+7;
    projection[10]=-(far+near)/(far-near);projection[14]=-2*far*near/(far-near);
    project.value.copy(bias).multiply(virtual.projectionMatrix).multiply(virtual.matrixWorldInverse);
    // Clip at the reflecting surface so the wall behind the glass never
    // appears between the reflected eye and the chairs.
    plane.applyMatrix4(virtual.matrixWorldInverse);
    c.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
    virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();
    q.set(Math.sign(c.x),Math.sign(c.y),1,1).applyMatrix4(virtual.projectionMatrixInverse);
    c.multiplyScalar(2/c.dot(q));
    projection[2]=c.x;projection[6]=c.y;projection[10]=c.z+1;projection[14]=c.w;
    virtual.projectionMatrixInverse.copy(virtual.projectionMatrix).invert();
    const previous=renderer.getRenderTarget(), face=renderer.getActiveCubeFace(), mip=renderer.getActiveMipmapLevel();
    const xr=renderer.xr.enabled, shadows=renderer.shadowMap.autoUpdate, inside=group.userData.indoors;
    const oldInside=inside?.value, enabled=[];
    group.traverse(o=>{if(o.isMesh && !o.layers.isEnabled(1)){o.layers.enable(1);enabled.push(o);}});
    try {
      mesh.visible=false;diffuse.visible=true;if(inside)inside.value=2;
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;
      renderer.setRenderTarget(target);renderer.state.buffers.depth.setMask(true);renderer.clear();renderer.render(scene,virtual);
      texture.value=target.texture;ready.value=1;last=now;
    } finally {
      renderer.setRenderTarget(previous,face,mip);
      renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=shadows;
      if(inside)inside.value=oldInside;
      for(const o of enabled)o.layers.disable(1);
      diffuse.visible=false;mesh.visible=true;
    }
  };
  group.add(mesh);
  return ()=>{target?.dispose();material.dispose();geometry.dispose();diffuse.removeFromParent();};
}
