import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { modelSpeakers, npcVoice, recordedSpeakers } from '../dist/npc-voices.js';
import { reactionPhrases, situations, ReactionLines, reactionKind } from '../dist/street-reactions.js';
import { dialogue } from '../dist/voice-lines.js';
import { patrolAppearance } from '../dist/human-cast.js';
import { dress, seeded } from '../dist/crowd.js';

const assets = new URL('../dist/assets/audio/', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, assets)));

test('the street cast can draw all 904 model speakers and keeps each identity across encounters', () => {
  assert.deepEqual(modelSpeakers.toSorted((a,b) => a-b), Array.from({length:904}, (_, id) => id));
  const pools = [3, 13].map(member => {
    const voices = new Set();
    for (let id = 0; id < 9000; id++) {
      const first = npcVoice({resident:{id}, look:{member, variant:0}}, 0);
      assert.deepEqual(npcVoice({resident:{id}, look:{member, variant:2}}, 99), first);
      assert.ok(first.fallback < recordedSpeakers.length);
      voices.add(first.voice);
    }
    return voices;
  });
  assert.deepEqual(pools.map(pool => pool.size), [472, 432]);
  assert.equal(new Set([...pools[0], ...pools[1]]).size, 904);
  const officer = {id:'dispatch-19', carId:'patrol-42', uniform:1, unit:'patrol'};
  assert.deepEqual(npcVoice(officer, 0), npcVoice({...officer, id:'dispatch-82', look:patrolAppearance('patrol-42',1)}, 41));
  const people = Array.from({length:250}, (_,id) => ({look:dress('casual', seeded(id), null, .3, 3)}));
  assert.ok(new Set(people.map(p=>npcVoice(p,0).voice)).size > 150, 'passersby sharing one visual model have individual voices');
});

test('every speaker has a pre-rendered hello and every voiced line has a pronunciation', () => {
  const phonemes = readJson('voices/phonemes.json');
  assert.deepEqual(Object.keys(phonemes), [...new Set([...dialogue,...reactionPhrases])]);
  for (const phones of Object.values(phonemes)) {
    assert.ok(phones.length > 2 && phones.every(Number.isInteger));
    assert.equal(phones[0], 1);
    assert.equal(phones.at(-1), 2);
  }
  for (let id = 0; id < recordedSpeakers.length; id++) {
    const regions = readJson(id < 2 ? 'regions.json' : 'voices/' + id + '.json');
    for (let line = 0; line < dialogue.length; line++) assert.ok(regions['line' + line + '-' + id][1] > 0);
  }
  for (let group = 0; group < 28; group++) {
    const base = 'voices/hello/' + group;
    const regions = readJson(base + '.json');
    let end = 0;
    for (let index = 0; index < 32; index++) {
      const slot = recordedSpeakers.length + group * 32 + index;
      const [start, length] = regions['line0-' + slot];
      assert.ok(start >= end && length > .1);
      end = start + length;
    }
    const bytes = statSync(new URL(base + '.mp3', assets)).size;
    assert.ok(Math.abs(bytes / 5000 - end) < .25, '40 kbit/s bank duration matches its clip index');
  }
});

test('every situation exhausts all exact responses and spaces out recurring openings across the crowd', () => {
  const dealer = new ReactionLines();
  const cast = [{}, {}, {}];
  const unique = new Set();
  const phones = readJson('voices/phonemes.json');
  for (const [kind, {open, follow}] of Object.entries(situations)) {
    const lines = new Set();
    for (let round = 0; round <= follow.length; round++) {
      const leads = new Set();
      for (let i=0;i<open.length;i++) {
        const text = dealer.choose(cast[i%3], kind);
        const [lead, ...tail] = text.split(/(?<=[.!?]) /);
        assert.equal(reactionKind(text), kind);
        assert.ok(phones[lead] && tail.every(part=>phones[part]));
        leads.add(lead); lines.add(text); unique.add(text);
      }
      assert.equal(leads.size, open.length);
    }
    assert.equal(lines.size, open.length * (follow.length+1));
  }
  assert.ok(unique.size >= 2000);
});

test('sidewalk temperament biases an opening while both personalities keep the full repertoire', () => {
  const bold=new ReactionLines(()=>0), cautious=new ReactionLines(()=>0);
  const direct={bold:true}, reserved={bold:false};
  assert.match(bold.choose(direct,'shove'),/^You came straight through me!/);
  assert.match(cautious.choose(reserved,'shove'),/^Ow, my shoulder!/);
  for(const [dealer,actor] of [[bold,direct],[cautious,reserved]]) {
    const cycle=new Set();
    for(let i=0;i<situations.shove.open.length*(situations.shove.follow.length+1)-1;i++) cycle.add(dealer.choose(actor,'shove'));
    assert.equal(cycle.size,209);
  }
});
