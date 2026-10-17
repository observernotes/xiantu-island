// B 生产 resolver 成功路径；正式 Flag 原字节加载，关态仅用独立 SSR 内存图。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';
import { attrUiSoftOpenOutput } from './v06p1-attr-ui-soft-open-output.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const roots = [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]];
const out = attrUiSoftOpenOutput(root, 'binding-success');
const baseline = 'cc8fc1aad18cc00550b8092e27694d9c5f1c8783';
const enhanceSha = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954';
const flagShas = {
  Forge: '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  Enhance: 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  Enchant: 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  Salvage: '69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3',
};
const protectedFiles = {}, evidence = [];
let assertions = 0, passed = false, localStorageWrites = 0, backendWrites = 0, sentinelCalls = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (actual, message) => { assertions++; assert.ok(actual, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const copy = value => structuredClone(value);
const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
const key = name => `ui.equip.inst.${name}`;
const keys = display => display.lines.map(line => line.key);
const line = (display, name) => display.lines.find(row => row.key === key(name))?.text;
const state = p => JSON.stringify(p.exportSave());
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });

async function guard(file, expected) {
  const actual = hash(await fs.readFile(file));
  eq(actual, expected, `冻结字节 MATCH: ${file}`); protectedFiles[file] = actual;
}
async function staticChecks() {
  eq(root, '/workspace/xiantu/wt/feat/ui-attr-inst', '仅运行授权 wt');
  eq(git('branch', '--show-current').toString().trim(), 'feat/ui-attr-inst', '仅运行授权分支');
  for (const [name, expected] of Object.entries(flagShas)) {
    await guard(path.join(root, `src/${name}OpenFlag.ts`), expected);
    const file = `src/${name}Gate.ts`;
    await guard(path.join(root, file), hash(git('show', `${baseline}:${file}`)));
  }
  await guard(path.join(root, 'src/data.ts'), hash(git('show', `${baseline}:src/data.ts`)));
  for (const [, dataRoot] of roots) {
    for (const name of ['enhance', 'enhance_protect_charm', 'materials', 'items', 'recipes', 'npcs', 'life_skills'])
      await guard(path.join(dataRoot, `balance/${name}.json`), name === 'enhance' ? enhanceSha
        : hash(git('show', `${baseline}:data/balance/${name}.json`)));
    const npcs = await json(path.join(dataRoot, 'balance/npcs.json'));
    const gifts = (npcs.npcs ?? npcs).filter(row => row.affinity?.gifts);
    eq(gifts.length, 10, `${dataRoot}: gifts 十处`);
    ok(gifts.every(row => row.affinity.gifts.enabled === false), `${dataRoot}: gifts 10×false`);
  }
}

function mockScene() {
  const containers = [];
  const node = value => {
    const object = { value, children: [], destroyed: false,
      add(child) { this.children.push(child); return this; }, destroy() { this.destroyed = true; }, on() { return this; } };
    const proxy = new Proxy(object, { get(target, name) { return name in target ? target[name] : () => proxy; } });
    return proxy;
  };
  return { containers, texts: () => containers.at(-1)?.children.filter(child => typeof child.value === 'string').map(child => child.value) ?? [],
    input: { keyboard: { on() {}, off() {} } }, events: { once() {} }, time: { now: 1000 },
    scale: { width: 800, height: 600 }, textures: { exists: () => false }, cache: { json: { get: () => undefined } },
    add: { container() { const object = node(); containers.push(object); return object; },
      text(_x, _y, value) { return node(value); }, graphics() { return node(); }, zone() { return node(); }, image() { return node(); } } };
}

function withSentinels(p, gates, action) {
  const changes = [];
  const install = (target, name) => {
    changes.push([target, name, Object.getOwnPropertyDescriptor(target, name)]);
    Object.defineProperty(target, name, { configurable: true, value() {
      sentinelCalls++; throw new Error(`展示路径调用写/收费接口 ${name}`);
    } });
  };
  for (const name of ['save', 'saveAsync', 'persistSoon', 'runSaveTransaction', 'runSaveTransactionAsync',
    'registerFormalEnhanceInstance', 'equipItem', 'unequipSlot', 'addItem', 'removeItem', 'gainEquip']) install(p, name);
  for (const Gate of gates) for (const name of ['submit', 'craft', 'enhance', 'enchant', 'salvage'])
    if (typeof Gate.prototype[name] === 'function') install(Gate.prototype, name);
  try { return action(); }
  finally { for (const [target, name, descriptor] of changes.reverse()) {
    if (descriptor) Object.defineProperty(target, name, descriptor); else Reflect.deleteProperty(target, name);
  } }
}
function readOnly(p, gates, action, label) {
  const before = state(p), publicBefore = JSON.stringify(p), counters = [localStorageWrites, backendWrites, sentinelCalls];
  const result = withSentinels(p, gates, action);
  eq(state(p), before, `${label}: 整档零增量`);
  eq(JSON.stringify(p), publicBefore, `${label}: 公开字段零增量`);
  eq([localStorageWrites, backendWrites, sentinelCalls], counters, `${label}: 保存/服务哨兵零调用`);
  return result;
}

