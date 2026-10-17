// A 映射改动的既有结算回归；正式磁盘四 Flag / 配方 / 数值表不注入、不修改。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';
import { attrUiSoftOpenOutput } from './v06p1-attr-ui-soft-open-output.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const roots = [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]];
const out = attrUiSoftOpenOutput(root, 'map-services');
const enhanceSha = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954';
let assertions = 0, passed = false;
const evidence = [], captured = new Map();
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (actual, message) => { assertions++; assert.ok(actual, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
const copy = value => structuredClone(value);

async function runGraph(mode, dataRoot) {
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'attr-map-services-phaser-only', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0attr-map-services-phaser'; },
      load(id) {
        if (id !== '\0attr-map-services-phaser') return;
        return `class Sprite {} export default { Scene: class {}, Physics: { Arcade: { Sprite } },
          GameObjects: { Sprite, NineSlice: class {} }, Math: { Clamp: (n, a, b) => Math.min(b, Math.max(a, n)) } };`;
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  const progresses = [];
  let Progress, oldSlot, setSaveBackend, createMemorySaveBackend;
  let writes = 0, failNext = false;
  try {
    ({ Progress } = await server.ssrLoadModule('/src/Progress.ts'));
    ({ setSaveBackend, createMemorySaveBackend } = await server.ssrLoadModule('/src/SaveStore.ts'));
    const { ForgeGate } = await server.ssrLoadModule('/src/ForgeGate.ts');
    const { EnhanceGate } = await server.ssrLoadModule('/src/EnhanceGate.ts');
    const { EnchantGate } = await server.ssrLoadModule('/src/EnchantGate.ts');
    const { SalvageGate, createSalvageFixtureCarrier } = await server.ssrLoadModule('/src/SalvageGate.ts');
    const { resolveFormalEquipSlotBinding: eBinding, resolveFormalInventoryEquipBinding: iBinding,
      listBagFormalEquipBindings: bagBindings } = await server.ssrLoadModule('/src/EquipInstBinding.ts');
    const { GAME_PHASE, ITEMS } = await server.ssrLoadModule('/src/data.ts');
    eq(GAME_PHASE, 5, mode + ': GAME_PHASE=5');
    for (const name of ['Forge', 'Enhance', 'Enchant', 'Salvage']) {
      const module = await server.ssrLoadModule('/src/' + name + 'OpenFlag.ts');
      eq(module['is' + name + 'OpenForFixture'](), true, mode + ': 磁盘正式 ' + name + ' Flag=true');
    }
    const base = createMemorySaveBackend();
    const backend = { ...base, async write(slot) {
      if (failNext) { failNext = false; throw new Error('受控写失败'); }
      await base.write(slot); writes++;
    } };
    // 仅测试分解所需的既有显式原子载体；不授权实例身份或映射。
    const carrier = createSalvageFixtureCarrier(backend);
    setSaveBackend(carrier.backend); oldSlot = Progress.getActiveSlot(); Progress.setActiveSlot(1);
    const table = await json(path.join(dataRoot, 'balance/enhance.json'));
    const charm = await json(path.join(dataRoot, 'balance/enhance_protect_charm.json'));
    const recipe = (await json(path.join(dataRoot, 'balance/recipes.json'))).recipes
      .find(row => row.type === 'forge' && row.output === 'bamboo_sword');
    ok(recipe, mode + ': 使用真实正式竹剑配方');
    const p = new Progress(); progresses.push(p);
    p.stones = 100000; p.rootElement = '金'; p.equip = {}; p.level = ITEMS.bamboo_sword.reqLevel ?? 1;
    p.inventory = { refine_stone: 100, protect_charm: 10, beast_core: 10, rabbit_fur: 10 };
    p.inventory[recipe.blueprint] = 10;
    for (const material of recipe.materials)
      p.inventory[material.item] = Math.max(p.count(material.item), material.count * 10);
    const forgeRequest = id => ({ craftRequestId: id, blueprintId: recipe.blueprint,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })) });
    const forge = new ForgeGate(p, { random: () => 0, ledgerId: () => mode + '-map-forge' });
    const forgeBefore = copy(p.inventory);
    const forged = await forge.submit(forgeRequest('map-main'));
    ok(forged.allowed && forged.result, mode + ': 默认 ForgeGate 正式路径成功');
    const ref = forged.result.resultItem.instanceRef;
    eq(forged.result.state, 'committed', mode + ': Forge 完整结果已提交');
    eq(p.formalEnhanceInstanceStatus(ref), 'registered', mode + ': Forge 正式登记 instanceRef');
    for (const material of recipe.materials)
      eq(p.count(material.item), forgeBefore[material.item] - material.count, mode + ': Forge 正式材料只扣一次');
    eq(p.count(recipe.blueprint), forgeBefore[recipe.blueprint] - (recipe.blueprintCount ?? 1), mode + ': Forge 图纸消耗');
    eq(iBinding(p, { id: 'bamboo_sword', instanceRef: ref }), { kind: 'verified', instanceRef: ref }, mode + ': 成品在袋可核实');
    eq(eBinding(p, 'weapon'), { kind: 'empty' }, mode + ': 打造不自动穿戴');
    const equipResult = await p.runSaveTransactionAsync(draft => draft.equipItem('bamboo_sword', ref));
    eq(equipResult, { ok: true }, mode + ': 已知正式 ref 合法穿戴');
    eq(eBinding(p, 'weapon'), { kind: 'verified', instanceRef: ref }, mode + ': 穿戴映射 verified');
    const enhanceRequest = (id, level, protect = false) => ({ enhanceRequestId: id, instanceRef: ref,
      fromLevel: level, to: level + 1, useProtectCharm: protect });
    async function enhance(input, random, success, finalLevel) {
      const before = [p.stones, p.count('refine_stone'), p.count(charm.itemId), p.count('bamboo_sword')];
      const row = table.levels.find(value => value.to === input.to);
      const result = await new EnhanceGate(p, { random: () => random }).submit(input);
      ok(result.allowed && result.result, mode + ': 正式强化完整提交 ' + input.enhanceRequestId);
      eq([result.result.success, result.result.finalLevel], [success, finalLevel], mode + ': 强化概率/掉级规则');
      eq([p.stones, p.count('refine_stone'), p.count(charm.itemId), p.count('bamboo_sword')],
        [before[0] - row.stones, before[1] - row.refineStones,
          before[2] - (input.useProtectCharm ? charm.countPerSettlement : 0), before[3]], mode + ': 灵石/精炼石/护符原子收费');
      eq(eBinding(p, 'weapon'), { kind: 'verified', instanceRef: ref }, mode + ': 强化保留穿戴映射');
      return result;
    }
    for (let level = 0; level < 5; level++) await enhance(enhanceRequest('plain-' + level, level), 0, true, level + 1);
    const protectedFailure = enhanceRequest('protected-failure', 5, true);
    await enhance(protectedFailure, 0.999, false, 5);
    await enhance(enhanceRequest('protected-success', 5, true), 0, true, 6);
    await enhance(enhanceRequest('unprotected-failure', 6), 0.999, false, 5);
    const beforeReplay = copy(p.exportSave()), beforeWrites = writes;
    const replay = await new EnhanceGate(p, { random() { throw new Error('重放不得重抽'); } }).submit(protectedFailure);
    eq(replay.replayed, true, mode + ': 护符结果重放');
    eq(p.exportSave(), beforeReplay, mode + ': 护符重放不重复收费/改映射');
    eq(writes, beforeWrites, mode + ': 护符重放零写');
    const enchantRequest = { enchantRequestId: 'map-enchant', instanceRef: ref, fromElement: null, element: '金' };
    const enchantBefore = [p.stones, p.count('beast_core')];
    const enchanted = await new EnchantGate(p, { ledgerId: () => mode + '-map-enchant' }).submit(enchantRequest);
    ok(enchanted.allowed && enchanted.result, mode + ': 默认正式实例附灵完整提交');
    eq([p.stones, p.count('beast_core')], [enchantBefore[0] - table.enchant.cost.stones,
      enchantBefore[1] - table.enchant.cost.materials[0].count], mode + ': 附灵正式收费');
    eq(eBinding(p, 'weapon'), { kind: 'verified', instanceRef: ref }, mode + ': 附灵保留穿戴映射');
    const saved = copy(p.exportSave());
    eq(await p.importSave(saved, { async: true }), true, mode + ': 新位置字段与完整服务结果可导入');
    const loaded = await Progress.load({ async: true, slot: 1 }); progresses.push(loaded);
    eq(eBinding(loaded, 'weapon'), { kind: 'verified', instanceRef: ref }, mode + ': 真实读档保留位置证明');
    eq([loaded.forge, loaded.enhance, loaded.enchant], [p.forge, p.enhance, p.enchant], mode + ': 真实读档保留三服务完整事实');
    const rollbackBefore = copy(p.exportSave()); failNext = true;
    eq(await p.runSaveTransactionAsync(draft => draft.unequipSlot('weapon')), undefined, mode + ': 失败保存不发布卸装');
    eq(p.exportSave(), rollbackBefore, mode + ': equip/inventory/instanceRefs 原子回滚');
    eq(await p.runSaveTransactionAsync(draft => draft.unequipSlot('weapon')), { ok: true }, mode + ': 正常卸装提交');
    eq(eBinding(p, 'weapon'), { kind: 'empty' }, mode + ': 卸装清位置绑定');
    ok(!p.equipInstanceRefs?.weapon, mode + ': 无残余 weapon ref');
    eq(iBinding(p, { id: 'bamboo_sword', instanceRef: ref }), { kind: 'verified', instanceRef: ref }, mode + ': 卸装原实例回袋');
    // 附灵历史现有规则不能退役；独立第二个正式实例覆盖分解，不修改结算语义。
    const second = await forge.submit(forgeRequest('map-salvage'));
    ok(second.allowed && second.result, mode + ': 第二个同 itemId 正式打造成功');
    const salvageRef = second.result.resultItem.instanceRef;
    eq(iBinding(p, { id: 'bamboo_sword' }), { kind: 'no_instance' }, mode + ': 多件聚合行不冒认实例');
    eq(iBinding(p, { id: 'bamboo_sword', instanceRef: salvageRef }), { kind: 'verified', instanceRef: salvageRef }, mode + ': 分解前显式行 verified');
    const salvageInput = { salvageRequestId: 'map-salvage', instanceRef: salvageRef,
      fromGrade: second.result.resultGrade, fromEnhanceLevel: 0 };
    const salvage = new SalvageGate(p, {
      qualification: (_draft, instanceRef) => ({ instanceRef, ownerSlot: 1, bound: false, natal: false,
        bloodBound: false, unsalvageable: false, location: { kind: 'inventory' } }),
      atomicCarrier: carrier, ledgerId: () => mode + '-map-salvage',
    });
    const salvageBefore = [p.count('bamboo_sword'), p.count('refine_stone'), p.stones];
    const salvaged = await salvage.submit(salvageInput);
    ok(salvaged.allowed && salvaged.result, mode + ': 正式来源加既有显式分解资格完整销毁');
    eq([p.count('bamboo_sword'), p.count('refine_stone'), p.stones], [salvageBefore[0] - 1,
      salvageBefore[1] + table.salvage.refineStonesByGrade[second.result.resultGrade], salvageBefore[2]], mode + ': 分解原消耗/产物规则');
    eq(p.formalEnhanceInstanceStatus(salvageRef), 'missing', mode + ': 分解移除正式活跃来源');
    eq(iBinding(p, { id: 'bamboo_sword', instanceRef: salvageRef }), { kind: 'no_instance' }, mode + ': 销毁原 ref 不再 verified');
    ok(!bagBindings(p).some(row => row.instanceRef === salvageRef), mode + ': 袋实例列表排除已销毁 ref');
    eq(iBinding(p, { id: 'bamboo_sword', instanceRef: ref }), { kind: 'verified', instanceRef: ref }, mode + ': 未选原实例和附灵事实保留');
    const destroyedState = copy(p.exportSave()), destroyedWrites = writes;
    const salvageReplay = await new SalvageGate(p).submit(salvageInput);
    eq([salvageReplay.allowed, salvageReplay.replayed], [true, true], mode + ': 分解重放仅读历史结果');
    eq(p.exportSave(), destroyedState, mode + ': 分解重放不复活实例不补发产物');
    eq(writes, destroyedWrites, mode + ': 分解重放零写');
    evidence.push({ dataMode: mode, dataRoot, passed: true, formalFlags: { Forge: true, Enhance: true, Enchant: true, Salvage: true },
      productModuleTransformations: [], storage: 'createMemorySaveBackend + explicit SalvageFixtureCarrier', writes,
      forgeFormalRecipe: recipe.id, forgeInstanceRef: ref, formalEquipVerified: true, enhanceSuccess: true,
      protectedFailureKeptLevel: true, protectedSuccessConsumedCharm: true, unprotectedFailureDroppedLevel: true,
      enhanceReplayZeroWrites: true, enchantFormalSubmit: true, saveRoundtripPreservedBinding: true,
      failedEquipSaveRolledBack: true, unequipClearedBinding: true, salvageExplicitQualificationOnly: true,
      salvageInstanceRef: salvageRef, destroyedInstanceMapping: 'no_instance', destroyedInstanceExcludedFromBag: true,
      salvageReplayZeroWrites: true, softOpenedAttrUi: true, released: false });
  } finally {
    for (const p of progresses) await p.flushSaves();
    if (Progress && oldSlot !== undefined) Progress.setActiveSlot(oldSlot);
    if (setSaveBackend) setSaveBackend(createMemorySaveBackend());
    await server.close();
  }
}

