/** NPC 好感的只读配置与关态入口；尚不接任务、送礼、发奖或 Progress 存档。 */
export interface AffinityTier {
  readonly id: string; readonly min: number; readonly nameKey: string; readonly dialogKey: string;
}
export type AffinitySource = {
  readonly type: 'quest'; readonly quest: string; readonly on: string; readonly once: boolean; readonly delta: number;
} | {
  readonly type: 'encounter'; readonly encounter: string; readonly outcomes: readonly string[];
  readonly hookRef: string; readonly oncePerEncounter: boolean;
};
export interface AffinityEntry {
  readonly npcId: string; readonly enabled: boolean; readonly min: number; readonly max: number; readonly initial: number;
  readonly tiers: readonly AffinityTier[]; readonly sources: readonly AffinitySource[];
  readonly gifts: { readonly enabled: boolean; readonly likedItems: readonly string[]; readonly delta: number };
  readonly unlocks: readonly {
    readonly id: string; readonly tier: string; readonly once: boolean;
    readonly items: readonly { readonly item: string; readonly count: number }[];
  }[];
  readonly balanceTodo: readonly string[];
}
export type AffinityConfig = Readonly<Record<string, AffinityEntry>>;
export interface AffinityValidation { readonly config: AffinityConfig | null; readonly errors: readonly string[] }
/** 预留角色 JSON 的 affinity 字段形状；本模块不创建、迁移或写入此字段。 */
export type SaveAffinity = Readonly<Record<string, number>>;
export type AffinityUnavailableReason = 'invalid' | 'missing' | 'disabled' | 'not_implemented';
export interface AffinityUnavailable { readonly status: 'unavailable'; readonly reason: AffinityUnavailableReason }
export interface AffinityRejected { readonly status: 'rejected'; readonly reason: AffinityUnavailableReason }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const stringList = (value: unknown): value is string[] => Array.isArray(value) && Array.from(value).every(text);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** 只收录显式 affinity 块；坏表只停用新增查询，不为其他 NPC 补零。 */
export function parseAffinityIndex(npcsRaw: unknown): AffinityValidation {
  const errors: string[] = [];
  const check = (valid: boolean, path: string, message: string) => { if (!valid) errors.push(`npcs.json ${path}: ${message}`); };
  if (!Array.isArray(npcsRaw)) return freeze({ config: null, errors: ['npcs.json $: 必须为 NPC 数组'] });
  const entries: [string, unknown][] = [], seen = new Set<string>();
  Array.from(npcsRaw).forEach((npc: unknown, index: number) => {
    const np = `$[${index}]`, p = `${np}.affinity`;
    if (!record(npc)) { check(false, np, '必须为对象'); return; }
    if (!Object.prototype.hasOwnProperty.call(npc, 'affinity')) return;
    check(text(npc.id), `${np}.id`, '带 affinity 的 NPC 必须有非空 id');
    if (text(npc.id)) { check(!seen.has(npc.id), `${np}.id`, '好感 NPC id 重复'); seen.add(npc.id); }
    if (!record(npc.affinity)) { check(false, p, '必须为对象'); return; }
    const affinity = npc.affinity;
    check(typeof affinity.enabled === 'boolean', `${p}.enabled`, '必须为 boolean');
    check(integer(affinity.min) && affinity.min >= 0, `${p}.min`, '必须为非负安全整数');
    check(integer(affinity.max) && integer(affinity.min) && affinity.max > affinity.min, `${p}.max`, '必须为大于 min 的安全整数');
    check(integer(affinity.initial) && integer(affinity.min) && integer(affinity.max)
      && affinity.initial >= affinity.min && affinity.initial <= affinity.max, `${p}.initial`, '必须为范围内安全整数');
    const tiers = Array.isArray(affinity.tiers) ? affinity.tiers : [], tierIds = new Set<string>();
    check(Array.isArray(affinity.tiers) && tiers.length > 0, `${p}.tiers`, '必须为非空档位数组');
    let previousMin = -Infinity;
    Array.from(tiers).forEach((tier: unknown, ti: number) => {
      const tp = `${p}.tiers[${ti}]`;
      if (!record(tier)) { check(false, tp, '必须为对象'); return; }
      check(text(tier.id), `${tp}.id`, '必须为非空 id');
      if (text(tier.id)) { check(!tierIds.has(tier.id), `${tp}.id`, '档位 id 重复'); tierIds.add(tier.id); }
      for (const key of ['nameKey', 'dialogKey']) check(text(tier[key]), `${tp}.${key}`, '必须为非空字符串');
      check(integer(tier.min) && integer(affinity.min) && integer(affinity.max)
        && tier.min >= affinity.min && tier.min <= affinity.max && tier.min > previousMin
        && (ti !== 0 || tier.min === affinity.min), `${tp}.min`, '首档覆盖 min，后续阈值在范围内严格递增');
      if (integer(tier.min)) previousMin = tier.min;
    });
    const sources = Array.isArray(affinity.sources) ? affinity.sources : [];
    check(Array.isArray(affinity.sources), `${p}.sources`, '必须为来源数组');
    Array.from(sources).forEach((source: unknown, si: number) => {
      const sp = `${p}.sources[${si}]`;
      if (!record(source)) { check(false, sp, '必须为对象'); return; }
      check(source.type === 'quest' || source.type === 'encounter', `${sp}.type`, '必须为 quest / encounter');
      if (source.type === 'quest') {
        for (const key of ['quest', 'on']) check(text(source[key]), `${sp}.${key}`, '必须为非空字符串');
        check(typeof source.once === 'boolean', `${sp}.once`, '必须为 boolean');
        check(integer(source.delta), `${sp}.delta`, '必须为安全整数');
      } else if (source.type === 'encounter') {
        for (const key of ['encounter', 'hookRef']) check(text(source[key]), `${sp}.${key}`, '必须为非空字符串');
        check(stringList(source.outcomes) && source.outcomes.length > 0, `${sp}.outcomes`, '必须为非空结局字符串数组');
        check(typeof source.oncePerEncounter === 'boolean', `${sp}.oncePerEncounter`, '必须为 boolean');
      }
    });
    const gifts = record(affinity.gifts) ? affinity.gifts : {};
    check(record(affinity.gifts), `${p}.gifts`, '必须为对象');
    check(typeof gifts.enabled === 'boolean', `${p}.gifts.enabled`, '必须为 boolean');
    check(stringList(gifts.likedItems), `${p}.gifts.likedItems`, '必须为物品 id 数组');
    check(integer(gifts.delta), `${p}.gifts.delta`, '必须为安全整数');
    const unlocks = Array.isArray(affinity.unlocks) ? affinity.unlocks : [], unlockIds = new Set<string>();
    check(Array.isArray(affinity.unlocks), `${p}.unlocks`, '必须为数组');
    Array.from(unlocks).forEach((unlock: unknown, ui: number) => {
      const up = `${p}.unlocks[${ui}]`;
      if (!record(unlock)) { check(false, up, '必须为对象'); return; }
      check(text(unlock.id), `${up}.id`, '必须为非空 id');
      if (text(unlock.id)) { check(!unlockIds.has(unlock.id), `${up}.id`, '解锁 id 重复'); unlockIds.add(unlock.id); }
      check(text(unlock.tier) && tierIds.has(unlock.tier), `${up}.tier`, '必须引用已有档位');
      check(typeof unlock.once === 'boolean', `${up}.once`, '必须为 boolean');
      const items = Array.isArray(unlock.items) ? unlock.items : [];
      check(Array.isArray(unlock.items), `${up}.items`, '必须为数组');
      Array.from(items).forEach((item: unknown, ii: number) => {
        const ip = `${up}.items[${ii}]`;
        if (!record(item)) { check(false, ip, '必须为对象'); return; }
        check(text(item.item), `${ip}.item`, '必须为非空物品 id');
        check(integer(item.count) && item.count > 0, `${ip}.count`, '必须为正安全整数');
      });
    });
    check(stringList(affinity.balanceTodo), `${p}.balanceTodo`, '必须为字段路径数组');
    if (text(npc.id)) entries.push([npc.id, { ...affinity, npcId: npc.id }]);
  });
  if (errors.length) return freeze({ config: null, errors });
  try { return freeze({ config: JSON.parse(JSON.stringify(Object.fromEntries(entries))) as AffinityConfig, errors }); }
  catch { return freeze({ config: null, errors: ['npcs.json $: affinity 必须为可序列化配置'] }); }
}

