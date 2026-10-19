// 正式开态双数据根验收；关态对照只存在于内存克隆，正式表与 feature 文件前后只读。
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
  'companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'fly_zones.json': '2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4',
  'skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const before = new Map(), dataByMode = new Map(), snapshotBytes = new Map();

function assertFormal(data, mode) {
  const companions = data['companions.json'], fly = data['fly_zones.json'];
  assert.equal(companions.enabled, true, `${mode}：正式同门根已软开`);
  assert.equal(companions.companions.length, 1, `${mode}：只保留苏师姐一个条目`);
  assert.equal(companions.companions[0].id, 'companion_senior_sister_su', `${mode}：唯一同门映射不变`);
  assert.equal(companions.companions[0].enabled, true, `${mode}：正式苏条目已软开`);
  assert.equal(fly.enabled, true, `${mode}：正式持续飞行根已软开`);
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
  console.log(JSON.stringify({ suite: 'v06b-open-formal-open', dataMode: mode,
    companionsEnabled: true, companionEnabled: true, flyZonesEnabled: true, giftsChecked: gifts, giftsEnabled: false,
    softOpenedSustainFlight: true, newOpenFlag: false, released: false }));
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
      assert.equal(hash(bytes), sha, `${mode}：${name} 必须保留正式开态 SHA 基线`);
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
    // 资格、拒绝门禁与异步关系存档：正式开态导入与测试文件自建关态克隆互为对照。
    await runGraph(dataRoot, null, async server => {
      const suite = await server.ssrLoadModule('/src/v06b-open.test.ts');
      assert.equal(typeof suite.runV06bOpenTests, 'function', '开态套件必须导出可执行入口');
      await suite.runV06bOpenTests();
    });

    // 御剑链使用第二张模块图，真实 data/Progress/SkillCombat 消费与正式开态一致的内存表。
    const memoryOpen = { 'companions.json': clone(data['companions.json']), 'fly_zones.json': clone(data['fly_zones.json']) };
    memoryOpen['companions.json'].enabled = true;
    memoryOpen['companions.json'].companions[0].enabled = true;
    memoryOpen['fly_zones.json'].enabled = true;
    const formalTables = { 'companions.json': data['companions.json'], 'fly_zones.json': data['fly_zones.json'] };
    assert.deepEqual(memoryOpen, formalTables, '幂等开态夹具必须与正式开表完全一致');
    const memoryClosed = clone(memoryOpen);
    memoryClosed['companions.json'].enabled = false;
    memoryClosed['companions.json'].companions[0].enabled = false;
    memoryClosed['fly_zones.json'].enabled = false;
    const restored = clone(memoryClosed);
    restored['companions.json'].enabled = true;
    restored['companions.json'].companions[0].enabled = true;
    restored['fly_zones.json'].enabled = true;
    assert.deepEqual(restored, formalTables, '关态夹具只能修改正式开表克隆中的三处 enabled');
    await runGraph(dataRoot, memoryOpen, async server => {
      const suite = await server.ssrLoadModule('/src/sword-ride.test.ts');
      assert.equal(typeof suite.runSwordRideTests, 'function', '必须复用现有真实御剑测试入口');
      await suite.runSwordRideTests({ openFixture: true });
    });
    assert.equal(JSON.stringify(data), formalBefore, `${mode}：夹具不得污染正式内存数据`);
    console.log(JSON.stringify({ suite: 'v06b-open', dataMode: mode, passed: true, indexedDbSaves: true,
      formalOpen: true, closedFixtureOnly: true, companionsEnabled: true, companionEnabled: true, flyZonesEnabled: true, giftsEnabled: false,
      softOpenedSustainFlight: true, newOpenFlag: false, released: false }));
  }
} finally {
  for (const [file, sha] of before) {
    if (sha === null) await assert.rejects(fs.readFile(file), { code: 'ENOENT' }, `不得创建 feature 文件 ${file}`);
    else assert.equal(hash(await fs.readFile(file)), sha, `开态夹具不得写表或开关 ${file}`);
  }
}
console.log('v06b open tests ok: shared/snapshot；正式开态已翻、关态仅内存夹具；正式开态 SHA 不变、gifts 全关、IDB 为 true；softOpenedSustainFlight:true、newOpenFlag:false、released:false；≠release');
