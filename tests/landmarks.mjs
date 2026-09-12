import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildReferenceLandmark, REFERENCE_LANDMARK_IDS } from '../src/stage2/referenceLandmarks.js';
import { STAGE2_LANDMARKS } from '../src/stage2/landmarks.js';

const manifest = JSON.parse(fs.readFileSync('public/assets/landmarks/manifest.json', 'utf8'));
assert.equal(REFERENCE_LANDMARK_IDS.length, 5, 'five reference landmark generators must ship in Stage 2');
assert.equal(manifest.models.length, 5, 'five delivered landmark reconstructions must be registered');
assert.equal(STAGE2_LANDMARKS.filter(item => item.model === 'reference-reconstruction').length, 5, 'navigation must mark five delivered reconstructions');
assert.ok(STAGE2_LANDMARKS.length >= 12, 'Stage 2 must expose at least twelve landmark targets');

const expectations = {
  centuryLotus: { triangles: 4000, minWidth: 300, minHeight: 44 },
  lingnanPearl: { triangles: 8000, minWidth: 190, minHeight: 34 },
  shunfengGate: { triangles: 1500, minWidth: 88, minHeight: 35 },
  nanfengKiln: { triangles: 900, minWidth: 40, minHeight: 25 },
  foshanGrandTheatre: { triangles: 1800, minWidth: 70, minHeight: 33 }
};

for (const id of REFERENCE_LANDMARK_IDS) {
  const group = buildReferenceLandmark(id);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const rule = expectations[id];
  assert.ok(group.userData.referenceReconstruction, `${id}: fidelity marker missing`);
  assert.ok(group.userData.triangles >= rule.triangles, `${id}: geometry budget too low (${group.userData.triangles})`);
  assert.ok(group.children.length <= 16, `${id}: draw-call batch budget exceeded (${group.children.length})`);
  assert.ok(Math.max(size.x, size.z) >= rule.minWidth, `${id}: footprint scale regressed (${size.x.toFixed(1)} x ${size.z.toFixed(1)}m)`);
  assert.ok(size.y >= rule.minHeight, `${id}: height scale regressed (${size.y.toFixed(1)}m)`);
  console.log(`landmark ${id}: triangles=${group.userData.triangles} batches=${group.children.length} size=${size.x.toFixed(1)}x${size.z.toFixed(1)}x${size.y.toFixed(1)}m`);
  group.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material?.dispose?.());
  });
}

for (const model of manifest.models) {
  assert.equal(model.fidelity, 'reference-reconstruction', `${model.id}: fidelity must be explicit`);
  assert.ok(model.generator, `${model.id}: generator missing`);
  assert.ok(Number.isFinite(model.lon) && Number.isFinite(model.lat), `${model.id}: WGS84 coordinate missing`);
  assert.ok(model.documentedDimensions, `${model.id}: dimensional basis missing`);
}

console.log('landmarks: PASS');
