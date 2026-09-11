import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import { OVERTURE_BUILDINGS_URL } from '../config.js';

export class OvertureBuildingsProvider {
  constructor(url = OVERTURE_BUILDINGS_URL) {
    this.url = url;
    this.archive = new PMTiles(url);
    this.header = null;
    this.metadata = null;
  }

  async init() {
    [this.header, this.metadata] = await Promise.all([
      this.archive.getHeader(),
      this.archive.getMetadata().catch(() => ({}))
    ]);
    return this;
  }

  async getFeatures(z, x, y) {
    const response = await this.archive.getZxy(z, x, y);
    if (!response?.data) return [];

    const tile = new VectorTile(new Protobuf(response.data));
    const features = [];
    const partsLayer = tile.layers.building_part;
    const buildingLayer = tile.layers.building;

    if (buildingLayer) {
      for (let i = 0; i < buildingLayer.length; i++) {
        const feature = buildingLayer.feature(i);
        if (feature.properties?.is_underground) continue;
        if (feature.properties?.has_parts && partsLayer) continue;
        const geo = feature.toGeoJSON(x, y, z);
        geo.properties = { ...feature.properties, __layer: 'building', __id: feature.id ?? feature.properties?.id ?? `${z}/${x}/${y}/b/${i}` };
        features.push(geo);
      }
    }

    if (partsLayer) {
      for (let i = 0; i < partsLayer.length; i++) {
        const feature = partsLayer.feature(i);
        if (feature.properties?.is_underground) continue;
        const geo = feature.toGeoJSON(x, y, z);
        geo.properties = { ...feature.properties, __layer: 'building_part', __id: feature.id ?? feature.properties?.id ?? `${z}/${x}/${y}/p/${i}` };
        features.push(geo);
      }
    }

    return features;
  }
}
