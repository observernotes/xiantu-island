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
    if (e.isDirectory()) { if (!e.name.startsWith('_') && e.name !== 'preview') copyDir(path.join(src, e.name), path.join(dst, e.name)); }
    else if (/\.(png|json)$/.test(e.name)) fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
  }
}
for (const sub of ['sprites', 'tiles', 'icons']) copyDir(path.join(root, 'art', sub), path.join(out, sub));
// 素材清单：扫 art/sprites/*.anims.json 生成图集列表（含 kind、origin、bodySize）和区域列表（tiles_<区域>.png），写到 src/gen/assets.json
const spritesDir = path.join(out, 'sprites');
const atlases = fs.readdirSync(spritesDir).filter(f => f.endsWith('.anims.json')).sort().map(f => {
  const j = JSON.parse(fs.readFileSync(path.join(spritesDir, f), 'utf8'));
  const key = j.atlas ?? f.replace(/\.anims\.json$/, '');
  if (!fs.existsSync(path.join(spritesDir, key + '.png')) || !fs.existsSync(path.join(spritesDir, key + '.json'))) { console.warn('[sync] 缺图集文件，跳过', key); return null; }
  return { key, kind: j.kind ?? (key.split('_')[0] === 'mon' ? 'monster' : key.split('_')[0]), origin: j.origin ?? [0.5, 1], bodySize: j.bodySize ?? null };
}).filter(Boolean);
const areas = fs.readdirSync(path.join(out, 'tiles')).map(f => f.match(/^tiles_(\w+)\.png$/)?.[1]).filter(Boolean).sort();
fs.mkdirSync(path.join(here, 'src/gen'), { recursive: true });
fs.writeFileSync(path.join(here, 'src/gen/assets.json'), JSON.stringify({ atlases, areas }, null, 1));
console.log(`manifest: ${atlases.length} 个图集，区域 ${areas.join('/')}`);
console.log('synced art from', root, '(' + dataMode(here) + ')');
