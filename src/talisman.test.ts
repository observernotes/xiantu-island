import recipesRaw from '@xt/balance/recipes.json';
import { DrawStroke, TalismanSystem, TALISMAN_QUALITIES, emptyTalismanSave, normalizeTalismanSave,
  readTalismanConfig, type TalismanHost, type TalismanDirection, type TalismanResult } from './Talisman';
import { type PillQuality } from './data';
import { setFeatureFlag } from './features';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++; if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
function near(actual: number, expected: number, message: string) { ok(Math.abs(actual - expected) < 1e-10, message); }
setFeatureFlag('talismanCraft', true);
const config = readTalismanConfig();
eq(config.errors.length, 0, '运行配表全合法'); eq(Object.keys(config.recipes).length, 5, '四符一研墨');
ok(config.rules, '独立制符规则存在');

class Host implements TalismanHost {
  talisman = emptyTalismanSave(); learnedRecipes = Object.keys(config.recipes); level = 15;
  realm = { id: 'qi_refining' }; sect = '';
  inventory: Record<string, number> = { talisman_paper: 100, spirit_ink: 100, snake_gall: 100, spirit_herb: 100 };
  qualities: Record<string, Partial<Record<PillQuality, number>>> = {};
  crafts: Record<string, number> = {};
  bagReady = true; insertReady = true; diskReady = true; writes = 0; saved = '';
  count(item: string) { return this.inventory[item] ?? 0; }
  removeItem(item: string, n: number) { this.inventory[item] = this.count(item) - n; }
  canAddCraftedItem() { return this.bagReady; }
  addCraftedItem(item: string, n: number, quality?: PillQuality) {
    if (!this.insertReady) return false;
    this.inventory[item] = this.count(item) + n;
    if (quality) { const buckets = this.qualities[item] ??= {}; buckets[quality] = (buckets[quality] ?? 0) + n; }
    return true;
  }
  onCraft(item: string, n: number) { this.crafts[item] = (this.crafts[item] ?? 0) + n; }
  save() {
    if (!this.diskReady) return false;
    this.writes++; this.saved = JSON.stringify({ talisman: this.talisman, inventory: this.inventory, qualities: this.qualities, crafts: this.crafts }); return true;
  }
  runSaveTransaction<T>(apply: () => T | undefined): T | undefined {
    const before = JSON.stringify({ talisman: this.talisman, inventory: this.inventory, qualities: this.qualities, crafts: this.crafts });
    try { const value = apply(); if (value !== undefined && this.save()) return value; } catch { /* 回滚与 Progress 一致 */ }
    Object.assign(this, JSON.parse(before)); return undefined;
  }
  static load(json: string) {
    const h = new Host(); Object.assign(h, JSON.parse(json)); h.talisman = normalizeTalismanSave(h.talisman); return h;
  }
}
function ready(options: ConstructorParameters<typeof TalismanSystem>[3] = {}) {
  const h = new Host(), system = new TalismanSystem(h, h, () => 0, options); return { h, system };
}
function wrong(expected: TalismanDirection): TalismanDirection { return expected === 'up' ? 'down' : 'up'; }
function draw(system: TalismanSystem, correct: number): TalismanResult | null {
  const strokes = system.view().draw!.strokes;
  system.input([], 0, 0);
  let result: TalismanResult | null = null;
  for (const [i, stroke] of strokes.entries()) {
    result = system.input([i < correct ? stroke : wrong(stroke)], 10 + i * 20, i * 2 + 1) ?? result;
    system.input([], 11 + i * 20, i * 2 + 2);
  }
  return result;
}

