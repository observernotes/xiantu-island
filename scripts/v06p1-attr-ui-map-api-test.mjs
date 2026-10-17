// P1③+++++++ A/B：正式实例位置映射 API 与 E/I 展示 resolver 接线一致性。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), out = path.join(root, 'qa/out_v06p1_attr_ui_map_api');
const baseline = 'a3f0c197e1d3f31ef1faada5fa053b10e0ac9bfe';
const enhanceSha = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954';
const api = { file: 'src/EquipInstBinding.ts',
  e: 'resolveFormalEquipSlotBinding', i: 'resolveFormalInventoryEquipBinding',
  bag: 'listBagFormalEquipBindings', validator: 'isValidEquipInstanceRefs',
  write: 'Progress.equipItem(id, instanceRef?)', unequip: 'Progress.unequipSlot(slot)' };
const protectedFiles = {}, frozenData = {}, flagShas = {}, gates = {}, evidence = [];
let assertions = 0, passed = false, localStorageWrites = 0, backendWrites = 0, writeSentinelCalls = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const copy = value => structuredClone(value);
const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
const record = (mode, test, fields = {}) => evidence.push({ mode, test, passed: true, ...fields });
const state = prog => JSON.stringify(prog.exportSave());
async function filesIn(directory) {
  return (await Promise.all((await fs.readdir(directory, { withFileTypes: true })).map(row =>
    row.isDirectory() ? filesIn(path.join(directory, row.name)) : path.join(directory, row.name)))).flat();
}
async function guard(file, expected) {
  const hash = sha(await fs.readFile(file));
  if (expected !== undefined) eq(hash, expected, `冻结字节 MATCH: ${file}`);
  protectedFiles[file] = hash;
  return hash;
}
async function staticChecks() {
  eq(git('rev-parse', '--show-toplevel').toString().trim(), root, '测试只在指定 wt 执行');
  eq(root, '/workspace/xiantu/wt/feat/ui-attr-inst', '工作目录为授权 wt');
  eq(git('branch', '--show-current').toString().trim(), 'feat/ui-attr-inst', '授权分支不变');
  const prior = git('ls-tree', '-r', '--name-only', baseline, 'src').toString().trim().split('\n');
  eq((await filesIn(path.join(root, 'src'))).filter(file => /OpenFlag\.ts$/u.test(file))
    .map(file => path.relative(root, file)).sort(), prior.filter(file => /OpenFlag\.ts$/u.test(file)).sort(), '没有新建 OpenFlag');
  for (const name of ['Forge', 'Enhance', 'Enchant', 'Salvage']) {
    const flagFile = `src/${name}OpenFlag.ts`, gateFile = `src/${name}Gate.ts`;
    flagShas[name] = await guard(path.join(root, flagFile), sha(git('show', `${baseline}:${flagFile}`)));
    gates[name] = await guard(path.join(root, gateFile), sha(git('show', `${baseline}:${gateFile}`)));
    ok(/export function is\w+OpenForFixture\(\): boolean \{ return true; \}/u
      .test(await fs.readFile(path.join(root, flagFile), 'utf8')), `${name} 正式 Flag 恒 true`);
  }
  await guard(path.join(root, 'src/data.ts'), sha(git('show', `${baseline}:src/data.ts`)));
  ok(/GAME_PHASE\s*=\s*5\b/u.test(await fs.readFile(path.join(root, 'src/data.ts'), 'utf8')), 'GAME_PHASE=5');
  const frozenNames = ['enhance', 'materials', 'items', 'recipes', 'npcs', 'life_skills', 'enhance_protect_charm'];
  for (const [mode, dataRoot] of [['shared', shared], ['snapshot', path.join(root, 'data')], ['game', path.join(shared, 'game/data')]]) {
    frozenData[mode] = {};
    for (const name of frozenNames) {
      const expected = name === 'enhance' ? enhanceSha : sha(git('show', `${baseline}:data/balance/${name}.json`));
      frozenData[mode][name] = await guard(path.join(dataRoot, `balance/${name}.json`), expected);
    }
    const npcs = await json(path.join(dataRoot, 'balance/npcs.json')), rows = npcs.npcs ?? npcs;
    const gifts = rows.filter(row => row.affinity?.gifts);
    eq(gifts.length, 10, `${mode}: gifts 共十处`);
    ok(gifts.every(row => row.affinity.gifts.enabled === false), `${mode}: gifts 10×false`);
    record(mode, 'frozen-boundaries', { enhanceSha, giftsCount: 10, gifts0: true, GAME_PHASE: 5,
      fourFlagBytesMatch: true, fourGateBytesMatch: true });
  }
  for (const file of ['src/EquipPanel.ts', 'src/InventoryPanel.ts'])
    await guard(path.join(root, file), sha(git('show', `${baseline}:${file}`)));
  const apiText = await fs.readFile(path.join(root, api.file), 'utf8');
  const ast = ts.createSourceFile(api.file, apiText, ts.ScriptTarget.Latest, true);
  const forbidden = new Set(['submit', 'craft', 'save', 'saveAsync', 'persistSoon', 'runSaveTransaction',
    'runSaveTransactionAsync', 'registerFormalEnhanceInstance', 'equipItem', 'unequipSlot', 'addItem', 'removeItem']);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
      ok(!forbidden.has(node.expression.name.text), `生产只读 API 无写入或服务调用: ${node.expression.name.text}`);
    if (ts.isIdentifier(node)) ok(node.text !== 'fixtureInstances', '生产只读 API 无 fixtureInstances 注入或回退');
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

function readOnly(prog, action, label) {
  const before = state(prog), publicBefore = JSON.stringify(prog);
  const counters = [localStorageWrites, backendWrites, writeSentinelCalls];
  const result = action();
  eq(state(prog), before, `${label}: 整档零增量`);
  eq(JSON.stringify(prog), publicBefore, `${label}: 公开字段零增量`);
  eq([localStorageWrites, backendWrites, writeSentinelCalls], counters, `${label}: 保存/写入哨兵零调用`);
  return result;
}
function withWriteSentinels(prog, action) {
  const methods = ['save', 'saveAsync', 'persistSoon', 'runSaveTransaction', 'runSaveTransactionAsync',
    'registerFormalEnhanceInstance', 'equipItem', 'unequipSlot', 'addItem', 'removeItem', 'gainEquip'];
  const descriptors = methods.map(name => [name, Object.getOwnPropertyDescriptor(prog, name)]);
  for (const name of methods) Object.defineProperty(prog, name, { configurable: true, value() {
    writeSentinelCalls++; throw new Error(`只读映射调用了 ${name}`);
  } });
  try { return action(); }
  finally { for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(prog, name, descriptor); else Reflect.deleteProperty(prog, name);
  } }
}

