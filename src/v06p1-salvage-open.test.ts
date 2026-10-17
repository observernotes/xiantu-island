// 正式分解 Flag=false；开态仅 SSR 内存注入。绑定/位置/容量与防具配方均为显式、可剥离测试夹具。
import enhance from '@xt/balance/enhance.json';
import recipes from '@xt/balance/recipes.json';
import itemDefinitions from '@xt/balance/items.json';
import { GAME_PHASE, ITEMS } from './data';
import { featureFlags } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, saveStore, setSaveBackend } from './SaveStore';
import { SalvageGate, createSalvageFixtureCarrier } from './SalvageGate';
import { isValidSalvageProgress } from './SalvageProgress';
import { ForgeGate } from './ForgeGate';
import { EnhanceGate } from './EnhanceGate';
import { EnchantGate } from './EnchantGate';
import * as Closed from './SalvageClosed';
import * as ForgeClosed from './ForgeClosed';
import * as EnhanceClosed from './EnhanceClosed';
import * as EnchantClosed from './EnchantClosed';
import { isSalvageOpenForFixture } from './SalvageOpenFlag';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import { isEnchantOpenForFixture } from './EnchantOpenFlag';

type Grade = 'common' | 'fine' | 'spirit' | 'treasure';
type Request = { salvageRequestId: string; instanceRef: string; fromGrade: Grade; fromEnhanceLevel: number };
type Payload = { state: string; save: Record<string, unknown>; request: Request };
type Seed = { save: Record<string, unknown>; ref: string };
type GateResult = Awaited<ReturnType<SalvageGate['submit']>>;
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

