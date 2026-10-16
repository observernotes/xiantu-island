// 默认先 npm run build，独立 preview 正式 dist；仅显式 XT_CHEAT_TEST_BRIDGE=1 时验收测试构建。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from './isolated-build.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const testBridge = process.env.XT_CHEAT_TEST_BRIDGE === '1';
const port = Number(process.env.XT_TEST_PORT ?? 0);
assert.ok(Number.isInteger(port) && port >= 0 && port < 65536, 'XT_TEST_PORT 必须是有效端口');
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try { return await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate); }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function browserPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) try { await fs.access(candidate); return candidate; } catch { /* 下一条路径 */ }
  throw new Error('未找到 Chromium；请设置 CHROMIUM_EXECUTABLE_PATH');
}

let server, browser;
const pageErrors = [], consoleErrors = [];
try {
  await fs.access(path.join(root, 'dist/index.html'));
  const files = await fs.readdir(path.join(root, 'dist/assets'));
  check(files.some(file => /^Cheat(?:Panel)?-[^/]+\.js$/i.test(file)),
    'dist 必须含独立动态 Cheat chunk；请先运行 npm run build');
  if (!testBridge) equal(files.filter(file => /^XtTestBridge-[^/]+\.js$/i.test(file)), [],
    '正式 dist 不应包含测试桥 chunk；请先运行 npm run build，测试桥验收须显式设置 XT_CHEAT_TEST_BRIDGE=1');
  const playwright = await loadPlaywright();
  // 与 cheat-gate 一样清空子进程 NODE_OPTIONS，避免 tier1 loader 重定向到共享 dist-test。
  server = await preview({ root, preview: { port } });
  browser = await playwright.chromium.launch({ executablePath: await browserPath(playwright.chromium), headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const requests = [];
  page.on('request', request => { if (request.resourceType() === 'script') requests.push(request.url()); });
  const url = new URL(server.resolvedUrls.local[0]);
  async function visit(search) {
    url.search = search;
    await page.goto(url.href, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => window.__scene?.player?.active && window.__scene?.quests);
  }
  async function readState() {
    return page.evaluate(() => {
      const s = window.__scene, p = s.prog;
      return { map: s.map.id, level: p.level, realm: p.realm.id, exp: p.exp, expNeed: p.expNeed,
        stones: p.stones, contrib: p.sectContribution, hp: s.player.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp,
        inventory: { ...p.inventory }, skills: { ...p.skills }, quests: structuredClone(p.quests),
        saved: JSON.parse(localStorage.getItem('xiantu_save_v1')) };
    });
  }

  await visit('?map=qingyun_village&god=1&stone=987654&level=30&unlock=skills,outfits');
  equal(await page.evaluate(() => typeof window.__cheat), 'undefined', '关闭 URL 不挂载 API');
  equal(await page.locator('#xt-cheat-panel').count(), 0, '关闭 URL 不生成面板');
  equal(requests.filter(value => /\/(?:Cheat|CheatPanel)-[^/]+\.js(?:\?|$)/i.test(value)), [], '关闭 URL 不请求作弊模块');
  const disabled = await readState();
  equal(disabled.level, 1, '关闭 URL 不处理等级');
  equal(disabled.stones, 0, '关闭 URL 不处理灵石');
  equal(disabled.inventory.robe_taixu_1, undefined, '关闭 URL 不解锁道袍');
  equal(await page.evaluate(() => typeof window.__xt), testBridge ? 'object' : 'undefined',
    testBridge ? '测试构建保留测试桥' : '正式构建不出现测试桥');
  const normalHurt = await page.evaluate(() => {
    const p = window.__scene.player, before = p.hp;
    p.invulnUntil = 0; p.superArmorUntil = 0;
    const result = p.hurt(window.__scene.time.now + 10000, p.x + 10, 7);
    return { result, before, after: p.hp, state: p.state2 };
  });
  equal(normalHurt.result, true, '普通入口正常受击');
  equal(normalHurt.after, normalHurt.before - 7, '普通入口正常扣血');
  equal(normalHurt.state, 'hurt', '普通入口正常进入受击');
  await visit('?map=qingyun_village&cheat=false&god=1');
  equal(await page.evaluate(() => typeof window.__cheat), 'undefined', 'cheat=false 不挂载 API');
  equal(requests.filter(value => /\/(?:Cheat|CheatPanel)-[^/]+\.js(?:\?|$)/i.test(value)), [], 'cheat=false 不请求作弊模块');

  const params = new URLSearchParams({ cheat: 'true', god: '1', map: 'qingyun_village', debug: '1',
    __xt: '1', stone: '1234', contrib: '56', realm: '筑基', exp: '满', unlock: 'skills,outfits' });
  params.append('spawn', 'mon:spirit_rabbit');
  params.append('spawn', 'item:fox_tailx3');
  await visit(`?${params}`);
  await page.waitForFunction(() => window.__cheat?.enabled && document.querySelector('#xt-cheat-panel'));
  const enabled = await readState();
  equal(enabled.map, 'qingyun_village', '与既有 map 参数叠加');
  equal(enabled.realm, 'foundation', '中文简称定位筑基境界');
  equal(enabled.level, 30, '境界取合理起始等级');
  equal(enabled.exp, enabled.expNeed, '启动即满修');
  equal(enabled.hp, enabled.maxHp, '升境满血');
  equal(enabled.mp, enabled.maxMp, '升境满蓝');
  equal(enabled.stones, 1234, '启动设置灵石');
  equal(enabled.contrib, 56, '启动设置贡献');
  equal(enabled.saved.stones, 1234, '灵石进入当前存档');
  equal(enabled.saved.sectContribution, 56, '贡献进入当前存档');
  equal(enabled.saved.inventory.fox_tail, 3, '启动刷物数量进入存档');
  for (const sect of ['tianjian', 'taixu', 'lingfu', 'youying', 'wanshou']) {
    check(enabled.saved.inventory[`robe_${sect}_1`] >= 1, `${sect} 道袍进入存档`);
  }
  check(Object.keys(enabled.skills).length > 5, '启动解锁技能写入可用等级');
  check(await page.evaluate(() => window.__scene.mobs.some(mob => mob.def.id === 'spirit_rabbit' && mob.noRespawn)),
    '启动生成不重生怪物');

  const god = await page.evaluate(() => {
    const p = window.__scene.player;
    const before = { hp: p.hp, state: p.state2, until: p.hurtUntil, invuln: p.invulnUntil,
      vx: p.body.velocity.x, vy: p.body.velocity.y };
    const result = p.hurt(window.__scene.time.now + 10000, p.x + 10, 99999);
    return { before, after: { hp: p.hp, state: p.state2, until: p.hurtUntil, invuln: p.invulnUntil,
      vx: p.body.velocity.x, vy: p.body.velocity.y }, result, god: window.__cheat.god };
  });
  equal(god.god, true, '启动立即开启 god');
  equal(god.result, false, 'god hurt 直接返回 false');
  equal(god.after, god.before, 'god 不掉血、不进入受击、不改速度与无敌计时');

  const quest = await page.evaluate(() => {
    const api = window.__cheat, s = window.__scene;
    const accepted = api.acceptQuest('q_bamboo');
    const active = s.prog.quests.q_bamboo?.state;
    const completed = api.completeQuest('q_bamboo');
    const state = s.prog.quests.q_bamboo?.state;
    const stones = s.prog.stones;
    const duplicate = api.completeQuest('q_bamboo');
    return { accepted, active, completed, state, duplicate, stones, afterStones: s.prog.stones,
      savedState: JSON.parse(localStorage.getItem('xiantu_save_v1')).quests.q_bamboo?.state };
  });
  equal(quest.accepted, true, '允许强制接取未满足前置的任务');
  equal(quest.active, 'active', '接任务进入 active');
  equal(quest.completed, true, '完成任务走目标推进及交付');
  equal(quest.state, 'done', '交付进入 done');
  equal(quest.savedState, 'done', '任务完成写存档');
  equal(quest.duplicate, false, '已完成任务跳过');
  equal(quest.afterStones, quest.stones, '已完成任务不重复发奖励');
  const skipped = await page.evaluate(() => {
    const api = window.__cheat, p = window.__scene.prog;
    api.acceptQuest('q_awaken'); api.acceptQuest('q_snake'); api.acceptQuest('q_sect_tianjian'); api.acceptQuest('q_daily_taixu_2');
    const ok = api.skipQuests();
    const saved = JSON.parse(localStorage.getItem('xiantu_save_v1'));
    return { ok, awaken: p.quests.q_awaken?.state, snake: p.quests.q_snake?.state,
      tianjian: p.quests.q_sect_tianjian?.state,
      daily: p.quests.q_daily_taixu_2?.state,
      choices: { ...p.relationshipState.questChoices }, savedChoices: saved.relationshipState.questChoices,
      saved: saved.quests };
  });
  equal(skipped.ok, true, '强制完成全部当前非日常任务');
  equal([skipped.awaken, skipped.snake], ['done', 'done'], '批量完成 reach 和 collect 任务');
  equal(skipped.tianjian, 'done', '批量完成带交付选择的宗门任务');
  equal([skipped.choices.q_awaken, skipped.choices.q_sect_tianjian], ['return', 'protect'], '开启的交付 hook 默认使用首项选择');
  equal(skipped.savedChoices, skipped.choices, '默认交付选择写入存档');
  equal(skipped.daily, 'active', '跳任务保留日常任务');
  equal(skipped.saved.q_snake.state, 'done', '批量任务写存档');

  const invalid = await page.evaluate(() => {
    const api = window.__cheat, before = localStorage.getItem('xiantu_save_v1');
    const results = [api.spawnItem('missing_item'), api.spawnMon('missing_monster'), api.acceptQuest('missing_quest'),
      api.completeQuest('missing_quest'), api.setStones(-1), api.setContrib(NaN), api.setLevel(0), api.setRealm('missing_realm')];
    return { results, sameSave: localStorage.getItem('xiantu_save_v1') === before };
  });
  equal(invalid.results, Array(8).fill(false), '非法 id/数值被拒绝且不崩溃');
  equal(invalid.sameSave, true, '非法操作不污染存档');
  equal(await page.evaluate(() => window.__cheat.teleport('field_test')), true, '允许传送测试地图');
  await page.waitForFunction(() => window.__scene?.map?.id === 'field_test' && window.__scene.player?.active);
  equal(await page.evaluate(() => window.__cheat.god), true, '切图保持 god');
  equal(await page.locator('#xt-cheat-panel').count(), 1, '切图保留单个面板');
  const teleported = await readState();
  equal(teleported.inventory.fox_tail, 3, '切图不重复执行 URL 刷物');
  equal(teleported.saved.position.mapId, 'field_test', '传送保存当前地图');
  if (testBridge) {
    const bridge = await page.evaluate(() => {
      window.__xt.giveItem('rabbit_fur', 2);
      return { map: window.__xt.getState().mapId, count: window.__scene.prog.count('rabbit_fur'),
        enabled: window.__cheat.enabled, events: window.__xt.events.drain().map(event => event.type) };
    });
    equal(bridge.map, 'field_test', '作弊切图后测试桥仍访问当前场景');
    check(bridge.count >= 2 && bridge.enabled, '测试桥和作弊 API 同时可操作存档');
    check(bridge.events.includes('scene'), '测试桥保留场景事件');
    check(!bridge.events.includes('error') && !bridge.events.includes('unhandledrejection'), '测试桥未捕获运行异常');
  }
  await page.evaluate(() => window.__cheat.spawnItem('fox_tail', 2));
  equal((await readState()).saved.inventory.fox_tail, 5, '切图后 API 绑定当前场景并存档');

  const panel = page.locator('#xt-cheat-panel');
  const wasOpen = await panel.getAttribute('data-open');
  await page.keyboard.press('F2');
  equal(await panel.getAttribute('data-open'), wasOpen === 'true' ? 'false' : 'true', 'F2 切换面板');
  await page.keyboard.press('Backquote');
  equal(await panel.getAttribute('data-open'), wasOpen, '反引号切回面板');
  if (await panel.getAttribute('data-open') !== 'true') await page.keyboard.press('F2');
  if (process.env.XT_CHEAT_SCREENSHOT) await page.screenshot({ path: path.resolve(process.env.XT_CHEAT_SCREENSHOT) });
  await panel.getByRole('button', { name: /无敌/ }).click();
  equal(await page.evaluate(() => window.__cheat.god), false, '面板按钮切换无敌');
  await panel.getByLabel('资源数量', { exact: true }).fill('4321');
  await panel.getByRole('button', { name: '灵石', exact: true }).click();
  equal((await readState()).saved.stones, 4321, '面板灵石按钮写存档');
  await panel.getByRole('button', { name: '贡献', exact: true }).click();
  equal((await readState()).saved.sectContribution, 4321, '面板贡献按钮写存档');
  const questInput = panel.getByLabel('任务 id', { exact: true });
  await questInput.fill('');
  await questInput.pressSequentially('q_snake');
  equal(await questInput.inputValue(), 'q_snake', '面板输入框可输入游戏热键字母');
  equal(await page.evaluate(() => Object.entries(window.__scene.keys).filter(([, key]) => key.isDown).map(([id]) => id)), [],
    '面板输入不把按键传给角色');
  await page.evaluate(() => {
    const p = window.__scene.player;
    p.invulnUntil = 0; p.superArmorUntil = 0;
    window.__cheat.setGod(true);
  });
  await page.evaluate(() => localStorage.clear());
  await visit('?cheat=1&god=1&map=field&quest=accept:q_snake&quest=accept:q_bamboo&quest=skip&spawn=item:fox_tail');
  await page.waitForFunction(() => window.__cheat?.enabled);
  const urlSkip = await readState();
  equal(urlSkip.map, 'field_test', 'URL 沿用 dev 的 field 入口且不与场景启动冲突');
  equal([urlSkip.quests.q_snake?.state, urlSkip.quests.q_bamboo?.state], ['done', 'done'], 'URL 重复接取和 skip 顺序执行');
  equal(urlSkip.saved.inventory.fox_tail, 1, 'URL 刷物省略数量默认 1');
  const breakthrough = await page.evaluate(() => {
    const api = window.__cheat, p = window.__scene.prog;
    api.setLevel(30); api.fillExp();
    const ok = api.completeQuest('q_breakthrough');
    return { ok, level: p.level, realm: p.realm.id, state: p.quests.q_breakthrough?.state };
  });
  equal(breakthrough.ok, true, '高境界仍可交付旧突破任务');
  equal(breakthrough.state, 'done', '旧突破任务完成');
  equal(breakthrough.realm, 'foundation', '旧任务不能突破当前筑基境界');
  check(breakthrough.level >= 30 && breakthrough.level < 59, '旧任务只发经验奖励，不跳当前境界关口');
  const crossSect = await page.evaluate(() => {
    const p = window.__scene.prog;
    p.job = 'tianjian_disciple'; p.equip.robe = 'robe_tianjian_1';
    const ok = window.__cheat.completeQuest('q_sect_taixu');
    const saved = JSON.parse(localStorage.getItem('xiantu_save_v1'));
    return { ok, job: p.job, robe: p.count('robe_taixu_1'), skills: { ...p.skills }, saved };
  });
  equal(crossSect.ok, true, '已有职业仍可强制完成外宗任务');
  equal(crossSect.job, 'tianjian_disciple', '强制外宗任务保留已有职业');
  check(crossSect.robe >= 1, '外宗任务道袍进入背包');
  for (const id of ['fire_talisman_bolt', 'thunder_palm', 'water_mirror']) {
    check(crossSect.skills[id] >= 1 && crossSect.saved.skills[id] >= 1, `外宗任务永久技能 ${id} 写存档`);
  }
  const temporarySkill = await page.evaluate(() => {
    const p = window.__scene.prog;
    delete p.skills.phantom_cloak; delete p.skillGifted.phantom_cloak;
    p.beginTrialSkills([{ id: 'phantom_cloak', level: 1 }]);
    const ok = window.__cheat.unlockSkills(), permanent = p.skills.phantom_cloak;
    p.endTrialSkills();
    return { ok, permanent, after: p.skillLevel('phantom_cloak'),
      saved: JSON.parse(localStorage.getItem('xiantu_save_v1')).skills.phantom_cloak };
  });
  equal(temporarySkill.ok, true, '临时试炼技能期间可解锁全部技能');
  equal(temporarySkill.permanent, 1, '临时等级不遮蔽永久技能授予');
  equal(temporarySkill.after, 1, '结束试炼仍保留永久技能');
  equal(temporarySkill.saved, 1, '临时技能期间赠予的永久等级写存档');
  const sharedDamage = await page.evaluate(() => {
    const s = window.__scene, p = s.prog;
    p.job = 'wanshou_tamer';
    p.buffs.push({ id: 'beast_bond', expireAt: Date.now() + 60000 });
    const def = p.classSkills.find(skill => skill.id === 'summon_spirit_wolf');
    s.combat.pets.summon(def, 1);
    const pet = s.combat.summons.at(-1), before = { hp: p.hp, playerHp: s.player.hp };
    const share = p.buffBonus('petDamageShareRatio');
    s.combat.receiveSummonDamage(pet, pet.defense + 10, pet.sprite.x + 10);
    return { share, before, after: { hp: p.hp, playerHp: s.player.hp } };
  });
  check(sharedDamage.share > 0, '灵兽伤害分担回归夹具有正分担比例');
  equal(sharedDamage.after, sharedDamage.before, 'god 同时阻止灵兽伤害分担扣除玩家血量');
  equal(pageErrors, [], '所有路径无浏览器未捕获异常');
  equal(consoleErrors, [], '所有路径无 console.error');
  console.log(`作弊器${testBridge ? '测试' : '正式'}构建冒烟通过：${assertions} 项断言`);
} finally {
  try { await browser?.close(); }
  finally { await server?.close(); }
}
