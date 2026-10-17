// 属性展示 C01–C10：soft-open 后的只读语义夹具回归；不运行服务提交、O 表或 release。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';
import { attrUiSoftOpenOutput } from './v06p1-attr-ui-soft-open-output.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), out = attrUiSoftOpenOutput(root, 'closed');
const baseline = 'b9108d6dcab0fdb8857dac0efd85087176a92f92';
const strings970 = 'ae51319b82a6486cc7f3d9b26c5ae89719e23c32ff9debdcfbb86ef7b5aea08b';
const strings960 = '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda';
const enhanceSha = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954';
const flagShas = {
  Forge: '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  Enhance: 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  Enchant: 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  Salvage: '69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3',
};
const instKeys = ['enhance_level', 'enchant_element', 'element_damage', 'same_root_bonus', 'no_enhance',
  'no_enchant', 'no_instance', 'foreign', 'unknown', 'unavailable'].map(key => `ui.equip.inst.${key}`);
const key = name => `ui.equip.inst.${name}`;
const protectedFiles = {}, evidence = [], cases = Object.fromEntries(Array.from({ length: 10 }, (_, i) =>
  [`C${String(i + 1).padStart(2, '0')}`, { executed: false, passed: false, evidenceKeys: [] }]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let assertions = 0, passed = false, localStorageWrites = 0, indexedDbOpens = 0, sentinelCalls = 0, serviceCalls = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (actual, message) => { assertions++; assert.ok(actual, message); };
function record(id, label, fields = {}) {
  cases[id].executed = true; cases[id].passed = true; cases[id].evidenceKeys.push(label);
  evidence.push({ case: id, label, passed: true, ...fields });
}
async function guard(file, expected) {
  const actual = hash(await fs.readFile(file));
  if (expected) eq(actual, expected, `冻结 SHA MATCH: ${file}`);
  protectedFiles[file] = actual;
}
async function filesIn(dir) {
  const rows = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(rows.map(row => row.isDirectory() ? filesIn(path.join(dir, row.name)) : path.join(dir, row.name)))).flat();
}
async function staticChecks() {
  const baselineFiles = git('ls-tree', '-r', '--name-only', baseline, 'src').toString().trim().split('\n');
  eq((await filesIn(path.join(root, 'src'))).filter(file => /OpenFlag\.ts$/u.test(file))
    .map(file => path.relative(root, file)).sort(), baselineFiles.filter(file => /OpenFlag\.ts$/u.test(file)).sort(), '无新 OpenFlag 文件');
  for (const [name, expected] of Object.entries(flagShas)) {
    const file = path.join(root, `src/${name}OpenFlag.ts`);
    await guard(file, expected);
    ok(/export function is\w+OpenForFixture\(\): boolean \{ return true; \}/u.test(await fs.readFile(file, 'utf8')), `${name} 磁盘正式 Flag 恒 true`);
    await guard(path.join(root, `src/${name}Gate.ts`), hash(git('show', `${baseline}:src/${name}Gate.ts`)));
  }
  const frozen = ['materials.json', 'items.json', 'recipes.json', 'npcs.json', 'life_skills.json', 'enhance_protect_charm.json'];
  for (const name of frozen) await guard(path.join(root, 'data/balance', name), hash(git('show', `${baseline}:data/balance/${name}`)));
  await guard(path.join(root, 'src/data.ts'), hash(git('show', `${baseline}:src/data.ts`)));
  ok(/GAME_PHASE\s*=\s*5\b/u.test(await fs.readFile(path.join(root, 'src/data.ts'), 'utf8')), 'GAME_PHASE 保持 5');
  for (const [mode, dataRoot] of [['shared', shared], ['snapshot', path.join(root, 'data')]]) {
    await guard(path.join(dataRoot, 'balance/enhance.json'), enhanceSha);
    const stringsFile = path.join(dataRoot, 'balance/strings_zh.json');
    await guard(stringsFile, strings970);
    const text = await fs.readFile(stringsFile, 'utf8'), strings = JSON.parse(text);
    eq(Object.keys(strings).length, 970, `${mode} strings970 含 _meta`);
    eq(Object.keys(strings).filter(name => name.startsWith('ui.equip.inst.')), instKeys, `${mode} 恰有十个共用实例键`);
    eq(Object.keys(strings).filter(name => name.startsWith('ui.inv.inst.')), [], `${mode} I 复用 E 文案`);
    const suffix = ',\n' + instKeys.map((name, i) => `  ${JSON.stringify(name)}: ${JSON.stringify(strings[name])}${i === instKeys.length - 1 ? '' : ','}`).join('\n') + '\n}\n';
    ok(text.endsWith(suffix), `${mode} 970 仅末尾追加精确十键`);
    eq(hash(text.slice(0, -suffix.length) + '\n}\n'), strings960, `${mode} 剥十键完整还原历史 strings960 字节`);
    for (const name of instKeys) ok(typeof strings[name] === 'string' && Array.from(strings[name]).length <= 40, `${mode} ${name} 文案有效`);
    const npcs = await json(path.join(dataRoot, 'balance/npcs.json')), rows = npcs.npcs ?? npcs;
    const gifts = rows.filter(row => row.affinity?.gifts);
    eq(gifts.length, 10, `${mode} gifts 仍十条`);
    ok(gifts.every(row => row.affinity.gifts.enabled === false), `${mode} gifts 10×false`);
    ok(!Object.hasOwn(rows.find(row => row.id === 'smith_ou'), 'services'), `${mode} 无 smith_ou.services 完整服务 UI`);
  }
  const map = await json(path.join(shared, 'qa/out_v06p1_attr_ui_map_api/evidence.json'));
  eq([map.eSlotToInstanceRefApiExists, map.iRowToInstanceRefApiExists,
    map.fixtureInstancesProductionFallback], [true, true, false], '炼器正式映射 API 已交付且无 fixture 回退');
  const moduleFile = path.join(root, 'src/EquipInstReadonly.ts'), moduleText = await fs.readFile(moduleFile, 'utf8');
  const ast = ts.createSourceFile(moduleFile, moduleText, ts.ScriptTarget.Latest, true);
  const forbidden = new Set(['submit', 'craft', 'enhance', 'enchant', 'salvage', 'save', 'saveAsync', 'persistSoon',
    'runSaveTransaction', 'runSaveTransactionAsync', 'registerFormalEnhanceInstance', 'equipItem', 'unequipSlot']);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))
      ok(!forbidden.has(node.expression.name.text), `只读模块不调写接口/收费预览: ${node.expression.name.text}`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of ['EquipPanel', 'InventoryPanel', 'EquipInstReadonly']) {
    const source = await fs.readFile(path.join(root, `src/${name}.ts`), 'utf8');
    ok(!/fixtureInstances/u.test(source), `${name} 无 fixtureInstances 生产回退`);
  }
  record('C09', 'static-source-and-data', { noNewOpenFlag: true, gatesBaselineMatch: true, fourFormalFlags: true,
    noSubmitOrPaidPreview: true, strings970OnlyTenKeyAppend: true });
}

