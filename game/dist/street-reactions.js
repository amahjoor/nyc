// Each row is one situation. Openers stand alone, and every follow-up in its row
// can follow any opener. Keep both short enough to hear while walking past.
const scene = (fallback, open, follow) => ({fallback, open:open.split('|'), follow:follow.split('|')});
export const situations = {
  brush: scene([21,22,23,24,25],
    "Oop, excuse me.|We picked the same side.|Pardon my elbow.|Didn't see you there.|Right past you here.|Little tight through here.|Sorry about the shoulder.|You going this way too?|Oh, my foot!|Let me squeeze past.|We doing the sidewalk dance?|My bad, I zigged.|Whoops, we traded lanes.|Sorry, that was my sleeve.|Here, let me get out of your way.|Are your toes okay?|My shoulder says hello.|I thought you were going left.|Little close there, huh?|Excuse the squeeze.|I barely missed your other shoe.|I should've looked up.|Did I catch your arm?|You all right there?|Sorry, I cut the corner.|We need turn signals for walking.|Pardon the close pass.|I'll scoot over.|Oof, that's a narrow gap.|You first, I insist.",
    "You go ahead.|All yours.|Everybody okay?|I'll take this side.|Plenty of room now.|Have a good one."),
  shove: scene([26,27,28,29,30],
    "Ow, my shoulder!|Where's the fire?|Hey, that actually hurt!|Nearly took me off my feet!|Easy on the elbows!|I felt that one.|You came straight through me!|Do I look like a revolving door?|My shoes almost stayed behind!|Whoa, give a person some warning!|I wasn't braced for that!|Did you even see me?|I need that arm, thanks!|You missed the gap by a whole person!|Look up before you take off!|Oh, right in the ribs!|This isn't a sprint final!|Wow, you can really throw a shoulder!|You about sent me into next week!|You could've gone around!|There's an easier way to get my attention!|Excuse you!|I nearly landed on my backside!|All that pavement and you picked me!|I was using that bit of sidewalk!|That knocked the breath out of me!|You clocked me pretty good!|Was I invisible just then?|My elbow would like a word!|You took me by surprise there!",
    "Take it easy.|Look up once in a while.|Let me catch my balance.|Give me a little space.|You could say excuse me.|I'm trying to walk here."),
  repeat: scene([31,32,33,34,35],
    "You clipped me already.|Oh, it's you again.|Same shoulder as last time!|We just did this.|There you go again.|Once was an accident.|You keep picking my side.|Didn't we just bump elbows?|You got the whole sidewalk.|How many chances do you need?|I moved over for you already.|Back in my personal space again?|Switch shoulders at least!|You circled back for that?|Okay, now I'm paying attention.|What did my elbow ever do to you?|We can't keep meeting like this.|I can recognize that elbow now.|You had time to go around.|I took a step aside for a reason.|I know the sidewalk's wider than this.|Can I finish a single step here?|You did see me the first time, right?|At this point I should charge a toll.|My shoes and I are getting tired of this.|You again, seriously?|Same two people, same square of pavement.|Didn't we sort this out already?|I'm running out of sides to move to.|I felt the first one just fine.",
    "Go around this time.|Enough already.|Walk ahead of me.|Let me get by.|I'd like some room.|Give it a rest."),
  fight: scene([5,6],
    "What's your problem?|Hands off me!|You got something to say?|Hold it right there.|We're done here.|Take a step back.|I saw that coming.|I'm standing right here.|You're in my face.|Don't put your hands on me.|Can you hear yourself?|That's enough out of you.",
    "Leave it alone.|Back up.|Give me space.|Walk away.|Let it go.|I'm serious."),
  cower: scene([16,20],
    "I can't move.|Please let me be.|I'm staying right here.|My legs are shaking.|Can somebody stay with me?|I just need a second.|I'm trying to breathe.|I don't want any trouble.|I can't look.|Is it safe yet?|I can hear my own heart.|Please don't come closer.",
    "Talk to me.|Give me a minute.|Please be careful.|Keep some distance.|I need room.|I'm scared."),
  held: scene([20,16],
    "My hands are up.|I'm keeping real still.|Okay, you can see my hands.|I hear you, okay?|I'm not reaching for anything.|I'll stay where I am.|Please lower that.|I'm listening.|I don't want anyone hurt.|I'm standing still.|You have my attention.|Easy, I hear you.",
    "Please stay calm.|Give me a second.|Take a breath.|Let me go home.|I'm scared right now.|There's no need for this."),
  flee: scene([16,15],
    "I'm getting out of here!|Clear a path!|I need to get away!|I'm going the other way!|Let me through!|Keep moving!|I can't stay here!|I'm leaving right now!|Watch out behind you!|Come on, this way!|Get clear of here!|I need some room to run!",
    "Don't stop here!|Give people space!|Keep your head up!|Come away from there!|Watch your step!|Make some room!"),
  fire: scene([16,17],
    "That car's on fire!|There's smoke coming off the car!|Get away from that vehicle!|Careful by that car!|Everybody clear of the smoke!|There's a fire over there!|The car is burning!|Step away from the flames!|Look at the smoke!|Someone call the fire department!|Stay clear of that car!|There's smoke behind us!",
    "Move back!|Leave some room!|People need to get through!|Get clear!|Watch out!|Keep back!"),
  nearMiss: scene([15,16,17,20],
    "That mirror missed me by an inch!|Did you see me standing here?|Hey, use the brake!|That was my knee you almost hit!|I could touch your hood from here!|Whoa, too close!|Look where you're turning!|I had to jump back!|You're awfully close to my shoes!|That car came out of nowhere!|Slow down around people!|Hey, there's a human being here!",
    "Give us some room!|Eyes up!|Easy on the gas!|Let people pass!|Little more clearance next time!|What's the rush?"),
  crossing: scene([15,16,17],
    "We're still crossing!|There's a person in the crosswalk!|Give me time to get across!|Hold up, I'm halfway over!|Look at the stripes!|You see these two feet?|You can wait three seconds!|Let me reach the curb!|I'm still out here!|Leave the crossing clear!|I'm on foot over here!|Watch the crosswalk!",
    "Give us a second!|Slow down!|Look before you turn!|Take your time!|Eyes on the road!|I'll be out of your way!"),
  crash: scene([18,19],
    "Is everyone okay in there?|Did you hear that crunch?|Everybody all right?|I saw the impact.|Anybody need a hand?|That was a hard hit.|Can everyone get out okay?|I heard that from here.|Did anyone get hurt?|Someone check on the driver.|That sounded awful.|Do they need help over there?",
    "Give them some space.|Keep the street clear.|Take a breath.|Watch the traffic.|Careful around the cars.|Let's make some room."),
  injured: scene([18,19],
    "Can you hear me down there?|Somebody got hit!|Is that person breathing?|Can anyone call for help?|Hey, stay with us!|Someone check on them!|There's somebody on the ground!|Did anybody see what happened?|Are they awake?|Someone needs help over here!|Can they hear us?|Hey, somebody's hurt!",
    "Give them room.|Watch the road.|Don't crowd around.|Leave a path clear.|Stay close by.|Help's needed here."),
  followed: scene([6,20],
    "Are you trying to get my attention?|You headed somewhere behind me?|Can I help you with something?|I keep hearing your footsteps.|You need to ask me something?|Are we going to the same place?|You been behind me a while.|You looking for somebody?|I saw you back there earlier.|Everything okay back there?|You keep matching my pace.|Did you mean to catch up with me?",
    "You can pass me.|Go on ahead.|I'd like a little space.|I'll give you room.|You take the lead.|Let me walk a little."),
  chase: scene([7],
    "Police, stop!|Stop where you are!|Police, hold it!|I need you to stop!|Hold up right there!|Stop running!|That's far enough!|Stand still!|Police, stay put!|Stop right there!|Stay where I can see you!|Hold your position!",
    "Stay in sight!|Listen to me!|Easy now!|Keep still!|Look this way!|Stay right there!"),
  arrest: scene([8],
    "Keep your hands visible!|Show me both hands!|Hands where I can see them!|Keep your hands out!|Let me see your palms!|Keep those hands still!|Don't reach into your pockets!|Hold your hands up!|Keep both hands in view!|Show me your hands slowly!|I need to see your hands!|Leave your hands up!",
    "Stay calm.|Slowly now.|Listen carefully.|Keep looking at me.|Hold still.|Take your time."),
  greet: scene([0,4],
    "Hey there.|How's your day treating you?|What's going on?|Oh, hi there.|How's life on your end?|Hey, you doing okay?|Got a minute to chat?|How are things with you?|Hello there, stranger.|Hey, what's on your mind?|Good to see a friendly face.|You caught me between errands.",
    "What's new with you?|I've got a minute.|Nice to meet you.|How's the block treating you?|Glad you stopped.|It's good to talk."),
  theft: scene([11],
    "That's my wallet!|Hey, my pocket's empty!|Give me my wallet back!|I felt your hand in my pocket!|My wallet was right here!|Hey, that belongs to me!|You just took my wallet!|Somebody saw that, right?|My cards are in there!|I need that wallet!|Where do you think you're going with that?|I felt you take it!",
    "Come back here!|People saw you!|I'm calling for help!|Give it back!|That's mine!|Somebody help!"),
  give: scene([10],
    "Here, take this.|I can spare a little.|I've got something for you.|I found some change.|This is what I have handy.|Sure, here you are.|Let me get that for you.|Take what I've got here.|I can help a little today.|There's a bit in this pocket.|Oh, I do have some cash.|I can share this much.",
    "Hope it helps.|Take care of yourself.|Stay safe today.|Have a good one out there.|Good luck to you.|You're welcome."),
  decline: scene([9],
    "My pockets are empty today.|Sorry, I only have my card.|I haven't got any cash.|Can't swing it today.|Nothing to spare right now.|I wish I had something on me.|Sorry, I'm tapped out.|I've only got my fare.|I'm counting pennies myself.|I can't help this time.|All I've got are my keys.|Afraid I'm short today too.",
    "Good luck though.|Take care.|Hope someone can help.|Sorry about that.|Have a good one.|Stay safe out there."),
  coffee: scene([12],
    "Oh, that's a good cup.|Thanks for making this.|Just what I needed.|This'll keep me going.|That smells terrific.|I was hoping for a coffee.|Now my hands are warm.|Oh, I needed that first sip.|You caught me on a coffee break.|Thanks for the hot cup.|This is a treat.|I appreciate the coffee.",
    "Thanks again.|Have a good one.|See you around.|Take care out here.|Good luck with the cart.|Catch you later."),
  blackCoffee: scene([14],
    "Black coffee for me.|I'll take mine black.|Just coffee, please.|Skip the milk on mine.|Can I get it black?|Plain black is perfect.|No milk for me today.|Straight coffee suits me.|I'll have a cup without milk.|Black, if you please.|Just pour it as it is.|Leave mine nice and dark.",
    "Thanks for asking.|That'll do nicely.|I appreciate it.|That's how I like it.|Thank you kindly.|Much appreciated."),
  milkCoffee: scene([13],
    "Could you put milk in mine?|A splash of milk, please.|I'll take my coffee with milk.|A little milk would be lovely.|Leave some room for milk.|Make mine light, please.|Milk for me today.|Coffee with a drop of milk.|Can I have a little milk in there?|Just a touch of milk in mine.|I like it with milk.|A splash will do.",
    "Thanks so much.|That sounds good.|I appreciate you asking.|Much appreciated.|That'll be lovely.|That's my usual."),
  apology: scene([4,25],
    "Okay, we're good.|I appreciate you saying that.|Apology accepted.|We're all right.|Thanks for checking on me.|Yeah, I'm fine now.|I know it gets crowded.|All right, let's call it even.|I figured it was an accident.|I appreciate that.|Okay, I hear you.|No hard feelings.",
    "Just give me room next time.|Take care of yourself.|Watch your step out there.|Let's keep moving.|See you around.|Have a good one."),
  recognize: scene([21,25],
    "Oh, hello again.|We just passed each other.|Funny meeting you twice on one sidewalk.|We nearly walked through each other earlier.|I remember you from a minute ago.|There's my sidewalk dance partner.|We met elbows a little earlier.|Hey, we meet again.|I recognize you now.|We crossed paths just back there.|Looks like we're headed the same way.|Oh, I see you this time.",
    "How's it going?|You doing all right?|What's up?|Nice to meet you properly.|Did you want to ask me something?|Hello again."),
  wary: scene([31,32,20],
    "I remember that shoulder check.|You're the one who bumped me.|My shoulder remembers you.|We had a pretty rough introduction.|Oh, I remember you now.|Careful coming this way again.|I'd like to keep my balance this time.|I was hoping you'd slow down.|Last time you came through pretty fast.|We got off on the wrong foot.|I see you coming this time.|You're back on my side of the sidewalk.",
    "What's up?|Give me a little room.|Did you need something?|I'm listening.|Easy this time.|Let's start over."),
  robbedAgain: scene([11],
    "You took my wallet.|I know exactly who you are.|I remember your hand in my pocket.|You've got some nerve coming back.|My wallet didn't walk away by itself.|I remember what you did.|I haven't forgotten my wallet.|Oh, now you want to talk?|You remember taking my stuff?|You owe me my wallet.|I recognized you right away.|I don't trust you with my pockets.",
    "Keep your distance.|Leave me alone.|I want it back.|Stay where I can see you.|What do you want?|I've got my eye on you."),
};

