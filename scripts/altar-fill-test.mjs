// 无浏览器、无监听端口：使用 E-3 选块与真实 MapBuilder，只替换 Phaser 容器。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';

const baseKey = 'tiles_altar', variantsKey = 'tiles_altar_fill_variants';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceMap = JSON.parse(readFileSync(path.join(findRoot(projectRoot), 'maps/trial_foundation_altar.json'), 'utf8'));
const metadata = JSON.parse(readFileSync(path.join(projectRoot, 'public/art/tiles/tiles_altar.json'), 'utf8'));
const oldCounts = [17, 23, 26, 24];
assert.deepEqual(metadata.variants?.['5'], { tileset: variantsKey, frames: [0, 1, 2], includeBase: true },
  '同步后的 tiles_altar.json 包含 E-3 外部图集表');

const server = await createServer({
  root: projectRoot, server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error', ssr: { noExternal: ['phaser'] },
  plugins: [{
    name: 'altar-fill-headless', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return '\0altar-fill-phaser.js'; },
    load(id) { if (id === '\0altar-fill-phaser.js') return 'export default {};'; },
  }],
});

function fakeScene({ variants = true, meta = metadata } = {}) {
  const state = { tilesets: [], layers: [], queried: [], data: null };
  const graphics = Object.fromEntries(['setDepth', 'fillStyle', 'fillRect', 'lineStyle', 'lineBetween']
    .map(name => [name, function () { return this; }]));
  const scene = {
    textures: {
      exists(key) { state.queried.push(key); return key === baseKey || (key === variantsKey && variants); },
      get(key) {
        assert.ok(key === baseKey || (key === variantsKey && variants), `只读取存在的纹理 ${key}`);
        return { get: () => key === baseKey ? { cutWidth: 128, cutHeight: 128 } : { cutWidth: 96, cutHeight: 32 } };
      },
    },
    cache: { json: { get: key => key === `${baseKey}_meta` ? meta : undefined } },
    physics: { add: { staticGroup: () => ({ add() {} }) } },
    add: { graphics: () => graphics, zone: () => ({ body: { checkCollision: {} } }) },
    make: { tilemap({ data }) {
      state.data = data.map(row => [...row]);
      return {
        addTilesetImage(name, key, tileWidth, tileHeight, margin, spacing, firstgid = 0) {
          const tileset = { name, key, firstgid };
          state.tilesets.push(tileset);
          return tileset;
        },
        createLayer(index, tilesets) {
          const layer = { index, tilesets, setDepth() { return this; } };
          state.layers.push(layer);
          return layer;
        },
      };
    } },
  };
  return { scene, state };
}

function summary(label, counts, names) {
  const total = counts.reduce((sum, count) => sum + count, 0), changed = total - counts[0];
  const shares = counts.map(count => `${count} (${(count / total * 100).toFixed(2)}%)`);
  console.log(`${label}: #5 共 ${total} 格，${names}=${shares.join('/')}; 变体 ${changed}/${total}=${(changed / total * 100).toFixed(2)}%`);
}

try {
  const { tileVariantGroups, pickTileVariant } = await server.ssrLoadModule('/src/TileVariants.ts');
  const { buildTiledMap } = await server.ssrLoadModule('/src/scenes/MapBuilder.ts');
  const groups = tileVariantGroups(metadata, baseKey);
  assert.deepEqual(groups.get(5)?.frames, [
    { tileset: baseKey, frame: 5, weight: 1 },
    ...[0, 1, 2].map(frame => ({ tileset: variantsKey, frame, weight: 1 })),
  ], '原块与三个外部变体等权');
  const build = options => {
    const { scene, state } = fakeScene(options);
    buildTiledMap(scene, sourceMap, baseKey);
    return state;
  };
  const originalRandom = Math.random;
  let original, missing, mixed, repeated;
  try {
    Math.random = () => { throw new Error('选块不得使用 Math.random'); };
    original = build({ meta: { ...metadata, variants: {} } });
    missing = build({ variants: false });
    mixed = build();
    repeated = build();
  } finally { Math.random = originalRandom; }
  assert.deepEqual(missing.data, original.data, '缺变体图集时全部回退原块');
  assert.deepEqual(missing.tilesets.map(ts => ts.name), [baseKey], '缺图时图层只含原图集');
  assert.ok(missing.queried.includes(variantsKey), '验证 E-3 缺纹理回退路径');
  assert.deepEqual(repeated.data, mixed.data, '相同坐标确定性选块');
  assert.equal(mixed.layers.length, 1, '原块和变体位于同一图层');
  const variants = mixed.tilesets.find(ts => ts.name === variantsKey);
  assert.ok(variants && mixed.layers[0].tilesets.includes(variants), '图层含外部变体图集');
  assert.equal(variants.firstgid, 16, '外部变体 GID 接在原 16 块之后');
  const counts = [0, 0, 0, 0];
  for (let r = 0; r < sourceMap.height; r++) for (let c = 0; c < sourceMap.width; c++) {
    const base = original.data[r][c];
    if (base !== 5) {
      assert.equal(mixed.data[r][c], base, `非 #5 格保持原图块 (${c}, ${r})`);
      continue;
    }
    const selected = pickTileVariant(groups, baseKey, 5, c, r);
    const bucket = selected.tileset === baseKey ? 0 : selected.frame + 1;
    counts[bucket]++;
    assert.equal(mixed.data[r][c], selected.tileset === baseKey ? 5 : variants.firstgid + selected.frame,
      `E-3 选块与实际图层一致 (${c}, ${r})`);
  }
  assert.ok(counts.every(count => count > 0), '真实筑基台包含原块和所有三个变体');
  summary('E-3', counts, '原块/变体0/1/2');
  summary('旧 UI-1', oldCounts, '原块/变体1/2/3');
  const deltas = counts.map((count, index) => count - oldCounts[index]);
  console.log(`对比: 格数差=${deltas.join('/')}; E-3 沿用 UI-1 坐标哈希，等权且候选顺序为原块、外部帧 0/1/2，同一地图坐标理论应一致或接近。${deltas.every(delta => delta === 0)
    ? '本次完全一致，仅变体编号由 1/2/3 改为外部帧 0/1/2。'
    : '本次分布有差异；地图 #5 坐标、候选顺序或权重变化会改变统计。'}`);
  console.log('altar-fill: PASS; 通用 MapBuilder 正常铺变体，缺图全部铺原 #5');
} finally { await server.close(); }
