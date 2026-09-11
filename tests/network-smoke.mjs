import assert from 'node:assert/strict';
import { OVERTURE_BUILDINGS_URL, TERRARIUM_TEMPLATE, IMAGERY_PROVIDERS } from '../src/config.js';
import { lonLatToTile, templateUrl } from '../src/geo.js';

const FOSHAN = [113.1214, 23.0218];

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function retry(fn, attempts = 3) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (error) { last = error; }
    await new Promise(resolve => setTimeout(resolve, 700 * (i + 1)));
  }
  throw last;
}

await retry(async () => {
  const response = await fetchWithTimeout(OVERTURE_BUILDINGS_URL, { headers: { Range: 'bytes=0-126' } });
  assert.ok(response.ok, `Overture HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const magic = new TextDecoder().decode(bytes.slice(0, 7));
  assert.equal(magic, 'PMTiles', 'Overture endpoint is not a PMTiles archive');
});
console.log('network: Overture PMTiles PASS');

const z = 13;
const { x, y } = lonLatToTile(FOSHAN[0], FOSHAN[1], z);

await retry(async () => {
  const url = templateUrl(TERRARIUM_TEMPLATE, z, x, y);
  const response = await fetchWithTimeout(url);
  assert.ok(response.ok, `Terrarium HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') || '', /image\/png|application\/octet-stream/i);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.byteLength > 1000, 'Terrarium tile is unexpectedly small');
});
console.log('network: Foshan Terrarium PASS');

await retry(async () => {
  const provider = IMAGERY_PROVIDERS.eox2016;
  const url = provider.template.replace('{z}', z).replace('{y}', y).replace('{x}', x);
  const response = await fetchWithTimeout(url);
  assert.ok(response.ok, `EOX HTTP ${response.status}`);
  assert.match(response.headers.get('content-type') || '', /image\/jpeg|image\/jpg|application\/octet-stream/i);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.byteLength > 1000, 'EOX imagery tile is unexpectedly small');
});
console.log('network: Foshan EOX imagery PASS');
