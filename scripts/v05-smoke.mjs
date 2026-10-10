// 先 npm run build，再 npm run test:smoke:v05（外层 timeout 120s，无头 Chromium）。
// 可用 PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE_PATH 指定本机工具，XT_SMOKE_BASE_URL 测已有服务。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { sharedRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const maps = [
  ['luoxia_town', 'luoxia'],
  ['wanyao_outer_1', 'wanyao'],
  ['wanyao_outer_2', 'wanyao'],
  ['wanyao_deep_1', 'wanyao'],
  ['wanyao_deep_2', 'wanyao'],
  ['tianjian_sect', 'tianjian'],
  ['tianjian_sword_tomb', 'tianjian'],
  ['trial_taixu_stage', 'taixu'],
  ['trial_lingfu_range', 'lingfu'],
  ['trial_youying_vault', 'youying'],
  ['trial_wanshou_pen', 'wanshou'],
];
const screenshot = path.join(sharedRoot(projectRoot), 'qa/shots/dev_luoxia_town.png');
const dataRoot = sharedRoot(projectRoot);
const strings = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8'));
const pacing = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/solo_pacing.json'), 'utf8'));
const sectSeclusion = pacing.sectSeclusion;
const realms = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/realms.json'), 'utf8'));
const questRows = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
const contributionDaily = questRows.find(quest => quest.id === 'q_daily_tianjian_3');
assert.ok(contributionDaily?.daily && contributionDaily.objectives.every(objective => objective.type === 'talk'),
  '贡献夹具须使用真实天剑宗传讯日常');
const dailyContribution = Object.hasOwn(contributionDaily.rewards, 'sectContribution')
  ? contributionDaily.rewards.sectContribution : sectSeclusion.dailyQuestContribution;
const trials = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/trials.json'), 'utf8'));
const trialByMap = Object.fromEntries(trials.filter(trial => maps.some(([map]) => map === trial.map)).map(trial => [trial.map, trial]));
const text = (key, args = {}) => strings[key].replace(/\{(\w+)\}/g, (_, name) => String(args[name] ?? ''));

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
  return errors;
}

async function waitForMap(page, mapId, pause = false) {
  await page.waitForFunction(({ id, pause }) => {
    const scene = window.__scene;
    if (scene?.map?.id !== id || !scene.player || !scene.dialog || scene.game.loop.frame <= 3) return false;
    if (pause) scene.physics.pause();
    return true;
  }, { id: mapId, pause }, { timeout: 15000 });
}

