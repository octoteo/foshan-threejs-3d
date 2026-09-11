import * as THREE from 'three';
import { IMAGERY_PROVIDERS, RUNTIME, TERRARIUM_TEMPLATE } from '../config.js';
import { clamp, lonLatToTile, lonLatToTileFloat, lonLatToWorld, templateUrl, tileKey, tileToLonLat } from '../geo.js';
import { RequestQueue, retry } from './requestQueue.js';

function imageryUrl(provider, z, x, y, tiandituKey = '') {
  if (provider.id === 'tianditu') {
    const base = 'https://t0.tianditu.gov.cn/img_w/wmts';
    const params = new URLSearchParams({
      SERVICE: 'WMTS', REQUEST: 'GetTile', VERSION: '1.0.0', LAYER: 'img', STYLE: 'default',
      TILEMATRIXSET: 'w', FORMAT: 'tiles', TILECOL: String(x), TILEROW: String(y), TILEMATRIX: String(z), tk: tiandituKey
    });
    return `${base}?${params}`;
  }
  return templateUrl(provider.template, z, x, y);
}

async function fetchBitmap(url) {
  const response = await retry(async () => {
    const r = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }, { retries: RUNTIME.networkRetries, baseMs: RUNTIME.retryBaseMs });
  return createImageBitmap(await response.blob());
}

