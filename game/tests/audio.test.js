import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import { CityAudio } from '../dist/audio.js';
import { Simulation } from '../dist/simulation.js';
import { sirenPath } from '../dist/siren-acoustics.js';

const param = () => ({
  value: 0, setValueAtTime(value) { this.value = value; },
  exponentialRampToValueAtTime() {}, setTargetAtTime(value) { this.value = value; },
});
const node = () => ({ connect(destination) { return destination; }, disconnect() {} });
class AudioContext {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 24000;
  destination = node();
  clips = [];
  tones = [];
  async resume() { this.state = 'running'; }
  createGain() { return { ...node(), gain: param() }; }
  createDynamicsCompressor() {
    return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() };
  }
  createOscillator() {
    const tones = this.tones;
    return { ...node(), frequency: param(), start() { tones.push(this.frequency.value); }, stop() {} };
  }
  createBiquadFilter() { return { ...node(), frequency: param(), Q: param() }; }
  createStereoPanner() { return { ...node(), pan: param() }; }
  createBuffer(channels, length, rate) {
    const samples = Array.from({length:channels},()=>new Float32Array(length));
    return { copyToChannel: (source, channel) => samples[channel].set(source), getChannelData: channel => samples[channel], numberOfChannels:channels, duration: length / rate };
  }
  createBufferSource() {
    const clips = this.clips;
    return { ...node(), playbackRate: param(), start(time, offset, duration) { clips.push({ time, offset, duration, buffer: this.buffer }); }, stop() {} };
  }
}

function useAudio(t) {
  const originalWindow = globalThis.window;
  globalThis.window = { AudioContext };
  t.after(() => { globalThis.window = originalWindow; });
  return new CityAudio();
}

test('interface cues start on confirmation and have their own mute setting', async t => {
  const audio = useAudio(t);
  await audio.interfaceCue('select');
  assert.equal(audio.ctx, undefined);
  await audio.interfaceCue('confirm');
  const context = audio.ctx;
  assert.deepEqual(context.clips.map(clip => clip.time), [0]);
  const confirm = context.clips[0].buffer;
  assert.equal(audio.enabled, false);
  assert.doesNotThrow(() => audio.update(null, 0, false), 'interface audio alone needs no city audio graph');

  await audio.interfaceCue('select');
  assert.equal(context.clips.length, 1, 'selection immediately after confirmation stays quiet');
  context.currentTime = .2;
  await audio.interfaceCue('select');
  const select = context.clips[1].buffer;
  assert.ok(select.duration < confirm.duration && confirm.duration < .06);
  const peak = buffer => Math.max(...buffer.getChannelData(0).map(Math.abs));
  assert.ok(peak(select) > 0 && peak(select) < peak(confirm) && peak(confirm) < 1);
  context.currentTime = .4;
  await audio.interfaceCue('confirm');
  assert.deepEqual(context.clips.map(clip => clip.time), [0, .2, .4]);
  assert.equal(context.clips[2].buffer, confirm, 'repeat clicks reuse the rendered sound');

  assert.equal(await audio.setEnabled(true), true);
  assert.equal(audio.ctx, context);
  audio.interfaceEnabled = false;
  const count = context.clips.length;
  await audio.interfaceCue('confirm');
  assert.equal(context.clips.length, count);
  assert.equal(audio.master.gain.value, .35);
  assert.equal(await audio.setEnabled(false), false);
});

test('cash receipts play a short ringing cue, coalesce simultaneous credits and respect interface mute', async t => {
  const audio = useAudio(t);
  await audio.interfaceCue('cash');
  const ctx = audio.ctx, cue = ctx.clips[0].buffer, samples = cue.getChannelData(0);
  assert.ok(cue.duration > .2 && cue.duration < .6);
  assert.ok(Math.max(...samples.map(Math.abs)) < .65);
  for (const start of [.01, .1]) {
    const window = samples.slice(start * ctx.sampleRate, (start + .025) * ctx.sampleRate);
    assert.ok(Math.max(...window.map(Math.abs)) > .09);
  }
  await audio.interfaceCue('cash');
  assert.equal(ctx.clips.length, 1);
  ctx.currentTime = 1;
  await audio.interfaceCue('cash');
  assert.equal(ctx.clips[1].buffer, cue);
  ctx.currentTime = 2;
  audio.interfaceEnabled = false;
  await audio.interfaceCue('cash');
  assert.equal(ctx.clips.length, 2);
});

