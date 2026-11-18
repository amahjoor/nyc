import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIND } from '../dist/places.js';
import { createPhone, listPlaces, describePlace, formatDistance, CATEGORIES, ROWS } from '../dist/phone.js';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const place = (name, kind, x, z, extra = {}) => ({ id: name, kind, group: KIND[kind].group, name, x, z, bin: 0, area: 0, grade: '', ...extra });
const around = () => [place('FANELLI CAFE', 'american', 30, 0, { grade: 'A' }), place('RAYS', 'pizza', 100, 0), place('', 'bodega', 10, 5), place('LUCKY NAILS', 'nails', 400, 0), place('ONE TEN REPAIR', 'repair', 0, 900),
  place('THE EAR INN', 'bar', 60, 60), place('THUMA', 'coffee', 5, 0), place('HOTEL EDISON', 'hotel', 0, 250)];

// The page as far as the phone uses it: elements by id, with a text, a hidden flag, a value and listeners.
function page() {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) {
      const listeners = {}, attributes = {};
      elements.set(id, { id, hidden: false, disabled: false, textContent: '', value: '0', attributes, setAttribute: (name, value) => { attributes[name] = value; }, getAttribute: name => attributes[name],
        addEventListener: (name, listener) => { (listeners[name] ||= []).push(listener); }, fire: name => (listeners[name] || []).forEach(listener => listener({})) });
    }
    return elements.get(id);
  };
  return { $, elements, click: id => $(id).fire('click') };
}

test('distances read as a phone gives them, and a place is described by what it is and whether it is open', () => {
  assert.deepEqual([formatDistance(1), formatDistance(30), formatDistance(159), formatDistance(160), formatDistance(1609.344), formatDistance(5000)], ['10 FT', '100 FT', '520 FT', '0.1 MI', '1.0 MI', '3.1 MI']);
  assert.deepEqual(describePlace(around()[0], 13), { name: 'FANELLI CAFE', kind: 'RESTAURANT', status: 'OPEN', grade: 'GRADE A' });
  assert.deepEqual(describePlace(around()[2], 4), { name: 'DELI GROCERY', kind: 'DELI GROCERY', status: 'OPEN', grade: '' });
  assert.equal(describePlace(around()[3], 23).status, 'CLOSED');
});

test('the nearby list is the nearest first, narrowed by category and by what is typed', () => {
  const all = listPlaces(around(), { x: 0, z: 0, hours: 13 });
  assert.deepEqual(all.map(row => row.name), ['THUMA', 'DELI GROCERY', 'FANELLI CAFE', 'THE EAR INN', 'RAYS', 'HOTEL EDISON', 'LUCKY NAILS', 'ONE TEN REPAIR']);
  assert.equal(all[2].note, 'RESTAURANT · 100 FT · OPEN · GRADE A');
  assert.equal(all[1].note, '40 FT · OPEN', 'a place known only by its kind does not say it twice');
  assert.deepEqual(listPlaces(around(), { category: 'eat', x: 0, z: 0 }).map(row => row.name), ['FANELLI CAFE', 'RAYS']);
  assert.deepEqual(listPlaces(around(), { category: 'cars', x: 0, z: 0 }).map(row => row.name), ['ONE TEN REPAIR']);
  assert.deepEqual(listPlaces(around(), { category: 'drinks', x: 0, z: 0, hours: 9 }).map(row => row.note), ['BAR · 280 FT · CLOSED']);
  // Typing finds a name, or a kind of place.
  assert.deepEqual(listPlaces(around(), { query: ' ray ', x: 0, z: 0 }).map(row => row.name), ['RAYS']);
  assert.deepEqual(listPlaces(around(), { query: 'nail', x: 0, z: 0 }).map(row => row.name), ['LUCKY NAILS']);
  assert.deepEqual(listPlaces(around(), { query: 'hotel', category: 'eat', x: 0, z: 0 }), []);
  // Every category names groups of kinds the game knows; between them they cover every group.
  const groups = new Set(Object.values(KIND).map(kind => kind.group)), covered = new Set(CATEGORIES.flatMap(category => category.groups || []));
  assert.deepEqual([...groups].filter(group => !covered.has(group)), []);
  assert.deepEqual([...covered].filter(group => !groups.has(group)), []);
});

