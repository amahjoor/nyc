import * as THREE from './vendor/three.module.min.js';

const TILE = 512;
const cell = n => Math.floor(n / TILE);
const key = (x, z) => x + ',' + z;
function append(map, id, value) {
  if (!map.has(id)) map.set(id, []);
  map.get(id).push(value);
}

export function coastalHeight(grid, x, z) {
  if (!grid) return null;
  const u = (x - grid.x) / grid.step, v = (z - grid.z) / grid.step;
  const col = Math.floor(u), row = Math.floor(v);
  if (col < 0 || row < 0 || col + 1 >= grid.cols || row + 1 >= grid.rows) return null;
  let sum = 0, weights = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const sample = grid.values[(row + j) * grid.cols + col + i];
    if (sample === grid.noData) continue;
    const w = (1 - Math.abs(u - col - i)) * (1 - Math.abs(v - row - j));
    sum += w * sample; weights += w;
  }
  return weights ? sum / weights * grid.scale : null;
}

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a,b] = ring[j], [c,d] = ring[i];
    if ((b > z) !== (d > z) && x < a + (c-a)*(z-b)/(d-b)) inside = !inside;
  }
  return inside;
}

// Use the same world-space noise as the terrain. Its scale stays in metres
// as the active shore tiles change around the player.
function finish(material, fragment) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 shoreWorld;\n' + shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nshoreWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader = 'varying vec3 shoreWorld;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + fragment);
  };
  material.customProgramCacheKey = () => fragment;
  return material;
}

