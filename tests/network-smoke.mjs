import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { lonLatToTile } from '../src/geo.js';

const BUILDINGS_URL = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-08-19.0/buildings.pmtiles';
const urls = [
  ['Overture PMTiles', BUILDINGS_URL, { headers: { Range: 'bytes=0-16383' } }],
  ['Foshan Terrarium', 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/6670/3553.png', {}],
  ['Foshan EOX imagery', 'https://e.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/13/3553/6670.jpg', {}]
];
for (const [name, url, options] of urls) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok && response.status !== 206) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 16) throw new Error(`${name}: empty response`);
    console.log(`network: ${name} PASS (${response.status}, ${bytes.length} bytes)`);
  } finally { clearTimeout(timer); }
}

const archive = new PMTiles(BUILDINGS_URL);
const coord = lonLatToTile(113.1214, 23.0218, 14);
const response = await archive.getZxy(14, coord.x, coord.y);
if (!response?.data) throw new Error(`Overture z14 Foshan tile ${coord.x}/${coord.y} is empty`);
const vectorTile = new VectorTile(new PbfReader(response.data));
const layerNames = Object.keys(vectorTile.layers);
console.log(`overture-decode: layers=${layerNames.join(',')}`);
let featureCount = 0;
let polygonCount = 0;
for (const layerName of ['building', 'building_part']) {
  const layer = vectorTile.layers[layerName];
  if (!layer) continue;
  featureCount += layer.length;
  for (let i = 0; i < layer.length; i++) {
    const geo = layer.feature(i).toGeoJSON(coord.x, coord.y, 14);
    if (geo.geometry?.type === 'Polygon' || geo.geometry?.type === 'MultiPolygon') polygonCount++;
  }
}
console.log(`overture-decode: Foshan z14 ${coord.x}/${coord.y} features=${featureCount} polygons=${polygonCount}`);
if (featureCount <= 0 || polygonCount <= 0) throw new Error('Overture z14 Foshan tile did not decode building polygons');
console.log('network: Overture Foshan z14 polygon decode PASS');
