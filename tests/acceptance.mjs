import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, main, readme, acceptance] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../README.md', import.meta.url), 'utf8'),
  readFile(new URL('../ACCEPTANCE.md', import.meta.url), 'utf8'),
]);

assert.match(main, /new TilesRenderer\(/, 'must use a real OGC 3D Tiles renderer');
assert.match(main, /GoogleCloudAuthPlugin/, 'must support Google Photorealistic 3D Tiles');
assert.match(main, /getAttributions/, 'must render dynamic provider attribution');
assert.match(html, /Google Maps/, 'must expose Google Maps brand attribution area');
assert.match(main, /errorTarget:\s*8/, 'ultra preset must request high-detail LOD');
assert.match(main, /sessionStorage/, 'runtime credentials must not be persisted into repository files');
assert.doesNotMatch(main, /fetchOSMScene|createFacadeTexture|overviewBuilding/, 'procedural OSM building fallback is forbidden for photorealistic acceptance');
assert.match(readme, /摄影测量|Photorealistic/i, 'README must document photorealistic data requirements');
assert.match(acceptance, /不通过|PASS|FAIL/, 'acceptance document must define explicit pass/fail criteria');

console.log('Static acceptance contract: PASS');
