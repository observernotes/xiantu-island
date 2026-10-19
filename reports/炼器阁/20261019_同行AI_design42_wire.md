# design/42 · 同行 AI free＋stay＋切换 · tip＋接线

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_同行AI_design42_接线.md`（门闩 **OPEN**）  
> 演武核：`reports/炼器阁/20261019_负责人核_同行AI_design42_演武定稿.md` VERIFY_PASS  
> 演武定稿：`reports/演武堂/20261019_同行AI_design42_演武定稿.md`  
> design：`design/42_v06_6b+_同行AI双态_自由与待命.md`  
> **Codex：sol ultra → HTTP 403／workspace routing discovery failed → 旁路直写**（log `logs/codex/d1f26434e2f3b404_20261019_211409_639588.log`）  
> **≠ 开态 ≠ soft-open ≠ release ≠ Pages ≠ 新 OpenFlag**  
> 现网仍 **v0.6.23**。未合 master。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-modes-free-stay` |
| 基线 | `d012f27`（origin/master／v0.6.23） |
| tip SHA | `9a280a857e15625a4285581006fbf5fb9cf08e84` |
| worktree | `/workspace/xiantu/wt/feat/companion-modes-free-stay` |
| 旁路 | **是**（Codex 403） |

## 2. 改动文件清单

| 路径 | 说明 |
|---|---|
| `src/CompanionFollowAi.ts` | 保留 `COMPANION_FOLLOW_HARD`；新增 `COMPANION_MODES_HARD`；free 自主索敌／无 leash 瞬移；stay 停手零伤≠无敌；切态清旗、共享 CD |
| `src/Companions.ts` | `cycleCompanionMode`：follow→free→stay→follow；无激活关系返回 null；邀请仍写 follow |
| `src/scenes/GameScene.ts` | KeyV → `companion_mode_cycle`；help「V 同行三态」；update 仍按 mode 驱动 |
| `src/companion-modes-free-stay.test.ts` | 硬读／循环／free 自主／stay 零伤／切回回归／gifts 关／无新 Flag |
| `scripts/companion-modes-free-stay-test.mjs` | Vite SSR runner＋companions／skills SHA 守护 |
| `package.json` | `test:companion-modes-free-stay` |
| `reports/炼器阁/20261019_同行AI_design42_wire.md` | 本 RESULT |

**未改**：`companions.json`／`skills.json`／OpenFlag／GAME_PHASE／fly_zones／gifts／#20／阵法／巢穴／夺宝／跳跃／FriendlySummons.ts。

## 3. 演武定稿落地

| 键 | 定稿 | 落地证据 |
|---|---|---|
| modes.cycle | follow→free→stay→follow | `COMPANION_MODES_HARD.cycle`＋`cycleCompanionMode` |
| modes.bind | KeyV／`companion_mode_cycle` | `GameScene` JustDown `k.v` |
| follow Dist/leash/aggro | 96／320／320 | `COMPANION_FOLLOW_HARD` 未改数 |
| primary | sword_qi_slash；CD **1200**；engage w240／h48 | 三态共用同一 primary／CD 时钟 |
| damage.budgetScale | **0.35**（切态不叠） | `companionDealtDamage` 单轨；stay 不出招 |
| free.aggro／engage | 320／240×48 | `inFreeAggroRange`／`pickCompanionFreeTarget` |
| free.leashTeleport／forcePlayerTarget | false／false | free 分支不 `shouldLeashTeleport` |
| stay | zeroDamage／stopFollow／stopChase＝true；invulnerable＝false；keepRelation＝true | `updateStay` 速度 0、清 pending；不加免伤 |
| switch | noBudgetStack；noCooldownStackOrReset；clearAiFlagsOnEnter | `cycleMode` 清旗不改 `attackReadyAt` |
| schedule | primary only | 未调度 area／support |

## 4. 闭环行为

1. **KeyV**：须已有苏师姐关系且实体在场；否则 `cycleMode` 无效。循环 follow→free→stay→follow；写 `companionRelations[companion_senior_sister_su].mode`；不重复 spawn。  
2. **free**：停强制跟随锚点；无超距瞬移归位；自主合法目标（近同伴白名单）；primary 伤害 ×0.35。  
3. **stay**：停跟随／追敌／出招；零主动伤害；关系保留；≠无敌（本层不赋免伤）。  
4. **切回 follow**：硬读完整回归 96／320／320＋CD1200＋240＋0.35；切入清 free／stay 旗。  
5. **切图／读档**：SHUTDOWN 销毁实例；新场景 `projectFromRelation` 按存档 mode 重生恰 1；mode 不因切图重置。  
6. **隔离**：namespace 仍 `companion_follow`；不入 FriendlySummons.pets；gifts 仍关。

## 5. 冻结 SHA（写后＝写前）

| 文件 | SHA-256 |
|---|---|
| `data/balance/companions.json` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `data/balance/skills.json` | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` |

## 6. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 本刀文件 **PASS**（零本刀 TS error；仓内既有 `src/gen/assets.json` 缺文件与本刀无关） |
| `npm run test:companion-modes-free-stay` | **PASS**（79 assertions × shared＋snapshot＝158） |
| `npm run test:companion-follow-ai` | **PASS**（43×2＝86；follow 硬读未漂） |

## 7. 禁项自证

| 禁项 | 证据 |
|---|---|
| 无新 OpenFlag／softOpenedCompanion＊ | 未新增 Flag 文件；测例负向断言 |
| 未改 companions／skills 字节 | SHA MATCH |
| 禁抬 GAME_PHASE／开 gifts／#20／面板三态 UI | 未碰；gifts.enabled=false；入口仅 KeyV |
| ≠开态≠soft≠release≠Pages | 未合 master／未 tag／未 Pages |
| 禁捆阵法／巢穴／夺宝／跳跃 | 未碰 |
| 与 FriendlySummons 隔离 | 未改 FriendlySummons.ts |
| Codex／旁路 | **旁路**（403 log 如上） |

## 8. 交回

【同行AI42接线已交】tip＝9a280a857e15625a4285581006fbf5fb9cf08e84｜枝＝feat/companion-modes-free-stay｜报告＝reports/炼器阁/20261019_同行AI_design42_wire.md｜演武定稿＝reports/演武堂/20261019_同行AI_design42_演武定稿.md｜硬读＝KeyV循环＋free320/240＋stay零伤≠无敌＋切回96/320/320＋CD1200＋240＋0.35｜无新OpenFlag｜表SHA MATCH｜tsc＋测 PASS｜Codex403旁路｜≠开态≠soft≠release｜现网v0.6.23｜请开核
