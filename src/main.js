import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { APP_VERSION, FOSHAN, IMAGERY_PROVIDERS, OVERTURE_RELEASE, QUALITY_PRESETS, RUNTIME } from './config.js';
import { lonLatToWorld, worldToLonLat } from './geo.js';
import { LANDMARKS } from './landmarks.js';
import { OvertureBuildingsProvider } from './providers/overtureBuildings.js';
import { HeightOverlayProvider } from './providers/heightOverlay.js';
import { TerrainTileManager } from './providers/terrain.js';
import { BuildingTileManager } from './providers/buildingTiles.js';
import { BuildingMaterialLibrary } from './render/materials.js';
import { LandmarkModelLayer } from './landmarks/modelLayer.js';
import { BuildingInspector } from './ui/inspector.js';

const $ = s => document.querySelector(s);
const canvas = $('#scene');
const statusEl = $('#status');
const qualitySelect = $('#qualitySelect');
const imagerySelect = $('#imagerySelect');
const tiandituKeyInput = $('#tiandituKey');
const inspector = new BuildingInspector($('#inspector'));
const [originLon, originLat] = FOSHAN.center;

window.__foshanErrors = [];
window.addEventListener('error', e => window.__foshanErrors.push(e.message || 'error'));
window.addEventListener('unhandledrejection', e => window.__foshanErrors.push(String(e.reason?.message || e.reason || 'rejection')));
document.documentElement.dataset.appVersion = APP_VERSION;
document.title = `佛山真实 3D · v${APP_VERSION}`;

function autoPreset() {
  const memory = Number(navigator.deviceMemory || 8);
  const cores = Number(navigator.hardwareConcurrency || 8);
  return memory <= 4 || cores <= 4 ? 'performance' : 'balanced';
}
let qualityMode = sessionStorage.getItem('foshan-quality') || 'auto';
if (!['auto', ...Object.keys(QUALITY_PRESETS)].includes(qualityMode)) qualityMode = 'auto';
let runtimeQualityKey = qualityMode === 'auto' ? autoPreset() : qualityMode;
let quality = QUALITY_PRESETS[runtimeQualityKey];
qualitySelect.value = qualityMode;
let imageryId = sessionStorage.getItem('foshan-imagery') || 'eox2016';
if (!IMAGERY_PROVIDERS[imageryId]) imageryId = 'eox2016';
let tiandituKey = sessionStorage.getItem('foshan-tianditu-key') || '';
imagerySelect.value = imageryId;
tiandituKeyInput.value = tiandituKey;
$('#tiandituField').classList.toggle('hidden', imageryId !== 'tianditu');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xaac2cc, 0.000012);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
const camera = new THREE.PerspectiveCamera(48, 1, 2, 300000);
camera.position.set(3600, 4500, 5200);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.065, screenSpacePanning: false, minDistance: RUNTIME.minCameraDistance, maxDistance: RUNTIME.maxCameraDistance, maxPolarAngle: Math.PI * 0.49 });
controls.target.set(0, 28, 0);
controls.update();

const sky = new Sky();
sky.scale.setScalar(450000);
scene.add(sky);
Object.assign(sky.material.uniforms.turbidity, { value: 4.8 });
Object.assign(sky.material.uniforms.rayleigh, { value: 1.75 });
Object.assign(sky.material.uniforms.mieCoefficient, { value: 0.006 });
Object.assign(sky.material.uniforms.mieDirectionalG, { value: 0.78 });
const hemi = new THREE.HemisphereLight(0xdceff5, 0x4d5a49, 1.35);
const sun = new THREE.DirectionalLight(0xfff1d8, 2.35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near: 50, far: 52000, left: -3000, right: 3000, top: 3000, bottom: -3000 });
sun.shadow.bias = -0.00012;
sun.shadow.normalBias = 0.45;
scene.add(hemi, sun, sun.target);

