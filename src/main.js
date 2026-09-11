import * as THREE from 'three';
import {
  GlobeControls,
  TilesRenderer,
  WGS84_ELLIPSOID,
} from '3d-tiles-renderer';
import {
  GLTFExtensionsPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UnloadTilesPlugin,
  UpdateOnChangePlugin,
} from '3d-tiles-renderer/plugins';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FOSHAN, LANDMARKS } from './landmarks.js';

const DEG2RAD = Math.PI / 180;
const SESSION_KEY = 'foshan-3d-source-v2';
const QUALITY = {
  performance: { errorTarget: 24, maxBytes: 240 * 1024 * 1024, pixelRatio: 1.0 },
  balanced: { errorTarget: 14, maxBytes: 480 * 1024 * 1024, pixelRatio: 1.35 },
  ultra: { errorTarget: 8, maxBytes: 768 * 1024 * 1024, pixelRatio: 1.75 },
};

const canvas = document.querySelector('#scene');
const ui = {
  sourceBadge: document.querySelector('#source-badge'),
  sourceButton: document.querySelector('#btn-source'),
  fullscreen: document.querySelector('#btn-fullscreen'),
  sourceModal: document.querySelector('#source-modal'),
  sourceClose: document.querySelector('#btn-close-source'),
  sourceForm: document.querySelector('#source-form'),
  clearSource: document.querySelector('#btn-clear-source'),
  googleKey: document.querySelector('#google-key'),
  customUrl: document.querySelector('#custom-url'),
  googleFields: document.querySelector('#google-fields'),
  customFields: document.querySelector('#custom-fields'),
  providerTabs: [...document.querySelectorAll('.provider-tab')],
  landmarkList: document.querySelector('#landmark-list'),
  overview: document.querySelector('#btn-overview'),
  tour: document.querySelector('#btn-tour'),
  loading: document.querySelector('#loading'),
  loadingTitle: document.querySelector('#loading-title'),
  loadingSubtitle: document.querySelector('#loading-subtitle'),
  toast: document.querySelector('#toast'),
  googleBrand: document.querySelector('#google-brand'),
  attribution: document.querySelector('#dynamic-attribution'),
  metricLocation: document.querySelector('#metric-location'),
  metricAltitude: document.querySelector('#metric-altitude'),
  metricVisible: document.querySelector('#metric-visible'),
  metricCache: document.querySelector('#metric-cache'),
  metricFps: document.querySelector('#metric-fps'),
  metricLod: document.querySelector('#metric-lod'),
  qualityButtons: [...document.querySelectorAll('[data-quality]')],
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  logarithmicDepthBuffer: true,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x9fc0d2, 1);
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 1, 160_000_000);
camera.position.set(0, 0, 13_500_000);
camera.lookAt(0, 0, 0);

const placeholder = createPlaceholderGlobe();
scene.add(placeholder);

let tiles = null;
let controls = null;
let sourceConfig = null;
let provider = 'google';
let quality = 'ultra';
let flight = null;
let tourTimer = null;
let tourIndex = 0;
let toastTimer = null;
let fpsFrames = 0;
let fpsLast = performance.now();
let lastTelemetry = 0;
let firstRealTileObserved = false;

bootstrap();
animate();

function bootstrap() {
  absorbQueryCredentials();
  const saved = readSessionConfig();
  if (saved) {
    provider = saved.provider;
    populateSourceForm(saved);
    connectSource(saved);
  } else {
    showSourceModal(true);
  }

  buildLandmarkList();
  bindUI();
  setQuality('ultra');
}

function createPlaceholderGlobe() {
  const group = new THREE.Group();
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(6_378_137, 64, 32),
    new THREE.MeshBasicMaterial({ color: 0x17344b, wireframe: true, transparent: true, opacity: 0.18 }),
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(6_500_000, 64, 32),
    new THREE.MeshBasicMaterial({ color: 0x61a6c5, side: THREE.BackSide, transparent: true, opacity: 0.08 }),
  );
  group.add(globe, halo);
  return group;
}

