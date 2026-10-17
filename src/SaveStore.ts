/** #12c 只提供三个手动存档位；没有自动档或离线结算。 */
export const SAVE_SLOT_KEYS = Object.freeze([1, 2, 3] as const);
export type SlotKey = typeof SAVE_SLOT_KEYS[number];
export type SaveData = Record<string, unknown>;
export interface SaveSlot { slotKey: SlotKey; data: SaveData; lastSaveAt: number }
export type SaveValidator = (data: unknown) => boolean;

/** 固定 schema：xiantu_saves v1 / slots，主键 slotKey（1 / 2 / 3）。 */
export const SAVE_DB_NAME = 'xiantu_saves';
export const SAVE_DB_VERSION = 1;
export const SAVE_OBJECT_STORE = 'slots';
export const LEGACY_SAVE_KEY = 'xiantu_save_v1';
export const LEGACY_RELATIONSHIP_BACKUP_KEY = 'xiantu_save_relationship_v1_backup';
const FILE_FORMAT = 'xiantu-save-slot';
const STORAGE_TIMEOUT_MS = 5000;

/** read 的 null 只表示空槽；读取失败必须 reject，避免误把错误当空档覆盖。 */
export interface SaveBackend {
  read(slotKey: SlotKey): Promise<SaveSlot | null>;
  write(slot: SaveSlot): Promise<void>;
  delete(slotKey: SlotKey): Promise<void>;
  /** 在同一写事务中判断空槽并插入，迁档不得覆盖另一窗口刚写入的 1 号位。 */
  insertIfEmpty(slot: SaveSlot): Promise<boolean>;
  /** 在同一写事务中核对整槽旧事实；生产 IDB 不允许读写之间被另一窗口插入。 */
  compareAndWrite?(slot: SaveSlot, expectedSnapshot: string): Promise<boolean>;
}
type LegacyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type MigrationResult = 'migrated' | 'none' | 'occupied' | 'failed';
const objectData = (data: unknown): data is SaveData => !!data && typeof data === 'object' && !Array.isArray(data);
const validSlotKey = (key: unknown): key is SlotKey => SAVE_SLOT_KEYS.some(slot => slot === key);
const clone = <T>(data: T): T => structuredClone(data);
export const saveSnapshot = (data: unknown): string => JSON.stringify(data,
  (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) : value);
function assertSlotKey(key: SlotKey): void {
  if (!validSlotKey(key)) throw new Error('存档位只允许 1、2、3');
}

