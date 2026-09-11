import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const input = args[0];
const output = args[1];
if (!input || !output) {
  console.error('Usage: node tools/build-height-overlay.mjs <input.geojson> <output-dir> [--zoom 14] [--source 3d-globfp] [--height-field height]');
  process.exit(2);
}
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const zoom = Number(arg('--zoom', '14'));
const source = arg('--source', '3d-globfp');
const heightField = arg('--height-field', 'height');
if (!Number.isInteger(zoom) || zoom < 8 || zoom > 17) throw new Error('zoom must be 8..17');

function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor((lon + 180) / 360 * n);
  const r = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n);
  return { x, y };
}
function ringCentroid(ring) {
  if (!ring?.length) return null;
  let lon = 0, lat = 0, n = 0;
  const limit = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.length - 1 : ring.length;
  for (let i = 0; i < limit; i++) { lon += Number(ring[i][0]); lat += Number(ring[i][1]); n++; }
  return n ? [lon / n, lat / n] : null;
}
function centroid(feature) {
  const g = feature?.geometry;
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'Polygon') return ringCentroid(g.coordinates?.[0]);
  if (g.type === 'MultiPolygon') return ringCentroid(g.coordinates?.[0]?.[0]);
  return null;
}
function heightOf(properties = {}) {
  const candidates = [properties[heightField], properties.height, properties.Height, properties.HEIGHT, properties.h, properties.H];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0 && n < 1000) return n;
  }
  return null;
}

const geojson = JSON.parse(await readFile(resolve(input), 'utf8'));
const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
const tiles = new Map();
let accepted = 0;
for (const feature of features) {
  const point = centroid(feature);
  const height = heightOf(feature.properties);
  if (!point || !height) continue;
  const [lon, lat] = point.map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
  const t = lonLatToTile(lon, lat, zoom);
  const key = `${t.x}/${t.y}`;
  if (!tiles.has(key)) tiles.set(key, []);
  tiles.get(key).push([Number(lon.toFixed(7)), Number(lat.toFixed(7)), Number(height.toFixed(2)), source]);
  accepted++;
}
const out = resolve(output);
for (const [key, points] of tiles) {
  const [x, y] = key.split('/');
  const dir = join(out, String(zoom), x);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${y}.json`), JSON.stringify({ z: zoom, x: Number(x), y: Number(y), points }));
}
await mkdir(out, { recursive: true });
await writeFile(join(out, 'manifest.json'), JSON.stringify({
  version: 1, enabled: true, name: `${source} local height overlay`, zoom,
  template: './data/heights/{z}/{x}/{y}.json', source, confidence: 'medium', maxDistanceMeters: 32
}, null, 2));
console.log(`height overlay: ${accepted} features -> ${tiles.size} tiles at z${zoom}`);
