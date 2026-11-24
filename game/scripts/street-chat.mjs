import {groundedTurn} from '../dist/street-intent.js';
import {execFile} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {handleLocalChat, requestLocalModel} from './phone-chat.mjs';

const short = (s, limit) => typeof s === 'string' ? s.replace(/\s+/g,' ').trim().slice(0,limit) : '';
const actions = ['map','change','coffee','number'];
const format = {type:'object', properties:{
  text:{type:'string'}, followUp:{type:'string',pattern:'^(What|How|Why|When|Where|Who|Do|Did|Can|Could|Is|Was|Would) [^?]{3,84}\\?$'}, action:{type:'string',enum:['none',...actions]},
}, required:['text','followUp','action']};

const streetModel=process.env.NPC_CHAT_MODEL?.trim() || 'qwen2.5:0.5b';
const keepAlive='15m';
let tryGpuAfter=0, warming;

async function infer(payload,signal) {
  // The small stock model fits this game's graphics card. Let Ollama size
  // custom models itself, and recover on machines with no usable GPU memory.
  const layers=Date.now()<tryGpuAfter ? 0 : streetModel==='qwen2.5:0.5b' ? 99 : -1;
  const run=num_gpu=>requestLocalModel({...payload,options:{...payload.options,num_gpu}},signal);
  const response=await run(layers);
  if (layers===0 || response.status!==500 || signal.aborted) return response;
  await response.body?.cancel();
  const cpu=await run(0);
  if(cpu.ok) tryGpuAfter=Date.now()+5*60_000;
  return cpu;
}

export async function warmStreetChat(req,res) {
  if(req.method!=='POST' || req.headers['content-type']?.split(';')[0]!=='application/json'){
    res.writeHead(req.method==='POST'?415:405);res.end();return;
  }
  if(!warming) {
    warming=infer({model:streetModel,messages:[],stream:false,keep_alive:keepAlive,
      options:{num_ctx:2048,num_thread:1}},AbortSignal.timeout(30000))
      .then(async response=>{await response.arrayBuffer();return response.ok;})
      .catch(()=>false).finally(()=>{warming=null;});
  }
  const ok=await warming;
  if(!res.destroyed){res.writeHead(ok?204:503,{'Cache-Control':'no-store'});res.end();}
}

function prompt(input) {
  if (!Array.isArray(input?.rows)) return null;
  const rows = input.rows.slice(-10).flatMap(row => {
    const text = short(row?.text,240);
    return text && ['me','them'].includes(row.who) ? [{role:row.who==='me'?'user':'assistant',content:text}] : [];
  });
  if (rows.at(-1)?.role !== 'user') return null;
  const facts = input.facts || {};
  const scene = {
    name:short(facts.name,32), playerName:short(facts.playerName,32), background:short(facts.background,180), time:short(facts.time,16),
    street:short(facts.street,80), nearby:short(facts.nearby,100), pastEncounter:short(facts.pastEncounter,120), recentContact:short(facts.recentContact,100),
    actions:actions.filter(id => Array.isArray(facts.actions) && facts.actions.includes(id)),
  };
  const history=facts.phoneHistory;
  if(history)scene.phoneHistory={
    bond:short(history.bond,24),mood:short(history.mood,16),unresolvedConflict:short(history.unresolvedConflict,140),
    texts:Array.isArray(history.recentTexts)?history.recentTexts.slice(-4).map(row=>({speaker:row?.who==='me'?'player':scene.name,text:short(row?.text,140)})):[],
    memories:Array.isArray(history.memories)?history.memories.slice(-4).map(row=>({speaker:row?.who==='me'?'player':scene.name,text:short(row?.quote,140)})):[],
  };
  return [{role:'system',content:[
    `You are ${scene.name}, chatting face to face. Write your own first-person answer in one short spoken sentence. Answer the latest question directly, using your memories below.`,
    'Use the exact nearby name for a place recommendation. If none is listed, say you do not know a spot.',
    'Return text (your answer), followUp (a question the player could ask about your answer), and action (usually none). When asked to exchange numbers, use number if you agree and it is available. Use map for directions, change for spare change, coffee for a coffee sale.',
    'The follow-up question should pick up a concrete detail in your reply. Never promise a quest or an errand.',
    JSON.stringify(scene),
  ].join('\n')},...rows];
}

// The same English phoneme IDs used by the bundled Piper model. Captions work
// on hosts without a native phonemizer.
function pronunciation(text,signal) {
  const dir = process.env.PIPER_DIR || join(homedir(),'.local/share/nyc-after-hours/piper');
  return new Promise(resolve => {
    const child=execFile(join(dir,'piper_phonemize'),['-l','en-us','--espeak_data',join(dir,'espeak-ng-data')],
      {timeout:2000,signal,maxBuffer:128*1024},(error,stdout)=>{
        if(error) return resolve(null);
        try {
          const {phoneme_ids:ids}=JSON.parse(stdout.trim());
          resolve(Array.isArray(ids) && ids.length<=2048 ? ids : null);
        } catch { resolve(null); }
      });
    child.stdin.on('error',()=>{});
    child.stdin.end(text+'\n');
  });
}

export function handleStreetChat(req,res) {
  let lastText, pronunciationTask;
  const phones=(text,signal)=>{
    if(text!==lastText) {lastText=text;pronunciationTask=pronunciation(text,signal);}
    return pronunciationTask;
  };
  const spokenText=content=>{
    const match=/"text"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(content);
    if(!match) return '';
    try { return short(JSON.parse(match[1]),300); } catch { return ''; }
  };
  return handleLocalChat(req,res,{prompt,format,infer,keepAlive,phones,spokenText,threads:1,async immediate(input,signal) {
      const facts=input.facts || {};
      const reply=groundedTurn({nearby:short(facts.nearby,100),playerName:short(facts.playerName,32)},short(input.rows.at(-1).text,240));
      return reply && {...reply,phones:await phones(reply.text,signal)};
    },model:streetModel,tokens:128,timeout:45000,
    partial(content) {
      const match=/"text"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(content);
      if (!match) return '';
      try { return short(JSON.parse('"'+match[1]+'"'),300); } catch { return ''; }
    },
    async parse(data,signal) {
    let turn;
    try { turn=JSON.parse(data.message?.content); } catch {
      turn={text:spokenText(data.message?.content)};
    }
    const text=short(turn?.text,300);
    if (!text) return null;
    return {text,followUp:short(turn.followUp,95),action:actions.includes(turn.action)?turn.action:null,
      phones:await phones(text,signal)};
  }});
}
