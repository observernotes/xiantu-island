# design/48 · 同行 AI 苏师姐 support＝sword_shield · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-22 22:21 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261022_负责人令_同行AI_design48_soft.md`  
> 开态核记：`reports/炼器阁/20261022_负责人核_同行AI_design48_开态.md`（VERIFY_PASS＠2e0ca04d）  
> 业务 tip@`2e0ca04d`／实现 tip@`8738405b`／接线报告 `reports/炼器阁/20261022_同行AI_design48_wire.md`／开态 `reports/执法堂/20261022_同行AI_design48_开态.md`  
> 范式：对齐同行 AI design/41／42／43／44／45／46／47／万妖巢穴／跳跃 soft——**复用既有** tip 正式路径（supportLocked=false／schedule=primary_area_and_support／仅 sword_shield 主动 buff／stay 默认不放／forbidEmit 仍）；**不引入** `softOpenedCompanion＊`／`CompanionOpenFlag`／任何新 OpenFlag；证据＝本 RESULT／status  
> Codex：本刀仅 docs／status → **旁路直写**（与 design/41–47／夺宝／跳跃／巢穴 soft 同；不经 Sol）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedCompanion＊／CompanionOpenFlag**  
> 现网仍 **v0.6.29**。建议发版号 **v0.6.30**（本令**不**授权 release）。**独立于巢穴／夺宝／跳跃／阵法／gifts／#20**（禁捆）。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-support-sword-shield` |
| 业务基线 tip | `2e0ca04d365d8e7b208aa2aa3976e45cfde62b41`（短 `2e0ca04d`；交件基线／开态 tip） |
| 实现 tip | `8738405bbc7a43579e9f6256105716e63be41088`（短 `8738405b`；业务唯一改码） |
| 基线 HEAD docs | `2e0ca04d365d8e7b208aa2aa3976e45cfde62b41`（docs tip；源码同 8738405b） |
| soft-open tip | `e951b229ab1eaa44b5f7dbc79dec50c846c6dc96`（短 `e951b229`；交 tip 后钉） |
| worktree | `/workspace/xiantu/wt/feat/companion-support-sword-shield` |
| origin | 推 `origin/feat/companion-support-sword-shield`（**未**合 master） |
| 旁路 | **是**（docs／status；Codex403旁路） |

> 注：本文件经 soft tip 后以 `git rev-parse HEAD` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedCompanion＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261022_同行AI_design48_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.29；等执法 soft smoke；禁自 release；建议 v0.6.30 未授权（`game/status/炼器阁.md` 镜像同步，同四段≤30行） |

**未改**：`src/CompanionFollowAi.ts`／`src/companion-support-sword-shield.test.ts`／`scripts/companion-support-sword-shield-test.mjs`／`package.json`／其余 companion 测／脚本（相对实现@`8738405b`／交件基线 tip@`2e0ca04d` **零业务 diff**）；`data/balance/companions.json`／`skills.json`／`npcs.json`／`quests.json`；`FriendlySummons.ts`；任何 `*Companion*OpenFlag*`（**未新建**）；任何 `softOpenedCompanion＊` 源码符号（**未引入**）；六既有 OpenFlag／阵法／gifts／#20／GAME_PHASE／巢穴／夺宝／跳跃／重做 design/41–47 主体／另开未登记 support／解除 forbidEmit／把反伤绑「先放 shield」／塞进 KeyV／开 gifts。

