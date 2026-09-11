import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { lonLatToTile, polygonAreaMeters } from '../src/geo.js';
import { OvertureBuildingsProvider } from '../src/providers/overtureBuildings.js';
import { BuildingMaterialLibrary } from '../src/render/materials.js';
import { buildBuildingTile, disposeBuildingTile } from '../src/render/buildingTile.js';

const BUILDINGS_URL = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-08-19.0/buildings.pmtiles';
const urls = [
  ['Overture PMTiles', BUILDINGS_URL, { headers: { Range: 'bytes=0-16383' } }],
  ['Foshan Terrarium', 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/6670/3553.png', {}],
  ['Foshan EOX imagery', 'https://e.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/13/3553/6670.jpg', {}]
];
for (const [name, url, options] of urls) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok && response.status !== 206) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 16) throw new Error(`${name}: empty response`);
    console.log(`network: ${name} PASS (${response.status}, ${bytes.length} bytes)`);
  } finally { clearTimeout(timer); }
}

const coord = lonLatToTile(113.1214, 23.0218, 14);
const archive = new PMTiles(BUILDINGS_URL);
const response = await archive.getZxy(14, coord.x, coord.y);
if (!response?.data) throw new Error(`Overture z14 Foshan tile ${coord.x}/${coord.y} is empty`);
const vectorTile = new VectorTile(new PbfReader(response.data));
const layerNames = Object.keys(vectorTile.layers);
console.log(`overture-decode: layers=${layerNames.join(',')}`);
let rawFeatureCount = 0;
let polygonCount = 0;
const rawLayer = vectorTile.layers.building;
if (rawLayer?.length) {
  const sample = rawLayer.feature(0).properties || {};
  console.log(`overture-decode: sample is_underground=${JSON.stringify(sample.is_underground)} (${typeof sample.is_underground}), has_parts=${JSON.stringify(sample.has_parts)} (${typeof sample.has_parts})`);
}
for (const layerName of ['building', 'building_part']) {
  const layer = vectorTile.layers[layerName];
  if (!layer) continue;
  rawFeatureCount += layer.length;
  for (let i = 0; i < layer.length; i++) {
    const geo = layer.feature(i).toGeoJSON(coord.x, coord.y, 14);
    if (geo.geometry?.type === 'Polygon' || geo.geometry?.type === 'MultiPolygon') polygonCount++;
  }
}
console.log(`overture-decode: Foshan z14 ${coord.x}/${coord.y} raw=${rawFeatureCount} polygons=${polygonCount}`);
if (rawFeatureCount <= 0 || polygonCount <= 0) throw new Error('Overture z14 Foshan tile did not decode building polygons');

const provider = new OvertureBuildingsProvider(BUILDINGS_URL);
await provider.init();
const features = await provider.getFeatures(14, coord.x, coord.y);
console.log(`overture-provider: emitted=${features.length}`);
if (!features.length) throw new Error('OvertureBuildingsProvider filtered every Foshan building');
let polygonSets = 0;
let eligible55 = 0;
let eligible220 = 0;
let maxArea = 0;
for (const feature of features) {
  const sets = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
  for (const polygon of sets) {
    const area = polygonAreaMeters(polygon?.[0], 113.1214, 23.0218);
    if (!Number.isFinite(area)) continue;
    polygonSets++;
    maxArea = Math.max(maxArea, area);
    if (area >= 55) eligible55++;
    if (area >= 220) eligible220++;
  }
}
console.log(`overture-geometry: polygonSets=${polygonSets} >=55m2=${eligible55} >=220m2=${eligible220} maxArea=${maxArea.toFixed(1)}m2`);
if (eligible220 <= 0) throw new Error('Foshan tile has no building footprints above far-LOD area threshold');

const materials = new BuildingMaterialLibrary(null);
const group = buildBuildingTile({
  features,
  originLon: 113.1214,
  originLat: 23.0218,
  minArea: 220,
  materials,
  terrain: { sampleHeight: () => 0 },
  overlayResolver: null,
  detail: 'far'
});
const renderStats = group.userData.stats;
console.log(`overture-render: rendered=${renderStats.rendered} childMeshes=${group.children.length}`);
if (renderStats.rendered <= 0 || group.children.length <= 0) throw new Error('buildBuildingTile failed to create Foshan Three.js meshes');
disposeBuildingTile(group);
materials.dispose();
console.log('network: Overture Foshan decode + provider + Three.js geometry PASS');
