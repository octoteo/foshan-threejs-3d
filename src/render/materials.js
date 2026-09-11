import * as THREE from 'three';

const palette = {
  residential: ['#d8d0c2', '#c8b9aa', '#d7c7b1', '#b9bebf'],
  commercial: ['#6c7b86', '#7f8d97', '#8795a1', '#5f6b73'],
  industrial: ['#aeb2ad', '#a69f92', '#8f9490', '#b7b0a3'],
  civic: ['#c8c1ad', '#b8b2a4', '#c5b8a0', '#aaa69d'],
  religious: ['#9e725d', '#b1846c', '#8a6658', '#a68b76'],
  default: ['#b7b1a6', '#a9afb0', '#c1b8aa', '#9fa5a4']
};

function familyFor(properties = {}) {
  const text = `${properties.subtype || ''} ${properties.class || ''}`.toLowerCase();
  if (/residential|apart|dwelling|house/.test(text)) return 'residential';
  if (/commercial|office|retail|hotel/.test(text)) return 'commercial';
  if (/industrial|warehouse|factory|manufactur/.test(text)) return 'industrial';
  if (/religious|temple|church|mosque/.test(text)) return 'religious';
  if (/civic|education|medical|school|hospital|government/.test(text)) return 'civic';
  return 'default';
}

function stableIndex(text, length) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

function facadeCanvas(family, baseColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);

  const rows = family === 'industrial' ? 4 : family === 'commercial' ? 10 : 8;
  const cols = family === 'industrial' ? 6 : family === 'commercial' ? 10 : 8;
  const cellW = 256 / cols;
  const cellH = 256 / rows;

  ctx.globalAlpha = 0.11;
  ctx.fillStyle = '#ffffff';
  for (let r = 0; r < rows; r++) ctx.fillRect(0, r * cellH, 256, 1);

  ctx.globalAlpha = family === 'commercial' ? 0.72 : 0.48;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const marginX = family === 'commercial' ? 3 : 6;
      const marginY = family === 'industrial' ? 10 : 6;
      ctx.fillStyle = family === 'commercial' ? '#263b49' : '#42515b';
      ctx.fillRect(c * cellW + marginX, r * cellH + marginY, cellW - marginX * 2, Math.max(3, cellH - marginY * 2));
      if (family === 'residential' && r % 2 === 0) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#d6d9d2';
        ctx.fillRect(c * cellW + 2, r * cellH + cellH - 5, cellW - 4, 3);
        ctx.globalAlpha = 0.48;
      }
    }
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(family === 'industrial' ? 0.06 : 0.08, family === 'industrial' ? 0.045 : 0.065);
  texture.anisotropy = 4;
  return texture;
}

export class BuildingMaterialLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
  }

  get(properties = {}, id = '') {
    const family = familyFor(properties);
    const explicit = typeof properties.facade_color === 'string' && /^#[0-9a-f]{3,6}$/i.test(properties.facade_color)
      ? properties.facade_color
      : null;
    const colors = palette[family] || palette.default;
    const baseColor = explicit || colors[stableIndex(String(id), colors.length)];
    const key = `${family}:${baseColor}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const map = facadeCanvas(family, baseColor);
    if (this.renderer?.capabilities?.getMaxAnisotropy) map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map,
      roughness: family === 'commercial' ? 0.48 : 0.82,
      metalness: family === 'commercial' ? 0.12 : 0.02,
      envMapIntensity: 0.35
    });
    material.userData.family = family;
    this.cache.set(key, material);
    return material;
  }

  dispose() {
    for (const material of this.cache.values()) {
      material.map?.dispose();
      material.dispose();
    }
    this.cache.clear();
  }
}
