// 先 npm run build:test；timeout 120s node scripts/daily-smoke.mjs；XT_SMOKE_BASE_URL 可复用已有服务。
// 试炼胜利、采集材料只作为夹具；拜宗、NPC 菜单、交付、给奖和读档使用正式代码。
// QA_TIER_GATE_AWARE: fiveSectClasses sectShopLibrary shops sectDonations
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, preview } from 'vite';
import { findRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = findRoot(projectRoot);
const questRows = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
const npcRows = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8'));
const strings = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8'));
const join = questRows.find(q => q.id === 'q_sect_taixu');
const collect = questRows.find(q => q.id === 'q_daily_taixu_2');
const talk = questRows.find(q => q.id === 'q_daily_taixu_3');
const npc = npcRows.find(n => n.id === collect.giver);
const featureLoader = await createServer({ root: projectRoot,
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
let expectedEntrance, legacySkills, expectedServices;
try {
  const { QUESTS, inPhase } = await featureLoader.ssrLoadModule('/src/data.ts');
  const { classDef, classEntryEnabled, skillsForClass } = await featureLoader.ssrLoadModule('/src/classes.ts');
  const { featureFlags } = await featureLoader.ssrLoadModule('/src/features.ts');
  const features = featureFlags();
  expectedServices = { shop: features.shops && features.sectShopLibrary, donation: features.sectDonations };
  const cls = classDef('taixu_acolyte'), tree = skillsForClass(cls.id);
  expectedEntrance = !!QUESTS[join.id] && inPhase(join) && classEntryEnabled(cls);
  const active = tree.filter(skill => skill.type !== 'passive');
  legacySkills = {
    skills: Object.fromEntries(tree.map(skill => [skill.id, skill.type === 'passive' ? 1 : 2])),
    skillGifted: Object.fromEntries(active.map(skill => [skill.id, 1])),
    skillMastery: Object.fromEntries(active.map(skill => [skill.id, 99])),
    hotbar: [active[2].id, null, active[0].id, active[1].id, null, null, null, null],
  };
} finally { await featureLoader.close(); }

function collectErrors(page) {
  const errors = { console: [], page: [], request: [], http: [] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.request.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.http.push(`${response.status()} ${response.url()}`); });
  return errors;
}
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
async function press(page, key) {
  await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key);
}
async function sceneReady(page, map) {
  await page.waitForFunction(map => {
    const scene = window.__scene;
    return scene?.map?.id === map && scene.player?.active && scene.dialog && scene.quests && scene.skillWindow && scene.game.loop.frame > 3;
  }, map, { timeout: 15000 });
  await page.waitForTimeout(250);
}
async function finishDialog(page) {
  for (let index = 0; index < 20; index++) {
    if (!await page.evaluate(() => window.__scene.dialog.open)) return;
    assert.equal(await page.evaluate(() => window.__scene.dialog.choices.length), 0, '对白结束前仍处在未选菜单');
    await press(page, 'Enter');
  }
  assert.equal(await page.evaluate(() => window.__scene.dialog.open), false, '对白未正常结束');
}
async function openNpc(page, npcId) {
  const present = await page.evaluate(npcId => {
    const scene = window.__scene;
    scene.dialog.close(); scene.skillWindow.close();
    const object = scene.map.objects.find(o => o.type === 'npc' && (o.props.npc ?? o.name) === npcId);
    if (!object) return false;
    scene.player.body.reset(object.x, object.y); scene.player.body.setVelocity(0, 0);
    return scene.nearNpc() === npcId;
  }, npcId);
  assert.equal(present, true, `${npcId} 本图接引 NPC 不存在或不可交互`);
  await press(page, 'z');
  await page.waitForFunction(() => window.__scene.dialog.open, null, { timeout: 3000 });
}
async function selectDaily(page, quest) {
  const choices = await page.evaluate(() => window.__scene.dialog.choices.map(choice => ({ label: choice.label, disabled: !!choice.disabled })));
  const index = choices.findIndex(choice => choice.label === strings[quest.nameKey]);
  assert.ok(index >= 0 && index < 5, `${quest.id} 不在数字可选菜单`);
  assert.equal(choices[index].disabled, false, `${quest.id} 菜单被禁用`);
  await press(page, String(index + 1));
  await page.waitForFunction(() => window.__scene.dialog.open && window.__scene.dialog.choices.length === 0,
    null, { timeout: 3000 });
}
async function acceptDaily(page, quest) {
  await openNpc(page, quest.giver); await selectDaily(page, quest);
  const line = await page.evaluate(() => window.__scene.dialog.lines[0]?.text);
  assert.equal(line, strings[quest.dialogueKeys.offer], `${quest.id} 接取文案不是 strings_zh`);
  await finishDialog(page);
  assert.equal(await page.evaluate(id => window.__scene.quests.state(id), quest.id), 'active', `${quest.id} 对话回调没有接取`);
}
async function deliverDaily(page, quest) {
  await openNpc(page, quest.turnIn); await selectDaily(page, quest);
  const line = await page.evaluate(() => window.__scene.dialog.lines[0]?.text);
  assert.equal(line, strings[quest.dialogueKeys.complete], `${quest.id} 交付文案不是 strings_zh`);
  await finishDialog(page);
  assert.equal(await page.evaluate(id => window.__scene.quests.state(id), quest.id), 'done', `${quest.id} 交付回调没有完成`);
}

let server, browser;
let errors;
try {
  const { api, module } = await loadPlaywright();
  const executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(projectRoot, 'dist/index.html'));
    server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: Number(process.env.SMOKE_PORT ?? 4202), strictPort: true }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await api.chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage(); errors = collectErrors(page);
  await page.addInitScript(() => {
    const initial = new Date(2026, 9, 10, 4, 59, 30).getTime();
    window.__dailyNow = Number(sessionStorage.getItem('daily-smoke-now') ?? initial);
    Date.now = () => window.__dailyNow;
    if (!sessionStorage.getItem('daily-smoke-created')) {
      localStorage.setItem('xiantu_save_v1', JSON.stringify({ name: '日常冒烟修士', level: 29, exp: 0, hp: 0, mp: 0,
        job: '', questRewardVersion: 1, inventory: {}, quests: { q_fox: { state: 'done', kills: {} } }, ageUpdatedAt: initial }));
      sessionStorage.setItem('daily-smoke-created', '1');
    }
  });
  const url = new URL(baseURL); url.searchParams.set('map', 'luoxia_town');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  await sceneReady(page, 'luoxia_town');
  console.log(JSON.stringify({ baseURL, playwright: module, browser: executablePath, headless: true }));

  // 新拜入按发布关口检查；关闭入口时用正式导入的旧太虚身份继续检查日常。
  const joined = await page.evaluate(({ join, collect, expectedEntrance, legacySkills }) => {
    const scene = window.__scene, p = scene.prog;
    scene.dialog.close(); scene.skillWindow.close();
    const before = { job: p.job, available: scene.quests.available(collect.id), menu: scene.quests.npcDailyQuestIds(collect.giver) };
    scene.quests.talk(join.giver, join.id).after?.();
    const active = scene.quests.state(join.id), early = scene.quests.complete(join.id);
    scene.quests.onTrialComplete(join.objectives.find(o => o.type === 'trial').trial);
    const reward = scene.quests.talk(join.turnIn, join.id).after?.();
    if (reward) scene.giveRewards(reward.quest, reward.broke, reward.daily);
    const entrance = { active: active ?? null, early, completed: p.quests[join.id]?.state ?? null,
      available: scene.quests.available(join.id), duplicate: scene.quests.turnIn(join.id) ?? null,
      menuContains: scene.quests.npcQuestIds(join.giver).includes(join.id), job: p.job, rewarded: !!reward };
    let legacy = null;
    if (!expectedEntrance) {
      const old = { ...p.exportSave(), ...legacySkills, job: 'taixu_acolyte', classVersion: 2,
        classRewardClaims: ['taixu_acolyte'] };
      delete old.questRewardVersion; delete old.sectRank;
      legacy = { imported: p.importSave(old), skills: p.skills, skillGifted: p.skillGifted,
        skillMastery: p.skillMastery, hotbar: p.hotbar,
        usable: p.classSkills.every(skill => p.ownsSkill(skill) && p.skillLevel(skill.id) > 0) };
    }
    return { before, entrance, legacy, job: p.job, sect: p.sect,
      available: scene.quests.available(collect.id), contribution: p.sectContribution };
  }, { join, collect, expectedEntrance, legacySkills });
  assert.equal(joined.before.job, '', '夹具读档时已提前入宗');
  assert.equal(joined.before.available, false, '未入宗可以领日常');
  assert.deepEqual(joined.before.menu, [], '未入宗出现日常菜单');
  if (expectedEntrance) {
    assert.equal(joined.entrance.active, 'active', '真实拜入任务未接取');
    assert.equal(joined.entrance.early, false, '入门试炼未胜利就可交付');
    assert.equal(joined.entrance.completed, 'done', '胜利回调后拜入任务未交付');
    assert.equal(joined.entrance.rewarded, true, '正式拜入没有发奖回执');
  } else {
    assert.deepEqual(joined.entrance, { active: null, early: false, completed: null, available: false,
      duplicate: null, menuContains: false, job: '', rewarded: false }, '关闭或未来阶段的新拜入入口被绕过');
    assert.equal(joined.legacy.imported, true, '旧太虚存档导入失败');
    for (const field of ['skills', 'skillGifted', 'skillMastery', 'hotbar']) {
      assert.deepEqual(joined.legacy[field], legacySkills[field], `旧太虚存档 ${field} 未保留`);
    }
    assert.equal(joined.legacy.usable, true, '关闭新入口后旧太虚功法不可用');
  }
  assert.equal(joined.job, 'taixu_acolyte', '日常夹具未保留太虚职业');
  assert.equal(joined.sect, 'taixu', '日常夹具未保留太虚宗门');
  assert.equal(joined.available, true, '入宗后本宗日常未开放');
  assert.equal(joined.contribution, 0, '普通拜入任务错误发日常贡献');
  await page.evaluate(() => window.__scene.scene.restart({ map: 'luoxia_town' }));
  await sceneReady(page, 'luoxia_town');

  const mounted = await page.evaluate(({ giver, sect }) => {
    const scene = window.__scene;
    const object = scene.map.objects.find(o => o.type === 'npc' && o.props.npc === giver);
    const mark = scene.npcMarks.find(entry => entry.id === giver);
    const original = scene.giveRewards.bind(scene);
    window.__dailyRewards = [];
    scene.giveRewards = (q, broke, daily) => {
      const before = { exp: scene.prog.exp, stones: scene.prog.stones, contribution: scene.prog.sectContribution };
      original(q, broke, daily);
      if (q.daily) window.__dailyRewards.push({ id: q.id, contribution: daily?.contribution,
        before, after: { exp: scene.prog.exp, stones: scene.prog.stones, contribution: scene.prog.sectContribution } });
    };
    return { present: !!object, mark: scene.quests.mark(giver), visible: !!mark && (mark.img?.visible || !!mark.text.text),
      daily: scene.quests.npcDailyQuestIds(giver), sect: scene.prog.sect,
      foreign: scene.map.objects.filter(o => o.type === 'npc' && /^(lingfu|youying|wanshou)_envoy$/.test(o.props.npc ?? '')).map(o => o.props.npc) };
  }, { giver: collect.giver, sect: collect.sect });
  assert.equal(mounted.present, true, `${npc.name} 没有挂到可交互地图`);
  assert.equal(mounted.mark, '!', '本宗接引人没有普通可接标记');
  assert.equal(mounted.visible, true, 'NPC 头顶任务标记不可见');
  assert.equal(mounted.daily.length, 3, '本宗菜单不是三条全量日常');
  assert.deepEqual(mounted.foreign, [], '夹具地图补了外宗接引人');

  // 真实菜单选择第二条，采集夹具放入背包；交付必须消费材料并结算贡献。
  const before = await page.evaluate(() => ({ stones: window.__scene.prog.stones, contribution: window.__scene.prog.sectContribution }));
  await acceptDaily(page, collect);
  await page.evaluate(quest => {
    const scene = window.__scene, objective = quest.objectives.find(o => o.type === 'collect');
    scene.prog.addItem(objective.target, objective.count);
  }, collect);
  assert.equal(await page.evaluate(id => window.__scene.quests.complete(id), collect.id), true, '收集夹具没有满足目标');
  assert.equal(await page.evaluate(id => window.__scene.quests.mark(id), collect.turnIn), '?', '材料齐备后没有可交付标记');
  await deliverDaily(page, collect);
  const after = await page.evaluate(({ quest, giver }) => {
    const scene = window.__scene, p = scene.prog;
    scene.talkTo(giver);
    const choice = scene.dialog.choices.find(choice => choice.label === quest.name);
    const result = { contribution: p.sectContribution, stones: p.stones, material: p.count(quest.objectives[0].target),
      duplicate: scene.quests.turnIn(quest.id) ?? null, legacyClaim: p.onSectDailyQuestCompleted(quest.id),
      claimCount: p.sectDailyContributionClaims.filter(id => id === quest.id).length,
      doneDisabled: choice?.disabled, rewards: window.__dailyRewards, resetDay: p.dailyQuestResetDay };
    scene.dialog.close(); return result;
  }, { quest: collect, giver: collect.giver });
  assert.equal(after.contribution - before.contribution, collect.rewards.sectContribution, '交付后贡献增量错误');
  assert.equal(after.stones - before.stones, collect.rewards.spiritStone, '灵石奖励增量错误');
  assert.equal(after.material, 0, '交付没有消费所需材料');
  assert.equal(after.duplicate, null, '重复交付再次发奖');
  assert.equal(after.legacyClaim, 0, '旧贡献回调重复发奖');
  assert.equal(after.claimCount, 1, '同条任务重复记录领取收据');
  assert.equal(after.doneDisabled, true, '同日已完成菜单未禁用');
  assert.equal(after.rewards.length, 1, '场景给奖展示次数错误');
  assert.deepEqual(after.rewards[0].after, after.rewards[0].before, '场景展示日常回执时重复发普通奖励或贡献');

  // 同一接引人仍可以选择第三条；走真实目标 NPC 对话，回宗交付。
  await acceptDaily(page, talk);
  await openNpc(page, talk.objectives.find(o => o.type === 'talk').target);
  await finishDialog(page);
  assert.equal(await page.evaluate(id => window.__scene.quests.complete(id), talk.id), true, '真实目标 NPC 对话没有满足目标');
  await deliverDaily(page, talk);
  const contributionAfterTwo = await page.evaluate(() => window.__scene.prog.sectContribution);
  assert.equal(contributionAfterTwo, collect.rewards.sectContribution + talk.rewards.sectContribution, '两条日常累计贡献错误');

  // 同日读档仍不可接，模拟恰跨本地 05:00 再读档补算，旧任务重新开放。
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }); await sceneReady(page, 'luoxia_town');
  assert.equal(await page.evaluate(id => window.__scene.quests.available(id), collect.id), false, '同日读档可重复接取');
  await page.evaluate(() => sessionStorage.setItem('daily-smoke-now', String(new Date(2026, 9, 10, 5).getTime())));
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }); await sceneReady(page, 'luoxia_town');
  const reset = await page.evaluate(({ id, oldDay }) => ({ available: window.__scene.quests.available(id),
    state: window.__scene.quests.state(id) ?? null, day: window.__scene.prog.dailyQuestResetDay,
    changed: window.__scene.prog.dailyQuestResetDay !== oldDay, contribution: window.__scene.prog.sectContribution,
    completions: window.__scene.prog.dailyQuestCompletions,
    savedDay: JSON.parse(localStorage.getItem('xiantu_save_v1')).dailyQuestResetDay }), { id: collect.id, oldDay: after.resetDay });
  assert.equal(reset.available, true, '跨 05:00 读档后不能再接');
  assert.equal(reset.state, null, '跨 05:00 已完成状态没有清除');
  assert.equal(reset.changed, true, '跨 05:00 未记录新日期');
  assert.equal(reset.day, reset.savedDay, '跨日补算日期没有保存');
  assert.equal(reset.contribution, contributionAfterTwo, '跨日贡献余额未保留');
  assert.deepEqual(reset.completions, {}, '跨日未清每日完成额度');
  await acceptDaily(page, collect);

  // 另检天剑山门补点位：未入宗有 NPC 无日常标记，入宗后真实 NPC 可开菜单。
  await page.evaluate(() => {
    const scene = window.__scene, P = scene.prog.constructor, fixture = new P();
    fixture.level = 29;
    scene.registry.set('progress', fixture);
    scene.scene.restart({ map: 'tianjian_sect' });
  });
  await sceneReady(page, 'tianjian_sect');
  const tianjian = await page.evaluate(() => {
    const scene = window.__scene, giver = 'tianjian_envoy_sect';
    const object = scene.map.objects.find(o => o.type === 'npc' && o.props.npc === giver);
    const unjoined = scene.quests.mark(giver);
    scene.prog.advanceClass('tianjian_disciple');
    return { present: !!object, count: scene.map.objects.filter(o => o.type === 'npc' && o.props.npc === giver).length,
      unjoined, mark: scene.quests.mark(giver), daily: scene.quests.npcDailyQuestIds(giver).length };
  });
  assert.equal(tianjian.present, true, '天剑山门缺真实日常接引 NPC');
  assert.equal(tianjian.count, 1, '天剑山门接引 NPC 重复挂载');
  assert.equal(tianjian.unjoined, null, '天剑山门未入宗有日常标记');
  assert.equal(tianjian.mark, '!', '天剑山门入宗后无日常标记');
  assert.equal(tianjian.daily, 3, '天剑山门日常没有完整三条');
  await openNpc(page, 'tianjian_envoy_sect');
  const serviceChoices = [];
  for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
    const choices = await page.evaluate(() => window.__scene.dialog.choices.map(choice => ({ label: choice.label, disabled: !!choice.disabled })));
    serviceChoices.push(...choices.filter(choice => !/^[‹›]/.test(choice.label)));
    const next = choices.findIndex(choice => choice.label.startsWith('›'));
    if (next < 0) break;
    await press(page, String(next + 1));
  }
  assert.equal(serviceChoices.filter(choice => !choice.disabled).length,
    4 + Number(expectedServices.shop) + Number(expectedServices.donation), '天剑接引日常与服务菜单不遵循发版开关');
  assert.equal(serviceChoices.some(choice => choice.label === strings['sect.shop.menu']), expectedServices.shop, '宗门商店菜单不遵循发版开关');
  assert.equal(serviceChoices.some(choice => choice.label === strings['sect.donation.menu']), expectedServices.donation, '上交菜单不遵循发版开关');
  await press(page, 'Escape');
  await page.waitForTimeout(300);
  assert.deepEqual(errors, { console: [], page: [], request: [], http: [] }, '浏览器冒烟出现报错');
  console.log(JSON.stringify({ passed: true, sect: joined.sect, joinedByTrialCallback: expectedEntrance,
    closedEntranceBlocked: !expectedEntrance, legacySaveImported: !expectedEntrance, npc: npc.id,
    completed: [collect.id, talk.id], contribution: contributionAfterTwo, reloadSameDayBlocked: true,
    crossedLocalFive: true, reaccepted: collect.id, tianjianEnvoyMounted: true,
    consoleErrors: 0, pageErrors: 0, requestFailures: 0, httpErrors: 0 }));
} catch (error) {
  console.error(JSON.stringify({ failure: error.message, errors })); throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
