// Bake the CC0 Quaternius Ultimate Animated Animal Pack to the two poses the city uses.
// Source and license: https://quaternius.com/packs/ultimateanimatedanimals.html
// GLB exports: https://github.com/trebeljahr/quaternius-showcase/tree/main/public/glb/animals_pack
// Arguments: path to a three@0.180 installation, Horse.glb, Husky.glb.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [three,horseFile,dogFile]=process.argv.slice(2);
const moduleAt=name=>import(pathToFileURL(resolve(three,name)));
const {GLTFLoader}=await moduleAt('examples/jsm/loaders/GLTFLoader.js');
const {AnimationMixer,Vector3,Box3}=await moduleAt('build/three.module.js');
const output=new URL('../dist/assets/police/',import.meta.url);
await mkdir(output,{recursive:true});
for(const [id,file,height] of [['horse',horseFile,2.30],['dog',dogFile,.84]]){
  const bytes=await readFile(file);
  const {scene,animations}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  const mixer=new AnimationMixer(scene), point=new Vector3();
  const clip=name=>animations.find(a=>a.name.endsWith('|'+name));
  const pose=(name,t)=>{
    mixer.stopAllAction();mixer.clipAction(clip(name)).reset().play();mixer.setTime(t);
    scene.updateMatrixWorld(true);
  };
  pose('Idle',.01);
  const bounds=new Box3().setFromObject(scene,true), scale=height/(bounds.max.y-bounds.min.y);
  const verts=[], faces=[], colors=[], shared=new Map();
  scene.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    const geometry=mesh.geometry, index=geometry.index, attrs=geometry.attributes;
    for(let i=0;i<(index?.count ?? attrs.position.count);i++){
      const v=index ? index.getX(i) : i;
      mesh.getVertexPosition(v,point).applyMatrix4(mesh.matrixWorld);
      const key=[mesh.material.name,...point.toArray().map(x=>Math.round(x*10000)),
        ...Array.from(attrs.skinIndex.array.subarray(v*4,v*4+4)),...Array.from(attrs.skinWeight.array.subarray(v*4,v*4+4))].join(',');
      if(!shared.has(key)){
        shared.set(key,verts.length);verts.push({mesh,v});
        colors.push(...mesh.material.color.toArray().map(x=>Math.round(x*255)));
      }
      faces.push(shared.get(key));
    }
  });
  const encode=view=>Buffer.from(view.buffer).toString('base64');
  const sample=()=>encode(Int16Array.from(verts.flatMap(({mesh,v})=>{
    mesh.getVertexPosition(v,point).applyMatrix4(mesh.matrixWorld);
    return [point.x,point.y-bounds.min.y,point.z].map(n=>Math.round(n*scale*1000));
  })));
  const rest=sample(), walk=[];
  for(let i=0;i<8;i++){pose('Walk',i*clip('Walk').duration/8);walk.push(sample());}
  const data={rest,walk,colors:encode(Uint8Array.from(colors)),indices:encode(Uint16Array.from(faces))};
  await writeFile(new URL(id+'.json',output),JSON.stringify(data));
  console.log(id,verts.length,'vertices',faces.length/3,'triangles');
}
