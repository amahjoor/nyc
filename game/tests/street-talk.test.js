import { reactionKind, noteContact } from '../dist/street-reactions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Work} from '../dist/work.js';
import {encounter,savedConversations,streetReply} from '../dist/street-talk.js';
import {chatFrames} from '../dist/chat-stream.js';

function fixture(reply) {
  const person={state:'walk',resident:{id:71}},sim={player:{},cash:0};
  let panel,available=true,opens=0,pin,saves=0;
  const work=new Work({sim,phone:()=>({}),pedestrian:()=>person,hours:()=>18,canTalk:()=>available,
    talkPlace:()=>({name:'Corner Slice',x:10,z:30}),guide:site=>{pin=site;},talkReply:reply,
    meet:(title,message,rows,valid,kitchen,slip,onClose)=>{panel={rows,onClose};},
    save:()=>saves++,openTalk:(name,check,closed)=>{
      opens++;panel={name,close:closed,partial:text=>{panel.preview=text;},render(rows,options,pending,send){Object.assign(panel,{rows,options,pending,send});}};
      return panel;
    }});
  function open(){work.street();const menu=panel;menu.onClose();menu.rows.find(r=>r.name==='Talk for a while').choose();}
  return {work,sim,person,open,get panel(){return panel;},get pin(){return pin;},get saves(){return saves;},depart(){available=false;}};
}

test('a returning NPC keeps player details and suggests a real map action that requires selection',async()=>{
  const contexts=[];
  const f=fixture(async(identity,facts,rows,signal,partial)=>{
    contexts.push({facts,rows:structuredClone(rows)});partial('Corner');
    return {text:'Corner Slice is around here.',followUp:'What do you order there?',action:'map'};
  });
  f.open();
  await f.panel.send('My name is Jules. Where can I get pizza?');
  assert.equal(f.panel.preview,'Corner');
  assert.equal(f.work.record.conversations[0].playerName,'Jules');
  assert.equal(f.pin,undefined);
  f.panel.options.find(r=>r.name==='Show Corner Slice on map').choose();
  assert.equal(f.person.talkingTo,undefined);assert.equal(f.pin.name,'Corner Slice');
  f.work.restore(structuredClone(f.work.record));f.open();
  await f.panel.send('Do you remember my name?');
  assert.equal(contexts[1].facts.playerName,'Jules');
  assert.ok(contexts[1].rows.some(r=>r.text.includes('Where can I get pizza')));
  assert.equal(f.work.record.conversations.length,1);
});

test('closing an encounter cancels its request and late replies cannot alter the next conversation',async()=>{
  let resolve, calls=0,signal;
  const f=fixture((identity,facts,rows,s)=>{calls++;signal=s;return new Promise(done=>{resolve=done;});});
  f.open();const pending=f.panel.send('Hi there.');
  await f.panel.send('Second message');
  assert.equal(calls,1);f.panel.close();f.open();assert.ok(signal.aborted);
  resolve({text:'A late reply.',followUp:'Did that go through?',action:'coffee'});await pending;
  assert.equal(f.saves,0);assert.ok(f.panel.rows.every(r=>r.text!=='A late reply.'));
});

test('unavailable model still supplies an actionable local reply, and saved dialogue is bounded',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('offline',{status:503}));
  const f=fixture(streetReply);f.open();await f.panel.send('Any places nearby?');
  assert.match(f.panel.rows.at(-1).text,/Corner Slice/);
  assert.ok(f.panel.options.some(r=>r.name==='Show Corner Slice on map'));
  const rows=[];
  for(let i=0;i<40;i++)encounter(rows,'resident/'+i).rows=Array.from({length:16},()=>({who:'me',text:'test'}));
  assert.equal(rows.length,32);const restored=savedConversations(rows);
  assert.equal(restored[0].key,'resident/8');assert.equal(restored[0].rows.length,10);
  assert.deepEqual(savedConversations(undefined),[]);
});

test('stream frames survive split UTF-8 characters and missing final newline',async()=>{
  const bytes=new TextEncoder().encode('{"partial":"café"}\n{"reply":"done"}');
  const body=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}});
  const result=[];for await(const row of chatFrames(body))result.push(row);
  assert.deepEqual(result,[{partial:'café'},{reply:'done'}]);
});

