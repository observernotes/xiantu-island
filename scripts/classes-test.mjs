// 按本工程发版快照检查新拜入关口；已有五宗职业继续检查技能与读档。
// QA_TIER_GATE_AWARE: fiveSectClasses
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { dataMode, findRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// 默认检查发版快照；显式 shared 用于同步配表前的逻辑回归。
process.env.XT_DATA ??= 'snapshot';
const dataRoot = findRoot(root);
const server = await createServer({
  root,
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
  plugins: [{ name: 'classes-render-stub', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return '\0classes-phaser'; },
    load(id) {
      if (id !== '\0classes-phaser') return;
      return `class Sprite {} export default { WEBGL: 2, Scene: class {},
        Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
        Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } } };`;
    },
  }], ssr: { noExternal: ['phaser'] },
});
try {
  const features = await server.ssrLoadModule('/src/features.ts');
  let configured = {};
  try {
    const value = JSON.parse(await fs.readFile(path.join(root, 'data/features.json'), 'utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) configured = value;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const expected = Object.fromEntries(features.FEATURE_NAMES.map(name =>
    [name, typeof configured[name] === 'boolean' ? configured[name] : true]));
  let assertions = 0;
  const equal = (actual, wanted, message) => { assert.deepEqual(actual, wanted, message); assertions++; };
  const check = (value, message) => { assert.ok(value, message); assertions++; };
  const near = (actual, wanted, message) => check(Math.abs(actual - wanted) <= 1e-7, message);
  equal(features.featureFlags(), expected, '职业自测读取的发版开关与工程快照不一致');
  if (process.env.QA_TIER_EXPECT_FEATURES) {
    // QA 的关口清单可能早于新开关；其已列出的关口仍须逐项匹配快照。
    for (const [name, value] of Object.entries(JSON.parse(process.env.QA_TIER_EXPECT_FEATURES))) {
      equal(expected[name], value, `QA 关口 ${name} 与工程发版快照不一致`);
    }
  }

  const { CLASS_LIST, CLASS_RULES, classDef, classEntryEnabled, skillsForClass, classRobe } =
    await server.ssrLoadModule('/src/classes.ts');
  const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
  const { QuestSystem } = await server.ssrLoadModule('/src/QuestSystem.ts');
  const { GameScene } = await server.ssrLoadModule('/src/scenes/GameScene.ts');
  const { ITEMS, QUESTS, inPhase } = await server.ssrLoadModule('/src/data.ts');
  const { SKILLS, SKILL_LIST, SKILL_RULES, skillNumber, spEarnedFor } = await server.ssrLoadModule('/src/skills.ts');
  const { dailyQuestDay } = await server.ssrLoadModule('/src/DailyQuests.ts');
  const rawQuests = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
  const saved = {};
  const saveKey = 'xiantu_save_v1';
  globalThis.localStorage = {
    getItem: key => saved[key] ?? null,
    setItem: (key, value) => { saved[key] = String(value); },
    removeItem: key => { delete saved[key]; },
    clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
    key: index => Object.keys(saved)[index] ?? null,
    get length() { return Object.keys(saved).length; },
  };
  const rewardScene = prog => Object.assign(Object.create(GameScene.prototype), {
    prog, player: { syncAppearance() {} }, skillWindow: { refresh() {} },
    log() {}, levelUpFx() {}, maybeSpTip() {},
  });

  if (dataMode(root) === 'shared') {
    equal(QUESTS.q_breakthrough.rewards.skills, [{ id: 'spirit_bolt', level: 1 }], '突破奖励灵气弹来自新表');
    equal(QUESTS.q_fox.rewards.job, undefined, '妖狐新表不定职业');
    equal(QUESTS.q_fox.rewards.skills ?? [], [], '妖狐新表不赠旧剑技');
    equal(QUESTS.q_fox.rewards.items.find(row => row.item === 'five_sect_token')?.count, 1, '妖狐新表奖励五宗帖');
    equal(QUESTS.q_sect_tianjian.rewards.skills,
      ['sword_qi_slash', 'whirl_sword', 'light_body'].map(id => ({ id, level: 1 })), '正式天剑拜入新表赠三招');

    // 交付与发奖都调用真实入口；付费组模拟旧档付费等级（当前表没有 job0 点池）。
    for (const paidLevels of [0, 3]) {
      let p = new Progress(), qs = new QuestSystem(p), scene = rewardScene(p);
      p.level = QUESTS.q_breakthrough.reqLevel;
      p.exp = p.expNeed;
      p.quests.q_snake = { state: 'done', kills: {} };
      equal(qs.accept('q_breakthrough'), true, `付点${paidLevels}: 实际接取突破任务`);
      for (const objective of QUESTS.q_breakthrough.objectives) {
        if (objective.type === 'kill') for (let count = 0; count < objective.count; count++) qs.onKill(objective.target);
      }
      const breakthrough = qs.turnIn('q_breakthrough');
      check(breakthrough?.broke, `付点${paidLevels}: 实际交付完成突破`);
      scene.giveRewards(breakthrough.quest, breakthrough.broke);
      equal(p.job, '', `付点${paidLevels}: 突破不定职业`);
      equal(p.skillLevel('spirit_bolt'), 1, `付点${paidLevels}: 突破真实发奖只赠灵气弹Lv1`);
      equal(p.skillGifted.spirit_bolt, 1, `付点${paidLevels}: 灵气弹赠级记录`);
      equal(p.skillLevel('sword_qi_slash'), 0, `付点${paidLevels}: 突破不偷送剑气斩`);
      p.skills.spirit_bolt += paidLevels;
      equal(p.skillLevel('spirit_bolt'), 1 + paidLevels, `付点${paidLevels}: 赠级和付费等级累加`);
      equal(p.bindHotbar(6, 'spirit_bolt'), true, `付点${paidLevels}: 自定义通用技能键位`);

      equal(qs.accept('q_fox'), true, `付点${paidLevels}: 实际接取妖狐任务`);
      qs.onKill('demon_fox'); p.addItem('fox_tail', 1);
      const fox = qs.turnIn('q_fox');
      check(fox, `付点${paidLevels}: 实际交付妖狐任务`);
      scene.giveRewards(fox.quest, fox.broke);
      equal(p.job, '', `付点${paidLevels}: 交妖狐后不定职业`);
      equal(p.count('five_sect_token'), 1, `付点${paidLevels}: 妖狐真实发奖五宗帖`);
      equal(['sword_qi_slash', 'whirl_sword', 'light_body'].map(id => p.skillLevel(id)), [0, 0, 0],
        `付点${paidLevels}: 妖狐不补发任何旧剑技`);
      equal(p.skillLevel('spirit_bolt'), 1 + paidLevels, `付点${paidLevels}: 妖狐保留已学灵气弹`);
      equal(p.spSpent(0), paidLevels * SKILLS.spirit_bolt.spCost, `付点${paidLevels}: 妖狐保留实际花点`);
      const beforeLoad = { skills: p.skills, gifted: p.skillGifted, hotbar: p.hotbar, refund: p.classRefundSp };
      p.save(); p = Progress.load(); qs = new QuestSystem(p); scene = rewardScene(p);
      equal(p.job, '', `付点${paidLevels}: 新版已交妖狐存档重读仍未入宗`);
      equal({ skills: p.skills, gifted: p.skillGifted, hotbar: p.hotbar, refund: p.classRefundSp }, beforeLoad,
        `付点${paidLevels}: 妖狐存读不改技能点数和自定义热键`);

      equal(qs.accept('q_sect_tianjian'), true, `付点${paidLevels}: 实际接取正式天剑任务`);
      equal(p.job, '', `付点${paidLevels}: 接取正式任务仍未入宗`);
      const joined = qs.talk(QUESTS.q_sect_tianjian.turnIn, 'q_sect_tianjian').after?.();
      check(joined?.quest.id === 'q_sect_tianjian', `付点${paidLevels}: 对话交付正式天剑任务`);
      equal(p.job, '', `付点${paidLevels}: 正式任务发奖前未定职业`);
      scene.giveRewards(joined.quest, joined.broke);
      equal(p.job, 'tianjian_disciple', `付点${paidLevels}: 正式发奖才落定天剑职业`);
      equal(p.skillLevel('spirit_bolt'), 0, `付点${paidLevels}: 入宗替换灵气弹`);
      equal(p.classRefundSp, paidLevels * SKILLS.spirit_bolt.spCost, `付点${paidLevels}: 仅付费灵气弹等级返点`);
      equal(p.hotbar[6], 'sword_qi_slash', `付点${paidLevels}: 入门技继承通用技能自定义热键`);
      equal(['sword_qi_slash', 'whirl_sword', 'light_body'].map(id => p.skillLevel(id)), [1, 1, 1],
        `付点${paidLevels}: 正式拜入按新表赠三招`);
      equal(p.spSpent(1), 0, `付点${paidLevels}: 三招赠级不占一转点数`);
      equal(p.spLeftFor(1), spEarnedFor(p.level, 1, true) + paidLevels * SKILLS.spirit_bolt.spCost,
        `付点${paidLevels}: 一转可用点含且仅含付费退款`);
      equal(qs.turnIn('q_sect_tianjian'), undefined, `付点${paidLevels}: 正式任务不能重复交付`);
      p.save(); const reloaded = Progress.load();
      const stable = { skills: reloaded.skills, gifted: reloaded.skillGifted, hotbar: reloaded.hotbar,
        refund: reloaded.classRefundSp, inventory: reloaded.inventory, equip: reloaded.equip,
        stones: reloaded.stones, sp: reloaded.spLeftFor(1) };
      equal(reloaded.backfillClass(), false, `付点${paidLevels}: 重复职业迁移无收益`);
      reloaded.save(); const second = Progress.load();
      equal({ skills: second.skills, gifted: second.skillGifted, hotbar: second.hotbar,
        refund: second.classRefundSp, inventory: second.inventory, equip: second.equip,
        stones: second.stones, sp: second.spLeftFor(1) }, stable, `付点${paidLevels}: 重复保存读档不重复返点或奖励`);
    }
  }
  const skippedClosedEntrances = [];
  const openEntrances = [];
  for (const cls of CLASS_LIST) {
    const raw = rawQuests.find(quest => quest.id === cls.joinQuest);
    check(raw, `${cls.id}: 快照保留拜入任务数据`);
    const gateOpen = cls.sect === CLASS_RULES.unjoinedSkillSect || expected.fiveSectClasses;
    equal(classEntryEnabled(cls), gateOpen, `${cls.id}: 职业关口遵循快照`);
    const p = new Progress(), qs = new QuestSystem(p);
    p.level = raw.reqLevel;
    p.quests.q_fox = { state: 'done', kills: {} };
    p.grantSkill('spirit_bolt', 4);
    const before = JSON.stringify(p), storedBefore = saved[saveKey];
    if (!gateOpen || !QUESTS[cls.joinQuest] || !inPhase(raw)) {
      equal(qs.available(cls.joinQuest), false, `${cls.id}: 关闭或未来阶段任务不可接`);
      equal(qs.accept(cls.joinQuest), false, `${cls.id}: 接取不能绕过关口`);
      if (!gateOpen) equal(p.advanceClass(cls.id), false, `${cls.id}: 新拜入不能绕过关闭开关`);
      equal(JSON.stringify(p), before, `${cls.id}: 拒绝入口不改变角色、技能或奖励`);
      equal(saved[saveKey], storedBefore, `${cls.id}: 拒绝入口不写存档`);
      skippedClosedEntrances.push({ job: cls.id, reason: !gateOpen ? 'fiveSectClasses=false' : '任务不在当前阶段' });
      continue;
    }
    equal(qs.available(cls.joinQuest), true, `${cls.id}: 发布任务入口仍可用`);
    equal(qs.accept(cls.joinQuest), true, `${cls.id}: 发布任务仍可接取`);
    equal(qs.complete(cls.joinQuest), false, `${cls.id}: 接取不能直接完成`);
    const trial = QUESTS[cls.joinQuest].objectives.find(objective => objective.type === 'trial')?.trial;
    if (trial) equal(qs.onTrialComplete(trial), true, `${cls.id}: 胜利回调完成正式目标`);
    else qs.talk(QUESTS[cls.joinQuest].turnIn);
    const reward = qs.turnIn(cls.joinQuest);
    equal(reward?.quest.id, cls.joinQuest, `${cls.id}: 正式拜入任务可交付`);
    rewardScene(p).giveRewards(reward.quest, reward.broke);
    equal(p.job, cls.id, `${cls.id}: 正式交付确定职业`);
    equal(p.equip.robe, classRobe(cls), `${cls.id}: 正式拜入奖励道袍`);
    equal(qs.turnIn(cls.joinQuest), undefined, `${cls.id}: 拜入奖励不可重复领取`);
    openEntrances.push(cls.id);
  }

  // 所有新拜入入口已发布时，仍执行原完整五宗逻辑/数值套件。
  if (skippedClosedEntrances.length === 0) {
    await server.ssrLoadModule('/src/classes.test.ts');
    console.log(JSON.stringify({ passed: true, suite: 'classes-release-gates', classes: CLASS_LIST.length,
      assertions, features: expected, openEntrances, skippedClosedEntrances, fullSuite: true }));
  } else {
    // 关闭新拜入不会删除已有职业的数据、技能效果或存档。这里不打开任何运行时关口。
    const trees = {
      tianjian_disciple: ['sword_qi_slash', 'whirl_sword', 'light_body', 'tianjian_heart', 'sword_mastery'],
      taixu_acolyte: ['fire_talisman_bolt', 'thunder_palm', 'water_mirror', 'taixu_heart', 'five_element_attune'],
      lingfu_novice: ['paper_talisman_throw', 'scatter_talisman', 'talisman_step', 'lingfu_heart', 'talisman_supply'],
      youying_shadow: ['shadow_dart', 'shadow_step', 'phantom_cloak', 'youying_heart', 'light_foot'],
      wanshou_tamer: ['summon_spirit_wolf', 'beast_roar', 'beast_bond', 'wanshou_heart', 'beast_mastery'],
    };
    equal(CLASS_LIST.map(cls => cls.id).sort(), Object.keys(trees).sort(), '五职业数据保留且 id 不重复');
    equal(new Set(SKILL_LIST.map(skill => skill.id)).size, SKILL_LIST.length, '技能 id 不重复');
    const rootFields = new Set(['mpCost', 'cooldownMs', 'damageRatio', 'hitCount', 'maxTargets', 'durationMs']);
    const tableNumber = (skill, field, level) => {
      if (level <= 0) return 0;
      const effect = skill.effects?.[field], rootValue = skill[field];
      const base = typeof effect === 'number' ? effect : rootFields.has(field) && typeof rootValue === 'number' ? rootValue : undefined;
      const perLevel = skill.perLevel?.[field] ?? 0;
      const value = base === undefined ? perLevel * level : base + perLevel * (level - 1);
      return field === 'count' || /(?:Count|Targets)$/.test(field) ? Math.floor(value + 1e-8) : value;
    };
    let skillRows = 0, legacyClasses = 0;
    for (const cls of CLASS_LIST) {
      const tree = skillsForClass(cls.id), raw = rawQuests.find(quest => quest.id === cls.joinQuest);
      equal(classDef(cls.id), cls, `${cls.id}: 职业登记保留`);
      equal(tree.map(skill => skill.id), trees[cls.id], `${cls.id}: 完整技能树保留`);
      equal(tree.filter(skill => skill.type === 'passive').length, 2, `${cls.id}: 两个被动保留`);
      equal(tree.filter(skill => skill.type !== 'passive').length, 3, `${cls.id}: 三个主动/增益保留`);
      const robe = raw.rewards.items.find(reward => ITEMS[reward.item]?.slot === 'robe' && ITEMS[reward.item]?.sect === cls.sect)?.item;
      check(robe && ITEMS[robe].appearance, `${cls.id}: 旧档道袍和外观数据保留`);
      for (const skill of tree) {
        equal(skill.sect, cls.sect, `${skill.id}: 技能所属宗门`);
        equal(skill.job, 1, `${skill.id}: 一转技能`);
        check(skill.maxLevel > 0 && skill.spCost >= 0, `${skill.id}: 等级和费用合法`);
        const cap = skill.maxLevel + (skill.masteryToCap ? SKILL_RULES.masteryCapBonus : 0);
        for (let level = 0; level <= cap; level++) {
          for (const field of new Set([...rootFields, ...Object.keys(skill.perLevel), ...Object.keys(skill.effects)])) {
            near(skillNumber(skill, field, level), tableNumber(skill, field, level), `${skill.id} Lv${level}.${field}: 数值契约`);
          }
          for (const field of rootFields) check(skillNumber(skill, field, level) >= 0, `${skill.id} Lv${level}.${field}: 非负`);
          for (const field of ['paralyzeChance', 'damageToMpRatio', 'ammoSaveChance', 'critRate', 'petDamageShareRatio']) {
            const value = skillNumber(skill, field, level);
            check(value >= 0 && value <= 1, `${skill.id} Lv${level}.${field}: 比例合法`);
          }
        }
        skillRows++;
      }
      const active = tree.filter(skill => skill.type !== 'passive');
      const now = Date.now();
      const old = { level: 30, job: cls.id, classVersion: 1, classRewardClaims: [cls.id],
        skills: Object.fromEntries(tree.map(skill => [skill.id, skill.type === 'passive' ? 1 : 2])),
        skillGifted: Object.fromEntries(active.map(skill => [skill.id, 1])),
        skillMastery: Object.fromEntries(active.map(skill => [skill.id, 99])),
        hotbar: [active[2].id, null, active[0].id, active[1].id, null, null, null, null],
        equip: { robe }, inventory: { hp_pill_small: 7 }, sectRank: 'inner_disciple', sectContribution: 1234,
        quests: { q_fox: { state: 'done', kills: {} }, [cls.joinQuest]: { state: 'done', kills: {} } },
        skillCooldowns: { [active[0].id]: { readyAt: now + 60000, total: 60000 } },
        // 旧档里所有开关为 true，也不能重新打开本工程关闭的发版入口。
        dailyQuestResetDay: dailyQuestDay(now), ageUpdatedAt: now,
        flags: Object.fromEntries(features.FEATURE_NAMES.map(name => [name, true])) };
      saved[saveKey] = JSON.stringify(old);
      const loaded = Progress.load();
      for (const field of ['job', 'skills', 'skillGifted', 'skillMastery', 'hotbar', 'equip', 'inventory',
        'sectRank', 'sectContribution', 'skillCooldowns']) equal(loaded[field], old[field], `${cls.id}: 旧档 ${field} 保留`);
      equal(loaded.classSkills.map(skill => skill.id), trees[cls.id], `${cls.id}: 旧档运行时技能树可用`);
      for (const skill of tree) equal(loaded.ownsSkill(skill), true, `${skill.id}: 旧档仍可使用本宗技能`);
      equal(loaded.backfillClass(), false, `${cls.id}: 重复旧档迁移不改变职业奖励`);
      loaded.save();
      const roundtrip = Progress.load();
      for (const field of ['job', 'skills', 'hotbar', 'sectRank', 'sectContribution', 'skillCooldowns']) {
        equal(roundtrip[field], loaded[field], `${cls.id}: 二次读档 ${field} 稳定`);
      }
      const versionless = { ...old };
      delete versionless.classVersion; delete versionless.classRewardClaims;
      saved[saveKey] = JSON.stringify(versionless);
      const migrated = Progress.load();
      equal(migrated.job, cls.id, `${cls.id}: 缺迁移版本的旧档职业保留`);
      equal(migrated.skills, old.skills, `${cls.id}: 旧版本迁移保留已学等级`);
      equal(migrated.skillMastery, old.skillMastery, `${cls.id}: 旧版本迁移保留熟练度`);
      equal(features.featureFlags(), expected, `${cls.id}: 存档 flags 不能越过发版快照`);
      legacyClasses++;
    }
    console.log(JSON.stringify({ passed: true, suite: 'classes-release-gates', classes: CLASS_LIST.length,
      assertions, features: expected, openEntrances, skippedClosedEntrances, legacyClasses, skillRows, fullSuite: false }));
  }
  // 四宗新入口关闭时也必须覆盖通用技能替换、退款及已有五宗旧档迁移。
  await server.ssrLoadModule('/src/class-entry.test.ts');
} finally {
  await server.close();
}
