import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const paths = [
  'index.html', 'package.json', 'package-lock.json', 'vite.config.js', 'src/main.js', 'src/config.js',
  'src/providers/overtureBuildings.js', 'src/providers/terrain.js', 'src/providers/buildingTiles.js',
  'src/providers/heightOverlay.js', 'src/render/buildingTile.js', 'src/render/materials.js', 'README.md', 'ACCEPTANCE.md'
];
const files = await Promise.all(paths.map(async path => [path, await readFile(new URL(`../${path}`, import.meta.url), 'utf8')]));
const all = files.map(([, s]) => s).join('\n');
const runtime = files.filter(([path]) => path.startsWith('src/') || path === 'index.html').map(([, s]) => s).join('\n');
const lock = JSON.parse(files.find(([path]) => path === 'package-lock.json')[1]);
assert.equal(lock.lockfileVersion, 3, 'npm lockfile v3');
assert.ok(lock.packages?.['']?.dependencies?.three === '0.186.0', 'locked Three.js');
assert.ok(lock.packages?.['']?.devDependencies?.vite === '8.2.2', 'locked Vite');
assert.ok(all.includes('2026-08-19.0'), 'pinned Overture release');
assert.ok(all.includes('buildings.pmtiles'), 'Overture PMTiles default');
assert.ok(all.includes('Terrarium'), 'real terrain');
assert.ok(all.includes('heightOverlay') || all.includes('height overlay'), 'height overlay integration');
assert.ok(all.includes('roof_shape'), 'roof attribute support');
assert.ok(all.includes('data-inspector'), 'building inspector');
assert.ok(all.includes("Math.min(14, quality.maxBuildingZoom)"), 'z14 full-footprint policy');
assert.ok(all.includes("dataset.appReady = 'true'"), 'explicit app readiness gate');
assert.ok(all.includes('npm ci'), 'deterministic install path');
assert.ok(!all.includes('type="importmap"'), 'no runtime CDN import map');
assert.ok(!/overpass-api|Overpass|api\/interpreter/i.test(runtime), 'no Overpass default building path');
assert.ok(!all.includes('Math.random'), 'no random building height/detail generation');
console.log('acceptance: PASS');
