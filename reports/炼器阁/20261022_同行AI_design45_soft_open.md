# design/45 · 同行 AI 受击反伤 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-22 18:39 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261022_负责人令_同行AI_design45_soft-open.md`  
> 开态核记：`reports/炼器阁/20261022_负责人核_同行AI_design45_开态.md`（VERIFY_PASS＠ffc63aa）  
> 业务 tip@`ffc63aa`／接线 tip@`ffc63aa`／接线报告 `reports/炼器阁/20261020_同行AI_design45_wire.md`  
> 范式：对齐同行 AI design/41／42／43／44／万妖巢穴／跳跃 soft——**复用既有** tip 正式路径（hurt→`companionReflectDamage`）；**不引入** `softOpenedCompanion＊`／`CompanionOpenFlag`／任何新 OpenFlag；证据＝本 RESULT／status  
> Codex：本刀仅 docs／status → **旁路直写**（与 design/41／42／43／44／夺宝／跳跃／巢穴 soft 同；不经 Sol）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedCompanion＊／CompanionOpenFlag**  
> 现网仍 **v0.6.26**。建议发版号 **v0.6.27**（本令**不**授权 release）。**独立于巢穴／夺宝／跳跃／阵法／gifts／#20**（禁捆）。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-reflect-hook` |
| 业务基线 tip | `ffc63aa5617a779a264da915a877cb9267bf3797`（短 `ffc63aa`；接线） |
| 基线 HEAD docs | `8c38142005fb09f42aefde146191ddefc8590d79`（接线 tip 钉业务 tip ffc63aa） |
| soft-open tip | `c166d3ea41dd052ef2515b162085490f0ca7e4c6`（短 `c166d3e`；交 tip 后钉） |
| worktree | `/workspace/xiantu/wt/feat/companion-reflect-hook` |
| origin | 推 `origin/feat/companion-reflect-hook`（**未**合 master） |
| 旁路 | **是**（docs／status；Codex403旁路） |

> 注：本文件经 soft tip 后以 `git rev-parse HEAD` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedCompanion＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261022_同行AI_design45_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.26；等执法 soft smoke；禁自 release |

**未改**：`src/CompanionFollowAi.ts`／`src/companion-reflect-hook.test.ts`／`src/companion-follow-ai.test.ts`／`src/companion-modes-free-stay.test.ts`／`src/companion-dismiss.test.ts`／`src/companion-area-whirl.test.ts`／`scripts/companion-reflect-hook-test.mjs`／`scripts/companion-follow-ai-test.mjs`／`scripts/companion-modes-free-stay-test.mjs`／`scripts/companion-dismiss-test.mjs`／`scripts/companion-area-whirl-test.mjs`／`package.json`／`data/balance/strings_zh.json`（相对 tip@`ffc63aa` **零业务 diff**）；`data/balance/companions.json`／`skills.json`；`FriendlySummons.ts`；任何 `*Companion*OpenFlag*`（**未新建**）；任何 `softOpenedCompanion＊` 源码符号（**未引入**）；六既有 OpenFlag／阵法／gifts／#20／GAME_PHASE／巢穴／夺宝／跳跃／重做 design/41／42／43／44 主体／接 support／把反伤绑成 emit support／塞进 KeyV。

**与万妖巢穴／跳跃／夺宝／design/41／42／43／44 soft 对齐**：本刀**不**引入 `softOpenedCompanion＊`／`CompanionOpenFlag`；**复用**既有 tip@`ffc63aa` 正式路径（hurt→`companionReflectDamage`×budget**0.35**；`forbidEmitSwordShield`；ratio 读表 effects）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。`softOpenPreRelease:true` 仅为报告／status **口径字段**，非源码符号。

## 3. 硬门

