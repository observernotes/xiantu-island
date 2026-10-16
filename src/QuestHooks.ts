import karmaFlagsRaw from '@xt/balance/karma_flags.json';
import { isValidRelationshipState, type RelationshipState } from './RelationshipState';

/** 正魔任务选择；正式开关仍由配置控制，两轴复用既有 moralState 规则。 */
export interface QuestChoiceHooks {
  readonly oncePerQuest: true;
  readonly karma: readonly { readonly flag: string; readonly value: true }[];
  readonly daoHeartDelta?: number;
  readonly moralityDelta?: number;
}
export interface QuestHookChoice {
  readonly id: string; readonly textKey: string; readonly resultTextKeys: readonly string[];
  readonly hooks: QuestChoiceHooks;
}
export interface QuestHook {
  readonly id: string; readonly enabled: boolean; readonly quest: string; readonly node: string;
  readonly on: 'turn_in'; readonly speaker: string; readonly textKeys: readonly string[];
  readonly featuresAll: readonly string[]; readonly choices: readonly QuestHookChoice[];
}
export interface QuestHooksConfig { readonly questHooks: readonly QuestHook[] }
export interface QuestHooksValidation { readonly config: QuestHooksConfig | null; readonly errors: readonly string[] }
export type QuestHookReason = 'disabled' | 'missing' | 'invalid' | 'not_ready' | 'invalid_save'
  | 'already_applied' | 'not_retroactive' | 'conflict' | 'needs_progress' | 'save_failed';
export interface QuestHookUnavailable { readonly status: 'unavailable'; readonly reason: QuestHookReason }
export interface QuestHookRejected { readonly status: 'rejected'; readonly reason: QuestHookReason }
export interface QuestHookAxis {
  readonly before: number; readonly after: number; readonly delta: number; readonly clamped: boolean;
}
export interface QuestHookChange {
  readonly questId: string; readonly choiceId: string; readonly textKey: string;
  readonly daoHeartDelta?: number; readonly moralityDelta?: number;
  readonly daoHeart: QuestHookAxis; readonly morality: QuestHookAxis;
  readonly karma: readonly { readonly flag: string; readonly value: true }[];
  readonly resultTextKeys: readonly string[];
}
export type QuestHookPreview = QuestHookUnavailable | (QuestHookChange & { readonly status: 'preview' });
export type QuestHookSettlement = QuestHookRejected | { readonly status: 'duplicate'; readonly questId: string }
  | (QuestHookChange & { readonly status: 'applied'; readonly questChoice: string; readonly appliedQuestId: string });
