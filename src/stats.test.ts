import { GROWTH, EXP_TO_NEXT } from './data';
import { AUTO_STATS, Progress, STAT_KEYS, type AllocateResult } from './Progress';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}：得到 ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}

// 只用固定时间、内存存档；不修改配表、开关或真实 localStorage。
const originalNow = Date.now;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const now = new Date(2026, 9, 15, 12).getTime();
Date.now = () => now;
const disk: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';
let writes = 0, failStorage = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => disk[key] ?? null,
  setItem: (key: string, value: string) => {
    if (failStorage) throw new Error('加点自测：模拟存储失败');
    writes++; disk[key] = String(value);
  },
  removeItem: (key: string) => { delete disk[key]; },
  clear: () => { for (const key of Object.keys(disk)) delete disk[key]; },
  key: (index: number) => Object.keys(disk)[index] ?? null,
  get length() { return Object.keys(disk).length; },
} satisfies Storage });

function state(p: Progress) { return { allocated: { ...p.allocatedStats }, unspent: p.unspentStatPoints }; }
function combat(p: Progress) { return { hp: p.maxHp, mp: p.maxMp, atk: p.atk, matk: p.matk, def: p.def }; }
function rejected(p: Progress, delta: unknown, reason: 'invalid' | 'overspend', message: string) {
  const before = state(p), diskBefore = disk[saveKey], writesBefore = writes;
  const record = delta as Record<string, number>;
  same(p.checkAllocate(record), { ok: false, reason }, `${message} 检查拒绝`);
  same(p.applyAllocate(record), { ok: false, reason }, `${message} 结算拒绝`);
  same(state(p), before, `${message} 不改角色`);
  eq(disk[saveKey], diskBefore, `${message} 不改存档`);
  eq(writes, writesBefore, `${message} 不发起存档`);
}

