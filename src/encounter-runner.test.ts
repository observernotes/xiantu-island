import encountersRaw from '@xt/balance/encounters.json';
import pacingRaw from '@xt/balance/solo_pacing.json';
import { ENCOUNTERS } from './data';
import { parseEncountersConfig, type EncounterContext, type EncounterSave, type EncountersConfig } from './Encounter';
import { EncounterRunner } from './EncounterRunner';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type Mutable = Record<string, any>;
const NOW = 10_000_000;
const rescue = 'enc_stranded_cultivator', herb = 'enc_fragrant_herb', abode = 'enc_hidden_abode';
const sage = 'enc_sage_advice', demon = 'enc_demon_whisper';
const originalRaw = JSON.stringify(encountersRaw), originalConfig = JSON.stringify(ENCOUNTERS);
const pacing = structuredClone(pacingRaw.encounter);

function fixture(ids: readonly string[], mutate?: (raw: Mutable) => void): EncountersConfig {
  const raw: Mutable = structuredClone(encountersRaw);
  for (const row of raw.encounters) row.enabled = ids.includes(row.id);
  mutate?.(raw);
  const parsed = parseEncountersConfig(raw);
  eq(parsed.errors.length, 0, `内存开态配置有效：${ids.join(',')}`);
  ok(parsed.config, 'structuredClone fixture 通过真实配置校验');
  return parsed.config;
}
function freshSave(): Mutable {
  return { exp: 100, stones: 20, inventory: { hp_pill_small: 2 }, daoHeart: 20, morality: 0,
    bonusStats: { insight: 3 }, karmaFlags: {}, encounters: {}, unrelated: { keep: ['sentinel'] } };
}
function context(mapId: string, nowMs = NOW): EncounterContext & { luck?: number; blocked?: boolean } {
  return { mapId, level: 99, realmId: 'foundation', sectJoined: true, nowMs, daoHeart: 20,
    questsDone: new Set(encountersRaw.encounters.flatMap(row => row.req.questsDone)),
    featuresReady: new Set(encountersRaw.encounters.flatMap(row => row.req.featuresAll)) };
}
function random(values: readonly number[]) {
  let calls = 0;
  return { next: () => { const value = values[calls++]; if (value === undefined) throw new Error(`RNG 意外多掷：${calls}`); return value; },
    calls: () => calls };
}
function memory(config: EncountersConfig | null, values: readonly number[], initial = freshSave(), p = pacing) {
  const rng = random(values);
  let save = initial, reads = 0, commits = 0, fail = false;
  const store = { read: (): EncounterSave => { reads++; return save; }, commit: (next: EncounterSave) => {
    commits++; if (fail) return false; save = structuredClone(next) as Mutable; return true;
  } };
  return { runner: new EncounterRunner(config, p, store, rng.next), rng, store,
    save: () => save, reads: () => reads, commits: () => commits, fail: (value = true) => { fail = value; } };
}
function offered(m: ReturnType<typeof memory>, ctx: EncounterContext, visit = 'visit-1') {
  const result = m.runner.enter(ctx, visit);
  eq(result.status, 'offered', '进图命中并持久化offer');
  const offer = m.runner.offer(); ok(offer, 'runner公开当前offer'); return offer;
}
function decide(m: ReturnType<typeof memory>, ctx: EncounterContext, visit = 'visit-1') {
  const offer = offered(m, ctx, visit);
  eq(m.runner.advance(ctx, offer.attemptId, offer.stepId).status, 'advanced', '对白推进到选择节点');
  const current = m.runner.offer(); ok(current, '选择节点offer存在'); eq(current.stepId, 'decide', '抵达真实decide节点');
  return current;
}
function choose(m: ReturnType<typeof memory>, ctx: EncounterContext, choiceId: string) {
  const offer = m.runner.offer(); ok(offer, `选择${choiceId}前存在offer`);
  return m.runner.choose(ctx, { attemptId: offer.attemptId, encounterId: offer.encounterId, stepId: offer.stepId, choiceId });
}

