function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveBuildingHeight(properties = {}, footprintArea = 100) {
  const explicit = positiveNumber(properties.height);
  if (explicit) return { height: explicit, source: 'overture-height', confidence: 'high' };

  const floors = positiveNumber(properties.num_floors);
  if (floors) return { height: floors * 3.2, source: 'overture-num-floors', confidence: 'medium' };

  const subtype = String(properties.subtype || '').toLowerCase();
  const klass = String(properties.class || '').toLowerCase();
  const area = Math.max(20, Number(footprintArea) || 100);
  const span = Math.sqrt(area);

  let height;
  if (/industrial|warehouse|factory|manufactur/.test(`${subtype} ${klass}`)) {
    height = 7 + Math.min(9, span * 0.08);
  } else if (/commercial|office|retail|hotel/.test(`${subtype} ${klass}`)) {
    height = 16 + Math.min(70, span * 0.65);
  } else if (/residential|apart|dwelling|house/.test(`${subtype} ${klass}`)) {
    height = area < 120 ? 10.5 : area < 300 ? 18 : area < 900 ? 33 : 52;
  } else if (/civic|education|medical|religious/.test(`${subtype} ${klass}`)) {
    height = 12 + Math.min(28, span * 0.28);
  } else {
    height = 8 + Math.min(42, span * 0.35);
  }

  return { height: Math.round(height * 10) / 10, source: 'deterministic-visual-estimate', confidence: 'low' };
}

export function resolveMinHeight(properties = {}) {
  const explicit = positiveNumber(properties.min_height);
  if (explicit) return explicit;
  const floor = positiveNumber(properties.min_floor);
  return floor ? floor * 3.2 : 0;
}
