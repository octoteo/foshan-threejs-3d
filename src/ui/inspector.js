import { heightSourceLabel } from '../buildingHeights.js';

function text(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function appendRow(root, label, value) {
  const row = document.createElement('div');
  row.className = 'inspect-row';
  const key = document.createElement('span');
  key.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  row.append(key, strong);
  root.appendChild(row);
}

export class BuildingInspector {
  constructor(root) {
    this.root = root;
    this.title = root.querySelector('[data-inspector-title]');
    this.body = root.querySelector('[data-inspector-body]');
    root.querySelector('[data-inspector-close]')?.addEventListener('click', () => this.hide());
  }

  show(item) {
    if (!item) return this.hide();
    const p = item.properties || {};
    const height = item.heightInfo;
    const name = p.names?.primary || p.name || p.subtype || p.class || '建筑';
    this.title.textContent = text(name, '建筑');
    const rows = [
      ['高度', `${height.height.toFixed(1)} m`],
      ['高度来源', heightSourceLabel(height.source)],
      ['可信度', height.confidence === 'high' ? '高' : height.confidence === 'medium' ? '中' : '低（视觉估算）'],
      ['占地', `${Math.round(item.area).toLocaleString()} m²`],
      ['类型', text(p.subtype || p.class)],
      ['楼层', text(p.num_floors)],
      ['屋顶', text(p.roof_shape || item.roofShape)],
      ['立面材质', text(p.facade_material)],
      ['数据层', text(p.__layer)],
      ['Overture ID', text(p.__id)]
    ];
    this.body.replaceChildren();
    for (const [label, value] of rows) appendRow(this.body, label, value);
    if (!height.dataBacked) {
      const warning = document.createElement('p');
      warning.className = 'inspect-warning';
      warning.textContent = '此建筑缺少可用高度字段；当前高度只用于城市视觉表达，不代表实测值。';
      this.body.appendChild(warning);
    }
    this.root.classList.remove('hidden');
  }

  hide() { this.root.classList.add('hidden'); }
}