/** 生产后端使用真正的 IndexedDB；工厂参数允许最小 IDB 集成测试。 */
export function createIndexedDbBackend(factory?: IDBFactory): SaveBackend {
  let connection: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => {
    if (connection) return connection;
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      let request: IDBOpenDBRequest;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };
      const timer = setTimeout(() => fail(new Error('IndexedDB 打开超时')), STORAGE_TIMEOUT_MS);
      try {
        const indexedDb = factory ?? globalThis.indexedDB;
        if (!indexedDb) throw new Error('IndexedDB 不可用');
        request = indexedDb.open(SAVE_DB_NAME, SAVE_DB_VERSION);
        request.onupgradeneeded = () => {
          try {
            const db = request.result;
            if (!db.objectStoreNames.contains(SAVE_OBJECT_STORE)) db.createObjectStore(SAVE_OBJECT_STORE, { keyPath: 'slotKey' });
          } catch (error) {
            try { request.transaction?.abort(); } catch { /* 保留建库时最初的错误。 */ }
            fail(error);
          }
        };
        request.onerror = () => fail(request.error ?? new Error('IndexedDB 打开失败'));
        request.onblocked = () => fail(new Error('IndexedDB 升级被另一窗口阻塞'));
        request.onsuccess = () => {
          const db = request.result;
          if (settled) { db.close(); return; }
          settled = true;
          clearTimeout(timer);
          db.onversionchange = () => { db.close(); connection = undefined; };
          resolve(db);
        };
      } catch (error) { fail(error); }
    }).catch(error => { connection = undefined; throw error; });
    return connection;
  };
  const transaction = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      let value: T;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };
      const timer = setTimeout(() => {
        try { tx?.abort(); } catch { /* 已结束的事务无需再次中止。 */ }
        fail(new Error('IndexedDB 事务超时'));
      }, STORAGE_TIMEOUT_MS);
      try {
        tx = db.transaction(SAVE_OBJECT_STORE, mode);
        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        };
        tx.onabort = () => fail(tx.error ?? new Error('IndexedDB 事务已中止'));
        tx.onerror = () => fail(tx.error ?? new Error('IndexedDB 事务失败'));
        run(tx.objectStore(SAVE_OBJECT_STORE), result => { value = result; });
      } catch (error) {
        try { tx!?.abort(); } catch { /* 保留最初的错误。 */ }
        fail(error);
      }
    });
  };
  return {
    async read(slotKey) {
      assertSlotKey(slotKey);
      return transaction<SaveSlot | null>('readonly', (store, result) => {
        const request = store.get(slotKey);
        request.onsuccess = () => result(request.result === undefined ? null : request.result as SaveSlot);
      });
    },
    async write(slot) {
      assertSlotKey(slot.slotKey);
      return transaction<void>('readwrite', (store, result) => { store.put(slot); result(undefined); });
    },
    async compareAndWrite(slot, expectedSnapshot) {
      assertSlotKey(slot.slotKey);
      return transaction<boolean>('readwrite', (store, result) => {
        const request = store.get(slot.slotKey);
        request.onsuccess = () => {
          if (!request.result || saveSnapshot((request.result as SaveSlot).data) !== expectedSnapshot) { result(false); return; }
          try { store.put(slot); result(true); } catch { store.transaction.abort(); }
        };
      });
    },
    async delete(slotKey) {
      assertSlotKey(slotKey);
      return transaction<void>('readwrite', (store, result) => { store.delete(slotKey); result(undefined); });
    },
    async insertIfEmpty(slot) {
      assertSlotKey(slot.slotKey);
      return transaction<boolean>('readwrite', (store, result) => {
        const request = store.get(slot.slotKey);
        request.onsuccess = () => {
          if (request.result !== undefined) { result(false); return; }
          try {
            store.add(slot);
            result(true);
          } catch {
            // IDB 的同步 DataClone / 配额错误也只中止事务，不泄漏到全局事件。
            store.transaction.abort();
          }
        };
      });
    },
  };
}

/** 测试可注入此后端，并可包装方法模拟配额或读写失败；不访问 localStorage。 */
export function createMemorySaveBackend(): SaveBackend {
  const records = new Map<SlotKey, SaveSlot>();
  return {
    async read(slotKey) { assertSlotKey(slotKey); return clone(records.get(slotKey) ?? null); },
    async write(slot) { assertSlotKey(slot.slotKey); records.set(slot.slotKey, clone(slot)); },
    async delete(slotKey) { assertSlotKey(slotKey); records.delete(slotKey); },
    async insertIfEmpty(slot) {
      assertSlotKey(slot.slotKey);
      if (records.has(slot.slotKey)) return false;
      records.set(slot.slotKey, clone(slot));
      return true;
    },
  };
}

export class SaveStore {
  #slotWrites = new Map<SlotKey, Promise<unknown>>();
  constructor(private backend: SaveBackend = createIndexedDbBackend(), private validate: SaveValidator = objectData) {}
  setBackend(backend: SaveBackend): void { this.backend = backend; }
  setValidator(validate: SaveValidator): void { this.validate = validate; }

  /** 数组下标 0 / 1 / 2 分别对应 1 / 2 / 3 号位，空槽为 null。 */
  async listSlots(): Promise<(SaveSlot | null)[]> { return Promise.all(SAVE_SLOT_KEYS.map(key => this.readSlot(key))); }

  async readSlot(slotKey: SlotKey): Promise<SaveSlot | null> {
    assertSlotKey(slotKey);
    const slot = await this.backend.read(slotKey);
    if (slot === null) return null;
    if (slot.slotKey !== slotKey || !Number.isFinite(slot.lastSaveAt) || slot.lastSaveAt < 0 || !objectData(slot.data) || !this.validate(slot.data)) {
      throw new Error('存档记录损坏');
    }
    return clone(slot);
  }

