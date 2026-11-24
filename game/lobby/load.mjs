// A bounded local capacity benchmark. Always starts its own loopback server.
import {once} from 'node:events';
import WebSocket from 'ws';
import {createLobby} from './server.mjs';
import {PROTOCOL,MAX_NEARBY,TICK_MS} from '../dist/lobby-protocol.js';
const count=Number(process.argv[2] || 256), ticks=100;
if(!Number.isInteger(count)||count<2||count>1024)throw Error('Choose 2–1024 loopback clients');
const lobby=createLobby({limit:count});lobby.server.listen(0,'127.0.0.1');await once(lobby.server,'listening');
const url='ws://127.0.0.1:'+lobby.server.address().port+'/lobby';
const peers=[];let frames=0,bytes=0,largest=0,counting=false;
try {
  for(let base=0;base<count;base+=32)await Promise.all(Array.from({length:Math.min(32,count-base)},async(_,j)=>{
    const i=base+j,ws=new WebSocket(url,PROTOCOL);
    peers[i]=ws;
    ws.on('message',data=>{
      const m=JSON.parse(data);
      if(counting&&m.type==='snapshot'){frames++;bytes+=data.length;largest=Math.max(largest,m.near.length);}
    });
    await once(ws,'open');
  }));
  const state=t=>peers.forEach((ws,i)=>ws.send(JSON.stringify(['state',i%25+t*.13,2,Math.floor(i/25),.1,1,'street',i%8])));
  state(0);await new Promise(r=>setTimeout(r,400));counting=true;
  const start=performance.now();
  for(let t=0;t<ticks;t++){state(t);await new Promise(r=>setTimeout(r,TICK_MS));}
  const seconds=(performance.now()-start)/1000;
  console.log(JSON.stringify({clients:count,seconds:+seconds.toFixed(2),snapshots:frames,
    snapshotsPerSecondPerClient:+(frames/count/seconds).toFixed(2),maxNearby:largest,
    outgoingPayloadMbitPerSecond:+(bytes*8/seconds/1e6).toFixed(2)}));
  if(peers.some(ws=>ws.readyState!==WebSocket.OPEN) || largest!==Math.min(MAX_NEARBY,count-1) || frames<count*ticks*.9)
    throw Error('Incomplete benchmark');
}finally{peers.forEach(ws=>ws.terminate());await lobby.close();}
