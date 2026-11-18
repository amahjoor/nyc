import { geographicToWorld, NYC_BBOX } from './city-ground.js';
import { parseQuery } from './local-search.js';

const ENDPOINT = 'https://geosearch.planninglabs.nyc/v2/search';
const MAX_RESULTS = 6;
const BOROUGHS = new Map([
  ['manhattan', 'Manhattan'], ['brooklyn', 'Brooklyn'], ['queens', 'Queens'],
  ['bronx', 'Bronx'], ['the bronx', 'Bronx'], ['staten island', 'Staten Island'],
]);
const BOROUGH_IDS = new Map([
  ['whosonfirst:borough:421205771', 'Manhattan'], ['whosonfirst:borough:421205765', 'Brooklyn'],
  ['whosonfirst:borough:421205767', 'Queens'], ['whosonfirst:borough:421205773', 'Bronx'],
  ['whosonfirst:borough:421205775', 'Staten Island'],
]);
const text = (value, limit) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const canceled = () => new DOMException('Address search canceled.', 'AbortError');
const invalidResponse = () => new Error('NYC address search returned invalid results. Try again.');

function candidates(data) {
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.geocoding?.errors?.length) throw invalidResponse();
  const results = [], seen = new Set();
  // The query requests six records. Bound inspection too if the remote response
  // changes, and validate city identity as well as the rectangular map bounds.
  for (const feature of data.features.slice(0, 100)) {
    const p = feature?.properties, coordinates = feature?.geometry?.coordinates;
    if (p?.source !== 'nycpad' || feature.geometry?.type !== 'Point' || !Array.isArray(coordinates)) continue;
    const [lon, lat] = coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < NYC_BBOX[0] || lon > NYC_BBOX[2] || lat < NYC_BBOX[1] || lat > NYC_BBOX[3]) continue;
    if ((p.region_a && p.region_a !== 'NY') || (p.country_code && p.country_code !== 'US')) continue;
    const namedBorough = BOROUGHS.get(text(p.borough, 60).toLowerCase()), identifiedBorough = BOROUGH_IDS.get(p.borough_gid);
    if (namedBorough && identifiedBorough && namedBorough !== identifiedBorough) continue;
    const borough = namedBorough || identifiedBorough;
    const name = text(p.name, 200) || text(p.label, 200);
    const rawId = p.source_id ?? p.id;
    const sourceId = typeof rawId === 'number' && Number.isFinite(rawId) ? String(rawId) : text(rawId, 160);
    const gid = text(p.gid, 200), id = gid.startsWith('nycpad:') ? gid : sourceId ? `nycpad:${sourceId}` : '';
    if (!borough || !name || !id || seen.has(id)) continue;
    seen.add(id);
    results.push({ id, name, borough, lon, lat, ...geographicToWorld(lon, lat) });
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

/** Submit-only NYC Planning GeoSearch lookup; the caller owns selection/travel.
 * Source and API documentation: https://geosearch.planninglabs.nyc/docs/
 */
export async function searchAddresses(query, { signal, fetcher = globalThis.fetch.bind(globalThis) } = {}) {
  if (signal?.aborted) throw canceled();
  const normalized = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim() : '';
  if (normalized.length < 3 || normalized.length > 160 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error('Enter an NYC address between 3 and 160 characters.');
  }
  const url = new URL(ENDPOINT);
  url.searchParams.set('text', normalized);url.searchParams.set('size', String(MAX_RESULTS));
  for (const [key, value] of Object.entries({ min_lon: NYC_BBOX[0], min_lat: NYC_BBOX[1], max_lon: NYC_BBOX[2], max_lat: NYC_BBOX[3] })) {
    url.searchParams.set(`boundary.rect.${key}`, String(value));
  }
  const controller = new AbortController();let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const aborted = new Promise((resolve, reject) => controller.signal.addEventListener('abort', () => reject(canceled()), { once: true }));
  const timeout = setTimeout(() => { timedOut = true;controller.abort(); }, 10000);
  async function lookup() {
    let response;
    try { response = await fetcher(url.href, { signal: controller.signal, credentials: 'omit' }); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error('Could not reach NYC address search. Check your connection and try again.');
    }
    if (!response.ok) throw new Error(response.status === 429
      ? 'NYC address search is busy. Wait a moment and try again.'
      : 'NYC address search is temporarily unavailable. Try again.');
    let data;
    try { data = await response.json(); } catch { throw invalidResponse(); }
    return candidates(data);
  }
  try {
    // Race the whole response, including JSON reading. Cancellation must settle
    // the UI even if a stalled transport does not promptly acknowledge abort.
    return await Promise.race([lookup(), aborted]);
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut && !signal?.aborted) throw new Error('NYC address search timed out. Try again.');
      throw canceled();
    }
    throw error;
  } finally {
    clearTimeout(timeout);signal?.removeEventListener('abort', abort);
  }
}

/** Combine surveyed intersections and businesses with NYC building addresses. */
export async function searchDestinations(query, { searchLocal, lookup = searchAddresses, signal }) {
  const [local, remote] = await Promise.allSettled([
    Promise.resolve().then(() => searchLocal(query)),
    lookup(query, { signal }),
  ]);
  if (signal?.aborted) throw canceled();
  const found = local.status === 'fulfilled' && Array.isArray(local.value) ? local.value : [];
  if (remote.status === 'rejected' && !found.length) throw remote.reason;
  const addresses = remote.status === 'fulfilled' ? remote.value : [];

  if (found.some(place => place.kind === 'corner')) return found.slice(0, 8);
  return (parseQuery(query).numbered ? [...addresses, ...found] : [...found, ...addresses]).slice(0, 8);
}
