import { MAP_CATEGORIES } from './map-places.js';

const number = new Intl.NumberFormat('en-US');

export class MapKey {
  constructor(map, listen, requestPlaces) {
    this.map = map;
    this.requestPlaces = requestPlaces;
    this.rows = new Map();
    this.toggle = map.byId('game-map-key-toggle');
    this.list = map.byId('game-map-key-list');
    this.setExpanded(!globalThis.matchMedia?.('(max-width:650px)').matches);
    listen(this.toggle, 'click', () => this.setExpanded(this.list.hidden));
    for (const category of MAP_CATEGORIES) this.addRow(category);
    const filters = [
      [map.transit.button, 'transit'],
      [map.byId('game-map-bike-lanes'), 'bike-lanes'],
      ...Array.from(this.rows.values(), row => [row.toggle, row.id]),
    ];
    for (const [button, id] of filters) {
      if (!button) continue;
      button.title = 'Right-click to show only this option. Right-click it again to show all.' + (button.title ? ' ' + button.title : '');
      listen(button, 'contextmenu', event => {
        event.preventDefault();
        this.isolate(id);
      });
    }
  }

  setExpanded(expanded) {
    this.list.hidden = !expanded;
    this.toggle.setAttribute('aria-expanded', String(expanded));
    this.hover = null;
  }

  addRow(category) {
    const make = (tag, className, text = '') => {
      const el = this.map.document.createElement(tag);
      el.className = className;
      el.textContent = text;
      if (tag === 'button') el.type = 'button';
      return el;
    };
    const { id, label, colour } = category;
    const el = make('div', 'game-map-key-row');
    const toggle = make('button', 'game-map-chip');
    toggle.style?.setProperty?.('--chip', colour);
    toggle.append(make('span', '', label));
    const prev = make('button', 'game-map-step', '‹');
    const next = make('button', 'game-map-step', '›');
    prev.setAttribute('aria-label', 'Previous location · ' + label);
    next.setAttribute('aria-label', 'Next location · ' + label);
    const count = make('span', 'game-map-count');
    const selection = make('button', 'game-map-selection');
    const row = { id, el, toggle, prev, count, next, selection, places: null, index: -1 };
    toggle.title = 'Click to toggle. Use the left and right arrows to browse locations.';
    for (const child of [toggle, prev, count, next, selection]) el.append(child);
    el.addEventListener('pointerenter', () => { this.hover = row; });
    el.addEventListener('pointerleave', () => { if (this.hover === row) this.hover = null; });
    toggle.addEventListener('click', () => {
      this.enable(row, !this.enabled(row));
      if (!this.map.placesLoaded) this.requestPlaces();
      this.refresh(row);
      this.map.draw();
    });
    el.addEventListener('wheel', event => {
      const delta = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      if (!delta || (!event.shiftKey && Math.abs(delta) <= Math.abs(event.deltaY))) return;
      event.preventDefault();
      if (event.timeStamp - (row.lastWheel ?? -Infinity) < 180) return;
      if (this.step(row, Math.sign(delta))) row.lastWheel = event.timeStamp;
    }, { passive: false });
    prev.addEventListener('click', () => this.step(row, -1));
    next.addEventListener('click', () => this.step(row, 1));
    selection.addEventListener('click', () => this.pinPreview());
    this.map.byId('game-map-places').append(el);
    this.rows.set('place/' + id, row);
    this.refresh(row);
    return row;
  }

  isolate(id) {
    const map = this.map;
    const selected = new Set(map.placeKinds);
    if (map.showBikeLanes) selected.add('bike-lanes');
    // A transit journey keeps its route visible until arrival.
    if (map.transit.active && (!map.transit.journey || id === 'transit')) selected.add('transit');
    const showAll = selected.size === 1 && selected.has(id);
    for (const row of this.rows.values()) {
      this.enable(row, showAll || row.id === id);
      this.refresh(row);
    }
    map.setBikeLanes(showAll || id === 'bike-lanes');
    if (map.placeKinds.size && !map.placesLoaded) this.requestPlaces();
    const transit = Boolean(map.transit.journey) || showAll || id === 'transit';
    if (transit !== map.transit.active) map.transit.setActive(transit);
    else map.draw();
  }

  enabled(row) {
    return this.map.placeKinds.has(row.id);
  }

  enable(row, enabled) {
    if (enabled) this.map.placeKinds.add(row.id);
    else this.map.placeKinds.delete(row.id);
    if (!enabled && this.active === row) this.active = null;
  }

  refresh(row) {
    const total = row.places?.length;
    row.toggle.setAttribute('aria-pressed', String(this.enabled(row)));
    const active = this.active === row && row.index >= 0;
    row.count.textContent = total == null ? '…' : (row.index >= 0 ? number.format(row.index + 1) + ' / ' : '') + number.format(total);
    row.prev.disabled = row.next.disabled = !total;
    row.selection.hidden = !active;
    if (active) {
      row.selection.textContent = row.places[row.index].name;
      row.selection.title = 'Pin ' + row.selection.textContent;
      row.selection.setAttribute('aria-label', row.selection.title);
    }
  }

  setPlaces() {
    for (const row of this.rows.values()) {
      const layer = row.id === 'subway' ? this.map.subwayLayer : this.map.placeLayer;
      const places = layer?.members(row.id);
      if (row.source === places) continue;
      if (this.active === row) this.active = null;
      row.source = row.places = places;
      row.index = -1;
      this.refresh(row);
    }
  }

  get preview() { return this.active?.places[this.active.index]; }

  pinPreview() {
    const place = this.preview;
    if (place) return this.map.pinPlace(place);
  }

  step(row, direction) {
    if (!row?.places?.length || this.map.busy) return false;
    const { x, z } = this.map.player;
    if (row.index < 0 || row.sortedX !== x || row.sortedZ !== z) {
      const distance = p => (p.x - x) ** 2 + (p.z - z) ** 2;
      row.places = [...row.source].sort((a, b) => distance(a) - distance(b));
      row.index = -1;
      row.sortedX = x;row.sortedZ = z;
    }
    const old = this.active;
    this.enable(row, true);
    this.active = row;
    const total = row.places.length;
    row.index = row.index < 0 ? (direction > 0 ? 0 : total - 1) : (row.index + direction + total) % total;
    if (old && old !== row) this.refresh(old);
    this.refresh(row);
    const place = this.preview;
    this.map.view.x = place.x;
    this.map.view.z = place.z;
    this.map.following = false;
    this.map.clampCenter();
    this.map.draw();
    return true;
  }

  stepTarget(direction) {
    if (this.list.hidden) return false;
    const focused = this.map.document.activeElement;
    const row = this.hover || [...this.rows.values()].find(r => [r.toggle, r.prev, r.next, r.selection].includes(focused));
    return this.step(row, direction);
  }

  focusable() {
    if (this.list.hidden) return [this.toggle];
    const { transit, byId } = this.map;
    const elements = [this.toggle, transit.button];
    if (!transit.select.hidden) elements.push(transit.select);
    elements.push(byId('game-map-bike-lanes'));
    for (const row of this.rows.values()) {
      elements.push(row.toggle, row.prev, row.next);
      if (!row.selection.hidden) elements.push(row.selection);
    }
    return elements;
  }

  dispose() {
    this.map.byId('game-map-places').replaceChildren();
    this.rows.clear();
  }
}