test('every part of the phone the game fills in is on the page', () => {
  const ids = ['phone', 'phone-clock', 'phone-title', 'phone-cash', 'phone-home', 'phone-nearby', 'phone-place', 'phone-contacts', 'phone-wallet', 'phone-app-nearby', 'phone-app-contacts', 'phone-app-wallet', 'phone-app-map',
    ...CATEGORIES.map(category => `phone-chip-${category.id}`), 'phone-search', 'phone-empty', 'phone-prev', 'phone-next', 'phone-page', 'phone-place-name', 'phone-place-kind', 'phone-place-note', 'phone-directions',
    'phone-contact-dispatch', 'phone-wallet-cash', 'phone-wallet-fares', 'phone-wallet-miles', 'phone-wallet-lights', 'phone-back', 'phone-close', 'phone-button', 'place-hint'];
  for (let i = 0; i < ROWS; i++) ids.push(`phone-row-${i}`, `phone-row-${i}-name`, `phone-row-${i}-note`);
  for (const id of ids) assert.equal(html.split(`id="${id}"`).length, 2, `${id} appears once`);
  for (const category of CATEGORIES) assert.match(html, new RegExp(`id="phone-chip-${category.id}">${category.label}<`));
  assert.match(html, /<section id="phone" class="phone" hidden/);
  assert.match(html, /Open phone<\/span><kbd>↑<\/kbd>/);
});

test('the phone opens on its home screen, lists what is nearby, and sends the player to a place', () => {
  const { $, click } = page(), sent = [], opened = [];
  let now = { x: 0, z: 0, hours: 13, clock: '1:00 PM', cash: 1234.4, fares: 3, miles: 2.34, redLights: 2 };
  const phone = createPhone({ $, places: around, state: () => now, onDirections: target => sent.push(target.name), onJob: () => sent.push('job'), onMap: () => sent.push('map'), onOpenChange: open => opened.push(open) });
  assert.equal(phone.open, false);
  phone.toggle();
  assert.deepEqual([phone.open, $('phone').hidden, $('phone-home').hidden, $('phone-nearby').hidden, $('phone-back').hidden], [true, false, false, true, true]);
  assert.deepEqual([$('phone-clock').textContent, $('phone-cash').textContent, $('phone-title').textContent, $('phone-search').value], ['1:00 PM', '$1,234.40', 'PHONE', '']);
  // Nearby: six to a page, nearest first.
  click('phone-app-nearby');
  assert.deepEqual([phone.screen, $('phone-nearby').hidden, $('phone-home').hidden, $('phone-back').hidden, $('phone-title').textContent], ['nearby', false, true, false, 'NEARBY']);
  const names = () => Array.from({ length: ROWS }, (_, i) => $(`phone-row-${i}`).hidden ? null : $(`phone-row-${i}-name`).textContent);
  assert.deepEqual(names(), ['THUMA', 'DELI GROCERY', 'FANELLI CAFE', 'THE EAR INN', 'RAYS', 'HOTEL EDISON']);
  assert.deepEqual([$('phone-page').textContent, $('phone-prev').disabled, $('phone-next').disabled, $('phone-empty').hidden, $('phone-chip-all').getAttribute('aria-pressed')], ['1 / 2', true, false, true, 'true']);
  click('phone-next');
  assert.deepEqual(names(), ['LUCKY NAILS', 'ONE TEN REPAIR', null, null, null, null]);
  assert.deepEqual([$('phone-page').textContent, $('phone-prev').disabled, $('phone-next').disabled], ['2 / 2', false, true]);
  // A category, then a search.
  click('phone-chip-eat');
  assert.deepEqual(names(), ['FANELLI CAFE', 'RAYS', null, null, null, null]);
  assert.deepEqual([$('phone-chip-eat').getAttribute('aria-pressed'), $('phone-chip-all').getAttribute('aria-pressed'), $('phone-page').textContent], ['true', 'false', '1 / 1']);
  $('phone-search').value = 'thuma'; $('phone-search').fire('input');
  assert.deepEqual([names()[0], $('phone-empty').hidden], [null, false], 'no cafe of that name among places to eat');
  click('phone-chip-all');
  assert.deepEqual(names(), ['THUMA', null, null, null, null, null]);
  $('phone-search').value = ''; $('phone-search').fire('input');
  // A place: what it is, how far, and directions to it.
  click('phone-row-2');
  assert.deepEqual([phone.screen, $('phone-place-name').textContent, $('phone-place-kind').textContent, $('phone-place-note').textContent], ['place', 'FANELLI CAFE', 'RESTAURANT', '100 FT · OPEN · GRADE A']);
  // While the phone is out it follows the player and the clock, once a second.
  now = { ...now, x: 30, z: 300, hours: 4.5, clock: '4:30 AM' };
  phone.update(10); phone.update(10.5);
  assert.deepEqual([$('phone-place-note').textContent, $('phone-clock').textContent], ['0.2 MI · CLOSED · GRADE A', '4:30 AM']);
  click('phone-back');
  assert.equal(phone.screen, 'nearby');
  assert.equal(names()[0], 'HOTEL EDISON', 'the list is now nearest to where the player has got to');
  click('phone-row-0'); click('phone-directions');
  assert.deepEqual([sent, phone.open, $('phone').hidden], [['HOTEL EDISON'], false, true]);
  // Contacts and the wallet.
  phone.setOpen(true);
  assert.equal(phone.screen, 'home', 'it opens on the home screen again');
  click('phone-app-wallet');
  assert.deepEqual([$('phone-wallet-cash').textContent, $('phone-wallet-fares').textContent, $('phone-wallet-miles').textContent, $('phone-wallet-lights').textContent], ['$1,234.40', '3', '2.3', '2']);
  click('phone-back'); click('phone-app-contacts'); click('phone-contact-dispatch');
  assert.deepEqual([sent, phone.open], [['HOTEL EDISON', 'job'], false]);
  phone.setOpen(true); click('phone-app-map');
  assert.deepEqual([sent.at(-1), phone.open], ['map', false]);
  phone.setOpen(true); click('phone-close'); phone.setOpen(false);
  assert.deepEqual(opened, [true, false, true, false, true, false, true, false], 'the game is told each time it is taken out or put away, once');
  // With nothing loaded around, it says so.
  const empty = page(), bare = createPhone({ $: empty.$ });
  bare.setOpen(true); empty.click('phone-app-nearby');
  assert.deepEqual([empty.$('phone-empty').hidden, empty.$('phone-page').textContent, empty.$('phone-next').disabled], [false, '', true]);
});

