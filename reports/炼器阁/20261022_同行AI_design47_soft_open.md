# design/47 · 同行 AI 苏师姐好感来源 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-22 21:14 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261022_负责人令_同行AI_design47_soft.md`  
> 开态核记：`reports/炼器阁/20261022_负责人核_同行AI_design47_开态.md`（VERIFY_PASS＠22881f72）  
> 业务 tip@`22881f72`／实现 tip@`a09fc8fc`／接线报告 `reports/炼器阁/20261022_同行AI_design47_wire.md`／开态 `reports/执法堂/20261022_同行AI_design47_开态.md`  
> 范式：对齐同行 AI design/41／42／43／44／45／46／万妖巢穴／跳跃 soft——**复用既有** tip 正式路径（三引导 done→sources once→affinity delta→档位 confidant→invite）；**不引入** `softOpenedCompanion＊`／`CompanionOpenFlag`／任何新 OpenFlag；证据＝本 RESULT／status  
> Codex：本刀仅 docs／status → **旁路直写**（与 design/41／42／43／44／45／46／夺宝／跳跃／巢穴 soft 同；不经 Sol）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedCompanion＊／CompanionOpenFlag**  
> 现网仍 **v0.6.28**。建议发版号 **v0.6.29**（本令**不**授权 release）。**独立于巢穴／夺宝／跳跃／阵法／gifts／#20**（禁捆）。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-affinity-sources` |
| 业务基线 tip | `22881f72f766d4b96f9016dc4e1a521fb71e3d21`（短 `22881f72`；交件基线／开态 tip） |
| 实现 tip | `a09fc8fc9b0b340ccb8caebc783a57d7a3027376`（短 `a09fc8fc`；业务唯一改码） |
| 基线 HEAD docs | `22881f72f766d4b96f9016dc4e1a521fb71e3d21`（docs tip；源码同 a09fc8fc） |
| soft-open tip | `SOFT_TIP_PLACEHOLDER`（短 `SOFT_TIP_SHORT`；交 tip 后钉） |
| worktree | `/workspace/xiantu/wt/feat/companion-affinity-sources` |
| origin | 推 `origin/feat/companion-affinity-sources`（**未**合 master） |
| 旁路 | **是**（docs／status；Codex403旁路） |

> 注：本文件经 soft tip 后以 `git rev-parse HEAD` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedCompanion＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261022_同行AI_design47_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.28；等执法 soft smoke；禁自 release；建议 v0.6.29 未授权 |

**未改**：`data/balance/npcs.json`／`data/balance/quests.json`／`data/balance/strings_zh.json`／`scripts/companion-affinity-sources-test.mjs`／`package.json`／`src/affinity.test.ts`／`src/v05.test.ts`／`src/v06c-open.test.ts`／`src/CompanionFollowAi.ts`／其余 companion 测／脚本（相对实现@`a09fc8fc`／交件基线 tip@`22881f72` **零业务 diff**）；`data/balance/companions.json`／`skills.json`；`FriendlySummons.ts`；任何 `*Companion*OpenFlag*`（**未新建**）；任何 `softOpenedCompanion＊` 源码符号（**未引入**）；六既有 OpenFlag／阵法／gifts／#20／GAME_PHASE／巢穴／夺宝／跳跃／重做 design/41／42／43／44／45／46 主体／接 support／把好感来源绑成 emit support／塞进 KeyV／开 gifts／挂 `q_main_02`／`q_elder_exam`／第四 sources／kill／encounter 刷好感。

**与万妖巢穴／跳跃／夺宝／design/41／42／43／44／45／46 soft 对齐**：本刀**不**引入 `softOpenedCompanion＊`／`CompanionOpenFlag`；**复用**既有 tip@`a09fc8fc`／`22881f72` 正式路径（三引导 done→sources once→delta→confidant→invite；gifts 关；邀请不查礼）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。`softOpenPreRelease:true` 仅为报告／status **口径字段**，非源码符号。

## 3. 硬门

