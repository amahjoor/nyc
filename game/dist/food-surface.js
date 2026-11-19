// Ingredient swatches occupy four quadrants. A white strip on the right leaves
// plain glazed china, cutlery, glass and garnishes at their authored colour.
import * as T from './vendor/three.module.min.js';

let atlas;
export function ingredientMap(){
  if(!atlas && typeof document!=='undefined'){
    atlas=new T.TextureLoader().load(new URL('./assets/food-surfaces.webp',import.meta.url).href);
    atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=8;
  }
  return atlas||null;
}
export function servingMaterial(){
  return new T.MeshStandardMaterial({map:ingredientMap(),vertexColors:true,roughness:.50,side:T.DoubleSide,transparent:true});
}
