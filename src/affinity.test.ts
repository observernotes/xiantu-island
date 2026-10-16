import npcsRaw from '@xt/balance/npcs.json';
import { AFFINITY, AFFINITY_ERRORS } from './data';
import { parseAffinityIndex, getAffinity, previewAffinityDelta, applyAffinityDelta, type SaveAffinity } from './Affinity';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type MutableNpc = Record<string, any>;
const clone = (): MutableNpc[] => structuredClone(npcsRaw);
const first = (raw: MutableNpc[]) => raw.find(npc => npc.affinity)!;
function bad(label: string, mutate: (raw: MutableNpc[]) => void) {
  const raw = clone(); mutate(raw);
  const result = parseAffinityIndex(raw);
  eq(result.config, null, `坏表拒绝：${label}`); ok(result.errors.length, `保留错误：${label}`);
  ok(result.errors.every(error => error.startsWith('npcs.json $')), `错误含路径：${label}`);
}

eq(AFFINITY_ERRORS.length, 0, 'data.ts 真表无错误'); ok(AFFINITY, 'data.ts 导出只读好感索引');
const config = AFFINITY, entries = Object.values(config);
eq(entries.length, 9, '正式表 9 名 NPC 好感块全部加载');
eq(entries.filter(entry => entry.enabled).length, 0, '9 块根门禁全部 false');
eq(entries.filter(entry => entry.gifts.enabled).length, 0, '送礼门禁全部 false');
const parsed = parseAffinityIndex(npcsRaw); ok(parsed.config, '独立解析真表成功'); eq(parsed.errors.length, 0, '无忽略错误');
ok(Object.isFrozen(config) && Object.isFrozen(config.village_elder) && Object.isFrozen(config.village_elder.tiers[0])
  && Object.isFrozen(config.enc_wanderer.sources[0]) && Object.isFrozen(config.village_elder.unlocks[0].items), '索引深冻结');
ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.errors), '校验结果和错误冻结');
const raw = clone(), independent = parseAffinityIndex(raw).config;
ok(independent, '可创建独立快照'); eq(Object.isFrozen(first(raw).affinity), false, '不冻结调用方对象');
first(raw).affinity.tiers[0].nameKey = 'changed';
eq(independent.village_elder.tiers[0].nameKey, config.village_elder.tiers[0].nameKey, '调用方改动不影响快照');

const saved: Record<string, number> = { village_elder: 40 }, before = JSON.stringify(saved);
const poison = new Proxy({} as SaveAffinity, { get() { throw new Error('关态不得读取存档'); } });
for (const entry of entries) {
  same(getAffinity(config, entry.npcId, poison), { status: 'unavailable', reason: 'disabled' }, '关态不读存档、不造零值');
  same(previewAffinityDelta(config, entry.npcId, 40, poison), { status: 'unavailable', reason: 'disabled' }, '关态不预览变化');
  same(applyAffinityDelta(config, entry.npcId, 40, saved), { status: 'rejected', reason: 'disabled' }, '关态拒绝结算');
  eq(applyAffinityDelta(config, entry.npcId, null, poison).reason, 'disabled', '关态先于参数和存档检查');
}
eq(JSON.stringify(saved), before, 'apply 不改变传入存档');
same(getAffinity(null, 'village_elder', poison), { status: 'unavailable', reason: 'invalid' }, '坏表查询不可用');
same(applyAffinityDelta(null, 'village_elder', 40, poison), { status: 'rejected', reason: 'invalid' }, '坏表拒绝结算');
same(getAffinity(config, 'tianjian_envoy', poison), { status: 'unavailable', reason: 'missing' }, '无配置 NPC 不补零');
eq(applyAffinityDelta(config, 'toString', 40, poison).reason, 'missing', '原型键不当作 NPC');
const enabledRaw = clone(); first(enabledRaw).affinity.enabled = true;
const enabled = parseAffinityIndex(enabledRaw).config; ok(enabled, '内存克隆可校验开门禁');
eq(getAffinity(enabled, 'village_elder', poison).reason, 'not_implemented', '克隆开态也不实现读取和初始化');
eq(previewAffinityDelta(enabled, 'village_elder', 40, poison).reason, 'not_implemented', '开态预览保留骨架');
eq(applyAffinityDelta(enabled, 'village_elder', 40, poison).reason, 'not_implemented', '开态也没有结算副作用');
ok(Object.isFrozen(applyAffinityDelta(config, 'village_elder', 40)), 'API 结果冻结');

