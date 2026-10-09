// 找项目根目录（含 balance/ 和 art/ 的那一层）：主工作区在 xiantu/game，worktree 在 xiantu/wt/<分支>
import fs from 'node:fs';
import path from 'node:path';
export function findRoot(start) {
  let d = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(d, 'balance')) && fs.existsSync(path.join(d, 'art'))) return d;
    d = path.dirname(d);
  }
  throw new Error('找不到 xiantu 项目根目录（含 balance/ 与 art/）');
}
