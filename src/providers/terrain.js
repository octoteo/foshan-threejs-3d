import * as THREE from 'three';
import { IMAGERY_PROVIDERS, TERRARIUM_TEMPLATE } from '../config.js';
import { clamp, lonLatToTile, lonLatToWorld, templateUrl, tileKey, tileToLonLat } from '../geo.js';

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

async function imageDataFromUrl(url) {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
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

export class TerrainTileManager {
  constructor({ scene, originLon, originLat, imageryId = 'eox2016', tiandituKey = '' }) {
    this.scene = scene;
    this.originLon = originLon;
    this.originLat = originLat;
    this.imageryId = imageryId;
    this.tiandituKey = tiandituKey;
    this.tiles = new Map();
    this.desired = new Set();
    this.generation = 0;
  }

  setImagery(imageryId, tiandituKey = '') {
    if (this.imageryId === imageryId && this.tiandituKey === tiandituKey) return;
    this.imageryId = imageryId;
    this.tiandituKey = tiandituKey;
    this.clear();
  }

  chooseZoom(altitude) {
    if (altitude > 22000) return 10;
    if (altitude > 9000) return 11;
    if (altitude > 3500) return 12;
    return 13;
  }

  async update(lon, lat, altitude, quality) {
    const provider = IMAGERY_PROVIDERS[this.imageryId] || IMAGERY_PROVIDERS.eox2016;
    if (provider.id === 'tianditu' && !this.tiandituKey) return;
    const z = Math.min(provider.maxZoom, this.chooseZoom(altitude));
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
        if (!this.tiles.has(key)) requests.push(this.loadTile(z, x, y, quality, provider, this.generation));
      }
    }

    this.desired = desired;
    for (const [key, tile] of this.tiles) {
      if (!desired.has(key)) this.removeTile(key, tile);
    }
    await Promise.allSettled(requests);
  }

  async loadTile(z, x, y, quality, provider, generation) {
    const key = tileKey(z, x, y);
    this.tiles.set(key, { loading: true, z, x, y });
    try {
      const elevationUrl = templateUrl(TERRARIUM_TEMPLATE, z, x, y);
      const [heightResult, textureResult] = await Promise.allSettled([
        imageDataFromUrl(elevationUrl),
        new THREE.TextureLoader().loadAsync(imageryUrl(provider, z, x, y, this.tiandituKey))
      ]);
      if (generation !== this.generation || !this.desired.has(key)) {
        this.tiles.delete(key);
        if (textureResult.status === 'fulfilled') textureResult.value?.dispose?.();
        return;
      }

      const heightData = heightResult.status === 'fulfilled' ? heightResult.value : null;
      const segments = quality.terrainSegments;
      const vertexCount = (segments + 1) * (segments + 1);
      const positions = new Float32Array(vertexCount * 3);
      const uvs = new Float32Array(vertexCount * 2);
      const indices = [];

      let p = 0, uv = 0;
      for (let iy = 0; iy <= segments; iy++) {
        const v = iy / segments;
        for (let ix = 0; ix <= segments; ix++) {
          const u = ix / segments;
          const ll = tileToLonLat(x + u, y + v, z);
          const world = lonLatToWorld(ll.lon, ll.lat, this.originLon, this.originLat);
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
          indices.push(a, c, b, b, c, d);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const texture = textureResult.status === 'fulfilled' ? textureResult.value : null;
      if (texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
      }
      const material = new THREE.MeshStandardMaterial({ map: texture, color: texture ? 0xffffff : 0x7a8173, roughness: 1, metalness: 0 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.tiles.set(key, { z, x, y, mesh, heightData, provider: provider.id });
    } catch (error) {
      this.tiles.delete(key);
      console.warn('Terrain tile failed', key, error);
    }
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
    const n = 2 ** best.z;
    const fx = ((lon + 180) / 360 * n) - best.x;
    const latRad = lat * Math.PI / 180;
    const fy = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n) - best.y;
    return terrariumHeight(best.heightData, fx * (best.heightData.width - 1), fy * (best.heightData.height - 1));
  }

  removeTile(key, tile) {
    if (tile?.mesh) {
      this.scene.remove(tile.mesh);
      tile.mesh.geometry.dispose();
      tile.mesh.material.map?.dispose();
      tile.mesh.material.dispose();
    }
    this.tiles.delete(key);
  }

  clear() {
    this.generation++;
    for (const [key, tile] of this.tiles) this.removeTile(key, tile);
    this.desired.clear();
  }

  getStats() {
    let loaded = 0, loading = 0;
    for (const tile of this.tiles.values()) tile.loading ? loading++ : loaded++;
    return { loaded, loading, imagery: this.imageryId };
  }
}
