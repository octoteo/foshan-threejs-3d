import * as THREE from 'three';

const palettes = {
  residential: ['#d7cfbf', '#c5b6a6', '#d4c4ae', '#b9bebf', '#d9d4c9'],
  commercial: ['#657784', '#768997', '#8999a3', '#5d6c76', '#78868d'],
  industrial: ['#aeb1aa', '#a19b90', '#90958f', '#b8b0a1', '#9fa6a4'],
  civic: ['#c8c0ac', '#b8b2a2', '#c5b69b', '#aaa79e', '#d0c7b6'],
  religious: ['#9e715a', '#ad8067', '#896454', '#a78a72', '#aa8f68'],
  default: ['#b8b1a5', '#a9afb0', '#c0b7a8', '#9fa5a4', '#c7c0b5']
};

const roofPalettes = {
  residential: ['#726c64', '#7b6d61', '#6e7375', '#8a7768'],
  commercial: ['#5a6268', '#737a7c', '#4f5d64', '#85898a'],
  industrial: ['#858a86', '#777d79', '#99958b', '#69716f'],
  civic: ['#7d766c', '#857a6c', '#686f70', '#9a8e7d'],
  religious: ['#5d6b55', '#815944', '#67584b', '#59705a'],
  default: ['#77756f', '#858077', '#686e6f', '#8a8278']
};

export function familyFor(properties = {}) {
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
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function explicitColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  if (/^[a-z]+$/i.test(v)) return v;
  return null;
}

function facadeMaps(family, baseColor) {
  const colorCanvas = document.createElement('canvas');
  const emitCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = emitCanvas.width = emitCanvas.height = 256;
  const ctx = colorCanvas.getContext('2d');
  const em = emitCanvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);
  em.fillStyle = '#000';
  em.fillRect(0, 0, 256, 256);

  const rows = family === 'industrial' ? 4 : family === 'commercial' ? 12 : family === 'residential' ? 10 : 8;
  const cols = family === 'industrial' ? 7 : family === 'commercial' ? 10 : 8;
  const cellW = 256 / cols;
  const cellH = 256 / rows;

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#fff';
  for (let r = 0; r < rows; r++) ctx.fillRect(0, r * cellH, 256, 1.3);
  ctx.globalAlpha = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const marginX = family === 'commercial' ? 2.4 : family === 'industrial' ? 8 : 5.5;
      const marginY = family === 'industrial' ? 9 : 5.5;
      const wx = c * cellW + marginX;
      const wy = r * cellH + marginY;
      const ww = Math.max(2, cellW - marginX * 2);
      const wh = Math.max(3, cellH - marginY * 2);
      ctx.fillStyle = family === 'commercial' ? '#213846' : family === 'industrial' ? '#42525a' : '#394950';
      ctx.globalAlpha = family === 'commercial' ? 0.79 : 0.58;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.globalAlpha = 1;

      if ((r * 7 + c * 13) % 11 === 0) {
        em.fillStyle = '#f7d9a4';
        em.globalAlpha = 0.82;
        em.fillRect(wx + 1, wy + 1, Math.max(1, ww - 2), Math.max(1, wh - 2));
      }

      if (family === 'residential' && r % 2 === 1) {
        ctx.fillStyle = 'rgba(235,235,225,.34)';
        ctx.fillRect(c * cellW + 2, r * cellH + cellH - 4.5, cellW - 4, 2.5);
      }
    }
  }

  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = color.wrapT = THREE.RepeatWrapping;
  color.repeat.set(family === 'industrial' ? 0.052 : 0.072, family === 'industrial' ? 0.045 : 0.07);

  const emissive = new THREE.CanvasTexture(emitCanvas);
  emissive.colorSpace = THREE.SRGBColorSpace;
  emissive.wrapS = emissive.wrapT = THREE.RepeatWrapping;
  emissive.repeat.copy(color.repeat);
  return { color, emissive };
}

function materialPhysics(value, family) {
  const text = String(value || '').toLowerCase();
  if (/glass/.test(text) || family === 'commercial') return { roughness: 0.32, metalness: 0.18 };
  if (/metal/.test(text)) return { roughness: 0.4, metalness: 0.55 };
  if (/stone|brick|concrete|plaster/.test(text)) return { roughness: 0.86, metalness: 0.01 };
  if (/wood/.test(text)) return { roughness: 0.78, metalness: 0 };
  return { roughness: family === 'industrial' ? 0.72 : 0.82, metalness: 0.02 };
}

export class BuildingMaterialLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.facades = new Map();
    this.roofs = new Map();
    this.nightFactor = 0;
    this.equipment = new THREE.MeshStandardMaterial({ color: 0x777b78, roughness: 0.72, metalness: 0.22 });
  }

  getFacade(properties = {}, id = '', lod = 'near') {
    const family = familyFor(properties);
    const explicit = explicitColor(properties.facade_color);
    const colors = palettes[family] || palettes.default;
    const baseColor = explicit || colors[stableIndex(id, colors.length)];
    const facadeMaterial = properties.facade_material || '';
    const key = `${lod}:${family}:${baseColor}:${facadeMaterial}`;
    if (this.facades.has(key)) return this.facades.get(key);

    const physics = materialPhysics(facadeMaterial, family);
    if (lod === 'far') {
      const material = new THREE.MeshStandardMaterial({ color: baseColor, roughness: Math.max(.65, physics.roughness), metalness: physics.metalness * .5 });
      material.userData.family = family;
      this.facades.set(key, material);
      return material;
    }

    const maps = facadeMaps(family, baseColor);
    const maxAniso = this.renderer?.capabilities?.getMaxAnisotropy?.() || 4;
    maps.color.anisotropy = maps.emissive.anisotropy = Math.min(8, maxAniso);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: maps.color,
      emissive: new THREE.Color(0xffcb85),
      emissiveMap: maps.emissive,
      emissiveIntensity: this.nightFactor * 1.25,
      roughness: physics.roughness,
      metalness: physics.metalness,
      envMapIntensity: 0.3
    });
    material.userData.family = family;
    this.facades.set(key, material);
    return material;
  }

  getRoof(properties = {}, id = '') {
    const family = familyFor(properties);
    const explicit = explicitColor(properties.roof_color);
    const colors = roofPalettes[family] || roofPalettes.default;
    const baseColor = explicit || colors[stableIndex(`${id}:roof`, colors.length)];
    const roofMaterial = String(properties.roof_material || '').toLowerCase();
    const key = `${family}:${baseColor}:${roofMaterial}`;
    if (this.roofs.has(key)) return this.roofs.get(key);
    const physics = materialPhysics(roofMaterial, family);
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: Math.max(0.48, physics.roughness),
      metalness: /metal/.test(roofMaterial) ? 0.42 : 0.03
    });
    this.roofs.set(key, material);
    return material;
  }

  setNightFactor(value) {
    this.nightFactor = Math.max(0, Math.min(1, value));
    for (const material of this.facades.values()) {
      if (material.emissiveMap) material.emissiveIntensity = this.nightFactor * 1.25;
    }
  }

  dispose() {
    for (const material of [...this.facades.values(), ...this.roofs.values()]) {
      material.map?.dispose();
      material.emissiveMap?.dispose();
      material.dispose();
    }
    this.equipment.dispose();
    this.facades.clear();
    this.roofs.clear();
  }
}
