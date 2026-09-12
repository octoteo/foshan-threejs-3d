import { OVERTURE_BASE_URL, OVERTURE_BUILDINGS_URL, OVERTURE_TRANSPORTATION_URL } from '../config.js';

if (new URLSearchParams(location.search).has('diagnostics')) {
  document.documentElement.dataset.browserDiagnostics = 'running';
  const probes = [
    ['base', OVERTURE_BASE_URL],
    ['transportation', OVERTURE_TRANSPORTATION_URL],
    ['buildings', OVERTURE_BUILDINGS_URL]
  ];
  Promise.all(probes.map(async ([name, url]) => {
    const key = `browserRange${name[0].toUpperCase()}${name.slice(1)}`;
    try {
      const response = await fetch(url, { headers: { Range: 'bytes=0-16383' }, cache: 'no-store' });
      const bytes = await response.arrayBuffer();
      document.documentElement.dataset[key] = `${response.status}:${bytes.byteLength}`;
      return response.ok || response.status === 206;
    } catch (error) {
      document.documentElement.dataset[key] = `error:${String(error?.message || error).slice(0, 120)}`;
      return false;
    }
  })).then(results => {
    document.documentElement.dataset.browserDiagnostics = results.every(Boolean) ? 'pass' : 'fail';
  });
}
