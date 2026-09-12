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

function assertSupportedNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    console.error(`[foshan] Node.js ${process.versions.node} is not supported. Install Node.js >= 22.12 and retry.`);
    process.exit(1);
  }
}

function runNpm(args, { stdio = 'inherit' } = {}) {
  if (process.platform === 'win32') {
    // .cmd/.bat files cannot be executed directly by Node with shell:false on Windows.
    // This matters when run.sh is launched from Git Bash but resolves to Windows node.exe.
    const comspec = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe';
    return spawnSync(comspec, ['/d', '/s', '/c', ['npm', ...args].join(' ')], {
      cwd: root,
      stdio,
      shell: false,
    });
  }

  return spawnSync('npm', args, {
    cwd: root,
    stdio,
    shell: false,
  });
}

function reportSpawnFailure(result, action) {
  if (result.error) {
    console.error(`[foshan] Could not start npm while trying to ${action}: ${result.error.message}`);
  } else if (result.signal) {
    console.error(`[foshan] npm was terminated by signal ${result.signal} while trying to ${action}.`);
  } else {
    console.error(`[foshan] npm exited with code ${result.status ?? 'unknown'} while trying to ${action}.`);
  }
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

assertSupportedNode();

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
  const verify = runNpm(['ls', '--depth=0', '--silent'], { stdio: 'ignore' });
  needsInstall = verify.status !== 0 || Boolean(verify.error);
}

if (needsInstall) {
  console.log('[foshan] Dependencies are missing or out of date; synchronizing package-lock.json...');
  console.log(`[foshan] Runtime: Node ${process.versions.node} on ${process.platform}/${process.arch}`);

  const install = runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  if (install.status !== 0 || install.error) {
    reportSpawnFailure(install, 'synchronize dependencies');
    console.error('[foshan] Dependency synchronization failed.');
    console.error('[foshan] You can also run: npm ci --ignore-scripts --no-audit --no-fund');
    process.exit(install.status ?? 1);
  }

  await mkdir(nodeModules, { recursive: true });
  await writeFile(markerPath, `${lockDigest}\n`, 'utf8');
  console.log('[foshan] Dependencies synchronized.');
} else {
  console.log('[foshan] Dependencies are current.');
}
