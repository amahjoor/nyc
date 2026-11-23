// A single fracture mask is shared by damaged cars. The shader places and grows
// it in the struck pane's own coordinates, including from inside the cabin.
import * as THREE from './vendor/three.module.min.js';

let fractureMap;
function sharedFractures() {
  if (fractureMap) return fractureMap;
  const size = 1024, pixels = new Uint8Array(size * size);
  let seed = 7321;
  const random = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296);
  function line(a,b,width) {
    a={x:a.x*2,y:a.y*2}; b={x:b.x*2,y:b.y*2};
    const dx=b.x-a.x, dy=b.y-a.y, length2=dx*dx+dy*dy;
    for (let y=Math.max(0,Math.floor(Math.min(a.y,b.y)-2)); y<=Math.min(size-1,Math.ceil(Math.max(a.y,b.y)+2)); y++) {
      for (let x=Math.max(0,Math.floor(Math.min(a.x,b.x)-2)); x<=Math.min(size-1,Math.ceil(Math.max(a.x,b.x)+2)); x++) {
        const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(length2 || 1)));
        const coverage=Math.max(0,Math.min(1,width+.65-Math.hypot(x-a.x-t*dx,y-a.y-t*dy)));
        pixels[y*size+x]=Math.max(pixels[y*size+x],Math.round(255*coverage));
      }
    }
  }
  const rays=[];
  for (let i=0;i<19;i++) {
    const bearing=(i+random()*.7)*2*Math.PI/19, ray=[{x:256,y:256}];
    const reach=100+random()*149;
    for (let j=1;j<=12;j++) {
      const r=reach*j/12, a=bearing+(random()-.5)*.11;
      const tip={x:256+r*Math.cos(a),y:256+r*Math.sin(a)};
      line(ray[j-1],tip,j<4?.96:.66);
      if (j>2 && random()<.32) {
        const fork=a+(random()<.5?-1:1)*(.24+random()*.5), len=9+random()*28;
        line(tip,{x:tip.x+len*Math.cos(fork),y:tip.y+len*Math.sin(fork)},.65);
      }
      ray.push(tip);
    }
    rays.push(ray);
  }
  for (let i=0;i<rays.length;i++) {
    const adjacent=rays[(i+1)%rays.length];
    for (let j=1;j<9;j++) {
      if (random() > 1-j*.105) continue;
      line(rays[i][j],adjacent[Math.max(1,j+(random()<.25?1:0))],.76);
    }
  }
  fractureMap=new THREE.DataTexture(pixels,size,size,THREE.RedFormat);
  fractureMap.generateMipmaps=true;
  fractureMap.minFilter=THREE.LinearMipmapLinearFilter;
  fractureMap.magFilter=THREE.LinearFilter;
  fractureMap.needsUpdate=true;
  return fractureMap;
}

const paneBounds = new WeakMap();
function measurePane(geometry,side) {
  if (paneBounds.has(geometry.index)) return paneBounds.get(geometry.index);
  const position=geometry.attributes.position;
  let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
  for (let i=0;i<geometry.index.count;i++) {
    const vertex=geometry.index.getX(i), u=side?position.getZ(vertex):position.getX(vertex), y=position.getY(vertex);
    left=Math.min(left,u); right=Math.max(right,u); bottom=Math.min(bottom,y); top=Math.max(top,y);
  }
  const bounds=new THREE.Vector4(left,bottom,Math.max(.01,right-left),Math.max(.01,top-bottom));
  paneBounds.set(geometry.index,bounds);
  return bounds;
}

const fractures=new WeakMap();
export function releaseFracture(mesh,clear) {
  const state=fractures.get(mesh);
  if (!state) return;
  mesh.material=clear;
  state.material.dispose();
  fractures.delete(mesh);
}

export function poseGlass(mesh,clear,visible,damage,origin,side,secondary) {
  if (!mesh) return;
  mesh.visible=visible;
  if (!visible || damage<=.055) {
    releaseFracture(mesh,clear);
    return;
  }
  let state=fractures.get(mesh);
  if (!state) {
    const rest=mesh.geometry, bounds=measurePane(rest,side);
    const material=clear.clone(), strike=new THREE.Vector3(), second=new THREE.Vector2();
    material.name='Fractured car glass';
    material.customProgramCacheKey=()=>'vehicle-fracture-v1';
    material.onBeforeCompile=shader=>{
      shader.uniforms.fractureSheet={value:sharedFractures()};
      shader.uniforms.paneBounds={value:bounds};
      shader.uniforms.sidePane={value:side?1:0};
      shader.uniforms.strike={value:strike};
      shader.uniforms.secondStrike={value:second};
      shader.vertexShader='varying vec2 panePosition;\nuniform float sidePane;\n'+shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\npanePosition=vec2(mix(position.x,position.z,sidePane),position.y);');
      shader.fragmentShader='uniform sampler2D fractureSheet;\nuniform vec4 paneBounds;\nuniform vec3 strike;\nuniform vec2 secondStrike;\nvarying vec2 panePosition;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if (!gl_FrontFacing) diffuseColor.a *= .16;
        vec2 delta=panePosition-paneBounds.xy-paneBounds.zw*strike.xy;
        delta.y *= 1.35;
        vec2 sheet=delta/(paneBounds.z*1.65);
        float extent=.025+.56*pow(strike.z,.84);
        float edge=1.-smoothstep(extent*.78,extent,length(sheet));
        float lines=texture2D(fractureSheet,.5+sheet).r;
        float crack=clamp(lines*1.3,0.,1.)*edge;
        if (secondStrike.y>0.) {
          vec2 p = panePosition-paneBounds.xy-paneBounds.zw*vec2(secondStrike.x,.49);
          vec2 uv = vec2(-p.y*1.35,p.x)/(paneBounds.z*1.4);
          float spread=.025+.49*pow(secondStrike.y,.84);
          float branch=texture2D(fractureSheet,.5+uv).r*(1.-smoothstep(spread*.78,spread,length(uv)));
          crack=max(crack,min(1.,branch*1.3));
        }
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.84,.91,.93),crack);
        diffuseColor.a=mix(diffuseColor.a,gl_FrontFacing ? .83 : .56,crack);`)
        .replace('#include <opaque_fragment>','outgoingLight += vec3(.29,.33,.35)*crack;\n#include <opaque_fragment>');
    };
    state={material,strike,second};
    fractures.set(mesh,state);
    mesh.material=material;
  }
  state.second.set(secondary?.origin ?? 0,secondary?.depth ?? 0);
  state.strike.set(origin,.34+.12*Math.abs(origin-.5),damage);
}
