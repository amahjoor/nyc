import {readdir,readFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const name of await readdir(resolve(root,'dist'))){
  if(name.endsWith('.js')){
    const result=spawnSync(process.execPath,['--check',resolve(root,'dist',name)],{stdio:'inherit'});
    if(result.status)process.exit(result.status);
    const source=await readFile(resolve(root,'dist',name),'utf8');
    for(const match of source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g))await stat(resolve(root,'dist',match[1]));
  }
}
const city=JSON.parse(await readFile(resolve(root,'dist/city.json'),'utf8'));
if(city.buildings.length<100||city.roads.length<10)throw new Error('City data is incomplete');
const html=await readFile(resolve(root,'dist/index.html'),'utf8');
for(const file of ['main.js','style.css'])if(!html.includes(file))throw new Error(`Missing entry: ${file}`);
console.log(`Source checks passed: ${city.roads.length} roads, ${city.buildings.length} footprints.`);
