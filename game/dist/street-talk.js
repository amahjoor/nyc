import { recentContact, streetLines } from './street-reactions.js';
import {asksForPlace,groundedTurn} from './street-intent.js';
import {chatFrames} from './chat-stream.js';
// Each encounter uses a stable cast identity and a small, bounded conversation history.
const names = ['Sam','Riley','Alex','Jamie','Robin','Jules','Casey','Frankie','Morgan','Drew','Ari','Charlie','Jess','Lee','Nico','Quinn'];
const stories = [
  ['I take photos on this block.','I like catching reflections in the windows just before the lights come on.','What was your favorite shot?','A cyclist in a yellow coat. For half a second the whole window looked like sunshine.'],
  ['I’m trying to sketch this street from memory.','Every time I get one building right, I realize I forgot the one next door.','What do you draw first?','The fire escapes. Once I have those down, I can place the windows.'],
  ['I keep a little notebook of things I overhear.','My favorite entry this week is just “the pigeon knows.” I wish I’d heard the rest.','What else is in the notebook?','Half a grocery list and a very serious argument about folding a slice.'],
  ['I sing harmony with a couple of friends.','We meet once a week. I’m still working on a note that keeps getting away from me.','What do you like about singing together?','That second when nobody is louder than anyone else. You can feel it click.'],
  ['I like growing herbs on my windowsill.','My basil survived the summer. The mint would take over the apartment if I let it.','What do you make with the basil?','Tomato toast. I save the biggest leaves for the first really good tomato.'],
  ['I collect little sounds around the city.','I caught a lovely rhythm between a loose grate and a delivery cart the other day.','What are you listening for today?','A quiet second between the brakes and the horns. There’s usually a bird in there.'],
];
const clip = (s,n) => typeof s==='string' ? s.trim().slice(0,n) : '';
const asksForNumber = text => /(?:exchange|swap) numbers|(?:your|my) (?:phone )?number|keep in touch/i.test(text);
const starters = ['How’s your day going?', 'What do you like about this block?'];

let lastWarm=-Infinity;
export function warmStreetModel() {
  const now=Date.now();
  if(now-lastWarm<5_000) return;
  lastWarm=now;
  fetch('./api/street/warm',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});
}

const ephemeralIds=new WeakMap();
export function streetIdentity(person) {
  let walker=person.id ?? person.look?.voiceKey ?? person.voiceKey;
  if (walker==null && person.resident?.id==null) {
    if(!ephemeralIds.has(person)) ephemeralIds.set(person,globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
    walker=ephemeralIds.get(person);
  }
  const base = person.resident?.id != null ? 'resident/'+person.resident.id : 'walker/'+walker;
  let hash=2166136261;
  for (const ch of base) hash=Math.imul(hash ^ ch.charCodeAt(0),16777619);
  const seed=hash>>>0;
  return {key:base,name:names[seed%names.length],story:stories[Math.floor(seed/names.length)%stories.length]};
}

export function savedConversations(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-32).filter(entry=>typeof entry?.key==='string' && Array.isArray(entry.rows)).map(entry=>({
    key:entry.key.slice(0,100), rows:entry.rows.slice(-10).filter(r=>['me','them'].includes(r?.who) && clip(r.text,300))
      .map(r=>({who:r.who,text:clip(r.text,300)})),
    playerName:clip(entry.playerName,32),followUp:clip(entry.followUp,95),pastEncounter:clip(entry.pastEncounter,120),
  }));
}

export function encounter(records,key) {
  const index=records.findIndex(record=>record.key===key);
  const entry=index<0 ? {key,rows:[],followUp:'',pastEncounter:''} : records.splice(index,1)[0];
  records.push(entry);
  if (records.length>32) records.shift();
  return entry;
}

function offlineTurn({name,story},facts,rows) {
  const latest=rows.at(-1).text.toLowerCase();
  if (facts.actions.includes('number') && asksForNumber(latest))
    return {text:'Yeah, let’s keep in touch.',action:'number',followUp:'What are you up to later?'};
  if (asksForPlace(latest) && facts.nearby)
    return {text:`There’s ${facts.nearby} close by. Want me to point it out?`,action:'map',followUp:'What do you like about this block?'};
  if (/coffee/.test(latest) && facts.actions.includes('coffee'))
    return {text:'Actually, I could go for a coffee. Are you selling?',action:'coffee',followUp:'How do you take yours?'};
  if (/change|spare|dollar/.test(latest) && facts.actions.includes('change'))
    return {text:'Want me to check my pockets?',action:'change',followUp:'How’s the rest of your day going?'};
  if (/my name|remember me/.test(latest) && facts.playerName) return {text:`You told me to call you ${facts.playerName}.`,followUp:story[2]};
  if (/your name|who are you/.test(latest)) return {text:`I’m ${name}. ${story[0]}`,followUp:story[2]};
  if (latest===story[2].toLowerCase()) return {text:story[3],followUp:'Do you come to this block often?'};
  if (rows.some(row=>row.who==='them' && row.text.includes(story[0])))
    return {text:story[1],followUp:story[2]};
  return {text:story[0]+' '+story[1],followUp:story[2]};
}

