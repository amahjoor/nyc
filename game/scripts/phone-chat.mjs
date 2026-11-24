import {chatFrames} from '../dist/chat-stream.js';
import {messageWindow, readRelationship, repeatsRecentReply, socialEvents} from '../dist/phone-relationships.js';

const configuredModel = process.env.NYC_PHONE_MODEL?.trim() || process.env.NYC_MAYA_MODEL?.trim();
const model = configuredModel || 'qwen3.5:4b-q4_K_M';
const smallerModel = 'qwen3.5:2b-q4_K_M';
const limit = 12 * 1024;
const mayaPersona = "You are Maya, texting a friend in NYC. You're from Brooklyn, into street photography and late-night diners. You're observant, a little dry, and have your own opinions.";
const texting = [
  "Text back in your own words, usually one short message. Read the last exchange together. A street or a one-word answer can answer your own question. Treat typos, double texts and pet names naturally.",
  "Respond to what they actually said. Sometimes an acknowledgment or a joke is enough. Ask a question when you genuinely want the answer. Vary the rhythm; avoid repeating your last line or turning a check-in into an interview.",
  "Use shared memories only when relevant. New corrections take priority. In a memory from the player, my means the player's and you means the contact. Answer recall questions plainly. Past locations and plans can be stale. Game facts are available for directions if asked; you cannot see the player.",
  "Let the bond and unresolved conflict shape your tone. A friend can disagree or set a boundary. A sincere apology can help while hurt lingers. A casual babe or kind word alone does not imply mutual attraction.",
  "Dating requires mutual interest, openToDating and an explicit agreement in this exchange. Either person can end it. You can discuss plans but cannot actually travel, send a pin or call the player.",
  "Return JSON. text is only the visible reply, up to 240 characters. event describes THIS exchange: ordinary for routine chat or differing opinions, connection only for emotional support or personal vulnerability, mutual_flirt only for reciprocated flirting, hurt for a personal rupture, repair for a genuine effort to mend one, start_dating or break_up for explicit relationship changes.",
  "Greetings, addresses, logistics and recalling a name are ordinary. Let your hobbies come up when they fit. Remember at most one lasting detail or boundary. For remember use 0 for nothing, 1 for the newest player text, 2 or 3 for an earlier text in their current burst, or -1 for your new reply. Set memoryKey to a short stable topic, reusing its previous key when corrected. Skip greetings, passing locations and assumptions.",
].join('\n');

const format = {type:'object', additionalProperties:false, properties:{
  text:{type:'string',maxLength:240}, event:{type:'string',enum:socialEvents},
  remember:{type:'integer',enum:[0,1,2,3,-1]}, memoryKey:{type:'string',maxLength:40},
},required:['text','event','remember','memoryKey']};

const short = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
function prompt(input) {
  if (!Array.isArray(input?.rows)) return null;
  const rows = input.rows.slice(-messageWindow).flatMap(row => {
    const content = short(row?.text,240);
    return content && (row.who==='me' || row.who==='them')
      ? [{role:row.who==='me'?'user':'assistant',content}]
      : [];
  });
  if (rows.at(-1)?.role!=='user') return null;
  const context = {
    time:short(input.context?.clock,24),
    playerStreet:short(input.context?.street,100),
    onShift:input.context?.onShift===true,
    nearbyOpen:[],
  };
  if (Array.isArray(input.context?.nearby)) {
    context.nearbyOpen = input.context.nearby.slice(0,4).flatMap(spot => {
      const name = short(spot?.name,100);
      return name ? [{name,kind:short(spot.kind,16),distance:short(spot.distance,24)}] : [];
    });
  }
  const contact=input.context?.contact;
  let persona=mayaPersona;
  if(contact){
    const name=short(contact.name,32);
    if(!name)return null;
    persona='You are '+name+', texting someone you met in New York. Use your own background and voice.';
    context.background=short(contact.background,240);
    context.metOn=short(contact.street,80);
    context.playerIntroducedAs=short(contact.playerName,32);
    context.inPerson=Array.isArray(contact.meeting)?contact.meeting.slice(-4).flatMap(row=>
      row && ['me','them'].includes(row.who) && typeof row.text==='string' ? [{speaker:row.who==='me'?'player':name,text:short(row.text,160)}] : []):[];
  }
  const rel = input.context?.relationship;
  context.relationship = {
    bond:['Distant','Acquaintances','Friends','Close friends','Dating'].includes(rel?.bond) ? rel.bond : 'Friends',
    mood:['At ease','Cooling off','Guarded','Upset'].includes(rel?.mood) ? rel.mood : 'At ease',
    mutualInterest:rel?.mutualInterest === true, openToDating:rel?.openToDating === true,
    lastTexted:short(rel?.lastTexted,32),
    unresolvedConflict:short(rel?.unresolvedConflict,140), memories:readRelationship(rel).memories.map(({key,who,quote})=>({topic:key,speaker:who==='me'?'player':short(contact?.name,32)||'Maya',quote})),
  };
  return [
    {role:'system',content:persona+'\n'+texting+'\nCurrent game facts: '+JSON.stringify(context)},
    ...rows,
  ];
}

function respond(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}

export function requestLocalModel(payload,signal) {
  return fetch('http://127.0.0.1:11434/api/chat',{
    method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(payload),
  });
}