test('the arrow keys navigate home and the dock, Enter selects, and editing keeps native keys', () => {
  const { $ } = page();
  const doc = { activeElement: null };
  const home = [['nearby', 0, 0], ['work', 60, 0], ['contacts', 0, 200], ['wallet', 60, 200]];
  const apps = home.map(([name, left, top]) => {
    const app = $('phone-app-' + name);
    app.closest = () => null;
    app.focus = () => { doc.activeElement = app; };
    app.click = () => app.fire('click');
    app.getBoundingClientRect = () => ({ left, top, width: 50, height: 50 });
    return app;
  });
  $('phone').ownerDocument = doc;
  $('phone').contains = node => apps.includes(node);
  $('phone-home').querySelectorAll = () => apps;
  const phone = createPhone({ $ });
  function press(key) {
    let prevented = false;
    phone.handleKey({ key, preventDefault: () => { prevented = true; } });
    return prevented;
  }
  phone.setOpen(true);
  assert.equal(doc.activeElement.id, 'phone-app-nearby');
  for (const [key, app] of [['ArrowUp', 'nearby'], ['ArrowRight', 'work'], ['ArrowDown', 'wallet'], ['ArrowLeft', 'contacts']]) {
    assert.equal(press(key), true);
    assert.equal(doc.activeElement.id, 'phone-app-' + app);
  }
  press('Enter');
  assert.equal(phone.screen, 'contacts');
  press('Backspace');
  assert.equal(phone.screen, 'home');
  press('Enter');
  assert.equal(phone.screen, 'nearby');
  doc.activeElement = { matches: () => true };
  assert.equal(press('ArrowLeft'), false);
  assert.equal(press('Backspace'), false);
  assert.equal(phone.screen, 'nearby');
  press('Escape');
  assert.equal(phone.open, false);
});
