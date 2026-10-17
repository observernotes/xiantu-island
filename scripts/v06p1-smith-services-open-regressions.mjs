// Compatibility entry point: use the current 22-suite test-only adapter and soft output guards.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runner = path.join(root, 'scripts/v06p1-smith-services-open-regression.mjs');
const args = process.argv.slice(2);
const run = args => {
  const child = spawnSync(process.execPath, [runner, ...args], { cwd: root,
    env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `smith soft-open regression step ${args.join(' ')} exit zero`);
};
if (args.length === 1 && args[0] === '--summarize') run(['summarize']);
else {
  const auditNames = ['tsc', 'datalint-shared', 'datalint-snapshot', 'diff-check'];
  run(['prepare']);
  const audits = args.filter(name => auditNames.includes(name));
  const suites = args.filter(name => !auditNames.includes(name));
  if (!args.length || suites.length) run(['regressions', ...suites]);
  if (!args.length || audits.length) run(['audit', ...audits]);
  run(['protection']);
}
