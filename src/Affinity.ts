import { isValidAffinity, isValidRelationshipState, type RelationshipState } from './RelationshipState';
import type { EncounterState, EncounterPendingHooks } from './Encounter';

/** NPC 好感配置；正式门禁仍由表内 enabled 控制。 */
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
/** 只传数字映射时可预览；持久写入必须走 Progress 事务。 */
export type SaveAffinity = Readonly<Record<string, number>>;
export interface AffinityProgress {
  affinity: Record<string, number>;
  relationshipState: RelationshipState;
  encounters?: EncounterState;
  inventory: Record<string, number>;
  runSaveTransaction<T>(apply: () => T | undefined): T | undefined;
  permanentCount(id: string): number;
  canAddCraftedItem(id: string, count: number): boolean;
  addItem(id: string, count: number): void;
}
export type AffinityUnavailableReason = 'invalid' | 'missing' | 'disabled' | 'invalid_save' | 'invalid_delta'
  | 'invalid_source' | 'needs_progress' | 'save_failed' | 'missing_unlock' | 'locked' | 'inventory';
export interface AffinityUnavailable { readonly status: 'unavailable'; readonly reason: AffinityUnavailableReason }
export interface AffinityRejected { readonly status: 'rejected'; readonly reason: AffinityUnavailableReason }
export interface AffinityReady {
  readonly status: 'ready'; readonly value: number; readonly tier: AffinityTier;
  readonly min: number; readonly max: number; readonly initial: number; readonly needsInitialization: boolean;
}
export interface AffinityChange {
  readonly before: number; readonly after: number; readonly delta: number; readonly clamped: boolean;
  readonly tier: AffinityTier; readonly min: number; readonly max: number;
}
export type AffinityPreview = AffinityChange & { readonly status: 'preview'; readonly needsInitialization: boolean };
export type AffinityApplied = AffinityChange & { readonly status: 'applied'; readonly sourceId?: string };
export interface AffinityDuplicate { readonly status: 'duplicate'; readonly sourceId: string }
export type AffinityConsumption = { readonly status: 'consumed'; readonly count: number } | AffinityRejected;
export type AffinityClaim = { readonly status: 'claimed' | 'duplicate'; readonly receipt: string } | AffinityRejected;

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
    check(id(npc.id), `${np}.id`, '带 affinity 的 NPC 必须有安全 id');
    if (id(npc.id)) { check(!seen.has(npc.id), `${np}.id`, '好感 NPC id 重复'); seen.add(npc.id); }
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
      check(id(tier.id), `${tp}.id`, '必须为安全 id');
      if (id(tier.id)) { check(!tierIds.has(tier.id), `${tp}.id`, '档位 id 重复'); tierIds.add(tier.id); }
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
        check(id(source.quest), `${sp}.quest`, '必须为安全任务 id');
        check(source.on === 'done', `${sp}.on`, '必须为 done');
        check(typeof source.once === 'boolean', `${sp}.once`, '必须为 boolean');
        check(integer(source.delta), `${sp}.delta`, '必须为安全整数');
      } else if (source.type === 'encounter') {
        check(id(source.encounter), `${sp}.encounter`, '必须为安全奇遇 id');
        check(source.hookRef === 'hooks.affinity', `${sp}.hookRef`, '必须为 hooks.affinity');
        check(stringList(source.outcomes) && source.outcomes.length > 0 && source.outcomes.every(id), `${sp}.outcomes`, '必须为非空安全结局 id 数组');
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
      check(id(unlock.id), `${up}.id`, '必须为安全 id');
      if (id(unlock.id)) { check(!unlockIds.has(unlock.id), `${up}.id`, '解锁 id 重复'); unlockIds.add(unlock.id); }
      check(text(unlock.tier) && tierIds.has(unlock.tier), `${up}.tier`, '必须引用已有档位');
      check(typeof unlock.once === 'boolean', `${up}.once`, '必须为 boolean');
      const items = Array.isArray(unlock.items) ? unlock.items : [];
      check(Array.isArray(unlock.items), `${up}.items`, '必须为数组');
      Array.from(items).forEach((item: unknown, ii: number) => {
        const ip = `${up}.items[${ii}]`;
        if (!record(item)) { check(false, ip, '必须为对象'); return; }
        check(id(item.item), `${ip}.item`, '必须为安全物品 id');
        check(integer(item.count) && item.count > 0, `${ip}.count`, '必须为正安全整数');
      });
    });
    check(stringList(affinity.balanceTodo), `${p}.balanceTodo`, '必须为字段路径数组');
    if (id(npc.id)) entries.push([npc.id, { ...affinity, npcId: npc.id }]);
  });
  if (errors.length) return freeze({ config: null, errors });
  try { return freeze({ config: JSON.parse(JSON.stringify(Object.fromEntries(entries))) as AffinityConfig, errors }); }
  catch { return freeze({ config: null, errors: ['npcs.json $: affinity 必须为可序列化配置'] }); }
}