| 项 | 结果 |
|---|---|
| soft-open 可发版前态 | **true**（本 RESULT／status） |
| softOpenPreRelease（口径） | **true** |
| softOpenedCompanion＊ | **未引入**（生产 src／scripts／package.json／data **命中 0**；仅 test 负向断言字符串） |
| CompanionOpenFlag／*Companion*OpenFlag* | **未建**（`rg CompanionOpenFlag` 仅 test 负向断言；非门闩源码符号；既有六 OpenFlag 未碰） |
| released | **false** |
| newOpenFlag | **false** |
| companions SHA | **`e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` MATCH** |
| skills SHA | **`d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` MATCH** |
| 硬读三引导 | `q_su_fellow_meet`／`q_su_fellow_tour`／`q_su_fellow_confide` |
| 硬读 sources | 恰 **3** 行 `type:quest`／`on:done`／`once:true`／delta＝**100／100／100** 合计 **300** |
| 硬读 gifts | `senior_sister_su.affinity.gifts.enabled=false`（likedItems 仍空） |
| 硬读 禁挂 | 未挂 `q_main_02`／`q_elder_exam`；无第四 sources；无 kill／encounter 刷好感 |
| 硬读 invite | 只看档位（confidant.min=300）不查礼／不读 claimedAffinityRewards |
| 硬读 41–46 | **未漂**：96／320／320＋CD1200＋engage240×48＋budget0.35／free320／stay 零伤≠无敌／areaCD4000／w160·h80·behind32／N＝2／dismiss≠KeyV／reflectRatio0.5／forbidEmit／stay不放／reviveMs30000／maxHp／1000ms／原地／supportLocked／schedule＝primary_and_area |
| 相对实现@`a09fc8fc` 业务 diff | **零**（src／data／scripts／package.json；`git diff a09fc8fc -- …`＝0 bytes；相对 tip@22881f72 亦零） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master；tip ⊄ origin/master |
| GAME_PHASE | **5**（不抬） |
| 现网 | **v0.6.28**（未发本刀；建议 v0.6.29 本令不授权） |
| 开态 out | **未覆盖** `qa/out_companion_affinity_sources_open_22881f72/` |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **PASS**（exit 0；2026-10-22 21:14 Asia/Shanghai） |
| `npm run test:companion-affinity-sources` | **PASS**（262 assertions）；`affinity:300`／`tier:confidant`／`sources:3`／`giftsEnabled:false`／`newOpenFlag:false`／`soft:false`／`release:false`；**无** softOpenedCompanion＊；companions／skills SHA 不变 |
| `npm run test:companion-follow-ai` | **PASS**（86 assertions × shared 43＋snapshot 43）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`96/320/320+CD1200+0.35` |
| `npm run test:companion-modes-free-stay` | **PASS**（158 assertions × shared 79＋snapshot 79）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`KeyV+free320/240+stayZero+follow96/320/320+CD1200+0.35` |
| `npm run test:companion-dismiss` | **PASS**（106 assertions × shared 53＋snapshot 53）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`dismiss≠KeyV+stay≠dismiss+reinviteFollow+SHA` |
| `npm run test:companion-area-whirl` | **PASS**（190 assertions × shared 95＋snapshot 95）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`areaCD4000+N2+range160x80xbehind32+budget0.35+schedule_primary_and_area` |
| `npm run test:companion-reflect-hook` | **PASS**（172 assertions × shared 86＋snapshot 86）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`reflectRatio0.5+budget0.35+forbidEmit+stayNoReflect+41-44unchanged` |
| `npm run test:companion-down-revive` | **PASS**（768 assertions × shared 384＋snapshot 384）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`reviveMs30000+sceneLocal+fatalHitReflectFalse+maxHp+iFrames1000+原地+41-45unchanged` |

## 5. 业务旁证（实现@a09fc8fc 固化 · 硬读未漂）

| 项 | 值 |
|---|---|
| 三引导 | meet／tour／confide；链 meet→tour→confide；苏接／交；talk→苏；`reqLevel=null`／`rewards={}`／`phase=5` |
| sources | 恰 3：`quest`／`done`／`once`；delta **100／100／100**；合计 **300** |
| 档位轨迹 | 0→100(acquaintance)→200(acquaintance)→300(confidant) |
| invite | 达 confidant → `ok`；可邀出 follow 实体；**不查** confidant_gift／inventory |
| gifts | enabled=false；来源接线不领礼 |
| forbidHang | 未挂 `q_main_02`／`q_elder_exam`；无第四行；无 kill／encounter 刷好感 |
| schedule | `primary_and_area`；`supportLocked=true` **不改** |
| reviveMs | **30000**（表顶；不改） |
| reflectRatio | **0.5**（sword_shield；不改） |
| 41 钉 | followDist**96**／leash**320**／aggro**320**／primary CD**1200**／engage**240×48**／budget**0.35** |
| 42 钉 | KeyV＝`companion_mode_cycle`；free aggro**320**；stay 零伤≠无敌 |
| 43 钉 | dismiss≠KeyV（对话／面板；cycleMode 永不解散） |
| 44 钉 | areaCD**4000**／w**160**·h**80**·behind**32**／N＝**2**／schedule＝primary_and_area |
| 45 钉 | reflectRatio**0.5**／budget**0.35**／forbidEmit／stay不放 |
| 46 钉 | reviveMs**30000**／maxHp／iFrames**1000**／原地／fatalHitReflect=false／sceneLocal |
| 隔离 | gifts.enabled=false；GAME_PHASE=5；≠ FriendlySummons.pets；≠#20／三技能整包／面板三选一 |
| 执法开态 out | `qa/out_companion_affinity_sources_open_22881f72/`（C01–C05＋O01–O06 PASS；本刀**勿覆盖**） |

## 6. 交回

【同行AI47soft 3A已交】soft tip＝`SOFT_TIP_PLACEHOLDER`｜业务 tip＝22881f72／实现＝a09fc8fc｜报告＝reports/炼器阁/20261022_同行AI_design47_soft_open.md｜无 softOpenedCompanion＊｜newOpenFlag=false｜released=false｜冻结 MATCH｜tsc＋测 PASS｜已 push｜≠release≠Pages｜现网 v0.6.28｜开 soft smoke｜等执法 3B
