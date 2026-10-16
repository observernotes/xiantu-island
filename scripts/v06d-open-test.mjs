// 双根四图验收：正式旗标恒 true；关态只替换 Vite SSR 内存模块，不改正式配置。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), modes = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const out = path.join(root, 'qa/out_v06d_open_fixture');
const expectedSha = {
  'balance/tower_floors.json': '735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6',
  'balance/titles.json': 'd765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c',
  'balance/npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
  'balance/companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'balance/fly_zones.json': '2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4',
  'balance/quests.json': 'c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b',
  'balance/strings_zh.json': 'c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27',
  'maps/youying_tower.json': '6c5393853301e449482db4c3dbc140b289189a1d8d627c7e3934f5dbcfdd6f56',
};
const sourceSha = {
  'src/features.ts': 'ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130',
  'src/data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
  'data/features.json': '69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8',
};
const before = new Map(), evidence = [], sharedBytes = new Map();
let assertions = 0, runtimeAssertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const shaOrNull = async file => {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const report = row => { evidence.push(row); console.log(JSON.stringify(row)); };

async function protectTables() {
  // 全 balance 包括 quests intro、secret_*、gifts 等禁改内容；共享与快照独立记录。
  for (const [, dataRoot] of modes) {
    for (const name of (await fs.readdir(path.join(dataRoot, 'balance'))).filter(name => name.endsWith('.json'))) {
      const file = path.join(dataRoot, 'balance', name);
      before.set(file, await shaOrNull(file));
    }
    for (const name of ['features.json', 'maps/youying_tower.json']) {
      const file = path.join(dataRoot, name);
      before.set(file, await shaOrNull(file));
    }
  }
  for (const name of [...Object.keys(sourceSha), 'src/TowerOpenFlag.ts',
    ...Object.keys(expectedSha).map(name => `../../game/data/${name}`), '../../game/data/features.json']) {
    const file = path.resolve(root, name);
    before.set(file, await shaOrNull(file));
  }
}

async function checkFormal(mode, dataRoot) {
  const data = {};
  for (const [name, expected] of Object.entries(expectedSha)) {
    const bytes = await fs.readFile(path.join(dataRoot, name));
    eq(hash(bytes), expected, `${mode}: ${name} 正式 SHA 不变`);
    if (mode === 'shared') sharedBytes.set(name, bytes);
    else eq(bytes.equals(sharedBytes.get(name)), true, `${mode}: ${name} 与共享同字节`);
    data[name] = JSON.parse(bytes.toString('utf8'));
  }
  const tower = data['balance/tower_floors.json'], titles = data['balance/titles.json'];
  eq(tower.meta.floorCount, 30, `${mode}: 只读层数 30`);
  eq(tower.meta.firstClearOnly, true, `${mode}: 首通一次`);
  eq(tower.meta.startFromRule, { expression: 'max(1, highestClearedFloor - 10)', minFloor: 1, highestClearedFloorMinus: 10 }, `${mode}: 起层规则不变`);
  eq([tower.meta.roomRule.respawn, tower.meta.roomRule.advanceWhen], [false, 'allMobsClearedIncludingSplitChildren'], `${mode}: 禁复活与分裂清层契约`);
  eq(tower.floors.map(floor => floor.floor), Array.from({ length: 30 }, (_, index) => index + 1), `${mode}: 层号连续无 31`);
  ok(!Object.hasOwn(tower, 'enabled') && !Object.hasOwn(tower.meta, 'enabled'), `${mode}: 无正式塔 enabled 字段`);
  eq(titles.map(title => title.name), ['镇妖·十层', '镇妖·二十层', '镇妖·三十层'], `${mode}: 正式称号非旧占位名`);
  const strings = data['balance/strings_zh.json'];
  eq(Object.keys(strings).length, 920, `${mode}: 原 904 键及 tower、market 关态各八键不增改`);
  for (const floor of [10, 20, 30]) {
    const title = titles.find(title => title.id === `title_tower_${floor}`);
    eq([title.name, title.desc], [strings[`title.tower_${floor}.name`], strings[`title.tower_${floor}.desc`]], `${mode}: 称号名和描述沿用 strings`);
  }
  const route = data['balance/npcs.json'].find(npc => npc.id === 'ferry_master').ferryRoutes.find(route => route.id === 'youying_tower');
  eq(route, { id: 'youying_tower', label: 'ferry.route_youying_tower', targetMap: 'youying_tower', targetPortal: null, cost: 0 }, `${mode}: 免费渡口仍到山门`);
  let giftsChecked = 0;
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { giftsChecked++; eq(child.enabled, false, `${mode}: gifts 全关`); }
      visit(child);
    }
  };
  visit(data['balance/npcs.json']);
  eq(giftsChecked, 10, `${mode}: 全部十处 gifts 已核查`);
  report({ suite: 'v06d-open-formal', dataMode: mode, formalOpen: true, closedFixtureOnly: true,
    giftsChecked, giftsEnabled: 0, floorCount: 30, protectedSha: expectedSha });
}

