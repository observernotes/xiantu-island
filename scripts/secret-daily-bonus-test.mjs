// design/50 接线 only；会话夹具 true 不落盘，不触发 sync 或构建。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root);
const snapshot = path.join(root, 'data');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const common = {
  'secret_boons.json': '2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f',
  'solo_pacing.json': 'cf4aabe15efcdec8b4d1e4448b931a1cf31b970c0fa175fd6e339d12ca59da3f',
  'companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
};
const roomShas = {
  authority: '42eab7d3c19e48636e4352e7de871680c588c11e6228c82ad2c0a4cb3b6b7bb3',
  snapshot: 'edae1c2f99837624616c2f498d54d87373abef410772191f4b9b0d582ff510d4',
};
const protectedFiles = new Map();
for (const dataRoot of [shared, path.join(shared, 'game/data'), snapshot]) {
  for (const [name, want] of Object.entries({ ...common,
    'secret_rooms.json': dataRoot === shared ? roomShas.authority : roomShas.snapshot })) {
    const file = path.join(dataRoot, 'balance', name);
    const got = hash(await fs.readFile(file));
    assert.equal(got, want, `${file} 写前 SHA 冻结`);
    protectedFiles.set(file, got);
  }
}
const featureFile = path.join(snapshot, 'features.json');
const featureBytes = await fs.readFile(featureFile);
const flags = JSON.parse(featureBytes);
assert.equal(flags.secret_daily_bonus, false, '工程快照日倍闸必须落盘 false');
assert.equal(flags.secret_boon_runtime, true, '工程快照既有 boon 闸保持 true');
protectedFiles.set(featureFile, hash(featureBytes));
for (const rel of ['src/SecretNestGate.ts', 'src/Progress.ts', 'src/features.ts']) {
  assert.doesNotMatch(await fs.readFile(path.join(root, rel), 'utf8'), /\bNestOpenFlag\b|\bsoftOpenedNest\w*\b/u, `${rel} 禁新增巢穴 OpenFlag`);
}
assert.match(await fs.readFile(path.join(root, 'src/data.ts'), 'utf8'), /GAME_PHASE\s*=\s*5\b/u, 'GAME_PHASE 保持 5');

let total = 0;
for (const [mode, dataRoot, missingKey] of [['shared', shared, false], ['snapshot', snapshot, false], ['snapshot-missing-key', snapshot, true]]) {
  let missingFeatureLoaded = false;
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'secret-daily-bonus-fixtures', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0secret-daily-bonus-phaser'; },
      load(id) {
        // 只覆盖 SSR 模块内容，features.json 磁盘字节不变；缺日倍键时真实结算也须零读写。
        if (missingKey && id === featureFile) {
          missingFeatureLoaded = true;
          const config = { ...flags }; delete config.secret_daily_bonus;
          return JSON.stringify(config);
        }
        if (id !== '\0secret-daily-bonus-phaser') return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {},
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Input: { Keyboard: { JustDown: () => false } } };`;
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  try {
    const resolved = await server.pluginContainer.resolveId('@xt/balance/secret_rooms.json');
    assert.equal(resolved.id, path.join(dataRoot, 'balance/secret_rooms.json'), `${mode} 真实解析指定表根`);
    const suite = await server.ssrLoadModule('/src/secret-daily-bonus.test.ts');
    const result = await suite.runSecretDailyBonusTests({ dataMode: mode, closedOnly: missingKey });
    assert.equal(missingFeatureLoaded, missingKey, `${mode} 缺键 SSR 配置夹具必须真实命中`);
    total += result.assertions;
    console.log(JSON.stringify({ suite: 'secret-daily-bonus', dataMode: mode, assertions: result.assertions,
      passed: true, dailyBonusDefault: false, boonRuntimeDefault: true, wiringOnly: true, newOpenFlag: false }));
  } finally { await server.close(); }
}
for (const [file, sha] of protectedFiles) assert.equal(hash(await fs.readFile(file)), sha, `写后＝写前 ${file}`);
console.log(`secret-daily-bonus tests ok: ${total} assertions; 默认／缺键关闸零读写；3×24/40 后 12/20；05:00；boon 正交；三根表 SHA 冻结；接线 only`);