test('phone taps and the two-part shutter use their own clips and respect interface mute', async t => {
  const audio = useAudio(t);
  await audio.interfaceCue('phoneTap');
  const context = audio.ctx;
  await audio.interfaceCue('phoneShutter');
  await audio.interfaceCue('confirm');
  const [tap, shutter, menu] = context.clips.map(clip => clip.buffer);
  assert.notEqual(tap,menu);
  assert.ok(tap.duration<menu.duration && shutter.duration>menu.duration*2);
  const samples=shutter.getChannelData(0);
  const peak=(from,to)=>Math.max(...samples.slice(from*context.sampleRate,to*context.sampleRate).map(Math.abs));
  assert.ok(peak(0,.012)>.07 && peak(.035,.048)>.07);
  audio.interfaceEnabled=false;
  await audio.interfaceCue('phoneShutter');
  assert.equal(context.clips.length,3);
});

test('recorded sounds follow individual cars, actors and surface contacts', async t => {
  const audio = useAudio(t);
  await audio.setEnabled(true);
  const {world, ctx} = audio;
  world.buffer = {};
  world.regions = JSON.parse(readFileSync(new URL('../dist/assets/audio/regions.json',import.meta.url)));
  const p = {x:0,y:0,z:0,mode:'walk',grounded:true,speed:0};
  const car = {id:1,type:'police',x:8,y:0,z:0,speed:6};
  const person = {x:0,y:0,z:2};
  const sim = {player:p,cars:[car],heat:3};
  const tick = (time,playing=true,yaw=0) => {
    ctx.currentTime=time;
    audio.update(sim,time,playing,{yaw,people:[person],shore:()=>1});
  };
  const last = () => ctx.clips.at(-1).offset;
  tick(0);
  assert.ok(world.loops.has('motor1'));
  assert.ok(!world.loops.has('siren1'));
  car.siren=true; tick(.15);
  assert.ok(world.loops.get('siren1').pan.pan.value<0);
  tick(.3,true,Math.PI);
  assert.ok(world.loops.get('siren1').pan.pan.value>0);
  car.siren=false;car.doorOpen=1;tick(.5);
  assert.ok(!world.loops.has('siren1'));
  assert.equal(last(),world.regions.unlatch[0]);
  car.doorOpen=0;tick(.6);assert.equal(last(),world.regions.latch[0]);
  tick(.7);audio.vehicleContact('crash',car,null,10);
  assert.ok(['crash1','crash2'].some(key=>world.regions[key][0]===last()));
  const beforeStep=ctx.clips.length; p.x=1.3;tick(1);
  assert.ok(ctx.clips.slice(beforeStep).some(clip=>['hard1','hard2','hard3'].some(key=>world.regions[key][0]===clip.offset)));
  assert.ok(/^line(18|19)-0$/.test(world.voice.name),'a nearby witness reacts to the crash');
  p.grounded=false;p.vy=-9;tick(1.2);
  p.grounded=true;p.vy=0;tick(1.4);assert.equal(last(),world.regions.fall[0]);
  sim.room={};sim.doorway={actors:[person]};person.clip='cutHair';tick(2);
  assert.equal(world.loops.get(person).name,'snip');
  person.clip='idle';tick(2.2);assert.ok(!world.loops.has(person));
  person.clip='flip';tick(2.4);assert.equal(world.loops.get(person).name,'sizzle');
  audio.horn({...car,shape:'pickup'});assert.equal(last(),world.regions.truckHorn[0]);
  audio.reply(person,'Hey, how’s it going?');
  assert.equal(last(),world.regions['line0-0'][0]);
  audio.reply(person,'A coffee with milk, please.');
  assert.equal(last(),world.regions['line13-0'][0]);
  tick(2.6,false);assert.equal(world.loops.size,0);
  assert.equal(world.voice,null);
  p.grounded=false;p.water={level:1};p.vy=0;sim.room=null;
  tick(3);const before=ctx.clips.length;tick(3.2);
  assert.equal(ctx.clips.length,before,'floating still makes no repeated foot contacts');
  p.x+=1.5;tick(3.5);
  assert.ok(['water1','water2','water3'].some(key=>world.regions[key][0]===last()));
});

test('muting while audio is unlocking leaves the city audio off', async t => {
  const audio = useAudio(t);
  let resume;
  audio.context().resume = () => new Promise(resolve => { resume = resolve; });
  const enabling = audio.setEnabled(true);
  await audio.setEnabled(false);
  resume();
  assert.equal(await enabling, false);
  assert.equal(audio.master, undefined);
});

