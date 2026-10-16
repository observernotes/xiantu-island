# 正魔 / questHooks 一期最小路径结果

日期：2026-10-16。工作根：`/workspace/xiantu/wt/dev`。

基线为本地与 origin/dev 同步的 `2b7344e6d210d07c655d19cd86a1563c1d649d1b`。实现提交 `59e47eea5fe607b08bddb44d20f4aa304be15e26` 已普通推送 origin/dev；本报告单独提交。依据 `design/10_好感与因果.md` §四（尤其 4.3）及 `design/01_配置表规范.md` G12，对标 `src/Affinity.ts` 与 `AFFINITY_PHASE1_MINPATH_RESULT.md`。

## 实现

| 范围 | 已实现行为 |
| --- | --- |
| `src/QuestHooks.ts` 解析与关态 | 保持原 `parseQuestHooks` 校验、诊断及深冻结快照；关态先于选项查找、poison Proxy 与状态读取，preview 为 `unavailable/disabled`，settle 为 `rejected/disabled`。无开态 `not_implemented` 路径。 |
| 开态预览 | `previewQuestHook(config, hookId, choiceId, state)` 接受 Progress 或只读快照，返回两轴 before/after/delta/clamped、可选配置 delta、karma 动作、结果文案 keys、questId/choiceId/textKey。预览不迁移、不保存、不改调用方；结果深冻结且不冻结调用方。 |
| 开态结算 | `settleQuestHook(config, hookId, choiceId, progress)` 经 `Progress.runSaveTransaction` 同次写入两轴、karmaFlags、questChoices 及 appliedQuestHooks。karmaFlags 缺失时事务内建立对象。两轴使用同一 `karma_flags.rules.moralState`（即 data.MORAL_STATE 的来源），先比较剩余空间再加减，最后落范围内值，避免安全整数相加溢出。 |
| 就绪与迁移 | daoHeart/morality 均须 `Number.isSafeInteger`，与 GameScene 的 moral_state 数值判定一致；另强制 `isValidRelationshipState`。坏值先拒绝，不能靠迁移伪造就绪。moralVersion 缺失/旧版时在事务内调用 Progress 既有 `ensureDefaults` 路径；只读预览不做迁移，保存失败连版本一起回滚。未新增第三条轴。 |
| 一次资格与不追溯 | `questChoices[hook.quest]=choice.id`，`appliedQuestHooks` 保存 **quest id**。同题同选项、另一选项均不重发。已 done 且无收据、已有选择或合法本题因果但缺收据均拒绝补发；不推断历史选项、不补轴。 |
| 因果合法性 | 从正式 flags 注册表校验 flag、once/boolean/playthrough 及 quest + node + outcome writer；越权配置拒绝。坏 karma/quests、坏关系或本题隔离记录拒绝；同组双 true 返回 conflict，保留历史，不清另一 flag。 |
| `src/QuestSystem.ts` | 第 4 构造参数注入 hooks fixture；`turnIn(id, force=false, choiceId?)` 支持显式选项。关态或 not_ready 走原交付，不假造选择。开态 ready 无选项/坏选项保留节点；预检后在事务内再次检查，`stageQuestHookChoice` 在 done 前暂存。原任务完成、原奖励、两轴、因果、选择与收据同次保存；失败不通知成功，可重试。未叠加旧天剑两轴入口。 |
| 测试与关系结构 | `src/quest-hooks.test.ts` 改为开态矩阵，保留关态与坏表断言；新增 `src/quest-hooks-turn-in.test.ts`。`scripts/quest-hooks-test.mjs` 保持 snapshot/shared 和坏表模式。RelationshipState 只更新注释，存档结构及校验不变；未修改 Progress。 |

`daoHeart.delta` / `morality.delta` 表示配置请求增量，实际变化为 after-before；clamped 表示实际变化与请求不同，边界实际变化为 0 仍记录整题资格。未提供的轴增量按 0 预览。

独立 settle API 只提交关系效果，不标任务 done、不发原任务奖励；真实交付请用 QuestSystem 的同一事务入口。`stageQuestHookChoice` 仅供已经处于 `runSaveTransaction` 的调用方使用，不应在事务外直接调用。

**未接完整选择 UI，执法堂用 API/fixture 抽检。** 本次挂接交付 API，没有大改对白控制器；正式关态仍使用原对白与奖励，开态 fixture 缺显式选择时不会默认选 A。结果文案 keys 仅随成功 API 返回，未增加完整选择面板或结果播放 UI。

