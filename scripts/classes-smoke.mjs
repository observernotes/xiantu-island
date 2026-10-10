// 先 npm run build；timeout 120s node scripts/classes-smoke.mjs。
// 使用真实键盘施放技能；测试木桩只提供稳定目标，不直接调用技能伤害。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { findRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = findRoot(projectRoot);
const { skills } = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/skills.json'), 'utf8'));
const allSkills = Object.fromEntries(skills.map(row => [row.id, row]));
const questRows = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
const classes = [
  ['tianjian_disciple', 'tianjian', 'tianjian_sect'],
  // 四宗山门地图尚未供图；用已登记的本宗试炼图检查技能运行。
  ['taixu_acolyte', 'taixu', 'trial_taixu_stage'],
  ['lingfu_novice', 'lingfu', 'trial_lingfu_range'],
  ['youying_shadow', 'youying', 'trial_youying_vault'],
  ['wanshou_tamer', 'wanshou', 'trial_wanshou_pen'],
];
const labels = ['A', 'S', 'D', 'F', 'G', 'H', 'Q', 'W'];

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
async function pressSkill(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(45);
  await page.keyboard.up(key);
}
async function sample(page, skillId) {
  return page.evaluate(id => {
    const scene = window.__scene, record = window.__classSmoke;
    return { mp: scene.prog.mp, x: scene.player.x, y: scene.player.y,
      casts: record.casts.filter(cast => cast.id === id), hits: record.hits.filter(hit => hit.id === id),
      buffs: scene.prog.buffs.map(buff => ({ id: buff.id, expireAt: buff.expireAt })),
      cooldown: scene.combat.cds.get(id) ?? null,
      cooldownCheck: record.cooldownChecks[id] ?? null,
      buffFx: [...scene.combat.buffFx.keys()],
      summons: scene.combat.summons.map(pet => ({ texture: pet.sprite.texture.key, tint: pet.sprite.tintTopLeft,
        hp: pet.hp, maxHp: pet.maxHp, secondary: pet.secondary, expireAt: pet.expireAt })),
      targets: record.targets.map(mob => ({ name: mob.name, hp: mob.hp, x: mob.x, y: mob.y })),
    };
  }, skillId);
}

