const DEG = Math.PI / 180;
const R = 6378137;
const MAX_LAT = 85.05112878;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lonLatToWorld(lon, lat, originLon, originLat) {
  const x = (lon - originLon) * DEG * R * Math.cos(originLat * DEG);
  const north = (lat - originLat) * DEG * R;
  return { x, z: -north };
}

export function worldToLonLat(x, z, originLon, originLat) {
  const lon = originLon + x / (DEG * R * Math.cos(originLat * DEG));
  const lat = originLat - z / (DEG * R);
  return { lon, lat };
}

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const safeLat = clamp(lat, -MAX_LAT, MAX_LAT);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = safeLat * DEG;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1), z };
}

export function tileToLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = x / n * 360 - 180;
  const mercY = Math.PI * (1 - 2 * y / n);
  const lat = Math.atan(Math.sinh(mercY)) / DEG;
  return { lon, lat };
}

export function tileBounds(x, y, z) {
  const nw = tileToLonLat(x, y, z);
  const se = tileToLonLat(x + 1, y + 1, z);
  return { west: nw.lon, north: nw.lat, east: se.lon, south: se.lat };
}

export function tileKey(z, x, y) {
  return `${z}/${x}/${y}`;
}

export function templateUrl(template, z, x, y) {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export function polygonAreaMeters(ring, originLon, originLat) {
  if (!ring || ring.length < 3) return 0;
  let twice = 0;
  const pts = ring.map(([lon, lat]) => lonLatToWorld(lon, lat, originLon, originLat));
  for (let i = 0; i < pts.length - 1; i++) twice += pts[i].x * pts[i + 1].z - pts[i + 1].x * pts[i].z;
  return Math.abs(twice) * 0.5;
}

export function polygonCentroid(ring) {
  if (!ring?.length) return null;
  let lon = 0, lat = 0, count = 0;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    lon += point[0]; lat += point[1]; count++;
  }
  return count ? [lon / count, lat / count] : null;
}
