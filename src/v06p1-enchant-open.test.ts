// 附灵 soft-open 正式磁盘图；仅独立 Vite SSR 关态图注入 false。soft-open≠进包≠发版；fixture≠正式。
import enhance from '@xt/balance/enhance.json';
import recipes from '@xt/balance/recipes.json';
import { GAME_PHASE, ITEMS, t } from './data';
import { featureFlags } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, saveStore, setSaveBackend } from './SaveStore';
import { EnchantGate } from './EnchantGate';
import { ForgeGate } from './ForgeGate';
import { EnhanceGate } from './EnhanceGate';
import * as Closed from './EnchantClosed';
import * as EnhanceClosed from './EnhanceClosed';
import { isEnchantOpenForFixture } from './EnchantOpenFlag';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import { isValidEnchantProgress } from './EnchantProgress';
import { GameScene } from './scenes/GameScene';

type Payload = { state: string; save: Record<string, unknown>; request: { enchantRequestId: string; instanceRef: string; fromElement: Element | null; element: Element } };
type Element = '金' | '木' | '水' | '火' | '土';
type GateResult = Awaited<ReturnType<EnchantGate['submit']>>;
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

export async function runEnchantOpenFixtureTests(options: {
  openFixture: boolean; dataMode: string; refreshPayloads?: Payload[] | null; invalidDependency?: string;
}) {
  const { openFixture, dataMode, refreshPayloads = null, invalidDependency } = options;
  const graph = openFixture ? 'formal-open' : 'memory-closed', label = dataMode + '/' + graph;
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
  const elements: Element[] = ['金', '木', '水', '火', '土'];
  const cases: Record<string, { executed: boolean; evidenceKeys: string[] }> = {};
  const mark = (key: string, evidenceKeys: string[]) => { cases[key] = { executed: true, evidenceKeys }; };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => { localWrites++; },
  } });
  setSaveBackend(createIndexedDbBackend(idb.factory)); Progress.setActiveSlot(1);
  const request = (id: string, ref: string, element: Element = '金', fromElement: Element | null = null) => ({
    enchantRequestId: id, instanceRef: ref, fromElement, element,
  });
  function bare() {
    const p = new Progress(); progresses.push(p); p.stones = 100000; p.rootElement = '金';
    p.inventory = { beast_core: 20, rabbit_fur: 7, protect_charm: 3, refine_stone: 100 };
    return p;
  }
  async function source(name: string, itemId = 'bamboo_sword') {
    const recipe = recipes.recipes.find(row => row.type === 'forge' && row.output === itemId)!;
    ok(recipe, '正式源只使用已登记 recipes 打造行');
    const p = bare(); p.inventory[recipe.blueprint!] = 10;
    for (const material of recipe.materials) p.inventory[material.item] = Math.max(p.inventory[material.item] ?? 0, material.count * 10);
    const forged = await new ForgeGate(p, { random: () => 0, ledgerId: () => dataMode + '-enchant-source-' + (++sequence) }).submit({
      craftRequestId: 'enchant-source-' + (++sequence), blueprintId: recipe.blueprint!,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })),
    });
    ok(forged.allowed && forged.result, '默认 ForgeGate 完整提交产生正式来源');
    eq(forged.result.state, 'committed', '来源必须完整 committed');
    const ref = forged.result.resultItem.instanceRef;
    eq(p.formalEnhanceInstanceStatus(ref), 'registered', '正式来源登记属于当前档');
    eq(p.formalEnhanceInstances().some(row => row.instanceRef === ref), true, '沿正式实例源，不按 itemId 数量补造');
    return { p, ref, gate: new EnchantGate(p) };
  }
  function committed(value: GateResult) {
    ok(value.allowed && value.result, '返回完整附灵结果'); return value.result;
  }
  function denied(value: GateResult, message: string) {
    eq(value.allowed, false, message);
    ok('tipKey' in value && /^enchant\.(fixture|closed)\./u.test(value.tipKey), message + '：独立附灵拒绝');
  }
  async function unchanged(p: Progress, action: () => unknown | Promise<unknown>, message: string, mayWrite = false) {
    const before = copy(p.exportSave()), writes = idb.writes, commits = idb.commits, rows = copy([...idb.rows]);
    const value = await action() as GateResult; denied(value, message);
    eq(p.exportSave(), before, message + '：整档资源元素属性实例业务记录零增量');
    eq(idb.commits, commits, message + '：零完整提交');
    eq([...idb.rows], rows, message + '：磁盘原合法状态不变');
    if (!mayWrite) eq(idb.writes, writes, message + '：零持久写');
    return value;
  }
  async function replay(p: Progress, input: ReturnType<typeof request>, message: string) {
    const before = copy(p.exportSave()), writes = idb.writes, commits = idb.commits;
    const gate = new EnchantGate(p), value = await gate.submit(copy(input));
    eq(value.allowed, true, message + '：只读完整成功结果允许');
    eq('replayed' in value ? value.replayed : false, true, message + '：明确重放');
    eq('result' in value ? value.result : null,
      p.enchant!.enchantments.find(row => row.enchantRequestId === input.enchantRequestId), message + '：原完整结果原样读回');
    eq(p.exportSave(), before, message + '：不补料不重叠属性不补做');
    eq([idb.writes, idb.commits], [writes, commits], message + '：零写');
    const read = gate.result(input.enchantRequestId);
    eq('result' in read ? read.result : null, 'result' in value ? value.result : null, message + '：独立结果 API 一致');
  }
  async function closed(p: Progress, message: string) {
    const before = copy(p.exportSave()), writes = idb.writes, commits = idb.commits;
    let forbiddenReads = 0;
    const fail = () => { forbiddenReads++; throw new Error('关态不得读实例/库存/事务/请求'); };
    const hostile = new Proxy({}, { get: fail }) as ReturnType<typeof request>;
    const opts = { ledgerId: fail, canCommitResult: fail };
    Object.defineProperty(opts, 'fixtureInstances', { get: fail });
    const gate = new EnchantGate(p, opts);
    const methods = ['count', 'permanentCount', 'formalEnhanceInstances', 'formalEnhanceInstanceStatus',
      'removeItem', 'addItem', 'persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync'];
    const descriptors = methods.map(name => [name, Object.getOwnPropertyDescriptor(p, name)] as const);
    for (const method of methods) Object.defineProperty(p, method, { configurable: true, value: fail });
    const operations = [
      [() => gate.feature(), Closed.featureClosed], [() => gate.entrance(), Closed.refuseEntrance],
      [() => gate.enchant(hostile), Closed.refuseEnchant], [() => gate.submit(hostile), Closed.refuseSubmit],
      [() => gate.result('old-callback'), Closed.refuseResult], [() => gate.element('old-instance'), Closed.refuseElement],
      [() => gate.loadRefresh(), Closed.refuseLoadRefresh], [() => gate.laterService(), Closed.refuseLaterService],
    ] as const;
    try {
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [action, expected] of operations) eq(await action(), expected(), message + '：八 tip 原样');
        const values = await Promise.all(operations.map(async ([action]) => action()));
        values.forEach((value, index) => eq(value, operations[index][1](), message + '：并发旧回调拒绝'));
      }
    } finally {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(p, name, descriptor); else Reflect.deleteProperty(p, name);
      }
    }
    eq(forbiddenReads, 0, message + '：首句关态零资格/请求/事务读取');
    eq(p.exportSave(), before, message + '：完整既有事实保留');
    eq([idb.writes, idb.commits], [writes, commits], message + '：零写零提交');
  }
  async function roundtrip(payload: Payload) {
    const save = copy(payload.save), p = (Progress as any).restore(save, false) as Progress;
    progresses.push(p);
    eq(p.enchant, save.enchant, 'O06 restore 完整袋事实一致');
    eq([p.stones, p.inventory], [save.stones, save.inventory], 'O06 restore 消费事实一致');
    ok(isValidEnchantProgress(p.enchant), 'O06 完整附灵袋结构合法');
    await replay(p, payload.request, 'O06 restore 重放');
    const before = copy(p.exportSave()), writes = idb.writes;
    const view = new EnchantGate(p).loadRefresh();
    eq(view.allowed, true, 'O06 刷新只读完整合法袋');
    eq(p.exportSave(), before, 'O06 刷新不补扣补做');
    eq(idb.writes, writes, 'O06 刷新零写');
    if ('progress' in view && view.progress) {
      view.progress.instances[0].element = '土';
      eq(p.enchant, save.enchant, 'O06 篡改只读副本不污染真实事实');
    }
    eq(await p.importSave(copy(save), { async: true }), true, 'O06 import 接受完整袋');
    eq(p.enchant, save.enchant, 'O06 import 不改完整结果');
    await replay(p, payload.request, 'O06 import 重放');
    eq(await p.save({ async: true }), true, 'O06 普通保存成功');
    const loaded = await Progress.load({ async: true, slot: 1 }); progresses.push(loaded);
    eq([loaded.enchant, loaded.inventory, loaded.stones], [save.enchant, save.inventory, save.stones], 'O06 save/load 完整事实一致');
    await replay(loaded, payload.request, 'O06 load 重放');
    eq(loaded.enhance, save.enhance, 'O08 强化与护符历史完整保留');
  }
  function sceneSmoke() {
    const p = bare();
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
  try {
    eq(isEnchantOpenForFixture(), openFixture, '独立 SSR 图 Flag 正式 true / 内存关态 false');
    eq(isEnhanceOpenForFixture(), true, 'EnhanceOpenFlag 保持正式 true 不回翻');
    eq(isForgeOpenForFixture(), true, 'ForgeOpenFlag 保持正式 true，附灵独立授权');
    eq(GAME_PHASE, 5, '阶段保持5');
    const sceneSmokeEvidence = invalidDependency ? null : sceneSmoke();
    const random = Math.random;
    Math.random = () => { randomCalls++; throw new Error('附灵不得调用概率源'); };
    try {
      if (!openFixture) {
        await closed(bare(), 'SSR 内存关态');
        for (const payload of refreshPayloads ?? []) {
          const p = (Progress as any).restore(copy(payload.save), false) as Progress; progresses.push(p);
          eq(p.enchant, payload.save.enchant, 'O08 关态读档保留合法完整附灵历史');
          await closed(p, 'O08 关态旧结果及回调');
        }
        mark('O08', ['memory-flag-false-eight-tips', 'hostile-getters-unread', 'closed-old-callback-preserves-assets']);
      } else if (invalidDependency) {
        const f = await source('invalid-' + invalidDependency);
        await unchanged(f.p, () => f.gate.enchant(request('invalid-preview', f.ref)), 'O03 非法依赖只读预览整拒');
        await unchanged(f.p, () => f.gate.submit(request('invalid-submit', f.ref)), 'O03 非法依赖提交整拒');
        mark('O03', ['invalid-dependency-' + invalidDependency, 'zero-resource-element-record-delta']);
      } else if (refreshPayloads) {
        for (const payload of refreshPayloads) await roundtrip(payload);
        mark('O06', ['fresh-independent-ssr-save-load-import-restore', 'result-dedupe-cost-final-element-identical']);
      } else {
        eq(ITEMS.beast_core.phase, 5, 'O01 有效内丹资格 phase=5');
        eq(enhance.enchant, { elementDamage: 0.05, sameRootBonus: 0.05,
          cost: { stones: 2000, materials: [{ item: 'beast_core', count: 1 }] } }, 'O01 唯一只读附灵数值无概率');
        for (const element of elements) {
          const f = await source('first-' + element), input = request('first-' + elements.indexOf(element), f.ref, element);
          f.p.rootElement = element;
          eq(await f.p.save({ async: true }), true, 'O01 显式灵根夹具准备先普通保存');
          const before = copy(f.p.exportSave()), writes = idb.writes, commits = idb.commits;
          eq(f.gate.feature().allowed, true, 'O01 独立功能 API 只读许可');
          eq(f.gate.entrance().allowed, true, 'O01 独立入口 API 只读许可');
          eq(f.gate.enchant(input).allowed, true, 'O01 合法正式武器只读预览');
          eq(f.p.exportSave(), before, 'O01 功能入口选择预览均零写');
          eq(idb.writes, writes, 'O01 预览不启动保存');
          const result = committed(await f.gate.submit(input));
          eq([result.state, result.success, result.instanceRef, result.itemId, result.type, result.fromElement, result.element],
            ['committed', true, f.ref, 'bamboo_sword', 'weapon', null, element], 'O01 五行确定性完整成功且保留正式身份');
          eq([result.stones, result.materials], [2000, [{ itemId: 'beast_core', count: 1 }]], 'O01 费用严格正式表 2000+1');
          eq(result.attributes, { elementDamage: 0.05, sameRootBonus: 0.05 }, 'O01/O02 同根额外 0.05 一次');
          eq([f.p.stones, f.p.count('beast_core')], [Number(before.stones) - 2000, 19], 'O01 资源完整各扣一次');
          eq(f.p.enchant!.enchantments, [result], 'O01 完整结果同事务入袋');
          eq(f.p.enchant!.receipts, [result.enchantResultRef], 'O01 去重同事务成立');
          eq(f.p.enchant!.instances.map(row => [row.instanceRef, row.element, row.attributes]),
            [[f.ref, element, result.attributes]], 'O01 最终元素属性同事务生效');
          eq([idb.writes, idb.commits], [writes + 1, commits + 1], 'O01 消费元素属性结果去重一次提交');
          const disk = (await saveStore.readSlot(1))!.data;
          eq([disk.stones, disk.inventory, disk.enchant], [f.p.stones, f.p.inventory, f.p.enchant], 'O01 磁盘事实同事务完整一致');
          eq(f.p.enhance, before.enhance, 'O01 既有强化实例与护符事实不改');
          eq([f.p.count('rabbit_fur'), f.p.count('protect_charm'), f.p.forgingLevel, f.p.forgingExp],
            [7, 3, before.forgingLevel, before.forgingExp], 'O01 旁路物品品质生活技能经验保持');
          await replay(f.p, input, 'O04 五行原成功请求重放');
          await unchanged(f.p, () => f.gate.submit(request('new-same-' + elements.indexOf(element), f.ref, element, element)), 'O04 同元素新请求拒绝');
          if (element === '金') payloads.push({ state: 'first-success', save: copy(f.p.exportSave()), request: input });
        }
        mark('O01', ['five-elements-default-ForgeGate-formal-source', 'read-only-feature-entrance-preview',
          'deterministic-2000-stones-one-core-one-commit', 'production-fixtureInstances-absent']);
        const different = await source('different-root'); different.p.rootElement = '水';
        eq(await different.p.save({ async: true }), true, 'O02 显式不同根准备先普通保存');
        const differentResult = committed(await different.gate.submit(request('different-root', different.ref, '火')));
        eq(differentResult.attributes, { elementDamage: 0.05, sameRootBonus: 0 }, 'O02 不同灵根无额外加成');
        mark('O02', ['five-same-roots-exact-config-bonus', 'different-root-zero-sameRootBonus', 'no-stacking-on-replay']);

        for (const mode of ['stones', 'core', 'transient-core', 'missing-owner', 'itemId', 'foreign', 'unknown-root', 'invalid-element', 'stale-first'] as const) {
          const f = await source('reject-' + mode), input: any = request('reject-' + mode, f.ref);
          if (mode === 'stones') f.p.stones = 1999;
          if (mode === 'core') f.p.inventory.beast_core = 0;
          if (mode === 'transient-core') { f.p.inventory.beast_core = 0; (f.p as any).transientItems = { beast_core: 1 }; }
          if (mode === 'missing-owner') delete f.p.inventory.bamboo_sword;
          if (mode === 'itemId') input.instanceRef = 'bamboo_sword';
          if (mode === 'foreign') input.instanceRef = 'other-slot-formal-instance';
          if (mode === 'unknown-root') f.p.rootElement = '';
          if (mode === 'invalid-element') input.element = '雷';
          if (mode === 'stale-first') input.fromElement = '木';
          await unchanged(f.p, () => f.gate.submit(input), 'O03 ' + mode + ' 整笔拒绝');
        }
        for (const input of [null, {}, { enchantRequestId: '', instanceRef: 'x', fromElement: null, element: '金' },
          { ...request('bad-extra', 'x'), extra: true }, { ...request('missing-from', 'x'), fromElement: undefined }])
          await unchanged(bare(), () => new EnchantGate(progresses[progresses.length - 1]).submit(input as any), 'O03 非法请求完整拒绝');
        const quantityOnly = bare(); quantityOnly.inventory.bamboo_sword = 99; quantityOnly.equip.weapon = 'bamboo_sword';
        await unchanged(quantityOnly, () => new EnchantGate(quantityOnly).submit(request('quantity-only', 'bamboo_sword')), 'O03 数量和装备槽不得制造正式身份');
        const armor = await source('armor');
        armor.p.enhance!.instances[0].type = 'armor';
        await unchanged(armor.p, () => armor.gate.submit(request('armor', armor.ref)), 'O03 非法 armor 正式实例拒绝');
        const armorP = bare(); armorP.inventory.fox_robe = 1;
        await unchanged(armorP, () => new EnchantGate(armorP, { fixtureInstances: [{
          instanceRef: 'fixture-armor', itemId: 'fox_robe', type: 'armor', enhanceLevel: 0,
        }] }).submit(request('fixture-armor', 'fixture-armor')), 'O03 显式 armor 夹具也不放行');
        for (const patch of [
          { phase: 6 }, { enabled: false }, { placeholder: true }, { qualityEnabled: true }, { slot: 'robe' }, { type: 'material' },
        ]) {
          const f = await source('invalid-weapon-qualification-' + (++sequence)), original = ITEMS.bamboo_sword;
          try {
            ITEMS.bamboo_sword = { ...original, ...patch } as typeof original;
            await unchanged(f.p, () => f.gate.enchant(request('invalid-weapon-preview', f.ref)), 'O03 正式武器无效资格预览零写拒绝');
            await unchanged(f.p, () => f.gate.submit(request('invalid-weapon-submit', f.ref)), 'O03 正式武器无效资格提交零写拒绝');
          } finally { ITEMS.bamboo_sword = original; }
          eq(ITEMS.bamboo_sword === original, true, 'O03 仅替换 SSR 内存资格对象，恢复原引用，磁盘表只读');
        }
        const noFallback = await source('no-fixture-fallback');
        for (const fixtureInstances of [[], copy(noFallback.p.formalEnhanceInstances())])
          await unchanged(noFallback.p, () => new EnchantGate(noFallback.p, { fixtureInstances })
            .submit(request('no-fixture-fallback', noFallback.ref)), 'O03 显式夹具授权不回退或冒认正式来源');
        const fixtureRecipe = recipes.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword')!;
        const fixtureP = bare(); fixtureP.inventory[fixtureRecipe.blueprint!] = 1; fixtureP.inventory.spirit_copper = 10;
        const fixtureCraft = await new ForgeGate(fixtureP, { fixtureRecipes: [{
          blueprintId: fixtureRecipe.blueprint!, blueprintCount: 1,
          materials: fixtureRecipe.materials.map(row => ({ itemId: row.item, count: row.count })), resultItemId: 'bamboo_sword',
        }], random: () => 0, ledgerId: () => 'fixture-only-source' }).submit({
          craftRequestId: 'fixture-only-source', blueprintId: fixtureRecipe.blueprint!,
          materials: fixtureRecipe.materials.map(row => ({ itemId: row.item, count: row.count })),
        });
        ok(fixtureCraft.allowed && fixtureCraft.result, 'O03 显式 Forge 测试来源可建立夹具结果');
        await unchanged(fixtureP, () => new EnchantGate(fixtureP).submit(request('fixture-not-formal', fixtureCraft.result!.resultItem.instanceRef)),
          'O03 完整夹具打造袋不自动升格正式来源');
        eq(new EnhanceGate(quantityOnly).laterService(), EnhanceClosed.refuseLaterService(), 'O03 强化混入仍原 later_service');
        eq(new EnchantGate(quantityOnly).laterService(), Closed.refuseLaterService(), 'O03 独立附灵分解仍关闭');
        mark('O03', ['missing-stones-core-transient-core', 'invalid-request-root-element-instance-armor-foreign',
          'itemId-quantity-slot-and-fixture-history-not-authorization', 'weapon-phase-enabled-placeholder-quality-slot-type',
          'explicit-fixture-never-falls-back-to-formal-source', 'independent-flag-no-other-service-bypass',
          'ssr-invalid-mapping-and-config-separate-graphs']);

        const replacement = await source('replacement'), firstInput = request('replace-first', replacement.ref, '金');
        committed(await replacement.gate.submit(firstInput));
        const firstSave = copy(replacement.p.exportSave());
        replacement.p.stones = 0; replacement.p.inventory.beast_core = 0;
        await replay(replacement.p, firstInput, 'O04 已耗尽物料仍只读原完整结果');
        await unchanged(replacement.p, () => replacement.gate.submit(request('replace-missing', replacement.ref, '水', '金')), 'O05 覆盖缺料保留原态');
        replacement.p.stones = Number(firstSave.stones); replacement.p.inventory.beast_core = 19;
        await unchanged(replacement.p, () => replacement.gate.submit(request('replace-stale', replacement.ref, '水', null)), 'O05 过期原元素拒绝');
        eq(await replacement.p.save({ async: true }), true, 'O05 足量资源显式准备先保存');
        const beforeReplace = copy(replacement.p.exportSave()), replaceWrites = idb.writes;
        const replaceInput = request('replace-full', replacement.ref, '水', '金'), replaced = committed(await replacement.gate.submit(replaceInput));
        eq([replaced.fromElement, replaced.element, replaced.instanceRef], ['金', '水', replacement.ref], 'O05 同身份原元素完整替换');
        eq([replacement.p.stones, replacement.p.count('beast_core')],
          [Number(beforeReplace.stones) - 2000, 18], 'O05 覆盖再付完整 2000+1');
        eq(replaced.attributes, { elementDamage: 0.05, sameRootBonus: 0 }, 'O05 新元素不同根，清旧同根加成且无叠层');
        eq(replacement.p.enchant!.instances.map(row => [row.element, row.attributes]), [['水', replaced.attributes]], 'O05 仅最终元素属性生效');
        eq([replacement.p.enchant!.enchantments.length, replacement.p.enchant!.receipts.length, idb.writes],
          [2, 2, replaceWrites + 1], 'O05 覆盖完整结果与去重一次提交');
        await replay(replacement.p, firstInput, 'O04/O05 覆盖后最早请求仍读原完整结果');
        await replay(replacement.p, replaceInput, 'O04/O05 覆盖结果重放');
        mark('O04', ['same-element-new-request-zero-delta', 'original-result-replay-without-resources', 'old-result-after-replacement-read-only']);
        mark('O05', ['full-cost-atomic-replacement-stable-instanceRef', 'missing-resource-and-stale-fromElement-preserve-old',
          'only-new-element-and-config-attributes-active']);
        payloads.push({ state: 'replacement-success', save: copy(replacement.p.exportSave()), request: replaceInput });

        for (const payload of payloads) await roundtrip(payload);
        const saveA = copy(replacement.p.exportSave()); Progress.setActiveSlot(2);
        const cross = bare(); cross.inventory.bamboo_sword = 10;
        await unchanged(cross, () => new EnchantGate(cross).submit(replaceInput), 'O06 跨档不借来源请求或库存');
        await unchanged(cross, () => new EnchantGate(cross).result(replaceInput.enchantRequestId), 'O06 跨档不混认结果');
        const imported = copy(saveA), beforeCross = copy(cross.exportSave());
        eq(await cross.importSave(imported, { async: true }), true, 'O06 普通导入保留完整来源，不自动修档');
        await unchanged(cross, () => new EnchantGate(cross).submit(request('foreign-import', replacement.ref, '火', '水')),
          'O06 导入另一档 ownerSlot 不授予附灵权限');
        eq(cross.enchant, imported.enchant, 'O06 跨档导入后拒绝仍保留原事实');
        ok(JSON.stringify(beforeCross) !== JSON.stringify(cross.exportSave()), 'O06 导入动作与业务拒绝分别取证');
        const onlyBag = bare(), onlyBagSave = copy(onlyBag.exportSave());
        onlyBagSave.enchant = copy(imported.enchant);
        eq(await onlyBag.importSave(onlyBagSave, { async: true }), true, 'O06 仅完整旧袋普通导入不自动修补来源');
        const bagGate = new EnchantGate(onlyBag);
        for (const action of [
          () => bagGate.submit(replaceInput), () => bagGate.result(replaceInput.enchantRequestId),
          () => bagGate.element(replaceInput.instanceRef), () => bagGate.loadRefresh(),
        ]) await unchanged(onlyBag, action, 'O06 跨档只有附灵袋不可冒认来源或旧结果');
        eq(onlyBag.enchant, imported.enchant, 'O06 阻断跨档歧义读取仍保留原袋不自动修档');
        Progress.setActiveSlot(1);
        mark('O06', ['first-and-replacement-real-save-load-export-import-restore',
          'cross-slot-no-instance-or-result-borrowing', 'fresh-independent-ssr-roundtrip']);

        const rapid = await source('rapid'), rapidInput = request('rapid', rapid.ref);
        const rapidWrites = idb.writes, rapidBefore = rapid.p.stones;
        const rapidResults = await Promise.all([rapid.gate.submit(rapidInput),
          new EnchantGate(rapid.p).submit(copy(rapidInput)), rapid.gate.submit(copy(rapidInput))]);
        eq(rapidResults.filter(row => row.allowed && !('replayed' in row && row.replayed)).length, 1, 'O07 同请求并发恰一完整提交');
        eq([rapid.p.stones, rapid.p.count('beast_core'), rapid.p.enchant!.enchantments.length, idb.writes],
          [rapidBefore - 2000, 19, 1, rapidWrites + 1], 'O07 同请求至多一次消费与完整提交');
        await replay(rapid.p, rapidInput, 'O07 并发完成后再次请求只读重放');
        const conflict = await unchanged(rapid.p, () => rapid.gate.submit({ ...rapidInput, element: '水' }), 'O07 同请求载荷冲突拒绝');
        eq('result' in conflict && conflict.result !== undefined, false, 'O07 冲突不给冒认旧结果');
        const concurrent = await source('different-target'), concurrentWrites = idb.writes;
        const targetResults = await Promise.all(elements.slice(0, 2).map((element, index) =>
          new EnchantGate(concurrent.p).submit(request('different-target-' + index, concurrent.ref, element))));
        eq(targetResults.filter(row => row.allowed).length, 1, 'O07 同实例不同目标只接受一笔原态');
        eq([concurrent.p.enchant!.enchantments.length, concurrent.p.count('beast_core'), idb.writes], [1, 19, concurrentWrites + 1],
          'O07 事务内复核避免重复覆盖和消费');
        const shared = await source('shared-first');
        const secondRecipe = recipes.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword')!;
        const secondForge = await new ForgeGate(shared.p, { random: () => 0, ledgerId: () => dataMode + '-shared-second' }).submit({
          craftRequestId: 'shared-second', blueprintId: secondRecipe.blueprint!,
          materials: secondRecipe.materials.map(row => ({ itemId: row.item, count: row.count })),
        });
        ok(secondForge.allowed && secondForge.result, 'O07 同档第二正式实例登记');
        shared.p.stones = 2000; shared.p.inventory.beast_core = 1;
        eq(await shared.p.save({ async: true }), true, 'O07 共享库存夹具准备先保存');
        const sharedWrites = idb.writes;
        const inventoryResults = await Promise.all([shared.ref, secondForge.result.resultItem.instanceRef].map((ref, index) =>
          new EnchantGate(shared.p).submit(request('shared-' + index, ref))));
        eq(inventoryResults.filter(row => row.allowed).length, 1, 'O07 正式两实例争库存仅一笔完整成功');
        eq([shared.p.stones, shared.p.count('beast_core'), shared.p.enchant!.enchantments.length, idb.writes],
          [0, 0, 1, sharedWrites + 1], 'O07 共享库存不负数不重复扣');
        for (const change of [
          (p: Progress) => { p.level += 1; },
          (p: Progress) => { p.exp += 1; },
          (p: Progress) => { p.quests.q_talisman_intro = { state: 'active', kills: {} }; },
          (p: Progress) => { p.talismanExp += 1; },
        ]) {
          const f = await source('stale-other-facts-' + (++sequence));
          const newer = (Progress as any).restore(copy(f.p.exportSave()), false) as Progress; progresses.push(newer);
          change(newer); eq(await newer.save({ async: true }), true, 'O07 同槽另对象先保存其它合法业务事实');
          const saved = copy((await saveStore.readSlot(1))!.data);
          const stale = await unchanged(f.p, () => f.gate.submit(request('stale-other-facts', f.ref)),
            'O07 旧对象不可覆盖磁盘新等级经验任务符箓事实');
          eq('tipKey' in stale ? stale.tipKey : null, 'enchant.fixture.stale', 'O07 完整存档快照冲突明确 stale');
          eq((await saveStore.readSlot(1))!.data, saved, 'O07 新业务事实完整保留，附灵零写');
        }
        mark('O07', ['same-request-concurrent-one-commit', 'payload-conflict-no-old-result',
          'same-instance-targets-recheck', 'two-formal-instances-shared-inventory-no-negative',
          'stale-progress-does-not-overwrite-new-level-exp-quest-talisman']);

        for (const sentinel of [() => false, () => { throw new Error('受控承载异常'); },
          (draft: Progress) => { draft.stones += 1; return true; },
          (draft: Progress) => { draft.inventory.beast_core += 1; return true; }]) {
          const f = await source('sentinel-' + (++sequence));
          committed(await f.gate.submit(request('sentinel-first', f.ref)));
          await unchanged(f.p, () => new EnchantGate(f.p, { canCommitResult: sentinel }).submit(request('sentinel', f.ref, '水', '金')),
            'O08 承载失败或篡改草稿整笔拒绝');
        }
        const originalRemove = Progress.prototype.removeItem;
        try {
          for (const remove of [() => {}, () => { throw new Error('实际扣除异常'); }]) {
            const f = await source('remove-' + (++sequence));
            Progress.prototype.removeItem = remove;
            await unchanged(f.p, () => f.gate.submit(request('remove', f.ref)), 'O08 真扣除无效或异常整笔回滚');
            Progress.prototype.removeItem = originalRemove;
          }
        } finally { Progress.prototype.removeItem = originalRemove; }
        const interrupted = await source('interrupted'), beforeAbort = copy(interrupted.p.exportSave());
        const diskBefore = (await saveStore.readSlot(1))!.data;
        const hold = idb.holdNextCommit(), pending = interrupted.gate.submit(request('interrupted', interrupted.ref));
        await hold.started;
        eq(interrupted.p.exportSave(), beforeAbort, 'O08 request 成功但 complete 前内存不发布半状态');
        eq((await saveStore.readSlot(1))!.data, diskBefore, 'O08 complete 前磁盘原合法状态');
        idb.abortNextCommit(); hold.release(); denied(await pending, 'O08 IDB abort 整笔拒绝');
        eq(interrupted.p.exportSave(), beforeAbort, 'O08 abort 后内存零半消费半附着');
        eq((await saveStore.readSlot(1))!.data, diskBefore, 'O08 abort 后磁盘原状态');
        const retryInput = request('interrupted', interrupted.ref);
        committed(await interrupted.gate.submit(retryInput));
        eq(interrupted.p.enchant!.enchantments.length, 1, 'O08 中断后显式重试只成功一次');
        await replay(interrupted.p, retryInput, 'O08 重试后原请求重放');
        const completing = await source('completing'), beforeComplete = copy(completing.p.exportSave());
        const completeHold = idb.holdNextCommit(), completePending = completing.gate.submit(request('completing', completing.ref));
        await completeHold.started; eq(completing.p.exportSave(), beforeComplete, 'O08 complete 前只展示原状态');
        completeHold.release(); committed(await completePending);
        eq((await saveStore.readSlot(1))!.data.enchant, completing.p.enchant, 'O08 complete 后才完整发布');
        const serializing = await source('serialization-failure'), serializeInput = request('serialization-failure', serializing.ref);
        const beforeSerialize = copy(serializing.p.exportSave()), serializeRows = copy([...idb.rows]);
        const serializeWrites = idb.writes, serializeCommits = idb.commits;
        const exportDescriptor = Object.getOwnPropertyDescriptor(serializing.p, 'exportSave');
        let serializeResult!: GateResult;
        try {
          Object.defineProperty(serializing.p, 'exportSave', { configurable: true, value: () => {
            throw new Error('受控保存序列化异常');
          } });
          serializeResult = await serializing.gate.submit(serializeInput);
        } finally {
          if (exportDescriptor) Object.defineProperty(serializing.p, 'exportSave', exportDescriptor);
          else Reflect.deleteProperty(serializing.p, 'exportSave');
        }
        denied(serializeResult, 'O08 保存序列化异常整笔拒绝');
        eq('tipKey' in serializeResult ? serializeResult.tipKey : null, 'enchant.fixture.save', 'O08 序列化异常明确保存失败');
        eq(serializing.p.exportSave(), beforeSerialize, 'O08 序列化异常不产生半消费或半附着');
        eq([...idb.rows], serializeRows, 'O08 序列化异常磁盘原合法状态完整保留');
        eq([idb.writes, idb.commits], [serializeWrites, serializeCommits], 'O08 序列化异常零写零提交');
        committed(await serializing.gate.submit(serializeInput));
        eq(serializing.p.enchant!.enchantments.length, 1, 'O08 异常恢复后同 Gate 原请求重试完整成功一次，实例锁已释放');
        const afterSerialization = request('serialization-new-gate', serializing.ref, '水', '金');
        committed(await new EnchantGate(serializing.p).submit(afterSerialization));
        eq([serializing.p.enchant!.enchantments.length, serializing.p.stones, serializing.p.count('beast_core')],
          [2, Number(beforeSerialize.stones) - 4000, 18], 'O08 同槽新 Gate 覆盖成功一次，槽锁已释放且无失败记录');
        await replay(serializing.p, serializeInput, 'O08 序列化失败后原请求成功结果只读重放');
        await replay(serializing.p, afterSerialization, 'O08 序列化失败后新 Gate 覆盖结果只读重放');

        const enhanced = await source('preserve-enhance');
        const enhanceResult = await new EnhanceGate(enhanced.p, { random: () => 0 }).submit({
          enhanceRequestId: 'preserve-protect', instanceRef: enhanced.ref, fromLevel: 0, to: 1, useProtectCharm: true,
        });
        ok(enhanceResult.allowed && enhanceResult.result, 'O08 预置既有正式强化护符完整结果');
        const enhancedBefore = copy(enhanced.p.enhance);
        committed(await enhanced.gate.submit(request('preserve-enchant', enhanced.ref)));
        eq(enhanced.p.enhance, enhancedBefore, 'O08 附灵后强化等级属性护符结果及去重完整保留');
        const preserveSave = copy(enhanced.p.exportSave());
        payloads.push({ state: 'preserve-enhance-protect', save: preserveSave, request: request('preserve-enchant', enhanced.ref) });
        const good = copy(payloads[0].save), goodBag = copy(good.enchant) as any;
        const corruptions: ((bag: any) => void)[] = [
          bag => { bag.enchantments[0].state = 'pending'; },
          bag => { delete bag.enchantments[0].enchantRequestId; },
          bag => { bag.enchantments[0].instanceRef = 'foreign'; },
          bag => { bag.enchantments[0].element = '雷'; },
          bag => { bag.enchantments[0].stones = 0; },
          bag => { bag.enchantments[0].attributes.elementDamage = 0.1; },
          bag => { bag.enchantments[0].materials[0].count = 0; },
          bag => { bag.enchantments.push(copy(bag.enchantments[0])); },
          bag => { bag.instances[0].element = '火'; },
          bag => { bag.instances.push(copy(bag.instances[0])); },
          bag => { bag.receipts = []; },
          bag => { bag.receipts.push(copy(bag.receipts[0])); },
        ];
        for (const mutate of corruptions) {
          const bag = copy(goodBag); mutate(bag);
          eq(isValidEnchantProgress(bag), false, 'O08 未知不完整或矛盾历史袋纯结构拒绝');
          const p = bare(), before = copy(p.exportSave()), writes = idb.writes;
          eq(await p.importSave({ ...copy(good), enchant: bag }, { async: true }), false, 'O08 损坏袋 import 拒绝');
          eq(p.exportSave(), before, 'O08 import 拒绝不清资产不修档');
          eq(idb.writes, writes, 'O08 损坏 import 零写');
          (p as any).enchant = copy(bag);
          await unchanged(p, () => new EnchantGate(p).submit(request('cannot-repair', payloads[0].request.instanceRef)), 'O08 歧义写入阻断');
          await unchanged(p, () => new EnchantGate(p).loadRefresh(), 'O08 歧义刷新不自动修档');
        }
        for (const bag of [{ state: 'pending', enchantRequestId: 'old' }, { state: 'unknown' }]) {
          const p = bare(); (p as any).enchant = copy(bag);
          await unchanged(p, () => new EnchantGate(p).submit(request('old', 'old')), 'O08 旧回调不补做未知记录');
        }
        for (const badBag of [{ state: 'pending', enchantRequestId: 'old-saved' }, { state: 'unknown' }]) {
          const stored = copy(idb.rows.get(1)) as { slotKey: number; data: Record<string, unknown>; lastSaveAt: number };
          stored.data.enchant = copy(badBag); idb.rows.set(1, copy(stored));
          const rows = copy([...idb.rows]), writes = idb.writes, commits = idb.commits;
          const loaded = await Progress.load({ async: true, slot: 1 }); progresses.push(loaded);
          ok(loaded.storageError !== undefined, 'O08 真实读档坏袋进入 storageError，只读保留原档');
          await unchanged(loaded, () => new EnchantGate(loaded).submit(request('old-saved', 'old-saved')),
            'O08 真实坏档不当空档补做旧请求');
          await unchanged(loaded, () => new EnchantGate(loaded).loadRefresh(), 'O08 真实坏档刷新不修复');
          eq(await loaded.save({ async: true }), false, 'O08 真实坏档后普通保存也拒绝');
          eq([...idb.rows], rows, 'O08 未知坏袋磁盘字节保持，禁止自动修档');
          eq([idb.writes, idb.commits], [writes, commits], 'O08 真实坏档读取与后续动作零写');
        }
        const absent = bare(), oldSave = copy(absent.exportSave());
        eq(await absent.importSave(oldSave, { async: true }), true, 'O08 缺字段旧档仍合法');
        eq(absent.enchant, undefined, 'O08 缺字段旧档保持 undefined');
        eq(Object.prototype.hasOwnProperty.call(absent.exportSave(), 'enchant'), false, 'O08 export 不补新业务袋');
        mark('O08', ['carrier-false-throw-and-draft-tamper-rollback', 'deduct-failure-rollback',
          'idb-request-before-complete-invisible-abort-rollback-retry', 'unknown-corrupt-records-blocked-no-repair',
          'serialization-failure-zero-delta-and-both-gate-slot-locks-released',
          'real-load-corrupt-bag-storageError-no-overwrite', 'missing-field-undefined',
          'enhance-and-protect-result-preserved', 'memory-closed-old-callback-graph']);
      }
    } finally { Math.random = random; }
    eq(randomCalls, 0, '附灵全程确定性不读 Math.random');
    eq(featureFlags(), flags, '不覆盖 features');
    eq(JSON.stringify(enhance), tableBefore, '只读 enhance 内存表未改');
    eq(localWrites, 0, '真实 IDB 保存无 localStorage 写旁路');
    return { passed: true, assertions, dataMode, graph, cases, payloads, storageWrites: idb.writes, commits: idb.commits,
      sceneSmoke: sceneSmokeEvidence, randomCalls, localWrites, enchantClosedTipsWired: true, beastCoreMapped: true,
      enchantOpenFixtureTableExecuted: openFixture && !refreshPayloads && !invalidDependency,
      formalInstanceSource: true, softOpenedEnchant: true, EnchantOpenFlag: true, released: false,
      protectCharmSoftOpenPreserved: true, EnhanceOpenFlagPreserved: true, productionFixtureInstances: false,
      activeEnchantOpenFlag: openFixture, formalOpen: true, closedFixtureOnly: true,
      boundary: '本窗=附灵 soft-open；soft-open≠进包≠发版；fixture≠正式≠进包依据' };
  } finally {
    for (const p of progresses) await p.flushSaves();
    Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
