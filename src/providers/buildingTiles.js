import { lonLatToTile, tileKey } from '../geo.js';
import { buildBuildingTile, disposeBuildingTile } from '../render/buildingTile.js';

export class BuildingTileManager {
  constructor({ scene, provider, materials, terrain, originLon, originLat }) {
    this.scene = scene;
    this.provider = provider;
    this.materials = materials;
    this.terrain = terrain;
    this.originLon = originLon;
    this.originLat = originLat;
    this.tiles = new Map();
    this.desired = new Set();
    this.generation = 0;
    this.lastStats = { total: 0, rendered: 0, explicitHeight: 0, floorsHeight: 0, estimatedHeight: 0 };
  }

  chooseZoom(altitude) {
    if (altitude > 6500) return null;
    if (altitude > 1800) return 14;
    return 15;
  }

  async update(lon, lat, altitude, quality) {
    let z = this.chooseZoom(altitude);
    if (z == null) {
      this.clearVisible();
      return;
    }
    if (this.provider.header?.maxZoom != null) z = Math.min(z, this.provider.header.maxZoom);
    if (this.provider.header?.minZoom != null) z = Math.max(z, this.provider.header.minZoom);

    const center = lonLatToTile(lon, lat, z);
    const radius = quality.buildingRadius;
    const desired = new Set();
    const requests = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = center.x + dx;
        const y = center.y + dy;
        const key = tileKey(z, x, y);
        desired.add(key);
        if (!this.tiles.has(key)) requests.push(this.loadTile(z, x, y, quality, this.generation));
      }
    }
    this.desired = desired;
    for (const [key, tile] of this.tiles) if (!desired.has(key)) this.removeTile(key, tile);
    await Promise.allSettled(requests);
    this.recomputeStats();
  }

  async loadTile(z, x, y, quality, generation) {
    const key = tileKey(z, x, y);
    this.tiles.set(key, { loading: true, z, x, y });
    try {
      const features = await this.provider.getFeatures(z, x, y);
      if (generation !== this.generation || !this.desired.has(key)) {
        this.tiles.delete(key);
        return;
      }
      const group = buildBuildingTile({
        features,
        originLon: this.originLon,
        originLat: this.originLat,
        minArea: quality.minBuildingArea,
        materials: this.materials,
        terrain: this.terrain
      });
      group.userData.tileKey = key;
      this.scene.add(group);
      this.tiles.set(key, { z, x, y, group, stats: group.userData.stats });
    } catch (error) {
      this.tiles.delete(key);
      console.warn('Overture building tile failed', key, error);
    }
  }

  recomputeStats() {
    const total = { total: 0, rendered: 0, explicitHeight: 0, floorsHeight: 0, estimatedHeight: 0 };
    for (const tile of this.tiles.values()) {
      const s = tile.stats;
      if (!s) continue;
      for (const key of Object.keys(total)) total[key] += s[key] || 0;
    }
    this.lastStats = total;
  }

  removeTile(key, tile) {
    if (tile?.group) {
      this.scene.remove(tile.group);
      disposeBuildingTile(tile.group);
    }
    this.tiles.delete(key);
  }

  clearVisible() {
    this.generation++;
    for (const [key, tile] of this.tiles) this.removeTile(key, tile);
    this.desired.clear();
    this.recomputeStats();
  }

  getStats() {
    let loading = 0, loaded = 0;
    for (const tile of this.tiles.values()) tile.loading ? loading++ : loaded++;
    return { ...this.lastStats, loading, loaded };
  }
}
