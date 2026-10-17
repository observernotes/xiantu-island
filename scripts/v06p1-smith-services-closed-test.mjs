// design/32 C01–C11: real SSR UI routing and refusal tests; no O-table execution.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), out = path.join(root, 'qa/out_v06p1_smith_services_closed');
const baseline = 'f87e1c276ad3116e37f9f50132dd5174ed681713';
const strings970Baseline = '0dd59efdcd288930f1bd0525d2c9e7ddf06c0814';
const stringsSha = 'd99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841';
const enhanceSha = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954';
const flagShas = {
  Forge: '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  Enhance: 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  Enchant: 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  Salvage: '69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3',
};
// Design text used only for exact MATCH checks; every runtime t() reads the actual disk JSON.
const design43 = {
  'ui.smith.closed': '炼器服务界面暂未开放。',
  'ui.smith.title': '炼器服务',
  'ui.smith.forge': '打造', 'ui.smith.enhance': '强化', 'ui.smith.enchant': '附灵', 'ui.smith.salvage': '分解',
  'ui.smith.back': '返回', 'ui.smith.select_recipe': '选择打造图纸',
  'ui.smith.select_instance': '选择本档正式装备', 'ui.smith.select_weapon': '选择本档正式武器',
  'ui.smith.select_element': '选择五行目标', 'ui.smith.protect_charm': '护器符（可选）',
  'ui.smith.no_charm': '不使用护器符', 'ui.smith.selection_required': '请先完成{service}所需选择。',
  'ui.smith.confirm': '确认{service}？请核对目标、材料与消耗。',
  'ui.smith.confirm_salvage': '确认分解{item}？装备将被销毁且不可恢复。',
  'ui.smith.output_preview': '分解产出：{output}。',
  'ui.smith.result_forge': '打造完成：{item}；品质：{quality}。',
  'ui.smith.result_enhance_ok': '{item}强化成功：{before}级→{after}级。',
  'ui.smith.result_enhance_fail': '{item}强化失败：{before}级→{after}级。',
  'ui.smith.result_protected': '本次强化失败，护器符已保护装备等级。',
  'ui.smith.result_enchant': '{item}附灵完成：{element}。',
  'ui.smith.result_salvage': '{item}已分解，获得：{output}。',
  'ui.smith.no_recipe': '暂无可用的打造图纸。',
  'ui.smith.no_instance': '无本档正式装备实例，无法提交。',
  'ui.smith.foreign': '非本档装备实例，无法提交。',
  'ui.smith.invalid': '当前目标或材料不可用于{service}，请重新选择。',
  'ui.smith.charm_short': '护器符数量不足。',
  'ui.smith.changed': '选择内容或资源已变化，请重新确认。',
  'ui.smith.busy': '请求处理中，请勿重复提交。',
  'ui.smith.duplicate': '该请求已提交，请读取既有结果。',
  'ui.smith.load_dedupe': '读档后只显示已提交结果，不重复结算。',
  'ui.smith.result_unknown': '暂未取得可核实的结果，请稍后查看；请勿重复提交。',
  'ui.smith.confirm_enchant': '确认将{item}从{from}附灵为{to}？',
  'ui.smith.enhance_preview': '强化至{level}级；成功率{rate}%。',
  'ui.smith.drop_on_fail': '失败降低{n}级，不碎装。',
  'ui.smith.no_drop_on_fail': '失败不掉级，不碎装。',
  'ui.smith.same_element': '已附着该五行，无需重复附灵。',
  'ui.smith.keys': '方向键选择 · 回车确认 · Esc 返回',
  'forge.grade.common': '凡', 'forge.grade.fine': '良', 'forge.grade.spirit': '灵', 'forge.grade.treasure': '宝',
};
const services = ['forge', 'enhance', 'enchant', 'salvage'];
const names = Object.keys(flagShas), protectedFiles = {}, rows = [];
const cases = Object.fromEntries(Array.from({ length: 11 }, (_, i) =>
  [`C${String(i + 1).padStart(2, '0')}`, { executed: false, passed: false, evidenceKeys: [] }]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let assertions = 0, passed = false, localStorageWrites = 0, indexedDbOpens = 0, sentinelCalls = 0, submitCalls = 0, settlementRandomCalls = 0;
let diskStrings, sharedStringsDiskKeys;
let productionIgnoresSsrInjection = false, productionServicesRoutesAccessible = false;
const smithServicesDelegation = [];
const eq = (a, b, text) => { assertions++; assert.deepEqual(a, b, text); };
const ok = (value, text) => { assertions++; assert.ok(value, text); };
function record(id, label, fields = {}) {
  cases[id].executed = true; cases[id].passed = true; cases[id].evidenceKeys.push(label);
  rows.push({ case: id, label, passed: true, ...fields });
}
async function guard(file, expected) {
  const actual = hash(await fs.readFile(file));
  if (expected) eq(actual, expected, `frozen SHA MATCH: ${file}`);
  protectedFiles[file] = actual;
}
async function filesIn(folder) {
  const list = await fs.readdir(folder, { withFileTypes: true });
  return (await Promise.all(list.map(row => row.isDirectory() ? filesIn(path.join(folder, row.name)) : path.join(folder, row.name)))).flat();
}
async function staticChecks() {
  const baselineFiles = git('ls-tree', '-r', '--name-only', baseline, 'src').toString().trim().split('\n');
  eq((await filesIn(path.join(root, 'src'))).filter(file => /OpenFlag\.ts$/u.test(file))
    .map(file => path.relative(root, file)).sort(), baselineFiles.filter(file => /OpenFlag\.ts$/u.test(file)).sort(), 'no new OpenFlag file');
  for (const [name, expected] of Object.entries(flagShas)) {
    await guard(path.join(root, `src/${name}OpenFlag.ts`), expected);
    for (const suffix of ['Gate', 'Closed', 'Progress'])
      await guard(path.join(root, `src/${name}${suffix}.ts`), hash(git('show', `${baseline}:src/${name}${suffix}.ts`)));
  }
  for (const file of ['src/Progress.ts', 'src/SaveStore.ts', 'src/data.ts', 'src/EquipInstBinding.ts',
    'src/EquipInstReadonly.ts', 'src/EquipPanel.ts', 'src/InventoryPanel.ts'])
    await guard(path.join(root, file), hash(git('show', `${baseline}:${file}`)));
  for (const dataRoot of [path.join(root, 'data'), shared]) {
    await guard(path.join(dataRoot, 'balance/enhance.json'), enhanceSha);
    for (const name of ['recipes', 'materials', 'items', 'npcs', 'life_skills', 'enhance_protect_charm'])
      await guard(path.join(dataRoot, `balance/${name}.json`), hash(git('show', `${baseline}:data/balance/${name}.json`)));
  }
  const stringsFile = path.join(root, 'data/balance/strings_zh.json');
  await guard(stringsFile, stringsSha);
  const stringsBytes = await fs.readFile(stringsFile);
  eq(stringsBytes, git('show', `${baseline}:data/balance/strings_zh.json`), 'disk strings exactly match origin/dev@f87e1c2');
  const oldBytes = git('show', `${strings970Baseline}:data/balance/strings_zh.json`);
  const oldPrefix = oldBytes.subarray(0, oldBytes.length - Buffer.byteLength('\n}\n'));
  eq(stringsBytes.subarray(0, oldPrefix.length), oldPrefix, 'all 970 original strings prefix bytes preserved before append delimiter');
  diskStrings = JSON.parse(stringsBytes);
  eq(Object.keys(diskStrings).length, 1013, 'worktree disk strings has 1013 keys including _meta');
  eq(Object.keys(design43).length, 43, 'exactly 43 strings in design MATCH object; no runtime injection');
  const design = await fs.readFile(path.join(shared, 'design/32_v06_P1③++++++++_关态_完整炼器服务UI.md'), 'utf8');
  const section = design.split('### 6.2')[1];
  const fromDesign = Object.fromEntries([...section.matchAll(/^\| ((?:ui\.smith|forge\.grade)\.[\w]+) \| ([^|]+) \| \d+ \|$/gmu)]
    .map(match => [match[1], match[2].trim()]));
  eq(design43, fromDesign, 'all 43 disk-string expectations exactly match design/32 section 6.2');
  eq(Object.fromEntries(Object.keys(design43).map(key => [key, diskStrings[key]])), design43, 'all 43 authoritative disk strings exactly MATCH design');
  const sharedStringsFile = path.join(shared, 'balance/strings_zh.json');
  await guard(sharedStringsFile, stringsSha);
  const sharedStrings = await json(sharedStringsFile);
  sharedStringsDiskKeys = Object.keys(sharedStrings).length;
  eq(sharedStringsDiskKeys, 1013, 'authoritative shared strings disk has 1013 keys including _meta');
  eq(sharedStrings, diskStrings, 'worktree and authoritative shared strings exactly MATCH');
  ok(/GAME_PHASE\s*=\s*5\b/u.test(await fs.readFile(path.join(root, 'src/data.ts'), 'utf8')), 'GAME_PHASE remains 5');
  const smith = await fs.readFile(path.join(root, 'src/SmithServicesController.ts'), 'utf8');
  ok(!/SalvageFixture|fixtureInstances|fixtureRecipes/u.test(smith), 'UI has no fixture authorization or salvage fallback');
  ok(!/\.laterService\(/u.test(smith), 'UI never invokes historical later_service explanation');
  ok(/new SmithServices\(/u.test(smith), 'Controller owns the canonical SmithServices adapter');
  ok(!/new (?:Forge|Enhance|Enchant|Salvage)Gate\(|this\.gates\b/u.test(smith), 'Controller has no parallel Gate instances or dispatch');
  for (const method of ['choices', 'select', 'submit', 'result', 'loadRefresh'])
    ok(new RegExp(`\\.${method}\\(`, 'u').test(smith), `Controller delegates ${method} to SmithServices`);
  const servicesSource = await fs.readFile(path.join(root, 'src/SmithServices.ts'), 'utf8');
  ok(/isSmithServicesUiAccessible/u.test(servicesSource), 'canonical Services routing consumes UiAccess instead of a production false route');
}
function sentinels(prog) {
  for (const method of ['save', 'saveAsync', 'persistSoon', 'runSaveTransaction', 'runSaveTransactionAsync',
    'registerFormalEnhanceInstance', 'equipItem', 'unequipSlot', 'addItem', 'removeItem', 'gainEquip', 'addCraftedItem'])
    Object.defineProperty(prog, method, { configurable: true, value() { sentinelCalls++; throw new Error(`closed UI write: ${method}`); } });
  return prog;
}
const fullState = prog => JSON.stringify({ save: prog.exportSave(), public: prog });
async function zero(progs, action, label) {
  const list = Array.isArray(progs) ? progs : [progs], before = list.map(fullState);
  const counters = [localStorageWrites, indexedDbOpens, sentinelCalls, submitCalls, settlementRandomCalls];
  const originalRandom = Math.random;
  Math.random = () => { settlementRandomCalls++; throw new Error('closed UI must not sample settlement randomness'); };
  let result;
  try { result = await action(); } finally { Math.random = originalRandom; }
  eq(list.map(fullState), before, `${label}: full business state delta zero`);
  eq([localStorageWrites, indexedDbOpens, sentinelCalls, submitCalls, settlementRandomCalls], counters, `${label}: no submit/storage/write/random sentinel`);
  return result;
}
function fixture(Progress, table, recipe, opts = {}) {
  Progress.setActiveSlot(1);
  const p = new Progress(); p.level = 20; p.rootElement = '火'; p.stones = 100000;
  p.inventory = { [recipe.output]: 1, [recipe.blueprint]: 5, refine_stone: 1000, protect_charm: 5,
    ...Object.fromEntries(recipe.materials.map(row => [row.item, row.count * 20])),
    ...Object.fromEntries(table.enchant.cost.materials.map(row => [row.item, row.count * 20])) };
  const craftResultRef = 'smith_ui_seed:craft:seed', instanceRef = `${craftResultRef}:item`;
  p.forge = { version: 1, ledgerId: 'smith_ui_seed', crafts: [{ state: 'committed', craftRequestId: 'seed', craftResultRef,
    blueprintId: recipe.blueprint, blueprintCount: 1, materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })),
    resultItem: { itemId: recipe.output, count: 1, instanceRef }, resultGrade: 'common' }], receipts: [craftResultRef] };
  p.enhance = { version: 1, ledgerId: 'smith_ui_enhance', instances: [{ instanceRef, itemId: recipe.output, type: 'weapon', enhanceLevel: 0 }],
    enhancements: [], receipts: [], formalSources: [{ instanceRef, source: 'forge', forgeLedgerId: 'smith_ui_seed', craftResultRef, ownerSlot: 1 }] };
  if (opts.enchanted) {
    const attrs = { elementDamage: table.enchant.elementDamage, sameRootBonus: table.enchant.sameRootBonus };
    const resultRef = 'smith_ui_enchant:enchant:seed';
    p.enchant = { version: 1, ledgerId: 'smith_ui_enchant', ownerSlot: 1,
      instances: [{ instanceRef, itemId: recipe.output, type: 'weapon', element: '火', attributes: structuredClone(attrs) }],
      enchantments: [{ state: 'committed', enchantRequestId: 'seed', enchantResultRef: resultRef, instanceRef,
        itemId: recipe.output, type: 'weapon', fromElement: null, element: '火', rootElement: '火',
        stones: table.enchant.cost.stones, materials: table.enchant.cost.materials.map(row => ({ itemId: row.item, count: row.count })),
        attributes: structuredClone(attrs), success: true }], receipts: [resultRef] };
  }
  return { p: sentinels(p), instanceRef };
}
function mockScene() {
  const containers = [], handlers = [];
  const node = value => {
    const object = { value, children: [], destroyed: false, handlers: {},
      add(child) { this.children.push(child); return this; }, destroy() { this.destroyed = true; },
      on(event, callback) { this.handlers[event] = callback; return this; } };
    const proxy = new Proxy(object, { get(target, name) { return name in target ? target[name] : () => proxy; } });
    return proxy;
  };
  return { containers, handlers, input: { keyboard: { on(...args) { handlers.push(args); }, off() {} } },
    events: { once() {} }, time: { now: 1000 }, scale: { width: 800, height: 600 },
    textures: { exists: () => false }, cache: { json: { get: () => undefined } },
    add: { container() { const n = node(); containers.push(n); return n; },
      text(_x, _y, value) { return node(value); }, rectangle() { return node(); }, graphics() { return node(); }, zone() { return node(); }, image() { return node(); } } };
}
const phaserStub = `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
  Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
  Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
  Input: { Keyboard: { JustDown: key => { const down = !!key?._justDown; if (key) key._justDown = false; return down; } } },
  Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)), Linear: (from, to, amount) => from + (to - from) * amount } };`;

async function productionAccessCheck() {
  let transformed = 0;
  // Execute the production conditional in an independent graph; only the compile-time SSR bit changes.
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': path.join(root, 'data') } },
    ssr: { noExternal: ['phaser'] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'smith-services-production-ui-access', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0smith-phaser'; },
      load(id) { if (id === '\0smith-phaser') return phaserStub; },
      transform(source, id) {
        if (!id.endsWith('/src/SmithServicesUiAccess.ts')) return;
        eq(source.match(/import\.meta\.env\.SSR/gu)?.length, 1, 'production graph replaces exactly the compile-time SSR condition');
        transformed++;
        return source.replace('import.meta.env.SSR', 'false');
      },
    }],
  });
  try {
    const scopes = ['entrance', 'menu', ...services];
    globalThis.__XT_SMITH_SERVICES_UI_ACCESS__ = Object.fromEntries(scopes.map(scope => [scope, false]));
    const module = await server.ssrLoadModule('/src/SmithServicesUiAccess.ts');
    const before = [localStorageWrites, indexedDbOpens, sentinelCalls, submitCalls, settlementRandomCalls];
    for (const scope of scopes) eq(module.isSmithServicesUiAccessible(scope), true, `production ${scope} UI stays accessible despite injected false`);
    eq([localStorageWrites, indexedDbOpens, sentinelCalls, submitCalls, settlementRandomCalls], before, 'production access read has no business effects');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const { SmithServices } = await server.ssrLoadModule('/src/SmithServices.ts');
    const { SmithServicesController } = await server.ssrLoadModule('/src/SmithServicesController.ts');
    for (const name of names) {
      const flag = await server.ssrLoadModule(`/src/${name}OpenFlag.ts`);
      eq(flag[`is${name}OpenForFixture`](), true, `production ${name} Gate flag is its original true value`);
    }
    const prog = sentinels(new Progress()), serviceApi = new SmithServices(prog), productionTips = [];
    await zero(prog, () => {
      eq(serviceApi.entrance().allowed, true, 'production canonical Services entrance is accessible through UiAccess');
      const menu = serviceApi.menu();
      eq(menu.allowed, true, 'production canonical Services menu is accessible through UiAccess');
      eq(menu.items?.length, 4, 'production menu retains all four service rows');
      eq(menu.items?.map(row => row.available), [true, true, true, true], 'production four frozen Gate flags remain true independently from UiAccess');
      const c = new SmithServicesController(prog, { tip: key => productionTips.push(key) });
      c.openMenu();
      eq(c.state.stage, 'menu', 'production Controller menu is not killed by old routeAvailable=false');
      for (const service of services) {
        c.openService(service);
        eq(c.state.service, service, `production ${service} Controller panel remains reachable`);
        ok(!productionTips.includes('ui.smith.closed'), `production ${service} route is not closed by old Services false default`);
      }
    }, 'production Services routes accessible while all four frozen Gate flags remain true');
    eq(transformed, 1, 'independent production access module executed once');
    productionServicesRoutesAccessible = true;
    productionIgnoresSsrInjection = true;
    record('C07', 'production-access-ignores-ssr-injection', { productionIgnoresSsrInjection: true, scopes, modifiedOnDisk: false });
  } finally { await server.close(); }
}