test('additional recordings track movement, surface, grip and changing rooms', async t => {
  const audio = useAudio(t);
  await audio.setEnabled(true);
  const {world,ctx} = audio;
  const read = file => JSON.parse(readFileSync(new URL('../dist/assets/audio/'+file,import.meta.url)));
  world.buffer = {};
  world.regions = read('regions.json');
  world.detailBuffer = {};
  world.detailRegions = read('detail.json');
  for (const name of Object.keys(world.detailRegions)) {
    const family = name.split('.')[0];
    if (!world.variants.has(family)) world.variants.set(family, []);
    world.variants.get(family).push(name);
  }
  const car = {id:28,x:6,z:0,speed:8,shape:'van',type:'police',siren:true};
  const p = {mode:'walk',x:0,z:0,y:0,grounded:true,speed:0};
  const sim = {player:p,cars:[car]};
  const tick = (opts={},playing=true) => {
    ctx.currentTime+=.1;
    audio.update(sim,ctx.currentTime,playing,{footing:()=>'grass',...opts});
  };
  const count = family => ctx.clips.filter(clip=>clip.buffer===world.detailBuffer &&
    world.variants.get(family).some(key=>clip.offset===world.detailRegions[key][0])).length;
  tick();
  p.x+=1.45;tick();
  assert.equal(count('grass'),1);
  p.mode='skate';p.speed=5;p.board={};tick();
  assert.equal(world.loops.get('board').name,'deckRoll');
  p.grounded=false;p.board.trick='ollie';p.vy=3;tick();
  assert.equal(world.loops.has('board'),false);
  assert.ok(ctx.clips.some(c=>c.offset===world.regions.deckPop[0]));
  p.grounded=true;tick();
  assert.ok(ctx.clips.some(c=>c.offset===world.regions.deckLand[0]));
  p.board.grind={};tick();assert.equal(world.loops.get('board').name,'deckScrape');
  p.mode='bike';tick({pedaling:true});assert.equal(world.loops.get('bike').name,'bikeChain');
  tick();assert.equal(world.loops.get('bike').name,'bikeHub');
  p.mode='walk';p.speed=0;
  car.velocityX=12;car.slipAngle=.5;tick();assert.ok(world.loops.has('skid28'));
  car.slipAngle=0;car.parked=true;tick();assert.ok(!world.loops.has('skid28'));
  car.controlled=true;p.mode='drive';p.vehicleId=28;tick();
  assert.equal(count('heavyOn'),1);assert.equal(world.loops.get('motor28').name,'heavyCab.0');
  car.speed=-3;tick();assert.ok(world.loops.has('reverse28'));
  car.speed=0;car.controlled=false;p.mode='walk';p.vehicleId=null;car.brokenGlass=1;tick();tick();
  assert.equal(count('glassBreak'),1);assert.equal(count('heavyOff'),1);
  const outside=world.loops.get('siren28').filter.frequency.value;
  const person={x:2,y:0,z:0};
  audio.vehicleContact('person',car,person,13);
  assert.equal(count('bagHit'),1);assert.equal(count('roofHit'),1);
  audio.vehicleContact('person',car,person,13);
  assert.equal(count('bagHit'),1,'persistent overlap is one impact');
  const taxi={id:9,x:3,z:0};
  const beforeCrash=ctx.clips.length;
  audio.vehicleContact('crash',car,taxi,15);audio.vehicleContact('crash',taxi,car,15);
  assert.equal(ctx.clips.length,beforeCrash+1,'both participants report one chassis impact');
  assert.ok(['crash1','crash2'].some(name=>world.regions[name][0]===ctx.clips.at(-1).offset));
  ctx.currentTime+=.4;audio.vehicleContact('crash',car,taxi,2);
  assert.ok(['bumper1','bumper2'].some(name=>world.regions[name][0]===ctx.clips.at(-1).offset));
  const cook={x:1,z:1,clip:'chop'};
  sim.room={};sim.doorway={actors:[cook],door:{angle:0},plan:{x:1,z:0}};tick();
  const shut=world.loops.get('siren28').filter.frequency.value;
  assert.ok(shut<outside);assert.equal(world.loops.get(cook).name,'chop');
  sim.doorway.door.angle=1;tick();assert.ok(world.loops.get('siren28').filter.frequency.value>shut);
  cook.clip='reach';cook.serviceOwner={cooking:{at:'espresso'}};tick();
  assert.equal(world.loops.get(cook).name,'espresso');
  audio.reply(cook,'Hey, how’s it going?');tick();assert.ok(world.background.gain.value<1);
  tick({},false);assert.equal(world.transients.size,0);assert.equal(world.loops.size,0);
});

