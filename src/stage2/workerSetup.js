import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre GL JS v6 uses an external ES-module worker. Under Vite the worker
// must go through Vite's worker pipeline so its shared imports are bundled.
setWorkerUrl(workerUrl);
document.documentElement.dataset.mapWorker = 'configured';