  private serializeSlot<T>(slotKey: SlotKey, action: () => Promise<T>): Promise<T> {
    const queued = (this.#slotWrites.get(slotKey) ?? Promise.resolve()).then(action, action);
    this.#slotWrites.set(slotKey, queued);
    void queued.finally(() => { if (this.#slotWrites.get(slotKey) === queued) this.#slotWrites.delete(slotKey); }).catch(() => undefined);
    return queued;
  }

  async writeSlot(slotKey: SlotKey, data: SaveData, expectedSnapshot?: string): Promise<boolean> {
    try {
      assertSlotKey(slotKey);
      if (!objectData(data) || !this.validate(data)) return false;
      const backend = this.backend, slot = { slotKey, data: clone(data), lastSaveAt: Date.now() };
      return await this.serializeSlot(slotKey, async () => {
        if (expectedSnapshot !== undefined) {
          if (backend.compareAndWrite) return backend.compareAndWrite(slot, expectedSnapshot);
          // 自定义/隔离后端与全部普通 writer 共用此槽队列；不安装任何 fixture carrier。
          const current = await backend.read(slotKey);
          if (!current || saveSnapshot(current.data) !== expectedSnapshot) return false;
        }
        await backend.write(slot);
        return true;
      });
    } catch { return false; }
  }

  async deleteSlot(slotKey: SlotKey): Promise<boolean> {
    try { assertSlotKey(slotKey); const backend = this.backend; await this.serializeSlot(slotKey, () => backend.delete(slotKey)); return true; } catch { return false; }
  }

  /**
   * 先备份需迁移关系结构的原文，再以 IDB 原子事务写空的 1 号位。
   * 只有 IDB 提交成功且主键内容仍是刚读取的原文才移除 localStorage 主档；
   * 任何失败都保留主档，关系备份键永远不覆盖、不删除。
   */
  async migrateLegacyLocalStorage(storage?: LegacyStorage): Promise<MigrationResult> {
    try {
      const legacy = storage ?? globalThis.localStorage;
      const raw = legacy.getItem(LEGACY_SAVE_KEY);
      if (raw === null) return 'none';
      if (await this.backend.read(1)) return 'occupied';
      const data: unknown = JSON.parse(raw);
      if (!objectData(data) || !this.validate(data)) return 'failed';
      const state = data.relationshipState;
      const needsRelationshipBackup = !Object.prototype.hasOwnProperty.call(data, 'affinity')
        || !Object.prototype.hasOwnProperty.call(data, 'relationshipState')
        || objectData(state) && (!Object.prototype.hasOwnProperty.call(state, 'version') || state.version === 0);
      if (needsRelationshipBackup && legacy.getItem(LEGACY_RELATIONSHIP_BACKUP_KEY) === null) {
        legacy.setItem(LEGACY_RELATIONSHIP_BACKUP_KEY, raw);
      }
      const inserted = await this.backend.insertIfEmpty({ slotKey: 1, data: clone(data), lastSaveAt: Date.now() });
      if (!inserted) return 'occupied';
      if (legacy.getItem(LEGACY_SAVE_KEY) === raw) legacy.removeItem(LEGACY_SAVE_KEY);
      return 'migrated';
    } catch { return 'failed'; }
  }

  async exportSlotBlob(slotKey: SlotKey): Promise<Blob | null> {
    try {
      const slot = await this.readSlot(slotKey);
      if (!slot) return null;
      return new Blob([JSON.stringify({ format: FILE_FORMAT, version: 1, ...slot }, null, 2)], { type: 'application/json' });
    } catch { return null; }
  }

  /** 接受本模块导出的文件，或现有 Progress.exportSave 的原始 JSON。 */
  async importIntoSlot(slotKey: SlotKey, source: string | Blob): Promise<boolean> {
    try {
      const parsed: unknown = JSON.parse(typeof source === 'string' ? source : await source.text());
      if (!objectData(parsed)) return false;
      let data = parsed;
      if (Object.prototype.hasOwnProperty.call(parsed, 'format')) {
        if (parsed.format !== FILE_FORMAT || parsed.version !== 1 || !validSlotKey(parsed.slotKey) || !objectData(parsed.data)
          || typeof parsed.lastSaveAt !== 'number' || !Number.isFinite(parsed.lastSaveAt) || parsed.lastSaveAt < 0) return false;
        data = parsed.data;
      }
      return await this.writeSlot(slotKey, data);
    } catch { return false; }
  }
}

export const saveStore = new SaveStore();
export function setSaveBackend(backend: SaveBackend): void { saveStore.setBackend(backend); }
/** Progress 在模块初始化时注入现有存档校验，避免循环依赖。 */
export function setSaveValidator(validate: SaveValidator): void { saveStore.setValidator(validate); }