test('two responding patrols keep independent tones, directions, Doppler and wall reflections', async t => {
  const audio = useAudio(t);
  await audio.setEnabled(true);
  const {world,ctx} = audio;
  ctx.createDelay = () => ({...node(), delayTime:param()});
  const regions = JSON.parse(readFileSync(new URL('../dist/assets/audio/sirens.json',import.meta.url)));
  world.sirenBank = {regions,buffer:{}};
  const cars = ['police-r1','police-r2'].map((id,i)=>({id,type:'police',siren:true,parked:true,x:i?38:-38,y:0,z:0}));
  const p = {mode:'walk',x:0,y:0,z:0};
  let wall = false;
  const sim = {player:p,cars,soundInsideBuilding:(x,y,z)=>z>8 || (wall && x < -10 && x > -30)};
  const tick = (time,yaw=0) => { ctx.currentTime=time;world.update(sim,time,true,{yaw}); };
  tick(0);
  const left=world.loops.get('sirenpolice-r1'), right=world.loops.get('sirenpolice-r2');
  assert.deepEqual([left.name,right.name],['wail','yelp']);
  assert.notEqual(left.source,right.source);
  assert.ok(left.pan.pan.value>0 && right.pan.pan.value<0);
  assert.ok(left.echo.delay.delayTime.value>0 && right.echo.gain.gain.value>0);
  const basePitch=left.source.playbackRate.value, clear=left.filter.frequency.value;
  cars[0].x+=2;tick(.1);
  assert.ok(left.source.playbackRate.value>basePitch);
  cars[0].x-=2;tick(.2,Math.PI);
  assert.ok(left.source.playbackRate.value<basePitch && left.pan.pan.value<0 && right.pan.pan.value>0);
  wall=true;tick(.6);
  assert.ok(left.filter.frequency.value<clear*.55 && left.gain.gain.value<right.gain.gain.value*.6);
  assert.equal(left.echo.gain.gain.value,0);
  const outside=right.filter.frequency.value;
  p.mode='passenger';p.vehicleId='cab';cars.push({type:'taxi',id:'cab',x:0,z:0,parked:true});tick(.7);
  const inside=right.filter.frequency.value;assert.ok(inside<outside);
  cars[2].brokenGlass=1;tick(.8);assert.ok(right.filter.frequency.value>inside);
  cars[0].siren=false;tick(.9);
  assert.ok(!world.loops.has('sirenpolice-r1'));assert.equal(world.loops.get('sirenpolice-r2'),right);
});

test('siren paths respect the mapped building footprint, courtyard and rooftop', () => {
  const ring=(a,b)=>[[a,a],[b,a],[b,b],[a,b]];
  const sim=new Simulation({bounds:{minX:-150,maxX:150,minZ:-150,maxZ:150},spawn:{x:30,z:30},roads:[],
    buildings:[{polygon:ring(-10,10),holes:[ring(-4,4)],height:10}]});
  assert.equal(sim.soundInsideBuilding(0,2,0),false);
  assert.equal(sim.soundInsideBuilding(7,2,0),true);
  assert.equal(sim.soundInsideBuilding(7,14,0),false);
  const path=y=>sirenPath(sim,{x:-28,y,z:0},{x:28,y,z:0});
  assert.ok(path(2).solid>0 && path(2).solid<20);assert.equal(path(14).solid,0);
});

test('traffic keeps the nearest eight moving engines audible in a dense block', async t => {
  const audio=useAudio(t);
  await audio.setEnabled(true);
  const {world}=audio;
  world.buffer={};
  world.regions={motor:[0,1],siren:[1,1]};
  const cars=Array.from({length:20},(_,id)=>({id,speed:5,x:20-id,z:0}));
  Object.assign(cars[0],{type:'police',siren:true});
  audio.update({player:{mode:'walk',x:0,z:0},cars},0,true);
  assert.equal([...world.loops.keys()].filter(k=>k.startsWith('motor')).length,8);
  assert.ok(world.loops.has('motor19') && world.loops.has('siren0'));
});

