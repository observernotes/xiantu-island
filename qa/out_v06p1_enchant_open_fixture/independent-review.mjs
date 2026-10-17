// 独立边界探针：真实 Vite SSR Gate/Progress，存储介质显式内存替换，不接生产入口。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../..');
const virtualFlag = '\0independent-enchant-open';
const cases = [], copy = value => structuredClone(value);
let assertions = 0, passed = false, flagLoads = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (actual, message) => { assertions++; assert.ok(actual, message); };
const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'error',
  resolve: { alias: { '@xt': '/workspace/xiantu' } }, server: { middlewareMode: true, hmr: false, ws: false },
  plugins: [{ name: 'independent-enchant-memory-flag', enforce: 'pre',
    resolveId(id) { if (id.endsWith('/EnchantOpenFlag') || id.endsWith('/EnchantOpenFlag.ts')) return virtualFlag; },
    load(id) { if (id === virtualFlag) { flagLoads++; return 'export function isEnchantOpenForFixture() { return true; }'; } },
  }],
});
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let writes = 0, localWrites = 0, oldSlot;
try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => { localWrites++; },
  } });
  const [{ Progress }, { ForgeGate }, { EnchantGate }, store, recipeModule] = await Promise.all([
    server.ssrLoadModule('/src/Progress.ts'), server.ssrLoadModule('/src/ForgeGate.ts'), server.ssrLoadModule('/src/EnchantGate.ts'),
    server.ssrLoadModule('/src/SaveStore.ts'), server.ssrLoadModule('/@fs/workspace/xiantu/balance/recipes.json'),
  ]);
  const { saveStore, setSaveBackend, createMemorySaveBackend } = store;
  const backend = createMemorySaveBackend();
  setSaveBackend({ ...backend, async write(slot) { writes++; await backend.write(slot); } });
  oldSlot = Progress.getActiveSlot(); Progress.setActiveSlot(1);
  let sequence = 0;
  const request = (id, ref) => ({ enchantRequestId: id, instanceRef: ref, fromElement: null, element: '金' });
  async function source() {
    const recipe = recipeModule.default.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword');
    const p = new Progress(); p.stones = 100000; p.rootElement = '金';
    p.inventory = { beast_core: 10, refine_stone: 20, protect_charm: 2, [recipe.blueprint]: 10 };
    for (const row of recipe.materials) p.inventory[row.item] = row.count * 10;
    const forged = await new ForgeGate(p, { random: () => 0, ledgerId: () => `independent-source-${++sequence}` }).submit({
      craftRequestId: `independent-${sequence}`, blueprintId: recipe.blueprint,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })),
    });
    ok(forged.allowed && forged.result, '探针来源由正式 ForgeGate 创建');
    return { p, ref: forged.result.resultItem.instanceRef };
  }

  const first = await source(), original = request('independent-first', first.ref);
  const committed = await new EnchantGate(first.p).submit(original);
  ok(committed.allowed && committed.result, '正式源首次完整附灵成功');
  const bag = copy(first.p.enchant);
  Progress.setActiveSlot(2);
  const cross = new Progress();
  eq(await cross.importSave({ ...cross.exportSave(), enchant: bag }, { async: true }), true, '结构完整袋可由既有导入承载');
  const beforeCross = copy(cross.exportSave()), crossWrites = writes, crossGate = new EnchantGate(cross);
  for (const result of [await crossGate.submit(original), crossGate.result(original.enchantRequestId), crossGate.element(first.ref), crossGate.loadRefresh()])
    eq(result.allowed, false, '缺本档正式来源的跨档完整袋不能授权重放或读取');
  eq(cross.exportSave(), beforeCross, '跨档拒绝保留原袋不修档'); eq(writes, crossWrites, '跨档拒绝零写');
  cases.push({ id: 'cross-slot-complete-enchant-bag-without-source', passed: true, repairedFinding: true });

  Progress.setActiveSlot(1);
  const stale = await source(), staleBefore = copy(stale.p.exportSave());
  const current = copy((await saveStore.readSlot(1)).data); current.exp += 1;
  eq(await saveStore.writeSlot(1, current), true, '磁盘预置非附灵业务进度变化');
  const staleWrites = writes, rejected = await new EnchantGate(stale.p).submit(request('independent-stale-exp', stale.ref));
  eq(rejected.allowed, false, '旧对象不得覆盖磁盘 exp 新事实');
  eq(rejected.tipKey, 'enchant.fixture.stale', '全存档快照识别冲突');
  eq(stale.p.exportSave(), staleBefore, '旧对象零半消费'); eq(writes, staleWrites, '非附灵事实冲突零写');
  eq((await saveStore.readSlot(1)).data, current, '磁盘新合法事实保持');
  cases.push({ id: 'stale-object-preserves-unrelated-saved-exp', passed: true, repairedFinding: true });

  const race = await source(), second = new Progress();
  Object.assign(second, copy(Object.fromEntries(Object.entries(race.p).filter(([, value]) => typeof value !== 'function'))));
  const raceInput = request('independent-concurrent', race.ref), raceWrites = writes, raceStones = race.p.stones;
  const results = await Promise.all([new EnchantGate(race.p).submit(raceInput), new EnchantGate(second).submit(copy(raceInput))]);
  eq(results.filter(row => row.allowed).length, 1, '同档不同 Progress 对象至多一笔成功');
  eq(writes, raceWrites + 1, '同档竞争仅一次写入');
  eq((await saveStore.readSlot(1)).data.stones, raceStones - 2000, '资源仅扣一次');
  const committedObject = race.p.enchant ? race.p : second, losingObject = race.p.enchant ? second : race.p;
  const settledWrites = writes;
  const replayed = await new EnchantGate(committedObject).submit(copy(raceInput));
  eq(replayed.allowed, true, '成功对象原请求只读重放'); eq(replayed.replayed, true, '完整重放标记');
  eq((await new EnchantGate(losingObject).submit(copy(raceInput))).allowed, false, '竞争结束旧对象不补做重复消费');
  eq(writes, settledWrites, '重放与旧对象拒绝均零写');
  cases.push({ id: 'same-slot-distinct-progress-objects-one-complete-commit', passed: true });
  eq(flagLoads, 1, '仅 SSR 内存图注入 true 一次'); eq(localWrites, 0, '无 localStorage 旁路写');
  passed = true;
  Progress.setActiveSlot(oldSlot);
} finally {
  await server.close();
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else delete globalThis.localStorage;
  const sources = {};
  for (const file of ['src/EnchantGate.ts', 'src/EnchantProgress.ts', 'src/Progress.ts', 'src/v06p1-enchant-open.test.ts'])
    sources[file] = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
  const result = { passed, assertions, independent: true, commandStdin: '/dev/null', dataMode: 'shared', graph: 'memory-open',
    realViteSsr: true, explicitMemorySaveBackend: true, actualIndexedDbBrowser: false, flagLoads,
    staticReviewed: ['eight-public-entry-first-flag-check', 'independent-flag-and-no-frontend-hook', 'strict-items-phase5-and-effective-material-mapping',
      'no-rate-or-random-settlement', 'exact-request-payload-replay', 'atomic-cost-result-element-receipt', 'unknown-records-blocked-without-repair',
      'Progress-minimum-structure-only', 'existing-enhance-protect-preserved'],
    cases, sourceShas: sources, EnchantOpenFlag: false, softOpenedEnchant: false, released: false,
    scopeLimit: '独立探针只补核缺源跨档、非附灵事实 stale 与不同 Progress 对象并发；O01–O08 全表及真实 IDB complete/abort 由主 runner 证据覆盖。' };
  await fs.writeFile(path.join(out, 'independent-review.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ passed, assertions, cases, flagLoads }));
}
