# design/46 · 同行 AI 零血复起 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-22 19:58 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261022_负责人令_同行AI_design46_soft-open.md`  
> 开态核记：`reports/炼器阁/20261022_负责人核_同行AI_design46_开态.md`（VERIFY_PASS＠3a703e72）  
> 业务 tip@`3a703e72`／实现 tip@`0cdb7708`／接线报告 `reports/炼器阁/20261022_同行AI_design46_wire.md`  
> 范式：对齐同行 AI design/41／42／43／44／45／万妖巢穴／跳跃 soft——**复用既有** tip 正式路径（hp→0→down→reviveMs→revive）；**不引入** `softOpenedCompanion＊`／`CompanionOpenFlag`／任何新 OpenFlag；证据＝本 RESULT／status  
> Codex：本刀仅 docs／status → **旁路直写**（与 design/41／42／43／44／45／夺宝／跳跃／巢穴 soft 同；不经 Sol）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedCompanion＊／CompanionOpenFlag**  
> 现网仍 **v0.6.27**。建议发版号 **v0.6.28**（本令**不**授权 release）。**独立于巢穴／夺宝／跳跃／阵法／gifts／#20**（禁捆）。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-down-revive` |
| 业务基线 tip | `3a703e7204cbb076b1efef41e2a2c195c2fd6d1b`（短 `3a703e72`；交件基线） |
| 实现 tip | `0cdb77084b9878927818435eb5c729a0196b43e6`（短 `0cdb7708`；业务唯一改码） |
| 基线 HEAD docs | `f28dc69759a7e8cf9445d663176067aa87ecb423`（docs tip；源码同 0cdb7708） |
| soft-open tip | `1d953e2987aa050923bba7e9046a564b2546e0bd`（短 `1d953e29`；交 tip 后钉） |
| worktree | `/workspace/xiantu/wt/feat/companion-down-revive` |
| origin | 推 `origin/feat/companion-down-revive`（**未**合 master） |
| 旁路 | **是**（docs／status；Codex403旁路） |

> 注：本文件经 soft tip 后以 `git rev-parse HEAD` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedCompanion＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261022_同行AI_design46_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.27；等执法 soft smoke；禁自 release |

**未改**：`src/CompanionFollowAi.ts`／`src/companion-down-revive.test.ts`／`src/companion-reflect-hook.test.ts`／`src/companion-follow-ai.test.ts`／`src/companion-modes-free-stay.test.ts`／`src/companion-dismiss.test.ts`／`src/companion-area-whirl.test.ts`／`scripts/companion-down-revive-test.mjs`／`scripts/companion-reflect-hook-test.mjs`／`scripts/companion-follow-ai-test.mjs`／`scripts/companion-modes-free-stay-test.mjs`／`scripts/companion-dismiss-test.mjs`／`scripts/companion-area-whirl-test.mjs`／`package.json`／`data/balance/strings_zh.json`（相对实现@`0cdb7708`／交件基线 tip@`3a703e72` **零业务 diff**）；`data/balance/companions.json`／`skills.json`；`FriendlySummons.ts`；任何 `*Companion*OpenFlag*`（**未新建**）；任何 `softOpenedCompanion＊` 源码符号（**未引入**）；六既有 OpenFlag／阵法／gifts／#20／GAME_PHASE／巢穴／夺宝／跳跃／重做 design/41／42／43／44／45 主体／接 support／把复起绑成 emit support／塞进 KeyV。