ok(ENCOUNTERS, '真实data.ts奇遇配置存在');
// tip 临时开态：正式五事件已启用；关态静默与零依赖只用显式内存夹具验证。
eq(ENCOUNTERS.encounters.length, 5, 'tip 正式表恰有五事件');
for (const row of ENCOUNTERS.encounters) eq(row.enabled, true, `tip 正式事件${row.id}临时开启`);
const closedRaw: Mutable = structuredClone(encountersRaw);
for (const row of closedRaw.encounters) row.enabled = false;
const closedParsed = parseEncountersConfig(closedRaw);
eq(closedParsed.errors.length, 0, '关态夹具配置有效');
ok(closedParsed.config, '关态夹具通过真实配置校验');
const forbidden = new Proxy({}, { get() { throw new Error('全关不可读上下文/存档'); }, ownKeys() { throw new Error('全关不可遍历上下文/存档'); } });
for (const config of [closedParsed.config, null]) {
  const closed = memory(config, []);
  eq(closed.runner.enter(forbidden as EncounterContext, 'closed').status, 'idle', '关态enter直接静默');
  eq(closed.runner.tick(forbidden as EncounterContext, 60000, { meditating: true, atAnchor: true }).status, 'idle', '关态冥想静默');
  eq(closed.runner.offer(), undefined, '关态无offer');
  closed.runner.advance(forbidden as EncounterContext, 'attempt', 'offer');
  closed.runner.choose(forbidden as EncounterContext, { attemptId: 'attempt', encounterId: rescue, stepId: 'decide', choiceId: 'medicine' });
  closed.runner.terminate(forbidden as EncounterContext, 'missed');
  eq(closed.reads(), 0, '关态所有入口0存档读取');
  eq(closed.commits(), 0, '关态所有入口0写盘'); eq(closed.rng.calls(), 0, '关态所有入口0随机');
}

// 真表路径资格：每事件内存开态，等级/任务/功能未就绪不掷概率，不占名额。
for (const row of encountersRaw.encounters) {
  const open = fixture([row.id]), ctx = context(row.maps[0]);
  const unqualified = memory(open, []);
  const result = unqualified.runner.enter({ ...ctx, level: 0 }, `ineligible-${row.id}`);
  eq(result.status, 'idle', `${row.id}不合资格无offer`); eq(unqualified.rng.calls(), 0, `${row.id}不合资格不掷随机`);
}

// 所有进图候选共享一次概率；失败不按事件补掷，原visit（含失败）刷新不再掷。
const pool = fixture([rescue, demon], raw => {
  const candidates = raw.encounters.filter((row: Mutable) => [rescue, demon].includes(row.id));
  for (const row of candidates) row.maps = ['pool']; candidates[0].weight = 1; candidates[1].weight = 3;
});
const failedRoll = memory(pool, [0.08]);
eq(failedRoll.runner.enter(context('pool'), 'failed-roll').status, 'idle', 'p边界等于0.08判失败');
eq(failedRoll.rng.calls(), 1, '双候选失败只掷一次共享概率');
eq(failedRoll.runner.enter(context('pool'), 'failed-roll').status, 'idle', '同visit失败不补掷');
const reloadFailed = new EncounterRunner(pool, pacing, failedRoll.store, () => { throw new Error('刷新失败visit不应重抽'); });
eq(reloadFailed.enter(context('pool'), 'failed-roll').status, 'idle', '读档失败visit仍不重抽');
for (const [weighted, expected] of [[0, rescue], [0.24999, rescue], [0.25, demon], [0.9999, demon]] as const) {
  const m = memory(pool, [0, weighted]); const offer = offered(m, context('pool'));
  eq(offer.encounterId, expected, `weight=1:3在${weighted}按权重选候选`); eq(m.rng.calls(), 2, '命中只掷概率和权重各一次');
  m.runner.enter(context('pool'), 'visit-1'); eq(m.rng.calls(), 2, '同visit有active不重抽');
}
for (const [luck, roll, expected] of [[undefined, 0.081, 'idle'], [1, 0.081, 'offered'], [-1000, 0, 'idle'], [1000, 0.999, 'offered']] as const) {
  const m = memory(fixture([rescue]), expected === 'offered' ? [roll, 0] : [roll]);
  eq(m.runner.enter({ ...context('lingxi_path'), luck }, `luck-${luck}`).status, expected, `气运${luck}按0默认与0..1裁剪`);
}

