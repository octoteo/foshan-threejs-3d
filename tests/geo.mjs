import assert from 'node:assert/strict';
import { lonLatToWorld, worldToLonLat, lonLatToTile, tileBounds, polygonAreaMeters } from '../src/geo.js';

const origin = [113.1214, 23.0218];
const p = lonLatToWorld(113.2930, 22.8062, ...origin);
const ll = worldToLonLat(p.x, p.z, ...origin);
assert.ok(Math.abs(ll.lon - 113.2930) < 1e-8);
assert.ok(Math.abs(ll.lat - 22.8062) < 1e-8);

const tile = lonLatToTile(origin[0], origin[1], 14);
const bounds = tileBounds(tile.x, tile.y, tile.z);
assert.ok(origin[0] >= bounds.west && origin[0] <= bounds.east);
assert.ok(origin[1] >= bounds.south && origin[1] <= bounds.north);

const area = polygonAreaMeters([[113.12,23.02],[113.121,23.02],[113.121,23.021],[113.12,23.021],[113.12,23.02]], ...origin);
assert.ok(area > 10000 && area < 13000);
console.log('geo: PASS');