for (const field of ['enabled', 'min', 'max', 'initial', 'tiers', 'sources', 'gifts', 'unlocks', 'balanceTodo']) {
  bad(`缺 ${field}`, raw => { delete first(raw).affinity[field]; });
}
for (const [label, mutate] of [
  ['affinity 非对象', (raw: MutableNpc[]) => { first(raw).affinity = null; }],
  ['NPC id 缺失', (raw: MutableNpc[]) => { delete first(raw).id; }],
  ['NPC id 重复', (raw: MutableNpc[]) => { raw.push(structuredClone(first(raw))); }],
  ['根门禁非 boolean', (raw: MutableNpc[]) => { first(raw).affinity.enabled = 'false'; }],
  ['范围含 null', (raw: MutableNpc[]) => { first(raw).affinity.min = null; }],
  ['范围颠倒', (raw: MutableNpc[]) => { first(raw).affinity.max = -1; }],
  ['初值越界', (raw: MutableNpc[]) => { first(raw).affinity.initial = 1001; }],
  ['小数初值', (raw: MutableNpc[]) => { first(raw).affinity.initial = 0.5; }],
  ['档位空', (raw: MutableNpc[]) => { first(raw).affinity.tiers = []; }],
  ['档位稀疏', (raw: MutableNpc[]) => { delete first(raw).affinity.tiers[0]; }],
  ['档位重复', (raw: MutableNpc[]) => { first(raw).affinity.tiers[1].id = 'stranger'; }],
  ['档位阈值非单调', (raw: MutableNpc[]) => { first(raw).affinity.tiers[1].min = 0; }],
  ['档位缺对白', (raw: MutableNpc[]) => { delete first(raw).affinity.tiers[0].dialogKey; }],
  ['来源稀疏', (raw: MutableNpc[]) => { delete first(raw).affinity.sources[0]; }],
  ['来源类型缺失', (raw: MutableNpc[]) => { delete first(raw).affinity.sources[0].type; }],
  ['任务增量非法', (raw: MutableNpc[]) => { first(raw).affinity.sources[0].delta = Infinity; }],
  ['任务来源缺收据门禁', (raw: MutableNpc[]) => { delete first(raw).affinity.sources[0].once; }],
  ['奇遇结局缺失', (raw: MutableNpc[]) => { delete raw.find(npc => npc.id === 'enc_wanderer')!.affinity.sources[0].outcomes; }],
  ['送礼门禁非法', (raw: MutableNpc[]) => { first(raw).affinity.gifts.enabled = null; }],
  ['解锁引用未知档位', (raw: MutableNpc[]) => { first(raw).affinity.unlocks[0].tier = 'unknown'; }],
  ['解锁物品数量空', (raw: MutableNpc[]) => { first(raw).affinity.unlocks[0].items[0].count = null; }],
] as const) bad(label, mutate);
for (const value of [null, undefined, {}, 'npcs', true]) eq(parseAffinityIndex(value).config, null, '非数组拒绝');
eq(Object.values(parseAffinityIndex(npcsRaw).config!).filter(entry => entry.enabled).length, 0, '测试未改变正式表');
console.log(`affinity tests ok: ${assertions} assertions (9 disabled NPCs, fail-closed schema, immutable snapshot, no save/reward effects)`);
