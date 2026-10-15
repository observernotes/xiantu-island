import { MORAL_STATE } from './data';
import { MORAL_VERSION, Progress } from './Progress';

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

const saveKey = 'xiantu_save_v1';
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const dateNowBefore = Date.now;
const now = dateNowBefore();
const disk: Record<string, string> = {};
const axes = ['daoHeart', 'morality'] as const;
let writes = 0;

function moralFields(p: Progress) {
  return { daoHeart: p.daoHeart, morality: p.morality, moralVersion: p.moralVersion };
}
function load(saved: Record<string, unknown>) {
  disk[saveKey] = JSON.stringify(saved);
  return Progress.load();
}
function legacySave() {
  const saved = new Progress().exportSave();
  for (const field of [...axes, 'moralVersion']) delete saved[field];
  return saved;
}

try {
  Date.now = () => now;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (key: string) => disk[key] ?? null,
    setItem: (key: string, value: string) => { writes++; disk[key] = String(value); },
    removeItem: (key: string) => { delete disk[key]; },
    clear: () => { for (const key of Object.keys(disk)) delete disk[key]; },
    key: (index: number) => Object.keys(disk)[index] ?? null,
    get length() { return Object.keys(disk).length; },
  } });

  const defaults = {
    daoHeart: MORAL_STATE.daoHeart.initial,
    morality: MORAL_STATE.morality.initial,
    moralVersion: MORAL_VERSION,
  };
  same(moralFields(new Progress()), defaults, '新档两轴与版本从配置和版本常量初始化');

  // 旧任务和 flags 仅保存历史事实，不能反推两轴选择。
  {
    const saved = legacySave();
    saved.flags = { prologue_medicine_returned: true, enc_whisper_accepted: true };
    saved.quests = { q_awaken: { state: 'done', kills: {} }, q_fox: { state: 'done', kills: {} } };
    const beforeWrites = writes;
    const p = load(saved);
    same(moralFields(p), defaults, '无两轴和版本的旧档补默认，不根据 flags 或已完成任务推断');
    ok(writes > beforeWrites, '旧版本迁移触发真实保存');
    const persisted = JSON.parse(disk[saveKey]);
    same({ daoHeart: persisted.daoHeart, morality: persisted.morality, moralVersion: persisted.moralVersion }, defaults,
      '两轴默认值与升级版本一起写盘');
    const afterMigration = p.exportSave(), afterWrites = writes;
    same(Progress.load().exportSave(), afterMigration, '迁移结果再次 load 幂等');
    eq(writes, afterWrites, '当前版本再次 load 不重复迁移写盘');
  }

  // 两轴分别缺失时只补对应轴；已有合法值和负善恶原样保留。
  for (const missing of axes) {
    const saved = legacySave();
    const retained = missing === 'daoHeart' ? 'morality' : 'daoHeart';
    const retainedValue = MORAL_STATE[retained].min;
    saved[retained] = retainedValue;
    const p = load(saved);
    eq(p[missing], MORAL_STATE[missing].initial, `旧档仅缺 ${missing} 时独立补默认`);
    eq(p[retained], retainedValue, `补 ${missing} 不覆盖已有 ${retained}`);
    eq(p.moralVersion, MORAL_VERSION, '缺版本旧档登记当前版本');
  }
  {
    const saved = legacySave();
    saved.daoHeart = MORAL_STATE.daoHeart.max;
    saved.morality = MORAL_STATE.morality.min;
    const p = load(saved);
    const expected = { daoHeart: saved.daoHeart, morality: saved.morality, moralVersion: MORAL_VERSION };
    same(moralFields(p), expected, '缺版本旧档保留已有合法两轴并升级版本');
    same(moralFields(Progress.load()), expected, '再次 load 不覆盖已有合法两轴');
    const imported = new Progress();
    eq(imported.importSave(saved), true, '缺版本的合法旧档可以导入');
    same(moralFields(imported), expected, '导入旧档同样保留合法两轴并升级版本');
  }

  // load 走旧档恢复路径；导入入口额外校验，合法边界和负善恶均可往返。
  for (const [daoHeart, morality] of [
    [MORAL_STATE.daoHeart.min, MORAL_STATE.morality.min],
    [MORAL_STATE.daoHeart.max, MORAL_STATE.morality.max],
    [MORAL_STATE.daoHeart.initial, MORAL_STATE.morality.min],
  ]) {
    const p = new Progress();
    p.daoHeart = daoHeart; p.morality = morality;
    const exported = p.exportSave();
    const expected = { daoHeart, morality, moralVersion: MORAL_VERSION };
    same({ daoHeart: exported.daoHeart, morality: exported.morality, moralVersion: exported.moralVersion }, expected,
      'exportSave 包含两轴与版本');
    same(moralFields(load(exported)), expected, 'exportSave → load 保留合法两轴与版本');
    const imported = new Progress();
    eq(imported.importSave(exported), true, '合法边界与负善恶可以导入');
    same(moralFields(imported), expected, 'exportSave → importSave 保留两轴与版本');
    same(moralFields(Progress.load()), expected, '导入后的落盘数据再次 load 保留两轴与版本');
  }
  {
    const imported = new Progress();
    eq(imported.importSave(legacySave()), true, '缺少全部新增字段的旧档可以导入');
    same(moralFields(imported), defaults, '导入旧档补齐默认两轴与版本');
    const futureVersion = MORAL_VERSION + 1;
    const saved = { ...imported.exportSave(), moralVersion: futureVersion };
    eq(imported.importSave(saved), true, '非负安全整数未来版本可以导入');
    eq(imported.moralVersion, futureVersion, '迁移不降低已有未来版本');
    eq(Progress.load().moralVersion, futureVersion, '未来版本往返 load 不降级');
  }

  // 越界整数的规范化直接走 ensureDefaults，不绕过导入入口的范围校验。
  for (const axis of axes) {
    const config = MORAL_STATE[axis];
    for (const [value, expected] of [[config.min - 1, config.min], [config.max + 1, config.max],
      [-(Number.MAX_SAFE_INTEGER + 1), config.min], [Number.MAX_SAFE_INTEGER + 1, config.max]]) {
      const p = new Progress();
      p[axis] = value; p.moralVersion = 0;
      p.ensureDefaults();
      eq(p[axis], expected, `${axis} 越界有限整数裁剪到边界`);
      eq(p.moralVersion, MORAL_VERSION, `${axis} 规范化同时升级旧版本`);
      const once = moralFields(p);
      p.ensureDefaults();
      same(moralFields(p), once, `${axis} 边界规范化幂等`);
    }
    for (const value of [undefined, null, String(config.initial), NaN, Infinity, -Infinity, config.initial + 0.5, true, {}, []]) {
      const p = new Progress();
      Object.assign(p, { [axis]: value });
      p.ensureDefaults();
      eq(p[axis], config.initial, `${axis} 损坏值 ${String(value)} 回退配置初始值`);
    }
    const p = new Progress();
    Reflect.deleteProperty(p, axis);
    p.ensureDefaults();
    eq(p[axis], config.initial, `${axis} 实例缺字段时补配置初始值`);
  }

  // 导入已有坏字段时拒绝整档，不能借规范化把坏输入当成合法存档。
  {
    const p = new Progress();
    const valid = p.exportSave();
    for (const axis of axes) {
      const config = MORAL_STATE[axis];
      for (const value of [config.min - 1, config.max + 1, null, String(config.initial), NaN, Infinity,
        config.initial + 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        const before = p.exportSave(), beforeWrites = writes;
        eq(p.importSave({ ...valid, [axis]: value }), false, `导入拒绝 ${axis} 非法值 ${String(value)}`);
        same(p.exportSave(), before, '拒绝非法两轴不改变实例');
        eq(writes, beforeWrites, '拒绝非法两轴不写盘');
      }
    }
    for (const value of [-1, null, '1', NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const before = p.exportSave(), beforeWrites = writes;
      eq(p.importSave({ ...valid, moralVersion: value }), false, `导入拒绝非法版本 ${String(value)}`);
      same(p.exportSave(), before, '拒绝非法版本不改变实例');
      eq(writes, beforeWrites, '拒绝非法版本不写盘');
    }
    eq(p.importSave({ ...valid, moralVersion: 0 }), true, '版本零是可迁移的合法旧版本');
    eq(p.moralVersion, MORAL_VERSION, '版本零导入后升级当前版本');
  }

  console.log(JSON.stringify({ suite: 'moral-save', passed: true, assertions }));
} finally {
  Date.now = dateNowBefore;
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