export function handlePhoneChat(req,res) {
  return handleLocalChat(req,res,{
    prompt, format, model, timeout:180000, keepAlive:'15m', limit:48*1024, tokens:192,
    options:{num_ctx:4096,num_gpu:undefined,num_thread:undefined,temperature:.75},
    async infer(payload,signal) {
      const result=await requestLocalModel(payload,signal);
      if (configuredModel || result.ok) return result;
      const tooLarge=result.status===500 && /requires more (system )?memory|out of memory|insufficient (system )?memory/i.test(await result.clone().text());
      if (result.status!==404 && !tooLarge) return result;
      await result.body?.cancel();
      return requestLocalModel({...payload,model:smallerModel},signal);
    },
    parse(data,signal,input) {
      let turn;
      try { turn=JSON.parse(data.message?.content); } catch { return null; }
      const text=short(turn?.text,241);
      if (!text || text.length>240 || /<\/?think>/i.test(text) || repeatsRecentReply(text,input.rows)) return null;
      if (turn.event==='start_dating' && !input.context?.relationship?.openToDating) return null;
      if (turn.event==='break_up' && input.context?.relationship?.bond!=='Dating') return null;
      const reply={text,model:short(data.model,100)||model,event:socialEvents.includes(turn.event)?turn.event:'ordinary'};
      const burst=input.rows.slice(input.rows.findLastIndex(row=>row?.who==='them')+1);
      const index=turn.remember;
      const quote=index===-1 ? text : Number.isInteger(index) && index>=1 && index<=3 ? burst.at(-index)?.text : '';
      const key=short(turn.memoryKey,40);
      if (quote && key) reply.memory={key,who:index===-1?'them':'me',quote};
      return reply;
    },
    revise:"Write a fresh reply that moves this exchange forward. Do not recycle a recent reply. Follow the JSON format.",
  });
}

export async function handleLocalChat(req,res,dialogue) {
  if (req.method!=='POST') return respond(res,405,{error:'POST required'});
  if (req.headers['content-type']?.split(';')[0]!=='application/json')
    return respond(res,415,{error:'JSON required'});

  const chunks = [];
  let size = 0, messages, input;
  try {
    for await (const chunk of req.iterator({destroyOnReturn:false})) {
      size+=chunk.length;
      if (size>(dialogue.limit || limit)) return respond(res,413,{error:'Conversation too long'});
      chunks.push(chunk);
    }
    input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    messages=dialogue.prompt(input);
  } catch {
    return respond(res,400,{error:'Invalid conversation'});
  }
  if (!messages) return respond(res,400,{error:'A player message is required'});

  const stream=Boolean(dialogue.partial && req.headers.accept?.includes('application/x-ndjson'));
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),dialogue.timeout || 35000);
  const cancel = ()=>controller.abort();
  res.once('close',cancel);
  try {
    const immediate=await dialogue.immediate?.(input,controller.signal);
    if(immediate) return respond(res,200,immediate);
    const generate = conversation => (dialogue.infer || requestLocalModel)({
      model:dialogue.model || model,messages:conversation,format:dialogue.format,stream,think:false,keep_alive:dialogue.keepAlive || '5m',
      options:{num_ctx:2048,num_predict:dialogue.tokens || 48,num_gpu:0,num_thread:dialogue.threads ?? 3,temperature:.62,top_p:.85,presence_penalty:0,...dialogue.options},
    },controller.signal);
    const result = await generate(messages);
    if (!result.ok) return respond(res,503,{error:'Local model unavailable'});
    let data;
    if (stream) {
      res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'});
      let content='',previous='',preview;
      for await (const frame of chatFrames(result.body)) {
        if (frame.error) throw new Error('Model interrupted');
        content+=frame.message?.content || '';
        if (!preview && dialogue.spokenText) {
          const text=dialogue.spokenText(content);
          if(text) preview=dialogue.phones(text,controller.signal).then(phones=>{
            if(phones && !res.destroyed && !res.writableEnded) res.write(JSON.stringify({speech:{text,phones}})+'\n');
          });
        }
        const partial=dialogue.partial(content);
        if(partial && partial!==previous && !res.destroyed) {
          res.write(JSON.stringify({partial})+'\n');
          previous=partial;
        }
      }
      await preview;
      data={message:{content}};
    } else data=await result.json();
    let reply = await dialogue.parse(data, controller.signal, input);
    if (!reply && !stream && dialogue.revise && !controller.signal.aborted) {
      const revised = await generate([{role:'system',content:messages[0].content+'\n'+dialogue.revise},...messages.slice(1)]);
      if (!revised.ok) return respond(res,503,{error:'Local model unavailable'});
      reply = await dialogue.parse(await revised.json(),controller.signal,input);
    }
    if (stream) { if(!res.destroyed)res.end(JSON.stringify(reply?{reply}:{error:'Invalid reply'})+'\n');return; }
    if (!reply) return respond(res,502,{error:'Invalid reply'});
    respond(res,200,reply);
  } catch {
    if (res.headersSent) { if(!res.destroyed)res.end();return; }
    respond(res,503,{error:'Local model unavailable'});
  } finally {
    clearTimeout(timeout);
    res.off('close',cancel);
  }
}
