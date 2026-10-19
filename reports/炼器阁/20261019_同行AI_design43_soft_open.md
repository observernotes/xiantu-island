# design/43 · 同行 AI 解散入口 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 22:37 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_同行AI_design43_soft-open.md`  
> 核记：`reports/炼器阁/20261019_负责人核_同行AI_design43_开态.md`（VERIFY_PASS＠dcf78c8）  
> 业务 tip@`dcf78c8`／接线 tip@`dcf78c8`／接线报告 `reports/炼器阁/20261019_同行AI_design43_wire.md`  
> 范式：对齐同行 AI design/41／42／万妖巢穴／跳跃 soft——**复用既有** tip 正式路径（对话／面板解散＋再邀）；**不引入** `softOpenedCompanion＊`／`CompanionOpenFlag`／任何新 OpenFlag；证据＝HANDOFF／RESULT／status  
> Codex：本刀仅 docs／status → **旁路直写**（与 design/41／42／夺宝／跳跃／巢穴 soft 同；不经 Sol）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedCompanion＊／CompanionOpenFlag**  
> 现网仍 **v0.6.24**。建议发版号 **v0.6.25**（本令**不**授权 release）。**独立于巢穴／夺宝／跳跃／阵法／gifts／#20**（禁捆）。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-dismiss` |
| 业务基线 tip | `dcf78c8099244bd718b0496e45ae25925a469597`（短 `dcf78c8`；接线） |
| 基线 HEAD docs | `f063e2b8eb1b902eb24c6437160649011734849c`（接线 tip 钉业务 tip dcf78c8） |
| soft-open tip | `SOFT_TIP_PLACEHOLDER`（短 `SOFT7`；交 tip 后钉） |
| worktree | `/workspace/xiantu/wt/feat/companion-dismiss` |
| origin | 推 `origin/feat/companion-dismiss`（**未**合 master） |
| 旁路 | **是**（docs／status；Codex403旁路） |

> 注：本文件经 soft tip 后以 `git rev-parse HEAD` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedCompanion＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261019_同行AI_design43_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.24；等执法 soft smoke；禁自 release |

**未改**：`src/Companions.ts`／`src/CompanionFollowAi.ts`／`src/scenes/GameScene.ts`／`src/companion-dismiss.test.ts`／`src/companion-modes-free-stay.test.ts`／`src/companion-follow-ai.test.ts`／`scripts/companion-dismiss-test.mjs`／`scripts/companion-modes-free-stay-test.mjs`／`scripts/companion-follow-ai-test.mjs`／`package.json`／`data/balance/strings_zh.json`（相对 tip@`dcf78c8` **零业务 diff**）；`data/balance/companions.json`／`skills.json`；`FriendlySummons.ts`；任何 `*Companion*OpenFlag*`（**未新建**）；任何 `softOpenedCompanion＊` 源码符号（**未引入**）；六既有 OpenFlag／阵法／gifts／#20／GAME_PHASE／巢穴／夺宝／跳跃／重做 design/41／42 主体／把解散塞进 KeyV／cycle。

**与万妖巢穴／跳跃／夺宝／design/41／42 soft 对齐**：本刀**不**引入 `softOpenedCompanion＊`／`CompanionOpenFlag`；**复用**既有 tip@`dcf78c8` 正式路径（对话／面板 `requestCompanionDismiss`／`dismissCompanionRelation`＋再邀 invite→follow）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。`softOpenPreRelease:true` 仅为报告／status **口径字段**，非源码符号。

## 3. 硬门