function enabledEntry(config: AffinityConfig | null, npcId: string): AffinityEntry | AffinityUnavailableReason {
  if (!config) return 'invalid';
  const entry = Object.prototype.hasOwnProperty.call(config, npcId) ? config[npcId] : undefined;
  if (!entry) return 'missing';
  if (entry.enabled !== true) return 'disabled';
  return entry;
}

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const id = (value: unknown): value is string => text(value) && /^[A-Za-z][\w.-]*$/.test(value)
  && !value.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part));
const rejected = (reason: AffinityUnavailableReason): AffinityRejected => freeze({ status: 'rejected', reason });
const unavailable = (reason: AffinityUnavailableReason): AffinityUnavailable => freeze({ status: 'unavailable', reason });
function isProgress(value: unknown): value is AffinityProgress {
  return record(value) && typeof value.runSaveTransaction === 'function';
}
function validProgress(value: unknown): value is AffinityProgress {
  return isProgress(value) && isValidAffinity(value.affinity) && isValidRelationshipState(value.relationshipState);
}
function readValue(entry: AffinityEntry, save: SaveAffinity): { value: number; missing: boolean } | null {
  if (!isValidAffinity(save)) return null;
  const missing = !own(save, entry.npcId);
  return { value: missing ? entry.initial : save[entry.npcId], missing };
}
function tierAt(entry: AffinityEntry, value: number): AffinityTier {
  let tier = entry.tiers[0];
  for (const candidate of entry.tiers) if (candidate.min <= value) tier = candidate;
  return { ...tier };
}
function change(entry: AffinityEntry, before: number, delta: number): AffinityChange {
  // 比较剩余空间后再求和，避免两个安全整数相加先溢出精度。
  const after = delta > entry.max - before ? entry.max : delta < entry.min - before ? entry.min : before + delta;
  return { before, after, delta, clamped: after - before !== delta, tier: tierAt(entry, after), min: entry.min, max: entry.max };
}
function transaction<T>(progress: AffinityProgress, apply: () => T | undefined): T | undefined {
  try { return progress.runSaveTransaction(apply); } catch { return undefined; }
}
function validSource(sourceId: unknown, npcId: string): sourceId is string {
  if (typeof sourceId !== 'string') return false;
  const parts = sourceId.split('|');
  return parts.length === 3 && parts[0] === npcId && id(parts[0]) && parts[1] === 'quest' && id(parts[2]);
}
/** 只修改当前事务内存；调用方负责把主状态、数值、收据一起提交。 */
function stageDelta(entry: AffinityEntry, delta: number, progress: AffinityProgress, sourceId?: string): AffinityApplied | AffinityDuplicate | undefined {
  if (!validProgress(progress) || !integer(delta)) return undefined;
  const state = progress.relationshipState;
  if (sourceId && state.appliedAffinitySources.includes(sourceId)) return { status: 'duplicate', sourceId };
  const current = readValue(entry, progress.affinity);
  if (!current) return undefined;
  const result = change(entry, current.value, delta);
  progress.affinity[entry.npcId] = result.after;
  if (sourceId) {
    state.pendingAffinitySources = state.pendingAffinitySources.filter(source => source.sourceId !== sourceId);
    state.appliedAffinitySources.push(sourceId);
  }
  return { status: 'applied', ...result, ...(sourceId ? { sourceId } : {}) };
}