async function extraInteractions(context, baseURL) {
  const page = await context.newPage();
  const errors = collectErrors(page);
  const checks = [];
  const go = async mapId => {
    const url = new URL(baseURL);
    url.searchParams.set('map', mapId); url.searchParams.set('reset', '1');
    await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForMap(page, mapId);
  };
  const landing = async (mapId, targetPortal) => {
    await waitForMap(page, mapId, true);
    const state = await page.evaluate(portal => {
      const scene = window.__scene;
      const expected = portal ? scene.map.objects.find(o => o.type === 'portal' && o.name === portal) : scene.map.spawn;
      return { actual: { x: scene.player.x, y: scene.player.y }, expected: { x: expected.x, y: expected.y } };
    }, targetPortal ?? null);
    assert.ok(Math.abs(state.actual.x - state.expected.x) <= 2 && Math.abs(state.actual.y - state.expected.y) <= 8,
      `${mapId}: ${targetPortal ?? 'playerStart'} 落点错误 ${JSON.stringify(state)}`);
  };
  try {
    await go('qingyun_village');
    assert.equal(await page.evaluate(() => window.__scene.map.objects.some(o => o.type === 'npc' && o.props.npc === 'tianjian_elder')), false);
    checks.push('phase5: 青云村传功长老移除');

    await go('luoxia_town');
    const priority = await page.evaluate(() => {
      const scene = window.__scene, original = scene.map.objects, level = scene.prog.level;
      scene.map.objects = [{ type: 'portal', name: 'smoke_req_level', x: scene.player.x, y: scene.player.y, w: 0, h: 0,
        props: { reqLevel: level + 1, unlockQuest: 'smoke_not_done', target: 'tianjian_sect' } }];
      scene.tryInteract(); const lowLevel = scene.logs.at(-1)?.text;
      scene.prog.level = level + 1; scene.tryInteract(); const questLocked = scene.logs.at(-1)?.text;
      scene.prog.level = level; scene.map.objects = original;
      return { lowLevel, questLocked, map: scene.map.id, level };
    });
    assert.equal(priority.lowLevel, text('sys.portal_level', { lv: priority.level + 1 }));
    assert.equal(priority.questLocked, text('sys.portal_locked'));
    assert.equal(priority.map, 'luoxia_town');
    checks.push('portal: 等级先于未解锁任务');

    await page.evaluate(() => window.__scene.talkTo('ferry_master'));
    assert.deepEqual(await page.evaluate(() => window.__scene.dialog.choices.map(choice => choice.label).slice(0, 2)), ['万妖林', '天剑宗']);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => ({ open: window.__scene.dialog.open, map: window.__scene.map.id })), { open: false, map: 'luoxia_town' });
    checks.push('航线: Esc 告辞留在落霞镇');
    for (const [index, target] of [[1, 'wanyao_outer_1'], [2, 'tianjian_sect']]) {
      await go('luoxia_town');
      await page.evaluate(() => window.__scene.talkTo('ferry_master'));
      await page.keyboard.press(String(index));
      await landing(target);
      checks.push(`航线: ${target} 按数字上船，落在 playerStart`);
    }

    for (const [mapId, targetPortal] of [['wanyao_outer_1', null], ['tianjian_sect', 'portal_to_outskirts']]) {
      await go(mapId);
      await page.evaluate(portal => {
        const scene = window.__scene, ferry = scene.map.objects.find(o => o.type === 'ferry');
        // 地图目前没填 targetPortal；运行时补一个已有目标门，覆盖指定落点分支。
        if (portal) ferry.props.targetPortal = portal;
        scene.player.body.reset(ferry.x + ferry.w / 2, ferry.y);
        scene.dialog.close(); scene.tryInteract();
      }, targetPortal);
      await landing('luoxia_town', targetPortal);
      checks.push(`ferry: ${mapId} returnTo，落在 ${targetPortal ?? 'playerStart'}`);
    }

    await go('tianjian_sect');
    assert.equal(await page.evaluate(() => window.__scene.map.objects.some(o => o.type === 'npc' && o.props.npc === 'tianjian_elder')), true);
    checks.push('phase5: 山门传功长老出现');
    const contribution = await page.evaluate(quest => {
      const scene = window.__scene, p = scene.prog;
      p.level = Math.max(p.level, quest.reqLevel);
      p.advanceClass('tianjian_disciple');
      p.sectContribution = 0;
      const accepted = scene.quests.accept(quest.id);
      for (const objective of quest.objectives) scene.quests.onTalk(objective.target);
      const complete = scene.quests.complete(quest.id);
      const reward = scene.quests.turnIn(quest.id);
      if (reward) scene.giveRewards(reward.quest, reward.broke, reward.daily);
      const gained = reward?.daily?.contribution;
      const duplicate = p.onSectDailyQuestCompleted(quest.id);
      const saved = JSON.parse(localStorage.getItem('xiantu_save_v1'));
      return { accepted, complete, state: scene.quests.state(quest.id), gained, duplicate,
        balance: p.sectContribution, savedBalance: saved.sectContribution,
        savedClaims: saved.sectDailyContributionClaims };
    }, contributionDaily);
    assert.deepEqual(contribution, { accepted: true, complete: true, state: 'done', gained: dailyContribution, duplicate: 0,
      balance: dailyContribution, savedBalance: dailyContribution, savedClaims: [contributionDaily.id] });
    checks.push('contribution: 真实日常交付按表发放，旧回调同日去重并保存');
    const seclusion = await page.evaluate(({ level, contribution }) => {
      const scene = window.__scene, room = scene.map.objects.find(o => o.type === 'seclusion');
      scene.physics.pause(); scene.player.body.reset(room.x, room.y);
      scene.prog.level = 1; scene.tryInteract(); const locked = scene.dialog.lines.map(line => line.text);
      scene.dialog.close(); scene.prog.level = level; scene.prog.sectContribution = contribution;
      const before = { exp: scene.prog.exp, contribution: scene.prog.sectContribution };
      scene.tryInteract(); const cost = scene.dialog.lines.flatMap(line => line.text.split('\n'));
      scene.dialog.selectChoice(0);
      const denied = scene.dialog.lines.map(line => line.text);
      scene.dialog.close();
      return { locked, cost, denied, before, after: { exp: scene.prog.exp, contribution: scene.prog.sectContribution } };
    }, { level: realms.find(realm => realm.id === sectSeclusion.unlockRealm).levelMin, contribution: 7 });
    assert.deepEqual(seclusion.locked, [text('sys.seclusion_locked')]);
    assert.ok(seclusion.cost.some(line => line === text('sys.seclusion_cost', {
      years: sectSeclusion.options[0], cost: sectSeclusion.contributionCost[String(sectSeclusion.options[0])], have: 7,
    })), '闭关菜单未显示表内贡献费用');
    assert.deepEqual(seclusion.denied, [text('sys.seclusion_cost', {
      years: sectSeclusion.options[0], cost: sectSeclusion.contributionCost[String(sectSeclusion.options[0])], have: 7,
    })]);
    assert.deepEqual(seclusion.after, seclusion.before);
    checks.push('seclusion: 境界提示、贡献不足不结算');
    const settled = await page.evaluate(({ level, contribution }) => {
      const scene = window.__scene, room = scene.map.objects.find(o => o.type === 'seclusion'), p = scene.prog;
      scene.dialog.close(); scene.player.body.reset(room.x, room.y);
      p.level = level; p.exp = 0; p.sectContribution = contribution;
      const before = { level: p.level, exp: p.exp, age: p.age, contribution: p.sectContribution,
        history: p.seclusionHistory.length, yearsToday: p.seclusionYearsToday, expNeed: p.expNeed, realm: p.realm.id };
      scene.tryInteract(); const choices = scene.dialog.choices.map(choice => choice.label);
      scene.dialog.selectChoice(0);
      const after = { level: p.level, exp: p.exp, age: p.age, contribution: p.sectContribution,
        history: p.seclusionHistory.length, yearsToday: p.seclusionYearsToday };
      const saved = JSON.parse(localStorage.getItem('xiantu_save_v1'));
      return { before, after, choices, log: scene.logs.map(line => line.text),
        saved: { age: saved.age, contribution: saved.sectContribution, history: saved.seclusionHistory.length,
          yearsToday: saved.seclusionYearsToday } };
    }, { level: realms.find(realm => realm.id === sectSeclusion.unlockRealm).levelMin,
      contribution: sectSeclusion.contributionCost[String(sectSeclusion.options[0])] * 2 });
    const years = sectSeclusion.options[0];
    assert.ok(settled.choices.length >= sectSeclusion.options.length, '闭关年数选项丢失');
    assert.equal(settled.after.level, settled.before.level, '单年闭关测试意外跨级');
    const expectedExp = Math.round(settled.before.expNeed * pacing.seclusion.perYearRatio * sectSeclusion.density /
      pacing.densityRef * pacing.seclusion.realmMul[settled.before.realm] * sectSeclusion.roomMul);
    assert.equal(settled.after.exp - settled.before.exp, expectedExp, '闭关修为未按表结算');
    assert.equal(settled.after.contribution, settled.before.contribution - sectSeclusion.contributionCost[String(years)]);
    assert.ok(Math.abs(settled.after.age - settled.before.age - years) < 0.01, '闭关未扣除对应寿元');
    assert.equal(settled.after.yearsToday, settled.before.yearsToday + years);
    assert.equal(settled.after.history, settled.before.history + 1);
    assert.ok(settled.log.some(line => /闭关/.test(line) && /修为/.test(line)), '闭关结算日志缺失');
    assert.deepEqual(settled.saved, { age: settled.after.age, contribution: settled.after.contribution,
      history: settled.after.history, yearsToday: settled.after.yearsToday });
    await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('reset'); history.replaceState(null, '', url.href); });
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }); await waitForMap(page, 'tianjian_sect');
    const reloadedSeclusion = await page.evaluate(() => {
      const p = window.__scene.prog;
      return { age: p.age, contribution: p.sectContribution, history: p.seclusionHistory.length, yearsToday: p.seclusionYearsToday };
    });
    assert.ok(Math.abs(reloadedSeclusion.age - settled.after.age) < 0.01, '闭关寿元未保留到读档');
    assert.deepEqual({ ...reloadedSeclusion, age: settled.after.age }, { age: settled.after.age,
      contribution: settled.after.contribution, history: settled.after.history, yearsToday: settled.after.yearsToday });
    checks.push('seclusion: 真实交互选择 1 年，修为/贡献/寿元/日限结算、日志与读档');

    await go('trial_lingfu_range');
    const movement = await page.evaluate(async () => {
      const scene = window.__scene;
      const spot = scene.map.objects.find(o => o.type === 'target_spot' && Number(o.props.moveRange) > 0);
      if (!spot) throw new Error('没有移动木靶刷新点');
      const mob = scene.mobs.find(m => m.name === `target:${spot.name}`);
      if (!mob) throw new Error(`没有移动木靶 target:${spot.name}`);
      const homeX = mob.home.x, range = Number(spot.props.moveRange), samples = [], startedAt = scene.time.now;
      return new Promise((resolve, reject) => {
        let lastX = mob.x, lastSign = 0, reversals = 0;
        const wallLimit = setTimeout(() => { clearInterval(timer); reject(new Error('移动木靶 25 秒内未在两端往返')); }, 25000);
        const timer = setInterval(() => {
          const x = mob.x, dx = x - lastX, sign = Math.abs(dx) >= 0.5 ? Math.sign(dx) : 0;
          samples.push({ ms: scene.time.now - startedAt, x });
          if (sign && lastSign && sign !== lastSign) reversals++;
          if (sign) lastSign = sign;
          lastX = x;
          if (reversals >= 2) {
            clearInterval(timer); clearTimeout(wallLimit);
            resolve({ name: mob.name, homeX, range, samples, reversals });
          }
        }, 100);
      });
    });
    const xs = movement.samples.map(sample => sample.x);
    const speed = trialByMap.trial_lingfu_range.targets.moveSpeed;
    const tolerance = speed * 0.15 + 2;
    assert.ok(xs.every(x => x >= movement.homeX - movement.range - 1 && x <= movement.homeX + movement.range + 1),
      `移动木靶越出 moveRange: ${JSON.stringify(movement)}`);
    assert.ok(Math.min(...xs) <= movement.homeX - movement.range + tolerance &&
      Math.max(...xs) >= movement.homeX + movement.range - tolerance, '移动木靶未到达左右两端');
    assert.ok(movement.reversals >= 2, '移动木靶没有真实往返');
    checks.push(`target_spot: ${movement.name} 在 ±${movement.range}px 内往返 ${movement.reversals} 次`);

    await go('trial_youying_vault');
    const shadow = await page.evaluate(() => {
      const scene = window.__scene, zone = scene.map.zones.find(zone => zone.props.kind === 'shadow');
      scene.physics.pause();
      scene.player.body.reset(zone.x + zone.w / 2, zone.y + zone.h - 1);
      scene.player.body.updateFromGameObject();
      return { patrolCount: scene.stealth.patrols.length,
        maxDetectMs: Math.max(...scene.stealth.patrols.map(p => p.mob.def.vision.detectMs)) };
    });
    assert.equal(shadow.patrolCount, trialByMap.trial_youying_vault.patrols.count);
    await page.waitForFunction(() => window.__scene.player.alpha === 0.6 && window.__scene.player.tintTopLeft === 0x8A80B0,
      null, { timeout: 3000 });
    await page.waitForTimeout(shadow.maxDetectMs + 100);
    const shadowState = await page.evaluate(() => {
      const scene = window.__scene;
      return scene.stealth.patrols.map(p => ({ progress: p.progress, detected: p.detected,
        lanternHeight: p.mob.y - p.cone.y, scale: p.cone.scaleX,
        expectedScale: p.mob.def.vision.length / scene.cache.json.get(`${p.cone.texture.key}_anims`).range.length }));
    });
    for (const patrol of shadowState) {
      assert.equal(patrol.progress, 0, '站在阴影里仍累积发现进度');
      assert.equal(patrol.detected, false, '站在阴影里被发现');
      assert.equal(patrol.lanternHeight, 40, '巡逻灯笼高度错误');
      assert.ok(Math.abs(patrol.scale - patrol.expectedScale) < 0.001, '视野锥占位图未按表长度缩放');
    }
    await page.evaluate(() => {
      const scene = window.__scene;
      scene.player.body.reset(scene.map.spawn.x, scene.map.spawn.y);
      scene.player.body.updateFromGameObject();
    });
    await page.waitForFunction(() => window.__scene.player.alpha === 1 && window.__scene.player.tintTopLeft === 0xffffff,
      null, { timeout: 3000 });
    checks.push('shadow: 阴影渐变进出、免发现，灯笼 40px 与视锥缩放');

    await go('tianjian_sect');
    await page.evaluate(() => {
      const scene = window.__scene;
      scene.prog.level = 29; scene.prog.inventory.foundation_pill = 1;
      scene.offerTrial('tianjian_elder', { id: 'trial_foundation_altar', map: 'trial_foundation_altar', durationMs: 60000 });
    });
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(() => ({ map: window.__scene.map.id, open: window.__scene.dialog.open,
      pending: window.__scene.registry.get('trialPending') ?? null, pill: window.__scene.prog.inventory.foundation_pill })),
    { map: 'tianjian_sect', open: true, pending: null, pill: 1 });
    checks.push('普通 offerTrial: Esc 不入阵、不扣丹');

    await go('tianjian_sword_tomb');
    const enterTutorial = async () => page.evaluate(() => {
      const scene = window.__scene, zone = scene.map.zones.find(zone => zone.props.tutorial);
      scene.physics.pause(); scene.dialog.close(); scene.player.body.reset(zone.x + zone.w / 2, zone.y + zone.h / 2);
      return zone.props.tutorial;
    });
    const tutorial = await enterTutorial();
    await page.waitForFunction(id => window.__scene.prog.tutorialsSeen.includes(id) && window.__scene.dialog.open, tutorial);
    assert.equal(await page.evaluate(() => window.__scene.dialog.lines[0].text), text(`tip.${tutorial}`));
    await page.evaluate(() => window.__scene.dialog.close()); await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__scene.dialog.open), false);
    await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('reset'); history.replaceState(null, '', url.href); });
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 }); await waitForMap(page, 'tianjian_sword_tomb');
    await enterTutorial(); await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(id => ({ open: window.__scene.dialog.open,
      count: window.__scene.prog.tutorialsSeen.filter(seen => seen === id).length,
      saved: JSON.parse(localStorage.getItem('xiantu_save_v1')).tutorialsSeen.includes(id) }), tutorial),
    { open: false, count: 1, saved: true });
    checks.push('tutorial: 首次进入提示，持续站区与刷新都不重复');
    assert.deepEqual(errors, [], '交互验证出现浏览器报错');
    console.log(JSON.stringify({ interactionChecks: checks, errors: 0 }));
    return checks.length;
  } catch (error) {
    console.error(JSON.stringify({ interactionChecks: checks, errors, failure: error.message }));
    throw error;
  } finally { await page.close(); }
}

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE
    ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try {
      const api = await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate);
      return { api, module: candidate };
    } catch (error) {
      if (process.env.PLAYWRIGHT_MODULE) throw error;
    }
  }
  throw new Error('未找到 Playwright；请用 PLAYWRIGHT_MODULE 指定外部安装的 playwright-core/index.mjs');
}

