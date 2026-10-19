// 正式开态 SHA 守护与关态内存夹具双数据根验收；不写配置或开关。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), snapshot = path.join(root, 'data');
// 本轮只读保护基线：既有 sword_ride / NPC 数值与两张正式开态表均不得改写。
const protectedSha = {
  'companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'fly_zones.json': '2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4',
  'skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
};
const names = [...Object.keys(protectedSha), 'strings_zh.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const before = new Map(), dataByMode = new Map();

function assertFormal(data, mode) {
  const companions = data['companions.json'], fly = data['fly_zones.json'];
  assert.equal(companions.enabled, true, `${mode}: 正式 companions 根已软开`);
  assert.equal(companions.companions.length, 1, `${mode}: 同门仍只有苏师姐一条`);
  assert.equal(companions.companions[0].id, 'companion_senior_sister_su');
  assert.equal(companions.companions[0].npcId, 'senior_sister_su');
  assert.equal(companions.companions[0].enabled, true, `${mode}: 正式唯一同门条目已软开`);
  assert.equal(fly.enabled, true, `${mode}: 正式 fly_zones 根已软开`);
  let gifts = 0;
  const visit = (value, at) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') {
        assert(child && typeof child === 'object', `${mode}: ${at}.gifts 必须为配置对象`);
        assert.equal(child.enabled, false, `${mode}: ${at}.gifts 继续关闭`);
        gifts++;
      }
      visit(child, `${at}.${key}`);
    }
  };
  visit(data['npcs.json'], 'npcs');
  assert(gifts > 0, `${mode}: 必须实际核查 gifts`);
  const strings = data['strings_zh.json'];
  for (const key of [
    'companion.invite.unavailable', 'companion.invite.need_confidant', 'companion.invite.ok', 'companion.invite.already',
    'companion.invite.disabled', 'companion.mode.follow', 'companion.mode.free', 'companion.mode.stay', 'companion.status.joined',
    'fly.locked_realm', 'fly.skill_granted', 'fly.zone_disabled', 'fly.zone_unavailable', 'fly.mp_low', 'fly.knockdown', 'fly.cannot_attack',
  ]) assert.equal(typeof strings[key], 'string', `${mode}: ${key} 已有正式文案`);
  console.log(JSON.stringify({ suite: 'v06b-closed-formal-open', dataMode: mode,
    companionsEnabled: companions.enabled, companionEnabled: companions.companions[0].enabled,
    flyZonesEnabled: fly.enabled, giftsChecked: gifts, giftsEnabled: false,
    softOpenedSustainFlight: true, newOpenFlag: false, released: false }));
}