// Keep overheard conversations in pairs. The reply belongs to this prompt.
export const exchanges = [
  ["Did you ever get that couch upstairs?", "Took the door off, but it fits."],
  ["Tell me you saved that receipt.", "Folded it into my phone case this time."],
  ["I thought your train was delayed.", "It was the one behind mine for once."],
  ["Did your sister like the cake?", "She asked for the corner with all the icing."],
  ["I swear that pigeon knows me.", "You eat a bagel here every day."],
  ["Did the shoes survive the walk?", "Ask me again when I get home."],
  ["How'd the audition go?", "I remembered the words on the train home."],
  ["When did you start carrying an umbrella?", "The day after I needed one."],
  ["Did you ever finish that crossword?", "Turns out I had Thursday upside down."],
  ["What happened to your old headphones?", "One ear still works if I stand perfectly still."],
  ["Is that the scarf you were knitting?", "It's meant to be a hat, actually."],
  ["You still taking pictures on film?", "Half the fun is forgetting what I took."],
  ["Did they fix the elevator yet?", "Let's just say my legs are getting stronger."],
  ["How early did you get in line?", "Early enough to know everybody's coffee order."],
  ["What happened to that little basil plant?", "It lives with my neighbor now and it's thriving."],
  ["Did you catch the end of the game?", "Heard the whole building cheer through the wall."],
  ["You still owe me a rematch.", "Pick a table that doesn't lean this time."],
  ["Did you bring lunch today?", "It's sitting on the kitchen counter enjoying itself."],
  ["Did you send your mom the photo?", "She cropped me out and kept the dog."],
  ["How did the first day go?", "Found the bathroom without asking twice."],
  ["Did they find your lost glove?", "Somebody put it on the fence like a little flag."],
  ["What did you name the kitten?", "Still calling her the kitten, which might be her name now."],
  ["Did the landlord call you back?", "Only after I stopped waiting by the phone."],
  ["You really walked the whole way?", "The bus kept catching up at every light."],
];
export const reactionPhrases = [...new Set([...Object.values(situations).flatMap(s => [...s.open, ...s.follow]), ...exchanges.flat()])];
const catalog = new Map();
for (const [kind, {open, follow}] of Object.entries(situations)) {
  for (const lead of open) {
    catalog.set(lead, kind);
    for (const tail of follow) catalog.set(lead + ' ' + tail, kind);
  }
}
for (const line of exchanges.flat()) catalog.set(line, 'greet');
export const reactionKind = text => catalog.get(text);

