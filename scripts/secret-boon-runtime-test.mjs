// design/49 Soft OpenPreRelease；shared / snapshot 分别使用真实数据根，不写配置或存档。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root);
const modes = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = {
  'balance/secret_boons.json': '2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f',
  'balance/companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'balance/skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
};
const protectedFiles = new Map();
for (const dataRoot of [shared, path.join(shared, 'game/data'), path.join(root, 'data')]) {
  for (const [rel, want] of Object.entries(expected)) {
    const file = path.join(dataRoot, rel);
    const got = hash(await fs.readFile(file));
    assert.equal(got, want, `${file} 权威 SHA 冻结`);
    protectedFiles.set(file, got);
  }
}
const featureFile = path.join(root, 'data/features.json');
protectedFiles.set(featureFile, hash(await fs.readFile(featureFile)));
assert.equal(JSON.parse(await fs.readFile(featureFile, 'utf8')).secret_boon_runtime, true, '正式 soft 开闸：features 键必须落盘 true');
for (const rel of ['src/SecretBoonRuntime.ts', 'src/SecretNestGate.ts', 'src/Progress.ts', 'src/scenes/GameScene.ts', 'src/features.ts']) {
  const source = await fs.readFile(path.join(root, rel), 'utf8');
  assert.doesNotMatch(source, /\bNestOpenFlag\b|\bsoftOpenedNest\w*\b/u, `${rel} 不新增 NestOpenFlag / softOpenedNest`);
}
assert.match(await fs.readFile(path.join(root, 'src/data.ts'), 'utf8'), /GAME_PHASE\s*=\s*5\b/u, 'GAME_PHASE 保持 5');

// 缺整个 features 文件、缺新键、显式 false 都必须关；只在临时工程核读 features.ts。
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xt-secret-boon-features-'));
try {
  await fs.mkdir(path.join(fixtureRoot, 'src'));
  await fs.mkdir(path.join(fixtureRoot, 'data'));
  await fs.copyFile(path.join(root, 'src/features.ts'), path.join(fixtureRoot, 'src/features.ts'));
  for (const config of [undefined, {}, { secret_boon_runtime: false }]) {
    if (config) await fs.writeFile(path.join(fixtureRoot, 'data/features.json'), JSON.stringify(config));
    const server = await createServer({ root: fixtureRoot, configFile: false, appType: 'custom', logLevel: 'error',
      server: { middlewareMode: true, hmr: false, ws: false } });
    try {
      const features = await server.ssrLoadModule('/src/features.ts');
      assert.equal(features.featureEnabled('secret_boon_runtime'), false, 'C01 缺键／false 一律关闸');
    } finally { await server.close(); }
  }
} finally { await fs.rm(fixtureRoot, { recursive: true, force: true }); }

let total = 0;
for (const [mode, dataRoot] of modes) {
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'secret-boon-runtime-phaser', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0secret-boon-phaser'; },
      load(id) {
        if (id !== '\0secret-boon-phaser') return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {},
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {}, Graphics: class {} },
          Geom: { Rectangle: class { constructor(x,y,w,h){this.x=x;this.y=y;this.width=w;this.height=h;} },
            Intersects: { RectangleToRectangle: () => false } },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Input: { Keyboard: { JustDown: () => false } } };`;
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  try {
    const resolved = await server.pluginContainer.resolveId('@xt/balance/secret_boons.json');
    assert.equal(resolved.id, path.join(dataRoot, 'balance/secret_boons.json'), `${mode} 必须真实加载指定根`);
    const suite = await server.ssrLoadModule('/src/secret-boon-runtime.test.ts');
    const result = await suite.runSecretBoonRuntimeTests({ dataMode: mode });
    total += result.assertions;
    console.log(JSON.stringify({ suite: 'secret-boon-runtime', dataMode: mode, resolvedDataRoot: dataRoot,
      assertions: result.assertions, passed: true, runtimeDefault: true, newOpenFlag: false, soft: true,
      stage: 'Soft OpenPreRelease', released: false, release: false }));
  } finally { await server.close(); }
}
for (const [file, sha] of protectedFiles) assert.equal(hash(await fs.readFile(file)), sha, `自测不得改动 ${file}`);
console.log(`secret-boon-runtime tests ok: ${total} assertions; shared/snapshot 独立 SSR；Soft OpenPreRelease 落盘 true；缺键／false 关闸；三根 secret_boons/companions/skills SHA 冻结；≠release≠Pages`);
