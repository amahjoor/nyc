import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAddresses } from '../dist/geocoder.js';
import { geographicToWorld, NYC_BBOX } from '../dist/city-ground.js';

// Successful official GeoSearch responses sampled in all five boroughs.
const addresses = [
  ['Manhattan', '350 FIFTH AVENUE', -73.985656, 40.748441, '421205771'],
  ['Brooklyn', '209 JORALEMON STREET', -73.990298, 40.692768, '421205765'],
  ['Queens', '120-55 QUEENS BOULEVARD', -73.828104, 40.713783, '421205767'],
  ['Bronx', '851 GRAND CONCOURSE', -73.923808, 40.826285, '421205773'],
  ['Staten Island', '10 RICHMOND TERRACE', -74.076018, 40.642348, '421205775'],
];
const feature = ([borough, name, lon, lat, boroughId], id = name) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { gid: `nycpad:venue:${id}`, source: 'nycpad', name, borough,
    borough_gid: `whosonfirst:borough:${boroughId}`, region_a: 'NY', country_code: 'US' },
});
const collection = features => ({ type: 'FeatureCollection', features });
const response = features => ({ ok: true, json: async () => collection(features) });

test('official address candidates preserve five boroughs, Queens hyphens, and the game projection', async () => {
  let request;
  const results = await searchAddresses('  120-55   Queens Boulevard  ', { fetcher: async (url, options) => {
    request = { url: new URL(url), options };return response(addresses.map(address => feature(address)));
  } });
  assert.equal(request.url.origin, 'https://geosearch.planninglabs.nyc');
  assert.equal(request.url.pathname, '/v2/search');
  assert.equal(request.url.searchParams.get('text'), '120-55 Queens Boulevard');
  assert.equal(request.url.searchParams.get('size'), '6');
  assert.equal(Number(request.url.searchParams.get('boundary.rect.min_lon')), NYC_BBOX[0]);
  assert.equal(Number(request.url.searchParams.get('boundary.rect.max_lat')), NYC_BBOX[3]);
  assert.equal(request.options.credentials, 'omit');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.equal(results.length, 5);
  for (const [i, result] of results.entries()) {
    const [borough, name, lon, lat] = addresses[i];
    assert.deepEqual(result, { id: `nycpad:venue:${name}`, name, borough, lon, lat, ...geographicToWorld(lon, lat) });
  }
});

test('default native browser fetch retains the global receiver', async t => {
  t.mock.method(globalThis, 'fetch', function () {
    assert.equal(this, globalThis, 'native browser fetch must not receive an options object as its receiver');
    return Promise.resolve(response([feature(addresses[0])]));
  });
  assert.equal((await searchAddresses('350 Fifth Avenue'))[0].borough, 'Manhattan');
});

test('invalid queries fail before any network request', async () => {
  let calls = 0;
  for (const query of ['', 'a', null, 'x'.repeat(161), '123\u0000Main']) {
    await assert.rejects(searchAddresses(query, { fetcher: () => { calls++; } }), /between 3 and 160/);
  }
  assert.equal(calls, 0);
});

test('malformed points, non-NYC providers, unknown boroughs, and contradictory borough identities are rejected', async () => {
  const valid = feature(addresses[0]);
  const bad = mutate => { const value = structuredClone(valid);mutate(value);return value; };
  const features = [null, {},
    bad(f => { f.geometry.type = 'Polygon'; }),
    bad(f => { f.geometry.coordinates = ['-73.985656', 40.748441]; }),
    bad(f => { f.geometry.coordinates = [NaN, 40.748441]; }),
    bad(f => { f.geometry.coordinates = [-74.4, 40.748441]; }),
    bad(f => { f.geometry.coordinates = [-73.985656, 41.1]; }),
    bad(f => { f.properties.source = 'unverified'; }),
    bad(f => { f.properties.borough = 'Nassau';delete f.properties.borough_gid; }),
    bad(f => { f.properties.region_a = 'NJ'; }),
    bad(f => { f.properties.country_code = 'CA'; }),
    bad(f => { f.properties.borough = 'Queens'; }),
    bad(f => { delete f.properties.name; }), valid];
  const results = await searchAddresses('350 Fifth Avenue', { fetcher: async () => response(features) });
  assert.equal(results.length, 1);assert.equal(results[0].name, valid.properties.name);
});