// Boldness already governs how a pedestrian stands their ground in the crowd.
// Bias the first words without assigning any voice or disposition by appearance.
const assertive = new Set([
  "Right past you here.", "Let me squeeze past.", "You first, I insist.",
  "You could've gone around!", "Look up before you take off!", "Excuse you!",
  "You came straight through me!", "Do I look like a revolving door?",
  "You had time to go around.", "I took a step aside for a reason.", "You again, seriously?",
  "I felt the first one just fine.", "You got the whole sidewalk.",
  "You been behind me a while.", "You keep matching my pace.", "I saw you back there earlier.",
]);
const tentative = new Set([
  "Didn't see you there.", "Are your toes okay?", "Sorry, that was my sleeve.", "I should've looked up.",
  "I wasn't braced for that!", "I felt that one.", "You took me by surprise there!", "Ow, my shoulder!",
  "We just did this.", "Oh, it's you again.", "I moved over for you already.", "Didn't we just bump elbows?",
  "Did you mean to catch up with me?", "Are we going to the same place?", "Everything okay back there?",
]);

// Deal every opening once per round citywide. For each opening, deal every
// compatible ending (including silence) before reusing a complete response.
function draw(deck, options, avoid, random, preference) {
  if (!deck.length) deck.push(...options);
  let pool = deck.length > 1 ? deck.filter(value => value !== avoid) : deck;
  if (preference && random() < .72) {
    const preferred = pool.filter(value => preference.has(value));
    if (preferred.length) pool = preferred;
  }
  const pick = pool[Math.floor(random() * pool.length)];
  deck.splice(deck.indexOf(pick), 1);
  return pick;
}

