// 把美术素材拷到 public/art（sprites + tiles）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot, dataMode } from './root.mjs';
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = findRoot(here);
const out = path.join(here, 'public/art');
const manifestOnly = process.env.XT_SYNC_MANIFEST_ONLY === '1';
// 递归拷贝 png/json（icons 下有 skills/ 子目录；_backup、preview 不拷）
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!e.name.startsWith('_') && e.name !== 'preview') copyDir(path.join(src, e.name), path.join(dst, e.name)); }
    else if (/\.(png|json)$/.test(e.name)) fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
  }
}
if (!manifestOnly) {
  fs.rmSync(out, { recursive: true, force: true });
  for (const sub of ['sprites', 'tiles', 'icons']) copyDir(path.join(root, 'art', sub), path.join(out, sub));
  // 试样覆盖（art.overrides.json）：未转正的工作稿以正式 key 接入，用于在 dev/feat 上看实景；
  // 正式目录 art/sprites 与 polished.lock 不动。转正后删掉对应条目即回到正式图，代码无需改。
  // 三件套缺任一个则不覆盖（沿用正式图），XT_ART_OVERRIDES=0 可整体关闭（对比旧图用）。
  const overrideFile = path.join(here, 'art.overrides.json');
  if (fs.existsSync(overrideFile) && process.env.XT_ART_OVERRIDES !== '0') {
    const { sprites = {} } = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
    for (const [key, spec] of Object.entries(sprites)) {
      if (key.startsWith('//')) continue;
      const srcBase = path.join(root, spec.from);
      const files = ['png', 'json', 'anims.json'].map(ext => [`${srcBase}.${ext}`, path.join(out, 'sprites', `${key}.${ext}`)]);
      const missing = files.filter(([src]) => !fs.existsSync(src)).map(([src]) => path.relative(root, src));
      if (missing.length) { console.warn(`[sync] 覆盖 ${key} 跳过，缺：${missing.join('、')}（沿用正式图）`); continue; }
      const anims = JSON.parse(fs.readFileSync(files[2][0], 'utf8'));
      if ((anims.atlas ?? key) !== key) { console.warn(`[sync] 覆盖 ${key} 跳过：anims.json atlas=${anims.atlas} 与 key 不符`); continue; }
      for (const [src, dst] of files) fs.copyFileSync(src, dst);
      console.log(`[sync] 覆盖 ${key} ← ${spec.from}.*（${spec.note ?? '试样'}）`);
    }
  }
  // 仓库覆盖层只在完整拷贝后浅合并；manifest-only 保留结果，不重复合并。
  // 验收通过后可由精修把同一行写进 art/tiles/tiles_altar.json 并删除覆盖层。
  for (const sub of ['sprites', 'tiles', 'icons']) {
    const overlays = path.join(here, 'art-overlays', sub);
    if (!fs.existsSync(overlays)) continue;
    for (const name of fs.readdirSync(overlays).filter(name => name.endsWith('.json'))) {
      const target = path.join(out, sub, name);
      if (!fs.existsSync(target)) { console.warn('[sync] 覆盖层目标不存在，跳过', `${sub}/${name}`); continue; }
      const merged = { ...JSON.parse(fs.readFileSync(target, 'utf8')), ...JSON.parse(fs.readFileSync(path.join(overlays, name), 'utf8')) };
      fs.writeFileSync(target, JSON.stringify(merged, null, 1) + '\n');
    }
  }
}
// 素材清单：扫 art/sprites/*.anims.json 生成图集列表（含 kind、origin、bodySize）和区域列表（tiles_<区域>.png），写到 src/gen/assets.json
const spritesDir = path.join(out, 'sprites');
const atlases = fs.readdirSync(spritesDir).filter(f => f.endsWith('.anims.json')).sort().map(f => {
  const j = JSON.parse(fs.readFileSync(path.join(spritesDir, f), 'utf8'));
  const key = j.atlas ?? f.replace(/\.anims\.json$/, '');
  if (!['.png', '.json', '.anims.json'].every(extension => fs.existsSync(path.join(spritesDir, key + extension)))) { console.warn('[sync] 缺图集文件，跳过', key); return null; }
  return { key, kind: j.kind ?? (key.split('_')[0] === 'mon' ? 'monster' : key.split('_')[0]), origin: j.origin ?? [0.5, 1], bodySize: j.bodySize ?? null, frameSize: j.frameSize ?? null, displayScale: j.displayScale ?? 1, ...(j.pixelArt === undefined ? {} : { pixelArt: j.pixelArt }) };
}).filter(Boolean);
const areas = fs.readdirSync(path.join(out, 'tiles')).map(f => f.match(/^tiles_(\w+)\.png$/)?.[1]).filter(Boolean).sort();
const tileMetadata = areas.flatMap(area => {
  const key = `tiles_${area}`, file = `tiles/${key}.json`;
  return fs.existsSync(path.join(out, file)) ? [{ key: `${key}_meta`, path: `art/${file}` }] : [];
});
// 装饰布局不要求该区域有图块；只从已拷出的正式文件登记，不推测缺省路径。
const propLayouts = fs.readdirSync(path.join(out, 'tiles')).sort().flatMap(file => {
  const area = file.match(/^props_(\w+)\.layout\.json$/)?.[1];
  return area ? [{ area, key: `props_${area}_layout`, path: `art/tiles/${file}` }] : [];
});
// 图块变体不一定提供背景；只登记实际交付的背景，避免将缺省层当成待加载图片。
const backgrounds = areas.flatMap(area => ['far', 'mid'].flatMap(layer => {
  const key = `bg_${area}_${layer}`, file = `tiles/${key}.png`;
  return fs.existsSync(path.join(out, file)) ? [{ key, path: `art/${file}` }] : [];
}));
// 只有正式交付的配置/纹理进入清单；缺文件时不发出请求。
const backgroundConfigs = areas.flatMap(area => {
  const file = `tiles/bg_${area}.json`, source = path.join(out, file);
  if (!fs.existsSync(source)) return [];
  const config = JSON.parse(fs.readFileSync(source, 'utf8'));
  const layers = Array.isArray(config.layers) ? config.layers : Object.entries(config.layers ?? {}).map(([name, layer]) => ({ key: `bg_${area}_${name}`, ...layer }));
  for (const texture of [...layers, ...(config.textures ?? [])]) {
    const key = texture.texture ?? texture.key;
    if (!key) continue;
    const imageFile = texture.path ?? texture.file ?? `${key}.png`;
    const relative = imageFile.startsWith('art/') ? imageFile.slice(4) : imageFile.startsWith('tiles/') || imageFile.startsWith('sprites/') ? imageFile : `tiles/${imageFile}`;
    if (fs.existsSync(path.join(out, relative))) {
      const existing = backgrounds.find(image => image.key === key);
      if (existing) existing.path = `art/${relative}`;
      else backgrounds.push({ key, path: `art/${relative}` });
    }
  }
  return [{ area, key: `bg_${area}_config`, path: `art/${file}` }];
});
// 未验收的 _pending/ 不会拷到 public；技能 @64 缺图时不进入加载清单。
const skills = JSON.parse(fs.readFileSync(path.join(root, 'balance/skills.json'), 'utf8')).skills;
const missingSkillIcons = [];
const skillIcons = [...new Set(skills.map(s => s.icon).filter(Boolean))].sort().flatMap(icon => {
  const key = `${icon}@64`, file = `icons/skills/${key}.png`;
  if (!fs.existsSync(path.join(out, file))) { missingSkillIcons.push(file); return []; }
  return [{ key, path: `art/${file}` }];
});
if (missingSkillIcons.length) console.warn('[sync] 缺技能 @64 图标，跳过（退回 32px 图集或占位框）：', missingSkillIcons.join('、'));
// 职位徽记只从已拷出的正式 icons 查找，_pending 从不进入清单。
const rankKeys = new Set(JSON.parse(fs.readFileSync(path.join(root, 'balance/sect_ranks.json'), 'utf8')).ranks.map(r => r.icon).filter(Boolean));
const sectRankIcons = [];
function findRankIcons(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) findRankIcons(file);
    else if (entry.name.endsWith('.png') && rankKeys.has(entry.name.slice(0, -4)))
      sectRankIcons.push({ key: entry.name.slice(0, -4), path: `art/${path.relative(out, file).split(path.sep).join('/')}` });
  }
}
findRankIcons(path.join(out, 'icons'));
// UI-5：界面窗体件（icons/ui 下 1x png）按可选素材登记；缺图时不入加载队列，调用方退回代码画窗体。
const uiImages = [];
function findUiImages(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) findUiImages(file);
    else if (entry.name.endsWith('.png') && !entry.name.includes('@'))
      uiImages.push({ key: entry.name.slice(0, -4), path: `art/${path.relative(out, file).split(path.sep).join('/')}` });
  }
}
findUiImages(path.join(out, 'icons/ui'));
fs.mkdirSync(path.join(here, 'src/gen'), { recursive: true });
fs.writeFileSync(path.join(here, 'src/gen/assets.json'), JSON.stringify({ atlases, areas, tileMetadata, backgrounds, backgroundConfigs, propLayouts, skillIcons, sectRankIcons, uiImages }, null, 1));
console.log(`manifest: ${atlases.length} 个图集，${skillIcons.length} 个技能 @64 图标，区域 ${areas.join('/')}`);
console.log(manifestOnly ? 'rebuilt manifest from public/art' : 'synced art from', root, '(' + dataMode(here) + ')');
