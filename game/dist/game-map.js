import { TransitMap } from './transit-map.js';
import { airports } from './airport-data.js';
import { searchDestinations } from './geocoder.js';
import { matchPresets, parseQuery } from './local-search.js';
import { MapKey } from './map-key.js';
import { createPlaceLayer, MAP_CATEGORIES, PLACE_BADGE_SPAN, markerScale, placeMarks, drawPlaceMarks } from './map-places.js';
import { blipOf, thinBlips, drawBlips, blipOpen } from './map-blips.js';
import { TRANSPORT, isWatercraft, isAircraft } from './transport-catalog.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.z);
const distanceText = meters => meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
const pointsOf = route => route?.ok !== false && Array.isArray(route?.points) ? route.points : [];
const overlaps = (a, b) => a.maxX >= b.minX && a.minX <= b.maxX && a.maxZ >= b.minZ && a.minZ <= b.maxZ;
const resultName = place => [place.name, place.what, place.detail, place.borough].filter(Boolean).join(' · ');
const searchMarkerRadius = 5;
const placeBadgeSize = 22;

export function mapWorldToScreen(point, view) {
  const scale = view.width / view.span;
  return { x: (point.x - view.x) * scale + view.width / 2, y: (point.z - view.z) * scale + view.height / 2 };
}
export function mapScreenToWorld(point, view) {
  const scale = view.width / view.span;
  return { x: view.x + (point.x - view.width / 2) / scale, z: view.z + (point.y - view.height / 2) / scale };
}
function viewBounds(view) {
  const halfZ = view.span * view.height / view.width / 2;
  return { minX: view.x - view.span / 2, maxX: view.x + view.span / 2, minZ: view.z - halfZ, maxZ: view.z + halfZ };
}
function shapeBounds(points) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) { minX = Math.min(minX, x);maxX = Math.max(maxX, x);minZ = Math.min(minZ, z);maxZ = Math.max(maxZ, z); }
  return { minX, maxX, minZ, maxZ };
}

/** Canvas map uses the game's local meters, never an independent map projection. */
export class GameMap {
  constructor({ document = globalThis.document, city, getPresets = () => [], searchLocal = () => [], onPlacesWanted = () => {}, loadTransit, lookupAddress, onPin = () => {}, onSpawn = () => {}, onOpenChange = () => {}, onZoom = () => {}, onCue = () => {} } = {}) {
    this.document = document;this.city = city;this.onPin = onPin;this.onSpawn = onSpawn;this.onOpenChange = onOpenChange;this.onCue = onCue;this.onZoom = onZoom;
    this.element = document.getElementById('game-map');this.canvas = document.getElementById('game-map-canvas');
    this.mini = document.getElementById('minimap');this.open = false;this.pin = null;this.route = null;this.progress = null;this.busy = false;
    this.player = { x: city.spawn?.x || 0, z: city.spawn?.z || 0, angle: 0 };
    this.view = { ...this.player, span: 1000, width: 1000, height: 700 };this.listeners = [];this.dirty = true;this.following = true;
    this.roadGrid = new Map();this.longRoads = [];this.roads = [];this.chunks = null;this.sharpRoads = null;this.sharpTimer = null;this.ratio = 1;this.sim = null;this.disposed = false;
    const byId = id => document.getElementById(id);this.byId = byId;
    const listen = (target, type, callback, options) => { target.addEventListener(type, callback, options);this.listeners.push(() => target.removeEventListener(type, callback, options)); };
    this.transit = new TransitMap(this,listen,loadTransit);
    this.searchLocal = searchLocal;
    this.getPresets = getPresets;
    this.placeLayer = createPlaceLayer();this.placesLoaded = false;
    this.placeKinds = new Set(MAP_CATEGORIES.map(category => category.id));
    this.placeBadges = [];
    this.doors = [];this.hours = 12;this.doorQuarter = null;this.doorsApart = new Map();
    this.searchMatches = [];
    this.key = new MapKey(this, listen, onPlacesWanted);
    this.showBikeLanes=true;
    const laneButton=byId('game-map-bike-lanes');
    if(laneButton)listen(laneButton,'click',()=>{
      this.showBikeLanes=!this.showBikeLanes;
      laneButton.setAttribute('aria-pressed',String(this.showBikeLanes));
      this.dirty=true;this.draw();
    });
    this.lookupAddress = lookupAddress;
    listen(byId('game-map-search'), 'submit', event => { event.preventDefault();return this.searchAddress(); });
    listen(byId('game-map-address'), 'input', () => {
      this.clearAddressResults();
      const query = byId('game-map-address').value.trim();
      if (this.open && !this.busy && query.length >= 2) this.showAddressResults(matchPresets(query, this.getPresets()).slice(0, 8));
    });
    listen(byId('game-map-close'), 'click', () => this.setOpen(false));
    listen(byId('game-map-zoom-in'), 'click', () => this.zoom(.65));
    listen(byId('game-map-zoom-out'), 'click', () => this.zoom(1 / .65));
    listen(byId('game-map-recenter'), 'click', () => this.recenter());
    listen(byId('game-map-city'), 'click', () => this.showCity());
    listen(byId('game-map-spawn'), 'click', () => this.spawnAtPin());
    listen(this.canvas, 'wheel', event => {
      event.preventDefault();event.stopPropagation();
      this.zoom(Math.exp(clamp(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.view.height : 1), -500, 500) * .0015), this.pointerPoint(event));
    }, { passive: false });
    listen(this.canvas, 'pointerdown', event => this.pointerDown(event));
    listen(this.canvas, 'pointermove', event => this.pointerMove(event));
    listen(this.canvas, 'pointerup', event => this.pointerUp(event));
    listen(this.canvas, 'pointercancel', event => this.cancelPointer(event));
    listen(this.canvas, 'lostpointercapture', event => this.cancelPointer(event));
    listen(document, 'keydown', event => {
      if (!this.open) return;
      const key = event.key || event.code;
      const typing = document.activeElement === byId('game-map-address');
      if (key === 'Escape' || (!typing && key === 'F7')) {
        event.preventDefault();event.stopImmediatePropagation();if (!event.repeat) this.setOpen(false);
      } else if (key === 'Tab') {
        // Keep keyboard focus inside this modal without relying on a native
        // dialog; the existing 3D map and pause dialogs remain separate flows.
        const elements = [byId('game-map-address'), byId('game-map-search-button'),
          ...Array.from(byId('game-map-search-results').children || []),
          ...['game-map-close','game-map-canvas','game-map-zoom-in','game-map-zoom-out'].map(byId),
          ...this.key.focusable(), byId('game-map-recenter'), byId('game-map-city'),
          ...[this.transit.guide,this.transit.skip].filter(el=>el&&!el.hidden), byId('game-map-spawn')
        ].filter(element => !element.disabled);
        const i = elements.indexOf(document.activeElement);
        const next = i < 0 ? (event.shiftKey ? elements.length - 1 : 0) : (i + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
        event.preventDefault();elements[next]?.focus();
      } else if (!typing && document.activeElement !== this.transit.select && ['ArrowLeft','ArrowRight'].includes(key) && this.key.stepTarget(key === 'ArrowLeft' ? -1 : 1)) {
        this.onCue('select');
        event.preventDefault();event.stopImmediatePropagation();
      } else if (document.activeElement === this.canvas && key === 'Delete' && this.pin && !this.busy) {
        event.preventDefault();this.clearPin();
      } else if (document.activeElement === this.canvas && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(key)) {
        event.preventDefault();event.stopPropagation();
        if (key === '+' || key === '=') this.zoom(.8);
        else if (key === '-') this.zoom(1.25);
        else { this.view.x += (key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0) * this.view.span * .12;this.view.z += (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0) * this.view.span * .12;this.following = false;this.clampCenter();this.draw(); }
      }
    }, true);
    this.setCity(city);this.setRoads(city.roads || []);this.updateControls();
  }