// 触发名额与冷却在一次commit提交，真实选择扣药/发奖/标记也只用一次commit。
const m = memory(fixture([rescue]), [0, 0]); const ctx = context('lingxi_path');
const choice = decide(m, ctx), triggerCooldown = NOW + encountersRaw.encounters[0].cooldownMs;
eq(m.save().encounters.cooldownUntil[rescue], triggerCooldown, '抽中即记真实冷却');
const beforeMedicine = m.commits(), medicine = choose(m, { ...ctx, nowMs: NOW + 5000 }, 'medicine');
eq(medicine.status, 'settled', 'medicine直接有效结算'); eq(medicine.outcomeId, 'aided', 'medicine唯一可达aided');
eq(m.commits() - beforeMedicine, 1, '扣药与奖励/冷却/attempt只提交一次事务');
eq(m.save().inventory.hp_pill_small, 1, '真实消耗hp_pill_small×1'); eq(m.save().exp, 100 + 900, 'aided奖励取正式表exp900');
eq(m.save().morality, 1, 'aided善恶同事务兑现'); eq(m.save().encounters.active, null, '结算清空active');
eq(m.save().encounters.cooldownUntil[rescue], triggerCooldown + 5000, '终止冷却max已有值与终止+冷却');
same(m.save().unrelated, { keep: ['sentinel'] }, '事务保留无关存档字段');
const settledSnapshot = JSON.stringify(m.save()), settledCommits = m.commits();
const duplicate = m.runner.choose(ctx, { ...choice, choiceId: 'medicine' });
ok(['duplicate', 'rejected'].includes(duplicate.status), '同attempt重发拒绝');
eq(JSON.stringify(m.save()), settledSnapshot, '重发不扣药不加奖不延冷却'); eq(m.commits(), settledCommits, '重发0写盘');
eq(m.runner.enter({ ...ctx, nowMs: triggerCooldown + 5001 }, 'visit-1').status, 'idle', '即使冷却已过同visit名额不返还');

const noMedicineSave = freshSave(); noMedicineSave.inventory.hp_pill_small = 0;
const noMedicine = memory(fixture([rescue]), [0, 0], noMedicineSave); decide(noMedicine, ctx);
const noMedicineBefore = JSON.stringify(noMedicine.save()), noMedicineWrites = noMedicine.commits();
const unavailableMedicine = choose(noMedicine, ctx, 'medicine');
eq(unavailableMedicine.status, 'rejected', '无药即使直接调用runner也拒绝');
eq(JSON.stringify(noMedicine.save()), noMedicineBefore, '无药拒绝无副作用'); eq(noMedicine.commits(), noMedicineWrites, '无药拒绝0写盘');
eq(choose(noMedicine, ctx, 'leave').status, 'settled', '无药仍能主动离开');

// 已确认消耗在后续节点/刷新/失败中保留；绝不因failed/missed退还药物。
const bridgeConfig = fixture([rescue], raw => {
  const row = raw.encounters.find((value: Mutable) => value.id === rescue);
  row.choices.find((value: Mutable) => value.id === 'medicine').next = 'medicine_bridge';
  row.script.steps.push({ id: 'medicine_bridge', type: 'dialog', textKeys: ['enc.stranded_cultivator.aided'], next: 'end_medicine' });
});
const consumed = memory(bridgeConfig, [0, 0]); decide(consumed, ctx);
eq(choose(consumed, ctx, 'medicine').status, 'advanced', '已确认medicine可停留持久化后续节点');
eq(consumed.save().inventory.hp_pill_small, 1, '选项确认立即持久化扣药'); eq(consumed.save().exp, 100, '未达finish不分段发奖');
const consumedReload = new EncounterRunner(bridgeConfig, pacing, consumed.store, () => { throw new Error('已扣药节点刷新不可重抽'); });
eq(consumedReload.enter(ctx, 'visit-1').status, 'offered', '刷新恢复已扣药中间节点');
eq(consumedReload.offer()?.stepId, 'medicine_bridge', '恢复准确节点');
eq(consumedReload.terminate(ctx, 'failed').status, 'settled', '后续失败可安全终止');
eq(consumed.save().inventory.hp_pill_small, 1, '已消耗不因失败退药'); eq(consumed.save().exp, 100, '后续失败不发有效奖');