// 仅替代 Phaser 渲染器；真实 ItemPanelView/EquipPanel/InventoryPanel 仍经 SSR 执行。
function mockScene() {
  const containers = [];
  const node = value => {
    const object = { value, children: [], destroyed: false, handlers: {},
      add(child) { this.children.push(child); return this; }, destroy() { this.destroyed = true; },
      on(event, callback) { this.handlers[event] = callback; return this; } };
    const proxy = new Proxy(object, { get(target, name) { return name in target ? target[name] : () => proxy; } });
    return proxy;
  };
  return { containers, texts: () => containers.at(-1)?.children.filter(child => typeof child.value === 'string').map(child => child.value) ?? [],
    input: { keyboard: { on() {}, off() {} } }, events: { once() {} }, time: { now: 1000 },
    scale: { width: 800, height: 600 }, textures: { exists: () => false }, cache: { json: { get: () => undefined } },
    add: { container() { const object = node(); containers.push(object); return object; },
      text(_x, _y, value) { return node(value); }, graphics() { return node(); }, zone() { return node(); }, image() { return node(); } } };
}
function state(prog) { return JSON.stringify(prog.exportSave()); }
function readOnly(prog, action, message) {
  const before = state(prog), publicBefore = JSON.stringify(prog), counters = [localStorageWrites, indexedDbOpens, sentinelCalls, serviceCalls];
  const result = action();
  eq(state(prog), before, `${message}: 完整存档零增量`);
  eq(JSON.stringify(prog), publicBefore, `${message}: 全部公开 progress 字段零增量`);
  eq([localStorageWrites, indexedDbOpens, sentinelCalls, serviceCalls], counters, `${message}: 所有写/服务哨兵零调用`);
  return result;
}
function sentinels(prog) {
  for (const method of ['save', 'saveAsync', 'persistSoon', 'runSaveTransaction', 'runSaveTransactionAsync',
    'registerFormalEnhanceInstance', 'equipItem', 'unequipSlot', 'addItem', 'removeItem', 'gainEquip'])
    Object.defineProperty(prog, method, { configurable: true, value() { sentinelCalls++; throw new Error(`只读路径调用 ${method}`); } });
  return prog;
}
function fixture(Progress, table, options = {}) {
  const p = new Progress(); p.level = 20; p.rootElement = '火';
  p.inventory = { wood_sword: options.count ?? 1 }; p.equip = { weapon: 'wood_sword' };
  const itemId = options.itemId ?? 'wood_sword', type = itemId === 'wood_sword' ? 'weapon' : 'armor';
  const forgeLedgerId = 'attr_forge', craftResultRef = `${forgeLedgerId}:craft:seed`, instanceRef = `${craftResultRef}:item`;
  p.forge = { version: 1, ledgerId: forgeLedgerId, crafts: [{ state: 'committed', craftRequestId: 'seed', craftResultRef,
    blueprintId: 'blueprint_wood_sword', blueprintCount: 1, materials: [{ itemId: 'iron_ore', count: 1 }],
    resultItem: { itemId, count: 1, instanceRef }, resultGrade: 'common' }], receipts: [craftResultRef] };
  p.enhance = { version: 1, ledgerId: 'attr_enhance', instances: [{ instanceRef, itemId, type, enhanceLevel: 0 }],
    enhancements: [], receipts: [], formalSources: [{ instanceRef, source: 'forge', forgeLedgerId, craftResultRef,
      ownerSlot: Progress.getActiveSlot() }] };
  if (options.levelOne) {
    const row = table.levels.find(row => row.to === 1), resultRef = 'attr_enhance:enhance:step';
    p.enhance.instances[0].enhanceLevel = 1;
    p.enhance.enhancements.push({ state: 'committed', enhanceRequestId: 'step', enhanceResultRef: resultRef,
      instanceRef, itemId, type, fromLevel: 0, ...structuredClone(row), useProtectCharm: false, success: true, finalLevel: 1,
      attributes: { atkRatioOfBase: table.statPerLevel.weapon.atkRatioOfBase, defRatioOfBase: 0, hpRatioOfBase: 0, allRatio: 0 } });
    p.enhance.receipts.push(resultRef);
  }
  if (options.enchanted) {
    const attributes = { elementDamage: table.enchant.elementDamage, sameRootBonus: options.otherRoot ? 0 : table.enchant.sameRootBonus };
    if (options.otherRoot) p.rootElement = '水';
    const element = '火', resultRef = 'attr_enchant:enchant:seed';
    p.enchant = { version: 1, ledgerId: 'attr_enchant', ownerSlot: Progress.getActiveSlot(),
      instances: [{ instanceRef, itemId, type: 'weapon', element, attributes: structuredClone(attributes) }],
      enchantments: [{ state: 'committed', enchantRequestId: 'seed', enchantResultRef: resultRef, instanceRef, itemId,
        type: 'weapon', fromElement: null, element, rootElement: p.rootElement, stones: table.enchant.cost.stones,
        materials: table.enchant.cost.materials.map(({ item, count }) => ({ itemId: item, count })), attributes: structuredClone(attributes), success: true }], receipts: [resultRef] };
  }
  return { p: sentinels(p), binding: { kind: 'verified', instanceRef }, instanceRef };
}
const lineKeys = display => display.lines.map(line => line.key);
function only(display, name, message) { eq(lineKeys(display), [key(name)], message); }
function noLeak(display, message) {
  ok(!lineKeys(display).some(name => ['enhance_level', 'enchant_element', 'element_damage', 'same_root_bonus', 'no_enhance', 'no_enchant'].some(suffix => name === key(suffix))), `${message}: 无等级/五行/倍率/零状态键`);
  ok(!/\+\s*\d|[%％]|未强化|未附灵|附灵\s*·|\{\w+\}|NaN|null/u.test(display.lines.map(row => row.text).join('\n')), `${message}: 无成功/零状态文案泄漏`);
}

