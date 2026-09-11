const urls = [
  ['Overture PMTiles', 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-08-19.0/buildings.pmtiles', { headers: { Range: 'bytes=0-16383' } }],
  ['Foshan Terrarium', 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/13/6670/3553.png', {}],
  ['Foshan EOX imagery', 'https://e.tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/13/3553/6670.jpg', {}]
];
for (const [name, url, options] of urls) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok && response.status !== 206) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 16) throw new Error(`${name}: empty response`);
    console.log(`network: ${name} PASS (${response.status}, ${bytes.length} bytes)`);
  } finally { clearTimeout(timer); }
}
