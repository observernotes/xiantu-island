// 先 npm run build，再 npm run test:smoke:alchemy（外层 timeout，无头 Chromium）。
// 只夹具等级、原料、燃料及落点；接受/采集/开炉/炼制/交付均走真实键鼠。
// 炼制随机数固定为 0；正中线时暂停画面时钟，按下真实空格再恢复，避免 CI 调度漂移。
// 可用 PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE_PATH / XT_SMOKE_BASE_URL 指定本机工具或已有服务。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { sharedRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = sharedRoot(projectRoot);
const screenshot = path.join(projectRoot, 'dist/alchemy-smoke.png');
const materials = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/materials.json'), 'utf8'));
const recipes = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/recipes.json'), 'utf8'));
const quests = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
const herb = materials.find(item => item.id === 'spirit_herb');
const recipe = recipes.recipes.find(item => item.id === 'recipe_hp_pill');
const quest = quests.find(item => item.id === 'q_alchemy_intro');
assert.ok(herb?.gather && recipe && quest, '采集、回春丹或入门任务配置缺失');

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
  return errors;
}

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try {
      const api = await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate);
      return { api, module: candidate };
    } catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('未找到 Playwright；请用 PLAYWRIGHT_MODULE 指定外部安装的 playwright-core/index.mjs');
}

async function browserPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* 尝试下一条本机路径 */ }
  }
  throw new Error('未找到 Chromium；请用 CHROMIUM_EXECUTABLE_PATH 指定浏览器');
}

async function waitForMap(page, mapId) {
  await page.waitForFunction(id => {
    const scene = window.__scene;
    return scene?.map?.id === id && scene.player && scene.dialog && scene.gathering
      && (scene.alchemy ?? scene.alchemyPanel) && scene.game.loop.frame > 3;
  }, mapId, { timeout: 15000 });
  await page.waitForTimeout(300);
}

// 位置与暂停物理是隔离路过怪物的夹具；采集和火候继续使用游戏帧计时。
async function standAt(page, name) {
  await page.evaluate(objectName => {
    const scene = window.__scene;
    const object = scene.map.objects.find(object => object.name === objectName);
    if (!object) throw new Error(`地图缺少 ${objectName}`);
    scene.physics.resume();
    scene.player.body.reset(object.x, object.y);
  }, name);
  await page.waitForFunction(() => window.__scene.player.onGround && window.__scene.player.state2 === 'ground', null, { timeout: 3000 });
  await page.evaluate(() => window.__scene.physics.pause());
}

async function finishDialogue(page) {
  for (let i = 0; i < 20; i++) {
    if (!await page.evaluate(() => window.__scene.dialog.open)) return;
    assert.equal(await page.evaluate(() => window.__scene.dialog.choices.length), 0, '烟测试遇到未预期的对话选项');
    await page.keyboard.press('z');
    await page.waitForTimeout(100);
  }
  throw new Error('对白 20 次按键后仍未结束');
}

async function usePortal(page, objectName, targetMap) {
  await standAt(page, objectName);
  await page.keyboard.press('ArrowUp');
  await waitForMap(page, targetMap);
}

