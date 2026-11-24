export function asksForPlace(text) {
  return /\b(?:where|nearby|recommend|directions|show me|somewhere)\b/i.test(text) &&
    /\b(?:places?|nearby|eat|lunch|dinner|breakfast|café|cafe|coffee|food|pizza|slice|restaurant|map)\b/i.test(text);
}

// Facts with exact answers can go straight to the player, including on a static host.
export function groundedTurn(facts,text) {
  if (/\b(?:remember|know|what(?:'s| is)|tell me)\b[^?]{0,30}\bmy name\b/i.test(text)) {
    return {text:facts.playerName ? `Of course, ${facts.playerName}. Good to see you.` : 'I don’t think you told me. What should I call you?',
      followUp:'How has your day been?',action:null};
  }
  if (asksForPlace(text)) {
    return facts.nearby ? {text:`There’s ${facts.nearby} close by. Want me to show you where it is?`,followUp:'Do you come here often?',action:'map'} :
      {text:'I don’t know a spot for that around here. I’d have to check the map myself.',followUp:'Do you spend much time on this block?',action:null};
  }
  return null;
}