async function createGraph(dataRoot, memoryClosed) {
  const flagLoads = { Enhance: 0, Enchant: 0 };
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'attr-ui-binding-success-phaser-and-memory-closed', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0attr-binding-phaser';
        const match = id.match(/(?:^|\/)(Enhance|Enchant)OpenFlag(?:\.ts)?$/u);
        if (memoryClosed && match) return `\0attr-binding-${match[1]}-closed`;
      },
      load(id) {
        if (id === '\0attr-binding-phaser') return `class Sprite {} export default { Scene: class {},
          Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Physics: { Arcade: { Sprite } },
          GameObjects: { Sprite, NineSlice: class {} }, Math: { Clamp: (n,a,b) => Math.min(b,Math.max(a,n)) } };`;
        for (const name of Object.keys(flagLoads)) if (id === `\0attr-binding-${name}-closed`) {
          flagLoads[name]++; return `export function is${name}OpenForFixture() { return false; }`;
        }
      } }], ssr: { noExternal: ['phaser'] } });
  return { server, flagLoads };
}

async function runFormal(mode, dataRoot) {
  const { server, flagLoads } = await createGraph(dataRoot, false);
  let Progress, oldSlot, features, oldFlags, setSaveBackend, createMemorySaveBackend;
  try {
    ({ Progress } = await server.ssrLoadModule('/src/Progress.ts'));
    ({ setSaveBackend, createMemorySaveBackend } = await server.ssrLoadModule('/src/SaveStore.ts'));
    features = await server.ssrLoadModule('/src/features.ts'); oldFlags = features.featureFlags();
    features.setFeatureFlag('indexedDbSaves', true);
    oldSlot = Progress.getActiveSlot(); Progress.setActiveSlot(1);
    const backend = createMemorySaveBackend();
    setSaveBackend({ ...backend, async write(value) { backendWrites++; await backend.write(value); } });
    const api = await server.ssrLoadModule('/src/EquipInstReadonly.ts');
    const formal = await server.ssrLoadModule('/src/EquipInstBinding.ts');
    const { ForgeGate } = await server.ssrLoadModule('/src/ForgeGate.ts');
    const { EnhanceGate } = await server.ssrLoadModule('/src/EnhanceGate.ts');
    const { EnchantGate } = await server.ssrLoadModule('/src/EnchantGate.ts');
    const { SalvageGate } = await server.ssrLoadModule('/src/SalvageGate.ts');
    const { EquipPanel } = await server.ssrLoadModule('/src/EquipPanel.ts');
    const { InventoryPanel } = await server.ssrLoadModule('/src/InventoryPanel.ts');
    const { GAME_PHASE } = await server.ssrLoadModule('/src/data.ts');
    const gates = [ForgeGate, EnhanceGate, EnchantGate, SalvageGate];
    const read = (p, action, label) => readOnly(p, gates, action, `${mode}/formal-source ${label}`);
    const E = p => api.resolveEquipSlotBinding(p, 'weapon');
    const I = (p, row) => api.resolveInventoryEquipBinding(p, row);
    eq(GAME_PHASE, 5, `${mode}: GAME_PHASE=5`);
    for (const name of Object.keys(flagShas)) {
      const module = await server.ssrLoadModule(`/src/${name}OpenFlag.ts`);
      eq(module[`is${name}OpenForFixture`](), true, `${mode}: 正式 ${name} Flag 原样 true`);
    }
    const recipe = (await json(path.join(dataRoot, 'balance/recipes.json'))).recipes
      .find(row => row.type === 'forge' && row.output === 'bamboo_sword');
    ok(recipe, `${mode}: 使用正式竹剑配方`);
    const p = new Progress(); p.level = 20; p.rootElement = '火'; p.stones = 100000; p.equip = {};
    p.inventory = { refine_stone: 100, beast_core: 10, [recipe.blueprint]: 5 };
    for (const material of recipe.materials) p.inventory[material.item] = material.count * 5;
    const forge = new ForgeGate(p, { random: () => 0, ledgerId: () => `${mode}-binding-forge` });
    const craft = id => forge.submit({ craftRequestId: id, blueprintId: recipe.blueprint,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })) });
    const first = await craft('one'), second = await craft('two');
    ok(first.allowed && first.result && second.allowed && second.result, `${mode}: 两件真实正式打造成品`);
    const ref = first.result.resultItem.instanceRef, secondRef = second.result.resultItem.instanceRef;
    ok(ref !== secondRef, `${mode}: 同 itemId 保留两个不同正式 ref`);
    eq(p.formalEnhanceInstanceStatus(ref), 'registered', `${mode}: 正式成品来源链完整`);
    const row = { id: 'bamboo_sword', type: 'equip', instanceRef: ref };
    eq(read(p, () => I(p, row), '明确袋行 resolver'), { kind: 'verified', instanceRef: ref }, `${mode}: I 明确 ref verified`);
    eq(I(p, { id: row.id, type: 'equip' }), { kind: 'no_instance' }, `${mode}: I 聚合行不借正式候选`);
    eq(I(p, undefined), { kind: 'not_equip' }, `${mode}: I 空行独立分型`);
    eq(E(p), { kind: 'empty' }, `${mode}: 打造不自动穿戴`);
    const eScene = mockScene(), iScene = mockScene();
    const e = new EquipPanel(eScene, p, () => { throw new Error('展示触发穿脱回调'); });
    const i = new InventoryPanel(iScene, p, { onChanged() { throw new Error('展示触发穿戴'); }, openAlchemy: () => false, openSectToken: () => false });
    read(p, () => { e.open(); i.open(); i.setTab('equip'); }, 'E/I 打开');
    const emptyContainer = eScene.containers.at(-1);
    eq(await p.runSaveTransactionAsync(draft => draft.equipItem(row.id, ref)), { ok: true }, `${mode}: equipItem(id, knownRef) 正式穿戴`);
    eq(read(p, () => E(p), '已穿戴 E resolver'), { kind: 'verified', instanceRef: ref }, `${mode}: E 接线后 verified`);
    eq(E(p), formal.resolveFormalEquipSlotBinding(p, 'weapon'), `${mode}: E 与生产 API 一致`);
    read(p, () => { e.update(); i.update(); }, '绑定变化刷新');
    ok(emptyContainer.destroyed, `${mode}: 空槽变绑定后 E 旧容器已销毁`);
    eq(keys(e.snapshot().instDisplay), [key('no_enhance'), key('no_enchant')], `${mode}: 正式已绑定零态可读`);
    eq(I(p, row), { kind: 'no_instance' }, `${mode}: 已穿戴实例不冒充袋行`);

    const beforeEnhance = eScene.containers.at(-1);
    const enhanced = await new EnhanceGate(p, { random: () => 0 }).submit({ enhanceRequestId: 'first-up',
      instanceRef: ref, fromLevel: 0, to: 1, useProtectCharm: false });
    ok(enhanced.allowed && enhanced.result?.success, `${mode}: 正式强化成功结果`);
    read(p, () => { e.update(); i.update(); }, '强化事实刷新');
    ok(beforeEnhance.destroyed, `${mode}: 强化事实变化实际重绘 E`);
    eq(line(e.snapshot().instDisplay, 'enhance_level'), '强化 +1', `${mode}: E 强化行 +1`);
    ok(eScene.texts().includes(line(e.snapshot().instDisplay, 'enhance_level')), `${mode}: +1 实际渲染`);
    const beforeEnchant = eScene.containers.at(-1);
    const enchanted = await new EnchantGate(p, { ledgerId: () => `${mode}-binding-enchant` }).submit({
      enchantRequestId: 'first-fire', instanceRef: ref, fromElement: null, element: '火' });
    ok(enchanted.allowed && enchanted.result, `${mode}: 正式附灵成功结果`);
    read(p, () => { e.update(); i.update(); }, '附灵事实刷新');
    ok(beforeEnchant.destroyed, `${mode}: 附灵事实变化实际重绘 E`);
    eq(line(e.snapshot().instDisplay, 'element_damage'), '五行伤害 +5%', `${mode}: E 附灵倍率行刷新`);
    ok(keys(e.snapshot().instDisplay).includes(key('enchant_element')), `${mode}: E 附灵元素行刷新`);

    const sameItemBefore = copy(p.equip), previousBinding = eScene.containers.at(-1);
    eq(await p.runSaveTransactionAsync(draft => draft.equipItem(row.id, secondRef)), { ok: true }, `${mode}: 同 itemId 换第二明确 ref`);
    eq(p.equip, sameItemBefore, `${mode}: 同 itemId 换 ref 装备 itemId 完全不变`);
    read(p, () => { e.update(); i.update(); }, '同 itemId 换 ref 刷新');
    ok(previousBinding.destroyed, `${mode}: 仅绑定/实例展示变化也实际重绘 E`);
    eq(e.snapshot().instDisplay.instanceRef, secondRef, `${mode}: E 更新为第二 ref`);
    eq(keys(e.snapshot().instDisplay), [key('no_enhance'), key('no_enchant')], `${mode}: 第二 ref 无上一件 +1/附灵旧文案`);
    eq(I(p, row), formal.resolveFormalInventoryEquipBinding(p, row), `${mode}: I 明确行接线与生产 API 一致`);
    const firstInBag = read(p, () => api.buildInstDisplay(p, I(p, row)), '第一件回袋明确行');
    eq(line(firstInBag, 'enhance_level'), '强化 +1', `${mode}: I 明确袋行保留第一件强化事实`);
    ok(keys(firstInBag).includes(key('enchant_element')), `${mode}: I 明确袋行保留第一件附灵事实`);
    const aggregate = i.snapshot().rows.find(entry => entry.id === row.id);
    ok(aggregate && !Object.hasOwn(aggregate, 'instanceRef'), `${mode}: 生产 InventoryPanel 仍输出聚合行`);
    eq(I(p, aggregate), { kind: 'no_instance' }, `${mode}: 生产 I 聚合行仍 no_instance`);
    eq(keys(i.snapshot().instDisplay), [key('no_instance')], `${mode}: 生产 I 不冒充明确袋行`);
    const bagEnhanced = await new EnhanceGate(p, { random: () => 0 }).submit({ enhanceRequestId: 'bag-up',
      instanceRef: ref, fromLevel: 1, to: 2, useProtectCharm: false });
    ok(bagEnhanced.allowed && bagEnhanced.result?.success, `${mode}: 袋中正式实例第二次强化`);
    eq(line(read(p, () => api.buildInstDisplay(p, I(p, row)), 'I 明确行重读新强化'), 'enhance_level'), '强化 +2', `${mode}: I 明确行不沿用旧强化事实`);
    eq(await p.runSaveTransactionAsync(draft => draft.equipItem(row.id, ref)), { ok: true }, `${mode}: 重穿第一明确 ref`);
    read(p, () => e.update(), '重穿强化实例刷新');
    eq(line(e.snapshot().instDisplay, 'enhance_level'), '强化 +2', `${mode}: E 重穿显示最新 +2`);
    const wornSave = copy(p.exportSave());

    let identityReads = 0, refReads = 0;
    const identityTrap = new Proxy({}, { get() { identityReads++; throw new Error('foreign 不得核身份'); } });
    const foreignBinding = Object.defineProperty({ kind: 'foreign' }, 'instanceRef', { get() { refReads++; throw new Error('foreign 无 ref'); } });
    eq(keys(api.buildInstDisplay(identityTrap, foreignBinding)), [key('foreign')], `${mode}: foreign 绑定直接展示 foreign`);
    eq([identityReads, refReads], [0, 0], `${mode}: foreign 不读 identity 或不存在的 instanceRef`);
    Progress.setActiveSlot(2);
    const foreign = Progress.restore(copy(wornSave), false);
    eq(read(foreign, () => E(foreign), '跨档 E resolver'), { kind: 'foreign' }, `${mode}: E 透传正式 API foreign`);
    eq(I(foreign, { id: row.id, instanceRef: secondRef }), { kind: 'foreign' }, `${mode}: I 透传正式 API foreign`);
    eq(keys(read(foreign, () => api.buildInstDisplay(foreign, E(foreign)), '跨档展示')), [key('foreign')], `${mode}: 跨档绑定没有成功行`);
    Progress.setActiveSlot(1);

    eq(await p.runSaveTransactionAsync(draft => draft.unequipSlot('weapon')), { ok: true }, `${mode}: 正式卸装成功`);
    eq(E(p), { kind: 'empty' }, `${mode}: 卸装后 E empty`);
    eq(p.equipInstanceRefs?.weapon, undefined, `${mode}: 卸装清显式绑定`);
    read(p, () => { e.update(); i.update(); }, '卸装后刷新');
    eq(e.snapshot().instLines, [], `${mode}: 卸装后 E 清旧属性行`);
    eq(I(p, row), { kind: 'verified', instanceRef: ref }, `${mode}: 卸装正式实例回袋`);
    eq(await p.runSaveTransactionAsync(draft => draft.equipItem(row.id)), { ok: true }, `${mode}: 旧无 ref 穿戴仍可用`);
    eq(E(p), { kind: 'no_instance' }, `${mode}: 旧无 ref 穿戴不猜绑定`);
    read(p, () => e.update(), '缺绑定刷新');
    eq(keys(e.snapshot().instDisplay), [key('no_instance')], `${mode}: 开态缺绑定仍 no_instance`);
    const oldSave = copy(wornSave); delete oldSave.equipInstanceRefs;
    const old = Progress.restore(oldSave, false);
    eq(read(old, () => E(old), '旧档缺绑定'), { kind: 'no_instance' }, `${mode}: 旧档缺绑定不回填`);
    eq(flagLoads, { Enhance: 0, Enchant: 0 }, `${mode}: 成功图未替换正式 Flag 模块`);
    read(p, () => { e.close(); i.close(); }, '关闭面板');
    evidence.push({ dataMode: mode, graph: 'formal-source', passed: true, instanceRef: ref, secondRef,
      defaultForgeFormalSource: true, equipKnownRefVerified: true, enhanceLine: '强化 +2', enchantLineRefreshed: true,
      sameItemIdDifferentRefRerendered: true, aggregateInventoryStillNoInstance: true,
      unequipBindingCleared: true, legacyMissingBindingNoInstance: true, foreignPassthroughWithoutIdentity: true,
      displayZeroWrites: true, formalFlagModuleReplacements: 0, flagLoads, softOpenedAttrUi: true, released: false });
    return { wornSave, ref, secondRef };
  } finally {
    if (features && oldFlags) for (const [name, value] of Object.entries(oldFlags)) features.setFeatureFlag(name, value);
    if (Progress && oldSlot !== undefined) Progress.setActiveSlot(oldSlot);
    if (setSaveBackend) setSaveBackend(createMemorySaveBackend());
    await server.close();
  }
}