async function browserPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH
    ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* 尝试下一条本机路径 */ }
  }
  throw new Error('未找到 Chromium；请用 CHROMIUM_EXECUTABLE_PATH 指定浏览器');
}

let server;
let browser;
const results = [];
try {
  const { api, module } = await loadPlaywright();
  const executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(projectRoot, 'dist/index.html'));
    server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: 4185 }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await api.chromium.launch({
    executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  console.log(JSON.stringify({ baseURL, playwright: module, browser: executablePath, headless: true }));

  for (const [mapId, area] of maps) {
    const page = await context.newPage();
    const errors = collectErrors(page);
    const url = new URL(baseURL);
    url.searchParams.set('map', mapId);
    url.searchParams.set('reset', '1');
    try {
      await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
      await waitForMap(page, mapId);
      // 多观察一些渲染帧，覆盖 create 之后 update / 怪物行为的异步异常。
      await page.waitForTimeout(750);
      const state = await page.evaluate(({ area }) => {
        const scene = window.__scene;
        const keys = [`tiles_${area}`, `tiles_${area}_ss`, `bg_${area}_far`, `bg_${area}_mid`];
        const textures = Object.fromEntries(keys.map(key => {
          if (!scene.textures.exists(key)) return [key, false];
          const source = scene.textures.get(key).getSourceImage();
          return [key, source.width > 0 && source.height > 0];
        }));
        const terrainUsesArea = scene.children.list.some(child =>
          child.type === 'TilemapLayer' && child.tileset?.some(tileset => tileset.name === `tiles_${area}`));
        const ferries = scene.map.objects.filter(o => o.type === 'ferry').map(o => {
          const boat = scene.children.getByName(`ferry:${o.name}`);
          return { name: o.name, rendered: !!boat, x: boat?.x, y: boat?.y, expectedX: o.x + o.w / 2,
            expectedY: o.y + (scene.map.id === 'luoxia_town' ? 96 : 0), noCollision: !boat?.body, depthBelowPlayer: boat?.depth < scene.player.depth };
        });
        const spawnGates = scene.map.spawnGates.map(gate => ({ name: gate.name, side: gate.props.side }));
        const phaseValid = scene.map.objects.filter(o => o.type === 'npc').every(o =>
          (o.props.phaseMin == null || Number(o.props.phaseMin) <= 5) && (o.props.phaseMax == null || Number(o.props.phaseMax) >= 5));
        const trialObjects = scene.map.objects.filter(o => ['lamp', 'draw_desk', 'target_spot', 'token', 'patrol_path'].includes(o.type))
          .map(o => ({ type: o.type, name: o.name, props: o.props }));
        const trialZones = scene.map.zones.filter(zone => ['shadow', 'return_point'].includes(zone.props.kind))
          .map(zone => ({ name: zone.name, kind: zone.props.kind }));
        const patrolPaths = scene.map.objects.filter(o => o.type === 'patrol_path')
          .map(o => ({ name: o.name, points: o.points ?? [] }));
        return { map: scene.map.id, trial: scene.map.trial ?? null, night: !!scene.map.night,
          trialObjects, trialZones, patrolPaths, textures, terrainUsesArea, ferries, spawnGates, phaseValid,
          fps: Math.round(scene.game.loop.actualFps) };
      }, { area });
      assert.equal(state.map, mapId);
      for (const [key, loaded] of Object.entries(state.textures)) assert.ok(loaded, `${mapId}: 缺少纹理 ${key}`);
      assert.ok(state.terrainUsesArea, `${mapId}: 地形未使用 ${area} 图块`);
      assert.ok(state.phaseValid, `${mapId}: NPC 阶段过滤错误`);
      for (const ferry of state.ferries) {
        assert.ok(ferry.rendered && ferry.noCollision && ferry.depthBelowPlayer, `${mapId}: 飞舟渲染、碰撞或 depth 错误`);
        assert.equal(ferry.x, ferry.expectedX); assert.equal(ferry.y, ferry.expectedY);
      }
      if (['trial_taixu_stage', 'trial_wanshou_pen'].includes(mapId))
        assert.deepEqual(state.spawnGates.map(gate => gate.side).sort(), ['left', 'right']);
      const trial = trialByMap[mapId];
      if (trial) {
        assert.equal(state.trial, trial.id, `${mapId}: trial 属性丢失`);
        const source = JSON.parse(await fs.readFile(path.join(dataRoot, 'maps', `${mapId}.json`), 'utf8'));
        const properties = list => Object.fromEntries((list ?? []).map(prop => [prop.name, prop.value]));
        assert.equal(state.night, !!properties(source.properties).night, `${mapId}: night 属性丢失`);
        const objects = source.layers.filter(layer => layer.type === 'objectgroup').flatMap(layer => layer.objects);
        const expectedObjects = objects.filter(o => ['lamp', 'draw_desk', 'target_spot', 'token', 'patrol_path'].includes(o.type))
          .map(o => ({ type: o.type, name: o.name, props: properties(o.properties) }));
        assert.deepEqual(state.trialObjects, expectedObjects, `${mapId}: G10 对象或属性丢失`);
        const expectedZones = objects.filter(o => o.type === 'zone' && ['shadow', 'return_point'].includes(properties(o.properties).kind))
          .map(o => ({ name: o.name, kind: properties(o.properties).kind }));
        assert.deepEqual(state.trialZones, expectedZones, `${mapId}: G10 区域丢失`);
        const expectedPaths = objects.filter(o => o.type === 'patrol_path').map(o => ({ name: o.name,
          points: (o.polyline ?? []).map(point => ({ x: o.x + point.x, y: o.y + point.y })) }));
        assert.deepEqual(state.patrolPaths, expectedPaths, `${mapId}: 巡逻折线路径丢失`);
      }
      if (mapId === 'luoxia_town') await page.screenshot({ path: screenshot });
      assert.deepEqual(errors, [], `${mapId}: 浏览器出现报错`);
      results.push({ ...state, errors: 0 });
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) {
      console.error(JSON.stringify({ map: mapId, errors, failure: error.message }));
      throw error;
    } finally {
      await page.close();
    }
  }
  const interactionChecks = await extraInteractions(context, baseURL);
  assert.equal(results.length, 11, '七张新图和四张试炼图未全部验证');
  console.log(JSON.stringify({ passed: results.length, newMaps: results.filter(result => !result.trial).length,
    trialMaps: results.filter(result => result.trial).length, interactionChecks, consoleErrors: 0, screenshot }));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
