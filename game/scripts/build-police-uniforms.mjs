// Bake the field-unit lettering and jacket panels into the UVs of the patrol jacket.
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {UNIFORMS} from '../dist/police-units.js';
const src=await readFile(new URL('../data/patrol-jacket.svg',import.meta.url),'utf8');
const tex=new URL('../dist/human/tex/',import.meta.url);
const marks='<!-- Back yoke';
function convert(tool,args,input) {
  const result=spawnSync(tool,args,{input,maxBuffer:16*1024*1024});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(result.stderr.toString());
  return result.stdout;
}
function raster(art,size) {
  return convert('rsvg-convert',['--width',String(size),'--height',String(size)],art);
}
function tint(hex,factor) {
  const channels=hex.slice(1).match(/../g).map(c=>Math.min(255,Math.round(parseInt(c,16)*factor)));
  return '#'+channels.map(c=>c.toString(16).padStart(2,'0')).join('');
}
for(const [id,style] of Object.entries(UNIFORMS)){
  let art=id==='patrol' ? src : src.replace('#394b64',tint(style.coat,1.21)).replace('#2d4059',style.coat)
    .replace('#243449',tint(style.coat,.76));
  const panels=[];
  if(style.reflective)panels.push('<path d="M0 202h340m42 0h337m-333 15h329M0 217h340" fill="none" stroke="#d2d4c8" stroke-width="6"/>');
  if(style.vest)panels.push('<path d="M420 99l42-38 39 6 19 25 86 0 12-24 43-6 37 37-18 161-36 24H469l-42-24Z M40 84l65-38 22 35h85l19-35 65 37-10 179-43 19H85l-40-21Z" fill="#243138" stroke="#59636a" stroke-width="3"/><path d="M441 213h231m-233 12h232m-230 13h227M55 210h220m-218 12h216" stroke="#43515a" stroke-width="6" stroke-dasharray="19 4"/>');
  if(id==='marine')panels.push('<path d="M446 60l61 7 24 179-54 14-33-43zM674 60l-59 7-24 179 54 14 33-43z" fill="#e38035" stroke="#824024" stroke-width="3"/><path d="M443 201h238m-232 25h222" stroke="#373c3e" stroke-width="9"/>');
  if(id==='dive')panels.push('<path d="M431 64l40-11 57 196m157-185-40-11-57 195" fill="none" stroke="#101b24" stroke-width="18"/>');
  art=art.replace(marks,panels.join('')+marks).replace(/<text id="unit-lettering"[^>]*>POLICE<\/text>/,tag=>
    tag.replace('>POLICE<','>'+style.label+'<').replace('font-size="31"','font-size="'+Math.min(31,Math.round(200/style.label.length))+'"'));
  if(id==='detective'){
    const start=art.indexOf(marks),end=art.indexOf('<!-- Swatches');
    const suit='<path d="M507 19h106l-52 152Z" fill="#dbd8cb"/><path d="M537 25l23 20 22-19-17 30 10 77-14 22-13-22 8-76Z" fill="#524454"/><path d="M496 20l-18 49 22 7-11 18 72 86-47-159Zm128 0 20 48-23 8 13 19-71 85 45-159Z" fill="#475052" stroke="#262e31" stroke-width="2"/><path d="M561 177v220m-54-204 37-3m63 1 34-3" stroke="#232b2b" stroke-width="3"/><circle cx="560" cy="200" r="4" fill="#25282b"/><use xlink:href="#shield" transform="translate(610 143) scale(.70)"/>';
    art=art.slice(0,start)+suit+art.slice(end);
  }
  const webp=convert('magick',['png:-','-quality','94','-define','webp:method=6','webp:-'],raster(art,1536));
  await writeFile(new URL('patrol-'+(id==='patrol'?'jacket':id)+'.webp',tex),webp);
}

// The same cloth responds to light on every wardrobe. Encode its UV-space
// slopes once, flipping image Y to match the mesh's upward V axis.
const size=1024, relief=await readFile(new URL('../data/patrol-cloth-relief.svg',import.meta.url));
const height=convert('magick',['png:-','-depth','8','gray:-'],raster(relief,size));
const rgb=Buffer.alloc(size*size*3);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(height[y*size+Math.max(0,x-1)]-height[y*size+Math.min(size-1,x+1)])*.025;
  const dy=(height[Math.min(size-1,y+1)*size+x]-height[Math.max(0,y-1)*size+x])*.025;
  const length=Math.hypot(dx,dy,1), i=(y*size+x)*3;
  rgb[i]=Math.round(127.5*(1+dx/length));
  rgb[i+1]=Math.round(127.5*(1+dy/length));
  rgb[i+2]=Math.round(127.5*(1+1/length));
}
await writeFile(new URL('patrol-cloth-normal.webp',tex),convert('magick',[
  '-size',size+'x'+size,'-depth','8','rgb:-','-define','webp:lossless=true','webp:-'],rgb));
