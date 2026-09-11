export const FOSHAN = Object.freeze({
  name: '佛山',
  center: [113.1214, 23.0218],
  bounds: [112.55, 22.62, 113.39, 23.58]
});

export const APP_VERSION = '1.0.0';
export const OVERTURE_RELEASE = '2026-08-19.0';
export const OVERTURE_BUILDINGS_URL = `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${OVERTURE_RELEASE}/buildings.pmtiles`;
export const TERRARIUM_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const HEIGHT_OVERLAY_MANIFEST = './data/heights/manifest.json';
export const LANDMARK_MODEL_MANIFEST = './assets/landmarks/manifest.json';

export const IMAGERY_PROVIDERS = Object.freeze({
  eox2016: {
    id: 'eox2016',
    label: 'EOX Sentinel-2 2016 · CC BY 4.0',
    template: 'https://e.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
    minZoom: 0,
    maxZoom: 13,
    attribution: 'Sentinel-2 cloudless by EOX IT Services GmbH · Contains modified Copernicus Sentinel data 2016/2017',
    license: 'CC BY 4.0'
  },
  eox2024: {
    id: 'eox2024',
    label: 'EOX Sentinel-2 2024 · 非商业',
    template: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
    minZoom: 0,
    maxZoom: 14,
    attribution: 'EOxCloudless by EOX IT Services GmbH · Contains modified Copernicus Sentinel data 2024',
    license: 'CC BY-NC-SA 4.0'
  },
  tianditu: {
    id: 'tianditu',
    label: '天地图影像 · 需要开发 Key',
    minZoom: 1,
    maxZoom: 18,
    attribution: '天地图 / 天地图·广东',
    license: '按天地图开发授权执行'
  }
});

export const QUALITY_PRESETS = Object.freeze({
  performance: {
    label: '性能', terrainSegments: 18, terrainRadius: 1, buildingRadius: 1,
    minBuildingArea: 55, pixelRatio: 1.0, maxBuildingZoom: 14, shadows: false,
    terrainCache: 28, buildingCache: 18
  },
  balanced: {
    label: '均衡', terrainSegments: 30, terrainRadius: 1, buildingRadius: 1,
    minBuildingArea: 24, pixelRatio: 1.35, maxBuildingZoom: 15, shadows: true,
    terrainCache: 42, buildingCache: 24
  },
  ultra: {
    label: '超清', terrainSegments: 46, terrainRadius: 2, buildingRadius: 1,
    minBuildingArea: 10, pixelRatio: 1.8, maxBuildingZoom: 15, shadows: true,
    terrainCache: 72, buildingCache: 32
  }
});

export const RUNTIME = Object.freeze({
  terrainConcurrency: 5,
  buildingConcurrency: 4,
  networkRetries: 2,
  retryBaseMs: 240,
  dataUpdateMinMs: 420,
  adaptiveDownFps: 32,
  adaptiveUpFps: 54,
  adaptiveWindowMs: 5000,
  maxCameraDistance: 115000,
  minCameraDistance: 55
});