async function runGraph(mode, dataRoot) {
  const phaserId = '\0v06p1-map-api-phaser';
  const server = await createServer({ root, configFile: false,
    resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-map-api-no-renderer', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return phaserId; },
      load(id) { if (id === phaserId) return `class Sprite {} export default { WEBGL: 2, Scene: class {},
        BlendModes: { NORMAL: 0 }, Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
        Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
        Input: { Keyboard: { JustDown: () => false } }, Math: { Clamp: (n,a,b) => Math.min(b,Math.max(a,n)) } };`; },
    }], ssr: { noExternal: ['phaser'] } });
  let features, oldFlags, Progress, oldSlot;
  try {
    ({ Progress } = await server.ssrLoadModule('/src/Progress.ts'));
    const binding = await server.ssrLoadModule(`/${api.file}`);
    const readonly = await server.ssrLoadModule('/src/EquipInstReadonly.ts');
    const { ForgeGate } = await server.ssrLoadModule('/src/ForgeGate.ts');
    const { createMemorySaveBackend, setSaveBackend, saveStore } = await server.ssrLoadModule('/src/SaveStore.ts');
    const { GAME_PHASE, ITEMS } = await server.ssrLoadModule('/src/data.ts');
    features = await server.ssrLoadModule('/src/features.ts'); oldFlags = features.featureFlags();
    oldSlot = Progress.getActiveSlot(); Progress.setActiveSlot(1);
    eq(GAME_PHASE, 5, `${mode}: SSR GAME_PHASE=5`);
    for (const name of ['Forge', 'Enhance', 'Enchant', 'Salvage']) {
      const module = await server.ssrLoadModule(`/src/${name}OpenFlag.ts`);
      eq(module[`is${name}OpenForFixture`](), true, `${mode}: ${name} 正式开态源码原样加载`);
    }
    for (const name of [api.e, api.i, api.bag, api.validator]) eq(typeof binding[name], 'function', `${mode}: ${name} 为可测试 API`);
    const E = (p, slot = 'weapon') => {
      const formal = binding[api.e](p, slot);
      eq(readonly.resolveEquipSlotBinding(p, slot), formal, `${mode}: E 展示 resolver 与正式 API 一致 (${formal.kind})`);
      return formal;
    };
    const I = (p, row) => {
      const formal = binding[api.i](p, row);
      eq(readonly.resolveInventoryEquipBinding(p, row), formal, `${mode}: I 展示 resolver 与正式 API 一致 (${formal.kind})`);
      return formal;
    };
    const bag = p => binding[api.bag](p);
    const refs = p => bag(p).map(row => row.instanceRef).sort();
    const clone = p => Progress.restore(copy(p.exportSave()), false);
    const backend = createMemorySaveBackend();
    setSaveBackend({ ...backend, async write(slot) { backendWrites++; await backend.write(slot); } });
    features.setFeatureFlag('indexedDbSaves', true);
    const recipeTable = await json(path.join(dataRoot, 'balance/recipes.json'));
    const recipe = recipeTable.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword');
    ok(recipe, `${mode}: 默认正式 forge 配方存在`);
    const p = new Progress(); p.level = 20;
    p.inventory = { [recipe.blueprint]: 5, ...Object.fromEntries(recipe.materials.map(row => [row.item, row.count * 5])) };
    const forge = new ForgeGate(p, { random: () => 0, ledgerId: () => `${mode}-map-formal-forge` });
    const craft = id => forge.submit({ craftRequestId: id, blueprintId: recipe.blueprint,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })) });
    const first = await craft('map-one');
    ok(first.allowed && first.result, `${mode}: 默认正式 ForgeGate 成品提交成功`);
    const firstRef = first.result.resultItem.instanceRef;
    eq(p.formalEnhanceInstanceStatus(firstRef), 'registered', `${mode}: 完整 Forge 结果已登记本档正式源`);
    eq(p.equip.weapon, undefined, `${mode}: 打造成品不自动穿戴`);
    eq(p.equipInstanceRefs?.weapon, undefined, `${mode}: 打造成品不猜槽位绑定`);
    eq(refs(p), [firstRef], `${mode}: 未穿戴正式实例按明确 ref 列袋`);
    eq(I(p, { id: 'bamboo_sword', instanceRef: firstRef }), { kind: 'verified', instanceRef: firstRef }, `${mode}: I 精确行 verified`);
    const singleSave = copy(p.exportSave());
    const second = await craft('map-two');
    ok(second.allowed && second.result, `${mode}: 正式打造第二件同 itemId 成品`);
    const secondRef = second.result.resultItem.instanceRef;
    ok(firstRef !== secondRef, `${mode}: 同 itemId 正式实例保留不同身份`);
    eq(p.formalEnhanceInstances().length, 2, `${mode}: 两件均为正式实例`);
    eq(refs(p), [firstRef, secondRef].sort(), `${mode}: 列袋保留两件具体身份`);
    const fullSave = copy(p.exportSave());
    record(mode, 'formal-forge-production-path', { firstRef, secondRef, itemId: 'bamboo_sword',
      defaultFormalRecipes: true, fixtureInstances: false, autoEquipped: false, savedFormalSource: true,
      persisted: (await saveStore.readSlot(1)).data.enhance.formalSources.length === 2 });

    // 既有手动穿戴为同步保存；只在独立测试会话切换保存后端，四个正式 Flag 不变。
    features.setFeatureFlag('indexedDbSaves', false);
    const empty = new Progress();
    eq(E(empty), { kind: 'empty' }, `${mode}: E 空槽 empty`);
    eq(I(empty, undefined), { kind: 'not_equip' }, `${mode}: I 空行 not_equip`);
    eq(I(empty, { id: 'spirit_copper' }), { kind: 'not_equip' }, `${mode}: 非装备 not_equip`);
    eq(I(p, { id: 'bamboo_sword' }), { kind: 'no_instance' }, `${mode}: I 聚合行即使两件正式候选也 no_instance`);
    eq(p.equipItem('bamboo_sword').ok, true, `${mode}: 旧 API 无 ref 仍可穿戴`);
    eq(E(p), { kind: 'no_instance' }, `${mode}: 旧穿戴 itemId 不推断实例`);
    eq(p.equipInstanceRefs?.weapon, undefined, `${mode}: 旧穿戴不写绑定`);
    eq(p.count('bamboo_sword'), 1, `${mode}: 旧穿戴后袋中同 id 数量为一`);
    eq(refs(p), [], `${mode}: 袋一件+无绑定已穿戴一件+两正式 ref 时整组拒绝，不猜哪件在袋`);
    eq(I(p, { id: 'bamboo_sword', instanceRef: firstRef }), { kind: 'no_instance' }, `${mode}: 数量位置歧义时显式第一 ref 也不冒充袋行`);
    eq(I(p, { id: 'bamboo_sword', instanceRef: secondRef }), { kind: 'no_instance' }, `${mode}: 数量位置歧义时显式第二 ref 也不冒充袋行`);
    record(mode, 'ambiguous-bag-position-whole-group-rejected', { formalSameItemIdInstances: 2,
      inventoryCount: 1, equippedItemId: 'bamboo_sword', explicitEquipBinding: false,
      bagRows: bag(p), neitherReferenceSelectedByCount: true });
    eq(p.unequipSlot('weapon').ok, true, `${mode}: 旧穿戴可卸装`);
    eq(p.equipItem('bamboo_sword', firstRef), { ok: true }, `${mode}: 已知合法 ref 穿戴成功`);
    eq(E(p), { kind: 'verified', instanceRef: firstRef }, `${mode}: E 已知穿戴 ref verified`);
    eq(p.equipInstanceRefs.weapon, firstRef, `${mode}: 绑定精确存入装备旁路字段`);
    eq(refs(p), [secondRef], `${mode}: 已穿戴 ref 不再列入袋`);
    eq(I(p, { id: 'bamboo_sword', type: 'equip', instanceRef: secondRef }),
      { kind: 'verified', instanceRef: secondRef }, `${mode}: I 同 id 第二件明确 ref verified`);
    eq(I(p, { id: 'bamboo_sword', instanceRef: firstRef }), { kind: 'no_instance' }, `${mode}: I 已穿戴 ref 不冒充袋行`);
    const worn = copy(p.exportSave());
    record(mode, 'equip-known-instance-verified', { instanceRef: firstRef, equipSlot: 'weapon',
      eBinding: E(p), persistedBinding: JSON.parse(storage.get('xiantu_save_v1')).equipInstanceRefs.weapon,
      bagInstanceRefs: refs(p), sameItemIdSecondRow: I(p, { id: 'bamboo_sword', instanceRef: secondRef }) });
    eq(p.equipItem('bamboo_sword', secondRef).ok, true, `${mode}: 换装另一件同 id 明确实例`);
    eq(E(p), { kind: 'verified', instanceRef: secondRef }, `${mode}: 换装只绑定新 ref`);
    eq(refs(p), [firstRef], `${mode}: 被换下 ref 回袋`);
    eq(p.unequipSlot('weapon'), { ok: true }, `${mode}: 正式实例卸装成功`);
    eq(E(p), { kind: 'empty' }, `${mode}: 卸装后 E 空槽 empty`);
    eq(p.equipInstanceRefs?.weapon, undefined, `${mode}: 卸装清绑定`);
    eq(refs(p), [firstRef, secondRef].sort(), `${mode}: 卸装后两件实例回袋`);
    eq(p.equipItem('bamboo_sword').ok, true, `${mode}: 卸装后旧调用可重新穿戴 itemId`);
    eq(E(p), { kind: 'no_instance' }, `${mode}: 卸装清绑定后 itemId 重新穿戴仍 no_instance`);
    record(mode, 'unequip-clears-binding', { removedInstanceRef: secondRef,
      bindingCleared: p.equipInstanceRefs?.weapon === undefined, emptyImmediatelyAfterUnequip: true,
      subsequentLegacyEquip: E(p), unequippedInstanceReturnedToBag: true });

    const single = Progress.restore(copy(singleSave), false);
    eq(single.count('bamboo_sword'), 1, `${mode}: count=1 旁证`);
    eq(single.equipItem('bamboo_sword').ok, true, `${mode}: 唯一正式候选旧调用穿戴`);
    eq(E(single), { kind: 'no_instance' }, `${mode}: 即使 count=1 且唯一正式候选仍禁止回填`);
    eq(I(single, { id: 'bamboo_sword' }), { kind: 'no_instance' }, `${mode}: 唯一正式候选 I 纯 id 仍 no_instance`);
    const oldSave = copy(worn); delete oldSave.equipInstanceRefs;
    const old = Progress.restore(oldSave, false);
    eq(old.equipInstanceRefs, undefined, `${mode}: 旧档缺旁路字段保持缺失`);
    eq(E(old), { kind: 'no_instance' }, `${mode}: 旧档已穿戴 itemId 无绑定 no_instance`);
    eq(old.save(), true, `${mode}: 旧档可继续保存`);
    const loadedOld = Progress.load();
    eq(E(loadedOld), { kind: 'no_instance' }, `${mode}: 旧档真实同步 load 不按唯一实例回填`);
    eq(loadedOld.equipInstanceRefs, undefined, `${mode}: load 仍保留无绑定`);
    record(mode, 'never-infer-from-item-id', { multipleSameItemId: 2, aggregateRow: I(p, { id: 'bamboo_sword' }),
      singleCandidateWithCountOne: E(single), legacySaveMissingBindings: E(loadedOld),
      inferredBinding: false, fixtureInstancesProductionFallback: false });

    const checked = Progress.restore(copy(worn), false);
    withWriteSentinels(checked, () => {
      for (let repeat = 0; repeat < 3; repeat++) {
        eq(readOnly(checked, () => E(checked), `${mode}: E 纯读`), { kind: 'verified', instanceRef: firstRef }, `${mode}: E 重复纯读结果`);
        eq(readOnly(checked, () => I(checked, { id: 'bamboo_sword', instanceRef: secondRef }), `${mode}: I 纯读`),
          { kind: 'verified', instanceRef: secondRef }, `${mode}: I 重复纯读结果`);
        eq(readOnly(checked, () => refs(checked), `${mode}: 列袋纯读`), [secondRef], `${mode}: 列袋重复结果`);
        eq(readOnly(checked, () => readonly.resolveEquipSlotBinding(checked, 'weapon'), `${mode}: B 的 E 接线纯读`),
          { kind: 'verified', instanceRef: firstRef }, `${mode}: B 的 E 透传正式 verified`);
        eq(readOnly(checked, () => readonly.resolveInventoryEquipBinding(checked,
          { id: 'bamboo_sword', instanceRef: secondRef }), `${mode}: B 的 I 接线纯读`),
          { kind: 'verified', instanceRef: secondRef }, `${mode}: B 的 I 透传正式 verified`);
      }
    });
    record(mode, 'readonly-and-B-formal-api-wiring', { fullSaveDelta: 0, publicFieldDelta: 0,
      storageWriteDelta: 0, serviceCalls: 0, displayResolversMatchFormalApi: true });

    Progress.setActiveSlot(2);
    const foreign = Progress.restore(copy(worn), false);
    eq(foreign.formalEnhanceInstanceStatus(firstRef), 'foreign', `${mode}: 跨档正式来源状态 foreign`);
    eq(E(foreign), { kind: 'foreign' }, `${mode}: E 跨档绑定 foreign`);
    eq(I(foreign, { id: 'bamboo_sword', instanceRef: secondRef }), { kind: 'foreign' }, `${mode}: I 跨档正式实例 foreign`);
    eq(refs(foreign), [], `${mode}: 外档实例不列袋`);
    eq(foreign.equipItem('bamboo_sword', secondRef).ok, false, `${mode}: 跨档 ref 不允许写入绑定`);
    Progress.setActiveSlot(1);
    const broken = Progress.restore(copy(worn), false); broken.forge.receipts = [];
    eq(E(broken), { kind: 'foreign' }, `${mode}: E 完整来源链断 foreign`);
    eq(I(broken, { id: 'bamboo_sword', instanceRef: secondRef }), { kind: 'foreign' }, `${mode}: I 链断 foreign`);
    const mismatch = Progress.restore(copy(worn), false); mismatch.equip.weapon = 'wood_sword';
    ok(E(mismatch).kind !== 'verified', `${mode}: 同槽 itemId 与 instance 不匹配不 verified`);
    ok(I(mismatch, { id: 'wood_sword', instanceRef: secondRef }).kind !== 'verified', `${mode}: I ref itemId mismatch 不 verified`);
    const badSlot = Progress.restore(copy(fullSave), false); badSlot.equip = { robe: 'bamboo_sword' }; badSlot.equipInstanceRefs = { robe: firstRef };
    ok(E(badSlot, 'robe').kind !== 'verified', `${mode}: 装备槽不匹配不 verified`);
    const occupied = Progress.restore(copy(fullSave), false); occupied.equipInstanceRefs = { robe: firstRef };
    const occupiedBefore = state(occupied);
    eq(occupied.equipItem('bamboo_sword', firstRef).ok, false, `${mode}: ref 已绑其他槽时拒绝穿戴`);
    eq(state(occupied), occupiedBefore, `${mode}: ref 已绑其他槽拒绝零写`);
    const missing = Progress.restore(copy(fullSave), false);
    eq(missing.equipItem('bamboo_sword', 'unknown:craft:source:item').ok, false, `${mode}: 缺正式源 ref 拒绝穿戴`);
    missing.inventory.wood_sword = 1;
    eq(missing.equipItem('wood_sword', firstRef), { ok: false, reason: 'invalid' }, `${mode}: 已持有物品与 ref 的 itemId 不匹配时拒绝穿戴`);
    record(mode, 'foreign-and-invalid-bindings-rejected', { crossSaveE: { kind: 'foreign' }, crossSaveI: { kind: 'foreign' },
      brokenSource: { kind: 'foreign' }, itemIdMismatchVerified: false, slotMismatchVerified: false,
      alreadyBoundOtherSlotRejected: true, ownerSlotIsSaveSlotOnly: true });

    const replaceLegacy = Progress.restore(copy(worn), false);
    replaceLegacy.inventory.wood_sword = 1;
    eq(replaceLegacy.equipItem('wood_sword').ok, true, `${mode}: 无 ref 换装旧物品成功`);
    eq(replaceLegacy.equipInstanceRefs?.weapon, undefined, `${mode}: 无 ref 换装清旧绑定`);
    eq(E(replaceLegacy), { kind: 'no_instance' }, `${mode}: 无 ref 换装 no_instance`);
    eq(refs(replaceLegacy), [firstRef, secondRef].sort(), `${mode}: 无 ref 换装旧正式实例回袋`);
    const gainLegacy = Progress.restore(copy(worn), false);
    const stronger = Object.entries(ITEMS).find(([, row]) => row.slot === 'weapon' && !row.sect && (row.reqLevel ?? 1) <= gainLegacy.level
      && Object.values(row.stats ?? {}).reduce((a, b) => a + b, 0) > Object.values(ITEMS.bamboo_sword.stats).reduce((a, b) => a + b, 0));
    ok(stronger, `${mode}: 旧 gainEquip 自动换装测试使用现有强装备`);
    eq(gainLegacy.gainEquip(stronger[0]), true, `${mode}: gainEquip 旧路径仍可自动换装`);
    eq(gainLegacy.equipInstanceRefs?.weapon, undefined, `${mode}: gainEquip 无明确 ref 不继承旧绑定`);
    eq(E(gainLegacy), { kind: 'no_instance' }, `${mode}: gainEquip 无 ref no_instance`);

    for (const failure of ['false', 'throw']) {
      const rollback = Progress.restore(copy(worn), false);
      const before = state(rollback), originalInventory = rollback.inventory, originalEquip = rollback.equip, originalRefs = rollback.equipInstanceRefs;
      rollback.save = () => { if (failure === 'throw') throw new Error('受控保存失败'); return false; };
      eq(rollback.equipItem('bamboo_sword', secondRef), { ok: false, reason: 'save' }, `${mode}: ${failure} 穿戴保存失败`);
      eq(state(rollback), before, `${mode}: ${failure} 穿戴整档回滚`);
      eq(rollback.inventory, originalInventory, `${mode}: ${failure} 库存内容回滚`);
      eq(rollback.equip, originalEquip, `${mode}: ${failure} 装备内容回滚`);
      eq(rollback.equipInstanceRefs, originalRefs, `${mode}: ${failure} 绑定内容回滚`);
      eq(rollback.unequipSlot('weapon'), { ok: false, reason: 'save' }, `${mode}: ${failure} 卸装保存失败`);
      eq(state(rollback), before, `${mode}: ${failure} 卸装整档回滚`);
      delete rollback.save;
      record(mode, `changeEquip-save-${failure}-rollback`, { equipInventoryAndBindingAtomic: true });
      const initiallyUnbound = Progress.restore(copy(fullSave), false), unboundBefore = state(initiallyUnbound);
      eq(initiallyUnbound.equipInstanceRefs, undefined, `${mode}: ${failure} 首次显式绑定前缺旁路字段`);
      initiallyUnbound.save = () => { if (failure === 'throw') throw new Error('受控首次绑定保存失败'); return false; };
      eq(initiallyUnbound.equipItem('bamboo_sword', firstRef), { ok: false, reason: 'save' }, `${mode}: ${failure} 首次绑定保存失败`);
      eq(initiallyUnbound.equipInstanceRefs, undefined, `${mode}: ${failure} 首次绑定失败后恢复字段 undefined`);
      eq(state(initiallyUnbound), unboundBefore, `${mode}: ${failure} 首次绑定失败整档回滚`);
      delete initiallyUnbound.save;
    }
    for (const failure of ['undefined', 'throw', 'save-false', 'save-throw']) {
      const transactional = Progress.restore(copy(worn), false), before = state(transactional);
      if (failure.startsWith('save-')) transactional.save = () => {
        if (failure === 'save-throw') throw new Error('受控事务保存异常'); return false;
      };
      eq(transactional.runSaveTransaction(() => {
        transactional.equipInstanceRefs = { weapon: secondRef }; transactional.equip = {}; transactional.inventory.bamboo_sword += 1;
        if (failure === 'undefined') return undefined;
        if (failure === 'throw') throw new Error('受控事务中断');
        return true;
      }), undefined, `${mode}: 通用同步事务 ${failure} 拒绝`);
      eq(state(transactional), before, `${mode}: 通用同步事务 ${failure} 含绑定原子回滚`);
      delete transactional.save;
    }
    record(mode, 'sync-transaction-binding-rollback', { cases: ['undefined', 'throw', 'save-false', 'save-throw'], passed: true });

    const valid = binding[api.validator];
    eq(valid({}), true, `${mode}: 空绑定表有效`);
    eq(valid({ weapon: firstRef }), true, `${mode}: 合法 slot/ref 有效`);
    const badFields = [null, [], 'weapon', { head: firstRef }, { weapon: '' }, { weapon: 1 }, { weapon: null }, { weapon: firstRef, robe: firstRef },
      { weapon: 'bad ref with spaces' }, { weapon: 'constructor' }, JSON.parse(`{"__proto__":"${firstRef}"}`),
      JSON.parse(`{"constructor":"${firstRef}"}`), JSON.parse(`{"prototype":"${firstRef}"}`)];
    const probe = Progress.restore(copy(worn), false);
    for (const [index, value] of badFields.entries()) {
      eq(valid(value), false, `${mode}: 坏绑定字段 ${index} 校验拒绝`);
      const before = state(probe), writesBefore = localStorageWrites;
      eq(probe.importSave({ ...copy(worn), equipInstanceRefs: value }), false, `${mode}: 坏字段 ${index} importSave 拒绝`);
      eq(state(probe), before, `${mode}: 坏字段 ${index} 导入不污染整档`);
      eq(localStorageWrites, writesBefore, `${mode}: 坏字段 ${index} 导入零写`);
      storage.set('xiantu_save_v1', JSON.stringify({ ...copy(worn), equipInstanceRefs: value }));
      const loaded = Progress.load();
      eq(loaded.equipInstanceRefs, undefined, `${mode}: 同步 load 坏字段 ${index} 忽略为无绑定`);
      ok(E(loaded).kind !== 'verified', `${mode}: 同步 load 坏字段 ${index} 不 verified 且不崩`);
    }
    const getterField = Object.defineProperty({}, 'weapon', { enumerable: true, get() { throw new Error('不应读取 getter'); } });
    eq(valid(getterField), false, `${mode}: accessor 字段拒绝且不求值`);
    eq(valid({ weapon: firstRef, [Symbol('slot')]: firstRef }), false, `${mode}: symbol 键拒绝`);
    eq(valid(Object.create({ weapon: firstRef })), false, `${mode}: 非普通原型拒绝`);
    const goodImport = new Progress();
    eq(goodImport.importSave(copy(worn)), true, `${mode}: 合法绑定存档可导入`);
    eq(E(goodImport), { kind: 'verified', instanceRef: firstRef }, `${mode}: 合法导入保留明确绑定`);
    eq(E(Progress.load()), { kind: 'verified', instanceRef: firstRef }, `${mode}: 真 save/load 保留明确绑定`);
    record(mode, 'save-validation-and-roundtrip', { badFieldCases: badFields.length + 3,
      invalidImportRejected: true, invalidSyncLoadIgnored: true, validBindingRoundtrip: E(goodImport) });

    // IDB draft 的 equip 更改、旁路绑定与整档只在后端确认后一起发布。
    features.setFeatureFlag('indexedDbSaves', true);
    const asyncP = new Progress();
    eq(await asyncP.importSave(copy(worn), { async: true }), true, `${mode}: 异步导入完整已穿戴正式档`);
    eq(E(asyncP), { kind: 'verified', instanceRef: firstRef }, `${mode}: 异步导入保留明确绑定`);
    eq(await asyncP.runSaveTransactionAsync(draft => draft.equipItem('bamboo_sword', secondRef).ok ? true : undefined),
      true, `${mode}: IDB draft 合法换装提交`);
    eq(E(asyncP), { kind: 'verified', instanceRef: secondRef }, `${mode}: IDB 事务后 E 精确新 ref`);
    const savedAsync = await Progress.load({ async: true, slot: 1 });
    eq(E(savedAsync), { kind: 'verified', instanceRef: secondRef }, `${mode}: 新 Progress 异步读回具体 ref`);
    const beforeAsync = state(asyncP);
    setSaveBackend({ ...backend, async write() { backendWrites++; throw new Error('受控 IDB 后端写失败'); } });
    eq(await asyncP.runSaveTransactionAsync(draft => draft.unequipSlot('weapon').ok ? true : undefined), undefined,
      `${mode}: IDB 事务写失败拒绝卸装`);
    eq(state(asyncP), beforeAsync, `${mode}: IDB 写失败 equip/inventory/绑定整档不发布`);
    record(mode, 'async-transaction-binding-atomicity', { persistedKnownReference: secondRef, roundtripVerified: true,
      backendFailureLeavesEquipInventoryBindingUnchanged: true });
    setSaveBackend(backend);
    const callsBefore = [localStorageWrites, backendWrites, writeSentinelCalls];
    withWriteSentinels(asyncP, () => readOnly(asyncP, () => [E(asyncP), bag(asyncP), I(asyncP, { id: 'bamboo_sword', instanceRef: firstRef })], `${mode}: IDB 图纯读`));
    eq([localStorageWrites, backendWrites, writeSentinelCalls], callsBefore, `${mode}: IDB 纯读零写`);
    record(mode, 'ssr-graph-complete', { formalFlagsUntouched: true, GAME_PHASE: 5, softOpenedAttrUi: false, released: false });
  } finally {
    if (features && oldFlags) for (const [name, value] of Object.entries(oldFlags)) features.setFeatureFlag(name, value);
    if (Progress && oldSlot) Progress.setActiveSlot(oldSlot);
    await server.close();
  }
}

