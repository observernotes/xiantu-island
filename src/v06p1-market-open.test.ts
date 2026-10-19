// 正式坊市旗标恒 true；仅 runner 的 Vite SSR 内存关态图可注入 false。
import rules from '@xt/balance/market_consign.json';
import { GAME_PHASE, ITEMS } from './data';
import { featureEnabled, featureFlags } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, saveStore, setSaveBackend } from './SaveStore';
import * as Closed from './MarketClosed';
import { MarketGate, type MarketGateResult } from './MarketGate';
import { isMarketOpenForFixture } from './MarketOpenFlag';
import { isValidMarketProgress } from './MarketProgress';
import { GameScene } from './scenes/GameScene';

type Payload = { state: string; save: Record<string, unknown> };
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


export async function runMarketOpenFixtureTests(options: {
  openFixture: boolean; dataMode?: string; refreshPayloads?: Payload[] | null;
}) {
  const { openFixture, dataMode = 'fixture', refreshPayloads } = options;
  const label = `${dataMode}/${openFixture ? 'formal-open' : 'memory-closed'}`;
  let assertions = 0, sampleCount = 0, ledgerSeq = 0, now = 1_000_000;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const copy = <T>(value: T): T => structuredClone(value);
  const flags = copy(featureFlags()), tableBefore = JSON.stringify(rules);
  eq(isMarketOpenForFixture(), openFixture, '旗标来自当前SSR图');
  eq(rules.enabled, true, '正式软开数值表 enabled=true');
  eq(GAME_PHASE, 5, 'GAME_PHASE=5');
  eq(featureEnabled('indexedDbSaves'), true, '使用正式异步事务');
  ok(!Object.keys(flags).some(key => /market|consign/iu.test(key)), '不增加配表开放开关');
  const oldSlot = Progress.getActiveSlot(), storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const idb = memoryIndexedDb(), progresses: Progress[] = [], payloads: Payload[] = [];
  let localWrites = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => { localWrites++; },
  } });
  setSaveBackend(createIndexedDbBackend(idb.factory));
  Progress.setActiveSlot(1);
  const fixtureOptions = () => ({ fixtureAllowedItemIds: ['rabbit_fur', 'wood_sword'], now: () => now,
    random: () => { sampleCount++; return 0.25; }, ledgerId: () => `${dataMode}-ledger-${++ledgerSeq}` });
  function fixture() {
    const p = new Progress(); progresses.push(p);
    p.stones = 1234; p.inventory = { rabbit_fur: 20, wood_sword: 3, snake_gall: 2 };
    return { p, gate: new MarketGate(p, fixtureOptions()) };
  }
  function listing(result: MarketGateResult) {
    ok(result.allowed, '操作成功');
    ok(result.listing, '成功提供完整单据副本');
    return result.listing;
  }
  function businessDenied(result: MarketGateResult, message: string) {
    eq(result.allowed, false, message);
    ok('tipKey' in result && (result.tipKey.startsWith('market.fixture.') || result.tipKey.startsWith('market.closed.')),
      `${message}：使用开态业务拒绝或纵深 closed tip`);
  }
  function depthDenied(result: MarketGateResult, tipKey: string, message: string) {
    eq(result.allowed, false, message);
    eq('tipKey' in result && result.tipKey, tipKey, `${message}：纵深 tipKey`);
  }
  async function depthUnchanged(p: Progress, request: () => Promise<MarketGateResult>, tipKey: string, message: string) {
    const before = p.exportSave(), writes = idb.writes;
    depthDenied(await request(), tipKey, message);
    eq(p.exportSave(), before, `${message}：整档保留`);
    eq(idb.writes, writes, `${message}：无持久写入`);
  }
  async function unchanged(p: Progress, request: () => Promise<MarketGateResult>, message: string) {
    const before = p.exportSave(), writes = idb.writes;
    businessDenied(await request(), message);
    eq(p.exportSave(), before, `${message}：整档保留`);
    eq(idb.writes, writes, `${message}：无持久写入`);
  }
  async function memoryClosed(p: Progress, message: string) {
    const opts = fixtureOptions();
    // 内存关态连资格、时钟、品类和收益承载哨兵都不得求值。
    const fail = () => { throw new Error('关态禁止查询夹具依赖'); };
    const gate = new MarketGate(p, { ...opts, now: fail, random: fail, canReturnItem: fail, canReceiveReward: fail });
    for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync', 'addItem', 'removeItem', 'addCraftedItem'])
      Object.defineProperty(p, method, { configurable: true, value: fail });
    const before = p.exportSave(), writes = idb.writes, rows = copy([...idb.rows]);
    const requests: [() => unknown | Promise<unknown>, () => unknown][] = [
      [() => gate.feature(), Closed.featureClosed],
      [() => gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }), Closed.refuseList],
      [() => gate.withdraw('foreign'), Closed.refuseWithdraw], [() => gate.settle('foreign'), Closed.refuseDeal],
      [() => gate.claim('foreign'), Closed.refuseClaim], [() => gate.rewards(), Closed.refuseReward],
      [() => gate.loadProgress(), Closed.refuseLoadRefresh], [() => gate.slotOrItem(), Closed.refuseSlotOrItem],
    ];
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const [request, expected] of requests) eq(await request(), expected(), `${message}：八tip原样返回`);
      const results = await Promise.all(requests.map(async ([request]) => request()));
      ok(results.every(result => (result as { allowed: boolean }).allowed === false), `${message}：并发全拒绝`);
      eq(p.exportSave(), before, `${message}：单据/栏位/资产零增量`);
      eq(idb.writes, writes, `${message}：存储写入零次`);
      eq([...idb.rows], rows, `${message}：既有存档原文保留`);
    }
  }
  async function roundtrip(payload: Payload) {
    const { p } = fixture();
    eq(await p.importSave(copy(payload.save), { async: true }), true, `${payload.state}：真实importSave通过`);
    eq(p.market, payload.save.market, `${payload.state}：import保留完整单据`);
    eq(p.inventory, payload.save.inventory, `${payload.state}：import不改变库存`);
    eq(p.stones, payload.save.stones, `${payload.state}：import不改变收益`);
    const restored = (Progress as any).restore(copy(payload.save), false) as Progress;
    progresses.push(restored);
    eq(restored.market, payload.save.market, `${payload.state}：真实restore保留`);
    const loaded = await Progress.load({ async: true, slot: 1 }); progresses.push(loaded);
    eq(loaded.market, payload.save.market, `${payload.state}：真实异步读档/刷新保留`);
    eq(loaded.inventory, payload.save.inventory, `${payload.state}：读档库存一致`);
    eq(loaded.stones, payload.save.stones, `${payload.state}：读档收益一致`);
    if (!openFixture) { await memoryClosed(loaded, `${payload.state}/跨关态旧档`); return; }
    const gate = new MarketGate(loaded, fixtureOptions()), before = loaded.exportSave(), writes = idb.writes;
    ok(gate.loadProgress().allowed, `${payload.state}：只读刷新可查看`);
    eq(loaded.exportSave(), before, `${payload.state}：读档不推进状态`);
    eq(idb.writes, writes, `${payload.state}：读档不触发保存`);
    const historical = loaded.market!.listings[loaded.market!.listings.length - 1];
    if (payload.state === 'withdrawn') await unchanged(loaded, () => gate.withdraw(historical.listingId), 'O09刷新终态不重返');
    if (payload.state === 'claimed') await unchanged(loaded, () => gate.claim(historical.listingId), 'O09刷新终态不重发');
    if (payload.state === 'sold_pending_claim') await unchanged(loaded, () => gate.settle(historical.listingId), 'O09刷新待领不重复成交');
  }
  function sceneSmoke() {
    const { p } = fixture(), logs: { text: string; color: string }[] = [];
    const before = p.exportSave(), writes = idb.writes;
    const entrance = { name: 'market_consign_entrance', x: 100, y: 200 };
    const scene: any = Object.assign(Object.create(GameScene.prototype), {
      prog: p, map: { id: 'market-smoke', objects: [] }, player: { x: 100, y: 200 },
      log: (text: string, color: string) => logs.push({ text, color }),
      encounterRuntime: { interact() { throw new Error('寄售入口须先于其他交互'); } },
    });
    eq(typeof scene.tryInteractMarketConsign, 'function', 'Scene 最小寄售入口存在');
    eq(scene.tryInteractMarketConsign(), false, '没有地图对象时安静 no-op');
    scene.map.objects = [{ ...entrance, name: 'npc_shop' }];
    eq(scene.tryInteractMarketConsign(), false, 'NPC 商店不是寄售入口');
    scene.map.objects = [entrance]; scene.player.x = entrance.x + 29;
    eq(scene.tryInteractMarketConsign(), false, '入口横向超距不交互');
    scene.player.x = entrance.x; scene.player.y = entrance.y + 41;
    eq(scene.tryInteractMarketConsign(), false, '入口纵向超距不交互');
    scene.player.y = entrance.y; scene.senseMap = { objectVisible: () => false };
    eq(scene.tryInteractMarketConsign(), false, '不可见入口不交互');
    eq(logs, [], '无对象/商店/超距/隐藏入口均无提示');
    scene.senseMap = undefined;
    for (const name of ['market_consign_entrance', 'fangshi_consign']) {
      scene.map.objects = [{ ...entrance, name }];
      eq(scene.tryInteractMarketConsign(), true, `${name} 邻近入口被消费`);
      eq(logs[logs.length - 1], openFixture
        ? { text: '坊市寄售已开放。', color: '#fff8d0' }
        : { text: Closed.featureClosed().text, color: '#aaaaaa' }, 'Scene 按正式开态/内存关态显示提示');
    }
    eq(scene.tryInteract(), true, '通用交互在遭遇/NPC 前消费寄售入口');
    const originalFeature = MarketGate.prototype.feature;
    let featureCalls = 0;
    try {
      MarketGate.prototype.feature = function () {
        featureCalls++;
        if (!openFixture) throw new Error('内存关态不得查询 MarketGate');
        return { allowed: false, tipKey: 'market.fixture.smoke', text: '寄售冒烟拒绝。' };
      };
      eq(scene.tryInteractMarketConsign(), true, '最小入口保留拒绝提示分支');
      eq(featureCalls, openFixture ? 1 : 0, '只有正式开态查询 MarketGate.feature');
      eq(logs[logs.length - 1], { text: openFixture ? '寄售冒烟拒绝。' : Closed.featureClosed().text,
        color: '#aaaaaa' }, 'Gate 拒绝原文或内存关态文案被展示');
    } finally { MarketGate.prototype.feature = originalFeature; }
    eq(p.exportSave(), before, 'Scene 冒烟不修改角色或寄售袋');
    eq(idb.writes, writes, 'Scene 冒烟不写存档');
    return { noObjectNoop: true, npcShopIgnored: true, nearbyOnly: true, hiddenIgnored: true,
      aliases: ['market_consign_entrance', 'fangshi_consign'], genericInteraction: true,
      graph: openFixture ? 'formal-open' : 'memory-closed', gateDeniedRouting: openFixture,
      closedBypassesGate: !openFixture, saveWrites: idb.writes - writes };
  }
  try {
    const sceneSmokeEvidence = sceneSmoke();
    if (refreshPayloads) {
      eq(refreshPayloads.map(row => row.state), ['listed', 'withdrawn', 'sold_pending_claim', 'claimed'], '刷新覆盖四状态');
      for (const payload of refreshPayloads) await roundtrip(payload);
      payloads.push(...copy(refreshPayloads));
    }
    if (!openFixture) {
      for (const market of [undefined, { state: 'listed', heldItemRef: { id: 'rabbit_fur' } },
        { state: 'sold_pending_claim', pendingRewardRef: { amount: 73 } }, { state: 'unknown', raw: 'keep' }]) {
        const { p } = fixture(); (p as any).market = copy(market);
        await memoryClosed(p, '内存关态/无袋或歧义旧袋');
      }
    } else if (!refreshPayloads) {
      const { p, gate } = fixture();
      eq(p.market, undefined, '旧档缺market保持undefined');
      eq(Object.prototype.hasOwnProperty.call(p.exportSave(), 'market'), false, '旧档导出不凭空建袋');
      ok(gate.feature().allowed, 'O01说明在正式开态可查看');
      ok(gate.loadProgress().allowed, '空袋查看可用');
      eq(p.market, undefined, '只读查看不建袋');
      const first = listing(await gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 1 }));
      eq(first.state, 'listed', 'O02 empty→listed');
      eq(first.listingPrice, ITEMS.rabbit_fur.price! * rules.listingPrice.minRatioOfNpcSell, '挂牌低价按表下界钳制');
      eq(p.count('rabbit_fur'), 19, 'O02独占扣押一份');
      eq(p.stones, 1234, '上架不预扣成交手续费');
      ok(first.heldItemRef, 'listed有扣押引用'); eq(first.pendingRewardRef, undefined, 'listed无待领');
      payloads.push({ state: 'listed', save: p.exportSave() });
      await unchanged(p, () => gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }), 'O02同份重复上架');
      await unchanged(p, () => gate.claim(first.listingId), 'O06待售无收益');
      const withdrew = listing(await gate.withdraw(first.listingId));
      eq(withdrew.state, 'withdrawn', 'O03 listed→withdrawn');
      eq(p.count('rabbit_fur'), 20, 'O03原物完整返还');
      eq(p.market!.heldItems.find(row => row.ref === withdrew.heldItemRef)!.disposition, 'returned', '撤回解除扣押，仅保留历史引用'); eq(withdrew.pendingRewardRef, undefined, '非成交无待领');
      eq(withdrew.settlementRef, undefined, '撤回不造成交收据');
      payloads.push({ state: 'withdrawn', save: p.exportSave() });
      await unchanged(p, () => gate.withdraw(first.listingId), 'O03重复撤回不二返');
      const second = listing(await gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#2', listingPrice: 9999 }));
      ok(second.listingId !== first.listingId, '空栏新单身份不复用');
      eq(second.listingPrice, ITEMS.rabbit_fur.price! * rules.listingPrice.maxRatioOfNpcSell, '挂牌高价按表上界钳制');
      const samples = sampleCount;
      await unchanged(p, () => gate.settle(second.listingId), 'O04在线等待不足拒绝成交');
      eq(sampleCount, samples, '等待不足不抽市价');
      now += rules.saleDelaySec * 1000;
      const sold = listing(await gate.settle(second.listingId));
      eq(sold.state, 'sold_pending_claim', 'O04 listed→sold_pending_claim');
      eq(p.market!.heldItems.find(row => row.ref === sold.heldItemRef)!.disposition, 'departed', '成交物离场，仅保留历史引用'); ok(sold.pendingRewardRef, '唯一待领引用');
      ok(sold.settlementRef, '成交收据存在'); eq(sold.claimRef, undefined, '尚未领取');
      eq(p.stones, 1234, 'O04成交不自动领取');
      eq(sampleCount, samples + 1, '市价只在成交抽一次');
      const factor = rules.rewardAmount.marketFactorMin + (rules.rewardAmount.marketFactorMax - rules.rewardAmount.marketFactorMin) * 0.25;
      const expectedReward = sold.listingPrice * (1 - rules.consignFee) * factor;
      const pendingAmount = p.market!.pendingRewards.find(row => row.ref === sold.pendingRewardRef)!.amount;
      ok(Math.abs(pendingAmount - expectedReward) < 1e-9, 'reward严格遵演武公式，不私定取整');
      payloads.push({ state: 'sold_pending_claim', save: p.exportSave() });
      await unchanged(p, () => gate.withdraw(sold.listingId), 'O06已成交不得撤回');
      await unchanged(p, () => gate.settle(sold.listingId), 'O08重复系统回调不再成交');
      eq(sampleCount, samples + 1, '重试不重抽市价');
      const claimed = listing(await gate.claim(sold.listingId));
      eq(claimed.state, 'claimed', 'O05 sold_pending_claim→claimed');
      eq(p.stones, 1234 + pendingAmount, 'O05收益与领取事实同提交');
      eq(p.market!.pendingRewards.find(row => row.ref === claimed.pendingRewardRef)!.claimed, true, '领取后历史收益标记不可再次兑现'); ok(claimed.claimRef, '领取收据存在');
      payloads.push({ state: 'claimed', save: p.exportSave() });
      await unchanged(p, () => gate.claim(sold.listingId), 'O05重复领取不重发');
      eq(sampleCount, samples + 1, '领取不重抽市价');
      for (const payload of payloads) await roundtrip(payload);

      // O06：错误、品类、所有权、满栏均在实际Gate拒绝。
      for (const request of [
        { itemId: 'missing', itemInstanceId: 'missing#1', listingPrice: 10 },
        { itemId: 'snake_gall', itemInstanceId: 'snake_gall#1', listingPrice: 16 },
        { itemId: 'rabbit_fur', itemInstanceId: 'wood_sword#1', listingPrice: 6 },
        { itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#0', listingPrice: 6 },
        { itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#5', listingPrice: NaN },
      ]) await unchanged(p, () => gate.listItem(request), 'O06非法或未获夹具品类授权');
      const noAuthorization = new MarketGate(p);
      await depthUnchanged(p, () => noAuthorization.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#7', listingPrice: 6 }),
        'market.closed.list', '正式无面板(L1)默认拒绝且不回退夹具名单');
      // 2B 正式路径纵深：面板齐但品类消费白名单；禁 fixtureAllowedItemIds 冒充。
      const formalOpts = () => ({ consignPanelReady: true as const, now: () => now,
        random: () => { sampleCount++; return 0.25; }, ledgerId: () => `${dataMode}-formal-${++ledgerSeq}` });
      const formalEmptyPanel = new MarketGate(p, { now: () => now }); // 无 consignPanelReady
      await depthUnchanged(p, () => formalEmptyPanel.listItem({ itemId: 'spirit_herb', itemInstanceId: 'spirit_herb#1', listingPrice: 8 }),
        'market.closed.list', 'L1 无面板：正式品类亦拒上架零写');
      const formalGate = new MarketGate(p, formalOpts());
      // rabbit_fur 仅在夹具名单；正式白名单无此 id → 拒且零写
      await unchanged(p, () => formalGate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#7', listingPrice: 6 }),
        '正式路径不回退 fixtureAllowedItemIds 放行');
      const formalPlayer = fixture();
      formalPlayer.p.inventory = { spirit_herb: 5, rabbit_fur: 3 };
      const formalReady = new MarketGate(formalPlayer.p, formalOpts());
      const formalList = listing(await formalReady.listItem({ itemId: 'spirit_herb', itemInstanceId: 'spirit_herb#1', listingPrice: 8 }));
      eq(formalList.state, 'listed', '正式白名单 spirit_herb 可上架');
      eq(formalPlayer.p.count('spirit_herb'), 4, '正式上架扣押一份');
      await unchanged(formalPlayer.p, () => formalReady.settle(formalList.listingId), '正式未满 saleDelaySec 不成交');
      now += rules.saleDelaySec * 1000;
      const formalSold = listing(await formalReady.settle(formalList.listingId));
      eq(formalSold.state, 'sold_pending_claim', '正式满等待后成交待领且不自动领取');
      const samplesBeforeClaim = sampleCount;
      listing(await formalReady.claim(formalList.listingId));
      eq(sampleCount, samplesBeforeClaim, '正式领取不重抽 marketFactor');
      // 仅夹具名单、无正式白名单字段注入时仍可走夹具；正式 Gate 不得读夹具名单
      const fixtureOnly = new MarketGate(formalPlayer.p, { fixtureAllowedItemIds: ['rabbit_fur'], consignPanelReady: true, now: () => now,
        random: () => 0.25, ledgerId: () => `${dataMode}-fix-only-${++ledgerSeq}` });
      eq((await fixtureOnly.listItem({ itemId: 'spirit_herb', itemInstanceId: 'spirit_herb#2', listingPrice: 8 })).allowed, false,
        '夹具路径不消费正式白名单冒充');
      listing(await fixtureOnly.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }));
      const empty = fixture(); empty.p.inventory = {};
      await unchanged(empty.p, () => empty.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }), 'O06无物');
      await unchanged(p, () => gate.claim('foreign'), 'O06外来单据不可领');
      const unsupported = fixture();
      unsupported.p.pillQualities.rabbit_fur = { low: 20, mid: 0, high: 0, supreme: 0 };
      await unchanged(unsupported.p, () => unsupported.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }), '含品质属性份额不降格扣押');
      const temporary = fixture(); (temporary.p as any).transientItems = { rabbit_fur: 1 };
      await unchanged(temporary.p, () => temporary.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }), '试炼份额不作为永久库存');
      const full = fixture();
      for (let i = 1; i <= rules.slotCapacity; i++) listing(await full.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: `rabbit_fur#${i}`, listingPrice: 6 }));
      now += rules.saleDelaySec * 1000;
      const fullLedger = full.gate.loadProgress(); ok(fullLedger.allowed && fullLedger.progress, '满栏查看');
      const fullId = fullLedger.progress.listings[0].listingId;
      listing(await full.gate.settle(fullId));
      await unchanged(full.p, () => full.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#6', listingPrice: 6 }), 'O06 listed+pending合计占满5栏');
      listing(await full.gate.claim(fullId));
      listing(await full.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#6', listingPrice: 6 }));

      // O07：明确哨兵模拟背包/收益承载失败，沿用真实进度事务。
      const blocked = fixture(), blockList = listing(await blocked.gate.listItem({ itemId: 'wood_sword', itemInstanceId: 'wood_sword#1', listingPrice: 60 }));
      const returnBlocked = new MarketGate(blocked.p, { ...fixtureOptions(), canReturnItem: () => false });
      await unchanged(blocked.p, () => returnBlocked.withdraw(blockList.listingId), 'O07返物承载哨兵失败保持listed');
      now += rules.saleDelaySec * 1000;
      listing(await blocked.gate.settle(blockList.listingId));
      const rewardBlocked = new MarketGate(blocked.p, { ...fixtureOptions(), canReceiveReward: () => false });
      await unchanged(blocked.p, () => rewardBlocked.claim(blockList.listingId), 'O07收益承载哨兵失败保持pending');

      // 四类写操作均测试 IDB request成功但complete前不发布，abort整笔回滚。
      for (const action of ['list', 'withdraw', 'settle', 'claim'] as const) {
        const f = fixture();
        let id = '';
        if (action !== 'list') id = listing(await f.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 })).listingId;
        now += rules.saleDelaySec * 1000;
        if (action === 'claim') listing(await f.gate.settle(id));
        eq(await f.p.save({ async: true }), true, '中断前合法档写入');
        const before = f.p.exportSave(), disk = (await saveStore.readSlot(1))!.data;
        const hold = idb.holdNextCommit();
        const request = action === 'list' ? f.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 })
          : action === 'withdraw' ? f.gate.withdraw(id) : action === 'settle' ? f.gate.settle(id) : f.gate.claim(id);
        await hold.started;
        eq(f.p.exportSave(), before, `O07 ${action} complete前不发布半成品`);
        eq((await saveStore.readSlot(1))!.data, disk, `O07 ${action} complete前持久档不变`);
        idb.abortNextCommit(); hold.release();
        businessDenied(await request, `O07 ${action} abort拒绝`);
        eq(f.p.exportSave(), before, `O07 ${action} abort内存全回滚`);
        eq((await saveStore.readSlot(1))!.data, disk, `O07 ${action} abort磁盘全回滚`);
        const retry = action === 'list' ? f.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 })
          : action === 'withdraw' ? f.gate.withdraw(id) : action === 'settle' ? f.gate.settle(id) : f.gate.claim(id);
        ok((await retry).allowed, `O07 ${action} 中断后正常重试一次成功`);
        eq((await saveStore.readSlot(1))!.data.market, f.p.exportSave().market, `O07 ${action} 重试持久结果完整一致`);
      }

      const offline = fixture(), offlineOrder = listing(await offline.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }));
      await unchanged(offline.p, () => offline.gate.settle(offlineOrder.listingId, { offlineElapsedSec: rules.offlineSettlementWindowSec * 10 }), '离线参数不可绕过实际等待');
      now += rules.offlineSettlementWindowSec * 10 * 1000;
      await unchanged(offline.p, () => offline.gate.settle(offlineOrder.listingId, { offlineElapsedSec: -1 }), '非法离线时间拒绝');
      await unchanged(offline.p, () => offline.gate.settle(offlineOrder.listingId, { offlineElapsedSec: rules.saleDelaySec - 1 }), '离线不足最短等待拒绝');
      listing(await offline.gate.settle(offlineOrder.listingId, { offlineElapsedSec: rules.offlineSettlementWindowSec * 10 }));
      await unchanged(offline.p, () => offline.gate.settle(offlineOrder.listingId, { offlineElapsedSec: rules.offlineSettlementWindowSec }), '离线回调重放不重发');

      // O08：两个Gate共享同一真实Progress，测试两种先达次序及重放。
      for (const withdrawFirst of [true, false]) {
        const f = fixture(), order = listing(await f.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }));
        const other = new MarketGate(f.p, fixtureOptions()); now += rules.saleDelaySec * 1000;
        const operations = withdrawFirst ? [() => f.gate.withdraw(order.listingId), () => other.settle(order.listingId)]
          : [() => f.gate.settle(order.listingId), () => other.withdraw(order.listingId)];
        const results = await Promise.all(operations.map(call => call()));
        eq(results.filter(result => result.allowed).length, 1, 'O08竞态仅一笔转移提交');
        const ledger = f.gate.loadProgress(); ok(ledger.allowed && ledger.progress, '竞态后袋合法');
        eq(ledger.progress.listings[0].state, withdrawFirst ? 'withdrawn' : 'sold_pending_claim', '先达转移唯一成立');
        eq(f.p.count('rabbit_fur'), withdrawFirst ? 20 : 19, '返物与成交不得并存');
        const before = f.p.exportSave();
        await Promise.all([f.gate.settle(order.listingId), other.withdraw(order.listingId), f.gate.settle(order.listingId)]);
        eq(f.p.exportSave(), before, 'O08终态/待领不受重复竞态回调改变');
      }
      const duplicate = fixture();
      const dup = await Promise.all([duplicate.gate, new MarketGate(duplicate.p, fixtureOptions())].map(g =>
        g.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 })));
      eq(dup.filter(row => row.allowed).length, 1, '并发重复份额仅扣一次');
      eq(duplicate.p.count('rabbit_fur'), 19, '并发重复上架不二扣');

      // O09：不同SaveSlot保持各自ledger；外来listingId拒绝且不写。
      const slotA = fixture(), a = listing(await slotA.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }));
      const savedA = slotA.p.exportSave();
      Progress.setActiveSlot(2);
      const slotB = fixture(), b = listing(await slotB.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#1', listingPrice: 6 }));
      ok(a.listingId !== b.listingId, '跨档新单身份隔离');
      await unchanged(slotB.p, () => slotB.gate.withdraw(a.listingId), 'O09 B档不可操作A单');
      const loadedA = await Progress.load({ async: true, slot: 1 }); progresses.push(loadedA);
      eq(loadedA.market, savedA.market, 'O09 B档写入不覆盖A档袋');
      Progress.setActiveSlot(1);

      // Gate输出是副本，改视图不能伪造扣押或可领状态。
      const view = slotA.gate.loadProgress(); ok(view.allowed && view.progress, '只读单据视图');
      view.progress.listings[0].state = 'claimed';
      eq(slotA.p.market, savedA.market, '外部改视图不改真实单据');

      // O10：完整字段校验，保留有歧义原始信息，导入与运行写均拒绝。
      const good = copy(payloads[0].save), goodMarket = copy(good.market) as any;
      const corruptions: ((market: any) => void)[] = [
        m => { delete m.listings[0].listingId; }, m => { delete m.listings[0].itemInstanceId; },
        m => { m.listings[0].state = 'unknown'; }, m => { m.listings[0].heldItemRef = null; },
        m => { m.listings[0].slotIndex = -1; }, m => { m.listings.push(copy(m.listings[0])); },
        m => { m.listings[0].settlementRef = 'foreign'; }, m => { m.listings[0].claimRef = 'forged'; },
        m => { m.listings[0].pendingRewardRef = { id: 'forged', amount: -1 }; },
      ];
      // 结构完整但金额/市场因子不遵表的历史袋也不得消费。
      const wrongReward = copy(payloads[2].save.market) as any;
      wrongReward.pendingRewards[0].amount += 1;
      const tampered = fixture(); (tampered.p as any).market = wrongReward;
      await unchanged(tampered.p, () => tampered.gate.claim(wrongReward.listings[1].listingId), 'O10收益金额损坏保持原档');
      const badSlot = fixture(); (badSlot.p as any).market = copy(goodMarket);
      badSlot.p.market!.listings[0].slotIndex = rules.slotCapacity;
      await unchanged(badSlot.p, () => badSlot.gate.withdraw(badSlot.p.market!.listings[0].listingId), 'O10超表栏位拒绝');
      for (const damage of corruptions) {
        const m = copy(goodMarket); damage(m); eq(isValidMarketProgress(m), false, 'O10非法袋校验拒绝');
        const f = fixture(), before = f.p.exportSave(), writes = idb.writes;
        eq(await f.p.importSave({ ...copy(good), market: m }, { async: true }), false, 'O10损坏档导入拒绝');
        eq(f.p.exportSave(), before, 'O10导入失败不覆盖当前档'); eq(idb.writes, writes, 'O10导入失败无写入');
        (f.p as any).market = copy(m);
        await unchanged(f.p, () => f.gate.listItem({ itemId: 'rabbit_fur', itemInstanceId: 'rabbit_fur#7', listingPrice: 6 }), 'O10歧义原袋不当empty');
        await unchanged(f.p, () => f.gate.withdraw(a.listingId), 'O10歧义原袋不返物');
        await unchanged(f.p, () => f.gate.settle(a.listingId), 'O10歧义原袋不成交');
        await unchanged(f.p, () => f.gate.claim(a.listingId), 'O10歧义原袋不发收益');
      }
    }
    eq(featureFlags(), flags, 'feature原值保持'); eq(JSON.stringify(rules), tableBefore, '数值表内存对象未修改');
    eq(localWrites, 0, '全部事务不用localStorage');
    return { assertions, payloads, openFixture, graph: openFixture ? 'formal-open' : 'memory-closed', sceneSmoke: sceneSmokeEvidence,
      formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false, storageWrites: idb.writes, commits: idb.commits,
      sampleCount, cases: openFixture ? ['O01','O02','O03','O04','O05','O06','O07','O08','O09','O10'] : ['memory-closed-eight-tips','zero-side-effects'] };
  } finally {
    for (const p of progresses) await p.flushSaves();
    Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
