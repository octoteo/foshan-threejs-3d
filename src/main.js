import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FOSHAN, IMAGERY_PROVIDERS, QUALITY_PRESETS, OVERTURE_RELEASE } from './config.js';
import { lonLatToWorld, worldToLonLat } from './geo.js';
import { LANDMARKS } from './landmarks.js';
import { OvertureBuildingsProvider } from './providers/overtureBuildings.js';
import { TerrainTileManager } from './providers/terrain.js';
import { BuildingTileManager } from './providers/buildingTiles.js';
import { BuildingMaterialLibrary } from './render/materials.js';
import { LandmarkModelLayer } from './landmarks/modelLayer.js';

const canvas = document.querySelector('#scene');
const statusEl = document.querySelector('#status');
const attributionEl = document.querySelector('#attribution');
const qualitySelect = document.querySelector('#qualitySelect');
const imagerySelect = document.querySelector('#imagerySelect');
const tiandituField = document.querySelector('#tiandituField');
const tiandituKeyInput = document.querySelector('#tiandituKey');

const originLon = FOSHAN.center[0];
const originLat = FOSHAN.center[1];
let qualityKey = qualitySelect.value;
let quality = QUALITY_PRESETS[qualityKey];
let imageryId = sessionStorage.getItem('foshan-imagery') || 'eox2016';
let tiandituKey = sessionStorage.getItem('foshan-tianditu-key') || '';
imagerySelect.value = imageryId;
tiandituKeyInput.value = tiandituKey;
tiandituField.classList.toggle('hidden', imageryId !== 'tianditu');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb3c1);
scene.fog = new THREE.FogExp2(0x9bb3c1, 0.000018);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
renderer.shadowMap.enabled = false;

