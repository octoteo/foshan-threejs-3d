import * as THREE from 'three';

function cleanRing(points) {
  if (!points?.length) return [];
  const out = points.slice();
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) out.pop();
  }
  return out;
}

function isConvex(points) {
  if (points.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-7) continue;
    const next = Math.sign(cross);
    if (!sign) sign = next;
    else if (next !== sign) return false;
  }
  return true;
}

function centroid(points) {
  let x = 0, z = 0;
  for (const p of points) { x += p.x; z += p.z; }
  return { x: x / points.length, z: z / points.length };
}

function normalizeGeometry(geometry) {
  let result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  if (!result.getAttribute('normal')) result.computeVertexNormals();
  if (!result.getAttribute('uv')) {
    const pos = result.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) * 0.02;
      uv[i * 2 + 1] = pos.getZ(i) * 0.02;
    }
    result.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  return result;
}

export function normalizedRoofShape(properties = {}) {
  const value = String(properties.roof_shape || '').toLowerCase();
  if (/dome|onion/.test(value)) return 'dome';
  if (/cone/.test(value)) return 'cone';
  if (/pyramid|hip|gable|mansard|skillion/.test(value)) return value || 'pitched';
  return 'flat';
}

export function createFlatRoofGeometry(shape, elevation) {
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, elevation + 0.04, 0);
  geometry.computeVertexNormals();
  return normalizeGeometry(geometry);
}

export function createPitchedRoofGeometry(worldRing, baseElevation, roofHeight, roofShape = 'pyramid') {
  const points = cleanRing(worldRing);
  if (points.length < 3 || points.length > 40 || !isConvex(points)) return null;
  const c = centroid(points);
  const positions = [];
  const indices = [];
  const ringCount = points.length;

  if (roofShape === 'dome' && ringCount <= 20) {
    for (const p of points) positions.push(p.x, baseElevation, p.z);
    const innerStart = positions.length / 3;
    for (const p of points) positions.push(c.x + (p.x - c.x) * 0.48, baseElevation + roofHeight * 0.68, c.z + (p.z - c.z) * 0.48);
    const centerIndex = positions.length / 3;
    positions.push(c.x, baseElevation + roofHeight, c.z);
    for (let i = 0; i < ringCount; i++) {
      const j = (i + 1) % ringCount;
      indices.push(i, j, innerStart + i, j, innerStart + j, innerStart + i);
      indices.push(innerStart + i, innerStart + j, centerIndex);
    }
  } else {
    for (const p of points) positions.push(p.x, baseElevation, p.z);
    const centerIndex = positions.length / 3;
    const apexHeight = roofShape === 'mansard' ? roofHeight * 0.82 : roofHeight;
    positions.push(c.x, baseElevation + apexHeight, c.z);
    for (let i = 0; i < ringCount; i++) indices.push(i, (i + 1) % ringCount, centerIndex);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return normalizeGeometry(geometry);
}
