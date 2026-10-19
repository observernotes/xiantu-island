# design/44 · 同行 AI area 单技能（whirl_sword）· soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 23:32 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_同行AI_design44_soft-open.md`  
> 核记：`reports/炼器阁/20261019_负责人核_同行AI_design44_开态.md`（VERIFY_PASS＠b359565）  
> 业务 tip@`b359565`／接线 tip@`b359565`／接线报告 `reports/炼器阁/20261019_同行AI_design44_wire.md`  
> 范式：对齐同行 AI design/41／42／43／万妖巢穴／跳跃 soft——**复用既有** tip 正式路径（primary＋area 调度）；**不引入** `softOpenedCompanion＊`／`CompanionOpenFlag`／任何新 OpenFlag；证据＝HANDOFF／RESULT／status  
> Codex：本刀仅 docs／status → **旁路直写**（与 design/41／42／43／夺宝／跳跃／巢穴 soft 同；不经 Sol）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedCompanion＊／CompanionOpenFlag**  
> 现网仍 **v0.6.25**。建议发版号 **v0.6.26**（本令**不**授权 release）。**独立于巢穴／夺宝／跳跃／阵法／gifts／#20**（禁捆）。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-area-whirl` |
| 业务基线 tip | `b3595651c62c16b6db48ffcd9cf7ce90a95c0bae`（短 `b359565`；接线） |
| 基线 HEAD docs | `507368738171436f631d9f28157c7b7136d79416`（接线 tip 钉业务 tip b359565） |
| soft-open tip | `e6edf8d56c6337df42b0a12431df362216cad5cb`（短 `e6edf8d`；交 tip 后钉） |
| worktree | `/workspace/xiantu/wt/feat/companion-area-whirl` |
| origin | 推 `origin/feat/companion-area-whirl`（**未**合 master） |
| 旁路 | **是**（docs／status；Codex403旁路） |

> 注：本文件经 soft tip 后以 `git rev-parse HEAD` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedCompanion＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261019_同行AI_design44_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.25；等执法 soft smoke；禁自 release |

**未改**：`src/CompanionFollowAi.ts`／`src/companion-area-whirl.test.ts`／`src/companion-follow-ai.test.ts`／`src/companion-modes-free-stay.test.ts`／`src/companion-dismiss.test.ts`／`scripts/companion-area-whirl-test.mjs`／`scripts/companion-follow-ai-test.mjs`／`scripts/companion-modes-free-stay-test.mjs`／`scripts/companion-dismiss-test.mjs`／`package.json`／`data/balance/strings_zh.json`（相对 tip@`b359565` **零业务 diff**）；`data/balance/companions.json`／`skills.json`；`FriendlySummons.ts`；任何 `*Companion*OpenFlag*`（**未新建**）；任何 `softOpenedCompanion＊` 源码符号（**未引入**）；六既有 OpenFlag／阵法／gifts／#20／GAME_PHASE／巢穴／夺宝／跳跃／重做 design/41／42／43 主体／接 support／把 area 塞进 KeyV／cycle。

**与万妖巢穴／跳跃／夺宝／design/41／42／43 soft 对齐**：本刀**不**引入 `softOpenedCompanion＊`／`CompanionOpenFlag`；**复用**既有 tip@`b359565` 正式路径（`schedule=primary_and_area`＋`COMPANION_AREA_HARD`＝whirl_sword）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。`softOpenPreRelease:true` 仅为报告／status **口径字段**，非源码符号。

## 3. 硬门

