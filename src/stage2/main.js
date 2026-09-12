import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PMTiles, Protocol } from 'pmtiles';
import {
  FOSHAN,
  OVERTURE_BASE_URL,
  OVERTURE_BUILDINGS_URL,
  OVERTURE_RELEASE,
  OVERTURE_TRANSPORTATION_URL,
  TERRARIUM_TEMPLATE,
  IMAGERY_PROVIDERS
} from '../config.js';
import { STAGE2_LANDMARKS } from './landmarks.js';
import './styles.css';

const $ = selector => document.querySelector(selector);
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
for (const url of [OVERTURE_BASE_URL, OVERTURE_TRANSPORTATION_URL, OVERTURE_BUILDINGS_URL]) {
  protocol.add(new PMTiles(url));
}

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const LANDMARK_MANIFEST = './assets/landmarks/manifest.json';
const HEIGHT_EXPR = ['case', ['has', 'height'], ['to-number', ['get', 'height'], 12], ['has', 'num_floors'], ['*', ['to-number', ['get', 'num_floors'], 4], 3.2], 12];
const BASE_EXPR = ['case', ['has', 'min_height'], ['to-number', ['get', 'min_height'], 0], 0];
const ROAD_CLASS_WIDTH_NEAR = ['match', ['get', 'class'], 'motorway', 9, 'trunk', 8, 'primary', 7, 'secondary', 6, 'tertiary', 5, 'residential', 3.4, 'living_street', 2.8, 'service', 2.3, 'footway', 1.3, 2];
const ROAD_CLASS_WIDTH_FAR = ['match', ['get', 'class'], 'motorway', 2.5, 'trunk', 2.2, 'primary', 1.8, 'secondary', 1.4, 'tertiary', 1.0, 0.55];
const ROAD_WIDTH = ['interpolate', ['linear'], ['zoom'], 6, ROAD_CLASS_WIDTH_FAR, 15, ROAD_CLASS_WIDTH_NEAR, 19, ['*', ROAD_CLASS_WIDTH_NEAR, 1.8]];
const ROAD_COLOR = ['match', ['get', 'class'], 'motorway', '#f8c66a', 'trunk', '#f1bd6e', 'primary', '#f7dfad', 'secondary', '#f5e9cd', 'tertiary', '#f2eee1', '#ffffff'];
const queryMode = new URLSearchParams(location.search).get('mode');
let mode = queryMode === '3d' ? '3d' : '2d';
let overlaysInstalled = false;
let coreSourcesInstalled = false;
let appReady = false;
let landmarksRendered = false;
let landmarkLayerPromise = null;
let lastFrameAt = performance.now();
let frameCount = 0;
let readyTimer = null;

window.__foshanErrors = [];
window.addEventListener('error', event => window.__foshanErrors.push(event.message || 'error'));
window.addEventListener('unhandledrejection', event => window.__foshanErrors.push(String(event.reason?.message || event.reason || 'rejection')));
document.documentElement.dataset.mapEngine = 'maplibre';
document.documentElement.dataset.mapMode = mode;
document.documentElement.dataset.appVersion = '2.0.0-beta.2';
document.documentElement.dataset.mapFacts = 'loading';
document.documentElement.dataset.protocolArchives = '3';

function setStatus(text, tone = '') {
  const node = $('#status');
  node.textContent = text;
  node.dataset.tone = tone;
}

function firstSymbolLayerId() {
  return map.getStyle().layers?.find(layer => layer.type === 'symbol')?.id;
}

function firstNonBackgroundLayerId() {
  return map.getStyle().layers?.find(layer => layer.type !== 'background')?.id;
}

function hideBasemapFacts() {
  const owned = new Set(['building', 'transportation', 'transportation_name', 'water', 'waterway', 'water_name']);
  for (const layer of map.getStyle().layers || []) {
    if (owned.has(layer['source-layer'])) {
      try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch { /* style can change underneath us */ }
    }
  }
}

function addImageryBase() {
  const imagery = IMAGERY_PROVIDERS.eox2016;
  if (!map.getSource('foshan-imagery')) {
    map.addSource('foshan-imagery', {
      type: 'raster', tiles: [imagery.template], tileSize: 256,
      minzoom: imagery.minZoom, maxzoom: imagery.maxZoom,
      attribution: imagery.attribution
    });
  }
  if (!map.getLayer('foshan-imagery')) {
    map.addLayer({
      id: 'foshan-imagery', type: 'raster', source: 'foshan-imagery',
      paint: { 'raster-opacity': 0.72, 'raster-saturation': -0.22, 'raster-contrast': -0.08, 'raster-brightness-min': 0.08, 'raster-brightness-max': 0.96 }
    }, firstNonBackgroundLayerId());
  }
}