| 项 | 结果 |
|---|---|
| soft-open 可发版前态 | **true**（本 RESULT／status） |
| softOpenPreRelease（口径） | **true** |
| softOpenedCompanion＊ | **未引入**（生产 src／scripts／package.json **命中 0**；仅 `companion-dismiss.test.ts`／`companion-modes-free-stay.test.ts` 负向断言字符串） |
| CompanionOpenFlag／*Companion*OpenFlag* | **未建**（`rg CompanionOpenFlag` 仅 test 负向断言＠dismiss／modes／follow-ai；非门闩源码符号；既有六 OpenFlag 未碰） |
| released | **false** |
| newOpenFlag | **false** |
| companions SHA | **`e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` MATCH** |
| skills SHA | **`d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` MATCH** |
| 硬读解散入口 | **对话／面板单入口（≠KeyV）** → `requestCompanionDismiss`／`dismissCompanionRelation` → 毁实体＋删 `companionRelations[苏]` 整键 |
| 硬读再邀 | **既有 invite→follow 恰 1**；`dismissEntity` 不设 destroyed |
| 硬读 stay≠解散 | **stay.keepRelation=true**／零伤≠无敌；仅解散清整键 |
| 硬读切图 | **SHUTDOWN destroy()** 毁实例保关系＋mode |
| 硬读 KeyV 三态 | **96／320／320＋CD1200＋240＋0.35／free320／stay零伤≠无敌 未漂** |
| 相对 tip@`dcf78c8` 业务 diff | **零**（src／data／scripts／package.json；`git diff dcf78c8 -- …`＝0 bytes） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master；tip ⊄ origin/master |
| 独立于巢穴／夺宝／跳跃／阵法 | **PASS**（未碰 SecretNest／loot.seize／feel／Player 二段跳／阵法／gifts／#20） |
| 现网 | **v0.6.24**（未发本刀；建议 v0.6.25 本令不授权） |
| 开态 out | **未覆盖** `qa/out_companion_dismiss_open_dcf78c8/` |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **PASS**（exit 0；2026-10-19 22:36 Asia/Shanghai） |
| `npm run test:companion-dismiss` | **PASS**（106 assertions × shared 53＋snapshot 53）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`dismiss≠KeyV+stay≠dismiss+reinviteFollow+SHA`；**无** softOpenedCompanion＊；companions／skills SHA 不变 |
| `npm run test:companion-modes-free-stay` | **PASS**（158 assertions × shared 79＋snapshot 79）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`KeyV+free320/240+stayZero+follow96/320/320+CD1200+0.35` |
| `npm run test:companion-follow-ai` | **PASS**（86 assertions × shared 43＋snapshot 43）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`96/320/320+CD1200+0.35` |

## 5. 业务旁证（tip@dcf78c8 固化 · 硬读未漂）

| 项 | 值 |
|---|---|
| 入口 | 对话／面板单入口（`talkTo`＋`companion.dismiss.label`）；≠KeyV／≠`companion_mode_cycle` |
| 解散 | `requestCompanionDismiss`→`dismissCompanionRelation` 删 `companionRelations[苏]` 整键→`dismissEntity`＝`clearEntity` |
| 再邀 | 既有 invite→`spawnAfterInvite`；初始 follow；恰 1；不双实例 |
| stay≠解散 | `keepRelation=true`／`zeroDamage=true`／`invulnerable=false`；仅解散清＋毁 |
| 切图 | SHUTDOWN＝`destroy()` 毁实例保关系＋mode |
| KeyV 三态 | follow 96／320／320＋CD1200＋engage240＋×0.35；free aggro320／engage240；stay 零伤≠无敌 |
| 隔离 | namespace=`companion_follow`；≠ FriendlySummons.pets；gifts 关 |
| 执法开态 out | `qa/out_companion_dismiss_open_dcf78c8/`（C01–C03＋O01–O06 PASS；本刀**勿覆盖**） |

## 6. 交回

【同行AI43soft已交】炼器＝`reports/炼器阁/20261019_同行AI_design43_soft_open.md` tip＝`SOFT7`｜业务 tip@dcf78c8｜硬门＝无softOpenedCompanion＊／newOpenFlag=false／released=false／冻结MATCH／硬读对话面板≠KeyV＋dismiss整键清＋stay≠解散＋切图保关系＋再邀follow＋KeyV三态未漂｜tsc＋dismiss 106＋modes 158＋follow-ai 86 PASS｜相对dcf78c8零业务diff｜Codex旁路｜≠release≠Pages｜现网v0.6.24｜请开 soft smoke（3B）｜建议v0.6.25本令不授权发版