test('selecting the change suggestion runs one street transaction and resumes the same conversation',async()=>{
  const f=fixture(async()=>({text:'Let me check my pockets.',followUp:'Can I ask you something else?',action:'change'}));
  f.sim._say=()=>{};
  f.work.random=()=>.75;
  f.open();await f.panel.send('Can you spare a dollar?');
  assert.equal(f.sim.cash,0);
  const action=f.panel.options.find(option=>option.name==='Ask for spare change');
  action.choose();action.choose();
  assert.equal(f.sim.cash,4);
  assert.equal(reactionKind(f.panel.rows.at(-1).text),'give');
  assert.equal(f.person.talkingTo,f.sim.player);
  assert.equal(f.work.record.conversations[0].pastEncounter,'You gave the player spare change.');
});

test('speech can start before suggestions arrive, plays once, and stops when the conversation closes',async()=>{
  let finish;
  const turn={text:'The puddles caught the neon.',phones:[1,0,2],followUp:'Which signs caught your eye?'};
  const f=fixture(async(_identity,_facts,_rows,_signal,partial,speech)=>{
    partial(turn.text);speech(turn);
    await new Promise(resolve=>{finish=resolve;});
    return turn;
  });
  const spoken=[];
  f.work.speak=(_person,text,_phones,signal)=>spoken.push({text,signal});
  f.open();const pending=f.panel.send('What was the light like?');
  assert.equal(f.panel.pending,true);
  assert.equal(spoken.at(-1).text,turn.text);
  finish();await pending;
  assert.equal(spoken.filter(row=>row.text===turn.text).length,1);
  f.panel.close();assert.equal(spoken.at(-1).signal.aborted,true);
});

test('simultaneous warmups share a model load and recover when GPU allocation fails',async t=>{
  const {warmStreetChat}=await import('../scripts/street-chat.mjs');
  const options=[];let fail;
  t.mock.method(globalThis,'fetch',async (_url,request)=>{
    const payload=JSON.parse(request.body);
    options.push(payload.options.num_gpu);
    assert.deepEqual(payload.messages,[]);
    if(options.length===1){await new Promise(resolve=>{fail=resolve;});return new Response('GPU allocation failed',{status:500});}
    return new Response('{}');
  });
  const req={method:'POST',headers:{'content-type':'application/json'}};
  const response=()=>({writeHead(status){this.status=status;},end(){}});
  const a=response(),b=response();
  const requests=[warmStreetChat(req,a),warmStreetChat(req,b)];fail();
  await Promise.all(requests);
  assert.equal(a.status,204);assert.equal(b.status,204);
  assert.ok(options[0]!==0);
  assert.deepEqual(options.slice(1),[0]);
});

test('saving an offered number connects the same street identity to phone history on a later visit',async()=>{
  const history={bond:'Close friends',mood:'Guarded',unresolvedConflict:'You ditched me.'};
  const contexts=[];let saved;
  const f=fixture(async(identity,facts,rows)=>{
    contexts.push(facts);
    return {text:'Yeah, let’s keep in touch.',action:rows.at(-1).text.includes('numbers')?'number':null};
  });
  f.work.phone=()=>({
    exchangeNumbers(identity,entry){saved={identity,rows:[...entry.rows]};},
    contactHistory(key){return key===saved?.identity.key ? history : null;},
  });
  f.open();
  await f.panel.send('How’s your day?');
  await f.panel.options.find(option=>option.name==='Ask to exchange numbers').choose();
  assert.ok(contexts.at(-1).actions.includes('number'));
  assert.equal(saved,undefined);
  f.panel.options.find(option=>option.name.startsWith('Save ')).choose();
  assert.equal(saved.identity.key,'resident/71');
  assert.equal(saved.rows.at(-2).text,'Want to exchange numbers?');
  f.open();await f.panel.send('about last night');
  assert.deepEqual(contexts.at(-1).phoneHistory,history);
  assert.ok(!contexts.at(-1).actions.includes('number'));
});

test('a second shove changes the opening and an apology resolves it immediately without calling the model', async () => {
  const contexts=[];
  const f=fixture(async(_identity,facts)=>{contexts.push(facts);return {text:'I hear you.'};});
  f.sim.elapsed=4;noteContact(f.person,6,0);noteContact(f.person,4,4);
  f.open();assert.equal(reactionKind(f.panel.rows.at(-1).text),'wary');
  await f.panel.send('What just happened?');assert.match(contexts[0].recentContact,/repeatedly/);
  f.panel.options.find(o=>o.name==='Sorry I bumped into you.').choose();
  assert.equal(reactionKind(f.panel.rows.at(-1).text),'apology');
  assert.equal(contexts.length,1);assert.equal(f.person.streetContact,undefined);
  assert.ok(!f.panel.options.some(o=>o.name==='Sorry I bumped into you.'));
});