await fs.mkdir(out, { recursive: true });
try {
  for (const file of ['src/ForgeGate.ts', 'src/EnhanceGate.ts', 'src/EnchantGate.ts', 'src/SalvageGate.ts',
    'src/ForgeOpenFlag.ts', 'src/EnhanceOpenFlag.ts', 'src/EnchantOpenFlag.ts', 'src/SalvageOpenFlag.ts', 'src/data.ts'])
    captured.set(path.join(root, file), hash(await fs.readFile(path.join(root, file))));
  for (const [, dataRoot] of roots) for (const file of ['enhance.json', 'enhance_protect_charm.json', 'materials.json',
    'items.json', 'recipes.json', 'npcs.json', 'life_skills.json']) {
    const name = path.join(dataRoot, 'balance', file), sha = hash(await fs.readFile(name));
    captured.set(name, sha);
    if (file === 'enhance.json') eq(sha, enhanceSha, 'enhance 指定 SHA MATCH: ' + dataRoot);
  }
  for (const [mode, dataRoot] of roots) await runGraph(mode, dataRoot);
  passed = true;
} finally {
  for (const [file, sha] of captured) eq(hash(await fs.readFile(file)), sha, '运行前后源码/配置字节 MATCH: ' + file);
  await fs.writeFile(path.join(out, 'services-evidence.json'), JSON.stringify({ passed, assertions, roots: Object.fromEntries(roots),
    enhanceSha, softOpenedAttrUi: true, released: false, newOpenFlag: false,
    fixtureInstancesProductionFallback: false, productionFixtureInstanceInjection: false,
    priorOpenScriptsStringGuard: '旧套件的 960 字符串冻结早于本刀基线；本烟测直接运行真实 Gate，不替换旧 guard 或数据',
    protectedFiles: Object.fromEntries(captured), evidence }, null, 2) + '\n');
}
console.log(`v06p1 attr-ui map services tests ok: ${assertions} assertions; shared/snapshot; Forge/Enhance/protect-charm/Enchant/Salvage passed`);
