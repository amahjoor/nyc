import { formatMoney } from './money.js';
import { isOpen, placeName } from './places.js';
import { menuFor } from './menu.js';

// Fictional employers. Both clock-in points are on the shipped city street network.
export const EMPLOYERS = {
  kitchen: { name: 'Greene Street Grill', role: 'Fast-food crew', x: 138.65, z: -100.42, wage: 80, bonus: 8 },
  finance: { name: 'Wall Street Ledger', role: 'Finance associate', x: -773.41, z: 1820.86, wage: 120, bonus: 12 },
};
const BLOCKS = ['9 AM', '11 AM', '1 PM', '3 PM'];
const PLATES = ['Cheeseburger', 'Veggie burger', 'Fish sandwich', 'Chicken sandwich', 'Grilled cheese'];
const SIDES = ['fries', 'slaw', 'salad', 'onion rings'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const option = (name, note, choose) => ({ name, note, choose });
const count = (value, max) => Number.isInteger(value) && value >= 0 && value <= max ? value : 0;

function ticket(shift) {
  // The same open ticket survives closing the phone and loading a save.
  let seed = (shift.seed + Math.imul(shift.block, 0x9e3779b9)) >>> 0;
  const pick = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
  let question, answers;
  if (shift.job === 'kitchen') {
    const dish = pick(PLATES.length), side = pick(SIDES.length);
    question = `Ticket ${12 + pick(80)} · ${PLATES[dish]} with ${SIDES[side]}. Which tray goes out?`;
    answers = [`${PLATES[dish]} + ${SIDES[side]}`, `${PLATES[dish]} + ${SIDES[(side + 1) % SIDES.length]}`, `${PLATES[(dish + 1) % PLATES.length]} + ${SIDES[side]}`];
  } else {
    const opening = (25 + pick(80)) * 100, received = (2 + pick(15)) * 50, fee = (1 + pick(8)) * 25;
    question = `Client balance ${formatMoney(opening)}. A payment of ${formatMoney(received)} came in and a ${formatMoney(fee)} fee went out. Post the closing balance.`;
    answers = [opening + received - fee, opening + received, opening - received - fee].map(formatMoney);
  }
  const correct = pick(3);
  [answers[0], answers[correct]] = [answers[correct], answers[0]];
  return { question, answers, correct };
}

export class Work {
  constructor({ sim, phone, fronts, hours, guide, pedestrian, counter, save, random = Math.random, now = Date.now }) {
    Object.assign(this, { sim, phone, fronts, hours, guide, pedestrian, counter, save, random, now });
    this.met = new WeakSet();
    this.restore();
  }

  restore(record = {}) {
    record = record || {};
    this.record = { shifts: count(record.shifts, 1e7), cart: record.cart === true, cups: 0, shift: null, tills: {} };
    if (this.record.cart) this.record.cups = count(record.cups, 12);
    const s = record.shift;
    if (s && Object.hasOwn(EMPLOYERS, s.job) && Number.isInteger(s.block) && s.block >= 0 && s.block < BLOCKS.length) {
      this.record.shift = { job: s.job, seed: count(s.seed, 0xffffffff), block: s.block, correct: count(s.correct, s.block) };
    }
    for (const [id, until] of Object.entries(record.tills || {})) {
      if (Number.isFinite(until) && until > this.now()) this.record.tills[id] = until;
    }
  }

  list(title, message, rows) {
    this.phone().openList(title, rows, row => row.choose(), { message, keepOpen: true });
  }

  board(message = '') {
    const s = this.record.shift;
    const rows = Object.entries(EMPLOYERS).map(([job, site]) => option(site.role,
      `${site.name} · ${s?.job === job ? 'Resume shift' : formatMoney(site.wage) + ' per shift + bonus'}`, () => this.job(job)));
    rows.push(option('Food courier', 'Collect a restaurant order and deliver it for a fee and tip.', () => this.food()),
      option('Coffee cart', this.record.cart ? `${this.record.cups} cups in stock` : '$60 startup · includes six cups', () => this.coffee()),
      option('Street interactions', 'Talk to someone nearby or visit a shop counter.', () => this.street()));
    this.list('Work', message || `${this.record.shifts} shifts completed · Pick a way to earn.`, rows);
  }

  job(job) {
    const site = EMPLOYERS[job], current = this.record.shift;
    if (current && current.job !== job) return this.board('Finish your current shift or quit it before taking a different job.');
    const onSite = () => this.sim.player.mode === 'walk' && distance(this.sim.player, site) <= 25 && !this.sim.heat;
    const quit = option('Quit shift', 'Leave without collecting this paycheck.', () => {
      this.record.shift = null; this.save(); this.board('You clocked out early.');
    });
    if (!onSite()) {
      const rows = [option('Show workplace on map', site.name, () => { this.phone().setOpen(false); this.guide(site); })];
      if (current) rows.push(quit);
      return this.list(site.name, 'Arrive on foot and clear any wanted level, then open Work here.', rows);
    }
    if (!current) return this.list(site.name, `9 AM–5 PM in four playable rounds. Base pay ${formatMoney(site.wage)}, plus ${formatMoney(site.bonus)} per correct ticket.`, [
      option('Clock in', 'Start at 9 AM', () => {
        if (!onSite() || this.record.shift) return this.job(job);
        this.record.shift = { job, seed: Math.floor(this.random() * 0x100000000), block: 0, correct: 0 };
        this.save(); this.job(job);
      }),
    ]);
    const round = current.block, task = ticket(current);
    this.list(`${site.name} · ${BLOCKS[round]}`, task.question, [...task.answers.map((answer, i) => option(answer, '', () => {
      if (this.record.shift !== current || current.block !== round || !onSite()) return this.job(job);
      if (i === task.correct) current.correct++;
      current.block++;
      if (current.block < BLOCKS.length) {
        this.save(); this.sim._say(i === task.correct ? 'Correct. Bonus earned.' : 'Supervisor corrected the ticket. Base pay protected.');
        return this.job(job);
      }
      const pay = site.wage + current.correct * site.bonus;
      this.record.shift = null; this.record.shifts++; this.sim.cash += pay; this.save();
      this.board(`5 PM · ${current.correct}/4 correct · Paycheck +${formatMoney(pay)}`);
    })), quit]);
  }

  food() {
    if (this.sim.mission.phase === 'active') return this.board('Finish the current delivery first.');
    const candidates = this.fronts().filter(f => ['food', 'dining', 'cafe'].includes(f.place.group) && isOpen(f.place.kind, this.hours()))
      .sort((a, b) => distance(a, this.sim.player) - distance(b, this.sim.player));
    const front = candidates[0];
    const pickup = front ? { name: placeName(front.place), x: front.x + front.nx * 3.2, z: front.z + front.nz * 3.2 } : { ...EMPLOYERS.kitchen };
    const items = front && menuFor(front.place);
    const meal = items?.find(item => item.effect === 'meal')?.name || 'Lunch special';
    this.list('Food courier', `${pickup.name} has a ${meal.toLowerCase()} ready. Stop at the gold marker to collect it, then follow it to the customer.`, [
      option('Accept order', 'Delivery fee + time bonus at drop-off', () => {
        if (!this.sim.startMission({ pickup, meal })) return this.board(this.sim.notice);
        this.phone().setOpen(false);
      }),
    ]);
  }

  coffee() {
    const r = this.record;
    const rows = [option(r.cart ? 'Buy six cups' : 'Open a coffee cart', r.cart ? '$12 supplies · capacity 12' : '$60 · six cups included', () => {
      const cost = r.cart ? 12 : 60;
      if (r.cups > 6) return this.board('Sell some coffee before restocking.');
      if (this.sim.cash < cost) return this.board(`You need ${formatMoney(cost)} for that purchase.`);
      this.sim.cash -= cost; r.cart = true; r.cups += 6; this.save(); this.coffee();
    })];
    if (r.cart) rows.push(option('Offer coffee nearby', '$5 a cup', () => this.street()));
    this.list('Coffee cart', r.cart ? `${r.cups}/12 cups. Walk up to a pedestrian to make a sale.` : 'Start a sidewalk coffee business. Sell each cup for $5 to a different pedestrian.', rows);
  }

  street() {
    const person = this.pedestrian(), shop = this.counter();
    const rows = [];
    if (person) {
      rows.push(option('Ask for spare change', 'They can say no.', () => this.trade(person, 'ask')));
      if (this.record.cart) rows.push(option('Sell a coffee', `$5 · ${this.record.cups} cups left`, () => this.trade(person, 'sell')));
      rows.push(option('Steal wallet', 'Reported crime · one wanted star', () => this.trade(person, 'steal')));
    }
    if (shop) rows.push(option('Rob the till', 'Reported crime · two wanted stars', () => this.rob(shop)));
    rows.push(option('Back to Work', '', () => this.board()));
    this.list('Street interactions', shop ? placeName(shop) : person ? 'A passerby is within talking distance.' : 'On foot, approach a pedestrian or stand at a shop counter and open this screen.', rows);
  }

  trade(person, action) {
    if (!person || this.pedestrian() !== person) return this.board('They have moved on.');
    if (this.met.has(person)) return this.board('You already spoke to this person.');
    if (action === 'sell' && (!this.record.cart || this.record.cups < 1)) return this.coffee();
    this.met.add(person);
    let amount;
    if (action === 'sell') { this.record.cups--; amount = 5; }
    else if (action === 'ask') amount = this.random() < .55 ? 0 : 1 + Math.floor(this.random() * 4);
    else {
      amount = 6 + Math.floor(this.random() * 20);
      person.state = 'flee'; person.mad = 5;
      this.sim.crime(1, 'Wallet theft reported.');
    }
    this.sim.cash += amount; this.save(); this.phone().setOpen(false);
    this.sim._say(action === 'steal' ? `Wallet +$${amount}. Theft reported.` : action === 'sell' ? 'Coffee sold. +$5.' : amount ? `They gave you $${amount}.` : 'They shake their head and keep walking.');
  }

  rob(shop) {
    if (!shop || this.counter()?.id !== shop.id) return this.board('Go to the shop counter first.');
    const now = this.now(), tills = this.record.tills;
    if (tills[shop.id] > now) return this.board('The register is empty.');
    for (const id of Object.keys(tills)) if (tills[id] <= now) delete tills[id];
    tills[shop.id] = now + 600000;
    const amount = 35 + Math.floor(this.random() * 46);
    this.sim.cash += amount; this.sim.crime(2, `Till +$${amount}. Store alarm reported.`); this.save(); this.phone().setOpen(false);
  }
}
