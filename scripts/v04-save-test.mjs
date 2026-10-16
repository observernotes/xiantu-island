// 直接消费 v0.4.3 Progress.save() 写出的完整原档；来源与重建命令见 fixtures/v0.4/README.md。
import { legacySaveFixture } from './legacy-save-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.env.XT_DATA ??= 'snapshot';
const fixturePath = path.join(root, 'scripts/fixtures/v0.4/full-fox-tianjian.json');
const raw = await fs.readFile(fixturePath, 'utf8');
const legacy = JSON.parse(raw);
const originalFixture = JSON.stringify(legacy);
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };

// 固定历史源码的全部可枚举字段，防止以现行 exportSave 删几个版本字段代替旧全档。
const legacyFields = [
  'level', 'exp', 'hp', 'mp', 'stones', 'inventory', 'equip', 'job', 'quests', 'name',
  'skills', 'skillGifted', 'skillMastery', 'hotbar', 'buffs', 'spTipShown', 'overflowExp',
  'breakthroughFails', 'unstableUntil', 'realmRewards', 'unstableRatio', 'unstableStats',
  'lastOverflowReturned', 'breakthroughBonusLevels',
];
equal(Object.keys(legacy).sort(), legacyFields.sort(), '样档包含 v0.4.3 Progress 的全部 24 个字段');
for (const field of ['questRewardVersion', 'classVersion', 'moralVersion', 'affinity', 'relationshipState', 'senseState', 'talismanLevel', 'position']) {
  equal(Object.hasOwn(legacy, field), false, `原档没有后加字段 ${field}`);
}
equal(legacy.job, 'tianjian_disciple', '真实旧妖狐奖励已经授予天剑职业');
equal(Object.keys(legacy.quests).sort(), ['q_awaken', 'q_bamboo', 'q_snake', 'q_breakthrough', 'q_fox'].sort(),
  '原档完整覆盖灵根、竹林、蛇、突破、妖狐主链');
for (const [id, quest] of Object.entries(legacy.quests)) equal(quest.state, 'done', `原档 ${id} 已交付`);
check(legacy.level >= 10 && legacy.stones > 0 && legacy.exp > 0, '原档等级、灵石和当前修为非空');
check(Object.values(legacy.inventory).some(n => n > 0), '原档包含真实剩余背包物品');
check(Object.keys(legacy.equip).length > 0, '原档包含已穿装备');
check(Object.values(legacy.skillMastery).some(n => n > 0), '原档包含熟练度');
check(Object.entries(legacy.skills).some(([id, level]) => level > (legacy.skillGifted[id] ?? 0)), '原档包含已花技能点');
equal(Object.keys(legacy.skills).sort(), ['sword_qi_slash', 'whirl_sword', 'light_body', 'tianjian_heart'].sort(),
  '原档包含三招旧赠技及真实付点学会的被动心法');