**与万妖巢穴／跳跃／夺宝／design/41／42／43／44／45 soft 对齐**：本刀**不**引入 `softOpenedCompanion＊`／`CompanionOpenFlag`；**复用**既有 tip@`0cdb7708`／`3a703e72` 正式路径（hp→0→down→reviveMs→revive；sceneLocal；fatalHitReflect=false）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。`softOpenPreRelease:true` 仅为报告／status **口径字段**，非源码符号。

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
| 硬读 reviveMs | **30000**；读表 `companions.reviveMs`（不改表） |
| 硬读 回血／无敌／落点 | **maxHp**／**1000ms**／**原地**（downedPosition） |
| 硬读 可见 | 「**苏师姐力竭**」＋「**复起**」 |
| 硬读 fatalHitReflect | **false**；致命同拍不入 pendingReflect |
| 硬读 timerScope | **sceneLocal**；切图／shutdown 清 reviveAt／downedPosition |
| 硬读 stay | 可倒地复起；复起后 stay 仍零伤含不放反伤 ≠ 无敌 |
| 硬读 停战 | 倒地停 primary·area·反伤＋cancel pending |
| 硬读 41–45 | **未漂**：96／320／320＋CD1200＋engage240×48＋budget0.35／free320／stay 零伤≠无敌／areaCD4000／w160·h80·behind32／N＝2／reflectRatio0.5／forbidEmit／stay不放／dismiss≠KeyV／schedule=primary_and_area／supportLocked |
| 相对实现@`0cdb7708` 业务 diff | **零**（src／data／scripts／package.json；`git diff 0cdb7708 -- …`＝0 bytes） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master；tip ⊄ origin/master |
| GAME_PHASE | **5**（不抬） |
| gifts | `senior_sister_su.affinity.gifts.enabled=false`（关） |
| 独立于巢穴／夺宝／跳跃／阵法 | **PASS**（未碰 SecretNest／loot.seize／feel／Player 二段跳／阵法／gifts／#20） |
| 现网 | **v0.6.27**（未发本刀；建议 v0.6.28 本令不授权） |
| 开态 out | **未覆盖** `qa/out_companion_down_revive_open_3a703e72/` |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **PASS**（exit 0；2026-10-22 19:56 Asia/Shanghai） |
| `npm run test:companion-down-revive` | **PASS**（768 assertions × shared 384＋snapshot 384）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`reviveMs30000+sceneLocal+fatalHitReflectFalse+maxHp+iFrames1000+原地+41-45unchanged`；**无** softOpenedCompanion＊；companions／skills SHA 不变 |
| `npm run test:companion-reflect-hook` | **PASS**（172 assertions × shared 86＋snapshot 86）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`reflectRatio0.5+budget0.35+forbidEmit+stayNoReflect+41-44unchanged` |
| `npm run test:companion-follow-ai` | **PASS**（86 assertions × shared 43＋snapshot 43）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`96/320/320+CD1200+0.35` |
| `npm run test:companion-modes-free-stay` | **PASS**（158 assertions × shared 79＋snapshot 79）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`KeyV+free320/240+stayZero+follow96/320/320+CD1200+0.35` |
| `npm run test:companion-dismiss` | **PASS**（106 assertions × shared 53＋snapshot 53）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`dismiss≠KeyV+stay≠dismiss+reinviteFollow+SHA` |
| `npm run test:companion-area-whirl` | **PASS**（190 assertions × shared 95＋snapshot 95）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`areaCD4000+N2+range160x80xbehind32+budget0.35+schedule_primary_and_area` |

## 5. 业务旁证（实现@0cdb7708 固化 · 硬读未漂）

| 项 | 值 |
|---|---|
| down | hp→0 → enterDowned；停 primary／area／反伤；cancel pendingStrike／pendingReflect；angle=90；log「苏师姐力竭」 |
| revive | time≥reviveAt（表读 reviveMs=30000）→ hp=maxHp／hurtReadyAt=+1000／body.reset(downedPosition)／log「复起」／mode·关系保留 |
| fatalHitReflect | false；致命同拍不放反伤 |
| timerScope | sceneLocal；clearEntity 清 reviveAt／downedPosition；无跨场景幽灵 |
| stay | 可倒地＋复起；复起后 stay 零伤含不放反伤；invulnerable=false |
| schedule | `primary_and_area`；`supportLocked=true` **不改** |
| 41 钉 | followDist**96**／leash**320**／aggro**320**／primary CD**1200**／engage**240×48**／budget**0.35** |
| 42 钉 | KeyV＝`companion_mode_cycle`；free aggro**320**；stay 零伤≠无敌 |
| 43 钉 | dismiss≠KeyV（对话／面板；cycleMode 永不解散） |
| 44 钉 | areaCD**4000**／w**160**·h**80**·behind**32**／N＝**2**／schedule＝primary_and_area |
| 45 钉 | reflectRatio**0.5**／budget**0.35**／forbidEmit／stay不放 |
| 隔离 | gifts.enabled=false；GAME_PHASE=5；≠ FriendlySummons.pets |
| 执法开态 out | `qa/out_companion_down_revive_open_3a703e72/`（C01–C03＋O01–O07 PASS；本刀**勿覆盖**） |

## 6. 交回

【同行AI46soft 3A已交】soft tip＝`1d953e2987aa050923bba7e9046a564b2546e0bd`｜业务 tip＝3a703e72／实现＝0cdb7708｜报告＝reports/炼器阁/20261022_同行AI_design46_soft_open.md｜无 softOpenedCompanion＊｜newOpenFlag=false｜released=false｜冻结 MATCH｜tsc＋测 PASS｜已 push｜≠release≠Pages｜现网 v0.6.27｜开 soft smoke｜等执法 3B