const storage = new Map();
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => { localStorageWrites++; storage.set(key, String(value)); },
  removeItem: key => { localStorageWrites++; storage.delete(key); },
} });
await fs.mkdir(out, { recursive: true });
try {
  await staticChecks();
  for (const [mode, dataRoot] of [['shared', shared], ['snapshot', path.join(root, 'data')]]) {
    storage.clear(); await runGraph(mode, dataRoot);
  }
  eq(writeSentinelCalls, 0, '全部只读 API 均未触发写/服务哨兵');
  passed = true;
} finally {
  try {
    for (const [file, expected] of Object.entries(protectedFiles)) eq(sha(await fs.readFile(file)), expected, `运行后保护字节 MATCH: ${file}`);
    const result = { passed, assertions, baselineTip: baseline, eSlotToInstanceRefApiExists: passed,
      iRowToInstanceRefApiExists: passed, api, apiFiles: [api.file, 'src/Progress.ts'],
      mappingStrategy: 'explicit_position_binding_only_no_item_id_inference',
      equipKnownRefVerified: passed, unequipBindingCleared: passed, unequipNoInstanceAfterLegacyEquip: passed,
      multipleSameItemIdNotImpersonated: passed, countOneNotImpersonated: passed, oldSaveNoBackfill: passed,
      noItemIdImpersonation: true, fixtureInstancesProductionFallback: false,
      formalForgeDefaultPathExecuted: passed, readonlyZeroWrites: writeSentinelCalls === 0,
      displayResolversMatchFormalApi: passed, bindingRollbackExecuted: passed,
      enhanceSha, enhanceShaMatch: true, flagShas, formalFlagsDiskSourcePreserved: true,
      ForgeOpenFlag: true, EnhanceOpenFlag: true, EnchantOpenFlag: true, SalvageOpenFlag: true,
      gatesBaselineMatch: true, gateShas: gates, frozenData, gifts0: true, giftsCount: 10, GAME_PHASE: 5,
      newOpenFlag: false, softOpenedAttrUi: false, released: false,
      testSummary: `node scripts/v06p1-attr-ui-map-api-test.mjs: ${assertions} assertions, shared/snapshot SSR`,
      protectedFiles, evidence };
    await fs.writeFile(path.join(out, 'evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
console.log(`v06p1 attr-ui map API PASS: ${assertions} assertions; shared/snapshot SSR; default Forge→formal source→known-ref equip verified; unequip clear; no itemId/count inference; legacy/foreign/rollback/validation; enhance/four Flags/Gates/gifts0/PHASE=5 MATCH; E/I display resolvers match formal API; softOpenedAttrUi=false; released=false`);
