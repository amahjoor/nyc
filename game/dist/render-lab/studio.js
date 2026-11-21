import * as T from '../vendor/three.module.min.js';
import { installShaderChunks,shareSceneUniforms } from '../gfx-common.js';

installShaderChunks();
const V=()=>new T.Vector3();
const clamp=(n,low,high)=>Math.max(low,Math.min(high,n));
const refresh=new Set();
const manager=T.DefaultLoadingManager,previousLoad=manager.onLoad;
manager.onLoad=()=>{previousLoad?.();for(const update of refresh)update();};

export function stats(object){
  object.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(object),size=bounds.getSize(V());
  let triangles=0;
  object.traverseVisible(node=>{
    if(!node.isMesh)return;
    const geom=node.geometry,indices=geom.index?.count??geom.attributes.position?.count??0;
    triangles+=Math.floor(Math.min(indices,geom.drawRange.count)/3)*(node.isInstancedMesh?node.count:1);
  });
  return {bounds,size,triangles};
}

// One camera uses the original game units for everything from rings to buildings.
export function studio(canvas,{thumbnail=false}={}){
  const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:thumbnail});
  renderer.setPixelRatio(thumbnail?1:Math.min(devicePixelRatio,1.8));renderer.setClearColor(0,0);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,.001,1000);
  scene.add(new T.HemisphereLight(0xf1f5ef,0xadb6bd,1.52));
  const key=new T.DirectionalLight(0xffe9ce,2.0),rim=new T.DirectionalLight(0xcbdff4,1.30);
  key.position.set(-3,5,3);rim.position.set(3,3,-2);scene.add(key,rim);
  const plane=new T.PlaneGeometry(1,1);
  const grid=new T.Mesh(plane,new T.ShaderMaterial({
    transparent:true,depthWrite:false,side:T.DoubleSide,
    vertexShader:'varying vec2 pos;void main(){pos=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 pos;void main(){vec2 coord=pos*80.;vec2 d=abs(fract(coord-.5)-.5)/max(fwidth(coord),vec2(.005));float line=1.-min(min(d.x,d.y),1.);float fade=1.-smoothstep(.01,.26,length(pos));gl_FragColor=vec4(.57,.64,.59,line*fade*.16);}`
  }));
  const shadow=new T.Mesh(plane,new T.ShaderMaterial({transparent:true,depthWrite:false,
    vertexShader:'varying vec2 pos;void main(){pos=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 pos;void main(){float d=dot(pos,pos);gl_FragColor=vec4(.008,.013,.014, .62*exp(-d*14.)*(1.-smoothstep(.20,.25,d)));}'
  }));
  grid.rotation.x=shadow.rotation.x=-Math.PI/2;grid.renderOrder=-3;shadow.renderOrder=-2;scene.add(grid,shadow);
  const wireMaterial=new T.MeshBasicMaterial({color:0xb3e5be,wireframe:true,transparent:true,opacity:.72});
  const original=new Map(),target=V();
  let onChange=null,item,object,measurements,home,angle=.50,elevation=.48,distance=1,frame=0,width=0,height=0,showGrid=!thumbnail,wire=false;
  function render(){
    frame=0;if(!width||!height)return;
    camera.position.set(Math.sin(angle)*Math.cos(elevation),Math.sin(elevation),Math.cos(angle)*Math.cos(elevation)).multiplyScalar(distance).add(target);
    camera.lookAt(target);renderer.render(scene,camera);
  }
  function draw(){if(!frame&&!thumbnail)frame=requestAnimationFrame(render);}
  refresh.add(draw);
  function resize(w=canvas.clientWidth,h=canvas.clientHeight){
    if(!w||!h)return;
    if(w===width&&h===height)return;
    const prior=object?pose():null;
    width=w;height=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    if(object){reset();match(prior);}draw();
  }
  function reset(){
    if(!object)return;
    const {bounds,size}=measurements;
    const view=object.userData.inspectionView;
    if(view){
      target.fromArray(view.target);const dir=V().fromArray(view.position).sub(target);
      distance=dir.length();angle=Math.atan2(dir.x,dir.z);elevation=Math.asin(dir.y/distance);
    }else{
      bounds.getCenter(target);
      const flat=item.collection==='Prepared food';angle=flat?.27:.63;elevation=flat?.67:.34;
      const dir=new T.Vector3(Math.sin(angle)*Math.cos(elevation),Math.sin(elevation),Math.cos(angle)*Math.cos(elevation));
      const right=V().crossVectors(new T.Vector3(0,1,0),dir).normalize(),up=V().crossVectors(dir,right);
      const tan=Math.tan(camera.fov*Math.PI/360);let fit=.001;
      for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
        const p=new T.Vector3(x*size.x/2,y*size.y/2,z*size.z/2);
        fit=Math.max(fit,p.dot(dir)+Math.max(Math.abs(p.dot(up))/tan,Math.abs(p.dot(right))/(tan*camera.aspect)));
      }
      distance=fit*(thumbnail?1.04:flat?1.02:1.14);
    }
    home=distance;const scale=Math.max(...size.toArray(),.001);
    camera.near=Math.max(.00015,Math.min(distance,scale)*.004);camera.far=Math.max(distance*18,scale*16);camera.updateProjectionMatrix();draw();
  }
  function applyWire(){
    for(const [mesh,material] of original)mesh.material=material;original.clear();
    if(wire && object)object.traverse(node=>{if(node.isMesh){original.set(node,node.material);node.material=wireMaterial;}});
    draw();
  }
  function remove(){
    for(const [mesh,material] of original)mesh.material=material;original.clear();
    if(object){scene.remove(object);item.dispose?.(object);}
    object=null;item=null;grid.visible=false;shadow.visible=false;draw();
  }
  function set(entry,model){
    remove();item=entry;object=model;measurements=stats(object);
    if(measurements.bounds.isEmpty() || !measurements.size.toArray().every(Number.isFinite)){remove();throw Error('The model has no visible bounds.');}
    const {bounds,size}=measurements,center=bounds.getCenter(V()),scale=Math.max(...size.toArray(),.001);
    grid.position.set(center.x,bounds.min.y-scale*.004,center.z);grid.scale.setScalar(scale*9);
    shadow.position.copy(grid.position);shadow.position.y+=scale*.001;shadow.scale.set(Math.max(size.x,scale*.13)*1.5,Math.max(size.z,scale*.17)*1.5,1);
    grid.visible=showGrid&&entry.view!=='room';shadow.visible=entry.view!=='room';
    scene.add(object);shareSceneUniforms(object);applyWire();reset();return measurements;
  }
  function pose(){return {angle,elevation,distance,home};}
  function match(p){if(!object||!p?.home)return;angle=p.angle;elevation=p.elevation;distance=home*p.distance/p.home;draw();}
  function changed(){draw();onChange?.(pose());}
  function rotate(x,y){angle+=x;elevation=clamp(elevation+y,-1.38,1.47);changed();}
  function zoom(factor){if(!object)return;distance=clamp(distance*factor,home*.12,home*5);changed();}
  if(thumbnail)resize(320,182);
  else{
    new ResizeObserver(()=>resize()).observe(canvas);resize();
    const points=new Map();let pinch=0;
    const spread=()=>{const [a,b]=[...points.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
    canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size===2)pinch=spread();});
    canvas.addEventListener('pointermove',e=>{
      const p=points.get(e.pointerId);if(!p)return;
      const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
      if(points.size===1)rotate(-dx*.009,dy*.008);
      else if(points.size===2){const now=spread();if(now>2 && pinch>2)zoom(pinch/now);pinch=now;}
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>points.delete(e.pointerId));
    canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-160,160)*.002));},{passive:false});
    canvas.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;e.preventDefault();
      if(e.key==='Home')reset();else if(['+','=','-'].includes(e.key))zoom(e.key==='-'?1.2:1/1.2);
      else rotate(e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0,e.key==='ArrowUp'?.12:e.key==='ArrowDown'?-.12:0);
    });
  }
  return {set,remove,reset,zoom,render,pose,match,onChange(fn){onChange=fn;},wire(value){wire=value;applyWire();},
    grid(value){showGrid=value;grid.visible=value&&object&&item.view!=='room';draw();},
    // Wait for the frame to be drawn: a snapshot taken sooner sometimes has the figure missing from it.
    image(){render();renderer.getContext().finish();return canvas.toDataURL('image/webp',.86);}};
}

export function thumbnails(){
  const pictures=new Map();let renderer,pending=[],running=false;
  async function process(){
    running=true;
    while(pending.length){
      const {entry,element}=pending.shift();
      if(!element.isConnected)continue;
      try{
        if(!pictures.has(entry.id)){
          renderer??=studio(document.createElement('canvas'),{thumbnail:true});
          const model=await entry.build(entry.variants[0].id);
          renderer.set(entry,model);
          const textures=new Set();
          model.traverse(node=>{for(const mat of [node.material].flat())if(mat?.map)textures.add(mat.map);});
          for(let i=0;i<45 && [...textures].some(t=>!t.image?.width);i++)await new Promise(r=>setTimeout(r,40));
          pictures.set(entry.id,renderer.image());renderer.remove();
          if(pictures.size>160)pictures.delete(pictures.keys().next().value);
        }
        if(element.isConnected){const img=new Image();img.alt='';img.src=pictures.get(entry.id);element.append(img);}
      }catch{renderer?.remove();element.title='Preview unavailable';}
      await new Promise(r=>setTimeout(r,12));
    }
    running=false;
  }
  return rows=>{pending=rows;if(!running)void process();};
}
