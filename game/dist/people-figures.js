// Instanced textured people. Each cast member owns a fitted skeleton, a pose
// sheet and two meshes over the same atlas. Only the outfit and pose vary per instance.
import * as THREE from './vendor/three.module.min.js';
import { sheetRows, streetBones, writeSkinRow } from './human-crowd.js';
import { fitPrepHands } from './prep-motion.js';
import { fitFallPose } from './fall-pose.js';
import { carryPose,fitPose } from './body-motion.js';
import { carriedItems } from './carried-items.js';
import { picture, CLOTH_DYE } from './human-mesh.js';

const SKIN = `
attribute vec3 aAnim;
attribute vec4 skinIndex, skinWeight;
uniform sampler2D uNycPoses,uNycFalls;
vec4 nycTexel(ivec2 p, bool live) {
  return live ? texelFetch(uNycFalls,p,0) : texelFetch(uNycPoses,p,0);
}
mat4 nycBone(float bone, float row) {
  bool live=row<0.;
  ivec2 p=ivec2(int(bone)*3,int(live?-row-1.:row));
  vec4 a=nycTexel(p,live), b=nycTexel(p+ivec2(1,0),live), c=nycTexel(p+ivec2(2,0),live);
  return mat4(a.x,b.x,c.x,0., a.y,b.y,c.y,0., a.z,b.z,c.z,0., a.w,b.w,c.w,1.);
}
mat4 nycFrame(float row) {
  return nycBone(skinIndex.x,row)*skinWeight.x + nycBone(skinIndex.y,row)*skinWeight.y +
         nycBone(skinIndex.z,row)*skinWeight.z + nycBone(skinIndex.w,row)*skinWeight.w;
}
mat4 nycSkin;
`;
// Keep each source image in one sampler even when a shirt, lining and
// collar share it. Both LODs use the same material and per-instance dyes.
function wardrobeMaps(layers) {
  const maps=[], normals=[], dyes=[], bases=[];
  function sampler(list,texture) {
    if (!texture) return -1;
    const i=list.indexOf(texture);
    return i<0 ? list.push(texture)-1 : i;
  }
  const surfaces=layers.map(layer=>{
    const fixed=new THREE.Color(layer.colour ?? 0xffffff), base=new THREE.Color(layer.dyeBase ?? 0xffffff);
    dyes.push(new THREE.Vector4(fixed.r,fixed.g,fixed.b,{top:1,bottom:2,fixed:3}[layer.tint] || 0));
    bases.push(new THREE.Vector4(layer.dyeBase ? base.r : -1,base.g,base.b,1/Math.max(.02,layer.shade ?? .2)));
    return {map:sampler(maps,picture(layer.map)),normal:sampler(normals,picture(layer.normalMap,{colour:false})),roughness:layer.roughness};
  });
  return {maps,normals,dyes,bases,surfaces};
}

