// 把美术素材拷到 public/art（sprites + tiles）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot, dataMode } from './root.mjs';
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = findRoot(here);
const out = path.join(here, 'public/art');
fs.rmSync(out, { recursive: true, force: true });
// 递归拷贝 png/json（icons 下有 skills/ 子目录；_backup、preview 不拷）
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!['_backup', 'preview'].includes(e.name)) copyDir(path.join(src, e.name), path.join(dst, e.name)); }
    else if (/\.(png|json)$/.test(e.name)) fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
  }
}
for (const sub of ['sprites', 'tiles', 'icons']) copyDir(path.join(root, 'art', sub), path.join(out, sub));
console.log('synced art from', root, '(' + dataMode(here) + ')');
