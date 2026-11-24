import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run=promisify(execFile);

// Runs inside Chromium. Color the support skin and sleeve magenta and the thumb
// green so we can measure what was actually composited over the DOM handset.
async function checkPixels(){
  const T=await import('/vendor/three.module.min.js');
  const {createHuman}=await import('/human.js'),{setHandSource,viewHand}=await import('/view-hand.js');
  const {createPhoneHand}=await import('/phone-hand.js');
  const load=async(name,method)=>(await fetch('/'+name))[method]();
  const human=createHuman(...await Promise.all([load('human/human.json','json'),load('human/body.bin','arrayBuffer'),
    load('human/parts.bin','arrayBuffer'),load('motion.json','json')]));
  const skin=new T.MeshBasicMaterial(),sleeve=new T.MeshBasicMaterial({color:0xff00ff});
  const built=human.build({height:1.76},{detail:'close'});
  setHandSource(built,built.pieces.map(p=>({name:p.kind+'/'+p.id,material:p.kind==='skin'?skin:sleeve})));
  const source=viewHand('r');source.pose('phone');
  const bones=source.group.children[0].skeleton.bones;
  const first=bones.findIndex(b=>b.name.startsWith('thumb_')),last=bones.findLastIndex(b=>b.name.startsWith('thumb_'));
  skin.onBeforeCompile=shader=>{
    shader.vertexShader='varying float thumb;\n'+shader.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>\nthumb=dot(skinWeight,step(vec4(${first}.0),skinIndex)*step(skinIndex,vec4(${last}.0)));`);
    shader.fragmentShader='varying float thumb;\n'+shader.fragmentShader.replace('#include <dithering_fragment>',
      'gl_FragColor=thumb<.15?vec4(1,0,1,1):vec4(0,1,0,1);');
  };
  const phone=document.querySelector('#phone'),canvas=document.querySelector('#phone-thumb'),hand=createPhoneHand(1,2,phone);
  const camera=new T.PerspectiveCamera(),scene=new T.Scene(),sample=document.createElement('canvas'),ctx=sample.getContext('2d');
  for(const height of [360,618])for(const target of [null,[.1,.1],[.5,.5],[.8,.75]]){
    phone.style.height=height+'px';
    if(target)hand.tap(...target,true);
    hand.advance(1,true,Boolean(target),true);
    if(!target)hand.advance(1,true,false,true);
    const rect=phone.getBoundingClientRect();
    hand.cameraGrip(camera,scene,rect,innerWidth,innerHeight,{isWebGLRenderer:true});
    const image=canvas.getBoundingClientRect();
    sample.width=canvas.width;sample.height=canvas.height;ctx.drawImage(canvas,0,0);
    const rgba=ctx.getImageData(0,0,sample.width,sample.height).data;
    const radius=parseFloat(getComputedStyle(phone).borderTopLeftRadius);
    let touch=0,grip=0;
    for(let y=0;y<sample.height;y+=3)for(let x=0;x<sample.width;x+=3){
      const i=(y*sample.width+x)*4;if(rgba[i+3]<240)continue;
      const px=image.left+(x+.5)*image.width/sample.width-rect.left,py=image.top+(y+.5)*image.height/sample.height-rect.top;
      const dx=Math.abs(px-rect.width/2)-rect.width/2+radius,dy=Math.abs(py-rect.height/2)-rect.height/2+radius;
      const edge=Math.hypot(Math.max(0,dx),Math.max(0,dy))+Math.min(0,Math.max(dx,dy))-radius;
      if(rgba[i]>220 && rgba[i+2]>220){
        if(edge < -2)throw Error('Support skin inside phone at '+[px,py,target,height]);
        if(edge > 2)grip++;
      }else if(edge < -2 && rgba[i+1]>220 && (!target || Math.hypot(px-target[0]*rect.width,py-target[1]*rect.height)<12))touch++;
    }
    if(!touch || !grip)throw Error('Missing thumb or exterior grip at '+[target,height]);
  }
}

test('the rendered handset occludes the supporting hand and preserves thumb contact',async t=>{
  try{await run('chromium',['--version']);}catch(error){if(error.code==='ENOENT')return t.skip('Chromium unavailable');throw error;}
  const page=`<link rel="stylesheet" href="/phone.css"><div id="phone" class="phone" style="transition:none"><canvas id="phone-thumb"></canvas></div>
    <output>pending</output><script type="module">(${checkPixels})().then(()=>document.querySelector('output').textContent='passed',
    e=>document.querySelector('output').textContent=String(e));</script>`;
  const dist=new URL('../dist/',import.meta.url);
  const server=createServer(async(req,res)=>{
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(page);return;}
    try{
      const file=new URL('.'+req.url,dist);
      if(!file.href.startsWith(dist.href))throw Error('Outside dist');
      res.setHeader('Content-Type',file.pathname.endsWith('.js')?'text/javascript':file.pathname.endsWith('.css')?'text/css':'application/octet-stream');
      res.end(await readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const profile=await mkdtemp(join(tmpdir(),'phone-occlusion-'));t.after(()=>rm(profile,{recursive:true,force:true}));
  const {stdout}=await run('chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader','--window-size=1100,800','--disable-extensions','--user-data-dir='+profile,'--virtual-time-budget=15000','--dump-dom',
    'http://127.0.0.1:'+server.address().port],{timeout:45000,maxBuffer:2**20});
  assert.equal(stdout.match(/<output>([^<]*)<\/output>/)?.[1],'passed');
});