try {
  const perLevel = Number(GROWTH.perLevel.statPoints) || 0;
  ok(Number.isSafeInteger(perLevel) && perLevel >= 0, '升级点数取合法配表整数');
  same(STAT_KEYS, ['rootBone', 'agility', 'spirit', 'insight'], '唯一属性键按设计四维顺序');
  ok(Object.isFrozen(STAT_KEYS), '只读键清单不会被窗体改写');

  // 缺 allocatedStats 才是自动加点旧档；迁移不发可花点，不改变原战力。
  for (const level of [1, 9, 30]) {
    const reference = new Progress(); reference.level = level;
    reference.backfillRealmRewards();
    reference.allocatedStats = Object.fromEntries(STAT_KEYS.map(key => [key, AUTO_STATS[key] * (level - 1)]));
    reference.hp = reference.maxHp; reference.mp = reference.maxMp;
    const legacy = reference.exportSave();
    delete legacy.allocatedStats; delete legacy.unspentStatPoints;
    disk[saveKey] = JSON.stringify(legacy);
    const writesBefore = writes, loaded = Progress.load();
    same(loaded.allocatedStats, reference.allocatedStats, `${level} 级旧档按旧公式灌入已分配点`);
    eq(loaded.unspentStatPoints, 0, `${level} 级旧档不额外补发未分配点`);
    same(combat(loaded), combat(reference), `${level} 级旧档战力保持`);
    eq(writes - writesBefore, 1, `${level} 级迁移只实际保存一次`);
    same(JSON.parse(disk[saveKey]).allocatedStats, reference.allocatedStats, `${level} 级迁移立即持久化`);
    same(state(Progress.load()), state(loaded), `${level} 级重读不重复迁移`);
    eq(writes - writesBefore, 1, `${level} 级已迁移档不重复保存`);
  }
  {
    const p = new Progress(); p.level = 30; p.unspentStatPoints = perLevel;
    p.allocatedStats = { rootBone: 1, agility: 0, spirit: 2, insight: 0 }; p.save();
    same(state(Progress.load()), state(p), '已有四维记录不按等级重新灌旧点');
    const missingPool = p.exportSave(); delete missingPool.unspentStatPoints;
    disk[saveKey] = JSON.stringify(missingPool);
    eq(Progress.load().unspentStatPoints, 0, '已有四维但缺余额的档只补零余额');
    eq(JSON.parse(disk[saveKey]).unspentStatPoints, 0, '缺余额迁移立即存档');
    const noStats = p.exportSave(); delete noStats.allocatedStats;
    noStats.unspentStatPoints = 123;
    ok(p.importSave(noStats), '导入旧档也走同一迁移');
    eq(p.unspentStatPoints, 0, '缺已分配字段的旧档迁移清零余额');
    eq(p.allocatedStat('rootBone'), AUTO_STATS.rootBone * (p.level - 1), '导入使用旧种子');
  }

  // 新成长只增加待分配点；瓶颈不升级不发点，突破的实际升级同样发点。
  {
    const p = new Progress(), allocated = { ...p.allocatedStats };
    p.gainCultivation(EXP_TO_NEXT['1']);
    eq(p.level, 2, '修为满后升一级');
    eq(p.unspentStatPoints, perLevel, '每级发点从 GROWTH.perLevel.statPoints 读取');
    same(p.allocatedStats, allocated, '升级不改已分配四维');
    for (const key of STAT_KEYS) eq(p.stat(key), 0, `新档升级后 ${key} 不自动增加`);
    p.gainCultivation(EXP_TO_NEXT['2'] + EXP_TO_NEXT['3']);
    eq(p.level, 4, '一笔修为允许连升两级');
    eq(p.unspentStatPoints, perLevel * 3, '连升按实际级数发点');
    p.save(); same(state(Progress.load()), state(p), '升级未分配点存档往返');
    p.level = 9; p.exp = p.expNeed;
    const before = p.unspentStatPoints;
    p.gainCultivation(1);
    eq(p.unspentStatPoints, before, '瓶颈满修为不发点');
    ok(p.breakthrough(), '修为满时突破成功');
    eq(p.level, 10, '突破升到下一等级');
    eq(p.unspentStatPoints, before + perLevel, '突破实际升级也发未分配点');
    same(p.allocatedStats, allocated, '突破不自动加四维');
    // 葫芦返还足以多升一级时，额外升级也领取同一配表点数。
    p.level = 9; p.exp = p.expNeed; p.overflowExp = EXP_TO_NEXT['10'];
    const beforeBonus = p.unspentStatPoints;
    ok(p.breakthrough(), '带返还修为突破');
    eq(p.breakthroughBonusLevels, 1, '返还修为额外升一级');
    eq(p.unspentStatPoints, beforeBonus + 2 * perLevel, '突破及返还升级逐级发点');
  }
  {
    const p = new Progress(); p.level = 30; p.job = 'taixu_acolyte'; p.skills.taixu_heart = 3;
    p.allocatedStats.spirit = 2;
    ok(p.passiveBonus('spirit') > 0, '测试心法确实提供神识');
    eq(p.stat('spirit'), p.allocatedStat('spirit') + p.passiveBonus('spirit'), '四维仍叠加被动心法');
    eq(p.allocatedStat('__proto__'), 0, '只读已分配接口不读取危险键');
    eq(p.allocatedStat('unknown'), 0, '未知属性没有已分配值');
  }

  // 检查无副作用；确认一次提交完整 delta，空确认不写盘。
  {
    const p = new Progress(); p.unspentStatPoints = 2 * perLevel; p.save();
    const delta = { rootBone: 2, agility: 1, spirit: 1, insight: 1 };
    const before = state(p), writesBefore = writes;
    same(p.checkAllocate(delta), { ok: true }, '合法 delta 检查通过');
    same(state(p), before, '检查不预扣点或写四维'); eq(writes, writesBefore, '检查不保存');
    same(p.applyAllocate(delta), { ok: true }, '确认一次结算完整草稿');
    same(p.allocatedStats, delta, '确认写入四维增量');
    eq(p.unspentStatPoints, 2 * perLevel - 5, '确认扣除草稿总点数');
    eq(writes - writesBefore, 1, '四维和余额只保存一次');
    same(state(Progress.load()), state(p), '确认后存档往返');
    const snapshot = p.exportSave();
    (snapshot.allocatedStats as Record<string, number>).rootBone = 100;
    eq(p.allocatedStat('rootBone'), delta.rootBone, '导出是数据副本');
    const imported = new Progress(); ok(imported.importSave(p.exportSave()), '当前存档可导入');
    same(state(imported), state(p), '导入保留已分配点与余额');
    const emptyBefore = writes;
    same(p.applyAllocate({}), { ok: true }, '空增量无副作用通过');
    same(p.applyAllocate({ rootBone: 0 }), { ok: true }, '全零增量无副作用通过');
    eq(writes, emptyBefore, '空/零确认不另存');
    rejected(p, { rootBone: p.unspentStatPoints + 1 }, 'overspend', '超出余额');
    rejected(p, { rootBone: p.unspentStatPoints, agility: 1 }, 'overspend', '四维合计超支');
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined]) {
      rejected(p, { rootBone: value }, 'invalid', `非法增量 ${String(value)}`);
    }
    for (const value of [null, [], 1, 'rootBone', { unknown: 1 }, { constructor: 1 }, { prototype: 1 },
      JSON.parse('{"__proto__":1}'), Object.create({ rootBone: 1 }), { [Symbol('rootBone')]: 1 }]) {
      rejected(p, value, 'invalid', '非法属性记录/键');
    }
    const sparse = Object.create(null) as Record<string, number>; sparse.spirit = 1;
    ok(p.applyAllocate(sparse).ok, '无原型的合法增量可结算');
    p.unspentStatPoints = Number.MAX_SAFE_INTEGER;
    rejected(p, { rootBone: Number.MAX_SAFE_INTEGER, agility: 1 }, 'invalid', '总和安全整数溢出');
    p.allocatedStats.rootBone = Number.MAX_SAFE_INTEGER;
    rejected(p, { rootBone: 1 }, 'invalid', '单维累计安全整数溢出');
  }

  // 确认时重新检查余额；存储 false 或异常均回滚，恢复后可重试。
  for (const throwingSave of [false, true]) {
    const p = new Progress(); p.unspentStatPoints = perLevel; p.save();
    const before = state(p), diskBefore = disk[saveKey], writesBefore = writes;
    if (throwingSave) Object.defineProperty(p, 'save', { configurable: true, value: () => { throw new Error('测试自定义保存抛异常'); } });
    else failStorage = true;
    let result: AllocateResult;
    try { result = p.applyAllocate({ spirit: 1 }); }
    finally { failStorage = false; if (throwingSave) Reflect.deleteProperty(p, 'save'); }
    same(result, { ok: false, reason: 'save' }, '保存失败报告 save');
    same(state(p), before, '保存失败完整恢复四维与点池');
    eq(disk[saveKey], diskBefore, '保存失败保留原存档');
    eq(writes, writesBefore, '保存失败没有部分落盘');
    ok(p.applyAllocate({ spirit: 1 }).ok, '保存恢复后可用同一草稿重试');
    eq(writes - writesBefore, 1, '重试只保存一笔');
    same(state(Progress.load()), state(p), '重试结果可稳定读回');
  }
  {
    const p = new Progress(); p.unspentStatPoints = perLevel;
    ok(p.checkAllocate({ spirit: perLevel }).ok, '预览时余额足够');
    ok(p.applyAllocate({ rootBone: 1 }).ok, '其他确认花费一个点');
    rejected(p, { spirit: perLevel }, 'overspend', '过时草稿确认重新检查');
  }

  // 导入拒绝非法新字段；load 与 export 则把损坏数据稳定修复为合法四维。
  {
    const p = new Progress(); p.unspentStatPoints = perLevel; p.save();
    const before = state(p), writesBefore = writes;
    for (const invalid of [{ allocatedStats: { rootBone: -1 } }, { allocatedStats: { agility: 0.5 } },
      { allocatedStats: { spirit: Infinity } }, { allocatedStats: { insight: NaN } },
      { allocatedStats: { other: 1 } }, { allocatedStats: JSON.parse('{"__proto__":1}') },
      { allocatedStats: [] }, { allocatedStats: null }, { unspentStatPoints: -1 },
      { unspentStatPoints: 0.5 }, { unspentStatPoints: Infinity }, { unspentStatPoints: '5' }]) {
      eq(p.importSave({ ...p.exportSave(), ...invalid }), false, '非法四维/点池导入拒绝');
      same(state(p), before, '非法导入保留角色');
      eq(writes, writesBefore, '非法导入不保存');
    }
    disk[saveKey] = JSON.stringify({ ...p.exportSave(), allocatedStats: { rootBone: 2, agility: -1, spirit: 0.5, insight: '2', other: 999 }, unspentStatPoints: -5 });
    const loaded = Progress.load();
    same(loaded.allocatedStats, { rootBone: 2, agility: 0, spirit: 0, insight: 0 }, '损坏读档仅保留合法四维整数');
    eq(loaded.unspentStatPoints, 0, '损坏点池修复为零');
    same(state(Progress.load()), state(loaded), '修复存档往返稳定');
    loaded.allocatedStats = { rootBone: -1, agility: NaN, spirit: 0.5, insight: 1, unknown: 100 };
    loaded.unspentStatPoints = Infinity;
    const exported = loaded.exportSave();
    same(exported.allocatedStats, { rootBone: 0, agility: 0, spirit: 0, insight: 1 }, '导出只写合法非负整数四维');
    eq(exported.unspentStatPoints, 0, '导出点池始终为合法非负整数');
  }
  console.log(`stats.test: ${assertions} 条断言通过（旧档迁移/升级与突破发点/四维校验/原子确认/存档往返）`);
} finally {
  Date.now = originalNow;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
