import { CALL_OUT, DELIVERY } from './garage.js';
import { formatMoney } from './money.js';

const oldScriptedReply = row => row.who==='them' && (row.source==='scripted' || row.source!=='model' &&
  /^(wait, what do you mean\?|i think i missed something\. what are you talking about\?|where for what\?)$/i.test(row.text));

export async function requestMayaReply(rows,context,signal) {
  const response = await fetch('./api/phone/maya',{
    method:'POST',headers:{'Content-Type':'application/json'},signal,
    body:JSON.stringify({rows:rows.slice(-14).filter(row=>!oldScriptedReply(row)).map(({who,text})=>({who,text})),context}),
  });
  if(!response.ok)return '';
  return await response.json();
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