/** 关态先于任何参数/存档读取；Progress 缺项采用一次原子保存初始化。 */
export function getAffinity(config: AffinityConfig | null, npcId: string,
  save?: SaveAffinity | AffinityProgress): AffinityReady | AffinityUnavailable {
  const entry = enabledEntry(config, npcId);
  if (typeof entry === 'string') return unavailable(entry);
  try {
    const progress = isProgress(save) ? save : undefined;
    if (progress && !validProgress(progress)) return unavailable('invalid_save');
    const current = readValue(entry, progress ? progress.affinity : save as SaveAffinity ?? {});
    if (!current) return unavailable('invalid_save');
    // 旧档合法整数原样保留；范围外读数不派生档位，须由显式增量事务裁剪修复。
    if (current.value < entry.min || current.value > entry.max) return unavailable('invalid_save');
    if (progress && current.missing && transaction(progress, () => {
      if (!validProgress(progress)) return undefined;
      progress.affinity[npcId] = entry.initial; return true;
    }) !== true) return unavailable('save_failed');
    return freeze({ status: 'ready', value: current.value, tier: tierAt(entry, current.value), min: entry.min,
      max: entry.max, initial: entry.initial, needsInitialization: current.missing && !progress });
  } catch { return unavailable('invalid_save'); }
}

/** 预览不初始化、不写盘；缺项只以配置 initial 计算。 */
export function previewAffinityDelta(config: AffinityConfig | null, npcId: string, delta: unknown,
  save?: SaveAffinity | AffinityProgress): AffinityPreview | AffinityUnavailable {
  const entry = enabledEntry(config, npcId);
  if (typeof entry === 'string') return unavailable(entry);
  if (!integer(delta)) return unavailable('invalid_delta');
  try {
    const progress = isProgress(save) ? save : undefined;
    if (progress && !validProgress(progress)) return unavailable('invalid_save');
    const current = readValue(entry, progress ? progress.affinity : save as SaveAffinity ?? {});
    if (!current) return unavailable('invalid_save');
    return freeze({ status: 'preview', ...change(entry, current.value, delta), needsInitialization: current.missing });
  } catch { return unavailable('invalid_save'); }
}

/** 数值、来源收据与队列移除同次提交；失败由 Progress 恢复整笔内存。 */
export function applyAffinityDelta(config: AffinityConfig | null, npcId: string, delta: unknown,
  progress?: AffinityProgress | SaveAffinity, sourceId?: string): AffinityApplied | AffinityDuplicate | AffinityRejected {
  const entry = enabledEntry(config, npcId);
  if (typeof entry === 'string') return rejected(entry);
  if (!integer(delta)) return rejected('invalid_delta');
  if (sourceId !== undefined && (!validSource(sourceId, npcId) || !entry.sources.some(source => source.type === 'quest'
    && source.quest === sourceId.split('|')[2] && source.on === 'done'))) return rejected('invalid_source');
  try {
    if (!isProgress(progress)) return rejected('needs_progress');
    if (!validProgress(progress)) return rejected('invalid_save');
    if (sourceId && progress.relationshipState.appliedAffinitySources.includes(sourceId)) return freeze({ status: 'duplicate', sourceId });
    const result = transaction(progress, () => stageDelta(entry, delta, progress, sourceId));
    return result ? freeze(result) : rejected('save_failed');
  } catch { return rejected('invalid_save'); }
}

/** 仅供真实未完成→done 任务的外层 Progress 事务调用，不猜测历史已完成任务。 */
export function stageQuestAffinityCompletion(config: AffinityConfig | null, questId: string, progress: AffinityProgress): boolean {
  if (!config) return true;
  try {
    if (!id(questId)) return false;
    const matched: { entry: AffinityEntry; delta: number }[] = [];
    for (const entry of Object.values(config)) {
      const source = entry.sources.find(source => source.type === 'quest' && source.quest === questId && source.on === 'done');
      if (source?.type === 'quest') matched.push({ entry, delta: source.delta });
    }
    // 无关任务不读取或修改关系状态，损坏的关系收据不能阻挡原任务流程。
    if (!matched.length) return true;
    if (!validProgress(progress)) return false;
    for (const { entry, delta } of matched) {
      const sourceId = `${entry.npcId}|quest|${questId}`, state = progress.relationshipState;
      if (state.appliedAffinitySources.includes(sourceId)) continue;
      if (!entry.enabled) {
        if (!state.pendingAffinitySources.some(pending => pending.sourceId === sourceId)) {
          state.pendingAffinitySources.push({ sourceId, npc: entry.npcId, quest: questId });
        }
      } else if (!stageDelta(entry, delta, progress, sourceId)) return false;
    }
    return true;
  } catch { return false; }
}