async function runClosed(mode, dataRoot, fixture) {
  const { server, flagLoads } = await createGraph(dataRoot, true);
  let Progress, oldSlot;
  try {
    ({ Progress } = await server.ssrLoadModule('/src/Progress.ts'));
    oldSlot = Progress.getActiveSlot(); Progress.setActiveSlot(1);
    const api = await server.ssrLoadModule('/src/EquipInstReadonly.ts');
    const { EquipPanel } = await server.ssrLoadModule('/src/EquipPanel.ts');
    const { InventoryPanel } = await server.ssrLoadModule('/src/InventoryPanel.ts');
    const gates = [];
    for (const name of Object.keys(flagShas)) {
      const module = await server.ssrLoadModule(`/src/${name}OpenFlag.ts`);
      eq(module[`is${name}OpenForFixture`](), !['Enhance', 'Enchant'].includes(name), `${mode}/closed: ${name} 内存开态`);
      gates.push((await server.ssrLoadModule(`/src/${name}Gate.ts`))[`${name}Gate`]);
    }
    const p = Progress.restore(copy(fixture.wornSave), false);
    const read = (target, action, label) => readOnly(target, gates, action, `${mode}/memory-closed ${label}`);
    const binding = read(p, () => api.resolveEquipSlotBinding(p, 'weapon'), '已知绑定 resolver');
    eq(binding, { kind: 'verified', instanceRef: fixture.ref }, `${mode}/closed: 正式绑定仍 verified`);
    eq(keys(read(p, () => api.buildInstDisplay(p, binding), '已知绑定展示')), [key('unavailable')], `${mode}/closed: unavailable 优先于 +2/附灵事实`);
    let identityReads = 0, refReads = 0;
    const trap = new Proxy({}, { get() { identityReads++; throw new Error('closed 不读身份'); } });
    for (const kind of ['foreign', 'verified']) {
      const guarded = Object.defineProperty({ kind }, 'instanceRef', { get() { refReads++; throw new Error('closed 不读 ref'); } });
      eq(keys(api.buildInstDisplay(trap, guarded)), [key('unavailable')], `${mode}/closed: ${kind} 绑定也只显示 unavailable`);
    }
    eq([identityReads, refReads], [0, 0], `${mode}/closed: 关态不读 identity/instanceRef`);
    const e = new EquipPanel(mockScene(), p, () => { throw new Error('关态展示触发穿脱'); });
    const i = new InventoryPanel(mockScene(), p, { onChanged() { throw new Error('关态展示触发穿戴'); }, openAlchemy: () => false, openSectToken: () => false });
    read(p, () => { e.open(); i.open(); i.setTab('equip'); }, '已绑定 E/聚合 I 面板');
    eq(keys(e.snapshot().instDisplay), [key('unavailable')], `${mode}/closed: E 不泄漏绑定属性`);
    eq(keys(i.snapshot().instDisplay), [key('unavailable')], `${mode}/closed: I 缺绑定仍优先 unavailable`);
    Progress.setActiveSlot(2);
    const foreign = Progress.restore(copy(fixture.wornSave), false);
    const foreignBinding = read(foreign, () => api.resolveEquipSlotBinding(foreign, 'weapon'), '跨档 resolver');
    eq(foreignBinding, { kind: 'foreign' }, `${mode}/closed: resolver foreign 不吞掉`);
    eq(keys(read(foreign, () => api.buildInstDisplay(foreign, foreignBinding), '跨档展示')), [key('unavailable')], `${mode}/closed: unavailable 优先于 foreign`);
    read(p, () => { e.close(); i.close(); }, '关闭面板');
    eq(flagLoads, { Enhance: 1, Enchant: 1 }, `${mode}/closed: 只替换隔离图的双 Flag`);
    evidence.push({ dataMode: mode, graph: 'memory-closed', passed: true, knownBindingStillVerified: true,
      foreignResolverPreserved: true, closedOverridesVerifiedAndForeign: true, identityReads, refReads,
      displayZeroWrites: true, flagLoads, softOpenedAttrUi: true, released: false });
  } finally {
    if (Progress && oldSlot !== undefined) Progress.setActiveSlot(oldSlot);
    await server.close();
  }
}