// 非法step、过期attempt和不在当前节点的choice不允许绕过脚本。
const invalid = memory(fixture([rescue]), [0, 0]); const initialOffer = offered(invalid, ctx);
for (const payload of [
  { ...initialOffer, stepId: 'decide', choiceId: 'medicine' },
  { ...initialOffer, encounterId: demon, choiceId: 'medicine' },
  { ...initialOffer, attemptId: 'forged', choiceId: 'medicine' },
]) eq(invalid.runner.choose(ctx, payload).status, 'rejected', '伪造choice上下文被拒绝');
eq(invalid.runner.advance(ctx, initialOffer.attemptId, 'end_rescue').status, 'rejected', '不可跳到finish');
invalid.runner.advance(ctx, initialOffer.attemptId, initialOffer.stepId);
eq(choose(invalid, ctx, 'not-a-choice').status, 'rejected', '未知选项拒绝');
eq(invalid.runner.advance(ctx, initialOffer.attemptId, 'decide').status, 'rejected', 'choice不可用advance绕过');

// 持久化失败：触发/推进/扣药结算/终止均保留原存档，既无半份奖也不提前扣药。
const rollback = memory(fixture([rescue]), [0, 0]); const untouched = rollback.save(), untouchedJSON = JSON.stringify(untouched);
rollback.fail(); eq(rollback.runner.enter(ctx, 'rollback').status, 'deferred', '触发保存失败延后');
eq(JSON.stringify(rollback.save()), untouchedJSON, '触发失败回滚visit/active/名额/冷却');
eq(rollback.runner.offer(), undefined, '触发未落盘不公开offer'); ok(!Object.isFrozen(untouched), '失败不冻结原存档');
rollback.fail(false); eq(rollback.runner.enter(ctx, 'rollback').status, 'offered', '相同抽取结果可重试落盘');
eq(rollback.rng.calls(), 2, '触发保存重试不重抽');
const rollbackOffer = rollback.runner.offer(); ok(rollbackOffer, '重试后offer');
rollback.fail(); const beforeAdvance = JSON.stringify(rollback.save());
eq(rollback.runner.advance(ctx, rollbackOffer.attemptId, rollbackOffer.stepId).status, 'deferred', '节点保存失败延后');
eq(JSON.stringify(rollback.save()), beforeAdvance, '推进失败active节点回滚');
rollback.fail(false); rollback.runner.advance(ctx, rollbackOffer.attemptId, rollbackOffer.stepId);
rollback.fail(); const beforeSettle = JSON.stringify(rollback.save());
eq(choose(rollback, ctx, 'medicine').status, 'deferred', '扣药结算保存失败延后');
eq(JSON.stringify(rollback.save()), beforeSettle, '结算失败同时回滚药/奖/hooks/active/冷却');
rollback.fail(false); eq(choose(rollback, ctx, 'medicine').status, 'settled', '重试原选择仅结算一次');
eq(rollback.save().inventory.hp_pill_small, 1, '重试成功仅扣1药'); eq(rollback.save().exp, 1000, '重试成功仅发一次900');

const terminateRollback = memory(fixture([rescue]), [0, 0]); offered(terminateRollback, ctx);
const beforeTerminate = JSON.stringify(terminateRollback.save()); terminateRollback.fail();
eq(terminateRollback.runner.terminate({ ...ctx, nowMs: NOW + 123 }, 'missed').status, 'deferred', '错过提交失败延后');
eq(JSON.stringify(terminateRollback.save()), beforeTerminate, '错过失败不清active不延冷却');
terminateRollback.fail(false); eq(terminateRollback.runner.terminate(ctx, 'missed').status, 'settled', '错过可重试');

const stale = memory(fixture([rescue]), [0, 0]); decide(stale, ctx); stale.fail();
eq(choose(stale, ctx, 'medicine').status, 'deferred', '准备存储失败的扣药草稿');
stale.save().inventory.hp_pill_small = 0; stale.save().stones += 7;
const externalSnapshot = JSON.stringify(stale.save()); stale.fail(false);
eq(choose(stale, ctx, 'medicine').reason, 'stale_save', '外部背包变化使旧事务草稿失效');
eq(JSON.stringify(stale.save()), externalSnapshot, '旧草稿绝不覆盖外部库存/灵石');
eq(choose(stale, ctx, 'medicine').status, 'rejected', '废弃旧草稿后重验实时缺药');
eq(choose(stale, ctx, 'leave').status, 'settled', 'stale后可安全选择其他分支');
eq(stale.save().inventory.hp_pill_small, 0, 'stale恢复不凭空补药'); eq(stale.save().stones, 27, 'stale恢复保留外部灵石');

