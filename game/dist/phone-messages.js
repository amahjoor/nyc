import { CALL_OUT, DELIVERY } from './garage.js';
import { formatMoney } from './money.js';

export async function requestMayaReply(rows,context,signal) {
  const response = await fetch('./api/phone/maya',{
    method:'POST',headers:{'Content-Type':'application/json'},signal,
    body:JSON.stringify({rows:rows.slice(-14).map(({who,text})=>({who,text})),context}),
  });
  if(!response.ok)return '';
  return (await response.json()).text;
}

function conversation(rows) {
  const sent = rows.filter(row => row.who === 'me');
  const previous = rows.filter(row => row.who === 'them').slice(-3).map(row => row.text);
  const latest = sent.at(-1)?.text.toLowerCase().replace(/’/g, "'") ?? '';
  return {
    latest, earlier: sent.slice(-3, -1).map(row => row.text.toLowerCase()).join(' '),
    choose(...options) {
      const fresh = options.filter(text => !previous.includes(text));
      const pool = fresh.length ? fresh : options;
      return pool[(sent.length - 1) % pool.length];
    },
  };
}

export function mechanicReply(rows, quote) {
  const { latest, earlier, choose } = conversation(rows);
  if (/^(thanks|thank you|ty|cheers|appreciate it)\b/.test(latest)) return choose('Anytime.', 'No problem.', 'You got it.');
  if (/\b(cab|taxi)\b/.test(latest) && /\b(deliver|bring|pick.?up)\b/.test(latest))
    return `It's ${formatMoney(DELIVERY)} to bring your cab around. Hit “Deliver my cab” on my contact card when you're ready.`;
  if (/\b(how much|price|cost|charge|quote|\d+ bucks|\d+ dollars)\b/.test(latest)) {
    if (quote?.condition >= 100) return "Looks fine from here. I wouldn't pay for a call-out.";
    if (quote) return `${formatMoney(quote.price)} total. That includes me coming out.`;
    return `Call-out is ${formatMoney(CALL_OUT)}. Get in the car and I can give you the full number.`;
  }
  if (/\b(where|how long|when|eta|come|on my way|send help|asap)\b/.test(latest) ||
      /^(yes|yeah|yep|ok|okay|please)\b/.test(latest) && /\b(repair|tire|tyre|broken|car|engine)\b/.test(earlier))
    return choose("Stay with the car and give me a call.", "I'm at the shop. Call when you're by the car.");
  if (/\b(tire|tyre|flat|wheel|puncture)\b/.test(latest)) return choose('Is it losing air or can you see damage to the wheel?', 'Flat tire? Are you pulled over somewhere?');
  if (/\b(smok\w*|engine|won'?t start|breakdown|broke down|broken|crash\w*|help|car)\b/.test(latest))
    return choose("What's it doing? Won't start, or did you hit something?", 'Can you still move it, or is it stuck where it is?');
  if (/^(hi|hey|hello|yo)\b/.test(latest)) return choose("Hey. What's up with the car?", 'Hey, what are you driving?');
  return choose("Didn't catch that. What's happening with the car?", 'Send me what the car is doing when you try to drive it.');
}

function foodKind(text) {
  if (/\b(coffee|espresso|latte)\b/.test(text)) return 'coffee';
  if (/\b(pizza|slice)\b/.test(text)) return 'pizza';
  if (/\b(food|hungry|eat|dinner|lunch|breakfast|restaurant)\b/.test(text)) return 'food';
  return '';
}

function foodRequest(text) {
  return /\b(where|anywhere|recommend|nearby|hungry|want|craving|looking for|good spot|get|grab)\b/.test(text) ||
    /^(pizza|coffee|food)$/.test(text);
}

export function mayaReply(rows, now, nearbyFood) {
  const { latest, choose } = conversation(rows);
  const previousIndex = rows.findLastIndex(row => row.who === 'them');
  const previous = rows[previousIndex];
  const line = latest.replace(/\s+/g,' ').replace(/[.?!,]+$/, '');
  const reply = (topic, ...options) => ({topic,text:choose(...options)});
  const replyAboutFood = (kind, directions, id) => {
    const spot = nearbyFood(kind,id);
    if (!spot && id!=null) return reply('chat',"try looking it up in Maps. i don't have directions from where you are rn");
    if (!spot) return reply(kind, "i don't know a spot open by you rn", "nothing nearby comes to mind that's open");
    const result = directions
      ? reply(kind, `${spot.name}, about ${spot.distance} from you. it's on Maps`)
      : reply(kind, `try ${spot.name}. it's open rn`, `${spot.name} is close and it's open`);
    return {...result,placeId:spot.id};
  };

  if (/^(nvm|never mind|forget it|all good)|\b(not hungry|not in the mood|already ate|don't want (?:pizza|coffee|food))\b/.test(line))
    return reply('chat','all good','fair enough');
  if (/^(thanks|thank you|ty)\b/.test(line)) return reply('chat','ofc','anytime','np');
  if (/^(lol|lmao|haha)$/.test(line)) return reply('chat','lmao','😭','right??');
  if (/\b(who (?:are you|is this)|do i know you|what'?s your name)\b/.test(line)) return reply('chat',"it's maya. new phone?");
  if (/\b(wya|where (?:are|r) (?:you|u)|where you at|where do you live)\b/.test(line))
    return reply('location','i’m in brooklyn rn. where’d you end up?');
  if (/\b(pick me up|give me a ride|drive me)\b/.test(line))
    return reply('chat',"can't pick you up rn. you stuck somewhere?");
  if (/\b(wanna hang|hang out|can we meet|want to meet|come over|see you tonight|are (?:you|u) free)\b/.test(line))
    return reply('location',"maybe later. what part of town are you in?");
  if (/\b(wanna|let's|up for|can we|(?:do )?(?:you|u) want to) (?:grab|get|go for|go get)\b/.test(line) && foodKind(line))
    return reply('location',"i'd be down later. where are you at?");
  if (/\b(like|prefer|favorite)\b/.test(line) && foodKind(line))
    return reply('chat',foodKind(line)==='coffee'?'iced coffee, even when it’s cold out':'always down for a good slice');
  if (/\b(hate|sick of|can't stand)\b/.test(line) && foodKind(line))
    return reply('chat','fair lol. what sounds better?');

  const kind = foodKind(line);
  if (kind && foodRequest(line)) return replyAboutFood(kind,false);
  if (/^(where|which one|how far|what's the name|what's it called|which place)$/.test(line)) {
    const pendingText = rows.slice(previousIndex+1,-1).findLast(row=>row.who==='me');
    const pending = pendingText?.text.toLowerCase()??'';
    const pendingKind = foodRequest(pending)?foodKind(pending):'';
    if (pendingKind) return replyAboutFood(pendingKind,true);
    if (['pizza','coffee','food'].includes(previous?.topic)) return replyAboutFood(previous.topic,true,previous.placeId);
    return reply('chat','where for what?');
  }
  if (/^(yeah|yep|yes|yup|nah|no|nope|still am)$/.test(line)) {
    if (previous?.text==='hey you still in the city?')
      return reply('location',/^(nah|no|nope)$/.test(line)?'oh, where’d you head to?':'yeah? what part of town?');
    if (previous?.topic==='work') return reply('chat','gotcha. text me when you get a minute');
    return reply('chat','gotcha','ok cool');
  }
  if (/\b(got (?:fired|laid off)|quit (?:my )?job|work sucked|bad day|in trouble|exhausted|stressed|tired)\b/.test(line))
    return reply('chat','oof. you wanna talk about it?','damn, what happened?');
  if (/\b(got (?:a |the )?(?:new )?job|got hired|got promoted)\b/.test(line))
    return reply('work','wait nice! where at?');
  if (/\b(?:off work|done with work|got off work|shift ended|finished my shift)\b/.test(line))
    return reply('chat','finally lol. how was it?');
  if (/\b(at work|on (?:my )?shift|i(?:'m|m| am) working)\b/.test(line))
    return reply('work','what time are you off?');
  if (/\b(shift|job|working|(?:at|from|to|after|before) work)\b/.test(line))
    return now.jobActive ? reply('work','how long left on your shift?') : reply('work','you working today or are you off?');
  if (/^(?:i(?:'m|m| am)\s+)?(?:in|at|near|by|on)\s+\S/.test(line) || previous?.topic==='location' && /^(?:soho|queens|brooklyn|manhattan|the bronx|staten island|times square|midtown|downtown)$/.test(line))
    return reply('chat','oh nice. what brought you over there?','what are you up to over there?');
  if (/\b(how are you|how's it going|what'?s up|wyd|hbu)\b/.test(line))
    return reply('chat',now.hours>=22||now.hours<6?'just winding down. you?':"not much, just doing stuff around the house. you?");
  if (/^(hi|hey|hello|yo|sup)$/.test(line)) return reply('chat','hey you',"yo what's up",'heyy');
  if (kind && /\b(ate|had|ordered|tried|drank|just got)\b/.test(line))
    return reply('chat','was it any good?','how was it?');
  return reply('chat','wait, what do you mean?', 'i think i missed something. what are you talking about?');
}
