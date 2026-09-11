import { HEIGHT_OVERLAY_MANIFEST } from '../config.js';
import { lonLatToTile, metersBetween, templateUrl, tileKey } from '../geo.js';

export class HeightOverlayProvider {
  constructor(manifestUrl = HEIGHT_OVERLAY_MANIFEST) {
    this.manifestUrl = manifestUrl;
    this.manifest = null;
    this.enabled = false;
    this.cache = new Map();
  }

  async init() {
    try {
      const response = await fetch(this.manifestUrl, { cache: 'no-cache' });
      if (!response.ok) return this;
      this.manifest = await response.json();
      this.enabled = Boolean(this.manifest?.enabled && this.manifest?.template && Number.isInteger(this.manifest?.zoom));
    } catch {
      this.enabled = false;
    }
    return this;
  }

  async loadTile(z, x, y) {
    if (!this.enabled) return [];
    const key = tileKey(z, x, y);
    if (this.cache.has(key)) return this.cache.get(key);
    const url = templateUrl(this.manifest.template, z, x, y);
    const promise = fetch(url)
      .then(response => response.ok ? response.json() : null)
      .then(json => Array.isArray(json?.points) ? json.points : [])
      .catch(() => []);
    this.cache.set(key, promise);
    return promise;
  }

  async resolverForBuildingTile(buildingZ, buildingX, buildingY) {
    if (!this.enabled) return null;
    const z = this.manifest.zoom;
    const loads = [];
    if (z >= buildingZ) {
      const scale = 2 ** (z - buildingZ);
      const minX = Math.floor(buildingX * scale);
      const minY = Math.floor(buildingY * scale);
      const maxX = Math.ceil((buildingX + 1) * scale) - 1;
      const maxY = Math.ceil((buildingY + 1) * scale) - 1;
      for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) loads.push(this.loadTile(z, x, y));
    } else {
      const scale = 2 ** (buildingZ - z);
      const x = Math.floor(buildingX / scale);
      const y = Math.floor(buildingY / scale);
      loads.push(this.loadTile(z, x, y));
    }
    const nested = await Promise.all(loads);
    const points = nested.flat();
    if (!points.length) return null;
    const maxDistance = Number(this.manifest.maxDistanceMeters) || 35;
    const source = this.manifest.source || 'open-height-overlay';
    const confidence = this.manifest.confidence || 'medium';
    return (lon, lat) => {
      let best = null;
      let bestDistance = maxDistance;
      for (const point of points) {
        if (!Array.isArray(point) || point.length < 3) continue;
        const d = metersBetween(lon, lat, Number(point[0]), Number(point[1]));
        if (d < bestDistance && Number(point[2]) > 0) {
          bestDistance = d;
          best = { height: Number(point[2]), source: point[3] || source, confidence, distance: d };
        }
      }
      return best;
    };
  }

  getStatus() {
    return {
      enabled: this.enabled,
      name: this.manifest?.name || '未启用',
      source: this.manifest?.source || null
    };
  }
}