async function runGraph(mode, dataRoot) {
  const flagLoads = {}, prefix = `${mode}/memory-ui-closed`, tips = [];
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    ssr: { noExternal: ['phaser'] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'smith-services-only-ssr-closed', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0smith-phaser';
        const match = id.match(/(?:^|\/)(Forge|Enhance|Enchant|Salvage)OpenFlag(?:\.ts)?$/u);
        if (match) return `\0smith-flag-${match[1]}`;
      },
      load(id) {
        if (id === '\0smith-phaser') return phaserStub;
        for (const name of names) if (id === `\0smith-flag-${name}`) {
          flagLoads[name] = (flagLoads[name] ?? 0) + 1;
          return `let open = true; export function is${name}OpenForFixture() { return open; } export function __setOpen(value) { open = value; }`;
        }
      },
    }],
  });
  try {
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const { SmithServicesController } = await server.ssrLoadModule('/src/SmithServicesController.ts');
    const { SmithServices } = await server.ssrLoadModule('/src/SmithServices.ts');
    const delegatedCalls = Object.fromEntries(['choices', 'select', 'submit', 'result', 'loadRefresh', 'availability'].map(method => [method, 0]));
    for (const method of Object.keys(delegatedCalls)) {
      const original = SmithServices.prototype[method];
      ok(typeof original === 'function', `${prefix} canonical Services has ${method}`);
      SmithServices.prototype[method] = function (...args) { delegatedCalls[method]++; return original.apply(this, args); };
    }
    let selectionClearCalls = 0;
    const originalClearSelection = SmithServices.prototype.clearSelection;
    ok(typeof originalClearSelection === 'function', `${prefix} selection invalidation is observable without changing its behavior`);
    SmithServices.prototype.clearSelection = function (...args) { selectionClearCalls++; return originalClearSelection.apply(this, args); };
    const { GameScene } = await server.ssrLoadModule('/src/scenes/GameScene.ts');
    const { t } = await server.ssrLoadModule('/src/data.ts');
    for (const [key, expected] of Object.entries(design43))
      eq(t(key), expected, `${prefix} actual t(${key}) reads authoritative 1013 disk strings without injection`);
    const flags = {};
    for (const name of names) {
      flags[name] = await server.ssrLoadModule(`/src/${name}OpenFlag.ts`);
      eq(flags[name][`is${name}OpenForFixture`](), true, `${prefix} initial four Gate flags true`);
      const { [name + 'Gate']: Gate } = await server.ssrLoadModule(`/src/${name}Gate.ts`);
      const original = Gate.prototype.submit;
      Gate.prototype.submit = function (...args) { submitCalls++; return original.apply(this, args); };
    }
    const table = await json(path.join(dataRoot, 'balance/enhance.json'));
    const recipe = (await json(path.join(dataRoot, 'balance/recipes.json'))).recipes.find(row => row.type === 'forge');
    const access = value => { globalThis.__XT_SMITH_SERVICES_UI_ACCESS__ = value; };
    const allTrue = () => names.every(name => flags[name][`is${name}OpenForFixture`]());
    const make = p => new SmithServicesController(p, { tip: (key, vars) => tips.push({ key, text: t(key, vars) }) });
    const clear = () => { tips.length = 0; };
    const onlyTip = (key, label) => { ok(tips.length > 0, `${label}: tip emitted`); eq([...new Set(tips.map(row => row.key))], [key], `${label}: only ${key}`); };
    const noResult = (c, label) => {
      ok(!['confirm', 'submitting', 'result'].includes(c.state.stage), `${label}: no confirmation/submission/result`);
      eq(c.state.resultLines ?? [], [], `${label}: old success/result text cleared`);
    };
    const { p, instanceRef } = fixture(Progress, table, recipe, { enchanted: true });
    const controller = make(p), choices = [], ordinaryDialogues = [];
    let menus = 0;
    const scene = { prog: p, map: { id: 'luoxia_town', objects: [{ name: 'smith_ou', x: 20, y: 20 }] },
      player: { x: 20, y: 20, body: { setVelocityX() {} } }, senseMap: { objectVisible: () => true },
      log(text) { tips.push({ key: text === t('ui.smith.closed') ? 'ui.smith.closed' : 'unexpected-scene-tip', text }); },
      dialog: { choose(...args) { choices.push(args.find(Array.isArray)); }, show(lines) { ordinaryDialogues.push(lines); } },
      returnToSmithDialogue() { GameScene.prototype.returnToSmithDialogue.call(this); },
      smithServices: { show() { menus++; controller.openMenu(); }, isOpen: () => false },
      closeItemPanels() {}, gathering: { cancel() {} }, playerInput: { clear() {} } };
    const interact = () => GameScene.prototype.tryInteractForgeEntrance.call(scene);
    access({ entrance: false }); clear();
    await zero(p, async () => { for (let i = 0; i < 5; i++) eq(interact(), true, 'nearby smith consumes closed interaction'); }, `${prefix} C01 repeated closed dialogue`);
    onlyTip('ui.smith.closed', 'C01'); eq(choices.length, 0, 'C01 no dialogue option/menu created'); eq(menus, 0, 'C01 no menu');
    record('C01', `${prefix}/entrance-repeat`, { repetitions: 5, menuCreated: false, writes: 0 });

    access({}); clear();
    await zero(p, interact, `${prefix} C02 open dialogue only`);
    const serviceChoice = choices.at(-1)?.find(choice => choice.label === t('ui.smith.title'));
    ok(serviceChoice && typeof serviceChoice.onSelect === 'function', 'C02 real dialogue has localized smith-services choice');
    access({ menu: false });
    await zero(p, () => serviceChoice.onSelect(), `${prefix} C02 stale dialogue menu click`);
    onlyTip('ui.smith.closed', 'C02 menu-closed'); noResult(controller, 'C02');
    eq(ordinaryDialogues.length, 1, 'C02 returns to actual ordinary smith dialogue after stale menu choice');
    access({}); controller.openMenu();
    access({ menu: false }); clear();
    await zero(p, () => services.forEach(service => controller.openService(service)), `${prefix} C02 old four-menu callbacks`);
    onlyTip('ui.smith.closed', 'C02 stale four-menu');
    record('C02', `${prefix}/old-menu-callbacks`, { localizedDialogueOption: true, oldCallbacksExecuted: 5, writes: 0 });

    const variants = {
      forge: ['legal', 'missing-blueprint', 'missing-materials', 'capacity-refused'],
      enhance: ['formal-no-charm', 'formal-with-charm', 'charm-short', 'max-level'],
      enchant: ['first-enchant', 'same-element', 'overwrite', 'armor'],
      salvage: ['formal', 'unqualified', 'unknown-grade', 'capacity-refused'],
    };
    for (const [index, service] of services.entries()) {
      const id = `C${String(index + 3).padStart(2, '0')}`;
      for (const variant of variants[service]) for (const closedBy of ['ui', 'gate']) {
        const row = fixture(Progress, table, recipe, { enchanted: ['same-element', 'overwrite'].includes(variant) });
        if (variant === 'missing-blueprint') delete row.p.inventory[recipe.blueprint];
        if (variant === 'missing-materials') delete row.p.inventory[recipe.materials[0].item];
        if (variant === 'charm-short') row.p.inventory.protect_charm = 0;
        if (variant === 'max-level') row.p.enhance.instances[0].enhanceLevel = table.maxLevel;
        if (variant === 'unknown-grade') row.p.forge.crafts[0].resultGrade = 'unknown';
        if (variant === 'armor') row.p.enhance.instances[0].type = 'armor';
        if (variant === 'unqualified') row.p.equip = { weapon: recipe.output };
        if (variant === 'capacity-refused') Object.defineProperty(row.p, 'canAddCraftedItem', { value: () => false });
        clear();
        const actions = ['select', 'confirm', 'submit', 'refresh',
          ...(service === 'enhance' ? ['charm'] : service === 'enchant' ? ['element'] : [])];
        for (const action of actions) {
          access({}); flags[names[index]].__setOpen(true);
          const c = make(row.p); c.openMenu(); c.openService(service);
          if (closedBy === 'ui') access({ [service]: false });
          else flags[names[index]].__setOpen(false);
          await zero(row.p, async () => {
            if (action === 'select') c.select(service === 'forge' ? recipe.blueprint : row.instanceRef);
            if (action === 'charm') c.setProtectCharm(variant !== 'formal-no-charm');
            if (action === 'element') c.selectElement(variant === 'same-element' ? '火' : '水');
            if (action === 'confirm') c.requestConfirm();
            // Even an old confirmation containing a poisoned/partial payload must hit closure first.
            if (action === 'submit') await c.submit({ service });
            if (action === 'refresh') c.refresh();
          }, `${prefix} ${id}/${variant}/${closedBy}/${action}`);
          noResult(c, `${id}/${variant}/${closedBy}/${action}`);
        }
        ok(tips.length > 0, `${id} ${variant} ${closedBy} tip emitted`);
        if (closedBy === 'ui') onlyTip('ui.smith.closed', `${id}/${variant}/UI-only`);
        else ok(tips.every(tip => tip.key.startsWith(`${service}.closed.`)), `${id} Gate-only tips use corresponding service closed keys`);
        flags[names[index]].__setOpen(true); access({});
      }
      record(id, `${prefix}/${service}-ui-and-gate-closed`, { variants: variants[service], closedGraphs: ['ui-only', 'single-gate-only'], writes: 0 });
    }

    clear(); access({ entrance: false });
    await zero(p, () => services.forEach(service => { controller.openMenu(); controller.openService(service); controller.requestConfirm(); }), `${prefix} C07 UI closed all four Gate flags true`);
    ok(allTrue(), 'C07 UI-only closure never flips Gate flags'); onlyTip('ui.smith.closed', 'C07 UI-only');
    for (const [index, service] of services.entries()) {
      access({}); flags[names[index]].__setOpen(false); clear(); controller.openMenu();
      await zero(p, () => controller.openService(service), `${prefix} C07 single Gate false ${service}`);
      ok(tips.every(tip => tip.key.startsWith(`${service}.closed.`)), 'C07 single Gate false has own service tip');
      for (const other of services.filter(name => name !== service)) {
        controller.openMenu(); controller.openService(other);
        eq(controller.state.service, other, `C07 ${service} closure leaves ${other} independent`);
      }
      eq(names.map(name => flags[name][`is${name}OpenForFixture`]()), names.map((_, i) => i !== index), 'C07 only selected memory Flag false');
      flags[names[index]].__setOpen(true);
    }
    record('C07', `${prefix}/ui-gate-independence`, { fourGatesRemainTrueWhenUiClosed: true, singleFalseCases: 4, noLaterService: true, writes: 0 });

    for (const variant of ['no-instance', 'aggregate-item-id', 'fixture-instance', 'foreign-slot', 'stale-location']) {
      const row = fixture(Progress, table, recipe);
      if (variant === 'no-instance' || variant === 'aggregate-item-id') { row.p.enhance = undefined; row.p.forge = undefined; }
      if (variant === 'fixture-instance') delete row.p.enhance.formalSources;
      if (variant === 'foreign-slot') row.p.enhance.formalSources[0].ownerSlot = 2;
      if (variant === 'stale-location') { row.p.inventory[recipe.output] = 0; row.p.equip = {}; }
      const c = make(row.p); access({}); c.openMenu(); c.openService('enhance'); access({ entrance: false, enhance: false }); clear();
      await zero(row.p, async () => { c.select(variant === 'aggregate-item-id' ? recipe.output : row.instanceRef); c.requestConfirm(); await c.submit(); }, `${prefix} C08 ${variant}`);
      onlyTip('ui.smith.closed', `C08 ${variant}`); noResult(c, `C08 ${variant}`);
    }
    record('C08', `${prefix}/identity-impersonation`, { variants: ['no-instance', 'aggregate-item-id', 'fixture-instance', 'foreign-slot', 'stale-location'], closedBeforeIdentity: true, writes: 0 });

    const pendingRows = [];
    for (const service of ['forge', 'enhance', 'enchant']) {
      access({}); const c = make(p); c.openMenu(); c.openService(service);
      ok(c.state.candidates.length > 0, `C09 ${service} real formal candidate exists before closure`);
      c.select(c.state.candidates[0].id);
      if (service === 'enchant') c.selectElement('水');
      const pending = c.requestConfirm();
      ok(pending, `C09 ${service} valid read-only confirmation exists`);
      pendingRows.push({ c, pending, service });
    }
    access({ menu: false }); clear();
    await zero(p, () => Promise.all(pendingRows.flatMap(({ c, pending }) => Array.from({ length: 8 }, () => c.submit(pending)))), `${prefix} C09 same-request and cross-service concurrent old confirms`);
    pendingRows.forEach(({ c }) => noResult(c, 'C09 concurrent closure'));
    access({}); const stale = make(p); stale.openMenu(); stale.openService('enhance');
    stale.select(stale.state.candidates[0].id); const oldPending = stale.requestConfirm(); ok(oldPending, 'C09 active-slot old confirm exists');
    Progress.setActiveSlot(2); clear();
    await zero(p, () => Promise.all([stale.submit(oldPending), stale.submit(oldPending)]), `${prefix} C09 slot-switch stale confirm`);
    noResult(stale, 'C09 slot switch');
    const menusBefore = menus;
    await zero(p, () => serviceChoice.onSelect(), `${prefix} C09 old dialogue callback after slot switch`);
    eq(menus, menusBefore, 'C09 old dialogue cannot open new-slot menu');
    Progress.setActiveSlot(1);
    // A freshly loaded character in the same slot must invalidate a real old confirmation too.
    let current = p;
    access({});
    const replaced = new SmithServicesController(p, { tip: (key, vars) => tips.push({ key, text: t(key, vars) }), currentProgress: () => current });
    replaced.openMenu(); replaced.openService('forge'); replaced.select(replaced.state.candidates[0].id);
    const replacedPending = replaced.requestConfirm(); ok(replacedPending, 'C09 pre-load same-slot confirm exists');
    const newCharacter = fixture(Progress, table, recipe).p; current = newCharacter;
    await zero([p, newCharacter], () => replaced.submit(replacedPending), `${prefix} C09 replaced progress object same-slot stale callback`);
    noResult(replaced, 'C09 replaced Progress object');
    record('C09', `${prefix}/concurrency-stale-session`, { simultaneousOldConfirms: 24, sameRequestReused: true, crossServiceResourceCompetition: true, actualSlotSwitch: true, writes: 0 });

    // Exercise the actual lightweight renderer and its captured pointer/keyboard callbacks.
    const { SmithServicesPanel } = await server.ssrLoadModule('/src/SmithServicesPanel.ts');
    const renderScene = mockScene();
    const panel = new SmithServicesPanel(renderScene, p, { tip: (key, vars) => tips.push({ key, text: t(key, vars) }), currentProgress: () => p });
    const press = key => panel.onKey({ key, repeat: false, preventDefault() {} });
    access({}); clear();
    await zero(p, () => { panel.show(); renderScene.time.now += 200; press('Enter'); }, `${prefix} renderer Enter default menu action`);
    eq(panel.controller.state.stage, 'closed', 'renderer initial Enter activates Back and cannot submit');
    panel.show();
    eq(panel.actions.slice(1).map(action => action.label), services.map(service => t(`ui.smith.${service}`)), 'renderer displays four localized services in design order');
    const oldMenuAction = panel.actions.find(action => action.label === t('ui.smith.forge'));
    access({ menu: false }); clear();
    await zero(p, () => oldMenuAction.run(), `${prefix} renderer old pointer menu action after closure`);
    onlyTip('ui.smith.closed', 'renderer old menu'); noResult(panel.controller, 'renderer old menu');
    access({}); panel.show(); panel.controller.openService('enhance');
    eq(panel.controller.state.useProtectCharm, false, 'renderer enhancement charm defaults to false');
    panel.controller.select(panel.controller.state.candidates[0].id); panel.controller.requestConfirm();
    eq(panel.controller.state.stage, 'confirm', 'renderer real readonly enhance confirmation opened');
    eq(panel.focus, 0, 'renderer confirmation focus starts on Back');
    renderScene.time.now += 200;
    await zero(p, () => press('Enter'), `${prefix} renderer Enter on confirmation defaults to Back`);
    eq(panel.controller.state.stage, 'panel', 'renderer Enter cannot auto-submit confirmation');
    await zero(p, () => press('Escape'), `${prefix} renderer Esc before submit`);
    eq(panel.controller.state.stage, 'menu', 'renderer Esc returns one level without charging');
    const oldPanelAction = panel.actions.find(action => action.label === t('ui.smith.enhance'));
    access({ enhance: false }); clear();
    await zero(p, () => oldPanelAction.run(), `${prefix} renderer stale single-service pointer callback`);
    onlyTip('ui.smith.closed', 'renderer closed enhance'); noResult(panel.controller, 'renderer closed enhance');
    access({}); panel.show(); panel.controller.openService('salvage');
    panel.controller.select(panel.controller.state.candidates[0].id); clear();
    const salvagePending = await zero(p, () => panel.controller.requestConfirm(), `${prefix} renderer salvage missing formal capability`);
    eq(salvagePending, null, 'formal salvage dependencies refuse without installing fixture carrier/qualification');
    ok(tips.length > 0 && !tips.some(tip => /^ui\.smith\.result_salvage$/u.test(tip.key)), 'blocked salvage has refusal and no destruction result');
    panel.close();
    record('C02', `${prefix}/actual-renderer-menu-old-pointer`, { actualRenderer: true, oldPointerCallbackExecuted: true, localizedFourServiceOrder: true, writes: 0 });
    record('C04', `${prefix}/actual-renderer-keyboard-safety`, { actualRenderer: true, enterNeverDefaultSubmit: true, escapeReturnsWithoutCost: true, protectCharmDefault: false, writes: 0 });
    record('C06', `${prefix}/formal-salvage-dependency-refusal`, { noFixtureFallback: true, pendingCreated: false, writes: 0 });

    for (const damaged of [false, true]) {
      const saved = JSON.parse(JSON.stringify(p.exportSave()));
      const restored = sentinels(Progress.restore(saved, false));
      if (damaged) restored.forge = { version: 1, ledgerId: 'half', crafts: [{ state: 'committed' }], receipts: [] };
      const c = make(restored); access({ entrance: false }); clear();
      await zero(restored, async () => { for (let n = 0; n < 3; n++) { c.openMenu(); c.refresh(); c.close(); c.openMenu(); await c.submit(); } }, `${prefix} C10 ${damaged ? 'damaged' : 'complete'} old record actual restore`);
      onlyTip('ui.smith.closed', `C10 ${damaged ? 'damaged' : 'complete'}`); noResult(c, 'C10 restore');
    }
    record('C10', `${prefix}/closed-restore-refresh`, { realRestoreWithoutPersistence: true, completeOldResult: true, damagedOldRecord: true, cyclesEach: 3, noAutomaticRetryOrRepair: true, writes: 0 });

    // Controlled adapter replies exercise dispatch and uncertainty without a real Gate submit.
    // A fixed unresolved intent may be inspected by result(), never retried or replaced.
    access({}); clear();
    const uncertaintyVariants = ['throws', 'unknown', 'stale'];
    for (const uncertainty of uncertaintyVariants) {
      const delegationProbe = make(p);
      await zero(p, () => {
        delegationProbe.openMenu(); delegationProbe.openService('forge');
        ok(delegationProbe.state.candidates.length > 0, `${prefix}/${uncertainty} probe consumes canonical recipe choices`);
        delegationProbe.select(delegationProbe.state.candidates[0].id);
        delegationProbe.refresh();
        delegationProbe.select(delegationProbe.state.candidates[0].id);
      }, `${prefix}/${uncertainty} canonical choices/select/loadRefresh delegate read-only`);
      const delegatedPending = await zero(p, () => delegationProbe.requestConfirm(), `${prefix}/${uncertainty} canonical selection confirmation remains read-only`);
      ok(delegatedPending, `${prefix}/${uncertainty} canonical select allows a read-only confirmation for dispatch probe`);
      const invalidationsBeforePoll = selectionClearCalls;
      await zero(p, () => { for (let n = 0; n < 5; n++) eq(delegationProbe.poll(), true, `${prefix}/${uncertainty} open confirmation poll remains available`); },
        `${prefix}/${uncertainty} real frame polling preserves canonical confirmation`);
      eq(selectionClearCalls, invalidationsBeforePoll, `${prefix}/${uncertainty} poll never clears Services confirmed selection or epoch`);
      eq(delegationProbe.pending, delegatedPending, `${prefix}/${uncertainty} poll retains the exact confirmed intent`);
      eq(delegationProbe.state.stage, 'confirm', `${prefix}/${uncertainty} poll retains confirmation view`);
      const originalSubmit = SmithServices.prototype.submit;
      const dispatchCallsBefore = delegatedCalls.submit;
      SmithServices.prototype.submit = async function () {
        delegatedCalls.submit++;
        if (uncertainty === 'throws') throw new Error('read-only Services dispatch probe');
        return { allowed: false, status: uncertainty, route: 'panel', service: 'forge', tipKey: 'ui.smith.result_unknown' };
      };
      try {
        await zero(p, () => delegationProbe.submit(delegatedPending), `${prefix}/${uncertainty} Controller delegates submit to controlled adapter reply`);
        eq(delegatedCalls.submit, dispatchCallsBefore + 1, `${prefix}/${uncertainty} Controller dispatches the confirmed request exactly once`);
        await zero(p, async () => {
          eq(delegationProbe.requestConfirm(), null, `${prefix}/${uncertainty} unresolved state blocks a new confirmation`);
          await delegationProbe.submit(delegatedPending);
          await delegationProbe.submit();
        }, `${prefix}/${uncertainty} unresolved state prevents duplicate and replacement dispatch`);
        eq(delegatedCalls.submit, dispatchCallsBefore + 1, `${prefix}/${uncertainty} no automatic or repeated submission after uncertainty`);
      } finally { SmithServices.prototype.submit = originalSubmit; }
      const resultCallsBefore = delegatedCalls.result;
      await zero(p, () => delegationProbe.refresh(), `${prefix}/${uncertainty} unresolved refresh delegates result without retry`);
      eq(delegatedCalls.result, resultCallsBefore + 1, `${prefix}/${uncertainty} refresh reads the exact unresolved intent through Services.result`);
      noResult(delegationProbe, `${prefix}/${uncertainty} controlled adapter uncertainty never displays success`);
    }
    for (const [method, count] of Object.entries(delegatedCalls)) ok(count > 0, `${prefix} Controller actually invoked SmithServices.${method}`);
    smithServicesDelegation.push({ mode, calls: delegatedCalls, submitProbe: 'async adapter throws/unknown/stale before Gate submit',
      noDirectControllerGate: true, resultAfterUnresolvedRefresh: true, confirmationSurvivesFiveRealPolls: true,
      uncertaintyVariants, uncertaintyNeverRetries: true, actualSettlementExecuted: false, writes: 0 });
    record('C09', `${prefix}/canonical-confirmation-poll-and-uncertainty`, { realPollsPerVariant: 5, uncertaintyVariants, noDuplicateOrReplacementDispatch: true, writes: 0 });
    record('C10', `${prefix}/canonical-services-delegation`, { methods: Object.keys(delegatedCalls), zeroWriteAsyncDispatchProbe: true, writes: 0 });

    access({});
    const { EquipPanel } = await server.ssrLoadModule('/src/EquipPanel.ts');
    const { InventoryPanel } = await server.ssrLoadModule('/src/InventoryPanel.ts');
    const e = new EquipPanel(mockScene(), p, () => { throw new Error('C11 E unexpected wear callback'); });
    const i = new InventoryPanel(mockScene(), p, { onChanged() { throw new Error('C11 I unexpected wear callback'); }, openAlchemy: () => false, openSectToken: () => false });
    await zero(p, () => { e.open(); i.open(); }, `${prefix} C11 open actual E/I`);
    const eBefore = e.snapshot(), iBefore = i.snapshot();
    clear(); access({ entrance: false });
    await zero(p, () => { controller.openMenu(); services.forEach(service => controller.openService(service)); controller.refresh(); e.update(); i.update(); }, `${prefix} C11 E/I independent from smith UI closure`);
    eq(e.snapshot(), eBefore, 'C11 E readonly display preserved'); eq(i.snapshot(), iBefore, 'C11 I readonly display preserved');
    ok(!tips.some(tip => /later_service|^ui\.equip\.inst\.|^attr\./u.test(tip.key)), 'C11 no historical later_service/attr-ui status used as service result');
    ok(tips.every(tip => tip.text && !/\{\w+\}|NaN|undefined|null/u.test(tip.text)), 'C11 localized closed tips have no placeholders or technical nulls');
    eq([localStorageWrites, indexedDbOpens, sentinelCalls, submitCalls, settlementRandomCalls], [0, 0, 0, 0, 0], 'C11 all graphs no business write/submit/random');
    record('C11', `${prefix}/full-state-ei-isolation`, { perActionFullExportSaveAndPublicFieldsCompared: true, equipPanelPreserved: true, inventoryPanelPreserved: true, historicalCOTablesModified: false, writes: 0 });
    rows.push({ suite: 'real-ssr-graph', mode, passed: true, stringsDiskKeys: 1013, stringsSha, stringsSsrInjected43: false,
      fourInitialGateFlags: true, flagLoads, fullStateDelta: 0, submitCalls: 0 });
  } finally { await server.close(); }
}

