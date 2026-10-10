// 先以相同 XT_DATA 执行 npm run build，再 npm run test:smoke:skill-learning。
// 使用生产构建、正常读档和真实 K → 1 输入；不使用 debug class 或测试桥。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { dataMode } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.env.XT_DATA ??= 'snapshot';
const tianjianSkills = ['sword_qi_slash', 'whirl_sword', 'light_body', 'tianjian_heart', 'sword_mastery'];

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try {
      return { api: await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate), module: candidate };
    } catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function browserPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) try { await fs.access(candidate); return candidate; } catch { /* 下一条路径 */ }
  throw new Error('未找到 Chromium；请设置 CHROMIUM_EXECUTABLE_PATH');
}
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
  return errors;
}
async function press(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
  await page.waitForTimeout(60);
}
async function ready(page) {
  await page.waitForFunction(() => {
    const scene = window.__scene;
    return scene?.map?.id === 'qingyun_village' && scene.player?.active && scene.dialog && scene.skillWindow
      && scene.quests && scene.combat && scene.game.loop.frame > 3;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(250);
}
async function sample(page) {
  return page.evaluate(() => {
    const scene = window.__scene, prog = scene.prog;
    return { level: prog.level, job: prog.job, questRewardVersion: prog.questRewardVersion,
      breakthrough: prog.quests.q_breakthrough?.state ?? null, joined: prog.quests.q_sect_tianjian?.state ?? null,
      skills: { ...prog.skills }, gifted: { ...prog.skillGifted }, swordQiSlash: prog.skillLevel('sword_qi_slash'),
      sp: prog.spLeftFor(1), hotbar: [...prog.hotbar], attempts: [...window.__skillLearningSmoke.attempts] };
  });
}

let server, browser, errors = [];
try {
  const { api, module } = await loadPlaywright();
  const executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(projectRoot, 'dist/index.html'));
    server = await preview({ root: projectRoot,
      preview: { host: '127.0.0.1', port: Number(process.env.SMOKE_PORT ?? 4208), strictPort: true }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  const url = new URL(baseURL);
  assert.equal(url.searchParams.has('debug'), false, '技能学习回归必须使用正常职业/存档入口');
  assert.equal(url.searchParams.has('reset'), false, '技能学习回归不能在刷新时清掉夹具存档');
  assert.equal(url.searchParams.has('map'), false, '技能学习回归必须使用正常出生地图');
  browser = await api.chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  errors = collectErrors(page);
  console.log(JSON.stringify({ baseURL, data: dataMode(projectRoot), playwright: module, browser: executablePath, headless: true }));
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  await ready(page);
  const rewardVersion = await page.evaluate(() => {
    const Progress = window.__scene.prog.constructor, prog = new Progress();
    // 从当前运行时取新档奖励版本，避免夹具被当成已交妖狐的旧天剑档。
    prog.level = 10;
    prog.hp = prog.maxHp; prog.mp = prog.maxMp;
    prog.quests.q_breakthrough = { state: 'done', kills: {} };
    prog.skills = { spirit_bolt: 1 }; prog.skillGifted = { spirit_bolt: 1 };
    prog.hotbar[0] = 'spirit_bolt'; prog.spTipShown = true;
    if (!prog.save()) throw new Error('技能学习回归夹具未保存');
    return prog.questRewardVersion;
  });
  assert.ok(Number.isInteger(rewardVersion) && rewardVersion > 0, '夹具须使用当前新档奖励版本');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await ready(page);
  await page.evaluate(() => {
    const scene = window.__scene;
    scene.dialog.close(); scene.skillWindow.close();
    const record = { attempts: [] };
    window.__skillLearningSmoke = record;
    const original = scene.tryAddPoint.bind(scene);
    scene.tryAddPoint = id => { record.attempts.push(id); return original(id); };
  });
  const before = await sample(page);
  assert.equal(before.level, 10, '夹具须为 Lv10');
  assert.equal(before.breakthrough, 'done', '夹具须已交突破任务');
  assert.equal(before.job, '', '新档读回后须仍未入宗');
  assert.equal(before.joined, null, '夹具不能完成正式拜入天剑任务');
  assert.equal(before.questRewardVersion, rewardVersion, '读档须保留当前奖励版本');
  assert.deepEqual(before.skills, { spirit_bolt: 1 }, '夹具只学会灵气弹 Lv1');
  assert.equal(before.swordQiSlash, 0, '打开窗口前剑气斩须未学');
  assert.equal(before.sp, 3, 'Lv10 未入宗须有 SP=3');

  await press(page, 'k');
  await page.waitForFunction(() => window.__scene.skillWindow.open && window.__scene.skillWindow.objs.length > 0,
    null, { timeout: 3000 });
  const locks = await page.evaluate(() => {
    const scene = window.__scene;
    const buttons = scene.skillWindow.objs.filter(obj => obj.type === 'Text' && obj.text === '锁定');
    return { skills: scene.prog.classSkills.map(def => def.id),
      buttons: buttons.map(button => {
        const bounds = button.getBounds();
        return { interactive: !!button.input?.enabled, x: bounds.centerX, y: bounds.centerY };
      }) };
  });
  assert.deepEqual(locks.skills, tianjianSkills, '未入宗窗口须保留天剑五功法预览');
  assert.equal(locks.buttons.length, tianjianSkills.length, '五个天剑功法须全部显示锁定');
  assert.ok(locks.buttons.every(button => !button.interactive), '锁定加点按钮须禁用鼠标交互');

  const unchanged = async trigger => {
    const after = await sample(page);
    assert.equal(after.swordQiSlash, 0, `${trigger}: 剑气斩仍须未学`);
    assert.equal(after.sp, before.sp, `${trigger}: SP 不得消耗`);
    assert.deepEqual(after.skills, before.skills, `${trigger}: 不得学会或升级宗门技能`);
    assert.deepEqual(after.gifted, before.gifted, `${trigger}: 赠技记录不得改变`);
    assert.deepEqual(after.hotbar, before.hotbar, `${trigger}: 不得自动绑定 S 或改写快捷栏`);
    assert.deepEqual(after.attempts, [], `${trigger}: 锁定技能不能调用 tryAddPoint 学习入口`);
  };
  // 先单独断言候选回归报告中的 K → 1，然后扩展覆盖剩余数字和按钮。
  await press(page, '1');
  await unchanged('K → 1');
  for (const key of ['2', '3', '4', '5']) { await press(page, key); await unchanged(`K → ${key}`); }
  const canvas = await page.locator('canvas').boundingBox();
  assert.ok(canvas, '游戏画布不可见');
  for (let index = 0; index < locks.buttons.length; index++) {
    const button = locks.buttons[index];
    await page.mouse.click(canvas.x + button.x * canvas.width / 1280, canvas.y + button.y * canvas.height / 720);
    await page.waitForTimeout(80);
    await unchanged(`锁定按钮 ${tianjianSkills[index]}`);
  }
  await press(page, 'Escape');
  assert.equal(await page.evaluate(() => window.__scene.skillWindow.open), false, 'Esc 须能关闭锁定技能预览');
  await unchanged('关闭窗口');
  assert.deepEqual(errors, [], '技能学习回归浏览器出现报错');
  console.log(JSON.stringify({ passed: true, suite: 'skill-learning-lock', data: dataMode(projectRoot),
    level: before.level, job: before.job, questRewardVersion: rewardVersion,
    swordQiSlash: 0, sp: before.sp, lockedSkills: locks.skills, numericKeys: 5, mouseButtons: 5, learningAttempts: 0, errors: 0 }));
} catch (error) {
  console.error(JSON.stringify({ suite: 'skill-learning-lock', errors, failure: error.message }));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
