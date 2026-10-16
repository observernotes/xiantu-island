// 正式炼器恒关；只有独立 Vite SSR 夹具图可将 ForgeOpenFlag 内存注入 true。
import enhance from '@xt/balance/enhance.json';
import { GAME_PHASE, ITEMS } from './data';
import { featureEnabled, featureFlags } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, saveStore, setSaveBackend } from './SaveStore';
import * as Closed from './ForgeClosed';
import { ForgeGate } from './ForgeGate';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import { isValidForgeProgress } from './ForgeProgress';

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
  const label = `${dataMode}/${openFixture ? 'memory-open' : 'formal-closed'}`;
  let assertions = 0, sampleCount = 0, ledgerSeq = 0;
  let sampled = 0.1;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const copy = <T>(value: T): T => structuredClone(value);
  const flags = copy(featureFlags()), tableBefore = JSON.stringify(enhance);
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
  async function formalClosed(p: Progress, message: string) {
    const fail = () => { throw new Error('正式关态禁止查询资格、事务、随机或夹具映射'); };
    const opts = fixtureOptions();
    Object.defineProperty(opts, 'fixtureRecipes', { configurable: true, get: fail });
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
    if (!openFixture) { await formalClosed(loaded, `${payload.state}/正式关态历史袋`); return; }
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
  try {
    if (refreshPayloads) {
      eq(refreshPayloads.map(row => row.state), ['common', 'fine', 'spirit', 'treasure'], '独立SSR覆盖四品质完整历史结果');
      for (const payload of refreshPayloads) await roundtrip(payload);
      payloads.push(...copy(refreshPayloads));
    }
    if (!openFixture) {
      for (const forge of [undefined, { craftRequestId: 'old-request', state: 'pending' },
        { state: 'unknown', raw: 'must-keep' }, { craftResultRef: 'broken', resultGrade: 'unknown' }]) {
        const { p } = fixture(); (p as any).forge = copy(forge);
        await formalClosed(p, '正式关态/无袋或歧义旧请求');
      }
    } else if (!refreshPayloads) {
      const { p, gate } = fixture(), initial = p.exportSave(), exp = experience(p), writes = idb.writes, samples = sampleCount;
      eq(p.forge, undefined, '缺字段旧档forge保持undefined');
      eq(Object.prototype.hasOwnProperty.call(initial, 'forge'), false, '旧档export不凭空补袋');
      ok(gate.feature().allowed, 'O01夹具说明入口可访问');
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
      await unchanged(noMapping.p, () => new ForgeGate(noMapping.p).submit(request()), 'O05缺夹具本地授权映射');
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
    eq(localWrites, 0, '真实IDB事务不用localStorage旁路');
    return { assertions, payloads, openFixture, graph: openFixture ? 'memory-open' : 'formal-closed',
      formalOpen: false, fixtureOnly: true, softOpened: false, released: false,
      forgingExperienceWritten: false, storageWrites: idb.writes, commits: idb.commits, sampleCount,
      cases: openFixture ? ['O01','O02','O03','O04','O05','O06','O07','O08'] : ['formal-eight-tips','zero-side-effects','historical-baggage'] };
  } finally {
    for (const p of progresses) await p.flushSaves();
    Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
