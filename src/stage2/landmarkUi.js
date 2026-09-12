import { STAGE2_LANDMARKS } from './landmarks.js';

const list = document.querySelector('#landmarkList');

function syncLandmarkStatus() {
  if (!list) return;
  [...list.children].forEach((button, index) => {
    const place = STAGE2_LANDMARKS[index];
    if (!place) return;
    const delivered = place.model === 'reference-reconstruction';
    button.dataset.modelStatus = delivered ? 'delivered' : 'planned';
    const meta = button.querySelector('span');
    const badge = button.querySelector('em');
    if (meta) meta.textContent = delivered
      ? `${place.district} · 项目精细参考重建`
      : `${place.district} · 精模规划中`;
    if (badge) badge.textContent = delivered ? '精细重建' : '规划中';
  });
}

if (list) {
  new MutationObserver(syncLandmarkStatus).observe(list, { childList: true });
  syncLandmarkStatus();
}