async function runGraph(mode, dataRoot, openFixture) {
  let featureOverrideCalls = 0, flagLoads = 0;
  const flagId = '\0v06d-memory-closed-tower-flag';
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06d-memory-only-closed', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0v06d-open-phaser';
        if (!openFixture && /(?:^|\/)TowerOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) {
          flagLoads++;
          return 'export function isTowerOpenForFixture() { return false; }';
        }
        if (id !== '\0v06d-open-phaser') return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Input: { Keyboard: { JustDown: key => { const down = !!key?._justDown; if (key) key._justDown = false; return down; } } },
          Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)), Linear: (from, to, amount) => from + (to - from) * amount } };`;
      },
      transform(source, id) {
        if (!id.endsWith('/src/features.ts')) return;
        // 所有生产 feature 调用原样执行；覆盖入口一旦被调用立即失败并计数。
        return source.replace(/export function setFeatureFlag\(name: FeatureName, value: boolean\): void \{/u,
          'export function setFeatureFlag(name: FeatureName, value: boolean): void { globalThis.__v06dFeatureOverrideAttempt();');
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__v06dFeatureOverrideAttempt');
  Object.defineProperty(globalThis, '__v06dFeatureOverrideAttempt', { configurable: true, value() {
    featureOverrideCalls++; throw new Error('本套件禁止 feature 覆盖');
  } });
  try {
    const flag = await server.ssrLoadModule('/src/TowerOpenFlag.ts');
    eq(flag.isTowerOpenForFixture(), openFixture, `${mode}: 正式图读 true，关态图仅内存注入 false`);
    const suite = await server.ssrLoadModule('/src/v06d-open.test.ts');
    const result = await suite.runV06dOpenTests({ openFixture, dataMode: mode });
    runtimeAssertions += result.assertions;
    eq(featureOverrideCalls, 0, `${mode}: 正式/关态图均不调用 feature 覆盖`);
    eq(flagLoads, openFixture ? 0 : 1, `${mode}: 正式图无注入，关态只装载一次内存 flag`);
    report({ suite: 'v06d-open-graph', dataMode: mode, graph: openFixture ? 'formal-open' : 'memory-closed',
      formalOpen: true, closedFixtureOnly: true, featureOverrideCalls, result });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, '__v06dFeatureOverrideAttempt', descriptor);
    else Reflect.deleteProperty(globalThis, '__v06dFeatureOverrideAttempt');
    await server.close();
  }
}

await fs.mkdir(out, { recursive: true });
let passed = false;
try {
  await protectTables();
  for (const [name, expected] of Object.entries(sourceSha)) eq(await shaOrNull(path.join(root, name)), expected, `${name} 禁改 SHA`);
  const flag = await fs.readFile(path.join(root, 'src/TowerOpenFlag.ts'), 'utf8');
  ok(/export function isTowerOpenForFixture\(\): boolean\s*\{\s*return true;\s*\}/u.test(flag), '正式磁盘 flag 恒 true');
  for (const [mode, dataRoot] of modes) await checkFormal(mode, dataRoot);
  for (const [mode, dataRoot] of modes) {
    await runGraph(mode, dataRoot, true);
    await runGraph(mode, dataRoot, false);
  }
  passed = true;
} finally {
  for (const [file, sha] of before) eq(await shaOrNull(file), sha, `夹具前后字节不变：${file}`);
  report({ suite: 'v06d-open-sha-guard', protectedFiles: before.size, passed: true });
  await fs.writeFile(path.join(out, 'v06d-open-evidence.json'), `${JSON.stringify({ passed,
    assertions: assertions + runtimeAssertions, staticAssertions: assertions, runtimeAssertions,
    formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false,
    protectedFiles: Object.fromEntries(before), evidence }, null, 2)}\n`);
}
console.log(`v06d open tests ok: ${assertions + runtimeAssertions} assertions; shared/snapshot 双根正式开态+内存关态四图；O01–O08 自动化通过；tower_floors/titles/strings/gifts/地图/features SHA 不变；gifts0；GAME_PHASE=5；formalOpen:true、closedFixtureOnly:true；正式 flag=true，已软开；未发版`);