function surfaceMesh(points, colors, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

export function createWaterfront(scene, polygons, level) {
  const edges = new Map(), piers = new Map(), built = new Map();
  const group = new THREE.Group();
  group.name = 'Surveyed waterfront';
  scene?.add(group);
  const material = finish(new THREE.MeshStandardMaterial({vertexColors:true, roughness:.95, side:THREE.DoubleSide}), `
    vec2 uv=vec2(shoreWorld.x+.71*shoreWorld.z,shoreWorld.y+.23*shoreWorld.z);
    float age=texture2D(uNycNoise,uv*.16).r,grain=texture2D(uNycNoise,uv*2.4).g;
    diffuseColor.rgb *= (.73+.35*age+.20*grain)*mix(.60,1.,smoothstep(-.18,.45,shoreWorld.y+.12*age));
  `);
  for (const polygon of polygons) for (const ring of [polygon.outer, ...polygon.holes]) {
    for (let i=0; i<ring.length; i++) {
      const [x,z] = ring[i], [ex,ez] = ring[(i+1)%ring.length];
      const n = Math.max(1, Math.ceil(Math.hypot(ex-x,ez-z)/TILE));
      for (let j=0; j<n; j++) {
        const dx=(ex-x)/n, dz=(ez-z)/n, a=x+j*dx, b=z+j*dz;
        append(edges,key(cell(a+dx/2),cell(b+dz/2)),[a,b,a+dx,b+dz]);
      }
    }
  }
  let grid, last = '', revision = -1, pierRevision = 0;
  let bottom = null, bottomKey = '';
  const bed = (x,z) => Math.min(level-.35, coastalHeight(grid,x,z) ?? level-3);
  function setPiers(rows) {
    piers.clear();pierRevision++;
    for (const [id,y,rings] of rows) {
      const xs=rings[0].map(p=>p[0]), zs=rings[0].map(p=>p[1]);
      const p={id,y,rings, coastal:undefined, minX:Math.min(...xs),maxX:Math.max(...xs), minZ:Math.min(...zs),maxZ:Math.max(...zs)};
      for (let x=cell(p.minX); x<=cell(p.maxX); x++) for (let z=cell(p.minZ); z<=cell(p.maxZ); z++) append(piers,key(x,z),p);
    }
    invalidate();
  }
  function deckAt(x,z) {
    for (const p of piers.get(key(cell(x),cell(z))) || []) {
      if (x>=p.minX && x<=p.maxX && z>=p.minZ && z<=p.maxZ && inRing(x,z,p.rings[0]) && !p.rings.slice(1).some(r=>inRing(x,z,r))) return p;
    }
    return null;
  }
  // The borough outlines include the tops of piers. Where real deck geometry
  // is drawn, expose the water and piles beneath it on the local ground mask.
  function cutCoastalDecks(ctx,pixels,rect,inLand) {
    const seen=new Set(), scale=pixels/rect.size;
    for (let x=cell(rect.minX);x<=cell(rect.minX+rect.size);x++) for (let z=cell(rect.minZ);z<=cell(rect.minZ+rect.size);z++) {
      for(const pier of piers.get(key(x,z))||[]) {
        if(seen.has(pier))continue;
        seen.add(pier);
        pier.coastal??=pier.rings[0].some(([a,b])=>!inLand(a+1,b)||!inLand(a-1,b)||!inLand(a,b+1)||!inLand(a,b-1));
        if(!pier.coastal || pier.y<=level)continue;
        ctx.fillStyle='#000';ctx.beginPath();
        for(const ring of pier.rings) {
          ring.forEach(([a,b],i)=>{const px=(a-rect.minX)*scale,py=(b-rect.minZ)*scale;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);});
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
    }
  }
  function invalidate() {
    for (const node of built.values()) { group.remove(node);node.geometry.dispose(); }
    built.clear();last='';
  }
  function tile(id,heightAt) {
    const pos=[], rgb=[];
    function point(x,y,z,c) { pos.push(x,y,z);rgb.push(...c); }
    const dry=[.22,.20,.17], wet=[.065,.085,.071], timber=[.24,.225,.20], side=[.13,.12,.10];
    function face(x,z, y,low, a,b, h,base, topColor,bottomColor) {
      point(x,y,z,topColor);point(x,low,z,bottomColor);point(a,h,b,topColor);
      point(a,h,b,topColor);point(x,low,z,bottomColor);point(a,base,b,bottomColor);
    }
    for (const [x,z,ex,ez] of edges.get(id)||[]) {
      const count=Math.max(1,Math.ceil(Math.hypot(ex-x,ez-z)/5));
      let a=x,b=z,h=heightAt(x,z),low=bed(x,z)-.4;
      for (let i=1;i<=count;i++) {
        const u=i/count, c=x+(ex-x)*u,d=z+(ez-z)*u,y=heightAt(c,d),base=bed(c,d)-.4;
        if(!deckAt((a+c)/2,(b+d)/2))face(a,b,h,low,c,d,y,base,dry,wet);
        a=c;b=d;h=y;low=base;
      }
    }
    for (const p of piers.get(id)||[]) {
      if (id!==key(cell(p.minX),cell(p.minZ))) continue;
      const loops=p.rings.map(r=>r.map(([x,z])=>new THREE.Vector2(x,z)));
      const tris=THREE.ShapeUtils.triangulateShape(loops[0],loops.slice(1)), vertices=loops.flat();
      for (const tri of tris) for (const i of [tri[0],tri[2],tri[1]]) point(vertices[i].x,p.y+.035,vertices[i].y,timber);
      for (const ring of p.rings) for (let i=0;i<ring.length;i++) {
        const [x,z]=ring[i],[a,b]=ring[(i+1)%ring.length];
        face(x,z,p.y+.035,p.y-.4,a,b,p.y+.035,p.y-.4,timber,side);
        // Approximate bearing piles along exposed deck spans. Short surveyed
        // segments need no intermediate supports.
        const span=Math.hypot(a-x,b-z);
        for(let d=4;d<span;d+=8){
          const cx=x+(a-x)*d/span,cz=z+(b-z)*d/span;
          const low=Math.min(p.y-2.8,bed(cx,cz)-.3);
          for(let k=0;k<6;k++){
            const t=k*Math.PI/3, next=(k+1)*Math.PI/3;
            face(cx+.21*Math.cos(t),cz+.21*Math.sin(t),p.y-.35,low,
                 cx+.21*Math.cos(next),cz+.21*Math.sin(next),p.y-.35,low,side,wet);
          }
        }
      }
    }
    return surfaceMesh(pos,rgb,material);
  }
  function update(focus, heightAt, rev, overview) {
    if (rev!==revision) {invalidate();revision=rev;}
    group.visible=!overview;
    const cx=cell(focus.x),cz=cell(focus.z), center=key(cx,cz);
    if (overview || center===last) return;
    last=center;
    const wanted=new Set();
    for (let x=cx-4;x<=cx+4;x++) for (let z=cz-4;z<=cz+4;z++) {
      const id=key(x,z);
      if (!edges.has(id) && !piers.has(id)) continue;
      wanted.add(id);
      if (!built.has(id)) {const node=tile(id,heightAt);built.set(id,node);group.add(node);}
    }
    for(const [id,node] of built) if(!wanted.has(id)){group.remove(node);node.geometry.dispose();built.delete(id);}
  }
  function underwater(eye, active) {
    if (bottom) bottom.visible=active;
    if (!active) return;
    const cx=Math.floor(eye.x/64)*64, cz=Math.floor(eye.z/64)*64, id=key(cx,cz);
    if (id===bottomKey) return;
    bottomKey=id;
    if (!bottom) {
      bottom=new THREE.Mesh(new THREE.PlaneGeometry(320,320,40,40).rotateX(-Math.PI/2),finish(new THREE.MeshStandardMaterial({color:0x685f4d,roughness:1}), `
        vec2 p=shoreWorld.xz;
        float sediment=texture2D(uNycNoise,p*.075).r, grain=texture2D(uNycNoise,p*3.5).b;
        float ripple=sin(p.x*8.0+p.y*3.8+sediment*4.)*.5+.5;
        diffuseColor.rgb *= (.53+.56*sediment+.29*grain+.14*ripple);
      `));
      bottom.name='Harbor floor';scene?.add(bottom);
    }
    const g=bottom.geometry, pts=g.attributes.position;
    for(let i=0;i<pts.count;i++) pts.setY(i,bed(cx+pts.getX(i),cz+pts.getZ(i)));
    pts.needsUpdate=true;g.computeVertexNormals();g.computeBoundingSphere();
    bottom.position.set(cx,0,cz);
  }
  return {deckAt,bed,cutCoastalDecks,get pierRevision(){return pierRevision;},surveyedHeight:(x,z)=>coastalHeight(grid,x,z),setPiers,update,underwater,setGrid(data){grid=data;bottomKey='';invalidate();},
    dispose(){invalidate();scene?.remove(group);material.dispose();if(bottom){scene?.remove(bottom);bottom.geometry.dispose();bottom.material.dispose();}}};
}
