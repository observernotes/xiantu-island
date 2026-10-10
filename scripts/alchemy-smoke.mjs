// 先 npm run build:test，再 npm run test:smoke:alchemy（外层 timeout，无头 Chromium）。
// 只夹具等级、原料、燃料及落点；接受/采集/开炉/炼制/交付均走真实键鼠。
// 炼制随机数固定为 0；正中线时暂停画面时钟，按下真实空格再恢复，避免 CI 调度漂移。
// 可用 PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE_PATH / XT_SMOKE_BASE_URL 指定本机工具或已有服务。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { dataMode, findRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = findRoot(projectRoot);
const screenshot = path.join(projectRoot, 'dist/alchemy-smoke.png');
const materials = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/materials.json'), 'utf8'));
const recipes = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/recipes.json'), 'utf8'));
const quests = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
const strings = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8'));
const items = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/items.json'), 'utf8'));
const herb = materials.find(item => item.id === 'spirit_herb');
const recipe = recipes.recipes.find(item => item.id === 'recipe_hp_pill');
const clearMindRecipe = recipes.recipes.find(item => item.id === 'recipe_clear_mind');
const foundationRecipe = recipes.recipes.find(item => item.id === 'recipe_foundation');
const quest = quests.find(item => item.id === 'q_alchemy_intro');
const shopItem = items.find(item => item.id === 'qi_pill');
assert.ok(herb?.gather && recipe && quest && clearMindRecipe && foundationRecipe,
  '采集、一期丹方或入门任务配置缺失');

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
  await page.evaluate(() => {
    if (!window.__xt) throw new Error('炼丹冒烟需要测试构建，请先执行 npm run build:test');
    // 会话开关不入存档；刷新后重新开启，不修改正式 features.json。
    window.__xt.setFlag('shops', true);
    window.__xt.setFlag('alchemyPhase1', true);
  });
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

async function clickAlchemyButton(page, name) {
  const point = await page.evaluate(name => {
    const scene = window.__scene, panel = scene.alchemy ?? scene.alchemyPanel;
    const [x, y, width, height] = scene.cache.json.get('alchemy_ui').detail.buttons[name];
    return { x: panel.position.x + x + width / 2, y: panel.position.y + y + height / 2 };
  }, name);
  await page.mouse.click(point.x, point.y);
}

async function alchemyBalance(page) {
  return page.evaluate(recipe => {
    const scene = window.__scene, panel = scene.alchemy ?? scene.alchemyPanel;
    return { materials: Object.fromEntries(recipe.materials.map(material => [material.item, scene.prog.count(material.item)])),
      stones: scene.prog.stones, output: scene.prog.count(recipe.output),
      low: scene.prog.pillQualities[recipe.output]?.low ?? 0,
      level: scene.prog.alchemyLevel, exp: scene.prog.alchemyExp,
      pending: scene.prog.pendingAlchemy, result: panel.lastResult };
  }, recipe);
}

