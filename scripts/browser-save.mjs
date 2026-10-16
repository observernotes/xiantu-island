// Playwright-only reader: inspect committed data without saving or applying load migrations.
import fs from 'node:fs/promises';

const configured = JSON.parse(await fs.readFile(new URL('../data/features.json', import.meta.url), 'utf8'));

export async function installBrowserSaveReader(context) {
  await context.addInitScript(defaultIndexed => {
    window.__xtReadPersistedSave = async () => {
      const progress = window.__scene.prog;
      await progress.flushSaves();
      const indexed = window.__xt?.getState().features.indexedDbSaves ?? defaultIndexed;
      if (!indexed) return JSON.parse(localStorage.getItem('xiantu_save_v1'));
      return new Promise((resolve, reject) => {
        const open = indexedDB.open('xiantu_saves', 1);
        open.onerror = () => reject(open.error);
        open.onblocked = () => reject(new Error('测试读档被 IndexedDB 升级阻塞'));
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction('slots', 'readonly');
          const request = tx.objectStore('slots').get(progress.constructor.getActiveSlot());
          tx.oncomplete = () => { db.close(); resolve(request.result?.data ?? null); };
          tx.onabort = () => { db.close(); reject(tx.error); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
      });
    };
  }, configured.indexedDbSaves === true);
}