  dimensions() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || 1000), height = Math.max(1, rect.height || 700);
    this.view.width = width;this.view.height = height;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.round(width * ratio), h = Math.round(height * ratio);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w;this.canvas.height = h;this.dirty = true; }
    return ratio;
  }
  pointerPoint(event) { const rect = this.canvas.getBoundingClientRect();return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  pointerDown(event) {
    if (!this.open || this.busy || this.drag || (event.button != null && event.button !== 0)) return;
    event.preventDefault();this.canvas.focus();this.dimensions();const point = this.pointerPoint(event), pin = this.pin && mapWorldToScreen(this.pin, this.view);
    const pinDistance = pin ? Math.hypot(pin.x - point.x, pin.y - point.y) : Infinity;
    const match = pinDistance < 20 && this.searchMatchAt(point);
    const matchPoint = match && mapWorldToScreen(match, this.view);
    const hitPin = pinDistance < 20 && (!matchPoint || pinDistance <= Math.hypot(matchPoint.x - point.x, matchPoint.y - point.y));
    this.drag = { pointerId: event.pointerId, start: point, center: { x: this.view.x, z: this.view.z }, pin: hitPin, moved: false };
    this.canvas.setPointerCapture?.(event.pointerId);
  }
  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const point = this.pointerPoint(event), dx = point.x - this.drag.start.x, dy = point.y - this.drag.start.y;
    if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
    if (!this.drag.moved) return;
    if (this.drag.pin) {
      this.drag.preview = mapScreenToWorld(point, this.view);this.draw();
    }
    else {
      this.following = false;this.view.x = this.drag.center.x - dx * this.view.span / this.view.width;
      this.view.z = this.drag.center.z - dy * this.view.span / this.view.width;this.clampCenter();this.draw();
    }
  }
  pointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;this.drag = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
    if (drag.pin) {
      const point = this.pointerPoint(event);
      if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) <= 4) { this.clearPin();this.onCue('select'); }
      else if (!this.setPin(mapScreenToWorld(point, this.view))) this.draw();
      else this.onCue('select');
      return;
    }
    if (drag.moved) return;
    if (this.pinAtScreenPoint(this.pointerPoint(event))) this.onCue('select');
  }
  searchMatchAt(screen) {
    const point = mapScreenToWorld(screen, this.view);
    let match = null, reach = (searchMarkerRadius + 5) * this.view.span / this.view.width;
    for (const place of this.searchMatches) {
      const distance = Math.hypot(place.x - point.x, place.z - point.z);
      if (distance < reach) { match = place;reach = distance; }
    }
    return match;
  }
  pinAtScreenPoint(screen) {
    const match = this.searchMatchAt(screen);
    if (match) return this.setPin({ ...match, name: resultName(match) });
    const preview = this.key.preview;
    if (preview) {
      const p = mapWorldToScreen(preview, this.view);
      if (Math.hypot(p.x - screen.x, p.y - screen.y) <= 11) return this.key.pinPreview();
    }
    if(this.transit.active){
      const stop=this.transit.hit(screen);
      if(stop)return this.setPin({x:stop.x,z:stop.z,name:stop.name+' · '+[...stop.lines].map(l=>l.name).join(' / ')});
    }
    const badge = this.placeBadges.find(mark => Math.hypot(mark.px - screen.x, mark.py - screen.y) <= placeBadgeSize / 2);
    if (badge) return this.pinPlace(badge.place);
    const point = mapScreenToWorld(screen, this.view);
    const radius = Math.max(4, 12 * markerScale(this.view.span)) * this.view.span / this.view.width;
    const station = this.placeKinds.has('subway') ? this.subwayLayer?.nearest(point, radius) : null;
    const place = this.placeKinds.size ? this.placeLayer.nearest(point, station?.distance ?? radius, this.placeKinds) ?? station : null;
    return place ? this.pinPlace(place) : this.setPin(point);
  }
  pinPlace(place) {
    const { x, z } = place.door || place;
    return this.setPin({ x, z, name: `${place.name} · ${place.kind}` });
  }
  cancelPointer(event) { if (this.drag?.pointerId === event.pointerId) { this.drag = null;this.draw(); } }
  clampCenter() {
    const bounds = this.city.bounds;this.view.x = clamp(this.view.x, bounds.minX, bounds.maxX);this.view.z = clamp(this.view.z, bounds.minZ, bounds.maxZ);this.dirty = true;
  }
  fullSpan() { const b = this.city.bounds;return Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * this.view.width / this.view.height) * 1.08; }
  zoom(factor, anchor = { x: this.view.width / 2, y: this.view.height / 2 }) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = mapScreenToWorld(anchor, this.view);
    const span = clamp(this.view.span * factor, 120, this.fullSpan() * 1.25);
    if (span !== this.view.span) this.onZoom(span < this.view.span);
    this.view.span = span;
    const after = mapScreenToWorld(anchor, this.view);this.view.x += before.x - after.x;this.view.z += before.z - after.z;
    this.following = false;this.clampCenter();this.draw();
  }
  recenter() { this.view.x = this.player.x;this.view.z = this.player.z;this.view.span = 1000;this.following = true;this.clampCenter();this.draw(); }
  showCity() { const b = this.city.bounds;this.view.x = (b.minX + b.maxX) / 2;this.view.z = (b.minZ + b.maxZ) / 2;this.view.span = this.fullSpan();this.following = false;this.dirty = true;this.draw(); }
  setOpen(open) {
    if (this.disposed || this.open === Boolean(open) || (!open && this.transit.journey)) return;
    this.open = Boolean(open);this.element.hidden = !this.open;
    if (this.open) {
      this.previousFocus = this.document.activeElement;
      if (!this.placesLoaded) this.key.requestPlaces();
      if (this.placeLayer.setDoors(this.doors)) this.key.setPlaces();
      this.dimensions();this.transit.refresh();this.recenter();this.byId('game-map-close').focus();
    }
    else { this.key.hover = null;this.drag = null;this.dropSharpRoads();this.placeOverview = null;this.clearAddressResults();this.previousFocus?.focus?.(); }
    this.byId('map-button').setAttribute('aria-expanded', String(this.open));this.byId('open-map-button').setAttribute('aria-expanded', String(this.open));this.onOpenChange(this.open);
  }
  toggle() { this.setOpen(!this.open); }
  clearAddressResults() {
    this.addressRequest?.abort();
    this.addressRequest = null;
    this.byId('game-map-search-results').replaceChildren();
    this.byId('game-map-search-status').textContent = '';
    this.byId('game-map-search').setAttribute('aria-busy', 'false');
    if (this.searchMatches.length) {
      this.searchMatches = [];
      this.draw();
    }
  }
  showAddressResults(places) {
    const results = this.byId('game-map-search-results');
    for (const place of places) {
      const button = this.document.createElement('button');
      button.type = 'button';
      button.className = 'address-result';
      button.textContent = resultName(place);
      button.addEventListener('click', () => {
        if (!this.open || this.busy || !this.setPin({ ...place, name: button.textContent })) return;
        this.view.x = place.x;this.view.z = place.z;this.view.span = 1000;
        this.following = false;this.clampCenter();this.draw();
        this.canvas.focus();
      });
      results.append(button);
    }
  }
  frameSearchMatches() {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const { x, z } of this.searchMatches) {
      minX = Math.min(minX, x);maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);maxZ = Math.max(maxZ, z);
    }
    this.dimensions();
    const { width, height } = this.view;
    const span = Math.max(maxX - minX, (maxZ - minZ) * width / height);
    Object.assign(this.view, { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, span: Math.max(1000, span * 1.25) });
    this.following = false;this.clampCenter();this.draw();
  }
  async searchAddress() {
    if (!this.open || this.busy) return;
    this.clearAddressResults();
    const controller = new AbortController();
    this.addressRequest = controller;
    const field = this.byId('game-map-address');
    const query = field.value;
    const status = this.byId('game-map-search-status');
    this.byId('game-map-search').setAttribute('aria-busy', 'true');
    status.textContent = 'Searching…';
    try {
      const places = await searchDestinations(query, {
        searchLocal: this.searchLocal, presets: this.getPresets(), lookup: this.lookupAddress, signal: controller.signal, allPlaces: true,
      });
      if (controller.signal.aborted) return;
      if (!parseQuery(query).numbered) this.searchMatches = places.filter(place => place.kind === 'place' && finitePoint(place));
      const count = this.searchMatches.length;
      status.textContent = count ? `${count.toLocaleString('en-US')} ${count === 1 ? 'location' : 'locations'} on the map`
        : places.length ? '' : 'No results. Try a nearby intersection or add the borough.';
      this.showAddressResults(places);
      if (count) this.frameSearchMatches();
    } catch (error) {
      if (!controller.signal.aborted) status.textContent = error.message;
    } finally {
      if (this.addressRequest === controller) {
        this.addressRequest = null;
        this.byId('game-map-search').setAttribute('aria-busy', 'false');
      }
    }
  }
  setCity(city) {
    if (!city) return;
    if (this.city !== city) { this.city = city;this.dirty = true; }
    if (this.boroughSource !== city.boroughs || !this.landPolygons) {
      this.boroughSource = city.boroughs;this.landPolygons = (city.boroughs || []).flatMap(borough => (borough.polygons || []).map(polygon => ({ polygon, bounds: shapeBounds(polygon.outer) })));
      this.miniLandCache = null;
    }
  }
  setPlayer(player) {
    if (!finitePoint(player)) return;
    if (player.x !== this.player.x || player.z !== this.player.z || player.angle !== this.player.angle) this.dirty = true;
    this.player = { ...player };if (this.following) { this.view.x = player.x;this.view.z = player.z; }
  }
  /** `layer` is map-places.js createPlaceLayer(): the places the chips show. */
  setPlaces(layer) {
    this.placeLayer = layer;
    this.placesLoaded = true;
    this.placeOverview = null;
    if (this.open) layer.setDoors(this.doors);
    this.key.setPlaces();
    this.dirty = true;if (this.open) this.draw();
  }
  setSubwayStations(stations) {
    const places = stations.map(station => {
      const distance = ([x, z]) => (x - station.x) ** 2 + (z - station.z) ** 2;
      const [x, z] = station.entrances.reduce((nearest, entry) => !nearest || distance(entry) < distance(nearest) ? entry : nearest, null) ?? [station.x, station.z];
      return [station.name, x, z, 0];
    });
    this.subwayLayer = createPlaceLayer({ kinds: ['Subway Station'], places });
    this.placeOverview = null;
    this.key.setPlaces();
    this.dirty = true;if (this.open) this.draw();
  }
  /**
   * The doors that can be walked through near the player, to mark with their trades.
   * @param blips map-blips.js doorBlips(); the same array again changes nothing
   * @param hours the time of day, 0 to 24: a place that is shut is marked dim
   */
  setDoors(blips, hours = this.hours) {
    const quarter = Math.floor(hours * 4);
    if (blips === this.doors && quarter === this.doorQuarter) return;
    this.doors = blips || [];
    this.placeOverview = null;
    this.hours = hours;this.doorQuarter = quarter;this.doorsApart.clear();this.dirty = true;
    if (this.open) {
      if (this.placeLayer.setDoors(this.doors)) this.key.setPlaces();
      this.draw();
    }
  }
  /** The doors to draw when badges are kept `gap` pixels apart at `scale` pixels to the metre: all of them where they fit, the rarer trades where they do not. */
  doorsShown(gap, scale) {
    // Rounded to a twentieth, so the steps of a zoom share a list.
    const spacing = Math.exp(Math.round(Math.log(gap / scale) * 20) / 20), key = spacing.toFixed(3);
    let kept = this.doorsApart.get(key);
    if (!kept) { if (this.doorsApart.size > 40) this.doorsApart.clear();this.doorsApart.set(key, kept = thinBlips(this.doors, spacing, this.hours)); }
    return kept;
  }
  paintRadarDoors(context, view) {
    if (!this.doors.length) return;
    const scale = view.width / view.span, size = 28;
    const reach = size / scale, bounds = viewBounds(view), marks = [];
    for (const blip of this.doorsShown(33, scale)) {
      if (blip.x < bounds.minX - reach || blip.x > bounds.maxX + reach || blip.z < bounds.minZ - reach || blip.z > bounds.maxZ + reach) continue;
      const p = mapWorldToScreen(blip, view);
      marks.push({ px: p.x, py: p.y, icon: blip.icon, colour: blip.colour, open: blipOpen(blip, this.hours) });
    }
    drawBlips(context, marks, { size, document: this.document });
  }
  drawPlaces(context, view) {
    const places = placeMarks(this.placeLayer, view, this.placeKinds, this.hours);
    if (this.subwayLayer && this.placeKinds.has('subway')) places.marks.push(...placeMarks(this.subwayLayer, view, this.placeKinds).marks);
    if (view.span <= PLACE_BADGE_SPAN) {
      const badges = places.marks.map((mark, id) => ({ ...mark, id, x: mark.px, z: mark.py, icon: blipOf(mark.place.kindId) }));
      const shown = thinBlips(badges, placeBadgeSize + 3, this.hours);
      const pictured = new Set(shown);
      const compact = badges.filter(mark => !pictured.has(mark)).map(mark => ({ ...mark, radius: 2, label: '' }));
      drawPlaceMarks(context, { marks: compact });
      drawBlips(context, shown, { size: placeBadgeSize, ratio: this.ratio, document: this.document });
      if (view === this.view) this.placeBadges = shown;
      return;
    }
    drawPlaceMarks(context, places);
  }
  paintPlaces(context, view) {
    if (view === this.view) this.placeBadges = [];
    if (!this.placeKinds.size || !(this.placeLayer.count || this.subwayLayer?.count)) return;
    if (view.span < 5000) { this.drawPlaces(context, view);return; }

    // Keep a little extra around the viewport so a pan or a small zoom can
    // reuse the same set of markers instead of redrawing the whole city.
    const scale = view.width / view.span, bounds = viewBounds(view);
    const filters = [...this.placeKinds].join(',');
    let cache = this.placeOverview;
    const kept = cache?.bounds;
    if (!cache || cache.filters !== filters || cache.ratio !== this.ratio || Math.abs(Math.log(scale / cache.scale)) > .1 ||
        kept.minX > bounds.minX || kept.maxX < bounds.maxX || kept.minZ > bounds.minZ || kept.maxZ < bounds.maxZ) {
      const ratio = this.ratio, margin = 1.3;
      const canvas = cache?.canvas || this.document.createElement('canvas');
      const width = Math.ceil(view.width * ratio * margin), height = Math.ceil(view.height * ratio * margin);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width;canvas.height = height; }
      const bufferedView = { ...view, width: width / ratio, height: height / ratio, span: width / ratio / scale };
      const buffer = canvas.getContext('2d');
      buffer.setTransform(ratio, 0, 0, ratio, 0, 0);
      buffer.clearRect(0, 0, bufferedView.width, bufferedView.height);
      this.drawPlaces(buffer, bufferedView);
      this.placeOverview = cache = { canvas, view: bufferedView, bounds: viewBounds(bufferedView), scale, ratio, filters };
    }
    const corner = mapWorldToScreen({ x: cache.bounds.minX, z: cache.bounds.minZ }, view);
    const grown = scale / cache.scale;
    context.drawImage(cache.canvas, corner.x, corner.y, cache.view.width * grown, cache.view.height * grown);
  }
  setRoads(roads) {
    this.roads = roads || [];this.roadGrid.clear();this.longRoads = [];this.chunks = null;this.dropSharpRoads();
    for (const road of this.roads) {
      if (!Array.isArray(road.points) || road.points.length < 2) continue;
      const bounds = shapeBounds(road.points), entry = { road, bounds };
      const x0 = Math.floor(bounds.minX / 1000), x1 = Math.floor(bounds.maxX / 1000), z0 = Math.floor(bounds.minZ / 1000), z1 = Math.floor(bounds.maxZ / 1000);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 256) { this.longRoads.push(entry);continue; }
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const key = `${x},${z}`;if (!this.roadGrid.has(key)) this.roadGrid.set(key, []);this.roadGrid.get(key).push(entry); }
    }
    this.dirty = true;this.draw();
  }
  visibleRoads(bounds) {
    const result = new Set(this.longRoads);
    for (let x = Math.floor(bounds.minX / 1000); x <= Math.floor(bounds.maxX / 1000); x++) for (let z = Math.floor(bounds.minZ / 1000); z <= Math.floor(bounds.maxZ / 1000); z++) for (const entry of this.roadGrid.get(`${x},${z}`) || []) result.add(entry);
    return [...result].filter(entry => overlaps(bounds, entry.bounds)).map(entry => entry.road);
  }
  paintLand(context, view) {
    context.fillStyle = '#192c35';context.fillRect(0, 0, view.width, view.height);
    context.fillStyle = '#303d3d';context.strokeStyle = '#516160';context.lineWidth = 1;
    const bounds = viewBounds(view);
    for (const entry of this.landPolygons) {
      if (!overlaps(bounds, entry.bounds)) continue;
      context.beginPath();
      for (const ring of [entry.polygon.outer, ...(entry.polygon.holes || [])]) {
        for (let i = 0; i < ring.length; i++) { const point = ring[i], p = mapWorldToScreen({ x: point[0], z: point[1] }, view);i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y); }
        context.closePath();
      }
      context.fill('evenodd');context.stroke();
    }
  }
  paintMiniLand(context, view) {
    const bounds = viewBounds(view), cached = this.miniLandCache, b = cached && viewBounds(cached.view);
    if (!cached || cached.view.span !== view.span * 2 || cached.view.width !== view.width * 2 || bounds.minX < b.minX || bounds.maxX > b.maxX || bounds.minZ < b.minZ || bounds.maxZ > b.maxZ) {
      // A land buffer at the same pixel scale preserves the measured
      // shoreline while avoiding thousands of boundary vertices each HUD tick.
      const canvas = this.document.createElement('canvas');canvas.width = view.width * 2;canvas.height = view.height * 2;
      const cacheView = { ...view, width: canvas.width, height: canvas.height, span: view.span * 2 };
      this.paintLand(canvas.getContext('2d'), cacheView);this.miniLandCache = { canvas, view: cacheView };
    }
    const cache = this.miniLandCache, sourceBounds = viewBounds(cache.view);
    const corner = mapWorldToScreen({ x: sourceBounds.minX, z: sourceBounds.minZ }, view);
    context.drawImage(cache.canvas, corner.x, corner.y);
  }
  paintRoads(context, view, roads, minimumWidth = .65) {
    const scale = view.width / view.span, groups = new Map();
    // Batch identical strokes: the citywide source has over 100,000 segments.
    // Source coordinates stay intact; only displayed line widths are rounded.
    for (const road of roads) {
      const major = ['highway','motorway','bridge','ramp'].includes(road.kind);
      const width = Math.round(clamp((road.width || (major ? 16 : 8)) * scale * .55, minimumWidth, 14) * 2) / 2;
      const level = road.kind === 'tunnel' ? -1 : road.kind === 'bridge' ? 1 : 0;
      const key = `${level}:${major ? 1 : 0}:${width}`;
      if (!groups.has(key)) groups.set(key, { roads: [], width, level, color: level < 0 ? '#738182' : level > 0 ? '#cbc9b6' : major ? '#adaca0' : '#8c9890' });
      groups.get(key).roads.push(road);
    }
    context.lineCap = 'round';context.lineJoin = 'round';
    for (const { roads: batch, width, color, level } of [...groups.values()].sort((a,b) => a.level - b.level)) {
      context.setLineDash(level < 0 ? [4, 4] : []);
      context.strokeStyle = color;context.lineWidth = width;context.beginPath();
      for (const road of batch) for (let i = 0; i < road.points.length; i++) {
        const point = road.points[i], p = mapWorldToScreen({ x: point[0], z: point[1] }, view);
        i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y);
      }
      context.stroke();
    }
    context.setLineDash([]);
  }
  roadChunks() {
    // Every street once, as paths in the game's own metres, in 4 km squares:
    // a redraw then strokes only the squares in sight and builds nothing.
    if (!this.chunks) {
      const chunks = new Map();
      for (const road of this.roads) {
        const points = road.points;if (!(points?.length > 1)) continue;
        const major = ['highway','motorway','bridge','ramp'].includes(road.kind), width = road.width || (major ? 16 : 8);
        const key = `${major ? 1 : 0}:${width}:${Math.floor(points[0][0] / 4000)}:${Math.floor(points[0][1] / 4000)}`;
        let chunk = chunks.get(key);
        if (!chunk) chunks.set(key, chunk = { path: new Path2D(), major, width, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
        for (let i = 0; i < points.length; i++) {
          const x = points[i][0], z = points[i][1];i ? chunk.path.lineTo(x, z) : chunk.path.moveTo(x, z);
          if (x < chunk.minX) chunk.minX = x;if (x > chunk.maxX) chunk.maxX = x;if (z < chunk.minZ) chunk.minZ = z;if (z > chunk.maxZ) chunk.maxZ = z;
        }
      }
      this.chunks = [...chunks.values()].sort((a, b) => a.major - b.major);
    }
    return this.chunks;
  }
  roadChunks() {
    // Every street once, as paths in the game's own metres, in 4 km squares:
    // a redraw then strokes only the squares in sight and builds nothing.
    if (!this.chunks) {
      const chunks = new Map();
      for (const road of this.roads) {
        const points = road.points;if (!(points?.length > 1)) continue;
        const major = ['highway','motorway','bridge','ramp'].includes(road.kind), width = road.width || (major ? 16 : 8);
        const key = `${major ? 1 : 0}:${width}:${Math.floor(points[0][0] / 4000)}:${Math.floor(points[0][1] / 4000)}`;
        let chunk = chunks.get(key);
        if (!chunk) chunks.set(key, chunk = { path: new Path2D(), major, width, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
        for (let i = 0; i < points.length; i++) {
          const x = points[i][0], z = points[i][1];i ? chunk.path.lineTo(x, z) : chunk.path.moveTo(x, z);
          if (x < chunk.minX) chunk.minX = x;if (x > chunk.maxX) chunk.maxX = x;if (z < chunk.minZ) chunk.minZ = z;if (z > chunk.maxZ) chunk.maxZ = z;
        }
      }
      this.chunks = [...chunks.values()].sort((a, b) => a.major - b.major);
    }
    return this.chunks;
  }
  paintOverviewRoads(context, view) {
    // Above 10 km across, stroking every street costs tens of milliseconds:
    // too slow for each frame of a zoom. The streets are kept instead as one
    // layer at the screen's own resolution, a little wider than the view. A
    // pan copies it. A zoom redraws it at once at the new scale, so a notch of
    // the wheel never shows stretched streets; only the small steps of a pinch,
    // under 8% in all, rescale it between redraws, and once the view rests it
    // is redrawn at exactly the scale shown.
    const ratio = this.ratio, scale = view.width / view.span, want = viewBounds(view);
    let sharp = this.sharpRoads, have = sharp && viewBounds(sharp.view);
    if (!sharp || sharp.ratio !== ratio || Math.abs(Math.log(scale / sharp.scale)) > .077 || have.minX > want.minX || have.maxX < want.maxX || have.minZ > want.minZ || have.maxZ < want.maxZ) {
      this.sharpenRoads(view);sharp = this.sharpRoads;have = viewBounds(sharp.view);
    }
    const grown = scale / sharp.scale, exact = Math.abs(grown - 1) < 1e-9, corner = mapWorldToScreen({ x: have.minX, z: have.minZ }, view);
    // At rest, whole device pixels: the layer is copied and not resampled.
    const x = exact ? Math.round(corner.x * ratio) / ratio : corner.x, y = exact ? Math.round(corner.y * ratio) / ratio : corner.y;
    context.imageSmoothingQuality = 'high';
    context.drawImage(sharp.canvas, x, y, sharp.view.width * grown, sharp.view.height * grown);
    if (this.sharpTimer != null) clearTimeout(this.sharpTimer);this.sharpTimer = null;
    if (!exact) this.sharpTimer = setTimeout(() => { this.sharpTimer = null;if (!this.open || this.disposed) return;this.sharpenRoads(this.view);this.draw(); }, 80);
  }
  sharpenRoads(view) {
    const ratio = this.ratio, scale = view.width / view.span, margin = 1.4;
    const canvas = this.sharpRoads?.canvas || this.document.createElement('canvas');
    const w = Math.ceil(view.width * margin * ratio), h = Math.ceil(view.height * margin * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w;canvas.height = h; }
    const kept = { x: view.x, z: view.z, width: w / ratio, height: h / ratio, span: w / ratio / scale }, bounds = viewBounds(kept);
    const context = canvas.getContext('2d');context.setTransform(1, 0, 0, 1, 0, 0);context.clearRect(0, 0, w, h);
    if (typeof Path2D === 'function') {
      const k = scale * ratio;context.setTransform(k, 0, 0, k, (kept.width / 2 - kept.x * scale) * ratio, (kept.height / 2 - kept.z * scale) * ratio);
      context.lineCap = 'round';context.lineJoin = 'round';
      for (const chunk of this.roadChunks()) {
        if (!overlaps(bounds, chunk)) continue;
        // The same widths and colours as paintRoads, in metres under the transform.
        context.strokeStyle = chunk.major ? '#adaca0' : '#8c9890';
        context.lineWidth = Math.round(clamp(chunk.width * scale * .55, .65, 14) * 2) / 2 / scale;context.stroke(chunk.path);
      }
    } else { context.setTransform(ratio, 0, 0, ratio, 0, 0);this.paintRoads(context, kept, this.visibleRoads(bounds), .65); }
    this.sharpRoads = { canvas, view: kept, scale, ratio };
  }
  dropSharpRoads() { if (this.sharpTimer != null) clearTimeout(this.sharpTimer);this.sharpTimer = null;this.sharpRoads = null; }
  setPin(point) {
    if (!finitePoint(point)) return;
    const b = this.city.bounds;
    if (point.x < b.minX || point.x > b.maxX || point.z < b.minZ || point.z > b.maxZ) { this.setStatus('Choose a point inside New York City.');return; }
    if (!this.searchMatches.length) {
      this.clearAddressResults();
      this.byId('game-map-address').value = point.name || '';
    }
    this.pin = { x: point.x, z: point.z, name: point.name || 'Map pin' };this.route = null;this.progress = null;this.transit.refresh();
    this.setStatus(point.name || '');this.updateControls();this.onPin(this.transit.active ? null : { ...this.pin });this.dirty = true;this.draw();return true;
  }
  clearPin() {
    this.drag = null;
    if (!this.searchMatches.length) {
      this.clearAddressResults();
      this.byId('game-map-address').value = '';
    }
    this.pin = null;this.route = null;this.progress = null;this.transit.refresh();this.onPin(null);this.setStatus('');this.updateControls();this.dirty = true;this.draw();this.canvas.focus();
  }
  setRoute(route) { this.route = route?.ok === false ? null : route;this.progress = null;this.dirty = true;this.updateDirections();this.draw(); }
  setRouteProgress(progress) { this.progress = progress;this.updateDirections(); }
  setGuidance(progress) { this.setRouteProgress(progress); }
  updateDirections() {
    const guide = this.byId('route-guide'), summary = this.byId('game-map-directions');
    const route = this.route, progress = this.progress;
    const instruction = progress?.nextInstruction?.text || route?.instructions?.[0]?.text || 'Follow the highlighted streets';
    const turn = Number.isFinite(progress?.distanceToInstruction) && progress.distanceToInstruction > 6 ? `In ${distanceText(progress.distanceToInstruction)}: ${instruction}` : instruction;
    let text = route ? progress?.arrived ? 'You have arrived.' : `${turn} · ${distanceText(progress?.remainingDistance ?? route.distance ?? 0)} remaining` : '';
    if (route && progress?.offRoute) text = 'Off route.';
    const instructionElement = this.byId('route-instruction');
    guide.hidden = !text;
    // Progress updates run with the HUD. Avoid repeatedly announcing identical
    // text through the map's aria-live region while the game is stationary.
    if (instructionElement.textContent !== text) instructionElement.textContent = text;
    if (summary.textContent !== text) summary.textContent = text;
  }
  setStatus(text) { this.byId('game-map-status').textContent = text; }
  setBusy(busy) { this.busy = Boolean(busy);if (this.busy) this.drag = null;this.updateControls(); }
  updateControls() {
    this.byId('game-map-pin-actions').hidden = !this.pin;
    this.byId('game-map-spawn').disabled = this.busy || !this.pin;
    this.byId('game-map-search-button').disabled = this.busy;
    this.updateDirections();
  }
  async spawnAtPin() {
    if (!this.pin || this.busy) return;
    this.setBusy(true);
    try { const result = await this.onSpawn({ ...this.pin });if (result === true) this.setOpen(false); } catch (error) { this.setStatus(error?.message || 'That destination is unavailable.'); }
    finally { if (!this.disposed) this.setBusy(false); }
  }
  update(sim, radarExpanded = false) { this.sim = sim;this.setPlayer(sim.player);this.drawMini(radarExpanded ? 600 : 300);if (this.open) { this.dimensions();if (this.dirty) this.draw(); } }
  draw() {
    this.dirty = true;if (!this.open || this.disposed) return;
    const ratio = this.ratio = this.dimensions(), context = this.canvas.getContext('2d');context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.paint(context, this.view, false);this.dirty = false;
    this.byId('game-map-scale').textContent = `${distanceText(this.view.span)} across · NORTH ↑`;
  }
  drawPreview(canvas, span = 1400, center = this.player, showPlaces = true) {
    if (this.disposed || !this.player) return;
    const rect = canvas.getBoundingClientRect(), width = Math.max(1, rect.width || 640), height = Math.max(1, rect.height || 420);
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    if(canvas.width!==Math.round(width*ratio))canvas.width=Math.round(width*ratio);
    if(canvas.height!==Math.round(height*ratio))canvas.height=Math.round(height*ratio);
    const context = canvas.getContext('2d');context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const view={x:center.x,z:center.z,width,height,span};
    this.paint(context,view,false,showPlaces);return view;
  }
  drawMini(span = 300) {
    if (!this.mini || this.disposed) return;
    const size = this.mini.width, context = this.mini.getContext('2d');
    this.paint(context, { x: this.player.x, z: this.player.z, width: size, height: size, span }, true);
  }
  paintSearchMatches(context, view, bounds) {
    context.beginPath();
    for (const place of this.searchMatches) {
      if (place.x < bounds.minX || place.x > bounds.maxX || place.z < bounds.minZ || place.z > bounds.maxZ) continue;
      const p = mapWorldToScreen(place, view);
      context.moveTo(p.x + searchMarkerRadius, p.y);
      context.arc(p.x, p.y, searchMarkerRadius, 0, Math.PI * 2);
    }
    context.strokeStyle = '#20171a';context.lineWidth = 3;context.stroke();
    context.fillStyle = '#ff9fa0';context.fill();
  }
  paint(context, view, mini, showPlaces = true) {
    const bounds = viewBounds(view), xy = point => mapWorldToScreen({ x: point[0], z: point[1] }, view);
    const chain = points => { points.forEach((point, i) => { const p = xy(point);i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y); }); };
    context.save();if (mini) this.paintMiniLand(context, view);else this.paintLand(context, view);
    for (const airport of airports) {
      const [x, z, width, depth] = airport.rect;
      if (!overlaps(bounds, { minX:x, maxX:x+width, minZ:z, maxZ:z+depth })) continue;
      context.fillStyle = '#82918f';
      for (const runway of airport.runways) {
        context.beginPath();
        for (const ring of runway.rings) { chain(ring);context.closePath(); }
        context.fill('evenodd');
      }
    }
    // Geometry comes from loaded survey footprints. At city scale the road
    // network supplies context without thousands of sub-pixel building fills.
    if (view.span < 4000) { context.fillStyle = '#445251';for (const building of this.city.buildings || []) { if (!building.polygon?.length || !overlaps(bounds, shapeBounds(building.polygon))) continue;context.beginPath();for (const ring of [building.polygon, ...(building.holes || [])]) { chain(ring);context.closePath(); }context.fill('evenodd'); } }
    const overview = !mini && view.span > 10000 && this.roads.length > 1000;
    const roads = overview ? [] : this.visibleRoads(bounds);
    if (overview) this.paintOverviewRoads(context, view);else this.paintRoads(context, view, roads, mini ? 1.3 : .65);
    if (this.showBikeLanes && this.bikeLanes) {
      context.strokeStyle='#80c4a4';context.lineWidth=mini?1.6:Math.max(.5,1.9*markerScale(view.span));
      context.beginPath();
      const shared=[];
      for(const lane of this.bikeLanes.within(bounds)){
        if(lane.kind==='shared'||lane.kind==='signed')shared.push(lane);else chain(lane.points);
      }
      context.stroke();
      if(shared.length){
        context.beginPath();context.setLineDash([3,3]);
        for(const lane of shared)chain(lane.points);
        context.stroke();context.setLineDash([]);
      }
    }
    if (!mini && view.span < 3500) {
      const labels = new Set(), slots = new Set();context.font = '600 11px "Chalet Menu", Jost, Arial';context.fillStyle = '#d1d7d0';context.textAlign = 'center';
      for (const road of roads) {
        if (!road.name || labels.has(road.name) || labels.size >= 20) continue;
        const a = xy(road.points[0]), b = xy(road.points.at(-1));if (Math.hypot(b.x - a.x, b.y - a.y) < 75) continue;
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, slot = `${Math.floor(x / 130)},${Math.floor(y / 45)}`;
        if (x < 35 || x > view.width - 35 || y < 20 || y > view.height - 20 || slots.has(slot)) continue;
        context.fillText(road.name, x, y - 6);slots.add(slot);labels.add(road.name);
      }
    }
    if (!mini && view.span > 8000) { context.font = '700 13px "Chalet Menu", Jost, Arial';context.fillStyle = '#c3c9c0';context.textAlign = 'center';for (const borough of this.city.boroughs || []) if (finitePoint(borough.label)) { const p = mapWorldToScreen(borough.label, view);context.fillText(borough.name.toUpperCase(), p.x, p.y); } }
    if (!mini && showPlaces) this.paintPlaces(context, view);
    const route = pointsOf(this.route);
    for (const stop of this.sim?.transport?.stops || []) {
      const p = mapWorldToScreen(stop.board,view);
      if (p.x < 0 || p.y < 0 || p.x > view.width || p.y > view.height) continue;
      const spec = TRANSPORT[stop.type], dock = isWatercraft(spec);
      context.fillStyle = '#153b46';context.strokeStyle = '#b8e4df';context.lineWidth = 1.4;
      context.beginPath();context.arc(p.x,p.y,mini?8:9,0,Math.PI*2);context.fill();context.stroke();
      context.textAlign = 'center';context.font = 'bold 12px sans-serif';context.fillStyle = '#effffa';
      context.fillText(dock?'⚓':isAircraft(spec)?'✈':spec.kind==='cable'||spec.kind==='rail'?'T':'R',p.x,p.y+4);
      if (!mini && view.span < 6500) {
        context.fillStyle = '#f4f1e5';context.textAlign = 'left';context.fillText(stop.place,p.x+12,p.y+4);
      }
    }
    if ((mini || !this.transit.active) && route.length > 1) { context.strokeStyle = '#131c24';context.lineWidth = mini ? 9 : 8;context.beginPath();chain(route);context.stroke();context.strokeStyle = '#ba8cff';context.lineWidth = mini ? 5 : 4;context.stroke(); }
    if (mini) this.paintRadarDoors(context, view);
    else if (this.transit.active) this.transit.paint(context,view,bounds);
    if (!mini && this.searchMatches.length) this.paintSearchMatches(context, view, bounds);
    if (!mini && this.key.preview) {
      const p = mapWorldToScreen(this.key.preview, view);
      context.beginPath();context.arc(p.x, p.y, 13, 0, Math.PI * 2);
      context.strokeStyle = '#172329';context.lineWidth = 4;context.stroke();
      context.strokeStyle = '#fff1c6';context.lineWidth = 2;context.stroke();
    }
    const pin = this.drag?.preview || this.pin || (this.sim?.mission?.phase === 'active' ? this.sim.mission.target : null);
    if (pin) { const p = mapWorldToScreen(pin, view), x = mini ? clamp(p.x, 12, view.width - 12) : p.x, y = mini ? clamp(p.y, 12, view.height - 12) : p.y;context.fillStyle = '#ff9369';context.strokeStyle = '#1b2529';context.lineWidth = 3;context.beginPath();context.arc(x, y, mini ? 7 : 9, 0, Math.PI * 2);context.fill();context.stroke(); }
    // Civilian traffic stays off the map. Police show once you are wanted, held
    // to the edge of the minimap the way a radar keeps a chase in view, and a
    // fight shows only the person you are actually fighting.
    const mark = (x, z, draw, clampToEdge) => {
      const p = mapWorldToScreen({ x, z }, view);
      let px = p.x, py = p.y;
      if (clampToEdge) {
        const cx = view.width / 2, cy = view.height / 2, dx = px - cx, dy = py - cy;
        const limit = Math.min(view.width, view.height) / 2 - 12, dist = Math.hypot(dx, dy);
        if (dist > limit) { px = cx + dx / dist * limit; py = cy + dy / dist * limit; }
      } else if (px < -12 || py < -12 || px > view.width + 12 || py > view.height + 12) return;
      draw(px, py);
    };
    if ((this.sim?.heat || 0) > 0) {
      const police = this.sim.police, searching = police?.state === 'search', beat = Math.sin((this.sim.elapsed || 0) * 6) > 0;
      // Metres to pixels, and which way a heading points on the screen.
      const here = mapWorldToScreen(this.player, view), east = mapWorldToScreen({ x: this.player.x + 100, z: this.player.z }, view), north = mapWorldToScreen({ x: this.player.x, z: this.player.z + 100 }, view);
      const scale = Math.hypot(east.x - here.x, east.y - here.y) / 100;
      const bearing = angle => Math.atan2((east.y - here.y) * Math.sin(angle) + (north.y - here.y) * Math.cos(angle), (east.x - here.x) * Math.sin(angle) + (north.x - here.x) * Math.cos(angle));
      // While they search: where you were last seen, how far the search has spread, and what each unit can see.
      if (searching && police.lastKnown) {
        const p = mapWorldToScreen(police.lastKnown, view);
        context.fillStyle = '#ff5d3c1c'; context.strokeStyle = beat ? '#ff5d3caa' : '#ff5d3c55'; context.lineWidth = 1.5;
        context.beginPath(); context.arc(p.x, p.y, police.searchRadius * scale, 0, Math.PI * 2); context.fill(); context.stroke();
        context.fillStyle = '#ff5d3c'; context.beginPath(); context.arc(p.x, p.y, 3, 0, Math.PI * 2); context.fill();
      }
      const cone = unit => {
        if (!searching) return;
        const p = mapWorldToScreen(unit, view), reach = 62 * scale, at = bearing(unit.angle || 0), half = 55 * Math.PI / 180;
        if (p.x < -reach || p.y < -reach || p.x > view.width + reach || p.y > view.height + reach) return;
        context.fillStyle = '#7ec8ff30'; context.beginPath(); context.moveTo(p.x, p.y); context.arc(p.x, p.y, reach, at - half, at + half); context.closePath(); context.fill();
      };
      for (const car of this.sim.cars || []) if (car.type === 'police' && !car._crewOut && !car._abandoned) cone(car);
      for (const officer of police?.officers || []) cone(officer);
      for (const car of this.sim.cars || []) {
        if (car.type !== 'police' || car._abandoned) continue;
        mark(car.x, car.z, (x, y) => {
          context.save(); context.translate(x, y); context.rotate(bearing(car.angle || 0) - Math.PI / 2);
          context.fillStyle = beat ? '#7ec8ff' : '#ff6b5c'; context.strokeStyle = '#102028'; context.lineWidth = 1;
          context.beginPath(); context.moveTo(0, 6); context.lineTo(-4.5, -4); context.lineTo(4.5, -4); context.closePath();
          context.fill(); context.stroke(); context.restore();
        }, mini);
      }
      for (const officer of police?.officers || []) mark(officer.x, officer.z, (x, y) => {
        context.fillStyle = '#7ec8ff'; context.strokeStyle = '#102028'; context.lineWidth = 1;
        context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fill(); context.stroke();
      }, false);
      const helicopter = police?.helicopter;
      if (helicopter) {
        if (searching) { const p = mapWorldToScreen(helicopter.light, view); context.fillStyle = '#fff6c038'; context.beginPath(); context.arc(p.x, p.y, 32 * scale, 0, Math.PI * 2); context.fill(); }
        mark(helicopter.x, helicopter.z, (x, y) => {
          const spin = (this.sim.elapsed || 0) * 9;
          context.strokeStyle = '#102028'; context.fillStyle = beat ? '#7ec8ff' : '#ff6b5c'; context.lineWidth = 1;
          context.beginPath(); context.arc(x, y, 4.5, 0, Math.PI * 2); context.fill(); context.stroke();
          context.strokeStyle = '#e8f4ff'; context.lineWidth = 1.5; context.beginPath();
          context.moveTo(x - Math.cos(spin) * 9, y - Math.sin(spin) * 9); context.lineTo(x + Math.cos(spin) * 9, y + Math.sin(spin) * 9);
          context.moveTo(x + Math.sin(spin) * 9, y - Math.cos(spin) * 9); context.lineTo(x - Math.sin(spin) * 9, y + Math.cos(spin) * 9); context.stroke();
        }, mini);
      }
    }
    for (const threat of this.sim?.threats || []) mark(threat.x, threat.z, (x, y) => {
      context.fillStyle = threat.kind === 'down' ? '#8d928a' : '#ff5d3c'; context.fillRect(x - 3, y - 3, 6, 6);
    }, false);
    if(!mini&&this.transit.marker){context.restore();return;}
    const p = mapWorldToScreen(this.player, view);context.translate(p.x, p.y);context.rotate(-(this.player.angle || 0));context.fillStyle = '#f8f2df';context.strokeStyle = '#172127';context.lineWidth = 3;context.beginPath();context.moveTo(0, 12);context.lineTo(-8, -8);context.lineTo(0, -4);context.lineTo(8, -8);context.closePath();context.fill();context.stroke();context.restore();
  }
  getState() { return { open: this.open, pin: this.pin && { ...this.pin }, view: { ...this.view }, busy: this.busy, route: this.route && { distance: this.route.distance, points: pointsOf(this.route).map(point => [...point]) } }; }
  dispose() { if (this.disposed) return;this.setOpen(false);this.disposed = true;for (const remove of this.listeners) remove();this.listeners = [];this.key.dispose();this.doors = [];this.doorsApart.clear();this.roadGrid.clear();this.chunks = null;this.dropSharpRoads();this.miniLandCache = null;this.drag = null; }
}