function addOvertureMapFacts() {
  if (!map.getSource('overture-base')) {
    map.addSource('overture-base', {
      type: 'vector', url: `pmtiles://${OVERTURE_BASE_URL}`,
      attribution: 'Base geography © OpenStreetMap contributors, Overture Maps Foundation'
    });
  }
  if (!map.getSource('overture-transportation')) {
    map.addSource('overture-transportation', {
      type: 'vector', url: `pmtiles://${OVERTURE_TRANSPORTATION_URL}`,
      attribution: 'Transportation © OpenStreetMap contributors, Overture Maps Foundation'
    });
  }
  const before = firstSymbolLayerId();
  if (!map.getLayer('overture-water-fill')) {
    map.addLayer({
      id: 'overture-water-fill', type: 'fill', source: 'overture-base', 'source-layer': 'water',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#79bddd', 'fill-opacity': 0.78 }
    }, before);
  }
  if (!map.getLayer('overture-water-line')) {
    map.addLayer({
      id: 'overture-water-line', type: 'line', source: 'overture-base', 'source-layer': 'water', minzoom: 9,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#5aadd2', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.0, 15, 3.2], 'line-opacity': 0.92 }
    }, before);
  }
  if (!map.getLayer('overture-rail')) {
    map.addLayer({
      id: 'overture-rail', type: 'line', source: 'overture-transportation', 'source-layer': 'segment', minzoom: 8,
      filter: ['==', ['get', 'subtype'], 'rail'],
      paint: { 'line-color': '#59646a', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 16, 2.2], 'line-dasharray': [2, 1.5], 'line-opacity': 0.7 }
    }, before);
  }
  if (!map.getLayer('overture-road-casing')) {
    map.addLayer({
      id: 'overture-road-casing', type: 'line', source: 'overture-transportation', 'source-layer': 'segment', minzoom: 4,
      filter: ['==', ['get', 'subtype'], 'road'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#6c777d', 'line-width': ['+', ROAD_WIDTH, 1.4], 'line-opacity': 0.7 }
    }, before);
  }
  if (!map.getLayer('overture-road-line')) {
    map.addLayer({
      id: 'overture-road-line', type: 'line', source: 'overture-transportation', 'source-layer': 'segment', minzoom: 4,
      filter: ['==', ['get', 'subtype'], 'road'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ROAD_COLOR, 'line-width': ROAD_WIDTH, 'line-opacity': 0.96 }
    }, before);
  }
  if (!map.getLayer('overture-road-name')) {
    map.addLayer({
      id: 'overture-road-name', type: 'symbol', source: 'overture-transportation', 'source-layer': 'segment', minzoom: 11,
      filter: ['all', ['==', ['get', 'subtype'], 'road'], ['has', '@name']],
      layout: {
        'symbol-placement': 'line', 'text-field': ['get', '@name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 17, 13],
        'text-font': ['Noto Sans Regular'], 'text-max-angle': 30, 'text-padding': 3
      },
      paint: { 'text-color': '#33434d', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.4 }
    });
  }
}

function addOvertureBuildings() {
  if (!map.getSource('overture-buildings')) {
    map.addSource('overture-buildings', {
      type: 'vector', url: `pmtiles://${OVERTURE_BUILDINGS_URL}`,
      attribution: 'Buildings © OpenStreetMap contributors, Overture Maps Foundation'
    });
  }
  const before = firstSymbolLayerId();
  if (!map.getLayer('overture-building-2d')) {
    map.addLayer({
      id: 'overture-building-2d', type: 'fill', source: 'overture-buildings', 'source-layer': 'building', minzoom: 13,
      paint: { 'fill-color': ['case', ['boolean', ['get', 'has_parts'], false], '#d7d0c7', '#d1c9be'], 'fill-opacity': 0.62, 'fill-outline-color': '#9f9a94' }
    }, before);
  }
  if (!map.getLayer('overture-building-3d')) {
    map.addLayer({
      id: 'overture-building-3d', type: 'fill-extrusion', source: 'overture-buildings', 'source-layer': 'building', minzoom: 13,
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], HEIGHT_EXPR, 0, '#d8d1c8', 35, '#c6c2bc', 90, '#b9bec3', 180, '#aeb9c5'],
        'fill-extrusion-height': HEIGHT_EXPR, 'fill-extrusion-base': BASE_EXPR,
        'fill-extrusion-opacity': 0.92, 'fill-extrusion-vertical-gradient': true
      }
    }, before);
  }
  if (!map.getLayer('overture-building-parts-3d')) {
    map.addLayer({
      id: 'overture-building-parts-3d', type: 'fill-extrusion', source: 'overture-buildings', 'source-layer': 'building_part', minzoom: 14,
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': '#c7c6c3', 'fill-extrusion-height': HEIGHT_EXPR, 'fill-extrusion-base': BASE_EXPR,
        'fill-extrusion-opacity': 0.95, 'fill-extrusion-vertical-gradient': true
      }
    }, before);
  }
}