### reason 与返回合同

| 条件 | preview | settle |
| --- | --- | --- |
| 关态 | unavailable / disabled | rejected / disabled |
| 缺题目或选项 | unavailable / missing | rejected / missing |
| 坏表、未登记 flag 或 writer 不匹配 | unavailable / invalid | rejected / invalid |
| 两轴未就绪，或要求本期未实现的功能依赖 | unavailable / not_ready | rejected / not_ready |
| 坏 relationshipState、karmaFlags、quests 或本题隔离记录 | unavailable / invalid_save | rejected / invalid_save |
| 本题已在 appliedQuestHooks | unavailable / already_applied | duplicate，带 questId；不保存 |
| 已完成任务无收据，或存在无收据的本题选择/因果历史 | unavailable / not_retroactive | rejected / not_retroactive |
| 本题互斥组多个 true | unavailable / conflict | rejected / conflict |
| 合法只读快照缺 runSaveTransaction | preview | rejected / needs_progress |
| 写盘拒绝/异常 | 不涉及写盘 | rejected / save_failed，整份内存回滚 |
| 成功 | preview，包含变更详情 | applied，包含同类详情、questChoice=choiceId、appliedQuestId=questId |

只读快照应携带原 `quests`，以便校验完成历史；不能用删掉历史字段的快照代替真实存档结算。

## 验收

| 命令 | 结果 |
| --- | --- |
| `npm run test:quest-hooks` | PASS；snapshot/shared 各 **750 条 API + 285 条真实交付断言**，另各跑坏表模块图。 |
| `npm run test:moral-save` | PASS；153 条。 |
| `npm run test:affinity` | PASS；snapshot/shared 各 547 条好感 + 80 条关系存档断言，另各跑坏表模块图。 |
| `npm run test:encounter` | PASS；snapshot/shared 各 1445 条及坏表矩阵，关态表文件保护通过。 |
| `npm run test:classes` | PASS；职业 9200、发布门禁 3990、任务原子奖励 128、职业入口 1747、宗门入口 1484 条。 |
| `npm run test:daily` | PASS；575 条。 |
| `npm run test:mainline-21` | PASS；349 条。 |
| `npm run test:cheat` | PASS；113 条，无 `?cheat=1` 不启作弊。 |
| `npx tsc --noEmit` | PASS。 |
| `git diff --check` / `git diff --cached --check` | PASS。 |

开态矩阵覆盖两题四选项的正确轴/因果/文案、预览无副作用及深冻结、quest id 整题 once、两轴顶底和 ±MAX_SAFE_INTEGER 增量/旧值、缺/旧 moralVersion、缺 karma 容器、未就绪/坏档/互斥/隔离/不可追溯、未登记或越权 writer、缺选项/坏表及关态 poison 优先。真实 Progress 注入 save=false、save 抛错、localStorage 抛错，核对内存、磁盘、试炼临时背包及版本全部回滚，重试只结算一次。

交付矩阵另核两题四选项的原修为、灵石、物品、拜宗及技能等价；缺选择保留节点；关态/未就绪沿用原交付；一次真实保存；重复交付不通知；保存失败连任务/职业/原奖励一起回滚；事务内任务已 done 的复检也拒绝新增效果。

## 正式门禁与文件旁证

以下 11 个文件已逐字节对比基线 `2b7344e`，共享/快照各对也逐字节一致；未刷新快照，未修改这些 JSON。

| 文件（共享与快照） | 门禁/状态 | SHA-256（各对相同） |
| --- | --- | --- |
| `data/balance/karma_flags.json`、`/workspace/xiantu/balance/karma_flags.json` | 两题 questHooks.enabled=false，2/2 | `9ca62c095baf28115f73691ad72e1977bc93058c0a5f5ad2b000510c488323bf` |
| `data/balance/npcs.json`、`/workspace/xiantu/balance/npcs.json` | gifts.enabled=false，9/9；既有 affinity.enabled=true，9/9，保持基线 | `de767143b64be96b01e3c01fcf4c3a1411087068ef3cd01454e8ff68134eb5cd` |
| `data/balance/gongfa_grades.json`、`/workspace/xiantu/balance/gongfa_grades.json` | #19 根 enabled=false，bindings 全 false（38/38） | `48cca756168dc7dabdac4d126ba61805e23139a48c857df98d0542642d9c52e1` |
| `data/balance/qi_density.json`、`/workspace/xiantu/balance/qi_density.json` | #20 根/display/meditation enabled 均 false | `c1c3694179d9053652ab27f8fa2153442e33716329c8c863ecc87a020c06af16` |
| `data/balance/encounters.json`、`/workspace/xiantu/balance/encounters.json` | 既有奇遇表保持基线 | `7ebe128f4223e2eb7c4a58385d482865918701fb6a772f025795997fd3840e9c` |
| `data/features.json` | lifeSkillCurve=false | `a976e15e9a4a626cf14fe996fa8966d15712e8b9c0a810436d537928a51d09c1` |

