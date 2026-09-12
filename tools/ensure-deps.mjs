import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(root, 'package-lock.json');
const nodeModules = join(root, 'node_modules');
const markerPath = join(nodeModules, '.foshan-package-lock.sha256');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const lockBytes = await readFile(lockPath);
const lockDigest = createHash('sha256').update(lockBytes).digest('hex');
let marker = '';
try {
  marker = (await readFile(markerPath, 'utf8')).trim();
} catch {
  // First Stage 2 launch, a deleted node_modules folder, or an older checkout.
}

let needsInstall = !(await exists(nodeModules)) || marker !== lockDigest;

if (!needsInstall) {
  const verify = spawnSync(npmCommand, ['ls', '--depth=0', '--silent'], {
    cwd: root,
    stdio: 'ignore',
    shell: false,
  });
  needsInstall = verify.status !== 0;
}

if (needsInstall) {
  console.log('[foshan] Dependencies are missing or out of date; synchronizing package-lock.json...');
  const install = spawnSync(
    npmCommand,
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: root, stdio: 'inherit', shell: false },
  );
  if (install.status !== 0) {
    console.error('[foshan] Dependency synchronization failed.');
    process.exit(install.status ?? 1);
  }

  await mkdir(nodeModules, { recursive: true });
  await writeFile(markerPath, `${lockDigest}\n`, 'utf8');
  console.log('[foshan] Dependencies synchronized.');
} else {
  console.log('[foshan] Dependencies are current.');
}
