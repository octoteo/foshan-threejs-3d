import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lonLatToWorld, polygonAreaMeters, polygonCentroid } from '../geo.js';
import { resolveBuildingHeight, resolveMinHeight, resolveRoofHeight } from '../buildingHeights.js';
import { createFlatRoofGeometry, createPitchedRoofGeometry, normalizedRoofShape } from './roof.js';

function ringToPath(ring, originLon, originLat, PathType) {
  if (!ring?.length) return null;
  const path = new PathType();
  ring.forEach(([lon, lat], index) => {
    const p = lonLatToWorld(lon, lat, originLon, originLat);
    if (index === 0) path.moveTo(p.x, -p.z);
    else path.lineTo(p.x, -p.z);
  });
  return path;
}

function shapeFromPolygon(coordinates, originLon, originLat) {
  if (!coordinates?.length) return null;
  const outer = ringToPath(coordinates[0], originLon, originLat, THREE.Shape);
  if (!outer) return null;
  for (let i = 1; i < coordinates.length; i++) {
    const hole = ringToPath(coordinates[i], originLon, originLat, THREE.Path);
    if (hole) outer.holes.push(hole);
  }
  return outer;
}

function polygonSets(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function normalizeGeometry(geometry) {
  if (!geometry) return null;
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  if (!result.getAttribute('normal')) result.computeVertexNormals();
  if (!result.getAttribute('uv')) {
    const pos = result.getAttribute('position');
    result.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  return result;
}

function addBatch(batches, material, geometry) {
  if (!geometry) return;
  if (!batches.has(material)) batches.set(material, []);
  batches.get(material).push(normalizeGeometry(geometry));
}

function mergeBatch(material, geometries, group, castShadow = false) {
  if (!geometries.length) return;
  let geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
  if (geometries.length > 1) for (const source of geometries) source.dispose();
  if (!geometry) return;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = castShadow;
  mesh.frustumCulled = true;
  group.add(mesh);
}

function equipmentGeometry(centerWorld, top, area, id) {
  if (area < 180) return null;
  let hash = 0;
  for (const c of String(id)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const width = Math.min(8, Math.max(2.2, Math.sqrt(area) * 0.12));
  const depth = width * (0.7 + (hash % 25) / 100);
  const height = 1.3 + ((hash >>> 5) % 17) / 10;
  const g = new THREE.BoxGeometry(width, height, depth);
  g.translate(centerWorld.x + ((hash % 13) - 6) * 0.35, top + height * 0.5 + 0.08, centerWorld.z + (((hash >>> 4) % 13) - 6) * 0.35);
  return g;
}

export function buildBuildingTile({
  features, originLon, originLat, minArea, materials, terrain, overlayResolver = null, detail = 'near'
}) {
  const group = new THREE.Group();
  const facadeBatches = new Map();
  const roofBatches = new Map();
  const equipment = [];
  const pickables = [];
  const stats = {
    total: 0, rendered: 0, explicitHeight: 0, overlayHeight: 0,
    floorsHeight: 0, estimatedHeight: 0, roofs: 0, equipment: 0
  };

  for (const feature of features) {
    stats.total++;
    const properties = feature.properties || {};
    for (const polygon of polygonSets(feature.geometry)) {
      const outerRing = polygon[0];
      if (!outerRing?.length) continue;
      const area = polygonAreaMeters(outerRing, originLon, originLat);
      if (area < minArea) continue;
      const center = polygonCentroid(outerRing);
      if (!center) continue;
      const overlay = overlayResolver?.(center[0], center[1]) || null;
      const heightInfo = resolveBuildingHeight(properties, area, overlay);
      if (heightInfo.source === 'overture-height') stats.explicitHeight++;
      else if (heightInfo.source === 'overture-num-floors') stats.floorsHeight++;
      else if (heightInfo.dataBacked) stats.overlayHeight++;
      else stats.estimatedHeight++;

      const minHeight = resolveMinHeight(properties);
      const shape = shapeFromPolygon(polygon, originLon, originLat);
      if (!shape) continue;
      const baseElevation = terrain?.sampleHeight(center[0], center[1]) ?? 0;
      const roofShape = normalizedRoofShape(properties);
      const roofHeight = detail === 'far' ? 0 : resolveRoofHeight(properties, heightInfo.height);
      const roofBase = Math.max(minHeight + 1.5, heightInfo.height - roofHeight);
      const bodyDepth = Math.max(1.5, roofBase - minHeight);
      const body = new THREE.ExtrudeGeometry(shape, { depth: bodyDepth, bevelEnabled: false, curveSegments: 1, steps: 1 });
      body.rotateX(-Math.PI / 2);
      body.translate(0, baseElevation + minHeight, 0);
      body.computeVertexNormals();

      const id = String(properties.__id || '');
      const facade = materials.getFacade(properties, id, detail);
      addBatch(facadeBatches, facade, body);

      if (detail !== 'far') {
        const roofMaterial = materials.getRoof(properties, id);
        const worldRing = outerRing.map(([lon, lat]) => lonLatToWorld(lon, lat, originLon, originLat));
        let roofGeometry = null;
        if (roofHeight > 0 && polygon.length === 1) {
          roofGeometry = createPitchedRoofGeometry(worldRing, baseElevation + roofBase, roofHeight, roofShape);
        }
        if (!roofGeometry) roofGeometry = createFlatRoofGeometry(shape, baseElevation + heightInfo.height);
        addBatch(roofBatches, roofMaterial, roofGeometry);
        stats.roofs++;

        if (detail === 'near' && roofHeight === 0 && heightInfo.height > 15 && area > 180) {
          const centerWorld = lonLatToWorld(center[0], center[1], originLon, originLat);
          const eq = equipmentGeometry(centerWorld, baseElevation + heightInfo.height, area, id);
          if (eq) { equipment.push(eq); stats.equipment++; }
        }
      }

      if (detail === 'near') {
        const ringWorld = outerRing.map(([lon, lat]) => lonLatToWorld(lon, lat, originLon, originLat));
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of ringWorld) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
        pickables.push({
          ring: ringWorld,
          bbox: { minX, maxX, minZ, maxZ },
          properties,
          center,
          area,
          heightInfo,
          minHeight,
          baseElevation,
          roofShape
        });
      }
      stats.rendered++;
    }
  }

  const castShadow = detail === 'near';
  for (const [material, geometries] of facadeBatches) mergeBatch(material, geometries, group, castShadow);
  for (const [material, geometries] of roofBatches) mergeBatch(material, geometries, group, castShadow);
  if (equipment.length) mergeBatch(materials.equipment, equipment.map(normalizeGeometry), group, true);

  group.userData.stats = stats;
  group.userData.pickables = pickables;
  group.userData.detail = detail;
  return group;
}

export function disposeBuildingTile(group) {
  group.traverse(object => {
    if (object.isMesh) object.geometry?.dispose();
  });
}