| 项 | 结果 |
|---|---|
| soft-open 可发版前态 | **true**（本 RESULT／status） |
| softOpenPreRelease（口径） | **true** |
| softOpenedCompanion＊ | **未引入**（生产 src／scripts／package.json **命中 0**；仅 test 负向断言字符串） |
| CompanionOpenFlag／*Companion*OpenFlag* | **未建**（`rg CompanionOpenFlag` 仅 test 负向断言；非门闩源码符号；既有六 OpenFlag 未碰） |
| released | **false** |
| newOpenFlag | **false** |
| companions SHA | **`e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` MATCH** |
| skills SHA | **`d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` MATCH** |
| 硬读 reflectRatio | **0.5**；读表 `skills.sword_shield.effects.reflectRatio`（≠perLevel 0.05） |
| 硬读 forbidEmit | **true**；`emitSkillId:null`；不 pending／strike sword_shield |
| 硬读 helper／budget | `companionReflectDamage`×budget**0.35** **一次**；禁 0.35² |
| 硬读可见 | 掉血＋跳字（`attacker.takeHit`＋`scene.damageNumber`；event=`companion_reflect`） |
| 硬读 stay | 零伤含**不放反伤**＋cancel pendingReflect；`invulnerable=false`；keepRelation |
| 硬读 schedule | **primary_and_area**；`supportLocked=true` **不改** |
| 硬读 41–44 | **未漂**：96／320／320＋CD1200＋engage240×48＋budget0.35／free320／stay 零伤≠无敌／areaCD4000／w160·h80·behind32／N＝2／dismiss≠KeyV |
| 相对 tip@`ffc63aa` 业务 diff | **零**（src／data／scripts／package.json；`git diff ffc63aa -- …`＝0 bytes） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master；tip ⊄ origin/master |
| GAME_PHASE | **5**（不抬） |
| gifts | `senior_sister_su.affinity.gifts.enabled=false`（关） |
| 独立于巢穴／夺宝／跳跃／阵法 | **PASS**（未碰 SecretNest／loot.seize／feel／Player 二段跳／阵法／gifts／#20） |
| 现网 | **v0.6.26**（未发本刀；建议 v0.6.27 本令不授权） |
| 开态 out | **未覆盖** `qa/out_companion_reflect_open_ffc63aa/` |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **PASS**（exit 0；2026-10-22 18:38 Asia/Shanghai） |
| `npm run test:companion-reflect-hook` | **PASS**（172 assertions × shared 86＋snapshot 86）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`reflectRatio0.5+budget0.35+forbidEmit+stayNoReflect+41-44unchanged`；**无** softOpenedCompanion＊；companions／skills SHA 不变 |
| `npm run test:companion-follow-ai` | **PASS**（86 assertions × shared 43＋snapshot 43）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`96/320/320+CD1200+0.35` |
| `npm run test:companion-modes-free-stay` | **PASS**（158 assertions × shared 79＋snapshot 79）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`KeyV+free320/240+stayZero+follow96/320/320+CD1200+0.35` |
| `npm run test:companion-dismiss` | **PASS**（106 assertions × shared 53＋snapshot 53）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`dismiss≠KeyV+stay≠dismiss+reinviteFollow+SHA` |
| `npm run test:companion-area-whirl` | **PASS**（190 assertions × shared 95＋snapshot 95）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`areaCD4000+N2+range160x80xbehind32+budget0.35+schedule_primary_and_area` |

## 5. 业务旁证（tip@ffc63aa 固化 · 硬读未漂）

| 项 | 值 |
|---|---|
| reflect.semantic | `passive_on_hit`；≠ support／≠ emit sword_shield |
| reflect.ratio | **0.5**；`ratioReadPath`＝`skills.sword_shield.effects.reflectRatio`；`ratioSource`＝effects |
| companionReflectDamage | `max(1,round(in*ratio*budgetScale))`；budgetScale＝**0.35** 一次 |
| forbidEmitSwordShield | true；resolve 恒 `emitSkillId:null` |
| modes | follow／free＝true；stay＝false（stopReflect＋cancel pending） |
| 可见 | `thatAttackerOnly`；掉血＋跳字；已死／离场跳过 |
| schedule | `primary_and_area`；`supportLocked=true`；`CompanionSkillId` 仅 primary｜area |
| 41 钉 | followDist**96**／leash**320**／aggro**320**／primary CD**1200**／engage**240×48**／budget**0.35** |
| 42 钉 | KeyV＝`companion_mode_cycle`；free aggro**320**；stay 零伤≠无敌 |
| 43 钉 | dismiss≠KeyV（对话／面板；cycleMode 永不解散） |
| 44 钉 | areaCD**4000**／w**160**·h**80**·behind**32**／N＝**2**／schedule＝primary_and_area |
| 隔离 | gifts.enabled=false；GAME_PHASE=5；≠ FriendlySummons.pets |
| 执法开态 out | `qa/out_companion_reflect_open_ffc63aa/`（C01–C03＋O01–O06 PASS；本刀**勿覆盖**） |

## 6. 交回

【同行AI45soft 3A已交】soft tip＝`c166d3ea41dd052ef2515b162085490f0ca7e4c6`｜业务 tip@ffc63aa｜报告＝reports/炼器阁/20261022_同行AI_design45_soft_open.md｜无 softOpenedCompanion＊／无新OpenFlag｜released=false｜冻结MATCH｜相对ffc63aa零业务diff｜tsc＋测 PASS｜≠release≠Pages｜现网 v0.6.26｜请经理开 soft smoke