const descriptors = Object.fromEntries(['localStorage', 'indexedDB', '__XT_SMITH_SERVICES_UI_ACCESS__'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: () => null, setItem() { localStorageWrites++; throw new Error('closed UI localStorage write'); },
  removeItem() { localStorageWrites++; throw new Error('closed UI localStorage removal'); }, clear() { localStorageWrites++; throw new Error('closed UI localStorage clear'); },
} });
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() { indexedDbOpens++; throw new Error('closed UI indexedDB.open'); } } });
await fs.mkdir(out, { recursive: true });
try {
  await staticChecks();
  await productionAccessCheck();
  for (const [mode, dataRoot] of [['snapshot', path.join(root, 'data')], ['shared', shared]]) await runGraph(mode, dataRoot);
  ok(Object.values(cases).every(row => row.executed && row.passed), 'C01–C11 each has actual operation evidence');
  passed = true;
} finally {
  for (const [file, expected] of Object.entries(protectedFiles)) eq(hash(await fs.readFile(file)), expected, `after-run frozen SHA MATCH: ${file}`);
  const evidence = { passed, assertions, baselineTip: baseline, smithServicesUiWired: passed, newOpenFlag: false,
    enhanceSha, stringsDiskKeys: 1013, stringsSha, stringsSsrInjected43: false, stringsInjectionSource: 'none; Vite resolves authoritative disk JSON',
    stringsSsrKeys: 1013, stringsDesign43Match: true, strings970PrefixBytesMatch: true, sharedStringsDiskKeys,
    sharedStringsOwnership: 'worktree disk exactly MATCH authoritative shared strings1013', smithServicesDelegation,
    softOpenedSmithServicesUi: false, released: false, flagShas,
    productionIgnoresSsrInjection, productionServicesRoutesAccessible,
    fourFlagMatch: Object.fromEntries(names.map(name => [name, 'MATCH'])), settlementUnchanged: true,
    localStorageWrites, indexedDbOpens, sentinelCalls, submitCalls, settlementRandomCalls, fullBusinessStateDelta: 0,
    eiReadonlyIsolated: cases.C11.passed, openFixtureTableExecuted: false, historicalCOTablesModified: false,
    semanticSsrSelfTest: true, managerEnforcementC01ToC11Pending: true, cases, protectedFiles, evidence: rows };
  await fs.writeFile(path.join(out, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
}
console.log(`v06p1 smith services closed PASS: C01–C11; ${assertions} assertions; stringsDiskKeys:1013; stringsSsrInjected43:false; SmithServicesDelegation:true; four Flag MATCH; settlementUnchanged:true; softOpenedSmithServicesUi:false; released:false`);
