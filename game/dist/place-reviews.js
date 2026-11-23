import { servingFor } from './food-catalog.js';

const firstNames=['Jules','Alma','Devin','Cam','Maya','Omar','Sasha','Lina','Ray','Val','Jo','Inez','Nico','Kai','Bea','Rosa','Theo','Sam','Liv','Ana','Rafi','Ari','Remy','Milo'];
const impressions={
  food:['I came in hungry after work and cleaned my plate.','This is the lunch stop I keep coming back to.','Grabbed lunch here between errands. I’d order the same thing again.','My friend picked this spot. I’m taking credit for finding it next time.'],
  coffee:['Picked up a drink on my walk. This might become my morning detour.','Just what I needed before the train.','Stopped by for a drink and stayed longer than I meant to.'],
  shopping:['Came in for one thing and spent half the visit looking around.','Worth a look if you’re already on the block.','I like being able to browse for a minute before deciding.'],
  hair:['Asked for something easy to keep up with. Still happy with the cut a week later.','I brought a photo of the cut I wanted. Glad I did.','Finally found a haircut I don’t have to fix the next morning.'],
  beauty:['A little time to myself between errands. I’d book another visit.','Took my time picking what I wanted. Happy with how it turned out.'],
  bar:['Met a friend here after work. We wound up staying for another round.','Good place to catch up over a drink.','Came in for one drink on my way home. I’d stop in again.'],
  gym:['Got my workout in before the rest of the day got away from me.','I liked being able to work through my routine at my own pace.'],
  auto:['Stopped here on my way across town. Handy spot to have saved on the map.','Easy enough to swing by on the drive home.'],
  hotel:['I liked having somewhere to come back to after walking all day.','A good home base for getting around the neighborhood.'],
  general:['Easy stop to work into a day in the neighborhood.','Walked over with a friend who knows the area. Glad I saved the pin.','I pass this block all the time. Finally made a stop here.']
};
const arrivals=['Took the long way here on foot. The pin was handy for the last block.','Saved this spot after walking past it twice. Made it back today.','Met my sister out front. Easy place for us to find each other.','A friend sent me the pin and I walked over after work.'];
const mixed=['I’d pick a quieter time for my next visit.','Glad I went. Next time I’ll leave myself a little longer.','Fine for a quick stop when I’m already nearby.'];
const groupFor={food:'food',dining:'food',cafe:'coffee',market:'shopping',bodega:'shopping',shop:'shopping',stand:'shopping',liquor:'shopping',beauty:'beauty',barber:'hair',bar:'bar',auto:'auto'};

export function placeReviews(place,stock){
  let seed=2166136261;
  for(const c of [place.name,place.kind,place.x,place.z].join('|'))seed=Math.imul(seed^c.charCodeAt(0),16777619);
  const next=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*n);};
  const pick=list=>list[next(list.length)];
  const names=firstNames.slice();
  const candidates=stock.filter(item=>item.product || servingFor(item,true) || ['guitar','ringSample','phone'].includes(item.model));
  const featured=pick(candidates);
  const type=place.kind==='gym'?'gym':place.kind==='hotel'?'hotel':['salon','barber'].includes(place.kind)?'hair':groupFor[place.group] || 'general';
  const line=featured?pick([
    'My pick was the '+featured.name.toLowerCase()+'. Saved a photo so I’ll remember it next time.',
    'Came back for the '+featured.name.toLowerCase()+'. This is the one I’d tell a friend to try.',
    'I went with the '+featured.name.toLowerCase()+'. That was the highlight of my visit.'
  ]):pick(impressions[type]);
  const others=impressions[type].filter(text=>text!==line);
  const notes=[{text:line,stars:4+next(2),subject:featured?'product':'inside'},
    {text:pick(arrivals),stars:4+next(2),subject:'front'},
    {text:next(2)?pick(mixed):pick(others),stars:3+next(2),subject:'inside'}];
  for(const note of notes)note.author=names.splice(next(names.length),1)[0]+' '+String.fromCharCode(65+next(26))+'.';
  return {notes,featured};
}
