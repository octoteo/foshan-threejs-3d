import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { OVERTURE_BUILDINGS_URL, RUNTIME } from '../config.js';
import { retry } from './requestQueue.js';

export class OvertureBuildingsProvider {
  constructor(url = OVERTURE_BUILDINGS_URL) {
    this.url = url;
    this.archive = new PMTiles(url);
    this.header = null;
    this.metadata = null;
    this.lastError = null;
    this.requests = 0;
  }

  async init() {
    [this.header, this.metadata] = await Promise.all([
      retry(() => this.archive.getHeader(), { retries: RUNTIME.networkRetries, baseMs: RUNTIME.retryBaseMs }),
      this.archive.getMetadata().catch(() => ({}))
    ]);
    return this;
  }

  async getFeatures(z, x, y) {
    this.requests++;
    try {
      const response = await retry(() => this.archive.getZxy(z, x, y), {
        retries: RUNTIME.networkRetries,
        baseMs: RUNTIME.retryBaseMs
      });
      if (!response?.data) return [];
      const tile = new VectorTile(new PbfReader(response.data));
      const features = [];
      const partsLayer = tile.layers.building_part;
      const buildingLayer = tile.layers.building;

      if (buildingLayer) {
        for (let i = 0; i < buildingLayer.length; i++) {
          const feature = buildingLayer.feature(i);
          const p = feature.properties || {};
          if (p.is_underground) continue;
          if (p.has_parts && partsLayer) continue;
          const geo = feature.toGeoJSON(x, y, z);
          geo.properties = { ...p, __layer: 'building', __id: feature.id ?? p.id ?? `${z}/${x}/${y}/b/${i}` };
          features.push(geo);
        }
      }

      if (partsLayer) {
        for (let i = 0; i < partsLayer.length; i++) {
          const feature = partsLayer.feature(i);
          const p = feature.properties || {};
          if (p.is_underground) continue;
          const geo = feature.toGeoJSON(x, y, z);
          geo.properties = { ...p, __layer: 'building_part', __id: feature.id ?? p.id ?? `${z}/${x}/${y}/p/${i}` };
          features.push(geo);
        }
      }
      this.lastError = null;
      return features;
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  getStatus() {
    return {
      connected: Boolean(this.header),
      minZoom: this.header?.minZoom,
      maxZoom: this.header?.maxZoom,
      requests: this.requests,
      error: this.lastError?.message || null
    };
  }
}
