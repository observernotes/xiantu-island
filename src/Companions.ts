import { getAffinity, type AffinityConfig, type SaveAffinity } from './Affinity';

/** 同门仅登记苏师姐；表只读，不负责同行 AI 或创建实体。 */
export const SU_COMPANION_ID = 'companion_senior_sister_su';
export const SU_COMPANION_NPC_ID = 'senior_sister_su';
export const COMPANION_MODES = Object.freeze(['follow', 'free', 'stay'] as const);
export type CompanionMode = typeof COMPANION_MODES[number];
export interface CompanionEntry {
  readonly id: typeof SU_COMPANION_ID; readonly enabled: boolean;
  readonly npcId: typeof SU_COMPANION_NPC_ID; readonly inviteTier: 'confidant';
  readonly type: 'fellow'; readonly levelSync: 'player';
  readonly skills: readonly { readonly skillId: string; readonly role: 'primary' | 'area' | 'support' }[];
  readonly balanceTodo: readonly string[];
}
export interface CompanionsConfig {
  readonly version: 'v0.6-draft'; readonly enabled: boolean;
  readonly maxHumanoidCompanions: 1; readonly damageRatioOfPlayer: number; readonly reviveMs: number;
  readonly modes: readonly CompanionMode[]; readonly companions: readonly CompanionEntry[];
  readonly balanceTodo: readonly string[];
}
export interface CompanionsValidation { readonly config: CompanionsConfig | null; readonly errors: readonly string[] }
export interface CompanionRelation { mode: CompanionMode }
export type CompanionRelations = Record<string, CompanionRelation>;
export interface CompanionSave {
  readonly affinity: SaveAffinity;
  readonly companionRelations?: CompanionRelations;
}
export interface CompanionProgress extends CompanionSave {
  companionRelations?: CompanionRelations;
  runSaveTransaction<T>(apply: () => T | undefined): T | undefined;
}
export type CompanionInviteStatus = 'disabled' | 'unavailable' | 'already' | 'need_confidant' | 'ok';
export interface CompanionInviteResult {
  readonly status: CompanionInviteStatus; readonly canInvite: boolean; readonly showInvite: boolean;
  readonly hintKey: `companion.invite.${CompanionInviteStatus}`;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const mode = (value: unknown): value is CompanionMode => typeof value === 'string' && (COMPANION_MODES as readonly string[]).includes(value);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** 缺唯一条目合法且保持关态；不补对象、不猜预算、不读取好感或赠礼数据。 */
export function parseCompanionsConfig(raw: unknown,
  skills?: readonly { readonly id: string }[] | Readonly<Record<string, { readonly id: string }>>): CompanionsValidation {
  const errors: string[] = [];
  const check = (valid: boolean, path: string, message: string) => { if (!valid) errors.push(`companions.json ${path}: ${message}`); };
  const emptyTodo = (value: unknown, path: string) => check(Array.isArray(value) && value.length === 0, path, '正式表 balanceTodo 必须为空数组');
  if (!record(raw)) return freeze({ config: null, errors: ['companions.json $: 必须为对象'] });
  check(raw.version === 'v0.6-draft', '$.version', '仅支持 v0.6-draft');
  check(typeof raw.enabled === 'boolean', '$.enabled', '必须为 boolean');
  check(raw.maxHumanoidCompanions === 1, '$.maxHumanoidCompanions', '一期上限必须为 1');
  check(positive(raw.damageRatioOfPlayer) && raw.damageRatioOfPlayer <= 1, '$.damageRatioOfPlayer', '必须为不大于 1 的正有限总预算');
  check(positive(raw.reviveMs) && Number.isSafeInteger(raw.reviveMs), '$.reviveMs', '必须为正安全整数');
  check(Array.isArray(raw.modes) && raw.modes.length === COMPANION_MODES.length
    && COMPANION_MODES.every((value, index) => raw.modes instanceof Array && raw.modes[index] === value),
  '$.modes', '必须依次为 follow / free / stay');
  const entries = Array.isArray(raw.companions) ? raw.companions : [];
  check(Array.isArray(raw.companions) && entries.length <= 1, '$.companions', '一期只允许苏师姐一个条目，缺条目时不可邀请');
  const knownSkills = skills ? new Set(Object.values(skills).map(skill => skill.id)) : undefined;
  Array.from(entries).forEach((entry: unknown, index: number) => {
    const p = `$.companions[${index}]`;
    if (!record(entry)) { check(false, p, '必须为对象'); return; }
    const expected = { id: SU_COMPANION_ID, npcId: SU_COMPANION_NPC_ID, inviteTier: 'confidant', type: 'fellow', levelSync: 'player' };
    for (const [key, value] of Object.entries(expected)) check(entry[key] === value, `${p}.${key}`, `必须为 ${value}`);
    check(typeof entry.enabled === 'boolean', `${p}.enabled`, '必须为 boolean');
    const expectedSkills = [['sword_qi_slash', 'primary'], ['whirl_sword', 'area'], ['sword_shield', 'support']];
    check(Array.isArray(entry.skills) && entry.skills.length === expectedSkills.length, `${p}.skills`, '必须保留现有三项技能映射');
    if (Array.isArray(entry.skills)) Array.from(entry.skills).forEach((skill: unknown, si: number) => {
      const sp = `${p}.skills[${si}]`, expectedSkill = expectedSkills[si];
      if (!record(skill)) { check(false, sp, '必须为对象'); return; }
      check(!!expectedSkill && skill.skillId === expectedSkill[0] && (!knownSkills || knownSkills.has(String(skill.skillId))), `${sp}.skillId`, '必须引用既有技能映射');
      check(!!expectedSkill && skill.role === expectedSkill[1], `${sp}.role`, '必须保留既有技能职责');
    });
    emptyTodo(entry.balanceTodo, `${p}.balanceTodo`);
  });
  emptyTodo(raw.balanceTodo, '$.balanceTodo');
  if (errors.length) return freeze({ config: null, errors });
  try { return freeze({ config: JSON.parse(JSON.stringify(raw)) as CompanionsConfig, errors }); }
  catch { return freeze({ config: null, errors: ['companions.json $: 必须为可序列化配置'] }); }
}

/** 缺失旧档字段保持缺失；坏记录不清空或重建，交由存档层拒绝导入/保留原值。 */
export function isValidCompanionRelations(value: unknown): value is CompanionRelations | undefined {
  if (value === undefined) return true;
  try {
    if (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
    return Reflect.ownKeys(value).every(key => {
      if (key !== SU_COMPANION_ID) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
      const relation = descriptor.value;
      return record(relation) && [Object.prototype, null].includes(Object.getPrototypeOf(relation))
        && Reflect.ownKeys(relation).length === 1 && Object.prototype.hasOwnProperty.call(relation, 'mode')
        && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(relation, 'mode'), 'value') && mode(relation.mode);
    });
  } catch { return false; }
}

function entryFor(config: CompanionsConfig): CompanionEntry | undefined {
  return config.companions.find(entry => entry.id === SU_COMPANION_ID);
}
function gate(config: CompanionsConfig | null): CompanionEntry | CompanionInviteStatus {
  if (!config) return 'unavailable';
  if (config.enabled !== true) return 'disabled';
  const entry = entryFor(config);
  if (!entry || entry.enabled !== true) return 'disabled';
  if (entry.npcId !== SU_COMPANION_NPC_ID || entry.inviteTier !== 'confidant') return 'unavailable';
  return entry;
}
function result(status: CompanionInviteStatus): CompanionInviteResult {
  return freeze({ status, canInvite: status === 'ok', showInvite: status === 'ok', hintKey: `companion.invite.${status}` });
}

/** design/20 §2.2：关态 → unavailable → already → need_confidant → ok。关态不碰存档。 */
export function canInvite(config: CompanionsConfig | null, affinityConfig: AffinityConfig | null,
  save?: CompanionSave, companionId: string = SU_COMPANION_ID): CompanionInviteResult {
  const entry = gate(config);
  if (typeof entry === 'string') return result(entry);
  if (companionId !== SU_COMPANION_ID) return result('unavailable');
  try {
    if (!save || !isValidCompanionRelations(save.companionRelations)) return result('unavailable');
    const affinity = getAffinity(affinityConfig, entry.npcId, save.affinity);
    const tiers = affinityConfig?.[entry.npcId]?.tiers;
    const required = tiers?.find(tier => tier.id === entry.inviteTier);
    if (affinity.status !== 'ready' || !required || !Number.isSafeInteger(required.min)) return result('unavailable');
    if (save.companionRelations?.[entry.id]) return result('already');
    if (affinity.value < required.min) return result('need_confidant');
    return result('ok');
  } catch { return result('unavailable'); }
}

/** 仅关系事务，无实体/礼物/好感副作用；关态在事务和存档读取之前拒绝。 */
export function invite(config: CompanionsConfig | null, affinityConfig: AffinityConfig | null,
  progress?: CompanionProgress, companionId: string = SU_COMPANION_ID): CompanionInviteResult {
  const eligibility = canInvite(config, affinityConfig, progress, companionId);
  if (!eligibility.canInvite) return eligibility;
  if (!progress || typeof progress.runSaveTransaction !== 'function') return result('unavailable');
  try {
    return progress.runSaveTransaction(() => {
      const current = canInvite(config, affinityConfig, progress, companionId);
      if (!current.canInvite) return current;
      progress.companionRelations = { ...progress.companionRelations, [SU_COMPANION_ID]: { mode: 'follow' } };
      return current;
    }) ?? result('unavailable');
  } catch { return result('unavailable'); }
}

/** 唯一的运行态投影；保留的存档关系不等于可生成同行实体。 */
export function activeCompanion(config: CompanionsConfig | null,
  save?: Pick<CompanionSave, 'companionRelations'>): Readonly<{ id: typeof SU_COMPANION_ID; mode: CompanionMode }> | null {
  const entry = gate(config);
  if (typeof entry === 'string') return null;
  try {
    if (!save || !isValidCompanionRelations(save.companionRelations)) return null;
    const relation = save.companionRelations?.[entry.id];
    return relation ? freeze({ id: entry.id, mode: relation.mode }) : null;
  } catch { return null; }
}

/** follow/free/stay 只能消费已激活的关系；查询本身不写模式。 */
export function canControlCompanion(config: CompanionsConfig | null,
  save?: Pick<CompanionSave, 'companionRelations'>): boolean {
  return activeCompanion(config, save) !== null;
}
