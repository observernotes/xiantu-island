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
const strings = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8'));
const items = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/items.json'), 'utf8'));
const herb = materials.find(item => item.id === 'spirit_herb');
const recipe = recipes.recipes.find(item => item.id === 'recipe_hp_pill');
const quest = quests.find(item => item.id === 'q_alchemy_intro');
const shopItem = items.find(item => item.id === 'qi_pill');
assert.ok(herb?.gather && recipe && quest, '采集、回春丹或入门任务配置缺失');

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
  return errors;
}

function assertCooldown(actual, expected, now) {
  if (actual === undefined) assert.ok(now >= expected, '采集冷却尚未到期就被清理');
  else assert.equal(actual, expected, '换图或读档改变了采集刷新时间');
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
    if (!(scene?.map?.id === id && scene.player?.body && scene.prog && scene.dialog && scene.gathering
      && (scene.alchemy ?? scene.alchemyPanel) && scene.sys.isActive()
      && scene.game.loop.running && scene.game.loop.frame > 3)) return false;
    // 普通构建没有 __xt；测试构建的接口须等 create 完成后才可用。
    try { return !window.__xt || window.__xt.getState().mapId === id; }
    catch { return false; }
  }, mapId, { timeout: 15000, polling: 50 });
}

// Playwright 的 evaluate 没有 timeout；用宿主时钟约束整个站位步骤及失败诊断。
async function withDeadline(label, action, timeout) {
  let timer;
  try {
    return await Promise.race([action(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 超过 ${timeout}ms`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

// 落点、无敌与暂停物理隔离路过怪物；采集和火候继续使用游戏帧计时。
async function standAt(page, name) {
  let target, stage = '定位';
  try {
    await withDeadline(`standAt(${name})`, async () => {
      target = await page.evaluate(objectName => {
        const scene = window.__scene;
        const object = scene.map.objects.find(object => object.name === objectName);
        if (!object) throw new Error(`地图 ${scene.map.id} 缺少 ${objectName}`);
        // 等待真实落地的物理帧期间，也不能被路过怪物接触击退。
        scene.player.invulnUntil = Number.POSITIVE_INFINITY;
        scene.physics.resume();
        scene.player.body.reset(object.x, object.y);
        return { map: scene.map.id, x: object.x, y: object.y, frame: scene.game.loop.frame };
      }, name);
      stage = '落地并暂停物理';
      // reset 后旧落地标记可能尚未刷新，须让物理步实际处理新位置后再暂停。
      await page.waitForFunction(target => {
        const scene = window.__scene, player = scene.player;
        if (scene.map.id !== target.map || scene.game.loop.frame <= target.frame
          || !player.onGround || player.state2 !== 'ground') return false;
        // 在就绪的同一次轮询中暂停，避免再做一次无时限的 evaluate。
        scene.physics.pause();
        return true;
      }, target, { timeout: 3000, polling: 50 });
    }, 5000);
  } catch (error) {
    const diagnostic = await withDeadline(`standAt(${name}) 诊断`, () => page.evaluate(() => {
      const scene = window.__scene, player = scene?.player, body = player?.body;
      return { map: scene?.map?.id, frame: scene?.game?.loop.frame, loopRunning: scene?.game?.loop.running,
        physicsPaused: scene?.physics?.world.isPaused, player: player && { x: player.x, y: player.y,
          feet: player.feet, onGround: player.onGround, state: player.state2, dead: player.dead },
        body: body && { blocked: body.blocked, touching: body.touching, velocity: body.velocity } };
    }), 500).catch(failure => ({ unavailable: failure.message }));
    throw new Error(`standAt(${name}) ${stage}失败: ${error.message}; ${JSON.stringify({ target, diagnostic })}`,
      { cause: error });
  }
}

async function finishDialogue(page) {
  // 开口前须确实进入对白；不能把尚未处理的 Z 输入误当作对白已经结束。
  await page.waitForFunction(() => window.__scene.dialog.open, null, { timeout: 3000 });
  for (let i = 0; i < 20; i++) {
    if (!await page.evaluate(() => window.__scene.dialog.open)) return;
    const choices = await page.evaluate(() => window.__scene.dialog.choices.map(choice => choice.label));
    if (choices.length) {
      const label = strings[quest.nameKey] ?? quest.name, index = choices.indexOf(label);
      assert.ok(index >= 0 && index < 5, '孙郎中服务菜单遮挡原炼丹任务');
      await selectChoice(page, label);
      continue;
    }
    const before = await dialogSignature(page);
    await page.keyboard.press('z', { delay: 60 });
    await waitForDialogueChange(page, before);
  }
  throw new Error('对白 20 次按键后仍未结束');
}

async function dialogSignature(page) {
  return page.evaluate(() => {
    const d = window.__scene.dialog;
    return JSON.stringify([d.open, d.i, d.lines[d.i]?.text, d.choices.map(choice => choice.label)]);
  });
}
async function waitForDialogueChange(page, before) {
  await page.waitForFunction(before => {
    const d = window.__scene.dialog;
    return JSON.stringify([d.open, d.i, d.lines[d.i]?.text, d.choices.map(choice => choice.label)]) !== before;
  }, before, { timeout: 3000 });
}

async function selectChoice(page, label) {
  for (let i = 0; i < 10; i++) {
    const choices = await page.evaluate(() => window.__scene.dialog.choices.map(choice => ({ label: choice.label, disabled: !!choice.disabled })));
    const index = choices.findIndex(choice => choice.label === label);
    if (index >= 0) {
      assert.equal(choices[index].disabled, false, `${label} 菜单不可用`);
      assert.ok(index < 5);
      const before = await dialogSignature(page);
      await page.keyboard.press(String(index + 1), { delay: 60 });
      await waitForDialogueChange(page, before);
      return;
    }
    const next = choices.findIndex(choice => choice.label.startsWith('›'));
    assert.ok(next >= 0, `菜单缺 ${label}`);
    const before = await dialogSignature(page);
    await page.keyboard.press(String(next + 1), { delay: 60 });
    await waitForDialogueChange(page, before);
  }
  assert.fail(`菜单分页缺 ${label}`);
}

async function openDoctorDialogue(page) {
  await standAt(page, 'doctor_sun');
  assert.equal(await page.evaluate(() => window.__scene.nearNpc()), 'doctor_sun', '孙郎中交互位置不正确');
  await page.keyboard.press('z', { delay: 60 });
  // 普通商店与炼丹任务共用服务菜单，等待实际菜单出现再选择原任务。
  await page.waitForFunction(() => window.__scene.dialog.open && window.__scene.dialog.choices.length > 0,
    null, { timeout: 3000 });
}

async function gatherDiagnostic(page) {
  return page.evaluate(() => {
    const s = window.__scene, p = s.player, g = s.gathering;
    return { map: s.map.id, now: Date.now(), player: { x: p.x, y: p.y, feet: p.feet,
      onGround: p.onGround, state: p.state2, dead: p.dead }, requireRelease: g.requireRelease,
      active: g.active && { point: g.active.point.object.name, elapsed: g.active.elapsed },
      dialog: s.dialog.open, alchemy: s.alchemy.isOpen(), skillWindow: s.skillWindow.open, nearbyDrop: s.hasNearbyDrop(),
      keys: Object.fromEntries(['z', 'left', 'right', 'up', 'down', 'space', 'alt', 'c', 'ctrl', 'x'].map(key => [key, s.keys[key].isDown])),
      points: g.points.map(point => ({ name: point.object.name, x: point.object.x, y: point.object.y,
        ready: point.ready, near: g.near(point), cooldown: s.prog.gatherRespawnAt[point.key] })) };
  });
}

async function usePortal(page, objectName, targetMap) {
  await standAt(page, objectName);
  await page.keyboard.press('ArrowUp', { delay: 60 });
  await waitForMap(page, targetMap);
}

let server;
let browser;
let page;
let errors = [];
const checks = [];
const startedAt = performance.now();
function passed(check) {
  checks.push(check);
  console.log(JSON.stringify({ checked: checks.length, check, elapsedMs: Math.round(performance.now() - startedAt) }));
}
try {
  const { api, module } = await loadPlaywright();
  const executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(projectRoot, 'dist/index.html'));
    server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: Number(process.env.SMOKE_PORT ?? 4203), strictPort: true }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await api.chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  errors = collectErrors(page);
  console.log(JSON.stringify({ baseURL, playwright: module, browser: executablePath, headless: true,
    fixtures: 'level12/materials/fuel/position/contact damage isolated/paused physics; deterministic RNG; perfect-frame clock pause' }));
  const url = new URL(baseURL);
  url.searchParams.set('map', 'qingyun_village'); url.searchParams.set('reset', '1');
  await page.goto(url.href, { waitUntil: 'load', timeout: 15000 });
  await waitForMap(page, 'qingyun_village');
  await page.evaluate(() => {
    const p = window.__scene.prog;
    p.level = 12; p.exp = 0; p.stones = 100;
    p.inventory = { spirit_herb: 4, rabbit_fur: 1 };
    p.hp = p.maxHp; p.mp = p.maxMp; p.save();
  });
  // 旧字符串货架保持灵石购买，入口与原教学任务并列，重复确认不重扣。
  const beforeShop = await page.evaluate(item => ({ stones: window.__scene.prog.stones,
    contribution: window.__scene.prog.sectContribution, count: window.__scene.prog.count(item) }), shopItem.id);
  await openDoctorDialogue(page);
  await selectChoice(page, strings['ui.shop.menu'] ?? '商店'); await selectChoice(page, shopItem.name);
  await page.evaluate(confirm => {
    window.__ordinaryBuyConfirm = window.__scene.dialog.choices.find(choice => choice.label === confirm).onSelect;
  }, strings['sect.ui.confirm']);
  await selectChoice(page, strings['sect.ui.confirm']); await finishDialogue(page);
  const afterShop = await page.evaluate(item => ({ stones: window.__scene.prog.stones,
    contribution: window.__scene.prog.sectContribution, count: window.__scene.prog.count(item) }), shopItem.id);
  assert.deepEqual(afterShop, { stones: beforeShop.stones - shopItem.price,
    contribution: beforeShop.contribution, count: beforeShop.count + 1 });
  await page.evaluate(() => window.__ordinaryBuyConfirm());
  assert.deepEqual(await page.evaluate(item => ({ stones: window.__scene.prog.stones,
    contribution: window.__scene.prog.sectContribution, count: window.__scene.prog.count(item) }), shopItem.id), afterShop);
  await finishDialogue(page); passed('孙郎中字符串货架仅扣灵石，同一确认不重复扣款或交货');
  await openDoctorDialogue(page);
  await finishDialogue(page);
  const accepted = await page.evaluate(() => ({
    state: window.__scene.quests.state('q_alchemy_intro'),
    recipes: window.__scene.prog.learnedRecipes,
    saved: JSON.parse(localStorage.getItem('xiantu_save_v1')),
  }));
  assert.equal(accepted.state, 'active', '孙郎中真实对白结束后未接受炼丹入门');
  assert.ok(accepted.recipes.includes(recipe.id), '入门教学未先发回春丹方');
  assert.ok(accepted.saved.learnedRecipes.includes(recipe.id), '教学丹方未存档');
  passed('Z 与孙郎中对话，after 接任务并学回春丹方');
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
  passed('表内采集时长、y−88 读条、gather/idle、头顶键帽、松键中断');

  await page.keyboard.down('z');
  await page.waitForFunction(() => window.__scene.prog.count('spirit_herb') === 5, null,
    { timeout: herb.gather.castMs + 3000 });
  await page.keyboard.up('z');
  // 成功采集要求实际游戏帧先看到松键，才允许第二个点再次开始。
  await page.waitForFunction(() => !window.__scene.gathering.requireRelease, null, { timeout: 3000 });
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
  passed('按住 Z 完成一次采集 +1，respawnMs 冷却保存');

  // 第三个既有采集点位于实心平地，避免单向平台上的敌人干扰落点。
  const fallbackPoint = await page.evaluate(() => window.__scene.gathering.points
    .find(point => point.object.name === 'gather_spirit_herb_21' && point.ready)?.object.name);
  assert.ok(fallbackPoint, '竹林缺少验证 idle 回退的第二个采集点');
  await standAt(page, fallbackPoint);
  await page.evaluate(() => {
    const scene = window.__scene, player = scene.player;
    // 缺 gather 动画的素材夹具；不改变读条、产物或采集状态。
    player.anims.stop(); scene.anims.remove(player.animationKey('gather'));
    player.play(player.animationKey('idle'), true);
  });
  const fallbackBefore = await gatherDiagnostic(page);
  const fallbackTarget = fallbackBefore.points.find(point => point.name === fallbackPoint);
  assert.equal(fallbackTarget?.ready, true, 'idle 回退采集点尚未刷新');
  assert.equal(fallbackTarget?.near, true, '真实落地后未进入 idle 回退采集点交互范围');
  await page.keyboard.down('z');
  try {
    await page.waitForFunction(() => window.__scene.gathering.active?.elapsed > 100, null, { timeout: 3000 });
  } catch (error) {
    console.error(JSON.stringify({ fallbackBefore, fallbackAfter: await gatherDiagnostic(page) }));
    throw error;
  }
  assert.equal(await page.evaluate(() => window.__scene.player.anims.currentAnim?.key),
    await page.evaluate(() => window.__scene.player.animationKey('idle')), '缺 gather 动画时未回退 idle');
  await page.keyboard.up('z');
  await page.waitForFunction(() => !window.__scene.gathering.active
    && !window.__scene.children.getByName('gather:castbar').visible, null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__scene.prog.count('spirit_herb')), harvested.count);
  passed('第二个采集点缺 gather 动画回退 idle，松键不产物');

  await usePortal(page, 'portal_to_village', 'qingyun_village');
  await openDoctorDialogue(page);
  await finishDialogue(page);
  await page.waitForFunction(() => (window.__scene.alchemy ?? window.__scene.alchemyPanel).isOpen(), null, { timeout: 3000 });
  const beforeBrew = await page.evaluate(() => {
    const scene = window.__scene, panel = scene.alchemy ?? scene.alchemyPanel;
    // 只固定骰子，材料检查、火候判定和背包结算仍由实际 UI 输入执行。
    panel.system.random = () => 0;
    return { stones: scene.prog.stones, herb: scene.prog.count('spirit_herb'), fur: scene.prog.count('rabbit_fur'),
      pill: scene.prog.count('hp_pill_small'), position: panel.position };
  });
  passed('Z 在孙郎中处打开已学丹方的丹炉界面');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });

  // UI 素材表：brew=[222,330,96,30]；坐标随面板位置取值。
  await page.mouse.click(beforeBrew.position.x + 270, beforeBrew.position.y + 345);
  await page.waitForFunction(() => !!(window.__scene.alchemy ?? window.__scene.alchemyPanel).system.active, null, { timeout: 3000 });
  const startedBrew = await page.evaluate(() => {
    const scene = window.__scene;
    const saved = JSON.parse(localStorage.getItem('xiantu_save_v1'));
    const url = new URL(location.href); url.searchParams.delete('reset'); history.replaceState(null, '', url.href);
    return { pending: saved.pendingAlchemy, herb: scene.prog.count('spirit_herb'), fur: scene.prog.count('rabbit_fur'),
      stones: scene.prog.stones, pill: scene.prog.count('hp_pill_small') };
  });
  assert.equal(startedBrew.pending?.recipeId, recipe.id, '开炉未保存付料炉次');
  assert.equal(startedBrew.pill, beforeBrew.pill, '开炉直接跳过火候发了产物');
  await page.reload({ waitUntil: 'load', timeout: 15000 });
  await waitForMap(page, 'qingyun_village');
  const resumedBrew = await page.evaluate(() => {
    const scene = window.__scene, panel = scene.alchemy ?? scene.alchemyPanel;
    panel.system.random = () => 0;
    return { open: panel.isOpen(), recipeId: panel.system.active?.recipeId, zoneStart: panel.system.active?.fire.zoneStart,
      herb: scene.prog.count('spirit_herb'), fur: scene.prog.count('rabbit_fur'), stones: scene.prog.stones,
      pill: scene.prog.count('hp_pill_small') };
  });
  assert.ok(resumedBrew.open, '刷新未恢复丹炉界面');
  assert.equal(resumedBrew.recipeId, startedBrew.pending.recipeId, '刷新丢失已付料的炉次');
  assert.equal(resumedBrew.zoneStart, startedBrew.pending.fire.zoneStart, '刷新重新随机了文火区');
  for (const key of ['herb', 'fur', 'stones', 'pill']) assert.equal(resumedBrew[key], startedBrew[key], `刷新重复扣料或发丹：${key}`);
  passed('开炉扣料后刷新恢复炉次/文火区，材料燃料仅扣一次');
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
  passed(`鼠标炼制、真实空格正中，成功下品 ${recipe.outputCount} 颗入包并计 craft`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(projectRoot, 'dist/alchemy-smoke-result.png') });

  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => (window.__scene.alchemy ?? window.__scene.alchemyPanel).isOpen()), false);
  await openDoctorDialogue(page);
  await finishDialogue(page);
  const delivered = await page.evaluate(() => ({
    quest: window.__scene.prog.quests.q_alchemy_intro, recipes: window.__scene.prog.learnedRecipes,
    inventory: window.__scene.prog.inventory, exp: window.__scene.prog.alchemyExp, now: Date.now(),
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
  assertCooldown(delivered.saved.gatherRespawnAt[point.key], harvested.cooldown, delivered.now);
  assert.equal(delivered.saved.pendingAlchemy, null, '成丹后未清理付料炉次，可能重复结算');
  passed('Z 交付入门，奖励丹方去重、丹炉与品质/经验/冷却保存');

  await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('reset'); history.replaceState(null, '', url.href); });
  await page.reload({ waitUntil: 'load', timeout: 15000 });
  await waitForMap(page, 'qingyun_village');
  const reloaded = await page.evaluate(() => ({
    quest: window.__scene.prog.quests.q_alchemy_intro.state, recipes: window.__scene.prog.learnedRecipes,
    qualities: window.__scene.prog.pillQualities, exp: window.__scene.prog.alchemyExp,
    cooldowns: window.__scene.prog.gatherRespawnAt, furnace: window.__scene.prog.count('bronze_furnace'), now: Date.now(),
  }));
  assert.equal(reloaded.quest, 'done'); assert.deepEqual(reloaded.recipes, delivered.recipes);
  assert.deepEqual(reloaded.qualities, brewed.qualities); assert.equal(reloaded.exp, delivered.exp);
  assertCooldown(reloaded.cooldowns[point.key], harvested.cooldown, reloaded.now);
  assert.equal(reloaded.furnace, delivered.inventory.bronze_furnace);
  passed('刷新读档保留任务、丹方、品质、炼丹经验、采集冷却和丹炉');
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
