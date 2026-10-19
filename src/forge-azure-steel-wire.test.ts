// 第二 forge 青钢剑 2B 接线自测：双行同 blueprint 材料消歧＋关态零写（SSR 可注入 Flag false）。
import recipes from '@xt/balance/recipes.json';
import { GAME_PHASE, ITEMS } from './data';
import { Progress } from './Progress';
import { ForgeGate } from './ForgeGate';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import * as ForgeClosed from './ForgeClosed';
import { createIndexedDbBackend, setSaveBackend } from './SaveStore';

type GateResult = Awaited<ReturnType<ForgeGate['submit']>>;

function memoryIndexedDb() {
  const rows = new Map<IDBValidKey, unknown>(), stores = new Map<string, string>();
  let writes = 0;
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
            let pending = 0, finished = false;
            const tx: any = { error: null, oncomplete: null, onerror: null, onabort: null,
              abort() { if (finished) return; finished = true; tx.onabort?.(); },
              objectStore() {
                const operation = (apply: () => unknown, write = false) => {
                  pending++; if (write) writes++;
                  const req: any = { result: undefined, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    if (finished) return;
                    try { req.result = apply(); req.onsuccess?.(); }
                    catch (error) { tx.error = error; tx.onerror?.(); tx.abort(); return; }
                    pending--; setTimeout(() => {
                      if (finished || pending) return;
                      if (mode === 'readwrite') { rows.clear(); for (const [k, v] of staged) rows.set(k, v); }
                      finished = true; tx.oncomplete?.();
                    }, 0);
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
            setTimeout(() => { if (!finished && !pending) { finished = true; tx.oncomplete?.(); } }, 0);
            return tx;
          },
        };
        if (!stores.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
  return { factory, get writes() { return writes; } };
}

export async function runForgeAzureSteelWireTests(options: { openFixture: boolean } = { openFixture: true }) {
  const { openFixture } = options;
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  };
  const ok = (value: unknown, message: string) => { eq(!!value, true, message); };
  const copy = <T>(value: T): T => structuredClone(value);

  eq(GAME_PHASE, 5, 'GAME_PHASE保持5');
  eq(isForgeOpenForFixture(), openFixture, '旗标来自当前 SSR 图');

  const forgeRows = recipes.recipes.filter(row => row.type === 'forge');
  eq(forgeRows.map(row => row.id), ['recipe_forge_bamboo_sword', 'recipe_forge_azure_steel_sword'], 'recipes forge 恰青竹+青钢');
  eq(forgeRows.every(row => row.blueprint === 'scroll_ten_thousand_swords'), true, '两行共用万剑残页 B1');
  ok(ITEMS.azure_steel_sword?.type === 'equip', '青钢剑装备只读存在');
  ok(ITEMS.iron_essence, '铁精材料只读存在');

  const bambooMats = [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'refine_stone', count: 1 }];
  const azureMats = [
    { itemId: 'iron_essence', count: 5 }, { itemId: 'spirit_copper', count: 3 }, { itemId: 'refine_stone', count: 3 },
  ];
  const bambooReq = (id: string) => ({ craftRequestId: id, blueprintId: 'scroll_ten_thousand_swords', materials: copy(bambooMats) });
  const azureReq = (id: string) => ({ craftRequestId: id, blueprintId: 'scroll_ten_thousand_swords', materials: copy(azureMats) });

  if (!openFixture) {
    const p = new Progress();
    p.inventory = {
      scroll_ten_thousand_swords: 4, spirit_copper: 10, refine_stone: 10, iron_essence: 10,
      bamboo_sword: 0, azure_steel_sword: 0,
    };
    const before = p.exportSave();
    const gate = new ForgeGate(p);
    eq(gate.feature(), ForgeClosed.featureClosed(), '关态 feature');
    eq(gate.entrance(), ForgeClosed.refuseEntrance(), '关态 entrance');
    eq(gate.craft(azureReq('closed-craft')), ForgeClosed.refuseCraft(), '关态 craft 青钢');
    const submit = await gate.submit(azureReq('closed-submit'));
    eq(submit, ForgeClosed.refuseSubmit(), '关态 submit 青钢');
    eq(p.exportSave(), before, '关态提交青钢零写档');
    eq(p.count('iron_essence'), 10, '关态不扣铁精');
    eq(p.count('azure_steel_sword'), 0, '关态零产青钢');
    eq(p.count('bamboo_sword'), 0, '关态零产竹剑');
    return {
      assertions, openFixture, recipesForgeCount: 2, closedZeroSideEffect: true,
      newOpenFlag: false, softOpen: false, release: false, gamePhase: GAME_PHASE,
    };
  }

  const oldSlot = Progress.getActiveSlot();
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const idb = memoryIndexedDb();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  setSaveBackend(createIndexedDbBackend(idb.factory));
  Progress.setActiveSlot(1);

  try {
    const stock = () => ({
      scroll_ten_thousand_swords: 4, spirit_copper: 10, refine_stone: 10, iron_essence: 10,
      bamboo_sword: 0, azure_steel_sword: 0, rabbit_fur: 1,
    });
    const p = new Progress();
    p.stones = 100; p.inventory = stock();
    ok(await p.saveAsync(), '开态准备档落盘');
    const gate = new ForgeGate(p, { random: () => 0.1, ledgerId: () => 'azure-wire-ledger' });

    ok(gate.craft(bambooReq('open-bamboo-craft')).allowed, '竹剑材料集 craft 允许');
    ok(gate.craft(azureReq('open-azure-craft')).allowed, '青钢材料集 craft 允许');

    const bamboo = await gate.submit(bambooReq('open-bamboo'));
    ok(bamboo.allowed && 'result' in bamboo && bamboo.result, '竹剑提交成功');
    if (!bamboo.allowed || !('result' in bamboo) || !bamboo.result) throw new Error('竹剑提交未返回结果');
    eq(bamboo.result.resultItem.itemId, 'bamboo_sword', '竹剑材料→青竹剑');
    eq(p.count('bamboo_sword'), 1, '竹剑入库');
    eq(p.count('azure_steel_sword'), 0, '竹剑提交不污染青钢');

    const azure = await gate.submit(azureReq('open-azure'));
    ok(azure.allowed && 'result' in azure && azure.result, '青钢提交成功');
    if (!azure.allowed || !('result' in azure) || !azure.result) throw new Error('青钢提交未返回结果');
    eq(azure.result.resultItem.itemId, 'azure_steel_sword', '青钢材料→青钢剑');
    eq(p.count('azure_steel_sword'), 1, '青钢入库');
    eq(p.count('iron_essence'), 5, '扣铁精×5');

    // 竹剑材料不可锻出青钢：缺铁精时青钢请求拒
    const poor = new Progress();
    poor.stones = 100;
    poor.inventory = {
      scroll_ten_thousand_swords: 2, spirit_copper: 4, refine_stone: 4, iron_essence: 0,
      bamboo_sword: 0, azure_steel_sword: 0,
    };
    ok(await poor.saveAsync(), '缺料档落盘');
    const poorGate = new ForgeGate(poor, { random: () => 0.1, ledgerId: () => 'azure-wire-poor' });
    const beforePoor = poor.exportSave();
    const denied = await poorGate.submit(azureReq('poor-azure'));
    eq(denied.allowed, false, '缺铁精青钢拒');
    eq(poor.exportSave(), beforePoor, '缺料拒零写');
    ok(poorGate.craft(bambooReq('poor-bamboo-craft')).allowed, '同档竹剑材料仍可解析青竹');

    // 材料数不匹配（铁精4）→ recipe undefined → tip recipe
    const short = await poorGate.submit({
      craftRequestId: 'short-iron', blueprintId: 'scroll_ten_thousand_swords',
      materials: [{ itemId: 'iron_essence', count: 4 }, { itemId: 'spirit_copper', count: 3 }, { itemId: 'refine_stone', count: 3 }],
    });
    eq(short.allowed, false, '铁精4不匹配拒');
    ok('tipKey' in short && short.tipKey === 'forge.fixture.recipe', '材料不匹配 tip=recipe');

    // 缺残页：材料齐、图纸0
    const noScroll = new Progress();
    noScroll.stones = 100;
    noScroll.inventory = {
      scroll_ten_thousand_swords: 0, spirit_copper: 10, refine_stone: 10, iron_essence: 10,
      bamboo_sword: 0, azure_steel_sword: 0,
    };
    ok(await noScroll.saveAsync(), '缺残页档落盘');
    const noScrollGate = new ForgeGate(noScroll, { random: () => 0.1, ledgerId: () => 'azure-wire-noscroll' });
    const beforeScroll = noScroll.exportSave();
    const deniedScroll = await noScrollGate.submit(azureReq('noscroll-azure'));
    eq(deniedScroll.allowed, false, '缺残页青钢拒');
    eq(noScroll.exportSave(), beforeScroll, '缺残页不扣材料');
    eq(noScroll.count('iron_essence'), 10, '缺残页铁精未扣');

    // 夹具双行同 blueprint 亦按材料消歧
    const fix = new Progress();
    fix.inventory = stock();
    const fixtureRecipes = [
      { blueprintId: 'scroll_ten_thousand_swords', blueprintCount: 1, materials: bambooMats, resultItemId: 'bamboo_sword' },
      { blueprintId: 'scroll_ten_thousand_swords', blueprintCount: 1, materials: azureMats, resultItemId: 'azure_steel_sword' },
    ];
    const fixGate = new ForgeGate(fix, { fixtureRecipes, random: () => 0.1, ledgerId: () => 'azure-wire-fix' });
    ok(fixGate.craft(bambooReq('fix-bamboo')).allowed, '夹具竹剑材料命中');
    ok(fixGate.craft(azureReq('fix-azure')).allowed, '夹具青钢材料命中');

    return {
      assertions, openFixture, recipesForgeCount: 2,
      bambooUnpolluted: true, azureWired: true, materialsDisambiguation: true,
      fixtureDisambiguation: true, missingScrollDenied: true, shortMaterialsDenied: true,
      newOpenFlag: false, softOpen: false, release: false, gamePhase: GAME_PHASE,
    };
  } finally {
    Progress.setActiveSlot(oldSlot);
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