| 项 | 结果 |
|---|---|
| soft-open 可发版前态 | **true**（本 RESULT／status） |
| softOpenPreRelease（口径） | **true** |
| softOpenedCompanion＊ | **未引入**（生产 src／scripts／package.json **命中 0**；仅 `companion-area-whirl.test.ts`／`companion-modes-free-stay.test.ts`／`companion-dismiss.test.ts` 负向断言字符串） |
| CompanionOpenFlag／*Companion*OpenFlag* | **未建**（`rg CompanionOpenFlag` 仅 test 负向断言＠area／modes／follow／dismiss；非门闩源码符号；既有六 OpenFlag 未碰） |
| released | **false** |
| newOpenFlag | **false** |
| companions SHA | **`e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` MATCH** |
| skills SHA | **`d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` MATCH** |
| 硬读 schedule | **primary_and_area**（support 仍锁；候选≠sword_shield） |
| 硬读 area | **仅 whirl_sword**／CD**4000**／tele·rec**250／250**／rangeAlign **w160·h80·behind32**／prefer≥**2**／starve N＝**2**／maxPending＝**1** |
| 硬读 primary | **96／320／320＋CD1200＋engage240×48＋budget0.35** 未漂 |
| 硬读 budget | **同乘一次 0.35**（`noPerSkillBudgetStack`；禁 0.35²） |
| 硬读 stay | **不放 area**（`stopArea=true`／`modes.stay=false`／零伤≠无敌／keepRelation） |
| 硬读 support | **锁**（`supportLocked=true`） |
| 硬读 41／42／43 | **未漂**（follow／KeyV 三态／dismiss≠KeyV） |
| 相对 tip@`b359565` 业务 diff | **零**（src／data／scripts／package.json；`git diff b359565 -- …`＝0 bytes） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master；tip ⊄ origin/master |
| 独立于巢穴／夺宝／跳跃／阵法 | **PASS**（未碰 SecretNest／loot.seize／feel／Player 二段跳／阵法／gifts／#20） |
| 现网 | **v0.6.25**（未发本刀；建议 v0.6.26 本令不授权） |
| 开态 out | **未覆盖** `qa/out_companion_area_open_b359565/` |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **PASS**（exit 0；2026-10-19 23:31 Asia/Shanghai） |
| `npm run test:companion-area-whirl` | **PASS**（190 assertions × shared 95＋snapshot 95）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`areaCD4000+N2+range160x80xbehind32+budget0.35+schedule_primary_and_area`；**无** softOpenedCompanion＊；companions／skills SHA 不变 |
| `npm run test:companion-follow-ai` | **PASS**（86 assertions × shared 43＋snapshot 43）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`96/320/320+CD1200+0.35` |
| `npm run test:companion-modes-free-stay` | **PASS**（158 assertions × shared 79＋snapshot 79）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`KeyV+free320/240+stayZero+follow96/320/320+CD1200+0.35` |
| `npm run test:companion-dismiss` | **PASS**（106 assertions × shared 53＋snapshot 53）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`dismiss≠KeyV+stay≠dismiss+reinviteFollow+SHA` |

## 5. 业务旁证（tip@b359565 固化 · 硬读未漂）

| 项 | 值 |
|---|---|
| schedule | `primary_and_area`；ns=`companion_follow` |
| area | 仅 `whirl_sword`；CD4000；tele／rec 250／250；rangeAlign w160·h80·behind32；prefer≥2；starve N＝2；maxPending＝1 |
| primary | followDist96／leash320／aggro320／CD1200／engage240×48／budget0.35 |
| budget | 同源一次 ×0.35（strikePrimary／strikeArea／reflect）；禁二次叠乘 |
| stay | `stopArea=true`／零伤≠无敌／keepRelation；updateStay 清 pendingStrike（含 area） |
| support | 锁；候选≠sword_shield；无三选一面板 |
| 41／42／43 | KeyV 三态／dismiss≠KeyV／再邀 follow 未漂 |
| 隔离 | gifts.enabled=false；GAME_PHASE=5；≠ FriendlySummons.pets |
| 执法开态 out | `qa/out_companion_area_open_b359565/`（C01–C03＋O01–O06 PASS；本刀**勿覆盖**） |

## 6. 交回

【同行AI44soft 3A已交】炼器＝`reports/炼器阁/20261019_同行AI_design44_soft_open.md` tip＝`e6edf8d`｜业务 tip@b359565｜硬门＝无softOpenedCompanion＊／newOpenFlag=false／released=false／冻结MATCH／硬读area＝whirl_sword＋CD4000＋w160·h80·behind32＋N＝2＋budget同乘0.35＋stay不放area＋support锁＋41·42·43未漂｜tsc＋area 190＋follow 86＋modes 158＋dismiss 106 PASS｜相对b359565零业务diff｜Codex旁路｜≠release≠Pages｜现网v0.6.25｜请经理开执法3B soft smoke｜建议v0.6.26本令不授权发版