test('sidewalk contact uses distinct replies for brushes, shoves and repeat bumps in a consistent voice', async t => {
  const audio=useAudio(t);
  await audio.setEnabled(true);
  const {world,ctx}=audio;
  const read=file=>JSON.parse(readFileSync(new URL('../dist/assets/audio/'+file,import.meta.url)));
  world.buffer={};world.regions=read('regions.json');
  world.readBank=async file=>({regions:read(file),buffer:{file}});
  world.update({player:{x:0,z:0,mode:'walk'},cars:[]},0,true);
  const people=Array.from({length:8},()=>({x:1,z:0}));
  assert.equal(new Set(people.map(p=>world.speakerFor(p).voice)).size,8);
  assert.equal(world.speakerFor({resident:{id:'same-resident'}}).voice,world.speakerFor({resident:{id:'same-resident'}}).voice);
  const actor=people[3];
  audio.bump(actor,.5);assert.equal(world.talker,undefined);
  audio.bump(actor,2);
  await world.loadVoice(3);
  assert.equal(world.talker,actor);assert.match(world.voice.name,/^line2[1-5]-3$/);
  const first=world.voice;
  audio.bump(actor,2);assert.equal(world.voice,first);
  ctx.currentTime=5;audio.bump(actor,3);assert.match(world.voice.name,/^line3[1-5]-3$/);
  ctx.currentTime=45;audio.bump(actor,6);assert.match(world.voice.name,/^line(2[6-9]|30)-3$/);
  for(const id of [4,5,6])await world.loadVoice(id);
  assert.equal(world.voiceBanks.size,3);
  assert.ok(!world.voiceBanks.has(3));
});

test('each step of the map zoom is a short tick of its own, higher going in than coming out', async t => {
  const audio=useAudio(t);
  await audio.setEnabled(true);
  const {ctx}=audio;
  const count=()=>ctx.clips.length;
  const before=count();
  audio.mapZoomCue(true);assert.equal(count(),before+1);
  ctx.currentTime=.03;audio.mapZoomCue(true);assert.equal(count(),before+1,'a wheel faster than the tick does not stack them');
  ctx.currentTime=.1;audio.mapZoomCue(false);assert.equal(count(),before+2);
  const inward=ctx.clips.at(-2).buffer,outward=ctx.clips.at(-1).buffer;
  assert.notEqual(inward,outward);
  // Upward crossings of zero in the voiced part: more of them when the tick climbs.
  const crossings=buffer=>{const s=buffer.getChannelData(0);let n=0;for(let i=Math.round(s.length*.3);i<s.length-1;i++)if(s[i]<=0&&s[i+1]>0)n++;return n;};
  assert.ok(crossings(inward)>crossings(outward)*1.3,'going in ends higher than coming out');
  for(const buffer of [inward,outward]){
    assert.ok(buffer.duration<.12,'a tick, not a sweep');
    const samples=buffer.getChannelData(0);
    assert.equal(Math.abs(samples[0]),0);
    assert.equal(Math.abs(samples.at(-1)),0);
    const peak=Math.max(...samples.map(Math.abs));
    assert.ok(peak>.25 && peak<.9,'audible, with headroom');
  }
  ctx.currentTime=.5;audio.cameraStep('rise',1);
  assert.ok(ctx.clips.at(-1).buffer.duration>inward.duration*4,'the camera keeps its own longer cue');
  ctx.currentTime=1;audio.sceneCue('wasted');const wasted=count();
  audio.mapZoomCue(true);assert.equal(count(),wasted,'nothing ticks over an ending');
  ctx.currentTime=4;await audio.setEnabled(false);const muted=count();audio.mapZoomCue(false);assert.equal(count(),muted);
});

test('ending and camera cues play during transitions and match the direction of each zoom step', async t => {
  const audio=useAudio(t);
  await audio.setEnabled(true);
  const {ctx}=audio;
  const count=()=>ctx.clips.length;
  audio.cameraStep('rise',1);const rise=count();
  audio.cameraStep('rise',1);audio.cameraStep('hold',1);assert.equal(count(),rise);
  ctx.currentTime=.5;audio.cameraStep('fall',2);assert.equal(count(),rise+1);
  const outward=ctx.clips.at(-2).buffer,inward=ctx.clips.at(-1).buffer;
  assert.notEqual(inward,outward);
  assert.ok(inward.duration>outward.duration,'the drop leaves a longer bass tail');
  for(const buffer of [outward,inward]){
    assert.equal(buffer.numberOfChannels,2);
    const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
    assert.ok(left.some((sample,i)=>Math.abs(sample-right[i])>.01),'air reflections give the cue width');
    for(const channel of [left,right]){
      assert.equal(Math.abs(channel[0]),0);
      assert.equal(Math.abs(channel.at(-1)),0);
      const peak=Math.max(...channel.map(Math.abs));
      assert.ok(peak>.25 && peak<.9,'the cue has a strong pulse with headroom');
    }
  }
  ctx.currentTime=1;audio.sceneCue('wasted');const wasted=ctx.clips.at(-1).buffer;
  audio.sceneCue('zoomIn');assert.equal(ctx.clips.at(-1).buffer,wasted);
  ctx.currentTime=4;audio.sceneCue('busted');const busted=ctx.clips.at(-1).buffer;
  for(const b of [wasted,busted])assert.ok(b.getChannelData(0).some(x=>Math.abs(x)>.1));
  assert.notEqual(wasted.duration,busted.duration);
  await audio.setEnabled(false);const muted=count();audio.sceneCue('zoomOut');assert.equal(count(),muted);
});

