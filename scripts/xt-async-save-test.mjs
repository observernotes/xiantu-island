// Requires build:test. Check the XT bridge against real IDB and the legacy fixture.
import assert from 'node:assert/strict';
import { preview } from './isolated-build.mjs';
import { launchPerfBrowser, root } from './perf-smoke-utils.mjs';

let server, browser;
const errors = [];
try {
  server = await preview({ root });
  browser = await launchPerfBrowser();
  for (const indexedDbSaves of [true, false]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${server.resolvedUrls.local[0]}?map=luoxia_town&reset=1`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__xt && window.__scene?.player?.active);
      const result = await page.evaluate(async indexed => {
        const xt = window.__xt, progress = window.__scene.prog;
        await progress.flushSaves();
        await xt.setFlag('indexedDbSaves', indexed);
        await xt.clock.pause();
        // A first visit starts a gameplay draft transaction during scene.create.
        await xt.teleport('lingxi_path');
        // Read the committed backend without calling exportSave (which saves again).
        const readStored = async () => {
          if (!indexed) return JSON.parse(localStorage.getItem('xiantu_save_v1'));
          return new Promise((resolve, reject) => {
            const open = indexedDB.open('xiantu_saves', 1);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result, tx = db.transaction('slots', 'readonly');
              const request = tx.objectStore('slots').get(progress.constructor.getActiveSlot());
              tx.oncomplete = () => { db.close(); resolve(request.result?.data); };
              tx.onabort = () => { db.close(); reject(tx.error); };
            };
          });
        };
        await xt.giveItem('spirit_herb', 3);
        const given = await readStored();
        await xt.setFlag('xt.asyncProbe', true);
        const flagged = await readStored();
        const exported = await xt.exportSave();
        const loaded = (await progress.constructor.loadAsync()).exportSave();
        const candidate = structuredClone(exported);
        candidate.inventory.spirit_herb = 99;
        await progress.flushSaves();
        let rejected = false;
        const target = indexed ? IDBObjectStore.prototype : Storage.prototype;
        const method = indexed ? 'put' : 'setItem';
        const descriptor = Object.getOwnPropertyDescriptor(target, method);
        try {
          Object.defineProperty(target, method, { ...descriptor, value() { throw new Error('expected XT storage failure'); } });
          try { await xt.loadSave(candidate); } catch { rejected = true; }
        } finally { Object.defineProperty(target, method, descriptor); }
        const afterFailure = await readStored();
        const memoryAfterFailure = structuredClone(progress.inventory);
        await xt.loadSave(candidate);
        const afterRetry = await readStored();
        return { given, flagged, exported, loaded, rejected, afterFailure, memoryAfterFailure, afterRetry,
          legacy: localStorage.getItem('xiantu_save_v1') };
      }, indexedDbSaves);
      assert.equal(result.given.inventory.spirit_herb, 3, 'giveItem resolves after backend commit');
      assert.equal(result.given.position.mapId, 'lingxi_path', 'teleport waits for the first-visit transaction');
      assert.equal(result.flagged.flags['xt.asyncProbe'], true, 'setFlag commits its draft');
      assert.deepEqual(result.loaded.inventory, result.exported.inventory, 'loadAsync reads the exported slot');
      assert.equal(result.rejected, true, 'failed import rejects');
      assert.deepEqual(result.afterFailure.inventory, result.exported.inventory, 'failed import preserves backend');
      assert.deepEqual(result.memoryAfterFailure, result.exported.inventory, 'failed import preserves memory');
      assert.equal(result.afterRetry.inventory.spirit_herb, 99, 'retry commits before loadSave resolves');
      if (indexedDbSaves) assert.equal(result.legacy, null, 'open state does not write the legacy primary save');
      console.log(JSON.stringify({ suite: 'xt-async-save', indexedDbSaves, passed: true }));
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], 'no unhandled bridge rejections');
} finally {
  await browser?.close();
  await server?.close();
}
