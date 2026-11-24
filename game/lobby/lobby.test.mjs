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

test('friends share one street scene, retain it on late join and elect a new publisher on departure',async t=>{
  const lobby=createLobby({clock:()=>5000});t.after(()=>lobby.close());
  lobby.server.listen(0,'127.0.0.1');await once(lobby.server,'listening');
  const url='ws://127.0.0.1:'+lobby.server.address().port+'/lobby';
  async function join(){
    const ws=new WebSocket(url,PROTOCOL);
    const {id}=await wait(ws,m=>m.type==='welcome');
    return {ws,id,send:(...parts)=>ws.send(JSON.stringify(parts))};
  }
  const car=['patrol-A','police',12,3,20,.1,4,'#ccddee','suv','Ford','Explorer',2020,'patrol',4,0,0,0,0,1,0,0,0,'','suv'];
  const actor=[10,3,21,.1,230,1.8,0,0,0,0,0,'walk',.3,.7,.8,8,'',1,0];
  const scene={cars:[car],actors:[actor],bikes:[],air:[0,60,20,.1,2,0,11,25,0],
    doors:[['shop42',.5,.2]],glass:[['shop42','door']],equipment:[['unit1','motor',10,3,20,.3]],props:[]};
  const a=await join();a.send('state',10,3,20,0,0,'street',0);
  await wait(a.ws,m=>m.type==='city' && m.host===a.id);
  a.send('appearance',{v:2,height:1.97,topColour:'#191919'});
  a.send('scene',scene);
  const b=await join();
  const first=wait(b.ws,m=>m.type==='scene'), design=wait(b.ws,m=>m.type==='appearance');
  b.send('state',13,3,20,0,0,'street',1);
  assert.deepEqual((await first).frame,scene);assert.equal((await design).design.height,1.97);
  const action=wait(a.ws,m=>m.type==='contact');
  b.send('contact',a.id,['door','shop42',1,.2,'']);assert.equal((await action).source.x,13);
  b.send('motion',null,car,true,0);
  const motion=await wait(a.ws,m=>m.type==='city' && m.motion.some(row=>row[2]));
  assert.deepEqual(motion.motion[0][2],car);assert.equal(motion.seconds,0);
  const denied=wait(a.ws,m=>m.type==='occupied');a.send('motion',null,car,true,0);
  assert.equal((await denied).car,car[0]);
  b.send('state',13,3,20,0,0,'room/shop42',1);
  await wait(b.ws,m=>m.type==='city' && m.host===b.id && m.space==='room/shop42');
  const returning=wait(b.ws,m=>m.type==='scene' && m.host===a.id);
  b.send('state',13,3,20,0,0,'street',1);assert.deepEqual((await returning).frame,scene);
  a.ws.close();await wait(b.ws,m=>m.type==='city' && m.host===b.id);
  const c=await join();const second=wait(c.ws,m=>m.type==='scene');
  b.send('scene',{...scene,cars:[]});c.send('state',11,3,20,0,0,'street',1);
  assert.deepEqual((await second).frame.cars,[]);
});