// 4/5/6 笔品质边界必须按未舍入 c/n 比较；非灵符只封品质，不减完成度。
for (const id of ['recipe_talisman_fire', 'recipe_talisman_guard', 'recipe_talisman_return', 'recipe_talisman_gather']) {
  const recipe = config.recipes[id], n = recipe.draw!.strokes.length;
  for (let c = 0; c <= n; c++) {
    const { h, system } = ready(); h.sect = 'lingfu'; let rolls = 0; system.random = () => { rolls++; return 0; };
    eq(system.start(id).ok, true, `${id} ${c}/${n} 可以开始`);
    const result = draw(system, c); ok(result, `${id} 每笔都推进并自动结算`);
    near(result.completion, c / n, '完成度不舍入');
    if (c / n < config.rules.minCompletion) {
      eq(result.success, false, '最低完成度不足失败'); eq(result.reason, 'completion', '失败原因区分'); eq(rolls, 0, '未达标不掷骰');
    } else {
      const expected = [...TALISMAN_QUALITIES].reverse().find(q => c / n >= config.rules!.qualityMin[q]);
      eq(result.quality, expected, '各档边界'); eq(rolls, 1, '品质不另掷骰');
      eq(h.count(recipe.output), recipe.outputCount, '真实产量读表'); eq(h.crafts[recipe.output], recipe.outputCount, 'craft计数读实际产量');
    }
    eq(result.correct + result.wrong + result.timeouts, n, '每笔仅归类一次');
    const inventory = JSON.stringify(h.inventory), craft = JSON.stringify(h.crafts);
    eq(system.settle(result.attemptId), null, '同 attemptId 第二次结算拒绝');
    eq(system.input(['up'], 1000), null, '已结算输入不重复');
    eq(JSON.stringify(h.inventory), inventory, '不重复产物'); eq(JSON.stringify(h.crafts), craft, '不重复craft');
  }
  const { h, system } = ready(); system.start(id); const result = draw(system, n)!;
  eq(result.rawQuality, 'supreme', '全对原始极品'); eq(result.quality, 'high', '未拜灵符全对封上品');
  eq(result.capApplied, true, '封顶有独立反馈'); eq(h.qualities[recipe.output].high, recipe.outputCount, '只入最终品质');
}
{
  const { h, system } = ready(); const fire = config.recipes.recipe_talisman_fire;
  near(system.rate(fire.id), fire.baseRate!, '普通成功率读配方');
  h.sect = 'lingfu'; near(system.rate(fire.id), Math.min(config.rules.maxRate, fire.baseRate! + config.rules.lingfuSuccessBonus), '灵符加成与夹取');
  system.random = () => system.rate(fire.id); system.start(fire.id); eq(draw(system, 4)?.success, false, '恰好等于p凝符失败');
}
// 同帧多键错一次、多余事件丢弃、长按无重复、截止时刻判超时。
{
  const d = new DrawStroke('craft', ['up', 'up', 'left', 'down'], 100, 0);
  eq(d.input(['up'], 1, 0), null, '开窗残留按键须先释放'); eq(d.view().current, 0, '开窗不误记笔');
  d.input([], 2, 1);
  eq(d.input(['up', 'right'], 3, 2), 'wrong', '同帧多方向只错一次'); eq(d.view().wrong, 1, '错误只加一次');
  d.input([], 4, 2); eq(d.input(['up'], 5, 2), null, '本帧多余事件不可画下一笔');
  d.input([], 6, 3); eq(d.input(['up'], 7, 4), 'correct', '下一帧可新按');
  eq(d.input(['up'], 8, 5), null, '系统连发与长按忽略'); eq(d.view().current, 2, '长按不推进');
  d.input([], 9, 6); eq(d.input(['left'], 107, 7), 'timeout', '恰在本笔截止时是超时');
  d.input([], 108, 8); eq(d.input(['down'], 109, 9), 'correct', '截止输入不带入下一笔');
  eq(d.view().done, true, '对错超时都推进');
  same([d.view().correct, d.view().wrong, d.view().timeouts], [2, 1, 1], '四笔归类唯一');
  const repeated = new DrawStroke('craft', ['up', 'up'], 100);
  repeated.input([], 0); repeated.input(['up'], 1); repeated.input(['up'], 2);
  eq(repeated.view().current, 1, '相同方向相邻笔须松开'); repeated.input([], 3); repeated.input(['up'], 4);
  eq(repeated.done, true, '松开再按才完成重复方向');
}
{
  const { h, system } = ready(); let rolls = 0; system.random = () => { rolls++; return 0; };
  system.start('recipe_talisman_fire'); system.input([], 0);
  for (let i = 1; i <= 4; i++) system.advance(config.recipes.recipe_talisman_fire.draw!.stepTimeMs * i, i);
  const result = h.talisman.attempt!.result!; eq(result.timeouts, 4, '全超时'); eq(result.success, false, '全超时失败'); eq(rolls, 0, '全超时不掷骰');
}
{
  const d = new DrawStroke('craft', ['up', 'left'], 100); d.input([], 0); d.advance(50); d.pause(50);
  d.advance(10000); eq(d.view().timeouts, 0, '暂停不推进计时'); d.resume(10000);
  d.input(['up'], 10001); eq(d.view().current, 0, '恢复先等全松开'); d.input([], 10010);
  eq(d.view().remainingMs, 50, '恢复前等待释放也不占剩余时限');
  eq(d.input(['up'], 10059), 'correct', '暂停前剩余时间继续');
}
// 试炼策略不设时限，错笔只重画当前道，不读取正式材料、品质、概率。
{
  const d = new DrawStroke('trial', ['up', 'left']); d.input([], 0); d.input(['up'], 1); d.input([], 2);
  d.advance(1000000); eq(d.view().current, 1, '试炼无时限');
  eq(d.input(['right'], 1000001), 'wrong', '试炼错笔'); eq(d.view().current, 0, '当前道从首笔重画');
  same(d.view().strokes, ['up', 'left'], '重画保留原序列'); eq(d.view().redraws, 1, '重画次数可反馈');
  d.input([], 1000002); d.input(['up'], 1000003); d.input([], 1000004); d.input(['left'], 1000005);
  eq(d.done, true, '试炼仅报告本道完成'); eq(d.view().remainingMs, null, '试炼不展示倒计时');
}
// 缺料/容量/条件不开始；付费记录和产物结果分别原子提交。
for (const condition of ['materials', 'bag_full', 'level', 'realm', 'unlearned', 'state'] as const) {
  const context = { inCombat: false, inTrial: false }, { h, system } = ready({ context: () => context });
  if (condition === 'materials') h.inventory.spirit_ink = 0;
  if (condition === 'bag_full') h.bagReady = false;
  if (condition === 'level') h.level = 14;
  if (condition === 'realm') h.realm.id = 'mortal';
  if (condition === 'unlearned') h.learnedRecipes = [];
  if (condition === 'state') context.inTrial = true;
  const before = JSON.stringify(h.inventory); eq(system.start('recipe_talisman_fire').reason, condition, `${condition}预检`);
  eq(JSON.stringify(h.inventory), before, `${condition}不扣料`); eq(h.talisman.attempt, null, `${condition}不记尝试`);
}
{
  const { h, system } = ready(); const before = h.count('talisman_paper');
  system.start('recipe_talisman_fire'); eq(h.count('talisman_paper'), before - 1, '开始一次扣料');
  eq(JSON.parse(h.saved).talisman.attempt.state, 'drawing', '同次存档记录drawing');
  eq(system.start('recipe_talisman_fire').reason, 'busy', '绘制中重复开始拒绝');
  eq(system.close(), false, '绘制中关闭要确认'); eq(system.abandon(), true, '确认放弃中断');
  eq(h.talisman.attempt?.state, 'interrupted', '放弃记interrupted'); eq(h.count('talisman_paper'), before - 1, '放弃不退料');
  const first = h.talisman.attempt!.attemptId; eq(system.again().ok, true, '再次制作重新预检');
  ok(h.talisman.attempt!.attemptId !== first, '每次独立attemptId'); eq(h.count('talisman_paper'), before - 2, '再次只扣一次');
  const loaded = Host.load(h.saved); eq(loaded.talisman.attempt?.state, 'interrupted', 'drawing读档按中断');
  const disk = JSON.stringify(loaded.talisman); loaded.talisman = normalizeTalismanSave(loaded.talisman); eq(JSON.stringify(loaded.talisman), disk, '重复normalize幂等');
  eq(loaded.count('talisman_paper'), before - 2, '读档不重扣/退材料');
}
{
  const { h, system } = ready(); system.start('recipe_talisman_fire'); h.insertReady = false;
  let rolls = 0; system.random = () => { rolls++; return 0; };
  const result = draw(system, 4); ok(result?.success, '入包异常仍保存已确定成功'); eq(result.delivered, false, '结果待领取');
  ok(h.talisman.pendingOutput, '异常入包记pendingOutput'); eq(h.count('talisman_fire'), 0, '异常未入包');
  eq(h.crafts.talisman_fire ?? 0, 0, '待领取尚不发craft'); eq(system.start('recipe_talisman_guard').reason, 'pending', '待领取前禁止下一次');
  eq(rolls, 1, '待领取只掷一次'); system.claimPending(); eq(rolls, 1, '重复领取不重掷');
  const loaded = Host.load(h.saved), restored = new TalismanSystem(loaded, loaded, () => { throw new Error('恢复不能重掷'); });
  eq(loaded.count('talisman_fire'), 1, '恢复容量后自动入包'); eq(loaded.crafts.talisman_fire, 1, '入包才发一次craft');
  eq(loaded.talisman.pendingOutput, null, '入包清除pending'); eq(restored.claimPending(), false, '再领取不重复');
  const twice = Host.load(loaded.saved); new TalismanSystem(twice, twice); eq(twice.count('talisman_fire'), 1, '第二次读档不重复入包');
  eq(twice.crafts.talisman_fire, 1, '第二次读档不重复事件');
}
{
  const { h, system } = ready(); let rolls = 0; system.random = () => { rolls++; return 0; };
  const result = system.grind().result!; ok(result.success, '研墨一次完成');
  eq(result.count, config.recipes.recipe_spirit_ink.outputCount, '研墨产量读表'); eq(result.quality, null, '研墨不分品质');
  eq(rolls, 0, '研墨不掷骰'); eq(h.count('spirit_ink'), 104, '研墨直接入包'); eq(h.count('snake_gall'), 99, '研墨扣胆一次');
  eq(h.crafts.spirit_ink, 4, '研墨实际产量craft'); eq(system.settle(result.attemptId), null, '研墨不能重复结算');
}
{
  const { h, system } = ready(); h.diskReady = false; const inventory = JSON.stringify(h.inventory);
  eq(system.start('recipe_talisman_fire').reason, 'save', '保存失败不开始'); eq(JSON.stringify(h.inventory), inventory, '开局写盘失败回滚扣料');
  eq(h.talisman.attempt, null, '开局写盘失败不留假drawing');
  h.diskReady = true; system.start('recipe_talisman_fire'); h.diskReady = false; let rolls = 0;
  system.random = () => { rolls++; return 0; }; eq(draw(system, 4), null, '结果写盘失败可重试');
  eq(h.count('talisman_fire'), 0, '结果写盘失败回滚物品'); eq(h.crafts.talisman_fire ?? 0, 0, '事件也回滚');
  h.diskReady = true; ok(system.settle(h.talisman.attempt!.attemptId)?.success, '同尝试重试写盘成功'); eq(rolls, 1, '保存重试不重掷');
  eq(h.count('talisman_fire'), 1, '写盘重试仅一份产物');
}
// 缺失/非法数值禁用对应方，不能通过默认成功继续；研墨独立于画符规则。
for (const mutate of [
  (table: any) => { delete table.rules.talisman; },
  (table: any) => { table.rules.talisman.qualityMin.mid = 0.1; },
  (table: any) => { table.recipes.find((r: any) => r.id === 'recipe_talisman_fire').baseRate = undefined; },
  (table: any) => { table.recipes.find((r: any) => r.id === 'recipe_talisman_fire').draw.strokes = []; },
  (table: any) => { table.recipes.find((r: any) => r.id === 'recipe_talisman_fire').draw.stepTimeMs = 0; },
]) {
  const table = JSON.parse(JSON.stringify(recipesRaw)); mutate(table); const messages: string[] = [];
  const { h, system } = ready({ config: table, report: message => messages.push(message) });
  ok(messages.length, '配置错误已报告'); eq(system.start('recipe_talisman_fire').reason, 'config', '非法方禁用');
  eq(h.talisman.attempt, null, '非法方不消耗不开始'); eq(system.grind().ok, true, '研墨不借用画符规则');
}
{
  const { h, system } = ready(); system.start('recipe_talisman_fire');
  const before = JSON.stringify({ inventory: h.inventory, talisman: h.talisman, crafts: h.crafts, learned: h.learnedRecipes });
  setFeatureFlag('talismanCraft', false);
  eq(system.check('recipe_talisman_fire').reason, 'closed', '开关关闭预检');
  eq(system.grind().reason, 'closed', '开关关闭研墨'); eq(system.input(['up'], 99999), null, '开关关闭不接输入');
  eq(system.advance(99999), null, '开关关闭不推进'); eq(system.abandon(), false, '开关关闭不改尝试');
  eq(system.claimPending(), false, '开关关闭不领取'); eq(system.recover(), false, '开关关闭不恢复修改');
  new TalismanSystem(h, h);
  eq(JSON.stringify({ inventory: h.inventory, talisman: h.talisman, crafts: h.crafts, learned: h.learnedRecipes }), before, '关闭零玩法变化');
  setFeatureFlag('talismanCraft', true);
}
same(normalizeTalismanSave(undefined), emptyTalismanSave(), '旧档缺字段补默认');
same(normalizeTalismanSave({ version: 99, attempt: {} }), emptyTalismanSave(), '损坏旧字段安全默认');
console.log(`talisman craft tests ok: ${assertions} assertions (quality boundaries, draw edges, trial strategy, transactions, pending output, recovery, feature gate)`);
