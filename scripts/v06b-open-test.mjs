// 开态只存在于内存克隆和独立 SSR 模块图；正式双关表与 feature 文件前后只读。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modes = [['snapshot', path.join(root, 'data')], ['shared', sharedRoot(root)]];
const protectedSha = {
  'companions.json': '8e1fe697721999f02723e99b109a3e6a2a12eb537cecf2993bdd81c6aa762fa5',
  'fly_zones.json': 'a55bd3cae2b057c26a5ca1842055c9b0dfc2b39910e17f8537dd971fcaca2b98',
  'skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const before = new Map(), dataByMode = new Map(), snapshotBytes = new Map();

function assertFormal(data, mode) {
  const companions = data['companions.json'], fly = data['fly_zones.json'];
  assert.equal(companions.enabled, false, `${mode}：正式同门根保持关闭`);
  assert.equal(companions.companions.length, 1, `${mode}：只保留苏师姐一个条目`);
  assert.equal(companions.companions[0].id, 'companion_senior_sister_su', `${mode}：唯一同门映射不变`);
  assert.equal(companions.companions[0].enabled, false, `${mode}：正式苏条目保持关闭`);
  assert.equal(fly.enabled, false, `${mode}：正式持续飞行根保持关闭`);
  let gifts = 0;
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') {
        assert.equal(child?.enabled, false, `${mode}：所有 gifts.enabled 始终为 false`);
        gifts++;
      }
      visit(child);
    }
  };
  visit(data['npcs.json']);
  assert(gifts > 0, `${mode}：必须实际检查赠礼开关`);
  console.log(JSON.stringify({ suite: 'v06b-open-formal-closed', dataMode: mode,
    companionsEnabled: false, companionEnabled: false, flyZonesEnabled: false, giftsChecked: gifts, giftsEnabled: false }));
}

async function runGraph(dataRoot, memoryOpen, run) {
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06b-open-memory-fixture', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0v06b-open-phaser';
        if (memoryOpen) for (const name of Object.keys(memoryOpen)) {
          if (id.endsWith(`/balance/${name}`)) return `\0v06b-open-${name}.mjs`;
        }
      },
      load(id) {
        if (id === '\0v06b-open-phaser') {
          return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
            Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
            Scenes: { Events: { SHUTDOWN: 'shutdown' } },
            Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
            Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
              Linear: (from, to, amount) => from + (to - from) * amount } };`;
        }
        if (memoryOpen) for (const [name, value] of Object.entries(memoryOpen)) {
          if (id === `\0v06b-open-${name}.mjs`) return `export default ${JSON.stringify(value)};`;
        }
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  try { await run(server); }
  finally { await server.close(); }
}

try {
  // 所有模式先核正式 SHA，再运行内存夹具；不调用 sync、snapshot 或 release。
  for (const [mode, dataRoot] of modes) {
    const data = {};
    for (const [name, sha] of Object.entries(protectedSha)) {
      const file = path.join(dataRoot, 'balance', name), bytes = await fs.readFile(file);
      before.set(file, hash(bytes));
      assert.equal(hash(bytes), sha, `${mode}：${name} 必须保留关态 SHA 基线`);
      if (mode === 'snapshot') snapshotBytes.set(name, bytes);
      else assert(bytes.equals(snapshotBytes.get(name)), `${name}：共享与镜像保持同字节`);
      data[name] = JSON.parse(bytes.toString('utf8'));
    }
    assertFormal(data, mode);
    dataByMode.set(mode, data);
    const featureFile = path.join(dataRoot, 'features.json');
    try {
      const bytes = await fs.readFile(featureFile);
      before.set(featureFile, hash(bytes));
      assert.equal(JSON.parse(bytes.toString('utf8')).indexedDbSaves, true, `${mode}：IDB flag 必须保持 true`);
    } catch (error) {
      if (mode === 'snapshot' || error.code !== 'ENOENT') throw error;
      before.set(featureFile, null); // 共享根没有 features 时，不允许测试创建它。
    }
  }
  for (const [mode, dataRoot] of modes) {
    const data = dataByMode.get(mode), formalBefore = JSON.stringify(data);
    // 资格、拒绝门禁与异步关系存档：测试文件自行克隆，仍可直接对照正式关态导入。
    await runGraph(dataRoot, null, async server => {
      const suite = await server.ssrLoadModule('/src/v06b-open.test.ts');
      assert.equal(typeof suite.runV06bOpenTests, 'function', '开态套件必须导出可执行入口');
      await suite.runV06bOpenTests();
    });

    // 御剑链使用第二张模块图，真实 data/Progress/SkillCombat 消费双开内存表。
    const memoryOpen = { 'companions.json': clone(data['companions.json']), 'fly_zones.json': clone(data['fly_zones.json']) };
    memoryOpen['companions.json'].enabled = true;
    memoryOpen['companions.json'].companions[0].enabled = true;
    memoryOpen['fly_zones.json'].enabled = true;
    const restored = clone(memoryOpen);
    restored['companions.json'].enabled = false;
    restored['companions.json'].companions[0].enabled = false;
    restored['fly_zones.json'].enabled = false;
    assert.deepEqual(restored, { 'companions.json': data['companions.json'], 'fly_zones.json': data['fly_zones.json'] },
      '御剑夹具只能修改克隆中的三处 enabled');
    await runGraph(dataRoot, memoryOpen, async server => {
      const suite = await server.ssrLoadModule('/src/sword-ride.test.ts');
      assert.equal(typeof suite.runSwordRideTests, 'function', '必须复用现有真实御剑测试入口');
      await suite.runSwordRideTests({ openFixture: true });
    });
    assert.equal(JSON.stringify(data), formalBefore, `${mode}：夹具不得污染正式内存数据`);
    console.log(JSON.stringify({ suite: 'v06b-open', dataMode: mode, passed: true, indexedDbSaves: true,
      fixtureOnly: true, companionsEnabled: true, companionEnabled: true, flyZonesEnabled: true, giftsEnabled: false }));
  }
} finally {
  for (const [file, sha] of before) {
    if (sha === null) await assert.rejects(fs.readFile(file), { code: 'ENOENT' }, `不得创建 feature 文件 ${file}`);
    else assert.equal(hash(await fs.readFile(file)), sha, `开态夹具不得写表或开关 ${file}`);
  }
}
console.log('v06b open tests ok: shared/snapshot；仅内存临时双开；正式表 SHA 不变、gifts 全关、IDB 为 true');