function skinMaterial(material, poses, falls, colour, wardrobe) {
  const {maps,normals,dyes,bases,surfaces}=wardrobe;
  // Shader structure depends on which pieces share samplers. The actual
  // textures, base cloth colours and chosen dyes are material uniforms.
  const programKey=colour?'street-wear/'+JSON.stringify(surfaces):'street-depth';
  material.customProgramCacheKey=()=>programKey;
  material.onBeforeCompile = shader => {
    shader.uniforms.uNycFalls = {value:falls};
    shader.uniforms.uNycPoses = {value:poses};
    const sample = 'nycSkin = nycFrame(aAnim.x)*(1.-aAnim.z) + nycFrame(aAnim.y)*aAnim.z;';
    let vertex = SKIN+'attribute float cloth; flat varying int vLayer;\n';
    let fragment = 'flat varying int vLayer;\n';
    let assign = 'vLayer=int(cloth);';
    let diffuse = 'if(vLayer==0){\n#include <map_fragment>\n}';
    if (colour) {
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n'+sample+'objectNormal = mat3(nycSkin)*objectNormal;');
      if(surfaces.length){
        vertex += `attribute vec3 aTop,aBottom; uniform vec4 uDyes[${surfaces.length}], uBases[${surfaces.length}];
          flat varying vec4 vDye, vBase;\n`;
        fragment += CLOTH_DYE+'\nflat varying vec4 vDye, vBase;\n';
        assign += `if(vLayer>0){
          vec4 treatment=uDyes[vLayer-1];
          vBase=uBases[vLayer-1];
          vDye=vec4(treatment.w==1.?aTop:(treatment.w==2.?aBottom:treatment.rgb),treatment.w);
        }`;
        shader.uniforms.uDyes={value:dyes}; shader.uniforms.uBases={value:bases};
        maps.forEach((map,i)=>{
          fragment+='uniform sampler2D uWear'+i+';\n';
          shader.uniforms['uWear'+i]={value:map};
        });
        diffuse='float fabricRoughness=roughness;\n'+diffuse;
        surfaces.forEach((s,i)=>{
          diffuse+=` else if(vLayer==${i+1}){
            vec3 clothColour=texture2D(uWear${s.map},vMapUv).rgb;
            diffuseColor.rgb *= vDye.w>0.?dyeCloth(clothColour,vDye.rgb,vBase):clothColour;
            fabricRoughness=${s.roughness};
          }`;
        });
        shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=fabricRoughness;');
        // Three supplies the tangent frame from the skinned surface and its
        // original garment UVs. The first normal sampler is the standard one.
        normals.slice(1).forEach((normal,i)=>{
          fragment+='uniform sampler2D uNormal'+(i+1)+';\n';
          shader.uniforms['uNormal'+(i+1)]={value:normal};
        });
        const perturb=surfaces.flatMap((s,i)=>s.normal<0 ? [] : [
          `if(vLayer==${i+1}){normal=normalize(tbn*(texture2D(${s.normal===0?'normalMap':'uNormal'+s.normal},vNormalMapUv).xyz*2.-1.));}`
        ]).join(' else ');
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',perturb);
      }
    } else assign+=sample;
    // Wardrobe pieces here are opaque. Cutout hair and brows still use the
    // personal atlas in both the colour and the shadow pass.
    shader.vertexShader=vertex+shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n'+assign+'transformed=(nycSkin*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=fragment+shader.fragmentShader.replace('#include <map_fragment>',diffuse);
  };
  return material;
}

function makeBatch(data, compact, material, depth, capacity) {
  const geometry = new THREE.BufferGeometry();
  for (const [key,size] of Object.entries({position:3,normal:3,uv:2,cloth:1,skinIndex:4,skinWeight:4})) {
    const array = key === 'skinIndex' ? data[key].map(i=>compact[i]) : data[key];
    geometry.setAttribute(key,new THREE.BufferAttribute(array,size));
  }
  geometry.setIndex(new THREE.BufferAttribute(data.index,1));
  const instance = name => {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name,attr); return attr;
  };
  const mesh = new THREE.InstancedMesh(geometry,material,capacity);
  mesh.count=0; mesh.frustumCulled=false; mesh.castShadow=true; mesh.receiveShadow=true; mesh.customDepthMaterial=depth;
  // The batch itself never moves, only the people in it: its own matrix need not be worked out again each frame.
  mesh.matrixAutoUpdate=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return {mesh,anim:instance('aAnim'),top:instance('aTop'),bottom:instance('aBottom')};
}

