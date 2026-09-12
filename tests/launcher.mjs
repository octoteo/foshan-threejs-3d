import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [shell, batch, helper] = await Promise.all([
  readFile(new URL('../run.sh', import.meta.url), 'utf8'),
  readFile(new URL('../run.bat', import.meta.url), 'utf8'),
  readFile(new URL('../tools/ensure-deps.mjs', import.meta.url), 'utf8'),
]);

assert.ok(shell.includes('node tools/ensure-deps.mjs'), 'run.sh uses dependency synchronizer');
assert.ok(batch.includes('node tools\\ensure-deps.mjs'), 'run.bat uses dependency synchronizer');
assert.ok(!shell.includes('[ ! -d node_modules ]'), 'run.sh does not trust node_modules existence alone');
assert.ok(!batch.includes('if not exist node_modules'), 'run.bat does not trust node_modules existence alone');
assert.ok(helper.includes("package-lock.json"), 'dependency state is bound to package-lock.json');
assert.ok(helper.includes('.foshan-package-lock.sha256'), 'lockfile digest marker is persisted');
assert.ok(helper.includes("['ls', '--depth=0', '--silent']"), 'top-level installed packages are verified');
assert.ok(helper.includes("['ci', '--ignore-scripts', '--no-audit', '--no-fund']"), 'stale installs are repaired with npm ci');
assert.ok(helper.includes("process.platform === 'win32' ? 'npm.cmd' : 'npm'"), 'npm invocation is cross-platform');

console.log('launcher: PASS');