const materials = new BuildingMaterialLibrary(renderer);
const heightOverlay = new HeightOverlayProvider();
const terrain = new TerrainTileManager({ scene, renderer, originLon, originLat, imageryId, tiandituKey });
const overture = new OvertureBuildingsProvider();
const buildings = new BuildingTileManager({ scene, provider: overture, materials, terrain, heightOverlay, originLon, originLat });
const landmarkModels = new LandmarkModelLayer({ scene, originLon, originLat, terrain });

let dataReady = false, booting = true, updating = false, queued = false, lastUpdate = 0, lastDistance = Infinity;
let lastTarget = new THREE.Vector3(Infinity, Infinity, Infinity), fly = null, outline = null;
let fps = 0, frames = 0, fpsAt = performance.now(), lowSince = null, highSince = null, qualityAt = performance.now(), hashAt = 0, healthAt = 0;

function setStatus(text, tone = '') {
  statusEl.textContent = text;
  statusEl.className = `status glass${tone ? ` ${tone}` : ''}`;
}
function distance() { return camera.position.distanceTo(controls.target); }
function targetGeo() { return worldToLonLat(controls.target.x, controls.target.z, originLon, originLat); }
function attribution() {
  const i = IMAGERY_PROVIDERS[imageryId] || IMAGERY_PROVIDERS.eox2016;
  $('#attribution').textContent = `Buildings © OpenStreetMap contributors, Overture Maps Foundation · ${i.attribution} · Terrain Tiles / Mapzen · ${i.license}`;
}
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
}
window.addEventListener('resize', resize); resize(); attribution();

async function updateData(force = false) {
  if (updating) { if (force) queued = true; return; }
  const now = performance.now(), d = distance();
  const moved = controls.target.distanceTo(lastTarget) > Math.max(90, d * 0.032);
  const zoomed = Math.abs(d - lastDistance) > Math.max(140, d * 0.14);
  if (!force && now - lastUpdate < RUNTIME.dataUpdateMinMs && !moved && !zoomed) return;
  const { lon, lat } = targetGeo();
  updating = true; lastUpdate = now; lastTarget.copy(controls.target); lastDistance = d;
  try {
    await terrain.update(lon, lat, d, quality);
    if (dataReady) await buildings.update(lon, lat, d, quality);
  } catch (e) { console.warn('View update failed', e); }
  finally { updating = false; if (queued) { queued = false; queueMicrotask(() => updateData(true)); } }
}

async function initData() {
  setStatus('连接佛山开放数据链…');
  const overlayPromise = heightOverlay.init();
  try {
    await Promise.all([overture.init(), overlayPromise]);
    dataReady = true;
    $('#overtureVersion').textContent = `${OVERTURE_RELEASE} · max z${overture.header?.maxZoom ?? '?'}`;
    const os = heightOverlay.getStatus();
    $('#heightOverlayName').textContent = os.enabled ? os.name : '未启用 · 可选增强';
    await landmarkModels.loadManifest();
    const bootQuality = {
      ...quality,
      terrainRadius: 0,
      buildingRadius: 0,
      terrainSegments: Math.min(18, quality.terrainSegments),
      minBuildingArea: Math.max(110, quality.minBuildingArea)
    };
    const bootGeo = targetGeo();
    const bootDistance = distance();
    await terrain.update(bootGeo.lon, bootGeo.lat, bootDistance, bootQuality);
    await buildings.update(bootGeo.lon, bootGeo.lat, bootDistance, bootQuality);
    const initialBuildings = buildings.getStats();
    if (bootDistance < 32000 && initialBuildings.rendered <= 0) throw new Error('Initial Foshan building view rendered zero buildings');
    setStatus(`开放数据已连接 · Overture ${OVERTURE_RELEASE}`, 'ok');
    document.documentElement.dataset.appReady = 'true';
  } catch (e) {
    console.error(e); document.documentElement.dataset.runtimeError = String(e?.message || e).slice(0, 180); await overlayPromise.catch(() => null);
    setStatus('Overture 建筑连接失败；地形与影像仍可浏览。', 'error');
    await updateData(true);
    document.documentElement.dataset.appReady = 'degraded';
  } finally {
    booting = false;
    queueMicrotask(() => updateData(true));
  }
}

renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); setStatus('WebGL 上下文丢失，等待浏览器恢复…', 'error'); });
renderer.domElement.addEventListener('webglcontextrestored', () => { terrain.invalidate(); buildings.invalidate(); setStatus('WebGL 已恢复，重新加载视野…', 'warn'); updateData(true); });

function buildLandmarks() {
  const root = $('#landmarkList'); root.replaceChildren();
  for (const place of LANDMARKS) {
    const b = document.createElement('button'); b.className = 'landmark-item';
    const strong = document.createElement('strong'), span = document.createElement('span'), em = document.createElement('em');
    strong.textContent = place.name; span.textContent = place.district; em.textContent = '↗';
    b.append(strong, span, em); b.addEventListener('click', () => flyTo(place)); root.appendChild(b);
  }
}
buildLandmarks();
function flyTo(place) {
  const p = lonLatToWorld(place.lon, place.lat, originLon, originLat), ground = terrain.sampleHeight(place.lon, place.lat);
  const toTarget = new THREE.Vector3(p.x, ground + 18, p.z), h = THREE.MathUtils.degToRad(place.heading || 25), d = place.altitude || 900;
  fly = { start: performance.now(), duration: 1350, fromCamera: camera.position.clone(), fromTarget: controls.target.clone(), toTarget,
    toCamera: new THREE.Vector3(toTarget.x + Math.sin(h) * d * 0.84, toTarget.y + d * 0.68, toTarget.z + Math.cos(h) * d * 0.84) };
}
function updateFly() {
  if (!fly) return;
  const t = Math.min(1, (performance.now() - fly.start) / fly.duration), e = t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
  camera.position.lerpVectors(fly.fromCamera, fly.toCamera, e); controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);
  if (t === 1) { fly = null; updateData(true); }
}
const flyHome = () => flyTo({ lon: originLon, lat: originLat, altitude: 21000, heading: 28 });

function applyQuality(key, invalidate = true) {
  if (!QUALITY_PRESETS[key]) return;
  runtimeQualityKey = key; quality = QUALITY_PRESETS[key]; renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
  qualityAt = performance.now(); lowSince = highSince = null;
  if (invalidate) { terrain.invalidate(); buildings.invalidate(); updateData(true); }
}
function adaptQuality(now) {
  if (qualityMode !== 'auto' || !fps || now - qualityAt < 12000) return;
  if (fps < RUNTIME.adaptiveDownFps) {
    lowSince ??= now; highSince = null;
    if (now - lowSince > RUNTIME.adaptiveWindowMs && runtimeQualityKey !== 'performance') {
      applyQuality(runtimeQualityKey === 'ultra' ? 'balanced' : 'performance'); setStatus(`自动画质已降至 ${QUALITY_PRESETS[runtimeQualityKey].label}`, 'warn');
    }
  } else if (fps > RUNTIME.adaptiveUpFps) {
    highSince ??= now; lowSince = null;
    if (now - highSince > RUNTIME.adaptiveWindowMs * 1.6) {
      if (runtimeQualityKey === 'performance') applyQuality('balanced');
      else if (runtimeQualityKey === 'balanced' && Number(navigator.deviceMemory || 8) >= 8 && devicePixelRatio <= 2.5) applyQuality('ultra');
    }
  } else lowSince = highSince = null;
}

function setTime(hour) {
  const h = Number(hour), daylight = Math.max(0, Math.sin((h - 6) / 12 * Math.PI));
  const az = THREE.MathUtils.degToRad((h - 12) * 12 + 150), el = THREE.MathUtils.degToRad(3 + daylight * 57);
  const dir = new THREE.Vector3(Math.sin(az)*Math.cos(el), Math.sin(el), Math.cos(az)*Math.cos(el)).normalize();
  sky.material.uniforms.sunPosition.value.copy(dir).multiplyScalar(400000); sun.userData.direction = dir;
  sun.intensity = .35 + daylight * 2.25; hemi.intensity = .5 + daylight * .95; renderer.toneMappingExposure = .72 + daylight * .42;
  scene.fog.color.copy(new THREE.Color(0x172536)).lerp(new THREE.Color(0xaac2cc), daylight); materials.setNightFactor(1 - Math.min(1, daylight * 1.55));
  const hh = Math.floor(h), mm = Math.round((h-hh)*60)%60; $('#timeLabel').textContent = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}
