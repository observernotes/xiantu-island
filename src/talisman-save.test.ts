import strings from '@xt/balance/strings_zh.json';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { QUESTS, RECIPES, ITEMS, GROWTH, t, TILED_MAPS, SECT_GATE_MAPS, NPCS, syncTalismanMapAvailability } from './data';
import { FEATURE_UNAVAILABLE, featureFlags, setFeatureFlag } from './features';
import { ferryLockedReason, mapEntryOpen } from './Ferry';
import { setGameTimeSource } from './GameClock';

let assertions = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} / ${JSON.stringify(expected)}`);
};
const ok = (value: unknown, message: string) => eq(!!value, true, message);
const flags = featureFlags(), storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const disk: Record<string, string> = {}, key = 'xiantu_save_v1';
let fail = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (id: string) => disk[id] ?? null,
  setItem: (id: string, value: string) => { if (fail) throw new Error('模拟写盘失败'); disk[id] = value; },
  removeItem: (id: string) => { delete disk[id]; },
} });
const now = 1_800_000_000_000;
setGameTimeSource(() => now);
try {
  setFeatureFlag('fiveSectClasses', false);
  setFeatureFlag('talismanCraft', false);
  setFeatureFlag('v05Maps', true);
  const p = new Progress();
  const off = p.exportSave();
  for (const field of ['talisman', 'talismanUse', 'visitedMaps', 'talismanQuickSlots']) eq(Object.prototype.hasOwnProperty.call(off, field), false, `关口关闭新档不添加 ${field}`);
  eq(new QuestSystem(p).npcQuestIds('lingfu_envoy').includes('q_talisman_intro'), false, '关闭隐藏入门任务');
  eq(new QuestSystem(p).accept('q_talisman_intro'), false, '关闭不能学习');
  disk[key] = JSON.stringify({ level: 15, inventory: { talisman_fire: 3, snake_gall: 7, spirit_herb: 5 }, learnedRecipes: [], ageUpdatedAt: now });
  const oldOff = Progress.load();
  eq(oldOff.inventory, { talisman_fire: 3, snake_gall: 7, spirit_herb: 5 }, '关闭保留旧物品计数');
  eq(oldOff.pillQualities, {}, '关闭不迁移符品质');
  setFeatureFlag('talismanCraft', true);
  const old = Progress.load();
  eq(old.countQuality('talisman_fire', 'low'), 3, '旧品质物品归下品');
  eq(old.pillQualities.talisman_fire, { low: 3, mid: 0, high: 0, supreme: 0 }, '品质迁移落账');
  eq(old.count('snake_gall'), 7, '普通物品不迁移');
  eq(old.talisman.attempt, null, '旧档尝试为空');
  eq(old.talismanUse.cooldowns, {}, '旧档冷却为空');
  ok(old.addCraftedItem('talisman_fire', 2, 'high'), '按品质入包');
  eq(old.qualityCounts('talisman_fire'), { low: 3, mid: 0, high: 2, supreme: 0 }, '不同品质分堆');
  eq(old.removeQuality('talisman_fire', 1, 'supreme'), false, '指定品质不足不偷用其它堆');
  ok(old.removeQuality('talisman_fire', 1, 'high'), '指定品质消耗');
  eq(old.count('talisman_fire'), 4, '汇总数量一致');
  ok(old.bindTalismanSlot(0, 'talisman_fire', 'high'), '快捷栏明确绑定品质');
  old.save();
  const once = Progress.load(); once.save();
  const twice = Progress.load();
  eq(twice.qualityCounts('talisman_fire'), once.qualityCounts('talisman_fire'), '重复加载品质幂等');
  eq(twice.talismanQuickSlots[0], { item: 'talisman_fire', quality: 'high' }, '快捷栏重载不替换品质');
  eq(twice.inventory, once.inventory, '重复加载普通物品幂等');

  const intro = QUESTS.q_talisman_intro;
  ok(intro && intro.reqLevel === 15 && intro.reqRealm === 'qi_refining', '任务门槛读表');
  const student = new Progress(), qs = new QuestSystem(student);
  student.level = 14; eq(qs.available(intro.id), false, '十四级不可学');
  student.level = 15; ok(qs.available(intro.id), '炼气十五级无宗门可学');
  qs.onTalk('lingfu_envoy');
  ok(qs.accept(intro.id), '接取入门');
  eq(qs.complete(intro.id), false, '接取前对话不算教学');
  qs.onTalk('lingfu_envoy');
  ok(qs.complete(intro.id), '接取后教学可交付');
  ok(qs.turnIn(intro.id), '交付授方');
  eq(student.learnedRecipes, intro.rewards.recipes, '五个配方全部授予');
  for (const id of student.learnedRecipes) ok(RECIPES[id], '授予真实配方');
  const exp = student.exp;
  eq(qs.turnIn(intro.id), undefined, '任务奖励只发一次');
  eq(student.exp, exp, '重复交付不重复修为');
  eq(student.grantQuestRecipes(intro), [], '授方去重');
  student.save();
  eq(Progress.load().learnedRecipes, intro.rewards.recipes, '已学状态重载');
  eq(t('talisman.intro_done'), strings['talisman.intro_done'], '教学完成提示使用 strings_zh 表内文案');
  const talismanStrings = Object.entries(strings).filter(([key]) => key.startsWith('talisman.'));
  eq(talismanStrings.length, 60, 'strings_zh 表内包含全部 60 条制符文案');
  for (const [key, value] of talismanStrings) {
    ok(typeof value === 'string' && value.length > 0, `${key} 表内存在`);
    eq(t(key), value, `${key} 使用 strings_zh 表内文案`);
  }

  // 保存失败既不丢已有品质，也不提交一半配方奖励。
  const retry = new Progress(); retry.level = 15;
  const retryQ = new QuestSystem(retry); retryQ.accept(intro.id); retryQ.onTalk('lingfu_envoy');
  fail = true;
  eq(retryQ.turnIn(intro.id), undefined, '奖励存档失败');
  eq(retry.learnedRecipes, [], '奖励存档失败回滚配方');
  eq(retry.quests[intro.id].state, 'active', '奖励存档失败回滚任务');
  fail = false; ok(retryQ.turnIn(intro.id), '重试交付成功');

  // 用表内实际强度检验聚灵只加击杀，且和悟性相加后只取整一次。
  const gather = ITEMS.talisman_gather.effect, guard = ITEMS.talisman_guard.effect;
  const boosted = new Progress(); boosted.level = 15; boosted.allocatedStats.insight = 5;
  boosted.talismanUse.buffs = [
    { buffId: gather.buffId, itemId: 'talisman_gather', quality: 'high', expireAt: now + gather.durationMs, expBonusRatio: gather.byQuality.high.expBonusRatio },
    { buffId: guard.buffId, itemId: 'talisman_guard', quality: 'high', expireAt: now + guard.durationMs, damageReductionRatio: guard.byQuality.high.damageReductionRatio, reductionCap: guard.reductionCap },
  ];
  const insightBonus = Object.entries(GROWTH.statEffects as Record<string, Record<string, number>>)
    .reduce((sum, [stat, effects]) => sum + boosted.stat(stat) * (effects.expBonus ?? 0), 0);
  eq(boosted.gainExp(100, 15, 'kill').gained, Math.round(100 * (1 + insightBonus + gather.byQuality.high.expBonusRatio)), '聚灵与悟性相加一次');
  eq(boosted.gainExp(100, 15, 'quest').gained, Math.round(100 * (1 + insightBonus)), '任务修为不加聚灵');
  eq(boosted.gainCultivation(100).gained, 100, '闭关修为不加聚灵');
  const random = Math.random;
  try {
    Math.random = () => 0.5;
    const fireDamage = ITEMS.talisman_fire.effect.byQuality.high.baseDamage;
    eq(boosted.fixedDamageTo(fireDamage, boosted.level, 8), Math.max(1, Math.round(fireDamage - 8)), '火符绝对伤害不乘角色攻击');
    const raw = Math.max(1, 100.37 - boosted.def);
    eq(boosted.damageFrom(100.37), Math.max(1, Math.round(raw * (1 - guard.byQuality.high.damageReductionRatio))), '护身防御后减伤最终取整');
    eq(boosted.damageFrom(100.37, 1, [0.4, 0.4]), Math.max(1, Math.round(raw * (1 - guard.reductionCap))), '其它百分比相乘且总减伤封顶');
  } finally { Math.random = random; }
  boosted.save();
  const restored = Progress.load();
  eq(restored.talismanUse.buffs, boosted.talismanUse.buffs, '增益实际强度与现实到期时刻存档');
  eq(Progress.load().talismanUse.buffs, restored.talismanUse.buffs, '增益重复加载不叠层');
  setFeatureFlag('talismanCraft', false);
  eq(boosted.gainExp(100, 15, 'kill').gained, Math.round(100 * (1 + insightBonus)), '关闭不应用聚灵');
  eq(boosted.exportSave().talismanUse, boosted.talismanUse, '关闭保留已有增益和冷却记录');
  setFeatureFlag('talismanCraft', true); syncTalismanMapAvailability();
  ok(TILED_MAPS.lingfu_pavilion, '制符开启只注册现成灵符阁');
  const traveller = new Progress(); traveller.level = 15; traveller.hp = 7; traveller.mp = 3;
  traveller.inventory = { talisman_paper: 2 }; traveller.position = { mapId: 'lingfu_pavilion', x: 224, y: 512 };
  traveller.pendingSectTrial = { id: 'trial_sect_lingfu', returnPosition: { ...traveller.position } };
  traveller.save();
  eq(Progress.load().position?.mapId, 'lingfu_pavilion', '开启时灵符阁落点存档可读');
  setFeatureFlag('talismanCraft', false);
  const closedMap = Progress.load();
  eq(TILED_MAPS.lingfu_pavilion, undefined, '关闭撤下制符专属地图注册');
  eq(closedMap.position?.mapId, 'luoxia_town', '关闭后灵符阁存档安全回镇');
  eq(closedMap.pendingSectTrial?.returnPosition.mapId, 'luoxia_town', '关闭后试炼返程落点安全回镇');
  eq([closedMap.hp, closedMap.mp], [7, 3], '关闭专属地图不恢复气血灵力');
  eq(closedMap.inventory, traveller.inventory, '地图兼容不丢背包');
  const imported = new Progress();
  ok(imported.importSave({ ...traveller.exportSave(), position: { mapId: 'lingfu_pavilion', x: 224, y: 512 } }), '关闭时导入灵符阁旧档不拒绝整档');
  eq(imported.position?.mapId, 'luoxia_town', '导入兼容落点同读档');

  const trials: Record<string, string> = {
    taixu_temple: 'trial_sect_taixu', lingfu_pavilion: 'trial_sect_lingfu',
    youying_tower: 'trial_sect_youying', wanshou_mountain: 'trial_sect_wanshou',
  };
  const passenger = new Progress(); passenger.level = 99; passenger.stones = 999;
  passenger.quests.q_fox = { state: 'done', kills: {} };
  for (const mapId of SECT_GATE_MAPS) {
    const route = NPCS.ferry_master.ferryRoutes?.find(route => route.targetMap === mapId);
    ok(route, `${mapId} 有正式山门航线`);
    const position = { mapId, x: 224, y: 512 };
    const saved = { ...traveller.exportSave(), position, pendingSectTrial: { id: trials[mapId], returnPosition: { ...position } } };
    setFeatureFlag('fiveSectClasses', true);
    setFeatureFlag('talismanCraft', false);
    disk[key] = JSON.stringify(saved);
    const openGate = Progress.load();
    ok(TILED_MAPS[mapId], `${mapId} 五宗开启且制符关闭仍注册山门`);
    eq(mapEntryOpen(mapId), true, `${mapId} 五宗开启且制符关闭山门可达`);
    eq(ferryLockedReason(route!, passenger), undefined, `${mapId} 五宗开启且制符关闭航线可达`);
    eq(openGate.position, position, `${mapId} 五宗开启且制符关闭保留山门落点`);
    eq(openGate.pendingSectTrial?.returnPosition, position, `${mapId} 五宗开启保留试炼返程坐标`);
    const openImport = new Progress();
    ok(openImport.importSave(saved), `${mapId} 五宗开启可导入山门旧档`);
    eq(openImport.position, position, `${mapId} 导入保留山门落点`);
    eq(openImport.pendingSectTrial?.returnPosition, position, `${mapId} 导入保留试炼返程坐标`);
    setFeatureFlag('fiveSectClasses', false);
    disk[key] = JSON.stringify(saved);
    const closedGate = Progress.load();
    eq(TILED_MAPS[mapId], undefined, `${mapId} 双关不注册山门`);
    eq(mapEntryOpen(mapId), false, `${mapId} 双关山门不可达`);
    eq(ferryLockedReason(route!, passenger), FEATURE_UNAVAILABLE, `${mapId} 双关航线不可达`);
    eq(closedGate.position?.mapId, 'luoxia_town', `${mapId} 关闭后旧档安全回镇`);
    eq(closedGate.pendingSectTrial?.returnPosition.mapId, 'luoxia_town', `${mapId} 关闭后试炼返程安全回镇`);
    eq([closedGate.hp, closedGate.mp], [7, 3], `${mapId} 地图迁移不恢复气血灵力`);
    const closedImport = new Progress();
    ok(closedImport.importSave(saved), `${mapId} 关闭时仍接受合法山门旧档`);
    eq(closedImport.position?.mapId, 'luoxia_town', `${mapId} 关闭导入安全回镇`);
    eq(closedImport.pendingSectTrial?.returnPosition.mapId, 'luoxia_town', `${mapId} 关闭导入返程安全回镇`);
    setFeatureFlag('talismanCraft', true);
    disk[key] = JSON.stringify(saved);
    const craftOnly = Progress.load(), expectedMap = mapId === 'lingfu_pavilion' ? mapId : 'luoxia_town';
    const craftGateOpen = mapId === 'lingfu_pavilion';
    eq(!!TILED_MAPS[mapId], craftGateOpen, `${mapId} 单开制符只注册灵符阁`);
    eq(mapEntryOpen(mapId), craftGateOpen, `${mapId} 单开制符山门准入与注册一致`);
    eq(ferryLockedReason(route!, passenger), craftGateOpen ? undefined : FEATURE_UNAVAILABLE, `${mapId} 单开制符仅灵符航线可达`);
    eq(craftOnly.position?.mapId, expectedMap, `${mapId} 单开制符按山门注册状态迁移`);
    eq(craftOnly.pendingSectTrial?.returnPosition.mapId, expectedMap, `${mapId} 单开制符返程按注册状态迁移`);
    const craftImport = new Progress();
    ok(craftImport.importSave(saved), `${mapId} 单开制符仍接受合法山门旧档`);
    eq(craftImport.position?.mapId, expectedMap, `${mapId} 单开制符导入按山门注册状态迁移`);
    eq(craftImport.pendingSectTrial?.returnPosition.mapId, expectedMap, `${mapId} 单开制符导入返程按注册状态迁移`);
  }
  console.log(`talisman save tests ok: ${assertions} assertions`);
} finally {
  fail = false;
  setGameTimeSource(null);
  for (const [name, enabled] of Object.entries(flags)) setFeatureFlag(name as keyof typeof flags, enabled);
  syncTalismanMapAvailability();
  if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
}
