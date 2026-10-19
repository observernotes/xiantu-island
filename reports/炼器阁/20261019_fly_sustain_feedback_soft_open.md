# design/37 · 持续飞行进入／结束反馈 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 15:20 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验打磨_持续飞行进入结束反馈_soft-open.md`  
> 核记：`reports/炼器阁/20261019_负责人核_fly_sustain_feedback_O.md`（VERIFY_PASS）  
> 接线 tip@`31bd9bd`／接线报告 `reports/炼器阁/20261019_fly_sustain_feedback_wire.md`  
> 范式：对齐青钢 soft——**复用既有持续飞行正式路径**；**不引入** `softOpenedFlyFeedback＊`；证据＝HANDOFF／RESULT／status  
> Codex：sol **403／routing** → **旁路直写**（本刀仅 docs／status／RESULT；与青钢 soft 同）  
> **本刀 = soft-open 交件 only；≠ release ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master ≠ 引入 softOpenedFlyFeedback＊**  
> 现网仍 **v0.6.18**。禁捆 sash/shoe。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/fly-sustain-feedback-wire` |
| 业务基线 tip | `31bd9bd61351676e2dc82b57a44f744ebb6c923f`（短 `31bd9bd`；接线） |
| 基线 HEAD docs | `c3b6b575609d6ec2cc66b2f8416a8d971e8f5bfe`（接线 RESULT） |
| soft-open tip | （短 ） |
| worktree | `/workspace/xiantu/wt/feat/fly-sustain-feedback-wire` |
| origin | 推 `origin/feat/fly-sustain-feedback-wire`（不合 master） |

> 注：本文件经 docs tip 后以 `git rev-parse origin/feat/fly-sustain-feedback-wire` 与 status 为准。

## 2. 改动面（仅交件／status · **无** softOpenedFlyFeedback＊）

| 路径 | 说明 |
|---|---|
| `reports/炼器阁/20261019_fly_sustain_feedback_soft_open.md` | 本报告（soft-open 可发版前态证据） |
| `status/炼器阁.md` | soft-open 可发版前态；现网仍 v0.6.18 |

**未改**：`src/scenes/GameScene.ts`（相对 `31bd9bd` 零 diff）；`data/balance/fly_zones.json`／`strings_zh.json`；`scripts/*`；`src/fly-sustain-feedback.test.ts`；冲刺／六 OpenFlag／灵纹／坊市／青钢面；任何 `*FlyFeedback*OpenFlag*`（**未新建**）；任何 `softOpenedFlyFeedback＊` 源码符号（**未引入**）。

**与持续飞行 soft／青钢 soft 对齐**：本刀**不**引入 `softOpenedFlyFeedback＊`；**复用**既有持续飞行正式路径（`fly_zones`／`sword_ride`／tip@`31bd9bd` 三键接线）。证据＝RESULT／status 口径同步；**≠** 新 Flag 文件／ENV 对抗门禁／二次配表后门。既有证据位 `softOpenedSustainFlight` **保持**（非本刀新增）。

## 3. 硬门

| 项 | 结果 |
|---|---|
| soft-open 可发版前态 | **true**（本 RESULT／status） |
| softOpenedFlyFeedback＊ | **未引入**（源码／测／报告均无该符号） |
| released | **false** |
| newOpenFlag | **false** |
| FlyFeedbackOpenFlag／*FlyFeedback*OpenFlag* | **未建** |
| fly_zones SHA | **`2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` MATCH** |
| 三键在包／tip@`31bd9bd` 旁证 | `fly.sustain_enter`／`land`／`timeout` ⊂ tip@`31bd9bd`（strings＋GameScene） |
| ≠release≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:v06b-closed` | **PASS**；fly feedback **34**；fly zones 115；sword 56；日志 `softOpenedSustainFlight:true`／`newOpenFlag:false`／`released:false`（既有位保持；**无** softOpenedFlyFeedback＊） |
| `npm run test:v06b-open` | **PASS**；formal 355／sword 56；同上证据位 |

## 5. 交回

【fly反馈soft已交】炼器＝`reports/炼器阁/20261019_fly_sustain_feedback_soft_open.md`／soft tip＝｜自测＝tsc＋v06b-closed/open PASS｜newOpenFlag=false｜released=false｜无 softOpenedFlyFeedback＊｜fly_zones MATCH｜≠release≠Pages｜现网v0.6.18｜等执法 soft smoke（3B）