setTime($('#timeSlider').value); $('#timeSlider').addEventListener('input', e => setTime(e.target.value));
function updateSun() {
  const dir = sun.userData.direction || new THREE.Vector3(.2,.8,.4), d = distance(), r = Math.max(1000, Math.min(4200, d*.8));
  sun.target.position.copy(controls.target); sun.position.copy(controls.target).addScaledVector(dir, 26000); sun.castShadow = quality.shadows && d < 6500;
  Object.assign(sun.shadow.camera, { left: -r, bottom: -r, right: r, top: r });
}

function viewHash() {
  const g = targetGeo(), off = camera.position.clone().sub(controls.target), d = off.length();
  const p = new URLSearchParams({ lon:g.lon.toFixed(6), lat:g.lat.toFixed(6), ty:controls.target.y.toFixed(1), d:d.toFixed(1), h:(Math.atan2(off.x,off.z)*180/Math.PI).toFixed(1), e:(Math.asin(off.y/Math.max(1,d))*180/Math.PI).toFixed(1) });
  return p.toString();
}
function restoreView() {
  const p = new URLSearchParams(location.hash.slice(1)); if (!p.has('lon') || !p.has('lat')) return;
  const lon=+p.get('lon'), lat=+p.get('lat'), ty=+(p.get('ty')||20), d=Math.max(60,Math.min(RUNTIME.maxCameraDistance,+(p.get('d')||5000)));
  const h=THREE.MathUtils.degToRad(+(p.get('h')||25)), e=THREE.MathUtils.degToRad(Math.max(3,Math.min(82,+(p.get('e')||35))));
  if (![lon,lat,ty,d,h,e].every(Number.isFinite)) return;
  const w=lonLatToWorld(lon,lat,originLon,originLat), horizontal=Math.cos(e)*d; controls.target.set(w.x,ty,w.z);
  camera.position.set(w.x+Math.sin(h)*horizontal,ty+Math.sin(e)*d,w.z+Math.cos(h)*horizontal); controls.update();
}
restoreView();
async function copyView() {
  const url = `${location.origin}${location.pathname}#${viewHash()}`;
  try { await navigator.clipboard.writeText(url); setStatus('当前 3D 视角链接已复制','ok'); } catch { setStatus(url,'warn'); }
}

function showBuilding(item) {
  inspector.show(item);
  if (outline) { scene.remove(outline); outline.geometry.dispose(); outline.material.dispose(); outline = null; }
  if (!item) return;
  const ring = item.ring.length > 2 && item.ring[0].x === item.ring.at(-1).x && item.ring[0].z === item.ring.at(-1).z ? item.ring.slice(0,-1) : item.ring;
  if (ring.length < 2) return;
  const y=item.baseElevation+item.heightInfo.height+.65, geometry=new THREE.BufferGeometry().setFromPoints(ring.map(p=>new THREE.Vector3(p.x,y,p.z)));
  outline=new THREE.LineLoop(geometry,new THREE.LineBasicMaterial({color:0x7fffd9,transparent:true,opacity:.95,depthTest:false})); outline.renderOrder=20; scene.add(outline);
}
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2(); let pointerDown=null;
canvas.addEventListener('pointerdown', e => pointerDown={x:e.clientX,y:e.clientY,t:performance.now()});
canvas.addEventListener('pointerup', e => {
  if (!pointerDown || Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>5 || performance.now()-pointerDown.t>700) return;
  pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1); raycaster.setFromCamera(pointer,camera);
  let point=raycaster.intersectObjects(terrain.getRaycastMeshes(),false)[0]?.point;
  if (!point) { point=new THREE.Vector3(); if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),point)) return; }
  showBuilding(buildings.pick(point.x,point.z));
});

