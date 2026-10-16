// 仅 Vite SSR 图内替换 quests JSON；正式表和 features 在双根均只读。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modes = [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]];
const introId = 'q_secret_nest_intro';
const expectedSha = {
  'balance/quests.json': '22d443c17df97906e87c947b21adad94136006dccb6973e13877448105d2334e',
  'balance/strings_zh.json': '4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385',
  'maps/wanyao_outer_1.json': '9c05955fb39631e1236f2583f3be65e66823be2da3b30efaafc10ff443074b10',
  'balance/companions.json': 'e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115',
  'balance/fly_zones.json': '2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4',
  'balance/npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const before = new Map(), tables = new Map(), sharedBytes = new Map();
let totalAssertions = 0;
const shaOrNull = async file => {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

async function protectTables() {
  for (const [, dataRoot] of modes) {
    const names = (await fs.readdir(path.join(dataRoot, 'balance'))).filter(name => name.endsWith('.json'));
    for (const rel of [...names.map(name => `balance/${name}`), 'features.json', 'maps/wanyao_outer_1.json']) {
      const file = path.join(dataRoot, rel);
      before.set(file, await shaOrNull(file));
    }
  }
  const featuresSource = path.join(root, 'src/features.ts');
  before.set(featuresSource, await shaOrNull(featuresSource));
}

async function checkFormal(mode, dataRoot) {
  const data = {};
  for (const [rel, sha] of Object.entries(expectedSha)) {
    const bytes = await fs.readFile(path.join(dataRoot, rel));
    assert.equal(hash(bytes), sha, `${mode}: ${rel} 正式 SHA`);
    if (mode === 'shared') sharedBytes.set(rel, bytes);
    else assert(bytes.equals(sharedBytes.get(rel)), `${rel}: 共享/快照同字节`);
    data[rel] = JSON.parse(bytes.toString('utf8'));
  }
  const intros = data['balance/quests.json'].filter(q => q.id === introId);
  assert.equal(intros.length, 1, `${mode}: intro 唯一`);
  const intro = intros[0];
  assert.equal(intro.enabled, false, `${mode}: 正式 intro 仍关`);
  assert.equal(intro.phase, 6, `${mode}: 正式 intro 仍 phase 6`);
  assert.deepEqual(intro.rewards, {}, `${mode}: intro 无收益`);
  assert.equal(intro.giver, 'hunter_lei');
  assert.equal(intro.turnIn, 'hunter_lei');
  assert.equal(intro.prereq, 'q_main_04');
  assert.equal(intro.reqRealm, 'foundation');
  assert.equal(intro.reqLevel, 30);
  assert.deepEqual(intro.objectives, [{ type: 'reach', map: 'wanyao_outer_1', target: 'secret_nest_sign' }]);
  assert.equal(intro.next, null);
  assert.equal(data['balance/companions.json'].enabled, true, `${mode}: 同门根保持软开`);
  assert.equal(data['balance/companions.json'].companions[0].enabled, true, `${mode}: 苏条目保持软开`);
  assert.equal(data['balance/fly_zones.json'].enabled, true, `${mode}: fly 根保持软开`);
  let gifts = 0;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { assert.equal(child?.enabled, false, `${mode}: gifts 全关`); gifts++; }
      visit(child);
    }
  }
  visit(data['balance/npcs.json']);
  assert(gifts > 0, `${mode}: 实际核查 gifts`);
  const featuresFile = path.join(dataRoot, 'features.json');
  if (before.get(featuresFile) !== null) {
    const features = JSON.parse(await fs.readFile(featuresFile, 'utf8'));
    assert.equal(features.indexedDbSaves, true, `${mode}: IDB 保持 true`);
  }
  tables.set(mode, data);
  console.log(JSON.stringify({ suite: 'v06c-open-formal', dataMode: mode, introEnabled: false, introPhase: 6,
    giftsChecked: gifts, giftsEnabled: false, companionsEnabled: true, flyZonesEnabled: true,
    protectedSha: expectedSha }));
}

async function runGraph(mode, dataRoot, memoryQuests) {
  const openFixture = memoryQuests !== null;
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06c-open-memory-only', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0v06c-open-phaser';
        if (openFixture && id.endsWith('/balance/quests.json')) return '\0v06c-open-quests.mjs';
      },
      load(id) {
        if (id === '\0v06c-open-quests.mjs') return `export default ${JSON.stringify(memoryQuests)};`;
        if (id !== '\0v06c-open-phaser') return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } },
          Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Input: { Keyboard: { JustDown: key => {
            const down = !!key?._justDown; if (key) key._justDown = false; return down;
          } } },
          Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
            Linear: (from, to, amount) => from + (to - from) * amount } };`;
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  try {
    const api = await server.ssrLoadModule('/src/SecretNestClosed.ts');
    assert.equal(api.isSecretNestIntroEnabled(), openFixture, `${mode}: 门禁必须读到 SSR JSON 的真实状态`);
    const { QUESTS } = await server.ssrLoadModule('/src/data.ts');
    assert.equal(!!QUESTS[introId], openFixture, `${mode}: 克隆 phase 5 才进入运行时 QUESTS`);
    if (openFixture) {
      assert.equal(QUESTS[introId].enabled, true);
      assert.equal(QUESTS[introId].phase, 5);
    }
    const suite = await server.ssrLoadModule('/src/v06c-open.test.ts');
    const result = await suite.runV06cOpenTests({ openFixture, dataMode: mode });
    if (typeof result?.assertions === 'number') totalAssertions += result.assertions;
    console.log(JSON.stringify({ suite: 'v06c-open-graph', dataMode: mode, openFixture, result }));
  } finally { await server.close(); }
}

await protectTables();
try {
  // 两根全部先验正式 SHA，任何一处漂移都会在执行夹具前失败。
  for (const [mode, dataRoot] of modes) await checkFormal(mode, dataRoot);
  for (const [mode, dataRoot] of modes) {
    const formal = tables.get(mode)['balance/quests.json'];
    const formalBefore = clone(formal);
    const memoryQuests = clone(formal);
    const intro = memoryQuests.find(q => q.id === introId);
    // 全局 GAME_PHASE=5；只为夹具可见性改克隆 phase，不改正式表或 GAME_PHASE。
    intro.enabled = true; intro.phase = 5;
    const restored = clone(memoryQuests);
    Object.assign(restored.find(q => q.id === introId), { enabled: false, phase: 6 });
    assert.deepEqual(restored, formal, `${mode}: 内存克隆只改 intro enabled/phase 两字段`);
    await runGraph(mode, dataRoot, null); // 同套件、无 quests 注入的正式关态对照。
    await runGraph(mode, dataRoot, memoryQuests);
    assert.deepEqual(formal, formalBefore, `${mode}: 正式内存对象不受夹具污染`);
  }
} finally {
  for (const [file, sha] of before) assert.equal(await shaOrNull(file), sha, `夹具不得写正式表/features: ${file}`);
  console.log(JSON.stringify({ suite: 'v06c-open-sha-guard', protectedFiles: before.size, passed: true }));
}
console.log(`v06c open tests ok: shared/snapshot 开态内存夹具 + 正式关态对照；${totalAssertions} 断言；intro 正式 disabled/phase6、gifts 全关、IDB true；全部保护文件 SHA 不变`);
