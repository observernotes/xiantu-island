import { execFileSync } from 'node:child_process';
import path from 'node:path';

// QA evidence only: follow the tested tip without overwriting earlier C/O artifacts.
export function attrUiSoftOpenOutput(root, suite) {
  const tip = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  }).toString().trim();
  return path.join(root, `qa/out_v06p1_attr_ui_soft_${tip}`, suite);
}