async function imageDataFromUrl(url) {
  const bitmap = await fetchBitmap(url);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function terrariumHeight(data, px, py) {
  const x = clamp(Math.round(px), 0, data.width - 1);
  const y = clamp(Math.round(py), 0, data.height - 1);
  const i = (y * data.width + x) * 4;
  return data.data[i] * 256 + data.data[i + 1] + data.data[i + 2] / 256 - 32768;
}

function buildGeometry(z, x, y, segments, heightData, originLon, originLat) {
  const vertexCount = (segments + 1) * (segments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(segments * segments * 6);
  let p = 0, uv = 0, ii = 0;
  for (let iy = 0; iy <= segments; iy++) {
    const v = iy / segments;
    for (let ix = 0; ix <= segments; ix++) {
      const u = ix / segments;
      const ll = tileToLonLat(x + u, y + v, z);
      const world = lonLatToWorld(ll.lon, ll.lat, originLon, originLat);
      const elevation = heightData ? terrariumHeight(heightData, u * (heightData.width - 1), v * (heightData.height - 1)) : 0;
      positions[p++] = world.x;
      positions[p++] = elevation;
      positions[p++] = world.z;
      uvs[uv++] = u;
      uvs[uv++] = 1 - v;
    }
  }
  for (let iy = 0; iy < segments; iy++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iy * (segments + 1) + ix;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices[ii++] = a; indices[ii++] = c; indices[ii++] = b;
      indices[ii++] = b; indices[ii++] = c; indices[ii++] = d;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export class TerrainTileManager {
  constructor({ scene, renderer, originLon, originLat, imageryId = 'eox2016', tiandituKey = '' }) {
    this.scene = scene;
    this.renderer = renderer;
    this.originLon = originLon;
    this.originLat = originLat;
    this.imageryId = imageryId;
    this.tiandituKey = tiandituKey;
    this.tiles = new Map();
    this.desired = new Set();
    this.generation = 0;
    this.queue = new RequestQueue(RUNTIME.terrainConcurrency);
    this.failed = 0;
  }

  setImagery(imageryId, tiandituKey = '') {
    if (this.imageryId === imageryId && this.tiandituKey === tiandituKey) return;
    this.imageryId = imageryId;
    this.tiandituKey = tiandituKey;
    this.invalidate();
  }

  chooseZoom(altitude) {
    if (altitude > 38000) return 9;
    if (altitude > 21000) return 10;
    if (altitude > 9000) return 11;
    if (altitude > 3600) return 12;
    if (altitude > 1200) return 13;
    return 14;
  }

  async update(lon, lat, altitude, quality) {
    const provider = IMAGERY_PROVIDERS[this.imageryId] || IMAGERY_PROVIDERS.eox2016;
    if (provider.id === 'tianditu' && !this.tiandituKey) return;
    const z = Math.max(provider.minZoom, Math.min(provider.maxZoom, this.chooseZoom(altitude)));
    const center = lonLatToTile(lon, lat, z);
    const radius = quality.terrainRadius;
    const desired = new Set();
    const requests = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = center.x + dx;
        const y = center.y + dy;
        const key = tileKey(z, x, y);
        desired.add(key);
        const existing = this.tiles.get(key);
        if (existing?.mesh && existing.provider === provider.id && existing.segments === quality.terrainSegments) {
          existing.mesh.visible = true;
          existing.lastUsed = performance.now();
        } else if (!existing?.loading) {
          const priority = dx * dx + dy * dy;
          requests.push(this.queue.add(() => this.loadTile(z, x, y, quality, provider, this.generation), priority));
        } else if (existing?.promise) requests.push(existing.promise);
      }
    }

    this.desired = desired;
    await Promise.allSettled(requests);
    for (const [key, tile] of this.tiles) if (tile.mesh) tile.mesh.visible = desired.has(key);
    this.prune(quality.terrainCache);
  }

  async loadTile(z, x, y, quality, provider, generation) {
    const key = tileKey(z, x, y);
    const old = this.tiles.get(key);
    if (old?.mesh) this.removeTile(key, old);

    const promise = (async () => {
      try {
        const elevationUrl = templateUrl(TERRARIUM_TEMPLATE, z, x, y);
        const [heightResult, imageResult] = await Promise.allSettled([
          imageDataFromUrl(elevationUrl),
          fetchBitmap(imageryUrl(provider, z, x, y, this.tiandituKey))
        ]);
        if (generation !== this.generation) {
          if (imageResult.status === 'fulfilled') imageResult.value.close?.();
          return;
        }
        const heightData = heightResult.status === 'fulfilled' ? heightResult.value : null;
        const geometry = buildGeometry(z, x, y, quality.terrainSegments, heightData, this.originLon, this.originLat);
        let texture = null;
        if (imageResult.status === 'fulfilled') {
          texture = new THREE.Texture(imageResult.value);
          texture.needsUpdate = true;
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 4);
        }
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          color: texture ? 0xffffff : 0x77806d,
          roughness: 0.98,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        mesh.frustumCulled = true;
        mesh.userData.tileKey = key;
        mesh.visible = this.desired.has(key);
        this.scene.add(mesh);
        this.tiles.set(key, {
          z, x, y, mesh, heightData, provider: provider.id, segments: quality.terrainSegments,
          degradedElevation: !heightData, degradedImagery: !texture, loading: false, lastUsed: performance.now()
        });
      } catch (error) {
        this.failed++;
        this.tiles.delete(key);
        console.warn('Terrain tile failed', key, error);
      }
    })();
    this.tiles.set(key, { loading: true, z, x, y, promise, provider: provider.id, segments: quality.terrainSegments, lastUsed: performance.now() });
    return promise;
  }

  sampleHeight(lon, lat) {
    let best = null;
    for (const tile of this.tiles.values()) {
      if (!tile.heightData || tile.loading) continue;
      const t = lonLatToTile(lon, lat, tile.z);
      if (t.x !== tile.x || t.y !== tile.y) continue;
      if (!best || tile.z > best.z) best = tile;
    }
    if (!best) return 0;
    const t = lonLatToTileFloat(lon, lat, best.z);
    const fx = t.x - best.x;
    const fy = t.y - best.y;
    return terrariumHeight(best.heightData, fx * (best.heightData.width - 1), fy * (best.heightData.height - 1));
  }

  getRaycastMeshes() {
    const list = [];
    for (const tile of this.tiles.values()) if (tile.mesh?.visible) list.push(tile.mesh);
    return list;
  }

  prune(limit) {
    const cached = [...this.tiles.entries()].filter(([, tile]) => tile.mesh && !tile.mesh.visible);
    cached.sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
    const removeCount = Math.max(0, this.tiles.size - limit);
    for (let i = 0; i < Math.min(removeCount, cached.length); i++) this.removeTile(cached[i][0], cached[i][1]);
  }

  removeTile(key, tile) {
    if (tile?.mesh) {
      this.scene.remove(tile.mesh);
      tile.mesh.geometry.dispose();
      tile.mesh.material.map?.image?.close?.();
      tile.mesh.material.map?.dispose();
      tile.mesh.material.dispose();
    }
    this.tiles.delete(key);
  }

  invalidate() {
    this.generation++;
    this.queue.clearPending();
    for (const [key, tile] of this.tiles) this.removeTile(key, tile);
    this.desired.clear();
  }

  clear() { this.invalidate(); }

  getStats() {
    let loaded = 0, loading = 0, visible = 0, degraded = 0;
    for (const tile of this.tiles.values()) {
      if (tile.loading) loading++;
      else if (tile.mesh) {
        loaded++;
        if (tile.mesh.visible) visible++;
        if (tile.degradedElevation || tile.degradedImagery) degraded++;
      }
    }
    return { loaded, loading, visible, cached: loaded - visible, failed: this.failed, degraded, imagery: this.imageryId };
  }
}
