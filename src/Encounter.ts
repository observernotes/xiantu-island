import realmsRaw from '@xt/balance/realms.json';
import itemsRaw from '@xt/balance/items.json';
import karmaRaw from '@xt/balance/karma_flags.json';
import npcsRaw from '@xt/balance/npcs.json';

/** 仅供确定性资格过滤和内存结算；不创建地图锚点、推进脚本或启动战斗。 */
type ReadonlyFields = Readonly<Record<string, unknown>>;
export interface EncounterRewards {
  readonly exp?: number; readonly spiritStone?: number; readonly insight?: number;
  readonly items?: readonly { readonly item: string; readonly count: number }[];
}
export interface EncounterHooks {
  readonly oncePerEncounter?: true;
  readonly karma?: readonly { readonly flag: string; readonly value: true }[];
  readonly affinity?: readonly { readonly npc: string; readonly delta: number }[];
  readonly daoHeartDelta?: number; readonly moralityDelta?: number;
}
export interface EncounterOutcome {
  readonly id: string; readonly status: 'resolved' | 'failed' | 'missed';
  readonly textKeys: readonly string[]; readonly rewards: EncounterRewards; readonly hooks: EncounterHooks;
}
export interface EncounterDefinition {
  readonly id: string; readonly nameKey: string; readonly enabled: boolean; readonly phase: number;
  readonly maps: readonly string[]; readonly trigger: ReadonlyFields;
  readonly weight: number; readonly cooldownMs: number; readonly once: boolean; readonly req: ReadonlyFields;
  readonly script: { readonly start: string; readonly steps: readonly ReadonlyFields[] };
  readonly choices: readonly ReadonlyFields[]; readonly outcomes: readonly EncounterOutcome[];
}
export interface EncountersConfig {
  readonly rules: { readonly pacingRef: 'solo_pacing.encounter'; readonly cooldownClock: 'real_time' };
  readonly encounters: readonly EncounterDefinition[];
}
export interface EncountersValidation { readonly config: EncountersConfig | null; readonly errors: readonly string[] }
export interface EncounterMetadata {
  readonly id: string; readonly nameKey: string; readonly maps: readonly string[]; readonly enabled: boolean;
}
export type EncounterUnavailableReason = 'disabled' | 'missing' | 'invalid';
export type EncounterEligibilityReason = EncounterUnavailableReason | 'invalid_context' | 'map' | 'level' | 'realm'
  | 'quests' | 'sect' | 'features' | 'dao_heart' | 'cooldown' | 'resolved';
export type EncounterEligibility = { readonly eligible: true; readonly metadata: EncounterMetadata }
  | { readonly eligible: false; readonly reason: EncounterEligibilityReason };
export interface EncounterContext {
  readonly mapId: string; readonly level: number; readonly realmId?: string;
  readonly questsDone: ReadonlySet<string> | Readonly<Record<string, boolean | { readonly state: string }>>;
  readonly sectJoined: boolean; readonly featuresReady: ReadonlySet<string> | Readonly<Record<string, boolean>>;
  readonly daoHeart?: number; readonly nowMs: number; readonly save?: EncounterSave;
}
export interface EncounterPendingHooks {
  readonly attemptId: string; readonly encounterId: string;
  readonly payload: Pick<EncounterHooks, 'karma' | 'affinity'>;
}
export interface EncounterState {
  readonly resolved?: Readonly<Record<string, string>>; readonly cooldownUntil?: Readonly<Record<string, number>>;
  readonly hooksApplied?: readonly string[]; readonly settledAttempts?: readonly string[];
  readonly pendingHooks?: readonly EncounterPendingHooks[]; readonly [key: string]: unknown;
}
export interface EncounterSave {
  readonly exp?: number; readonly stones?: number; readonly inventory?: Readonly<Record<string, number>>;
  readonly daoHeart?: number; readonly morality?: number; readonly karmaFlags?: Readonly<Record<string, boolean>>;
  readonly bonusStats?: { readonly insight?: number; readonly [key: string]: unknown };
  readonly encounters?: EncounterState; readonly [key: string]: unknown;
}
export type EncounterPreview = { readonly status: 'unavailable'; readonly reason: EncounterEligibilityReason }
  | { readonly status: 'available'; readonly metadata: EncounterMetadata };