let server;
let browser;
let page;
let errors = [];
const checks = [];
try {
  const { api, module } = await loadPlaywright();
  const executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(projectRoot, 'dist/index.html'));
    server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: 4186 }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await api.chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  errors = collectErrors(page);
  console.log(JSON.stringify({ baseURL, playwright: module, browser: executablePath, headless: true,
    fixtures: 'level12/materials/fuel/position/paused physics; deterministic RNG; perfect-frame clock pause' }));
  const url = new URL(baseURL);
  url.searchParams.set('map', 'qingyun_village'); url.searchParams.set('reset', '1');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  await waitForMap(page, 'qingyun_village');
  await page.evaluate(() => {
    const p = window.__scene.prog;
    p.level = 12; p.exp = 0; p.stones = 100;
    p.inventory = { spirit_herb: 4, rabbit_fur: 1 };
    p.hp = p.maxHp; p.mp = p.maxMp; p.save();
  });
  await standAt(page, 'doctor_sun');
  await page.keyboard.press('z'); await page.waitForTimeout(100);
  await finishDialogue(page);
  const accepted = await page.evaluate(() => ({
    state: window.__scene.quests.state('q_alchemy_intro'),
    recipes: window.__scene.prog.learnedRecipes,
    saved: JSON.parse(localStorage.getItem('xiantu_save_v1')),
  }));
  assert.equal(accepted.state, 'active', '孙郎中真实对白结束后未接受炼丹入门');
  assert.ok(accepted.recipes.includes(recipe.id), '入门教学未先发回春丹方');
  assert.ok(accepted.saved.learnedRecipes.includes(recipe.id), '教学丹方未存档');
  checks.push('Z 与孙郎中对话，after 接任务并学回春丹方');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);

  await usePortal(page, 'portal_to_bamboo', 'bamboo_forest');
  const pointName = await page.evaluate(() => window.__scene.gathering.points.find(point => point.item === 'spirit_herb')?.object.name);
  assert.ok(pointName, '竹林没有已有灵草采集点');
  await standAt(page, pointName);
  await page.waitForTimeout(100);
  const point = await page.evaluate(name => {
    const scene = window.__scene, point = scene.gathering.points.find(point => point.object.name === name);
    return { key: point.key, castMs: point.castMs, respawnMs: point.respawnMs, ready: point.ready,
      promptVisible: point.prompt.visible,
      keycap: point.prompt.list.some(child => child.texture?.key === 'ui_hud_keycap') };
  }, pointName);
  assert.equal(point.castMs, herb.gather.castMs); assert.equal(point.respawnMs, herb.gather.respawnMs);
  assert.ok(point.ready && point.promptVisible && point.keycap, '采集提示未接 HUD 键帽');
  await page.keyboard.down('z');
  await page.waitForFunction(() => window.__scene.gathering.active?.elapsed > 100, null, { timeout: 3000 });
  const cast = await page.evaluate(() => {
    const scene = window.__scene, bar = scene.children.getByName('gather:castbar');
    const key = scene.player.animationKey('gather');
    return { barVisible: bar.visible, yOffset: scene.player.y - bar.y, count: scene.prog.count('spirit_herb'),
      elapsed: scene.gathering.active.elapsed, anim: scene.player.anims.currentAnim?.key,
      expectedAnim: scene.anims.exists(key) ? key : scene.player.animationKey('idle') };
  });
  assert.ok(cast.barVisible); assert.equal(cast.yOffset, 88, '采集读条未显示在主角 y−88');
  assert.equal(cast.anim, cast.expectedAnim, '采集动作未播放 gather 或 idle');
  await page.keyboard.up('z');
  await page.waitForFunction(() => !window.__scene.gathering.active
    && !window.__scene.children.getByName('gather:castbar').visible, null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__scene.prog.count('spirit_herb')), cast.count, '松开 Z 的半途采集仍发物品');
  checks.push('表内采集时长、y−88 读条、gather/idle、头顶键帽、松键中断');

  await page.keyboard.down('z');
  await page.waitForFunction(() => window.__scene.prog.count('spirit_herb') === 5, null,
    { timeout: herb.gather.castMs + 3000 });
  await page.keyboard.up('z');
  const harvested = await page.evaluate(name => {
    const scene = window.__scene, point = scene.gathering.points.find(point => point.object.name === name);
    const saved = JSON.parse(localStorage.getItem('xiantu_save_v1'));
    return { count: scene.prog.count('spirit_herb'), ready: point.ready, active: !!scene.gathering.active,
      promptVisible: point.prompt.visible, remaining: scene.prog.gatherRespawnAt[point.key] - Date.now(),
      cooldown: scene.prog.gatherRespawnAt[point.key], savedCooldown: saved.gatherRespawnAt[point.key] };
  }, pointName);
  assert.equal(harvested.count, 5); assert.equal(harvested.ready, false); assert.equal(harvested.active, false);
  assert.equal(harvested.promptVisible, false);
  assert.ok(harvested.remaining > herb.gather.respawnMs - 1500 && harvested.remaining <= herb.gather.respawnMs,
    '采集冷却未使用 materials.gather.respawnMs');
  assert.equal(harvested.cooldown, harvested.savedCooldown, '采集刷新时间未存档');
  checks.push('按住 Z 完成一次采集 +1，respawnMs 冷却保存');

  await usePortal(page, 'portal_to_village', 'qingyun_village');
  await standAt(page, 'doctor_sun');
  await page.keyboard.press('z'); await page.waitForTimeout(100);
  await finishDialogue(page);
  await page.waitForFunction(() => (window.__scene.alchemy ?? window.__scene.alchemyPanel).isOpen(), null, { timeout: 3000 });
  const beforeBrew = await page.evaluate(() => {
    const scene = window.__scene, panel = scene.alchemy ?? scene.alchemyPanel;
    // 只固定骰子，材料检查、火候判定和背包结算仍由实际 UI 输入执行。
    panel.system.random = () => 0;
    return { stones: scene.prog.stones, herb: scene.prog.count('spirit_herb'), fur: scene.prog.count('rabbit_fur'),
      pill: scene.prog.count('hp_pill_small'), position: panel.position };
  });
  checks.push('Z 在孙郎中处打开已学丹方的丹炉界面');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });

  // UI 素材表：brew=[222,330,96,30]；坐标随面板位置取值。
  await page.mouse.click(beforeBrew.position.x + 270, beforeBrew.position.y + 345);
  await page.waitForFunction(() => !!(window.__scene.alchemy ?? window.__scene.alchemyPanel).system.active, null, { timeout: 3000 });
  await page.waitForFunction(() => {
    const scene = window.__scene, panel = scene.alchemy ?? scene.alchemyPanel;
    const fire = panel.system.active?.fire;
    if (!fire) return false;
    const center = fire.zoneStart + fire.zoneWidth / 2;
    if (Math.abs(panel.pointerRatio - center) >= fire.perfectWidth / 2) return false;
    // 暂停画面时钟只为确保真实按键落在已观测到的正中线；不改指针或结算结果。
    scene.game.loop.sleep();
    return true;
  }, null, { timeout: 3000, polling: 'raf' });
  await page.keyboard.down('Space');
  await page.evaluate(() => window.__scene.game.loop.wake());
  await page.waitForFunction(() => !!(window.__scene.alchemy ?? window.__scene.alchemyPanel).lastResult, null, { timeout: 3000 });
  await page.keyboard.up('Space');
  const brewed = await page.evaluate(() => {
    const scene = window.__scene, panel = scene.alchemy ?? scene.alchemyPanel;
    return { result: panel.lastResult, inventory: scene.prog.inventory, qualities: scene.prog.pillQualities,
      level: scene.prog.alchemyLevel, exp: scene.prog.alchemyExp, stones: scene.prog.stones,
      quest: scene.prog.quests.q_alchemy_intro, complete: scene.quests.complete('q_alchemy_intro') };
  });
  assert.ok(brewed.result.success, '真实火候操作后未炼成丹');
  assert.equal(brewed.result.fire, 'perfect', '真实空格未停在正中线');
  assert.equal(brewed.result.quality, 'low', '固定质量骰子未得到下品');
  assert.equal(brewed.inventory[recipe.output], beforeBrew.pill + recipe.outputCount);
  assert.equal(brewed.qualities[recipe.output].low, recipe.outputCount);
  assert.equal(brewed.inventory.spirit_herb, beforeBrew.herb - recipe.materials.find(item => item.item === 'spirit_herb').count);
  assert.equal(brewed.inventory.rabbit_fur ?? 0, beforeBrew.fur - recipe.materials.find(item => item.item === 'rabbit_fur').count);
  assert.equal(brewed.stones, beforeBrew.stones - recipe.fuelStones);
  assert.ok(brewed.exp > 0 && brewed.level >= 1, '炼丹经验未结算');
  assert.equal(brewed.quest.crafted[recipe.output], recipe.outputCount, 'craft 目标未按成功产物计数');
  assert.ok(brewed.complete, '采集 + 炼成后入门任务仍不可交付');
  checks.push(`鼠标炼制、真实空格正中，成功下品 ${recipe.outputCount} 颗入包并计 craft`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(projectRoot, 'dist/alchemy-smoke-result.png') });

  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => (window.__scene.alchemy ?? window.__scene.alchemyPanel).isOpen()), false);
  await page.keyboard.press('z'); await page.waitForTimeout(100);
  await finishDialogue(page);
  const delivered = await page.evaluate(() => ({
    quest: window.__scene.prog.quests.q_alchemy_intro, recipes: window.__scene.prog.learnedRecipes,
    inventory: window.__scene.prog.inventory, exp: window.__scene.prog.alchemyExp,
    saved: JSON.parse(localStorage.getItem('xiantu_save_v1')),
  }));
  assert.equal(delivered.quest.state, 'done', '孙郎中真实对白结束后入门任务未交付');
  for (const id of quest.rewards.recipes) {
    assert.ok(delivered.recipes.includes(id), `任务未奖励丹方 ${id}`);
    assert.equal(delivered.recipes.filter(recipeId => recipeId === id).length, 1, '教学与奖励重复丹方');
  }
  assert.equal(delivered.inventory.bronze_furnace, quest.rewards.items.find(item => item.item === 'bronze_furnace').count);
  assert.equal(delivered.saved.quests.q_alchemy_intro.state, 'done');
  assert.deepEqual(delivered.saved.pillQualities, brewed.qualities);
  assert.equal(delivered.saved.gatherRespawnAt[point.key], harvested.cooldown);
  checks.push('Z 交付入门，奖励丹方去重、丹炉与品质/经验/冷却保存');

  await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('reset'); history.replaceState(null, '', url.href); });
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await waitForMap(page, 'qingyun_village');
  const reloaded = await page.evaluate(() => ({
    quest: window.__scene.prog.quests.q_alchemy_intro.state, recipes: window.__scene.prog.learnedRecipes,
    qualities: window.__scene.prog.pillQualities, exp: window.__scene.prog.alchemyExp,
    cooldowns: window.__scene.prog.gatherRespawnAt, furnace: window.__scene.prog.count('bronze_furnace'),
  }));
  assert.equal(reloaded.quest, 'done'); assert.deepEqual(reloaded.recipes, delivered.recipes);
  assert.deepEqual(reloaded.qualities, brewed.qualities); assert.equal(reloaded.exp, delivered.exp);
  assert.equal(reloaded.cooldowns[point.key], harvested.cooldown); assert.equal(reloaded.furnace, delivered.inventory.bronze_furnace);
  checks.push('刷新读档保留任务、丹方、品质、炼丹经验、采集冷却和丹炉');
  assert.deepEqual(errors, [], '炼丹冒烟出现浏览器报错');
  console.log(JSON.stringify({ passed: checks.length, checks, consoleErrors: 0, pageErrors: 0, requestFailures: 0,
    gathered: 1, brews: 1, output: recipe.output, outputCount: recipe.outputCount, quality: brewed.result.quality,
    quest: 'q_alchemy_intro:done', screenshot }));
} catch (error) {
  console.error(JSON.stringify({ checks, errors, failure: error.message }));
  throw error;
} finally {
  if (page) await page.close();
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
