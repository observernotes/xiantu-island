import { GROWTH, ITEMS, QUESTS, REALMS } from './data';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { CLASS_LIST, classDef, classForQuest, classRobe, skillsForClass } from './classes';
import { SKILLS, SKILL_LIST, SKILL_RULES, skillNumber, type SkillDef } from './skills';

let assertions = 0;
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} != ${String(expected)}`);
}
function near(actual: number, expected: number, message: string, epsilon = 1e-7) {
  ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}

const saved: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';
globalThis.localStorage = {
  getItem: key => saved[key] ?? null,
  setItem: (key, value) => { saved[key] = String(value); },
  removeItem: key => { delete saved[key]; },
  clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
  key: index => Object.keys(saved)[index] ?? null,
  get length() { return Object.keys(saved).length; },
};

// 明确设计中的五棵树，防止错误的 sect 筛选仍得到一个看似完整的树。
const expectedTrees: Record<string, string[]> = {
  tianjian_disciple: ['sword_qi_slash', 'whirl_sword', 'light_body', 'tianjian_heart', 'sword_mastery'],
  taixu_acolyte: ['fire_talisman_bolt', 'thunder_palm', 'water_mirror', 'taixu_heart', 'five_element_attune'],
  lingfu_novice: ['paper_talisman_throw', 'scatter_talisman', 'talisman_step', 'lingfu_heart', 'talisman_supply'],
  youying_shadow: ['shadow_dart', 'shadow_step', 'phantom_cloak', 'youying_heart', 'light_foot'],
  wanshou_tamer: ['summon_spirit_wolf', 'beast_roar', 'beast_bond', 'wanshou_heart', 'beast_mastery'],
};
same(CLASS_LIST.map(row => row.id).sort(), Object.keys(expectedTrees).sort(), '五职业 id 完整且无重复');
eq(new Set(SKILL_LIST.map(row => row.id)).size, SKILL_LIST.length, '技能 id 无重复');

// 独立计算表字段，覆盖 Lv1 基础、纯成长、effects 优先和计数字段取整。
const rootFields = new Set(['mpCost', 'cooldownMs', 'damageRatio', 'hitCount', 'maxTargets', 'durationMs']);
function tableNumber(def: SkillDef, field: string, level: number) {
  if (level <= 0) return 0;
  const per = def.perLevel?.[field] ?? 0;
  const effect = def.effects?.[field];
  const root = (def as unknown as Record<string, unknown>)[field];
  const base = typeof effect === 'number' ? effect : rootFields.has(field) && typeof root === 'number' ? root : undefined;
  const value = base === undefined ? per * level : base + per * (level - 1);
  return field === 'count' || /(?:Count|Targets)$/.test(field) ? Math.floor(value + 1e-8) : value;
}

for (const job of CLASS_LIST) {
  const tree = skillsForClass(job.id);
  same(tree.map(row => row.id), expectedTrees[job.id], `${job.id}: 树与设计逐项一致`);
  eq(tree.filter(row => row.type === 'passive').length, 2, `${job.id}: 两个被动`);
  eq(tree.filter(row => row.type === 'buff').length, 1, `${job.id}: 一个增益`);
  eq(tree.filter(row => row.type === 'active').length, 2, `${job.id}: 两个主动`);
  const quest = Object.values(QUESTS).find(row => classForQuest(row.id)?.id === job.id);
  ok(quest, `${job.id}: 拜宗任务存在`);
  eq(classDef(job.id), job, `${job.id}: 职业查询保持原表对象`);
  const robe = classRobe(job);
  ok(robe && ITEMS[robe]?.appearance, `${job.id}: 奖励道袍 appearance 完整`);
  ok(quest.rewards.items.some(row => row.item === robe), `${job.id}: 道袍确实来自任务奖励`);
  for (const skill of tree) {
    eq(skill.sect, job.sect, `${skill.id}: 所属宗门`);
    eq(skill.job, 1, `${skill.id}: 一转技能`);
    ok(skill.maxLevel > 0 && skill.spCost >= 0, `${skill.id}: 等级/加点费用合法`);
    if (skill.type === 'passive') eq(skill.fx, null, `${skill.id}: 被动没有特效`);
    for (const [id, level] of Object.entries(skill.req ?? {})) {
      if (id === 'realm') ok(REALMS.some(row => row.id === level), `${skill.id}: 境界前置存在`);
      else if (id === 'item') ok(ITEMS[String(level)], `${skill.id}: 物品前置存在`);
      else {
        ok(tree.some(row => row.id === id), `${skill.id}: 技能前置属于本树`);
        ok(Number(level) > 0 && Number(level) <= SKILLS[id].maxLevel, `${skill.id}: 前置等级合法`);
      }
    }
    const cap = skill.maxLevel + (skill.masteryToCap ? SKILL_RULES.masteryCapBonus : 0);
    for (let level = 0; level <= cap; level++) {
      for (const field of new Set([...rootFields, ...Object.keys(skill.perLevel), ...Object.keys(skill.effects)])) {
        near(skillNumber(skill, field, level), tableNumber(skill, field, level), `${skill.id} Lv${level}.${field}`);
      }
      for (const field of rootFields) ok(skillNumber(skill, field, level) >= 0, `${skill.id} Lv${level}.${field} 非负`);
      for (const field of ['paralyzeChance', 'damageToMpRatio', 'ammoSaveChance', 'critRate', 'petDamageShareRatio']) {
        const value = skillNumber(skill, field, level);
        ok(value >= 0 && value <= 1, `${skill.id} Lv${level}.${field} 比例合法`);
      }
    }
  }
  const p = new Progress(); p.level = quest.reqLevel; p.grantSkill('spirit_bolt', 4);
  const unjoined = { job: p.job, skills: { ...p.skills }, hotbar: [...p.hotbar] };
  p.ensureDefaults();
  same({ job: p.job, skills: p.skills, hotbar: p.hotbar }, unjoined, `${job.id}: 未拜入角色读档不变`);
  eq(p.advanceClass(job.id), true, `${job.id}: 可以首次拜入`);
  eq(p.job, job.id, `${job.id}: 职业落定`);
  eq(p.hotbar[0], tree.find(skill => skill.key === 'default:A')?.id, `${job.id}: 新拜入入门技遵循默认 A 键`);
  same(p.classSkills.map(row => row.id), expectedTrees[job.id], `${job.id}: 运行时树来自本职业`);
  for (const skill of tree) {
    eq(p.skillLevel(skill.id), skill.type === 'passive' ? 0 : 1, `${job.id}: 只赠三招 Lv1`);
    if (skill.type !== 'passive') ok(p.hotbar.includes(skill.id), `${skill.id}: 赠技绑定快捷键`);
  }
  ok(p.hotbar.every(id => id === null || tree.some(row => row.id === id && row.type !== 'passive')), `${job.id}: 快捷栏没有外宗/被动`);
  eq(p.skillLevel('spirit_bolt'), 0, `${job.id}: 替换灵气弹`);
  eq(p.spLeftFor(1), SKILL_RULES.spPerLevel + SKILL_RULES.jobAdvanceBonusSp, `${job.id}: 赠技不占 SP`);
  eq(p.equip.robe, robe, `${job.id}: 宗门道袍实际穿上`);
  eq(p.appearance, ITEMS[robe!].appearance, `${job.id}: 外观读 appearance`);
  eq(p.advanceClass(CLASS_LIST.find(other => other.id !== job.id)!.id), false, `${job.id}: 不可改换宗门`);
  const snapshot = JSON.stringify({ skills: p.skills, equip: p.equip, inventory: p.inventory, hotbar: p.hotbar });
  p.advanceClass(job.id); p.backfillClass();
  eq(JSON.stringify({ skills: p.skills, equip: p.equip, inventory: p.inventory, hotbar: p.hotbar }), snapshot, `${job.id}: 重复拜入/迁移不重复领奖`);
  const passive = tree.find(row => row.type === 'passive')!;
  p.level = quest.reqLevel - 1;
  eq(p.addSkillPoint(passive.id).ok, false, `${job.id}: 低于职业等级不能加点`);
  p.level = quest.reqLevel;
  eq(p.addSkillPoint(passive.id).ok, true, `${job.id}: 达到职业等级可加被动`);
  eq(p.bindHotbar(7, passive.id), false, `${job.id}: 已学被动仍不能绑定快捷键`);
  eq(p.spSpent(1), passive.spCost, `${job.id}: 实际加点扣 SP`);
  const foreign = SKILL_LIST.find(row => row.job === 1 && row.sect !== job.sect)!;
  eq(p.addSkillPoint(foreign.id).ok, false, `${job.id}: 不可加外宗技能`);
  const dependent = tree.find(row => Object.keys(row.req ?? {}).some(id => !!SKILLS[id]));
  if (dependent) {
    const reqId = Object.keys(dependent.req!).find(id => !!SKILLS[id])!;
    p.skills[reqId] = 0; p.skills[dependent.id] = 0;
    eq(p.prereqMet(dependent), false, `${dependent.id}: 前置未达到`);
    eq(p.addSkillPoint(dependent.id).ok, false, `${dependent.id}: 未达前置拒绝加点`);
    p.skills[reqId] = Number(dependent.req![reqId]);
    eq(p.prereqMet(dependent), true, `${dependent.id}: 前置等于边界可用`);
  }
  for (const skill of tree.filter(row => row.type !== 'passive')) {
    p.skills[skill.id] = 1;
    near(p.skillMpCost(skill.id), skillNumber(skill, 'mpCost', 1), `${skill.id}: 灵力消耗来自表`);
    ok(p.skillCooldownMs(skill.id) >= skillNumber(skill, 'cooldownMs', 1), `${skill.id}: 冷却保留表下限`);
    ok(p.skillRecoverMs(skill.id) >= 0, `${skill.id}: 后摇合法`);
    p.skills[skill.id] = p.skillCap(skill);
    eq(p.addSkillPoint(skill.id).ok, false, `${skill.id}: 满级禁止越界`);
  }
}

// 老剑徒的已学等级、赠技、熟练度与自定义键位必须原样保留。
{
  const old = { level: 20, job: 'tianjian_disciple', skills: { sword_qi_slash: 7, whirl_sword: 4, light_body: 2, tianjian_heart: 3 },
    skillGifted: { sword_qi_slash: 1, whirl_sword: 1, light_body: 1 }, skillMastery: { sword_qi_slash: 412 },
    hotbar: ['light_body', null, 'sword_qi_slash', 'whirl_sword', null, null, null, null], equip: { robe: 'fox_robe' },
    quests: { q_fox: { state: 'done', kills: {} } } };
  saved[saveKey] = JSON.stringify(old);
  const p = Progress.load();
  same(p.skills, old.skills, '老剑徒技能等级兼容');
  same(p.skillGifted, old.skillGifted, '老剑徒赠技兼容');
  same(p.skillMastery, old.skillMastery, '老剑徒熟练度兼容');
  same(p.hotbar, old.hotbar, '老剑徒自定义快捷键兼容');
  same(p.equip, old.equip, '老剑徒装备兼容');
  eq(p.job, old.job, '老剑徒职业兼容');
  const spent = (7 - 1) + (4 - 1) + (2 - 1) + 3;
  eq(p.spSpent(1), spent, '老剑徒已花 SP 兼容');
  p.save(); const second = Progress.load();
  same(second.skills, p.skills, '自动迁移保存后再次读档稳定');
  same(second.hotbar, p.hotbar, '迁移重复运行不重排快捷键');
}

// 真实任务接口：未接取或未胜利不可交付；胜利回调、NPC 入口和旧档迁移完整。
for (const job of CLASS_LIST) {
  const p = new Progress(), qs = new QuestSystem(p), quest = QUESTS[job.joinQuest];
  p.level = quest.reqLevel; p.quests.q_fox = { state: 'done', kills: {} };
  const trial = quest.objectives.find(objective => objective.type === 'trial')?.trial;
  if (trial) eq(qs.onTrialComplete(trial), false, `${job.id}: 未接任务不登记试炼通关`);
  eq(qs.mark(quest.giver), '!', `${job.id}: NPC 动态任务入口可见`);
  eq(qs.accept(quest.id), true, `${job.id}: 接取本宗拜入任务`);
  eq(qs.complete(quest.id), false, `${job.id}: 进图/接取不能视为完成`);
  eq(qs.turnIn(quest.id), undefined, `${job.id}: 未完成不发奖励`);
  if (trial) {
    eq(qs.onTrialComplete('__unknown_trial'), false, `${job.id}: 非任务试炼回调不登记`);
    eq(qs.onTrialComplete(trial), true, `${job.id}: 胜利回调登记目标试炼`);
    eq(qs.onTrialComplete(trial), false, `${job.id}: 通关回调幂等`);
  } else qs.talk(quest.turnIn);
  eq(qs.complete(quest.id), true, `${job.id}: 完成表内目标后可以交付`);
  eq(qs.mark(quest.turnIn), '?', `${job.id}: 交付 NPC 标记`);
  eq(qs.turnIn(quest.id)?.quest.id, quest.id, `${job.id}: 真实交付返回本宗奖励`);
  eq(qs.turnIn(quest.id), undefined, `${job.id}: 不可重复交付`);
  p.save(); const migrated = Progress.load();
  eq(migrated.job, job.id, `${job.id}: 完成任务的旧档自动落定职业`);
  eq(migrated.appearance, ITEMS[classRobe(job)!].appearance, `${job.id}: 完成任务旧档补本宗外观`);
  const other = CLASS_LIST.find(row => row.id !== job.id)!;
  eq(new QuestSystem(migrated).available(other.joinQuest), false, `${job.id}: 已入宗不提供外宗任务`);
}

// paid spirit_bolt 是 job0 技能：已付点跨池退还一次，任务赠送等级不能重复退。
{
  const p = new Progress(); p.level = 10; p.grantSkill('spirit_bolt', 1);
  p.skills.spirit_bolt = 4; p.skillMastery.spirit_bolt = 99;
  p.buffs.push({ id: 'spirit_bolt', expireAt: Date.now() + 10000 });
  p.advanceClass('taixu_acolyte');
  eq(p.classRefundSp, 3 * SKILLS.spirit_bolt.spCost, '已付灵气弹技能点跨池退还');
  eq(p.spLeftFor(1), 7, '一转点数包括退回的3点');
  eq(p.skillMastery.spirit_bolt, undefined, '替换技能移除旧熟练度');
  eq(p.buffs.some(buff => buff.id === 'spirit_bolt'), false, '替换技能移除残留增益');
  p.backfillClass(); p.save(); const reload = Progress.load();
  eq(reload.classRefundSp, p.classRefundSp, '退点记录持久化且不重复');
}

// 客户端属性/后摇/伤害 getter 必须与设计模型使用的效果契约一致。
{
  const random = Math.random;
  Math.random = () => 0.5;
  try {
    for (const job of CLASS_LIST) {
      const p = new Progress(); p.level = 29; p.advanceClass(job.id);
      const baseAtk = p.atk, baseMatk = p.matk;
      for (const skill of p.classSkills) p.skills[skill.id] = skill.maxLevel;
      if (job.sect === 'tianjian') near(p.atk - baseAtk, skillNumber(SKILLS.tianjian_heart, 'atk', 10), '剑修心法实际增加攻击');
      if (job.sect === 'taixu') near(p.matk - baseMatk, skillNumber(SKILLS.taixu_heart, 'spirit', 10) * GROWTH.statEffects.spirit.matk, '太虚心法实际增加法攻');
      if (job.sect === 'wanshou') near(p.atk - baseAtk, skillNumber(SKILLS.wanshou_heart, 'rootBone', 10) * GROWTH.statEffects.rootBone.atk, '万兽心法根骨按成长表转成攻击');
      const main = p.classSkills.find(skill => skill.key === 'default:A')!;
      const level = p.skillLevel(main.id), ratio = skillNumber(main, 'damageRatio', level);
      const attack = main.effects.damageStat === 'matk' ? p.matk : p.atk;
      const roll = 1 + p.passiveBonus('minDamageRatio') / 2;
      near(p.skillDamageTo(main.id, level, p.level, 8, ratio), Math.max(1, Math.round(attack * ratio * roll - 8)), `${job.id}: 实际伤害先乘倍率再扣防`);
      if (job.sect === 'taixu') {
        p.rootElement = 'fire';
        const bonus = p.passiveBonus('sameElementDamageBonus');
        near(p.skillDamageTo(main.id, level, p.level, 8, ratio), Math.round(attack * ratio * (1 + bonus) - 8), '太虚同属性实际伤害加成');
      }
      if (job.sect === 'youying') near(p.skillDamageTo(main.id, level, p.level, 8, ratio, true), Math.round(attack * ratio * 1.5 - 8), '幽影必暴每段先乘1.5再扣防');
      if (job.sect === 'lingfu') {
        const baseCd = p.skillCooldownMs(main.id), baseRecover = p.skillRecoverMs(main.id);
        p.buffs.push({ id: 'talisman_step', expireAt: Date.now() + 10000 });
        const rate = 1 + skillNumber(SKILLS.talisman_step, 'attackSpeedRatio', 10);
        near(p.skillAttackRate(main), rate, '疾行符实际攻速频率');
        near(p.skillCooldownMs(main.id), baseCd / rate, '疾行符实际缩短冷却');
        near(p.skillRecoverMs(main.id), baseRecover / rate, '疾行符实际缩短后摇');
        p.buffs[0].expireAt = Date.now() - 1;
        near(p.skillCooldownMs(main.id), baseCd, '增益过期恢复原冷却');
      }
    }
  } finally { Math.random = random; }
}

// invisible 是布尔效果；数值 buffBonus 不能代替布尔接口。
{
  const p = new Progress(); p.level = 10; p.advanceClass('youying_shadow');
  eq(p.hasBuffEffect('invisible'), false, '未施放时无隐身');
  p.buffs.push({ id: 'phantom_cloak', expireAt: Date.now() + 10000 });
  eq(p.hasBuffEffect('invisible'), true, '读取活跃布尔隐身效果');
  eq(p.hasBuffEffect('dropAggro'), true, '读取活跃布尔脱战效果');
  eq(p.buffBonus('invisible'), 0, '布尔效果不混入数值加成');
  p.buffs[0].expireAt = Date.now() - 1;
  eq(p.hasBuffEffect('invisible'), false, '过期隐身不能生效');
  p.buffs[0].expireAt = Date.now() + 10000; p.job = 'taixu_acolyte';
  eq(p.hasBuffEffect('invisible'), false, '外宗残留隐身不能生效');
}

// 独立冷却保存墙钟 deadline；旧档缺字段、损坏字段和过期记录要安全归一。
{
  const p = new Progress(); p.level = 10; p.advanceClass('taixu_acolyte');
  const readyAt = Date.now() + 30000;
  p.skillCooldowns = {
    water_mirror: { readyAt, total: 30000 },
    fire_talisman_bolt: { readyAt: Date.now() - 1, total: 450 },
    thunder_palm: { readyAt: Infinity, total: 450 },
    phantom_cloak: { readyAt, total: -1 },
    missing_skill: { readyAt, total: 1000 },
  };
  p.ensureDefaults();
  same(p.skillCooldowns, { water_mirror: { readyAt, total: 30000 } }, '冷却过滤过期/非有限/未知/非法费用字段');
  p.save(); const loaded = Progress.load();
  same(loaded.skillCooldowns, p.skillCooldowns, '独立冷却绝对截止时间存档保持');
  saved[saveKey] = JSON.stringify({ level: 10, job: 'taixu_acolyte' });
  same(Progress.load().skillCooldowns, {}, '旧档没有冷却字段自动补空表');
  saved[saveKey] = JSON.stringify({ level: 10, skillCooldowns: [] });
  same(Progress.load().skillCooldowns, {}, '错误的冷却数组归一为空表');
}

// 持续单体设计模型，逐项复现 balance/08_五宗一转技能.md；这是数值契约，非客户端实测。
const buildFields: Record<string, string[]> = {
  tianjian: ['sword_qi_slash', 'tianjian_heart', 'sword_mastery'],
  taixu: ['fire_talisman_bolt', 'taixu_heart', 'five_element_attune'],
  lingfu: ['paper_talisman_throw', 'talisman_step'],
  youying: ['shadow_dart', 'youying_heart'],
  wanshou: ['summon_spirit_wolf', 'beast_roar', 'wanshou_heart', 'beast_mastery'],
};
function expectedDamage(atk: number, ratio: number, defense: number, hits = 1, roll = 1, crit = 0, critDamage = 1.5) {
  return hits * (Math.max(1, atk * ratio * roll - defense) * (1 - crit) + Math.max(1, atk * ratio * roll * critDamage - defense) * crit);
}
function dps(sect: string, levels: number[], defense: number, matching = true) {
  const main = SKILLS[buildFields[sect][0]], n = skillNumber;
  const ratio = n(main, 'damageRatio', levels[0]);
  const interval = Math.max(n(main, 'cooldownMs', levels[0]), sect === 'tianjian' ? 400 : 0) / 1000;
  if (sect === 'tianjian') return expectedDamage(100 + n(SKILLS.tianjian_heart, 'atk', levels[1]), ratio, defense,
    1, 1 + n(SKILLS.sword_mastery, 'minDamageRatio', levels[2]) / 2) / interval;
  if (sect === 'taixu') return expectedDamage(100 + n(SKILLS.taixu_heart, 'spirit', levels[1]) * GROWTH.statEffects.spirit.matk,
    ratio * (1 + (matching ? n(SKILLS.five_element_attune, 'sameElementDamageBonus', levels[2]) : 0)), defense) / interval;
  if (sect === 'lingfu') return expectedDamage(100, ratio, defense) * (1 + n(SKILLS.talisman_step, 'attackSpeedRatio', levels[1])) / interval *
    (1 - n(SKILLS.talisman_step, 'recoverMs', levels[1]) / n(SKILLS.talisman_step, 'durationMs', levels[1]));
  if (sect === 'youying') {
    const crit = n(SKILLS.youying_heart, 'critRate', levels[1]);
    const normal = expectedDamage(100, ratio, defense, n(main, 'hitCount', levels[0]), 1, crit, n(main, 'critDamage', levels[0]));
    const forced = expectedDamage(100, ratio, defense, n(main, 'hitCount', levels[0]), 1, 1, n(main, 'critDamage', levels[0]));
    const cd = n(SKILLS.phantom_cloak, 'cooldownMs', 1) / 1000;
    return normal / interval * (1 - n(SKILLS.phantom_cloak, 'recoverMs', 1) / 1000 / cd) + (forced - normal) / cd;
  }
  const [wolf, roar, heart, mastery] = levels, m = SKILLS.beast_mastery, r = SKILLS.beast_roar;
  const count = Math.min(n(m, 'maxSummons', Math.max(1, mastery)), 1 + n(m, 'extraSummonCount', mastery));
  const atk = 100 + n(SKILLS.wanshou_heart, 'rootBone', heart) * GROWTH.statEffects.rootBone.atk;
  const duration = (n(main, 'durationMs', wolf) + n(m, 'petDurationMs', mastery)) / 1000;
  const refresh = duration / count;
  if (refresh < interval) throw new Error('万兽稳态续召间隔小于冷却');
  const roarCd = n(r, 'cooldownMs', roar) / 1000;
  const uptime = Math.min(1, n(r, 'durationMs', roar) / 1000 / roarCd), boost = n(r, 'petAtkRatio', roar);
  let pets = 0;
  for (let index = 0; index < count; index++) {
    const petRatio = ratio * (index === 0 ? 1 : n(main, 'secondaryWolfDamageRatio', wolf));
    pets += (expectedDamage(atk, petRatio, defense) * (1 - uptime) + expectedDamage(atk * (1 + boost), petRatio, defense) * uptime) /
      (n(main, 'attackIntervalMs', wolf) / 1000);
  }
  const occupied = n(main, 'recoverMs', wolf) / 1000 / refresh + n(r, 'recoverMs', roar) / 1000 / roarCd +
    n(SKILLS.beast_bond, 'recoverMs', 1) / n(SKILLS.beast_bond, 'durationMs', 1);
  return pets + expectedDamage(atk, 1, defense) / 0.580 * (1 - occupied) + expectedDamage(atk, n(r, 'damageRatio', roar), defense) / roarCd;
}
function bestBuilds(sect: string, defense: number, bonus: number, matching = true) {
  const fields = buildFields[sect], best = Array<number>(62).fill(-Infinity);
  const enumerate = (levels: number[], cost: number) => {
    if (cost > 61) return;
    if (levels.length === fields.length) {
      best[cost] = Math.max(best[cost], dps(sect, levels, defense, matching)); return;
    }
    const skill = SKILLS[fields[levels.length]], minimum = skill.type === 'passive' ? 0 : 1;
    const cap = skill.maxLevel + (skill.masteryToCap ? bonus : 0);
    for (let lv = minimum; lv <= cap; lv++) enumerate([...levels, lv], cost + (lv - minimum) * skill.spCost);
  };
  enumerate([], 0);
  for (let budget = 1; budget < best.length; budget++) best[budget] = Math.max(best[budget], best[budget - 1]);
  return best;
}
const dpsRanges: Record<string, { min: number; max: number }> = {};
let dpsScenarios = 0;
for (const bonus of [0, SKILL_RULES.masteryCapBonus]) for (const defense of [0, 8, 16]) {
  const builds = Object.fromEntries(Object.keys(buildFields).map(sect => [sect, bestBuilds(sect, defense, bonus)]));
  const unmatched = bestBuilds('taixu', defense, bonus, false);
  for (const level of [0, ...Array.from({ length: 20 }, (_, index) => index + 10)]) {
    const budget = level === 0 ? 0 : (level - 9) * SKILL_RULES.spPerLevel + SKILL_RULES.jobAdvanceBonusSp;
    for (const sect of ['taixu', 'lingfu', 'youying', 'wanshou', 'taixu_unmatched']) {
      const value = sect === 'taixu_unmatched' ? unmatched[budget] : builds[sect][budget];
      const delta = value / builds.tianjian[budget] - 1;
      ok(Math.abs(delta) <= 0.1 + 1e-8, `${sect} Lv${level}/SP${budget}/DEF${defense}/熟练+${bonus}: DPS ${(delta * 100).toFixed(2)}% 越界`);
      const range = dpsRanges[sect] ??= { min: Infinity, max: -Infinity };
      range.min = Math.min(range.min, delta); range.max = Math.max(range.max, delta); dpsScenarios++;
    }
  }
}
console.log(JSON.stringify({ classes: CLASS_LIST.length, assertions, dpsScenarios,
  dpsModel: 'balance/08 持续单体设计模型；非客户端实测', dpsRanges }));
