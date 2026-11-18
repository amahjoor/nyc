import { formatMoney } from './money.js';
// The player's phone: what is nearby, who to call, and what is in the wallet.
//
// It is a panel of the page, built in index.html; this module fills it in and
// answers its buttons. What it lists comes from places.js, so "nearest
// bodega" finds a real one, and directions to it use the game's own route
// planner.
import { KIND, placeName, isOpen } from './places.js';
import { offersAt, repairCost, PARTS, RESPRAY_PRICE, RESPRAYS, CALL_OUT, DELIVERY } from './garage.js';

/** What the Nearby list can be narrowed to, and the groups of kinds (places.js) each covers. */
export const CATEGORIES = [
  { id: 'all', label: 'ALL', groups: null }, { id: 'eat', label: 'EAT', groups: ['food', 'dining'] }, { id: 'coffee', label: 'COFFEE', groups: ['cafe'] },
  { id: 'deli', label: 'DELI', groups: ['bodega', 'market'] }, { id: 'drinks', label: 'DRINKS', groups: ['bar', 'liquor'] }, { id: 'hair', label: 'HAIR', groups: ['beauty', 'barber'] },
  { id: 'cars', label: 'CARS', groups: ['auto'] }, { id: 'more', label: 'MORE', groups: ['shop', 'hotel', 'public', 'stand'] },
];
/** Rows the Nearby list shows at a time. */
export const ROWS = 6;

/** A distance as a New Yorker's phone gives it: feet up close, then miles. */
export const formatDistance = metres => metres < 160 ? `${Math.max(10, Math.round(metres * 3.28084 / 10) * 10)} FT` : `${(metres / 1609.344).toFixed(1)} MI`;

/** What the phone says about a place: its name, what it is, whether it is open now and any inspection grade. */
export function describePlace(place, hours) {
  return { name: placeName(place), kind: (KIND[place.kind]?.label || 'Place').toUpperCase(), status: isOpen(place.kind, hours) ? 'OPEN' : 'CLOSED', grade: place.grade ? `GRADE ${place.grade}` : '' };
}

/**
 * The places to list: those of a category whose name or kind contains
 * `query`, nearest first. Each row is { place, name, note, distance }.
 */
export function listPlaces(places, { category = 'all', query = '', x = 0, z = 0, hours = 12 } = {}) {
  const groups = CATEGORIES.find(item => item.id === category)?.groups, wanted = String(query || '').trim().toUpperCase();
  const rows = [];
  for (const place of places) {
    if (groups && !groups.includes(place.group)) continue;
    const about = describePlace(place, hours);
    if (wanted && !about.name.includes(wanted) && !about.kind.includes(wanted)) continue;
    const distance = Math.hypot(place.x - x, place.z - z);
    rows.push({ place, name: about.name, distance, note: [about.kind === about.name ? '' : about.kind, formatDistance(distance), about.status, about.grade].filter(Boolean).join(' · ') });
  }
  return rows.sort((a, b) => a.distance - b.distance);
}

/**
 * What a garage of `kind` puts on its counter for a car in this state
 * ({ health, mods, color }): rows of { job, name, note, price }, price null
 * where there is nothing to buy.
 */
export function shopRows(kind, car = {}) {
  const offers = offersAt(kind), rows = [];
  if (!offers) return rows;
  const cost = repairCost(car.health ?? 100);
  rows.push({ job: 'repair', name: 'REPAIR', note: cost ? `$${cost}` : 'NOTHING TO MEND', price: cost || null });
  if (offers.parts) for (const [job, part] of Object.entries(PARTS)) {
    const stage = car.mods?.[job] || 0, price = part.prices[stage] ?? null;
    rows.push({ job, name: part.label, note: price === null ? 'STAGE 3 · FULLY FITTED' : `STAGE ${stage} OF 3 · NEXT $${price}`, price });
  }
  return rows;
}

/**
 * Run the phone. `$` finds an element of the page by id. `places()` gives
 * the places within reach; `state()` gives { x, z, hours, clock, cash, fares,
 * miles, redLights }. The rest are what its buttons do.
 */