function addTerrain() {
  if (!map.getSource('foshan-dem')) {
    map.addSource('foshan-dem', {
      type: 'raster-dem', tiles: [TERRARIUM_TEMPLATE], tileSize: 256, maxzoom: 15, encoding: 'terrarium',
      attribution: 'Terrain Tiles / Mapzen'
    });
  }
}

async function installLandmarkLayerIfNeeded() {
  if (landmarkLayerPromise || map.getLayer('foshan-landmark-models')) return landmarkLayerPromise;
  landmarkLayerPromise = (async () => {
    try {
      const response = await fetch(LANDMARK_MANIFEST, { cache: 'no-cache' });
      if (!response.ok) return;
      const manifest = await response.json();
      const models = Array.isArray(manifest.models) ? manifest.models : [];
      document.documentElement.dataset.landmarkModels = String(models.length);
      if (!models.length || map.getLayer('foshan-landmark-models')) return;
      const { LandmarkThreeLayer } = await import('./landmarkLayer.js');
      if (!map.getLayer('foshan-landmark-models')) map.addLayer(new LandmarkThreeLayer({ manifest }));
    } catch (error) {
      console.warn('Landmark model layer unavailable', error);
    }
  })().finally(() => { landmarkLayerPromise = null; });
  return landmarkLayerPromise;
}

function syncModeLayers(animate = true) {
  if (!overlaysInstalled) return;
  const is3d = mode === '3d';
  map.setLayoutProperty('overture-building-2d', 'visibility', is3d ? 'none' : 'visible');
  map.setLayoutProperty('overture-building-3d', 'visibility', is3d ? 'visible' : 'none');
  map.setLayoutProperty('overture-building-parts-3d', 'visibility', is3d ? 'visible' : 'none');
  map.setTerrain(is3d ? { source: 'foshan-dem', exaggeration: 1 } : null);
  const camera = is3d
    ? { pitch: 58, bearing: -18, zoom: Math.max(13.8, map.getZoom()) }
    : { pitch: 0, bearing: 0, zoom: Math.min(15.2, map.getZoom()) };
  animate ? map.easeTo({ ...camera, duration: 850 }) : map.jumpTo(camera);
  $('#mode2dBtn').classList.toggle('active', !is3d);
  $('#mode3dBtn').classList.toggle('active', is3d);
  $('#modeBadge').textContent = is3d ? '3D 城市' : '2D 地图';
  document.documentElement.dataset.mapMode = mode;
}

function countVisibleFacts() {
  let roads = 0;
  let water = 0;
  let buildings = 0;
  try { roads = map.queryRenderedFeatures({ layers: ['overture-road-line'] }).length; } catch { /* not ready yet */ }
  try { water = map.queryRenderedFeatures({ layers: ['overture-water-fill', 'overture-water-line'] }).length; } catch { /* not ready yet */ }
  try { buildings = map.queryRenderedFeatures({ layers: ['overture-building-3d', 'overture-building-parts-3d'] }).length; } catch { /* not ready yet */ }
  document.documentElement.dataset.roadFeatures = String(roads);
  document.documentElement.dataset.waterFeatures = String(water);
  if (mode === '3d') document.documentElement.dataset.threeDBuildings = buildings > 0 ? 'visible' : 'loading';
  return { roads, water, buildings };
}

function coreSourcesLoaded() {
  const ids = ['foshan-imagery', 'overture-base', 'overture-transportation'];
  return ids.every(id => map.getSource(id) && map.isSourceLoaded(id));
}

function checkReady() {
  if (!coreSourcesInstalled || appReady || !coreSourcesLoaded()) return;
  const facts = countVisibleFacts();
  if (facts.roads <= 0) return;
  appReady = true;
  document.documentElement.dataset.mapFacts = 'ready';
  document.documentElement.dataset.buildingSource = 'ready';
  document.documentElement.dataset.appReady = 'true';
  setStatus(`真实地图已连接 · 道路 ${facts.roads} · Overture ${OVERTURE_RELEASE}`, 'ok');
  clearTimeout(readyTimer);
}

function scheduleReadyCheck() {
  clearTimeout(readyTimer);
  readyTimer = setTimeout(() => {
    countVisibleFacts();
    checkReady();
  }, 180);
}

