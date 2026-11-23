import * as THREE from './vendor/three.module.min.js';
import { generateVehicle } from './vehicle-generator.js';

// Share the vertical surface index between instances of the same exterior.
const importedBodies=new WeakMap(),geometrySurfaces=new WeakMap(),cellSize=.25;
export function importedSupport(spec){return exteriorSupport(importedBodies.get(spec));}
export function exteriorSupport(geometry){
  if(!geometry)return null;
  let record=geometrySurfaces.get(geometry);
  if(record)return record;
  const vertices=geometry.attributes.position,indices=geometry.index?.array;
  geometry.computeBoundingBox();
  const {min,max}=geometry.boundingBox;
  const col=x=>Math.floor((x-min.x)/cellSize), row=z=>Math.floor((z-min.z)/cellSize);
  const cols=col(max.x)+1, cells=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),point=new THREE.Vector3();
  const triangle=i=>{
    a.fromBufferAttribute(vertices,indices?indices[i]:i);
    b.fromBufferAttribute(vertices,indices?indices[i+1]:i+1);
    c.fromBufferAttribute(vertices,indices?indices[i+2]:i+2);
  };
  for(let i=0;i<(indices?.length??vertices.count);i+=3){
    triangle(i);
    for(let z=row(Math.min(a.z,b.z,c.z));z<=row(Math.max(a.z,b.z,c.z));z++)
      for(let x=col(Math.min(a.x,b.x,c.x));x<=col(Math.max(a.x,b.x,c.x));x++)
        (cells[z*cols+x]??=[]).push(i);
  }
  const ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,-1,0));
  function sample(x,z){
    if(x<min.x || x>max.x || z<min.z || z>max.z)return null;
    ray.origin.set(x,max.y+1,z);
    let height=null;
    for(const i of cells[row(z)*cols+col(x)]||[]){
      triangle(i);
      if(ray.intersectTriangle(a,b,c,false,point) && (height===null || point.y>height))height=point.y;
    }
    return height;
  }
  record={height:max.y};
  geometrySurfaces.set(geometry,record);
  record.top=(x,z,margin)=>sample(x,z) ?? (margin>0 ? sample(x-Math.sign(x)*Math.min(Math.abs(x),margin),
    z-Math.sign(z)*Math.min(Math.abs(z),margin)) : null);
  return record;
}

