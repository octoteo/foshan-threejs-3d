import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const roof = await readFile(new URL('../src/render/roof.js', import.meta.url), 'utf8');
for (const token of ['dome', 'cone', 'pyramid', 'hip', 'gable', 'mansard', 'skillion', 'createPitchedRoofGeometry']) assert.ok(roof.includes(token), token);
assert.ok(!roof.includes('Math.random'));
console.log('roof: PASS');