const staleTrigger = memory(fixture([rescue]), [0, 0]); staleTrigger.fail();
eq(staleTrigger.runner.enter(ctx, 'stale-trigger').status, 'deferred', '抽取事务失败保留随机结果');
staleTrigger.save().inventory.hp_pill_small = 7; staleTrigger.fail(false);
eq(staleTrigger.runner.enter(ctx, 'stale-trigger').reason, 'stale_save', '抽取草稿在外部库存变化后拒绝覆盖');
eq(staleTrigger.runner.enter(ctx, 'stale-trigger').status, 'offered', '抽取草稿可基于最新存档重建');
eq(staleTrigger.rng.calls(), 2, '外部存档变化后重建仍沿同一随机结果');
eq(staleTrigger.save().inventory.hp_pill_small, 7, '抽取重建保留外部新增药物');

// 刷新恢复保存节点；新visit按missed结束旧事件；有效once封存，failed不封存。
const restore = memory(fixture([rescue]), [0, 0]); const restoreChoice = decide(restore, ctx);
const restored = new EncounterRunner(fixture([rescue]), pacing, restore.store, () => { throw new Error('刷新恢复不抽签'); });
eq(restored.enter(ctx, 'visit-1').status, 'offered', '刷新恢复已保存选择节点');
eq(restored.offer()?.stepId, 'decide', '恢复原选择节点'); eq(restored.offer()?.attemptId, restoreChoice.attemptId, '恢复原attempt');
eq(restored.enter({ ...ctx, mapId: 'another-map', nowMs: NOW + 777 }, 'visit-2').status, 'idle', '真正换图结束旧事件');
eq(restore.save().encounters.active, null, '换图active清空');
eq(restore.save().encounters.cooldownUntil[rescue], triggerCooldown + 777, '离图missed延冷却');
ok(!restore.save().encounters.resolved?.[rescue], 'missed不算有效resolved');

const once = memory(fixture([demon]), [0, 0]); const demonCtx = context('luoxia_town'); decide(once, demonCtx);
eq(choose(once, demonCtx, 'refuse').status, 'settled', '低语拒绝是有效结局');
eq(once.save().encounters.resolved[demon], 'refused', 'once只在有效结局封存');
eq(once.runner.enter({ ...demonCtx, nowMs: NOW + 2_000_000 }, 'once-next').status, 'idle', 'once封存后冷却过期也不重遇');