async function runGraph(dataMode, dataRoot, graph) {
  const memoryClosed = graph !== 'formal-source';
  const flagLoads = { Enhance: 0, Enchant: 0 };
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } }, ssr: { noExternal: ['phaser'] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'attr-ui-memory-closed-and-phaser', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0attr-ui-phaser';
        const match = id.match(/(?:^|\/)(Enhance|Enchant)OpenFlag(?:\.ts)?$/u);
        if (memoryClosed && match) return `\0attr-ui-${match[1]}-flag`;
      },
      load(id) {
        if (id === '\0attr-ui-phaser') return 'export default { Scenes: { Events: { SHUTDOWN: "shutdown" } } };';
        for (const name of Object.keys(flagLoads)) if (id === `\0attr-ui-${name}-flag`) {
          flagLoads[name]++;
          return `let open = false; export function is${name}OpenForFixture() { return open; } export function __setOpen(value) { open = value; }`;
        }
      } }],
  });
  const prefix = `${dataMode}/${graph}`;
  try {
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const api = await server.ssrLoadModule('/src/EquipInstReadonly.ts');
    const { EquipPanel } = await server.ssrLoadModule('/src/EquipPanel.ts');
    const { InventoryPanel } = await server.ssrLoadModule('/src/InventoryPanel.ts');
    const flags = {};
    for (const name of Object.keys(flagShas)) {
      flags[name] = await server.ssrLoadModule(`/src/${name}OpenFlag.ts`);
      eq(flags[name][`is${name}OpenForFixture`](), !(memoryClosed && ['Enhance', 'Enchant'].includes(name)), `${prefix} ${name} 仅 SSR 双旗关态`);
      const gateModule = await server.ssrLoadModule(`/src/${name}Gate.ts`);
      const Gate = gateModule[`${name}Gate`];
      for (const method of ['submit', 'craft', 'enhance', 'enchant', 'salvage']) if (typeof Gate.prototype[method] === 'function')
        Gate.prototype[method] = function () { serviceCalls++; throw new Error(`只读不得调用 ${name}Gate.${method}`); };
    }
    const setFlags = (enhance, enchant) => {
      ok(memoryClosed, `${prefix} 只有隔离 SSR 图可改内存开态`);
      flags.Enhance.__setOpen(enhance); flags.Enchant.__setOpen(enchant);
    };
    const table = await json(path.join(dataRoot, 'balance/enhance.json'));
    const { p, binding } = fixture(Progress, table, { levelOne: true, enchanted: true });
    const eScene = mockScene(), iScene = mockScene();
    const e = new EquipPanel(eScene, p, () => { throw new Error('只读触发穿脱回调'); });
    const i = new InventoryPanel(iScene, p, { onChanged() { throw new Error('只读触发穿戴'); }, openAlchemy: () => false, openSectToken: () => false });
    readOnly(p, () => { e.open(); i.open(); }, `${prefix} E/I 打开`);
    const equipBinding = readOnly(p, () => api.resolveEquipSlotBinding(p, 'weapon'), `${prefix} E resolver`);
    const row = i.snapshot().rows.find(row => row.id === 'wood_sword');
    eq(equipBinding, { kind: 'no_instance' }, `${prefix} E 装备无槽位映射`);
    eq(api.resolveInventoryEquipBinding(p, row), { kind: 'no_instance' }, `${prefix} I 聚合行无实例映射`);
    const expected = memoryClosed ? 'unavailable' : 'no_instance';
    only(e.snapshot().instDisplay, expected, `${prefix} E 只显示中性提示`);
    only(i.snapshot().instDisplay, expected, `${prefix} I 只显示中性提示`);
    eq(e.snapshot().instKind, expected, `${prefix} E snapshot 分型`);
    eq(i.snapshot().instKind, expected, `${prefix} I snapshot 分型`);
    ok(eScene.texts().includes(e.snapshot().instLines[0].text), `${prefix} E 实际渲染只读行`);
    ok(iScene.texts().includes(i.snapshot().instLines[0].text), `${prefix} I 实际渲染共用只读行`);
    noLeak(e.snapshot().instDisplay, `${prefix} E`); noLeak(i.snapshot().instDisplay, `${prefix} I`);
    if (memoryClosed) {
      only(readOnly(p, () => api.buildInstDisplay(p, binding), `${prefix} 双旗关闭显式旧属性`), 'unavailable', `${prefix} 已核实旧 +1/火/5% 全隐藏且通用提示一条`);
      const goodEnhance = structuredClone(p.enhance), goodEnchant = structuredClone(p.enchant);
      p.enhance.instances[0].enhanceLevel = 999;
      p.enchant.instances[0].element = '假五行';
      p.enchant.instances[0].attributes = { elementDamage: 123, sameRootBonus: 321 };
      readOnly(p, () => {
        const display = api.buildInstDisplay(p, binding);
        only(display, 'unavailable', `${prefix} 双false优先于故意非法等级/五行/倍率`);
        noLeak(display, `${prefix} 双关态毒值不泄漏`);
        e.update(); i.update();
        only(e.snapshot().instDisplay, 'unavailable', `${prefix} E 毒值只显示 unavailable`);
        only(i.snapshot().instDisplay, 'unavailable', `${prefix} I 毒值只显示 unavailable`);
      }, `${prefix} 双false故意非法实例毒值`);
      p.enhance = goodEnhance; p.enchant = goodEnchant;
      record('C01', `${prefix}/equip-closed`, { unavailableLines: 1, attributeLeak: false, writes: 0 });
      record('C02', `${prefix}/inventory-closed`, { aggregateBinding: 'no_instance', unavailableLines: 1, writes: 0 });
    }
    const attrs = e.snapshot().attributes;
    eq(attrs, { atk: p.atk, def: p.def, hp: p.maxHp, mp: p.maxMp, speed: p.currentMovePoints().speed, matk: p.matk }, `${prefix} 原角色聚合六维语义保留`);

    // 缺显式绑定：即使正式候选唯一、数量一或多件也不建立位置身份。
    for (const count of [1, 2]) {
      p.inventory.wood_sword = count;
      readOnly(p, () => { e.update(); i.update(); }, `${prefix} 数量 ${count} 刷新`);
      eq(api.resolveEquipSlotBinding(p, 'weapon'), { kind: 'no_instance' }, `${prefix} E 数量 ${count} 不冒充`);
      eq(api.resolveInventoryEquipBinding(p, { id: 'wood_sword', count, type: 'equip', instanceRef: 'attr_unregistered:craft:seed:item' }),
        { kind: 'no_instance' }, `${prefix} I 数量 ${count} 不授权未登记 row.instanceRef`);
    }
    const extra = structuredClone(p.enhance.instances[0]); extra.instanceRef = 'attr_forge:craft:second:item'; extra.enhanceLevel = 0;
    const extraCraft = structuredClone(p.forge.crafts[0]);
    extraCraft.craftRequestId = 'second'; extraCraft.craftResultRef = 'attr_forge:craft:second'; extraCraft.resultItem.instanceRef = extra.instanceRef;
    p.forge.crafts.push(extraCraft); p.forge.receipts.push(extraCraft.craftResultRef);
    p.enhance.instances.push(extra);
    p.enhance.formalSources.push({ ...p.enhance.formalSources[0], instanceRef: extra.instanceRef, craftResultRef: extraCraft.craftResultRef });
    eq(p.formalEnhanceInstances().length, 2, `${prefix} 两条实际正式同 itemId 候选均有来源`);
    eq(api.resolveEquipSlotBinding(p, 'weapon'), { kind: 'no_instance' }, `${prefix} E 不选首条/最高级`);
    eq(api.resolveInventoryEquipBinding(p, row), { kind: 'no_instance' }, `${prefix} I 不选多件首条/最高级`);
    p.enhance.instances.pop(); p.enhance.formalSources.pop(); p.forge.crafts.pop(); p.forge.receipts.pop();
    extra.instanceRef = 'attr_history:second'; extra.enhanceLevel = 12;
    const oldBag = p.enhance; p.enhance = { version: 1, ledgerId: 'history', instances: [extra], enhancements: [], receipts: [] };
    eq(api.resolveEquipSlotBinding(p, 'weapon'), { kind: 'no_instance' }, `${prefix} 历史实例不充正式槽位映射`);
    eq(api.resolveInventoryEquipBinding(p, { ...row, fixtureInstances: [extra] }), { kind: 'no_instance' }, `${prefix} fixture 回退企图拒绝`);
    p.enhance = oldBag;
    record('C04', `${prefix}/mapping-refusal`, { uniqueCandidateRefused: true, multipleCandidatesRefused: true, historyRefused: true, fixtureInstancesProductionFallback: false });

    if (memoryClosed) {
      setFlags(true, true);
      const known = readOnly(p, () => api.buildInstDisplay(p, binding), `${prefix} C03 显式核实只读语义基准`);
      ok(lineKeys(known).includes(key('enhance_level')), `${prefix} C03 基准确有强化行`);
      ok(lineKeys(known).includes(key('enchant_element')), `${prefix} C03 基准确有附灵行`);
      eq(known.lines.find(line => line.key === key('element_damage'))?.text, '五行伤害 +5%', `${prefix} 0.05 仅格式化为 5`);
      eq(known.lines.find(line => line.key === key('same_root_bonus'))?.text, '同灵根加成 +5%', `${prefix} 同根行独立显示`);
      readOnly(p, () => { e.update(); i.update(); }, `${prefix} 开放事实刷新`);
      const oldE = eScene.containers.at(-1), oldI = iScene.containers.at(-1);
      for (const [enhanceOpen, enchantOpen] of [[false, true], [true, false], [false, false]]) {
        setFlags(enhanceOpen, enchantOpen);
        const display = readOnly(p, () => api.buildInstDisplay(p, binding), `${prefix} C03 ${enhanceOpen}/${enchantOpen}`);
        eq(display.enhanceOpen, enhanceOpen, `${prefix} Enhance 只读开放事实`);
        eq(display.enchantOpen, enchantOpen, `${prefix} Enchant 只读开放事实`);
        eq(lineKeys(display).filter(name => name === key('unavailable')).length, 1, `${prefix} 通用 unavailable 最多且恰一条`);
        if (!enhanceOpen) ok(!lineKeys(display).some(name => [key('enhance_level'), key('no_enhance')].includes(name)), `${prefix} 关闭强化组无旧值/零态`);
        if (!enchantOpen) ok(!lineKeys(display).some(name => [key('enchant_element'), key('element_damage'), key('same_root_bonus'), key('no_enchant')].includes(name)), `${prefix} 关闭附灵组无旧值/零态`);
        readOnly(p, () => { e.update(); i.update(); }, `${prefix} C03 面板更新`);
        for (const [name, display] of [['E', e.snapshot().instDisplay], ['I', i.snapshot().instDisplay]]) {
          if (!enhanceOpen && !enchantOpen) only(display, 'unavailable', `${prefix} ${name} 双关态优先`);
          else eq([...lineKeys(display)].sort(), [key('no_instance'), key('unavailable')].sort(), `${prefix} ${name} 关组unavailable/开放组缺映射no_instance`);
          noLeak(display, `${prefix} ${name} 混合开态无身份属性`);
        }
      }
      ok(oldE.destroyed && oldI.destroyed, `${prefix} 开态旧容器已销毁`);
      record('C03', `${prefix}/per-group-gates-and-cache`, { independentFlags: true, previousContainersDestroyed: true, neutralTipDeduplicated: true });
      setFlags(true, true);
    }

    const foreign = fixture(Progress, table, { levelOne: true, enchanted: true });
    foreign.p.enhance.formalSources[0].ownerSlot = Progress.getActiveSlot() === 1 ? 2 : 1;
    only(readOnly(foreign.p, () => api.buildInstDisplay(foreign.p, foreign.binding), `${prefix} 同 ref 跨档`), 'foreign', `${prefix} 同引用跨档仅 foreign`);
    noLeak(api.buildInstDisplay(foreign.p, foreign.binding), `${prefix} foreign`);
    const badEnchantOwner = fixture(Progress, table, { enchanted: true }); badEnchantOwner.p.enchant.ownerSlot = foreign.p.enhance.formalSources[0].ownerSlot;
    only(readOnly(badEnchantOwner.p, () => api.buildInstDisplay(badEnchantOwner.p, badEnchantOwner.binding), `${prefix} 附灵袋跨档`), 'foreign', `${prefix} 附灵袋 ownerSlot 冲突不借权`);
    const oldTarget = eScene.containers.at(-1); e.prog = foreign.p;
    readOnly(foreign.p, () => { e.update(); }, `${prefix} 切档刷新`);
    only(e.snapshot().instDisplay, 'no_instance', `${prefix} 生产 E 切档重核目标仍缺映射`);
    // 即使同引用，生产路径从未拿候选或旧 display 作为绑定。
    ok(eScene.containers.at(-1) !== oldTarget || e.snapshot().instDisplay.kind === 'no_instance', `${prefix} 切档不沿用旧成功文本`);
    e.prog = p;
    record('C05', `${prefix}/foreign-and-switch`, { explicitSameReferenceForeign: true, enchantOwnerConflictForeign: true, productionNoInstance: true });

    const corruptions = [
      ['negative-level', q => { q.enhance.instances[0].enhanceLevel = -1; }],
      ['fraction-level', q => { q.enhance.instances[0].enhanceLevel = 0.5; }],
      ['over-max-level', q => { q.enhance.instances[0].enhanceLevel = 13; }],
      ['missing-level', q => { delete q.enhance.instances[0].enhanceLevel; }],
      ['bad-type', q => { q.enhance.instances[0].type = 'trinket'; }],
      ['unknown-enhance-version', q => { q.enhance.version = 2; }],
    ];
    for (const [name, corrupt] of corruptions) {
      const bad = fixture(Progress, table); corrupt(bad.p);
      only(readOnly(bad.p, () => api.buildInstDisplay(bad.p, bad.binding), `${prefix} ${name}`), 'unknown', `${prefix} ${name} 不默认零`);
    }
    const invalidRef = fixture(Progress, table);
    only(readOnly(invalidRef.p, () => api.buildInstDisplay(invalidRef.p, { kind: 'verified', instanceRef: '__proto__' }), `${prefix} 非法显式引用`),
      'unknown', `${prefix} 非法显式引用不默认无实例/零态`);
    const insufficient = fixture(Progress, table); insufficient.p.inventory = {}; insufficient.p.equip = {};
    only(readOnly(insufficient.p, () => api.buildInstDisplay(insufficient.p, insufficient.binding), `${prefix} 持有不足`),
      'unknown', `${prefix} 持有不足按依赖损坏隐藏`);
    for (const [name, corrupt] of [
      ['empty-enchant-bag', q => { q.enchant = {}; }],
      ['missing-owner-slot', q => { delete q.enchant.ownerSlot; }],
      ['unknown-enchant-version', q => { q.enchant.version = 2; }],
      ['missing-multiplier', q => { delete q.enchant.instances[0].attributes.elementDamage; }],
      ['half-result', q => { q.enchant.enchantments = []; }],
      ['conflicting-receipt', q => { q.enchant.receipts = ['attr_enchant:enchant:other']; }],
      ['unknown-root', q => { q.rootElement = ''; }],
      ['conflicting-root', q => { q.rootElement = '水'; }],
    ]) {
      const bad = fixture(Progress, table, { enchanted: true }); corrupt(bad.p);
      const display = readOnly(bad.p, () => api.buildInstDisplay(bad.p, bad.binding), `${prefix} ${name}`);
      ok(lineKeys(display).includes(key('unknown')), `${prefix} ${name} 给 unknown`);
      ok(lineKeys(display).includes(key('no_enhance')), `${prefix} ${name} 合法强化独立保留`);
      ok(!lineKeys(display).some(name => [key('enchant_element'), key('element_damage'), key('same_root_bonus'), key('no_enchant')].includes(name)), `${prefix} ${name} 附灵组整体隐藏`);
    }
    record('C06', `${prefix}/corrupt-and-unknown`, { illegalLevelsRefused: true, malformedEnchantRefused: true, rootConflictRefused: true, repairs: 0 });

    const zero = fixture(Progress, table);
    const zeroDisplay = readOnly(zero.p, () => api.buildInstDisplay(zero.p, zero.binding), `${prefix} 明确合法零态`);
    eq(lineKeys(zeroDisplay), [key('no_enhance'), key('no_enchant')], `${prefix} 合法 0/未附灵可区分`);
    const unknownRootWithoutBag = fixture(Progress, table); unknownRootWithoutBag.p.rootElement = '';
    const rootDisplay = readOnly(unknownRootWithoutBag.p, () => api.buildInstDisplay(unknownRootWithoutBag.p, unknownRootWithoutBag.binding), `${prefix} 无附灵袋且未知灵根`);
    ok(lineKeys(rootDisplay).includes(key('unknown')) && !lineKeys(rootDisplay).includes(key('no_enchant')), `${prefix} 灵根未知不默认未附灵`);
    const otherRoot = fixture(Progress, table, { enchanted: true, otherRoot: true });
    const otherDisplay = readOnly(otherRoot.p, () => api.buildInstDisplay(otherRoot.p, otherRoot.binding), `${prefix} 合法非同根`);
    ok(!lineKeys(otherDisplay).includes(key('same_root_bonus')), `${prefix} 非同根不显示 +0%/+5%`);
    if (memoryClosed) {
      setFlags(false, false);
      only(api.buildInstDisplay(zero.p, zero.binding), 'unavailable', `${prefix} 关态优先于确认零态`);
      only(api.buildInstDisplay(foreign.p, foreign.binding), 'unavailable', `${prefix} 关态优先于 foreign 实例细节`);
      noLeak(api.buildInstDisplay(zero.p, zero.binding), `${prefix} 关态零态`);
    }
    p.equip = {};
    readOnly(p, () => { e.open(); e.update(); }, `${prefix} 空槽`);
    eq(api.resolveEquipSlotBinding(p, 'weapon'), { kind: 'empty' }, `${prefix} 空槽独立分型`);
    eq(e.snapshot().instLines, [], `${prefix} 空槽无实例行`);
    p.inventory = { hp_pill_small: 1 };
    readOnly(p, () => { i.open(); i.update(); }, `${prefix} 非装备行`);
    eq(api.resolveInventoryEquipBinding(p, i.snapshot().rows[0]), { kind: 'not_equip' }, `${prefix} 非装备独立分型`);
    eq(i.snapshot().instLines, [], `${prefix} 非装备无实例块`);
    p.inventory = {};
    readOnly(p, () => { i.update(); }, `${prefix} 背包空页`);
    eq(i.snapshot().selectedId, null, `${prefix} 空页无选择`);
    eq(i.snapshot().instLines, [], `${prefix} 空页无实例行`);
    record('C08', `${prefix}/empty-zero-corrupt-separated`, { emptyHasNoInstLines: true, nonEquipHasNoInstLines: true, explicitZeroSeparated: true, closedOverridesZero: memoryClosed });

    p.equip = { weapon: 'wood_sword' }; p.inventory = { wood_sword: 1, hp_pill_small: 1 };
    readOnly(p, () => { e.open(); i.open(); }, `${prefix} 同内容换档前`);
    const sameTarget = fixture(Progress, table, { levelOne: true, enchanted: true });
    sameTarget.p.inventory = structuredClone(p.inventory); sameTarget.p.equip = structuredClone(p.equip);
    const previousEquip = eScene.containers.at(-1), previousInventory = iScene.containers.at(-1);
    e.prog = sameTarget.p; i.prog = sameTarget.p;
    readOnly(sameTarget.p, () => { e.update(); i.update(); }, `${prefix} 相同装备数量换 Progress 对象`);
    ok(previousEquip.destroyed && previousInventory.destroyed, `${prefix} 换档即使展示指纹相同也销毁旧容器`);
    const restored = sentinels(readOnly(sameTarget.p, () => Progress.restore(JSON.parse(state(sameTarget.p)), false), `${prefix} 实际restore(false)只读恢复`));
    eq(restored.equip, sameTarget.p.equip, `${prefix} restore保持当前装备目标`);
    eq(restored.inventory, sameTarget.p.inventory, `${prefix} restore保持当前背包目标`);
    const beforeRestoreEquip = eScene.containers.at(-1), beforeRestoreInventory = iScene.containers.at(-1);
    const deferredRefresh = () => { e.update(); i.update(); };
    e.prog = restored; i.prog = restored;
    readOnly(restored, deferredRefresh, `${prefix} 恢复后延迟刷新重新核当前目标`);
    ok(beforeRestoreEquip.destroyed && beforeRestoreInventory.destroyed, `${prefix} restore换对象销毁两个旧容器`);
    only(e.snapshot().instDisplay, memoryClosed ? 'unavailable' : 'no_instance', `${prefix} restore后E重新走当前位置映射/开态`);
    only(i.snapshot().instDisplay, memoryClosed ? 'unavailable' : 'no_instance', `${prefix} restore后I重新走当前行映射/开态`);
    e.prog = p; i.prog = p;
    for (let iteration = 0; iteration < 3; iteration++) readOnly(p, () => {
      e.open(); e.onKey({ key: 'ArrowDown' }); e.onKey({ key: 'ArrowUp' }); e.update(); e.close();
      i.open(); i.select(1); i.select(0); i.setTab('equip'); i.update(); i.close();
    }, `${prefix} E↔I 往返刷新 ${iteration}`);
    eq(e.snapshot().instLines, [], `${prefix} E 关闭清旧行`);
    eq(i.snapshot().instLines, [], `${prefix} I 关闭清旧行`);
    record('C07', `${prefix}/repeat-refresh-and-reopen`, { repeatedCycles: 3, freshTargetCheck: true, closeClearsLines: true,
      actualRestoreWithoutPersistence: true, sameContentDifferentProgressRerendered: true, synchronousCurrentTargetRevalidation: true, writes: 0 });
    eq([localStorageWrites, indexedDbOpens, sentinelCalls, serviceCalls], [0, 0, 0, 0], `${prefix} 展示全程零写/零服务调用`);
    eq(flagLoads, memoryClosed ? { Enhance: 1, Enchant: 1 } : { Enhance: 0, Enchant: 0 }, `${prefix} 双Flag仅内存图注入一次`);
    record('C10', `${prefix}/zero-delta-and-service-boundary`, { localStorageWrites: 0, indexedDbOpens: 0, sentinelCalls: 0,
      serviceCalls: 0, fullSaveComparedPerRead: true, serviceSettlementRegressionExecuted: false, gatesBaselineMatch: true });
    evidence.push({ suite: 'ssr-graph', dataMode, graph, memoryClosed, flagLoads, passed: true,
      initialEnhanceOpen: !memoryClosed, initialEnchantOpen: !memoryClosed, ForgeOpenFlag: true, SalvageOpenFlag: true });
  } finally { await server.close(); }
}

