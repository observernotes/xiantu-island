import { CLASS_LIST, classRobe } from './classes';
import { QUESTS, TRIALS, type TrialDef } from './data';
import { featureFlags, setFeatureFlag } from './features';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { SectTrialState, type SectTrialConfig, type TrialDirection } from './SectTrialState';
import { GameScene } from './scenes/GameScene';
import { SKILLS } from './skills';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: 得到 ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}

const saved: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';
globalThis.localStorage = {
  getItem: key => saved[key] ?? null,
  setItem: (key, value) => { saved[key] = String(value); },
  removeItem: key => { delete saved[key]; },
  clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
  key: index => Object.keys(saved)[index] ?? null,
  get length() { return Object.keys(saved).length; },
};
const initialFlags = featureFlags();
setFeatureFlag('fiveSectClasses', true);
setFeatureFlag('v05Maps', true);
const sectTrials = Object.values(TRIALS).filter(row => row.id.startsWith('trial_sect_'));
same(sectTrials.map(row => row.sect).sort(), ['lingfu', 'taixu', 'wanshou', 'youying'], '四宗试炼逐项完整');

function state(sect: string) {
  const definition = sectTrials.find(row => row.sect === sect);
  ok(definition, `${sect}: 表中有试炼`);
  return new SectTrialState(definition as unknown as SectTrialConfig);
}
function drawAll(trial: SectTrialState) {
  while (trial.stage === 'draw') {
    const expected = [...trial.strokes];
    for (const direction of expected) trial.drawStroke(direction);
  }
}
function lampsAll(trial: SectTrialState) {
  for (let n = 0; n < trial.def.lamps!.count; n++) trial.light(`lamp_${n}`);
}
function wavesAll(trial: SectTrialState, context: string) {
  let spawned = 0;
  for (let waveIndex = 0; waveIndex < trial.def.waves!.length; waveIndex++) {
    const wave = trial.def.waves![waveIndex];
    trial.tick((waveIndex ? trial.def.waveGapMs! : 0) + trial.def.spawnIntervalMs! * (wave.count - 1));
    const requests = trial.takeSpawnRequests();
    eq(requests.length, wave.count, `${context}: 第 ${waveIndex + 1} 波数量来自表`);
    ok(requests.every(request => request.monster === wave.monster), `${context}: 波次怪物来自表`);
    eq(new Set(requests.map(request => request.id)).size, wave.count, `${context}: 波内实例 id 唯一`);
    same(requests.map(request => request.side), Array.from({ length: wave.count }, (_, n) => n % 2 ? 'right' : 'left'),
      `${context}: both 刷怪分布在两侧`);
    eq(trial.waveDead('unknown'), false, `${context}: 未出生怪物不记击杀`);
    for (const request of requests) {
      eq(trial.waveDead(request.id), true, `${context}: 真实出生实例击杀被接受`);
      eq(trial.waveDead(request.id), false, `${context}: 重复死亡不记两次`);
      spawned++;
    }
    eq(trial.waveIndex, waveIndex + 1, `${context}: 清空此波才推进`);
    if (waveIndex + 1 < trial.def.waves!.length) {
      eq(trial.result, undefined, `${context}: 中间波清完不能胜利`);
      trial.tick(0);
      same(trial.takeSpawnRequests(), [], `${context}: 波间等待不会即刻刷下一波`);
    }
  }
  eq(spawned, trial.def.waves!.reduce((sum, wave) => sum + wave.count, 0), `${context}: 总怪数严格读表`);
  eq(trial.result, 'win', `${context}: 全部波次与击杀目标完成才胜利`);
}
function finishObjectives(trial: SectTrialState, context: string) {
  switch (trial.def.type) {
    case 'lamps_then_waves': lampsAll(trial); wavesAll(trial, context); break;
    case 'draw_then_targets':
      drawAll(trial);
      for (let n = 0; n < trial.def.targets!.total; n++) trial.targetDead(`target_${n}`);
      break;
    case 'stealth': trial.takeToken(); trial.returnToken(); break;
    case 'tame_then_waves':
      trial.tameReady(); trial.flute(trial.def.tame!.fluteMs, true, false); wavesAll(trial, context); break;
  }
  eq(trial.result, 'win', `${context}: 完成表内实际目标得到 win`);
}