export async function streetReply(identity,facts,rows,signal,onPartial,onSpeech) {
  try {
    const response=await fetch('./api/street/chat',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},
      body:JSON.stringify({rows:rows.slice(-10),facts}),signal});
    if (response.ok) {
      let value;
      if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
        for await (const frame of chatFrames(response.body)) {
          if (frame.partial) onPartial?.(clip(frame.partial,300));
          if (frame.speech) onSpeech?.(frame.speech);
          if (frame.reply) value=frame.reply;
        }
      } else value=await response.json();
      if (clip(value?.text,300)) return {text:clip(value.text,300),followUp:clip(value.followUp,95),
        action:facts.actions.includes(value.action)?value.action:null,phones:value.phones};
    }
  } catch (error) { if(signal.aborted) throw error; }
  return groundedTurn(facts,rows.at(-1).text) || offlineTurn(identity,facts,rows);
}

function streetGreeting(person, entry, contact) {
  if (entry?.pastEncounter === 'This player took your wallet.') return 'robbedAgain';
  if (contact) return contact === 'brush' ? 'recognize' : 'wary';
  if (entry?.pastEncounter === 'The player sold you a coffee.') return 'coffee';
  return 'greet';
}
export function greetPerson(work, person) {
  const entry = work.record.conversations.find(row => row.key === streetIdentity(person).key);
  const contact = recentContact(person, work.sim.elapsed ?? 0);
  return streetLines.choose(person, streetGreeting(person, entry, contact));
}