test('new speakers switch from a packed hello to their own model voice and discard superseded speech', async t => {
  const audio = useAudio(t);
  await audio.setEnabled(true);
  const {world, ctx} = audio;
  world.buffer = {};
  world.regions = JSON.parse(readFileSync(new URL('../dist/assets/audio/regions.json', import.meta.url)));
  world.update({player:{mode:'walk', x:0, z:0}, cars:[]}, 0, true);
  world.readBank = async file => ({
    regions: JSON.parse(readFileSync(new URL('../dist/assets/audio/' + file, import.meta.url))),
    buffer: {file},
  });
  const pending = [];
  world.synthesis = {warm() {}, render(speaker, text) {
    return new Promise(resolve => pending.push({speaker, text, resolve}));
  }};
  const actor = {id:'barista', look:{member:24}, x:1, z:0};
  const other = {id:'customer', look:{member:13}, x:1, z:1};
  const id = world.speakerFor(actor).voice;
  const tick = () => new Promise(resolve => setImmediate(resolve));
  world.say(actor, 0, true);
  await tick();
  assert.equal(world.voice.name, 'line0-' + id);
  assert.equal(pending.length, 0);
  world.say(other, 14, true);
  world.say(actor, 13, true);
  pending[0].resolve(Float32Array.of(.5));
  await tick();
  assert.equal(world.pendingSpeech.actor, actor);
  pending[1].resolve(Float32Array.of(.1, .5, .2));
  await tick();
  assert.equal(world.voice.name, 'line13-' + id);
  assert.equal(world.talker, actor);
  assert.equal(world.voice.source.buffer.getChannelData(0)[1], .5);
  ctx.currentTime = 5;
  world.say(actor, 13, true);
  assert.equal(pending.length, 2, 'repeating a synthesized line uses its cached audio');
  world.synthesis.failed = true;
  world.say(actor, 14, true);
  await tick();
  assert.equal(world.voice.name, 'line14-' + world.speakerFor(actor).fallback);
});

test('street recordings follow a turning listener and a traffic bell leaves the player bell available', async t => {
  const audio=useAudio(t);await audio.setEnabled(true);
  const {world,ctx}=audio, player={x:0,y:0,z:0,mode:'bike',speed:0};
  const sim={player,cars:[]};
  world.bells={buffer:{},regions:{'bikeBell.street.0':[0,1.6],'bikeBell.street.1':[2,1.3]}};
  world.update(sim,0,true);
  const rider={id:1,x:4,y:0,z:0};
  await audio.bikeBell(rider);await audio.bikeBell(player,true);await audio.bikeBell(player,true);
  assert.deepEqual(ctx.clips.filter(c=>c.buffer===world.bells.buffer).map(c=>c.offset),[2,0]);
  const [{voice}]=world.streetTails.values();assert.ok(voice.pan.pan.value<0);
  ctx.currentTime=.15;world.update(sim,.15,true,{yaw:Math.PI});assert.ok(voice.pan.pan.value>0);
  world.update(sim,.2,false);assert.equal(world.streetTails.size,0);
});