// Beyond DISTANT metres somebody is drawn from their coarsest mesh. Beyond UNSEEN_BEYOND, somebody out of the picture
// is not drawn at all, unless within SHADOW_REACH metres of its edge.
const DISTANT=60, UNSEEN_BEYOND=20, SHADOW_REACH=10;
// Within NEAR metres somebody is drawn from their finest mesh, twenty-five thousand triangles; past it from one of a fifth
// as many, whose corners are a pixel or two out at that distance.
const NEAR=22;
export function createFigures({motion, grow, capacity=320, scene=null, layer=0, layers=[layer]}={}) {
  const {rows} = sheetRows(motion), {compact,kept} = streetBones(motion.bones);
  // Live rows fit active falls and workers in contact with a fixture.
  const stride=kept.length*12, pixels=new Uint16Array(capacity*stride);
  const falls=new THREE.DataTexture(pixels,kept.length*3,capacity,THREE.RGBAFormat,THREE.HalfFloatType);
  falls.needsUpdate=true;
  let fallCount=0;
  const fallSample=motion.newPose(),fitted={q:[],pelvis:[0,0,0]},world=[];
  const group = new THREE.Group(), types = new Map(), props = carriedItems(capacity);
  group.matrixAutoUpdate=false;
  group.name='People'; group.add(props.group); props.group.traverse(part=>layers.forEach(l=>part.layers.enable(l))); scene?.add(group);
  const queue = new Map();
  let loading=0, disposed=false;
  function pump() {
    if (disposed || loading>=3 || !queue.size) return;
    let member, nearest=Infinity;
    for (const [id,distance] of queue) if (member==null || distance<nearest) {member=id; nearest=distance;}
    queue.delete(member); loading++;
    grow.member(member).then(data=>{
      if (disposed) {data.atlas.close(); return;}
      const map=new THREE.Texture(data.atlas); map.flipY=false; map.colorSpace=THREE.SRGBColorSpace; map.needsUpdate=true;
      const poses=new THREE.DataTexture(data.poses,data.wide,data.frames,THREE.RGBAFormat,THREE.HalfFloatType);
      poses.needsUpdate=true;
      const options={map,alphaTest:.35,side:THREE.DoubleSide};
      const wardrobe=wardrobeMaps(data.wardrobe || []);
      const material=skinMaterial(new THREE.MeshStandardMaterial({...options,normalMap:wardrobe.normals[0] || null,roughness:.82}),poses,falls,true,wardrobe);
      const depth=skinMaterial(new THREE.MeshDepthMaterial({...options,depthPacking:THREE.RGBADepthPacking}),poses,falls,false,wardrobe);
      const batch = data => {
        const to=makeBatch(data,compact,material,depth,capacity);
        to.mesh.name='Person '+member; layers.forEach(l=>to.mesh.layers.enable(l)); group.add(to.mesh); return to;
      };
      // The mesh for somebody down the block throws no shadow: it would be a smudge, and it is most of the crowd.
      const distant=data.distant?batch(data.distant):null;
      if(distant)distant.mesh.castShadow=false;
      types.set(member,{near:batch(data.near),far:batch(data.far),distant,height:data.height,rig:data.rig?{...data.rig,index:motion.index}:null,palms:data.palms,shears:data.shears,map,poses,material,depth});
    }).catch(error=>{
      if (!disposed) {types.set(member,{retry:performance.now()+15000}); console.warn('Could not load a street figure',member,error);}
    }).finally(()=>{loading--;pump();});
  }
  function ask(member,distance=Infinity) {
    const entry=types.get(member);
    if (entry?.near) return true;
    if (!types.has(member) || entry?.retry<=performance.now()) {types.set(member,null);queue.set(member,distance);}
    else if (queue.has(member)) queue.set(member,Math.min(distance,queue.get(member)));
    pump(); return false;
  }
  const frame = (row,time) => {
    const n=(time||0)/row.seconds*(row.loop ? row.count : row.count-1);
    return row.loop ? ((n%row.count)+row.count)%row.count : Math.max(0,Math.min(row.count-1,n));
  };
  const rowFor=(clip,carry)=>rows.get(carryPose(carry)+'/'+clip) || (carry==='fork' && rows.get('cup/'+clip)) || rows.get(clip) || rows.get('idle');
  function frames(clip,time,from,fromTime,fade,carry) {
    const row=rowFor(clip,carry), f=frame(row,time), first=Math.floor(f);
    if (from && fade>0) {
      const old=rowFor(from,carry);
      return [row.first+first,old.first+Math.floor(frame(old,fromTime)),fade];
    }
    return [row.first+first,row.first+(row.loop ? (first+1)%row.count : Math.min(row.count-1,first+1)),f-first];
  }
  const point=new THREE.Vector3(), matrix=new THREE.Matrix4(), colour=new THREE.Color(), size=new THREE.Vector3();
  // The meshes somebody has, finest first: the third, for the far end of the block, is missing from an older figure.
  const levels=entry=>entry.distant?[entry.near,entry.far,entry.distant]:[entry.near,entry.far];
  const frustum=new THREE.Frustum(), projection=new THREE.Matrix4(), inverse=new THREE.Matrix4(), around=new THREE.Sphere();
  let sight=null, tick=0;
  // Retain the submitted skin row for the one person the player is reaching for.
  let tracked=null, submitted=null;
  const ready=[];
  const KEPT=320;
  const toolFrame=new THREE.Quaternion(),toolNext=new THREE.Quaternion(),toolUp=new THREE.Vector3(0,1,0);
  function palmAt(entry,[a,b,t],matrix) {
    const axis=i=>entry.palms[a*3+i]*(1-t)+entry.palms[b*3+i]*t;
    return point.set(axis(0),axis(1),axis(2)).applyMatrix4(matrix);
  }
  function transform(entry,x,y,z,heading,height) {
    const scale=(height||entry.height)/entry.height;
    return matrix.makeRotationY(heading).scale(size.setScalar(scale)).setPosition(x,y,z);
  }
  return {
    group,types,rows,ask,seconds:clip=>rowFor(clip).seconds,
    ready:id=>Boolean(types.get(id)?.near),
    get anyReady(){for(const entry of types.values()) if(entry?.near)return true; return false;},
    begin(){fallCount=0;props.begin();ready.length=0;for(const [id,entry] of types) if(entry?.near)ready.push(id);for(const entry of types.values()) if(entry?.near) for(const to of levels(entry)) to.mesh.count=0;},
    /**
     * Say where the street is being seen from: `camera` is a three.js camera whose world matrix is up to date, or
     * null. With one, somebody more than UNSEEN_BEYOND metres off who is not in the picture, nor near enough to its
     * edge for their shadow to fall into it, is not drawn. Without one, everybody is.
     */
    look(camera){
      if(!camera){sight=null;return;}
      sight=frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,inverse.copy(camera.matrixWorld).invert()));
    },
    trackContact(actor) {
      if (tracked!==actor) submitted=null;
      tracked=actor;
    },
    contactJoint(actor,name,out) {
      if (!submitted || actor!==tracked || submitted.tick!==tick-1) return false;
      const {entry,to,at}=submitted, i=entry.rig?.index.get(name);
      if (i==null) return false;
      const [x,y,z]=entry.rig.bind[i].p;
      // Decode the exact two skin matrices and interpolation used by the shader,
      // including dynamically fitted rows for falling characters.
      const coord=(row,axis)=>{
        const data=row<0 ? pixels : entry.poses.image.data;
        const offset=((row<0 ? -1-row : row)*kept.length+compact[i])*12+axis*4;
        const half=THREE.DataUtils.fromHalfFloat;
        return half(data[offset])*x+half(data[offset+1])*y+half(data[offset+2])*z+half(data[offset+3]);
      };
      const a=to.anim.getX(at),b=to.anim.getY(at),t=to.anim.getZ(at);
      const axis=k=>coord(a,k)*(1-t)+coord(b,k)*t;
      to.mesh.getMatrixAt(at,matrix);
      out.set(axis(0),axis(1),axis(2)).applyMatrix4(matrix);
      out.x+=actor.x-submitted.x;out.y+=(actor.y||0)-submitted.y;out.z+=actor.z-submitted.z;
      return true;
    },
    palm(member,actor) {
      const entry=types.get(member); if(!entry?.near)return null;
      const p=palmAt(entry,frames(actor.clip,actor.time,actor.from,actor.fromTime,actor.fade,null),
        transform(entry,actor.x,0,actor.z,actor.heading,actor.look.height));
      return {x:p.x,y:p.y,z:p.z};
    },
    add(member,x,y,z,heading,height,look,distance,clip,time,from,fromTime,fade,carry=null,reaction=null,actor=null) {
      // Somebody whose own figure is still being made is drawn as somebody who is ready (themselves in their first outfit
      // if that is, otherwise another of the cast, always the same one), never as the blocked-out shape. They change
      // into themselves when their figure arrives.
      if (!ask(member,distance)) {
        const own=member%1000;
        if(types.get(own)?.near)member=own;
        else if(ready.length)member=ready[member%ready.length];
        else return false;
      }
      if(sight && distance>UNSEEN_BEYOND && !sight.intersectsSphere(around.set(point.set(x,y+1,z),SHADOW_REACH)))return true;
      const entry=types.get(member), to=distance>NEAR ? (distance>DISTANT && entry.distant ? entry.distant : entry.far) : entry.near;
      if(to.mesh.count>=capacity)return false;
      const at=to.mesh.count++, sample=frames(clip,time,from,fromTime,fade,carry);
      transform(entry,x,y,z,heading,height); to.mesh.setMatrixAt(at,matrix);
      const prep=actor?.preparation;
      const working=prep && prep.task.time>=0 && !actor.escape && !actor.reaction && !actor.suspendCarry && clip===prep.task.clip;
      if((reaction?.fall || working) && entry.rig && fallCount<capacity){
        const pose=fitPose(motion,entry.rig,motion.sample(reaction?.fall?reaction.clip:'idle',reaction?.fall?reaction.time:time,fallSample),fitted);
        if(reaction?.fall)fitFallPose(entry.rig,pose,reaction,heading);
        else for(const part of fitPrepHands(entry.rig,pose,prep,matrix))
          props.add(part.tool,part.point,heading,part.rotation,null,part.size);
        writeSkinRow(entry.rig,pose,kept,world,pixels,fallCount*stride);
        const row=-(++fallCount);
        to.anim.setXYZ(at,row,row,0);
      }else to.anim.setXYZ(at,...sample);
      if (actor && actor===tracked) submitted={entry,to,at,tick,x:actor.x,y:actor.y||0,z:actor.z};
      for (const key of ['top','bottom']) {
        colour.setHex(look[key]); to[key].setXYZ(at,colour.r,colour.g,colour.b);
      }
      if(clip==='giveCash' && carry==='cash')props.add('cash',palmAt(entry,sample,matrix),heading);
      if(clip==='cutHair'){
        const grip=palmAt(entry,sample,matrix),row=rows.get(clip),index=frame(row,time);
        const a=Math.floor(index)*5,b=((Math.floor(index)+1)%row.count)*5,t=index%1;
        toolFrame.fromArray(entry.shears,a).slerp(toolNext.fromArray(entry.shears,b),t);
        toolFrame.premultiply(toolNext.setFromAxisAngle(toolUp,heading));
        const spread=entry.shears[a+4]*(1-t)+entry.shears[b+4]*t;
        for(const [part,angle] of [['shearA',-spread],['shearB',spread]]){
          toolNext.setFromAxisAngle(toolUp,angle).premultiply(toolFrame);
          props.add(part,grip,heading,toolNext);
        }
      }else if(clip==='curlWeight')props.add('dumbbell',palmAt(entry,sample,matrix),heading);
      if(carry && rowFor(clip,carry).carry) props.add(carry,palmAt(entry,sample,matrix),heading);
      return true;
    },
    end(){
      // Sent whole: three's way of sending rows first asks the card for three of its settings, and each answer waits
      // for the card to finish everything it has been handed.
      if(fallCount)falls.needsUpdate=true;
      // A mesh nobody is drawn from this frame is not handed to the renderer at all: there are three for each of a
      // hundred kinds of people, and each would be set up for every pass only to draw nothing.
      // With dozens of outfits to each of a hundred people, figures are kept only while they are being seen: past KEPT of
      // them, the ones longest out of the picture are let go, and built again if that person in that outfit comes back.
      tick++;
      for(const entry of types.values()) if(entry?.near && levels(entry).some(to=>to.mesh.count>0)) entry.seen=tick;
      if(tick%90===0 && types.size>KEPT){
        const idle=[...types].filter(([,entry])=>entry?.near && tick-(entry.seen||0)>600).sort((a,b)=>(a[1].seen||0)-(b[1].seen||0));
        for(const [member,entry] of idle.slice(0,types.size-KEPT)){
          for(const {mesh} of levels(entry)){group.remove(mesh);mesh.geometry.dispose();mesh.dispose();}
          entry.material.dispose();entry.depth.dispose();entry.poses.dispose();entry.map.dispose();entry.map.image?.close?.();
          types.delete(member);
        }
      }
      for(const entry of types.values()) if(entry?.near) for(const to of levels(entry)) {
        to.mesh.visible=to.mesh.count>0;
        // Only the people drawn are sent: a batch has room for hundreds and usually holds a handful.
        if(to.mesh.count) for(const attr of [to.anim,to.top,to.bottom,to.mesh.instanceMatrix]){
          attr.clearUpdateRanges();attr.addUpdateRange(0,to.mesh.count*attr.itemSize);attr.needsUpdate=true;
        }
      }},
    dispose(){
      disposed=true;falls.dispose();queue.clear();props.dispose();
      for(const entry of types.values()) if(entry?.near){
        for(const {mesh} of levels(entry)){mesh.geometry.dispose();mesh.dispose();}
        entry.material.dispose(); entry.depth.dispose(); entry.poses.dispose(); entry.map.dispose(); entry.map.image.close();
      }
      types.clear();group.removeFromParent();
    },
  };
}