const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: name => storage.get(name) ?? null,
  setItem(name, value) { localStorageWrites++; storage.set(name, String(value)); },
  removeItem(name) { localStorageWrites++; storage.delete(name); },
} });
await fs.mkdir(out, { recursive: true });
try {
  await staticChecks();
  for (const [mode, dataRoot] of roots) {
    storage.clear(); const fixture = await runFormal(mode, dataRoot); await runClosed(mode, dataRoot, fixture);
  }
  eq(sentinelCalls, 0, '全部展示路径保存/服务哨兵零调用');
  passed = true;
} finally {
  try {
    for (const [file, expected] of Object.entries(protectedFiles)) eq(hash(await fs.readFile(file)), expected, `运行后冻结字节 MATCH: ${file}`);
    await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify({ passed, assertions, baselineTip: baseline,
      attrUiOpenPass: passed, formalApiWired: passed, eSlotToInstanceRefApiExists: passed, iRowToInstanceRefApiExists: passed,
      mappingStrategy: 'explicit_position_binding_only_no_item_id_inference',
      newOpenFlag: false, fixtureInstancesProductionFallback: false,
      equipKnownRefVerified: passed, enhanceLineShown: passed, unequipBindingCleared: passed,
      missingBindingAndAggregateRowNoInstance: passed, foreignPassthrough: passed, closedPriorityUnavailable: passed,
      bindingEnhanceEnchantRefreshExecuted: passed, readonlyZeroWrites: sentinelCalls === 0, displayWriteSentinelCalls: sentinelCalls,
      preparationLocalStorageWrites: localStorageWrites, preparationBackendWrites: backendWrites,
      enhanceSha, enhanceShaMatch: true, flagShas, formalFlagsDiskSourcePreserved: true, gatesBaselineMatch: true,
      GAME_PHASE: 5, gifts0: true, softOpenedAttrUi: true, released: false, protectedFiles, evidence }, null, 2) + '\n');
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
console.log(`v06p1 attr-ui binding success PASS: ${assertions} assertions; shared/snapshot formal Forge→known-ref equip→E verified→enhance line; unequip clear; aggregate no_instance; foreign passthrough; closed unavailable; binding/enhance/enchant refresh; display zero writes; enhance/four Flags/Gates MATCH; softOpenedAttrUi=true; released=false`);