/** 只消费已记录的真实交付身份；未启用/不再登记的来源留待处理。 */
export function consumeQuestAffinitySources(config: AffinityConfig | null, progress: AffinityProgress): AffinityConsumption {
  if (!config) return rejected('invalid');
  try {
    if (!validProgress(progress)) return rejected('invalid_save');
    const ready: { entry: AffinityEntry; delta: number; sourceId: string }[] = [];
    for (const pending of progress.relationshipState.pendingAffinitySources) {
      const entry = enabledEntry(config, pending.npc);
      if (typeof entry === 'string') continue;
      const source = entry.sources.find(source => source.type === 'quest' && source.quest === pending.quest && source.on === 'done');
      if (!source || source.type !== 'quest') continue;
      ready.push({ entry, delta: source.delta, sourceId: pending.sourceId });
    }
    if (!ready.length) return freeze({ status: 'consumed', count: 0 });
    const count = transaction(progress, () => {
      let consumed = 0;
      for (const source of ready) {
        const result = stageDelta(source.entry, source.delta, progress, source.sourceId);
        if (!result) return undefined;
        if (result.status === 'applied') consumed++;
      }
      return consumed;
    });
    return count === undefined ? rejected('save_failed') : freeze({ status: 'consumed', count });
  } catch { return rejected('invalid_save'); }
}

function validEncounterState(state: unknown): state is EncounterState {
  if (!record(state)) return false;
  if (state.resolved !== undefined && (!record(state.resolved) || !Object.entries(state.resolved).every(([key, value]) => id(key) && id(value)))) return false;
  if (state.hooksApplied !== undefined && (!Array.isArray(state.hooksApplied) || !Array.from(state.hooksApplied).every(id))) return false;
  const seen = new Set<string>();
  return state.pendingHooks === undefined || Array.isArray(state.pendingHooks) && Array.from(state.pendingHooks).every(pending =>
    record(pending) && text(pending.attemptId) && id(pending.encounterId) && record(pending.payload)
    && !seen.has(pending.encounterId) && !!seen.add(pending.encounterId)
    && Object.keys(pending.payload).every(key => key === 'karma' || key === 'affinity')
    && (pending.payload.karma === undefined || Array.isArray(pending.payload.karma))
    && (pending.payload.affinity === undefined || Array.isArray(pending.payload.affinity)
      && Array.from(pending.payload.affinity).every(hook => record(hook) && id(hook.npc) && integer(hook.delta))));
}