// 五事件全部真实脚本分支：战斗/机关/子图只使用受信stub回报，不由UI继续越过。
type Action = 'advance' | `choose:${string}` | 'win' | 'lose';
const matrix: readonly [string, string, readonly Action[]][] = [
  [rescue, 'rescued', ['advance', 'choose:fight', 'advance', 'win', 'advance']],
  [rescue, 'aided', ['advance', 'choose:medicine']], [rescue, 'failed', ['advance', 'choose:fight', 'advance', 'lose']],
  [rescue, 'missed', ['advance', 'choose:leave']],
  [herb, 'preserved', ['advance', 'advance', 'choose:guard', 'win', 'advance', 'choose:leaf']],
  [herb, 'uprooted', ['advance', 'advance', 'choose:guard', 'win', 'advance', 'choose:root']],
  [herb, 'failed', ['advance', 'advance', 'choose:guard', 'lose']], [herb, 'missed', ['advance', 'advance', 'choose:leave']],
  [abode, 'taken', ['advance', 'choose:enter', 'win', 'advance', 'win', 'advance', 'advance', 'choose:take']],
  [abode, 'sealed', ['advance', 'choose:enter', 'win', 'advance', 'win', 'advance', 'advance', 'choose:seal']],
  [abode, 'failed', ['advance', 'choose:enter', 'win', 'advance', 'lose']], [abode, 'missed', ['advance', 'choose:leave']],
  [sage, 'enlightened', ['advance', 'choose:steady']], [sage, 'failed', ['advance', 'choose:power']], [sage, 'missed', ['advance', 'choose:leave']],
  [demon, 'accepted', ['advance', 'choose:accept']], [demon, 'refused', ['advance', 'choose:refuse']], [demon, 'missed', ['advance', 'choose:leave']],
];
for (const [id, outcomeId, actions] of matrix) {
  const row = encountersRaw.encounters.find(value => value.id === id)!;
  const f = memory(fixture([id]), [0, 0]), c = context(row.maps[0]);
  let result = f.runner.enter(c, `matrix-${id}-${outcomeId}`);
  if (id === sage) result = f.runner.tick(c, 60000, { meditating: true, atAnchor: true });
  eq(result.status, 'offered', `${id}/${outcomeId}符合资格真实触发`);
  if (id === abode) {
    eq(f.save().encounters.seen.includes(id), false, '洞府未扫描不记seen');
    result = f.runner.reveal(c, f.save().encounters.active.attemptId);
    eq(f.save().encounters.seen.includes(id), true, '洞府扫描后记seen');
  }
  for (const action of actions) {
    const current = f.runner.offer(); ok(current, `${id}/${outcomeId}/${action}前真实节点存在`);
    if (action === 'advance') result = f.runner.advance(c, current.attemptId, current.stepId);
    else if (action === 'win' || action === 'lose') {
      eq(f.runner.advance(c, current.attemptId, current.stepId).status, 'rejected', '挑战节点不允许UI继续跳过');
      result = f.runner.completeChallenge(c, current.attemptId, current.stepId, action === 'win');
    } else result = choose(f, c, action.slice('choose:'.length));
    ok(['advanced', 'settled'].includes(result.status), `${id}/${outcomeId}/${action}真实可达`);
  }
  eq(result.status, 'settled', `${id}/${outcomeId}到达真实结算`); eq(result.outcomeId, outcomeId, '不允许任意改写结局');
  eq(f.save().encounters.active, null, '矩阵结算清空active');
  const outcome = row.outcomes.find(value => value.id === outcomeId)!;
  eq(f.save().encounters.resolved[id], outcome.status === 'resolved' ? outcomeId : undefined, '仅有效结局写resolved');
  eq(f.save().exp, 100 + (('exp' in outcome.rewards ? outcome.rewards.exp : 0) ?? 0), '真实路径只发该结局修为');
  eq(f.save().encounters.settledAttempts.length, 1, '每条真实路径仅一份attempt结算记录');
  if (outcome.status !== 'resolved') {
    const beforeCooldown = f.save().encounters.cooldownUntil[id];
    const retry = f.runner.enter({ ...c, nowMs: beforeCooldown - 1 }, `retry-before-${outcomeId}`);
    eq(retry.status, 'idle', 'failed/missed在冷却内不能重遇');
    // 为下一次合法重遇另建确定性RNG，存档沿用；失败/错过不消耗once。
    const retryRunner = new EncounterRunner(fixture([id]), pacing, f.store, random([0, 0]).next);
    let retryResult = retryRunner.enter({ ...c, nowMs: beforeCooldown }, `retry-at-${outcomeId}`);
    if (id === sage) retryResult = retryRunner.tick({ ...c, nowMs: beforeCooldown }, 60000, { meditating: true, atAnchor: true });
    eq(retryResult.status, 'offered', 'failed/missed冷却到期仍可重遇');
  }
}

// 当前不重建战斗/机关/子图实例：刷新中间挑战节点安全failed且保留冷却与占额。
const interruptedBattle = memory(fixture([rescue]), [0, 0]); decide(interruptedBattle, ctx); choose(interruptedBattle, ctx, 'fight');
const fightDialog = interruptedBattle.runner.offer()!; interruptedBattle.runner.advance(ctx, fightDialog.attemptId, fightDialog.stepId);
eq(interruptedBattle.runner.offer()?.stepId, 'battle', '存档确在真实battle节点');
const interruptedRunner = new EncounterRunner(fixture([rescue]), pacing, interruptedBattle.store, () => { throw new Error('战斗恢复不得重抽'); });
eq(interruptedRunner.enter(ctx, 'visit-1').status, 'settled', '刷新未恢复战斗实例安全终止');
eq(interruptedBattle.save().encounters.active, null, '中断战斗清空active');
eq(interruptedBattle.save().exp, 100, '战斗中断不发奖');

