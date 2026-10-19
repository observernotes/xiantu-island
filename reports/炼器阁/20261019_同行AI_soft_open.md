# design/41 · 同行 AI follow · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 20:35 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_同行AI_soft-open.md`  
> 核记：`reports/炼器阁/20261019_负责人核_同行AI_开态.md`（VERIFY_PASS＠1508298）  
> 业务 tip@`1508298`／接线 tip@`1508298`／接线报告 `reports/炼器阁/20261019_同行AI_wire.md`  
> 范式：对齐万妖巢穴／跳跃／夺宝 soft——**复用既有** tip 正式路径（邀请＋follow spawn）；**不引入** `softOpenedCompanion＊`／`CompanionOpenFlag`／任何新 OpenFlag；证据＝HANDOFF／RESULT／status  
> Codex：本刀仅 docs／status／RESULT → **旁路直写**（与夺宝／跳跃／巢穴 soft 同；不经 Sol）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedCompanion＊／CompanionOpenFlag**  
> 现网仍 **v0.6.22**。**独立于巢穴／夺宝／跳跃／阵法／gifts／#20**（禁捆）。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-follow-ai` |
| 业务基线 tip | `1508298ee236b5a7bbc995f11070ed0b232b8c1a`（短 `1508298`；接线） |
| 基线 HEAD docs | `49908821b8f8398bf3eb425913635a8e022a5386`（接线 tip SHA 正文） |
| soft-open tip | `f7a351c32d588b8ecb87623783003f1cf4a8feb6`（短 `f7a351c`） |
| worktree | `/workspace/xiantu/wt/feat/companion-follow-ai` |
| origin | 推 `origin/feat/companion-follow-ai`（**未**合 master） |
| 旁路 | **是**（docs／status／RESULT；Codex403旁路） |

> 注：本文件经 soft tip 后以 `git rev-parse HEAD` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedCompanion＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261019_同行AI_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.22 |

**未改**：`src/CompanionFollowAi.ts`／`src/scenes/GameScene.ts`／`src/companion-follow-ai.test.ts`／`scripts/companion-follow-ai-test.mjs`／`package.json`（相对 tip@`1508298` **零业务 diff**）；`data/balance/companions.json`／`skills.json`；`FriendlySummons.ts`；任何 `*Companion*OpenFlag*`（**未新建**）；任何 `softOpenedCompanion＊` 源码符号（**未引入**）；六既有 OpenFlag／阵法／gifts／#20／GAME_PHASE／巢穴／夺宝／跳跃。

**与万妖巢穴／跳跃／夺宝 soft 对齐**：本刀**不**引入 `softOpenedCompanion＊`／`CompanionOpenFlag`；**复用**既有 tip@`1508298` 正式路径（companions 表门禁＋邀请写 `{mode:'follow'}`＋`spawnAfterInvite`）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。`softOpenPreRelease:true` 仅为报告／status **口径字段**，非源码符号。

## 3. 硬门

| 项 | 结果 |
|---|---|
| soft-open 可发版前态 | **true**（本 RESULT／status） |
| softOpenPreRelease（口径） | **true** |
| softOpenedCompanion＊ | **未引入**（`rg softOpenedCompanion` src／scripts／package.json **命中 0**） |
| CompanionOpenFlag／*Companion*OpenFlag* | **未建**（`rg CompanionOpenFlag` 仅既有 test 负向断言字符串＠tip@1508298；非门闩源码符号） |
| released | **false** |
| newOpenFlag | **false** |
| companions SHA | **`e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` MATCH** |
| skills SHA | **`d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` MATCH** |
| 硬读 follow／leash／aggro | **96／320／320**（`COMPANION_FOLLOW_HARD`＠tip@`1508298`） |
| 硬读 primary CD／engage／budget | **CD1200／engage w=240／budgetScale=0.35** |
| 硬读 mode | **follow only** |
| 相对 tip@`1508298` 业务 diff | **零**（src／data／scripts／package.json；`git diff 1508298 -- …`＝0 bytes） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master；tip ⊄ origin/master |
| 独立于巢穴／夺宝／跳跃 | **PASS**（未碰 SecretNest／loot.seize／feel／Player 二段跳） |
| 现网 | **v0.6.22**（未发本刀） |
| 开态 out | **未覆盖** `qa/out_companion_follow_ai_open_1508298/` |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS**（exit 0；2026-10-19 20:35 Asia/Shanghai） |
| `npm run test:companion-follow-ai` | **PASS**（86 assertions × shared 43＋snapshot 43）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`96/320/320+CD1200+0.35`；**无** softOpenedCompanion＊；companions／skills SHA 不变 |

## 5. 业务旁证（tip@1508298 固化）

| 项 | 值 |
|---|---|
| 门禁 | companions 表＋affinity／知交；无新 OpenFlag |
| 邀请 | `invite` → 唯一 `{mode:'follow'}`；`spawnAfterInvite` → 恰 1 苏师姐 |
| follow／leash | followDist=96；超 leash=320 瞬移归位 |
| 战斗 | primary `sword_qi_slash`；CD1200；engage w=240；伤害×0.35 |
| 隔离 | namespace=`companion_follow`；≠ FriendlySummons.pets；gifts 关 |
| 执法开态 out | `qa/out_companion_follow_ai_open_1508298/`（C01–C03＋O01–O05 PASS；本刀**勿覆盖**） |

## 6. 交回

【同行AIsoft已交】炼器＝`reports/炼器阁/20261019_同行AI_soft_open.md` tip＝`f7a351c`｜业务 tip@1508298｜硬门＝无softOpenedCompanion＊／newOpenFlag=false／released=false／冻结MATCH／硬读96/320/320＋CD1200＋240＋0.35｜tsc＋companion-follow-ai 86 PASS｜相对1508298零业务diff｜Codex旁路｜≠release≠Pages｜现网v0.6.22｜请开 soft smoke