const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const indexedDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: () => null, setItem() { localStorageWrites++; throw new Error('属性只读禁止 localStorage.setItem'); },
  removeItem() { localStorageWrites++; throw new Error('属性只读禁止 localStorage.removeItem'); },
  clear() { localStorageWrites++; throw new Error('属性只读禁止 localStorage.clear'); },
} });
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
  open() { indexedDbOpens++; throw new Error('属性只读禁止 indexedDB.open'); },
} });
await fs.mkdir(out, { recursive: true });
try {
  await staticChecks();
  for (const [mode, dataRoot] of [['shared', shared], ['snapshot', path.join(root, 'data')]]) {
    await runGraph(mode, dataRoot, 'formal-source');
    await runGraph(mode, dataRoot, 'memory-closed');
    await runGraph(mode, dataRoot, 'fresh-memory-closed');
  }
  ok(Object.values(cases).every(row => row.executed && row.passed), 'C01–C10 全部有程序自检证据');
  passed = true;
} finally {
  for (const [file, expected] of Object.entries(protectedFiles)) eq(hash(await fs.readFile(file)), expected, `运行后冻结字节 MATCH: ${file}`);
  const result = { passed, assertions, baselineTip: baseline, attrUiReadonlyWired: passed,
    newOpenFlag: false, enhanceSha, strings970, strings970Previous960Sha: strings960,
    softOpenedAttrUi: true, released: false, formalInstanceSource: true,
    mappingStrategy: 'explicit_position_binding_only_no_item_id_inference_missing_binding_no_instance',
    mappingEvidence: 'reports/炼器阁/V06P1_ATTR_UI_MAP_API_EVIDENCE.md', mappingGaps: [],
    eSlotToInstanceRefApiExists: true, iRowToInstanceRefApiExists: true, noItemIdImpersonation: true,
    fixtureInstancesProductionFallback: false, ForgeOpenFlag: true, EnhanceOpenFlag: true, EnchantOpenFlag: true, SalvageOpenFlag: true,
    formalFlagsDiskSourcePreserved: true, flagShas, gatesBaselineMatch: true,
    localStorageWrites, indexedDbOpens, sentinelCalls, serviceCalls, storageWrites: localStorageWrites,
    readOnlyFullSaveDelta: 0, publicProgressFieldDelta: 0, actualRestoreWithoutPersistence: true,
    synchronousCurrentTargetRevalidation: true, fourServiceSettlementRegressionExecuted: false,
    fourServiceBoundaryMeaning: '四 Gate 与基线源码 SHA 完全相同，四正式 Flag 恒 true；展示不调用提交/收费预览；本测试不结算服务',
    openFixtureTableExecuted: false, semanticFixtureOnly: true, testsUseRealSsrModule: true,
    freshIndependentGraphs: evidence.filter(row => row.suite === 'ssr-graph').length, cases, protectedFiles, evidence };
  await fs.writeFile(path.join(out, 'evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
  if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor); else delete globalThis.localStorage;
  if (indexedDescriptor) Object.defineProperty(globalThis, 'indexedDB', indexedDescriptor); else delete globalThis.indexedDB;
}
console.log(`v06p1 attr-ui closed PASS: ${assertions} assertions; C01–C10; shared+snapshot strings970; SSR 双 Flag=false; localStorageWrites=0; serviceCalls=0; mappingStrategy=explicit_position_binding_missing_binding_no_instance; softOpenedAttrUi=true; released=false`);
