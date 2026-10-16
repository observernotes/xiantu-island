/** 正魔任务选择的关态入口；不接对白、任务交付或 Progress 保存。 */
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
export type QuestHookReason = 'disabled' | 'missing' | 'invalid' | 'not_implemented';
export interface QuestHookPreview { readonly status: 'unavailable'; readonly reason: QuestHookReason }
export interface QuestHookSettlement { readonly status: 'rejected'; readonly reason: QuestHookReason }

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

function unavailableReason(config: QuestHooksConfig | null, hookId: string, choiceId: string): QuestHookReason {
  if (!config) return 'invalid';
  const hook = config.questHooks.find(candidate => candidate.id === hookId);
  if (!hook) return 'missing';
  // 先门禁再读选项和状态；关态不弹题，也不推断旧任务选择。
  if (!hook.enabled) return 'disabled';
  if (!hook.choices.some(choice => choice.id === choiceId)) return 'missing';
  return 'not_implemented';
}

/** state 仅预留调用签名；本轮不读取两轴、因果或任务状态，不提供开态选择。 */
export function previewQuestHook(config: QuestHooksConfig | null, hookId: string, choiceId: string, _state?: unknown): QuestHookPreview {
  return freeze({ status: 'unavailable', reason: unavailableReason(config, hookId, choiceId) });
}

/** 不写 daoHeart / morality / karmaFlags，不提交原任务或发奖；内存开门禁也不可结算。 */
export function settleQuestHook(config: QuestHooksConfig | null, hookId: string, choiceId: string, _state?: unknown): QuestHookSettlement {
  return freeze({ status: 'rejected', reason: unavailableReason(config, hookId, choiceId) });
}
