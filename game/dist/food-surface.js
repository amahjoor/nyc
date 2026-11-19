// One material for every serving. Colour is carried by the vertices, and so is
// how wet each part is: sauce and glazed china shine, bread and paper do not.
import * as T from './vendor/three.module.min.js';

let atlas;
/** The surface atlas rooms still bind for servings; they draw from its plain patch. */
export function ingredientMap(){
  if(!atlas && typeof document!=='undefined'){
    atlas=new T.TextureLoader().load(new URL('./assets/food-surfaces.webp',import.meta.url).href);
    atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=8;
  }
  return atlas||null;
}
export function servingMaterial(){
  const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.7,side:T.DoubleSide,transparent:true});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float gloss;\nvarying float vGloss;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGloss=gloss;');
    shader.fragmentShader='varying float vGloss;\n'+shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(1.-vGloss,.06,1.);');
  };
  material.customProgramCacheKey=()=>'serving-gloss';
  return material;
}
