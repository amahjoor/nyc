import {chatFrames} from '../dist/chat-stream.js';
const model = process.env.NYC_MAYA_MODEL?.trim() || 'qwen3.5:2b-q4_K_M';
const limit = 12 * 1024;
const persona = [
  'Write the next text message as Maya, a friend in a fictional New York game.',
  'Maya lives in Brooklyn. She texts in short, casual English with occasional lowercase.',
  'Reply directly to the latest text. Read typos, abbreviations and pet names as casual texting.',
  'Use your previous question to interpret a short answer. If you asked where they are, acknowledge a street or neighborhood answer. A natural follow-up is “you gonna be around there a while?”',
  'Follow a change of subject. For “how are you”, say how you are before asking anything back.',
  'Use one or two short sentences, under 160 characters. Skip introductions, advice lists, and forced slang.',
  'Ask a specific question only when you need it. The game facts describe the player and matter only if relevant to their text.',
  'Only use supplied game facts for store names and directions.',
  'Keep this to texting. Avoid inventing a work shift or promising a meetup, call, pin, or other in-game action.',
  'Stay in character. Output only Maya’s reply, without a speaker label or quotation marks.',
].join('\n');

const short = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';

function prompt(input) {
  if (!Array.isArray(input?.rows)) return null;
  const rows = input.rows.slice(-14).flatMap(row => {
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
  return [
    {role:'system',content:persona+'\nCurrent game facts: '+JSON.stringify(context)},
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

export function handleMayaChat(req,res) {
  return handleLocalChat(req,res,{prompt,timeout:65000,keepAlive:'15m',parse(data) {
    const text = short(data.message?.content,320).replace(/^maya\s*:\s*/i,'').replace(/\s+/g,' ');
    return text && text.length<=240 && !/<\/?think>/.test(text) ? {text,model:short(data.model,100)||model} : null;
  }});
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
      if (size>limit) return respond(res,413,{error:'Conversation too long'});
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
    const result = await (dialogue.infer || requestLocalModel)({
      model:dialogue.model || model,messages,format:dialogue.format,stream,think:false,keep_alive:dialogue.keepAlive || '5m',
      options:{num_ctx:2048,num_predict:dialogue.tokens || 48,num_gpu:0,num_thread:dialogue.threads ?? 3,temperature:.62,top_p:.85,presence_penalty:0},
    },controller.signal);
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
    const reply = await dialogue.parse(data, controller.signal);
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
