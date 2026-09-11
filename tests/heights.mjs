import assert from 'node:assert/strict';
import { resolveBuildingHeight, resolveMinHeight } from '../src/buildingHeights.js';

assert.deepEqual(resolveBuildingHeight({ height: 42 }, 200), { height: 42, source: 'overture-height', confidence: 'high' });
assert.deepEqual(resolveBuildingHeight({ num_floors: 10 }, 200), { height: 32, source: 'overture-num-floors', confidence: 'medium' });
const a = resolveBuildingHeight({ subtype: 'residential' }, 500);
const b = resolveBuildingHeight({ subtype: 'residential' }, 500);
assert.deepEqual(a, b, 'visual estimate must be deterministic');
assert.equal(a.source, 'deterministic-visual-estimate');
assert.equal(resolveMinHeight({ min_height: 6 }), 6);
assert.equal(resolveMinHeight({ min_floor: 2 }), 6.4);
console.log('heights: PASS');
