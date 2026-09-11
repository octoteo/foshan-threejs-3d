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

export function lonLatToTileFloat(lon, lat, z) {
  const n = 2 ** z;
  const safeLat = clamp(lat, -MAX_LAT, MAX_LAT);
  const x = ((lon + 180) / 360) * n;
  const latRad = safeLat * DEG;
  const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n;
  return { x, y, z };
}

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const t = lonLatToTileFloat(lon, lat, z);
  return { x: clamp(Math.floor(t.x), 0, n - 1), y: clamp(Math.floor(t.y), 0, n - 1), z };
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
  const count = pts.length;
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % count];
    twice += a.x * b.z - b.x * a.z;
  }
  return Math.abs(twice) * 0.5;
}

export function polygonCentroid(ring) {
  if (!ring?.length) return null;
  let lon = 0, lat = 0, count = 0;
  const limit = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
    ? ring.length - 1
    : ring.length;
  for (let i = 0; i < limit; i++) {
    const point = ring[i];
    if (!Array.isArray(point) || point.length < 2) continue;
    lon += point[0]; lat += point[1]; count++;
  }
  return count ? [lon / count, lat / count] : null;
}

export function metersBetween(lon1, lat1, lon2, lat2) {
  const x = (lon2 - lon1) * DEG * R * Math.cos(((lat1 + lat2) * 0.5) * DEG);
  const y = (lat2 - lat1) * DEG * R;
  return Math.hypot(x, y);
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, zi = ring[i].z;
    const xj = ring[j].x, zj = ring[j].z;
    const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