$('#homeBtn').addEventListener('click', flyHome);
$('#sourceBtn').addEventListener('click',()=>$('#sourcePanel').classList.remove('hidden'));
$('#closeSourceBtn').addEventListener('click',()=>$('#sourcePanel').classList.add('hidden'));
$('#helpBtn').addEventListener('click',()=>$('#helpPanel').classList.remove('hidden'));
$('#closeHelpBtn').addEventListener('click',()=>$('#helpPanel').classList.add('hidden'));
$('#copyViewBtn').addEventListener('click',copyView);
$('#fullscreenBtn').addEventListener('click',async()=>{ try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch(e){ console.warn(e); } });
qualitySelect.addEventListener('change',()=>{ qualityMode=qualitySelect.value; sessionStorage.setItem('foshan-quality',qualityMode); applyQuality(qualityMode==='auto'?autoPreset():qualityMode); });
imagerySelect.addEventListener('change',()=>$('#tiandituField').classList.toggle('hidden',imagerySelect.value!=='tianditu'));
$('#applySourceBtn').addEventListener('click',()=>{
  const next=imagerySelect.value,key=tiandituKeyInput.value.trim(); if(next==='tianditu'&&!key){setStatus('天地图影像需要开发 Key；未切换数据源。','warn');return;}
  imageryId=next;tiandituKey=key;sessionStorage.setItem('foshan-imagery',next);if(key)sessionStorage.setItem('foshan-tianditu-key',key);else sessionStorage.removeItem('foshan-tianditu-key');
  terrain.setImagery(imageryId,tiandituKey);buildings.invalidate();attribution();$('#sourcePanel').classList.add('hidden');setStatus(`影像已切换：${IMAGERY_PROVIDERS[imageryId].label}`,'ok');updateData(true);
});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#sourcePanel').classList.add('hidden');$('#helpPanel').classList.add('hidden');inspector.hide();}else if(e.key.toLowerCase()==='h'&&!/input|select|textarea/i.test(document.activeElement?.tagName||''))flyHome();});

function telemetry(now) {
  frames++; if(now-fpsAt>=650){fps=frames*1000/(now-fpsAt);frames=0;fpsAt=now;adaptQuality(now);}
  const t=terrain.getStats(),b=buildings.getStats(),known=b.explicitHeight+b.overlayHeight+b.floorsHeight,ratio=b.rendered?known/b.rendered*100:0,g=targetGeo(),os=heightOverlay.getStatus();
  $('#fps').textContent=fps?fps.toFixed(0):'--'; $('#qualityStats').textContent=`${qualityMode==='auto'?'自动·':''}${QUALITY_PRESETS[runtimeQualityKey].label}`;
  $('#terrainStats').textContent=`${t.visible}/${t.visible+t.loading}${t.degraded?' · 降级':''}`; $('#buildingStats').textContent=`${b.rendered.toLocaleString()} 栋`;
  $('#heightStats').textContent=b.rendered?`${ratio.toFixed(0)}%`:'--'; $('#overlayStats').textContent=os.enabled?`${b.overlayHeight.toLocaleString()} 栋`:'未启用';
  $('#altitudeStats').textContent=`${Math.round(distance()).toLocaleString()} m`; $('#coordStats').textContent=`${g.lon.toFixed(4)}, ${g.lat.toFixed(4)}`;
  if(now-healthAt>2500){healthAt=now;if(t.failed&&t.visible===0)setStatus('地形数据暂不可用，移动视角会继续重试。','warn');else if(overture.lastError&&!b.rendered&&distance()<32000)setStatus('建筑瓦片暂不可用；请检查网络后移动视角重试。','warn');}
}
function animate(now=performance.now()) {
  requestAnimationFrame(animate); updateFly(); controls.enabled=!fly; controls.update(); updateSun(); if (!booting) updateData(false); telemetry(now);
  if(now-hashAt>900&&!fly){hashAt=now;history.replaceState(null,'',`${location.pathname}${location.search}#${viewHash()}`);} renderer.render(scene,camera);
}

initData();
animate();
