// npm run build:test 后运行；Chromium 无头、真实场景/键盘/机关/怪物受击。
// 不用 trial:complete 或 __xt.questComplete 模拟胜利；只在测试构建会话中打开四宗关口。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { findRoot, dataMode } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = findRoot(root);
const trials = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/trials.json'), 'utf8'))
  .filter(row => row.id.startsWith('trial_sect_'));
const quests = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
const strings = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8'));
const classes = JSON.parse(await fs.readFile(path.join(root, 'src/config/classes.json'), 'utf8')).classes;
assert.equal(trials.length, 4);
const checks = [];

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try { return { api: await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate), module: candidate }; }
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
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`); });
  return errors;
}
async function ready(page, mapId) {
  await page.waitForFunction(id => {
    const scene = window.__scene;
    return window.__xt && scene?.map?.id === id && scene.player && scene.dialog && scene.game.loop.frame > 3;
  }, mapId, { timeout: 15000 });
}
async function drainDialog(page) {
  for (let n = 0; n < 24; n++) {
    const state = await page.evaluate(() => ({ open: window.__scene.dialog.open, choices: window.__scene.dialog.choices.length }));
    if (!state.open) return;
    await page.keyboard.press(state.choices ? '1' : 'z', { delay: 45 });
    await page.waitForTimeout(55);
  }
  throw new Error('对白 24 次输入后仍未关闭');
}
async function fixture(page, mapId, quest, patch = {}) {
  const selectedSect = classes.find(row => row.joinQuest === quest.id)?.sect ?? '';
  await page.evaluate(async ({ mapId, quest, selectedSect, patch }) => {
    const scene = window.__scene, p = scene.prog;
    const save = p.exportSave();
    Object.assign(save, { level: Math.max(12, quest.reqLevel), job: '', classVersion: 0,
      classRewardClaims: [], classRefundSp: 0, completedTrials: [], pendingSectTrial: null,
      quests: { q_fox: { state: 'done', kills: {}, crafted: {} } },
      skills: { spirit_bolt: 4 }, skillGifted: { spirit_bolt: 1 }, skillMastery: {}, skillCooldowns: {},
      hotbar: ['spirit_bolt', null, null, null, null, null, null, null], buffs: [],
      equip: {}, inventory: { five_sect_token: 1 }, selectedSect, exp: 0, stones: 123, sectRank: null,
      position: { mapId, x: 96, y: 576 } });
    Object.assign(save, patch);
    await window.__xt.loadSave(save);
    const fresh = window.__scene;
    fresh.prog.hp = fresh.prog.maxHp; fresh.prog.mp = fresh.prog.maxMp;
    fresh.player.hp = fresh.prog.hp; fresh.player.maxHp = fresh.prog.maxHp;
    fresh.physics.pause(); fresh.player.body.reset(fresh.map.spawn.x, fresh.map.spawn.y);
  }, { mapId, quest, selectedSect, patch });
  await ready(page, mapId);
}
async function standAtNpc(page, npcId) {
  const frame = await page.evaluate(id => {
    const scene = window.__scene, npc = scene.map.objects.find(o => o.type === 'npc' && (o.props.npc ?? o.name) === id);
    if (!npc) throw new Error(`找不到 NPC: ${id}`);
    scene.physics.resume(); scene.player.body.reset(npc.x, npc.y);
    return scene.game.loop.frame;
  }, npcId);
  await page.waitForFunction(frame => {
    const scene = window.__scene;
    if (scene.game.loop.frame <= frame || !scene.player.onGround || scene.player.state2 !== 'ground') return false;
    scene.physics.pause(); return true;
  }, frame, { timeout: 3000, polling: 50 });
}
async function chooseSectToken(page, sect) {
  await page.keyboard.press('i', { delay: 45 });
  await page.waitForFunction(() => window.__scene.children.getByName('inventory:five-sect-token')?.visible);
  const point = await page.evaluate(() => {
    const bounds = window.__scene.children.getByName('inventory:five-sect-token').getBounds();
    return { x: bounds.centerX, y: bounds.centerY };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.__scene.dialog.choices.length === 5);
  await page.keyboard.press(String(classes.findIndex(row => row.sect === sect) + 1), { delay: 45 });
  assert.deepEqual(await page.evaluate(() => ({ selected: window.__scene.prog.selectedSect, job: window.__scene.prog.job,
    stored: JSON.parse(localStorage.getItem('xiantu_save_v1')).selectedSect, token: window.__scene.prog.count('five_sect_token') })),
  { selected: sect, job: '', stored: sect, token: 1 }, `${sect}: 真正使用五宗帖只保存选择，不消耗帖或提前拜入`);
}
async function enter(page, trial, quest) {
  await page.evaluate(({ quest }) => {
    const scene = window.__scene;
    scene.dialog.close(); scene.talkTo(quest.turnIn, quest.id);
  }, { quest });
  const confirmation = await page.evaluate(() => ({ lines: window.__scene.dialog.lines.map(line => line.text),
    choices: window.__scene.dialog.choices.map(choice => choice.label) }));
  assert.ok(confirmation.lines.some(line => line.includes(strings['trial.enter_confirm'])), `${trial.sect}: 缺进入确认对白`);
  assert.ok(confirmation.choices.includes('进入试炼'), `${trial.sect}: 没有进入选择`);
  await page.keyboard.press('1', { delay: 45 });
  await page.waitForFunction(id => window.__scene.sectTrial?.def.id === id && window.__scene.prog.pendingSectTrial?.id === id,
    trial.id, { timeout: 10000 });
  const landing = await page.evaluate(({ quest }) => {
    const scene = window.__scene;
    scene.physics.pause();
    return { actual: [scene.player.x, scene.player.feet], expected: [scene.map.spawn.x, scene.map.spawn.y],
      repeated: scene.enterSectTrial(quest.turnIn, scene.sectTrial.def), completed: scene.quests.complete(quest.id) };
  }, { quest });
  assert.ok(Math.abs(landing.actual[0] - landing.expected[0]) < 2 && Math.abs(landing.actual[1] - landing.expected[1]) < 8,
    `${trial.sect}: 入场未落在 playerStart: ${JSON.stringify(landing)}`);
  assert.equal(landing.repeated, false, `${trial.sect}: 重复进场未拒绝`);
  assert.equal(landing.completed, false, `${trial.sect}: 进图错误地完成任务`);
}
async function returned(page, trial, quest, result) {
  await page.waitForFunction(({ trial, quest }) => {
    const scene = window.__scene;
    return scene?.map?.id === trial.map && !scene.sectTrial && !scene.prog.pendingSectTrial
      && scene.map.objects.some(o => o.type === 'npc' && o.props.npc === quest.turnIn);
  }, { trial, quest }, { timeout: 10000 });
  const state = await page.evaluate(({ quest }) => {
    const scene = window.__scene; scene.physics.pause();
    const elder = scene.map.objects.find(o => o.type === 'npc' && o.props.npc === quest.turnIn);
    return { completed: scene.quests.complete(quest.id), trials: scene.prog.completedTrials, job: scene.prog.job,
      resources: { exp: scene.prog.exp, stones: scene.prog.stones,
        inventory: Object.fromEntries(Object.entries(scene.prog.exportSave().inventory).filter(([, count]) => count > 0)),
        skills: scene.prog.skills },
      point: [scene.player.x, scene.player.feet], elder: [elder.x, elder.y], logs: scene.logs.map(log => log.text),
      pendingSaved: JSON.parse(localStorage.getItem('xiantu_save_v1')).pendingSectTrial };
  }, { quest });
  assert.equal(state.completed, result === 'win', `${trial.sect}: ${result} 目标完成状态错误`);
  assert.equal(state.job, '', `${trial.sect}: 正式交付前不能落定职业`);
  assert.equal(state.pendingSaved, null, `${trial.sect}: 返回后 pending 未保存清除`);
  assert.ok(Math.abs(state.point[0] - state.elder[0]) < 2 && Math.abs(state.point[1] - state.elder[1]) < 8,
    `${trial.sect}: 未返回本宗长老门口 ${JSON.stringify(state)}`);
  if (result !== 'win') {
    assert.deepEqual(state.trials, [], `${trial.sect}: ${result} 错误登记通关`);
    assert.ok(state.logs.includes(strings[result === 'fail' ? 'trial.fail_return' : 'trial.exit_return']), `${trial.sect}: ${result} 提示缺失`);
    assert.deepEqual(state.resources, { exp: 0, stones: 123, inventory: { five_sect_token: 1 }, skills: { spirit_bolt: 4 } },
      `${trial.sect}: 失败或退出改变永久资源`);
  } else assert.deepEqual(state.trials, [trial.id]);
}
async function draw(page) {
  assert.equal(await page.evaluate(() => window.__scene.mobs.filter(m => m.def.id === 'wood_target' && !m.dead).length), 0,
    '画符前不能预刷木靶');
  await page.evaluate(() => {
    const scene = window.__scene, desk = scene.map.objects.find(o => o.type === 'draw_desk');
    scene.physics.resume();
    scene.player.body.reset(desk.x, desk.y); scene.player.body.updateFromGameObject();
  });
  await page.waitForFunction(() => window.__scene.player.state2 === 'ground', null, { timeout: 3000 });
  await page.evaluate(() => window.__scene.physics.pause());
  await page.keyboard.press('z', { delay: 45 });
  await page.waitForFunction(() => window.__scene.sectTrial?.blocksInput, null, { timeout: 3000 });
  const arrows = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' };
  await page.keyboard.press('ArrowLeft', { delay: 35 });
  assert.deepEqual(await page.evaluate(() => ({ drawn: window.__scene.sectTrial.state.drawn,
    stroke: window.__scene.sectTrial.state.strokeIndex })), { drawn: 0, stroke: 0 }, '错笔未重画当前符');
  for (let strokes = 0; strokes < 24; strokes++) {
    const state = await page.evaluate(() => {
      const trial = window.__scene.sectTrial;
      return { stage: trial.stage, direction: trial.state.strokes[trial.state.strokeIndex] };
    });
    if (state.stage !== 'draw') break;
    await page.keyboard.press(arrows[state.direction], { delay: 35 });
  }
  assert.equal(await page.evaluate(() => window.__scene.sectTrial.stage), 'targets', '真实方向键未完成三道符');
}
async function clearWaves(page, trial) {
  const killed = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const step = await page.evaluate(() => {
      const scene = window.__scene, trial = scene.sectTrial;
      if (!trial || trial.ended) return { done: true, killed: [] };
      trial.update(12000);
      const mobs = scene.mobs.filter(m => m.active && !m.dead && m.name.startsWith('sect-wave:'));
      const ids = mobs.map(m => m.def.id);
      for (const mob of mobs) mob.takeHit(scene.time.now, mob.hp + 100000, 1);
      return { done: trial.ended, killed: ids };
    });
    killed.push(...step.killed);
    if (step.done) break;
    await page.waitForTimeout(60);
  }
  assert.equal(killed.length, trial.waves.reduce((sum, wave) => sum + wave.count, 0), `${trial.sect}: 实际击杀波次总数不符`);
  assert.ok(killed.every(id => trial.waves.some(wave => wave.monster === id)), `${trial.sect}: 波次怪物不符`);
}
async function pickupToken(page) {
  const before = await page.evaluate(() => {
    const scene = window.__scene, token = scene.map.objects.find(o => o.type === 'token');
    scene.physics.resume();
    scene.player.body.reset(token.x, token.y); scene.player.body.updateFromGameObject();
    // 挪位属于测试夹具；使用真实交互处理拾取，令牌不会写进存档。
    scene.stealth.patrols.forEach(p => { p.mob.active = false; });
    return scene.prog.count('shadow_token');
  });
  await page.waitForFunction(() => window.__scene.player.state2 === 'ground', null, { timeout: 3000 });
  await page.evaluate(() => window.__scene.physics.pause());
  await page.keyboard.press('z', { delay: 45 });
  assert.deepEqual(await page.evaluate(() => ({ stage: window.__scene.sectTrial.stage,
    count: window.__scene.prog.count('shadow_token'), stored: window.__scene.prog.exportSave().inventory.shadow_token ?? 0 })),
  { stage: 'return', count: before + 1, stored: 0 }, '拿令牌只推进回程且不进永久背包');
}
async function win(page, trial) {
  if (trial.sect === 'taixu') {
    const lit = await page.evaluate(() => {
      const scene = window.__scene, lamps = scene.map.objects.filter(o => o.type === 'lamp');
      // hitSpell 只读取矩形几何字段，不依赖测试事件。
      const hit = lamp => ({ x: lamp.x - 64, y: lamp.y - 96, width: 128, height: 128,
        left: lamp.x - 64, right: lamp.x + 64, top: lamp.y - 96, bottom: lamp.y + 32 });
      const wrong = scene.trialObjects.hitSpell('sword_qi_slash', hit(lamps[0]));
      for (const lamp of lamps) scene.trialObjects.hitSpell('spirit_bolt', hit(lamp));
      return { wrong, lit: scene.sectTrial.state.lit, stage: scene.sectTrial.stage };
    });
    assert.equal(lit.wrong, false, '太虚普通剑术不能点灯');
    assert.equal(lit.lit, trial.lamps.count); assert.equal(lit.stage, 'waves');
    await clearWaves(page, trial);
  } else if (trial.sect === 'lingfu') {
    await draw(page);
    let killed = 0;
    for (let n = 0; n < 12; n++) {
      const step = await page.evaluate(() => {
        const scene = window.__scene;
        const targets = scene.mobs.filter(m => m.active && !m.dead && m.def.id === 'wood_target');
        for (const mob of targets) mob.takeHit(scene.time.now, mob.hp + 100000, 1);
        return { killed: targets.length, done: !scene.sectTrial || scene.sectTrial.ended };
      });
      killed += step.killed;
      if (step.done) break;
      await page.waitForTimeout(trial.targets.refillDelayMs + 90);
    }
    assert.equal(killed, trial.targets.total, '靶场真实 takeHit 击碎数不符');
  } else if (trial.sect === 'youying') {
    await pickupToken(page);
    await page.evaluate(() => {
      const scene = window.__scene, zone = scene.map.zones.find(z => z.props.kind === 'return_point');
      scene.player.body.reset(zone.x + zone.w / 2, zone.y + zone.h / 2); scene.player.body.updateFromGameObject();
      scene.trialObjects.update(0);
    });
  } else {
    const low = await page.evaluate(() => {
      const scene = window.__scene, mob = scene.mobs.find(m => m.def.id === 'mad_mandrill' && !m.dead);
      mob.takeHit(scene.time.now, 100000, 1);
      scene.physics.resume();
      scene.player.body.reset(mob.x - 48, mob.y); scene.player.body.updateFromGameObject();
      scene.sectTrial.update(0);
      return { hp: mob.hp, minHp: mob.def.minHp, dead: mob.dead, stage: scene.sectTrial.stage };
    });
    assert.deepEqual(low, { hp: low.minHp, minHp: low.minHp, dead: false, stage: 'flute' }, '山魈真实受击应保底并跪地');
    await page.waitForFunction(() => window.__scene.player.state2 === 'ground', null, { timeout: 3000 });
    await page.evaluate(() => window.__scene.physics.pause());
    await page.keyboard.down('z');
    await page.waitForTimeout(180);
    assert.ok(await page.evaluate(() => window.__scene.sectTrial.state.fluteMs > 0), '按住 Z 未开启骨笛读条');
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(90); await page.keyboard.up('ArrowRight');
    await page.keyboard.up('z');
    assert.equal(await page.evaluate(() => window.__scene.sectTrial.state.fluteMs), 0, '移动中断未清空骨笛读条');
    await page.keyboard.down('z');
    await page.waitForFunction(() => window.__scene.sectTrial?.stage === 'waves', null, { timeout: 6000 });
    await page.keyboard.up('z');
    const companion = await page.evaluate(() => {
      const pet = window.__scene.sectTrial.pets.pets[0];
      return { id: pet.defId, hp: pet.hp, atk: pet.trial.atk, learned: window.__scene.prog.skillLevel('summon_spirit_wolf') };
    });
    assert.deepEqual(companion, { id: trial.companion.id, hp: trial.companion.hp, atk: trial.companion.atk, learned: 0 },
      '驯服后仅建立表内临时伙伴');
    await clearWaves(page, trial);
  }
}

let server, browser;
let errors = [];
try {
  const { api, module } = await loadPlaywright(), executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(root, 'dist/index.html'));
    server = await preview({ root, preview: { host: '127.0.0.1', port: Number(process.env.SMOKE_PORT ?? 4207), strictPort: true }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await api.chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage(); errors = collectErrors(page);
  const url = new URL(baseURL); url.searchParams.set('map', 'qingyun_village'); url.searchParams.set('reset', '1');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 }); await ready(page, 'qingyun_village');
  const initialFeatures = await page.evaluate(() => window.__xt.getState().features);
  assert.equal(initialFeatures.fiveSectClasses, false, 'v0.5b 四宗默认关口必须关闭');
  console.log(JSON.stringify({ test: 'trials-smoke', baseURL, playwright: module, browser: executablePath, dataMode: dataMode(root), initialFeatures }));
  await page.evaluate(() => { window.__xt.setFlag('fiveSectClasses', true); window.__xt.setFlag('v05Maps', true); });
  for (const trial of trials) {
    const quest = quests.find(row => row.id === trial.quest);
    for (const [caseName, patch] of [
      ['无帖', { inventory: {}, selectedSect: trial.sect }],
      ['未选宗', { selectedSect: '' }],
      ['选错宗', { selectedSect: 'tianjian' }],
    ]) {
      await fixture(page, trial.map, quest, patch);
      await standAtNpc(page, quest.giver); await page.keyboard.press('z', { delay: 45 });
      const denied = await page.evaluate(id => ({ state: window.__scene.quests.state(id),
        text: window.__scene.dialog.lines.map(line => line.text).join('\n'),
        available: window.__scene.quests.available(id), accept: window.__scene.quests.accept(id) }), quest.id);
      assert.equal(denied.state, undefined, `${trial.sect}/${caseName}: 真实 Z 不得接任务`);
      assert.equal(denied.available, false); assert.equal(denied.accept, false);
      assert.ok(denied.text.includes('五宗帖'), `${trial.sect}/${caseName}: 接引缺门槛提示`);
      await drainDialog(page);
      await page.evaluate(({ quest, trial }) => {
        const p = window.__scene.prog;
        p.quests[quest.id] = { state: 'active', kills: {}, crafted: {} };
        p.completedTrials = [trial.id]; p.save();
      }, { quest, trial });
      const activeSave = await page.evaluate(() => window.__xt.exportSave());
      await page.evaluate(async save => window.__xt.loadSave(save), activeSave); await ready(page, trial.map);
      const before = await page.evaluate(() => window.__scene.prog.exportSave());
      await standAtNpc(page, quest.turnIn); await page.keyboard.press('z', { delay: 45 });
      const blocked = await page.evaluate(({ quest, trial }) => {
        const s = window.__scene;
        return { choices: s.dialog.choices.map(choice => choice.label), text: s.dialog.lines.map(line => line.text).join('\n'),
          entered: s.enterSectTrial(quest.turnIn, trial), complete: s.quests.complete(quest.id),
          reward: s.quests.turnIn(quest.id), won: s.quests.onTrialComplete(trial.id), save: s.prog.exportSave() };
      }, { quest, trial });
      assert.equal(blocked.choices.includes('进入试炼'), false, `${trial.sect}/${caseName}: 长老隐藏入场`);
      assert.ok(blocked.choices.includes(strings['sect.entry.abandon'] ?? '放弃入门任务'));
      assert.ok(blocked.text.includes('五宗帖')); assert.equal(blocked.entered, false);
      assert.equal(blocked.complete, false); assert.equal(blocked.reward, undefined); assert.equal(blocked.won, false);
      for (const field of ['job', 'exp', 'stones', 'inventory', 'skills', 'skillGifted', 'classRefundSp', 'classRewardClaims', 'completedTrials'])
        assert.deepEqual(blocked.save[field], before[field], `${trial.sect}/${caseName}: 旧 active 不发奖或改资源 ${field}`);
      await page.keyboard.press('1', { delay: 45 });
      assert.deepEqual(await page.evaluate(id => ({ state: window.__scene.quests.state(id),
        trials: window.__scene.prog.completedTrials, stored: JSON.parse(localStorage.getItem('xiantu_save_v1')).quests[id] }), quest.id),
      { state: undefined, trials: [], stored: undefined }, `${trial.sect}/${caseName}: 真实放弃回未接并清通关`);
      checks.push(`${trial.sect}/${caseName}: 真实 Z 接引/长老均拒绝，旧 active 存读不奖，真实选项放弃`);
    }
  }
  for (const trial of trials) {
    const quest = quests.find(row => row.id === trial.quest);
    await page.evaluate(() => { window.__xt.setFlag('fiveSectClasses', true); window.__xt.setFlag('v05Maps', true); });
    await fixture(page, trial.map, quest, { selectedSect: '' });
    await chooseSectToken(page, trial.sect);
    const entrance = await page.evaluate(({ quest }) => ({
      npcs: window.__scene.map.objects.filter(o => o.type === 'npc').map(o => o.props.npc),
      mobs: window.__scene.mobs.filter(mob => mob.active && !mob.dead).length,
      patrols: window.__scene.stealth.patrols.length,
      accepted: window.__scene.quests.state(quest.id), completed: window.__scene.quests.complete(quest.id),
    }), { quest });
    assert.ok(entrance.npcs.includes(quest.giver) && entrance.npcs.includes(quest.turnIn), `${trial.sect}: 试炼图门口没有兜底 NPC`);
    assert.equal(entrance.mobs, 0, `${trial.sect}: 入口等待时不应有试炼敌人`);
    assert.equal(entrance.patrols, 0, `${trial.sect}: 入口等待时不应有巡逻发现`);
    await page.evaluate(({ quest }) => window.__scene.talkTo(quest.giver, quest.id), { quest });
    await drainDialog(page);
    assert.equal(await page.evaluate(id => window.__scene.quests.state(id), quest.id), 'active', `${trial.sect}: 接引人未发放任务`);
    await enter(page, trial, quest);
    if (trial.sect === 'lingfu') { await draw(page); await page.evaluate(ms => window.__scene.sectTrial.update(ms), trial.targets.timeLimitMs); }
    else if (trial.sect === 'taixu') await page.evaluate(ms => window.__scene.sectTrial.update(ms), trial.lamps.timeLimitMs);
    else if (trial.sect === 'youying') {
      await page.evaluate(() => {
        // 高台巡逻路线与地面阴影不重叠，确保本用例实际站在灯笼视线内。
        const scene = window.__scene, patrol = scene.stealth.patrols[1];
        scene.player.body.reset(patrol.mob.x + patrol.motion.facing * 112, patrol.mob.y);
        scene.player.body.updateFromGameObject(); scene.stealth.update(patrol.mob.def.vision.detectMs, true);
      });
    } else await page.evaluate(() => { const scene = window.__scene; scene.player.invulnUntil = 0; scene.hurtPlayer(scene.prog.hp + 10000, scene.player.x, 0); });
    await returned(page, trial, quest, 'fail');
    checks.push(`${trial.sect}: 真实失败返回本宗入口，不扣资源`);
    await enter(page, trial, quest); await page.keyboard.press('Escape', { delay: 45 });
    await returned(page, trial, quest, 'exit');
    checks.push(`${trial.sect}: 失败后即刻重进，Esc 主动退出`);
    if (trial.sect === 'youying') {
      await enter(page, trial, quest);
      assert.equal(await page.evaluate(() => window.__scene.prog.trialSkillCharges('phantom_cloak')), 2);
      await page.evaluate(() => { const url = new URL(location.href); url.searchParams.delete('reset'); history.replaceState(null, '', url.href); });
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 }); await ready(page, trial.map);
      const interrupted = await page.evaluate(() => ({ pending: window.__scene.prog.pendingSectTrial,
        active: !!window.__scene.sectTrial, cloak: window.__scene.prog.skillLevel('phantom_cloak'),
        step: window.__scene.prog.skillLevel('shadow_step'), trials: window.__scene.prog.completedTrials }));
      assert.deepEqual(interrupted, { pending: null, active: false, cloak: 0, step: 0, trials: [] }, '刷新尝试未中断返回或泄漏教学技能');
      checks.push('youying: 未结算尝试刷新回入口，教学技能不存档');
      await page.evaluate(() => { window.__xt.setFlag('fiveSectClasses', true); window.__xt.setFlag('v05Maps', true); });
      await enter(page, trial, quest);
      await page.evaluate(() => window.__scene.physics.resume());
      await page.waitForFunction(() => window.__scene.player.state2 === 'ground', null, { timeout: 3000 });
      await page.evaluate(() => window.__scene.physics.pause());
      await page.keyboard.press('s', { delay: 45 });
      const cast = await page.evaluate(() => {
        const p = window.__scene.prog, buff = p.buffs.find(buff => buff.id === 'phantom_cloak'), save = p.exportSave();
        return { charges: p.trialSkillCharges('phantom_cloak'), invisible: p.hasBuffEffect('invisible'),
          duration: buff ? buff.expireAt - window.__xt.getState().time : 0,
          savedSkill: save.skills.phantom_cloak ?? 0, savedBuffs: save.buffs, savedCooldowns: save.skillCooldowns,
          savedHotbar: save.hotbar };
      });
      assert.equal(cast.charges, 1); assert.equal(cast.invisible, true);
      assert.ok(cast.duration > 3500 && cast.duration <= 4000, `隐息术真实 buff 时长不符：${cast.duration}`);
      assert.equal(cast.savedSkill, 0); assert.deepEqual(cast.savedBuffs, []); assert.deepEqual(cast.savedCooldowns, {});
      assert.deepEqual(cast.savedHotbar, ['spirit_bolt', null, null, null, null, null, null, null]);
      checks.push('youying: 真实 S 施放临时隐息，次数消耗、4 秒 buff 与存档隔离');
      await pickupToken(page); await page.keyboard.press('r', { delay: 45 });
      await returned(page, trial, quest, 'exit');
      assert.deepEqual(await page.evaluate(() => ({ token: window.__scene.prog.count('shadow_token'),
        cloak: window.__scene.prog.skillLevel('phantom_cloak'), invisible: window.__scene.prog.hasBuffEffect('invisible') })),
      { token: 0, cloak: 0, invisible: false });
      checks.push('youying: 取得令牌后 R 视为主动退出，不可绕过回程通关');
    }
    await enter(page, trial, quest); await win(page, trial); await returned(page, trial, quest, 'win');
    const savedWin = await page.evaluate(() => window.__xt.exportSave());
    await page.evaluate(async save => window.__xt.loadSave(save), savedWin); await ready(page, trial.map);
    assert.equal(await page.evaluate(id => window.__scene.quests.complete(id), quest.id), true, `${trial.sect}: 通关存读丢失`);
    const selection = await page.evaluate(() => {
      const s = window.__scene;
      return { opened: s.openSectToken(), choices: s.dialog.choices.map(choice => ({ disabled: !!choice.disabled, reason: choice.reason })) };
    });
    assert.equal(selection.opened, true);
    for (const [index, cls] of classes.entries()) {
      assert.equal(selection.choices[index].disabled, cls.sect !== trial.sect, `${trial.sect}: 通关后的改选须灰显`);
      if (cls.sect !== trial.sect) assert.ok(selection.choices[index].reason, `${trial.sect}: 灰显缺原因`);
    }
    await page.keyboard.press('Escape', { delay: 45 });
    await page.evaluate(({ quest }) => window.__scene.talkTo(quest.turnIn, quest.id), { quest }); await drainDialog(page);
    const joined = await page.evaluate(id => {
      const p = window.__scene.prog;
      return { job: p.job, state: p.quests[id].state, refund: p.classRefundSp, spirit: p.skillLevel('spirit_bolt'),
        skills: p.skills, gifted: p.skillGifted, inventory: p.inventory, stones: p.stones, trials: p.completedTrials };
    }, quest.id);
    assert.equal(joined.job, classes.find(row => row.sect === trial.sect).id); assert.equal(joined.state, 'done');
    assert.equal(joined.refund, 3); assert.equal(joined.spirit, 0); assert.deepEqual(joined.trials, [trial.id]);
    for (const skill of quest.rewards.skills) assert.equal(joined.skills[skill.id], skill.level);
    await page.evaluate(({ quest }) => window.__scene.talkTo(quest.turnIn, quest.id), { quest }); await drainDialog(page);
    const stable = await page.evaluate(id => {
      const p = window.__scene.prog;
      return { job: p.job, state: p.quests[id].state, refund: p.classRefundSp, spirit: p.skillLevel('spirit_bolt'),
        skills: p.skills, gifted: p.skillGifted, inventory: p.inventory, stones: p.stones, trials: p.completedTrials };
    }, quest.id);
    assert.deepEqual(stable, joined, `${trial.sect}: 重复交付重复奖励`);
    checks.push(`${trial.sect}: 完成全部真实目标，通关存读后正式交付并去重`);
  }
  const sword = quests.find(row => row.id === 'q_sect_tianjian');
  await fixture(page, 'tianjian_sect', sword);
  await page.evaluate(({ quest }) => window.__scene.talkTo(quest.giver, quest.id), { quest: sword }); await drainDialog(page);
  await page.evaluate(({ quest }) => window.__scene.talkTo(quest.turnIn, quest.id), { quest: sword }); await drainDialog(page);
  assert.deepEqual(await page.evaluate(() => ({ job: window.__scene.prog.job, pending: window.__scene.prog.pendingSectTrial,
    state: window.__scene.prog.quests.q_sect_tianjian.state, trials: window.__scene.prog.completedTrials })),
  { job: 'tianjian_disciple', pending: null, state: 'done', trials: [] });
  checks.push('tianjian: 接引人发任务，长老对白正式拜入且免额外试炼');
  const trial = trials[0], quest = quests.find(row => row.id === trial.quest);
  await fixture(page, trial.map, quest);
  await page.evaluate(id => window.__scene.quests.accept(id), quest.id);
  for (const gate of ['fiveSectClasses', 'v05Maps']) {
    await page.evaluate(gate => window.__xt.setFlag(gate, false), gate);
    const denied = await page.evaluate(({ quest, trial }) => {
      const scene = window.__scene, before = scene.prog.exportSave();
      scene.talkTo(quest.turnIn, quest.id);
      const offer = scene.dialog.choices.some(choice => choice.label === '进入试炼');
      scene.dialog.dismiss();
      return { offer, entered: scene.enterSectTrial(quest.turnIn, trial), pending: scene.prog.pendingSectTrial,
        before: { stones: before.stones, inventory: before.inventory, completedTrials: before.completedTrials },
        after: { stones: scene.prog.stones, inventory: scene.prog.inventory, completedTrials: scene.prog.completedTrials } };
    }, { quest, trial });
    assert.equal(denied.offer, false); assert.equal(denied.entered, false); assert.equal(denied.pending, null);
    assert.deepEqual(denied.after, denied.before);
    await page.evaluate(gate => window.__xt.setFlag(gate, true), gate);
    checks.push(`${gate}: 关闭后确认及直接入场均拒绝，无奖励变化`);
  }
  assert.deepEqual(errors, [], '试炼无头冒烟出现浏览器报错');
  console.log(JSON.stringify({ test: 'trials-smoke', checks, errors: 0 }));
  await context.close();
} catch (error) {
  console.error(JSON.stringify({ test: 'trials-smoke', checks, errors, failure: error.message }));
  throw error;
} finally { await browser?.close(); if (server) await server.httpServer.close(); }