function installOverlays() {
  if (overlaysInstalled) return;
  hideBasemapFacts();
  addImageryBase();
  addOvertureMapFacts();
  addOvertureBuildings();
  addTerrain();
  overlaysInstalled = true;
  coreSourcesInstalled = true;
  syncModeLayers(false);
  scheduleReadyCheck();
  void installLandmarkLayerIfNeeded();
}

function setMode(nextMode) {
  mode = nextMode === '3d' ? '3d' : '2d';
  syncModeLayers(true);
  setTimeout(() => countVisibleFacts(), 1000);
}

function renderLandmarks() {
  if (landmarksRendered) return;
  landmarksRendered = true;
  const list = $('#landmarkList');
  list.replaceChildren();
  for (const place of STAGE2_LANDMARKS) {
    const button = document.createElement('button');
    button.className = 'landmark-item';
    const title = document.createElement('strong');
    const meta = document.createElement('span');
    const badge = document.createElement('em');
    title.textContent = place.name;
    meta.textContent = `${place.district} · 高精模型位`;
    badge.textContent = '定位';
    button.append(title, meta, badge);
    button.addEventListener('click', () => {
      mode = '3d';
      syncModeLayers(false);
      map.flyTo({ center: [place.lon, place.lat], zoom: place.zoom, pitch: place.pitch, bearing: place.bearing, duration: 1400, essential: true });
      setTimeout(() => countVisibleFacts(), 1800);
    });
    list.appendChild(button);
  }
}

function updateReadout() {
  const center = map.getCenter();
  $('#coordStats').textContent = `${center.lng.toFixed(5)}, ${center.lat.toFixed(5)}`;
  $('#zoomStats').textContent = `z${map.getZoom().toFixed(2)}`;
  $('#pitchStats').textContent = `${Math.round(map.getPitch())}°`;
}

function frameTick(now) {
  frameCount++;
  if (now - lastFrameAt >= 1000) {
    $('#fps').textContent = String(Math.round(frameCount * 1000 / (now - lastFrameAt)));
    frameCount = 0;
    lastFrameAt = now;
  }
  requestAnimationFrame(frameTick);
}
requestAnimationFrame(frameTick);

const map = new maplibregl.Map({
  container: 'map', style: OPENFREEMAP_STYLE, center: FOSHAN.center,
  zoom: mode === '3d' ? 13.8 : 10.7, pitch: mode === '3d' ? 58 : 0, bearing: mode === '3d' ? -18 : 0,
  minZoom: 7.5, maxZoom: 20, maxPitch: 80, attributionControl: true, hash: true,
  canvasContextAttributes: { antialias: true }
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');

map.on('style.load', () => {
  document.documentElement.dataset.styleReady = 'true';
  overlaysInstalled = false;
  try {
    installOverlays();
    renderLandmarks();
    updateReadout();
  } catch (error) {
    const message = String(error?.message || error);
    window.__foshanErrors.push(message);
    document.documentElement.dataset.runtimeError = message.slice(0, 180);
    setStatus('地图图层初始化失败，正在等待下一次样式恢复…', 'error');
  }
});
map.on('load', () => { document.documentElement.dataset.mapLoaded = 'true'; scheduleReadyCheck(); });
map.on('sourcedata', event => {
  if (['foshan-imagery', 'overture-base', 'overture-transportation', 'overture-buildings'].includes(event.sourceId)) scheduleReadyCheck();
});
map.on('render', () => {
  if (!appReady) scheduleReadyCheck();
});
map.on('move', updateReadout);
map.on('moveend', () => { updateReadout(); countVisibleFacts(); });
map.on('error', event => {
  const message = String(event?.error?.message || event?.message || 'map error');
  window.__foshanErrors.push(message);
  const coreSourceFailure = ['foshan-imagery', 'overture-base', 'overture-transportation'].includes(event?.sourceId);
  if (coreSourceFailure && !appReady) {
    document.documentElement.dataset.runtimeError = message.slice(0, 180);
    setStatus('核心地图数据连接异常，正在重试…', 'error');
  }
});

$('#mode2dBtn').addEventListener('click', () => setMode('2d'));
$('#mode3dBtn').addEventListener('click', () => setMode('3d'));
$('#homeBtn').addEventListener('click', () => {
  mode = '2d';
  syncModeLayers(false);
  map.flyTo({ center: FOSHAN.center, zoom: 10.7, pitch: 0, bearing: 0, duration: 1000 });
});
$('#landmarkToggle').addEventListener('click', () => $('#landmarkPanel').classList.toggle('collapsed'));
$('#legacyBtn').addEventListener('click', () => { location.href = './legacy.html'; });
setStatus('正在加载佛山真实道路、水系与影像…');