/** 快照不读取/迁移存档；持久写入必须传 Progress 的事务能力。 */
export interface QuestHookState {
  readonly daoHeart: number; readonly morality: number; readonly relationshipState: RelationshipState;
  readonly karmaFlags?: Readonly<Record<string, boolean>>;
  readonly quests?: Readonly<Record<string, { readonly state: 'active' | 'done' }>>;
}
export interface QuestHookProgress extends QuestHookState {
  daoHeart: number; morality: number; relationshipState: RelationshipState;
  karmaFlags?: Record<string, boolean>;
  readonly moralVersion?: number;
  ensureDefaults?(): void;
  runSaveTransaction<T>(apply: () => T | undefined): T | undefined;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && Array.from(value).every(text);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** 仅解析选择索引；两轴边界仍由 data.MORAL_STATE / Progress 维护，不创建额外数值轴。 */
export function parseQuestHooks(raw: unknown): QuestHooksValidation {
  const errors: string[] = [];
  const check = (valid: boolean, path: string, message: string) => { if (!valid) errors.push(`karma_flags.json ${path}: ${message}`); };
  if (!record(raw)) return freeze({ config: null, errors: ['karma_flags.json $: 必须为对象'] });
  const hooks = Array.isArray(raw.questHooks) ? raw.questHooks : [];
  check(Array.isArray(raw.questHooks) && hooks.length === 2, '$.questHooks', '必须完整配置本期两个任务选择');
  const seen = new Set<string>();
  const required = ['prologue_medicine', 'sect_tianjian_sword'];
  Array.from(hooks).forEach((hook: unknown, index: number) => {
    const p = `$.questHooks[${index}]`;
    if (!record(hook)) { check(false, p, '必须为对象'); return; }
    check(text(hook.id), `${p}.id`, '必须为非空 id');
    if (text(hook.id)) { check(!seen.has(hook.id), `${p}.id`, 'id 重复'); seen.add(hook.id); }
    check(typeof hook.enabled === 'boolean', `${p}.enabled`, '必须为 boolean');
    for (const key of ['quest', 'node', 'speaker']) check(text(hook[key]), `${p}.${key}`, '必须为非空字符串');
    check(hook.on === 'turn_in', `${p}.on`, '只支持 turn_in 登记');
    check(strings(hook.textKeys), `${p}.textKeys`, '必须为非空文案 key 数组');
    check(strings(hook.featuresAll) && hook.featuresAll.includes('moral_state'), `${p}.featuresAll`, '必须声明 moral_state 依赖');
    const choices = Array.isArray(hook.choices) ? hook.choices : [];
    check(Array.isArray(hook.choices) && choices.length > 0, `${p}.choices`, '必须为非空数组');
    const choicesSeen = new Set<string>();
    Array.from(choices).forEach((choice: unknown, choiceIndex: number) => {
      const cp = `${p}.choices[${choiceIndex}]`;
      if (!record(choice)) { check(false, cp, '必须为对象'); return; }
      check(text(choice.id), `${cp}.id`, '必须为非空 id');
      if (text(choice.id)) { check(!choicesSeen.has(choice.id), `${cp}.id`, '选项 id 重复'); choicesSeen.add(choice.id); }
      check(text(choice.textKey), `${cp}.textKey`, '必须为非空文案 key');
      check(strings(choice.resultTextKeys), `${cp}.resultTextKeys`, '必须为非空文案 key 数组');
      const payload = record(choice.hooks) ? choice.hooks : {};
      check(record(choice.hooks), `${cp}.hooks`, '必须为对象');
      check(payload.oncePerQuest === true, `${cp}.hooks.oncePerQuest`, '必须按任务消耗整题资格');
      for (const key of ['daoHeartDelta', 'moralityDelta']) {
        if (key in payload) check(integer(payload[key]), `${cp}.hooks.${key}`, '存在时必须为安全整数');
      }
      const karma = Array.isArray(payload.karma) ? payload.karma : [];
      check(Array.isArray(payload.karma) && karma.length > 0, `${cp}.hooks.karma`, '必须为非空因果动作数组');
      const flagsSeen = new Set<string>();
      Array.from(karma).forEach((action: unknown, actionIndex: number) => {
        const ap = `${cp}.hooks.karma[${actionIndex}]`;
        if (!record(action)) { check(false, ap, '必须为对象'); return; }
        check(text(action.flag), `${ap}.flag`, '必须为非空因果 id');
        if (text(action.flag)) { check(!flagsSeen.has(action.flag), `${ap}.flag`, '因果动作重复'); flagsSeen.add(action.flag); }
        check(action.value === true, `${ap}.value`, '本期只登记置 true');
      });
    });
  });
  for (const id of required) check(seen.has(id), '$.questHooks', `缺少 ${id}`);
  if (errors.length) return freeze({ config: null, errors });
  try { return freeze({ config: JSON.parse(JSON.stringify({ questHooks: hooks })) as QuestHooksConfig, errors }); }
  catch { return freeze({ config: null, errors: ['karma_flags.json $.questHooks: 必须为可序列化配置'] }); }
}

function enabledHook(config: QuestHooksConfig | null, hookId: string): QuestHook | QuestHookReason {
  if (!config) return 'invalid';
  const hook = config.questHooks.find(candidate => candidate.id === hookId);
  if (!hook) return 'missing';
  // 先门禁再读选项和状态；关态不弹题，也不推断旧任务选择。
  if (!hook.enabled) return 'disabled';
  return hook;
}

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const id = (value: unknown): value is string => text(value) && /^[A-Za-z][\w.-]*$/.test(value)
  && !value.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part));
