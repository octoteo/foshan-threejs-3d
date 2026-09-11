import { lonLatToTile, pointInRing, tileKey } from '../geo.js';
import { buildBuildingTile, disposeBuildingTile } from '../render/buildingTile.js';
import { RequestQueue } from './requestQueue.js';
import { RUNTIME } from '../config.js';

export class BuildingTileManager {
  constructor({ scene, provider, materials, terrain, heightOverlay, originLon, originLat }) {
    this.scene = scene;
    this.provider = provider;
    this.materials = materials;
    this.terrain = terrain;
    this.heightOverlay = heightOverlay;
    this.originLon = originLon;
    this.originLat = originLat;
    this.tiles = new Map();
    this.desired = new Set();
    this.generation = 0;
    this.queue = new RequestQueue(RUNTIME.buildingConcurrency);
    this.lastStats = this.emptyStats();
    this.failed = 0;
  }

  emptyStats() {
    return { total: 0, rendered: 0, explicitHeight: 0, overlayHeight: 0, floorsHeight: 0, estimatedHeight: 0, roofs: 0, equipment: 0 };
  }

  chooseZoom(altitude, quality) {
    if (altitude > 32000) return null;
    let z = Math.min(14, quality.maxBuildingZoom);
    if (this.provider.header?.maxZoom != null) z = Math.min(z, this.provider.header.maxZoom);
    if (this.provider.header?.minZoom != null) z = Math.max(z, this.provider.header.minZoom);
    return z;
  }

  detailForAltitude(altitude) {
    return altitude <= 2600 ? 'near' : altitude <= 7600 ? 'medium' : 'far';
  }

  async update(lon, lat, altitude, quality) {
    const z = this.chooseZoom(altitude, quality);
    if (z == null) {
      this.hideAll();
      return;
    }
    const center = lonLatToTile(lon, lat, z);
    const detail = this.detailForAltitude(altitude);
    const radius = detail === 'far' ? 0 : quality.buildingRadius;
    const desired = new Set();
    const requests = [];
    const effectiveMinArea = quality.minBuildingArea * (z <= 12 ? 8 : detail === 'far' ? 4 : detail === 'medium' ? 1.8 : 1);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = center.x + dx;
        const y = center.y + dy;
        const key = tileKey(z, x, y);
        desired.add(key);
        const existing = this.tiles.get(key);
        if (existing?.group && existing.detail === detail && existing.minArea === effectiveMinArea) {
          existing.group.visible = true;
          existing.lastUsed = performance.now();
        } else if (!existing?.loading) {
          const priority = dx * dx + dy * dy;
          requests.push(this.queue.add(() => this.loadTile(z, x, y, effectiveMinArea, detail, this.generation), priority));
        } else if (existing?.promise) {
          requests.push(existing.promise);
        }
      }
    }

    this.desired = desired;
    await Promise.allSettled(requests);
    for (const [key, tile] of this.tiles) {
      if (tile.group) tile.group.visible = desired.has(key);
    }
    this.prune(quality.buildingCache);
    this.recomputeStats();
  }

  async loadTile(z, x, y, minArea, detail, generation) {
    const key = tileKey(z, x, y);
    const stale = this.tiles.get(key);
    if (stale?.group) this.removeTile(key, stale);

    const promise = (async () => {
      try {
        const [features, overlayResolver] = await Promise.all([
          this.provider.getFeatures(z, x, y),
          this.heightOverlay?.resolverForBuildingTile(z, x, y) || null
        ]);
        if (generation !== this.generation) return;
        const group = buildBuildingTile({
          features,
          originLon: this.originLon,
          originLat: this.originLat,
          minArea,
          materials: this.materials,
          terrain: this.terrain,
          overlayResolver,
          detail
        });
        group.userData.tileKey = key;
        group.visible = this.desired.has(key);
        this.scene.add(group);
        this.tiles.set(key, {
          z, x, y, group, stats: group.userData.stats, detail, minArea,
          lastUsed: performance.now(), loading: false
        });
      } catch (error) {
        this.failed++;
        this.tiles.delete(key);
        console.warn('Overture building tile failed', key, error);
      }
    })();

    this.tiles.set(key, { loading: true, z, x, y, promise, detail, minArea, lastUsed: performance.now() });
    return promise;
  }

  recomputeStats() {
    const total = this.emptyStats();
    for (const tile of this.tiles.values()) {
      if (!tile.group?.visible || !tile.stats) continue;
      for (const key of Object.keys(total)) total[key] += tile.stats[key] || 0;
    }
    this.lastStats = total;
  }

  pick(worldX, worldZ) {
    let best = null;
    for (const tile of this.tiles.values()) {
      if (!tile.group?.visible) continue;
      for (const item of tile.group.userData.pickables || []) {
        const b = item.bbox;
        if (worldX < b.minX || worldX > b.maxX || worldZ < b.minZ || worldZ > b.maxZ) continue;
        if (!pointInRing(worldX, worldZ, item.ring)) continue;
        if (!best || item.area < best.area) best = item;
      }
    }
    return best;
  }

  hideAll() {
    for (const tile of this.tiles.values()) if (tile.group) tile.group.visible = false;
    this.desired.clear();
    this.recomputeStats();
  }

  prune(limit) {
    const cached = [...this.tiles.entries()].filter(([, tile]) => tile.group && !tile.group.visible);
    cached.sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
    const removeCount = Math.max(0, this.tiles.size - limit);
    for (let i = 0; i < Math.min(removeCount, cached.length); i++) this.removeTile(cached[i][0], cached[i][1]);
  }

  removeTile(key, tile) {
    if (tile?.group) {
      this.scene.remove(tile.group);
      disposeBuildingTile(tile.group);
    }
    this.tiles.delete(key);
  }

  invalidate() {
    this.generation++;
    this.queue.clearPending();
    for (const [key, tile] of this.tiles) this.removeTile(key, tile);
    this.desired.clear();
    this.recomputeStats();
  }

  clearVisible() {
    this.invalidate();
  }

  getStats() {
    let loading = 0, loaded = 0, visibleTiles = 0;
    for (const tile of this.tiles.values()) {
      if (tile.loading) loading++;
      else if (tile.group) {
        loaded++;
        if (tile.group.visible) visibleTiles++;
      }
    }
    return { ...this.lastStats, loading, loaded, visibleTiles, cached: loaded - visibleTiles, failed: this.failed };
  }
}
