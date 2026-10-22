# design/47 · 苏师姐好感来源 · 接线交件

> 2026-10-22 Asia/Shanghai；分支 `feat/companion-affinity-sources`。
>
> 基线：`e9290228`；依据 design/47、演武定稿及负责人接线令；门闩 **OPEN**。
>
> **接线 only；未 push、未合 master；≠开态≠soft≠release。**

## 接线结果

- `data/balance/quests.json` 新增 `q_su_fellow_meet` → `q_su_fellow_tour` → `q_su_fellow_confide`，以 prereq 与 next 保证顺序；苏师姐 giver＋turnIn，目标均只 talk 苏，`reqLevel=null`、`rewards={}`、`phase=5`。
- `senior_sister_su.quests` 显式挂三 ID；`affinity.sources` 恰三条 `quest/on:done/once:true`，delta **100／100／100**，累计 **0→100→200→300（confidant）**。
- `strings_zh.json` 补齐三任务各五个中文文案键；任务中文名为同门初识／宗门引路／知交心迹。
- 复用既有 QuestSystem、Affinity 与 Companions；玩法源码未改。`gifts.enabled=false`，未领／已领 `confidant_gift` 都可邀请；邀请不读取礼物收据。
- 新增 `scripts/companion-affinity-sources-test.mjs` 及 `test:companion-affinity-sources`；测试明确解析本分支 `data/`，未将共享旧表当作本刀闭环证据。

## 验证

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run test:companion-affinity-sources` | PASS，262 assertions |
| `npm run test:affinity` | PASS，snapshot/shared 各 599 affinity＋80 relationship-save assertions，两根坏表测试通过 |
| `npm run test:companion-follow-ai` | PASS，86 assertions |
| `npm run test:companion-modes-free-stay` | PASS，158 assertions |
| `npm run test:companion-dismiss` | PASS，106 assertions |
| `npm run test:companion-area-whirl` | PASS，190 assertions |
| `npm run test:companion-reflect-hook` | PASS，172 assertions |
| `npm run test:companion-down-revive` | PASS，768 assertions，显式验证 shared/snapshot 实际解析根 |
| `git diff --check` | PASS |

前五项旧 companion runner 没有按其循环参数切换 Vite 别名，默认实际读 shared；已分别额外以 `XT_DATA=snapshot` 补跑且全部通过。down-revive 自身显式绑定两根。

新测试通过真实 NPC 对话接取、talk、交付完成三任务，验证每环 +100 与 once 收据、重复交付／接取拒绝；同时覆盖真实 done 后的 pending 消费路径、未达知交拒绝、达档后既有 invite、未领／已领礼资格一致及拒读礼物字段。禁口任务、击杀、未登记奇遇均不给苏好感。

为满足检查，仅适配三处既有测试：`affinity.test.ts` 的 9 人陈旧断言更新为基线已有的显式 10 NPC 名单及逐项门禁断言；`v05.test.ts`／`v06c-open.test.ts` 各一行收窄原有数值等级夹具，适配新增 nullable JSON 字段的类型推断。没有改变这些任务或玩法。

新 worktree 原缺依赖和被忽略的素材清单，已执行 `npm ci --no-audit --no-fund`、`XT_DATA=snapshot npm run sync` 补齐本地测试环境；未改 lockfile 或提交生成物。

## 冻结与边界

| 文件 | shared／snapshot SHA256 |
|---|---|
| `companions.json` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `skills.json` | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` |

两表字节未改；schedule=`primary_and_area`、supportLocked=true、reviveMs=30000 及 41–46 硬读保持。无新 OpenFlag／softOpenedCompanion＊，GAME_PHASE=5，gifts 仍关；禁口不在入口或 sources，无第四条来源、kill 或 encounter 好感来源。

对基线的结构比对确认：已有任务逐项不变，NPC 仅苏的 quests／sources 变化，字符串仅新增指定 15 键。未改阵法、巢穴、夺宝、跳跃、FriendlySummons 或其它玩法，未接 support／三技能整包／#20。

本刀仅修改分支 `data/` 快照，共享 `/workspace/xiantu/balance/` 未落表。feature 分支默认运行时仍读取 shared；本刀预览／验证需显式使用 `XT_DATA=snapshot`。共享落表及开态按后续调用方流程处理。

【同行AI47接线已交】报告＝reports/炼器阁/20261022_同行AI_design47_wire.md｜门闩＝OPEN｜三 delta＝100／100／100｜无新OpenFlag｜gifts关｜全部指定检查PASS｜未push｜未合master｜等负责人核