const dataRecord = (value: unknown): value is Record<string, unknown> => record(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && id(key)
    && own(Object.getOwnPropertyDescriptor(value, key)!, 'value'));
const unavailable = (reason: QuestHookReason): QuestHookUnavailable => freeze({ status: 'unavailable', reason });
const rejected = (reason: QuestHookReason): QuestHookRejected => freeze({ status: 'rejected', reason });

/** writer/互斥来自同一份正式注册表；内存开态仅替换 hook 配置，不授权新 flag。 */
function registeredFlags(hook: QuestHook, choice: QuestHookChoice): boolean {
  return id(hook.quest) && choice.hooks.karma.every(action => karmaFlagsRaw.flags.some(flag => flag.id === action.flag
    && flag.type === 'boolean' && flag.mode === 'once' && flag.default === false && flag.scope === 'playthrough'
    && flag.writers.some(writer => writer.type === 'quest' && writer.id === hook.quest
      && 'node' in writer && writer.node === hook.node && writer.outcome === choice.id)));
}

function stateReason(hook: QuestHook, choice: QuestHookChoice, state: unknown): QuestHookReason | null {
  if (!record(state) || !integer(state.daoHeart) || !integer(state.morality)) return 'not_ready';
  if (!isValidRelationshipState(state.relationshipState)) return 'invalid_save';
  const relationship = state.relationshipState;
  if (relationship.appliedQuestHooks.includes(hook.quest)) return 'already_applied';
  // featuresAll 是功能依赖，不可用剧情 flag 假冒就绪；本期只实现 moral_state。
  if (hook.featuresAll.some(feature => feature !== 'moral_state')) return 'not_ready';
  if (state.quests !== undefined && (!dataRecord(state.quests) || Object.values(state.quests)
    .some(quest => !dataRecord(quest) || quest.state !== 'active' && quest.state !== 'done'))) return 'invalid_save';
  if (state.karmaFlags !== undefined && (!dataRecord(state.karmaFlags) || Object.entries(state.karmaFlags)
    .some(([key, value]) => typeof value !== 'boolean' || !karmaFlagsRaw.flags.some(flag => flag.id === key)))) return 'invalid_save';
  const flags = (state.karmaFlags ?? {}) as Record<string, boolean>;
  const relevant = karmaFlagsRaw.flags.filter(flag => flag.writers.some(writer => writer.type === 'quest' && writer.id === hook.quest));
  if (relevant.some(flag => own(relationship.quarantinedFlags, flag.id))) return 'invalid_save';
  const groups = new Set(relevant.flatMap(flag => 'exclusiveGroup' in flag ? [flag.exclusiveGroup] : []));
  for (const group of groups) {
    if (karmaFlagsRaw.flags.filter(flag => 'exclusiveGroup' in flag && flag.exclusiveGroup === group && flags[flag.id] === true).length > 1) return 'conflict';
    if (choice.hooks.karma.filter(action => karmaFlagsRaw.flags.some(flag => flag.id === action.flag
      && 'exclusiveGroup' in flag && flag.exclusiveGroup === group)).length > 1) return 'conflict';
  }
  // 历史选择/flag 没有收据时不可据此重新加轴；已 done 也不能补问或补发。
  if ((state.quests as QuestHookState['quests'])?.[hook.quest]?.state === 'done'
    || own(relationship.questChoices, hook.quest) || relevant.some(flag => flags[flag.id] === true)) return 'not_retroactive';
  return null;
}

