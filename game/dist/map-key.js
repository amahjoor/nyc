import { MAP_CATEGORIES } from './map-places.js';
import { blipLegend, blipSvg } from './map-blips.js';

const number = new Intl.NumberFormat('en-US');

export class MapKey {
  constructor(map, listen, requestPlaces) {
    this.map = map;
    this.requestPlaces = requestPlaces;
    this.rows = new Map();
    this.hiddenDoors = new Set();
    this.toggle = map.byId('game-map-key-toggle');
    this.list = map.byId('game-map-key-list');
    this.setExpanded(!globalThis.matchMedia?.('(max-width:650px)').matches);
    listen(this.toggle, 'click', () => this.setExpanded(this.list.hidden));
    for (const category of MAP_CATEGORIES) this.addRow(category, false);
  }

  setExpanded(expanded) {
    this.list.hidden = !expanded;
    this.toggle.setAttribute('aria-expanded', String(expanded));
    this.hover = null;
  }

  addRow(category, nearby) {
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
    if (nearby) {
      const icon = make('i', '');
      icon.innerHTML = blipSvg(id, colour);
      toggle.append(icon);
    }
    toggle.append(make('span', '', label));
    const prev = make('button', 'game-map-step', '‹');
    const next = make('button', 'game-map-step', '›');
    prev.setAttribute('aria-label', 'Previous location · ' + label);
    next.setAttribute('aria-label', 'Next location · ' + label);
    const count = make('span', 'game-map-count');
    const selection = make('button', 'game-map-selection');
    const row = { id, nearby, el, toggle, prev, count, next, selection, places: null, index: -1 };
    toggle.title = 'Click to toggle. Use the left and right arrows to browse locations.';
    for (const child of [toggle, prev, count, next, selection]) el.append(child);
    el.addEventListener('pointerenter', () => { this.hover = row; });
    el.addEventListener('pointerleave', () => { if (this.hover === row) this.hover = null; });
    toggle.addEventListener('click', () => {
      this.enable(row, !this.enabled(row));
      if (!nearby && !this.map.placeLayer) this.requestPlaces();
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
    this.map.byId(nearby ? 'game-map-nearby' : 'game-map-places').append(el);
    this.rows.set((nearby ? 'door/' : 'place/') + id, row);
    this.refresh(row);
    return row;
  }

  enabled(row) {
    return row.nearby ? !this.hiddenDoors.has(row.id) : this.map.placeKinds.has(row.id);
  }

  enable(row, enabled) {
    const set = row.nearby ? this.hiddenDoors : this.map.placeKinds;
    if (row.nearby ? !enabled : enabled) set.add(row.id);
    else set.delete(row.id);
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

  setPlaces(layer) {
    for (const row of this.rows.values()) {
      if (row.nearby) continue;
      if (this.active === row) this.active = null;
      row.places = layer?.members(row.id);
      row.index = -1;
      this.refresh(row);
    }
  }

  setDoors(doors) {
    const groups = new Map();
    for (const door of doors) {
      if (!groups.has(door.icon)) groups.set(door.icon, []);
      groups.get(door.icon).push(door);
    }
    for (const [key, row] of this.rows) {
      if (!row.nearby || groups.has(row.id)) continue;
      if (this.active === row) this.active = null;
      if (this.hover === row) this.hover = null;
      row.el.remove();
      this.rows.delete(key);
    }
    for (const category of blipLegend(doors)) {
      const row = this.rows.get('door/' + category.id) || this.addRow(category, true);
      const selected = row.places?.[row.index];
      row.places = groups.get(category.id);
      row.index = selected ? row.places.findIndex(place => place.id === selected.id) : -1;
      if (this.active === row && row.index < 0) this.active = null;
      this.refresh(row);
    }
    this.map.byId('game-map-legend').hidden = !groups.size;
  }

  get preview() { return this.active?.places[this.active.index]; }

  pinPreview() {
    const place = this.preview;
    if (place) return this.map.setPin({ x: place.x, z: place.z, name: place.name + ' · ' + (place.what || place.kind) });
  }

  step(row, direction) {
    if (!row?.places?.length || this.map.busy) return false;
    if (row.index < 0 && !row.nearby) {
      const { x, z } = this.map.player;
      const distance = p => (p.x - x) ** 2 + (p.z - z) ** 2;
      row.places = [...row.places].sort((a, b) => distance(a) - distance(b));
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
    this.map.byId('game-map-nearby').replaceChildren();
    this.rows.clear();
  }
}