function assertBrewCosts(before, after, count) {
  for (const material of recipe.materials) assert.equal(after.materials[material.item],
    before.materials[material.item] - material.count * count, `${count} 炉材料扣除错误：${material.item}`);
  assert.equal(after.stones, before.stones - recipe.fuelStones * count, `${count} 炉燃料扣除错误`);
  assert.equal(after.output, before.output + recipe.outputCount * count, `${count} 炉产出错误`);
  assert.equal(after.low, before.low + recipe.outputCount * count, `${count} 炉下品分桶错误`);
  assert.equal(after.pending, null, '成丹后仍有待结算炉次');
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
  console.log(JSON.stringify({ baseURL, dataMode: dataMode(projectRoot), dataRoot, playwright: module, browser: executablePath, headless: true,
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
  await page.evaluate(() => window.__xt.setFlag('alchemyPhase1', false));
  await standAt(page, 'doctor_sun');
  await page.waitForFunction(() => {
    const entry = window.__scene.interactionPrompts.find(entry => entry.object.name === 'doctor_sun');
    return entry?.prompt.visible && entry.prompt.list.at(-1)?.text === '对话';
  }, null, { timeout: 3000 });
  await page.keyboard.press('l', { delay: 60 });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => (window.__scene.alchemy ?? window.__scene.alchemyPanel).isOpen()), false,
    'alchemyPhase1 关闭时 L 仍打开丹炉');
  // 关闭功能的按键反馈仍是普通对白，先真实按键结束，再核对孙郎中菜单。
  await finishDialogue(page);
  await openDoctorDialogue(page);
  const closedIntro = await page.evaluate(() => ({ available: window.__scene.quests.available('q_alchemy_intro'),
    npcQuests: window.__scene.quests.npcQuestIds('doctor_sun'),
    choices: window.__scene.dialog.choices.map(choice => choice.label), help: window.__scene.helpText.text }));
  assert.equal(closedIntro.available, false, '关闭炼丹仍可接入门任务');
  assert.ok(!closedIntro.npcQuests.includes(quest.id), '关闭炼丹未隐藏孙郎中任务入口');
  assert.ok(!closedIntro.choices.includes(strings[quest.nameKey] ?? quest.name), '关闭炼丹仍显示入门服务菜单');
  assert.ok(!closedIntro.choices.includes('学习丹方'), '关闭炼丹仍显示丹方购买入口');
  assert.ok(!closedIntro.help.includes('采集') && !closedIntro.help.includes('L 丹炉'), '关闭炼丹仍显示帮助中的入口');
  await selectChoice(page, strings['ui.dialog.close']);
  await page.waitForFunction(() => !window.__scene.dialog.open, null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__scene.quests.state('q_alchemy_intro')), undefined,
    '关闭炼丹的孙郎中服务菜单仍接了入门任务');
  await page.evaluate(() => window.__xt.setFlag('alchemyPhase1', true));
  passed('关闭炼丹时孙郎中提示与任务/服务菜单隐藏，真实 L 不开炉；普通商店仍可对话');
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
  await page.evaluate(() => window.__xt.setFlag('alchemyPhase1', false));
  await page.waitForFunction(label => !window.__scene.tracker.text.includes(label),
    strings[quest.nameKey] ?? quest.name, { timeout: 3000 });
  const hiddenActive = await page.evaluate(() => ({ open: window.__scene.alchemy.isOpen(),
    state: window.__scene.quests.state('q_alchemy_intro'), active: window.__scene.quests.activeIds,
    progress: window.__xt.getState().questProgress, tracker: window.__scene.tracker.text }));
  assert.equal(hiddenActive.open, false, '关闭开关没有收起已打开的丹炉');
  assert.equal(hiddenActive.state, 'active', '关闭开关丢弃了已接任务');
  assert.ok(!hiddenActive.active.includes(quest.id) && !Object.hasOwn(hiddenActive.progress, quest.id),
    '关闭开关没有隐藏已有炼丹任务追踪');
  assert.ok(!hiddenActive.tracker.includes(strings[quest.nameKey] ?? quest.name), '关闭开关仍显示入门 HUD 追踪');
  await openDoctorDialogue(page);
  await selectChoice(page, strings['ui.dialog.next']);
  assert.equal(await page.evaluate(() => window.__scene.dialog.lines.some(line => line.text.includes('试炼回春丹'))), false,
    '关闭开关的普通对白仍泄漏进行中入门教学');
  await finishDialogue(page);
  assert.equal(await page.evaluate(() => window.__scene.alchemy.isOpen()), false, '关闭开关对白结束后自动开炉');
  await page.evaluate(() => window.__xt.setFlag('alchemyPhase1', true));
  passed('运行中关闭炼丹收起窗口和已接任务追踪，保留任务存档，重新开启可继续');
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
  const closedGatherCount = await page.evaluate(() => {
    window.__xt.setFlag('alchemyPhase1', false);
    return window.__scene.prog.count('spirit_herb');
  });
  await page.keyboard.down('z'); await page.waitForTimeout(200);
  const closedGather = await page.evaluate(() => ({ count: window.__scene.prog.count('spirit_herb'),
    active: !!window.__scene.gathering.active, bar: window.__scene.children.getByName('gather:castbar').visible,
    prompts: window.__scene.gathering.points.some(point => point.prompt.visible) }));
  await page.keyboard.up('z');
  assert.deepEqual(closedGather, { count: closedGatherCount, active: false, bar: false, prompts: false },
    '关闭炼丹时仍能真实 Z 采集或显示采集入口');
  await page.evaluate(() => window.__xt.setFlag('alchemyPhase1', true));
  await page.waitForFunction(name => window.__scene.gathering.points.find(point => point.object.name === name)?.prompt.visible,
    pointName, { timeout: 3000 });
  passed('关闭炼丹时竹林采集提示和读条隐藏，按住真实 Z 不采集；重新开启恢复提示');
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

  // 坐标随面板位置和 UI 素材表取值。
  await clickAlchemyButton(page, 'brew');
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

  await page.keyboard.press('i', { delay: 60 });
  await page.waitForFunction(() => window.__scene.invText.visible && window.__scene.inventoryFurnace.visible,
    null, { timeout: 3000 });
  const inventoryFurnace = await page.evaluate(() => {
    const scene = window.__scene, button = scene.inventoryFurnace, bounds = button.getBounds();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
      furnace: button.getData('furnace'), count: scene.prog.count(button.getData('furnace')) };
  });
  assert.equal(inventoryFurnace.furnace, 'bronze_furnace', '背包丹炉入口未使用获得的青铜炉');
  await page.evaluate(() => window.__xt.setFlag('alchemyPhase1', false));
  assert.equal(await page.evaluate(() => window.__scene.inventoryFurnace.visible), false, '关闭炼丹仍显示背包丹炉入口');
  await page.mouse.click(inventoryFurnace.x, inventoryFurnace.y); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__scene.alchemy.isOpen()), false, '关闭炼丹的背包入口仍可点击开炉');
  await page.evaluate(() => window.__xt.setFlag('alchemyPhase1', true));
  await page.waitForFunction(() => window.__scene.inventoryFurnace.visible, null, { timeout: 3000 });
  await page.mouse.click(inventoryFurnace.x, inventoryFurnace.y);
  await page.waitForFunction(() => window.__scene.alchemy.isOpen() && !window.__scene.invText.visible,
    null, { timeout: 3000 });
  assert.equal(await page.evaluate(id => window.__scene.prog.count(id), inventoryFurnace.furnace), inventoryFurnace.count,
    '使用背包丹炉消耗了丹炉物品');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  passed('真实 I 背包点击青铜炉开窗且不消耗丹炉，关闭炼丹时背包入口隐藏并不可点击');

  // 追加六炉原料/燃料夹具；实际开炉、跳过与批量均通过鼠标操作。
  await page.evaluate(recipe => {
    for (const material of recipe.materials) window.__xt.giveItem(material.item, material.count * 6);
    const prog = window.__scene.prog;
    prog.stones += recipe.fuelStones * 6; prog.save();
  }, recipe);
  await standAt(page, 'doctor_sun');
  await page.keyboard.press('l', { delay: 60 });
  await page.waitForFunction(() => window.__scene.alchemy.isOpen(), null, { timeout: 3000 });
  await page.evaluate(() => { window.__scene.alchemy.system.random = () => 0; });
  const beforeSkip = await alchemyBalance(page);
  await clickAlchemyButton(page, 'brew');
  await page.waitForFunction(() => !!window.__scene.alchemy.system.active, null, { timeout: 3000 });
  await clickAlchemyButton(page, 'skip');
  await page.waitForFunction(() => window.__scene.alchemy.lastResult?.fire === 'skipped', null, { timeout: 3000 });
  const skipped = await alchemyBalance(page);
  assert.ok(skipped.result.success, '真实跳过按钮未成功结算');
  assertBrewCosts(beforeSkip, skipped, 1);
  passed('获得丹炉后真实 L 开窗、鼠标开炉和跳过，单炉材料/燃料/品质结算一次');

  await clickAlchemyButton(page, 'batch');
  await page.waitForFunction(() => window.__scene.alchemy.status.startsWith('五炉炼制：'), null, { timeout: 3000 });
  const batched = await alchemyBalance(page);
  assertBrewCosts(skipped, batched, 5);
  assert.equal(batched.result.fire, 'skipped', '批量最后一炉没有跳过火候');
  assert.equal(await page.evaluate(() => !!window.__scene.alchemy.system.active), false, '批量留下火候小游戏');
  assert.ok(batched.level > beforeSkip.level || batched.exp > beforeSkip.exp, '批量炼丹未累计经验');
  passed('真实 ×5 批量跳过五次火候，准确扣五份原料/燃料并产出品质丹药、累计经验');

  const disabledBrew = await page.evaluate(() => {
    const scene = window.__scene, buttons = scene.cache.json.get('alchemy_ui').detail.buttons;
    return ['brew', 'batch'].map(name => {
      const [x, y] = buttons[name];
      const zone = scene.alchemy.c.list.find(child => child.type === 'Zone' && child.x === x && child.y === y);
      return { name, enabled: !!zone?.input?.enabled };
    });
  });
  assert.deepEqual(disabledBrew, [{ name: 'brew', enabled: false }, { name: 'batch', enabled: false }],
    '材料不足时炼制/批量按钮仍可点击');
  await clickAlchemyButton(page, 'brew'); await clickAlchemyButton(page, 'batch');
  assert.deepEqual(await alchemyBalance(page), batched, '缺料按钮真实点击仍改变材料或产物');
  passed('材料不足时炼制和 ×5 按钮禁用，真实点击不扣料、不产丹');

  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.evaluate(recipes => {
    const prog = window.__scene.prog;
    prog.level = 15; prog.exp = 0; prog.stones += recipes.reduce((sum, recipe) => sum + recipe.price, 0);
    prog.save();
  }, [clearMindRecipe, foundationRecipe]);
  const beforeRecipes = await page.evaluate(() => ({ stones: window.__scene.prog.stones,
    recipes: window.__scene.prog.learnedRecipes, contribution: window.__scene.prog.sectContribution }));
  await openDoctorDialogue(page); await selectChoice(page, '学习丹方');
  const recipeChoices = await page.evaluate(() => window.__scene.dialog.choices
    .map(choice => ({ label: choice.label, disabled: !!choice.disabled, reason: choice.reason })));
  const foundationIndex = recipeChoices.findIndex(choice => choice.label === `${foundationRecipe.name}丹方`);
  assert.ok(foundationIndex >= 0 && foundationIndex < 5, '孙郎中丹方目录未列出筑基丹方');
  assert.ok(recipeChoices[foundationIndex].disabled && recipeChoices[foundationIndex].reason.includes(String(foundationRecipe.reqLevel)),
    '等级 15 时筑基丹方没有按 reqLevel 灰显');
  const beforeDisabledRecipe = await dialogSignature(page);
  await page.keyboard.press(String(foundationIndex + 1), { delay: 60 });
  assert.equal(await dialogSignature(page), beforeDisabledRecipe, '等级不足仍可进入筑基丹方确认');
  await selectChoice(page, `${clearMindRecipe.name}丹方`);
  await page.evaluate(confirm => {
    window.__recipeBuyConfirm = window.__scene.dialog.choices.find(choice => choice.label === confirm).onSelect;
  }, strings['sect.ui.confirm']);
  await selectChoice(page, strings['sect.ui.confirm']); await finishDialogue(page);
  const afterClearMind = await page.evaluate(() => ({ stones: window.__scene.prog.stones,
    recipes: window.__scene.prog.learnedRecipes, contribution: window.__scene.prog.sectContribution }));
  assert.equal(afterClearMind.stones, beforeRecipes.stones - clearMindRecipe.price, '丹方购买没有按 recipes.price 扣灵石');
  assert.equal(afterClearMind.contribution, beforeRecipes.contribution, '丹方购买误扣宗门贡献');
  assert.equal(afterClearMind.recipes.filter(id => id === clearMindRecipe.id).length, 1, '清心丹方没有直接授方或授方重复');
  await page.evaluate(() => window.__recipeBuyConfirm());
  assert.deepEqual(await page.evaluate(() => ({ stones: window.__scene.prog.stones,
    recipes: window.__scene.prog.learnedRecipes, contribution: window.__scene.prog.sectContribution })), afterClearMind,
    '同一丹方确认回调重复扣款或授方');
  await finishDialogue(page);
  passed('孙郎中学习丹方：15 级可购买清心方，筑基方按 20 级门槛灰显，重复确认不重扣');

  await page.evaluate(level => { window.__scene.prog.level = level; window.__scene.prog.save(); }, foundationRecipe.reqLevel);
  await openDoctorDialogue(page); await selectChoice(page, '学习丹方');
  await selectChoice(page, `${foundationRecipe.name}丹方`);
  await selectChoice(page, strings['sect.ui.confirm']); await finishDialogue(page);
  const afterRecipes = await page.evaluate(() => ({ stones: window.__scene.prog.stones,
    recipes: window.__scene.prog.learnedRecipes, inventory: window.__scene.prog.inventory }));
  assert.equal(afterRecipes.stones, afterClearMind.stones - foundationRecipe.price, '筑基丹方价格没有读表');
  for (const recipe of [clearMindRecipe, foundationRecipe]) {
    assert.equal(afterRecipes.recipes.filter(id => id === recipe.id).length, 1, `${recipe.id} 未授方或重复授方`);
    assert.equal(afterRecipes.inventory[recipe.id], undefined, '丹方被当成背包商品');
  }
  await page.reload({ waitUntil: 'load', timeout: 15000 }); await waitForMap(page, 'qingyun_village');
  const savedRecipes = await page.evaluate(() => ({ stones: window.__scene.prog.stones,
    recipes: window.__scene.prog.learnedRecipes, inventory: window.__scene.prog.inventory }));
  assert.deepEqual(savedRecipes, afterRecipes, '刷新丢失丹方购买或重复扣款');
  passed('达到筑基丹方 reqLevel 后可真实购买，清心/筑基丹方与扣款刷新后保持');
  assert.deepEqual(errors, [], '炼丹冒烟出现浏览器报错');
  console.log(JSON.stringify({ passed: checks.length, checks, consoleErrors: 0, pageErrors: 0, requestFailures: 0,
    gathered: 1, brews: 7, output: recipe.output, outputCount: recipe.outputCount * 7, quality: brewed.result.quality,
    quest: 'q_alchemy_intro:done', screenshot }));
} catch (error) {
  console.error(JSON.stringify({ checks, errors, failure: error.message }));
  throw error;
} finally {
  if (page) await page.close();
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
