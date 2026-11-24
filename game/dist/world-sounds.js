import { dialogue } from './voice-lines.js';
import { npcVoice, modelSpeakers, recordedSpeakers } from './npc-voices.js';
import { VoiceSynthesis } from './voice-synthesis.js';
import { sirenPath, sirenProfile } from './siren-acoustics.js';

// The core recordings and the variation bank can become playable independently.
// Emitters have separate positions, envelopes and playback rates.
const limit = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, (a.y || 0) - (b.y || 0));
const heavy = (car) => ['van', 'pickup', 'suv', 'minivan', 'bus'].includes(car?.shape || car?.type);


export class WorldSounds {
  constructor(context, output) {
    this.c = context;
    this.output = output;
    this.background = context.createGain();
    this.background.connect(output);
    this.transients = new Set();
    this.streetTails = new Map();
    this.loops = new Map();
    this.cars = new WeakMap();
    this.sirens = new WeakMap();
    this.walkers = new WeakMap();
    this.kitchenTasks = new WeakMap();
    this.contacts = new WeakMap();
    this.speakers = new WeakMap();
    this.bumpTimes = new WeakMap();
    this.voiceBanks = new Map();
    this.voiceLoads = new Map();
    this.voiceRetries = new Map();
    this.speakerCount = 0;
    this.synthesis = new VoiceSynthesis();
    this.spokenLines = new Map();
    this.stride = 0;
    this.stepIndex = 0;
    this.nextVoice = 0;
    this.variants = new Map();
    this.lastVariant = new Map();
  }
  async readBank(index, audio) {
    const [regions, buffer] = await Promise.all(
      [index, audio].map(async (file) => {
        const response = await fetch(new URL('./assets/audio/' + file, import.meta.url));
        if (!response.ok) throw new Error(file + ' ' + response.status);
        return file.endsWith('.json') ? response.json() : this.c.decodeAudioData(await response.arrayBuffer());
      }),
    );
    return { regions, buffer };
  }
  async load(detail = false) {
    const street = detail === 'street';
    const key = street ? 'loadingStreet' : detail ? 'loadingDetail' : 'loading';
    if ((street ? this.streetBank : detail ? this.detailBuffer : this.buffer) || this[key]) return;
    this[key] = true;
    try {
      const file = street ? 'street' : detail ? 'detail' : 'world';
      const bank = await this.readBank(detail ? file + '.json' : 'regions.json', file + (street ? '.mp3' : '.flac'));
      if (detail) {
        for (const name of Object.keys(bank.regions)) {
          const family = name.split('.')[0];
          if (!this.variants.has(family)) this.variants.set(family, []);
          this.variants.get(family).push(name);
        }
      }
      if (street) this.streetBank = bank;
      else if (detail) {
        this.detailRegions = bank.regions;
        this.detailBuffer = bank.buffer;
      } else {
        this.regions = bank.regions;
        this.buffer = bank.buffer;
      }
    } finally {
      this[key] = false;
    }
  }
  loadBells() {
    if (!this.bellLoad) {
      this.bellLoad = this.readBank('bells.json', 'bells.flac').then(bank => {
        this.bells = bank;
        return bank;
      }).catch(error => { this.bellLoad = null; throw error; });
    }
    return this.bellLoad;
  }
  position(actor, range, exterior = false) {
    const p = this.listener;
    if (!actor || !p) return { gain: 1, pan: 0, cutoff: 16000 };
    const d = distance(actor, p);
    const forward = ((actor.x - p.x) * Math.sin(this.yaw) + (actor.z - p.z) * Math.cos(this.yaw)) / Math.max(2, d);
    const cutoff = limit((16000 / (1 + d * 0.018)) * (forward < 0 ? 1 + 0.3 * forward : 1), 1200, 16000);
    return {
      cutoff: exterior ? Math.min(cutoff, this.streetCutoff) : cutoff,
      gain:
        ((exterior ? this.streetLevel : 1) * Math.max(0, 1 - (d / range) ** 2)) / (1 + (d / (range * 0.22)) ** 2),
      pan: (0.88 * ((actor.z - p.z) * Math.sin(this.yaw) - (actor.x - p.x) * Math.cos(this.yaw))) / Math.max(2, d),
    };
  }
  source(name, repeating, level, side, rate, cutoff, bank, phase, direction) {
    if (!bank && this.streetBank?.regions[name]) bank = this.streetBank;
    const detail = this.detailRegions?.[name];
    const region = bank?.regions[name] || detail || this.regions?.[name];
    if (!region || level <= 0.0001) return;
    const c = this.c,
      source = c.createBufferSource(),
      gain = c.createGain(),
      spatial = direction && c.createPanner?.(),
      pan = spatial ? null : c.createStereoPanner?.();
    source.buffer = bank?.buffer || (detail ? this.detailBuffer : this.buffer);
    source.playbackRate.value = rate;
    gain.gain.value = repeating ? 0 : level;
    const destination = repeating ? this.background : this.output;
    if (spatial) {
      spatial.panningModel = 'HRTF'; spatial.rolloffFactor = 0;
      spatial.setPosition(direction.x, direction.y, direction.z);
      gain.connect(spatial).connect(destination);
    } else if (pan) {
      pan.pan.value = limit(side, -1, 1);
      gain.connect(pan).connect(destination);
    } else gain.connect(destination);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    source.connect(filter).connect(gain);
    source.onended = () => {
      this.transients.delete(source);
      this.streetTails.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan?.disconnect();
      spatial?.disconnect();
    };
    const [start, length] = region;
    if (repeating) {
      source.loop = true;
      source.loopStart = start;
      source.loopEnd = start + length;
      const offset = phase == null ? Math.random() * length : (phase * length + c.currentTime * rate) % length;
      source.start(c.currentTime, start + offset);
    } else {
      this.transients.add(source);
      source.start(c.currentTime, start, length);
    }
    return { source, filter, gain, pan, spatial, name, length };
  }
  play(name, actor, volume, range, rate = 1, exterior = false, bank) {
    if (!this.playing) return;
    const at = this.position(actor, range, exterior);
    const voice = this.source(name, false, volume * at.gain, at.pan, rate, at.cutoff, bank);
    if (exterior && actor && voice?.length > .55) {
      this.streetTails.set(voice.source, {voice, actor, volume, range});
    }
    return voice;
  }
  variation(family, fallback) {
    const clips = this.variants.get(family);
    if (!clips?.length) return fallback;
    const last = this.lastVariant.get(family);
    const count = clips.length + (fallback ? 1 : 0);
    const index =
      last == null
        ? Math.floor(Math.random() * count)
        : (last + 1 + Math.floor(Math.random() * Math.max(1, count - 1))) % count;
    this.lastVariant.set(family, index);
    return clips[index] ?? fallback;
  }
  effect(family, actor, volume, range, exterior = false) {
    this.play(this.variation(family), actor, volume, range, 0.97 + Math.random() * 0.06, exterior);
  }
  vehicleContact(kind, car, other, speed) {
    if (!this.playing || !this.listener || !car || !(speed >= 0.85)) return;
    const person = kind !== 'crash';
    const site = person
      ? other
      : other
        ? { x: (car.x + other.x) / 2, y: ((car.y || 0) + (other.y || 0)) / 2, z: (car.z + other.z) / 2 }
        : car;
    if (!site || distance(site, this.listener) > (person ? 40 : 90)) return;
    const now = this.c.currentTime;
    const partner = other || car;
    const contacts = this.contacts.get(car) || new WeakMap();
    const previous = contacts.get(partner) ?? this.contacts.get(partner)?.get(car);
    const sustained = previous && now - previous.time < 0.3 && speed < previous.peak + 4;
    const contact = { time: now, peak: sustained ? Math.max(speed, previous.peak) : speed };
    contacts.set(partner, contact);
    this.contacts.set(car, contacts);
    if (other && other !== car) {
      const reverse = this.contacts.get(partner) || new WeakMap();
      reverse.set(car, contact);
      this.contacts.set(partner, reverse);
    }
    if (sustained) return;
    const outside = !(car.controlled || other?.controlled || other === this.listener);
    const force = limit(speed / 19, 0, 1);
    const gain = 0.42 + 0.76 * Math.sqrt(force);
    if (person) {
      this.play(this.variation('bagHit') || 'fall', site, gain, 42, 0.91 + Math.random() * 0.1, outside);
      if (speed >= 7 && this.detailBuffer) this.play('fall', site, 0.26 + force * 0.35, 35, 0.93, outside);
      if (speed > 4) this.effect('roofHit', site, 0.19 + force * 0.3, 35, outside);
      if (kind === 'cyclist') this.effect('tinHit', site, 0.37 + force * 0.25, 34, outside);
    } else {
      this.crashTake = this.crashTake === 1 ? 2 : 1;
      const light = speed < 5.5,
        inside = !outside && this.listener.mode === 'drive';
      const hit = this.play(
        (light ? 'bumper' : 'crash') + this.crashTake,
        site,
        (light ? 0.21 + speed * 0.085 : gain) * (inside ? 0.83 : 1),
        light ? 32 : 92,
        0.98 + Math.random() * 0.04,
        outside,
      );
      if (inside && hit) {
        hit.filter.frequency.value = this.streetCutoff;
        if (speed >= 5.5) this.play('cabinHit' + this.crashTake, this.listener, 0.24 + force * 0.27, 10);
      }
    }
    if (speed > 4 && distance(site, this.listener) < 17) {
      this.impactUntil = now + 0.26;
      this.witnessSite = { x: site.x, y: site.y, z: site.z, victim: other, time: now };
    }
  }
  loop(key, name, actor, volume, range, rate = 1, exterior = false) {
    return this.mixLoop(key, name, this.position(actor, range, exterior), volume, rate);
  }
  mixLoop(key, name, at, volume, rate, bank, phase) {
    const level = volume * at.gain, now = this.c.currentTime;
    if (level < 0.001) return;
    let voice = this.loops.get(key);
    if (voice && voice.name !== name) {
      voice.gain.gain.setTargetAtTime(0, now, 0.025);
      voice.source.stop(now + 0.12);
      this.loops.delete(key);
      voice = null;
    }
    if (!voice) {
      voice = this.source(name, true, level, at.pan, rate, at.cutoff, bank, phase, at.direction);
      if (!voice) return;
      this.loops.set(key, voice);
    }
    voice.filter.frequency.setTargetAtTime(at.cutoff, now, 0.12);
    voice.used = true;
    voice.gain.gain.setTargetAtTime(level, now, 0.08);
    voice.pan?.pan.setTargetAtTime(at.pan, now, 0.065);
    if (voice.spatial) {
      const {x,y,z} = at.direction;
      if (voice.spatial.positionX) {
        voice.spatial.positionX.setTargetAtTime(x, now, .055);
        voice.spatial.positionY.setTargetAtTime(y, now, .055);
        voice.spatial.positionZ.setTargetAtTime(z, now, .055);
      } else voice.spatial.setPosition(x, y, z);
    }
    voice.source.playbackRate.setTargetAtTime(rate, now, 0.12);
    return voice;
  }
  speakerFor(actor) {
    let speaker = this.speakers.get(actor);
    if (!speaker) {
      speaker = {...npcVoice(actor,this.speakerCount++), last:-Infinity};
      this.speakers.set(actor, speaker);
    }
    return speaker;
  }
  loadVoice(id, extension = 'flac') {
    if (!this.voiceLoads.has(id)) {
      const loaded = this.readBank('voices/' + id + '.json', 'voices/' + id + '.' + extension)
        .then((bank) => {
          this.voiceBanks.set(id, bank);
          if (this.voiceBanks.size > 3) this.voiceBanks.delete(this.voiceBanks.keys().next().value);
        })
        .catch(() => this.voiceRetries.set(id, this.c.currentTime + 15))
        .finally(() => this.voiceLoads.delete(id));
      this.voiceLoads.set(id, loaded);
    }
    return this.voiceLoads.get(id);
  }
  bump(actor, speed) {
    if (!this.playing || !actor || actor.out || !(speed > 1.2)) return;
    const now = this.c.currentTime,
      previous = this.bumpTimes.get(actor) ?? -Infinity;
    if (now - previous < 1.3) return;
    this.bumpTimes.set(actor, now);
    this.effect('cloth', actor, Math.min(0.3, 0.09 + speed * 0.025), 8);
    if (now < (this.nextBump || 0) || (this.voice && now < this.voiceEnd) || this.pendingSpeech?.deliberate)
      return;
    const first = now - previous < 25 ? 31 : speed >= 4 ? 26 : 21;
    const last = this.speakerFor(actor).line;
    let line = first + Math.floor(Math.random() * 5);
    if (line === last) line = first + ((line - first + 1) % 5);
    this.nextBump = now + 1.4;
    this.say(actor, line, true);
  }
  say(actor, line, deliberate = false, phones, signal) {
    if (!this.playing || !actor || !this.listener || signal?.aborted) return;
    if (phones) {
      const ids=phones;
      if (this.synthesis.failed || typeof line!=='string' ||
          !Array.isArray(ids) || ids.length>2048 || ids[0]!==1 || ids.at(-1)!==2 ||
          !ids.every(id=>Number.isInteger(id) && id>=0 && id<256)) return;
    } else {
      if (typeof line === 'string') line = dialogue.indexOf(line);
      if (!Number.isInteger(line) || !dialogue[line]) return;
    }
    if (this.c.currentTime < this.nextVoice && !deliberate) return;
    const speaker = this.speakerFor(actor);
    if (!deliberate && this.c.currentTime - speaker.last < 17) return;
    if (speaker.line === line && this.c.currentTime - speaker.last < 1.2) return;
    if (!deliberate && this.pendingSpeech?.deliberate) return;
    if (speaker.voice >= recordedSpeakers.length) this.synthesis.warm();
    const id = this.synthesis.failed && speaker.voice >= recordedSpeakers.length ? speaker.fallback : speaker.voice;
    const name = (phones ? 'conversation-' : 'line') + line + '-' + id;
    const extended = id >= recordedSpeakers.length;
    const greetingPack = 'hello/' + Math.floor((id - recordedSpeakers.length) / 32);
    const greeting = extended && line === 0 && this.c.currentTime >= (this.voiceRetries.get(greetingPack) || 0);
    const synthesize = Boolean(phones) || (extended && !greeting);
    const bankKey = greeting ? greetingPack : id;
    const bank = synthesize ? this.spokenLines.get(name) : this.voiceBanks.get(bankKey);
    if (!bank && (phones || extended || (id >= 2 && this.c.currentTime >= (this.voiceRetries.get(id) || 0)))) {
      const pending = this.pendingSpeech;
      if (pending && (!deliberate || (pending.actor === actor && pending.line === line && pending.deliberate))) return;
      const request = this.pendingSpeech = {actor, line, deliberate, time: this.c.currentTime};
      const ready = synthesize
        ? this.synthesis.render(modelSpeakers[id], phones ? line : dialogue[line], phones)
        : this.loadVoice(bankKey, greeting ? 'mp3' : 'flac');
      const cancel=()=>{if(this.pendingSpeech===request)this.pendingSpeech=null;};
      signal?.addEventListener('abort',cancel,{once:true});
      ready.then(pcm => {
        signal?.removeEventListener('abort',cancel);
        if (this.pendingSpeech !== request) return;
        this.pendingSpeech = null;
        if (synthesize && pcm) {
          const buffer = this.c.createBuffer(1, pcm.length, 22050);
          buffer.copyToChannel(pcm, 0);
          this.spokenLines.set(name, {buffer, regions: {[name]: [0, buffer.duration]}});
          if (this.spokenLines.size > 32) this.spokenLines.delete(this.spokenLines.keys().next().value);
        }
        if (this.playing && !actor.gone && (deliberate || this.c.currentTime - request.time < 1.5)) {
          this.say(actor, line, deliberate, phones, signal);
        }
      });
      return;
    }
    if (bank && !synthesize) {
      this.voiceBanks.delete(bankKey);
      this.voiceBanks.set(bankKey, bank);
    }
    const clip = !bank && id >= 2 ? 'line' + line + '-' + (id % 2) : name;
    const voice = this.play(clip, actor, 0.85, deliberate ? 12 : 28, speaker.rate, !deliberate, bank);
    if (!voice) return;
    this.pendingSpeech = null;
    if (this.voice && this.c.currentTime < this.voiceEnd) {
      this.voice.gain.gain.setTargetAtTime(0, this.c.currentTime, 0.015);
      this.voice.source.stop(this.c.currentTime + 0.06);
    }
    speaker.line = line;
    this.voiceRange = deliberate ? 12 : 28;
    this.voiceOutside = !deliberate;
    this.voice = voice;
    this.talker = actor;
    signal?.addEventListener('abort',()=>{
      if (this.voice!==voice || this.c.currentTime>=this.voiceEnd) return;
      voice.gain.gain.setTargetAtTime(0,this.c.currentTime,.015);
      voice.source.stop(this.c.currentTime+.06);this.voiceEnd=this.c.currentTime;this.nextVoice=this.voiceEnd;
    },{once:true});
    this.voiceEnd = this.c.currentTime + (bank?.regions || this.regions)[clip][1] / speaker.rate;
    this.nextVoice = this.voiceEnd + 3;
    speaker.last = this.c.currentTime;
  }
  horn(car) {
    const big = heavy(car);
    this.play(big ? 'truckHorn' : 'horn', car, 0.85, 95, big ? 0.91 : car?.shape === 'hatch' ? 1.15 : 1, true);
  }
  feet(sim, time, stepCount) {
    const p = sim.player,
      previous = this.foot;
    this.foot =
      this.playing && p.mode === 'walk' && !p.move && !p.reaction && !sim.seat && !sim.subway?.journey.aboard
        ? { x: p.x, z: p.z, y: p.y, ground: p.grounded, vy: p.vy || 0, time, stepCount }
        : null;
    if (!previous || !this.foot || time <= previous.time) {
      this.stride = 0;
      return;
    }
    const travel = Math.hypot(p.x - previous.x, p.z - previous.z);
    if (travel > 2.5 || (!p.grounded && !p.water)) {
      this.stride = 0;
      return;
    }
    const landing = p.grounded && !previous.ground,
      speed = travel / (time - previous.time);
    if (!landing && p.slide > 0) { this.stride = 0; return; }
    const stride = 0.78 + limit((speed - 2) / 5, 0, 1) * 0.48;
    this.stride += travel;
    const synced = !p.water && Number.isFinite(stepCount) && Number.isFinite(previous.stepCount);
    if (!landing && (synced ? stepCount === previous.stepCount || travel < .001 : this.stride < stride)) return;
    this.stride %= stride;
    const surface = p.water
      ? p.grounded
        ? 'wade'
        : 'water'
      : p.standing
        ? 'metalStep'
        : sim.room
          ? sim.room.finish?.floor === 'wood'
            ? 'wood'
            : 'tile'
          : this.footing?.(p) || 'hard';
    const basic = p.water ? 'water' : surface === 'wood' ? 'wood' : 'hard';
    const variants = basic === 'wood' ? 2 : 3;
    this.stepIndex = (this.stepIndex + 1 + Math.floor(Math.random() * (variants - 1))) % variants;
    this.play(
      this.variation(surface, basic === surface ? basic + (1 + this.stepIndex) : undefined) ||
        basic + (1 + this.stepIndex),
      p,
      0.205 + limit(speed * 0.021, 0, 0.135),
      10,
      0.96 + 0.08 * Math.random(),
    );
    if (landing && previous.vy < -4 && !p.water) this.play('fall', p, limit(-previous.vy / 16, 0.25, 1), 14);
  }
  boardContact(p) {
    const board = this.playing && p.mode === 'skate' ? p.board : null;
    if (board && this.board === board) {
      if (this.boardGround && !p.grounded && board.trick)
        this.play(this.variation('deckPop','deckPop'), p, 0.53, 12, 1.08 + Math.random() * 0.1);
      if (!this.boardGround && p.grounded && !board.grind)
        this.play(this.variation('deckLand','deckLand'), p, limit(0.26 - this.boardVy * 0.07, 0.3, 0.85), 12, 0.95 + Math.random() * 0.1);
    }
    this.board = board;
    this.boardGround = p.grounded || Boolean(board?.grind);
    this.boardVy = p.vy || 0;
  }
  wheels(p, pedaling) {
    const speed = Math.abs(p.speed);
    if (speed < 0.35) return;
    const volume = limit(speed / 5, 0, 1);
    if (p.mode === 'skate' && (p.grounded || p.board?.grind)) {
      const sample = p.board?.grind ? 'deckScrape' : 'deckRoll';
      this.loop('board', sample, p, 0.5 * volume, 12, limit(0.66 + speed * 0.085, 0.65, 1.65));
    } else if (p.mode === 'bike') {
      this.loop(
        'bike',
        pedaling ? 'bikeChain' : 'bikeHub',
        p,
        0.41 * volume,
        12,
        limit(0.56 + speed * 0.1, 0.6, 1.65),
      );
    }
  }
  streetLife(sim, {hours, daylight, altitude}) {
    const p = sim.player, now = this.c.currentTime;
    // The contact map contains only currently loaded street trees, park trunks and scaffold posts.
    if (!(now < this.nextStreetScan)) {
      this.nextStreetScan = now + 1;
      this.canopy = this.scaffold = null;
      let treeRange = 36, workRange = 48;
      for (const [group, bodies] of sim.streetObjects?.groups || []) {
        const shed = group === 'shedPost';
        if (!shed && group !== 'tree' && !group.startsWith('park-trees')) continue;
        for (const body of bodies) {
          if (body.pose) continue;
          const d = distance(body, p);
          if (shed && d < workRange) {
            workRange = d;
            this.scaffold = {x:body.x, y:body.y + body.height, z:body.z};
          } else if (!shed && d < treeRange) {
            treeRange = d;
            this.canopy = {x:body.x, y:body.y + Math.min(7,body.height || 4), z:body.z};
          }
        }
      }
    }
    if (this.streetBank && this.scaffold && hours >= 8 && hours < 17 && !(now < this.nextWork)) {
      this.effect('worksite', this.scaffold, .39, 54, true);
      this.nextWork = now + 12 + Math.random() * 21;
    }
    if (this.canopy) {
      this.loop('leaves', 'leaves.street.0', this.canopy, .18, 36, 1, true);
      if (this.streetBank && daylight && !(now < this.nextSparrow)) {
        this.effect('sparrow', this.canopy, .33, 37, true);
        this.nextSparrow = now + 10 + Math.random() * 19;
      }
    }
    const street = Math.max(0, 1 - Math.max(0, altitude - 3) / 40);
    const plaza = limit(1 - Math.hypot(p.x - 1305, p.z + 3764) / 245, 0, 1);
    const traffic = this.trafficLevel || 0;
    const late = hours < 5 || hours >= 23;
    const at = {gain:this.streetLevel * street, cutoff:Math.min(5500,this.streetCutoff), pan:0};
    this.mixLoop('plazaBed', 'plaza.street.0', at, plaza * (late ? .10 : .28), 1);
    const cityLevel = (1 - plaza) * (late ? .07 + .10*traffic : .23*traffic);
    this.mixLoop('streetBed', late ? 'nightStreet.street.0' : 'avenue.street.0', at, cityLevel, 1);
    // A passing rider carries the sound with them, even when the listener is still.
    let closest = null, near = 22;
    for (const r of sim.bikeTraffic?.riders || []) {
      if (r.abandoned || r.crash || r.speed < .65) continue;
      const d = distance(r,p);
      if (d < near) { closest = r; near = d; }
    }
    if (closest) this.loop('passingBike', 'bikeHub', closest, .24 * Math.min(1,closest.speed / 4),
      22, limit(.66 + closest.speed * .09,.72,1.55), true);
  }
  pedestrianSteps(people, now) {
    // A few individual pairs of feet can be distinguished over the crowd bed.
    const nearby = [];
    for (const person of people) {
      if (person.gone || person.sitting || person.cycling || person.reaction || person.state === 'down') continue;
      const d = distance(person, this.listener);
      if (d < 11) nearby.push({ person, d });
    }
    nearby.sort((a, b) => a.d - b.d);
    for (const { person } of nearby.slice(0, 4)) {
      const old = this.walkers.get(person);
      const travel = old ? Math.hypot(person.x - old.x, person.z - old.z) : 0;
      const dt = now - (old?.time ?? now);
      const continuous = dt > 0 && dt < 0.4 && travel < 9 * dt;
      let stride = continuous ? old.stride + travel : Math.random() * 0.65;
      const pace = continuous ? travel / dt : 0;
      const length = 0.69 + Math.min(pace, 5) * 0.07;
      let variant = old?.variant ?? 0;
      if (travel > 0 && stride >= length) {
        stride %= length;
        variant = (variant + 1 + Math.floor(Math.random() * 2)) % 3;
        const surface = this.footing?.(person) || 'hard';
        this.play(
          this.variation(surface, surface === 'hard' ? 'hard' + (variant + 1) : undefined) ||
            'hard' + (variant + 1),
          person,
          0.125 + Math.min(pace, 5) * 0.019,
          13,
          0.91 + Math.random() * 0.13,
          true,
        );
      }
      this.walkers.set(person, { x: person.x, z: person.z, time: now, stride, variant });
    }
  }
  streetVoices(sim, people, enclosed) {
    const p = sim.player;
    let count = 0,
      nearest = null;
    let witness = null,
      nearMiss = null;
    const incident = this.witnessSite;
    for (const person of people) {
      if (enclosed || person.gone || person.out || person.state === 'down') continue;
      const d = distance(person, p);
      if (d < 18) {
        count += 1 - d / 18;
        if (!nearest || d < distance(nearest, p)) nearest = person;
      }
      if (d < 12 && person.state === 'fight') this.say(person, 5 + (this.speakerCount % 2));
      if (d < 16 && person.scare > 2.45 && (!nearMiss || d < distance(nearMiss, p))) nearMiss = person;
      if (
        incident &&
        d < 18 &&
        person !== incident.victim &&
        distance(person, incident) < 11 &&
        (!witness || distance(person, incident) < distance(witness, incident))
      )
        witness = person;
    }
    if (nearest && p.mode === 'walk') this.synthesis.warm();
    if (incident && this.c.currentTime - incident.time >= 0.28) {
      if (witness && this.c.currentTime - incident.time < 1.4) this.say(witness, Math.random() < 0.5 ? 18 : 19);
      this.witnessSite = null;
    } else if (!incident && nearMiss) this.say(nearMiss, [15, 16, 17, 20][Math.floor(Math.random() * 4)]);
    if (count > 1) this.loop('people', 'crowd', nearest, Math.min(0.3, count * 0.045), 28, 1, true);
    for (const officer of sim.police?.officers || []) {
      if (
        !enclosed &&
        sim.police.state === 'chase' &&
        officer.sees &&
        !officer.returning &&
        !officer.reaction &&
        distance(officer, p) < 23
      )
        this.say(officer, officer.cuffing || officer.aiming ? 8 : 7);
    }
  }
  patrolSiren(sim, car) {
    const now = this.c.currentTime, p = sim.player;
    if (!this.sirenBank && !this.sirenLoad && now >= (this.sirenRetry || 0)) {
      this.sirenLoad = this.readBank('sirens.json', 'sirens.flac')
        .then(bank => { this.sirenBank = bank; })
        .catch(() => { this.sirenRetry = this.c.currentTime + 15; })
        .finally(() => { this.sirenLoad = null; });
    }
    let unit = this.sirens.get(car);
    if (!unit) {
      unit = sirenProfile(car.id);
      this.sirens.set(car, unit);
    }
    const angle = car.angle || 0, fx = Math.sin(angle), fz = Math.cos(angle);
    const horn = { x: car.x + 1.6 * fx, y: (car.y || 0) + .75, z: car.z + 1.6 * fz };
    const ear = { x: p.x, y: (p.y || 0) + 1.5, z: p.z };
    const d = distance(ear, horn), dt = now - unit.lastTime;
    // Measure actual relative motion, including AI turns and a moving listener.
    // Discard jumps from travel, car recycling or returning from pause.
    const radial = dt > 0 && dt < .45 ? (d - unit.distance) / dt : 0;
    const speed = Math.abs(radial) < 100 ? radial : 0;
    unit.lastTime = now; unit.distance = d;
    const fromSeat = p.vehicleId === car.id;
    const facing = limit(((p.x - horn.x) * fx + (p.z - horn.z) * fz) / Math.max(1, d), -1, 1);
    const at = this.position(horn, 450, true);
    const dx = horn.x - ear.x, dy = horn.y - ear.y, dz = horn.z - ear.z;
    const forward = dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), norm = Math.max(d, .1);
    at.direction = {
      x: (dz * Math.sin(this.yaw) - dx * Math.cos(this.yaw)) / norm,
      y: (dy * cp - forward * sp) / norm,
      z: -(forward * cp + dy * sp) / norm,
    };
    if (!unit.path || now >= unit.probeAt || !(dt < .45) || Math.abs(radial) >= 100) {
      // Trace the outside portion to the entrance. The room's door filter
      // handles the rest of the path from the entrance to the player's ears.
      const entry = sim.room && sim.doorway?.plan;
      const portal = entry && Number.isFinite(entry.nx) ?
        { x: entry.x + entry.nx, y: (sim.doorway.floor ?? p.y ?? 0) + 1.5, z: entry.z + entry.nz } : ear;
      unit.path = sirenPath(sim, portal, horn);
      unit.probeAt = now + .23 + .12 * unit.phase;
    }
    const blocked = 1 - Math.exp(-unit.path.solid / 7);
    at.gain = this.streetLevel * (1 - Math.min(1, d / 450) ** 2) / (1 + d / 42)
      * (.84 + .16 * facing) * (1 - .72 * blocked);
    at.cutoff = Math.min(at.cutoff, (11200 + 4200 * facing) / (1 + d / 240) * (1 - .88 * blocked));
    if (fromSeat) at.pan *= .2;
    const cycle = (now + unit.phase * unit.cycle) % unit.cycle;
    const junction = car._edge?.to;
    if (junction?.plan && car.speed > 3 && Math.hypot(car.x - junction.x, car.z - junction.z) < 12 + 20 * unit.phase)
      unit.junctionUntil = now + 1.2;
    const yelp = now < unit.junctionUntil || cycle < unit.yelpSeconds;
    const name = this.sirenBank ? (yelp ? 'yelp' : 'wail') : 'siren';
    const rate = unit.tuning * (fromSeat ? 1 : limit(343 / (343 + speed), .8, 1.25));
    const voice = this.mixLoop('siren' + car.id, name, at, .95, rate, this.sirenBank, unit.phase);
    if (voice) this.sirenReflection(voice, unit.path.bounce);
  }
  sirenReflection(voice, bounce) {
    const c = this.c, now = c.currentTime;
    if (!voice.echo && bounce && c.createDelay) {
      const delay = c.createDelay(.25), filter = c.createBiquadFilter(), gain = c.createGain();
      const pan = c.createStereoPanner?.();
      filter.type = 'lowpass'; filter.frequency.value = 2900; gain.gain.value = 0;
      delay.delayTime.value = bounce.delay;
      voice.gain.connect(delay).connect(filter).connect(gain);
      if (pan) gain.connect(pan).connect(this.background); else gain.connect(this.background);
      voice.echo = { delay, gain, pan };
      const release = voice.source.onended;
      voice.source.onended = () => { release(); delay.disconnect(); filter.disconnect(); gain.disconnect(); pan?.disconnect(); };
    }
    if (!voice.echo) return;
    const { delay, gain, pan } = voice.echo;
    gain.gain.setTargetAtTime(bounce?.level || 0, now, .12);
    if (bounce) {
      delay.delayTime.setTargetAtTime(bounce.delay, now, .12);
      pan?.pan.setTargetAtTime(this.position(bounce, 450).pan, now, .09);
    }
  }
  vehicles(sim, throttle = 0) {
    const p = sim.player;
    const engines = [];
    for (const car of sim.cars) {
      const d = distance(car, p);
      if (d > 450) continue;
      const speed = Math.abs(car.speed || 0);
      if (car.type === 'police' && car.siren && !car.destroyed && !car._abandoned)
        this.patrolSiren(sim, car);
      if (d > 65) continue;
      const observed = this.cars.get(car);
      const old = observed && this.c.currentTime - observed.seen < 0.45 ? observed : null,
        open = (car.doorOpen || 0) > 0.035;
      if (old && old.open !== open && !car.destroyed) {
        const outside = car.id !== p.vehicleId;
        const door = open ? 'unlatch' : 'latch';
        this.play(outside ? door : this.variation(open ? 'cabDoorOpen' : 'cabDoorClose', door), car, .85, 38, 1, outside);
      }
      const driving = Boolean(car.controlled || (p.vehicleId != null && car.id === p.vehicleId));
      const electric = car.identity?.performance?.fuel === 'E';
      const gear = Math.min(6, Math.floor(speed / 8));
      const glass = car.brokenGlass | car.shotGlass;
      let shifted = old?.shifted ?? -Infinity;
      if (old && glass & ~old.glass) this.effect('glassBreak', car, 0.68, 42, !driving);
      if (old && driving && !old.driving && old.parked && !car.destroyed)
        this.effect(electric ? 'evOn' : heavy(car) ? 'heavyOn' : 'motorOn', car, 0.63, 36);
      if (old?.driving && !driving && car.parked && !electric && !car.destroyed)
        this.effect(heavy(car) ? 'heavyOff' : 'motorOff', car, 0.48, 28);
      if (
        old?.driving &&
        driving &&
        gear !== old.gear &&
        !electric &&
        car.speed > 0 &&
        this.c.currentTime - shifted > 0.65
      ) {
        this.effect('gear', car, 0.22, 9);
        shifted = this.c.currentTime;
      }
      if (car.speed < -0.6 && ['van', 'bus'].includes(car.shape || car.type) && !car.destroyed)
        this.loop('reverse' + car.id, 'reverse.0', car, 0.47, 50, 1, true);
      this.cars.set(car, {
        seen: this.c.currentTime,
        open,
        speed,
        driving,
        glass,
        gear,
        shifted,
        parked: car.parked,
      });
      const tireSpeed = Math.hypot(car.velocityX || 0, car.velocityZ || 0);
      const sideways = tireSpeed * Math.abs(Math.sin(car.slipAngle || 0));
      const scrub = Math.max((sideways - 1.8) / 9, (car.tireScrub || 0) * .58);
      if (!car.destroyed && car.grounded !== false && tireSpeed > 4 && scrub > .015) {
        this.loop(
          'skid' + car.id,
          'tireSkid',
          car,
          limit(scrub, 0, 0.72),
          48,
          0.91 + Math.min(sideways / 45, 0.28),
          true,
        );
      }
      if (car.destroyed || car.burningSince != null || car.identity?.performance?.fuel === 'E') continue;
      if (!driving && (car.parked || (speed < 1 && !car._edge && !car.hired))) continue;
      engines.push({ car, speed, d, gear, driving, previousSpeed: old?.speed ?? speed });
    }
    engines.sort((a, b) => Number(b.driving) - Number(a.driving) || a.d - b.d);
    for (const { car, speed, d, gear, driving, previousSpeed } of engines.slice(0, 8)) {
      const revs = gear === 6 ? 1 + speed * 0.009 : 0.84 + (speed - gear * 8) * 0.092 + gear * 0.048;
      const load = driving ? limit(throttle, 0, 1) : limit((speed - previousSpeed) * 2, 0, 1);
      const simulated = driving || car._loose > 0;
      const vx = simulated ? car.velocityX || 0 : Math.sin(car.angle || 0) * car.speed;
      const vz = simulated ? car.velocityZ || 0 : Math.cos(car.angle || 0) * car.speed;
      const radial =
        ((car.x - p.x) * (vx - (p.velocityX || 0)) + (car.z - p.z) * (vz - (p.velocityZ || 0))) / Math.max(d, 1);
      this.loop(
        'motor' + car.id,
        driving && this.detailBuffer
          ? heavy(car)
            ? 'heavyCab.0'
            : 'motorCab.0'
          : heavy(car)
            ? 'largeMotor'
            : 'motor',
        car,
        (driving ? 0.49 : speed < 1 ? 0.17 : 0.33) * (1 + load * 0.42),
        55,
        (revs + load * 0.14) * limit(343 / (343 + radial), 0.89, 1.13),
        !driving,
      );
    }
  }
  interiors(sim) {
    const view = sim.doorway;
    const openness = Math.abs(view?.door?.angle || 0);
    if (view && view === this.doorView && view.door && view.plan) {
      const frame = { x: view.plan.x, z: view.plan.z, y: view.floor };
      if (!this.doorOpen && openness > 0.21) {
        this.doorOpen = true;
        this.play(this.variation('shopOpen', 'shopOpen'), frame, 0.64, 16);
      } else if (this.doorOpen && openness < 0.065) {
        this.doorOpen = false;
        this.play(this.variation('shopClose', 'shopClose'), frame, 0.62, 19);
      }
    } else this.doorOpen = openness > 0.21;
    this.doorView = view;
    const level = sim.room ? 1 : Math.min(1, openness) * 0.32;
    if (!level) return;
    for (const actor of view?.actors || []) {
      if (actor.gone || actor.escape) continue;
      const owner = actor.serviceOwner,
        station = owner?.cooking?.at;
      const task = owner?.task;
      if (task !== this.kitchenTasks.get(actor)) {
        this.kitchenTasks.set(actor, task);
        if (task && !task.point && task.actor === actor) {
          if (task.phase === 'setting down plate' || station === 'pass')
            this.effect('plate', actor, 0.43 * level, 12);
          else if (['wok', 'range', 'flat'].includes(station)) this.effect('pot', actor, 0.34 * level, 12);
          else if (station === 'bar' || (task.phase === 'making drink' && task.face?.shape === 'espresso'))
            this.effect('glassClink', actor, 0.33 * level, 11);
        }
      }
      if (actor.clip === 'cutHair') this.loop(actor, 'snip', actor, 0.64 * level, 13);
      else if (actor.clip === 'chop') this.loop(actor, 'chop', actor, 0.54 * level, 13);
      else if (
        actor.clip === 'reach' &&
        (station === 'espresso' || (owner?.phase === 'making drink' && owner.task?.face?.shape === 'espresso'))
      )
        this.loop(actor, 'espresso', actor, 0.51 * level, 17);
      else if (
        actor.clip === 'flip' ||
        (actor.clip === 'toss' && station === 'wok') ||
        (actor.clip === 'stir' && ['range', 'boil', 'steam'].includes(station)) ||
        (station === 'fry' && actor.clip === 'reach')
      )
        this.loop(actor, 'sizzle', actor, 0.55 * level, 15);
    }
  }
  update(sim, time, playing, { yaw = 0, pitch = 0, people = [], throttle = 0, pedaling = false, footing, stepCount, hours = 12, daylight = true, altitude = 0 } = {}) {
    this.listener = sim.player;
    this.yaw = yaw;
    this.pitch = pitch;
    this.playing = playing;
    this.footing = footing;
    const p = sim.player;
    const enclosed = sim.room || sim.subway?.enclosed || sim.subway?.journey?.aboard;
    const frame = sim.doorway?.plan;
    const fromDoor = frame ? Math.hypot(frame.x - p.x, frame.z - p.z) : 0;
    const door = Math.min(1, Math.abs(sim.doorway?.door?.angle || 0)) / (1 + fromDoor * 0.12);
    const cabin = p.mode === 'drive' || p.mode === 'passenger';
    const car = cabin ? sim.vehicle || sim.cars.find(item => item.id === p.vehicleId) : null;
    const cabinOpen = Math.min(
      1,
      Math.max(car?.doorOpen || 0, car?.missingDoors ? 1 : car?.brokenGlass || car?.shotGlass ? 0.62 : 0),
    );
    const underwater = p.water && p.y + 1.4 < p.water.level;
    this.streetCutoff = underwater
      ? 580
      : enclosed
        ? 1100 + door * 5700
        : cabin
          ? 3200 + cabinOpen * 8400
          : 16000;
    this.streetLevel = underwater
      ? 0.15
      : enclosed
        ? 0.13 + door * 0.32
        : cabin
          ? 0.62 + cabinOpen * 0.32
          : 1;
    this.feet(sim, time, stepCount);
    this.boardContact(p);
    if (playing && this.voice && this.voiceEnd > this.c.currentTime) {
      const at = this.position(this.talker, this.voiceRange, this.voiceOutside);
      this.voice.pan?.pan.setTargetAtTime(at.pan, this.c.currentTime, 0.08);
      this.voice.filter.frequency.setTargetAtTime(at.cutoff, this.c.currentTime, 0.08);
      this.voice.gain.gain.setTargetAtTime(0.85 * at.gain, this.c.currentTime, 0.08);
    }
    if (playing && this.nextMix > this.c.currentTime) return;
    this.nextMix = playing ? this.c.currentTime + 0.065 : 0;
    for (const voice of this.loops.values()) voice.used = false;
    const duck =
      playing && this.c.currentTime < this.impactUntil
        ? 0.43
        : playing && this.voice && this.c.currentTime < this.voiceEnd
          ? 0.58
          : 1;
    if (duck !== this.lastDuck) {
      this.background.gain.setTargetAtTime(duck, this.c.currentTime, duck < 1 ? 0.05 : 0.25);
      this.lastDuck = duck;
    }
    if (playing) {
      for (const {voice,actor,volume,range} of this.streetTails.values()) {
        const at = this.position(actor, range, true);
        voice.pan?.pan.setTargetAtTime(at.pan, this.c.currentTime, .07);
        voice.filter.frequency.setTargetAtTime(at.cutoff, this.c.currentTime, .09);
        voice.gain.gain.setTargetAtTime(volume * at.gain, this.c.currentTime, .08);
      }
      const water = p.water || sim.transport?.active?.spec.kind === 'boat' ? 1 : this.shoreLevel;
      if (!enclosed && water > 0) this.loop('shore', 'shore', null, 0.34 * water, 1);
      const journey = sim.subway?.journey;
      if (journey?.aboard && journey.phase === 'running') this.loop('train', 'subway', null, 0.48, 1);
      if (!enclosed && !underwater) this.streetLife(sim, {hours, daylight, altitude});
      this.streetVoices(sim, people, enclosed);
      if (!enclosed) this.pedestrianSteps(people, this.c.currentTime);
      this.wheels(p, pedaling);
      this.vehicles(sim, throttle);
      this.interiors(sim);
    } else {
      if (this.wasPlaying) {
        this.cars = new WeakMap();
        this.walkers = new WeakMap();
        this.contacts = new WeakMap();
        this.pendingSpeech = null;
        this.witnessSite = null;
        this.impactUntil = 0;
        this.doorView = null;
        for (const source of this.transients) source.stop();
        this.transients.clear();
        this.streetTails.clear();
      }
      this.voice = null;
    }
    this.wasPlaying = playing;
    for (const [key, voice] of this.loops)
      if (!voice.used) {
        voice.gain.gain.setTargetAtTime(0, this.c.currentTime, 0.025);
        voice.source.stop(this.c.currentTime + 0.12);
        this.loops.delete(key);
      }
  }
}
