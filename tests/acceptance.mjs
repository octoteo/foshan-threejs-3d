import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = await Promise.all([
  readFile(new URL('../src/config.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/providers/overtureBuildings.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/providers/terrain.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/buildingHeights.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8')
]);
const text = files.join('\n');

assert.match(text, /overturemaps-extras-us-west-2/);
assert.match(text, /buildings\.pmtiles/);
assert.match(text, /elevation-tiles-prod\/terrarium/);
assert.match(text, /s2cloudless_3857/);
assert.match(text, /deterministic-visual-estimate/);
assert.doesNotMatch(text, /overpass-api|Overpass|randomBuilding|Math\.random\(\).*height/i);
assert.doesNotMatch(text, /GoogleCloudAuthPlugin/);
console.log('acceptance: PASS');