// 幽影教学技能和试炼令牌属于当前实例，导出/读档保持正式技能与原快捷栏。
{
  const trial = sectTrials.find(row => row.sect === 'youying')!, p = new Progress();
  p.level = 12; p.grantSkill('spirit_bolt', 1);
  p.addItem('five_sect_token', 1); p.selectedSect = 'youying';
  p.hotbar = [null, 'spirit_bolt', null, null, null, null, null, null];
  const hotbar = [...p.hotbar], skills = { ...p.skills };
  p.quests[trial.quest!] = { state: 'active', kills: {}, crafted: {} };
  p.pendingSectTrial = { id: trial.id, returnPosition: { mapId: trial.map, x: 224, y: 576 } };
  p.beginTrialSkills(trial.grantSkills!);
  eq(p.skillLevel('phantom_cloak'), 1, '未拜入幽影也获得本局隐息教学等级');
  eq(p.skillLevel('shadow_step'), 1, '未拜入幽影也获得本局影遁教学等级');
  eq(p.canCastSkill(SKILLS.phantom_cloak), true, '教学技能可实际施放');
  eq(p.ownsSkill(SKILLS.phantom_cloak), false, '教学施放资格不伪造正式入宗');
  eq(p.trialSkillCharges('phantom_cloak'), 2, '隐息教学次数严格读表');
  eq(p.trialSkillDuration('phantom_cloak'), 4000, '隐息教学时长严格读表');
  eq(p.consumeTrialSkill('phantom_cloak'), true, '第一次隐息可消费');
  eq(p.consumeTrialSkill('phantom_cloak'), true, '第二次隐息可消费');
  eq(p.consumeTrialSkill('phantom_cloak'), false, '第三次隐息不可消费');
  eq(p.trialSkillCharges('phantom_cloak'), 0, '教学次数不减为负');
  p.addTrialItem('shadow_token', 1);
  p.buffs.push({ id: 'phantom_cloak', expireAt: Date.now() + 4000 });
  p.skillCooldowns.phantom_cloak = { readyAt: Date.now() + 10000, total: 10000 };
  const exported = p.exportSave();
  same(exported.skills, skills, '教学技能不进入正式 skills 存档');
  same(exported.hotbar, hotbar, '教学技能不进入正式 hotbar 存档');
  same(exported.buffs, [], '隐息教学 buff 不进入存档');
  same(exported.skillCooldowns, {}, '教学技能冷却不进入存档');
  eq((exported.inventory as Record<string, number>).shadow_token ?? 0, 0, '试炼令牌不进入永久背包');
  eq('trialSkills' in exported, false, '导出不包含 private 教学技能');
  eq('trialHotbarBefore' in exported, false, '导出不包含 private 快捷栏快照');
  p.save();
  const reloaded = Progress.load();
  same(reloaded.pendingSectTrial, p.pendingSectTrial, '未结算试炼返回位置保存在读档中供场景恢复');
  eq(reloaded.skillLevel('phantom_cloak'), 0, '读档不能重建本局隐息等级');
  eq(reloaded.skillLevel('shadow_step'), 0, '读档不能重建本局影遁等级');
  same(reloaded.hotbar, hotbar, '读档保持进入试炼之前的快捷栏');
  same(reloaded.completedTrials, [], '未结算 pending 不视为通关');
  const injection = { ...exported, trialSkills: { phantom_cloak: { level: 99, charges: 99 } },
    trialHotbarBefore: ['phantom_cloak'], transientItems: { shadow_token: 99 } };
  const imported = new Progress();
  eq(imported.importSave(injection), true, '允许兼容档携带未知 private 字段');
  eq(imported.skillLevel('phantom_cloak'), 0, '导入忽略 private 教学等级注入');
  eq(imported.trialSkillCharges('phantom_cloak'), undefined, '导入忽略 private 次数注入');
  same(imported.hotbar, hotbar, '导入忽略 private 快捷栏快照注入');
  p.removeTrialItem('shadow_token', 1); p.endTrialSkills();
  eq(p.skillLevel('phantom_cloak'), 0, '结束尝试移除临时隐息');
  eq(p.skillLevel('shadow_step'), 0, '结束尝试移除临时影遁');
  eq(p.canCastSkill(SKILLS.phantom_cloak), false, '结束尝试撤销临时施放资格');
  same(p.hotbar, hotbar, '结束尝试恢复原快捷栏');
  same(p.skills, skills, '结束尝试保持正式技能');
  same(p.buffs, [], '结束尝试清除教学 buff');
  same(p.skillCooldowns, {}, '结束尝试清除教学冷却');
  p.endTrialSkills();
  same(p.hotbar, hotbar, '重复结束教学幂等');
}

