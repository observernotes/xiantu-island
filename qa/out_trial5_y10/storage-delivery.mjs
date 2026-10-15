// Adapted from the read-only QA Y10 repro. Fixture setup uses the test bridge;
// delivery and retries use real Z input. Sampling never calls __xt.exportSave.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const out = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(out, '../..');
const project = process.env.Y10_PROJECT_ROOT || source;
const port = Number(process.env.Y10_PORT || 4698);
const { preview } = await import(pathToFileURL(path.join(source, 'node_modules/vite/dist/node/index.js')).href);
const { findRoot } = await import(pathToFileURL(path.join(source, 'scripts/root.mjs')).href);
const dataRoot = findRoot(source);
const fixture = JSON.parse(await fs.readFile('/workspace/xiantu/qa/fixtures/before_five_sect_trials.json', 'utf8'));
const quests = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
const trials = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/trials.json'), 'utf8'));
const quest = quests.find(row => row.id === 'q_sect_taixu');
const trial = trials.find(row => row.id === 'trial_sect_taixu');
const expectedJob = 'taixu_acolyte';
const results = [];
const errors = { console: [], page: [], http: [] };
const log = [];
let browser, server, page;

async function writeJSON(name, value) {
  await fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
}
async function report(line) {
  log.push(line);
  console.log(line);
  await fs.writeFile(path.join(out, 'storage-delivery.log'), log.join('\n') + '\n');
}
async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['/tmp/pwt/node_modules/playwright-core/index.mjs', path.join(source, 'node_modules/playwright-core/index.mjs')];
  for (const candidate of candidates) {
    try { return { api: await import(pathToFileURL(candidate).href), module: candidate }; }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('Playwright unavailable; set PLAYWRIGHT_MODULE');
}
async function chromiumPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/chromium', '/usr/bin/google-chrome',
      '/home/box/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  throw new Error('Chromium unavailable; set CHROMIUM_EXECUTABLE_PATH');
}
async function ready() {
  await page.waitForFunction(() => window.__xt && window.__scene?.player?.active
    && window.__scene.sys.isActive() && window.__scene.dialog, null, { timeout: 20000 });
}
async function sample() {
  return page.evaluate(() => {
    const scene = window.__scene;
    // Include every persisted reward domain; exclude unrelated age/position ticks.
    const projectSave = value => value && Object.fromEntries([
      'quests', 'job', 'selectedSect', 'skills', 'skillGifted', 'skillMastery', 'skillCooldowns',
      'hotbar', 'buffs', 'classRewardClaims', 'equip', 'inventory', 'stones', 'exp', 'level',
      'overflowExp', 'sectRank', 'classVersion', 'classRefundSp', 'completedTrials', 'pendingSectTrial',
      'realmRewards', 'breakthroughBonusLevels', 'breakthroughFails', 'unstableUntil', 'unstableRatio',
      'unstableStats', 'lastOverflowReturned',
    ].map(key => [key, value[key]]));
    return { map: scene.map.id,
      dialog: { open: scene.dialog.open, index: scene.dialog.i, version: scene.dialog.version,
        choices: scene.dialog.choices.map(choice => ({ label: choice.label, disabled: !!choice.disabled })) },
      memory: projectSave(scene.prog.exportSave()),
      stored: projectSave(JSON.parse(localStorage.getItem('xiantu_save_v1'))) };
  });
}
async function key(keyName) {
  await page.keyboard.down(keyName);
  try { await page.waitForTimeout(80); }
  finally { await page.keyboard.up(keyName); }
  await page.waitForTimeout(40);
}
async function stand() {
  const frame = await page.evaluate(id => {
    const scene = window.__scene;
    const npc = scene.map.objects.find(row => row.type === 'npc' && (row.props.npc ?? row.name) === id);
    if (!npc) throw new Error('NPC missing: ' + id);
    scene.dialog.close(); scene.physics.resume();
    scene.player.body.reset(npc.x, npc.y); scene.player.body.setVelocity(0, 0);
    return scene.game.loop.frame;
  }, quest.turnIn);
  await page.waitForFunction(before => {
    const scene = window.__scene;
    if (scene.game.loop.frame <= before || !scene.player.onGround) return false;
    scene.physics.pause(); return true;
  }, frame, { timeout: 5000 });
}
async function drain() {
  for (let index = 0; index < 16; index++) {
    const state = await sample();
    if (!state.dialog.open) return;
    if (state.dialog.choices.length) {
      const exit = state.dialog.choices.findIndex(choice => /告辞|离开|关闭/.test(choice.label));
      await key(String((exit >= 0 ? exit : state.dialog.choices.length - 1) + 1));
    } else await key('z');
  }
  throw new Error('Dialog did not close after 16 inputs');
}
async function talk() {
  await stand(); await key('z'); await drain();
}
async function load() {
  const save = structuredClone(fixture);
  Object.assign(save, { selectedSect: trial.sect, completedTrials: [trial.id], pendingSectTrial: null,
    spTipShown: true, position: { mapId: trial.map, x: 96, y: 576 },
    quests: { ...save.quests, [quest.id]: { state: 'active', kills: {}, crafted: {} } } });
  await page.evaluate(async value => {
    await window.__xt.loadSave(value);
    window.__xt.setFlag('fiveSectClasses', true); window.__xt.setFlag('v05Maps', true);
    window.__xt.clock.pause();
  }, save);
  await ready();
  await page.waitForFunction(id => window.__scene.map.id === id, trial.map);
  await stand(); await key('z');
  const before = await sample();
  assert.equal(before.dialog.open, true, 'Delivery dialog must be open before fault injection');
  assert.equal(before.dialog.choices.length, 0);
  assert.equal(before.memory.quests[quest.id].state, 'active');
  assert.equal(before.memory.stones, 560);
  assert.equal(before.memory.job, '');
  return before;
}
async function reload() {
  const url = new URL(page.url());
  url.searchParams.set('map', trial.map); url.searchParams.delete('reset');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await ready();
  await page.evaluate(() => {
    window.__xt.setFlag('fiveSectClasses', true); window.__xt.setFlag('v05Maps', true);
    window.__xt.clock.pause();
  });
}
async function installFault(mode) {
  await page.evaluate(mode => {
    window.__qaOriginalSetItem = Storage.prototype.setItem;
    window.__qaSaveTrace = [];
    Storage.prototype.setItem = function(key, value) {
      if (key === 'xiantu_save_v1') {
        const row = JSON.parse(value), n = window.__qaSaveTrace.length + 1;
        const willFail = mode === 'all' || (mode === 'after-first' && n >= 2);
        window.__qaSaveTrace.push({ n, willFail, quest: row.quests.q_sect_taixu?.state,
          job: row.job, stones: row.stones, level: row.level, exp: row.exp,
          skills: row.skills, skillGifted: row.skillGifted, inventory: row.inventory,
          equip: row.equip, classRewardClaims: row.classRewardClaims });
        if (willFail) throw new Error('QA injected Y10 disk failure: ' + mode + ', write ' + n);
      }
      return window.__qaOriginalSetItem.call(this, key, value);
    };
  }, mode);
}
async function uninstallFault() {
  return page.evaluate(() => {
    Storage.prototype.setItem = window.__qaOriginalSetItem;
    delete window.__qaOriginalSetItem;
    return window.__qaSaveTrace;
  });
}
function assertRewarded(value) {
  assert.equal(value.quests[quest.id].state, 'done');
  assert.equal(value.job, expectedJob);
  assert.equal(value.stones, fixture.stones + quest.rewards.spiritStone);
  assert.equal(value.level, 12); assert.equal(value.exp, 273);
  assert.ok(value.classRewardClaims.includes(expectedJob));
  for (const skill of quest.rewards.skills) {
    assert.equal(value.skills[skill.id], skill.level);
    assert.equal(value.skillGifted[skill.id], skill.level);
  }
  assert.equal(value.equip.robe, 'robe_taixu_1');
}
async function run(name, mode) {
  const before = await load();
  let inMemory, trace;
  await installFault(mode);
  try { await drain(); inMemory = await sample(); }
  finally { trace = await uninstallFault(); }
  // Refresh immediately after restoring storage. No bridge export/evidence call
  // is allowed between the injected delivery and reload.
  await reload();
  const refreshed = await sample();
  await talk();
  const retry = await sample();
  await reload();
  const retryRefreshed = await sample();
  const evidence = { name, mode, before, inMemory, trace, refreshed, retry, retryRefreshed };
  await writeJSON(name + '.json', evidence);
  assert.ok(trace.length > 0, 'Must observe actual save attempts');
  if (mode === 'all') {
    assert.ok(trace.every(row => row.willFail));
    assert.deepEqual(inMemory.memory, before.memory, 'Failed save must restore every reward field in memory');
    assert.deepEqual(inMemory.stored, before.stored, 'Failed save must leave disk unchanged');
    assert.equal(refreshed.memory.quests[quest.id].state, 'active');
    assert.equal(refreshed.memory.job, '');
    assert.equal(refreshed.memory.stones, fixture.stones);
    assert.equal(refreshed.memory.level, fixture.level);
    assert.equal(refreshed.memory.exp, fixture.exp);
  } else {
    assertRewarded(inMemory.memory); assertRewarded(inMemory.stored);
    assertRewarded(refreshed.memory); assertRewarded(refreshed.stored);
    for (const row of trace.filter(row => !row.willFail)) {
      assert.equal(row.quest, 'done'); assert.equal(row.job, expectedJob);
      assert.equal(row.stones, fixture.stones + quest.rewards.spiritStone);
      assert.equal(row.level, 12); assert.equal(row.exp, 273);
    }
    assert.deepEqual(retry.memory, refreshed.memory, 'Repeated delivery must not grant rewards again');
  }
  assertRewarded(retry.memory); assertRewarded(retryRefreshed.memory); assertRewarded(retryRefreshed.stored);
  await talk();
  const duplicate = await sample();
  assert.deepEqual(duplicate.memory, retryRefreshed.memory, 'Retry must settle at most once');
  const result = { name, status: 'PASS', mode, saveAttempts: trace.length,
    successfulWrites: trace.filter(row => !row.willFail).length,
    failedWrites: trace.filter(row => row.willFail).length,
    refreshed: { state: refreshed.memory.quests[quest.id].state, job: refreshed.memory.job,
      stones: refreshed.memory.stones, level: refreshed.memory.level, exp: refreshed.memory.exp },
    afterRetry: { state: duplicate.memory.quests[quest.id].state, job: duplicate.memory.job,
      stones: duplicate.memory.stones, level: duplicate.memory.level, exp: duplicate.memory.exp } };
  results.push(result);
  await report('PASS ' + name + ': ' + JSON.stringify(result));
}

