// 把共享目录的数据冻结进本分支的 data/（balance、maps、对白脚本、art 的 sprites/tiles/icons）。
// 在 dev 上跑完、跑过 datalint、提交，再合进 master/hotfix；发版分支构建只认这份快照。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedRoot } from './root.mjs';
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = sharedRoot(here), out = path.join(here, 'data');
fs.rmSync(out, { recursive: true, force: true });
const skip = new Set(['_backup', 'preview', 'samples']);
function copy(a, b, filter) {
  if (!fs.existsSync(a)) return;
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!skip.has(e.name)) copy(path.join(a, e.name), path.join(b, e.name), filter); }
    else if (filter(e.name)) fs.copyFileSync(path.join(a, e.name), path.join(b, e.name));
  }
}
copy(path.join(src, 'balance'), path.join(out, 'balance'), f => f.endsWith('.json'));
copy(path.join(src, 'maps'), path.join(out, 'maps'), f => f.endsWith('.json'));
fs.mkdirSync(path.join(out, 'design'), { recursive: true });
fs.copyFileSync(path.join(src, 'design/02_新手任务.md'), path.join(out, 'design/02_新手任务.md'));
fs.mkdirSync(path.join(out, 'art'), { recursive: true });
for (const sub of ['sprites', 'tiles', 'icons']) copy(path.join(src, 'art', sub), path.join(out, 'art', sub), f => /\.(png|json)$/.test(f));
fs.writeFileSync(path.join(out, 'SNAPSHOT.txt'), `快照来源 ${src}\n时间 ${new Date().toISOString()}\n`);
console.log('snapshot written to', out);