**与万妖巢穴／跳跃／夺宝／design/41–47 soft 对齐**：本刀**不**引入 `softOpenedCompanion＊`／`CompanionOpenFlag`；**复用**既有 tip@`8738405b`／`2e0ca04d` 正式路径（supportLocked=false→schedule含support→仅sword_shield主动buff→stay不放→forbidEmit仍）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。`softOpenPreRelease:true` 仅为报告／status **口径字段**，非源码符号。

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
| 硬读 supportLocked | **false**（可调度） |
| 硬读 schedule | **`primary_area_and_support`** |
| 硬读 仅 sword_shield | companions support role **仅** `sword_shield`（主动 buff） |
| 硬读 stay | **默认不放**（modes.stay=false／切入清 pendingSupport／choose stay→null） |
| 硬读 forbidEmit | **仍 true**（主动 cast ≠ reflect；reflect 永不 emit sword_shield） |
| 硬读 表基值 | mpCost**30**／CD**30000**／duration**60000**／damageReduce**0.05**／damageRatio**0**；reflectRatio**0.5** 不改 |
| 硬读 预算／饿死／优先 | support **不进**预算；饿死 N＝**2**；优先门槛＝无 buff 或剩余＜**3000ms** |
| 硬读 倒地 | 倒地清 `activeSupportBuff`；复起须重 CD |
| 硬读 41–47 | **未漂**：96／320／320＋CD1200＋engage240×48＋budget0.35／KeyV／free320／stay 零伤≠无敌／dismiss≠KeyV／areaCD4000／w160·h80·behind32／N＝2／reflectRatio0.5／forbidEmit／reviveMs30000／sources100/100/100／gifts关 |
| 硬读 gifts | `senior_sister_su.affinity.gifts.enabled=false` |
| 相对实现@`8738405b` 业务 diff | **零**（src／data／scripts／package.json；`git diff 8738405b -- …`＝0 bytes；相对 tip@2e0ca04d 亦零） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master；tip ⊄ origin/master |
| GAME_PHASE | **5**（不抬） |
| 现网 | **v0.6.29**（未发本刀；建议 v0.6.30 本令不授权） |
| 开态 out | **未覆盖** `qa/out_companion_support_sword_shield_open_2e0ca04d/` |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **PASS**（exit 0；2026-10-22 22:20 Asia/Shanghai） |
| `npm run test:companion-support-sword-shield` | **PASS**（299 assertions）；`hard=primary_area_and_support+sword_shield+N2+MP30+CD30000+buff60000+damageReduce0.05+forbidEmit+41-47unchanged`；`newOpenFlag:false`／`soft:false`／`release:false`；**无** softOpenedCompanion＊；companions／skills SHA 不变 |
| `npm run test:companion-follow-ai` | **PASS**（86 assertions × shared 43＋snapshot 43）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`96/320/320+CD1200+0.35` |
| `npm run test:companion-modes-free-stay` | **PASS**（162 assertions × shared 81＋snapshot 81）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`KeyV+free320/240+stayZero+follow96/320/320+CD1200+0.35` |
| `npm run test:companion-dismiss` | **PASS**（106 assertions × shared 53＋snapshot 53）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`dismiss≠KeyV+stay≠dismiss+reinviteFollow+SHA` |
| `npm run test:companion-area-whirl` | **PASS**（192 assertions × shared 96＋snapshot 96）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`areaCD4000+N2+range160x80xbehind32+budget0.35+schedule_primary_area_and_support` |
| `npm run test:companion-reflect-hook` | **PASS**（174 assertions × shared 87＋snapshot 87）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`reflectRatio0.5+budget0.35+forbidEmit+stayNoReflect+41-44unchanged` |
| `npm run test:companion-down-revive` | **PASS**（768 assertions × shared 384＋snapshot 384）；`newOpenFlag:false`／`soft:false`／`release:false`；hard=`reviveMs30000+sceneLocal+fatalHitReflectFalse+maxHp+iFrames1000+原地+41-45unchanged` |
| `npm run test:companion-affinity-sources` | **PASS**（262 assertions）；`affinity:300`／`tier:confidant`／`sources:3`／`giftsEnabled:false`／`newOpenFlag:false`／`soft:false`／`release:false` |

## 5. 业务旁证（实现@8738405b 固化 · 硬读未漂）

| 项 | 值 |
|---|---|
| supportLocked | **false**（可主动选 support） |
| schedule | **`primary_area_and_support`**（primary＋area＋support） |
| 仅 sword_shield | 唯一 support role＝主动 buff；表 30／30000／60000／0.05／damageRatio0 |
| stay | **不放**；切入／updateStay／clearAiFlags 立即取消 pendingSupport；零伤≠无敌 |
| forbidEmitSwordShield | **仍 true**；主动 cast ≠ reflect；reflect id＝`companion_reflect`／`emitSwordShield:false` |
| 优先／饿死 | 无 buff 或剩余＜**3000ms** 优先 support；饿死 N＝**2**；同拍至多 1 |
| 预算 | support **不进**；primary／area／reflect 仍 ×0.35 各一次 |
| 倒地／复起 | 倒地清 `activeSupportBuff`；复起须重新 CD；reviveMs**30000**／满血／iFrames**1000**／原地 **不改** |
| reflectRatio | **0.5**（sword_shield；不改） |
| gifts | enabled=false；support 不读写 gifts |
| 41 钉 | followDist**96**／leash**320**／aggro**320**／primary CD**1200**／engage**240×48**／budget**0.35** |
| 42 钉 | KeyV＝`companion_mode_cycle`；free aggro**320**；stay 零伤≠无敌 |
| 43 钉 | dismiss≠KeyV（对话／面板；cycleMode 永不解散） |
| 44 钉 | areaCD**4000**／w**160**·h**80**·behind**32**／N＝**2**／schedule＝primary_area_and_support |
| 45 钉 | reflectRatio**0.5**／budget**0.35**／forbidEmit／stay不放 |
| 46 钉 | reviveMs**30000**／maxHp／iFrames**1000**／原地／fatalHitReflect=false／sceneLocal |
| 47 钉 | sources 恰 3×100／gifts关／invite 不查礼 |
| 隔离 | gifts.enabled=false；GAME_PHASE=5；≠ FriendlySummons.pets；≠#20／三技能整包／面板三选一 |
| 执法开态 out | `qa/out_companion_support_sword_shield_open_2e0ca04d/`（C01–C05＋O01–O07 PASS；本刀**勿覆盖**） |

## 6. 交回

【同行AI48soft 3A已交】soft tip＝`e951b229ab1eaa44b5f7dbc79dec50c846c6dc96`｜业务 tip＝2e0ca04d／实现＝8738405b｜报告＝reports/炼器阁/20261022_同行AI_design48_soft_open.md｜无 softOpenedCompanion＊｜newOpenFlag=false｜released=false｜冻结 MATCH｜tsc＋测 PASS｜已 push｜≠release≠Pages｜现网 v0.6.29｜建议 v0.6.30 未授权｜开 soft smoke｜等执法 3B