test('model-matched horns sustain until release and NPC taps have independent envelopes', async t => {
  const audio=useAudio(t);await audio.setEnabled(true);
  const {world,ctx}=audio, car={id:8,shape:'sedan',identity:{make:'Toyota',model:'Corolla',year:2010},x:0,y:0,z:0};
  const sim={player:{mode:'drive',vehicleId:8,x:0,y:0,z:0,speed:0},cars:[car],vehicle:car};
  const regions=JSON.parse(readFileSync(new URL('../dist/assets/audio/ride.json',import.meta.url)));
  world.rideBank={buffer:{},regions};
  world.update(sim,0,true);
  audio.horn(car,'hold');audio.horn(car,'hold');
  assert.equal(world.heldHorn.voice.name,'corolla');
  assert.equal(world.heldHorn.voice.source.loop,true);
  ctx.currentTime=3;world.update(sim,3,true);assert.equal(world.heldHorn.car,car);
  const before=ctx.clips.length;
  audio.horn({...car,x:5,identity:{make:'Dodge',model:'Charger'}},'courteous');
  assert.deepEqual(ctx.clips.slice(before).map(c=>[c.time,c.offset]),[[3,regions.charger[0]],[3.25,regions.charger[0]]]);
  assert.equal(world.heldHorn.car,car);
  audio.releaseHorn();assert.equal(world.heldHorn,null);
  audio.horn(car,'hold');world.update(sim,3.1,false);assert.equal(world.heldHorn,null);
});

test('board contacts follow the push animation, terrain, rail and landing', async t=>{
  const audio=useAudio(t);await audio.setEnabled(true);
  const {world,ctx}=audio, board={phase:.10,pushing:true,pushFoot:1};
  const p={x:0,z:0,y:0,mode:'skate',grounded:true,speed:4,board};
  const regions=JSON.parse(readFileSync(new URL('../dist/assets/audio/ride.json',import.meta.url)));
  world.rideBank={buffer:{},regions};
  for(const [family,key] of [['shoePush','shoePush.0'],['wheelLand','wheelLand.0'],['flipPop','flipPop.0']])
    world.variants.set(family,[key]);
  let surface='road';const sim={player:p,cars:[]};
  const tick=()=>{ctx.currentTime+=.11;world.update(sim,ctx.currentTime,true,{boardSurface:()=>surface});};
  const count=key=>ctx.clips.filter(c=>c.buffer===world.rideBank.buffer && c.offset===regions[key][0]).length;
  tick();assert.equal(world.loops.get('board').name,'boardAsphalt');
  board.phase=.28;tick();board.phase=.39;tick();assert.equal(count('shoePush.0'),1);
  surface='deck';board.braking=true;board.pushing=false;tick();assert.equal(world.loops.get('board').name,'boardWood');assert.ok(world.loops.has('shoeBrake'));
  p.grounded=false;board.trick='kickflip';tick();assert.equal(count('flipPop.0'),1);assert.equal(world.loops.has('board'),false);assert.equal(world.loops.has('shoeBrake'),false);
  board.grind={};tick();tick();assert.equal(count('railOn'),1);assert.equal(world.loops.get('board').name,'boardRail');
  board.grind=null;board.trick=null;tick();p.vy=-4;tick();p.grounded=true;tick();assert.equal(count('wheelLand.0'),1);
});

test('driving separates engine load, rolling tires and braking, including passing electric traffic', async t => {
  const audio = useAudio(t);
  await audio.setEnabled(true);
  const {world, ctx} = audio;
  const index = name => JSON.parse(readFileSync(new URL('../dist/assets/audio/' + name + '.json', import.meta.url)));
  world.buffer = {};
  world.regions = index('regions');
  world.rideBank = {buffer:{}, regions:index('ride')};
  const car = {id:1, controlled:true, x:0, z:0, speed:0, identity:{performance:{fuel:'G', hp:160}}};
  const p = {mode:'drive', vehicleId:1, x:0, z:0, speed:0};
  const sim = {player:p, vehicle:car, cars:[car]};
  let surface = 'hard';
  const tick = (speed, throttle = 0, braking = false) => {
    car.speed = speed;
    ctx.currentTime += .1;
    world.update(sim, ctx.currentTime, true, {throttle, braking, footing:() => surface});
  };
  const voice = key => world.loops.get(key + '1');
  tick(0);
  assert.ok(voice('motor') && !voice('tread'));
  for (let i=1; i<=12; i++) tick(i, 1);
  assert.equal(voice('drive').name, 'petrolPull');
  const pull = voice('drive').gain.gain.value;
  const rolling = voice('tread');
  for (let i=0; i<6; i++) tick(12);
  assert.ok(voice('drive').gain.gain.value < pull / 10);
  assert.equal(voice('tread'), rolling);
  tick(11, -1);
  assert.equal(voice('brake').name, 'brakeFriction');
  surface = 'dirt'; tick(10, 1, true);
  assert.equal(voice('tread').name, 'looseTread');
  assert.ok(!voice('brake'));
  car.grounded = false; tick(10);
  assert.ok(!voice('tread'));
  car.grounded = true; surface = 'hard';
  car.identity.performance.hp = 390; tick(10, 1);
  assert.equal(voice('drive').name, 'sportPull');
  car.identity.performance.fuel = 'D'; tick(-4, -1);
  assert.equal(voice('drive').name, 'dieselPull');
  car.controlled = false; p.mode = 'walk'; p.vehicleId = null; sim.vehicle = null;
  car.identity.performance.fuel = 'E';
  car.x = -3; tick(14); car.x = -1; tick(14);
  assert.equal(voice('drive').name, 'electricDrive');
  assert.ok(!voice('motor'));
  const approach = voice('tread').source.playbackRate.value;
  const left = voice('tread').pan.pan.value;
  car.x = 3; tick(14);
  assert.ok(voice('tread').source.playbackRate.value < approach);
  assert.ok(voice('tread').pan.pan.value * left < 0);
  car.parked = true; tick(0);
  assert.ok(!voice('drive') && !voice('tread'));
});