function bindUI() {
  ui.sourceButton.addEventListener('click', () => showSourceModal(true));
  ui.sourceClose.addEventListener('click', () => showSourceModal(false));
  ui.sourceModal.addEventListener('click', (event) => {
    if (event.target === ui.sourceModal && sourceConfig) showSourceModal(false);
  });

  for (const tab of ui.providerTabs) {
    tab.addEventListener('click', () => setProviderTab(tab.dataset.provider));
  }

  ui.sourceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const config = provider === 'google'
      ? { provider: 'google', apiKey: ui.googleKey.value.trim() }
      : { provider: 'custom', url: ui.customUrl.value.trim() };

    if (config.provider === 'google' && !config.apiKey) {
      showToast('请输入已启用 Map Tiles API 的 Google Maps Platform API Key。');
      return;
    }
    if (config.provider === 'custom' && !isValidHttpUrl(config.url)) {
      showToast('请输入有效的 http(s) 3D Tiles 根地址。');
      return;
    }

    saveSessionConfig(config);
    connectSource(config);
  });

  ui.clearSource.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    ui.googleKey.value = '';
    ui.customUrl.value = '';
    disconnectTiles();
    sourceConfig = null;
    updateSourceBadge();
    showToast('本会话中的数据源凭据已清除。');
  });

  ui.overview.addEventListener('click', () => flyToLocation(FOSHAN));
  ui.tour.addEventListener('click', toggleTour);

  ui.fullscreen.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      showToast('浏览器未允许进入全屏。');
    }
  });

  for (const button of ui.qualityButtons) {
    button.addEventListener('click', () => setQuality(button.dataset.quality));
  }

  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sourceConfig) showSourceModal(false);
  });
}

function buildLandmarkList() {
  ui.landmarkList.replaceChildren();
  LANDMARKS.forEach((landmark, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'landmark-card';
    button.dataset.id = landmark.id;
    button.innerHTML = `
      <span class="landmark-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="landmark-copy"><strong>${landmark.name}</strong><small>${landmark.subtitle}</small></span>
      <span class="landmark-arrow">↗</span>
    `;
    button.addEventListener('click', () => {
      stopTour();
      flyToLocation(landmark);
    });
    ui.landmarkList.appendChild(button);
  });
}

function setProviderTab(next) {
  provider = next === 'custom' ? 'custom' : 'google';
  ui.providerTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.provider === provider));
  ui.googleFields.classList.toggle('hidden', provider !== 'google');
  ui.customFields.classList.toggle('hidden', provider !== 'custom');
}

function populateSourceForm(config) {
  setProviderTab(config.provider);
  if (config.provider === 'google') ui.googleKey.value = config.apiKey || '';
  if (config.provider === 'custom') ui.customUrl.value = config.url || '';
}

function absorbQueryCredentials() {
  const params = new URLSearchParams(location.search);
  const apiKey = params.get('key');
  const tileset = params.get('tileset');
  let config = null;

  if (apiKey) config = { provider: 'google', apiKey };
  else if (tileset && isValidHttpUrl(tileset)) config = { provider: 'custom', url: tileset };

  if (config) {
    saveSessionConfig(config);
    params.delete('key');
    params.delete('tileset');
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }
}

function readSessionConfig() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (value?.provider === 'google' && value.apiKey) return value;
    if (value?.provider === 'custom' && isValidHttpUrl(value.url)) return value;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
  return null;
}

function saveSessionConfig(config) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(config));
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function connectSource(config) {
  disconnectTiles();
  sourceConfig = config;
  firstRealTileObserved = false;
  setLoading(true, '正在初始化摄影测量 3D Tiles', config.provider === 'google' ? 'Google Maps Platform' : 'Custom OGC 3D Tiles');

  try {
    tiles = config.provider === 'google' ? new TilesRenderer() : new TilesRenderer(config.url);

    if (config.provider === 'google') {
      tiles.registerPlugin(new GoogleCloudAuthPlugin({
        apiToken: config.apiKey,
        autoRefreshToken: true,
        useRecommendedSettings: true,
      }));
    }

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/libs/draco/gltf/');
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
    tiles.registerPlugin(new TileCompressionPlugin());
    tiles.registerPlugin(new UpdateOnChangePlugin());
    tiles.registerPlugin(new UnloadTilesPlugin());
    tiles.registerPlugin(new TilesFadePlugin());

    tiles.group.rotation.x = -Math.PI / 2;
    scene.add(tiles.group);
    tiles.group.updateMatrixWorld(true);

    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);
    tiles.loadSiblings = true;
    tiles.loadAncestors = true;

    controls = new GlobeControls(scene, camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableFlight = true;
    controls.flightSpeed = 0.65;
    controls.minDistance = 1;
    controls.maxDistance = 80_000_000;
    controls.minAltitude = 2;
    controls.maxAltitude = 70_000_000;
    controls.setEllipsoid(tiles.ellipsoid, tiles.group);

    placeholder.visible = false;
    setQuality(quality);
    updateSourceBadge();
    showSourceModal(false);
    requestAnimationFrame(() => flyToLocation(FOSHAN, true));

    setTimeout(() => {
      if (!tiles || firstRealTileObserved) return;
      setLoading(false);
      showToast('尚未检测到可见实景瓦片：请检查数据覆盖、API 权限、密钥限制与网络。', 6500);
    }, 9000);
  } catch (error) {
    console.error(error);
    setLoading(false);
    showSourceModal(true);
    showToast(`3D 数据源初始化失败：${error?.message || '未知错误'}`, 7000);
  }
}

