import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createLobby} from './server.mjs';
import {PROTOCOL,SPRINT} from '../dist/lobby-protocol.js';
import WebSocket from 'ws';

function wait(ws, condition) {
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{ws.off('message',read);reject(Error('Lobby message timed out'));},3000);
    function read(bytes){const msg=JSON.parse(bytes);if(condition(msg)){clearTimeout(timeout);ws.off('message',read);resolve(msg);}}
    ws.on('message',read);
  });
}
test('two clients meet, move, signal, change interiors, race and disconnect',async t=>{
  let clock=0;
  const lobby=createLobby({limit:2,clock:()=>clock});t.after(()=>lobby.close());
  lobby.server.listen(0,'127.0.0.1');await once(lobby.server,'listening');
  const url='ws://127.0.0.1:'+lobby.server.address().port+'/lobby';
  const a=new WebSocket(url,PROTOCOL),b=new WebSocket(url,PROTOCOL);
  await Promise.all([a,b].map(ws=>wait(ws,m=>m.type==='welcome')));
  const state=(ws,x,z,mode=0,space='street')=>ws.send(JSON.stringify(['state',x,3,z,0,mode,space,2]));
  state(a,10,20);state(b,12,20,2);
  const nearby=await wait(a,m=>m.near?.length===1);
  assert.equal(nearby.online,2);assert.equal(nearby.near[0][6],2);
  b.send('["signal",0]');await wait(a,m=>m.near?.[0]?.[8]===0);
  state(b,12,20,0,'room/o1');await wait(a,m=>m.near?.length===0);
  state(b,10000,20000);await wait(a,m=>m.near?.length===0);
  b.send('["sprint"]');await wait(b,m=>m.type==='race' && m.gate===0);
  state(b,SPRINT[0].x,SPRINT[0].z);await wait(b,m=>m.type==='race' && m.gate===1);
  state(b,SPRINT[1].x,SPRINT[1].z);await wait(b,m=>m.type==='race' && m.interrupted);
  b.send('["sprint"]');await wait(b,m=>m.type==='race' && m.gate===0);
  for(const [i,p] of SPRINT.entries()){
    clock+=10000;
    state(b,p.x,p.z);await wait(b,m=>i===SPRINT.length-1?m.type==='finish':m.type==='race'&&m.gate===i+1);
  }
  b.close();await wait(a,m=>m.online===1 && m.best?.ms===20000);
  const bad=once(a,'close');a.send('["state",null,0,0,0,0,"street",0]');assert.equal((await bad)[0],1008);
});
