/** 奇遇配置的只读骨架；不创建地图锚点、推进脚本、战斗或结算存档。 */
type ReadonlyFields = Readonly<Record<string, unknown>>;
export interface EncounterDefinition {
  readonly id: string; readonly nameKey: string; readonly enabled: boolean; readonly phase: number;
  readonly maps: readonly string[]; readonly trigger: ReadonlyFields;
  readonly weight: number; readonly cooldownMs: number; readonly once: boolean; readonly req: ReadonlyFields;
  readonly script: { readonly start: string; readonly steps: readonly ReadonlyFields[] };
  readonly choices: readonly ReadonlyFields[]; readonly outcomes: readonly ReadonlyFields[];
}
export interface EncountersConfig {
  readonly rules: { readonly pacingRef: 'solo_pacing.encounter'; readonly cooldownClock: 'real_time' };
  readonly encounters: readonly EncounterDefinition[];
}
export interface EncountersValidation { readonly config: EncountersConfig | null; readonly errors: readonly string[] }
export interface EncounterMetadata {
  readonly id: string; readonly nameKey: string; readonly maps: readonly string[]; readonly enabled: boolean;
}
export type EncounterUnavailableReason = 'disabled' | 'missing' | 'invalid' | 'not_implemented';
export interface EncounterPreview { readonly status: 'unavailable'; readonly reason: EncounterUnavailableReason }
export interface EncounterTrigger { readonly status: 'rejected'; readonly reason: EncounterUnavailableReason }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
const texts = (value: unknown): value is string[] => Array.isArray(value) && Array.from(value).every(text);
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
    check(text(value), path, '必须为非空 id');
    if (text(value)) { check(!seen.has(value), path, 'id 不能重复'); seen.add(value); }
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
    check(nonnegative(row.cooldownMs), `${p}.cooldownMs`, '必须为非负有限毫秒数');
    check(typeof row.once === 'boolean', `${p}.once`, '必须为 boolean');
    const trigger = record(row.trigger) ? row.trigger : {};
    check(record(row.trigger), `${p}.trigger`, '必须为对象');
    for (const key of ['type', 'chanceRef', 'anchor', 'reveal']) check(text(trigger[key]), `${p}.trigger.${key}`, '必须为非空字符串');
    check(texts(trigger.timeSlots) && trigger.timeSlots.length > 0, `${p}.trigger.timeSlots`, '必须为非空字符串数组');
    for (const key of ['intervalMs', 'reqSpirit']) if (key in trigger) check(nonnegative(trigger[key]), `${p}.trigger.${key}`, '必须为非负有限数');
    const req = record(row.req) ? row.req : {};
    check(record(row.req), `${p}.req`, '必须为对象');
    for (const key of ['levelMin', 'daoHeartMax']) if (key in req) check(finite(req[key]), `${p}.req.${key}`, '必须为有限数');
    for (const key of ['questsDone', 'featuresAll']) if (key in req) check(texts(req[key]), `${p}.req.${key}`, '必须为字符串数组');
    if ('sectJoined' in req) check(typeof req.sectJoined === 'boolean', `${p}.req.sectJoined`, '必须为 boolean');
    if ('realmMin' in req) check(text(req.realmMin), `${p}.req.realmMin`, '必须为非空字符串');

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
      for (const key of ['req', 'cost']) if (key in choice) check(record(choice[key]), `${cp}.${key}`, '必须为对象');
    });
    const outcomes = Array.isArray(row.outcomes) ? row.outcomes : [], outcomeIds = new Set<string>();
    check(Array.isArray(row.outcomes) && outcomes.length > 0, `${p}.outcomes`, '必须为非空结局数组');
    Array.from(outcomes).forEach((outcome: unknown, i: number) => {
      const op = `${p}.outcomes[${i}]`;
      if (!record(outcome)) { check(false, op, '必须为对象'); return; }
      unique(outcome.id, outcomeIds, `${op}.id`);
      check(['resolved', 'failed', 'missed'].includes(String(outcome.status)), `${op}.status`, '必须为 resolved / failed / missed');
      check(texts(outcome.textKeys), `${op}.textKeys`, '必须为字符串数组');
      for (const key of ['rewards', 'hooks']) check(record(outcome[key]), `${op}.${key}`, '必须为对象');
      if (record(outcome.hooks)) for (const key of ['daoHeartDelta', 'moralityDelta']) {
        if (key in outcome.hooks) check(finite(outcome.hooks[key]), `${op}.hooks.${key}`, '必须为有限数');
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

function unavailableReason(config: EncountersConfig | null, id: string): EncounterUnavailableReason {
  if (!config) return 'invalid';
  const encounter = config.encounters.find(row => row.id === id);
  if (!encounter) return 'missing';
  return encounter.enabled ? 'not_implemented' : 'disabled';
}

/** 先关态短路，不读取 ctx；内存克隆开启仍无脚本运行器。 */
export function previewEncounter(config: EncountersConfig | null, id: string, _ctx?: unknown): EncounterPreview {
  return freeze({ status: 'unavailable', reason: unavailableReason(config, id) });
}

/** 没有奖励、冷却或存档写入口；启用正式玩法另行交接。 */
export function triggerEncounter(config: EncountersConfig | null, id: string, _ctx?: unknown): EncounterTrigger {
  return freeze({ status: 'rejected', reason: unavailableReason(config, id) });
}