可复核门禁（从本工作根执行，不写表）：

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import a from 'node:assert/strict';
for (const root of ['data', '/workspace/xiantu']) {
  const read = name => JSON.parse(fs.readFileSync(`${root}/balance/${name}.json`, 'utf8'));
  const hooks = read('karma_flags').questHooks;
  a.equal(hooks.length, 2); a(hooks.every(h => h.enabled === false));
  const npcs = read('npcs').filter(n => n.affinity);
  a.equal(npcs.length, 9); a(npcs.every(n => n.affinity.gifts.enabled === false));
  const grades = read('gongfa_grades'), qi = read('qi_density');
  a.equal(grades.enabled, false); a(grades.bindings.every(b => b.enabled === false));
  for (const enabled of [qi.enabled, qi.display.enabled, qi.meditation.enabled]) a.equal(enabled, false);
  console.log(root, 'QUESTHOOKS_FALSE=2/2 GIFTS_FALSE=9/9 #19_FALSE #20_FALSE');
}
a.equal(JSON.parse(fs.readFileSync('data/features.json', 'utf8')).lifeSkillCurve, false);
console.log('LIFE_SKILL_CURVE_FALSE');
NODE
```

未改战力公式、作弊门禁、已完成好感配置或无关快照 SHA；未发版、未操作 master、未 force-push。未修改 `/workspace/xiantu/status/*` 或 backlog。起始已有的未跟踪 `data/art/sprites/_pending/secret_rest_r1/` 原样保留，不纳入提交。

## 执法堂开态抽检

`npm run test:quest-hooks` 会在 snapshot/shared 两个数据根自动运行开态、交付及坏表矩阵。业务开态只在 `structuredClone(karmaFlagsRaw)` 中改目标 hook.enabled=true，再经 parse；正式表勿改。极值/越权的负向测试也仅改内存 fixture。

在现有 Vite SSR 测试宿主内可复现（宿主用独立内存 localStorage，见两个测试文件）：

```ts
import karmaFlagsRaw from '@xt/balance/karma_flags.json';
import { parseQuestHooks, previewQuestHook, settleQuestHook } from './QuestHooks';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';

const raw = structuredClone(karmaFlagsRaw);
raw.questHooks.find(hook => hook.id === 'prologue_medicine')!.enabled = true;
const config = parseQuestHooks(raw).config!;
const progress = new Progress();
previewQuestHook(config, 'prologue_medicine', 'return', progress); // preview，善恶 +1
settleQuestHook(config, 'prologue_medicine', 'return', progress); // applied
settleQuestHook(config, 'prologue_medicine', 'keep', progress);   // duplicate，q_awaken
// progress.relationshipState.questChoices.q_awaken === 'return'
// progress.relationshipState.appliedQuestHooks 内容为 ['q_awaken']

// 真实交付使用另一独立 Progress，目标须由正常任务流程准备完毕。
const delivery = new Progress();
delivery.quests.q_awaken = { state: 'active', kills: {}, reached: true };
const quests = new QuestSystem(delivery, () => Date.now(), null, config);
quests.turnIn('q_awaken');                  // undefined，缺选择保留节点
quests.turnIn('q_awaken', false, 'return'); // 原任务奖励+done+关系效果同次保存
```

天剑宗将目标 hook 改为 `sect_tianjian_sword`，分别用 protect/seek_dao 在独立、未完成、目标就绪的 fixture 抽检；两题四选项及原奖励对照已在 `src/quest-hooks-turn-in.test.ts` 覆盖。不开作弊，不直接调用 stage 绕过事务；旧 done 存档只会得到 not_retroactive，不应删除历史字段来补发。

本次交付最小可测路径与交付 fixture 接口；正式启用与完整选择 UI 另行安排。