function unavailableReason(config: AffinityConfig | null, npcId: string): AffinityUnavailableReason {
  if (!config) return 'invalid';
  const entry = Object.prototype.hasOwnProperty.call(config, npcId) ? config[npcId] : undefined;
  if (!entry) return 'missing';
  if (!entry.enabled) return 'disabled';
  return 'not_implemented';
}

/** 关态在访问存档前返回；开态消费者待后续实现，不隐式初始化 initial。 */
export function getAffinity(config: AffinityConfig | null, npcId: string, _saveAffinity?: SaveAffinity): AffinityUnavailable {
  return freeze({ status: 'unavailable', reason: unavailableReason(config, npcId) });
}
export function previewAffinityDelta(config: AffinityConfig | null, npcId: string, _delta: unknown,
  _saveAffinity?: SaveAffinity): AffinityUnavailable {
  return freeze({ status: 'unavailable', reason: unavailableReason(config, npcId) });
}
/** 无结算副作用；即便测试克隆启用，也不会写好感或发解锁奖励。 */
export function applyAffinityDelta(config: AffinityConfig | null, npcId: string, _delta: unknown,
  _saveAffinity?: SaveAffinity): AffinityRejected {
  return freeze({ status: 'rejected', reason: unavailableReason(config, npcId) });
}