/** 只消费奇遇既有 pendingHooks；来源登记只授权读取 payload，不再另加配置增量。 */
export function consumeEncounterAffinityHooks(config: AffinityConfig | null, progress: AffinityProgress): AffinityConsumption {
  if (!config) return rejected('invalid');
  try {
    if (!validProgress(progress) || progress.encounters !== undefined && !validEncounterState(progress.encounters)) return rejected('invalid_save');
    if (!progress.encounters?.pendingHooks?.length) return freeze({ status: 'consumed', count: 0 });
    const encounterState = progress.encounters;
    const ready = encounterState.pendingHooks?.some(pending => pending.payload.affinity?.some(hook => {
      const entry = enabledEntry(config, hook.npc), outcome = encounterState.resolved?.[pending.encounterId];
      return typeof entry !== 'string' && !!outcome && !encounterState.hooksApplied?.includes(pending.encounterId)
        && entry.sources.some(source => source.type === 'encounter' && source.encounter === pending.encounterId
          && source.hookRef === 'hooks.affinity' && source.outcomes.includes(outcome));
    }));
    if (!ready) return freeze({ status: 'consumed', count: 0 });
    let count = 0;
    // 整批已就绪 hook 与队列改写同次保存；失败保留原队列和所有好感值。
    const result = transaction(progress, () => {
      if (!validProgress(progress) || !validEncounterState(progress.encounters)) return undefined;
      const state = progress.encounters, pendingHooks: EncounterPendingHooks[] = [];
      const hooksApplied = [...(state.hooksApplied ?? [])];
      for (const pending of state.pendingHooks ?? []) {
        const remaining = [];
        for (const hook of pending.payload.affinity ?? []) {
          const entry = enabledEntry(config, hook.npc), outcome = state.resolved?.[pending.encounterId];
          if (typeof entry === 'string' || !outcome || hooksApplied.includes(pending.encounterId)
            || !entry.sources.some(source => source.type === 'encounter' && source.encounter === pending.encounterId
              && source.hookRef === 'hooks.affinity' && source.outcomes.includes(outcome))) {
            remaining.push({ ...hook }); continue;
          }
          if (!stageDelta(entry, hook.delta, progress)) return undefined;
          count++;
        }
        const payload = { ...pending.payload };
        if (remaining.length) payload.affinity = remaining; else delete payload.affinity;
        if (Array.isArray(payload.karma) && !payload.karma.length) delete payload.karma;
        if (Object.keys(payload).length) pendingHooks.push({ ...pending, payload });
        else if (!hooksApplied.includes(pending.encounterId)) hooksApplied.push(pending.encounterId);
      }
      if (!count) return 0;
      progress.encounters = { ...state, pendingHooks, hooksApplied };
      return count;
    });
    return result === undefined ? rejected('save_failed') : freeze({ status: 'consumed', count: result });
  } catch { return rejected('invalid_save'); }
}

/** 档位礼仅主动领取；到账检查、收据与保存任一步失败都回滚。 */
export function claimAffinityUnlock(config: AffinityConfig | null, npcId: string, unlockId: string,
  progress: AffinityProgress): AffinityClaim {
  const entry = enabledEntry(config, npcId);
  if (typeof entry === 'string') return rejected(entry);
  const unlock = entry.unlocks.find(unlock => unlock.id === unlockId);
  if (!unlock) return rejected('missing_unlock');
  try {
    if (!validProgress(progress)) return rejected('invalid_save');
    const receipt = `${npcId}|${unlockId}`;
    if (progress.relationshipState.claimedAffinityRewards.includes(receipt)) return freeze({ status: 'duplicate', receipt });
    const current = readValue(entry, progress.affinity), tier = entry.tiers.find(tier => tier.id === unlock.tier);
    if (!current || !tier) return rejected('invalid_save');
    if (current.value < tier.min) return rejected('locked');
    const items: Record<string, number> = {};
    for (const reward of unlock.items) {
      const total = (items[reward.item] ?? 0) + reward.count;
      if (!id(reward.item) || !integer(total) || total <= 0) return rejected('inventory');
      items[reward.item] = total;
    }
    for (const [item, amount] of Object.entries(items)) {
      const held = progress.permanentCount(item);
      if (!integer(held) || held < 0 || !integer(held + amount) || !progress.canAddCraftedItem(item, amount)) return rejected('inventory');
    }
    const result = transaction(progress, () => {
      if (!validProgress(progress) || progress.relationshipState.claimedAffinityRewards.includes(receipt)) return undefined;
      for (const [item, amount] of Object.entries(items)) {
        const held = progress.permanentCount(item);
        if (!progress.canAddCraftedItem(item, amount)) return undefined;
        const delivered = progress.addItem(item, amount) as unknown;
        if (delivered === false || progress.permanentCount(item) !== held + amount) return undefined;
      }
      if (current.missing) progress.affinity[npcId] = entry.initial;
      progress.relationshipState.claimedAffinityRewards.push(receipt);
      return { status: 'claimed' as const, receipt };
    });
    return result ? freeze(result) : rejected('save_failed');
  } catch { return rejected('inventory'); }
}