function disconnectTiles() {
  stopTour();
  flight = null;
  if (controls) {
    controls.dispose();
    controls = null;
  }
  if (tiles) {
    scene.remove(tiles.group);
    tiles.dispose();
    tiles = null;
  }
  placeholder.visible = true;
  ui.googleBrand.classList.add('hidden');
  ui.attribution.textContent = '3D 数据源未连接';
  setLoading(false);
}

function setQuality(next) {
  if (!QUALITY[next]) return;
  quality = next;
  const settings = QUALITY[next];

  renderer.setPixelRatio(Math.min(devicePixelRatio, settings.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);

  if (tiles) {
    tiles.errorTarget = settings.errorTarget;
    if (tiles.lruCache) {
      tiles.lruCache.maxBytesSize = settings.maxBytes;
      tiles.lruCache.maxSize = 8000;
    }
    tiles.setResolutionFromRenderer(camera, renderer);
    const updatePlugin = tiles.getPluginByName?.('UPDATE_ON_CHANGE_PLUGIN');
    if (updatePlugin) updatePlugin.needsUpdate = true;
  }

  ui.metricLod.textContent = `${settings.errorTarget} px`;
  ui.qualityButtons.forEach((button) => button.classList.toggle('active', button.dataset.quality === next));
}

function flyToLocation(location, immediate = false) {
  if (!tiles) {
    showSourceModal(true);
    showToast('先连接真实 3D Tiles 数据源。');
    return;
  }

  const target = cartographicToWorld(location.lat, location.lon, 0);
  const destination = cartographicToWorld(location.camera.lat, location.camera.lon, location.camera.height);
  const finalQuaternion = lookAtQuaternion(destination, target);

  ui.metricLocation.textContent = location.name;
  document.querySelectorAll('.landmark-card').forEach((button) => {
    button.classList.toggle('active', button.dataset.id === location.id);
  });

  if (immediate) {
    camera.position.copy(destination);
    camera.quaternion.copy(finalQuaternion);
    camera.updateMatrixWorld(true);
    controls?.adjustCamera(camera);
    flight = null;
    return;
  }

  flight = {
    start: performance.now(),
    duration: 1650,
    fromPosition: camera.position.clone(),
    toPosition: destination,
    fromQuaternion: camera.quaternion.clone(),
    toQuaternion: finalQuaternion,
  };
  if (controls) controls.enabled = false;
}

function cartographicToWorld(latDeg, lonDeg, height) {
  const ecef = new THREE.Vector3();
  WGS84_ELLIPSOID.getCartographicToPosition(latDeg * DEG2RAD, lonDeg * DEG2RAD, height, ecef);
  tiles.group.updateMatrixWorld(true);
  return ecef.applyMatrix4(tiles.group.matrixWorld);
}

function lookAtQuaternion(position, target) {
  const matrix = new THREE.Matrix4();
  const up = target.clone().normalize();
  matrix.lookAt(position, target, up);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function updateFlight(now) {
  if (!flight) return;
  const raw = Math.min(1, (now - flight.start) / flight.duration);
  const t = 1 - Math.pow(1 - raw, 4);
  camera.position.lerpVectors(flight.fromPosition, flight.toPosition, t);
  camera.quaternion.slerpQuaternions(flight.fromQuaternion, flight.toQuaternion, t);
  camera.updateMatrixWorld(true);

  if (raw >= 1) {
    flight = null;
    if (controls) {
      controls.enabled = true;
      controls.adjustCamera(camera);
    }
  }
}

function toggleTour() {
  if (tourTimer) {
    stopTour();
    return;
  }
  if (!tiles) {
    showSourceModal(true);
    return;
  }

  ui.tour.classList.add('active');
  ui.tour.textContent = '停止巡航';
  tourIndex = 0;
  flyToLocation(LANDMARKS[tourIndex]);
  tourTimer = setInterval(() => {
    tourIndex = (tourIndex + 1) % LANDMARKS.length;
    flyToLocation(LANDMARKS[tourIndex]);
  }, 7000);
}

function stopTour() {
  if (tourTimer) clearInterval(tourTimer);
  tourTimer = null;
  ui.tour?.classList.remove('active');
  if (ui.tour) ui.tour.textContent = '自动巡航';
}

function showSourceModal(show) {
  if (!show && !sourceConfig) return;
  ui.sourceModal.classList.toggle('hidden', !show);
}

function setLoading(show, title = '正在加载', subtitle = '') {
  ui.loadingTitle.textContent = title;
  ui.loadingSubtitle.textContent = subtitle;
  ui.loading.classList.toggle('hidden', !show);
}

function showToast(message, duration = 4200) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), duration);
}

