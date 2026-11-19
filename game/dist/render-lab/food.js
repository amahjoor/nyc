import * as T from '../vendor/three.module.min.js';
import { KINDS } from '../places.js';
import { menuFor } from '../menu.js';
import { servingFor,portionKey } from '../food-catalog.js';
import { servingGeometry } from '../serving-models.js';
import { servingMaterial } from '../food-surface.js';
import { groceries } from '../grocery-stock.js';
import { packageGeometry,packageMaterial } from '../grocery-models.js';

const portions=[{id:'full',label:'Full',level:2},{id:'half',label:'Half',level:1},{id:'empty',label:'Empty',level:0}];
const reusableGeometry=object=>object.material.dispose();
const studioMesh=(geometry,material)=>new T.Mesh(geometry,material);

export function foodEntries(){
  const entries=new Map();
  for(const kind of KINDS){
    for(const item of menuFor({kind:kind.id})){
      const key=item.product||servingFor(item);
      if(!key)continue;
      let entry=entries.get(key);
      if(!entry){
        const grocery=groceries[key],drink=key==='cup'||key.startsWith('drink-');
        const collection=grocery?'Groceries':drink?'Drinks':'Prepared food';
        const variants=grocery?.effect==='pantry'?[portions[0]]:[...portions];
        if(grocery)variants.push({id:'shelf',label:'Shelf'},{id:'window',label:'Window'});
        if(key==='cup')variants.push(...portions.map(v=>({...v,id:'mug-'+v.id,label:v.label+' mug'})));
        entry={id:key,name:item.preparation||item.name,model:key,collection,group:grocery?'Packaged stock':drink?'Beverage':'Menu serving',
          source:grocery?'grocery-models.js':'serving-models.js',detail:grocery?.size||'',tags:[],places:[],variants,
          build(id){
            const v=variants.find(v=>v.id===id)||variants[0];
            if(grocery){
              const shelf=v.id==='window'?'window':v.id==='shelf';
              return studioMesh(packageGeometry(key,shelf,v.level??2),packageMaterial(Boolean(shelf),key));
            }
            return studioMesh(servingGeometry(portionKey(v.id.startsWith('mug-')?'mug':key,v.level)),servingMaterial());
          },dispose:reusableGeometry};
        entries.set(key,entry);
      }
      if(!entry.places.includes(kind.label))entry.places.push(kind.label);
      entry.tags.push(kind.id,item.name);
    }
  }
  return [...entries.values()];
}