export function createPhone({ $, places = () => [], state = () => ({}), onDirections = () => {}, onJob = () => {}, onWork = () => {}, onMap = () => {}, onOpenChange = () => {}, onGarage = () => {}, onMechanic = () => {}, onCab = () => {} } = {}) {
  const SCREENS = ['home', 'nearby', 'place', 'contacts', 'wallet', 'shop', 'list'], TITLES = { home: 'PHONE', nearby: 'NEARBY', place: 'PLACE', contacts: 'CONTACTS', wallet: 'WALLET', shop: 'AUTO SHOP' };
  let shop = null, counter = [], listing = null, listPage = 0;
  let open = false, screen = 'home', category = 'all', page = 0, rows = [], chosen = null, listed = -Infinity;
  const show = next => { screen = next; render(); };
  function list() {
    const now = state();
    rows = listPlaces(places(), { category, query: $('phone-search').value, x: now.x, z: now.z, hours: now.hours });
    page = Math.max(0, Math.min(page, Math.ceil(rows.length / ROWS) - 1));
  }
  function render() {
    const now = state();
    $('phone').hidden = !open;
    if (!open) return;
    $('phone-clock').textContent = now.clock || ''; $('phone-cash').textContent = formatMoney(now.cash || 0);
    $('phone-title').textContent = TITLES[screen];
    for (const name of SCREENS) $(`phone-${name}`).hidden = name !== screen;
    $('phone-back').hidden = screen === 'home';
    if (screen === 'nearby') {
      list();
      for (const item of CATEGORIES) $(`phone-chip-${item.id}`).setAttribute('aria-pressed', String(item.id === category));
      for (let i = 0; i < ROWS; i++) {
        const row = rows[page * ROWS + i];
        $(`phone-row-${i}`).hidden = !row;
        if (row) { $(`phone-row-${i}-name`).textContent = row.name; $(`phone-row-${i}-note`).textContent = row.note; }
      }
      const pages = Math.max(1, Math.ceil(rows.length / ROWS));
      $('phone-empty').hidden = rows.length > 0;
      $('phone-page').textContent = rows.length ? `${page + 1} / ${pages}` : '';
      $('phone-prev').disabled = page <= 0; $('phone-next').disabled = page >= pages - 1;
    }
    if (screen === 'place' && chosen) {
      const about = describePlace(chosen, now.hours);
      $('phone-place-name').textContent = about.name; $('phone-place-kind').textContent = about.kind === about.name ? '' : about.kind;
      $('phone-place-note').textContent = [formatDistance(Math.hypot(chosen.x - now.x, chosen.z - now.z)), about.status, about.grade].filter(Boolean).join(' · ');
    }
    if (screen === 'contacts') {
      $('phone-contact-dispatch').disabled = Boolean(now.jobActive);
      $('phone-contact-mechanic-note').textContent = `Comes out and mends the car you are in · $${CALL_OUT} + repair`;
      $('phone-contact-cab-note').textContent = `Brings your cab to the nearest street · $${DELIVERY}`;
    }
    if (screen === 'shop' && shop) {
      $('phone-title').textContent = shop.name;
      counter = shopRows(shop.kind, now.car || {});
      for (let i = 0; i < 4; i++) {
        const row = counter[i];
        $(`phone-shop-${i}`).hidden = !row;
        if (row) { $(`phone-shop-${i}-name`).textContent = row.name; $(`phone-shop-${i}-note`).textContent = row.note; $(`phone-shop-${i}`).disabled = row.price === null; }
      }
      const paints = Boolean(offersAt(shop.kind)?.respray);
      $('phone-paints').hidden = !paints;
      $('phone-paints-note').textContent = `RESPRAY · $${RESPRAY_PRICE}`;
      RESPRAYS.forEach(([name, colour], i) => { $(`phone-paint-${i}`).setAttribute('aria-pressed', String(now.car?.color === colour)); $(`phone-paint-${i}`).setAttribute('title', name); });
    }
    if (screen === 'list' && listing) {
      $('phone-title').textContent = listing.title;
      $('phone-list-message').textContent = listing.message;
      $('phone-list-message').hidden = !listing.message;
      const pages = Math.max(1, Math.ceil(listing.rows.length / ROWS)); listPage = Math.max(0, Math.min(listPage, pages - 1));
      for (let i = 0; i < ROWS; i++) {
        const row = listing.rows[listPage * ROWS + i];
        $(`phone-ride-${i}`).hidden = !row;
        if (row) { $(`phone-ride-${i}-name`).textContent = row.name; $(`phone-ride-${i}-note`).textContent = row.note; }
      }
      $('phone-ride-page').textContent = `${listPage + 1} / ${pages}`; $('phone-ride-prev').disabled = listPage <= 0; $('phone-ride-next').disabled = listPage >= pages - 1;
    }
    if (screen === 'wallet') {
      $('phone-wallet-cash').textContent = formatMoney(now.cash || 0);
      $('phone-wallet-fares').textContent = String(now.fares || 0); $('phone-wallet-miles').textContent = (now.miles || 0).toFixed(1); $('phone-wallet-lights').textContent = String(now.redLights || 0);
    }
  }
  const setOpen = next => {
    next = Boolean(next);
    if (next === open) return;
    open = next;
    if (open) { screen = 'home'; $('phone-search').value = ''; page = 0; }
    render(); onOpenChange(open);
  };
  const click = (id, action) => $(id).addEventListener('click', action);
  click('phone-app-nearby', () => { page = 0; show('nearby'); }); click('phone-app-contacts', () => show('contacts')); click('phone-app-wallet', () => show('wallet'));
  click('phone-app-work', onWork);
  click('phone-app-map', () => { setOpen(false); onMap(); });
  for (const item of CATEGORIES) click(`phone-chip-${item.id}`, () => { category = item.id; page = 0; render(); });
  $('phone-search').addEventListener('input', () => { page = 0; render(); });
  for (let i = 0; i < ROWS; i++) click(`phone-row-${i}`, () => { const row = rows[page * ROWS + i]; if (row) { chosen = row.place; show('place'); } });
  click('phone-prev', () => { page = Math.max(0, page - 1); render(); }); click('phone-next', () => { page++; render(); });
  click('phone-directions', () => { if (chosen) { onDirections(chosen); setOpen(false); } });
  for (let i = 0; i < ROWS; i++) click(`phone-ride-${i}`, () => { const row = listing?.rows[listPage * ROWS + i]; if (open && screen === 'list' && row) { const pick = listing.onPick; if (!listing.keepOpen) setOpen(false); pick(row); } });
  click('phone-ride-prev', () => { listPage--; render(); }); click('phone-ride-next', () => { listPage++; render(); });
  click('phone-contact-dispatch', () => { onJob(); setOpen(false); });
  click('phone-contact-mechanic', () => { onMechanic(); setOpen(false); });
  click('phone-contact-cab', () => { onCab(); setOpen(false); });
  for (let i = 0; i < 4; i++) click(`phone-shop-${i}`, () => { const row = counter[i]; if (row && row.price !== null && shop) { onGarage(shop.kind, row.job); render(); } });
  RESPRAYS.forEach(([, colour], i) => click(`phone-paint-${i}`, () => { if (shop) { onGarage(shop.kind, 'respray', colour); render(); } }));
  click('phone-back', () => show(screen === 'place' ? 'nearby' : 'home'));
  click('phone-close', () => setOpen(false));
  return {
    get open() { return open; },
    get screen() { return screen; },
    setOpen, toggle: () => setOpen(!open),
    /** Show a list to choose from: `rows` of { name, note }; `onPick(row)` is told which. */
    openList(title, rows, onPick, { message = '', keepOpen = false } = {}) { listing = { title, rows, onPick, message, keepOpen }; listPage = 0; setOpen(true); show('list'); },
    /** Stand at a garage's counter: `place` is the auto shop the car is stopped at. */
    openShop(place) { shop = { kind: place.kind, name: placeName(place) }; setOpen(true); show('shop'); },
    /** Keep the clock, the cash and the distances current while the phone is out. `time` is in seconds. */
    update(time = 0) { if (open && time - listed > 1) { listed = time; render(); } },
  };
}
