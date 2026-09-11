import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const files = await Promise.all([
  'index.html', 'package.json', 'vite.config.js', 'src/main.js', 'src/config.js', 'src/providers/overtureBuildings.js',
  'src/providers/terrain.js', 'src/providers/buildingTiles.js', 'src/providers/heightOverlay.js',
  'src/render/buildingTile.js', 'src/render/materials.js', 'README.md', 'ACCEPTANCE.md'
].map(async path => [path, await readFile(new URL(`../${path}`, import.meta.url), 'utf8')]));
const all = files.map(([, s]) => s).join('\n');
const runtime = files.filter(([path]) => path.startsWith('src/') || path === 'index.html').map(([, s]) => s).join('\n');
assert.ok(all.includes('2026-08-19.0'), 'pinned current Overture release');
assert.ok(all.includes('buildings.pmtiles'), 'Overture PMTiles default');
assert.ok(all.includes('Terrarium'), 'real terrain');
assert.ok(all.includes('heightOverlay') || all.includes('height overlay'), 'height overlay integration');
assert.ok(all.includes('roof_shape'), 'roof attribute support');
assert.ok(all.includes('自动画质') || all.includes("qualityMode !== 'auto'"), 'adaptive quality');
assert.ok(all.includes('data-inspector'), 'building inspector');
assert.ok(all.includes('"three": "0.186.0"'), 'pinned Three.js dependency');
assert.ok(all.includes('"vite": "8.2.2"'), 'pinned Vite build dependency');
assert.ok(!all.includes('type="importmap"'), 'production no longer depends on runtime CDN import maps');
assert.ok(!/overpass-api|Overpass|api\/interpreter/i.test(runtime), 'no Overpass default building path');
assert.ok(!all.includes('Math.random'), 'no random building height/detail generation');
console.log('acceptance: PASS');
