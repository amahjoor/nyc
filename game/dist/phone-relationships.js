// A contact's social history is saved with the thread. Qwen interprets each
// exchange, while the game owns the pace of relationship changes.
export const socialEvents = ['ordinary', 'connection', 'mutual_flirt', 'hurt', 'repair', 'start_dating', 'break_up'];
export const messageWindow = 20;
const bounded = value => Math.max(0, Math.min(10, value));
const score = (value, initial) => Number.isInteger(value) ? bounded(value) : initial;
const line = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const topic = value => line(value, 40).toLowerCase().replace(/[^a-z0-9 -]/g, '').trim();
const wording = value => value.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function readRelationship(saved) {
  const memories = [];
  for (const item of Array.isArray(saved?.memories) ? saved.memories.slice(-12) : []) {
    const key = topic(item?.key), quote = line(item?.quote, 240);
    if (key && quote && ['me', 'them'].includes(item.who)) memories.push({key, who:item.who, quote});
  }
  return {
    closeness:score(saved?.closeness, 3), tension:score(saved?.tension, 0),
    chemistry:score(saved?.chemistry, 0), dating:saved?.dating === true,
    conflict:line(saved?.conflict, 140), memories,
    lastExchangeAt:Number.isSafeInteger(saved?.lastExchangeAt) && saved.lastExchangeAt > 0 ? saved.lastExchangeAt : null,
    recentSignals:Array.isArray(saved?.recentSignals) ? saved.recentSignals.slice(-6).filter(s => typeof s === 'string').map(s => line(s, 140)) : [],
  };
}

export function relationshipContext(state, now=Date.now()) {
  const bond = state.dating ? 'Dating' : state.closeness <= 1 ? 'Distant' : state.closeness >= 7 ? 'Close friends' : state.closeness === 2 ? 'Acquaintances' : 'Friends';
  const mood = state.tension >= 5 ? 'Upset' : state.tension >= 2 ? 'Guarded' : state.tension ? 'Cooling off' : 'At ease';
  let lastTexted='';
  if (state.lastExchangeAt) {
    const days=Math.floor(Math.max(0,now-state.lastExchangeAt)/86400000);
    lastTexted=days===0?'within the last day':days===1?'about a day ago':days+' days ago';
  }
  return {bond, mood, lastTexted, mutualInterest:state.chemistry >= 2,
    openToDating:!state.dating && state.closeness >= 6 && state.chemistry >= 2 && state.tension === 0,
    unresolvedConflict:state.conflict, memories:state.memories};
}

export function advanceRelationship(previous, answer, rows) {
  const state = readRelationship(previous);
  const burst = rows.slice(rows.findLastIndex(row => row.who === 'them') + 1);
  const latest = burst.at(-1)?.text;
  if (!latest) return state;
  state.lastExchangeAt = Date.now();
  const memory = answer?.memory, key = topic(memory?.key), quote = line(memory?.quote, 240);
  const source = memory?.who === 'them' ? [answer.text] : burst.map(row => row.text);
  if (key && quote && ['me','them'].includes(memory.who) && source.includes(quote)) {
    state.memories = state.memories.filter(note => note.key !== key && note.quote !== quote);
    state.memories.push({key, who:memory.who, quote});
    state.memories = state.memories.slice(-12);
  }
  const event = answer?.event;
  const signature = wording(latest);
  if (!socialEvents.includes(event) || event === 'ordinary' || state.recentSignals.includes(signature)) return state;
  // A street and neighborhood often arrive as two short texts in response to
  // one question. An address alone is ordinary conversation.
  if (event === 'connection') {
    const question = rows.findLast(row => row.who === 'them')?.text || '';
    const where = /where (?:are|r) (?:you|u)|what (?:part of town|street|neighbou?rhood)|where.*end up/i.test(question);
    if (where && burst.every(row => /^[\p{L}\d .'-]{1,48}$/u.test(row.text) && wording(row.text).split(' ').length <= 4)) return state;
  }
  switch (event) {
    case 'connection':
      state.closeness = bounded(state.closeness + 1);
      break;
    case 'mutual_flirt':
      if (state.tension < 2) {
        state.closeness = bounded(state.closeness + 1);
        state.chemistry = bounded(state.chemistry + 1);
      }
      break;
    case 'hurt':
      state.tension = bounded(state.tension + 3);
      state.closeness = bounded(state.closeness - 2);
      state.chemistry = bounded(state.chemistry - 1);
      state.conflict = latest;
      break;
    case 'repair':
      if (state.tension > 0) {
        state.tension = bounded(state.tension - 2);
        if (state.tension === 0) { state.conflict = ''; state.closeness = bounded(state.closeness + 1); }
      }
      break;
    case 'start_dating':
      if (relationshipContext(state).openToDating) state.dating = true;
      break;
    case 'break_up':
      if (state.dating) { state.dating = false; state.chemistry = 0; state.closeness = bounded(state.closeness - 2); }
      break;
  }
  state.recentSignals = [...state.recentSignals, signature].slice(-6);
  return state;
}

export function repeatsRecentReply(text, rows) {
  const normalized = wording(text);
  return rows.filter(row => row?.who === 'them' && typeof row.text === 'string').slice(-5).some(row => {
    const old = wording(row.text);
    if (old === normalized) return true;
    // Catch a recycled reply with a greeting tacked on. Preserve different
    // answers that share a name, location, or a short everyday expression.
    const shorter = old.length < normalized.length ? old : normalized;
    const longer = old.length < normalized.length ? normalized : old;
    return shorter.split(' ').length >= 6 && shorter.length >= longer.length * .8 && (' '+longer+' ').includes(' '+shorter+' ');
  });
}