test('nearby pedestrians exchange the two matching lines and abandon a delayed reply when separated', async t => {
  const audio=useAudio(t);
  await audio.setEnabled(true);
  const {world,ctx}=audio;
  const jobs=[];
  world.synthesis={warm(){},render(id,text){return new Promise(resolve=>jobs.push({text,resolve}));}};
  const a={x:1,z:0,state:'wait'}, b={x:2,z:0,state:'rest'};
  const p={x:0,z:0,mode:'walk'};
  const sim={player:p,cars:[]};
  function tick(time){ctx.currentTime=time;world.update(sim,time,true,{people:[a,b]});}
  async function playJob(){jobs.at(-1).resolve(new Float32Array(22050));await new Promise(r=>setImmediate(r));}
  tick(1);
  const first=world.exchange.lines;
  assert.equal(jobs.at(-1).text,first[0]);
  await playJob();assert.equal(world.talker,a);
  tick(2.4);assert.equal(jobs.at(-1).text,first[1]);
  await playJob();assert.equal(world.talker,b);
  tick(7);tick(50);
  assert.notDeepEqual(world.exchange.lines,first);
  await playJob();tick(51.4);assert.equal(world.pendingSpeech.actor,b);
  b.x=12;tick(51.6);await playJob();
  assert.equal(world.exchange,null);assert.equal(world.talker,a);
});

test('a danger interrupts an overheard opening and the same continuous scare only speaks once', async t => {
  const audio=useAudio(t);await audio.setEnabled(true);
  const {world,ctx}=audio;
  world.synthesis={warm(){},async render(){return new Float32Array(22050);}};
  const people=[{x:1,z:0,state:'rest'},{x:2,z:0,state:'wait'},{x:3,z:0,state:'walk'}];
  const sim={player:{x:0,z:0,mode:'walk'},cars:[]};
  async function tick(time){ctx.currentTime=time;world.update(sim,time,true,{people});await new Promise(r=>setImmediate(r));}
  await tick(1);assert.equal(world.talker,people[0]);
  people[2].state='cower';people[2].held=true;
  await tick(1.2);assert.equal(world.exchange,null);assert.equal(world.talker,people[2]);
  const first=world.voice;
  for(let i=1;i<=180;i++) await tick(1.2+i*.1);
  assert.equal(world.voice,first);
});

test('a walker notices prolonged footsteps behind them, but a stationary neighbor can wait beside them', async t => {
  const audio=useAudio(t);await audio.setEnabled(true);
  const {world,ctx}=audio;
  const lines=[];
  world.synthesis={warm(){}};
  world.say=(actor,line)=>lines.push({actor,line});
  const p={x:0,z:-2,mode:'walk',velocityZ:0};
  const person={x:0,z:0,state:'walk',heading:0,walkSpeed:1.2};
  const sim={player:p,cars:[]};
  const tick=()=>{ctx.currentTime+=.1;world.update(sim,ctx.currentTime,true,{people:[person]});};
  for(let i=0;i<60;i++)tick();
  assert.equal(lines.length,0);
  p.velocityZ=1.2;
  for(let i=0;i<65;i++){p.z+=.12;person.z+=.12;tick();}
  assert.equal(lines.length,1);assert.equal(lines[0].actor,person);
  const {reactionKind}=await import('../dist/street-reactions.js');
  assert.equal(reactionKind(lines[0].line),'followed');
});