// 点灯限时只约束点灯阶段；亮灯、刷怪和死亡分别按实例去重。
{
  const trial = state('taixu'), count = trial.def.lamps!.count;
  eq(trial.stage, 'lamps', '太虚初始是点灯阶段');
  eq(trial.waveDead('0:0'), false, '点灯前不存在波次击杀');
  eq(trial.light('first'), true, '第一次点灯推进');
  eq(trial.light('first'), false, '同盏灯不能重复计数');
  for (let n = 1; n < count - 1; n++) trial.light(`lamp_${n}`);
  eq(trial.stage, 'lamps', '少于全部灯不能开始刷怪');
  trial.tick(trial.def.lamps!.timeLimitMs - 1);
  eq(trial.timeLeftMs, 1, '点灯超时前 1 ms 保留挑战');
  trial.light('last');
  eq(trial.stage, 'waves', '全部灯亮才开始傀儡');
  eq(trial.timeLeftMs, undefined, '傀儡阶段不沿用点灯时限');
  trial.tick(0);
  eq(trial.takeSpawnRequests().length, 1, '首波第一只立即出生');
  const fresh = state('taixu'); lampsAll(fresh); wavesAll(fresh, '太虚');
  const failed = state('taixu'); failed.tick(failed.def.lamps!.timeLimitMs);
  eq(failed.result, 'fail', '点灯不足到达限时即失败');
  const after = JSON.stringify(failed);
  failed.tick(600000); failed.light('late'); failed.playerDown(); failed.exit();
  eq(JSON.stringify(failed), after, '失败后 late 事件和重复结束幂等');
}

// 每符笔数和总符数均读表；错笔只重画当前道，靶场限时从画完开始。
{
  const trial = state('lingfu');
  eq(trial.targetDead('premature'), false, '画符前打碎木靶不计目标');
  trial.tick(90000);
  eq(trial.result, undefined, '画符 timeLimitMs=0 不计时限');
  eq(trial.drawStroke(trial.strokes[0]), 'stroke', '正确首笔推进');
  const wrong = (['up', 'right', 'down', 'left'] as TrialDirection[]).find(direction => direction !== trial.strokes[1])!;
  eq(trial.drawStroke(wrong), 'wrong', '按错当前笔反馈 wrong');
  eq(trial.strokeIndex, 0, '错笔回到当前符首笔');
  eq(trial.drawn, 0, '错笔不增加已画符数');
  const completed = [...trial.strokes];
  for (const direction of completed) trial.drawStroke(direction);
  eq(trial.drawn, 1, '完成一符才增加符数');
  trial.drawStroke(trial.strokes[0]);
  const wrongSecond = (['up', 'right', 'down', 'left'] as TrialDirection[]).find(direction => direction !== trial.strokes[1])!;
  trial.drawStroke(wrongSecond);
  eq(trial.drawn, 1, '第二符错笔保留第一符');
  ok(trial.strokes.length >= trial.def.draw!.strokesMin && trial.strokes.length <= trial.def.draw!.strokesMax, '下一符笔数在表内区间');
  drawAll(trial);
  eq(trial.drawn, trial.def.draw!.talismans, '完整画符数来自表');
  eq(trial.stage, 'targets', '画完所有符才打开靶场');
  eq(trial.timeLeftMs, trial.def.targets!.timeLimitMs, '靶场新开计时');
  for (let n = 0; n < trial.def.targets!.total - 1; n++) {
    eq(trial.targetDead(`target_${n}`), true, '每个独立木靶击杀计数');
    eq(trial.targetDead(`target_${n}`), false, '同一木靶重复事件不重复计数');
  }
  trial.tick(trial.def.targets!.timeLimitMs - 1);
  eq(trial.result, undefined, '未到限时且差一个靶不结算');
  trial.targetDead('last');
  eq(trial.result, 'win', '最后一靶在时限前碎才胜利');
  const failed = state('lingfu'); drawAll(failed); failed.tick(failed.def.targets!.timeLimitMs);
  eq(failed.result, 'fail', '靶场目标不足到达 30 秒即失败');
  const stored = JSON.stringify(failed); failed.targetDead('late'); failed.returnToken(); failed.exit();
  eq(JSON.stringify(failed), stored, '超时后目标事件不能转为胜利');
}

