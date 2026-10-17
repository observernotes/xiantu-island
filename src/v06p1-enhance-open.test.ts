// 正式强化恒关；仅独立 Vite SSR 开态夹具图可内存注入 true。
import enhance from '@xt/balance/enhance.json';
import { GAME_PHASE, ITEMS } from './data';
import { featureEnabled, featureFlags } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, saveStore, setSaveBackend } from './SaveStore';
import * as Closed from './EnhanceClosed';
import { EnhanceGate } from './EnhanceGate';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import { isValidEnhanceProgress } from './EnhanceProgress';

type Payload = { state: string; save: Record<string, unknown>; enhanceRequestId: string };
type GateResult = Awaited<ReturnType<EnhanceGate['submit']>>;
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

export async function runEnhanceOpenFixtureTests(options: {
  openFixture: boolean; dataMode?: string; refreshPayloads?: Payload[] | null; invalidTable?: string;
}) {
  const { openFixture, dataMode = 'fixture', refreshPayloads, invalidTable } = options;
  const label = `${dataMode}/${openFixture ? 'memory-open' : 'formal-closed'}/${invalidTable ?? 'formal-table'}`;
  let assertions = 0, sampleCount = 0, ledgerSeq = 0, sampled = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const copy = <T>(value: T): T => structuredClone(value);
  const flags = copy(featureFlags()), tableBefore = JSON.stringify(enhance);
  type Instance = { instanceRef: string; itemId: string; type: 'weapon' | 'armor'; enhanceLevel: number };
  const instance = (enhanceLevel = 0, type: 'weapon' | 'armor' = 'weapon', instanceRef = 'fixture-owned-one'): Instance => ({
    instanceRef, itemId: type === 'weapon' ? 'bamboo_sword' : 'fox_robe', type, enhanceLevel,
  });
  const request = (enhanceRequestId = 'enhance-one', fromLevel = 0, instanceRef = 'fixture-owned-one') => ({
    enhanceRequestId, instanceRef, fromLevel, to: fromLevel + 1, useProtectCharm: false,
  });
  const fixtureOptions = (instances: Instance[] = [instance()]) => ({ fixtureInstances: copy(instances),
    random: () => { sampleCount++; return sampled; }, ledgerId: () => `${dataMode}-enhance-${++ledgerSeq}` });
  eq(isEnhanceOpenForFixture(), openFixture, '独立SSR图唯一旗授权');
  eq(GAME_PHASE, 5, 'GAME_PHASE保持5');
  eq(featureEnabled('indexedDbSaves'), true, '使用真实异步保存事务');
  ok(!Object.keys(flags).some(key => /enhance/iu.test(key)), '不新增配表强化开关');
  for (const id of ['bamboo_sword', 'fox_robe', 'refine_stone']) ok(ITEMS[id], `仅引用真实物品${id}`);
  const oldSlot = Progress.getActiveSlot(), storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const idb = memoryIndexedDb(), progresses: Progress[] = [], payloads: Payload[] = [];
  let localWrites = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => { localWrites++; },
  } });
  setSaveBackend(createIndexedDbBackend(idb.factory)); Progress.setActiveSlot(1);
  function fixture(level = 0, type: 'weapon' | 'armor' = 'weapon', instances?: Instance[]) {
    const p = new Progress(); progresses.push(p);
    p.stones = 100000; p.inventory = { bamboo_sword: 2, fox_robe: 2, refine_stone: 100, rabbit_fur: 7 };
    const authorized = instances ?? [instance(level, type)];
    return { p, gate: new EnhanceGate(p, fixtureOptions(authorized)), authorized };
  }
  const experience = (p: Progress) => [p.forgingLevel, p.forgingExp];
  const attributes = (type: 'weapon' | 'armor', level: number) => ({
    atkRatioOfBase: type === 'weapon' ? enhance.statPerLevel.weapon.atkRatioOfBase * level : 0,
    defRatioOfBase: type === 'armor' ? enhance.statPerLevel.armor.defRatioOfBase * level : 0,
    hpRatioOfBase: type === 'armor' ? enhance.statPerLevel.armor.hpRatioOfBase * level : 0,
    allRatio: Object.entries(enhance.milestoneBonus).reduce((sum, [milestone, bonus]) =>
      sum + (Number(milestone) <= level ? bonus.allRatio : 0), 0),
  });
  function businessDenied(result: GateResult, message: string) {
    eq(result.allowed, false, message);
    ok('tipKey' in result && result.tipKey.startsWith('enhance.fixture.'), `${message}：明确强化业务拒绝`);
  }
  function committed(result: GateResult) {
    ok(result.allowed && result.result, '返回完整强化结算结果'); return result.result;
  }
  async function unchanged(p: Progress, action: () => GateResult | Promise<GateResult>, message: string) {
    const before = p.exportSave(), writes = idb.writes, exp = experience(p), samples = sampleCount;
    businessDenied(await action(), message);
    eq(p.exportSave(), before, `${message}：整档无变化`);
    eq(experience(p), exp, `${message}：forging经验等级无变化`);
    eq(idb.writes, writes, `${message}：零持久写`);
    return { samplesBefore: samples, samplesAfter: sampleCount };
  }
  async function replay(p: Progress, gate: EnhanceGate, input: ReturnType<typeof request>, message: string) {
    const before = p.exportSave(), writes = idb.writes, samples = sampleCount;
    const result = await gate.submit(copy(input));
    if (result.allowed) eq(result.result, p.enhance!.enhancements.find(row => row.enhanceRequestId === input.enhanceRequestId), `${message}：只返回完整旧结果`);
    else businessDenied(result, `${message}：明确拒绝重复请求`);
    eq(p.exportSave(), before, `${message}：库存等级属性去重不变`);
    eq(idb.writes, writes, `${message}：重放零写`);
    eq(sampleCount, samples, `${message}：重放不重抽`);
  }
  async function formalClosed(p: Progress, message: string) {
    const fail = () => { throw new Error('正式关态不得查询资格、配置、随机或事务'); };
    const opts = fixtureOptions(); Object.defineProperty(opts, 'fixtureInstances', { configurable: true, get: fail });
    const gate = new EnhanceGate(p, { ...fixtureOptions(), random: fail, ledgerId: fail, canCommitResult: fail });
    const hostile = new Proxy({}, { get: fail }) as ReturnType<typeof request>;
    const methods = ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
      'addItem', 'removeItem', 'count', 'permanentCount', 'lifeSkillState'];
    const descriptors = methods.map(name => [name, Object.getOwnPropertyDescriptor(p, name)] as const);
    const before = p.exportSave(), writes = idb.writes, rows = copy([...idb.rows]), samples = sampleCount;
    for (const method of methods) Object.defineProperty(p, method, { configurable: true, value: fail });
    const operations: [() => unknown | Promise<unknown>, () => unknown][] = [
      [() => gate.feature(), Closed.featureClosed], [() => gate.entrance(), Closed.refuseEntrance],
      [() => gate.enhance(hostile), Closed.refuseEnhance], [() => gate.submit(hostile), Closed.refuseSubmit],
      [() => gate.level('old-request'), Closed.refuseLevel], [() => gate.consume('old-request'), Closed.refuseConsume],
      [() => gate.loadRefresh(), Closed.refuseLoadRefresh], [() => gate.laterService(), Closed.refuseLaterService],
    ];
    try {
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [action, expected] of operations) eq(await action(), expected(), `${message}：原八tip原样返回`);
        const results = await Promise.all(operations.map(async ([action]) => action()));
        results.forEach((result, index) => eq(result, operations[index][1](), `${message}：并发八tip原样返回`));
        eq(p.exportSave(), before, `${message}：库存等级属性历史袋零增量`);
        eq(idb.writes, writes, `${message}：零持久写`); eq([...idb.rows], rows, `${message}：磁盘旧档原样保留`);
        eq(sampleCount, samples, `${message}：零随机抽样`);
      }
    } finally {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(p, name, descriptor); else Reflect.deleteProperty(p, name);
      }
    }
    const guarded = new EnhanceGate(p, opts);
    eq(guarded.feature(), Closed.featureClosed(), `${message}：构造与入口不查询夹具授权Getter`);
    eq(await guarded.submit(hostile), Closed.refuseSubmit(), `${message}：提交不查询夹具授权Getter`);
  }
  async function roundtrip(payload: Payload) {
    const p = fixture().p;
    eq(await p.importSave(copy(payload.save), { async: true }), true, `${payload.state}：import完整结果`);
    eq(p.enhance, payload.save.enhance, `${payload.state}：import等级属性去重一致`);
    eq(p.inventory, payload.save.inventory, `${payload.state}：import费用库存一致`);
    eq(p.stones, payload.save.stones, `${payload.state}：import灵石一致`);
    const restored = (Progress as any).restore(copy(payload.save), false) as Progress; progresses.push(restored);
    eq(restored.enhance, payload.save.enhance, `${payload.state}：真实restore保留完整袋`);
    eq(restored.inventory, payload.save.inventory, `${payload.state}：restore库存一致`);
    eq(restored.stones, payload.save.stones, `${payload.state}：restore灵石一致`);
    const loaded = await Progress.load({ async: true, slot: 1 }); progresses.push(loaded);
    eq(loaded.enhance, payload.save.enhance, `${payload.state}：真实IDB读档强化袋一致`);
    eq(loaded.inventory, payload.save.inventory, `${payload.state}：真实IDB读档库存一致`);
    eq(loaded.stones, payload.save.stones, `${payload.state}：真实IDB读档灵石一致`);
    if (!openFixture) { await formalClosed(loaded, `${payload.state}/正式历史夹具袋`); return; }
    const gate = new EnhanceGate(loaded), before = loaded.exportSave(), writes = idb.writes, samples = sampleCount;
    ok(gate.loadRefresh().allowed, `${payload.state}：无新授权仍可只读历史`);
    const result = committed(gate.level(payload.enhanceRequestId));
    eq(result, loaded.enhance!.enhancements[0], `${payload.state}：等级结果只读一致`);
    eq(committed(gate.consume(payload.enhanceRequestId)), result, `${payload.state}：费用结果同次一致`);
    eq(loaded.exportSave(), before, `${payload.state}：读回不重复改级`);
    eq(idb.writes, writes, `${payload.state}：读回零写`); eq(sampleCount, samples, `${payload.state}：读回不重抽`);
    await replay(loaded, gate, request(payload.enhanceRequestId, result.fromLevel, result.instanceRef), `${payload.state}/读回同请求`);
    await unchanged(loaded, () => gate.submit(request('fresh-without-authorization', result.finalLevel, result.instanceRef)), `${payload.state}：历史袋不替代新请求夹具授权`);
  }
  try {
    if (refreshPayloads) {
      eq(refreshPayloads.map(row => row.state), ['success', 'failure-no-drop', 'failure-drop'], '独立fresh SSR覆盖成功与两种正常失败');
      for (const payload of refreshPayloads) await roundtrip(payload);
      payloads.push(...copy(refreshPayloads));
    }
    if (!openFixture) {
      for (const enhanceBag of [undefined, { enhanceRequestId: 'old-request', state: 'pending' },
        { state: 'unknown', raw: 'must-keep' }, { instanceRef: 'old-instance', enhanceLevel: 7 }]) {
        const { p } = fixture(); (p as any).enhance = copy(enhanceBag);
        await formalClosed(p, '正式关态/无袋或歧义旧请求');
      }
    } else if (invalidTable) {
      const { p, gate } = fixture(), samples = sampleCount;
      await unchanged(p, () => gate.submit(request()), `O06 SSR坏表${invalidTable}拒绝`);
      eq(sampleCount, samples, 'O06坏表拒绝不抽样不使用夹具概率回退');
    } else if (!refreshPayloads) {
      const { p, gate } = fixture(), initial = p.exportSave(), writes = idb.writes, samples = sampleCount;
      eq(p.enhance, undefined, '缺字段旧档enhance保持undefined');
      eq(Object.prototype.hasOwnProperty.call(initial, 'enhance'), false, '旧档export不补袋');
      ok(gate.feature().allowed, 'O01旗授权API feature只读允许'); ok(gate.entrance().allowed, 'O01旗授权API entrance只读允许');
      ok(gate.enhance(request()).allowed, 'O01真实当前档拥有实例可只读选择');
      ok(gate.loadRefresh().allowed, 'O01空袋刷新只读允许');
      eq(gate.laterService(), Closed.refuseLaterService(), 'O01开态仍拒附灵分解');
      eq(p.exportSave(), initial, 'O01入口及预览不扣费不建袋'); eq(idb.writes, writes, 'O01入口预览零写');
      eq(sampleCount, samples, 'O01入口预览不抽样');
      await unchanged(p, () => new EnhanceGate(p).submit(request()), 'O01默认无装备夹具授权拒新提交');

      for (const type of ['weapon', 'armor'] as const) for (const row of enhance.levels) {
        const f = fixture(row.to - 1, type), before = f.p.exportSave(), beforeWrites = idb.writes, beforeSamples = sampleCount;
        sampled = 0; const id = `success-${type}-${row.to}`, input = request(id, row.to - 1);
        const result = committed(await f.gate.submit(input));
        eq(result.state, 'committed', 'O02只记录完整提交态'); eq(result.success, true, `O02${type}+${row.to}成功`);
        eq({ to: result.to, rate: result.rate, stones: result.stones, refineStones: result.refineStones, dropOnFail: result.dropOnFail }, row, 'O02目标唯一正式行四项数值原样读取');
        eq(result.finalLevel, row.to, 'O02成功到目标等级'); eq(result.useProtectCharm, false, 'O02无护符结算');
        eq(result.attributes, attributes(type, row.to), 'O02属性仅读正式perLevel与milestone最终值');
        eq(f.p.stones, Number(before.stones) - row.stones, 'O02灵石扣费完整一次');
        eq(f.p.count('refine_stone'), 100 - row.refineStones, 'O02精炼石扣费完整一次');
        eq(f.p.count('bamboo_sword'), 2, 'O02不生成替代武器或碎装'); eq(f.p.count('fox_robe'), 2, 'O02不碎甲');
        eq(f.p.count('rabbit_fur'), 7, 'O02旁路资产保留');
        eq(f.p.enhance!.instances[0].enhanceLevel, row.to, 'O02实例最终等级同次入袋');
        eq(f.p.enhance!.enhancements, [result], 'O02完整结果同次入袋'); eq(f.p.enhance!.receipts, [result.enhanceResultRef], 'O02唯一去重事实同次成立');
        eq(idb.writes, beforeWrites + 1, 'O02费用等级属性去重单次IDB写入'); eq(sampleCount, beforeSamples + 1, 'O02只抽样一次');
        eq((await saveStore.readSlot(1))!.data.enhance, f.p.enhance, 'O02磁盘完整强化袋一致');
        eq((await saveStore.readSlot(1))!.data.inventory, f.p.inventory, 'O02磁盘费用库存一致');
        ok(isValidEnhanceProgress(f.p.enhance), 'O02完整袋纯结构合法');
        eq(experience(f.p), [before.forgingLevel, before.forgingExp], 'O02不写forging经验等级');
        await replay(f.p, f.gate, input, 'O07成功同请求重放');
        if (type === 'weapon' && row.to === 7) payloads.push({ state: 'success', enhanceRequestId: id, save: f.p.exportSave() });
      }
      for (const row of enhance.levels) {
        const f = fixture(row.to - 1), before = f.p.exportSave(), beforeWrites = idb.writes, beforeSamples = sampleCount;
        sampled = 0.999999; const id = `failure-${row.to}`, result = committed(await f.gate.submit(request(id, row.to - 1)));
        const finalLevel = row.dropOnFail ? row.to - 2 : row.to - 1;
        eq(result.success, false, `O03冲+${row.to}正常概率失败`); eq(result.finalLevel, finalLevel, 'O03按目标行dropOnFail保级或掉1');
        eq(result.dropOnFail, row.dropOnFail, 'O03按目标行边界读取布尔规则');
        eq(result.attributes, attributes('weapon', finalLevel), 'O03属性与最终等级完整一致');
        eq(f.p.enhance!.instances[0].enhanceLevel, finalLevel, 'O03实例最终等级完整一致');
        eq(f.p.stones, Number(before.stones) - row.stones, 'O03正常失败灵石照扣一次');
        eq(f.p.count('refine_stone'), 100 - row.refineStones, 'O03正常失败精炼石照扣一次');
        eq(f.p.count('bamboo_sword'), 2, 'O03失败不碎装备'); eq(f.p.enhance!.receipts.length, 1, 'O03失败同次去重');
        eq(idb.writes, beforeWrites + 1, 'O03正常失败单次完整提交'); eq(sampleCount, beforeSamples + 1, 'O03失败只抽一次');
        await replay(f.p, f.gate, request(id, row.to - 1), 'O07失败同请求重放');
        if ([5, 6].includes(row.to)) payloads.push({ state: row.dropOnFail ? 'failure-drop' : 'failure-no-drop', enhanceRequestId: id, save: f.p.exportSave() });
      }
      for (const payload of payloads) await roundtrip(payload);
      for (const row of enhance.levels) {
        for (const [random, success] of [[row.rate - Number.EPSILON, true], [row.rate, false]] as const) {
          const f = fixture(row.to - 1); sampled = random;
          eq(committed(await f.gate.submit(request(`rate-boundary-${row.to}-${success}`, row.to - 1))).success,
            success, 'O02/O03正式rate阈值上下的判定精确一致');
        }
      }
      const chain = fixture(); sampled = 0;
      committed(await chain.gate.submit(request('chain-one'))); sampled = 0.999999;
      committed(await chain.gate.submit(request('chain-failure', 1))); sampled = 0;
      committed(await chain.gate.submit(request('chain-two', 1)));
      eq(chain.p.enhance!.instances[0].enhanceLevel, 2, 'O05同实例连续成功失败成功等级合法');
      eq(chain.p.enhance!.enhancements.map(row => [row.fromLevel, row.finalLevel]), [[0, 1], [1, 1], [1, 2]], 'O05完整结果链不重算旧等级');
      eq(chain.p.enhance!.receipts.length, 3, 'O05每次完整结果唯一去重');
      ok(isValidEnhanceProgress(chain.p.enhance), 'O05连续历史袋纯结构合法');
      const chainSave = chain.p.exportSave(), chainRestored = (Progress as any).restore(copy(chainSave), false) as Progress;
      progresses.push(chainRestored); eq(chainRestored.enhance, chain.p.enhance, 'O05完整历史链restore保持');
      await replay(chainRestored, new EnhanceGate(chainRestored), request('chain-one'), 'O05连续历史中最早旧请求重放');
      await unchanged(chain.p, () => new EnhanceGate(chain.p, fixtureOptions([instance(enhance.maxLevel + 1)]))
        .submit(request('illegal-permission-level', 2)), 'O06有合法历史袋仍拒非法授权等级');

      // O04：没有正式护器符映射，绝不猜数量、item id 或消费时点。
      for (const level of [0, 5, 11]) {
        const f = fixture(level), beforeSamples = sampleCount;
        await unchanged(f.p, () => f.gate.submit({ ...request(`charm-${level}`, level), useProtectCharm: true }), 'O04请求使用护器符依据缺失整笔拒绝');
        eq(sampleCount, beforeSamples, 'O04无依据护符不进入概率结算');
      }

      const invalidRequests: unknown[] = [null, {}, { ...request(), enhanceRequestId: '' },
        { ...request(), instanceRef: 'foreign-instance' }, { ...request(), instanceRef: 'bamboo_sword' },
        { ...request(), fromLevel: -1 }, { ...request(), fromLevel: 0.5 }, { ...request(), fromLevel: 1 },
        { ...request(), to: 0 }, { ...request(), to: 2 }, { ...request(), to: 13 },
        { ...request(), useProtectCharm: 'false' }, { ...request(), unknownField: true }];
      for (const input of invalidRequests) {
        const f = fixture(); await unchanged(f.p, () => f.gate.submit(input as ReturnType<typeof request>), 'O06非法过期或越界请求');
      }
      const full = fixture(enhance.maxLevel); await unchanged(full.p, () => full.gate.submit(request('max', enhance.maxLevel)), 'O06满级拒绝不外推');
      for (const cost of ['stones', 'refine_stone']) {
        const f = fixture(); if (cost === 'stones') f.p.stones = enhance.levels[0].stones - 1; else f.p.inventory.refine_stone = 0;
        const beforeSamples = sampleCount; await unchanged(f.p, () => f.gate.submit(request()), `O06资源不足${cost}`);
        eq(sampleCount, beforeSamples, 'O06资源不足不预抽结果');
      }
      for (const authorized of [[], [instance(), instance()], [{ ...instance(), itemId: 'rabbit_fur' }],
        [{ ...instance(), type: 'shoes' }], [{ ...instance(), itemId: 'missing-item' }],
        [{ ...instance(), enhanceLevel: -1 }], [{ ...instance(), enhanceLevel: 13 }],
        [{ ...instance(), enhanceLevel: 0.5 }], [{ ...instance(), type: 'armor' }]]) {
        const f = fixture(0, 'weapon', authorized as Instance[]);
        await unchanged(f.p, () => f.gate.submit(request()), 'O06非法类型身份或夹具等级拒绝');
      }
      const missing = fixture(); delete missing.p.inventory.bamboo_sword;
      await unchanged(missing.p, () => missing.gate.submit(request()), 'O06夹具授权但当前档不拥有该装备拒绝');
      const transient = fixture(); transient.p.inventory.refine_stone = 0; (transient.p as any).transientItems = { refine_stone: 10 };
      await unchanged(transient.p, () => transient.gate.submit(request()), 'O06临时精炼石不能冒充永久库存');
      for (const random of [NaN, -0.1, 1, 1.1, null, undefined]) {
        const f = fixture(); await unchanged(f.p, () => new EnhanceGate(f.p, { ...fixtureOptions(), random: () => random as number }).submit(request()), 'O06非法随机源拒绝不补默认成功');
      }
      const thrown = fixture();
      await unchanged(thrown.p, () => new EnhanceGate(thrown.p, { ...fixtureOptions(), random: () => { throw new Error('受控随机源异常'); } }).submit(request()), 'O06随机源抛错整笔拒绝');
      const unknown = fixture(); await unchanged(unknown.p, () => unknown.gate.level('foreign'), 'O06未知历史结果不默认等级');
      await unchanged(unknown.p, () => unknown.gate.consume('foreign'), 'O06未知历史结果不补费用');

      // O07：真实草稿被哨兵拒绝和 IDB abort 时，内存与磁盘均保持完整旧结果。
      for (const sentinel of [() => false, () => { throw new Error('受控结算承载失败'); }]) {
        const f = fixture(); await unchanged(f.p, () => new EnhanceGate(f.p, { ...fixtureOptions(), canCommitResult: sentinel }).submit(request()), 'O07草稿结算哨兵失败整笔回滚');
      }
      for (const mutate of [
        (draft: Progress) => { draft.stones += 1; },
        (draft: Progress) => { draft.inventory.refine_stone += 1; },
        (draft: Progress) => { delete draft.inventory.bamboo_sword; },
      ]) {
        const f = fixture();
        await unchanged(f.p, () => new EnhanceGate(f.p, { ...fixtureOptions(), canCommitResult: draft => {
          mutate(draft); return true;
        } }).submit(request()), 'O07哨兵返回true但篡改草稿仍整笔拒绝');
      }
      const originalRemove = Progress.prototype.removeItem;
      try {
        for (const remove of [() => {}, () => { throw new Error('受控实际扣除端异常'); }]) {
          Progress.prototype.removeItem = remove;
          const f = fixture(); await unchanged(f.p, () => f.gate.submit(request()), 'O07真实扣除端无效或异常整笔回滚');
        }
      } finally { Progress.prototype.removeItem = originalRemove; }
      const interrupted = fixture(); sampled = 0;
      eq(await interrupted.p.save({ async: true }), true, 'O07中断前完整旧档保存');
      const beforeAbort = interrupted.p.exportSave(), disk = (await saveStore.readSlot(1))!.data;
      const hold = idb.holdNextCommit(), pending = interrupted.gate.submit(request('aborted'));
      await hold.started;
      eq(interrupted.p.exportSave(), beforeAbort, 'O07 request成功但complete前不发布费用等级属性去重');
      eq((await saveStore.readSlot(1))!.data, disk, 'O07 complete前磁盘旧档保留');
      idb.abortNextCommit(); hold.release(); businessDenied(await pending, 'O07 IDB abort明确拒绝');
      eq(interrupted.p.exportSave(), beforeAbort, 'O07 abort内存整笔回滚'); eq((await saveStore.readSlot(1))!.data, disk, 'O07 abort磁盘整笔回滚');
      eq(committed(await interrupted.gate.submit(request('aborted'))).enhanceRequestId, 'aborted', 'O07 abort后同请求可完整重试');
      eq(interrupted.p.enhance!.enhancements.length, 1, 'O07重试唯一完整结果');
      await replay(interrupted.p, interrupted.gate, request('aborted'), 'O07中断重试后再次重放');
      const complete = fixture(), beforeComplete = complete.p.exportSave(), held = idb.holdNextCommit(), completing = complete.gate.submit(request('complete'));
      await held.started; eq(complete.p.exportSave(), beforeComplete, 'O07等待complete期间只展示原合法状态'); held.release();
      committed(await completing); eq((await saveStore.readSlot(1))!.data.enhance, complete.p.enhance, 'O07 complete后一次发布完整结果');
      for (const sameGate of [true, false]) {
        const f = fixture(), beforeWrites = idb.writes, beforeSamples = sampleCount;
        const other = sameGate ? f.gate : new EnhanceGate(f.p, fixtureOptions());
        await Promise.all([f.gate.submit(request('rapid')), other.submit(request('rapid')), f.gate.submit(request('rapid'))]);
        eq(f.p.stones, 100000 - enhance.levels[0].stones, 'O07连点同请求灵石只扣一次');
        eq(f.p.count('refine_stone'), 100 - enhance.levels[0].refineStones, 'O07连点精炼石只扣一次');
        eq(f.p.enhance!.enhancements.length, 1, 'O07连点唯一完整结果'); eq(f.p.enhance!.receipts.length, 1, 'O07连点唯一去重');
        eq(f.p.enhance!.instances[0].enhanceLevel, 1, 'O07连点不重复升档');
        eq(idb.writes, beforeWrites + 1, 'O07连点单次持久提交'); eq(sampleCount, beforeSamples + 1, 'O07连点只抽一次');
        await replay(f.p, other, request('rapid'), 'O07竞态后重放');
        await unchanged(f.p, () => other.submit({ ...request('rapid'), to: 2 }), 'O07相同请求身份不同payload拒绝');
      }
      const sameEquipment = fixture(), sameWrites = idb.writes;
      const sameResults = await Promise.all([sameEquipment.gate, new EnhanceGate(sameEquipment.p, fixtureOptions())]
        .map((g, i) => g.submit(request(`same-instance-${i}`))));
      eq(sameResults.filter(row => row.allowed).length, 1, 'O07不同请求同装备同旧等级仅一笔完成');
      eq(sameEquipment.p.enhance!.instances[0].enhanceLevel, 1, 'O07同装备竞态最终等级合法');
      eq(idb.writes, sameWrites + 1, 'O07同装备竞态唯一提交');
      const instances = [instance(0, 'weapon', 'shared-one'), instance(0, 'armor', 'shared-two')];
      const race = fixture(0, 'weapon', instances); race.p.stones = enhance.levels[0].stones; race.p.inventory.refine_stone = enhance.levels[0].refineStones;
      const raceWrites = idb.writes;
      const raceResults = await Promise.all(instances.map((item, i) => new EnhanceGate(race.p, fixtureOptions(instances)).submit(request(`contender-${i}`, 0, item.instanceRef))));
      eq(raceResults.filter(row => row.allowed).length, 1, 'O07两装备争共享库存仅一笔完整结算');
      eq(race.p.stones, 0, 'O07争用灵石无负数'); eq(race.p.count('refine_stone'), 0, 'O07争用精炼石不重复扣');
      eq(race.p.enhance!.enhancements.length, 1, 'O07争用不留半完成请求'); eq(idb.writes, raceWrites + 1, 'O07争用唯一持久提交');

      // O05：档位隔离和导出视图不混认、不改写。
      const slotA = fixture(), a = committed(await slotA.gate.submit(request('slot-a'))), saveA = slotA.p.exportSave();
      Progress.setActiveSlot(2); const slotB = fixture(), b = committed(await slotB.gate.submit(request('slot-b')));
      ok(a.enhanceResultRef !== b.enhanceResultRef, 'O05跨槽账本去重引用不同');
      await unchanged(slotB.p, () => slotB.gate.level('slot-a'), 'O05 B档不可查看A档结果');
      const loadedA = await Progress.load({ async: true, slot: 1 }); progresses.push(loadedA);
      eq(loadedA.enhance, saveA.enhance, 'O05 B档保存不覆盖A档强化袋'); eq(loadedA.inventory, saveA.inventory, 'O05 B档不覆盖A档费用');
      Progress.setActiveSlot(1); const view = slotA.gate.loadRefresh(); ok(view.allowed && view.progress, 'O05完整只读袋可查看');
      view.progress.instances[0].enhanceLevel = 12; eq(slotA.p.enhance, saveA.enhance, 'O05篡改视图不改变真实等级');

      // O08：纯结构损坏拒绝导入与相关写入；不按空袋修补歧义请求。
      const good = copy(payloads[0].save), goodBag = copy(good.enhance) as any;
      const corruptions: ((bag: any) => void)[] = [
        bag => { delete bag.enhancements[0].enhanceRequestId; }, bag => { bag.enhancements[0].state = 'pending'; },
        bag => { bag.enhancements[0].enhanceResultRef = 'foreign'; }, bag => { bag.enhancements[0].instanceRef = 'foreign'; },
        bag => { bag.instances[0].enhanceLevel = 13; }, bag => { bag.instances[0].enhanceLevel = -1; },
        bag => { bag.instances[0].type = 'shoes'; }, bag => { bag.enhancements[0].success = 'unknown'; },
        bag => { bag.enhancements[0].stones = -1; }, bag => { bag.enhancements[0].finalLevel = 0; },
        bag => { bag.enhancements.push(copy(bag.enhancements[0])); }, bag => { bag.instances.push(copy(bag.instances[0])); },
        bag => { bag.receipts = []; }, bag => { bag.receipts.push(copy(bag.receipts[0])); },
      ];
      for (const damage of corruptions) {
        const enhanceBag = copy(goodBag); damage(enhanceBag);
        eq(isValidEnhanceProgress(enhanceBag), false, 'O08坏引用等级未知状态或去重拒绝');
        const f = fixture(), before = f.p.exportSave(), beforeWrites = idb.writes;
        eq(await f.p.importSave({ ...copy(good), enhance: enhanceBag }, { async: true }), false, 'O08损坏袋import拒绝');
        eq(f.p.exportSave(), before, 'O08 import失败保留当前合法资产'); eq(idb.writes, beforeWrites, 'O08 import拒绝零写');
        (f.p as any).enhance = copy(enhanceBag);
        await unchanged(f.p, () => f.gate.submit(request('cannot-repair')), 'O08歧义袋不当空袋写入');
        await unchanged(f.p, () => f.gate.level(payloads[0].enhanceRequestId), 'O08损坏历史不冒充完整结果');
      }
      for (const bag of [{ enhanceRequestId: 'old-pending', state: 'pending' }, { state: 'unknown' }]) {
        const f = fixture(); (f.p as any).enhance = copy(bag);
        await unchanged(f.p, () => f.gate.submit(request('old-pending')), 'O08旧请求不自动结算');
        await unchanged(f.p, () => f.gate.loadRefresh(), 'O08读档不修歧义请求');
      }
      const absent = fixture(), oldSave = absent.p.exportSave();
      eq(await absent.p.importSave(copy(oldSave), { async: true }), true, 'O08缺enhance字段旧档可导入');
      eq(absent.p.enhance, undefined, 'O08缺字段旧档不补袋');
      eq(Object.prototype.hasOwnProperty.call(absent.p.exportSave(), 'enhance'), false, 'O08旧档export不建待补做记录');
    }
    eq(featureFlags(), flags, 'features原值保持不变'); eq(JSON.stringify(enhance), tableBefore, 'enhance内存表未修改');
    eq(localWrites, 0, '真实IDB保存无localStorage写旁路');
    return { assertions, payloads, openFixture, graph: openFixture ? 'memory-open' : 'formal-closed',
      formalOpen: false, fixtureOnly: true, softOpened: false, released: false, storageWrites: idb.writes, commits: idb.commits, sampleCount,
      forgingExperienceWritten: false, protectorPath: 'missing-basis-denied',
      cases: openFixture ? invalidTable ? ['O06'] : ['O01', 'O02', 'O03', 'O04', 'O05', 'O06', 'O07', 'O08'] : ['formal-eight-tips', 'zero-side-effects', 'historical-baggage'] };
  } finally {
    for (const p of progresses) await p.flushSaves(); Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