let server, browser;
const results = [];
try {
  const { api, module } = await loadPlaywright();
  const executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(projectRoot, 'dist/index.html'));
    server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: Number(process.env.SMOKE_PORT ?? 4201), strictPort: true }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await api.chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  console.log(JSON.stringify({ baseURL, playwright: module, browser: executablePath, headless: true }));

  for (const [job, sect, map] of classes) {
    const page = await context.newPage(), errors = collectErrors(page), casts = [];
    // 调试必须保护原有玩家存档；之后所有保存回调和换图都应保持这个值。
    const sentinel = JSON.stringify({ level: 12, job: '', name: '冒烟保留档', inventory: { hp_pill_small: 7 } });
    await page.addInitScript(value => localStorage.setItem('xiantu_save_v1', value), sentinel);
    // 只输入执法堂使用的入口，覆盖山门缺图时自动转入本宗已登记试炼图。
    const url = new URL(baseURL); url.searchParams.set('debug', `class=${job}`);
    try {
      await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(({ job, map }) => {
        const scene = window.__scene;
        return scene?.map?.id === map && scene.prog?.job === job && scene.player && scene.dialog && scene.combat && scene.game.loop.frame > 3;
      }, { job, map }, { timeout: 15000 });
      await page.waitForTimeout(400);
      const initial = await page.evaluate(() => {
        const scene = window.__scene;
        scene.dialog.close(); scene.skillWindow.close();
        // 独立木桩不会攻击或奖励，禁用自然回复便于精确验证一次施放的灵力。
        scene.regenMp = () => {};
        // 原试炼模块已由 v05 冒烟覆盖，此处停刷新/巡逻，仅隔离技能的真实目标。
        if (scene.trialObjects) scene.trialObjects.update = () => {};
        if (scene.stealth) scene.stealth.update = () => {};
        for (const mob of [...scene.mobs]) {
          mob.setActive(false).setVisible(false); mob.body.enable = false; mob.bar?.clear();
        }
        scene.mobs.length = 0;
        const targets = [];
        for (let index = 0; index < 3; index++) {
          const mob = scene.spawnTrialMob('training_dummy', scene.player.x + 100 + index * 38, scene.player.y);
          if (!mob) throw new Error('共享表缺 training_dummy');
          mob.name = `class-smoke-target-${index}`;
          mob.def = { ...mob.def, id: mob.name, level: scene.prog.level, hp: 100000, def: 0, immortal: true, aggressive: false,
            invulnerable: false, minHp: 0, atk: 0, touchDamage: false, moveSpeed: 0 };
          mob.hp = 100000; mob.manualMotion = true; mob.grantRewards = false;
          mob.body.setAllowGravity(false).setImmovable(true).setVelocity(0, 0); mob.body.moves = false;
          targets.push(mob);
        }
        const record = { casts: [], hits: [], targets, cooldownChecks: {}, checkingCooldown: false,
          origin: { x: scene.player.x, y: scene.player.y } };
        window.__classSmoke = record;
        scene.events.on('skill:cast', event => {
          record.casts.push({ ...event, at: scene.time.now });
          // 在相同游戏时刻验证冷却，避免浏览器 RPC 的延迟越过 120/300ms 短后摇。
          if (record.checkingCooldown) return;
          record.checkingCooldown = true;
          const count = record.casts.length, mp = scene.prog.mp;
          scene.combat.tryCast(scene.prog.hotbar.indexOf(event.id));
          record.cooldownChecks[event.id] = { extraCasts: record.casts.length - count, extraMp: mp - scene.prog.mp };
          record.checkingCooldown = false;
        });
        scene.events.on('skill:hit', event => record.hits.push({ id: event.id, target: event.target, damage: event.damage, secondary: event.secondary }));
        return { job: scene.prog.job, hotbar: scene.prog.hotbar, appearance: scene.prog.appearance,
          playerTexture: scene.player.texture.key, save: localStorage.getItem('xiantu_save_v1'),
          learned: scene.prog.classSkills.map(def => ({ id: def.id, type: def.type, level: scene.prog.skillLevel(def.id) })) };
      });
      assert.equal(initial.save, sentinel, `${job}: debug 创建污染真实存档`);
      assert.equal(initial.learned.length, 5, `${job}: 调试技能树不完整`);
      assert.ok(initial.learned.every(skill => skill.level === 1), `${job}: 调试技能未学 Lv1`);
      assert.ok(initial.hotbar.every(id => id === null || allSkills[id]?.sect === sect && allSkills[id]?.type !== 'passive'), `${job}: 快捷栏混入外宗/被动`);
      assert.equal(allSkills[initial.hotbar[0]].key, 'default:A', `${job}: 入门技没有使用表内默认 A 键`);
      assert.equal(initial.appearance, `outfit_${sect}_1`, `${job}: 道袍 appearance`);
      const active = skills.filter(skill => skill.job === 1 && skill.sect === sect && skill.type !== 'passive');

      for (const skill of active) {
        const slot = initial.hotbar.indexOf(skill.id); assert.ok(slot >= 0, `${skill.id}: 未绑定快捷键`);
        await page.waitForTimeout(550);
        const setup = await page.evaluate(id => {
          const scene = window.__scene, record = window.__classSmoke;
          scene.dialog.close(); scene.player.facing = 1;
          scene.player.body.reset(record.origin.x, record.origin.y); scene.player.body.setVelocity(0, 0);
          scene.player.state2 = 'ground'; scene.player.skillRooted = false; scene.player.attackLockUntil = 0;
          record.targets.forEach((mob, index) => { mob.hp = 100000; mob.body.reset(record.origin.x + 100 + index * 38, record.origin.y); });
          scene.prog.mp = 0;
          return { count: record.casts.filter(cast => cast.id === id).length, x: scene.player.x, cost: scene.prog.skillMpCost(id),
            cooldownMs: scene.prog.skillCooldownMs(id), recoverMs: scene.prog.skillRecoverMs(id) };
        }, skill.id);
        await pressSkill(page, labels[slot]);
        assert.equal((await sample(page, skill.id)).casts.length, setup.count, `${skill.id}: 灵力不足仍施放`);
        await page.evaluate(() => { window.__scene.prog.mp = window.__scene.prog.maxMp; });
        const before = await sample(page, skill.id);
        await pressSkill(page, labels[slot]);
        await page.waitForFunction(({ id, count }) => window.__classSmoke.casts.filter(cast => cast.id === id).length === count + 1,
          { id: skill.id, count: setup.count }, { timeout: 2500 });
        const cast = await sample(page, skill.id);
        assert.ok(Math.abs(before.mp - cast.mp - setup.cost) < 1e-6, `${skill.id}: 灵力消耗没有按表扣除`);
        assert.ok(cast.cooldown && Math.abs(cast.cooldown.total - Math.max(setup.cooldownMs, setup.recoverMs)) < 1e-6,
          `${skill.id}: 冷却/后摇没有登记`);
        assert.deepEqual(cast.cooldownCheck, { extraCasts: 0, extraMp: 0 }, `${skill.id}: 冷却没有阻止二次施放`);
        if (skill.type === 'buff') {
          assert.ok(cast.buffs.some(buff => buff.id === skill.id && buff.expireAt > Date.now()), `${skill.id}: 增益未应用`);
          assert.ok(cast.buffFx.includes(skill.id), `${skill.id}: 增益没有特效或占位反馈`);
        } else if (skill.effects?.summon) {
          await page.waitForFunction(() => window.__scene.combat.summons.length > 0, null, { timeout: 2500 });
          const pets = (await sample(page, skill.id)).summons;
          assert.equal(pets.length, 1, '初级召唤应只有一只狼');
          assert.equal(pets[0].texture, 'mon_wild_wolf', '灵狼未复用野狼图');
          assert.equal(pets[0].tint, 0x7FE0C0, '灵狼没有青绿色调');
          assert.ok(pets[0].hp > 0 && pets[0].maxHp > 0, '灵狼气血未建立');
          await page.waitForFunction(id => window.__classSmoke.hits.some(hit => hit.id === id && hit.damage > 0), skill.id, { timeout: 4000 });
        } else if (skill.damageRatio > 0) {
          await page.waitForFunction(id => window.__classSmoke.hits.some(hit => hit.id === id && hit.damage > 0), skill.id, { timeout: 2500 });
        } else if (skill.effects?.dashDistance) {
          await page.waitForTimeout(180);
          assert.ok(Math.abs((await sample(page, skill.id)).x - setup.x) > 60, `${skill.id}: 位移没有执行`);
        }
        const after = await sample(page, skill.id);
        assert.ok(after.buffFx.every(id => allSkills[id].type !== 'passive'), `${job}: 被动错误生成特效`);
        if (skill.type === 'active' && skill.damageRatio > 0) assert.ok(after.targets.some(target => target.hp < 100000), `${skill.id}: 目标气血没有下降`);
        casts.push({ skill: skill.id, key: labels[slot], mp: setup.cost, cooldownMs: cast.cooldown.total,
          hits: after.hits.length, targets: new Set(after.hits.map(hit => hit.target)).size, summons: after.summons.length });
      }
      const effectChecks = await page.evaluate(sect => {
        const scene = window.__scene, p = scene.prog, record = window.__classSmoke, checks = [];
        if (sect === 'taixu') {
          p.hp = p.maxHp; p.mp = p.maxMp; scene.player.hp = p.hp; scene.player.invulnUntil = 0;
          const before = { hp: p.hp, mp: p.mp };
          scene.hurtPlayer(100, scene.player.x - 100, 0);
          const first = { hp: p.hp, mp: p.mp };
          scene.hurtPlayer(100, scene.player.x - 100, 0);
          checks.push({ kind: 'water_mirror', before, first, second: { hp: p.hp, mp: p.mp } });
        } else if (sect === 'youying') {
          const hidden = p.hasBuffEffect('invisible');
          scene.player.finish(scene.time.now);
          const alpha = scene.player.alpha;
          scene.player.body.reset(record.origin.x, record.origin.y - 160); scene.player.body.setAllowGravity(false).setVelocity(0, 0);
          scene.player.body.blocked.down = false; scene.player.body.touching.down = false;
          scene.player.state2 = 'air'; scene.player.lastGroundAt = -9999; scene.player.canDouble = true;
          scene.player.airJumpsUsed = 0; scene.player.attackLockUntil = 0; scene.player.jumpBufferedAt = -9999;
          const input = { left: false, right: false, up: false, down: false, jumpDown: true, attackDown: false };
          scene.player.step(scene.time.now, 0, input, scene.map.ropes);
          const second = { used: scene.player.airJumpsUsed, canDouble: scene.player.canDouble };
          scene.player.step(scene.time.now + 1, 0, input, scene.map.ropes);
          const third = { used: scene.player.airJumpsUsed, canDouble: scene.player.canDouble };
          scene.player.step(scene.time.now + 2, 0, input, scene.map.ropes);
          checks.push({ kind: 'phantom_cloak_and_air_jumps', hidden, alpha, second, third, fourth: scene.player.airJumpsUsed });
          scene.player.body.setAllowGravity(true).reset(record.origin.x, record.origin.y);
        } else if (sect === 'wanshou') {
          const pet = scene.combat.summons[0];
          p.hp = p.maxHp; pet.hp = pet.maxHp; pet.hurtReadyAt = 0;
          const before = { owner: p.hp, pet: pet.hp }, raw = pet.defense + 100;
          scene.combat.receiveSummonDamage(pet, raw, pet.sprite.x - 80);
          checks.push({ kind: 'beast_bond', before, after: { owner: p.hp, pet: pet.hp } });
        }
        return checks;
      }, sect);
      for (const check of effectChecks) {
        if (check.kind === 'water_mirror') {
          assert.equal(check.before.hp - check.first.hp, 70, '水镜应分担30%伤害');
          assert.equal(check.before.mp - check.first.mp, 30, '水镜应按吸收傷害扣灵力');
          assert.deepEqual(check.second, check.first, '无敌帧水镜重复扣灵力或气血');
        } else if (check.kind === 'phantom_cloak_and_air_jumps') {
          assert.equal(check.hidden, true, '隐息布尔效果未生效');
          assert.ok(check.alpha <= 0.35, '隐息术没有显示透明度');
          assert.deepEqual(check.second, { used: 1, canDouble: true }, '幽影第二跳后未保留第三跳');
          assert.deepEqual(check.third, { used: 2, canDouble: false }, '幽影第三跳后未耗尽空跳');
          assert.equal(check.fourth, 2, '幽影出现第四跳');
        } else if (check.kind === 'beast_bond') {
          assert.equal(check.before.owner - check.after.owner, 15, '灵契主人分担未结算');
          assert.equal(check.before.pet - check.after.pet, 85, '灵契灵狼承伤未结算');
        }
      }
      let missingFx = null;
      if (sect === 'tianjian') {
        const fixture = await page.evaluate(() => {
          const scene = window.__scene, record = window.__classSmoke;
          const def = scene.prog.classSkills.find(skill => skill.key === 'default:A');
          const fixture = { id: def.id, originalFx: def.fx, count: record.hits.filter(hit => hit.id === def.id).length,
            slot: scene.prog.hotbar.indexOf(def.id) };
          def.fx = '__missing_fx_fixture';
          scene.player.body.reset(record.origin.x, record.origin.y); scene.player.body.setVelocity(0, 0);
          scene.player.facing = 1; scene.player.state2 = 'ground'; scene.player.skillRooted = false; scene.player.attackLockUntil = 0;
          scene.prog.mp = scene.prog.maxMp;
          record.targets.forEach((mob, index) => { mob.hp = 100000; mob.body.reset(record.origin.x + 100 + index * 38, record.origin.y); });
          return fixture;
        });
        try {
          await pressSkill(page, labels[fixture.slot]);
          await page.waitForFunction(({ id, count }) => window.__classSmoke.hits.filter(hit => hit.id === id).length > count,
            fixture, { timeout: 2500 });
          missingFx = await page.evaluate(() => ({ placeholder: window.__scene.textures.exists('ph_skill_fx'),
            hit: window.__classSmoke.targets.some(mob => mob.hp < 100000) }));
          assert.equal(missingFx.placeholder, true, '缺图没有生成占位特效');
          assert.equal(missingFx.hit, true, '缺图导致技能空转');
        } finally {
          await page.evaluate(({ id, originalFx }) => {
            window.__scene.prog.classSkills.find(skill => skill.id === id).fx = originalFx;
          }, fixture);
        }
      }
      let cooldownAcrossMap = null;
      if (sect === 'taixu' || sect === 'wanshou') {
        const id = sect === 'taixu' ? 'water_mirror' : 'summon_spirit_wolf';
        if (sect === 'wanshou') {
          // 狼在本宗首个技能检查中施放；后续命中/RPC耗时可能已吃掉其10秒冷却。
          // 等原冷却自然结束，再真实按键施放，并在该事件中立即发起换图。
          await page.waitForFunction(id => {
            const scene = window.__scene;
            return Date.now() >= (scene.prog.skillCooldowns[id]?.readyAt ?? 0)
              && scene.time.now >= (scene.combat.cds.get(id)?.readyAt ?? 0);
          }, id, { timeout: 15000 });
        }
        const slot = await page.evaluate(({ id, recast }) => {
          const scene = window.__scene;
          scene.dialog.close(); scene.regenMp = () => {}; scene.prog.mp = scene.prog.maxMp;
          scene.player.state2 = 'ground'; scene.player.skillRooted = false; scene.player.attackLockUntil = 0;
          window.__cooldownSmoke = null;
          const restart = () => {
            const deadline = scene.prog.skillCooldowns[id]?.readyAt, initialRemaining = deadline - Date.now();
            scene.events.once('create', () => {
              scene.dialog.close(); scene.regenMp = () => {}; scene.prog.mp = scene.prog.maxMp;
              scene.player.state2 = 'ground'; scene.player.skillRooted = false; scene.player.attackLockUntil = 0;
              const checkpoint = { deadline, initialRemaining, readyAt: scene.prog.skillCooldowns[id]?.readyAt,
                remaining: scene.combat.cds.get(id)?.readyAt - scene.time.now };
              // 与恢复快照同一时刻重试，避免RPC在真实冷却到期后才送来按键。
              let casts = 0;
              const countCast = event => { if (event.id === id) casts++; };
              scene.events.on('skill:cast', countCast);
              const mp = scene.prog.mp;
              scene.combat.tryCast(scene.prog.hotbar.indexOf(id));
              scene.events.off('skill:cast', countCast);
              window.__cooldownSmoke = { ...checkpoint, blocked: { casts, mpLoss: mp - scene.prog.mp } };
            });
            scene.scene.restart({ map: 'qingyun_village' });
          };
          if (recast) {
            const onCast = event => {
              if (event.id !== id) return;
              scene.events.off('skill:cast', onCast); restart();
            };
            scene.events.on('skill:cast', onCast);
          } else restart();
          return scene.prog.hotbar.indexOf(id);
        }, { id, recast: sect === 'wanshou' });
        if (sect === 'wanshou') await pressSkill(page, labels[slot]);
        await page.waitForFunction(() => window.__scene.map?.id === 'qingyun_village' && window.__cooldownSmoke,
          null, { timeout: 15000 });
        const checkpoint = await page.evaluate(() => window.__cooldownSmoke);
        assert.ok(checkpoint.initialRemaining > 0, `${id}: 独立冷却没有写入进度`);
        assert.equal(checkpoint.readyAt, checkpoint.deadline, `${id}: 换图重置存档冷却`);
        assert.ok(checkpoint.remaining > 0, `${id}: 换图没有恢复战斗冷却`);
        assert.deepEqual(checkpoint.blocked, { casts: 0, mpLoss: 0 }, `${id}: 可通过换图绕过独立冷却`);
        cooldownAcrossMap = { id, retained: true, blocked: true };
      }
      // 调用真实任务 after/turnIn 与 GameScene.giveRewards，通关仅由胜利回调模拟。
      const quest = questRows.find(row => row.id === `q_sect_${sect}`);
      const questCheck = await page.evaluate(quest => {
        const scene = window.__scene, P = scene.prog.constructor, Q = scene.quests.constructor;
        const p = new P(); p.save = () => {}; p.level = quest.reqLevel; p.quests.q_fox = { state: 'done', kills: {} };
        scene.prog = p; scene.quests = new Q(p);
        const accepted = scene.quests.accept(quest.id);
        const early = scene.quests.complete(quest.id);
        const trial = quest.objectives.find(objective => objective.type === 'trial')?.trial;
        if (trial) scene.quests.onTrialComplete(trial);
        const reward = scene.quests.talk(quest.turnIn).after?.();
        if (reward) scene.giveRewards(reward.quest, reward.broke);
        return { accepted, early, completed: p.quests[quest.id]?.state, job: p.job, appearance: p.appearance,
          playerTexture: scene.player.texture.key, hotbar: p.hotbar, robe: p.equip.robe, stones: p.stones,
          duplicate: scene.quests.turnIn(quest.id) ?? null, save: localStorage.getItem('xiantu_save_v1') };
      }, quest);
      assert.equal(questCheck.accepted, true, `${job}: 真实任务不可接`);
      assert.equal(questCheck.early, false, `${job}: 未通关任务可交`);
      assert.equal(questCheck.completed, 'done', `${job}: 真实交付未完成`);
      assert.equal(questCheck.job, job, `${job}: GameScene任务奖励未定下职业`);
      assert.equal(questCheck.appearance, initial.appearance, `${job}: 任务奖励没有换道袍`);
      assert.equal(questCheck.stones, quest.rewards.spiritStone, `${job}: 任务灵石没有发放`);
      assert.equal(questCheck.duplicate, null, `${job}: 重复交付发奖励`);
      assert.equal(questCheck.save, sentinel, `${job}: 测试保存污染真实存档`);
      assert.equal(await page.evaluate(() => localStorage.getItem('xiantu_save_v1')), sentinel, `${job}: 技能保存污染真实存档`);
      await page.waitForTimeout(250);
      assert.deepEqual(errors, [], `${job}: 浏览器出现报错`);
      const result = { job, map, appearance: initial.appearance, castCount: casts.length, casts, effectChecks,
        missingFx, cooldownAcrossMap, questCheck: { completed: questCheck.completed, job: questCheck.job, robe: questCheck.robe }, errors: 0 };
      results.push(result); console.log(JSON.stringify(result));
    } catch (error) {
      console.error(JSON.stringify({ job, map, errors, failure: error.message })); throw error;
    } finally { await page.close(); }
  }
  assert.equal(results.length, 5, '五职业未全部验证');
  assert.equal(results.reduce((sum, result) => sum + result.castCount, 0), 15, '十五个主动/增益未全部施放');
  console.log(JSON.stringify({ passed: 5, castCount: 15, consoleErrors: 0, pageErrors: 0, requestFailures: 0 }));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