const camera = new THREE.PerspectiveCamera(48, 1, 2, 280000);
camera.position.set(14000, 15500, 19000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.screenSpacePanning = false;
controls.minDistance = 75;
controls.maxDistance = 110000;
controls.maxPolarAngle = Math.PI * 0.485;
controls.target.set(0, 30, 0);
controls.update();

scene.add(new THREE.HemisphereLight(0xcde7f2, 0x53624b, 1.5));
const sun = new THREE.DirectionalLight(0xfff4df, 2.25);
sun.position.set(-9000, 18000, -12000);
scene.add(sun);

const materials = new BuildingMaterialLibrary(renderer);
const terrain = new TerrainTileManager({ scene, originLon, originLat, imageryId, tiandituKey });
const overture = new OvertureBuildingsProvider();
const buildings = new BuildingTileManager({ scene, provider: overture, materials, terrain, originLon, originLat });
const landmarkModels = new LandmarkModelLayer({ scene, originLon, originLat, terrain });

let dataReady = false;
let dataUpdateInFlight = false;
let lastDataUpdate = 0;
let lastTarget = new THREE.Vector3(Infinity, Infinity, Infinity);
let lastDistance = Infinity;
let fpsFrames = 0;
let fpsLast = performance.now();
let fpsValue = 0;
let flyAnimation = null;

function setStatus(text) {
  statusEl.textContent = text;
}

async function initData() {
  setStatus('连接 Overture 全球建筑 PMTiles…');
  try {
    await overture.init();
    dataReady = true;
    const maxZ = overture.header?.maxZoom ?? '?';
    setStatus(`开放数据已连接 · Overture ${OVERTURE_RELEASE} · max z${maxZ}`);
    await landmarkModels.loadManifest();
    requestDataUpdate(true);
  } catch (error) {
    console.error(error);
    setStatus('Overture 数据连接失败；地形与影像仍可浏览。请检查网络/CORS。');
  }
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
}
window.addEventListener('resize', resize);
resize();

function targetGeo() {
  return worldToLonLat(controls.target.x, controls.target.z, originLon, originLat);
}

function cameraDistance() {
  return camera.position.distanceTo(controls.target);
}

async function requestDataUpdate(force = false) {
  if (dataUpdateInFlight) return;
  const now = performance.now();
  const distance = cameraDistance();
  const moved = controls.target.distanceTo(lastTarget) > Math.max(120, distance * 0.04);
  const zoomChanged = Math.abs(distance - lastDistance) > Math.max(180, distance * 0.18);
  if (!force && now - lastDataUpdate < 550 && !moved && !zoomChanged) return;

  const { lon, lat } = targetGeo();
  dataUpdateInFlight = true;
  lastDataUpdate = now;
  lastTarget.copy(controls.target);
  lastDistance = distance;
  try {
    await terrain.update(lon, lat, distance, quality);
    if (dataReady) await buildings.update(lon, lat, distance, quality);
  } finally {
    dataUpdateInFlight = false;
  }
}

function updateAttribution() {
  const imagery = IMAGERY_PROVIDERS[imageryId] || IMAGERY_PROVIDERS.eox2016;
  attributionEl.textContent = `Buildings © OpenStreetMap contributors, Overture Maps Foundation · ${imagery.attribution} · Terrain Tiles / Mapzen · ${imagery.license}`;
}
updateAttribution();

function buildLandmarkList() {
  const root = document.querySelector('#landmarkList');
  root.innerHTML = '';
  for (const item of LANDMARKS) {
    const button = document.createElement('button');
    button.className = 'landmark-item';
    button.innerHTML = `<strong>${item.name}</strong><span>${item.district}</span><em>↗</em>`;
    button.addEventListener('click', () => flyTo(item));
    root.appendChild(button);
  }
}
buildLandmarkList();

function flyTo(place) {
  const world = lonLatToWorld(place.lon, place.lat, originLon, originLat);
  const ground = terrain.sampleHeight(place.lon, place.lat);
  const target = new THREE.Vector3(world.x, ground + 18, world.z);
  const heading = THREE.MathUtils.degToRad(place.heading || 25);
  const d = place.altitude || 900;
  const endCamera = new THREE.Vector3(
    target.x + Math.sin(heading) * d * 0.85,
    target.y + d * 0.66,
    target.z + Math.cos(heading) * d * 0.85
  );
  flyAnimation = {
    start: performance.now(), duration: 1250,
    fromCamera: camera.position.clone(), toCamera: endCamera,
    fromTarget: controls.target.clone(), toTarget: target
  };
}

function updateFly() {
  if (!flyAnimation) return;
  const t = Math.min(1, (performance.now() - flyAnimation.start) / flyAnimation.duration);
  const ease = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  camera.position.lerpVectors(flyAnimation.fromCamera, flyAnimation.toCamera, ease);
  controls.target.lerpVectors(flyAnimation.fromTarget, flyAnimation.toTarget, ease);
  if (t >= 1) {
    flyAnimation = null;
    requestDataUpdate(true);
  }
}

function flyHome() {
  const home = { lon: FOSHAN.center[0], lat: FOSHAN.center[1], altitude: 24000, heading: 25 };
  flyTo(home);
}

document.querySelector('#homeBtn').addEventListener('click', flyHome);
document.querySelector('#sourceBtn').addEventListener('click', () => document.querySelector('#sourcePanel').classList.remove('hidden'));
document.querySelector('#closeSourceBtn').addEventListener('click', () => document.querySelector('#sourcePanel').classList.add('hidden'));

qualitySelect.addEventListener('change', () => {
  qualityKey = qualitySelect.value;
  quality = QUALITY_PRESETS[qualityKey];
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
  terrain.clear();
  buildings.clearVisible();
  requestDataUpdate(true);
});

imagerySelect.addEventListener('change', () => {
  tiandituField.classList.toggle('hidden', imagerySelect.value !== 'tianditu');
});

document.querySelector('#applySourceBtn').addEventListener('click', () => {
  const nextImagery = imagerySelect.value;
  const nextKey = tiandituKeyInput.value.trim();
  if (nextImagery === 'tianditu' && !nextKey) {
    setStatus('天地图影像需要开发 Key；未切换数据源。');
    return;
  }
  imageryId = nextImagery;
  tiandituKey = nextKey;
  sessionStorage.setItem('foshan-imagery', imageryId);
  if (tiandituKey) sessionStorage.setItem('foshan-tianditu-key', tiandituKey);
  else sessionStorage.removeItem('foshan-tianditu-key');
  terrain.setImagery(imageryId, tiandituKey);
  buildings.clearVisible();
  updateAttribution();
  document.querySelector('#sourcePanel').classList.add('hidden');
  setStatus(`影像已切换：${IMAGERY_PROVIDERS[imageryId].label}`);
  requestDataUpdate(true);
});

function telemetry() {
  const now = performance.now();
  fpsFrames++;
  if (now - fpsLast >= 600) {
    fpsValue = fpsFrames * 1000 / (now - fpsLast);
    fpsFrames = 0;
    fpsLast = now;
  }
  const t = terrain.getStats();
  const b = buildings.getStats();
  const known = b.explicitHeight + b.floorsHeight;
  const ratio = b.rendered ? known / b.rendered * 100 : 0;
  document.querySelector('#fps').textContent = fpsValue ? fpsValue.toFixed(0) : '--';
  document.querySelector('#terrainStats').textContent = `${t.loaded}/${t.loaded + t.loading}`;
  document.querySelector('#buildingStats').textContent = `${b.rendered.toLocaleString()} 栋`;
  document.querySelector('#heightStats').textContent = b.rendered ? `${ratio.toFixed(0)}% 数据` : '--';
  document.querySelector('#altitudeStats').textContent = `${Math.round(cameraDistance()).toLocaleString()} m`;
}

function animate() {
  requestAnimationFrame(animate);
  updateFly();
  controls.enabled = !flyAnimation;
  controls.update();
  requestDataUpdate(false);
  telemetry();
  renderer.render(scene, camera);
}

initData();
animate();
