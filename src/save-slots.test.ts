import releaseFeatures from '../data/features.json';
import { MORAL_STATE, QUESTS, REALMS, SENSE } from './data';
import { MORAL_VERSION, Progress, RELATIONSHIP_BACKUP_KEY } from './Progress';
import { QuestSystem } from './QuestSystem';
import { SectGrowth } from './SectGrowth';
import { Sense } from './Sense';
import { featureEnabled, setFeatureFlag } from './features';
import { SaveStore, createMemorySaveBackend, createIndexedDbBackend, saveStore, setSaveBackend,
  SAVE_DB_NAME, SAVE_DB_VERSION, SAVE_OBJECT_STORE, SAVE_SLOT_KEYS, type SaveBackend, type SlotKey } from './SaveStore';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}：得到 ${String(actual)}，期望 ${String(expected)}`);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}

/** 模拟 IDB 的关键边界：request 成功后 transaction 仍可能 abort，直到 complete 才提交。 */
function mockIndexedDB() {
  const rows = new Map<IDBValidKey, unknown>();
  const stores = new Map<string, string | null>();
  const opened: { name: string; version: number | undefined }[] = [];
  let failOpen = false, quotaNextWrite = false, abortNextCommit = false;
  const factory = {
    open(name: string, version?: number) {
      opened.push({ name, version });
      const request = { result: undefined as unknown, error: null as DOMException | null,
        onsuccess: null as (() => void) | null, onerror: null as (() => void) | null,
        onblocked: null as (() => void) | null, onupgradeneeded: null as (() => void) | null };
      setTimeout(() => {
        if (failOpen) { request.error = new DOMException('Injected open failure', 'UnknownError'); request.onerror?.(); return; }
        const db = {
          objectStoreNames: { contains: (store: string) => stores.has(store) },
          createObjectStore(store: string, options?: IDBObjectStoreParameters) { stores.set(store, options?.keyPath as string ?? null); },
          close() {}, onversionchange: null,
          transaction(storeName: string, mode: IDBTransactionMode = 'readonly') {
            if (!stores.has(storeName)) throw new DOMException('Missing store', 'NotFoundError');
            const staged = new Map(rows);
            let pending = 0, finished = false;
            const tx = { error: null as DOMException | null,
              oncomplete: null as (() => void) | null, onerror: null as (() => void) | null,
              onabort: null as (() => void) | null,
              abort() { if (finished) return; finished = true; tx.error ??= new DOMException('Injected abort', 'AbortError'); tx.onabort?.(); },
              objectStore() {
                const operation = (apply: () => unknown, write = false) => {
                  pending++;
                  const req = { result: undefined as unknown, error: null as DOMException | null,
                    onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
                  setTimeout(() => {
                    if (finished) return;
                    if (write && quotaNextWrite) {
                      quotaNextWrite = false;
                      req.error = tx.error = new DOMException('Injected quota failure', 'QuotaExceededError');
                      req.onerror?.(); tx.onerror?.(); tx.abort(); return;
                    }
                    req.result = apply(); req.onsuccess?.(); pending--; scheduleComplete();
                  }, 0);
                  return req;
                };
                return {
                  transaction: tx,
                  get(key: IDBValidKey) { return operation(() => structuredClone(staged.get(key))); },
                  getAll() { return operation(() => [...staged.values()].map(value => structuredClone(value))); },
                  put(value: unknown, explicitKey?: IDBValidKey) {
                    return operation(() => {
                      const keyPath = stores.get(storeName), key = explicitKey ?? (value as Record<string, IDBValidKey>)[keyPath!];
                      staged.set(key, structuredClone(value)); return key;
                    }, true);
                  },
                  add(value: unknown, explicitKey?: IDBValidKey) {
                    return operation(() => {
                      const keyPath = stores.get(storeName), key = explicitKey ?? (value as Record<string, IDBValidKey>)[keyPath!];
                      if (staged.has(key)) throw new DOMException('Duplicate key', 'ConstraintError');
                      staged.set(key, structuredClone(value)); return key;
                    }, true);
                  },
                  delete(key: IDBValidKey) { return operation(() => { staged.delete(key); }, true); },
                };
              },
            };
            const scheduleComplete = () => setTimeout(() => {
              if (finished || pending) return;
              if (mode === 'readwrite' && abortNextCommit) { abortNextCommit = false; tx.abort(); return; }
              if (mode === 'readwrite') { rows.clear(); for (const [key, value] of staged) rows.set(key, value); }
              finished = true; tx.oncomplete?.();
            }, 0);
            scheduleComplete();
            return tx;
          },
        };
        request.result = db;
        if (!stores.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
  return { factory, rows, stores, opened,
    failOpen() { failOpen = true; },
    quotaNextWrite() { quotaNextWrite = true; },
    abortNextCommit() { abortNextCommit = true; },
  };
}

const saveKey = 'xiantu_save_v1';
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const idbBefore = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
const dateNowBefore = Date.now;
const disk: Record<string, string> = {};
const now = dateNowBefore();
let rejectLegacyWrite = false;
const storage: Storage = {
  getItem: key => disk[key] ?? null,
  setItem: (key, value) => { if (rejectLegacyWrite) throw new DOMException('Injected quota failure', 'QuotaExceededError'); disk[key] = String(value); },
  removeItem: key => { delete disk[key]; },
  clear: () => { for (const key of Object.keys(disk)) delete disk[key]; },
  key: index => Object.keys(disk)[index] ?? null,
  get length() { return Object.keys(disk).length; },
};
function fields(p: Progress) {
  return { name: p.name, level: p.level, daoHeart: p.daoHeart, morality: p.morality, moralVersion: p.moralVersion,
    affinity: p.affinity, relationshipState: p.relationshipState };
}
function sample(name = '三槽回归') {
  const p = new Progress(); p.name = name; p.level = 9;
  p.daoHeart = MORAL_STATE.daoHeart.max; p.morality = MORAL_STATE.morality.min;
  p.affinity = { village_elder: -12, future_npc: 345 };
  p.relationshipState.pendingAffinitySources = [{ sourceId: 'village_elder|quest|q_awaken', npc: 'village_elder', quest: 'q_awaken' }];
  p.relationshipState.appliedAffinitySources = ['doctor_sun|quest|q_medicine'];
  p.relationshipState.claimedAffinityRewards = ['doctor_sun|confidant_gift'];
  p.relationshipState.questChoices = { q_legacy: 'chosen' };
  p.relationshipState.appliedQuestHooks = ['q_legacy'];
  p.relationshipState.quarantinedFlags = { unknown_flag: { original: 'invalid', details: [null, false, 1] } };
  return p;
}
async function rejects(run: () => Promise<unknown>, message: string) {
  let rejected = false;
  try { await run(); } catch { rejected = true; }
  eq(rejected, true, message);
}
function failingBackend(backend: SaveBackend): SaveBackend {
  const fail = async () => { throw new DOMException('Injected quota failure', 'QuotaExceededError'); };
  return { ...backend, write: fail, delete: fail, insertIfEmpty: fail };
}
function deferNextWrite(backend: SaveBackend) {
  let announce!: () => void, release!: () => void, waiting = true;
  const started = new Promise<void>(resolve => { announce = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  return { started, release,
    backend: { ...backend, async write(slot) {
      if (waiting) { waiting = false; announce(); await gate; }
      await backend.write(slot);
    } } satisfies SaveBackend,
  };
}

try {
  Date.now = () => now;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  eq(releaseFeatures.indexedDbSaves, false, '关态正式 data/features.json indexedDbSaves 严格布尔 false');
  eq(featureEnabled('indexedDbSaves'), false, 'indexedDbSaves 发布配置默认关闭');
  setFeatureFlag('indexedDbSaves', false);

  const p = sample();
  eq(p.save(), true, '关态仍同步写 localStorage 单槽');
  same(fields(Progress.load()), fields(p), '关态既有 Progress.load 保留道心善恶与全部关系字段');
  same(Object.keys(disk), [saveKey], '关态不额外创建槽或自动档键');
  const diskBefore = disk[saveKey], memoryBefore = p.exportSave();
  rejectLegacyWrite = true;
  eq(p.runSaveTransaction(() => { p.stones += 7; p.affinity.village_elder++; return true; }), undefined,
    '关态配额满继续返回事务失败');
  same(p.exportSave(), memoryBefore, '关态事务失败恢复内存全部字段');
  eq(disk[saveKey], diskBefore, '关态事务失败保留磁盘原档');
  rejectLegacyWrite = false;
  Progress.reset();
  eq(disk[saveKey], undefined, '关态 reset 仍只删除 localStorage 主档');

  // 三个手动槽独立读写，输入和读出都是数据快照，永远没有 auto 槽。
  {
    const store = new SaveStore(createMemorySaveBackend());
    same(SAVE_SLOT_KEYS, [1, 2, 3], '槽 key 只有 1、2、3');
    same(await store.listSlots(), [null, null, null], '首次列槽固定返回三个空槽');
    for (const key of SAVE_SLOT_KEYS) {
      const saved = sample(`修士${key}`).exportSave();
      eq(await store.writeSlot(key, saved), true, `${key} 号槽可以写入`);
      saved.name = '外部修改';
      const slot = await store.readSlot(key);
      ok(slot, `${key} 号槽可读`);
      eq(slot.data.name, `修士${key}`, '写入后修改原对象不污染存档');
      eq(slot.lastSaveAt, now, '写槽只记录 lastSaveAt 时间戳');
      slot.data.name = '读出后修改';
      eq((await store.readSlot(key))?.data.name, `修士${key}`, '读出对象修改不污染存档');
    }
    same((await store.listSlots()).map(slot => slot?.slotKey), [1, 2, 3], '三个槽均占用且不创建自动槽');
    eq(await store.deleteSlot(2), true, '删除指定槽成功');
    same((await store.listSlots()).map(slot => slot?.slotKey ?? null), [1, null, 3], '删除不影响其他槽');
    eq(await store.deleteSlot(2), true, '删除空槽幂等');
    for (const invalid of [0, 4, -1, 'auto', '1']) {
      const key = invalid as SlotKey;
      eq(await store.writeSlot(key, p.exportSave()), false, `拒绝非法槽 ${invalid}`);
      eq(await store.deleteSlot(key), false, `拒绝删除非法槽 ${invalid}`);
      await rejects(() => store.readSlot(key), `拒绝读取非法槽 ${invalid}`);
    }
  }

  // 自动迁移只能进入空的 1 号槽；提交失败永远保留旧主档和关系备份。
  {
    const raw = JSON.stringify(sample('旧档修士').exportSave());
    const store = new SaveStore(createMemorySaveBackend());
    disk[saveKey] = raw; disk[RELATIONSHIP_BACKUP_KEY] = 'keep-first-relationship-backup';
    eq(await store.migrateLegacyLocalStorage(storage), 'migrated', '旧 localStorage 自动迁至 slot 1');
    same((await store.readSlot(1))?.data, JSON.parse(raw), '迁移保留全部旧档数据');
    eq(disk[saveKey], undefined, '确认提交后移除 localStorage 主档');
    eq(disk[RELATIONSHIP_BACKUP_KEY], 'keep-first-relationship-backup', '迁移永不删除已有关系备份');
    same((await store.listSlots()).map(slot => slot?.slotKey ?? null), [1, null, null], '迁移只占用 1 号槽');
    eq(await store.migrateLegacyLocalStorage(storage), 'none', '迁移成功再次启动不重复迁移');
    disk[saveKey] = JSON.stringify(sample('不能覆盖').exportSave());
    eq(await store.migrateLegacyLocalStorage(storage), 'occupied', '1 号槽已有数据时不覆盖');
    eq((await store.readSlot(1))?.data.name, '旧档修士', '占用槽保留现档');
    ok(disk[saveKey], '占用槽时保留 localStorage 待人工恢复');

    const legacy = sample('缺关系旧档').exportSave(); delete legacy.affinity; delete legacy.relationshipState;
    const legacyRaw = JSON.stringify(legacy);
    storage.clear(); disk[saveKey] = legacyRaw;
    const migrated = new SaveStore(createMemorySaveBackend());
    eq(await migrated.migrateLegacyLocalStorage(storage), 'migrated', '缺关系容器的合法旧档也能迁移');
    eq(disk[RELATIONSHIP_BACKUP_KEY], legacyRaw, '缺关系旧档先保留原文关系备份');
    same((await migrated.readSlot(1))?.data, legacy, '迁移本身不推断或改写关系历史');

    storage.clear(); disk[saveKey] = legacyRaw;
    const broken = new SaveStore(failingBackend(createMemorySaveBackend()));
    eq(await broken.migrateLegacyLocalStorage(storage), 'failed', '配额满迁移返回失败而不崩');
    eq(disk[saveKey], legacyRaw, '迁移失败保留完整旧主档');
    eq(disk[RELATIONSHIP_BACKUP_KEY], legacyRaw, '迁移失败仍保留已写关系备份');
    eq(await broken.writeSlot(1, legacy), false, '后端失败写槽返回 false');
    eq(await broken.deleteSlot(1), false, '后端失败删槽返回 false');

    storage.clear(); disk[saveKey] = legacyRaw; rejectLegacyWrite = true;
    eq(await new SaveStore(createMemorySaveBackend()).migrateLegacyLocalStorage(storage), 'failed', '关系备份失败阻止迁移');
    eq(disk[saveKey], legacyRaw, '关系备份失败保留旧主档');
    rejectLegacyWrite = false;
    disk[saveKey] = '{invalid';
    eq(await new SaveStore(createMemorySaveBackend()).migrateLegacyLocalStorage(storage), 'failed', '坏 JSON 迁移不崩');
    eq(disk[saveKey], '{invalid', '坏 JSON 原文仍保留');
    storage.clear();
  }

  // 文件封装往返与原有 exportSave JSON 都可导入指定槽，坏文件不覆盖已有数据。
  {
    const store = new SaveStore(createMemorySaveBackend()), saved = p.exportSave();
    eq(await store.writeSlot(3, saved), true, '准备文件导出槽');
    const blob = await store.exportSlotBlob(3);
    ok(blob instanceof Blob, '导出返回 JSON Blob');
    eq(blob.type, 'application/json', '导出 MIME 为 JSON');
    eq(await store.importIntoSlot(2, blob), true, '文件 Blob 导入到指定槽');
    same((await store.readSlot(2))?.data, saved, '#12b 和 relationship 全字段随文件往返');
    eq(await store.importIntoSlot(1, JSON.stringify(saved)), true, '兼容 Progress.exportSave 原始 JSON');
    same((await store.readSlot(1))?.data, saved, '原始 JSON 导入保留全部内存存档字段');
    eq(await store.exportSlotBlob(0 as SlotKey), null, '非法槽无法导出');
    await store.deleteSlot(3);
    eq(await store.exportSlotBlob(3), null, '空槽导出返回 null');
    const before = await store.readSlot(2), envelope = JSON.parse(await blob.text());
    for (const bad of ['{invalid', 'null', '[]', JSON.stringify({ ...envelope, version: 2 }),
      JSON.stringify({ ...envelope, slotKey: 'auto' }), JSON.stringify({ ...envelope, data: null }),
      JSON.stringify({ ...envelope, lastSaveAt: -1 })]) {
      eq(await store.importIntoSlot(2, bad), false, '拒绝损坏或未知格式文件');
      same(await store.readSlot(2), before, '坏文件不覆盖目标槽');
    }
  }

  // 最小 IDB 集成：固定 schema，真正等事务完成；request 成功后 abort 仍判失败。
  {
    const idb = mockIndexedDB(), store = new SaveStore(createIndexedDbBackend(idb.factory));
    eq(await store.writeSlot(1, p.exportSave()), true, 'IDB 后端成功提交写槽');
    same(idb.opened, [{ name: SAVE_DB_NAME, version: SAVE_DB_VERSION }], 'IDB 使用固定 DB 名和版本');
    same([...idb.stores.entries()], [[SAVE_OBJECT_STORE, 'slotKey']], 'IDB 固定 slots store 与 slotKey 主键');
    same((await store.readSlot(1))?.data, p.exportSave(), 'IDB request 读出完整数据');
    const before = await store.readSlot(1);
    idb.quotaNextWrite();
    eq(await store.writeSlot(1, { ...p.exportSave(), name: '配额失败' }), false, 'IDB QuotaExceededError 写槽返回 false');
    same(await store.readSlot(1), before, 'IDB 配额失败保留旧槽');
    idb.abortNextCommit();
    eq(await store.writeSlot(1, { ...p.exportSave(), name: '事务中止' }), false, 'request 成功后 transaction abort 不能当成功');
    same(await store.readSlot(1), before, 'IDB transaction abort 不提交半写数据');
    eq(await store.deleteSlot(1), true, 'IDB 删除指定槽');
    eq(await store.readSlot(1), null, 'IDB 删除后为空槽');
    const raw = JSON.stringify(p.exportSave()); disk[saveKey] = raw; disk[RELATIONSHIP_BACKUP_KEY] = 'keep-idb-backup';
    idb.abortNextCommit();
    eq(await store.migrateLegacyLocalStorage(storage), 'failed', 'IDB 迁移提交中止返回失败');
    eq(disk[saveKey], raw, 'IDB 迁移中止保留旧主档');
    eq(disk[RELATIONSHIP_BACKUP_KEY], 'keep-idb-backup', 'IDB 迁移失败不动关系备份');
    eq(await store.readSlot(1), null, 'IDB 迁移中止不产生假成功槽');
    eq(await store.migrateLegacyLocalStorage(storage), 'migrated', 'IDB 迁移失败可重试成功');
    eq(disk[saveKey], undefined, 'IDB 成功重试后才删除旧主档');
    same([...idb.rows.keys()], [1], 'IDB 迁移只创建 1 号槽，无 auto slot');
    const unavailable = mockIndexedDB(); unavailable.failOpen();
    const failedStore = new SaveStore(createIndexedDbBackend(unavailable.factory));
    eq(await failedStore.writeSlot(1, p.exportSave()), false, 'IDB 打开失败写槽不崩');
    await rejects(() => failedStore.readSlot(1), 'IDB 读失败不伪装成空槽');
    disk[saveKey] = raw;
    eq(await failedStore.migrateLegacyLocalStorage(storage), 'failed', 'IDB 打开失败迁移返回失败');
    eq(disk[saveKey], raw, 'IDB 打开失败保留 localStorage');
    storage.clear();
  }

  // 玩法主路径：只克隆内存开关，确认真实调用方与权威 async 入口都命中 IDB/槽。
  {
    storage.clear();
    const backend = createMemorySaveBackend(); setSaveBackend(backend);
    setFeatureFlag('indexedDbSaves', true);
    Progress.setActiveSlot(1);
    eq(releaseFeatures.indexedDbSaves, false, '玩法开态只覆盖内存，正式 indexedDbSaves 仍严格 false');
    const mainline = await Progress.load({ async: true, slot: 1 });
    mainline.name = '玩法异步修士'; mainline.stones += 7;
    eq(await mainline.save({ async: true }), true, '玩法主路径内存变更后 save({async:true}) 命中 IDB/槽');
    same((await backend.read(1))?.data, mainline.exportSave(), '玩法主路径命中 IDB/槽 backend 而非仅更新内存');
    same((await saveStore.readSlot(1))?.data, mainline.exportSave(), '玩法主路径 saveStore.readSlot 命中 IDB/槽完整快照');
    eq(await mainline.runSaveTransaction(draft => {
      ok(draft !== mainline, '玩法主路径异步事务只修改隔离 draft');
      draft.stones += 11; draft.addItem('spirit_herb', 2);
      return 'mainline-committed';
    }, { async: true }), 'mainline-committed', '玩法主路径异步事务等待命中 IDB/槽后返回结果');
    same((await saveStore.readSlot(1))?.data, mainline.exportSave(), '玩法主路径事务提交后内存与命中 IDB/槽的数据一致');
    same((await Progress.load({ async: true, slot: 1 })).exportSave(), mainline.exportSave(),
      '玩法主路径 load({async:true}) 再次命中 IDB/槽读回已提交进度');

    const questProgress = await Progress.load({ async: true, slot: 2 });
    const quests = new QuestSystem(questProgress, () => now, null, null);
    let completed = 0; quests.onCompleted(() => { completed++; });
    eq(quests.accept('q_awaken'), true, '玩法主路径真实 QuestSystem 接取任务');
    await questProgress.flushSaves();
    eq(((await saveStore.readSlot(2))?.data.quests as Progress['quests']).q_awaken.state,
      'active', '玩法主路径 QuestSystem.accept 命中 IDB/槽');
    quests.onReach('chest_lookout');
    await questProgress.flushSaves();
    eq(((await saveStore.readSlot(2))?.data.quests as Progress['quests']).q_awaken.reached, true,
      '玩法主路径 QuestSystem.onReach 命中 IDB/槽');
    const delayed = deferNextWrite(backend); setSaveBackend(delayed.backend);
    const turnIn = quests.turnInAsync('q_awaken'); await delayed.started;
    eq(completed, 0, '玩法主路径交付尚未命中 IDB/槽提交时不通知完成');
    eq(questProgress.quests.q_awaken.state, 'active', '玩法主路径交付待提交时奖励与 done 留在 draft');
    delayed.release();
    ok((await turnIn)?.settled, '玩法主路径真实 QuestSystem.turnInAsync 命中 IDB/槽后交付成功');
    eq(completed, 1, '玩法主路径交付命中 IDB/槽成功后才通知一次');
    same((await saveStore.readSlot(2))?.data, questProgress.exportSave(), '玩法主路径交付奖励与 done 一起命中 IDB/槽');

    setSaveBackend(backend);
    questProgress.level = Math.max(questProgress.level, QUESTS.q_bamboo.reqLevel);
    eq(quests.accept('q_bamboo'), true, '玩法主路径真实接取后续击杀任务');
    questProgress.addItem('rabbit_fur', 5);
    for (let i = 0; i < 8; i++) quests.onKill('spirit_rabbit');
    await questProgress.flushSaves();
    eq(((await saveStore.readSlot(2))?.data.quests as Progress['quests']).q_bamboo.kills.spirit_rabbit, 8,
      '玩法主路径 QuestSystem.onKill 连续进度命中 IDB/槽');
    const beforeFailedTurnIn = questProgress.exportSave(), slotBeforeFailedTurnIn = await saveStore.readSlot(2);
    setSaveBackend(failingBackend(backend));
    eq(await quests.turnInAsync('q_bamboo'), undefined, '玩法主路径 IDB/槽提交失败不报任务交付成功');
    same(questProgress.exportSave(), beforeFailedTurnIn, '玩法主路径失败交付保留任务、材料和奖励原内存');
    same(await backend.read(2), slotBeforeFailedTurnIn, '玩法主路径失败交付保留原 IDB/槽');
    eq(completed, 1, '玩法主路径失败交付不发完成通知');
    setSaveBackend(backend);
    ok((await quests.turnInAsync('q_bamboo'))?.settled, '玩法主路径失败后可重试命中 IDB/槽');
    eq(completed, 2, '玩法主路径重试成功只增加一次完成通知');
    same((await Progress.load({ async: true, slot: 2 })).exportSave(), questProgress.exportSave(),
      '玩法主路径真实任务交付后 load({async:true}) 命中 IDB/槽读回');

    const trialProgress = await Progress.load({ async: true, slot: 3 });
    trialProgress.level = QUESTS.q_sect_taixu.reqLevel; trialProgress.selectedSect = 'taixu';
    trialProgress.addItem('five_sect_token', 1);
    trialProgress.quests.q_fox = { state: 'done', kills: {} };
    const trialQuests = new QuestSystem(trialProgress, () => now, null, null);
    eq(trialQuests.accept('q_sect_taixu'), true, '玩法主路径真实接取宗门试炼任务');
    eq(trialQuests.onTrialComplete('trial_sect_taixu'), true, '玩法主路径记录真实试炼完成');
    await trialProgress.flushSaves();
    ok(((await saveStore.readSlot(3))?.data.completedTrials as string[]).includes('trial_sect_taixu'),
      '玩法主路径 QuestSystem.onTrialComplete 命中 IDB/槽');
    const beforeAbandon = trialProgress.exportSave(), trialsBeforeAbandon = trialProgress.completedTrials;
    const slotBeforeAbandon = await saveStore.readSlot(3);
    setSaveBackend(failingBackend(backend));
    eq(await trialQuests.abandonAsync('q_sect_taixu'), false, '玩法主路径放弃任务等待 IDB/槽失败后返回 false');
    same(trialProgress.exportSave(), beforeAbandon, '玩法主路径放弃保存失败恢复任务与试炼');
    eq(trialProgress.completedTrials, trialsBeforeAbandon, '玩法主路径放弃失败恢复试炼原引用');
    same(await backend.read(3), slotBeforeAbandon, '玩法主路径放弃失败保留原 IDB/槽');
    setSaveBackend(backend);
    eq(await trialQuests.abandon('q_sect_taixu', { async: true }), true, '玩法主路径放弃成功等待命中 IDB/槽');
    eq(trialProgress.quests.q_sect_taixu, undefined, '玩法主路径放弃成功清除任务');
    eq(trialProgress.completedTrials.includes('trial_sect_taixu'), false, '玩法主路径放弃成功清除旧试炼凭据');
    same((await saveStore.readSlot(3))?.data, trialProgress.exportSave(), '玩法主路径放弃后完整内存命中 IDB/槽');

    const serviceBackend = createMemorySaveBackend(); setSaveBackend(serviceBackend);
    const shopProgress = await Progress.load({ async: true, slot: 1 }); shopProgress.stones = 1000;
    eq(await shopProgress.save({ async: true }), true, '玩法主路径商店准备档命中 IDB/槽');
    const growth = new SectGrowth(shopProgress);
    const good = growth.ordinaryCatalog('doctor_sun').entries.find(entry => entry.itemId === 'hp_pill_small');
    ok(good, '玩法主路径使用真实普通商店目录');
    const beforePurchase = shopProgress.exportSave(), slotBeforePurchase = await saveStore.readSlot(1);
    setSaveBackend(failingBackend(serviceBackend));
    eq((await growth.buyOrdinaryAsync('doctor_sun', good.itemId, 'async-shop-proof')).ok, false,
      '玩法主路径商店 IDB/槽失败不报购买成功');
    same(shopProgress.exportSave(), beforePurchase, '玩法主路径商店失败不扣款、不加物品、不发收据');
    same(await serviceBackend.read(1), slotBeforePurchase, '玩法主路径商店失败保留原 IDB/槽');
    setSaveBackend(serviceBackend);
    eq((await growth.buyOrdinaryAsync('doctor_sun', good.itemId, 'async-shop-proof')).ok, true,
      '玩法主路径 SectGrowth 购买事务命中 IDB/槽');
    eq(shopProgress.stones, 1000 - good.price, '玩法主路径购买成功只扣实际价格');
    eq(shopProgress.count(good.itemId), 1, '玩法主路径购买成功增加一件物品');
    same((await saveStore.readSlot(1))?.data, shopProgress.exportSave(), '玩法主路径购买余额、物品和收据一起命中 IDB/槽');

    const senseProgress = await Progress.load({ async: true, slot: 2 }); senseProgress.level = 30;
    senseProgress.hp = senseProgress.maxHp; senseProgress.mp = senseProgress.maxMp;
    eq(await senseProgress.save({ async: true }), true, '玩法主路径神识准备档命中 IDB/槽');
    const senseConfig = structuredClone(SENSE); senseConfig.enabled = true;
    const sense = new Sense({ progress: senseProgress, config: () => senseConfig, realms: REALMS,
      enabled: () => true, context: () => ({ instanceId: 'async_fixture', center: { x: 0, y: 0 }, alive: true, busy: false, ready: true }),
      targets: () => [], now: () => 1000 });
    const beforeScan = senseProgress.exportSave(), slotBeforeScan = await saveStore.readSlot(2), mpBeforeScan = senseProgress.mp;
    setSaveBackend(failingBackend(serviceBackend));
    const failedScan = await sense.requestScanAsync('key', 'async-sense-proof');
    eq(failedScan.ok, false, '玩法主路径神识 IDB/槽失败不报扫描成功');
    ok(!failedScan.ok && failedScan.blockKey === 'sense.block.save_failed', '玩法主路径神识返回保存失败原因');
    same(senseProgress.exportSave(), beforeScan, '玩法主路径神识失败恢复灵力、冷却和扫描收据');
    same(await serviceBackend.read(2), slotBeforeScan, '玩法主路径神识失败保留原 IDB/槽');
    setSaveBackend(serviceBackend);
    eq((await sense.requestScanAsync('key', 'async-sense-proof')).ok, true, '玩法主路径 Sense 扫描成功命中 IDB/槽');
    eq(senseProgress.mp, mpBeforeScan - senseConfig.scan.mpCost, '玩法主路径神识重试成功仅扣一次灵力');
    eq(((await saveStore.readSlot(2))?.data.senseState as Progress['senseState'])?.lastScanId,
      'async-sense-proof', '玩法主路径神识扫描收据命中 IDB/槽');
    eq(await sense.markTutorialSeenAsync(), true, '玩法主路径神识教学记录异步提交');
    same((await saveStore.readSlot(2))?.data, senseProgress.exportSave(), '玩法主路径神识灵力、冷却和教学记录一起命中 IDB/槽');
    eq(disk[saveKey], undefined, '玩法主路径开态全程没有回写 localStorage 主档');
    setSaveBackend(createMemorySaveBackend());
    Progress.setActiveSlot(1);
  }

  // 开态 Progress 绑定手动槽，既有道心善恶/关系字段与严格导入校验原样回归。
  {
    const backend = createMemorySaveBackend();
    setSaveBackend(backend);
    setFeatureFlag('indexedDbSaves', true);
    Progress.setActiveSlot(1);
    eq(Progress.getActiveSlot(), 1, '开态默认活跃槽为 1');
    const first = sample('一号修士');
    eq(await first.saveAsync(), true, '开态 Progress 异步保存 1 号槽');
    eq(disk[saveKey], undefined, '开态保存不回写 localStorage 主档');
    same(fields(await Progress.loadAsync(1)), fields(first), '开态 1 号槽保留 #12b 与全部 relationship 字段');
    eq((await saveStore.readSlot(1))?.data.moralVersion, MORAL_VERSION, '槽存档保留道心善恶版本');

    Progress.setActiveSlot(2);
    const second = sample('二号修士'); second.level = 12; second.morality = 14;
    eq(await second.saveAsync(), true, '开态 Progress 可保存 2 号槽');
    const loadedSecond = await Progress.loadAsync(2);
    same(fields(loadedSecond), fields(second), '2 号槽与 1 号槽独立读取');
    Progress.setActiveSlot(3);
    loadedSecond.name = '绑定二号槽';
    eq(await loadedSecond.saveAsync(), true, '读取出的实例继续保存其绑定槽');
    eq((await saveStore.readSlot(2))?.data.name, '绑定二号槽', '切换当前活跃槽不重定向已读取实例');
    eq((await saveStore.readSlot(1))?.data.name, '一号修士', '保存其他槽不污染 1 号槽');
    const third = sample('三号修士');
    eq(await third.saveAsync(), true, '开态 Progress 可保存 3 号槽');
    same((await saveStore.listSlots()).map(slot => slot?.slotKey), [1, 2, 3], 'Progress 只使用三个人工槽');

    const blob = await saveStore.exportSlotBlob(1);
    ok(blob, 'Progress 槽可文件导出');
    eq(await saveStore.importIntoSlot(3, blob), true, 'Progress 文件可导入其他槽');
    same(fields(await Progress.loadAsync(3)), fields(first), 'Progress 经过文件与指定槽往返保留 #12b/relationship');
    const beforeInvalid = await saveStore.readSlot(3);
    for (const bad of [{ ...first.exportSave(), morality: MORAL_STATE.morality.min - 1 },
      { ...first.exportSave(), daoHeart: '50' },
      { ...first.exportSave(), affinity: { village_elder: null } },
      { ...first.exportSave(), relationshipState: { ...first.relationshipState, claimedAffinityRewards: [null] } }]) {
      eq(await saveStore.importIntoSlot(3, JSON.stringify(bad)), false, '文件导入沿用 Progress 严格字段校验');
      same(await saveStore.readSlot(3), beforeInvalid, '非法道心善恶或关系字段不覆盖指定槽');
    }
    const imported = await Progress.loadAsync(3);
    eq(await imported.importSaveAsync(second.exportSave()), true, '既有内存 JSON 导入可异步提交到绑定槽');
    same(fields(imported), fields(second), '内存导入成功保留 #12b/relationship 字段');
    same(fields(await Progress.loadAsync(3)), fields(second), '内存导入结果可以再次读出');

    // 普通失败不抹掉调用者尚未保存的内存，事务失败不提交 draft 的任何变化。
    const beforeDisk = await saveStore.readSlot(2);
    loadedSecond.stones += 5;
    const unsaved = loadedSecond.exportSave();
    setSaveBackend(failingBackend(backend));
    eq(await loadedSecond.saveAsync(), false, '开态配额失败 saveAsync 返回 false');
    same(loadedSecond.exportSave(), unsaved, '普通保存失败保留调用前尚未确认写入的内存');
    same(await backend.read(2), beforeDisk, '保存失败保留已有槽数据');
    eq(await loadedSecond.runSaveTransactionAsync(draft => {
      draft.stones += 9; draft.affinity.village_elder++;
      draft.relationshipState.claimedAffinityRewards.push('future_npc|uncommitted');
      return 'not-committed';
    }), undefined, '开态事务配额失败返回 undefined');
    same(loadedSecond.exportSave(), unsaved, '开态事务失败恢复道心善恶、嵌套关系和其他内存');
    same(await backend.read(2), beforeDisk, '开态事务失败不提交半份槽数据');
    const importBefore = loadedSecond.exportSave();
    eq(await loadedSecond.importSaveAsync(first.exportSave()), false, '开态内存导入写盘失败返回 false');
    same(loadedSecond.exportSave(), importBefore, '开态内存导入失败保留原实例');

    setSaveBackend(backend);
    eq(await loadedSecond.saveAsync(), true, '后端恢复后未确认内存可重试保存');
    eq(await loadedSecond.runSaveTransactionAsync(draft => { draft.stones += 3; return 'committed'; }), 'committed',
      '开态异步事务提交成功才返回业务结果');
    eq((await saveStore.readSlot(2))?.data.stones, loadedSecond.stones, '开态事务内存与确认后的槽数据一致');
    eq(await loadedSecond.runSaveTransactionAsync(draft => draft.runSaveTransaction(() => {
      draft.stones += 2; draft.affinity.village_elder++; return 'nested-committed';
    })), 'nested-committed', '异步 draft 内既有同步事务可以暂存并由外层提交');
    eq((await saveStore.readSlot(2))?.data.stones, loadedSecond.stones, '嵌套同步事务只提交外层确认的完整结果');
    const beforeReject = loadedSecond.exportSave();
    eq(await loadedSecond.runSaveTransactionAsync(draft => { draft.stones += 100; return undefined; }), undefined,
      '业务拒绝的异步事务不保存');
    same(loadedSecond.exportSave(), beforeReject, '业务拒绝不提交 draft 修改');
    eq(await loadedSecond.runSaveTransactionAsync(draft => { draft.affinity.village_elder++; throw new Error('Injected apply failure'); }), undefined,
      '业务异常的异步事务不崩');
    same(loadedSecond.exportSave(), beforeReject, '业务异常不提交嵌套字段修改');

    const deferredSave = deferNextWrite(backend); setSaveBackend(deferredSave.backend);
    Progress.setActiveSlot(2);
    const pending = sample('排队快照一');
    const firstSave = pending.saveAsync(); await deferredSave.started;
    pending.name = '排队快照二';
    const secondSave = pending.saveAsync();
    let flushed = false;
    const flush = pending.flushSaves().then(() => { flushed = true; });
    await Promise.resolve();
    eq(flushed, false, 'flushSaves 等待已排队写入而不提前完成');
    pending.name = '尚未保存三';
    Progress.setActiveSlot(3); deferredSave.release();
    eq(await firstSave, true, '等待中的第一笔保存可提交');
    eq(await secondSave, true, '等待中的第二笔保存按顺序提交');
    await flush;
    eq(flushed, true, 'flushSaves 在所有已排队写入提交后完成');
    eq((await saveStore.readSlot(2))?.data.name, '排队快照二', '排队保存坚持调用时数据快照与请求槽');
    eq(pending.name, '尚未保存三', '延迟保存完成不回写或抹掉后续未保存内存');
    eq((await saveStore.readSlot(3))?.data.name, '二号修士', '切槽不把之前排队的保存写到新槽');

    const deferredTransaction = deferNextWrite(backend); setSaveBackend(deferredTransaction.backend);
    Progress.setActiveSlot(2);
    const waiting = sample('事务队列前');
    const waitingSave = waiting.saveAsync(); await deferredTransaction.started;
    const transaction = waiting.runSaveTransactionAsync(draft => { draft.name = '事务队列后'; return true; });
    Progress.setActiveSlot(3); deferredTransaction.release();
    eq(await waitingSave, true, '异步事务前的排队保存提交');
    eq(await transaction, true, '排队异步事务提交成功');
    eq((await saveStore.readSlot(2))?.data.name, '事务队列后', '排队异步事务坚持请求时的活跃槽');
    eq((await saveStore.readSlot(3))?.data.name, '二号修士', '排队期间切槽不重定向事务提交');
    setSaveBackend(backend);

    eq(await Progress.resetAsync(2), true, '开态 resetAsync 只删除指定槽');
    eq(await saveStore.readSlot(2), null, '指定槽删除后为空');
    ok(await saveStore.readSlot(1), '开态删除保留其他槽');
    ok(await saveStore.readSlot(3), '开态删除保留第三槽');
    same((await saveStore.listSlots()).map(slot => slot?.slotKey ?? null), [1, null, 3], '全部接口始终不创建 auto 槽');

    // 首次开态启动通过 Progress 完成迁档；再次启动仍读同一份迁移档。
    const migratedBackend = createMemorySaveBackend(); setSaveBackend(migratedBackend);
    storage.clear(); const raw = JSON.stringify(first.exportSave());
    disk[saveKey] = raw; disk[RELATIONSHIP_BACKUP_KEY] = 'keep-progress-backup';
    Progress.setActiveSlot(1);
    const migrated = await Progress.loadAsync();
    same(fields(migrated), fields(first), 'Progress 首次开态启动自动迁移并读取 slot 1');
    eq(disk[saveKey], undefined, 'Progress 成功迁移后移除旧主档');
    eq(disk[RELATIONSHIP_BACKUP_KEY], 'keep-progress-backup', 'Progress 迁移不丢关系备份');
    same(fields(await Progress.loadAsync(1)), fields(first), 'Progress 迁档重复启动幂等');
    setSaveBackend(failingBackend(createMemorySaveBackend()));
    disk[saveKey] = raw;
    await Progress.loadAsync(1);
    eq(disk[saveKey], raw, 'Progress 启动迁移失败保留 localStorage 原档且不崩');
    setSaveBackend(createMemorySaveBackend());
    storage.clear();
  }

  // 原有入口的显式 async 重载与 async 别名使用同一套槽提交路径。
  {
    setSaveBackend(createMemorySaveBackend());
    Progress.setActiveSlot(1);
    const original = sample('原入口修士');
    eq(await original.save({ async: true }), true, 'save 显式异步入口写入活跃槽');
    const loaded = await Progress.load({ async: true, slot: 1 });
    same(fields(loaded), fields(original), 'load 显式异步入口读取指定槽');
    const imported = sample('原入口导入'); imported.morality = 8;
    eq(await loaded.importSave(imported.exportSave(), { async: true }), true, 'importSave 显式异步入口提交内存 JSON');
    same(fields(await Progress.load({ async: true, slot: 1 })), fields(imported), '原入口导入保留道心善恶与关系字段');
    eq(await loaded.runSaveTransaction(draft => { draft.stones += 11; return 'primary-committed'; }, { async: true }),
      'primary-committed', 'runSaveTransaction 显式异步入口使用 draft 并等待提交');
    eq((await saveStore.readSlot(1))?.data.stones, loaded.stones, '原入口异步事务提交完整槽数据');
    Progress.setActiveSlot(3);
    eq(await sample('待删除三号').save({ async: true }), true, '原入口可向 3 号槽写入');
    eq(await Progress.reset({ async: true, slot: 3 }), true, 'reset 显式异步入口删除指定槽');
    eq(await saveStore.readSlot(3), null, '原入口异步删除后指定槽为空');
    ok(await saveStore.readSlot(1), '原入口异步删除保留其他槽');
    eq(disk[saveKey], undefined, '显式异步入口全程不创建 localStorage 主档');
  }

  // 模拟历史字段在迁移代码中触发异常；即便基础校验通过，也不能用回退角色覆盖原档。
  {
    const ensureDefaultsBefore = Progress.prototype.ensureDefaults;
    try {
      Progress.prototype.ensureDefaults = function () {
        if ((this.buffs as unknown) === 1) throw new TypeError('Injected legacy restore failure');
        return ensureDefaultsBefore.call(this);
      };
      const backend = createMemorySaveBackend(); setSaveBackend(backend);
      const malformed = { ...sample('损坏历史原档').exportSave(), buffs: 1 };
      await backend.write({ slotKey: 1, data: malformed, lastSaveAt: now });
      const before = await backend.read(1);
      const blocked = await Progress.loadAsync(1);
      ok(blocked.storageError, '历史档恢复异常返回 storageError 而不崩');
      blocked.name = '禁止覆盖的回退角色';
      eq(await blocked.saveAsync(), false, '带 storageError 的回退角色禁止覆盖原槽');
      eq(await blocked.save({ async: true }), false, '原入口异步保存同样拒绝覆盖不可读档');
      eq(await blocked.runSaveTransactionAsync(draft => { draft.stones += 1; return true; }), undefined,
        '带 storageError 的回退角色禁止异步事务覆盖');
      same(await backend.read(1), before, '恢复失败及后续保存不会把历史档换成新角色');
      const blob = await saveStore.exportSlotBlob(1);
      ok(blob, '不可运行的历史档仍可文件导出供恢复');
      same(JSON.parse(await blob.text()).data, malformed, '文件导出保留不可运行历史档的全部原数据');

      const migratedBackend = createMemorySaveBackend(); setSaveBackend(migratedBackend);
      const raw = JSON.stringify(malformed); disk[saveKey] = raw;
      const migrated = await Progress.loadAsync(1);
      ok(migrated.storageError, '迁移后恢复异常同样返回 storageError');
      const migratedSlot = await migratedBackend.read(1);
      eq(await migrated.saveAsync(), false, '迁移后无法恢复的回退角色禁止覆盖槽');
      same(await migratedBackend.read(1), migratedSlot, '禁止保存后保留迁入槽的历史原数据');
      same(migratedSlot?.data ?? JSON.parse(disk[saveKey]), malformed, '历史原档至少仍完整保留在原主档或迁入槽');
      storage.clear();
    } finally { Progress.prototype.ensureDefaults = ensureDefaultsBefore; }
  }

  console.log(JSON.stringify({ suite: 'save-slots', passed: true, assertions,
    indexedDbSavesDefault: false, slotKeys: SAVE_SLOT_KEYS, autoSlot: false }));
} finally {
  Date.now = dateNowBefore;
  setFeatureFlag('indexedDbSaves', false);
  Progress.setActiveSlot(1);
  setSaveBackend(createIndexedDbBackend());
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  if (idbBefore) Object.defineProperty(globalThis, 'indexedDB', idbBefore);
  else Reflect.deleteProperty(globalThis, 'indexedDB');
}