export async function runSalvageOpenFixtureTests(options: {
  openFixture: boolean; dataMode: string; refreshPayloads?: Payload[] | null;
  invalidDependency?: string; dependencyPayload?: Seed | null;
}) {
  const { openFixture, dataMode, refreshPayloads = null, invalidDependency } = options;
  const graph = openFixture ? 'memory-open' : 'formal-closed', label = dataMode + '/' + graph;
  let assertions = 0, sequence = 0, randomCalls = 0, localWrites = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(label + ': ' + message + ': ' + JSON.stringify(actual) + '，期望 ' + JSON.stringify(expected));
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const copy = <T>(value: T): T => structuredClone(value);
  const oldSlot = Progress.getActiveSlot(), storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const idb = memoryIndexedDb(), progresses: Progress[] = [], payloads: Payload[] = [];
  const flags = copy(featureFlags()), tableBefore = JSON.stringify(enhance);
  const cases: Record<string, { executed: boolean; evidenceKeys: string[] }> = {};
  const mark = (key: string, evidenceKeys: string[]) => { cases[key] = { executed: true, evidenceKeys }; };
  let dependencyPayload: Seed | null = null;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => { localWrites++; },
  } });
  const carrier = createSalvageFixtureCarrier(createIndexedDbBackend(idb.factory));
  setSaveBackend(carrier.backend); Progress.setActiveSlot(1);
  const restore = (save: Record<string, unknown>) => {
    const p = (Progress as any).restore(copy(save), false) as Progress; progresses.push(p); return p;
  };
  function bare() {
    idb.rows.delete(Progress.getActiveSlot()); // 独立用例显式播种空介质，计数不冒充业务写。
    const p = new Progress(); progresses.push(p); p.stones = 100000; p.rootElement = '金'; p.equip = {};
    p.inventory = { rabbit_fur: 20, protect_charm: 3, refine_stone: 100, beast_core: 20 };
    return p;
  }
  function request(p: Progress, ref: string, id: string): Request {
    return { salvageRequestId: id, instanceRef: ref,
      fromGrade: p.forge!.crafts.find(row => row.resultItem.instanceRef === ref)!.resultGrade,
      fromEnhanceLevel: p.enhance!.instances.find(row => row.instanceRef === ref)!.enhanceLevel };
  }
  // 资格适配器只证明已登记正式身份的绑定和位置；缺适配器的生产模式必须整拒。
  function gate(p: Progress, extra: Record<string, unknown> = {}, positions = new Map<string, string>()) {
    return new SalvageGate(p, {
      qualification: (_detached: Progress, ref: string) => ({ instanceRef: ref, ownerSlot: 1,
        bound: false, natal: false, bloodBound: false, unsalvageable: false,
        location: positions.has(ref) ? { kind: 'equip', slot: positions.get(ref) } : { kind: 'inventory' } }),
      atomicCarrier: carrier, ledgerId: () => dataMode + '-salvage-' + (++sequence), ...extra,
    } as any);
  }
  async function forge(p: Progress, itemId = 'bamboo_sword', grade: Grade = 'common') {
    const recipe = recipes.recipes.find(row => row.type === 'forge' && row.output === itemId)!;
    ok(recipe, '正式 Forge 默认入口读取 SSR 图配方；防具配方仅为显式内存夹具');
    p.inventory[recipe.blueprint!] = Math.max(p.count(recipe.blueprint!), 20);
    for (const material of recipe.materials) p.inventory[material.item] = Math.max(p.count(material.item), material.count * 20);
    const samples = { common: 0, fine: 0.65, spirit: 0.95, treasure: 0.995 };
    const result = await new ForgeGate(p, { random: () => samples[grade], ledgerId: () => dataMode + '-salvage-source-' + (++sequence) }).submit({
      craftRequestId: 'source-' + (++sequence), blueprintId: recipe.blueprint!,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })),
    });
    ok(result.allowed && result.result, '默认 ForgeGate 完整提交和正式登记成功');
    eq(result.result.resultGrade, grade, '品质来自完整 Forge 结果而非分解请求自报');
    const ref = result.result.resultItem.instanceRef;
    eq(p.formalEnhanceInstanceStatus(ref), 'registered', '正式源持有本档稳定 instanceRef');
    ok(p.formalEnhanceInstances().some(row => row.instanceRef === ref), '正式实例源返回同一身份');
    return ref;
  }
  async function source(itemId = 'bamboo_sword', grade: Grade = 'common') {
    const p = bare(), ref = await forge(p, itemId, grade); return { p, ref, gate: gate(p) };
  }
  function committed(value: GateResult) {
    ok(value.allowed && value.result, '返回完整成功分解结果'); return value.result;
  }
  function denied(value: GateResult, message: string) {
    eq(value.allowed, false, message);
    ok('tipKey' in value && /^salvage\.(fixture|closed)\./u.test(value.tipKey), message + '：独立分解拒绝');
  }
  async function unchanged(p: Progress, action: () => unknown | Promise<unknown>, message: string, mayWrite = false) {
    const before = copy(p.exportSave()), writes = idb.writes, commits = idb.commits, rows = copy([...idb.rows]);
    const value = await action() as GateResult; denied(value, message);
    eq(p.exportSave(), before, message + '：全档零销毁零产物零结果去重');
    eq(idb.commits, commits, message + '：零完整提交');
    eq([...idb.rows], rows, message + '：存储原合法状态保持');
    if (!mayWrite) eq(idb.writes, writes, message + '：零持久写');
    return value;
  }
  async function replay(p: Progress, input: Request, message: string) {
    const before = copy(p.exportSave()), writes = idb.writes, commits = idb.commits;
    // 已成功请求只读回放不再要求绑定/位置夹具，也不再要求实例或产物容量。
    const g = new SalvageGate(p), value = await g.submit(copy(input));
    eq(value.allowed, true, message + '：匹配完整旧结果允许');
    eq('replayed' in value ? value.replayed : false, true, message + '：明确只读重放');
    eq('result' in value ? value.result : null, p.salvage!.destructions.find(row => row.salvageRequestId === input.salvageRequestId),
      message + '：旧完整结果一致');
    eq(p.exportSave(), before, message + '：不补实例不补发不补做');
    eq([idb.writes, idb.commits], [writes, commits], message + '：零写');
    const read = g.result(input.salvageRequestId), output = g.output(input.salvageRequestId);
    eq('result' in read ? read.result : null, 'result' in value ? value.result : null, message + '：结果 API 一致');
    eq(output.allowed, true, message + '：产物 API 只读已有事实');
  }
  async function closed(p: Progress, message: string) {
    const before = copy(p.exportSave()), writes = idb.writes, commits = idb.commits;
    let forbiddenReads = 0;
    const fail = () => { forbiddenReads++; throw new Error('关态不得读资格/实例/库存/事务/请求'); };
    const hostile = new Proxy({}, { get: fail }) as Request;
    const fixture = { qualification: fail, ledgerId: fail, canCommitResult: fail };
    Object.defineProperty(fixture, 'capacity', { get: fail });
    const g = new SalvageGate(p, fixture);
    const methods = ['count', 'permanentCount', 'formalEnhanceInstances', 'formalEnhanceInstanceStatus',
      'removeItem', 'addItem', 'persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync'];
    const descriptors = methods.map(name => [name, Object.getOwnPropertyDescriptor(p, name)] as const);
    for (const method of methods) Object.defineProperty(p, method, { configurable: true, value: fail });
    const operations = [
      [() => g.feature(), Closed.featureClosed], [() => g.entrance(), Closed.refuseEntrance],
      [() => g.salvage(hostile), Closed.refuseSalvage], [() => g.submit(hostile), Closed.refuseSubmit],
      [() => g.result('old'), Closed.refuseResult], [() => g.output('old'), Closed.refuseOutput],
      [() => g.loadRefresh(), Closed.refuseLoadRefresh], [() => g.laterService(), Closed.refuseLaterService],
    ] as const;
    try {
      for (const [action, expected] of operations) eq(await action(), expected(), message + '：八 tip 原样');
      const values = await Promise.all(operations.map(async ([action]) => action()));
      values.forEach((value, index) => eq(value, operations[index][1](), message + '：并发旧回调原样拒绝'));
    } finally {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(p, name, descriptor); else Reflect.deleteProperty(p, name);
      }
    }
    eq(forbiddenReads, 0, message + '：首语句拒绝零读取');
    eq(p.exportSave(), before, message + '：完整历史实例资源保留');
    eq([idb.writes, idb.commits], [writes, commits], message + '：零写零提交');
  }
  async function roundtrip(payload: Payload) {
    const save = copy(payload.save), p = restore(save);
    idb.rows.set(1, { slotKey: 1, data: copy(save), lastSaveAt: 1 }); // 独立刷新图的已保存原文。
    eq([p.salvage, p.inventory, p.enhance, p.equip], [save.salvage, save.inventory, save.enhance, save.equip],
      'O06 restore 销毁、库存、关联引用、结果去重完整一致');
    ok(isValidSalvageProgress(p.salvage), 'O06 完整袋结构合法');
    eq(p.formalEnhanceInstanceStatus(payload.request.instanceRef), 'missing', 'O06 被销毁实例不再可用');
    await replay(p, payload.request, 'O06 restore 重放');
    const before = copy(p.exportSave()), writes = idb.writes;
    eq(new SalvageGate(p).loadRefresh().allowed, true, 'O06 刷新只读完整袋');
    eq(p.exportSave(), before, 'O06 刷新不复活不补发'); eq(idb.writes, writes, 'O06 刷新零写');
    eq(await p.importSave(copy(save), { async: true }), true, 'O06 import 完整袋接受');
    await replay(p, payload.request, 'O06 import 重放');
    eq(await p.save({ async: true }), true, 'O06 普通保存成功');
    const loaded = await Progress.load({ async: true, slot: 1 }); progresses.push(loaded);
    eq([loaded.salvage, loaded.inventory, loaded.enhance, loaded.equip], [save.salvage, save.inventory, save.enhance, save.equip],
      'O06 真实保存读档完整事实一致');
    await replay(loaded, payload.request, 'O06 load 重放');
  }
  const occupancy = (p: Progress, stoneStack = 200) => Object.entries(p.inventory).reduce((sum, [id, n]) =>
    sum + Math.ceil(n / (id === 'refine_stone' ? stoneStack : Reflect.get(ITEMS[id] ?? {}, 'stack') ?? 1)), 0);
  try {
    eq([isForgeOpenForFixture(), isEnhanceOpenForFixture(), isEnchantOpenForFixture(), isSalvageOpenForFixture()],
      [true, true, true, openFixture], '三既有正式旗 true；独立分解仅 SSR 图注入');
    eq(GAME_PHASE, 5, '阶段保持5');
    const random = Math.random; Math.random = () => { randomCalls++; throw new Error('分解不得抽概率'); };
    try {
      if (!openFixture) {
        await closed(bare(), '正式磁盘关态图');
        for (const payload of refreshPayloads ?? []) {
          const p = restore(payload.save);
          eq(p.salvage, payload.save.salvage, 'O08 正式关态真实 restore 保留完整成功历史');
          await closed(p, 'O08 正式关态旧结果与回调');
        }
        mark('O08', ['formal-flag-false-eight-tips', 'hostile-getters-unread', 'closed-fresh-ssr-keeps-open-result']);
      } else if (invalidDependency) {
        ok(options.dependencyPayload, 'O03 独立 SSR 异常图使用先前合法未销毁正式源载荷');
        const p = restore(options.dependencyPayload.save), ref = options.dependencyPayload.ref;
        const input = request(p, ref, 'invalid-dependency');
        await unchanged(p, () => gate(p).salvage(input), 'O03 ' + invalidDependency + ' 预览整拒');
        await unchanged(p, () => gate(p).submit(input), 'O03 ' + invalidDependency + ' 提交整拒');
        mark('O03', ['ssr-json-dependency-' + invalidDependency, 'zero-destruction-output-records']);
      } else if (refreshPayloads) {
        for (const payload of refreshPayloads) await roundtrip(payload);
        mark('O06', ['fresh-ssr-real-save-load-export-import-restore', 'no-revival-no-refill-no-redo']);
      } else {
        eq(enhance.salvage, { refineStonesByGrade: { common: 1, fine: 2, spirit: 4, treasure: 8 } }, 'O01 唯一只读数量源无 rate/cost');
        eq(itemDefinitions.find(row => row.id === 'refine_stone')!.phase, 5, 'O01 精炼石items正式phase5资格可读，ITEMS合并后material元数据另核');
        for (const grade of ['common', 'fine', 'spirit', 'treasure'] as Grade[]) {
          const f = await source('bamboo_sword', grade), input = request(f.p, f.ref, 'grade-' + grade);
          const before = copy(f.p.exportSave()), writes = idb.writes, commits = idb.commits;
          eq(f.gate.feature().allowed, true, 'O01 feature 只读许可'); eq(f.gate.entrance().allowed, true, 'O01 entrance 只读许可');
          const preview = f.gate.salvage(input);
          eq(preview.allowed, true, 'O01 正式品质只读预览');
          eq('output' in preview ? preview.output : null, { itemId: 'refine_stone', count: enhance.salvage.refineStonesByGrade[grade] }, 'O01 预览品质数量唯一取表');
          eq(f.p.exportSave(), before, 'O01 许可/预览零销毁零发物零业务写'); eq(idb.writes, writes, 'O01 预览不启动持久写');
          const result = committed(await f.gate.submit(input));
          eq([result.state, result.success, result.destroyed, result.instanceRef, result.grade, result.refineStones, result.output],
            ['committed', true, true, f.ref, grade, enhance.salvage.refineStonesByGrade[grade],
              { itemId: 'refine_stone', count: enhance.salvage.refineStonesByGrade[grade] }], 'O01 完整确定性结果');
          eq([f.p.count('bamboo_sword'), f.p.count('refine_stone'), f.p.stones],
            [0, Number((before.inventory as any).refine_stone) + result.refineStones, before.stones], 'O01 一次实例销毁全额精炼石，不另扣灵石');
          eq(f.p.salvage!.destructions, [result], 'O01 完整结果同事务');
          eq(f.p.salvage!.receipts, [result.salvageResultRef], 'O01 请求去重同事务');
          eq(f.p.formalEnhanceInstanceStatus(f.ref), 'missing', 'O01 所选正式可用身份失效');
          eq([idb.writes, idb.commits], [writes + 1, commits + 1], 'O01 实例产物结果去重一次事务');
          const disk = (await saveStore.readSlot(1))!.data;
          eq([disk.inventory, disk.salvage, disk.enhance], [f.p.inventory, f.p.salvage, f.p.enhance], 'O01 磁盘同一次全事实');
          eq(f.p.forge, before.forge, 'O01 原打造历史保留');
          eq([f.p.forgingLevel, f.p.forgingExp, f.p.count('protect_charm')], [before.forgingLevel, before.forgingExp, 3], 'O01 既有经验护符不改');
          if (grade === 'common') payloads.push({ state: 'weapon-success', save: copy(f.p.exportSave()), request: input });
        }
        mark('O01', ['default-ForgeGate-formal-weapon-all-four-grades', 'read-only-feature-entrance-preview', 'one-atomic-destroy-output-result-dedupe', 'no-extra-stones-no-probability-no-fixtureInstances']);

        for (const itemId of ['bamboo_sword', 'fox_robe', 'cloth_shoes']) for (const equipped of [false, true]) {
          const f = await source(itemId, 'fine'), other = await forge(f.p, itemId, 'fine');
          const slot = ITEMS[itemId].slot!, positions = new Map<string, string>();
          if (equipped) { f.p.inventory[itemId] -= 1; f.p.equip[slot] = itemId; positions.set(f.ref, slot); }
          eq(await f.p.save({ async: true }), true, 'O02 显式同原型位置证据准备保存');
          const before = copy(f.p.exportSave()), input = request(f.p, f.ref, 'selected-' + (++sequence));
          committed(await gate(f.p, {}, positions).submit(input));
          eq(f.p.formalEnhanceInstanceStatus(f.ref), 'missing', 'O02 所选正式引用同步失效');
          eq(f.p.formalEnhanceInstanceStatus(other), 'registered', 'O02 同原型未选实例保留');
          eq(f.p.count(itemId), equipped ? 1 : 1, 'O02 只销毁所选一个持有实例');
          if (equipped) eq(f.p.equip[slot], undefined, 'O02 所选装备槽同步清除');
          else eq(f.p.equip, before.equip, 'O02 背包目标不改装备槽');
          if (itemId !== 'bamboo_sword' && equipped) payloads.push({ state: itemId + '-success', save: copy(f.p.exportSave()), request: input });
        }
        const ambiguity = await source(); await forge(ambiguity.p);
        ambiguity.p.inventory.bamboo_sword -= 1; ambiguity.p.equip.weapon = 'bamboo_sword';
        eq(await ambiguity.p.save({ async: true }), true, 'O02 模糊同原型引用准备保存');
        await unchanged(ambiguity.p, () => gate(ambiguity.p).submit(request(ambiguity.p, ambiguity.ref, 'ambiguous-location')), 'O02 同原型槽包缺精确关联整拒');
        mark('O02', ['formal-weapon-robe-shoes-bag-and-equipped', 'ssr-only-armor-recipes-explicit-not-production', 'same-prototype-selected-ref-only', 'location-proof-required-and-links-invalidated']);

        const dependency = await source(); dependencyPayload = { save: copy(dependency.p.exportSave()), ref: dependency.ref };
        for (const mode of ['missing', 'itemId', 'foreign', 'source-absent', 'owner-missing', 'unknown-grade', 'missing-grade', 'bad-type', 'stale-grade', 'stale-level', 'transient', 'quality-count'] as const) {
          const f = await source(), input: any = request(f.p, f.ref, 'reject-' + mode);
          if (mode === 'missing') input.instanceRef = 'missing-formal';
          if (mode === 'itemId') input.instanceRef = 'bamboo_sword';
          if (mode === 'foreign') f.p.enhance!.formalSources![0].ownerSlot = 2;
          if (mode === 'source-absent') delete f.p.enhance!.formalSources;
          if (mode === 'owner-missing') f.p.inventory.bamboo_sword = 0;
          if (mode === 'unknown-grade') (f.p.forge!.crafts[0] as any).resultGrade = 'mythic';
          if (mode === 'missing-grade') delete (f.p.forge!.crafts[0] as any).resultGrade;
          if (mode === 'bad-type') f.p.enhance!.instances[0].type = 'armor';
          if (mode === 'stale-grade') input.fromGrade = 'treasure';
          if (mode === 'stale-level') input.fromEnhanceLevel = 1;
          if (mode === 'transient') (f.p as any).transientItems = { bamboo_sword: 1 };
          if (mode === 'quality-count') f.p.pillQualities.bamboo_sword = { low: 1, mid: 0, high: 0, supreme: 0 };
          await unchanged(f.p, () => f.gate.submit(input), 'O03 ' + mode + ' 整拒');
        }
        for (const field of ['bound', 'natal', 'bloodBound', 'unsalvageable', 'missing', 'partial', 'foreign', 'wrong-ref', 'bad-slot']) {
          const f = await source(), base: any = { instanceRef: f.ref, ownerSlot: 1, bound: false, natal: false, bloodBound: false,
            unsalvageable: false, location: { kind: 'inventory' } };
          if (['bound', 'natal', 'bloodBound', 'unsalvageable'].includes(field)) base[field] = true;
          if (field === 'partial') delete base.bloodBound;
          if (field === 'foreign') base.ownerSlot = 2;
          if (field === 'wrong-ref') base.instanceRef = 'other-formal-ref';
          if (field === 'bad-slot') base.location = { kind: 'equip', slot: 'ring' };
          await unchanged(f.p, () => gate(f.p, { qualification: () => field === 'missing' ? undefined : base }).submit(request(f.p, f.ref, 'binding-' + field)), 'O03 不可分解/未齐字段 ' + field);
        }
        const noQualification = await source();
        await unchanged(noQualification.p, () => new SalvageGate(noQualification.p).submit(request(noQualification.p, noQualification.ref, 'production-no-binding')), 'O03 正式默认缺绑定资格绝不放行');
        for (const input of [null, {}, { salvageRequestId: '', instanceRef: 'x', fromGrade: 'common', fromEnhanceLevel: 0 },
          { ...request(dependency.p, dependency.ref, 'extra'), extra: true },
          { ...request(dependency.p, dependency.ref, 'missing'), fromGrade: undefined }])
          await unchanged(dependency.p, () => gate(dependency.p).submit(input as any), 'O03 非法请求整拒');
        const quantityOnly = bare(); quantityOnly.inventory.bamboo_sword = 99; quantityOnly.equip.weapon = 'bamboo_sword';
        await unchanged(quantityOnly, () => gate(quantityOnly).submit({ salvageRequestId: 'quantity', instanceRef: 'bamboo_sword', fromGrade: 'common', fromEnhanceLevel: 0 }), 'O03 itemId数量槽位不能造正式源');
        eq(new ForgeGate(quantityOnly).laterService(), ForgeClosed.refuseLaterService(), 'O03 打造窗混入分解仍 later_service');
        eq(new EnhanceGate(quantityOnly).laterService(), EnhanceClosed.refuseLaterService(), 'O03 强化窗混入分解仍 later_service');
        eq(new EnchantGate(quantityOnly).laterService(), EnchantClosed.refuseLaterService(), 'O03 附灵窗混入分解仍 later_service');
        eq(gate(quantityOnly).laterService(), Closed.refuseLaterService(), 'O03 独立分解 laterService 仍原拒绝');
        mark('O03', ['missing-foreign-unowned-source-and-itemId-spoof-denied', 'bad-type-grade-and-stale-intent-denied', 'binding-natal-blood-and-unsalvageable-true-or-missing-denied', 'default-production-without-qualification-denied', 'ssr-json-invalid-config-registration-and-equipment-graphs', 'three-existing-service-laterService-preserved']);

        for (const canFit of [true, false]) {
          const f = await source('bamboo_sword', 'treasure'), positions = new Map([[f.ref, 'weapon']]);
          f.p.inventory.bamboo_sword = 0; f.p.equip.weapon = 'bamboo_sword'; f.p.inventory.refine_stone = canFit ? 192 : 193;
          eq(await f.p.save({ async: true }), true, 'O04 满包显式位置和堆叠准备保存');
          const slots = occupancy(f.p), g = gate(f.p, { capacity: { slots } }, positions), input = request(f.p, f.ref, 'capacity-' + canFit);
          if (canFit) { committed(await g.submit(input)); eq(f.p.count('refine_stone'), 200, 'O04 满包已有堆叠完整接收8'); }
          else await unchanged(f.p, () => g.submit(input), 'O04 满包不能完整接收8则整拒');
        }
        for (const capacity of [{ slots: -1 }, { slots: 0.5 }, { slots: Number.MAX_SAFE_INTEGER + 1 }, { slots: 100, stackLimit: 0 }, { slots: 100, stackLimit: 201 }]) {
          const f = await source(); await unchanged(f.p, () => gate(f.p, { capacity }).submit(request(f.p, f.ref, 'bad-capacity')), 'O04 非法容量整拒');
        }
        for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER]) {
          const f = await source(); f.p.inventory.refine_stone = value;
          await unchanged(f.p, () => f.gate.submit(request(f.p, f.ref, 'bad-inventory')), 'O04 非法或溢出产物库存整拒');
        }
        mark('O04', ['full-equipped-target-complete-existing-stack-accepts', 'full-no-complete-stack-zero-delta', 'illegal-slots-stackLimit-and-inventory-denied', 'no-overflow-partial-mail-pending']);

        const replayed = await source(), replayInput = request(replayed.p, replayed.ref, 'replay');
        committed(await replayed.gate.submit(replayInput));
        await replay(replayed.p, replayInput, 'O05 原成功请求');
        replayed.p.inventory.refine_stone = Number.MAX_SAFE_INTEGER;
        await replay(replayed.p, replayInput, 'O05 销毁后无产物容量仍只读原结果');
        await unchanged(replayed.p, () => gate(replayed.p).submit({ ...replayInput, fromGrade: 'treasure' }), 'O05 同请求改品质冲突');
        await unchanged(replayed.p, () => gate(replayed.p).submit({ ...replayInput, instanceRef: dependency.ref }), 'O05 同请求改实例冲突');
        await unchanged(replayed.p, () => gate(replayed.p).submit({ ...replayInput, salvageRequestId: 'new-destroyed' }), 'O05 新请求已销毁实例拒绝');
        mark('O05', ['matching-old-success-read-only-without-instance-binding-capacity', 'same-request-grade-or-ref-conflict', 'new-request-destroyed-instance-no-replacement']);

        for (const payload of payloads) await roundtrip(payload);
        const crossSave = copy(payloads[0].save); Progress.setActiveSlot(2);
        const cross = bare();
        await unchanged(cross, () => gate(cross).submit(payloads[0].request), 'O06 另一档不借原来源库存结果');
        await unchanged(cross, () => new SalvageGate(cross).result(payloads[0].request.salvageRequestId), 'O06 另一档不混认请求结果');
        eq(await cross.importSave(crossSave, { async: true }), false, 'O06 原子夹具承载不允许跨档导入制造新分解事实');
        idb.rows.set(2, { slotKey: 2, data: copy(crossSave), lastSaveAt: 1 }); // 显式构造跨档同文本的已保存载荷。
        const crossLoaded = await Progress.load({ async: true, slot: 2 }); progresses.push(crossLoaded);
        await unchanged(crossLoaded, () => new SalvageGate(crossLoaded).submit(payloads[0].request), 'O06 跨档载荷不得重放旧档成功请求');
        await unchanged(crossLoaded, () => new SalvageGate(crossLoaded).loadRefresh(), 'O06 跨档袋不能冒认当前档');
        Progress.setActiveSlot(1);
        mark('O06', ['real-save-load-import-export-restore-stable-destruction-inventory-results-dedupe', 'fresh-independent-ssr-open-and-formal-closed', 'cross-slot-source-request-result-isolation']);

        const rapid = await source(), rapidInput = request(rapid.p, rapid.ref, 'rapid'), rapidWrites = idb.writes;
        const rapidResults = await Promise.all([rapid.gate.submit(rapidInput), gate(rapid.p).submit(copy(rapidInput)), rapid.gate.submit(copy(rapidInput))]);
        eq(rapidResults.filter(row => row.allowed && !('replayed' in row && row.replayed)).length, 1, 'O07 同请求并发恰一完整提交');
        eq([rapid.p.salvage!.destructions.length, rapid.p.count('bamboo_sword'), idb.writes], [1, 0, rapidWrites + 1], 'O07 同请求不二次销毁发物');
        const target = await source(), targetWrites = idb.writes;
        const targetResults = await Promise.all(['a', 'b'].map(id => gate(target.p).submit(request(target.p, target.ref, 'target-' + id))));
        eq(targetResults.filter(row => row.allowed).length, 1, 'O07 同实例不同请求至多一成功');
        eq(idb.writes, targetWrites + 1, 'O07 事务内复核仅一写');
        const shared = await source('bamboo_sword', 'treasure'), sharedOther = await forge(shared.p, 'fox_robe', 'treasure');
        shared.p.inventory.bamboo_sword = 0; shared.p.equip.weapon = 'bamboo_sword';
        shared.p.inventory.fox_robe = 0; shared.p.equip.robe = 'fox_robe'; shared.p.inventory.refine_stone = 192;
        const positions = new Map([[shared.ref, 'weapon'], [sharedOther, 'robe']]);
        eq(await shared.p.save({ async: true }), true, 'O07 两个正式装备争共享堆叠准备保存');
        const sharedWrites = idb.writes, slots = occupancy(shared.p);
        const sharedResults = await Promise.all([shared.ref, sharedOther].map((ref, index) =>
          gate(shared.p, { capacity: { slots } }, positions).submit(request(shared.p, ref, 'shared-' + index))));
        eq(sharedResults.filter(row => row.allowed).length, 1, 'O07 两正式目标争8个共享堆叠空间只有一笔成功');
        eq([shared.p.count('refine_stone'), shared.p.salvage!.destructions.length, idb.writes], [200, 1, sharedWrites + 1], 'O07 共享库存不超容量');
        const race = await source(), raceRef = race.ref;
        const raceResults = await Promise.all([race.gate.submit(request(race.p, raceRef, 'race-salvage')),
          new EnhanceGate(race.p, { random: () => 0 }).submit({ enhanceRequestId: 'race-enhance', instanceRef: raceRef, fromLevel: 0, to: 1, useProtectCharm: true })]);
        eq(raceResults.filter(row => row.allowed).length, 1, 'O07 分解与既有强化相争不覆盖对方完整事实');
        const freshRace = await Progress.load({ async: true, slot: 1 }); progresses.push(freshRace);
        eq([freshRace.salvage, freshRace.enhance, freshRace.inventory], [race.p.salvage, race.p.enhance, race.p.inventory], 'O07 相争后内存磁盘无半结果');
        const stale = await source(), newer = restore(stale.p.exportSave()); newer.exp += 1;
        eq(await newer.save({ async: true }), true, 'O07 别的合法装备业务对象先保存新事实');
        await unchanged(stale.p, () => stale.gate.submit(request(stale.p, stale.ref, 'stale')), 'O07 旧对象不能覆盖新存档事实');
        for (const ordinaryFirst of [true, false]) {
          const f = await source(), other = restore(f.p.exportSave()), original = copy(f.p.exportSave()), otherBefore = copy(other.exportSave());
          const oldInput = { enhanceRequestId: 'two-object-' + ordinaryFirst, instanceRef: f.ref, fromLevel: 0, to: 1, useProtectCharm: true };
          const salvageInput = request(f.p, f.ref, 'two-object-salvage-' + ordinaryFirst);
          let announce!: () => void;
          const prepared = new Promise<void>(resolve => { announce = resolve; });
          const held = idb.holdNextCommit();
          if (ordinaryFirst) {
            const first = new EnhanceGate(other, { random: () => 0 }).submit(oldInput);
            await held.started;
            const second = gate(f.p, { canCommitResult: () => { announce(); return true; } }).submit(salvageInput);
            await prepared; // 普通 writer 仍未 complete，分解两次预读及 draft 已完成。
            eq(f.p.exportSave(), original, 'O07 两对象普通先写时分解草稿不提前发布');
            held.release();
            eq((await first).allowed, true, 'O07 两对象普通 writer 先完整提交');
            denied(await second, 'O07 已经预读旧状态的分解仍由事务 CAS 拒绝');
            eq(f.p.exportSave(), original, 'O07 CAS拒绝不销毁旧对象');
            eq((await saveStore.readSlot(1))!.data, other.exportSave(), 'O07 CAS拒绝保留新的正式强化完整事实');
          } else {
            const first = gate(f.p).submit(salvageInput);
            await held.started;
            const second = new EnhanceGate(other, { random: () => 0,
              canCommitResult: () => { announce(); return true; } }).submit(oldInput);
            await prepared; // 分解 complete 前，旧对象强化已经预读并完成 draft。
            eq(other.exportSave(), otherBefore, 'O07 旧普通 writer 的半强化尚未发布');
            held.release();
            committed(await first); eq((await second).allowed, false, 'O07 已预读的旧普通 writer 不得擦除新分解事实');
            eq(other.exportSave(), otherBefore, 'O07 旧普通 writer 保存拒绝后原内存保留');
            eq((await saveStore.readSlot(1))!.data, f.p.exportSave(), 'O07 新分解销毁产物收据完整保留在磁盘');
          }
        }
        mark('O07', ['same-request-concurrent-one-commit', 'same-instance-different-requests-one-destruction', 'shared-stack-two-equipped-targets-no-overcapacity', 'existing-EnhanceGate-race-preserves-complete-facts', 'two-object-ordinary-first-salvage-CAS-refuses-after-pre-read', 'two-object-salvage-first-stale-ordinary-writer-refused-after-pre-read', 'stale-progress-rejected-after-other-save']);

        for (const sentinel of [() => false, () => { throw new Error('受控承载失败'); },
          (draft: Progress) => { draft.stones += 1; return true; },
          (draft: Progress) => { draft.inventory.refine_stone += 1; return true; }]) {
          const f = await source(); await unchanged(f.p, () => gate(f.p, { canCommitResult: sentinel }).submit(request(f.p, f.ref, 'carrier')), 'O08 承载失败/异常/篡改草稿整笔拒绝');
        }
        for (const atomicCarrier of [undefined, createSalvageFixtureCarrier(createIndexedDbBackend(idb.factory))]) {
          const f = await source();
          await unchanged(f.p, () => gate(f.p, { atomicCarrier }).submit(request(f.p, f.ref, 'missing-carrier')), 'O08 缺失或未安装原子夹具载体不能提交');
        }
        const originalRemove = Progress.prototype.removeItem, originalAdd = Progress.prototype.addItem;
        try {
          for (const mode of ['remove-noop', 'remove-throw', 'add-false', 'add-throw']) {
            const f = await source();
            if (mode === 'remove-noop') Progress.prototype.removeItem = () => {};
            if (mode === 'remove-throw') Progress.prototype.removeItem = () => { throw new Error('销毁承载失败'); };
            if (mode === 'add-false') Progress.prototype.addItem = () => {};
            if (mode === 'add-throw') Progress.prototype.addItem = () => { throw new Error('产物承载失败'); };
            await unchanged(f.p, () => f.gate.submit(request(f.p, f.ref, 'actual-fail')), 'O08 真销毁/入库失败原档保持');
            Progress.prototype.removeItem = originalRemove; Progress.prototype.addItem = originalAdd;
          }
        } finally { Progress.prototype.removeItem = originalRemove; Progress.prototype.addItem = originalAdd; }
        const interrupted = await source(), beforeAbort = copy(interrupted.p.exportSave()), diskBefore = (await saveStore.readSlot(1))!.data;
        const hold = idb.holdNextCommit(), interruptedInput = request(interrupted.p, interrupted.ref, 'interrupted'), pending = interrupted.gate.submit(interruptedInput);
        await hold.started;
        eq(interrupted.p.exportSave(), beforeAbort, 'O08 IDB complete前内存未发布半销毁/半产物');
        eq((await saveStore.readSlot(1))!.data, diskBefore, 'O08 complete前磁盘仍原合法事实');
        idb.abortNextCommit(); hold.release(); denied(await pending, 'O08 IDB abort 整笔失败');
        eq(interrupted.p.exportSave(), beforeAbort, 'O08 abort 内存零半单'); eq((await saveStore.readSlot(1))!.data, diskBefore, 'O08 abort 磁盘零半单');
        committed(await interrupted.gate.submit(interruptedInput)); await replay(interrupted.p, interruptedInput, 'O08 中断后显式重试完整一次');
        const completing = await source(), beforeComplete = copy(completing.p.exportSave());
        const completeHold = idb.holdNextCommit(), completePending = completing.gate.submit(request(completing.p, completing.ref, 'complete'));
        await completeHold.started; eq(completing.p.exportSave(), beforeComplete, 'O08 成功complete前仅原合法状态可见');
        completeHold.release(); committed(await completePending);
        eq((await saveStore.readSlot(1))!.data.salvage, completing.p.salvage, 'O08 complete之后全事实才发布');
        const serializing = await source(), serializeInput = request(serializing.p, serializing.ref, 'serialization'), serializeBefore = copy(serializing.p.exportSave());
        const descriptor = Object.getOwnPropertyDescriptor(serializing.p, 'exportSave'); let serializeResult!: GateResult;
        try {
          Object.defineProperty(serializing.p, 'exportSave', { configurable: true, value: () => { throw new Error('保存序列化失败'); } });
          serializeResult = await serializing.gate.submit(serializeInput);
        } finally {
          if (descriptor) Object.defineProperty(serializing.p, 'exportSave', descriptor); else Reflect.deleteProperty(serializing.p, 'exportSave');
        }
        denied(serializeResult, 'O08 序列化失败整拒'); eq(serializing.p.exportSave(), serializeBefore, 'O08 序列化失败原合法状态');
        committed(await serializing.gate.submit(serializeInput)); await replay(serializing.p, serializeInput, 'O08 保存失败后锁释放显式重试');

        const protectedF = await source();
        const enhanced = await new EnhanceGate(protectedF.p, { random: () => 0 }).submit({ enhanceRequestId: 'preserved-protect', instanceRef: protectedF.ref, fromLevel: 0, to: 1, useProtectCharm: true });
        ok(enhanced.allowed, 'O08 已有正式强化护符路径可完整成功');
        const oldEnhance = copy(protectedF.p.enhance), protectedInput = request(protectedF.p, protectedF.ref, 'protected-salvage');
        committed(await gate(protectedF.p).submit(protectedInput));
        eq(protectedF.p.enhance!.enhancements, oldEnhance!.enhancements, 'O08 既有强化/护符历史结果和去重保留');
        eq(protectedF.p.enhance!.receipts, oldEnhance!.receipts, 'O08 原强化收据保留');
        payloads.push({ state: 'protected-enhance-history', save: copy(protectedF.p.exportSave()), request: protectedInput });
        const enchanted = await source();
        const enchantedResult = await new EnchantGate(enchanted.p).submit({ enchantRequestId: 'existing-enchant', instanceRef: enchanted.ref, fromElement: null, element: '金' });
        ok(enchantedResult.allowed, 'O08 已有正式附灵路径成功');
        await unchanged(enchanted.p, () => gate(enchanted.p).submit(request(enchanted.p, enchanted.ref, 'cannot-detach-enchant')), 'O08 选中已有附灵关联无法安全失效则整拒');
        const unrelated = await forge(enchanted.p);
        committed(await gate(enchanted.p).submit(request(enchanted.p, unrelated, 'unrelated-salvage')));
        eq(new EnchantGate(enchanted.p).loadRefresh().allowed, true, 'O08 未选附灵目标及完整历史仍可读');
        const further = await new EnchantGate(enchanted.p).submit({ enchantRequestId: 'preserve-enchant-after-salvage', instanceRef: enchanted.ref, fromElement: '金', element: '水' });
        ok(further.allowed, 'O08 分解其它实例后既有附灵路径继续成功');

        const good = copy(payloads[0].save), goodBag: any = copy(good.salvage);
        const corruptions: ((bag: any) => void)[] = [
          bag => { bag.destructions[0].state = 'pending'; }, bag => { delete bag.destructions[0].salvageRequestId; },
          bag => { bag.destructions[0].grade = 'mythic'; }, bag => { bag.destructions[0].refineStones = 0; },
          bag => { bag.destructions[0].output.count = 2; }, bag => { bag.destructions[0].destroyed = false; },
          bag => { bag.destructions.push(copy(bag.destructions[0])); }, bag => { bag.receipts = []; },
          bag => { bag.receipts.push(copy(bag.receipts[0])); }, bag => { bag.ownerSlot = 4; },
        ];
        for (const mutate of corruptions) {
          const bag = copy(goodBag); mutate(bag);
          eq(isValidSalvageProgress(bag), false, 'O08 不完整矛盾未知历史纯结构拒绝');
          const p = bare(), before = copy(p.exportSave()), writes = idb.writes;
          eq(await p.importSave({ ...copy(good), salvage: bag }, { async: true }), false, 'O08 坏袋import拒绝');
          eq(p.exportSave(), before, 'O08 拒绝import不修档不清资产'); eq(idb.writes, writes, 'O08 拒绝import零写');
          (p as any).salvage = copy(bag);
          await unchanged(p, () => gate(p).submit(payloads[0].request), 'O08 坏袋旧回调阻断不补做');
          await unchanged(p, () => gate(p).loadRefresh(), 'O08 坏袋刷新不修档');
        }
        idb.rows.set(1, { slotKey: 1, data: copy(good), lastSaveAt: 1 });
        for (const badBag of [{ state: 'pending', salvageRequestId: 'old' }, { state: 'unknown' }]) {
          const stored = copy(idb.rows.get(1)) as { slotKey: number; data: Record<string, unknown>; lastSaveAt: number };
          stored.data.salvage = copy(badBag); idb.rows.set(1, copy(stored));
          const rows = copy([...idb.rows]), writes = idb.writes, commits = idb.commits;
          const loaded = await Progress.load({ async: true, slot: 1 }); progresses.push(loaded);
          ok(loaded.storageError !== undefined, 'O08 真实旧坏档读回 storageError');
          await unchanged(loaded, () => gate(loaded).submit(payloads[0].request), 'O08 真实旧坏档不按空档补做');
          eq(await loaded.save({ async: true }), false, 'O08 旧坏档普通保存也拒绝');
          eq([...idb.rows], rows, 'O08 未知坏记录原信息完整保留'); eq([idb.writes, idb.commits], [writes, commits], 'O08 坏档零写零提交');
        }
        const absent = bare(), oldSave = copy(absent.exportSave());
        eq(await absent.importSave(oldSave, { async: true }), true, 'O08 缺字段旧档合法');
        eq(absent.salvage, undefined, 'O08 缺字段保持undefined'); eq(Object.prototype.hasOwnProperty.call(absent.exportSave(), 'salvage'), false, 'O08 export不补业务袋');
        mark('O08', ['missing-or-uninstalled-atomic-carrier-zero-write', 'carrier-false-throw-draft-tamper-atomic-refusal', 'actual-destroy-output-failure-zero-delta', 'idb-before-complete-invisible-abort-and-explicit-retry', 'serialization-failure-lock-release', 'unknown-corrupt-record-real-load-storageError-no-repair', 'old-save-missing-field-undefined', 'existing-protect-enhance-history-retained', 'selected-enchant-relation-refused-unrelated-enchant-still-works', 'formal-closed-fresh-ssr-old-callback-zero-write']);
      }
    } finally { Math.random = random; }
    eq(randomCalls, 0, '全程分解确定性零概率调用'); eq(featureFlags(), flags, 'features保持');
    eq(JSON.stringify(enhance), tableBefore, 'enhance内存数值表只读保持'); eq(localWrites, 0, '真实IDB零localStorage写旁路');
    return { passed: true, assertions, dataMode, graph, cases, payloads, dependencyPayload,
      storageWrites: idb.writes, commits: idb.commits, randomCalls, localWrites,
      salvageClosedTipsWired: true, refineStoneMapped: true, salvageOpenFixtureTableExecuted: openFixture && !refreshPayloads && !invalidDependency,
      formalInstanceSource: true, softOpenedSalvage: false, SalvageOpenFlag: false, released: false,
      enchantSoftOpenPreserved: true, EnhanceOpenFlagPreserved: true, protectCharmSoftOpenPreserved: true,
      productionFixtureInstances: false, activeSalvageOpenFlag: openFixture,
      explicitTestAdapters: { qualification: true, finiteCapacity: true, armorRecipes: openFixture ? ['fox_robe', 'cloth_shoes'] : [],
        armorRecipesDiskChanged: false, armorForgeProductionAuthorized: false },
      boundary: '本窗=分解开态夹具全表≠soft-open≠release≠进包；fixture≠正式；核齐备≠生产放行' };
  } finally {
    for (const p of progresses) await p.flushSaves();
    Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