function updateSourceBadge() {
  if (!sourceConfig) {
    ui.sourceBadge.textContent = '未连接真实 3D 数据';
    ui.sourceBadge.className = 'badge badge-warn';
    return;
  }
  ui.sourceBadge.textContent = sourceConfig.provider === 'google' ? 'Google Photorealistic' : 'Custom 3D Tiles';
  ui.sourceBadge.className = 'badge badge-ok';
  ui.googleBrand.classList.toggle('hidden', sourceConfig.provider !== 'google');
}

function updateAttribution() {
  if (!tiles) return;
  const items = tiles.getAttributions?.() || [];
  const textItems = items
    .filter((item) => item?.type !== 'image' && item?.value)
    .map((item) => stripUnsafeHtml(String(item.value)));
  ui.attribution.textContent = textItems.join(' · ') || (sourceConfig?.provider === 'google' ? 'Google Maps data attribution loading…' : '3D Tiles provider attribution unavailable');
}

function stripUnsafeHtml(value) {
  const div = document.createElement('div');
  div.innerHTML = value;
  return div.textContent || div.innerText || '';
}

function updateTelemetry(now) {
  fpsFrames += 1;
  const fpsElapsed = now - fpsLast;
  if (fpsElapsed >= 1000) {
    ui.metricFps.textContent = `${Math.round((fpsFrames * 1000) / fpsElapsed)}`;
    fpsFrames = 0;
    fpsLast = now;
  }

  if (now - lastTelemetry < 250) return;
  lastTelemetry = now;

  if (!tiles) {
    ui.metricVisible.textContent = '0';
    ui.metricCache.textContent = '0 MB';
    ui.metricAltitude.textContent = '--';
    return;
  }

  const visible = tiles.visibleTiles?.size || 0;
  ui.metricVisible.textContent = String(visible);
  const bytes = tiles.lruCache?.cachedBytes || 0;
  ui.metricCache.textContent = `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;

  if (visible > 0 && !firstRealTileObserved) {
    firstRealTileObserved = true;
    setLoading(false);
  }

  const inverse = tiles.group.matrixWorld.clone().invert();
  const local = camera.position.clone().applyMatrix4(inverse);
  const cartographic = {};
  WGS84_ELLIPSOID.getPositionToCartographic(local, cartographic);
  if (Number.isFinite(cartographic.height)) {
    ui.metricAltitude.textContent = formatDistance(cartographic.height);
  }

  updateAttribution();
}

function formatDistance(meters) {
  if (Math.abs(meters) >= 1000) return `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km`;
  return `${Math.max(0, Math.round(meters))} m`;
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const settings = QUALITY[quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio, settings.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  tiles?.setResolutionFromRenderer(camera, renderer);
}

function animate(now = performance.now()) {
  requestAnimationFrame(animate);

  placeholder.rotation.y += 0.00035;
  updateFlight(now);

  if (tiles) {
    scene.updateMatrixWorld();
    if (!flight) controls?.update();
    camera.updateMatrixWorld();
    tiles.setResolutionFromRenderer(camera, renderer);
    tiles.setCamera(camera);
    tiles.update();
  }

  renderer.render(scene, camera);
  updateTelemetry(now);
}