try {
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'storage-delivery.log'), '');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
  const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
  const sourceHashes = {};
  for (const file of ['src/Progress.ts', 'src/QuestSystem.ts', 'src/scenes/GameScene.ts'])
    sourceHashes[file] = await hash(path.join(source, file));
  await writeJSON('build-source.json', { source, project, revision: sha, dataRoot,
    indexSha256: await hash(path.join(project, 'dist/index.html')), sourceHashes,
    at: new Date().toISOString(), originalRepro: '/workspace/xiantu/qa/out_trial5_edaa7d6/storage-delivery.mjs' });
  const pw = await loadPlaywright();
  server = await preview({ configFile: false, root: project, base: './', build: { outDir: 'dist' },
    preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
  browser = await pw.api.chromium.launch({ executablePath: await chromiumPath(pw.api.chromium),
    headless: true, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 },
    timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.http.push({ url: response.url(), status: response.status() }); });
  await page.goto('http://127.0.0.1:' + port + '/?map=qingyun_village&reset=1', { waitUntil: 'domcontentloaded' });
  await ready();
  await run('normal-once', 'none');
  await run('first-write-success', 'after-first');
  await run('all-writes-fail-retry', 'all');
  assert.deepEqual(errors, { console: [], page: [], http: [] }, 'Browser errors must be empty');
  await report('PASS browser errors: console=0 page=0 http=0');
} catch (error) {
  results.push({ name: 'harness', status: 'FAIL', failure: error.stack });
  await report('FAIL ' + error.stack);
  process.exitCode = 1;
} finally {
  await writeJSON('results.json', { results, errors });
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
