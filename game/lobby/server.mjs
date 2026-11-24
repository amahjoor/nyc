import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {WebSocketServer, WebSocket} from 'ws';
import {LEGACY_PROTOCOL,PROTOCOL,TICK_MS,RADIUS,MAX_NEARBY,MODES,SIGNALS,SPRINT,COLOURS} from '../dist/lobby-protocol.js';

import { SCENE_INTERVAL, SCENE_RADIUS, validCar, validScene, validPane } from '../dist/shared-scene.js';

const streets = ['Canal','Mulberry','Vestry','Bleecker','Mercer','Orchard','Prince','Bowery'];
const gridKey = (x,z) => Math.floor(x/RADIUS)+','+Math.floor(z/RADIUS);
const send = (socket, message) => socket.send(JSON.stringify(message));
const bounded = (value,limit) => Number.isFinite(value) && Math.abs(value)<=limit;
const withinGate = (p, gate) => p.space==='street' && Math.hypot(p.x-gate.x,p.z-gate.z)<17;

export function createLobby({limit=512, origins=null, clock=()=>performance.now()}={}) {
  if (!Number.isInteger(limit) || limit<1 || limit>4096) throw Error('Capacity must be 1–4096');
  const players = new Map();
  const startedAt=clock();
  let nextId = 1, best = null;
  const server = createServer((req,res)=>{
    if(req.method==='GET' && req.url==='/health'){
      res.writeHead(200,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({protocol:PROTOCOL,online:players.size,capacity:limit}));
    }
    res.writeHead(404);res.end();
  });
  const sockets = new WebSocketServer({noServer:true,maxPayload:128*1024,perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,concurrencyLimit:4},
    handleProtocols:offered=>offered.has(PROTOCOL) ? PROTOCOL : offered.has(LEGACY_PROTOCOL) && LEGACY_PROTOCOL});
  server.on('upgrade',(req,socket,head)=>{
    const offered=(req.headers['sec-websocket-protocol'] || '').split(',').map(v=>v.trim());
    if(req.url!=='/lobby' || !offered.some(value=>value===PROTOCOL || value===LEGACY_PROTOCOL) ||
      (origins && !origins.has(req.headers.origin)) || players.size>=limit){
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws));
  });
  function raceUpdate(p) {
    if(p.gate===null)return;
    const now=clock();
    if(p.gate>0){
      const last=SPRINT[p.gate-1];
      // Allow the width of both gates and packet jitter at highway speeds.
      const distance=Math.hypot(p.x-last.x,p.z-last.z);
      if(p.space!=='street' || distance>34+80*(.25+(now-p.gateAt)/1000)){
        p.gate=null;send(p.ws,{type:'race',gate:null,interrupted:true});return;
      }
    }
    if(!withinGate(p,SPRINT[p.gate]))return;
    if(!p.gate)p.start=now;
    p.gateAt=now;
    p.gate++;
    if(p.gate===SPRINT.length){
      const ms=Math.round(now-p.start);
      p.gate=null;
      if(!best || ms<best.ms) best={name:p.name,ms};
      send(p.ws,{type:'finish',ms});
    }else send(p.ws,{type:'race',gate:p.gate});
  }
  sockets.on('connection',ws=>{
    const id=nextId++,name=streets[(id-1)%streets.length]+' '+id;
    const p={ws,id,name,space:'',x:0,y:0,z:0,angle:0,mode:0,tint:(id-1)%COLOURS.length,
      signal:-1,signalAt:-Infinity,gate:null,alive:true,rate:0,window:Date.now(),seen:false};
    Object.assign(p,{modern:ws.protocol===PROTOCOL,host:0,scene:null,sceneAt:0,profile:null,revision:0,
      profiles:new Map(),pose:null,ride:null,awake:true,heat:0,lastState:0});
    players.set(id,p);
    send(ws,{type:'welcome',id,name,capacity:limit});
    ws.on('pong',()=>{p.alive=true;});
    ws.on('error',()=>ws.terminate());
    ws.on('close',()=>players.delete(id));
    ws.on('message',(bytes,binary)=>{
      if(ws.readyState!==WebSocket.OPEN) return;
      const now=Date.now();
      if(now-p.window>=1000){p.rate=0;p.window=now;}
      if(++p.rate>60 || binary) return ws.close(1008,'Invalid input rate or type');
      let m;
      try{m=JSON.parse(bytes);}catch{return ws.close(1007,'Invalid JSON');}
      if(!Array.isArray(m)) return ws.close(1008,'Invalid message');
      if(m[0]==='state'){
        const [,x,y,z,angle,mode,space,tint]=m;
        if(m.length!==8 || !bounded(x,65000) || !bounded(z,65000) || !bounded(y,2500) ||
          !bounded(angle,100) || !Number.isInteger(mode) || !MODES[mode] ||
          !Number.isInteger(tint) || tint<0 || tint>=COLOURS.length ||
          typeof space!=='string' || !/^[a-z0-9:,._/-]{1,80}$/i.test(space)) return ws.close(1008,'Invalid position');
        if(p.space!==space || Math.hypot(p.x-x,p.z-z)>SCENE_RADIUS){
          p.host=0;p.scene=null;p.lastScene=0;p.ride=null;
        }
        Object.assign(p,{x,y,z,angle,mode,space,tint,seen:true});
        p.lastState=now;
        raceUpdate(p);
      }else if(p.modern && m[0]==='appearance'){
        if (!m[1] || m[1].v!==2 || bytes.length>16384 ||
            p.profile && now-p.profileAt<500) return;
        p.profile=m[1];p.profileAt=now;p.revision++;
      }else if(p.modern && m[0]==='motion'){
        const [,pose,ride,awake,heat]=m;
        if (pose!==null && !(Array.isArray(pose) && pose.length===8 &&
          pose.slice(0,7).every(n=>bounded(n,10)) && typeof pose[7]==='string' &&
          pose[7].length<=1024 && pose[7].length%4===0 && /^[A-Za-z0-9+/]+={0,2}$/.test(pose[7]))) return;
        if (ride!==null && (!validCar(ride) || Math.hypot(ride[2]-p.x,ride[4]-p.z)>15))return;
        const occupied=ride && [...players.values()].some(other=>other!==p && other.space===p.space &&
          other.ride?.[0]===ride[0] && Math.hypot(other.x-p.x,other.z-p.z)<=SCENE_RADIUS);
        if(occupied && !p.rejected)send(ws,{type:'occupied',car:ride[0]});
        p.rejected=occupied;
        p.pose=pose;p.ride=occupied?null:ride;p.awake=awake===true;p.heat=bounded(heat,100)?heat:0;
      }else if(p.modern && m[0]==='scene' && p.host===p.id && now-p.sceneAt>=SCENE_INTERVAL*.75){
        if (!validScene(m[1]))return;
        p.scene=m[1];p.sceneAt=now;
      }else if(p.modern && m[0]==='contact' && m[1]===p.host && p.host!==p.id){
        const h=players.get(p.host), e=m[2];
        if(!h || h.space!==p.space || !Array.isArray(e) || e.length!==5)return;
        const [kind,key,x,z,zone]=e;
        const ok=kind==='prop'?typeof key==='string' && key.length<=96 && bounded(x,100) && bounded(z,100) &&
          Array.isArray(zone) && zone.length===3 && bounded(zone[0],1) && bounded(zone[1],1) && typeof zone[2]==='boolean':
          kind==='glass'?typeof key==='string' && key.length<=96 && validPane(zone) && x===0 && z===0:
          kind==='window'?typeof key==='string' && key.length<=96 && [1,2,4,8,32,64].includes(x) && bounded(z,4) && zone==='':
          kind==='door'?typeof key==='string' && key.length<=96 && bounded(x,2) && bounded(z,12) && zone==='':
          Number.isSafeInteger(key) && key>0 && (kind==='shot' && ['head','torso','legs'].includes(zone) && bounded(x,1) && bounded(z,1) ||
          kind==='strike' && bounded(x,100) && z===0 && zone==='');
        if(ok){p.contactAt=now;send(h.ws,{type:'contact',event:e,space:p.space,source:{x:p.x,y:p.y,z:p.z}});}
      }else if(m[0]==='signal' && Number.isInteger(m[1]) && SIGNALS[m[1]] && now-p.signalAt>1500){
        p.signal=m[1];p.signalAt=now;
      }else if(m[0]==='sprint' && p.gate===null){
        p.gate=0;send(ws,{type:'race',gate:0});
      }else if(m[0]==='cancel'){
        p.gate=null;send(ws,{type:'race',gate:null});
      }
    });
  });
  const tick=setInterval(()=>{
    const grid=new Map(), localLists=new Map(), now=Date.now();
    const heading='{"type":"snapshot","online":'+players.size+',"best":'+JSON.stringify(best)+',"near":[';
    for(const p of players.values()) {
      if(!p.seen) continue;
      const key=gridKey(p.x,p.z);
      if(!grid.has(key))grid.set(key,[]);
      grid.get(key).push(p);
      p.row=JSON.stringify([p.id,p.name,Math.round(p.x*10)/10,Math.round(p.y*10)/10,Math.round(p.z*10)/10,
        Math.round(p.angle*100)/100,p.mode,p.tint,now-p.signalAt<3000?p.signal:-1]);
    }
    // Elect once per neighbourhood. An active pursuit or an unpaused client can
    // take over; late joiners otherwise keep the existing publisher.
    const candidates=[...players.values()].filter(p=>p.modern && p.seen && p.space!=='travel' && now-p.lastState<4000);
    candidates.sort((a,b)=>Number(b.awake)-Number(a.awake) || b.heat-a.heat ||
      Number(b.host===b.id)-Number(a.host===a.id) || a.id-b.id);
    const eligible=new Set(candidates);
    for(const p of players.values())if(!eligible.has(p)){p.host=0;p.scene=null;p.lastScene=0;}
    const hosts=[];
    for(const p of candidates){
      const host=hosts.find(h=>h.space===p.space && Math.hypot(h.x-p.x,h.z-p.z)<=SCENE_RADIUS) || p;
      if(host===p)hosts.push(p);
      if(p.host!==host.id){p.scene=null;p.lastScene=0;}
      p.host=host.id;
    }
    for(const p of players.values()){
      if(p.ws.readyState!==WebSocket.OPEN || p.ws.bufferedAmount>128*1024)continue;
      const nearby=[], visible=[];
      if(p.seen && p.space!=='travel'){
        // Players on one block can share a distance ordering. The individual
        // radius check at its edge stays exact and dense crowds stay bounded.
        const bx=Math.floor(p.x/24),bz=Math.floor(p.z/24),key=p.space+':'+bx+','+bz;
        let candidates=localLists.get(key);
        if(!candidates){
          const cx=bx*24+12,cz=bz*24+12;
          candidates=[];
          for(let x=Math.floor((cx-RADIUS-12)/RADIUS);x<=Math.floor((cx+RADIUS+12)/RADIUS);x++)
            for(let z=Math.floor((cz-RADIUS-12)/RADIUS);z<=Math.floor((cz+RADIUS+12)/RADIUS);z++)
              for(const other of grid.get(x+','+z)||[])if(other.space===p.space)
                candidates.push({distance:(other.x-cx)**2+(other.z-cz)**2,other});
          candidates.sort((a,b)=>a.distance-b.distance || a.other.id-b.other.id);
          localLists.set(key,candidates);
        }
        for(const {other} of candidates){
          if(other!==p && (other.x-p.x)**2+(other.z-p.z)**2<=RADIUS**2){nearby.push(other.row);visible.push(other);}
          if(nearby.length===MAX_NEARBY)break;
        }
      }
      if(p.modern){
        const visibleIds=new Set(visible.map(other=>other.id));
        for(const id of p.profiles.keys())if(!visibleIds.has(id))p.profiles.delete(id);
        for(const other of visible)if(other.profile && p.profiles.get(other.id)!==other.revision){
          send(p.ws,{type:'appearance',id:other.id,design:other.profile});
          p.profiles.set(other.id,other.revision);
        }
        const host=players.get(p.host);
        if(host?.scene && p!==host && p.space===host.space && p.lastScene!==host.sceneAt){
          send(p.ws,{type:'scene',host:host.id,space:p.space,frame:host.scene});p.lastScene=host.sceneAt;
        }
        send(p.ws,{type:'city',host:p.host,space:p.space,seconds:(clock()-startedAt)/1000,
          motion:visible.filter(o=>o.modern).map(o=>[o.id,o.pose,o.ride])});
      }
      p.ws.send(heading+nearby.join(',')+'],"space":'+JSON.stringify(p.space)+'}');
    }
  },TICK_MS);
  const heartbeat=setInterval(()=>{
    for(const p of players.values()){
      if(!p.alive || !p.seen && Date.now()-p.window>30000){p.ws.terminate();continue;}
      p.alive=false;p.ws.ping();
    }
  },15000);
  return {server, async close(){
    clearInterval(tick);clearInterval(heartbeat);
    for(const p of players.values())p.ws.terminate();
    sockets.close();
    if(server.listening) await new Promise(resolve=>server.close(resolve));
  }};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const origins=process.env.LOBBY_ORIGINS?.split(',').map(item=>item.trim());
  const lobby=createLobby({limit:Number(process.env.LOBBY_CAPACITY||512),origins:origins?new Set(origins):null});
  lobby.server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1',()=>console.log('Lobby listening',lobby.server.address()));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void lobby.close());
}
