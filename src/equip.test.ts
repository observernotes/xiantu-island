import { ITEMS } from './data';
import { Progress, EQUIP_SLOTS, type EquipResult } from './Progress';
import { CLASS_LIST } from './classes';

let assertions = 0;
function same(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function ok(actual: unknown, message: string) { assertions++; if (!actual) throw new Error(message); }
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const disk: Record<string, string> = {};
let fail = false, writes = 0;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => disk[key] ?? null,
  setItem: (key: string, value: string) => { if (fail) throw new Error('模拟保存失败'); writes++; disk[key] = value; },
} });
const state = (p: Progress) => JSON.stringify([p.equip, p.inventory, p.hp, p.mp]);
function reject(p: Progress, action: () => EquipResult, reason: string) {
  const before = state(p), storage = JSON.stringify(disk), count = writes;
  same(action(), { ok: false, reason }, `${reason} 原因`);
  same(state(p), before, `${reason} 不改角色`);
  same(JSON.stringify(disk), storage, `${reason} 不改磁盘`);
  same(writes, count, `${reason} 不保存`);
}
try {
  same(EQUIP_SLOTS, ['weapon', 'robe', 'shoes'], '三槽固定');
  const p = new Progress(); p.level = 10;
  p.inventory = { wood_sword: 2, bamboo_sword: 1, fox_robe: 1, cloth_shoes: 1 };
  p.equip = { weapon: 'azure_steel_sword' };
  const atkBefore = p.atk;
  same(p.equipItem('wood_sword'), { ok: true }, '允许手动穿更弱装备');
  ok(p.atk < atkBefore, '攻击仍从原 getter 派生');
  same([p.count('wood_sword'), p.count('azure_steel_sword'), p.equip.weapon], [1, 1, 'wood_sword'], '消耗一个，旧装回包');
  same(p.equipItem('wood_sword'), { ok: true }, '同型号有货可以换装');
  same(p.count('wood_sword'), 1, '同型号更换数量守恒');
  same(p.equipItem('fox_robe'), { ok: true }, '穿上狐裘');
  same(p.appearance, 'fox_robe', '旧狐裘兼容 getter');
  same(p.equipItem('cloth_shoes'), { ok: true }, '鞋槽可穿');
  p.hp = p.maxHp; p.mp = p.maxMp;
  same(p.unequipSlot('robe'), { ok: true }, '卸下狐裘');
  same(p.appearance, undefined, '卸下后素体');
  same(p.hp, p.maxHp, '卸下后气血不超过新上限');
  same(JSON.parse(disk.xiantu_save_v1).hp, p.hp, '气血上限与穿脱原子保存');
  const equipped = state(p), loaded = Progress.load();
  same(state(loaded), equipped, '存档往返装备库存保持');
  const imported = new Progress();
  ok(imported.importSave(p.exportSave()), '新档可导入');
  same(state(imported), equipped, '导入装备库存保持');
  const legacy = p.exportSave(); delete legacy.equip;
  ok(imported.importSave(legacy), '旧档缺 equip 可导入');
  same(imported.equip, {}, '旧档缺槽补空');

  reject(p, () => p.equipItem('missing'), 'invalid');
  reject(p, () => p.equipItem('__proto__'), 'invalid');
  reject(p, () => p.equipItem('hp_pill_small'), 'invalid');
  reject(p, () => p.unequipSlot('constructor'), 'invalid');
  reject(p, () => p.unequipSlot('robe'), 'empty');
  reject(p, () => p.equipItem('cloth_shoes'), 'missing');
  p.addTrialItem('cloth_shoes', 1);
  reject(p, () => p.equipItem('cloth_shoes'), 'missing');
  p.removeTrialItem('cloth_shoes', 1);
  p.level = 1;
  reject(p, () => p.equipItem('fox_robe'), 'level');
  p.level = 10; p.addItem('robe_taixu_1', 1);
  reject(p, () => p.equipItem('robe_taixu_1'), 'sect');

  // 每宗穿戴规则与 gainEquip 同源，不改配表或自动掉落逻辑。
  for (const sect of ['taixu', 'lingfu', 'youying', 'wanshou', 'tianjian']) {
    const id = `robe_${sect}_1`, q = new Progress(); q.level = ITEMS[id].reqLevel ?? 10; q.job = CLASS_LIST.find(cls => cls.sect === sect)!.id;
    q.addItem(id, 1);
    same(q.equipItem(id), { ok: true }, `${sect} 本宗道袍可穿`);
    same(q.appearance, ITEMS[id].appearance, `${sect} 原外观 getter`);
    same(q.unequipSlot('robe'), { ok: true }, `${sect} 道袍可卸`);
    same(q.count(id), 1, `${sect} 装备守恒`);
  }
  p.inventory.wood_sword = Number.MAX_SAFE_INTEGER;
  reject(p, () => p.unequipSlot('weapon'), 'overflow');
  reject(p, () => p.equipItem('bamboo_sword'), 'overflow');
  p.inventory.wood_sword = 1;
  fail = true;
  reject(p, () => p.equipItem('bamboo_sword'), 'save');
  reject(p, () => p.unequipSlot('shoes'), 'save');
  fail = false;
  const originalSave = p.save; p.save = () => { throw new Error('自定义存储抛错'); };
  reject(p, () => p.equipItem('bamboo_sword'), 'save'); p.save = originalSave;
  same(p.equipItem('bamboo_sword'), { ok: true }, '失败后可重试');
  const auto = new Progress(); auto.level = 10;
  same(auto.gainEquip('azure_steel_sword'), true, '原掉落自动穿强装');
  same(auto.gainEquip('wood_sword'), false, '原掉落弱装入包');
  same(auto.equip.weapon, 'azure_steel_sword', '原自动规则保持');
  auto.level = 1;
  same(auto.gainEquip('fox_robe'), false, '原等级限制保持');
  same(auto.count('fox_robe'), 1, '原掉落不可穿时入包');
  console.log(`equip tests ok: ${assertions} assertions`);
} finally {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