export type EncounterTrigger = { readonly status: 'rejected'; readonly reason: EncounterEligibilityReason }
  | { readonly status: 'accepted'; readonly metadata: EncounterMetadata;
    readonly attempt: { readonly encounterId: string; readonly parentMap: string; readonly stepId: string; readonly startedAtMs: number } };
export type EncounterOutcomePreview = { readonly status: 'unavailable'; readonly reason: EncounterUnavailableReason | 'missing_outcome' }
  | { readonly status: 'available'; readonly outcome: EncounterOutcome; readonly rewards: EncounterRewards; readonly hooks: EncounterHooks };
export interface EncounterSettlementOptions { readonly nowMs: number; readonly attemptId: string; readonly karmaReady?: boolean }
export type EncounterSettlement = { readonly status: 'rejected'; readonly reason: EncounterUnavailableReason
  | 'missing_outcome' | 'invalid_context' | 'invalid_save' | 'duplicate_attempt' | 'resolved' }
  | { readonly status: 'settled'; readonly save: EncounterSave; readonly attemptId: string; readonly outcomeId: string };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const texts = (value: unknown): value is string[] => Array.isArray(value) && Array.from(value).every(text);
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value);
const count = (value: unknown): value is number => integer(value) && value >= 0;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const safeId = (value: unknown): value is string => text(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const realmOrder = realmsRaw.map(row => row.id);
const itemIds = new Set(itemsRaw.map(row => row.id));
const karmaFlags = new Map(karmaRaw.flags.map(row => [row.id, row]));
const affinityNpcs = new Set(npcsRaw.filter(row => 'affinity' in row).map(row => row.id));
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** 坏表只停用奇遇新查询；不猜默认值，也不冻结调用方的 JSON。 */
export function parseEncountersConfig(raw: unknown): EncountersValidation {
  const errors: string[] = [];
  const check = (valid: boolean, path: string, message: string) => { if (!valid) errors.push(`encounters.json ${path}: ${message}`); };
  if (!record(raw)) return freeze({ config: null, errors: ['encounters.json $: 必须为对象'] });
  const rules = record(raw.rules) ? raw.rules : {};
  check(record(raw.rules), '$.rules', '必须为对象');
  check(rules.pacingRef === 'solo_pacing.encounter', '$.rules.pacingRef', '必须引用 solo_pacing.encounter');
  check(rules.cooldownClock === 'real_time', '$.rules.cooldownClock', '必须为 real_time');
  const rows = Array.isArray(raw.encounters) ? raw.encounters : [];
  check(Array.isArray(raw.encounters), '$.encounters', '必须为数组');
  const ids = new Set<string>();
  const unique = (value: unknown, seen: Set<string>, path: string) => {
    check(safeId(value), path, '必须为非空且安全的 id');
    if (safeId(value)) { check(!seen.has(value), path, 'id 不能重复'); seen.add(value); }
  };
  Array.from(rows).forEach((row: unknown, index: number) => {
    const p = `$.encounters[${index}]`;
    if (!record(row)) { check(false, p, '必须为对象'); return; }
    unique(row.id, ids, `${p}.id`);
    check(text(row.nameKey), `${p}.nameKey`, '必须为非空字符串');
    check(typeof row.enabled === 'boolean', `${p}.enabled`, '必须为 boolean');
    check(nonnegative(row.phase) && Number.isSafeInteger(row.phase), `${p}.phase`, '必须为非负安全整数');
    check(texts(row.maps) && row.maps.length > 0, `${p}.maps`, '必须为非空地图 id 数组');
    check(finite(row.weight) && row.weight > 0, `${p}.weight`, '必须为正有限数');
    check(count(row.cooldownMs), `${p}.cooldownMs`, '必须为非负安全整数毫秒数');
    check(typeof row.once === 'boolean', `${p}.once`, '必须为 boolean');
    const trigger = record(row.trigger) ? row.trigger : {};
    check(record(row.trigger), `${p}.trigger`, '必须为对象');
    for (const key of ['type', 'chanceRef', 'anchor', 'reveal']) check(text(trigger[key]), `${p}.trigger.${key}`, '必须为非空字符串');
    check(trigger.type === 'map_enter' || trigger.type === 'meditation_tick', `${p}.trigger.type`, '一期仅支持进图或连续打坐');
    check(trigger.chanceRef === (trigger.type === 'map_enter' ? 'baseChancePerMapEnter' : 'sageAdviceChancePerMeditationMin'),
      `${p}.trigger.chanceRef`, '必须引用对应触发类型的公共概率');
    if (trigger.type === 'meditation_tick') check(count(trigger.intervalMs) && trigger.intervalMs > 0,
      `${p}.trigger.intervalMs`, '连续打坐间隔必须为正安全整数毫秒');
    check(texts(trigger.timeSlots) && trigger.timeSlots.length > 0, `${p}.trigger.timeSlots`, '必须为非空字符串数组');
    for (const key of ['intervalMs', 'reqSpirit']) if (key in trigger) check(nonnegative(trigger[key]), `${p}.trigger.${key}`, '必须为非负有限数');
    const req = record(row.req) ? row.req : {};
    check(record(row.req), `${p}.req`, '必须为对象');
    if ('levelMin' in req) check(count(req.levelMin), `${p}.req.levelMin`, '必须为非负安全整数');
    if ('daoHeartMax' in req) check(count(req.daoHeartMax) && req.daoHeartMax <= 100, `${p}.req.daoHeartMax`, '必须为 0..100 整数');
    for (const key of ['questsDone', 'featuresAll']) if (key in req) check(texts(req[key]), `${p}.req.${key}`, '必须为字符串数组');
    if ('sectJoined' in req) check(typeof req.sectJoined === 'boolean', `${p}.req.sectJoined`, '必须为 boolean');
    if ('realmMin' in req) check(text(req.realmMin) && realmOrder.includes(req.realmMin), `${p}.req.realmMin`, '必须引用已登记境界');

    const script = record(row.script) ? row.script : {}, steps = Array.isArray(script.steps) ? script.steps : [];
    check(record(row.script), `${p}.script`, '必须为对象');
    check(text(script.start), `${p}.script.start`, '必须为起始步骤 id');
    check(Array.isArray(script.steps) && steps.length > 0, `${p}.script.steps`, '必须为非空步骤数组');
    const stepIds = new Set<string>();
    Array.from(steps).forEach((step: unknown, i: number) => {
      const sp = `${p}.script.steps[${i}]`;
      if (!record(step)) { check(false, sp, '必须为对象'); return; }
      unique(step.id, stepIds, `${sp}.id`);
      check(text(step.type), `${sp}.type`, '必须为非空步骤类型');
      for (const key of ['textKeys', 'repeatTextKeys', 'choiceIds']) if (key in step) check(texts(step[key]), `${sp}.${key}`, '必须为字符串数组');
    });
    check(text(script.start) && stepIds.has(script.start), `${p}.script.start`, '必须引用现有步骤');

    const choices = Array.isArray(row.choices) ? row.choices : [], choiceIds = new Set<string>();
    check(Array.isArray(row.choices), `${p}.choices`, '必须为数组');
    Array.from(choices).forEach((choice: unknown, i: number) => {
      const cp = `${p}.choices[${i}]`;
      if (!record(choice)) { check(false, cp, '必须为对象'); return; }
      unique(choice.id, choiceIds, `${cp}.id`);
      check(text(choice.textKey), `${cp}.textKey`, '必须为非空字符串');
      check(text(choice.next) && stepIds.has(choice.next), `${cp}.next`, '必须引用现有步骤');
      for (const key of ['req', 'cost']) if (key in choice) {
        const value = choice[key];
        check(record(value), `${cp}.${key}`, '必须为对象');
        if (!record(value)) continue;
        for (const field of Object.keys(value)) check(field === 'items', `${cp}.${key}.${field}`, '一期选项仅支持物品门槛或消耗');
        if (!('items' in value)) continue;
        check(Array.isArray(value.items), `${cp}.${key}.items`, '必须为物品数组');
        if (!Array.isArray(value.items)) continue;
        const seen = new Set<string>();
        Array.from(value.items).forEach((item: unknown, j: number) => {
          check(record(item) && text(item.item) && itemIds.has(item.item) && count(item.count) && item.count > 0,
            `${cp}.${key}.items[${j}]`, '必须为已登记物品和正安全整数数量');
          if (record(item) && text(item.item)) {
            check(!seen.has(item.item), `${cp}.${key}.items[${j}].item`, '同一物品不能重复登记');
            seen.add(item.item);
          }
        });
      }
      if (row.id === 'enc_stranded_cultivator' && choice.id === 'medicine') {
        for (const key of ['req', 'cost']) {
          const value = record(choice[key]) ? choice[key] : {};
          check(Array.isArray(value.items) && value.items.some(item => record(item) && item.item === 'hp_pill_small' && item.count === 1),
            `${cp}.${key}.items`, '援手药物门槛与消耗都必须为回春丹·小 ×1');
        }
      }
    });
    const outcomes = Array.isArray(row.outcomes) ? row.outcomes : [], outcomeIds = new Set<string>();
    check(Array.isArray(row.outcomes) && outcomes.length > 0, `${p}.outcomes`, '必须为非空结局数组');
    Array.from(outcomes).forEach((outcome: unknown, i: number) => {
      const op = `${p}.outcomes[${i}]`;
      if (!record(outcome)) { check(false, op, '必须为对象'); return; }
      unique(outcome.id, outcomeIds, `${op}.id`);
      check(typeof outcome.status === 'string' && ['resolved', 'failed', 'missed'].includes(outcome.status), `${op}.status`, '必须为 resolved / failed / missed');
      check(texts(outcome.textKeys), `${op}.textKeys`, '必须为字符串数组');
      for (const key of ['rewards', 'hooks']) check(record(outcome[key]), `${op}.${key}`, '必须为对象');
      if (record(outcome.rewards)) {
        for (const key of Object.keys(outcome.rewards)) check(['exp', 'spiritStone', 'items', 'insight'].includes(key), `${op}.rewards.${key}`, '未知奖励字段');
        for (const key of ['exp', 'spiritStone', 'insight']) if (key in outcome.rewards) check(count(outcome.rewards[key]), `${op}.rewards.${key}`, '必须为非负安全整数');
        if ('items' in outcome.rewards) {
          check(Array.isArray(outcome.rewards.items), `${op}.rewards.items`, '必须为物品数组');
          if (Array.isArray(outcome.rewards.items)) Array.from(outcome.rewards.items).forEach((item: unknown, i: number) => {
            check(record(item) && text(item.item) && itemIds.has(item.item) && count(item.count) && item.count > 0,
              `${op}.rewards.items[${i}]`, '必须为已登记物品和正安全整数数量');
          });
        }
      }
      if (record(outcome.hooks)) {
        const hooks = outcome.hooks;
        for (const key of Object.keys(hooks)) check(['oncePerEncounter', 'karma', 'affinity', 'daoHeartDelta', 'moralityDelta'].includes(key), `${op}.hooks.${key}`, '未知 hook 字段');
        if (Object.keys(hooks).length) check(hooks.oncePerEncounter === true, `${op}.hooks.oncePerEncounter`, '一期 hooks 必须仅首次有效结局应用');
        for (const key of ['daoHeartDelta', 'moralityDelta']) if (key in hooks) check(integer(hooks[key]), `${op}.hooks.${key}`, '必须为有符号安全整数');
        if ('karma' in hooks) {
          check(Array.isArray(hooks.karma), `${op}.hooks.karma`, '必须为因果数组');
          if (Array.isArray(hooks.karma)) Array.from(hooks.karma).forEach((hook: unknown, i: number) => {
            const flag = record(hook) && text(hook.flag) ? karmaFlags.get(hook.flag) : undefined;
            check(record(hook) && hook.value === true && !!flag && flag.writers.some(writer => writer.type === 'encounter'
              && writer.id === row.id && writer.outcome === outcome.id), `${op}.hooks.karma[${i}]`, '必须引用本事件结局登记的因果标记且置 true');
          });
        }
        if ('affinity' in hooks) {
          check(Array.isArray(hooks.affinity), `${op}.hooks.affinity`, '必须为好感数组');
          if (Array.isArray(hooks.affinity)) Array.from(hooks.affinity).forEach((hook: unknown, i: number) => {
            check(record(hook) && text(hook.npc) && affinityNpcs.has(hook.npc) && integer(hook.delta),
              `${op}.hooks.affinity[${i}]`, '必须引用有好感配置的 NPC 和有符号安全整数增量');
          });
        }
      }
      if (outcome.status === 'failed' || outcome.status === 'missed') {
        for (const key of ['rewards', 'hooks']) check(record(outcome[key]) && Object.keys(outcome[key]).length === 0,
          `${op}.${key}`, '失败/错过必须为空');
      }
    });
    Array.from(steps).forEach((step: unknown, i: number) => {
      if (!record(step)) return;
      const sp = `${p}.script.steps[${i}]`;
      for (const key of ['next', 'onWin', 'onFail']) if (key in step) check(text(step[key]) && stepIds.has(step[key]), `${sp}.${key}`, '必须引用现有步骤');
      if ('choiceIds' in step && texts(step.choiceIds)) for (const id of step.choiceIds) check(choiceIds.has(id), `${sp}.choiceIds`, '必须引用现有选项');
      if (step.type === 'finish') check(text(step.outcomeId) && outcomeIds.has(step.outcomeId), `${sp}.outcomeId`, '必须引用现有结局');
    });
  });
  if (errors.length) return freeze({ config: null, errors });
  try { return freeze({ config: JSON.parse(JSON.stringify(raw)) as EncountersConfig, errors }); }
  catch { return freeze({ config: null, errors: ['encounters.json $: 必须为可序列化配置'] }); }
}

/** 列出已加载的元数据，不因关态隐藏登记，也不作触发候选抽取。 */
export function listEncounters(config: EncountersConfig | null): readonly EncounterMetadata[] {
  return freeze(config ? config.encounters.map(({ id, nameKey, maps, enabled }) => ({ id, nameKey, maps: [...maps], enabled })) : []);
}

function findEnabled(config: EncountersConfig | null, id: string): EncounterDefinition | EncounterUnavailableReason {
  if (!config) return 'invalid';
  const encounter = config.encounters.find(row => row.id === id);
  if (!encounter) return 'missing';
  return encounter.enabled === true ? encounter : 'disabled';
}
function metadataOf({ id, nameKey, maps, enabled }: EncounterDefinition): EncounterMetadata {
  return { id, nameKey, maps: [...maps], enabled };
}
function hasEntry(values: unknown, id: string, quest = false): boolean {
  if (values instanceof Set) return values.has(id);
  if (!record(values) || !own(values, id)) return false;
  const entry = values[id];
  return entry === true || (quest && record(entry) && entry.state === 'done');
}
const recordOf = (value: unknown, valid: (entry: unknown) => boolean): value is Record<string, unknown> =>
  record(value) && Object.entries(value).every(([key, entry]) => safeId(key) && valid(entry));
function validState(state: unknown): state is EncounterState {
  if (!record(state)) return false;
  if ('resolved' in state && !recordOf(state.resolved, text)) return false;
  if ('cooldownUntil' in state && !recordOf(state.cooldownUntil, count)) return false;
  for (const key of ['hooksApplied', 'settledAttempts']) if (key in state && !texts(state[key])) return false;
  if ('pendingHooks' in state && (!Array.isArray(state.pendingHooks) || !Array.from(state.pendingHooks).every(entry =>
    record(entry) && text(entry.attemptId) && safeId(entry.encounterId) && record(entry.payload)
    && Object.keys(entry.payload).every(key => ['karma', 'affinity'].includes(key))
    && (!('karma' in entry.payload) || (Array.isArray(entry.payload.karma) && Array.from(entry.payload.karma).every(hook =>
      record(hook) && text(hook.flag) && karmaFlags.has(hook.flag) && hook.value === true)))
    && (!('affinity' in entry.payload) || (Array.isArray(entry.payload.affinity) && Array.from(entry.payload.affinity).every(hook =>
      record(hook) && text(hook.npc) && affinityNpcs.has(hook.npc) && integer(hook.delta))))))) return false;
  return true;
}

/** 确定性过滤，不掷概率、不写 visit/active/冷却；所有关态行先于 ctx 读取短路。 */
export function evaluateEncounterEligibility(config: EncountersConfig | null, id: string, ctx?: unknown): EncounterEligibility {
  const encounter = findEnabled(config, id);
  if (typeof encounter === 'string') return freeze({ eligible: false, reason: encounter });
  const reject = (reason: EncounterEligibilityReason): EncounterEligibility => freeze({ eligible: false, reason });
  if (!record(ctx) || !text(ctx.mapId) || !count(ctx.level) || !count(ctx.nowMs)) return reject('invalid_context');
  if (!encounter.maps.includes(ctx.mapId)) return reject('map');
  const req = encounter.req;
  if (finite(req.levelMin) && ctx.level < req.levelMin) return reject('level');
  if (text(req.realmMin)) {
    const current = text(ctx.realmId) ? realmOrder.indexOf(ctx.realmId) : -1;
    if (current < 0 || current < realmOrder.indexOf(req.realmMin)) return reject('realm');
  }
  if (texts(req.questsDone) && !req.questsDone.every(quest => hasEntry(ctx.questsDone, quest, true))) return reject('quests');
  if (typeof req.sectJoined === 'boolean' && ctx.sectJoined !== req.sectJoined) return reject('sect');
  if (texts(req.featuresAll) && !req.featuresAll.every(feature => hasEntry(ctx.featuresReady, feature))) return reject('features');
  if (finite(req.daoHeartMax) && (!count(ctx.daoHeart) || ctx.daoHeart > 100 || ctx.daoHeart > req.daoHeartMax)) return reject('dao_heart');
  let state: EncounterState = {};
  if (ctx.save !== undefined) {
    if (!record(ctx.save)) return reject('invalid_context');
    if (ctx.save.encounters !== undefined) {
      if (!validState(ctx.save.encounters)) return reject('invalid_context');
      state = ctx.save.encounters;
    }
  }
  if (encounter.once && state.resolved && own(state.resolved, id)) return reject('resolved');
  if ((state.cooldownUntil?.[id] ?? 0) > ctx.nowMs) return reject('cooldown');
  return freeze({ eligible: true, metadata: metadataOf(encounter) });
}

/** 全关配置遍历时也不消费 ctx；列表仅代表确定性资格，不代表已抽中事件。 */
export function listEligibleEncounters(config: EncountersConfig | null, ctx?: unknown): readonly EncounterMetadata[] {
  if (!config) return freeze([]);
  const result: EncounterMetadata[] = [];
  for (const encounter of config.encounters) {
    const eligibility = evaluateEncounterEligibility(config, encounter.id, ctx);
    if (eligibility.eligible) result.push(eligibility.metadata);
  }
  return freeze(result);
}

export function previewEncounter(config: EncountersConfig | null, id: string, ctx?: unknown): EncounterPreview {
  const eligibility = evaluateEncounterEligibility(config, id, ctx);
  return eligibility.eligible ? freeze({ status: 'available', metadata: eligibility.metadata })
    : freeze({ status: 'unavailable', reason: eligibility.reason });
}

/** 只返回草稿；调用方负责受信 attemptId、概率、冷却提交及后续脚本运行。 */
export function triggerEncounter(config: EncountersConfig | null, id: string, ctx?: unknown): EncounterTrigger {
  const eligibility = evaluateEncounterEligibility(config, id, ctx);
  if (!eligibility.eligible) return freeze({ status: 'rejected', reason: eligibility.reason });
  const encounter = config!.encounters.find(row => row.id === id)!;
  const context = ctx as EncounterContext;
  return freeze({ status: 'accepted', metadata: eligibility.metadata,
    attempt: { encounterId: id, parentMap: context.mapId, stepId: encounter.script.start, startedAtMs: context.nowMs } });
}

/** 不验资格、不消费上下文，提供独立冻结的结局/奖励/代价快照。 */
export function previewEncounterOutcome(config: EncountersConfig | null, id: string, outcomeId: string): EncounterOutcomePreview {
  const encounter = findEnabled(config, id);
  if (typeof encounter === 'string') return freeze({ status: 'unavailable', reason: encounter });
  const source = encounter.outcomes.find(row => row.id === outcomeId);
  if (!source) return freeze({ status: 'unavailable', reason: 'missing_outcome' });
  const outcome = structuredClone(source);
  return freeze({ status: 'available', outcome, rewards: outcome.rewards, hooks: outcome.hooks });
}

function validSave(save: unknown): save is EncounterSave {
  if (!record(save)) return false;
  for (const key of ['exp', 'stones']) if (key in save && !count(save[key])) return false;
  if ('inventory' in save && !recordOf(save.inventory, count)) return false;
  if ('karmaFlags' in save && !recordOf(save.karmaFlags, value => typeof value === 'boolean')) return false;
  if ('daoHeart' in save && (!count(save.daoHeart) || save.daoHeart > 100)) return false;
  if ('morality' in save && (!integer(save.morality) || save.morality < -100 || save.morality > 100)) return false;
  if ('bonusStats' in save && (!record(save.bonusStats) || ('insight' in save.bonusStats && !count(save.bonusStats.insight)))) return false;
  return !('encounters' in save) || validState(save.encounters);
}

/**
 * 受信结局的内存事务：不重验触发资格/冷却，不做脚本、选项扣料或真实 gainExp。
 * 返回完整深克隆；由调用方原子持久化。nowMs/attemptId 必须显式提供，不用时钟或随机数。
 * 正式 affinity 消费未接，始终排队；pending payload 不含已经即时应用的道心/善恶。
 */
export function settleEncounterOutcome(config: EncountersConfig | null, id: string, outcomeId: string,
  save: unknown, opts?: EncounterSettlementOptions): EncounterSettlement {
  const encounter = findEnabled(config, id);
  if (typeof encounter === 'string') return freeze({ status: 'rejected', reason: encounter });
  const outcome = encounter.outcomes.find(row => row.id === outcomeId);
  if (!outcome) return freeze({ status: 'rejected', reason: 'missing_outcome' });
  if (!opts || !count(opts.nowMs) || !text(opts.attemptId) || (opts.karmaReady !== undefined && typeof opts.karmaReady !== 'boolean')
    || !count(opts.nowMs + encounter.cooldownMs)) return freeze({ status: 'rejected', reason: 'invalid_context' });
  if (!validSave(save)) return freeze({ status: 'rejected', reason: 'invalid_save' });
  const state = save.encounters ?? {};
  if (state.settledAttempts?.includes(opts.attemptId)) return freeze({ status: 'rejected', reason: 'duplicate_attempt' });
  if (encounter.once && state.resolved && own(state.resolved, id)) return freeze({ status: 'rejected', reason: 'resolved' });
  const firstResolution = !(state.resolved && own(state.resolved, id)) && !state.hooksApplied?.includes(id)
    && !state.pendingHooks?.some(entry => entry.encounterId === id);
  const applyHooks = outcome.status === 'resolved' && firstResolution;
  if (applyHooks && ((outcome.hooks.daoHeartDelta !== undefined && !count(save.daoHeart))
    || (outcome.hooks.moralityDelta !== undefined && !integer(save.morality)))) return freeze({ status: 'rejected', reason: 'invalid_save' });
  let next: Record<string, unknown>;
  try { next = structuredClone(save) as Record<string, unknown>; }
  catch { return freeze({ status: 'rejected', reason: 'invalid_save' }); }
  const resolved = { ...state.resolved }, cooldownUntil = { ...state.cooldownUntil };
  const hooksApplied = [...(state.hooksApplied ?? [])], settledAttempts = [...(state.settledAttempts ?? [])];
  // clone 队列，不能冻结输入 save 的任何共享子对象。
  const pendingHooks = structuredClone(state.pendingHooks ?? []) as EncounterPendingHooks[];
  const nextState = { ...(next.encounters as EncounterState | undefined), resolved, cooldownUntil, hooksApplied, settledAttempts, pendingHooks };
  const addReward = (key: 'exp' | 'stones', amount: number | undefined): boolean => {
    if (amount === undefined) return true;
    const total = (save[key] ?? 0) + amount;
    if (!count(total)) return false;
    next[key] = total; return true;
  };
  if (outcome.status === 'resolved') {
    const rewards = outcome.rewards;
    if (!addReward('exp', rewards.exp) || !addReward('stones', rewards.spiritStone)) return freeze({ status: 'rejected', reason: 'invalid_save' });
    if (rewards.items?.length) {
      const inventory = { ...save.inventory };
      for (const reward of rewards.items) {
        const total = (inventory[reward.item] ?? 0) + reward.count;
        if (!count(total)) return freeze({ status: 'rejected', reason: 'invalid_save' });
        inventory[reward.item] = total;
      }
      next.inventory = inventory;
    }
    // 永久属性与首次关系资格一致，救援类 repeat 不得再加永久值。
    if (firstResolution && rewards.insight !== undefined) {
      const total = (save.bonusStats?.insight ?? 0) + rewards.insight;
      if (!count(total)) return freeze({ status: 'rejected', reason: 'invalid_save' });
      next.bonusStats = { ...(next.bonusStats as EncounterSave['bonusStats']), insight: total };
    }
    if (applyHooks) {
      const hooks = outcome.hooks;
      if (hooks.daoHeartDelta !== undefined) next.daoHeart = Math.max(0, Math.min(100, save.daoHeart! + hooks.daoHeartDelta));
      if (hooks.moralityDelta !== undefined) next.morality = Math.max(-100, Math.min(100, save.morality! + hooks.moralityDelta));
      if (opts.karmaReady !== false && hooks.karma?.length) {
        const flags = { ...save.karmaFlags };
        for (const hook of hooks.karma) flags[hook.flag] = hook.value;
        next.karmaFlags = flags;
      }
      const payload: { karma?: EncounterHooks['karma']; affinity?: EncounterHooks['affinity'] } = {};
      if (opts.karmaReady === false && hooks.karma?.length) payload.karma = structuredClone(hooks.karma);
      if (hooks.affinity?.length) payload.affinity = structuredClone(hooks.affinity);
      if (Object.keys(payload).length) pendingHooks.push({ attemptId: opts.attemptId, encounterId: id, payload });
      else if (!hooksApplied.includes(id)) hooksApplied.push(id);
    }
    resolved[id] = outcome.id;
  }
  cooldownUntil[id] = Math.max(cooldownUntil[id] ?? 0, opts.nowMs + encounter.cooldownMs);
  settledAttempts.push(opts.attemptId);
  next.encounters = nextState;
  return freeze({ status: 'settled', save: next as EncounterSave, attemptId: opts.attemptId, outcomeId: outcome.id });
}