function axis(before: number, delta: number, rule: { min: number; max: number }): QuestHookAxis {
  // 先比较剩余空间，避免安全整数相加后才发现精度溢出。
  const after = delta > rule.max - before ? rule.max : delta < rule.min - before ? rule.min : before + delta;
  return { before, after, delta, clamped: after - before !== delta };
}
function change(hook: QuestHook, choice: QuestHookChoice, state: QuestHookState): QuestHookChange {
  return { questId: hook.quest, choiceId: choice.id, textKey: choice.textKey,
    ...(choice.hooks.daoHeartDelta !== undefined ? { daoHeartDelta: choice.hooks.daoHeartDelta } : {}),
    ...(choice.hooks.moralityDelta !== undefined ? { moralityDelta: choice.hooks.moralityDelta } : {}),
    daoHeart: axis(state.daoHeart, choice.hooks.daoHeartDelta ?? 0, karmaFlagsRaw.rules.moralState.daoHeart),
    morality: axis(state.morality, choice.hooks.moralityDelta ?? 0, karmaFlagsRaw.rules.moralState.morality),
    karma: choice.hooks.karma.map(action => ({ ...action })), resultTextKeys: [...choice.resultTextKeys] };
}

/** 纯预览，关态短路先于选项和状态读取；结果不共享调用方的可变对象。 */
export function previewQuestHook(config: QuestHooksConfig | null, hookId: string, choiceId: string, state?: unknown): QuestHookPreview {
  const hook = enabledHook(config, hookId);
  if (typeof hook === 'string') return unavailable(hook);
  const choice = hook.choices.find(candidate => candidate.id === choiceId);
  if (!choice) return unavailable('missing');
  if (!registeredFlags(hook, choice)) return unavailable('invalid');
  try {
    const reason = stateReason(hook, choice, state);
    return reason ? unavailable(reason) : freeze({ status: 'preview', ...change(hook, choice, state as QuestHookState) });
  } catch { return unavailable('invalid_save'); }
}

/** 仅供已开启 runSaveTransaction 的交付方暂存；不可在事务外调用。 */
export function stageQuestHookChoice(config: QuestHooksConfig | null, hookId: string, choiceId: string, progress: QuestHookProgress): QuestHookSettlement {
  const preview = previewQuestHook(config, hookId, choiceId, progress);
  if (preview.status !== 'preview') return preview.reason === 'already_applied'
    ? freeze({ status: 'duplicate', questId: config!.questHooks.find(hook => hook.id === hookId)!.quest }) : rejected(preview.reason);
  // 缺/旧版本沿用 Progress 规范化；入口已拒绝损坏轴及收据，内部 save 由外层事务静音。
  if (progress.moralVersion === undefined || progress.moralVersion < 1) progress.ensureDefaults?.();
  progress.daoHeart = preview.daoHeart.after;
  progress.morality = preview.morality.after;
  progress.karmaFlags = { ...progress.karmaFlags };
  for (const action of preview.karma) progress.karmaFlags[action.flag] = true;
  progress.relationshipState = { ...progress.relationshipState,
    questChoices: { ...progress.relationshipState.questChoices, [preview.questId]: preview.choiceId },
    appliedQuestHooks: [...progress.relationshipState.appliedQuestHooks, preview.questId] };
  const { status: _status, ...details } = preview;
  return freeze({ status: 'applied', ...details, questChoice: preview.choiceId, appliedQuestId: preview.questId });
}

/** 两轴、因果、选择与 quest id 收据一次保存；失败由 Progress 恢复整份内存。 */
export function settleQuestHook(config: QuestHooksConfig | null, hookId: string, choiceId: string, state?: unknown): QuestHookSettlement {
  const preview = previewQuestHook(config, hookId, choiceId, state);
  if (preview.status !== 'preview') return preview.reason === 'already_applied'
    ? freeze({ status: 'duplicate', questId: config!.questHooks.find(hook => hook.id === hookId)!.quest }) : rejected(preview.reason);
  try {
    if (!record(state) || typeof state.runSaveTransaction !== 'function') return rejected('needs_progress');
    const progress = state as unknown as QuestHookProgress;
    return progress.runSaveTransaction(() => {
      const result = stageQuestHookChoice(config, hookId, choiceId, progress);
      return result.status === 'applied' ? result : undefined;
    }) ?? rejected('save_failed');
  } catch { return rejected('save_failed'); }
}
