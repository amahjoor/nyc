// Package the inspector with its production renderers and their local data.
// The game dev server uses the same modules directly under /render-lab/.
import { cp,lstat,mkdir,mkdtemp,readdir,readFile,rename,rm,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const game=fileURLToPath(new URL('../dist/',import.meta.url));
const site=fileURLToPath(new URL('../render-atlas-site/',import.meta.url));
const out=path.resolve(process.argv[2]||path.join(site,'dist'));
if(out===path.resolve(game)||out.startsWith(game))throw Error('Choose a destination outside the live game directory.');
const parent=path.dirname(out);
await mkdir(parent,{recursive:true});
const previous=await lstat(out).catch(e=>{if(e.code!=='ENOENT')throw e;});
if(previous && (!previous.isDirectory()||previous.isSymbolicLink()))throw Error('The output must be a directory.');
if(previous && (await readdir(out)).length){
  const index=await readFile(path.join(out,'index.html'),'utf8').catch(()=>'');
  if(!index.includes('<base href="./render-lab/">'))throw Error('The destination contains a different site.');
}
const stage=await mkdtemp(path.join(parent,'.atlas-build-'));
const built=path.join(stage,'dist');
const modules=new Set();
async function copy(file){
  const from=path.join(game,file),to=path.join(built,file);
  await mkdir(path.dirname(to),{recursive:true});
  await cp(from,to,{recursive:true});
}
async function collect(file){
  if(modules.has(file))return;
  modules.add(file);const js=await readFile(path.join(game,file),'utf8');await copy(file);
  // Includes named/side-effect imports, re-exports and literal dynamic imports.
  const imports=js.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)['"](\.{1,2}\/[^'"]+?\.js)['"]/g);
  for(const match of imports)await collect(path.normalize(path.join(path.dirname(file),match[1])));
}
try{
  await mkdir(built);
  await copy('render-lab');
  await collect('render-lab/atlas.js');
  for(const file of [
    'motion.bin','motion.json','human','vehicle-catalog.json','working-vehicles.json','assets/vehicles',
    'liberty-island/statue-island.glb','liberty-island/statue-harbor.glb','assets/fonts/jost.woff2','assets/fonts/jost-LICENSE.txt',
    'vendor/THREE-LICENSE.txt','assets/bank-surfaces.jpg','assets/counter-menu.jpg','assets/food-surfaces.webp',
    'assets/grocery-labels.jpg','assets/shop-editorials.jpg','assets/shop-materials.jpg'
  ])await copy(file);
  const html=await readFile(path.join(game,'render-lab/index.html'),'utf8');
  await writeFile(path.join(built,'index.html'),html.replace('<head>','<head>\n<base href="./render-lab/">'));
  const old=path.join(stage,'previous');
  if(previous)await rename(out,old);
  try{await rename(built,out);}
  catch(error){if(previous)await rename(old,out);throw error;}
}finally{await rm(stage,{recursive:true,force:true});}
console.log('Packaged '+modules.size+' renderer modules in '+out);
