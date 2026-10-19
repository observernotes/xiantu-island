# design/42 · 同行 AI free＋stay＋切换 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 21:43 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_同行AI_design42_soft-open.md`  
> 核记：`reports/炼器阁/20261019_负责人核_同行AI_design42_开态.md`（VERIFY_PASS＠da77e4a）  
> 业务 tip@`da77e4a`／接线 tip@`da77e4a`／接线报告 `reports/炼器阁/20261019_同行AI_design42_wire.md`  
> 范式：对齐同行 AI design/41／万妖巢穴／跳跃 soft——**复用既有** tip 正式路径（邀请＋KeyV 三态循环）；**不引入** `softOpenedCompanion＊`／`CompanionOpenFlag`／任何新 OpenFlag；证据＝HANDOFF／RESULT／status  
> Codex：本刀仅 docs／status → **旁路直写**（与 design/41／夺宝／跳跃／巢穴 soft 同；不经 Sol）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedCompanion＊／CompanionOpenFlag**  
> 现网仍 **v0.6.23**。建议发版号 **v0.6.24**（本令**不**授权 release）。**独立于巢穴／夺宝／跳跃／阵法／gifts／#20**（禁捆）。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-modes-free-stay` |
| 业务基线 tip | `da77e4a2c60671d4981363eb4b9c5cc7e7b7eaa7`（短 `da77e4a`；接线） |
| 基线 HEAD docs | `cff5cb452965190b25341ac9fc4a7f87ca1e581e`（接线 tip 钉业务 tip da77e4a） |
| soft-open tip | `84e6b4253a50b4e27537158c7e64cb68a5142833`（短 `84e6b42`） |
| worktree | `/workspace/xiantu/wt/feat/companion-modes-free-stay` |
| origin | 推 `origin/feat/companion-modes-free-stay`（**未**合 master） |
| 旁路 | **是**（docs／status；Codex403旁路） |

> 注：本文件经 soft tip 后以 `git rev-parse HEAD` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedCompanion＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261019_同行AI_design42_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.23；等执法 soft smoke；禁自 release |

**未改**：`src/CompanionFollowAi.ts`／`src/Companions.ts`／`src/scenes/GameScene.ts`／`src/companion-modes-free-stay.test.ts`／`src/companion-follow-ai.test.ts`／`scripts/companion-modes-free-stay-test.mjs`／`scripts/companion-follow-ai-test.mjs`／`package.json`（相对 tip@`da77e4a` **零业务 diff**）；`data/balance/companions.json`／`skills.json`；`FriendlySummons.ts`；任何 `*Companion*OpenFlag*`（**未新建**）；任何 `softOpenedCompanion＊` 源码符号（**未引入**）；六既有 OpenFlag／阵法／gifts／#20／GAME_PHASE／巢穴／夺宝／跳跃／重做 design/41 follow 主体。

**与万妖巢穴／跳跃／夺宝／design/41 soft 对齐**：本刀**不**引入 `softOpenedCompanion＊`／`CompanionOpenFlag`；**复用**既有 tip@`da77e4a` 正式路径（companions 表门禁＋邀请写 `{mode:'follow'}`＋KeyV `cycleCompanionMode` follow→free→stay）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。`softOpenPreRelease:true` 仅为报告／status **口径字段**，非源码符号。

## 3. 硬门

| 项 | 结果 |
|---|---|
| soft-open 可发版前态 | **true**（本 RESULT／status） |
| softOpenPreRelease（口径） | **true** |
| softOpenedCompanion＊ | **未引入**（`rg softOpenedCompanion` 非 test 源码／scripts／package.json **命中 0**；仅 `companion-modes-free-stay.test.ts` 负向断言字符串） |
| CompanionOpenFlag／*Companion*OpenFlag* | **未建**（`rg CompanionOpenFlag` 仅 test 负向断言＠modes／follow-ai；非门闩源码符号） |
| released | **false** |
| newOpenFlag | **false** |
| companions SHA | **`e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` MATCH** |
| skills SHA | **`d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` MATCH** |
| 硬读 KeyV 循环 | **follow→free→stay→follow**（`COMPANION_MODES_HARD`＠tip@`da77e4a`） |
| 硬读 free | **aggro320／engage240×48／无 leash 瞬移／仅 primary／×0.35** |
| 硬读 stay | **零伤停手≠无敌**（`invulnerable=false`） |
| 硬读切回 follow | **96／320／320＋CD1200＋engage240＋×0.35**；切态无 CD／预算叠加 |
| 相对 tip@`da77e4a` 业务 diff | **零**（src／data／scripts／package.json；`git diff da77e4a -- …`＝0 bytes） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master；tip ⊄ origin/master |
| 独立于巢穴／夺宝／跳跃／阵法 | **PASS**（未碰 SecretNest／loot.seize／feel／Player 二段跳／阵法／gifts／#20） |
| 现网 | **v0.6.23**（未发本刀；建议 v0.6.24 本令不授权） |
| 开态 out | **未覆盖** `qa/out_companion_modes_free_stay_open_da77e4a/` |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **PASS**（exit 0；2026-10-19 21:43 Asia/Shanghai） |
| `npm run test:companion-modes-free-stay` | **PASS**（158 assertions × shared 79＋snapshot 79）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`KeyV+free320/240+stayZero+follow96/320/320+CD1200+0.35`；**无** softOpenedCompanion＊；companions／skills SHA 不变 |
| `npm run test:companion-follow-ai` | **PASS**（86 assertions × shared 43＋snapshot 43）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`96/320/320+CD1200+0.35` |

## 5. 业务旁证（tip@da77e4a 固化）

| 项 | 值 |
|---|---|
| 门禁 | companions 表＋affinity／知交；无新 OpenFlag |
| 邀请 | `invite` → 唯一 `{mode:'follow'}`；`spawnAfterInvite` → 恰 1 苏师姐 |
| KeyV 循环 | follow→free→stay→follow（`companion_mode_cycle`） |
| free | aggro320；engage240×48；无 leash 瞬移；仅 primary；×0.35 |
| stay | 零伤停手；关系保留；≠无敌 |
| 切回 follow | followDist=96；leash=320；aggro=320；CD1200；engage w=240；budgetScale=0.35 |
| 隔离 | namespace=`companion_follow`；≠ FriendlySummons.pets；gifts 关；不调度 area／support |
| 执法开态 out | `qa/out_companion_modes_free_stay_open_da77e4a/`（C01–C03＋O01–O06 PASS；本刀**勿覆盖**） |

## 6. 交回

【同行AI42soft已交】炼器＝`reports/炼器阁/20261019_同行AI_design42_soft_open.md` tip＝`84e6b42`｜业务 tip@da77e4a｜硬门＝无softOpenedCompanion＊／newOpenFlag=false／released=false／冻结MATCH／硬读KeyV＋free320/240＋stay零伤＋切回96/320/320＋CD1200＋240＋0.35｜tsc＋modes 158＋follow-ai 86 PASS｜相对da77e4a零业务diff｜Codex旁路｜≠release≠Pages｜现网v0.6.23｜请开 soft smoke（3B）｜建议v0.6.24本令不授权发版