const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const dateNowBefore = Date.now;
const disk = {};
const saveKey = 'xiantu_save_v1';
let writes = 0, backupWrites = 0;
const server = await createServer({
  root, server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  // 新版年龄/日常以本次迁移时刻初始化；固定时间以比较完整导出和重复读档。
  Date.now = () => Date.UTC(2026, 9, 16, 4);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: key => disk[key] ?? null,
    setItem: (key, value) => { if (key === saveKey) writes++; else backupWrites++; disk[key] = String(value); },
    removeItem: key => { delete disk[key]; },
    clear: () => { for (const key of Object.keys(disk)) delete disk[key]; },
    key: index => Object.keys(disk)[index] ?? null,
    get length() { return Object.keys(disk).length; },
  } });
  await legacySaveFixture(server);
  const { Progress, AUTO_STATS, MORAL_VERSION, RELATIONSHIP_BACKUP_KEY } = await server.ssrLoadModule('/src/Progress.ts');
  const { createRelationshipState } = await server.ssrLoadModule('/src/RelationshipState.ts');
  const { QuestSystem } = await server.ssrLoadModule('/src/QuestSystem.ts');
  const { MORAL_STATE, SECT_RANKS } = await server.ssrLoadModule('/src/data.ts');
  const { classDef, classRobe } = await server.ssrLoadModule('/src/classes.ts');
  const { SKILLS, HOTBAR_SLOTS, spEarnedFor } = await server.ssrLoadModule('/src/skills.ts');
  const { featureFlags } = await server.ssrLoadModule('/src/features.ts');
  const flagsBefore = featureFlags();
  const robe = classRobe(classDef('tianjian_disciple'));
  equal(robe, 'robe_tianjian_1', '旧天剑补发的是当前登记的宗门道袍');
  equal(legacy.inventory[robe] ?? 0, 0, '旧档尚未领取新版宗门道袍');
  check(legacy.equip.robe !== robe, '旧衣着需要保留，宗袍只能补背包');
  equal(legacy.hotbar.length, HOTBAR_SLOTS.length, '完整旧档保留所有快捷栏槽');

  const assertMigrated = (p, context) => {
    for (const field of ['name', 'level', 'exp', 'hp', 'mp', 'stones', 'equip', 'skills', 'skillGifted', 'skillMastery',
      'hotbar', 'buffs', 'spTipShown', 'overflowExp', 'breakthroughFails', 'realmRewards', 'unstableUntil', 'unstableRatio',
      'unstableStats', 'lastOverflowReturned', 'breakthroughBonusLevels']) {
      equal(p[field], legacy[field], `${context}: ${field} 保留`);
    }
    equal(p.job, 'tianjian_disciple', `${context}: 保留旧职业`);
    equal(p.sect, 'tianjian', `${context}: 宗门解析正确`);
    equal(p.sectRank, SECT_RANKS.rules.initialRank, `${context}: 缺失宗门品级补初始值`);
    equal(p.classVersion, 2, `${context}: 补齐职业迁移版本`);
    equal(p.questRewardVersion, 1, `${context}: 补齐任务奖励版本`);
    equal(p.classRewardClaims, ['tianjian_disciple'], `${context}: 登记且仅登记一次宗门奖励`);
    equal(p.inventory, { ...legacy.inventory, [robe]: 1 }, `${context}: 只补一件宗袍进背包`);
    equal(p.count('five_sect_token'), legacy.inventory.five_sect_token ?? 0, `${context}: 不重放新版妖狐五宗帖奖励`);
    equal(p.classRefundSp, 0, `${context}: 无通用技付费等级，不凭空退款`);
    equal(p.skillLevel('spirit_bolt'), 0, `${context}: 已天剑不补发新版突破通用技`);
    equal(p.hotbar.includes('spirit_bolt'), false, `${context}: 通用技不占旧自定义键位`);
    const spent = Object.entries(legacy.skills).reduce((sum, [id, level]) =>
      sum + Math.max(0, level - (legacy.skillGifted[id] ?? 0)) * SKILLS[id].spCost, 0);
    equal(p.spSpent(1), spent, `${context}: 原付费技能等级仍计入已花 SP`);
    equal(p.spLeftFor(1), Math.max(0, spEarnedFor(legacy.level, 1, true) - spent), `${context}: 可用 SP 无额外退款或赠级`);
    for (const id of Object.keys(legacy.skills)) equal(p.ownsSkill(SKILLS[id]), true, `${context}: 本宗 ${id} 可使用`);
    equal(Object.keys(p.quests).sort(), Object.keys(legacy.quests).sort(), `${context}: 不伪造新版正式拜入任务`);
    for (const [id, quest] of Object.entries(legacy.quests)) {
      equal(p.quests[id], { ...quest, crafted: {} }, `${context}: ${id} 事实保留，只补 craft 容器`);
    }
    equal(p.position, null, `${context}: v0.4.3 未存位置，补默认出生点状态`);
    equal(p.allocatedStats, Object.fromEntries(Object.entries(AUTO_STATS).map(([key, n]) => [key, n * (legacy.level - 1)])),
      `${context}: 按旧自动加点公式迁移四维`);
    equal(p.unspentStatPoints, 0, `${context}: 不重发历史等级属性点`);
    equal([p.daoHeart, p.morality, p.moralVersion],
      [MORAL_STATE.daoHeart.initial, MORAL_STATE.morality.initial, MORAL_VERSION], `${context}: 两轴按缺省补齐`);
    equal(p.affinity, {}, `${context}: 不从历史已交任务补发好感`);
    equal(p.relationshipState, createRelationshipState(), `${context}: 关系收据补空，不伪造历史来源`);
    equal([p.alchemyLevel, p.alchemyExp, p.sectContribution, p.seclusionHistory, p.pendingAlchemy],
      [1, 0, 0, [], null], `${context}: 炼丹、贡献与闭关状态安全补缺省`);
  };
  const assertStable = (p, context) => {
    const expected = p.exportSave();
    const beforeWrites = writes;
    equal(p.backfillClass(), false, `${context}: 再跑职业 backfill 无变化`);
    equal(p.backfillQuestSkills(), false, `${context}: 再跑任务补技无变化`);
    equal(new QuestSystem(p).turnIn('q_fox'), undefined, `${context}: 已交妖狐不可再次交付`);
    equal(p.exportSave(), expected, `${context}: 重跑不再发奖、退款或改键位`);
    for (let i = 1; i <= 2; i++) {
      equal(Progress.load().exportSave(), expected, `${context}: 第 ${i} 次重读完整状态幂等`);
      equal(JSON.parse(disk[saveKey]), expected, `${context}: 第 ${i} 次重读不改存盘数据`);
    }
    equal(writes, beforeWrites, `${context}: 重读与补发检查均不重复写盘`);
    equal(p.save(), true, `${context}: 迁移结果可保存`);
    equal(Progress.load().exportSave(), expected, `${context}: 显式保存后重读幂等`);
    const imported = new Progress();
    equal(imported.importSave(expected), true, `${context}: 迁移后全档可以再次导入`);
    equal(imported.exportSave(), expected, `${context}: 迁移后导入不重复发奖`);
    equal(imported.importSave(imported.exportSave()), true, `${context}: 可重复导入迁移结果`);
    equal(imported.exportSave(), expected, `${context}: 重复导入完整状态不变`);
  };

  disk[saveKey] = raw;
  const loaded = Progress.load();
  equal(writes, 1, 'load 将完整迁移结果一次写盘');
  equal(backupWrites, 1, '关系升级单独写一次原档备份');
  equal(disk[RELATIONSHIP_BACKUP_KEY], raw, '关系升级前备份保留完整v0.4.3原档字节');
  assertMigrated(loaded, '原始全档 load');
  const expected = loaded.exportSave();
  equal(JSON.parse(disk[saveKey]), expected, 'load 落盘含补齐版本和全部迁移结果');
  assertStable(loaded, '原始全档 load');

  delete disk[saveKey];
  const imported = new Progress();
  const beforeImportWrites = writes;
  equal(imported.importSave(legacy), true, '未经现行代码处理的完整原档可以直接 importSave');
  equal(writes - beforeImportWrites, 1, 'importSave 将完整迁移结果一次写盘');
  assertMigrated(imported, '原始全档 importSave');
  equal(imported.exportSave(), expected, 'load 与 importSave 两条入口得到相同完整状态');
  assertStable(imported, '原始全档 importSave');
  equal(backupWrites, 1, '迁移后重复读档与导入不重复写备份');
  equal(JSON.stringify(legacy), originalFixture, '导入不修改读取的原始样档对象');
  equal(await fs.readFile(fixturePath, 'utf8'), raw, '迁移测试不改样档文件');
  equal(featureFlags(), flagsBefore, '迁移测试保持当前功能开关');
  console.log(JSON.stringify({ suite: 'v04-save', passed: true, assertions, dataMode: process.env.XT_DATA,
    sourceTag: 'v0.4.3', fixture: path.relative(root, fixturePath), level: loaded.level, stones: loaded.stones }));
} finally {
  Date.now = dateNowBefore;
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
  await server.close();
}
