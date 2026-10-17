// 正式炼器恒开；只有独立 Vite SSR 关态图可将 ForgeOpenFlag 内存注入 false。
import enhance from '@xt/balance/enhance.json';
import recipes from '@xt/balance/recipes.json';
import { GAME_PHASE, ITEMS, t } from './data';
import { featureEnabled, featureFlags } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, saveStore, setSaveBackend } from './SaveStore';
import * as Closed from './ForgeClosed';
import { ForgeGate } from './ForgeGate';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import { isValidForgeProgress } from './ForgeProgress';
import { GameScene } from './scenes/GameScene';

type Payload = { state: string; save: Record<string, unknown>; craftRequestId: string };
type GateResult = Awaited<ReturnType<ForgeGate['submit']>>;
/** 只替换存储介质：真实 IDB 后端仍须等待 transaction.complete 才能发布进度。 */
function memoryIndexedDb() {
  const rows = new Map<IDBValidKey, unknown>(), stores = new Map<string, string>();
  let writes = 0, commits = 0, abortNext = false;
  type Hold = { started: () => void; released: Promise<void> };
  let nextHold: Hold | undefined;
  const factory = {
    open() {
      const request: any = { result: undefined, onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => {
        request.result = {
          objectStoreNames: { contains: (name: string) => stores.has(name) },
          createObjectStore(name: string, options: IDBObjectStoreParameters) { stores.set(name, String(options.keyPath)); },
          close() {},
          transaction(storeName: string, mode: IDBTransactionMode = 'readonly') {
            const staged = new Map(rows);
            let pending = 0, finished = false, held = false;
            const tx: any = { error: null, oncomplete: null, onerror: null, onabort: null,
              abort() { if (finished) return; finished = true; tx.error = new DOMException('夹具中止提交', 'AbortError'); tx.onabort?.(); },
              objectStore() {
                const operation = (apply: () => unknown, write = false) => {
                  pending++; if (write) writes++;
                  const req: any = { result: undefined, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    if (finished) return;
                    try { req.result = apply(); req.onsuccess?.(); }
                    catch (error) { tx.error = error; tx.onerror?.(); tx.abort(); return; }
                    pending--; scheduleComplete();
                  }, 0);
                  return req;
                };
                return { transaction: tx,
                  get: (key: IDBValidKey) => operation(() => structuredClone(staged.get(key))),
                  put: (value: Record<string, IDBValidKey>) => operation(() => {
                    const key = value[stores.get(storeName)!]; staged.set(key, structuredClone(value)); return key;
                  }, true),
                  add: (value: Record<string, IDBValidKey>) => operation(() => {
                    const key = value[stores.get(storeName)!];
                    if (staged.has(key)) throw new Error('夹具主键已存在');
                    staged.set(key, structuredClone(value)); return key;
                  }, true),
                  delete: (key: IDBValidKey) => operation(() => staged.delete(key), true),
                };
              },
            };
            const commit = () => {
              if (finished) return;
              if (mode === 'readwrite' && abortNext) { abortNext = false; tx.abort(); return; }
              if (mode === 'readwrite') {
                rows.clear(); for (const [key, value] of staged) rows.set(key, value); commits++;
              }
              finished = true; tx.oncomplete?.();
            };
            const scheduleComplete = () => setTimeout(() => {
              if (finished || pending || held) return;
              if (mode === 'readwrite' && nextHold) {
                const hold = nextHold; nextHold = undefined; held = true;
                hold.started(); void hold.released.then(commit); return;
              }
              commit();
            }, 0);
            scheduleComplete(); return tx;
          },
        };
        if (!stores.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
  return { factory, rows, get writes() { return writes; }, get commits() { return commits; },
    abortNextCommit() { abortNext = true; },
    holdNextCommit() {
      let announce!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => { announce = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      nextHold = { started: announce, released };
      return { started, release };
    },
  };
}

export async function runForgeOpenFixtureTests(options: {
  openFixture: boolean; dataMode?: string; refreshPayloads?: Payload[] | null;
}) {
  const { openFixture, dataMode = 'fixture', refreshPayloads } = options;
  const label = `${dataMode}/${openFixture ? 'formal-open' : 'memory-closed'}`;
  let assertions = 0, sampleCount = 0, ledgerSeq = 0;
  let sampled = 0.1;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const copy = <T>(value: T): T => structuredClone(value);
  const flags = copy(featureFlags()), tableBefore = JSON.stringify(enhance), recipesBefore = JSON.stringify(recipes);
  const recipe = { blueprintId: 'scroll_ten_thousand_swords', blueprintCount: 1,
    materials: [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'refine_stone', count: 1 }],
    resultItemId: 'bamboo_sword' };
  const request = (craftRequestId = 'craft-one') => ({ craftRequestId, blueprintId: recipe.blueprintId,
    materials: copy(recipe.materials) });
  const fixtureOptions = () => ({ fixtureRecipes: [copy(recipe)],
    random: () => { sampleCount++; return sampled; }, ledgerId: () => `${dataMode}-forge-${++ledgerSeq}` });
  eq(isForgeOpenForFixture(), openFixture, '旗标来自当前独立SSR图');
  eq(enhance.forge.grade, { common: 0.6, fine: 0.3, spirit: 0.09, treasure: 0.01 }, '品质只读既有enhance.forge.grade');
  eq(GAME_PHASE, 5, 'GAME_PHASE保持5');
  eq(featureEnabled('indexedDbSaves'), true, '使用真实异步保存事务');
  ok(!Object.keys(flags).some(key => /forge|forging/iu.test(key)), '不增加配表炼器开放开关');
  for (const itemId of [recipe.blueprintId, ...recipe.materials.map(row => row.itemId), recipe.resultItemId])
    ok(ITEMS[itemId], `夹具只授权真实物品id：${itemId}`);
  const oldSlot = Progress.getActiveSlot(), storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const idb = memoryIndexedDb(), progresses: Progress[] = [], payloads: Payload[] = [];
  let localWrites = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => { localWrites++; },
  } });
  setSaveBackend(createIndexedDbBackend(idb.factory));
  Progress.setActiveSlot(1);
  function fixture() {
    const p = new Progress(); progresses.push(p);
    p.stones = 1234;
    p.inventory = { scroll_ten_thousand_swords: 4, spirit_copper: 4, refine_stone: 4, bamboo_sword: 2, rabbit_fur: 7 };
    return { p, gate: new ForgeGate(p, fixtureOptions()) };
  }
  const experience = (p: Progress) => [p.forgingLevel, p.forgingExp];
  function businessDenied(result: GateResult, message: string) {
    eq(result.allowed, false, message);
    ok('tipKey' in result && result.tipKey.startsWith('forge.fixture.'), `${message}：明确业务拒绝`);
  }
  function committed(result: GateResult) {
    ok(result.allowed && result.result, '成功返回完整成品结果');
    return result.result;
  }
  async function unchanged(p: Progress, action: () => GateResult | Promise<GateResult>, message: string) {
    const before = p.exportSave(), writes = idb.writes, exp = experience(p);
    businessDenied(await action(), message);
    eq(p.exportSave(), before, `${message}：整档无变化`);
    eq(experience(p), exp, `${message}：forging经验等级无变化`);
    eq(idb.writes, writes, `${message}：持久写零次`);
  }
  async function replay(p: Progress, gate: ForgeGate, input: ReturnType<typeof request>, message: string) {
    const before = p.exportSave(), writes = idb.writes, samples = sampleCount;
    const first = await gate.submit(copy(input));
    if (first.allowed) {
      ok(first.result, `${message}：重放只返回已提交结果`);
      eq(first.result, p.forge!.crafts.find(row => row.craftRequestId === input.craftRequestId), `${message}：返回既有结果`);
    } else businessDenied(first, `${message}：明确拒绝重复请求`);
    eq(p.exportSave(), before, `${message}：库存品质去重不变`);
    eq(idb.writes, writes, `${message}：重放零写`);
    eq(sampleCount, samples, `${message}：重放不重抽品质`);
  }
  async function memoryClosed(p: Progress, message: string) {
    const fail = () => { throw new Error('内存关态禁止查询资格、事务、随机或夹具映射'); };
    const opts = fixtureOptions();
    Object.defineProperty(opts, 'fixtureRecipes', { configurable: true, get: fail });
    Object.defineProperty(opts, 'formalRecipes', { configurable: true, get: fail });
    const gate = new ForgeGate(p, { ...fixtureOptions(), random: fail, ledgerId: fail, canReceiveResult: fail });
    // 不求值输入本身；即使请求带旧字段也必须由旗标直接回原八tip。
    const hostile = new Proxy({}, { get: fail }) as ReturnType<typeof request>;
    const protectedMethods = ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
      'addItem', 'removeItem', 'addCraftedItem', 'canAddCraftedItem', 'count', 'permanentCount', 'lifeSkillState'];
    const descriptors = protectedMethods.map(name => [name, Object.getOwnPropertyDescriptor(p, name)] as const);
    const before = p.exportSave(), writes = idb.writes, rows = copy([...idb.rows]);
    for (const method of protectedMethods) Object.defineProperty(p, method, { configurable: true, value: fail });
    const operations: [() => unknown | Promise<unknown>, () => unknown][] = [
      [() => gate.feature(), Closed.featureClosed], [() => gate.entrance(), Closed.refuseEntrance],
      [() => gate.craft(hostile), Closed.refuseCraft], [() => gate.submit(hostile), Closed.refuseSubmit],
      [() => gate.result('old-request'), Closed.refuseResult], [() => gate.grade('old-request'), Closed.refuseGrade],
      [() => gate.loadRefresh(), Closed.refuseLoadRefresh], [() => gate.laterService(), Closed.refuseLaterService],
    ];
    try {
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [action, expected] of operations) eq(await action(), expected(), `${message}：八tip原样返回`);
        const results = await Promise.all(operations.map(async ([action]) => action()));
        results.forEach((result, index) => eq(result, operations[index][1](), `${message}：并发八tip原样返回`));
        eq(p.exportSave(), before, `${message}：库存品质经验历史袋零增量`);
        eq(idb.writes, writes, `${message}：存储写零次`);
        eq([...idb.rows], rows, `${message}：持久旧档原样保留`);
      }
    } finally {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(p, name, descriptor); else Reflect.deleteProperty(p, name);
      }
    }
    // 另一个Gate连映射Getter也不许读；构造不读资格，入口先查旗。
    const guarded = new ForgeGate(p, opts);
    eq(guarded.feature(), Closed.featureClosed(), `${message}：夹具映射Getter未查询`);
    eq(await guarded.submit(hostile), Closed.refuseSubmit(), `${message}：提交不查询映射Getter`);
  }
  async function roundtrip(payload: Payload) {
    const { p } = fixture();
    eq(await p.importSave(copy(payload.save), { async: true }), true, `${payload.state}：真实importSave通过`);
    eq(p.forge, payload.save.forge, `${payload.state}：import保留成品品质去重`);
    eq(p.inventory, payload.save.inventory, `${payload.state}：import保留完整消耗与库存`);
    eq(experience(p), [payload.save.forgingLevel, payload.save.forgingExp], `${payload.state}：import保留经验等级`);
    const restored = (Progress as any).restore(copy(payload.save), false) as Progress; progresses.push(restored);
    eq(restored.forge, payload.save.forge, `${payload.state}：真实restore保留完整炼器袋`);
    eq(restored.inventory, payload.save.inventory, `${payload.state}：restore库存一致`);
    const loaded = await Progress.load({ async: true, slot: 1 }); progresses.push(loaded);
    eq(loaded.forge, payload.save.forge, `${payload.state}：真实IDB读档保留完整炼器袋`);
    eq(loaded.inventory, payload.save.inventory, `${payload.state}：真实IDB读档库存一致`);
    eq(experience(loaded), experience(p), `${payload.state}：读档经验等级一致`);
    if (!openFixture) { await memoryClosed(loaded, `${payload.state}/内存关态历史袋`); return; }
    const gate = new ForgeGate(loaded, fixtureOptions());
    const before = loaded.exportSave(), writes = idb.writes, samples = sampleCount;
    ok(gate.loadRefresh().allowed, `${payload.state}：只读刷新可查看`);
    const record = committed(gate.result(payload.craftRequestId));
    eq(record, loaded.forge!.crafts[0], `${payload.state}：结果只读且引用品质一致`);
    ok(gate.grade(payload.craftRequestId).allowed, `${payload.state}：可查看已定品质`);
    eq(loaded.exportSave(), before, `${payload.state}：读回不推进状态`);
    eq(idb.writes, writes, `${payload.state}：只读入口无写`);
    eq(sampleCount, samples, `${payload.state}：读回不重抽品质`);
    await replay(loaded, gate, request(payload.craftRequestId), `${payload.state}/读回同请求`);
  }
  function sceneSmoke() {
    const { p } = fixture();
    const logs: { text: string; color: string }[] = [], dialogs: any[] = [];
    const before = p.exportSave(), writes = idb.writes;
    let menuShows = 0;
    const entrance = { name: 'smith_ou', type: 'npc', props: { npc: 'smith_ou' }, x: 100, y: 200 };
    const scene: any = Object.assign(Object.create(GameScene.prototype), {
      prog: p, map: { id: 'luoxia_town', objects: [] }, player: { x: 100, y: 200 },
      log: (text: string, color: string) => logs.push({ text, color }),
      closeItemPanels() {},
      dialog: { choose: (line: unknown, portrait: unknown, choices: any[]) => dialogs.push({ line, portrait, choices }) },
      smithServices: { show: () => { menuShows++; } },
      encounterRuntime: { interact() { throw new Error('欧冶匠入口须先于遭遇与 NPC 交互'); } },
    });
    eq(typeof scene.tryInteractForgeEntrance, 'function', '真实欧冶匠入口存在');
    eq(scene.tryInteractForgeEntrance(), false, '没有对象时安静 no-op');
    scene.map.objects = [{ ...entrance, name: 'npc_shop', props: { npc: 'npc_shop' } }];
    eq(scene.tryInteractForgeEntrance(), false, '普通商店不消费炼器入口');
    scene.map.objects = [entrance];
    for (const offset of [-29, 29]) {
      scene.player.x = entrance.x + offset;
      eq(scene.tryInteractForgeEntrance(), false, '横向超距不交互: ' + offset);
    }
    scene.player.x = entrance.x;
    for (const offset of [-41, 41]) {
      scene.player.y = entrance.y + offset;
      eq(scene.tryInteractForgeEntrance(), false, '纵向超距不交互: ' + offset);
    }
    scene.player.y = entrance.y; scene.senseMap = { objectVisible: () => false };
    eq(scene.tryInteractForgeEntrance(), false, '隐藏欧冶匠不交互');
    eq([logs.length, dialogs.length], [0, 0], '无对象/商店/超距/隐藏均无提示或菜单');
    scene.senseMap = undefined;
    for (const object of [{ ...entrance, props: {} }, { ...entrance, name: 'smith-route-alias' }]) {
      scene.map.objects = [object];
      eq(scene.tryInteractForgeEntrance(), true, object.name + ' 邻近欧冶匠消费交互');
      const choices = dialogs[dialogs.length - 1].choices;
      eq(choices[0].label, t('ui.smith.title'), '正式对话含炼器服务选项');
      const previous = menuShows; choices[0].onSelect();
      eq(menuShows, previous + 1, '选服务入口才进入四服务菜单');
    }
    scene.map.objects = [entrance];
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      scene.player.x = entrance.x + 28 * x; scene.player.y = entrance.y + 40 * y;
      eq(scene.tryInteractForgeEntrance(), true, '28×40 四角边界内消费交互');
    }
    scene.player.x = entrance.x; scene.player.y = entrance.y;
    eq(scene.tryInteract(), true, '通用交互先消费欧冶匠入口');
    eq(logs, [], '对话路由不连刷四 Gate 冒烟提示');
    eq(p.exportSave(), before, '入口/对话/菜单不修改角色或四服务业务袋');
    eq(idb.writes, writes, '入口/菜单存档写入为零');
    return { noObjectNoop: true, nonSmithIgnored: true, nearbyOnly: true, hiddenIgnored: true,
      genericInteraction: true, smithServicesUiWired: true, menuRouted: menuShows === 2,
      consumedInteraction: true, graph: openFixture ? 'formal-open' : 'memory-closed', saveWrites: idb.writes - writes };
  }
  async function formalGateTests() {
    const formalRows = recipes.recipes.filter(row => 'type' in row && row.type === 'forge');
    eq(formalRows.length, 1, '正式表forge恰一条');
    const formal = copy(formalRows[0]) as Record<string, any>;
    eq(formal, { id: 'recipe_forge_bamboo_sword', name: '青竹剑', type: 'forge',
      blueprint: recipe.blueprintId, materials: recipe.materials.map(({ itemId, count }) => ({ item: itemId, count })),
      output: recipe.resultItemId, outputCount: 1 }, '正式行严格对应design25');
    const { p } = fixture(), gate = new ForgeGate(p);
    ok(gate.feature().allowed, '正式默认Gate说明只读允许');
    ok(gate.entrance().allowed, '正式默认Gate入口只读允许');
    ok(await p.saveAsync(), '正式准备档先落盘，提交核对全量存档事实');
    const before = p.exportSave(), writes = idb.writes, exp = experience(p);
    ok(gate.craft(request('formal-default')).allowed, '默认无fixtureRecipes可解析正式图纸材料');
    eq(p.exportSave(), before, '正式craft只读不预扣或建单');
    eq(idb.writes, writes, '正式craft零写');
    const result = committed(await gate.submit(request('formal-default')));
    eq(result.blueprintId, formal.blueprint, '正式blueprint映射');
    eq(result.blueprintCount, 1, '正式图纸缺省消耗1');
    eq(result.materials, recipe.materials, '正式materials.item映射itemId');
    eq(result.resultItem.itemId, formal.output, '正式output映射resultItemId');
    eq(result.resultItem.count, formal.outputCount, '正式result count读取outputCount');
    eq(p.count(formal.output), 2 + formal.outputCount, '正式成品按表数量入库');
    eq(p.count(formal.blueprint), 3, '正式图纸消耗一份');
    for (const material of recipe.materials) eq(p.count(material.itemId), 3, '正式材料逐项扣除');
    ok(Object.keys(enhance.forge.grade).includes(result.resultGrade), '默认品质来自enhance.forge.grade枚举');
    eq(p.forge!.receipts, [result.craftResultRef], '正式原子提交唯一收据');
    eq(idb.writes, writes + 1, '正式完整结果仅一笔保存');
    eq(experience(p), exp, '正式提交forging经验等级零变化');
    eq((await saveStore.readSlot(1))!.data.forge, p.exportSave().forge, '正式结果真实IDB一致');
    await replay(p, gate, request('formal-default'), '正式默认同请求重放');
    for (const [grade, random] of [['common', 0.1], ['fine', 0.75], ['spirit', 0.95], ['treasure', 0.995]] as const) {
      const f = fixture(), expBefore = experience(f.p);
      ok(await f.p.saveAsync(), '正式品质准备档先落盘');
      const formalGate = new ForgeGate(f.p, { random: () => random });
      const record = committed(await formalGate.submit(request(`formal-${grade}`)));
      eq(record.resultGrade, grade, '正式路径四品质仅按enhance.forge.grade抽样');
      eq(experience(f.p), expBefore, '正式四品质均不写经验等级');
    }
    eq(gate.laterService(), Closed.refuseLaterService(), '正式默认Gate后续强化附灵分解仍关');

    async function rejectsRows(rows: readonly unknown[], message: string) {
      const f = fixture(), samples = sampleCount;
      const rejected = new ForgeGate(f.p, { formalRecipes: rows, random: () => { sampleCount++; return 0.1; } });
      for (const method of ['craft', 'submit'] as const) await unchanged(f.p, async () => {
        const rejectedResult = await rejected[method](request(`formal-invalid-${method}`));
        eq('tipKey' in rejectedResult ? rejectedResult.tipKey : null, 'forge.fixture.recipe', `${message}：明确拒recipe`);
        return rejectedResult;
      }, `${message}/${method}`);
      eq(sampleCount, samples, `${message}：无抽样`);
      eq(f.p.forge, undefined, `${message}：无请求或袋`);
    }
    await rejectsRows([], '正式空集不得回退fixture');
    await rejectsRows(recipes.recipes.filter(row => !('type' in row) || row.type !== 'forge'), '丹方制符研墨不可消费');
    await rejectsRows([{ ...formal, blueprint: 'secret_art_fragment' }], '正式无匹配不得回退fixture');
    const missingFields = ['id', 'name', 'type', 'blueprint', 'materials', 'output', 'outputCount'];
    for (const field of missingFields) {
      const bad = copy(formal); delete bad[field];
      await rejectsRows([bad], `正式缺字段${field}`);
    }
    for (const type of ['talisman', 'grinding', 'pill', '', null])
      await rejectsRows([{ ...formal, type }], `正式类型${type}不得打造`);
    for (const outputCount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined, NaN, Infinity])
      await rejectsRows([{ ...formal, outputCount }], `正式非法outputCount=${outputCount}`);
    const badRows = [
      { ...formal, id: '' }, { ...formal, id: 'missing id' }, { ...formal, id: formal.output },
      { ...formal, blueprint: 'missing-item' }, { ...formal, blueprint: formal.output },
      { ...formal, output: 'missing-item' }, { ...formal, output: 'spirit_copper' },
      { ...formal, materials: [] }, { ...formal, materials: [{ item: 'missing-item', count: 1 }] },
      { ...formal, materials: [{ item: 'spirit_copper', count: 0 }] },
      { ...formal, materials: [{ item: 'spirit_copper', count: 1.5 }] },
      { ...formal, materials: [{ itemId: 'spirit_copper', count: 1 }] },
      { ...formal, materials: [{ item: 'spirit_copper', count: 1 }, { item: 'spirit_copper', count: 1 }] },
      { ...formal, materials: [{ item: formal.blueprint, count: 1 }] },
      { ...formal, materials: [{ item: formal.output, count: 1 }] },
    ];
    for (const bad of badRows) await rejectsRows([bad], '正式非法引用或材料');
    await rejectsRows([copy(formal), copy(formal)], '正式重复id拒绝');
    await rejectsRows([{ ...formal, type: 'talisman' }, copy(formal)], '正式id与非forge配方重复仍拒绝');
    await rejectsRows([copy(formal), { ...formal, id: 'recipe_forge_ambiguous' }], '正式同图纸歧义拒绝');

    const isolated = fixture();
    const explicit = new ForgeGate(isolated.p, { fixtureRecipes: [copy(recipe)], formalRecipes: [] });
    ok(explicit.craft(request('explicit')).allowed, '显式fixture在正式空集仍授权');
    committed(await explicit.submit(request('explicit')));
    const fixtureOnly = fixture();
    const emptyFixture = new ForgeGate(fixtureOnly.p, { fixtureRecipes: [], formalRecipes: [copy(formal)] });
    for (const method of ['craft', 'submit'] as const)
      await unchanged(fixtureOnly.p, () => emptyFixture[method](request()), '显式空fixture不得混用正式表');
    const foreignFixture = new ForgeGate(fixtureOnly.p, { formalRecipes: [copy(formal)], fixtureRecipes: [
      { ...copy(recipe), materials: [{ itemId: 'rabbit_fur', count: 1 }] },
    ] });
    await unchanged(fixtureOnly.p, () => foreignFixture.submit(request()), '显式fixture无匹配不得补正式配方');

    // 用测试局部正式行证明数量贯通；不改变磁盘正式表的outputCount=1。
    const multiRow = { ...formal, outputCount: 3 }, multi = fixture();
    const multiGate = new ForgeGate(multi.p, { formalRecipes: [multiRow], random: () => 0.75 });
    const countCalls: [string, number][] = [];
    const oldCanAdd = Progress.prototype.canAddCraftedItem, oldAdd = Progress.prototype.addCraftedItem;
    try {
      Progress.prototype.canAddCraftedItem = function (itemId, count) {
        countCalls.push(['capacity', count]); return oldCanAdd.call(this, itemId, count);
      };
      Progress.prototype.addCraftedItem = function (itemId, count) {
        countCalls.push(['add', count]); return oldAdd.call(this, itemId, count);
      };
      const multiResult = committed(await multiGate.submit(request('formal-multi')));
      eq(multiResult.resultItem.count, 3, '测试局部outputCount=3结果不可写死1');
      eq(multi.p.count(formal.output), 5, 'outputCount=3成品入库增量');
      ok(countCalls.some(([method, count]) => method === 'capacity' && count === 3), 'canAddCraftedItem读取outputCount');
      ok(countCalls.some(([method, count]) => method === 'add' && count === 3), 'addCraftedItem读取outputCount');
      ok(isValidForgeProgress(multi.p.forge), '多数量结果保存结构合法');
    } finally {
      Progress.prototype.canAddCraftedItem = oldCanAdd; Progress.prototype.addCraftedItem = oldAdd;
    }
    await replay(multi.p, multiGate, request('formal-multi'), '多数量结果去重');
    const multiSave = multi.p.exportSave(), imported = fixture();
    eq(await imported.p.importSave(copy(multiSave), { async: true }), true, '多数量真实importSave保留');
    eq(imported.p.forge, multi.p.forge, '多数量导入不变');
    ok(new ForgeGate(imported.p, { formalRecipes: [multiRow] }).loadRefresh().allowed, '多数量读回匹配表数量');
    await unchanged(imported.p, () => new ForgeGate(imported.p).loadRefresh(), '历史数量与当前正式表不符阻写不修复');
    const overflow = fixture(); overflow.p.inventory[formal.output] = Number.MAX_SAFE_INTEGER - 1;
    await unchanged(overflow.p, () => new ForgeGate(overflow.p, { formalRecipes: [multiRow] }).submit(request()),
      'outputCount=3承载溢出整笔拒绝');
    return { fixtureRecipesAbsent: true, recipeId: formal.id, craftAllowed: true, submitCommitted: true,
      outputCount: formal.outputCount, injectedOutputCount: 3, fixtureIsolation: true, noProductionFallback: true,
      invalidFormalRowsDenied: true, forgingExperienceWritten: false, laterServiceClosed: true };
  }
  try {
    const sceneSmokeEvidence = sceneSmoke();
    const defaultGateEvidence = openFixture ? await formalGateTests() : null;
    if (refreshPayloads) {
      eq(refreshPayloads.map(row => row.state), ['common', 'fine', 'spirit', 'treasure'], '独立SSR覆盖四品质完整历史结果');
      for (const payload of refreshPayloads) await roundtrip(payload);
      payloads.push(...copy(refreshPayloads));
    }
    if (!openFixture) {
      for (const forge of [undefined, { craftRequestId: 'old-request', state: 'pending' },
        { state: 'unknown', raw: 'must-keep' }, { craftResultRef: 'broken', resultGrade: 'unknown' }]) {
        const { p } = fixture(); (p as any).forge = copy(forge);
        await memoryClosed(p, '内存关态/无袋或歧义旧请求');
      }
    } else if (!refreshPayloads) {
      const { p, gate } = fixture(), initial = p.exportSave(), exp = experience(p), writes = idb.writes, samples = sampleCount;
      eq(p.forge, undefined, '缺字段旧档forge保持undefined');
      eq(Object.prototype.hasOwnProperty.call(initial, 'forge'), false, '旧档export不凭空补袋');
      ok(gate.feature().allowed, 'O01正式图只读说明入口可访问');
      ok(gate.entrance().allowed, 'O01获令授权入口API允许访问');
      ok(gate.craft(request()).allowed, 'O02合法图纸材料可只读选择');
      ok(gate.loadRefresh().allowed, 'O01空袋只读刷新允许');
      eq(gate.laterService(), Closed.refuseLaterService(), 'O01后续强化附灵分解仍拒绝');
      eq(p.exportSave(), initial, 'O01/O02预览说明不预扣不建请求');
      eq(idb.writes, writes, 'O01/O02预览零保存');
      eq(sampleCount, samples, 'O01/O02预览不预抽品质');
      eq(experience(p), exp, 'O01/O02预览不写forging经验等级');
      for (const [grade, random] of [['common', 0.1], ['fine', 0.75], ['spirit', 0.95], ['treasure', 0.995]] as const) {
        const f = fixture(), before = f.p.exportSave(), beforeExp = experience(f.p), beforeWrites = idb.writes, beforeSamples = sampleCount;
        sampled = random;
        const id = `grade-${grade}`, result = committed(await f.gate.submit(request(id)));
        eq(result.state, 'committed', `O03 ${grade}只记录完整提交态`);
        eq(result.craftRequestId, id, `O03 ${grade}稳定请求身份`);
        eq(result.resultGrade, grade, `O03 ${grade}按enhance.forge.grade累积概率抽样`);
        eq(result.resultItem.itemId, recipe.resultItemId, `O03 ${grade}成品映射正确`);
        eq(result.resultItem.count, 1, `O03 ${grade}完整成品一份`);
        eq(result.craftResultRef, `${f.p.forge!.ledgerId}:craft:${id}`, `O03 ${grade}去重引用关联实际提交`);
        eq(result.resultItem.instanceRef, `${result.craftResultRef}:item`, `O03 ${grade}品质绑定成品实例引用`);
        eq(f.p.forge!.crafts, [result], `O03 ${grade}完整结果同次入袋`);
        eq(f.p.forge!.receipts.length, 1, `O03 ${grade}唯一提交收据同次成立`);
        eq(f.p.count(recipe.blueprintId), 3, `O02 ${grade}仅夹具明确消耗图纸一份`);
        for (const material of recipe.materials) eq(f.p.count(material.itemId), 3, `O02 ${grade}材料完整扣一次`);
        eq(f.p.count(recipe.resultItemId), 3, `O03 ${grade}成品完整入库`);
        eq(f.p.count('rabbit_fur'), 7, `O03 ${grade}旁路资产保留`);
        eq(f.p.stones, before.stones, `O03 ${grade}不臆造灵石收费`);
        eq(experience(f.p), beforeExp, `O03 ${grade}不臆造forging经验写路径`);
        eq(sampleCount, beforeSamples + 1, `O03 ${grade}只抽一次品质`);
        eq(idb.writes, beforeWrites + 1, `O03 ${grade}消耗成品品质去重单次写入`);
        eq((await saveStore.readSlot(1))!.data.forge, f.p.exportSave().forge, `O03 ${grade}IDB完整结果一致`);
        ok(isValidForgeProgress(f.p.forge), `O03 ${grade}完整袋结构合法`);
        payloads.push({ state: grade, craftRequestId: id, save: f.p.exportSave() });
        await replay(f.p, f.gate, request(id), `O07 ${grade}同请求重放`);
        await unchanged(f.p, () => f.gate.submit({ ...request(id), blueprintId: 'secret_art_fragment' }), 'O07同请求身份不同payload拒绝');
      }
      for (const payload of payloads) await roundtrip(payload);

      // O05：映射、引用、需求数量和所有权均由真实Gate拒绝。
      const invalidRequests: unknown[] = [null, {}, { ...request(), craftRequestId: '' },
        { ...request(), blueprintId: 'missing-item' }, { ...request(), blueprintId: 'secret_art_fragment' },
        { ...request(), materials: [] }, { ...request(), materials: [{ itemId: 'spirit_copper', count: 0 }] },
        { ...request(), materials: [{ itemId: 'spirit_copper', count: -1 }] },
        { ...request(), materials: [{ itemId: 'spirit_copper', count: 1.5 }] },
        { ...request(), materials: [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'spirit_copper', count: 1 }] },
        { ...request(), materials: [{ itemId: 'missing-item', count: 1 }, { itemId: 'refine_stone', count: 1 }] },
        { ...request(), materials: [...copy(recipe.materials), { itemId: 'rabbit_fur', count: 1 }] }];
      for (const input of invalidRequests) {
        const f = fixture(); await unchanged(f.p, () => f.gate.submit(input as ReturnType<typeof request>), 'O05非法或未授权请求');
      }
      for (const itemId of [recipe.blueprintId, ...recipe.materials.map(row => row.itemId)]) {
        const f = fixture(); delete f.p.inventory[itemId];
        await unchanged(f.p, () => f.gate.submit(request()), `O05缺少图纸或材料${itemId}`);
      }
      const noMapping = fixture();
      await unchanged(noMapping.p, () => new ForgeGate(noMapping.p, { fixtureRecipes: [] }).submit(request()), 'O05显式空夹具授权映射');
      const badRecipes = [
        { ...copy(recipe), blueprintCount: 0 }, { ...copy(recipe), resultItemId: 'missing-item' },
        { ...copy(recipe), materials: [] },
        { ...copy(recipe), materials: [{ itemId: 'missing-item', count: 1 }] },
        { ...copy(recipe), materials: [{ itemId: 'spirit_copper', count: 0 }] },
      ];
      for (const bad of badRecipes) {
        const f = fixture(), malformed = new ForgeGate(f.p, { ...fixtureOptions(), fixtureRecipes: [bad] });
        await unchanged(f.p, () => malformed.submit(request()), 'O05非法配方不猜默认映射');
      }
      const transient = fixture(); (transient.p as any).transientItems = { spirit_copper: 1 };
      await unchanged(transient.p, () => transient.gate.submit(request()), 'O05试炼临时材料不冒充永久所有权');
      for (const random of [NaN, -0.1, 1, 1.1, null, undefined]) {
        const f = fixture(), badRandom = new ForgeGate(f.p, { ...fixtureOptions(), random: () => random as number });
        await unchanged(f.p, () => badRandom.submit(request()), 'O05非法随机源不生成默认品质');
      }
      const thrownRandom = fixture();
      await unchanged(thrownRandom.p, () => new ForgeGate(thrownRandom.p, { ...fixtureOptions(),
        random: () => { throw new Error('受控随机源失败'); } }).submit(request()), 'O05随机源抛错保持原档');
      const unknown = fixture();
      await unchanged(unknown.p, () => unknown.gate.result('foreign'), 'O05未知请求不补成品');
      await unchanged(unknown.p, () => unknown.gate.grade('foreign'), 'O05未知请求不猜品质');

      // O06：当前背包无格数上限，用明确满包哨兵和真实计数溢出验证完整拒绝。
      const full = fixture(), blocked = new ForgeGate(full.p, { ...fixtureOptions(), canReceiveResult: () => false });
      await unchanged(full.p, () => blocked.submit(request()), 'O06满包或成品承载哨兵失败');
      const overflow = fixture(); overflow.p.inventory[recipe.resultItemId] = Number.MAX_SAFE_INTEGER;
      await unchanged(overflow.p, () => overflow.gate.submit(request()), 'O06成品库存安全整数溢出');
      const originalAdd = Progress.prototype.addCraftedItem;
      try {
        Progress.prototype.addCraftedItem = () => false;
        const f = fixture(); await unchanged(f.p, () => f.gate.submit(request()), 'O06实际addCraftedItem返回失败不吞料');
        Progress.prototype.addCraftedItem = () => true;
        const noProduct = fixture(); await unchanged(noProduct.p, () => noProduct.gate.submit(request()), 'O06成品端谎报成功但未入库仍回滚');
        Progress.prototype.addCraftedItem = () => { throw new Error('受控成品端异常'); };
        const thrown = fixture(); await unchanged(thrown.p, () => thrown.gate.submit(request()), 'O06成品端抛错不吞料');
      } finally { Progress.prototype.addCraftedItem = originalAdd; }
      const interrupted = fixture();
      eq(await interrupted.p.save({ async: true }), true, 'O06中断前旧档完整保存');
      const beforeAbort = interrupted.p.exportSave(), disk = (await saveStore.readSlot(1))!.data;
      const hold = idb.holdNextCommit(), pending = interrupted.gate.submit(request('aborted'));
      await hold.started;
      eq(interrupted.p.exportSave(), beforeAbort, 'O06 IDB request成功但complete前不发布扣料成品品质');
      eq((await saveStore.readSlot(1))!.data, disk, 'O06 complete前磁盘旧档不变');
      idb.abortNextCommit(); hold.release();
      businessDenied(await pending, 'O06 IDB abort明确拒绝');
      eq(interrupted.p.exportSave(), beforeAbort, 'O06 abort内存整笔回滚');
      eq((await saveStore.readSlot(1))!.data, disk, 'O06 abort磁盘整笔回滚');
      const retried = committed(await interrupted.gate.submit(request('aborted')));
      eq(retried.craftRequestId, 'aborted', 'O06 abort后同请求可完整重试');
      eq(interrupted.p.forge!.crafts.length, 1, 'O06重试只有一个结果');
      eq(interrupted.p.count(recipe.resultItemId), 3, 'O06重试只发一份成品');
      await replay(interrupted.p, interrupted.gate, request('aborted'), 'O06中断重试后再次重放');

      // O07：同Gate连点、多Gate同请求、多请求同库存均只消费一份。
      for (const sameGate of [true, false]) {
        const f = fixture(), writeStart = idb.writes, sampleStart = sampleCount;
        const other = sameGate ? f.gate : new ForgeGate(f.p, fixtureOptions());
        await Promise.all([f.gate.submit(request('rapid')), other.submit(request('rapid')), f.gate.submit(request('rapid'))]);
        eq(f.p.count(recipe.blueprintId), 3, 'O07连点/多Gate同请求图纸只扣一次');
        for (const mat of recipe.materials) eq(f.p.count(mat.itemId), 3, 'O07连点材料只扣一次');
        eq(f.p.count(recipe.resultItemId), 3, 'O07连点成品只发一份');
        eq(f.p.forge!.crafts.length, 1, 'O07连点唯一结果');
        eq(f.p.forge!.receipts.length, 1, 'O07连点唯一去重事实');
        eq(idb.writes, writeStart + 1, 'O07同请求只提交一笔');
        eq(sampleCount, sampleStart + 1, 'O07同请求只抽一次');
        await replay(f.p, other, request('rapid'), 'O07竞态后重放');
      }
      const race = fixture();
      race.p.inventory = { scroll_ten_thousand_swords: 1, spirit_copper: 1, refine_stone: 1 };
      const raceExp = experience(race.p), raceWrites = idb.writes;
      const raceResults = await Promise.all([race.gate, new ForgeGate(race.p, fixtureOptions()), new ForgeGate(race.p, fixtureOptions())]
        .map((g, i) => g.submit(request(`contender-${i}`))));
      eq(raceResults.filter(row => row.allowed).length, 1, 'O07不同请求争用同一图纸材料仅一笔完整成功');
      eq(race.p.count(recipe.blueprintId), 0, 'O07争用图纸无负数');
      for (const mat of recipe.materials) eq(race.p.count(mat.itemId), 0, 'O07争用材料无重复消费');
      eq(race.p.count(recipe.resultItemId), 1, 'O07争用不重复发物');
      eq(race.p.forge!.crafts.length, 1, 'O07争用无半完成请求');
      eq(idb.writes, raceWrites + 1, 'O07争用只有一笔持久提交');
      eq(experience(race.p), raceExp, 'O07争用不意外写forging经验等级');

      // O04：按实例绑定的槽提交；外来请求结果不可从另一个槽领取或查看。
      const slotA = fixture(), a = committed(await slotA.gate.submit(request('slot-a'))), saveA = slotA.p.exportSave();
      Progress.setActiveSlot(2);
      const slotB = fixture(), b = committed(await slotB.gate.submit(request('slot-b')));
      ok(a.craftResultRef !== b.craftResultRef, 'O04跨槽成品与去重引用不混认');
      await unchanged(slotB.p, () => slotB.gate.result('slot-a'), 'O04 B档不可查看A档结果');
      const loadedA = await Progress.load({ async: true, slot: 1 }); progresses.push(loadedA);
      eq(loadedA.forge, saveA.forge, 'O04 B档保存不覆盖A档炼器袋');
      eq(loadedA.inventory, saveA.inventory, 'O04 B档保存不覆盖A档消耗成品');
      Progress.setActiveSlot(1);
      const view = slotA.gate.loadRefresh(); ok(view.allowed && view.progress, '只读炼器视图存在');
      view.progress.crafts[0].resultGrade = 'treasure';
      eq(slotA.p.forge, saveA.forge, 'O04篡改视图不改真实品质结果');

      // O08：纯结构错误不默认empty；import与运行操作均阻断，合法资产不修补不清空。
      const good = copy(payloads[0].save), goodForge = copy(good.forge) as any;
      const corruptions: ((forge: any) => void)[] = [
        f => { delete f.crafts[0].craftRequestId; }, f => { f.crafts[0].state = 'pending'; },
        f => { f.crafts[0].craftResultRef = 'foreign'; }, f => { f.crafts[0].resultItem.instanceRef = 'foreign'; },
        f => { f.crafts[0].resultItem.itemId = ''; }, f => { f.crafts[0].resultGrade = 'unknown'; },
        f => { f.crafts[0].materials[0].count = -1; }, f => { f.crafts.push(copy(f.crafts[0])); },
        f => { f.receipts = []; }, f => { f.receipts.push(copy(f.receipts[0])); },
      ];
      for (const damage of corruptions) {
        const forge = copy(goodForge); damage(forge);
        eq(isValidForgeProgress(forge), false, 'O08未知品质状态/坏引用/收据校验拒绝');
        const f = fixture(), before = f.p.exportSave(), writeStart = idb.writes;
        eq(await f.p.importSave({ ...copy(good), forge }, { async: true }), false, 'O08损坏袋import拒绝');
        eq(f.p.exportSave(), before, 'O08 import失败当前合法资产保留');
        eq(idb.writes, writeStart, 'O08 import失败无写');
        (f.p as any).forge = copy(forge);
        await unchanged(f.p, () => f.gate.submit(request('cannot-repair')), 'O08歧义袋不当空袋写入');
        await unchanged(f.p, () => f.gate.result(payloads[0].craftRequestId), 'O08损坏结果不当成功');
        await unchanged(f.p, () => f.gate.grade(payloads[0].craftRequestId), 'O08未知品质不默认common');
      }
      for (const forge of [{ craftRequestId: 'old-pending', state: 'pending' }, { state: 'unknown' }]) {
        const f = fixture(); (f.p as any).forge = copy(forge);
        await unchanged(f.p, () => f.gate.submit(request('old-pending')), 'O08旧请求不自动结算成功');
        await unchanged(f.p, () => f.gate.loadRefresh(), 'O08读档不自动修歧义请求');
      }
      const absent = fixture(), oldSave = absent.p.exportSave();
      eq(await absent.p.importSave(copy(oldSave), { async: true }), true, 'O08缺forge字段旧档仍可导入');
      eq(absent.p.forge, undefined, 'O08旧档导入不补forge袋');
      eq(Object.prototype.hasOwnProperty.call(absent.p.exportSave(), 'forge'), false, 'O08旧档重导出不建待补做记录');
    }
    eq(featureFlags(), flags, 'features原值保持不变');
    eq(JSON.stringify(enhance), tableBefore, 'enhance内存数值未写改');
    eq(JSON.stringify(recipes), recipesBefore, '正式recipes内存未写改');
    eq(localWrites, 0, '真实IDB事务不用localStorage旁路');
    return { assertions, payloads, openFixture, graph: openFixture ? 'formal-open' : 'memory-closed',
      formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false,
      sceneSmoke: sceneSmokeEvidence, defaultGate: defaultGateEvidence,
      forgingExperienceWritten: false, storageWrites: idb.writes, commits: idb.commits, sampleCount,
      cases: openFixture ? ['O01','O02','O03','O04','O05','O06','O07','O08'] : ['memory-closed-eight-tips','zero-side-effects','historical-baggage'] };
  } finally {
    for (const p of progresses) await p.flushSaves();
    Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
