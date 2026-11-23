const model = 'qwen3.5:2b-q4_K_M';
const limit = 12 * 1024;
const persona = [
  'Write the next text message as Maya, a friend in a fictional New York game.',
  'Maya lives in Brooklyn. She texts in short, casual English with occasional lowercase.',
  'React to the newest thing the player said. Earlier texts help with references like “there” or “that one”. If the player changes the subject, follow their new subject.',
  'Use one or two short sentences, under 160 characters. Skip introductions, advice lists, and forced slang.',
  'If you are unsure what they mean, ask one specific question. Only use supplied game facts for store names and directions.',
  'You are texting. You cannot meet up, call, share a pin, or perform an action in the game.',
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
  const latest=rows.pop();
  const transcript=rows.map(row=>({speaker:row.role==='user'?'Player':'Maya',text:row.content}));
  return [
    {role:'system',content:persona+'\nCurrent game facts: '+JSON.stringify(context)},
    {role:'user',content:`Earlier texts, oldest first: ${JSON.stringify(transcript)}\nLatest text to reply to: ${latest.content}`},
  ];
}

function respond(res, status, body) {
  if (res.destroyed) return;
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}

export async function handleMayaChat(req,res) {
  if (req.method!=='POST') return respond(res,405,{error:'POST required'});
  if (req.headers['content-type']?.split(';')[0]!=='application/json')
    return respond(res,415,{error:'JSON required'});

  const chunks = [];
  let size = 0, messages;
  try {
    for await (const chunk of req.iterator({destroyOnReturn:false})) {
      size+=chunk.length;
      if (size>limit) return respond(res,413,{error:'Conversation too long'});
      chunks.push(chunk);
    }
    messages=prompt(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    return respond(res,400,{error:'Invalid conversation'});
  }
  if (!messages) return respond(res,400,{error:'A player message is required'});

  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),35000);
  const cancel = ()=>controller.abort();
  res.once('close',cancel);
  try {
    const result = await fetch('http://127.0.0.1:11434/api/chat',{
      method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
      body:JSON.stringify({model,messages,stream:false,think:false,keep_alive:'5m',
        // Leave graphics memory to the game and keep short texts inexpensive.
        options:{num_ctx:2048,num_predict:48,num_gpu:0,num_thread:3,temperature:.62,top_p:.85,presence_penalty:0}}),
    });
    if (!result.ok) return respond(res,503,{error:'Local model unavailable'});
    const data = await result.json();
    const text = short(data.message?.content,320).replace(/^maya\s*:\s*/i,'').replace(/\s+/g,' ');
    if (!text || text.length>240 || /<think>|<\/think>/.test(text)) return respond(res,502,{error:'Empty or invalid reply'});
    respond(res,200,{text});
  } catch {
    respond(res,503,{error:'Local model unavailable'});
  } finally {
    clearTimeout(timeout);
    res.off('close',cancel);
  }
}