for (const [id, target, actions] of [
  [rescue, 'thank', ['advance', 'choose:fight', 'advance', 'win']],
  [abode, 'claim', ['advance', 'choose:enter', 'win', 'advance', 'win', 'advance', 'advance']],
] as readonly [string, string, readonly Action[]][]) {
  const row = encountersRaw.encounters.find(value => value.id === id)!;
  const f = memory(fixture([id]), [0, 0]), c = context(row.maps[0]); f.runner.enter(c, 'restore-claim');
  if (id === abode) f.runner.reveal(c, f.save().encounters.active.attemptId);
  for (const action of actions) {
    const a = f.runner.offer()!;
    if (action === 'advance') f.runner.advance(c, a.attemptId, a.stepId);
    else if (action === 'win') f.runner.completeChallenge(c, a.attemptId, a.stepId, true);
    else choose(f, c, action.slice('choose:'.length));
  }
  eq(f.runner.offer()?.stepId, target, `${id}持久化待领奖节点`);
  const restoredReward = new EncounterRunner(fixture([id]), pacing, f.store, () => { throw new Error('待领奖节点刷新不应抽签'); });
  eq(restoredReward.enter(c, 'restore-claim').status, 'offered', '待领奖刷新恢复而非failed');
  const a = restoredReward.offer()!; eq(a.stepId, target, '待领奖恢复准确节点');
  const result = id === rescue ? restoredReward.advance(c, a.attemptId, a.stepId)
    : restoredReward.choose(c, { ...a, choiceId: 'take' });
  eq(result.status, 'settled', '恢复待领奖节点后正常结算一次');
  eq(f.save().encounters.settledAttempts.length, 1, '恢复领奖仅一份结算记录');
}

// 冥想独立0.005概率，不读进图0.08或luck；只在连续60000ms且锚点有效时检查。
const sageConfig = fixture([sage]); const sageCtx = { ...context('qingyun_village'), luck: 1_000_000 };
const meditation = memory(sageConfig, [0.005]);
eq(meditation.runner.enter(sageCtx, 'sage').status, 'idle', '仙人不进入进图池'); eq(meditation.rng.calls(), 0, '进图不为仙人掷随机');
eq(meditation.runner.tick(sageCtx, 59999, { meditating: true, atAnchor: true }).status, 'idle', '59999ms尚不检查');
eq(meditation.rng.calls(), 0, '不足一分钟0随机');
eq(meditation.runner.tick(sageCtx, 1, { meditating: true, atAnchor: true }).status, 'idle', '0.005边界失败且气运不叠加');
eq(meditation.rng.calls(), 1, '一分钟只作独立概率检查');
const interrupted = memory(sageConfig, []); interrupted.runner.enter(sageCtx, 'interrupt');
interrupted.runner.tick(sageCtx, 59000, { meditating: true, atAnchor: true });
interrupted.runner.tick(sageCtx, 1000, { meditating: true, atAnchor: true, interrupted: true });
interrupted.runner.tick(sageCtx, 59000, { meditating: true, atAnchor: true });
eq(interrupted.rng.calls(), 0, '移动/受击中断本分钟重新计时');
interrupted.runner.tick(sageCtx, 600000, { meditating: true, atAnchor: true, paused: true });
eq(interrupted.rng.calls(), 0, '暂停/后台长间隔不累计不补掷');
interrupted.runner.tick(sageCtx, 60000, { meditating: true, atAnchor: false });
interrupted.runner.tick({ ...sageCtx, blocked: true }, 60000, { meditating: true, atAnchor: true });
eq(interrupted.rng.calls(), 0, '脱离锚点与开对话不检查');
const sageSuccess = memory(sageConfig, [0, 0]); sageSuccess.runner.enter(sageCtx, 'sage-success');
eq(sageSuccess.runner.tick(sageCtx, 60000, { meditating: true, atAnchor: true }).status, 'offered', '满一分钟可命中仙人');
const sageOffer = sageSuccess.runner.offer(); ok(sageOffer, '仙人offer'); sageSuccess.runner.advance(sageCtx, sageOffer.attemptId, sageOffer.stepId);
eq(choose(sageSuccess, sageCtx, 'steady').status, 'settled', '正确回答结算悟性');
eq(sageSuccess.save().bonusStats.insight, 4, '悟性按真表+1持久化');
const sageWrites = sageSuccess.commits(); sageSuccess.runner.tick({ ...sageCtx, nowMs: NOW + 2_000_000 }, 60000, { meditating: true, atAnchor: true });
eq(sageSuccess.commits(), sageWrites, '结算后同visit满额不再写盘');