export function talkToPerson(work,person) {
  if (!work.canTalk(person)) return;
  const identity=streetIdentity(person), entry=encounter(work.record.conversations,identity.key);
  const session=new AbortController();
  let contact=recentContact(person,work.sim.elapsed ?? 0);
  const newContact=contact && !person.streetContact.discussed;
  const needsOpening=!entry.rows.length || newContact;
  const opening=needsOpening ? streetLines.choose(person,streetGreeting(person,entry,contact)) : null;
  let place=work.talkPlace(person);
  const phone=work.phone?.();
  const actions=()=>({
    number:phone?.exchangeNumbers && entry.rows.some(row=>row.who==='me') && !phone.contactHistory(identity.key) &&
      {name:'Save '+identity.name+'’s number',choose:()=>phone.exchangeNumbers(identity,entry,work.streetName())},
    map:place && {name:'Show '+place.name+' on map',choose:()=>work.guide(place)},
    change:!work.streetActions.ask.has(person) && {name:'Ask for spare change',choose:()=>work.trade(person,'ask',resumeAfter('Could you spare some change?'))},
    coffee:work.record.cart && work.record.cups>0 && !work.streetActions.sell.has(person) &&
      {name:'Offer a coffee · $5',choose:()=>work.pourCoffee(person,resumeAfter('Here’s your coffee.'))},
  });
  let pending=false, suggested=null, draftTurn=null, speech=null;
  const view=work.openTalk(identity.name,()=>work.canTalk(person),()=>{
    delete person.talkingTo;
    session.abort();
    speech?.abort();
  });
  if (!view) return;
  person.talkingTo=work.sim.player;
  if (opening) entry.rows=[...entry.rows,{who:'them',text:opening}].slice(-10);
  if (newContact) person.streetContact.discussed=true;
  function resumeAfter(line) {
    return reply=>{
      entry.rows=[...entry.rows,{who:'me',text:line},{who:'them',text:reply}].slice(-10);
      entry.followUp='';work.save();
      if(work.canTalk(person)) talkToPerson(work,person);
    };
  }
  function draw() {
    const action=actions()[suggested];
    const directions=place && suggested!=='map' ? 'Any places nearby?' : null;
    const prompts=entry.followUp ? [entry.followUp,directions,'What do you like about this block?'] : [...starters,directions];
    const choices=[...new Set(prompts.filter(Boolean))].slice(0,entry.followUp?2:3)
      .map(text=>({name:text,choose:()=>send(text)}));
    if(suggested!=='number' && actions().number) choices.push({name:'Ask to exchange numbers',choose:()=>send('Want to exchange numbers?')});
    if (contact) choices.unshift({name:'Sorry I bumped into you.',choose:()=>send('Sorry I bumped into you.')});
    if (action) choices.unshift({name:action.name,choose:()=>{
      if (session.signal.aborted || !work.canTalk(person) || !actions()[suggested]) return;
      view.close();
      action.choose();
    }});
    view.render(draftTurn?[...entry.rows,draftTurn]:entry.rows,pending?[]:choices,pending,send);
  }
  async function send(input) {
    const text=clip(input,240);
    if (!text || pending || session.signal.aborted || !work.canTalk(person)) return;
    speech?.abort();
    if (contact && /^(?:sorry\b|i(?:'m| am) sorry\b|my (?:bad|apologies)\b|i apologize\b)/i.test(text)) {
      const answer=streetLines.choose(person,'apology');
      entry.rows=[...entry.rows,{who:'me',text},{who:'them',text:answer}].slice(-10);
      contact=null;delete person.streetContact;
      entry.followUp='';suggested=null;draw();work.save();
      speech=new AbortController();work.speak(person,answer,undefined,speech.signal);
      return;
    }
    pending=true;draftTurn={who:'me',text};draw();
    const introduced=text.match(/\b(?:my name is|call me)\s+([\p{L}’'-]{1,32})/iu)?.[1];
    const playerName=introduced || entry.playerName || '';
    const looking=asksForPlace(text);
    if(looking) place=work.talkPlace(person,text);
    const hour=work.hours(), minute=Math.floor((hour%1)*60);
    const availableActions=actions();
    const facts={name:identity.name,background:identity.story[0]+' '+identity.story[1],time:Math.floor(hour)+':'+String(minute).padStart(2,'0'),
      recentContact:contact ? {brush:'You and the player brushed shoulders.',shove:'The player just barged into you.',repeat:'The player has bumped into you repeatedly.'}[contact] : '',
      street:work.streetName(),nearby:place?.name || '',pastEncounter:entry.pastEncounter,playerName,
      phoneHistory:phone?.contactHistory?.(identity.key),actions:Object.keys(availableActions).filter(id=>availableActions[id])};
    const rows=[...entry.rows,draftTurn];
    let reply, voicedText;
    function voice(turn) {
      if(!Array.isArray(turn.phones) || turn.text===voicedText || session.signal.aborted || !work.canTalk(person)) return;
      speech?.abort();
      speech=new AbortController();
      voicedText=turn.text;
      work.speak(person,turn.text,turn.phones,speech.signal);
    }
    try { reply=await work.talkReply(identity,facts,rows,session.signal,partial=>{
      if(!session.signal.aborted && work.canTalk(person)) view.partial(partial);
    },voice); }
    catch { if (session.signal.aborted) return; reply=offlineTurn(identity,facts,rows); }
    if (session.signal.aborted || !work.canTalk(person)) return;
    entry.rows=[...rows,{who:'them',text:reply.text}].slice(-10);
    entry.playerName=playerName;
    entry.followUp=reply.followUp?.length>=9 && reply.followUp.endsWith('?') ? reply.followUp : 'How did you get into that?';
    const reference=(text+' '+reply.text).toLowerCase();
    suggested=null;
    if (place && (looking || reply.text.toLowerCase().includes(place.name.toLowerCase()) ||
        (reply.action==='map' && /directions|pin|map/.test(reference)))) suggested='map';
    if (facts.actions.includes('change') && /spare change|spare a|dollars?|my pockets/.test(reference)) suggested='change';
    if (facts.actions.includes('coffee') && /coffee|cup/.test(reference) && !looking) suggested='coffee';
    if (facts.actions.includes('number') && asksForNumber(text)) {
      const agrees=/^(?:yeah|yes|sure|absolutely|of course)\b|here[’']?s my number/i.test(reply.text);
      const declines=/\b(?:no|nope|prefer not|rather not|can[’']t|don[’']t)\b/i.test(reply.text);
      if (!declines && (reply.action==='number' || agrees)) suggested='number';
    }
    draftTurn=null;pending=false;draw();work.save();
    voice(reply);
  }
  draw();
  if (opening) {
    speech=new AbortController();work.speak(person,opening,undefined,speech.signal);
  }
}
