import assert from 'node:assert/strict';
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { lonLatToTile } from '../src/geo.js';
import { OVERTURE_BASE_URL, OVERTURE_BUILDINGS_URL, OVERTURE_TRANSPORTATION_URL } from '../src/config.js';

const styleUrl = 'https://tiles.openfreemap.org/styles/liberty';
const styleResponse = await fetch(styleUrl, { signal: AbortSignal.timeout(15000) });
assert.equal(styleResponse.ok, true, `OpenFreeMap style failed: ${styleResponse.status}`);
const style = await styleResponse.json();
const sourceLayers = new Set((style.layers || []).map(layer => layer['source-layer']).filter(Boolean));
assert.ok(sourceLayers.has('transportation'), 'OpenFreeMap style must expose transportation geometry');
assert.ok(sourceLayers.has('water') || sourceLayers.has('waterway'), 'OpenFreeMap style must expose water geometry');
console.log(`stage2-network: OpenFreeMap style PASS layers=${style.layers?.length || 0}`);

for (const [name, url] of [
  ['buildings', OVERTURE_BUILDINGS_URL],
  ['base', OVERTURE_BASE_URL],
  ['transportation', OVERTURE_TRANSPORTATION_URL]
]) {
  const response = await fetch(url, { headers: { Range: 'bytes=0-16383' }, signal: AbortSignal.timeout(15000) });
  assert.ok(response.status === 206 || response.status === 200, `Overture ${name} range failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  assert.ok(bytes.byteLength >= 16, `Overture ${name} returned empty range`);
  console.log(`stage2-network: Overture ${name} PASS status=${response.status} bytes=${bytes.byteLength}`);
}

async function decodeCenter(url, zoom, layerName) {
  const tile = lonLatToTile(113.1214, 23.0218, zoom);
  const archive = new PMTiles(url);
  const response = await archive.getZxy(zoom, tile.x, tile.y);
  assert.ok(response?.data, `${layerName} Foshan z${zoom} tile missing`);
  const vector = new VectorTile(new PbfReader(response.data));
  const layer = vector.layers[layerName];
  assert.ok(layer, `${layerName} source-layer missing; got ${Object.keys(vector.layers).join(',')}`);
  return { layer, tile };
}

let roadCount = 0;
for (const zoom of [10, 11, 12]) {
  const { layer } = await decodeCenter(OVERTURE_TRANSPORTATION_URL, zoom, 'segment');
  for (let i = 0; i < layer.length; i++) {
    if (layer.feature(i).properties?.subtype === 'road') roadCount++;
  }
  if (roadCount > 0) break;
}
assert.ok(roadCount > 0, 'Foshan transportation PMTiles did not decode any road segments');
console.log(`stage2-network: Foshan real road segments PASS count=${roadCount}`);

let waterCount = 0;
for (const zoom of [9, 10, 11, 12]) {
  const { layer } = await decodeCenter(OVERTURE_BASE_URL, zoom, 'water');
  waterCount += layer.length;
  if (waterCount > 0) break;
}
assert.ok(waterCount > 0, 'Foshan base PMTiles did not decode any water features');
console.log(`stage2-network: Foshan real water features PASS count=${waterCount}`);

const dem = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/10/833/447.png';
const terrain = await fetch(dem, { signal: AbortSignal.timeout(15000) });
assert.equal(terrain.ok, true, `Terrarium failed: ${terrain.status}`);
console.log('stage2-network: Terrarium PASS');

const imagery = 'https://e.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/10/447/833.jpg';
const imageResponse = await fetch(imagery, { signal: AbortSignal.timeout(15000) });
assert.equal(imageResponse.ok, true, `EOX imagery failed: ${imageResponse.status}`);
console.log('stage2-network: EOX imagery PASS');
