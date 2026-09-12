import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function checkPage(htmlPath, jsPath, requiredIds) {
  const html = await readFile(new URL(`../${htmlPath}`, import.meta.url), 'utf8');
  const main = await readFile(new URL(`../${jsPath}`, import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `${htmlPath}: duplicate HTML ids`);
  const refs = [...main.matchAll(/\$\(['"]#([^'"]+)['"]\)/g)].map(m => m[1]);
  for (const id of refs) assert.ok(ids.includes(id), `${jsPath} references missing #${id} in ${htmlPath}`);
  for (const required of requiredIds) assert.ok(ids.includes(required), `${htmlPath}: missing ${required}`);
}

await checkPage('legacy.html', 'src/main.js', ['scene','status','attribution','qualitySelect','imagerySelect','landmarkList','inspector']);
await checkPage('index.html', 'src/stage2/main.js', ['map','status','mode2dBtn','mode3dBtn','landmarkList','legacyBtn']);
console.log('dom: PASS');