// 偷到令牌是中间目标；必须带回起点。发现判定在去程与回程都生效。
{
  const trial = state('youying');
  trial.returnToken();
  eq(trial.result, undefined, '空手回起点不能通关');
  eq(trial.takeToken(), true, '第一次拿令牌推进回程');
  eq(trial.takeToken(), false, '重复拿令牌幂等');
  eq(trial.result, undefined, '只拿令牌还未通关');
  trial.returnToken();
  eq(trial.result, 'win', '令牌带回起点胜利');
  for (const returning of [false, true]) {
    const failed = state('youying'); if (returning) failed.takeToken(); failed.detected();
    eq(failed.result, 'fail', `${returning ? '回程' : '去程'}被发现直接失败`);
    failed.returnToken();
    eq(failed.result, 'fail', '发现后回起点不能逆转失败');
  }
}

// 驯兽未到半血教学阶段不能吹笛；中断/松键重计三秒，随后必须清完两波。
{
  const trial = state('wanshou'), duration = trial.def.tame!.fluteMs;
  eq(trial.flute(duration, true, false), false, '山魈未就绪不能驯服');
  trial.tameReady();
  eq(trial.stage, 'flute', '山魈半血后进入吹笛阶段');
  eq(trial.flute(duration - 1, true, false), false, '差 1 ms 不能驯服');
  eq(trial.fluteRatio, (duration - 1) / duration, '吹笛进度来自 fluteMs');
  trial.flute(1, true, true);
  eq(trial.fluteMs, 0, '移动/攻击/受伤中断后清空读条');
  trial.flute(duration - 1, true, false); trial.flute(1, false, false);
  eq(trial.fluteMs, 0, '松开骨笛按键也重置');
  eq(trial.flute(duration, true, false), true, '连续完整三秒才驯服');
  eq(trial.stage, 'waves', '驯服后开始并肩狼群阶段');
  eq(trial.result, undefined, '驯服山魈还不能通关');
  wavesAll(trial, '万兽');
}