async function runGraph(dataRoot, memoryClosed, run) {
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06b-closed-memory-fixture', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0v06b-phaser';
        if (memoryClosed) for (const name of Object.keys(memoryClosed)) {
          if (id.endsWith(`/balance/${name}`)) return `\0v06b-closed-${name}.mjs`;
        }
      },
      load(id) {
        if (id === '\0v06b-phaser') {
          return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
            Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
            Scenes: { Events: { SHUTDOWN: 'shutdown' } },
            Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
            Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
              Linear: (from, to, amount) => from + (to - from) * amount } };`;
        }
        if (memoryClosed) for (const [name, value] of Object.entries(memoryClosed)) {
          if (id === `\0v06b-closed-${name}.mjs`) return `export default ${JSON.stringify(value)};`;
        }
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  try { await run(server); }
  finally { await server.close(); }
}

try {
  const sharedBytes = new Map();
  for (const [mode, dataRoot] of [['shared', shared], ['snapshot', snapshot]]) {
    const data = {};
    for (const name of names) {
      const file = path.join(dataRoot, 'balance', name), bytes = await fs.readFile(file), sha = hash(bytes);
      before.set(file, sha);
      if (protectedSha[name]) assert.equal(sha, protectedSha[name], `${mode}: ${name} SHA 必须保留只读基线`);
      if (mode === 'shared') sharedBytes.set(name, bytes);
      else {
        assert.equal(bytes.equals(sharedBytes.get(name)), true, `${name} snapshot 与共享必须同字节`);
        assert.equal(sha, hash(sharedBytes.get(name)), `${name} snapshot 与共享 SHA 必须一致`);
      }
      data[name] = JSON.parse(bytes.toString('utf8'));
    }
    assertFormal(data, mode);
    dataByMode.set(mode, data);
  }
  for (const dataRoot of [shared, snapshot]) {
    const features = path.join(dataRoot, 'features.json');
    try {
      const bytes = await fs.readFile(features);
      before.set(features, hash(bytes));
      assert.equal(JSON.parse(bytes.toString('utf8')).indexedDbSaves, true, '正式 IDB flag 必须保持 true');
    }
    catch (error) {
      if (dataRoot === snapshot || error.code !== 'ENOENT') throw error;
      before.set(features, null); // 共享根没有 features 时，不允许测试创建它。
    }
  }

  for (const [mode, dataRoot] of [['snapshot', snapshot], ['shared', shared]]) {
    const data = dataByMode.get(mode), formalBefore = JSON.stringify(data);
    // 同门、关系存档与飞行单测自行克隆关态夹具，并保留正式开态旁证。
    await runGraph(dataRoot, null, async server => {
      for (const [file, run] of [
        ['companions.test.ts', 'runCompanionsTests'],
        ['companions-save.test.ts', 'runCompanionsSaveTests'],
        ['fly-zones.test.ts', 'runFlyZonesTests'],
      ]) {
        const suite = await server.ssrLoadModule(`/src/${file}`);
        assert.equal(typeof suite[run], 'function', `${file} 必须导出 ${run}`);
        await suite[run]();
      }
    });
    // 御剑运行时依赖正式导入表，单独模块图注入仅三处 enabled 置 false 的关态克隆。
    const memoryClosed = structuredClone({ 'companions.json': data['companions.json'], 'fly_zones.json': data['fly_zones.json'] });
    memoryClosed['companions.json'].enabled = false;
    memoryClosed['companions.json'].companions[0].enabled = false;
    memoryClosed['fly_zones.json'].enabled = false;
    const restored = structuredClone(memoryClosed);
    restored['companions.json'].enabled = true;
    restored['companions.json'].companions[0].enabled = true;
    restored['fly_zones.json'].enabled = true;
    assert.deepEqual(restored, { 'companions.json': data['companions.json'], 'fly_zones.json': data['fly_zones.json'] },
      '御剑关态夹具只能修改正式开表克隆中的三处 enabled');
    await runGraph(dataRoot, memoryClosed, async server => {
      const suite = await server.ssrLoadModule('/src/sword-ride.test.ts');
      assert.equal(typeof suite.runSwordRideTests, 'function', '必须复用现有真实御剑测试入口');
      await suite.runSwordRideTests({ openFixture: false });
    });
    assert.equal(JSON.stringify(data), formalBefore, `${mode}: 关态夹具不得污染正式内存数据`);
    console.log(JSON.stringify({ suite: 'v06b-closed', dataMode: mode, passed: true,
      formalOpen: true, closedFixtureOnly: true, giftsEnabled: false, indexedDbSaves: true,
      softOpenedSustainFlight: true, newOpenFlag: false, released: false }));
  }
} finally {
  for (const [file, sha] of before) {
    if (sha === null) await assert.rejects(fs.readFile(file), { code: 'ENOENT' }, `不得创建 feature 文件 ${file}`);
    else assert.equal(hash(await fs.readFile(file)), sha, `关态测试不得写表或开关 ${file}`);
  }
}
console.log('v06b closed tests ok: shared/snapshot 同字节；正式开态 SHA 守护 + 关态夹具行为 + gifts 仍关；IDB true、skills/npcs 不变；softOpenedSustainFlight:true、newOpenFlag:false、released:false；≠release');