export class ReactionLines {
  constructor(random = Math.random) {
    this.random = random;
    this.rounds = new Map();
    this.actors = new WeakMap();
  }
  choose(actor, kind) {
    const s = situations[kind];
    let round = this.rounds.get(kind);
    if (!round) {
      round = {leads:[], endings:new Map()};
      this.rounds.set(kind, round);
    }
    const tone = actor.bold == null ? null : actor.bold ? assertive : tentative;
    const lead = draw(round.leads, s.open, round.lastLead, this.random, tone);
    round.lastLead = lead;
    let endings = round.endings.get(lead);
    if (!endings) round.endings.set(lead, endings = []);
    const tail = draw(endings, ['', ...s.follow], this.actors.get(actor) || round.lastTail, this.random);
    round.lastTail = tail;
    this.actors.set(actor, tail);
    return tail ? lead + ' ' + tail : lead;
  }
}

export const streetLines = new ReactionLines();

export function noteContact(person, speed, time) {
  if (!person || person.dead || person.out || !(speed > 1.2)) return;
  const age = time - (person.streetContact?.time ?? -Infinity);
  if (age >= 0 && age < 1.3) return;
  const kind = age >= 0 && age < 25 ? 'repeat' : speed >= 4 ? 'shove' : 'brush';
  person.streetContact = {time, kind};
  return kind;
}
export function recentContact(person, time) {
  const event = person.streetContact;
  return event && time >= event.time && time - event.time < 120 ? event.kind : null;
}

export function pedestrianSituation(person) {
  if (person.dead || person.out || person.gone || person.state === 'down' || person.talkingTo) return null;
  if (person.state === 'cower') return person.held ? 'held' : 'cower';
  if (person.state === 'fight') return 'fight';
  if (person.scare > 2.45) return person.state === 'cross' ? 'crossing' : 'nearMiss';
  if (person.state === 'flee' && person.fireOrigin) return 'fire';
  if (person.state === 'flee' || person.visit?.scared) return 'flee';
  return null;
}
