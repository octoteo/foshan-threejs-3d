function positiveNumber(value) {
  if (typeof value === 'string') value = value.replace(/\s*m(?:eters?)?\s*$/i, '').trim();
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function family(properties = {}) {
  const text = `${properties.subtype || ''} ${properties.class || ''}`.toLowerCase();
  if (/industrial|warehouse|factory|manufactur/.test(text)) return 'industrial';
  if (/commercial|office|retail|hotel/.test(text)) return 'commercial';
  if (/residential|apart|dwelling|house/.test(text)) return 'residential';
  if (/civic|education|medical|school|hospital|government/.test(text)) return 'civic';
  if (/religious|temple|church|mosque/.test(text)) return 'religious';
  return 'default';
}

function stableUnit(text = '') {
  let hash = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function floorHeightFor(properties) {
  switch (family(properties)) {
    case 'commercial': return 3.65;
    case 'industrial': return 4.4;
    case 'civic': return 3.8;
    case 'religious': return 3.6;
    default: return 3.2;
  }
}

export function resolveBuildingHeight(properties = {}, footprintArea = 100, overlay = null) {
  const explicit = positiveNumber(properties.height);
  if (explicit) return { height: explicit, source: 'overture-height', confidence: 'high', dataBacked: true };

  const overlayHeight = positiveNumber(overlay?.height);
  if (overlayHeight) {
    return {
      height: overlayHeight,
      source: overlay.source || 'open-height-overlay',
      confidence: overlay.confidence || 'medium',
      dataBacked: true
    };
  }

  const floors = positiveNumber(properties.num_floors);
  if (floors) return {
    height: floors * floorHeightFor(properties),
    source: 'overture-num-floors', confidence: 'medium', dataBacked: true
  };

  const area = Math.max(20, Number(footprintArea) || 100);
  const span = Math.sqrt(area);
  const f = family(properties);
  let height;
  if (f === 'industrial') height = 7.2 + Math.min(10, span * 0.09);
  else if (f === 'commercial') height = 15 + Math.min(78, span * 0.68);
  else if (f === 'residential') height = area < 110 ? 10.2 : area < 280 ? 18.5 : area < 850 ? 34 : 53;
  else if (f === 'civic' || f === 'religious') height = 11 + Math.min(30, span * 0.3);
  else height = 8 + Math.min(44, span * 0.36);

  const id = properties.__id || properties.id || `${properties.subtype || ''}:${area.toFixed(1)}`;
  const variation = 0.92 + stableUnit(id) * 0.16;
  return {
    height: Math.round(height * variation * 10) / 10,
    source: 'deterministic-visual-estimate', confidence: 'low', dataBacked: false
  };
}

export function resolveMinHeight(properties = {}) {
  const explicit = positiveNumber(properties.min_height);
  if (explicit) return explicit;
  const floor = positiveNumber(properties.min_floor);
  return floor ? floor * floorHeightFor(properties) : 0;
}

export function resolveRoofHeight(properties = {}, totalHeight = 12) {
  const explicit = positiveNumber(properties.roof_height);
  if (explicit) return Math.min(explicit, totalHeight * 0.35);
  const shape = String(properties.roof_shape || '').toLowerCase();
  if (!shape || /flat|unknown/.test(shape)) return 0;
  if (/dome|onion/.test(shape)) return Math.min(7, Math.max(2, totalHeight * 0.18));
  if (/cone|pyramid|hip|gable|mansard|skillion/.test(shape)) return Math.min(5.5, Math.max(1.3, totalHeight * 0.12));
  return 0;
}

export function heightSourceLabel(source) {
  const labels = {
    'overture-height': 'Overture 实际高度字段',
    'overture-num-floors': 'Overture 楼层数换算',
    '3d-globfp': '3D-GloBFP 高度增强',
    'cnbh-10m': 'CNBH-10m 高度增强',
    'open-height-overlay': '开放高度增强',
    'deterministic-visual-estimate': '视觉估算'
  };
  return labels[source] || source;
}
