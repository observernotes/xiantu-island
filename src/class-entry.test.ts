import { QUESTS, inPhase } from './data';
import { dailyQuestDay } from './DailyQuests';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { CLASS_LIST, CLASS_RULES, classEntryEnabled, classEntrySkill, classMinLevel, skillsForClass, type ClassDef } from './classes';
import { featureFlags } from './features';
import { HOTBAR_SLOTS, SKILLS, spBand, spEarnedFor } from './skills';

let assertions = 0;
function equal(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}
function check(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}

// 预期独立于 entryKey 查找，避免查错技能后实现和断言一起通过。
const entryIds: Record<string, string> = {
  tianjian_disciple: 'sword_qi_slash',
  taixu_acolyte: 'fire_talisman_bolt',
  lingfu_novice: 'paper_talisman_throw',
  youying_shadow: 'shadow_dart',
  wanshou_tamer: 'summon_spirit_wolf',
};
const saveKey = 'xiantu_save_v1';
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const dateNowBefore = Date.now;
const now = dateNowBefore();
const saved: Record<string, string> = {};
const flagsBefore = featureFlags();
const commonCost = SKILLS.spirit_bolt.spCost;
const commonSlot = HOTBAR_SLOTS.length - 2;
const priorEntrySlot = HOTBAR_SLOTS.length - 3;

function fixture(cls: ClassDef, version: number | undefined = 2) {
  const p = new Progress();
  const entry = entryIds[cls.id];
  const tree = skillsForClass(cls.id);
  const otherActive = tree.find(skill => skill.type === 'active' && skill.id !== entry)!;
  const buff = tree.find(skill => skill.type === 'buff')!;
  check(otherActive && buff, `${cls.id}: 专项夹具需要另外两项主动/增益`);
  // 关闭入口的任务可能被运行表过滤，职业技能点等级段仍保留。
  p.level = Math.max(classMinLevel(cls), spBand(CLASS_RULES.advanceJob)?.min ?? 1);
  p.job = cls.id;
  p.classVersion = version ?? 0;
  p.classRewardClaims = [cls.id];
  p.classRefundSp = 2 * commonCost;
  p.skills = { [entry]: 3, [otherActive.id]: 2, [buff.id]: 2, spirit_bolt: 4 };
  p.skillGifted = { [entry]: 1, [otherActive.id]: 1, [buff.id]: 1, spirit_bolt: 1 };
  p.skillMastery = { [entry]: 77, [otherActive.id]: 88, spirit_bolt: 99 };
  p.hotbar = Array.from({ length: HOTBAR_SLOTS.length }, () => null);
  p.hotbar[1] = buff.id;
  p.hotbar[3] = otherActive.id;
  p.hotbar[priorEntrySlot] = entry;
  p.hotbar[commonSlot] = 'spirit_bolt';
  p.buffs = [{ id: buff.id, expireAt: now + 60000 }, { id: 'spirit_bolt', expireAt: now + 60000 }];
  p.skillCooldowns = {
    [otherActive.id]: { readyAt: now + 60000, total: 60000 },
    spirit_bolt: { readyAt: now + 30000, total: 30000 },
  };
  p.dailyQuestResetDay = dailyQuestDay(now);
  const old = p.exportSave();
  if (version === undefined) delete old.classVersion;
  return { old, entry, otherActive, buff };
}

function load(old: Record<string, unknown>) {
  saved[saveKey] = JSON.stringify(old);
  return Progress.load();
}

function assertCommonRemoved(p: Progress, context: string) {
  for (const [name, values] of Object.entries({
    skills: p.skills, skillGifted: p.skillGifted, skillMastery: p.skillMastery, skillCooldowns: p.skillCooldowns,
  })) equal(Object.prototype.hasOwnProperty.call(values, 'spirit_bolt'), false, `${context}: 清除旧 ${name}`);
  equal(p.hotbar.includes('spirit_bolt'), false, `${context}: 清除旧热键`);
  equal(p.buffs.some(buff => buff.id === 'spirit_bolt'), false, `${context}: 清除旧增益`);
}

