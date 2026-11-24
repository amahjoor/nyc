import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleStreetChat,warmStreetChat} from './street-chat.mjs';
import {handlePhoneChat} from './phone-chat.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const port=Number(process.env.PORT||5173);
const types={'.mjs':'text/javascript; charset=utf-8','.wasm':'application/wasm','.mp3':'audio/mpeg','.flac':'audio/flac','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    let pathname=decodeURIComponent(url.pathname);
    if(pathname==='/' && /(?:^|; )cj-review=puns(?:;|$)/.test(req.headers.cookie || '')){
      res.writeHead(302,{Location:'/__puns/'+url.search,'Cache-Control':'no-store'});res.end();return;
    }
    if(pathname.startsWith('/__puns/')) pathname=pathname.slice('/__puns'.length);
    if(pathname==='/release-mode.js'){
      res.writeHead(200,{'Content-Type':types['.js'],'Cache-Control':'no-store'});
      res.end('export const publicBuild = false;');return;
    }
    if(pathname==='/internal-brand-settings.js'){
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
      res.end(await readFile(new URL('./internal-brand-settings.js',import.meta.url)));return;
    }
    if(pathname==='/api/street/warm'){await warmStreetChat(req,res);return;}
    if(pathname==='/api/street/chat'){await handleStreetChat(req,res);return;}
    if(pathname==='/api/phone/maya' || pathname==='/api/phone/contact'){await handlePhoneChat(req,res);return;}
    let path=resolve(root,'.'+pathname);
    if(path!==resolve(root)&&!path.startsWith(resolve(root)+sep)){res.writeHead(403);res.end('Forbidden');return;}
    let info=await stat(path);
    if(info.isDirectory()){path=resolve(path,'index.html');info=await stat(path);}
    if(path===resolve(root,'index.html')){
      const html=await readFile(path,'utf8');
      res.writeHead(200,{'Content-Type':types['.html'],'Cache-Control':'no-store'});
      res.end(html.replace('</body>','<script type="module" src="/internal-brand-settings.js"></script></body>'));return;
    }
    // The browser asks every time (no-cache) but is told when its copy is still good: a reload then re-reads none of the data.
    const tag=`"${info.size.toString(16)}-${Math.round(info.mtimeMs).toString(16)}"`;
    const headers={'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','ETag':tag};
    if(req.headers['if-none-match']===tag){res.writeHead(304,headers);res.end();return;}
    const body=await readFile(path);res.writeHead(200,headers);res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}`));
