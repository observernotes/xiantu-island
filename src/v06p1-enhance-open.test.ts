// 正式强化与护符 soft-open；只有独立 Vite SSR 关态图注入 false。soft-open≠进包≠发版。
import enhance from '@xt/balance/enhance.json';
import protectCharmMap from '@xt/balance/enhance_protect_charm.json';
import recipes from '@xt/balance/recipes.json';
import strings from '@xt/balance/strings_zh.json';
import { GAME_PHASE, ITEMS } from './data';
import { featureEnabled, featureFlags } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, saveStore, setSaveBackend } from './SaveStore';
import * as Closed from './EnhanceClosed';
import { EnhanceGate } from './EnhanceGate';
import { ForgeGate } from './ForgeGate';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import { isEnhanceInstanceRef, isValidEnhanceProgress } from './EnhanceProgress';
import { GameScene } from './scenes/GameScene';

type Payload = { state: string; save: Record<string, unknown>; enhanceRequestId: string; formalInstanceSource?: boolean };
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
  const label = `${dataMode}/${openFixture ? 'formal-open' : 'memory-closed'}/${invalidTable ?? 'formal-table'}`;
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
  eq(isEnhanceOpenForFixture(), openFixture, '旗标来自当前独立SSR正式开态或内存关态图');
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
    ok('tipKey' in result && /^enhance\.(fixture|formal)\./u.test(result.tipKey), `${message}：明确强化业务拒绝`);
    if ('tipKey' in result && result.tipKey.startsWith('enhance.formal.'))
      eq(result.text, (strings as Record<string, unknown>)[result.tipKey], `${message}：正式文案仅读strings键`);
  }
  function formalDenied(result: GateResult, reason: string, message: string) {
    businessDenied(result, message);
    eq('tipKey' in result ? result.tipKey : null, `enhance.formal.${reason}`, `${message}：正式拒绝分型`);
  }
  async function formalUnchanged(p: Progress, action: () => GateResult | Promise<GateResult>, reason: string, message: string) {
    const before = p.exportSave(), rows = copy([...idb.rows]), writes = idb.writes, commits = idb.commits,
      exp = experience(p), samples = sampleCount, ledgers = ledgerSeq, local = localWrites;
    const methods = ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync'];
    const descriptors = methods.map(name => [name, Object.getOwnPropertyDescriptor(p, name)] as const);
    const random = Math.random;
    let persistenceAttempts = 0, randomAttempts = 0;
    let result!: GateResult;
    try {
      for (const method of methods) Object.defineProperty(p, method, { configurable: true, value: () => {
        persistenceAttempts++; throw new Error(`${message}：正式拒绝不得事务或延后保存`);
      } });
      Math.random = () => { randomAttempts++; throw new Error(`${message}：正式拒绝不得抽样`); };
      result = await action(); formalDenied(result, reason, message);
    } finally {
      Math.random = random;
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(p, name, descriptor); else Reflect.deleteProperty(p, name);
      }
    }
    eq(p.exportSave(), before, `${message}：资源实例等级属性品质历史记录整档零增量`);
    eq(experience(p), exp, `${message}：生活技能经验等级不变`);
    eq([...idb.rows], rows, `${message}：磁盘既有资产及结果不变`);
    eq([idb.writes, idb.commits, localWrites], [writes, commits, local], `${message}：存储零写零提交`);
    eq([sampleCount, ledgerSeq, randomAttempts], [samples, ledgers, 0], `${message}：零抽样零新账本`);
    eq(persistenceAttempts, 0, `${message}：不启事务不建延后保存队列`);
    return result;
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
    formalDenied(result, 'duplicate', `${message}：明确拒绝重复请求`);
    eq('result' in result ? result.result : null,
      p.enhance!.enhancements.find(row => row.enhanceRequestId === input.enhanceRequestId), `${message}：只返回匹配完整旧结果`);
    eq('replayed' in result ? result.replayed : false, true, `${message}：只读已提交身份`);
    eq(p.exportSave(), before, `${message}：库存等级属性去重不变`);
    eq(idb.writes, writes, `${message}：重放零写`);
    eq(sampleCount, samples, `${message}：重放不重抽`);
  }
  async function memoryClosed(p: Progress, message: string) {
    const fail = () => { throw new Error('内存关态不得查询资格、配置、随机或事务'); };
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
      ...[false, true].flatMap(useProtectCharm => [
        [() => gate.enhance({ ...request('closed-protect-preview'), useProtectCharm }), Closed.refuseEnhance],
        [() => gate.submit({ ...request('closed-protect-submit'), useProtectCharm }), Closed.refuseSubmit],
      ] as [() => unknown | Promise<unknown>, () => unknown][]),
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
  function sceneSmoke() {
    const { p } = fixture(), logs: { text: string; color: string }[] = [];
    const before = p.exportSave(), writes = idb.writes, rows = copy([...idb.rows]), samples = sampleCount;
    const entrance = { name: 'smith_ou', type: 'npc', props: { npc: 'smith_ou' }, x: 100, y: 200 };
    const forgeTip = { text: '炼器打造已开放。', color: '#fff8d0' };
    const enchantTip = { text: '装备附灵已开放。', color: '#aaaaaa' };
    const enhanceTip = openFixture ? { text: '装备强化已开放。', color: '#aaaaaa' }
      : { text: Closed.featureClosed().text, color: '#aaaaaa' };
    const scene: any = Object.assign(Object.create(GameScene.prototype), {
      prog: p, map: { id: 'luoxia_town', objects: [] }, player: { x: 100, y: 200 },
      log: (text: string, color: string) => logs.push({ text, color }),
      encounterRuntime: { interact() { throw new Error('欧冶匠三项入口须先于遭遇与NPC交互'); } },
    });
    eq(typeof scene.tryInteractForgeEntrance, 'function', 'Scene既有欧冶匠最小入口存在');
    eq(scene.tryInteractForgeEntrance(), false, '没有对象时安静no-op');
    scene.map.objects = [{ ...entrance, name: 'npc_shop', props: { npc: 'npc_shop' } }];
    eq(scene.tryInteractForgeEntrance(), false, '非smith_ou对象不消费强化入口');
    scene.map.objects = [entrance]; scene.player.x = entrance.x + 29;
    eq(scene.tryInteractForgeEntrance(), false, '入口横向超距不交互');
    scene.player.x = entrance.x; scene.player.y = entrance.y + 41;
    eq(scene.tryInteractForgeEntrance(), false, '入口纵向超距不交互');
    scene.player.y = entrance.y; scene.senseMap = { objectVisible: () => false };
    eq(scene.tryInteractForgeEntrance(), false, '隐藏欧冶匠不交互');
    eq(logs, [], '无对象/非欧冶匠/超距/隐藏时三项提示均安静');
    scene.senseMap = undefined;
    for (const object of [{ ...entrance, props: {} }, { ...entrance, name: 'enhance-smoke-alias' }]) {
      scene.map.objects = [object]; const logStart = logs.length;
      eq(scene.tryInteractForgeEntrance(), true, `${object.name}邻近欧冶匠被消费`);
      eq(logs.slice(logStart), [forgeTip, enhanceTip, enchantTip], '同一次smith_ou命中先打造再强化再附灵，强化和附灵不被return饿死');
    }
    scene.map.objects = [entrance]; scene.player.x = entrance.x + 28; scene.player.y = entrance.y + 40;
    let logStart = logs.length;
    eq(scene.tryInteractForgeEntrance(), true, '28×40范围边界内三项入口仍可冒烟');
    eq(logs.slice(logStart), [forgeTip, enhanceTip, enchantTip], '距离边界保持打造顺序与强化提示');
    scene.player.x = entrance.x; scene.player.y = entrance.y; logStart = logs.length;
    eq(scene.tryInteract(), true, '通用交互在遭遇/NPC前消费欧冶匠三项入口');
    eq(logs.slice(logStart), [forgeTip, enhanceTip, enchantTip], '通用交互同命中三项入口且不重复提示');
    const originalEntrance = EnhanceGate.prototype.entrance;
    let entranceCalls = 0;
    try {
      EnhanceGate.prototype.entrance = function () {
        entranceCalls++;
        if (!openFixture) throw new Error('内存关态不得查询EnhanceGate');
        return { allowed: false, tipKey: 'enhance.fixture.smoke', text: '强化冒烟拒绝。' };
      };
      logStart = logs.length;
      eq(scene.tryInteractForgeEntrance(), true, '最小入口保留EnhanceGate拒绝提示分支');
      eq(entranceCalls, openFixture ? 1 : 0, '只有正式开态查询EnhanceGate.entrance，关态直接绕过');
      eq(logs.slice(logStart), [forgeTip, { text: openFixture ? '强化冒烟拒绝。' : Closed.featureClosed().text,
        color: '#aaaaaa' }, enchantTip], 'Gate拒绝原文或内存关态tip展示，打造及附灵既有提示保持');
    } finally { EnhanceGate.prototype.entrance = originalEntrance; }
    eq(p.exportSave(), before, 'Scene冒烟不修改角色、打造袋或强化袋');
    eq(idb.writes, writes, 'Scene冒烟存档写入0'); eq([...idb.rows], rows, 'Scene冒烟磁盘旧档不变');
    eq(sampleCount, samples, 'Scene入口不抽样或结算'); eq(localWrites, 0, 'Scene冒烟无localStorage旁路写入');
    return { noObjectNoop: true, nonSmithIgnored: true, nearbyOnly: true, hiddenIgnored: true,
      objectName: 'smith_ou', npcProp: 'smith_ou', boundary: { x: 28, y: 40 }, genericInteraction: true,
      graph: openFixture ? 'formal-open' : 'memory-closed', sameHitForgeThenEnhance: true, sameHitForgeThenEnhanceThenEnchant: true,
      forgeSoftOpenPreserved: true, enhanceNotStarved: true, gateDeniedRouting: openFixture,
      closedBypassesGate: !openFixture, saveWrites: idb.writes - writes };
  }
  async function defaultGateDenied() {
    const { p } = fixture(), gate = new EnhanceGate(p);
    const before = p.exportSave(), writes = idb.writes, samples = sampleCount;
    for (let repeat = 0; repeat < 3; repeat++) {
      ok(gate.feature().allowed, 'C01正式默认无fixtureInstances仍允许只读说明');
      ok(gate.entrance().allowed, 'C01正式默认无fixtureInstances仍允许入口提示');
    }
    ok(gate.loadRefresh().allowed, '正式默认无fixtureInstances空历史袋只读允许');
    await formalUnchanged(p, () => gate.enhance(request('formal-default-denied')), 'no_instance', 'C01默认无正式实例拒绝选择');
    await formalUnchanged(p, () => gate.submit(request('formal-default-denied')), 'no_instance', 'C01只读入口不授权新submit');
    await formalUnchanged(p, () => gate.level('unknown-default-result'), 'no_instance', 'C01默认无完整结果不补造等级');
    await formalUnchanged(p, () => gate.consume('unknown-default-result'), 'no_instance', 'C01默认无完整结果不补造费用');
    eq(gate.laterService(), Closed.refuseLaterService(), '正式默认开态仍拒附灵/分解');
    eq(p.exportSave(), before, '默认Gate拒绝不建实例、不建袋、不扣费');
    eq(p.enhance, undefined, '默认拒绝不发明正式装备实例系统');
    eq(idb.writes, writes, '默认无夹具授权submit拒绝零存档写');
    eq(sampleCount, samples, '默认无夹具授权submit拒绝不抽样');
    const malformed = fixture().p; (malformed as any).enhance = { state: 'unknown', raw: 'must-keep' };
    await formalUnchanged(malformed, () => new EnhanceGate(malformed).loadRefresh(), 'no_instance', 'C08默认坏历史袋不修复不冒认完整结果');
    return { fixtureInstancesAbsent: true, submitDenied: true, tipKey: 'enhance.formal.no_instance',
      unknownReadResultsDenied: true, malformedHistoryPreserved: true,
      noProductionInstancesInvented: true, laterServiceClosed: true, saveWrites: idb.writes - writes };
  }
  async function formalRefusalCases() {
    eq(Object.keys(strings).length, 952, '正式strings快照952键含_meta，原944键完整保留');
    eq(Object.keys(strings).filter(key => key.startsWith('enhance.formal.')).length, 8, '正式拒绝只读既有八键');
    for (const [name, makeGate, input] of [
      ['仅同itemId数量', (p: Progress) => new EnhanceGate(p), request('quantity-only')],
      ['itemId冒充实例引用', (p: Progress) => new EnhanceGate(p), request('item-id-only', 0, 'bamboo_sword')],
      ['空夹具授权', (p: Progress) => new EnhanceGate(p, fixtureOptions([])), request('empty-authorization')],
      ['显式实例中缺itemId冒充授权', (p: Progress) => new EnhanceGate(p, fixtureOptions()), request('fixture-item-id', 0, 'bamboo_sword')],
    ] as const) {
      const { p } = fixture(); p.inventory.bamboo_sword = 99;
      await formalUnchanged(p, () => makeGate(p).submit(input), 'no_instance', `C02${name}不授权`);
    }
    const historical = fixture();
    historical.p.enhance = { version: 1, ledgerId: 'historical-instance-only', instances: [instance()], enhancements: [], receipts: [] };
    ok(isValidEnhanceProgress(historical.p.enhance), 'C02构造合法但无完整结果的历史实例袋');
    await formalUnchanged(historical.p, () => new EnhanceGate(historical.p).submit(request('historical-instance-only')),
      'no_instance', 'C02历史instances不授权新submit');
    await formalUnchanged(historical.p, () => new EnhanceGate(historical.p, fixtureOptions([])).submit(request('historical-empty-authorization')),
      'no_instance', 'C02历史袋不能补足空夹具授权');
    const { p: missingSelection, gate: selectionGate } = fixture();
    await formalUnchanged(missingSelection, () => selectionGate.enhance(), 'no_instance', 'C02缺selection不授权');

    // C03保留显式夹具所有权边界；正式跨档来源另由 O08 实测。
    const foreign = fixture(); delete foreign.p.inventory.bamboo_sword;
    await formalUnchanged(foreign.p, () => foreign.gate.enhance(request('foreign-preview')), 'foreign', 'C03授权实例非本档持有拒绝预览');
    await formalUnchanged(foreign.p, () => foreign.gate.submit(request('foreign-submit')), 'foreign', 'C03授权实例非本档持有拒绝提交');
    const mismatch = fixture();
    mismatch.p.enhance = { version: 1, ledgerId: 'history-mismatch', instances: [instance(0, 'armor')], enhancements: [], receipts: [] };
    await formalUnchanged(mismatch.p, () => mismatch.gate.submit(request('mismatched-history')), 'foreign', 'C03历史实例身份与本档授权不符');
    const slotBefore = Progress.getActiveSlot();
    try {
      Progress.setActiveSlot(2); const { p: anotherSlot } = fixture();
      await formalUnchanged(anotherSlot, () => new EnhanceGate(anotherSlot).submit(request('cross-slot-text-only')),
        'no_instance', 'C03另一档同引用文本不获默认正式授权');
    } finally { Progress.setActiveSlot(slotBefore); }

    for (const [name, authorized] of [
      ['非法type', [{ ...instance(), type: 'shoes' }]],
      ['非equip', [{ ...instance(), itemId: 'rabbit_fur' }]],
      ['slot不符', [{ ...instance(), type: 'armor' }]],
      ['未知装备原型', [{ ...instance(), itemId: 'missing-item' }]],
    ] as const) {
      const f = fixture(0, 'weapon', authorized as unknown as Instance[]);
      await formalUnchanged(f.p, () => f.gate.submit(request(`bad-type-${name.length}`)), 'bad_type', `C04${name}整笔拒绝`);
    }
    for (const [name, patch] of [
      ['phase', { phase: GAME_PHASE + 1 }], ['phaseMin', { phaseMin: GAME_PHASE + 1 }],
      ['phaseMax', { phaseMax: GAME_PHASE - 1 }], ['enabled', { enabled: false }],
      ['placeholder', { placeholder: true }], ['qualityEnabled', { qualityEnabled: true }],
    ] as const) {
      const original = ITEMS.bamboo_sword;
      try {
        ITEMS.bamboo_sword = { ...original, ...patch };
        const f = fixture();
        await formalUnchanged(f.p, () => f.gate.enhance(request('bad-item-preview')), 'bad_type', `C04${name}资格不符拒绝预览`);
        await formalUnchanged(f.p, () => f.gate.submit(request('bad-item-submit')), 'bad_type', `C04${name}资格不符拒绝提交`);
      } finally { ITEMS.bamboo_sword = original; }
    }

    for (const resource of ['stones', 'refine_stone']) {
      const f = fixture();
      if (resource === 'stones') f.p.stones = enhance.levels[0].stones - 1;
      else f.p.inventory.refine_stone = enhance.levels[0].refineStones - 1;
      await formalUnchanged(f.p, () => f.gate.enhance(request('resources-preview')), 'resources', `C06${resource}不足拒绝预览`);
      await formalUnchanged(f.p, () => f.gate.submit(request('resources-submit')), 'resources', `C06${resource}不足拒绝提交`);
    }
    for (const [name, level, input] of [
      ['满级', enhance.maxLevel, request('formal-max', enhance.maxLevel)],
      ['目标越界', 0, { ...request('formal-beyond'), to: enhance.maxLevel + 1 }],
      ['目标非next', 0, { ...request('formal-skip'), to: 2 }],
      ['过期等级', 1, request('formal-stale')],
      ['负等级', 0, { ...request('formal-negative'), fromLevel: -1 }],
      ['非整数等级', 0, { ...request('formal-fraction'), fromLevel: 0.5 }],
    ] as const) {
      const f = fixture(level);
      await formalUnchanged(f.p, () => f.gate.enhance(input), 'max_level', `C07${name}拒绝预览`);
      await formalUnchanged(f.p, () => f.gate.submit(input), 'max_level', `C07${name}拒绝提交`);
    }
    const { p, gate } = fixture(), before = p.exportSave(), writes = idb.writes, samples = sampleCount;
    eq(gate.laterService(), Closed.refuseLaterService(), 'C09附灵分解继续使用enhance.closed.later_service');
    eq(gate.laterService(), { allowed: false, tipKey: 'enhance.closed.later_service', text: strings['enhance.closed.later_service'] },
      'C09later_service文案仅读既有strings');
    eq(p.exportSave(), before, 'C09附灵分解整档零增量');
    eq([idb.writes, sampleCount], [writes, samples], 'C09附灵分解零写零抽样');
    return { cases: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C09'],
      formalTipTextFromStrings: true, zeroSideEffects: true, noTransactionOrDeferredQueue: true,
      foreignFixtureBoundaries: ['owned-item-absent', 'history-identity-mismatch'],
      crossSlotProductionSchemaImplemented: true, historicalBagAuthorizesSubmit: false };
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
    if (!openFixture) { await memoryClosed(loaded, `${payload.state}/内存关态历史夹具袋`); return; }
    const gate = new EnhanceGate(loaded), before = loaded.exportSave(), writes = idb.writes, samples = sampleCount;
    const refreshed = await formalUnchanged(loaded, () => gate.loadRefresh(), 'load_dedupe', `C08${payload.state}：读档后只认已提交结果`);
    eq('progress' in refreshed ? refreshed.progress : null, loaded.enhance, `C08${payload.state}：返回完整只读历史`);
    eq('replayed' in refreshed ? refreshed.replayed : false, true, `C08${payload.state}：读档去重只读标识`);
    const result = committed(gate.level(payload.enhanceRequestId));
    eq(result, loaded.enhance!.enhancements.find(row => row.enhanceRequestId === payload.enhanceRequestId), `${payload.state}：等级结果只读一致`);
    eq(committed(gate.consume(payload.enhanceRequestId)), result, `${payload.state}：费用结果同次一致`);
    eq(loaded.exportSave(), before, `${payload.state}：读回不重复改级`);
    eq(idb.writes, writes, `${payload.state}：读回零写`); eq(sampleCount, samples, `${payload.state}：读回不重抽`);
    await replay(loaded, gate, { ...request(payload.enhanceRequestId, result.fromLevel, result.instanceRef), useProtectCharm: result.useProtectCharm }, `${payload.state}/读回同请求`);
    const duplicate = await formalUnchanged(loaded,
      () => gate.submit({ ...request(payload.enhanceRequestId, result.fromLevel, result.instanceRef), useProtectCharm: result.useProtectCharm }), 'duplicate', `C08${payload.state}：旧结果拒绝再次结算`);
    eq('result' in duplicate ? duplicate.result : null, result, `C08${payload.state}：旧请求只读结果原样保留`);
    const conflict = await formalUnchanged(loaded,
      () => gate.submit({ ...request(payload.enhanceRequestId, result.fromLevel, 'different-instance'), useProtectCharm: result.useProtectCharm }), 'duplicate', `C08${payload.state}：旧请求载荷冲突拒绝`);
    eq('result' in conflict && conflict.result !== undefined, false, `C08${payload.state}：载荷冲突不冒认旧结果`);
    const charmConflict = await formalUnchanged(loaded,
      () => gate.submit({ ...request(payload.enhanceRequestId, result.fromLevel, result.instanceRef), useProtectCharm: !result.useProtectCharm }),
      'duplicate', `design28 C06/C07${payload.state}：护符意图冲突仍拒绝重复`);
    eq('result' in charmConflict && charmConflict.result !== undefined, false, `design28 C06/C07${payload.state}：护符意图冲突不附旧结果`);
    if (payload.formalInstanceSource) {
      const samples = sampleCount, writes = idb.writes, before = loaded.exportSave();
      ok(gate.enhance(request('fresh-formal-preview', result.finalLevel, result.instanceRef)).allowed,
        `O05${payload.state}：同档正式来源在全新Gate仍可选择下一档`);
      eq(loaded.exportSave(), before, 'O05正式重新选择只读保留原身份和完整结果');
      eq([sampleCount, idb.writes], [samples, writes], 'O05正式重新选择不重抽不扣费');
    } else await formalUnchanged(loaded, () => gate.submit(request('fresh-without-authorization', result.finalLevel, result.instanceRef)),
      'no_instance', `C02/C08${payload.state}：完整历史夹具袋不授权新submit`);
  }
  /** design/28 C 表映射回归；本窗 O01–O06 全表由 protectCharmOpenCases 独立执行。 */
  async function protectCharmMappingCases() {
    const mapping = protectCharmMap as Record<string, unknown>;
    eq(mapping, { itemId: 'protect_charm', countPerSettlement: 1 }, 'design28 C08正式映射只读取得本窗N=1');
    ok(ITEMS.protect_charm, 'design28 C08合并后的ITEMS存在正式护符资格记录');
    const mappingBefore = Object.getOwnPropertyDescriptors(mapping), itemBefore = ITEMS.protect_charm;
    async function withMappingMutation(mutate: () => void, action: () => Promise<void>) {
      try { mutate(); await action(); }
      finally {
        for (const key of Reflect.ownKeys(mapping)) Reflect.deleteProperty(mapping, key);
        Object.defineProperties(mapping, mappingBefore);
        ITEMS.protect_charm = itemBefore;
      }
    }
    const brokenMappings: [string, () => void][] = [
      ['missing-map-fields', () => { delete mapping.itemId; delete mapping.countPerSettlement; }],
      ['missing-itemId', () => { delete mapping.itemId; }],
      ['wrong-itemId', () => { mapping.itemId = 'refine_stone'; }],
      ['missing-N', () => { delete mapping.countPerSettlement; }],
      ...[0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null].map(value =>
        [`invalid-N-${String(value)}`, () => { mapping.countPerSettlement = value; }] as [string, () => void]),
      ['missing-ITEMS-registration', () => { delete ITEMS.protect_charm; }],
      ...[
        ['phase', { phase: GAME_PHASE + 1 }], ['phaseMin', { phaseMin: GAME_PHASE + 1 }],
        ['phaseMax', { phaseMax: GAME_PHASE - 1 }], ['enabled', { enabled: false }],
        ['placeholder', { placeholder: true }], ['qualityEnabled', { qualityEnabled: true }],
      ].map(([name, patch]) => [String(name), () => { ITEMS.protect_charm = { ...itemBefore, ...patch as object }; }] as [string, () => void]),
    ];
    for (const [name, mutate] of brokenMappings) await withMappingMutation(mutate, async () => {
      const f = fixture(); f.p.inventory.protect_charm = 7;
      const input = { ...request(`mapping-${name}`), useProtectCharm: true };
      await formalUnchanged(f.p, () => f.gate.enhance(input), 'protect', `design28 C02/C05${name}即使库存有符仍拒绝预览`);
      await formalUnchanged(f.p, () => f.gate.submit(input), 'protect', `design28 C02/C05${name}即使库存有符仍拒绝提交`);
      eq(f.p.count('protect_charm'), 7, 'design28 C02映射未齐不消费也不静默改false');
    });
    // false 路径不得读取护符映射、登记或库存。Getter 若被触碰会立即抛错并使分类断言失败。
    let falseCharmReads = 0;
    await withMappingMutation(() => {
      const fail = () => { falseCharmReads++; throw new Error('false路径不得读护符映射或资格'); };
      Object.defineProperties(mapping, { itemId: { configurable: true, get: fail }, countPerSettlement: { configurable: true, get: fail } });
      delete ITEMS.protect_charm;
    }, async () => {
      for (const [kind, hasInstance, resources] of [['missing-instance', false, true], ['missing-base-resources', true, false]] as const) {
        const f = fixture(); delete f.p.inventory.protect_charm;
        if (!resources) f.p.stones = 0;
        const gate = hasInstance ? f.gate : new EnhanceGate(f.p);
        const originalCount = f.p.count, originalPermanent = f.p.permanentCount;
        try {
          f.p.count = function (id: string) { if (id === 'protect_charm') falseCharmReads++; return originalCount.call(this, id); };
          f.p.permanentCount = function (id: string) { if (id === 'protect_charm') falseCharmReads++; return originalPermanent.call(this, id); };
          await formalUnchanged(f.p, () => gate.enhance(request(`false-${kind}-preview`)), hasInstance ? 'resources' : 'no_instance', `design28 C03${kind}无映射无符预览`);
          await formalUnchanged(f.p, () => gate.submit(request(`false-${kind}-submit`)), hasInstance ? 'resources' : 'no_instance', `design28 C03${kind}无映射无符提交`);
        } finally { f.p.count = originalCount; f.p.permanentCount = originalPermanent; }
      }
      const f = fixture(); delete f.p.inventory.protect_charm;
      ok(f.gate.enhance(request('false-valid-no-map')).allowed, 'design28 C03无符合法实例预览不依赖护符映射');
      sampled = 0;
      eq(committed(await f.gate.submit(request('false-committed-no-map'))).useProtectCharm, false, 'design28 C03既有false路径无护符登记/N/库存仍可结算');
    });
    eq(falseCharmReads, 0, 'design28 C03 false对护符映射资格库存零读取');

    // 携符不授予装备身份、类型、等级或跨档权限。
    for (const [name, instances, input, reason, missingOwned] of [
      ['no-source', undefined, request('charm-no-source'), 'no_instance', false],
      ['itemId-is-not-instanceRef', [instance()], request('charm-item-id', 0, 'bamboo_sword'), 'no_instance', false],
      ['foreign', [instance()], request('charm-foreign'), 'foreign', true],
      ['bad-type', [{ ...instance(), type: 'shoes' }], request('charm-bad-type'), 'bad_type', false],
      ['stale-level', [instance(1)], request('charm-stale-level'), 'max_level', false],
      ['max-level', [instance(enhance.maxLevel)], request('charm-max-level', enhance.maxLevel), 'max_level', false],
    ] as const) {
      const f = fixture(0, 'weapon', instances as Instance[] | undefined); f.p.inventory.protect_charm = 7;
      if (missingOwned) delete f.p.inventory.bamboo_sword;
      const gate = instances === undefined ? new EnhanceGate(f.p) : f.gate;
      const protectedInput = { ...input, useProtectCharm: true };
      await formalUnchanged(f.p, () => gate.enhance(protectedInput), reason, `design28 C04/C05携符${name}预览仍拒绝`);
      await formalUnchanged(f.p, () => gate.submit(protectedInput), reason, `design28 C04/C05携符${name}提交仍拒绝`);
    }
    for (const pollution of ['zero', 'transient', 'pillQualities']) {
      const f = fixture(); f.p.inventory.protect_charm = pollution === 'zero' ? 0 : 7;
      if (pollution === 'transient') (f.p as any).transientItems = { protect_charm: 1 };
      if (pollution === 'pillQualities') f.p.pillQualities.protect_charm = { low: 7 };
      const input = { ...request(`charm-inventory-${pollution}`), useProtectCharm: true };
      await formalUnchanged(f.p, () => f.gate.enhance(input), 'resources', `design28 C05${pollution}不可消费护符拒绝预览`);
      await formalUnchanged(f.p, () => f.gate.submit(input), 'resources', `design28 C05${pollution}不可消费护符拒绝提交`);
    }
    await withMappingMutation(() => { mapping.countPerSettlement = 2; }, async () => {
      const f = fixture(); f.p.inventory.protect_charm = 1;
      await formalUnchanged(f.p, () => f.gate.submit({ ...request('charm-less-than-N'), useProtectCharm: true }),
        'resources', 'design28 C05库存小于映射N整笔拒绝，不猜N或部分扣除');
    });

    const protectedPayloads: Payload[] = [];
    for (const [name, level, random, success] of [['success', 0, 0, true], ['failure-kept', 5, 0.999999, false]] as const) {
      const f = fixture(level); f.p.inventory.protect_charm = 3;
      const input = { ...request(`protect-charm-${name}`, level), useProtectCharm: true };
      const row = enhance.levels.find(row => row.to === input.to)!, before = f.p.exportSave(), writes = idb.writes,
        samples = sampleCount, commits = idb.commits;
      sampled = random;
      ok(f.gate.enhance(input).allowed, 'design28 C08齐备足量护符只读预览允许且不消费');
      eq(f.p.exportSave(), before, 'design28 C08带符预览保持整档原样');
      const result = committed(await f.gate.submit(input)), finalLevel = success ? input.to : level;
      eq(result.useProtectCharm, true, 'design28最小接线旁证结果持久记录护符true');
      eq(result.success, success, 'design28最小接线旁证按目标原rate正常抽样');
      eq({ to: result.to, rate: result.rate, stones: result.stones, refineStones: result.refineStones, dropOnFail: result.dropOnFail }, row,
        'design28最小接线旁证不改目标rate且dropOnFail保留原审计值');
      if (!success) eq(row.dropOnFail, true, 'design28最小失败旁证明确覆盖原配置会掉级的目标行');
      eq(result.finalLevel, finalLevel, 'design28最小接线旁证成功升to、护符失败保fromLevel');
      eq(result.attributes, attributes('weapon', finalLevel), 'design28最小接线旁证属性严格对应最终等级');
      eq(f.p.enhance!.instances[0].enhanceLevel, finalLevel, 'design28最小接线旁证最终等级同次入袋');
      eq([f.p.stones, f.p.count('refine_stone'), f.p.count('protect_charm')],
        [Number(before.stones) - row.stones, 100 - row.refineStones, 2], 'design28成功与正常失败同扣灵石精炼石及护符N=1');
      eq([f.p.count('bamboo_sword'), f.p.count('rabbit_fur')], [2, 7], 'design28失败不碎装、不变更旁路资产');
      eq([idb.writes, idb.commits, sampleCount], [writes + 1, commits + 1, samples + 1], 'design28费用等级属性结果去重同一提交且只抽一次');
      const disk = (await saveStore.readSlot(1))!.data;
      eq([disk.enhance, disk.inventory, disk.stones], [f.p.enhance, f.p.inventory, f.p.stones], 'design28护符消费与完整结果同次落盘');
      ok(isValidEnhanceProgress(f.p.enhance), 'design28 true结果及失败保级满足最小结构放开');
      for (const value of [undefined, 'true', null]) {
        const corrupt = copy(f.p.enhance) as any; corrupt.enhancements[0].useProtectCharm = value;
        eq(isValidEnhanceProgress(corrupt), false, 'design28结构仍要求useProtectCharm为boolean');
      }
      await replay(f.p, new EnhanceGate(f.p), input, 'design28 C06护符请求只读重放不二次消费');
      const conflict = await formalUnchanged(f.p, () => f.gate.submit({ ...input, useProtectCharm: false }), 'duplicate', 'design28 C06护符true旧请求改false仍拒绝');
      eq('result' in conflict && conflict.result !== undefined, false, 'design28 C06护符载荷冲突不附旧结果');
      await withMappingMutation(() => { delete mapping.countPerSettlement; delete ITEMS.protect_charm; }, async () => {
        await replay(f.p, new EnhanceGate(f.p), input, 'design28 C06/C07已提交true结果不依赖后来失效的映射');
        const refreshed = await formalUnchanged(f.p, () => new EnhanceGate(f.p).loadRefresh(), 'load_dedupe', 'design28 C07后来缺N和登记仍只读已提交完整结果');
        eq('progress' in refreshed ? refreshed.progress : null, f.p.enhance, 'design28 C07映射失效后load_dedupe不补扣不改旧结果');
        eq(committed(new EnhanceGate(f.p).level(input.enhanceRequestId)), result, 'design28 C07映射失效后level仅读旧结果');
        eq(committed(new EnhanceGate(f.p).consume(input.enhanceRequestId)), result, 'design28 C07映射失效后consume不补做消费');
      });
      // 已提交去重不再要求补齐当下护符；这里只读改变测试库存，随后恢复原已提交快照。
      f.p.inventory.protect_charm = 0;
      await replay(f.p, new EnhanceGate(f.p), input, 'design28 C06已消费后当前无符仍只读识别旧结果');
      f.p.inventory.protect_charm = 2;
      protectedPayloads.push({ state: `protect-charm-${name}`, enhanceRequestId: input.enhanceRequestId, save: f.p.exportSave() });
    }
    for (const payload of protectedPayloads) await roundtrip(payload);
    payloads.push(...protectedPayloads);
    const originalRemove = Progress.prototype.removeItem;
    try {
      for (const throws of [false, true]) {
        Progress.prototype.removeItem = function (id: string, amount: number) {
          if (id === 'protect_charm') { if (throws) throw new Error('护符消费端受控失败'); return; }
          return originalRemove.call(this, id, amount);
        };
        const f = fixture(); f.p.inventory.protect_charm = 2; sampled = 0;
        await unchanged(f.p, () => f.gate.submit({ ...request(`charm-remove-failed-${throws}`), useProtectCharm: true }),
          'design28 C05护符真实扣除端无效或抛错时基础费用结果等级同笔回滚');
      }
    } finally { Progress.prototype.removeItem = originalRemove; }
    const aborted = fixture(); aborted.p.inventory.protect_charm = 2; sampled = 0;
    eq(await aborted.p.save({ async: true }), true, 'design28 C05新增护符消费中断前保存完整旧档');
    const beforeAbort = aborted.p.exportSave(), abortDisk = (await saveStore.readSlot(1))!.data;
    const hold = idb.holdNextCommit(), pending = aborted.gate.submit({ ...request('charm-aborted'), useProtectCharm: true });
    await hold.started;
    eq(aborted.p.exportSave(), beforeAbort, 'design28 C05IDB complete前不发布护符费用等级结果');
    idb.abortNextCommit(); hold.release(); businessDenied(await pending, 'design28 C05护符同事务中断明确拒绝');
    eq(aborted.p.exportSave(), beforeAbort, 'design28 C05护符消费中断内存整笔回滚');
    eq((await saveStore.readSlot(1))!.data, abortDisk, 'design28 C05护符消费中断磁盘整笔回滚');
    const rapid = fixture(); rapid.p.inventory.protect_charm = 2; sampled = 0;
    const input = { ...request('protect-charm-rapid'), useProtectCharm: true }, writes = idb.writes, samples = sampleCount;
    const rapidResults = await Promise.all([rapid.gate.submit(input), new EnhanceGate(rapid.p, fixtureOptions()).submit(copy(input)), rapid.gate.submit(copy(input))]);
    eq(rapidResults.filter(result => result.allowed).length, 1, 'design28 C06带符连点与跨Gate同请求只完整提交一次');
    eq([rapid.p.count('protect_charm'), rapid.p.enhance!.enhancements.length, rapid.p.enhance!.receipts.length], [1, 1, 1], 'design28 C06带符连点只消费N并产生一份结果去重');
    eq([idb.writes, sampleCount], [writes + 1, samples + 1], 'design28 C06带符连点只写一次抽一次');
    await replay(rapid.p, rapid.gate, input, 'design28 C06带符连点完成后duplicate只读');
    const oldSlot = Progress.getActiveSlot();
    try {
      Progress.setActiveSlot(2); const other = fixture(); other.p.inventory.protect_charm = 2;
      await formalUnchanged(other.p, () => new EnhanceGate(other.p).submit(input), 'no_instance', 'design28 C07另一档同请求有符也不借原档授权');
      await formalUnchanged(other.p, () => new EnhanceGate(other.p).level(input.enhanceRequestId), 'no_instance', 'design28 C07另一档不读取原档结果或消费事实');
      const result = committed(await other.gate.submit(input));
      ok(result.enhanceResultRef !== rapid.p.enhance!.enhancements[0].enhanceResultRef, 'design28 C07显式夹具另档同id拥有独立账本');
      eq(other.p.count('protect_charm'), 1, 'design28 C07另一档只扣本档护符N');
      eq(rapid.p.count('protect_charm'), 1, 'design28 C07跨档不修改原档库存');
    } finally { Progress.setActiveSlot(oldSlot); }
    eq(mapping, { itemId: 'protect_charm', countPerSettlement: 1 }, 'design28测试后恢复正式映射原值');
    eq(ITEMS.protect_charm, itemBefore, 'design28测试后恢复正式ITEMS资格对象');
    return { cases: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'],
      acceptanceDesign: 'design/28', mappingMutations: brokenMappings.map(([name]) => name),
      falseCharmReads, missingCharmTip: 'enhance.formal.resources', incompleteMappingTip: 'enhance.formal.protect',
      zeroSideEffects: true, duplicatePayloadIncludesUseProtectCharm: true, loadDedupeWithoutSupplement: true,
      explicitFixtureOnly: true, productionFixtureInstances: false, minimalWiringProof: ['success-consumes-N', 'dropOnFail-failure-keeps-level-and-consumes-N', 'missing-charm-resources'],
      openFixtureTableExecuted: false, softOpenedProtectCharm: true, released: false };
  }
  /** design/28 §4.3 O01–O06：护符 soft-open 正式磁盘图；仅取默认 Forge 正式来源，测试显式准备库存。 */
  async function protectCharmOpenCases() {
    const recipe = recipes.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword')!;
    const n = protectCharmMap.countPerSettlement;
    eq(n, 1, 'design28 O01正式映射N保持1');
    let sourceSequence = 0;
    const options = () => ({ random: () => { sampleCount++; return sampled; } });
    async function source(name: string, level = 0) {
      const p = new Progress(); progresses.push(p); p.stones = 100000;
      p.inventory = { [recipe.blueprint!]: 10, spirit_copper: 10, refine_stone: 100, protect_charm: 3, rabbit_fur: 7 };
      const forge = new ForgeGate(p, { random: () => 0, ledgerId: () => `${dataMode}-protect-source-${++sourceSequence}` });
      const craft = (id: string) => forge.submit({ craftRequestId: id, blueprintId: recipe.blueprint!,
        materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })) });
      const forged = await craft(`protect-${name}-source`);
      ok(forged.allowed && forged.result, 'design28 O01默认Forge完整成品提供正式实例来源');
      const ref = forged.result.resultItem.instanceRef, gate = new EnhanceGate(p, options());
      eq(p.formalEnhanceInstanceStatus(ref), 'registered', 'design28 O01正式来源属于本档');
      eq(Object.prototype.hasOwnProperty.call(options(), 'fixtureInstances'), false, 'design28 O表不注入fixtureInstances');
      for (let from = 0; from < level; from++) {
        sampled = 0; committed(await gate.submit(request(`protect-${name}-prepare-${from}`, from, ref)));
      }
      return { p, gate, ref, craft };
    }
    const inputFor = (id: string, ref: string, from = 0) => ({ ...request(id, from, ref), useProtectCharm: true });
    const proofs: Payload[] = [];
    for (const [state, level, random, success, dropOnFail] of [
      ['protect-open-success', 0, 0, true, false],
      ['protect-open-failure-no-drop', 4, 0.999999, false, false],
      ['protect-open-failure-drop-kept', 5, 0.999999, false, true],
    ] as const) {
      const f = await source(state, level), input = inputFor(state, f.ref, level), row = enhance.levels.find(row => row.to === input.to)!;
      const before = f.p.exportSave(), writes = idb.writes, commits = idb.commits, samples = sampleCount,
        history = f.p.enhance!.enhancements.length, receipts = f.p.enhance!.receipts.length, sources = copy(f.p.enhance!.formalSources);
      sampled = random;
      const preview = f.gate.enhance(input);
      ok(preview.allowed, 'design28 O01/O02足符合法正式实例允许只读预览');
      eq('row' in preview ? preview.row : null, row, 'design28 O01/O02预览保持原rate与目标行');
      eq(f.p.exportSave(), before, 'design28 O01/O02预览不消费或建结果');
      const result = committed(await f.gate.submit(input)), finalLevel = success ? input.to : level;
      eq(result.state, 'committed', 'design28 O01/O02只产生完整committed结果');
      eq([result.instanceRef, result.itemId, result.type, result.fromLevel, result.to, result.useProtectCharm],
        [f.ref, 'bamboo_sword', 'weapon', level, level + 1, true], 'design28 O01/O02保留原正式实例身份及护符意图');
      eq({ to: result.to, rate: result.rate, stones: result.stones, refineStones: result.refineStones, dropOnFail: result.dropOnFail }, row,
        'design28 O01/O02成功率与原dropOnFail审计值原样记录');
      eq([result.success, result.finalLevel, result.dropOnFail], [success, finalLevel, dropOnFail],
        'design28 O01/O02成功到to；两类dropOnFail正常失败均保fromLevel');
      eq(result.attributes, attributes('weapon', finalLevel), 'design28 O01/O02属性严格对应最终合法等级');
      eq(f.p.enhance!.instances, [{ instanceRef: f.ref, itemId: 'bamboo_sword', type: 'weapon', enhanceLevel: finalLevel }],
        'design28 O01/O02等级同次生效且不替换instanceRef');
      const inventory = before.inventory as Record<string, number>;
      eq([f.p.stones, f.p.count('refine_stone'), f.p.count('protect_charm')],
        [Number(before.stones) - row.stones, inventory.refine_stone - row.refineStones, inventory.protect_charm - n],
        'design28 O01/O02灵石精炼石护符同次各消费一次，成功失败同N');
      eq([f.p.count('bamboo_sword'), f.p.count('rabbit_fur')], [1, 7], 'design28 O02失败不碎装不变旁路资产');
      eq([f.p.enhance!.enhancements.length, f.p.enhance!.receipts.length], [history + 1, receipts + 1],
        'design28 O01/O02结果与去重同时各增加一份');
      eq(f.p.enhance!.enhancements[f.p.enhance!.enhancements.length - 1], result, 'design28 O01/O02返回结果与持久袋完整一致');
      eq(f.p.enhance!.receipts[f.p.enhance!.receipts.length - 1], result.enhanceResultRef, 'design28 O01/O02 receipt精确绑定结果');
      eq(f.p.enhance!.formalSources, sources, 'design28 O01/O02来源证明保持原样');
      eq(experience(f.p), [before.forgingLevel, before.forgingExp], 'design28 O01/O02不改变品质生活技能经验');
      eq([idb.writes, idb.commits, sampleCount], [writes + 1, commits + 1, samples + 1],
        'design28 O01/O02三项费用等级属性结果去重同一提交只抽一次');
      const disk = (await saveStore.readSlot(1))!.data;
      eq([disk.inventory, disk.stones, disk.enhance], [f.p.inventory, f.p.stones, f.p.enhance],
        'design28 O01/O02磁盘三项消费与完整结果一致');
      await replay(f.p, new EnhanceGate(f.p), input, 'design28 O04成功或两类失败重放只认匹配结果');
      const conflict = await formalUnchanged(f.p, () => new EnhanceGate(f.p).submit({ ...input, useProtectCharm: false }),
        'duplicate', 'design28 O04 true结果换false拒绝冲突');
      eq('result' in conflict && conflict.result !== undefined, false, 'design28 O04冲突不返回冒认旧结果');
      const payload = { state, enhanceRequestId: input.enhanceRequestId, save: f.p.exportSave(), formalInstanceSource: true };
      eq(await f.p.save({ async: true }), true, 'design28 O05结算后再次保存完整结果');
      await roundtrip(payload); proofs.push(payload);
    }
    payloads.push(...proofs);
    for (const kind of ['zero', 'transient-only', 'quality-only'] as const) {
      const f = await source(`missing-${kind}`); f.p.inventory.protect_charm = kind === 'quality-only' ? 1 : 0;
      if (kind === 'transient-only') (f.p as any).transientItems = { protect_charm: 1 };
      if (kind === 'quality-only') f.p.pillQualities.protect_charm = { low: 1 };
      const input = inputFor(`protect-open-missing-${kind}`, f.ref);
      await formalUnchanged(f.p, () => f.gate.enhance(input), 'resources', `design28 O03${kind}可消费量小于N预览整笔拒绝`);
      await formalUnchanged(f.p, () => f.gate.submit(input), 'resources', `design28 O03${kind}提交不降格false不部分扣费`);
    }
    for (const kind of ['same-id', 'same-instance', 'shared-charm'] as const) {
      const f = await source(`race-${kind}`), refs = [f.ref, f.ref];
      if (kind === 'shared-charm') {
        const other = await f.craft('protect-open-second-asset'); ok(other.allowed && other.result, 'design28 O04共享护符的第二件装备来自正式打造');
        refs[1] = other.result.resultItem.instanceRef; f.p.inventory.protect_charm = n;
      }
      const before = f.p.exportSave(), writes = idb.writes, samples = sampleCount; sampled = 0;
      const inputs = refs.map((ref, i) => inputFor(`protect-open-race-${kind}-${kind === 'same-id' ? 0 : i}`, ref));
      const results = await Promise.all(inputs.map(input => new EnhanceGate(f.p, options()).submit(input)));
      eq(results.filter(row => row.allowed).length, 1, 'design28 O04同id/同实例旧等级/共享单张符争用至多完成一笔');
      const row = enhance.levels[0], inventory = before.inventory as Record<string, number>;
      eq([f.p.stones, f.p.count('refine_stone'), f.p.count('protect_charm')],
        [Number(before.stones) - row.stones, inventory.refine_stone - row.refineStones, inventory.protect_charm - n],
        'design28 O04共享库存仅一次完整消费，无负库存');
      eq([f.p.enhance!.enhancements.length, f.p.enhance!.receipts.length,
        f.p.enhance!.instances.reduce((sum, row) => sum + row.enhanceLevel, 0)], [1, 1, 1],
        'design28 O04唯一结果去重且旧等级不重复升档');
      eq([idb.writes, sampleCount], [writes + 1, samples + 1], 'design28 O04竞态仅一次写入抽样');
      await replay(f.p, new EnhanceGate(f.p), inputs[results.findIndex(row => row.allowed)], 'design28 O04竞态完成后的只读重放');
    }
    const independent = await source('independent-race'); independent.p.inventory.protect_charm = n;
    eq(await independent.p.save({ async: true }), true, 'design28 O04独立Progress争用前保存单张符基线');
    const contenders = await Promise.all([Progress.load({ async: true, slot: 1 }), Progress.load({ async: true, slot: 1 })]);
    progresses.push(...contenders);
    const independentWrites = idb.writes, independentSamples = sampleCount; sampled = 0;
    const independentInputs = contenders.map((_, i) => inputFor(`protect-open-independent-${i}`, independent.ref));
    const independentResults = await Promise.all(contenders.map((p, i) => new EnhanceGate(p, options()).submit(independentInputs[i])));
    eq(independentResults.filter(row => row.allowed).length, 1, 'design28 O04同槽独立Progress共享正式实例和单张符只一笔完成');
    eq([idb.writes, sampleCount], [independentWrites + 1, independentSamples + 1], 'design28 O04独立对象同槽只一次消费提交抽样');
    const loser = independentResults.findIndex(row => !row.allowed), stale = contenders[loser];
    await unchanged(stale, () => new EnhanceGate(stale, options()).submit(inputFor('protect-open-stale-retry', independent.ref)),
      'design28 O04旧Progress后续提交不得覆盖已提交结果或重用旧等级库存');
    const racedLoad = await Progress.load({ async: true, slot: 1 }); progresses.push(racedLoad);
    eq([racedLoad.count('protect_charm'), racedLoad.enhance!.enhancements.length, racedLoad.enhance!.instances[0].enhanceLevel], [0, 1, 1],
      'design28 O04重读磁盘仅一份结果和N消费事实');

    const historic = await source('historical-false'); historic.p.inventory.protect_charm = 0; sampled = 0;
    const historicalInput = request('protect-open-historical-false', 0, historic.ref);
    const historicalResult = committed(await historic.gate.submit(historicalInput)), historicalBefore = historic.p.exportSave();
    eq(historicalResult.useProtectCharm, false, 'design28 O05历史无符提交仍不依赖护符');
    const mapping = protectCharmMap as Record<string, unknown>, originalN = mapping.countPerSettlement;
    try {
      mapping.countPerSettlement = 2;
      await replay(historic.p, new EnhanceGate(historic.p), historicalInput, 'design28 O05当前N变化不追扣历史false');
      await formalUnchanged(historic.p, () => new EnhanceGate(historic.p).loadRefresh(), 'load_dedupe', 'design28 O05当前N变化后历史false刷新零补扣');
      eq(committed(new EnhanceGate(historic.p).consume(historicalInput.enhanceRequestId)), historicalResult,
        'design28 O05历史false消费查询仅读原结果');
    } finally { mapping.countPerSettlement = originalN; }
    eq(historic.p.exportSave(), historicalBefore, 'design28 O05历史无符结果库存等级原样保留');
    const reverseConflict = await formalUnchanged(historic.p,
      () => historic.gate.submit({ ...historicalInput, useProtectCharm: true }), 'duplicate', 'design28 O04历史false改true拒绝冲突');
    eq('result' in reverseConflict && reverseConflict.result !== undefined, false, 'design28 O04 false/true冲突不借旧结果');
    eq(await racedLoad.save({ async: true }), true, 'design28 O05跨档前保存A档对应库存与结果基线');
    const firstSlot = Progress.getActiveSlot(), firstSave = racedLoad.exportSave();
    try {
      Progress.setActiveSlot(2); const other = await source('cross-slot');
      const reusedId = independentInputs[independentResults.findIndex(row => row.allowed)].enhanceRequestId;
      let absentResult!: GateResult;
      await unchanged(other.p, () => { absentResult = other.gate.level(reusedId); return absentResult; },
        'design28 O05另档不混认同请求旧结果');
      eq('result' in absentResult && absentResult.result !== undefined, false, 'design28 O05另档查询无A档结果');
      await formalUnchanged(other.p, () => other.gate.submit(inputFor(reusedId, independent.ref)), 'no_instance', 'design28 O05另档有符也不借A档实例');
      sampled = 0; const own = committed(await other.gate.submit(inputFor(reusedId, other.ref)));
      ok(own.enhanceResultRef !== racedLoad.enhance!.enhancements[0].enhanceResultRef, 'design28 O05跨档同请求id独立结果引用');
      eq(other.p.count('protect_charm'), 3 - n, 'design28 O05跨档只消费B档N');
      eq(racedLoad.exportSave(), firstSave, 'design28 O05跨档不修改A档库存等级和结果');
      eq((await saveStore.readSlot(1))!.data.enhance, firstSave.enhance, 'design28 O05B档保存不覆盖A档已提交结果');
    } finally { Progress.setActiveSlot(firstSlot); }

    for (const [name, sentinel] of [
      ['reject', () => false], ['throw', () => { throw new Error('design28 O06受控承载失败'); }],
      ['mutate-charm', (draft: Progress) => { draft.inventory.protect_charm++; return true; }],
      ['mutate-stones', (draft: Progress) => { draft.stones++; return true; }],
      ['mutate-instance', (draft: Progress) => { draft.enhance!.instances[0].enhanceLevel++; return true; }],
    ] as const) {
      const f = await source(`carrier-${name}`); sampled = 0;
      const disk = (await saveStore.readSlot(1))!.data, commits = idb.commits;
      await unchanged(f.p, () => new EnhanceGate(f.p, { ...options(), canCommitResult: sentinel })
        .submit(inputFor(`protect-open-carrier-${name}`, f.ref)), 'design28 O06承载拒绝异常或草稿资源等级篡改整笔回滚');
      eq((await saveStore.readSlot(1))!.data, disk, 'design28 O06承载失败保留原磁盘合法资产');
      eq(idb.commits, commits, 'design28 O06承载失败无持久提交');
    }
    for (const resource of ['protect_charm', 'refine_stone', 'stones'] as const) {
      const f = await source(`transaction-change-${resource}`), original = f.p.runSaveTransactionAsync;
      const disk = (await saveStore.readSlot(1))!.data, writes = idb.writes, samples = sampleCount;
      let expected!: Record<string, unknown>;
      try {
        f.p.runSaveTransactionAsync = function <T>(apply: (draft: Progress) => T | undefined) {
          if (resource === 'stones') this.stones = 0; else this.inventory[resource] = 0;
          expected = this.exportSave(); return original.call(this, apply) as Promise<T | undefined>;
        };
        formalDenied(await f.gate.submit(inputFor(`protect-open-transaction-change-${resource}`, f.ref)), 'resources',
          'design28 O06预检后事务前资源变化须在真实草稿再次拒绝');
      } finally { f.p.runSaveTransactionAsync = original; }
      eq(f.p.exportSave(), expected, 'design28 O06保留外部合法资源变化，不补扣或产生半等级');
      eq((await saveStore.readSlot(1))!.data, disk, 'design28 O06事务再校验拒绝保持原磁盘');
      eq([idb.writes, sampleCount], [writes, samples], 'design28 O06事务资源不足零写零抽样');
    }
    const failedSave = await source('save-failure'), failedDisk = (await saveStore.readSlot(1))!.data;
    const backend = createIndexedDbBackend(idb.factory); let failedWrites = 0; sampled = 0;
    try {
      setSaveBackend({ ...backend, async write() { failedWrites++; throw new Error('design28 O06受控存储写入失败'); } });
      await unchanged(failedSave.p, () => failedSave.gate.submit(inputFor('protect-open-save-failure', failedSave.ref)),
        'design28 O06保存后端失败费用等级结果整笔保留原状态');
    } finally { setSaveBackend(createIndexedDbBackend(idb.factory)); }
    eq(failedWrites, 1, 'design28 O06真实保存路径实际到达失败后端一次');
    eq((await saveStore.readSlot(1))!.data, failedDisk, 'design28 O06保存失败磁盘无半消费');
    const interrupted = await source('interrupted'), before = interrupted.p.exportSave(), disk = (await saveStore.readSlot(1))!.data;
    const hold = idb.holdNextCommit(), input = inputFor('protect-open-interrupted', interrupted.ref), samples = sampleCount;
    const pending = interrupted.gate.submit(input); await hold.started;
    eq(interrupted.p.exportSave(), before, 'design28 O06提交中断前complete未到不发布半费用等级');
    eq((await saveStore.readSlot(1))!.data, disk, 'design28 O06complete前磁盘仍原合法状态');
    idb.abortNextCommit(); hold.release(); businessDenied(await pending, 'design28 O06IDB提交中断明确拒绝');
    eq(interrupted.p.exportSave(), before, 'design28 O06中断内存三项费用等级结果整笔回滚');
    eq((await saveStore.readSlot(1))!.data, disk, 'design28 O06中断磁盘整笔保留');
    eq(sampleCount, samples + 1, 'design28 O06中断仅丢弃未提交抽样不自动重抽');
    sampled = 0; const retried = committed(await interrupted.gate.submit(input));
    eq([interrupted.p.count('protect_charm'), interrupted.p.enhance!.enhancements.length, interrupted.p.enhance!.receipts.length],
      [3 - n, 1, 1], 'design28 O06显式重试仅完整提交一次与N消费');
    await replay(interrupted.p, new EnhanceGate(interrupted.p), input, 'design28 O06重试完成后只读旧结果');
    const good = interrupted.p.exportSave();
    for (const [name, damage] of [
      ['pending', (bag: any) => { bag.enhancements[0].state = 'pending'; }],
      ['missing-receipt', (bag: any) => { bag.receipts = []; }],
      ['invalid-boolean', (bag: any) => { bag.enhancements[0].useProtectCharm = 'true'; }],
      ['half-level', (bag: any) => { bag.instances[0].enhanceLevel++; }],
    ] as const) {
      const corrupt = copy(good) as any; damage(corrupt.enhance);
      eq(isValidEnhanceProgress(corrupt.enhance), false, 'design28 O06损坏护符旧记录结构不合法');
      const legalBefore = interrupted.p.exportSave(), writes = idb.writes, samples = sampleCount;
      eq(await interrupted.p.importSave(corrupt, { async: true }), false, 'design28 O06损坏护符结果import拒绝不修档');
      eq(interrupted.p.exportSave(), legalBefore, 'design28 O06损坏导入保留合法资产与完整旧结果');
      const p = new Progress(); progresses.push(p); Object.assign(p, copy(corrupt));
      const gate = new EnhanceGate(p, options());
      await unchanged(p, () => gate.submit(inputFor(`protect-open-corrupt-${name}`, interrupted.ref, retried.finalLevel)),
        'design28 O06损坏旧结果不当空袋补做');
      await unchanged(p, () => gate.loadRefresh(), 'design28 O06损坏记录刷新不修复或自动结算');
      eq([idb.writes, sampleCount], [writes, samples], 'design28 O06损坏旧记录零写零重抽');
    }
    eq(new EnhanceGate(interrupted.p).laterService(), Closed.refuseLaterService(),
      'design28 O表全程附灵分解仍enhance.closed.later_service');
    return { acceptanceDesign: 'design/28 §4.3 O01–O06', cases: ['O01', 'O02', 'O03', 'O04', 'O05', 'O06'],
      source: 'default-ForgeGate-committed-result', productionFixtureInstances: false, explicitInventoryInjection: true,
      O01: { executed: true, evidenceKeys: ['formal-protected-success', 'original-rate', 'three-costs-one-commit', 'identity-attributes-result-receipt'] },
      O02: { executed: true, dropOnFailTargets: [5, 6], evidenceKeys: ['failure-no-drop', 'failure-drop-kept', 'same-N', 'complete-result-once'] },
      O03: { executed: true, missingCharmTip: 'enhance.formal.resources', evidenceKeys: ['zero', 'transient-only', 'quality-only', 'zero-business-delta-no-false-fallback'] },
      O04: { executed: true, evidenceKeys: ['same-request-replay', 'true-false-payload-conflict', 'same-instance-old-level', 'shared-single-charm', 'independent-Progress-same-slot', 'stale-retry-denied'] },
      O05: { executed: true, refreshStates: proofs.map(row => row.state), evidenceKeys: ['save-import-restore-IDB-load', 'fresh-SSR-payloads', 'cross-slot-same-request-isolation', 'historical-false-no-retrocharge'] },
      O06: { executed: true, evidenceKeys: ['carrier-false-throw-draft-tamper', 'transaction-resource-recheck', 'save-backend-failure', 'IDB-interruption-complete-boundary', 'explicit-retry-once', 'corrupt-protected-history-no-repair'] },
      protectCharmOpenFixtureTableExecuted: true, softOpenedProtectCharm: true, released: false };
  }
  /** 正式 O 表：只从默认 ForgeGate 的完整成品登记取实例，强化从不注入 fixtureInstances。 */
  async function formalInstanceCases() {
    const recipe = recipes.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword')!;
    ok(recipe, 'O01使用正式recipes已有打造行');
    let forgeSequence = 0, forgeSamples = 0;
    const productionOptions = () => ({ random: () => { sampleCount++; return sampled; } });
    eq(Object.prototype.hasOwnProperty.call(productionOptions(), 'fixtureInstances'), false, 'O01正式O表强化选项不注入fixtureInstances');
    function prepare() {
      const p = new Progress(); progresses.push(p); p.stones = 100000;
      p.inventory = { [recipe.blueprint!]: 10, refine_stone: 100, spirit_copper: 10, rabbit_fur: 7 };
      const forge = new ForgeGate(p, { random: () => { forgeSamples++; return 0; },
        ledgerId: () => `${dataMode}-formal-forge-${++forgeSequence}` });
      const craft = (id: string) => forge.submit({ craftRequestId: id, blueprintId: recipe.blueprint!,
        materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })) });
      return { p, forge, craft };
    }
    async function crafted(id: string) {
      const f = prepare(), writes = idb.writes, result = await f.craft(id);
      ok(result.allowed && result.result, 'O01默认正式ForgeGate返回完整committed成品');
      eq(result.result.state, 'committed', 'O01未完成打造不作正式源');
      const ref = result.result.resultItem.instanceRef;
      eq(ref, `${result.result.craftResultRef}:item`, 'O01身份严格来自打造完整结果');
      eq(f.p.enhance!.instances, [{ instanceRef: ref, itemId: result.result.resultItem.itemId, type: 'weapon', enhanceLevel: 0 }],
        'O01成品按ITEMS槽映射登记，初始等级0');
      eq(f.p.formalEnhanceInstances(), f.p.enhance!.instances, 'O01本档来源证明授权登记实例');
      eq(f.p.formalEnhanceInstanceStatus(ref), 'registered', 'O01完整打造成品取得本档正式来源状态');
      eq(f.p.enhance!.formalSources!.map(source => source.instanceRef), [ref], 'O01来源证明精确绑定同次打造成品身份');
      eq(idb.writes, writes + 1, 'O01打造入库与正式实例登记同一次IDB写入');
      const disk = (await saveStore.readSlot(Progress.getActiveSlot()))!.data;
      eq(disk.forge, f.p.forge, 'O01磁盘完整打造结果同次可见');
      eq(disk.enhance, f.p.enhance, 'O01磁盘正式实例及来源同次可见');
      return { ...f, ref, gate: new EnhanceGate(f.p, productionOptions()) };
    }
    const selected = await crafted('formal-select-one'), second = await selected.craft('formal-select-two');
    ok(second.allowed && second.result, 'O01同原型第二件实际打造成品');
    const secondRef = second.result.resultItem.instanceRef;
    ok(selected.ref !== secondRef, 'O01同原型两件有不同打造身份');
    const beforeSelect = selected.p.exportSave(), selectWrites = idb.writes, selectSamples = sampleCount;
    for (const ref of [selected.ref, secondRef]) {
      const preview = new EnhanceGate(selected.p).enhance(request(`select-${ref.length}`, 0, ref));
      ok(preview.allowed && preview.instance, 'O01默认无fixtureInstances可选本档正式实例');
      eq(preview.instance.instanceRef, ref, 'O01选择同原型特定件不混认');
    }
    eq(selected.p.exportSave(), beforeSelect, 'O01正式选择不写实例、费用和结果');
    eq([idb.writes, sampleCount], [selectWrites, selectSamples], 'O01正式选择零写零抽样');
    // equip 仍是 slot→itemId；只移动数量及位置，不从槽位生成或改写实例身份。
    selected.p.inventory.bamboo_sword -= 1; selected.p.equip.weapon = 'bamboo_sword';
    const registered = copy(selected.p.enhance!.instances);
    for (const ref of [selected.ref, secondRef])
      ok(new EnhanceGate(selected.p).enhance(request('formal-equipped-preview', 0, ref)).allowed, 'O01背包+合法装备槽可承载已登记两件');
    eq(selected.p.enhance!.instances, registered, 'O01移入装备槽保持两件原instanceRef');
    selected.p.inventory.bamboo_sword += 1; delete selected.p.equip.weapon;
    eq(selected.p.enhance!.instances, registered, 'O01移回背包保持原登记不创建身份');
    await formalUnchanged(selected.p, () => new EnhanceGate(selected.p, fixtureOptions([]))
      .submit(request('formal-no-fixture-fallback', 0, selected.ref)), 'no_instance', 'O01显式空测试授权不回退正式来源');
    await formalUnchanged(selected.p, () => new EnhanceGate(selected.p, fixtureOptions())
      .submit(request('formal-fixture-only', 0, selected.ref)), 'no_instance', 'O01显式测试授权集不偷用正式实例');
    await formalUnchanged(selected.p, () => new EnhanceGate(selected.p, fixtureOptions(copy(selected.p.enhance!.instances)))
      .submit(request('formal-fixture-cannot-mutate', 0, selected.ref)), 'no_instance', 'O01夹具即使显式复制正式ref也不能改正式实例');
    sampled = 0;
    committed(await selected.gate.submit(request('formal-one-of-two', 0, selected.ref)));
    eq(selected.p.enhance!.instances.map(row => [row.instanceRef, row.enhanceLevel]), [[selected.ref, 1], [secondRef, 0]],
      'O01/O02强化一件不改同原型第二件');
    const longSource = prepare(), longId = 'r'.repeat(128), longLedger = 'l'.repeat(128);
    const longResult = await new ForgeGate(longSource.p, { random: () => 0, ledgerId: () => longLedger }).submit({
      craftRequestId: longId, blueprintId: recipe.blueprint!,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })),
    });
    ok(longResult.allowed && longResult.result, 'O01合法Forge最大长度身份同事务登记');
    eq(longResult.result.resultItem.instanceRef.length, 268, 'O01 ledger128+request128的完整成品ref长度268');
    ok(new EnhanceGate(longSource.p).enhance(request('formal-long-ref', 0, longResult.result.resultItem.instanceRef)).allowed,
      'O01合法最长Forge成品无需fixture可选');
    eq(isEnhanceInstanceRef(`${longResult.result.resultItem.instanceRef}x`), false, 'O06拒269字符非法instanceRef');
    const injected = prepare(), fixtureRecipe = { blueprintId: recipe.blueprint!, blueprintCount: 1,
      materials: [{ itemId: 'spirit_copper', count: 2 }, { itemId: 'refine_stone', count: 1 }], resultItemId: recipe.output! };
    const injectedResult = await new ForgeGate(injected.p, { fixtureRecipes: [fixtureRecipe], random: () => 0,
      ledgerId: () => `${dataMode}-fixture-forge-source` }).submit({ craftRequestId: 'fixture-cannot-register',
      blueprintId: fixtureRecipe.blueprintId, materials: copy(fixtureRecipe.materials) });
    ok(injectedResult.allowed && injectedResult.result, 'O08保留显式Forge夹具成功能力');
    eq(injected.p.enhance, undefined, 'O08夹具Forge完整结果不自动登记正式来源');
    eq(injected.p.registerFormalEnhanceInstance(injectedResult.result), false, 'O08非正式配方的历史夹具结果不能调用登记API升格');
    const fixtureRef = injectedResult.result.resultItem.instanceRef;
    await formalUnchanged(injected.p, () => new EnhanceGate(injected.p).submit(request('fixture-source-denied', 0, fixtureRef)),
      'no_instance', 'O08Forge夹具完整结果形如正式ref仍不授权生产强化');

    const formalPayloads: Payload[] = [], success = await crafted('formal-success-source');
    for (const row of enhance.levels) {
      const input = request(`formal-success-${row.to}`, row.to - 1, success.ref), before = success.p.exportSave(),
        writes = idb.writes, samples = sampleCount;
      const sources = copy(success.p.enhance!.formalSources);
      sampled = 0; const result = committed(await success.gate.submit(input));
      eq(result.instanceRef, success.ref, 'O02正式成功始终保留原打造身份');
      eq(result.success, true, 'O02无fixture正式路径成功');
      eq({ to: result.to, rate: result.rate, stones: result.stones, refineStones: result.refineStones, dropOnFail: result.dropOnFail }, row,
        'O02只读正式enhance唯一next行');
      eq(result.finalLevel, row.to, 'O02成功升至to'); eq(result.attributes, attributes('weapon', row.to), 'O02最终属性一次按正式表求得');
      eq(success.p.stones, Number(before.stones) - row.stones, 'O02费用同次扣一次');
      eq(success.p.count('refine_stone'), Number((before.inventory as Record<string, number>).refine_stone) - row.refineStones,
        'O02精炼石同次扣一次且不依赖护符映射');
      eq(success.p.count('bamboo_sword'), 1, 'O02不替换原装不碎装');
      eq(success.p.enhance!.instances[0], { instanceRef: success.ref, itemId: 'bamboo_sword', type: 'weapon', enhanceLevel: row.to },
        'O02实例身份和最终等级同次更新');
      eq([idb.writes, sampleCount], [writes + 1, samples + 1], 'O02一次完整提交一次抽样');
      eq(success.p.enhance!.receipts.length, row.to, 'O02每次结果唯一去重');
      eq(success.p.enhance!.formalSources, sources, 'O02强化结算保留原正式来源证明，不另造或替换身份');
      eq(experience(success.p), [before.forgingLevel, before.forgingExp], 'O02不改变品质和生活技能经验');
      await replay(success.p, new EnhanceGate(success.p), input, 'O07正式成功旧请求只读去重');
      if (row.to === 7) formalPayloads.push({ state: 'formal-success', save: success.p.exportSave(),
        enhanceRequestId: input.enhanceRequestId, formalInstanceSource: true });
    }
    await formalUnchanged(success.p, () => success.gate.submit(request('formal-at-max', enhance.maxLevel, success.ref)),
      'max_level', 'O06正式满级不外推+13');
    for (const target of [5, 6]) {
      const f = await crafted(`formal-failure-source-${target}`);
      for (let from = 0; from < target - 1; from++) {
        sampled = 0; committed(await f.gate.submit(request(`formal-prepare-${target}-${from}`, from, f.ref)));
      }
      const before = f.p.exportSave(), writes = idb.writes, samples = sampleCount, row = enhance.levels.find(row => row.to === target)!;
      sampled = 0.999999; const input = request(`formal-failure-${target}`, target - 1, f.ref), result = committed(await f.gate.submit(input));
      const finalLevel = target <= 5 ? target - 1 : target - 2;
      eq(result.success, false, 'O03正式正常概率失败完整提交'); eq(result.finalLevel, finalLevel, 'O03目标≤5不掉/≥6掉1');
      eq(result.instanceRef, f.ref, 'O03失败保留原instanceRef'); eq(result.attributes, attributes('weapon', finalLevel), 'O03属性按最终等级一致');
      eq(f.p.stones, Number(before.stones) - row.stones, 'O03失败照扣本次灵石');
      eq(f.p.count('refine_stone'), Number((before.inventory as Record<string, number>).refine_stone) - row.refineStones, 'O03失败照扣本次精炼石');
      eq(f.p.count('bamboo_sword'), 1, 'O03失败不碎装');
      eq([idb.writes, sampleCount], [writes + 1, samples + 1], 'O03失败结果费用等级去重同次提交');
      await replay(f.p, new EnhanceGate(f.p), input, 'O07正式失败旧请求只读去重');
      formalPayloads.push({ state: target === 5 ? 'formal-failure-no-drop' : 'formal-failure-drop', save: f.p.exportSave(),
        enhanceRequestId: input.enhanceRequestId, formalInstanceSource: true });
    }
    for (const payload of formalPayloads) await roundtrip(payload);
    payloads.push(...formalPayloads);

    const refusals = await crafted('formal-refusal-source'); refusals.p.inventory.protect_charm = 0;
    await formalUnchanged(refusals.p, () => refusals.gate.submit({ ...request('formal-protect', 0, refusals.ref), useProtectCharm: true }),
      'resources', 'design28 C05正式来源映射齐备但缺符整笔拒绝'); eq(refusals.p.count('protect_charm'), 0, 'design28 C05缺符不补造库存');
    refusals.p.inventory.protect_charm = 7;
    for (const ref of ['missing-instance', 'bamboo_sword'])
      await formalUnchanged(refusals.p, () => refusals.gate.submit(request('formal-missing', 0, ref)), 'no_instance', 'O06数量和itemId不能冒充实例');
    for (const [name, patch] of [['slot', { slot: 'ring' }], ['phase', { phase: GAME_PHASE + 1 }], ['enabled', { enabled: false }],
      ['placeholder', { placeholder: true }], ['qualityEnabled', { qualityEnabled: true }]] as const) {
      const original = ITEMS.bamboo_sword;
      try {
        ITEMS.bamboo_sword = { ...original, ...patch };
        await formalUnchanged(refusals.p, () => refusals.gate.submit(request(`formal-bad-${name}`, 0, refusals.ref)), 'bad_type', 'O06正式已登记装备资格非法拒绝');
      } finally { ITEMS.bamboo_sword = original; }
    }
    for (const cost of ['stones', 'refine_stone']) {
      const before = refusals.p.exportSave();
      if (cost === 'stones') refusals.p.stones = 0; else refusals.p.inventory.refine_stone = 0;
      await formalUnchanged(refusals.p, () => refusals.gate.submit(request(`formal-no-${cost}`, 0, refusals.ref)), 'resources', 'O06正式资源不足整笔拒绝');
      refusals.p.stones = Number(before.stones); refusals.p.inventory = copy(before.inventory) as Record<string, number>;
    }
    for (const input of [{ ...request('formal-skip', 0, refusals.ref), to: 2 }, request('formal-stale', 1, refusals.ref)])
      await formalUnchanged(refusals.p, () => refusals.gate.submit(input), 'max_level', 'O06正式越级过期请求拒绝');
    delete refusals.p.inventory.bamboo_sword;
    await formalUnchanged(refusals.p, () => refusals.gate.submit(request('formal-no-possession', 0, refusals.ref)), 'foreign', 'O06来源登记但资产不在本档拒绝');

    const race = await crafted('formal-race-source'), another = await race.craft('formal-race-source-two');
    ok(another.allowed && another.result, 'O07第二件正式争用实例来自实际打造');
    race.p.stones = enhance.levels[0].stones; race.p.inventory.refine_stone = enhance.levels[0].refineStones;
    const raceWrites = idb.writes, raceSamples = sampleCount; sampled = 0;
    const competed = await Promise.all([race.ref, another.result.resultItem.instanceRef].map((ref, index) =>
      new EnhanceGate(race.p, productionOptions()).submit(request(`formal-race-${index}`, 0, ref))));
    eq(competed.filter(row => row.allowed).length, 1, 'O07正式两件共享库存争用至多完整提交一次');
    eq([race.p.stones, race.p.count('refine_stone')], [0, 0], 'O07争用无负库存');
    eq([race.p.enhance!.enhancements.length, race.p.enhance!.receipts.length], [1, 1], 'O07争用不留半结果');
    eq([idb.writes, sampleCount], [raceWrites + 1, raceSamples + 1], 'O07争用只有一次提交和抽样');
    const same = await crafted('formal-rapid-source'), sameWrites = idb.writes, sameSamples = sampleCount;
    const sameInput = request('formal-rapid', 0, same.ref);
    await Promise.all([same.gate.submit(sameInput), new EnhanceGate(same.p, productionOptions()).submit(copy(sameInput)), same.gate.submit(copy(sameInput))]);
    eq([idb.writes, sampleCount], [sameWrites + 1, sameSamples + 1], 'O07正式连点跨Gate同请求只提交一次');
    eq([same.p.enhance!.instances[0].enhanceLevel, same.p.enhance!.enhancements.length], [1, 1], 'O07同请求只升一次');
    await formalUnchanged(same.p, () => same.gate.submit({ ...sameInput, instanceRef: 'different-formal-instance' }), 'duplicate', 'O07正式旧请求载荷冲突不冒认');

    const interrupted = await crafted('formal-interruption-source'), beforeAbort = interrupted.p.exportSave(), disk = (await saveStore.readSlot(1))!.data;
    const hold = idb.holdNextCommit(), pending = interrupted.gate.submit(request('formal-aborted', 0, interrupted.ref));
    await hold.started; eq(interrupted.p.exportSave(), beforeAbort, 'O07正式强化complete前不发布半等级费用');
    idb.abortNextCommit(); hold.release(); businessDenied(await pending, 'O07正式强化IDB中断拒绝');
    eq(interrupted.p.exportSave(), beforeAbort, 'O07正式中断内存完整回滚'); eq((await saveStore.readSlot(1))!.data, disk, 'O07正式中断磁盘完整回滚');
    committed(await interrupted.gate.submit(request('formal-aborted', 0, interrupted.ref)));
    eq(interrupted.p.enhance!.enhancements.length, 1, 'O07正式中断同请求重试只完整提交一次');
    for (const sameRequest of [true, false]) {
      const seed = await crafted(`formal-independent-source-${sameRequest}`);
      let otherRef = seed.ref;
      if (!sameRequest) {
        const second = await seed.craft('formal-independent-second-asset');
        ok(second.allowed && second.result, 'O07独立Progress共享资源争用使用第二件正式打造资产');
        otherRef = second.result.resultItem.instanceRef;
      }
      seed.p.stones = enhance.levels[0].stones; seed.p.inventory.refine_stone = enhance.levels[0].refineStones;
      eq(await seed.p.save({ async: true }), true, 'O07独立Progress竞争前保存同槽单次资源基线');
      const contenders = await Promise.all([Progress.load({ async: true, slot: 1 }), Progress.load({ async: true, slot: 1 })]);
      progresses.push(...contenders);
      const gates = contenders.map(p => new EnhanceGate(p, productionOptions())), inputs = contenders.map((_, index) =>
        request(`formal-independent-${sameRequest}-${sameRequest ? 'shared' : index}`, 0, index === 0 ? seed.ref : otherRef));
      const writes = idb.writes, samples = sampleCount;
      const results = await Promise.all(gates.map((gate, index) => gate.submit(inputs[index])));
      eq(results.filter(row => row.allowed).length, 1, 'O07同slot两个独立Progress同/不同请求至多一次完整提交');
      eq([idb.writes, sampleCount], [writes + 1, samples + 1], 'O07独立对象同槽只有一次持久写和抽样');
      const winner = results.findIndex(row => row.allowed), loser = winner === 0 ? 1 : 0;
      eq([contenders[winner].stones, contenders[winner].count('refine_stone')], [0, 0], 'O07独立对象同槽费用只扣一次无负库存');
      const stale = contenders[loser], staleBefore = stale.exportSave(), retryWrites = idb.writes, retrySamples = sampleCount;
      businessDenied(await gates[loser].submit(request(`formal-independent-stale-${sameRequest}`, 0, seed.ref)),
        'O07独立过时对象后续请求明确拒绝');
      eq(stale.exportSave(), staleBefore, 'O07独立过时对象拒绝保持旧合法状态');
      eq([idb.writes, sampleCount], [retryWrites, retrySamples], 'O07独立过时对象拒绝零写零抽样');
      const reloaded = await Progress.load({ async: true, slot: 1 }); progresses.push(reloaded);
      eq(reloaded.enhance!.enhancements.length, 1, 'O07重新加载磁盘只认一次完整结果');
      eq(reloaded.enhance!.instances.reduce((sum, row) => sum + row.enhanceLevel, 0), 1, 'O07重新加载磁盘所有实例等级合计只升一次');
      await replay(reloaded, new EnhanceGate(reloaded), inputs[winner], 'O07独立对象竞争后fresh reload只读duplicate');
    }
    const forgeInterrupted = prepare(), beforeForge = forgeInterrupted.p.exportSave(), forgeHold = idb.holdNextCommit(), pendingForge = forgeInterrupted.craft('formal-forge-aborted');
    await forgeHold.started; eq(forgeInterrupted.p.exportSave(), beforeForge, 'O01/O07打造complete前不发布成品或正式登记');
    idb.abortNextCommit(); forgeHold.release(); eq((await pendingForge).allowed, false, 'O07打造中断不留下正式授权');
    eq(forgeInterrupted.p.exportSave(), beforeForge, 'O07打造费用成品来源一同回滚'); eq(forgeInterrupted.p.enhance, undefined, 'O07中断不补空正式袋');

    eq(await selected.p.save({ async: true }), true, 'O08重新保存独立来源档作为绑定槽位基线');
    const sourceSave = selected.p.exportSave(), previousSlot = Progress.getActiveSlot();
    try {
      Progress.setActiveSlot(2);
      sampled = 0; committed(await selected.gate.submit(request('formal-bound-slot-one', 1, selected.ref)));
      eq((await saveStore.readSlot(1))!.data.enhance, selected.p.enhance, 'O08已绑定A档切activeSlot2仍写原slot1');
      const other = new Progress(); progresses.push(other);
      other.inventory = { bamboo_sword: 2, refine_stone: 100 }; other.stones = 100000;
      await formalUnchanged(other, () => new EnhanceGate(other).submit(request('formal-new-slot-no-source', 0, selected.ref)),
        'no_instance', 'O08新B档不借绑定A档正式授权');
      other.inventory = copy(sourceSave.inventory) as Record<string, number>; other.stones = Number(sourceSave.stones);
      other.enhance = copy(selected.p.enhance); other.forge = copy(selected.p.forge);
      eq(other.formalEnhanceInstanceStatus(selected.ref), 'foreign', 'O08连来源和打造袋复制到另一槽仍识别foreign');
      await formalUnchanged(other, () => new EnhanceGate(other).submit(request('formal-cross-slot', 2, selected.ref)), 'foreign', 'O08跨槽不借正式实例和旧去重事实');
      eq(other.enhance, selected.p.enhance, 'O08跨槽拒绝保留原合法数据不清袋');
    } finally { Progress.setActiveSlot(previousSlot); }
    const historical = new Progress(); progresses.push(historical); historical.inventory = { bamboo_sword: 2, refine_stone: 100 }; historical.stones = 100000;
    historical.enhance = copy(selected.p.enhance); delete historical.enhance!.formalSources;
    await formalUnchanged(historical, () => new EnhanceGate(historical).submit(request('formal-history-no-source', 1, selected.ref)),
      'no_instance', 'O08即使ref形如打造且有完整历史结果，纯历史袋不授权新提交');
    eq(selected.p.enhance!.instances.map(row => row.instanceRef), (sourceSave.enhance as typeof selected.p.enhance)!.instances.map(row => row.instanceRef),
      'O08来源档原实例身份和合法资产保持');
    return { source: 'default-ForgeGate-committed-result', productionFixtureInstances: false, registeredAtForgeCommit: true,
      samePrototypeIsolated: true, registeredInventoryAndEquipSelection: true, sourceProofPersists: true,
      crossSlotForeign: true, historicalFixtureAuthorizesSubmit: false, forgeSamples,
      cases: ['O01', 'O02', 'O03', 'O04', 'O05', 'O06', 'O07', 'O08'] };
  }
  try {
    const sceneSmokeEvidence = invalidTable ? null : sceneSmoke();
    const defaultGateEvidence = openFixture && !invalidTable ? await defaultGateDenied() : null;
    const formalRefusalEvidence = openFixture && !invalidTable && !refreshPayloads ? await formalRefusalCases() : null;
    let protectCharmEvidence: Awaited<ReturnType<typeof protectCharmMappingCases>> | null = null;
    let formalInstanceEvidence: Awaited<ReturnType<typeof formalInstanceCases>> | null = null;
    let protectCharmOpenFixtureTable: Awaited<ReturnType<typeof protectCharmOpenCases>> | null = null;
    if (refreshPayloads) {
      eq(refreshPayloads.map(row => row.state), ['success', 'failure-no-drop', 'failure-drop',
        'formal-success', 'formal-failure-no-drop', 'formal-failure-drop', 'protect-charm-success', 'protect-charm-failure-kept',
        'protect-open-success', 'protect-open-failure-no-drop', 'protect-open-failure-drop-kept'], '独立fresh SSR覆盖夹具与正式来源成功/两种失败');
      for (const payload of refreshPayloads) await roundtrip(payload);
      payloads.push(...copy(refreshPayloads));
    }
    if (!openFixture) {
      for (const enhanceBag of [undefined, { enhanceRequestId: 'old-request', state: 'pending' },
        { state: 'unknown', raw: 'must-keep' }, { instanceRef: 'old-instance', enhanceLevel: 7 }]) {
        const { p } = fixture(); (p as any).enhance = copy(enhanceBag);
        await memoryClosed(p, '内存关态/无袋或歧义旧请求');
      }
    } else if (invalidTable) {
      const { p, gate } = fixture(), samples = sampleCount;
      await unchanged(p, () => gate.submit(request()), `O06 SSR坏表${invalidTable}拒绝`);
      const recipe = recipes.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword')!;
      const formal = new Progress(); progresses.push(formal); formal.stones = 100000;
      formal.inventory = { [recipe.blueprint!]: 1, spirit_copper: 1, refine_stone: 100 };
      const forged = await new ForgeGate(formal, { random: () => 0, ledgerId: () => `invalid-${invalidTable}` }).submit({
        craftRequestId: 'invalid-table-source', blueprintId: recipe.blueprint!,
        materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })),
      });
      ok(forged.allowed && forged.result, 'O06坏强化表不妨碍正式默认打造成品来源登记');
      const formalRef = forged.result.resultItem.instanceRef;
      await unchanged(formal, () => new EnhanceGate(formal, { random: () => { sampleCount++; return 0; } })
        .submit(request('formal-invalid-table', 0, formalRef)), `O06正式来源坏表${invalidTable}整笔拒绝`);
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

      // 既有无符 design/27 O 表保留；本窗另执行 design/28 §4.3 护符 O01–O06 全表。
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
      Progress.setActiveSlot(1); const view = slotA.gate.loadRefresh();
      formalDenied(view, 'load_dedupe', 'O05完整袋刷新只读去重');
      ok('progress' in view && view.progress, 'O05完整只读袋可查看');
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
      formalInstanceEvidence = await formalInstanceCases();
      protectCharmEvidence = await protectCharmMappingCases();
      protectCharmOpenFixtureTable = await protectCharmOpenCases();
    }
    eq(featureFlags(), flags, 'features原值保持不变'); eq(JSON.stringify(enhance), tableBefore, 'enhance内存表未修改');
    eq(localWrites, 0, '真实IDB保存无localStorage写旁路');
    return { assertions, payloads, openFixture, graph: openFixture ? 'formal-open' : 'memory-closed',
      formalOpen: true, closedFixtureOnly: true, softOpened: true, softOpenedEntrance: true, softOpenedFormalSettle: true,
      formalTipsWired: true, formalInstanceSource: true, protectCharmWired: true, protectCharmN: 1, softOpenedProtectCharm: true, released: false,
      compatibilityMeaning: 'formalOpen/softOpened 表示正式磁盘护符 soft-open；护符 soft-open ≠ 进包 ≠ 发版；memory-closed 仍先拒绝，fixture≠正式≠进包依据',
      sceneSmoke: sceneSmokeEvidence, defaultGateDenied: defaultGateEvidence, formalRefusals: formalRefusalEvidence,
      formalInstances: formalInstanceEvidence, protectCharmMapping: protectCharmEvidence,
      acceptanceDesign: 'design/28 §4.3 O01–O06 (C01–C08 regression retained)', protectCharmOpenFixtureTable,
      protectCharmOpenFixtureTableExecuted: protectCharmOpenFixtureTable?.protectCharmOpenFixtureTableExecuted === true,
      legacyRegressionDesign: 'design/27 existing no-charm C/O cases',
      storageWrites: idb.writes, commits: idb.commits, sampleCount,
      forgingExperienceWritten: false, protectorPath: 'mapped-atomic-settlement-or-protect/resources-denied',
      cases: openFixture ? invalidTable ? ['O06'] : ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10',
        'O01', 'O02', 'O03', 'O04', 'O05', 'O06', 'O07', 'O08'] : ['memory-closed-eight-tips', 'zero-side-effects', 'historical-baggage'] };
  } finally {
    for (const p of progresses) await p.flushSaves(); Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