function assertStable(p: Progress, context: string) {
  const expected = p.exportSave();
  equal(p.backfillClass(), false, `${context}: 重跑迁移无变化`);
  equal(p.exportSave(), expected, `${context}: 重跑不再退款或发奖`);
  equal(p.save(), true, `${context}: 可保存迁移结果`);
  const reloaded = Progress.load();
  equal(reloaded.exportSave(), expected, `${context}: 保存读档幂等`);
  const imported = new Progress();
  equal(imported.importSave(expected), true, `${context}: 导入迁移结果成功`);
  equal(imported.exportSave(), expected, `${context}: 导出导入幂等`);
  equal(imported.importSave(imported.exportSave()), true, `${context}: 可重复导入迁移结果`);
  equal(imported.exportSave(), expected, `${context}: 重复导入不再退款`);
  equal(imported.grantSkill('spirit_bolt', 1), false, `${context}: 拜入后拒绝重授通用技`);
  equal(imported.exportSave(), expected, `${context}: 拒绝重授不改变角色`);
}

try {
  Date.now = () => now;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => { saved[key] = String(value); },
    removeItem: (key: string) => { delete saved[key]; },
    clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
    key: (index: number) => Object.keys(saved)[index] ?? null,
    get length() { return Object.keys(saved).length; },
  } });
  equal(CLASS_LIST.map(cls => cls.id).sort(), Object.keys(entryIds).sort(), '专项覆盖全部五宗');
  check(commonSlot > 3, '旧通用技测试槽位不是默认 A/S/D');

  // 已有职业绕过的是新拜入开关；测试保持发版开关原样。
  for (const cls of CLASS_LIST) {
    equal(classEntrySkill(cls)?.id, entryIds[cls.id], `${cls.id}: 入门技能符合独立预期`);
    for (const version of [undefined, 1, 2]) {
      const { old, entry, otherActive, buff } = fixture(cls, version);
      const p = load(old);
      const context = `${cls.id}/职业版本${version ?? '缺失'}`;
      equal(p.job, cls.id, `${context}: 保留正式职业`);
      equal(p.classVersion, 2, `${context}: 登记新迁移版本`);
      assertCommonRemoved(p, context);
      equal(p.classRefundSp, 5 * commonCost, `${context}: 退回全部付费等级并累加原退款`);
      equal(p.spEarned(CLASS_RULES.advanceJob), spEarnedFor(p.level, CLASS_RULES.advanceJob, true) + p.classRefundSp,
        `${context}: 退款加入一转可用点池`);
      equal(p.hotbar[commonSlot], entry, `${context}: 新入门技占旧通用技槽位`);
      equal(p.hotbar[priorEntrySlot], null, `${context}: 清除新技能旧绑定`);
      equal(p.hotbar.filter(id => id === entry).length, 1, `${context}: 新技能无重复绑定`);
      equal(p.hotbar[1], buff.id, `${context}: 保留本宗增益自定义键位`);
      equal(p.hotbar[3], otherActive.id, `${context}: 保留本宗另一主动自定义键位`);
      equal(p.skills[entry], 3, `${context}: 不降级已有入门技能`);
      equal(p.skillGifted[entry], 1, `${context}: 不重送已有入门技能等级`);
      equal(p.skillMastery[entry], 77, `${context}: 保留新入门技能熟练度`);
      equal(p.skillMastery[otherActive.id], 88, `${context}: 保留其他本宗熟练度`);
      equal(p.buffs, [{ id: buff.id, expireAt: now + 60000 }], `${context}: 保留其他本宗增益`);
      equal(p.skillCooldowns, { [otherActive.id]: { readyAt: now + 60000, total: 60000 } }, `${context}: 保留其他本宗冷却`);
      assertStable(p, context);
    }

    // 只留正式交付记录的旧档也应迁移；仅帖、妖狐或试炼不能替玩家选宗。
    const { old, entry } = fixture(cls, 1);
    old.job = '';
    old.quests = { [cls.joinQuest]: { state: 'done', kills: {} } };
    const p = load(old);
    equal(p.job, cls.id, `${cls.id}: 已交付旧档补正式职业`);
    equal(p.hotbar[commonSlot], entry, `${cls.id}: 已交付旧档原位换技`);
    equal(p.classRefundSp, 5 * commonCost, `${cls.id}: 已交付旧档退点`);
    assertCommonRemoved(p, `${cls.id}/仅正式任务`);
    assertStable(p, `${cls.id}/仅正式任务`);

    for (const { level, gifted, paid } of [
      { level: 4, gifted: 4, paid: 0 },
      { level: 4, gifted: 0, paid: 4 },
      { level: 4, gifted: undefined, paid: 4 },
      { level: 4, gifted: 7, paid: 0 },
    ]) {
      const { old } = fixture(cls);
      (old.skills as Record<string, number>).spirit_bolt = level;
      if (gifted === undefined) delete (old.skillGifted as Record<string, number>).spirit_bolt;
      else (old.skillGifted as Record<string, number>).spirit_bolt = gifted;
      const p = load(old);
      equal(p.classRefundSp, (2 + paid) * commonCost, `${cls.id}: Lv${level}/赠${gifted ?? '缺失'}只退已付点`);
      assertCommonRemoved(p, `${cls.id}/赠级${gifted ?? '缺失'}`);
      assertStable(p, `${cls.id}/赠级${gifted ?? '缺失'}`);
    }

    // 老档可能只剩快捷栏、冷却等记录，不能以 skills 中无键为由跳过。
    const remnants = fixture(cls).old;
    delete (remnants.skills as Record<string, number>).spirit_bolt;
    delete (remnants.skillGifted as Record<string, number>).spirit_bolt;
    delete (remnants.skillMastery as Record<string, number>).spirit_bolt;
    const cleaned = load(remnants);
    equal(cleaned.hotbar[commonSlot], entry, `${cls.id}: 仅残留热键也原位替换`);
    equal(cleaned.classRefundSp, 2 * commonCost, `${cls.id}: 没有已学等级的残留不多退款`);
    assertCommonRemoved(cleaned, `${cls.id}/仅热键冷却残留`);
    assertStable(cleaned, `${cls.id}/仅热键冷却残留`);

    const spendable = load(fixture(cls).old);
    const pointsBefore = spendable.spLeftFor(CLASS_RULES.advanceJob);
    const spentBefore = spendable.spSpent(CLASS_RULES.advanceJob);
    const entryLevelBefore = spendable.skillLevel(entry);
    equal(pointsBefore, Math.max(0, spEarnedFor(spendable.level, CLASS_RULES.advanceJob, true)
      + spendable.classRefundSp - spentBefore), `${cls.id}: 已退点进入剩余一转技能点`);
    check(pointsBefore >= SKILLS[entry].spCost, `${cls.id}: 退款后有可消费技能点`);
    equal(spendable.addSkillPoint(entry).ok, true, `${cls.id}: 退回点可实际投入本宗入门技能`);
    equal(spendable.skillLevel(entry), entryLevelBefore + 1, `${cls.id}: 消费退款提升新技能等级`);
    equal(spendable.spSpent(CLASS_RULES.advanceJob), spentBefore + SKILLS[entry].spCost, `${cls.id}: 加点按表扣技能点`);
    equal(spendable.spLeftFor(CLASS_RULES.advanceJob), pointsBefore - SKILLS[entry].spCost, `${cls.id}: 可用退款余额减少`);
    equal(spendable.classRefundSp, 5 * commonCost, `${cls.id}: 消费点数不改变一次性退款收据`);
    assertStable(spendable, `${cls.id}/退款已消费`);

    const unbound = fixture(cls).old;
    delete (unbound.skills as Record<string, number>)[entry];
    delete (unbound.skillGifted as Record<string, number>)[entry];
    delete (unbound.skillMastery as Record<string, number>)[entry];
    (unbound.hotbar as (string | null)[])[commonSlot] = null;
    (unbound.hotbar as (string | null)[])[priorEntrySlot] = null;
    const defaultBound = load(unbound);
    const defaultSlot = HOTBAR_SLOTS.findIndex(slot => slot.label === 'A');
    equal(defaultBound.hotbar[defaultSlot], entry, `${cls.id}: 通用技未绑定时新入门技遵循默认 A`);
    equal(defaultBound.hotbar[1], (unbound.hotbar as (string | null)[])[1], `${cls.id}: 默认绑定保留本宗增益键位`);
    equal(defaultBound.hotbar[3], (unbound.hotbar as (string | null)[])[3], `${cls.id}: 默认绑定保留本宗其他主动键位`);
    assertCommonRemoved(defaultBound, `${cls.id}/无通用热键`);
    assertStable(defaultBound, `${cls.id}/无通用热键`);

    const containerOnly = fixture(cls).old;
    delete (containerOnly.skills as Record<string, number>).spirit_bolt;
    delete (containerOnly.skillGifted as Record<string, number>).spirit_bolt;
    (containerOnly.hotbar as (string | null)[])[commonSlot] = null;
    containerOnly.buffs = (containerOnly.buffs as Progress['buffs']).filter(buff => buff.id !== 'spirit_bolt');
    const direct = new Progress();
    Object.assign(direct, containerOnly);
    direct.ensureDefaults(); direct.backfillRealmRewards();
    equal(direct.backfillClass(), true, `${cls.id}: 当前版本仅熟练度/冷却残留也报告迁移变化`);
    equal(direct.backfillClass(), false, `${cls.id}: 容器清理第二次报告无变化`);
    equal(direct.classRefundSp, 2 * commonCost, `${cls.id}: 仅残留容器不退款`);
    equal(direct.hotbar[priorEntrySlot], entry, `${cls.id}: 仅残留容器不移动既有入门技键位`);
    assertCommonRemoved(direct, `${cls.id}/仅熟练度冷却残留`);
    assertStable(direct, `${cls.id}/仅熟练度冷却残留`);

    // 玩家主动解绑的已学技能不能因职业版本升级再次占据空槽位。
    const { old: noCommon, otherActive: unboundActive } = fixture(cls, 1);
    for (const key of ['skills', 'skillGifted', 'skillMastery', 'skillCooldowns']) {
      delete (noCommon[key] as Record<string, unknown>).spirit_bolt;
    }
    noCommon.buffs = (noCommon.buffs as Progress['buffs']).filter(buff => buff.id !== 'spirit_bolt');
    const originalHotbar = [...noCommon.hotbar as (string | null)[]];
    originalHotbar[commonSlot] = null;
    originalHotbar[3] = null;
    noCommon.hotbar = [...originalHotbar];
    const unboundPreserved = load(noCommon);
    equal(unboundPreserved.classVersion, 2, `${cls.id}: 无通用技旧档仍升级职业版本`);
    equal(unboundPreserved.hotbar, originalHotbar, `${cls.id}: 无通用技迁移保留主动解绑和所有自定义键位`);
    equal(unboundPreserved.skills[unboundActive.id], 2, `${cls.id}: 主动解绑不删除已学技能`);
    equal(unboundPreserved.hotbar.includes(unboundActive.id), false, `${cls.id}: 已学但解绑的主动技能不会重新绑定`);
    equal(unboundPreserved.classRefundSp, 2 * commonCost, `${cls.id}: 无通用技迁移不追加退款`);
    assertCommonRemoved(unboundPreserved, `${cls.id}/主动解绑`);
    assertStable(unboundPreserved, `${cls.id}/主动解绑`);
  }

  // 所有实际开放的入口都走任务接取、真实目标推进、正式交付。
  const openEntrances: string[] = [];
  for (const cls of CLASS_LIST) {
    const q = QUESTS[cls.joinQuest];
    if (!classEntryEnabled(cls) || !q || !inPhase(q)) continue;
    const { old, entry, otherActive, buff } = fixture(cls);
    const p = new Progress();
    Object.assign(p, old, { job: '', classVersion: 0, classRewardClaims: [], quests: { q_fox: { state: 'done', kills: {} } } });
    delete p.skills[entry]; delete p.skillGifted[entry]; delete p.skillMastery[entry];
    p.hotbar[priorEntrySlot] = null;
    p.ensureDefaults(); p.backfillRealmRewards();
    const qs = new QuestSystem(p);
    const beforeJoin = JSON.stringify({ job: p.job, skills: p.skills, gifted: p.skillGifted, hotbar: p.hotbar, refund: p.classRefundSp });
    equal(qs.accept(q.id), true, `${cls.id}: 开放入口可真实接取`);
    equal(qs.turnIn(q.id), undefined, `${cls.id}: 未完成目标不可正式拜入`);
    equal(JSON.stringify({ job: p.job, skills: p.skills, gifted: p.skillGifted, hotbar: p.hotbar, refund: p.classRefundSp }), beforeJoin,
      `${cls.id}: 接取和未完成交付不换技/退点`);
    const trial = q.objectives.find(objective => objective.type === 'trial')?.trial;
    if (trial) equal(qs.onTrialComplete(trial), true, `${cls.id}: 胜利回调推进正式任务目标`);
    else qs.talk(q.turnIn);
    equal(p.job, '', `${cls.id}: 仅完成目标尚未正式拜入`);
    equal(p.hotbar[commonSlot], 'spirit_bolt', `${cls.id}: 仅完成目标保留通用热键`);
    const reward = qs.turnIn(q.id);
    equal(reward?.quest.id, q.id, `${cls.id}: 正式任务可交付`);
    // 普通任务由场景奖励接入授职；在这里显式调用同一 advanceClass。
    equal(p.advanceClass(cls.id), true, `${cls.id}: 正式奖励授职成功`);
    equal(p.hotbar[commonSlot], entry, `${cls.id}: 首次拜入保留通用技原槽位`);
    equal(p.hotbar[1], buff.id, `${cls.id}: 首次拜入保留本宗增益原槽位`);
    equal(p.hotbar[3], otherActive.id, `${cls.id}: 首次拜入保留本宗其他主动原槽位`);
    equal(p.classRefundSp, 5 * commonCost, `${cls.id}: 首次拜入返还已投点`);
    equal(p.skillGifted[entry], 1, `${cls.id}: 首次拜入新技赠级不花点`);
    assertCommonRemoved(p, `${cls.id}/首次正式拜入`);
    equal(qs.turnIn(q.id), undefined, `${cls.id}: 不可重复正式交付`);
    assertStable(p, `${cls.id}/首次正式拜入`);
    openEntrances.push(cls.id);
  }

  for (const state of ['active', 'done'] as const) {
    const p = new Progress();
    p.level = Math.max(classMinLevel(CLASS_LIST[0]), spBand(CLASS_RULES.advanceJob)?.min ?? 1);
    p.grantSkill('spirit_bolt', 1);
    p.skills.spirit_bolt = 4;
    p.bindHotbar(commonSlot, 'spirit_bolt');
    p.quests.q_fox = { state: 'done', kills: {} };
    p.quests[CLASS_LIST[0].joinQuest] = { state: 'active', kills: {} };
    const trial = Object.values(QUESTS).flatMap(q => q.objectives).find(objective => objective.type === 'trial')?.trial;
    if (trial && state === 'done') p.completedTrials = [trial];
    const loaded = load(p.exportSave());
    equal(loaded.job, '', `未正式交付/${state}: 妖狐完成和试炼记录不替玩家选宗`);
    equal(loaded.skills.spirit_bolt, 4, `未正式交付/${state}: 通用技能等级保留`);
    equal(loaded.skillGifted.spirit_bolt, 1, `未正式交付/${state}: 通用赠级保留`);
    equal(loaded.hotbar[commonSlot], 'spirit_bolt', `未正式交付/${state}: 通用键位保留`);
    equal(loaded.classRefundSp, 0, `未正式交付/${state}: 不提前退款`);
    equal(loaded.backfillClass(), false, `未正式交付/${state}: 重跑不会正式拜入`);
  }
  equal(featureFlags(), flagsBefore, '专项测试不打开关闭的宗门入口');
  console.log(JSON.stringify({ suite: 'class-entry-replacement', passed: true, assertions, classes: CLASS_LIST.length, openEntrances }));
} finally {
  Date.now = dateNowBefore;
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
