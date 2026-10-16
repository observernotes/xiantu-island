// 关态正式表双数据根验收；Vite SSR 仅替换渲染容器，不写配置或开关。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), snapshot = path.join(root, 'data');
// 本轮只读保护基线：既有 sword_ride / NPC 数值与两张关闭表均不得改写。
const protectedSha = {
  'companions.json': '8e1fe697721999f02723e99b109a3e6a2a12eb537cecf2993bdd81c6aa762fa5',
  'fly_zones.json': 'a55bd3cae2b057c26a5ca1842055c9b0dfc2b39910e17f8537dd971fcaca2b98',
  'skills.json': 'd80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
};
const names = [...Object.keys(protectedSha), 'strings_zh.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const before = new Map();

function assertClosed(data, mode) {
  const companions = data['companions.json'], fly = data['fly_zones.json'];
  assert.equal(companions.enabled, false, `${mode}: companions 根继续关闭`);
  assert.equal(companions.companions.length, 1, `${mode}: 同门仍只有苏师姐一条`);
  assert.equal(companions.companions[0].id, 'companion_senior_sister_su');
  assert.equal(companions.companions[0].npcId, 'senior_sister_su');
  assert.equal(companions.companions[0].enabled, false, `${mode}: 唯一同门条目继续关闭`);
  assert.equal(fly.enabled, false, `${mode}: fly_zones 根继续关闭`);
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
  console.log(JSON.stringify({ suite: 'v06b-closed-tables', dataMode: mode,
    companionsEnabled: companions.enabled, companionEnabled: companions.companions[0].enabled,
    flyZonesEnabled: fly.enabled, giftsChecked: gifts, giftsEnabled: false }));
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
    assertClosed(data, mode);
  }
  for (const dataRoot of [shared, snapshot]) {
    const features = path.join(dataRoot, 'features.json');
    try { before.set(features, hash(await fs.readFile(features))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }

  for (const [mode, dataRoot] of [['snapshot', snapshot], ['shared', shared]]) {
    const server = await createServer({
      root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
      server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
      plugins: [{ name: 'v06b-render-stub', enforce: 'pre',
        resolveId(id) { if (id === 'phaser') return '\0v06b-phaser'; },
        load(id) {
          if (id !== '\0v06b-phaser') return;
          return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
            Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
            Scenes: { Events: { SHUTDOWN: 'shutdown' } },
            Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
            Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
              Linear: (from, to, amount) => from + (to - from) * amount } };`;
        },
      }], ssr: { noExternal: ['phaser'] },
    });
    try {
      for (const [file, run] of [
        ['companions.test.ts', 'runCompanionsTests'],
        ['companions-save.test.ts', 'runCompanionsSaveTests'],
        ['sword-ride.test.ts', 'runSwordRideTests'],
        ['fly-zones.test.ts', 'runFlyZonesTests'],
      ]) {
        const suite = await server.ssrLoadModule(`/src/${file}`);
        assert.equal(typeof suite[run], 'function', `${file} 必须导出 ${run}`);
        await suite[run]();
      }
      console.log(JSON.stringify({ suite: 'v06b-closed', dataMode: mode, passed: true }));
    } finally { await server.close(); }
  }
} finally {
  for (const [file, sha] of before) assert.equal(hash(await fs.readFile(file)), sha, `关态测试不得写表或开关 ${file}`);
}
console.log('v06b closed tests ok: shared/snapshot bytes and SHA match; companions/fly_zones/gifts remain disabled; skills/npcs unchanged');
