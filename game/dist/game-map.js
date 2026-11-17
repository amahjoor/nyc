const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.z);
const distanceText = meters => meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
const pointsOf = route => route?.ok !== false && Array.isArray(route?.points) ? route.points : [];
const overlaps = (a, b) => a.maxX >= b.minX && a.minX <= b.maxX && a.maxZ >= b.minZ && a.minZ <= b.maxZ;

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
  constructor({ document = globalThis.document, city, onPin = () => {}, onRoute = () => {}, onSpawn = () => {}, onOpenChange = () => {} } = {}) {
    this.document = document;this.city = city;this.onPin = onPin;this.onRoute = onRoute;this.onSpawn = onSpawn;this.onOpenChange = onOpenChange;
    this.element = document.getElementById('game-map');this.canvas = document.getElementById('game-map-canvas');
    this.mini = document.getElementById('minimap');this.open = false;this.pin = null;this.route = null;this.progress = null;this.busy = false;
    this.player = { x: city.spawn?.x || 0, z: city.spawn?.z || 0, angle: 0 };
    this.view = { ...this.player, span: 1000, width: 1000, height: 700 };this.listeners = [];this.dirty = true;this.following = true;
    this.roadGrid = new Map();this.longRoads = [];this.roads = [];this.overviewCache = null;this.sim = null;this.disposed = false;
    const byId = id => document.getElementById(id);this.byId = byId;
    const listen = (target, type, callback, options) => { target.addEventListener(type, callback, options);this.listeners.push(() => target.removeEventListener(type, callback, options)); };
    listen(byId('game-map-close'), 'click', () => this.setOpen(false));
    listen(byId('game-map-zoom-in'), 'click', () => this.zoom(.65));
    listen(byId('game-map-zoom-out'), 'click', () => this.zoom(1 / .65));
    listen(byId('game-map-recenter'), 'click', () => this.recenter());
    listen(byId('game-map-city'), 'click', () => this.showCity());
    listen(byId('game-map-clear'), 'click', () => this.clearPin());
    listen(byId('game-map-route'), 'click', () => this.invoke(this.onRoute));
    listen(byId('game-map-spawn'), 'click', () => this.invoke(this.onSpawn));
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
      if (key === 'Escape' || key === 'm' || key === 'M' || key === 'KeyM') {
        event.preventDefault();event.stopImmediatePropagation();if (!event.repeat) this.setOpen(false);
      } else if (key === 'Tab') {
        // Keep keyboard focus inside this modal without relying on a native
        // dialog; the existing 3D map and pause dialogs remain separate flows.
        const ids = ['game-map-close','game-map-canvas','game-map-zoom-in','game-map-zoom-out','game-map-recenter','game-map-city','game-map-route','game-map-spawn','game-map-clear'];
        const elements = ids.map(byId).filter(element => !element.disabled);
        const i = elements.indexOf(document.activeElement), next = (i + (event.shiftKey ? -1 : 1) + elements.length) % elements.length;
        event.preventDefault();elements[next]?.focus();
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
    this.drag = { pointerId: event.pointerId, start: point, center: { x: this.view.x, z: this.view.z }, pin: Boolean(pin && Math.hypot(pin.x - point.x, pin.y - point.y) < 20), moved: false };
    this.canvas.setPointerCapture?.(event.pointerId);
  }
  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const point = this.pointerPoint(event), dx = point.x - this.drag.start.x, dy = point.y - this.drag.start.y;
    if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
    if (!this.drag.moved) return;
    if (this.drag.pin) this.setPin(mapScreenToWorld(point, this.view));
    else {
      this.following = false;this.view.x = this.drag.center.x - dx * this.view.span / this.view.width;
      this.view.z = this.drag.center.z - dy * this.view.span / this.view.width;this.clampCenter();this.draw();
    }
  }
  pointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const drag = this.drag;this.drag = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
    if (!drag.moved && !drag.pin) this.setPin(mapScreenToWorld(this.pointerPoint(event), this.view));
  }
  cancelPointer(event) { if (this.drag?.pointerId === event.pointerId) this.drag = null; }
  clampCenter() {
    const bounds = this.city.bounds;this.view.x = clamp(this.view.x, bounds.minX, bounds.maxX);this.view.z = clamp(this.view.z, bounds.minZ, bounds.maxZ);this.dirty = true;
  }
  fullSpan() { const b = this.city.bounds;return Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * this.view.width / this.view.height) * 1.08; }
  zoom(factor, anchor = { x: this.view.width / 2, y: this.view.height / 2 }) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = mapScreenToWorld(anchor, this.view);
    this.view.span = clamp(this.view.span * factor, 120, this.fullSpan() * 1.25);
    const after = mapScreenToWorld(anchor, this.view);this.view.x += before.x - after.x;this.view.z += before.z - after.z;
    this.following = false;this.clampCenter();this.draw();
  }
  recenter() { this.view.x = this.player.x;this.view.z = this.player.z;this.view.span = 1000;this.following = true;this.clampCenter();this.draw(); }
  showCity() { const b = this.city.bounds;this.view.x = (b.minX + b.maxX) / 2;this.view.z = (b.minZ + b.maxZ) / 2;this.view.span = this.fullSpan();this.following = false;this.dirty = true;this.draw(); }
  setOpen(open) {
    if (this.disposed || this.open === Boolean(open)) return;
    this.open = Boolean(open);this.element.hidden = !this.open;
    if (this.open) { this.previousFocus = this.document.activeElement;this.dimensions();this.recenter();this.byId('game-map-close').focus(); }
    else { this.drag = null;this.previousFocus?.focus?.(); }
    this.byId('map-button').setAttribute('aria-expanded', String(this.open));this.byId('open-map-button').setAttribute('aria-expanded', String(this.open));this.onOpenChange(this.open);
  }
  toggle() { this.setOpen(!this.open); }
  setCity(city) {
    if (!city) return;
    if (this.city !== city) { this.city = city;this.dirty = true; }
    const b = city.bounds, key = `${b.minX}:${b.maxX}:${b.minZ}:${b.maxZ}`;
    if (key !== this.boundsKey) { this.boundsKey = key;this.overviewCache = null; }
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
  setRoads(roads) {
    this.roads = roads || [];this.roadGrid.clear();this.longRoads = [];this.overviewCache = null;
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
    if (!cached || cached.view.width !== view.width * 2 || bounds.minX < b.minX || bounds.maxX > b.maxX || bounds.minZ < b.minZ || bounds.maxZ > b.maxZ) {
      // A 600 m land buffer at the same pixel scale preserves the measured
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
      const key = `${major ? 1 : 0}:${width}`;
      if (!groups.has(key)) groups.set(key, { roads: [], width, color: major ? '#adaca0' : '#8c9890' });
      groups.get(key).roads.push(road);
    }
    context.lineCap = 'round';context.lineJoin = 'round';
    for (const { roads: batch, width, color } of groups.values()) {
      context.strokeStyle = color;context.lineWidth = width;context.beginPath();
      for (const road of batch) for (let i = 0; i < road.points.length; i++) {
        const point = road.points[i], p = mapWorldToScreen({ x: point[0], z: point[1] }, view);
        i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y);
      }
      context.stroke();
    }
  }
  paintOverviewRoads(context, view) {
    if (!this.overviewCache) {
      // Keep the complete source network in one bounded bitmap at city scale.
      // Panning and pin changes reuse it; neighborhood streets and routes are
      // always drawn as full-resolution vectors. No roads are sampled away.
      const b = this.city.bounds, span = b.maxX - b.minX, height = b.maxZ - b.minZ;
      const factor = 2048 / Math.max(span, height), canvas = this.document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(span * factor));canvas.height = Math.max(1, Math.round(height * factor));
      const cacheView = { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, width: canvas.width, height: canvas.height, span };
      this.paintRoads(canvas.getContext('2d'), cacheView, this.roads.filter(road => road.points?.length > 1), 1);
      this.overviewCache = { canvas, view: cacheView };
    }
    const cache = this.overviewCache, sourceBounds = viewBounds(cache.view);
    const corner = mapWorldToScreen({ x: sourceBounds.minX, z: sourceBounds.minZ }, view), scale = view.width / view.span;
    context.drawImage(cache.canvas, corner.x, corner.y, cache.view.span * scale, cache.view.span * cache.view.height / cache.view.width * scale);
  }
  setPin(point) {
    if (!finitePoint(point)) return;
    const b = this.city.bounds;
    if (point.x < b.minX || point.x > b.maxX || point.z < b.minZ || point.z > b.maxZ) { this.setStatus('Choose a point inside New York City.');return; }
    this.pin = { x: point.x, z: point.z, name: point.name || 'Map pin' };this.route = null;this.progress = null;
    this.setStatus('Pin selected. Drag it to move, get directions, or spawn at this location.');this.updateControls();this.onPin({ ...this.pin });this.dirty = true;this.draw();
  }
  clearPin() { this.pin = null;this.route = null;this.progress = null;this.onPin(null);this.setStatus('Click anywhere to place a pin. Drag the map to explore.');this.updateControls();this.dirty = true;this.draw(); }
  setRoute(route) { this.route = route?.ok === false ? null : route;this.progress = null;this.dirty = true;this.updateDirections();this.draw(); }
  setRouteProgress(progress) { this.progress = progress;this.updateDirections(); }
  setGuidance(progress) { this.setRouteProgress(progress); }
  updateDirections() {
    const guide = this.byId('route-guide'), summary = this.byId('game-map-directions');
    const route = this.route, progress = this.progress;
    const instruction = progress?.nextInstruction?.text || route?.instructions?.[0]?.text || 'Follow the highlighted streets';
    const turn = Number.isFinite(progress?.distanceToInstruction) && progress.distanceToInstruction > 6 ? `In ${distanceText(progress.distanceToInstruction)}: ${instruction}` : instruction;
    let text = route ? progress?.arrived ? 'You have arrived.' : `${turn} · ${distanceText(progress?.remainingDistance ?? route.distance ?? 0)} remaining` : '';
    if (route && progress?.offRoute) text = 'Off route. Open the map to update directions.';
    const mapText = route && progress?.offRoute ? 'Off route. Route here to update directions.' : text, instructionElement = this.byId('route-instruction');
    guide.hidden = !text;
    // Progress updates run with the HUD. Avoid repeatedly announcing identical
    // text through the map's aria-live region while the game is stationary.
    if (instructionElement.textContent !== text) instructionElement.textContent = text;
    if (summary.textContent !== mapText) summary.textContent = mapText;
  }
  setStatus(text) { this.byId('game-map-status').textContent = text; }
  setBusy(busy) { this.busy = Boolean(busy);if (this.busy) this.drag = null;this.updateControls(); }
  updateControls() { for (const id of ['game-map-route','game-map-spawn','game-map-clear']) this.byId(id).disabled = this.busy || !this.pin;this.updateDirections(); }
  async invoke(handler) {
    if (!this.pin || this.busy) return;
    this.setBusy(true);
    try { const result = await handler({ ...this.pin });if (handler === this.onSpawn && result === true) this.setOpen(false); } catch (error) { this.setStatus(error?.message || 'That destination is unavailable.'); }
    finally { if (!this.disposed) this.setBusy(false); }
  }
  update(sim) { this.sim = sim;this.setPlayer(sim.player);this.drawMini();if (this.open) { this.dimensions();if (this.dirty) this.draw(); } }
  draw() {
    this.dirty = true;if (!this.open || this.disposed) return;
    const ratio = this.dimensions(), context = this.canvas.getContext('2d');context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.paint(context, this.view, false);this.dirty = false;
    this.byId('game-map-scale').textContent = `${distanceText(this.view.span)} across · NORTH ↑`;
  }
  drawMini() {
    if (!this.mini || this.disposed) return;
    const size = this.mini.width, context = this.mini.getContext('2d');
    this.paint(context, { x: this.player.x, z: this.player.z, width: size, height: size, span: 300 }, true);
  }
  paint(context, view, mini) {
    const bounds = viewBounds(view), xy = point => mapWorldToScreen({ x: point[0], z: point[1] }, view);
    const chain = points => { points.forEach((point, i) => { const p = xy(point);i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y); }); };
    context.save();if (mini) this.paintMiniLand(context, view);else this.paintLand(context, view);
    // Geometry comes from loaded survey footprints. At city scale the road
    // network supplies context without thousands of sub-pixel building fills.
    if (view.span < 4000) { context.fillStyle = '#445251';for (const building of this.city.buildings || []) { if (!building.polygon?.length || !overlaps(bounds, shapeBounds(building.polygon))) continue;context.beginPath();for (const ring of [building.polygon, ...(building.holes || [])]) { chain(ring);context.closePath(); }context.fill('evenodd'); } }
    const overview = !mini && view.span > 10000 && this.roads.length > 1000;
    const roads = overview ? [] : this.visibleRoads(bounds);
    if (overview) this.paintOverviewRoads(context, view);else this.paintRoads(context, view, roads, mini ? 1.3 : .65);
    if (!mini && view.span < 3500) {
      const labels = new Set(), slots = new Set();context.font = '11px Arial';context.fillStyle = '#d1d7d0';context.textAlign = 'center';
      for (const road of roads) {
        if (!road.name || labels.has(road.name) || labels.size >= 20) continue;
        const a = xy(road.points[0]), b = xy(road.points.at(-1));if (Math.hypot(b.x - a.x, b.y - a.y) < 75) continue;
        const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, slot = `${Math.floor(x / 130)},${Math.floor(y / 45)}`;
        if (x < 35 || x > view.width - 35 || y < 20 || y > view.height - 20 || slots.has(slot)) continue;
        context.fillText(road.name, x, y - 6);slots.add(slot);labels.add(road.name);
      }
    }
    if (!mini && view.span > 8000) { context.font = 'bold 12px Arial';context.fillStyle = '#c3c9c0';context.textAlign = 'center';for (const borough of this.city.boroughs || []) if (finitePoint(borough.label)) { const p = mapWorldToScreen(borough.label, view);context.fillText(borough.name.toUpperCase(), p.x, p.y); } }
    const route = pointsOf(this.route);
    if (route.length > 1) { context.strokeStyle = '#131c24';context.lineWidth = mini ? 9 : 8;context.beginPath();chain(route);context.stroke();context.strokeStyle = '#ba8cff';context.lineWidth = mini ? 5 : 4;context.stroke(); }
    const pin = this.pin || (this.sim?.mission?.phase === 'active' ? this.sim.mission.target : null);
    if (pin) { const p = mapWorldToScreen(pin, view), x = mini ? clamp(p.x, 12, view.width - 12) : p.x, y = mini ? clamp(p.y, 12, view.height - 12) : p.y;context.fillStyle = '#ff9369';context.strokeStyle = '#1b2529';context.lineWidth = 3;context.beginPath();context.arc(x, y, mini ? 7 : 9, 0, Math.PI * 2);context.fill();context.stroke(); }
    if (mini) for (const car of this.sim?.cars || []) {
      if (car._kerb || car.id === this.player.vehicleId || car.x < bounds.minX || car.x > bounds.maxX || car.z < bounds.minZ || car.z > bounds.maxZ) continue;
      const p = mapWorldToScreen(car, view);context.fillStyle = car.type === 'police' && this.sim.heat > 0 ? '#7dc3eb' : '#eac877';context.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    const p = mapWorldToScreen(this.player, view);context.translate(p.x, p.y);context.rotate(-(this.player.angle || 0));context.fillStyle = '#f8f2df';context.strokeStyle = '#172127';context.lineWidth = 3;context.beginPath();context.moveTo(0, 12);context.lineTo(-8, -8);context.lineTo(0, -4);context.lineTo(8, -8);context.closePath();context.fill();context.stroke();context.restore();
  }
  getState() { return { open: this.open, pin: this.pin && { ...this.pin }, view: { ...this.view }, busy: this.busy, route: this.route && { distance: this.route.distance, points: pointsOf(this.route).map(point => [...point]) } }; }
  dispose() { if (this.disposed) return;this.setOpen(false);this.disposed = true;for (const remove of this.listeners) remove();this.listeners = [];this.roadGrid.clear();this.overviewCache = null;this.miniLandCache = null;this.drag = null; }
}