test('known borough identifiers and canonical names work independently while ambiguous boroughs stay distinct', async () => {
  const manhattan = feature(addresses[0]), brooklyn = feature(addresses[1]);
  delete manhattan.properties.borough;
  delete brooklyn.properties.borough_gid;
  manhattan.properties.name = brooklyn.properties.name = '350 FIFTH AVENUE';
  const results = await searchAddresses('350 Fifth Avenue', { fetcher: async () => response([manhattan, brooklyn]) });
  assert.deepEqual(results.map(result => result.borough), ['Manhattan', 'Brooklyn']);
});

test('responses deduplicate IDs, bound count and clean oversized display strings', async () => {
  const first = feature(addresses[0]);first.properties.name = '  350\n FIFTH\u0000AVENUE  ';
  const features = [first, first, ...Array.from({ length: 15 }, (_, id) => feature(addresses[2], String(id)))];
  features[2].properties.name = 'x'.repeat(1000);
  const results = await searchAddresses('350 Fifth Avenue', { fetcher: async () => response(features) });
  assert.equal(results.length, 6);
  assert.equal(new Set(results.map(result => result.id)).size, 6);
  assert.equal(results[0].name, '350 FIFTH AVENUE');
  assert.equal(results[1].name.length, 200);
});

test('empty matches remain an empty array and invalid payloads have an actionable error', async () => {
  assert.deepEqual(await searchAddresses('Unknown NYC street', { fetcher: async () => response([]) }), []);
  for (const data of [null, {}, { type: 'FeatureCollection', features: {} }, { ...collection([]), geocoding: { errors: ['service failure'] } }]) {
    await assert.rejects(searchAddresses('123 Main Street', { fetcher: async () => ({ ok: true, json: async () => data }) }), /invalid results/);
  }
  await assert.rejects(searchAddresses('123 Main Street', { fetcher: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) }), /invalid results/);
});

test('HTTP and network failures have helpful distinct messages', async () => {
  await assert.rejects(searchAddresses('123 Main Street', { fetcher: async () => ({ ok: false, status: 429 }) }), /busy.*Wait a moment/);
  await assert.rejects(searchAddresses('123 Main Street', { fetcher: async () => ({ ok: false, status: 503 }) }), /temporarily unavailable/);
  await assert.rejects(searchAddresses('123 Main Street', { fetcher: async () => { throw new TypeError('fetch failed'); } }), /Check your connection/);
});

test('canceling a search settles even when its transport ignores abort', async () => {
  const controller = new AbortController();let requestSignal;
  const pending = searchAddresses('123 Main Street', { signal: controller.signal, fetcher: (url, options) => {
    requestSignal = options.signal;return new Promise(() => {});
  } });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(requestSignal.aborted, true);
  let calls = 0;
  await assert.rejects(searchAddresses('123 Main Street', { signal: controller.signal, fetcher: () => { calls++; } }), { name: 'AbortError' });
  assert.equal(calls, 0, 'an already canceled request never reaches the service');
});

test('ten-second timeout includes a stalled JSON body and aborts its transport', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal;
  const pending = searchAddresses('123 Main Street', { fetcher: async (url, options) => {
    requestSignal = options.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  } });
  await Promise.resolve();
  t.mock.timers.tick(10000);
  await assert.rejects(pending, /timed out.*Try again/);
  assert.equal(requestSignal.aborted, true);
});

test('successful lookups release both deadline and external cancellation listeners', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();let requestSignal;
  await searchAddresses('123 Main Street', { signal: controller.signal, fetcher: async (url, options) => {
    requestSignal = options.signal;return response([]);
  } });
  controller.abort();t.mock.timers.tick(10001);
  assert.equal(requestSignal.aborted, false, 'completed searches are detached from later cancellation and timeout');
});
