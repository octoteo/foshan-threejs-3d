import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lonLatToWorld, polygonAreaMeters, polygonCentroid } from '../geo.js';
import { resolveBuildingHeight, resolveMinHeight } from '../buildingHeights.js';

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

function shapesFromPolygon(coordinates, originLon, originLat) {
  if (!coordinates?.length) return [];
  const outer = ringToPath(coordinates[0], originLon, originLat, THREE.Shape);
  if (!outer) return [];
  for (let i = 1; i < coordinates.length; i++) {
    const hole = ringToPath(coordinates[i], originLon, originLat, THREE.Path);
    if (hole) outer.holes.push(hole);
  }
  return [outer];
}

function polygonSets(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

export function buildBuildingTile({ features, originLon, originLat, minArea, materials, terrain }) {
  const group = new THREE.Group();
  const batches = new Map();
  const stats = { total: 0, rendered: 0, explicitHeight: 0, floorsHeight: 0, estimatedHeight: 0 };

  for (const feature of features) {
    stats.total++;
    const properties = feature.properties || {};
    for (const polygon of polygonSets(feature.geometry)) {
      const outerRing = polygon[0];
      const area = polygonAreaMeters(outerRing, originLon, originLat);
      if (area < minArea) continue;

      const heightInfo = resolveBuildingHeight(properties, area);
      if (heightInfo.source === 'overture-height') stats.explicitHeight++;
      else if (heightInfo.source === 'overture-num-floors') stats.floorsHeight++;
      else stats.estimatedHeight++;

      const minHeight = resolveMinHeight(properties);
      const shapes = shapesFromPolygon(polygon, originLon, originLat);
      if (!shapes.length) continue;

      const depth = Math.max(1.5, heightInfo.height - minHeight);
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: false,
        curveSegments: 1,
        steps: 1
      });
      geometry.rotateX(-Math.PI / 2);

      const center = polygonCentroid(outerRing);
      const baseElevation = center ? terrain?.sampleHeight(center[0], center[1]) ?? 0 : 0;
      geometry.translate(0, baseElevation + minHeight, 0);
      geometry.computeVertexNormals();

      const material = materials.get(properties, String(properties.__id || ''));
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push(geometry);
      stats.rendered++;
    }
  }

  for (const [material, geometries] of batches) {
    if (!geometries.length) continue;
    let geometry;
    if (geometries.length === 1) geometry = geometries[0];
    else {
      geometry = mergeGeometries(geometries, false);
      for (const source of geometries) source.dispose();
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    group.add(mesh);
  }

  group.userData.stats = stats;
  return group;
}

export function disposeBuildingTile(group) {
  group.traverse(object => {
    if (object.isMesh) object.geometry?.dispose();
  });
}
