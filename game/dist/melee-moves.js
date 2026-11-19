// Seconds from the start of the game action to contact and the end of recovery.
export const meleeMoves = {
  bodyHook:  {contact:.22, seconds:.51, reaction:'foldBack'},
  elbowTurn: {contact:.24, seconds:.52, reaction:'reelLeft'},
  palmPush:  {contact:.19, seconds:.48, reaction:'foldBack'},
  stepJab:   {contact:.18, seconds:.43},
  longCross: {contact:.25, seconds:.57, reaction:'reelLeft'},
  shovelLeft:{contact:.23, seconds:.50, reaction:'foldBack'},
  roundKick: {contact:.35, seconds:.82, reaction:'reelRight'},
  pushKick:  {contact:.31, seconds:.76, reaction:'foldBack'},
  jab:       {contact:.13, seconds:.34},
  cross:     {contact:.13, seconds:.34},
  hookRight: {contact:.24, seconds:.53},
  slap:      {contact:.17, seconds:.42, reaction:'reelLeft'},
  uppercut:  {contact:.26, seconds:.56},
  hookLeft:  {contact:.22, seconds:.50},
  backhand:  {contact:.21, seconds:.48, reaction:'reelRight'},
  kick:      {contact:.27, seconds:.72},
  sideKick:  {contact:.34, seconds:.80},
  leadKick:  {contact:.23, seconds:.62},
  lowKick:   {contact:.27, seconds:.72},
  lowSweep:  {contact:.30, seconds:.70},
  stompRight:{contact:.32, seconds:.69},
  stompLeft: {contact:.32, seconds:.69},
};

export const handStrikes=['jab','cross','hookRight','slap','uppercut','hookLeft','backhand'];
export const closeStrikes=['bodyHook','slap','elbowTurn','shovelLeft','palmPush','backhand'];
export const movingStrikes=['stepJab','longCross','jab','shovelLeft'];
export const standingKicks=['kick','sideKick','leadKick','roundKick','pushKick'];
export function handGroup(speed,gap=Infinity) {
  if (gap<1.05) return 'close';
  return Math.abs(speed)>1.2?'moving':'hand';
}
const choices={hand:handStrikes,close:closeStrikes,moving:movingStrikes,kick:standingKicks,low:['lowKick','lowSweep'],roof:['stompRight','stompLeft']};

export function nextStrike(actor,group) {
  const counts=actor.strikeCounts ??= {};
  const options=choices[group], index=counts[group] || 0;
  counts[group]=(index+1)%options.length;
  return options[index];
}
