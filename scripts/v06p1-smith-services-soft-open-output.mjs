import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';

// QA delivery evidence only; this path helper never controls production access.
export function smithServicesSoftOpenOutput(root, suite = '') {
  const tip = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  }).toString().trim();
  return path.join(root, `qa/out_v06p1_smith_services_soft_${tip}`, suite);
}

export function assertSmithServicesSoftOpenOutput(root, out) {
  assert.match(path.relative(path.join(root, 'qa'), out),
    /^out_v06p1_smith_services_soft_[a-f0-9]{7,40}(?:\/|$)/u,
    'QA output must stay inside this window soft_<implementation-tip> directory');
}