// These local GLBs are compiled by build-vehicle-meshes.py: one rigid mesh,
// shared float positions/normals and an indexed primitive per surface.
const FINISH = { paint: [.34, .22, 1], glass: [.06, .9, 1], trim: [.64, .09, 0], chrome: [.22, 1, 0] };
export function decodeVehicleMesh(buffer, spec) {
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== buffer.byteLength) throw Error('Invalid vehicle GLB');
  const length = header.getUint32(12, true), start = 28 + length;
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  const read = (id, type, size) => {
    const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView];
    return new type(buffer, start + (view.byteOffset || 0) + (a.byteOffset || 0), a.count * size);
  };
  const primitives = gltf.meshes[0].primitives, attrs = primitives[0].attributes;
  const position = new THREE.BufferAttribute(read(attrs.POSITION, Float32Array, 3), 3);
  const normal = new THREE.BufferAttribute(read(attrs.NORMAL, Float32Array, 3), 3);
  const colors = new Float32Array(position.count * 3), finishes = new Float32Array(position.count * 3);
  const tintWeight = new Float32Array(position.count), glazing = new Float32Array(position.count);
  const sourceColors = attrs.COLOR_0 === undefined ? null : read(attrs.COLOR_0, Float32Array, 3);
  const surface = attrs._SURFACE === undefined ? null : read(attrs._SURFACE, Float32Array, 4);
  const shell = [], lenses = [];
  for (const part of primitives) {
    const material = gltf.materials[part.material], finish = FINISH[material.name];
    const tone = material.pbrMetallicRoughness.baseColorFactor;
    const indices = finish ? shell : lenses;
    for (const i of read(part.indices, Uint16Array, 1)) {
      indices.push(i);
      for (let c = 0; c < 3; c++) colors[i * 3 + c] = tone[c] * (sourceColors?.[i * 3 + c] ?? 1);
      if (finish) {
        for (let c = 0; c < 3; c++) finishes[i * 3 + c] = surface?.[i * 4 + c] ?? finish[c];
        glazing[i] = surface ? surface[i*4+2] - surface[i*4+3] : Number(material.name === 'glass');
        tintWeight[i] = surface?.[i * 4 + 3] ?? (material.name === 'paint' ? 1 : 0);
      }
    }
  }
  // The Accord scan labels shallow surfaces as paint, including both sloping
  // windows. The photographed glass is still dark in its baked vertex colours.
  if (spec.id === 'honda-accord-2018' && surface) {
    for (let i = 0; i < position.count; i++) {
      const x = Math.abs(position.getX(i)), y = position.getY(i), z = position.getZ(i);
      const rear = z > -1.99 && z < -1.10 && y > 1.03 && x < .66;
      const front = z > .39 && z < 1.22 && y > .92 && x < .72;
      if ((rear || front) && normal.getY(i) > .65 && colors[i*3] < .52) glazing[i] = 1;
    }
  }
  const color = new THREE.BufferAttribute(colors, 3);
  const geometry = indices => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', position); g.setAttribute('normal', normal); g.setAttribute('color', color);
    g.setIndex(indices); g.computeBoundingSphere();
    return g;
  };
  const body = geometry(shell);
  body.setAttribute('aFinish', new THREE.BufferAttribute(finishes, 3));
  body.setAttribute('aPaintWeight', new THREE.BufferAttribute(tintWeight, 1));
  body.setAttribute('aGlazing', new THREE.BufferAttribute(glazing, 1));
  importedBodies.set(spec,body);
  return { id: spec.id, body, lamps: geometry(lenses), wheels: spec.wheels };
}

// Generated exteriors kept at once. One is a few hundred kilobytes; the city has a thousand of them.
const KEPT = 220;

/**
 * Parked, distant and driven cars share one geometry per exterior. An imported
 * exterior is fetched on demand; a generated one (a spec with a `design`) is
 * built here, one per turn of the event loop so that a street of new cars
 * does not hold up a frame. Until either arrives, get() answers null and the
 * car wears its shared body.
 */
export function createVehicleMeshLibrary(load = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`Vehicle mesh HTTP ${response.status}`);
  return response.arrayBuffer();
}, generate = generateVehicle) {
  const cache = new Map(), queue = [];
  let working = false, built = 0, clock = 0;
  const work = () => {
    const entry = queue.shift();
    if (entry && cache.get(entry.spec.id) === entry) {
      try { entry.mesh = generate(entry.spec); built++; } catch { entry.retry = Infinity; }
      // Let go of the exteriors nobody has asked after for longest.
      if (built > KEPT) {
        const idle = [...cache.values()].filter(e => e.generated && e.mesh).sort((a, b) => a.asked - b.asked).slice(0, built - KEPT);
        for (const old of idle) if (clock - old.asked > 600) { old.mesh.body.dispose(); old.mesh.lamps.dispose(); cache.delete(old.spec.id); built--; }
      }
    }
    if (queue.length) setTimeout(work, 0); else working = false;
  };
  return { get(spec) {
    if (!spec) return null;
    let entry = cache.get(spec.id);
    if (spec.design) {
      if (!entry) {
        entry = { spec, mesh: null, generated: true, asked: 0 };
        cache.set(spec.id, entry); queue.push(entry);
        if (!working) { working = true; setTimeout(work, 0); }
      }
      entry.asked = ++clock;
      return entry.mesh;
    }
    if (!entry || (!entry.mesh && Date.now() >= entry.retry)) {
      entry = { mesh: null, retry: Infinity };
      cache.set(spec.id, entry);
      load(spec.url).then(buffer => { entry.mesh = decodeVehicleMesh(buffer, spec); })
        .catch(() => { entry.retry = Date.now() + 60000; });
    }
    return entry.mesh;
  } };
}
