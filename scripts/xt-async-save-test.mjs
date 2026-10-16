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
        const encounterBefore = progress.encounterSave();
        const encounterCandidate = { ...encounterBefore, exp: encounterBefore.exp + 1,
          stones: encounterBefore.stones + 4, inventory: { ...encounterBefore.inventory, spirit_herb: 98 },
          bonusStats: { insight: 1 }, karmaFlags: { 'xt.asyncEncounter': true },
          encounters: { ...encounterBefore.encounters, settledAttempts: ['xt-async-encounter:1'] } };
        const invalidEncounter = await progress.commitEncounterSaveAsync({ ...encounterCandidate,
          inventory: { spirit_herb: -1 } });
        const afterInvalidEncounter = progress.encounterSave();
        const invalidEncounterStored = await readStored();
        const encounterCommit = progress.commitEncounterSaveAsync(encounterCandidate);
        encounterCandidate.inventory.spirit_herb = 5000;
        encounterCandidate.encounters.settledAttempts.push('uncommitted');
        const encounterCommitted = await encounterCommit;
        const encounterStored = await readStored();
        const encounterMemory = progress.encounterSave();
        const encounterRetryCandidate = { ...encounterMemory, stones: encounterMemory.stones + 10,
          inventory: { ...encounterMemory.inventory, spirit_herb: 97 },
          encounters: { ...encounterMemory.encounters,
            settledAttempts: [...encounterMemory.encounters.settledAttempts, 'xt-async-encounter:2'] } };
        let encounterFailed;
        try {
          Object.defineProperty(target, method, { ...descriptor, value() { throw new Error('expected encounter storage failure'); } });
          encounterFailed = await progress.commitEncounterSaveAsync(encounterRetryCandidate);
        } finally { Object.defineProperty(target, method, descriptor); }
        const encounterFailureStored = await readStored();
        const encounterFailureMemory = progress.encounterSave();
        const encounterRetried = await progress.commitEncounterSaveAsync(encounterRetryCandidate);
        const encounterRetryStored = await readStored();
        await xt.setFlag('talismanCraft', true);
        await xt.loadSave({ ...progress.exportSave(), level: 15, exp: 0,
          learnedRecipes: ['recipe_talisman_fire'], inventory: { talisman_paper: 3, spirit_ink: 3 },
          position: { mapId: 'qingyun_village', x: 160, y: 352 },
          talisman: { version: 1, nextAttempt: 1, attempt: null, pendingOutput: null } });
        const craftingProgress = window.__scene.prog, craft = window.__scene.talismanSystem;
        let rolls = 0; craft.random = () => { rolls++; return 0; };
        const craftBefore = craftingProgress.exportSave();
        let craftStartFailure;
        try {
          Object.defineProperty(target, method, { ...descriptor, value() { throw new Error('expected craft start failure'); } });
          craftStartFailure = await craft.startAsync('recipe_talisman_fire', 1000);
        } finally { Object.defineProperty(target, method, descriptor); }
        const craftStartFailureMemory = craftingProgress.exportSave(), craftStartFailureStored = await readStored();
        let craftTime = 1000;
        const craftStarting = craft.startAsync('recipe_talisman_fire', () => craftTime);
        craftTime = 5000;
        const craftStarted = await craftStarting, craftDraw = craft.view().draw;
        const craftStepTimeMs = craft.view().selectedRecipe.draw.stepTimeMs;
        const craftPaid = craftingProgress.exportSave();
        try {
          Object.defineProperty(target, method, { ...descriptor, value() { throw new Error('expected craft result failure'); } });
          await craft.inputAsync([], craftTime, 0);
          for (const [i, stroke] of craftDraw.strokes.entries()) {
            await craft.inputAsync([stroke], craftTime + 10 + i * 20, i * 2 + 1);
            await craft.inputAsync([], craftTime + 11 + i * 20, i * 2 + 2);
          }
        } finally { Object.defineProperty(target, method, descriptor); }
        const craftFailureMemory = craftingProgress.exportSave(), craftFailureStored = await readStored();
        const craftRetried = await craft.settleAsync(craftPaid.talisman.attempt.attemptId);
        const craftRetryStored = await readStored();
        return { given, flagged, exported, loaded, rejected, afterFailure, memoryAfterFailure, afterRetry,
          encounterBefore, invalidEncounter, afterInvalidEncounter, invalidEncounterStored,
          encounterCommitted, encounterStored, encounterMemory, encounterFailed, encounterFailureStored,
          encounterFailureMemory, encounterRetried, encounterRetryStored,
          crafting: { craftBefore, craftStartFailure, craftStartFailureMemory, craftStartFailureStored,
            craftStarted, craftDraw, craftStepTimeMs, craftPaid, craftFailureMemory, craftFailureStored, craftRetried, craftRetryStored, rolls },
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
      assert.equal(result.invalidEncounter, false, 'invalid encounter remains rejected');
      assert.deepEqual(result.afterInvalidEncounter, result.encounterBefore, 'invalid encounter preserves memory');
      assert.deepEqual(result.invalidEncounterStored, result.afterRetry, 'invalid encounter preserves backend');
      assert.equal(result.encounterCommitted, true, 'async encounter commit succeeds');
      assert.equal(result.encounterStored.inventory.spirit_herb, 98, 'encounter inventory commits before resolving');
      assert.equal(result.encounterStored.exp, result.encounterBefore.exp + 1, 'encounter cultivation commits');
      assert.equal(result.encounterStored.stones, result.encounterBefore.stones + 4, 'encounter stones commit');
      assert.deepEqual(result.encounterStored.encounters.settledAttempts, ['xt-async-encounter:1'], 'encounter receipt commits');
      assert.deepEqual(result.encounterStored.bonusStats, { insight: 1 }, 'encounter bonus commits');
      assert.deepEqual(result.encounterStored.karmaFlags, { 'xt.asyncEncounter': true }, 'encounter karma commits');
      assert.equal(result.encounterFailed, false, 'failed encounter commit reports failure');
      assert.deepEqual(result.encounterFailureStored, result.encounterStored, 'failed encounter preserves backend');
      assert.deepEqual(result.encounterFailureMemory, result.encounterMemory, 'failed encounter preserves memory');
      assert.equal(result.encounterRetried, true, 'same encounter result can be retried');
      assert.equal(result.encounterRetryStored.inventory.spirit_herb, 97, 'encounter retry commits inventory');
      assert.deepEqual(result.encounterRetryStored.encounters.settledAttempts,
        ['xt-async-encounter:1', 'xt-async-encounter:2'], 'encounter retry commits its receipt once');
      const craft = result.crafting;
      assert.equal(craft.craftStartFailure.reason, 'save', 'failed craft start reports save failure');
      assert.deepEqual(craft.craftStartFailureMemory, craft.craftBefore, 'failed craft start preserves unpaid memory');
      assert.deepEqual(craft.craftStartFailureStored, craft.craftBefore, 'failed craft start preserves backend');
      assert.equal(craft.craftStarted.ok, true, 'async craft starts after payment commits');
      assert.equal(craft.craftDraw.remainingMs, craft.craftStepTimeMs, 'IDB wait preserves the full first-stroke budget');
      assert.deepEqual(craft.craftFailureMemory, craft.craftPaid, 'failed craft result preserves paid memory');
      assert.deepEqual(craft.craftFailureStored, craft.craftPaid, 'failed craft result preserves backend');
      assert.equal(craft.craftRetried.success, true, 'same completed craft can be retried');
      assert.equal(craft.craftRetryStored.inventory.talisman_fire, craft.craftRetried.count, 'craft retry commits its output');
      assert.equal(craft.craftRetryStored.talisman.attempt.result.delivered, true, 'craft receipt commits with output');
      assert.equal(craft.rolls, 1, 'craft save failures and retries do not reroll');
      if (indexedDbSaves) assert.equal(result.legacy, null, 'open state does not write the legacy primary save');
      console.log(JSON.stringify({ suite: 'xt-async-save', indexedDbSaves, passed: true }));
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], 'no unhandled bridge rejections');
} finally {
  await browser?.close();
  await server?.close();
}