const tickRollback = memory(sageConfig, [0, 0]); tickRollback.runner.enter(sageCtx, 'tick-rollback');
tickRollback.runner.tick(sageCtx, 59000, { meditating: true, atAnchor: true });
const beforeTickSave = JSON.stringify(tickRollback.save()); tickRollback.fail();
eq(tickRollback.runner.tick(sageCtx, 1000, { meditating: true, atAnchor: true }).status, 'deferred', '冥想命中保存失败延后');
eq(JSON.stringify(tickRollback.save()), beforeTickSave, '冥想失败不提前占额/记冷却/active');
tickRollback.fail(false);
eq(tickRollback.runner.tick({ ...sageCtx, nowMs: NOW + 16 }, 16, { meditating: true, atAnchor: true }).status, 'offered', '下帧时间变化仍能重试同次冥想保存');
eq(tickRollback.rng.calls(), 2, '冥想下帧重试不重掷');

// 两种trigger共用进图名额，隐藏事件未显形也已占用。
const shared = fixture([rescue, sage], raw => { for (const row of raw.encounters) if ([rescue, sage].includes(row.id)) row.maps = ['shared']; });
const sharedVisit = memory(shared, [0, 0]); decide(sharedVisit, context('shared')); choose(sharedVisit, context('shared'), 'leave');
sharedVisit.runner.tick({ ...context('shared'), nowMs: NOW + 2_000_000 }, 60000, { meditating: true, atAnchor: true });
eq(sharedVisit.rng.calls(), 2, 'map抽中后即使拒绝也不把名额返给冥想');
const entryMissMeditation = memory(shared, [0.08, 0, 0]);
eq(entryMissMeditation.runner.enter(context('shared'), 'entry-miss-meditation').status, 'idle', '进图共享概率未中');
eq(entryMissMeditation.runner.tick(context('shared'), 60000, { meditating: true, atAnchor: true }).status, 'offered', '进图未中仍可独立打坐抽签');
eq(entryMissMeditation.runner.offer()?.encounterId, sage, '独立打坐只选meditation_tick候选');
const hiddenConfig = fixture([abode]); const hidden = memory(hiddenConfig, [0, 0]);
hidden.runner.enter(context('wanyao_outer_1'), 'hidden'); eq(hidden.runner.offer(), undefined, '神识未显形无可见offer');
const hiddenActive = hidden.save().encounters.active; ok(hiddenActive?.attemptId, '隐藏事件抽中已保存active与名额');
eq(hidden.save().encounters.cooldownUntil[abode], NOW + encountersRaw.encounters[2].cooldownMs, '隐藏事件触发即记冷却');
hidden.runner.enter(context('wanyao_outer_1'), 'hidden'); eq(hidden.rng.calls(), 2, '隐藏未显形同visit也不重抽');
eq(hidden.runner.reveal(context('wanyao_outer_1'), hiddenActive.attemptId).status, 'offered', '受信神识显形后才公开offer');
ok(hidden.runner.offer(), '显形后可见offer');

// 固定种子可复现事件选择；不借用Math.random，也不改正式表。
function seeded(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; }; }
function seedRun() {
  const store = { read: () => freshSave() as EncounterSave, commit: (_next: EncounterSave) => true };
  const result = new EncounterRunner(pool, { ...pacing, baseChancePerMapEnter: 1 }, store, seeded(42)).enter(context('pool'), 'seeded');
  return { status: result.status, encounterId: result.encounterId };
}
same(seedRun(), seedRun(), '相同seed得到完全相同抽取结果');
for (const mutate of [
  (raw: Mutable) => { raw.encounters[0].trigger.chanceRef = 'sageAdviceChancePerMeditationMin'; },
  (raw: Mutable) => { raw.encounters[3].trigger.chanceRef = 'baseChancePerMapEnter'; },
  (raw: Mutable) => { raw.encounters[3].trigger.intervalMs = 0; },
]) {
  const raw: Mutable = structuredClone(encountersRaw); mutate(raw);
  eq(parseEncountersConfig(raw).config, null, 'chanceRef/trigger/interval不匹配在读表时拒绝');
}
eq(JSON.stringify(encountersRaw), originalRaw, '正式原始五事件enabled及全部字段不变');
eq(JSON.stringify(ENCOUNTERS), originalConfig, 'data.ts正式配置不变');
console.log(`encounter-runner tests ok: ${assertions} assertions, probability / transactions / medicine / restoration / meditation / open table / closed fixture`);
