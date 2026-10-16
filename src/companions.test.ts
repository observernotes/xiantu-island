import companionsRaw from '@xt/balance/companions.json';
import npcsRaw from '@xt/balance/npcs.json';
import { parseAffinityIndex } from './Affinity';
import { activeCompanion, canControlCompanion, canInvite, COMPANION_MODES, invite,
  isValidCompanionRelations, parseCompanionsConfig, SU_COMPANION_ID, type CompanionsConfig } from './Companions';

/** 仅关态夹具：从不同时开启根与条目，也不创建同行 AI。 */
export function runCompanionsTests(): void {
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
  };
  const same = (actual: unknown, expected: unknown, message: string) => eq(JSON.stringify(actual), JSON.stringify(expected), message);
  const clone = (): Record<string, any> => JSON.parse(JSON.stringify(companionsRaw));
  const parse = (input: unknown): CompanionsConfig => {
    const checked = parseCompanionsConfig(input);
    same(checked.errors, [], '关态配置通过校验');
    if (!checked.config) throw new Error('关态配置不可用');
    return checked.config;
  };
  const allFrozen = (value: unknown): boolean => !value || typeof value !== 'object'
    || Object.isFrozen(value) && Object.values(value).every(allFrozen);
  const config = parse(companionsRaw);
  const affinity = parseAffinityIndex(npcsRaw);
  same(affinity.errors, [], '真好感表校验通过');
  eq(companionsRaw.enabled, false, '真表同门根仍关闭');
  eq(companionsRaw.companions.length, 1, '真表唯一同门');
  eq(companionsRaw.companions[0].id, SU_COMPANION_ID, '真表仅苏师姐');
  eq(companionsRaw.companions[0].enabled, false, '真表唯一条目仍关闭');
  eq(affinity.config?.senior_sister_su.enabled, true, '苏好感已开不能推定同门开放');
  eq(affinity.config?.senior_sister_su.gifts.enabled, false, '苏 gifts 仍关闭');
  eq(allFrozen(config), true, '配置深只读');
  eq(allFrozen(COMPANION_MODES), true, '模式枚举只读');
  {
    const input = clone(), checked = parseCompanionsConfig(input);
    eq(allFrozen(checked), true, '校验结果与诊断深只读');
    eq(Object.isFrozen(input), false, '不冻结调用者原表');
    input.reviveMs++;
    eq(checked.config?.reviveMs, config.reviveMs, '解析结果与调用者表脱离');
  }

  const entryClosedInput = clone();
  entryClosedInput.enabled = true; // 根开而条目保持 false：仍是关态，无双开 fixture。
  const missingInput = clone(); missingInput.enabled = true; missingInput.companions = [];
  const closedConfigs = [config, parse(entryClosedInput), parse(missingInput)];
  const expected = { status: 'disabled', canInvite: false, showInvite: false, hintKey: 'companion.invite.disabled' };
  for (const closed of closedConfigs) {
    for (const mode of COMPANION_MODES) {
      let transactions = 0, entities = 0;
      const progress = {
        affinity: { senior_sister_su: affinity.config?.senior_sister_su.max ?? 0 },
        companionRelations: { [SU_COMPANION_ID]: { mode } },
        runSaveTransaction<T>(apply: () => T | undefined): T | undefined { transactions++; return apply(); },
        spawnCompanion() { entities++; },
      };
      const before = JSON.stringify(progress);
      same(canInvite(closed, affinity.config, progress), expected, '关态优先于已有关系与知交');
      same(invite(closed, affinity.config, progress), expected, '失效交互仅提示 disabled');
      eq(activeCompanion(closed, progress), null, '关态既有关系不投影同行实体');
      eq(canControlCompanion(closed, progress), false, '关态不可执行 follow/free/stay 模式操作');
      eq(transactions, 0, '失败邀请从不进入存档事务');
      eq(entities, 0, '关态不生成同行实体');
      eq(JSON.stringify(progress), before, '关态不写关系、不改好感或模式');
      const reloaded = JSON.parse(JSON.stringify(progress));
      same(reloaded.companionRelations, progress.companionRelations, '关态存档关系与模式原样保留');
      eq(activeCompanion(closed, reloaded), null, '重载保留记录也不激活');
    }
    const missingSave = { affinity: {} };
    same(invite(closed, affinity.config, missingSave as any), expected, '旧档缺关系也先关态');
    eq(Object.prototype.hasOwnProperty.call(missingSave, 'companionRelations'), false, '关态不初始化旧档关系字段');
    const unreadable = new Proxy({}, { get() { throw new Error('关态不得读取存档依赖'); } });
    same(canInvite(closed, null, unreadable as any, '__invalid'), expected, '关态先于无好感/无效请求，且不读存档');
    same(invite(closed, null, unreadable as any), expected, '关态失效交互不读事务方法');
    eq(activeCompanion(closed, unreadable as any), null, '关态实体投影不读保存记录');
    eq(canControlCompanion(closed, unreadable as any), false, '关态模式门禁不读保存记录');
  }

  eq(isValidCompanionRelations(undefined), true, '旧档缺关系字段合法且不强补');
  eq(isValidCompanionRelations({}), true, '显式空关系合法');
  for (const mode of COMPANION_MODES) eq(isValidCompanionRelations({ [SU_COMPANION_ID]: { mode } }), true, '现有关系允许保存三种模式');
  for (const bad of [null, [], false, { another_companion: { mode: 'follow' } },
    { [SU_COMPANION_ID]: null }, { [SU_COMPANION_ID]: { mode: 'attack' } },
    { [SU_COMPANION_ID]: { mode: 'follow', duplicate: true } }]) {
    eq(isValidCompanionRelations(bad), false, '损坏关系不当空关系处理');
  }
  const getterRelation = Object.defineProperty({}, SU_COMPANION_ID, { get() { throw new Error('不可执行存档 getter'); } });
  eq(isValidCompanionRelations(getterRelation), false, '拒绝存档访问器且不执行它');
  for (const [path, mutate] of [
    ['$.enabled', (input: Record<string, any>) => { input.enabled = 'false'; }],
    ['$.companions[0].enabled', (input: Record<string, any>) => { delete input.companions[0].enabled; }],
    ['$.companions[0].npcId', (input: Record<string, any>) => { input.companions[0].npcId = 'other_npc'; }],
    ['$.companions[0].inviteTier', (input: Record<string, any>) => { input.companions[0].inviteTier = 'friend'; }],
    ['$.companions', (input: Record<string, any>) => { input.companions.push(input.companions[0]); }],
    ['$.reviveMs', (input: Record<string, any>) => { input.reviveMs = null; }],
    ['$.modes', (input: Record<string, any>) => { input.modes.reverse(); }],
    ['$.balanceTodo', (input: Record<string, any>) => { input.balanceTodo = ['reviveMs']; }],
  ] as const) {
    const input = clone(); mutate(input);
    const checked = parseCompanionsConfig(input);
    eq(checked.config, null, `坏表 ${path} 拒绝启用`);
    eq(checked.errors.some(error => error.includes(path)), true, `坏表保留 ${path} 诊断`);
    eq(activeCompanion(checked.config, { companionRelations: { [SU_COMPANION_ID]: { mode: 'follow' } } }), null, '坏表不激活既有关系');
  }
  console.log(`companions closed tests ok: ${assertions} assertions (closed gates, no writes/entities/control, preserved relations, readonly validation)`);
}