// 完成核心的真实目标才调用正式胜利回调；失败/退出/retry 不污染通关或发奖。
const joined: string[] = [];
for (const job of CLASS_LIST) {
  const quest = QUESTS[job.joinQuest];
  ok(quest, `${job.id}: 正式拜入任务保留在运行时`);
  const p = new Progress(); p.level = quest.reqLevel; p.exp = 0;
  p.quests.q_fox = { state: 'done', kills: {}, crafted: {} }; p.grantSkill('spirit_bolt', 1);
  if (job.sect !== 'tianjian') {
    p.addItem('five_sect_token', 1);
    p.selectedSect = job.sect;
  }
  p.skills.spirit_bolt += 3; p.stones = 123; p.hp = p.maxHp; p.mp = p.maxMp;
  const quests = new QuestSystem(p);
  eq(quests.accept(quest.id), true, `${job.id}: 实际接取本宗任务`);
  eq(quests.complete(quest.id), false, `${job.id}: 接任务不能算通过`);
  eq(quests.turnIn(quest.id), undefined, `${job.id}: 未完成不能领奖`);
  const def = sectTrials.find(row => row.quest === quest.id);
  if (def) {
    const resources = { exp: p.exp, stones: p.stones, inventory: p.inventory, skills: p.skills };
    for (const result of ['fail', 'exit'] as const) {
      const interrupted = new SectTrialState(def as unknown as SectTrialConfig);
      if (result === 'fail') interrupted.playerDown(); else interrupted.exit();
      eq(interrupted.result, result, `${job.id}: ${result} 结束尝试`);
      eq(quests.complete(quest.id), false, `${job.id}: ${result} 不完成任务`);
      same(p.completedTrials, [], `${job.id}: ${result} 不记录通关`);
      same({ exp: p.exp, stones: p.stones, inventory: p.inventory, skills: p.skills }, resources, `${job.id}: ${result} 不扣资源也不赠技`);
      const retry = new SectTrialState(def as unknown as SectTrialConfig);
      eq(retry.result, undefined, `${job.id}: ${result} 后可建立全新尝试`);
      eq(retry.lit + retry.drawn + retry.targets + retry.waveKilled, 0, `${job.id}: 重试目标从零开始`);
    }
    const trial = new SectTrialState(def as unknown as SectTrialConfig); finishObjectives(trial, job.id);
    // 这是已完成全部真实目标后的结算入口，不以回调模拟胜利。
    if (trial.result === 'win') eq(quests.onTrialComplete(def.id), true, `${job.id}: 胜利结算登记目标`);
    eq(quests.onTrialComplete(def.id), false, `${job.id}: 同次胜利回调幂等`);
    eq(p.job, '', `${job.id}: 试炼胜利还未正式拜入`);
    p.save(); const restored = Progress.load();
    same(restored.completedTrials, [def.id], `${job.id}: 通关记录存读保持`);
    eq(new QuestSystem(restored).complete(quest.id), true, `${job.id}: 通关重读可正式交付`);
  } else {
    eq(job.sect, 'tianjian', '仅天剑宗免额外试炼');
    quests.onTalk(quest.turnIn);
    eq(p.completedTrials.length, 0, '天剑长老交谈不伪造四宗通关记录');
  }
  eq(quests.complete(quest.id), true, `${job.id}: 真实目标完成后才可交付`);
  const reward = quests.turnIn(quest.id);
  ok(reward, `${job.id}: 正式交付成功`);
  const scene = Object.assign(Object.create(GameScene.prototype), {
    prog: p, player: { syncAppearance() {} }, skillWindow: { refresh() {} },
    log() {}, levelUpFx() {}, maybeSpTip() {},
  }) as GameScene;
  scene.giveRewards(reward.quest, reward.broke, reward.daily);
  eq(p.job, job.id, `${job.id}: 正式发奖才确定职业`);
  eq(p.skillLevel('spirit_bolt'), 0, `${job.id}: 正式拜入替换灵气弹`);
  eq(p.classRefundSp, 3, `${job.id}: 退还三点付费灵气弹 SP`);
  for (const gift of quest.rewards.skills ?? []) eq(p.skillLevel(gift.id), gift.level, `${job.id}: ${gift.id} 赠技按表`);
  eq(p.equip.robe, classRobe(job), `${job.id}: 奖励本宗道袍`);
  const snapshot = p.exportSave();
  eq(quests.turnIn(quest.id), undefined, `${job.id}: 不能重复正式交付`);
  p.save(); const reloaded = Progress.load(); reloaded.backfillClass();
  // load 本身按墙钟推进寿元，因此只比较任务/奖励/职业/SP 等离散状态。
  for (const field of ['job', 'quests', 'completedTrials', 'classRewardClaims', 'classRefundSp', 'skills', 'skillGifted', 'hotbar', 'inventory', 'equip', 'stones']) {
    same(reloaded.exportSave()[field], snapshot[field], `${job.id}: ${field} 重复存读与补档不重复发放`);
  }
  joined.push(job.id);
}

// 关闭四宗开关：接取、交付和新拜入均拒绝；天剑保留既有正式入口。
setFeatureFlag('fiveSectClasses', false);
for (const job of CLASS_LIST) {
  const p = new Progress(); p.level = 29; p.quests.q_fox = { state: 'done', kills: {} };
  const quests = new QuestSystem(p), before = p.exportSave();
  if (job.sect === 'tianjian') {
    eq(quests.available(job.joinQuest), true, '关闭四宗时天剑入口仍可用');
    continue;
  }
  eq(quests.available(job.joinQuest), false, `${job.id}: feature 关闭不显示可接`);
  eq(quests.accept(job.joinQuest), false, `${job.id}: feature 关闭不能接取`);
  eq(p.advanceClass(job.id), false, `${job.id}: feature 关闭不能绕过拜入`);
  same(p.exportSave(), before, `${job.id}: gate 拒绝不改角色`);
  p.quests[job.joinQuest] = { state: 'active', kills: {} };
  const trial = sectTrials.find(row => row.quest === job.joinQuest)!;
  eq(quests.onTrialComplete(trial.id), false, `${job.id}: feature 关闭不接受通关`);
  eq(quests.turnIn(job.joinQuest), undefined, `${job.id}: feature 关闭不能交付存档里的任务`);
}
for (const [name, value] of Object.entries(initialFlags)) setFeatureFlag(name as keyof typeof initialFlags, value);
console.log(JSON.stringify({ test: 'trials', assertions, sectTrials: sectTrials.length, formalJoins: joined, initialFlags }));
