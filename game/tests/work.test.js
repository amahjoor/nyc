import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../dist/simulation.js';
import { Work, EMPLOYERS } from '../dist/work.js';

function fixture() {
  const sim = new Simulation({
    bounds: { minX: -3000, minZ: -3000, maxX: 3000, maxZ: 3000 }, roads: [], buildings: [],
    spawn: { ...EMPLOYERS.kitchen, angle: 0 }, missionPoints: [{ name: 'Prince St', x: 170, z: 80 }],
  });
  const person = { state: 'walk' }, shop = { id: 'corner', name: 'Corner Deli', kind: 'bodega' };
  let screen, guided, now = 10000, atCounter = true;
  const called = [];
  const phone = { openList(title, rows, pick, { message }) { screen = { title, rows, pick, message }; }, setOpen() { screen = null; } };
  const work = new Work({ sim, phone: () => phone, meet: (title,message,rows) => { screen = {title,message,rows,pick: row => row.choose(), inPerson: true}; }, pedestrian: () => person, counter: () => atCounter ? shop : null,
    fronts: () => [], hours: () => 13, save: () => called.push(structuredClone(work.record)), random: () => .75,
    now: () => now, guide: site => { guided = site; } });
  const choose = name => {
    const row = screen.rows.find(row => row.name === name);
    assert.ok(row, `Missing ${name} on ${screen.title}`);screen.pick(row);
  };
  return { work, sim, person, shop, choose, called, screen: () => screen, guided: () => guided,
    leaveCounter() { atCounter = false; }, restock() { now += 600001; } };
}

for (const job of ['kitchen', 'finance']) test(`${job} shifts require the workplace and pay for four decisions exactly once`, () => {
  const f = fixture(), site = EMPLOYERS[job];
  Object.assign(f.sim.player, { x: 2000, z: 2000 });
  f.work.board(); f.choose(site.role); f.choose('Show workplace on map'); assert.equal(f.guided(), site);
  Object.assign(f.sim.player, { x: site.x, z: site.z });
  f.work.job(job); f.choose('Clock in');
  const first = f.screen().message;
  f.work.restore(JSON.parse(JSON.stringify(f.work.record))); f.work.job(job); assert.equal(f.screen().message, first);
  let last;
  for (let i = 0; i < 4; i++) {
    const { rows, message } = f.screen();
    const answer = job === 'kitchen' ? message.match(/· (.+) with (.+)\. Which/).slice(1).join(' + ') :
      '$' + message.match(/\$[\d,]+/g).map(x => Number(x.slice(1).replaceAll(',', ''))).reduce((n, v, j) => j === 2 ? n - v : n + v).toLocaleString('en-US');
    last = rows.find(row => row.name === answer); assert.ok(last, message);
    assert.equal(f.sim.cash, 0); f.choose(answer);
  }
  assert.equal(f.sim.cash, site.wage + 4 * site.bonus); assert.equal(f.work.record.shifts, 1);
  last.choose(); assert.equal(f.sim.cash, site.wage + 4 * site.bonus);
  assert.equal(f.called.at(-1).shift, null);
});

test('food orders pay only after restaurant pickup and customer handoff', () => {
  const f = fixture();f.work.food();f.choose('Accept order');
  const job = f.sim.mission;assert.equal(job.stage, 'pickup');
  Object.assign(f.sim.player, job.dropoff);f.sim._updateMission(1);assert.equal(job.stage, 'pickup');
  Object.assign(f.sim.player, { x: job.target.x, z: job.target.z });f.sim._updateMission(1);
  assert.equal(job.stage, 'dropoff');assert.equal(f.sim.cash, 0);
  Object.assign(f.sim.player, job.target);f.sim._updateMission(1);
  assert.equal(job.phase, 'complete');assert.ok(f.sim.cash >= job.reward);
  const balance = f.sim.cash;f.sim._updateMission(1);assert.equal(f.sim.cash, balance);
});

test('coffee uses working capital and inventory, and a pedestrian can transact once', () => {
  const f = fixture();
  f.work.coffee();f.choose('Open a coffee cart');assert.equal(f.work.record.cart, false);
  f.sim.cash = 60;f.work.coffee();f.choose('Open a coffee cart');assert.equal(f.sim.cash, 0);
  f.work.restore(JSON.parse(JSON.stringify(f.work.record)));assert.equal(f.work.record.cups, 6);
  f.work.street();f.choose('Sell a coffee');assert.equal(f.sim.cash, 5);assert.equal(f.work.record.cups, 5);
  f.work.street();f.choose('Steal wallet');assert.equal(f.sim.cash, 5);assert.equal(f.sim.heat, 0);
  f.sim.cash = 12;f.work.coffee();f.choose('Buy six cups');assert.equal(f.work.record.cups, 11);assert.equal(f.sim.cash, 0);
});

test('street donations, wallet theft and till theft have different consequences', () => {
  const f = fixture();f.work.street();assert.equal(f.screen().inPerson, true);f.choose('Ask for spare change');assert.equal(f.sim.cash, 4);assert.equal(f.sim.heat, 0);
  const g = fixture();g.work.street();g.choose('Steal wallet');assert.equal(g.sim.heat, 1);assert.equal(g.person.state, 'flee');
  g.work.rob(g.shop);assert.equal(g.sim.heat, 2);const balance = g.sim.cash;
  g.work.restore(JSON.parse(JSON.stringify(g.work.record)));g.work.rob(g.shop);assert.equal(g.sim.cash, balance);
  g.restock();g.work.rob(g.shop);assert.ok(g.sim.cash > balance);
  const h = fixture();h.work.street();h.leaveCounter();h.work.rob(h.shop);assert.equal(h.sim.cash, 0);
});

test('tills use the shop category and its own completed sales, including after reload', () => {
  const payout=(kind,sales=[])=>{
    const f=fixture();f.shop.kind=kind;
    for(const price of sales)f.work.sale(f.shop,price);
    f.work.sale({id:'elsewhere'},500);
    f.work.restore(structuredClone(f.work.record));
    f.work.rob(f.shop);return f.sim.cash;
  };
  assert.ok(payout('jewelry')>payout('clothes'));assert.ok(payout('clothes')>payout('pizza'));
  assert.equal(payout('pizza',[4,8]),payout('pizza')+12);
  const f=fixture();f.work.rob(f.shop);const before=f.sim.cash;
  assert.ok(f.work.isClosed(f.shop));assert.equal(f.work.isClosed({id:'elsewhere'}),false);
  f.work.sale(f.shop,3.5);f.work.rob(f.shop);assert.equal(f.sim.cash,before);
  const {closures,...olderSave}=f.work.record;f.work.restore(olderSave);assert.ok(f.work.isClosed(f.shop));
  f.restock();assert.equal(f.work.isClosed(f.shop),false);f.work.sale(f.shop,3.5);
  assert.equal(f.work.balance(f.shop),before+3.5);
});
