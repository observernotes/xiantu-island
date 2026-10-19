# design/43 · 同行 AI 主动解散入口 · tip＋接线

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_同行AI_design43_接线.md`（门闩 **OPEN**）  
> 核记：`reports/炼器阁/20261019_负责人核_同行AI_design43.md` VERIFY_PASS；演武 **跳过／N/A**  
> design：`design/43_v06_6b+_同行AI解散入口.md`  
> **Codex：sol ultra → HTTP 403／workspace routing discovery failed → 旁路直写**（log `logs/codex/dbc6861aa2bf286a_20261019_221845_696882.log`）  
> **≠ 开态 ≠ soft-open ≠ release ≠ Pages ≠ 新 OpenFlag**  
> 现网仍 **v0.6.24**。未合 master。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-dismiss` |
| 基线 | `047820c`（origin/master／v0.6.24 docs tip） |
| tip SHA | `542dddb47bdaef5723e5119716d3e79085baab51` |
| worktree | `/workspace/xiantu/wt/feat/companion-dismiss` |
| 旁路 | **是**（Codex 403） |

## 2. 改动文件清单

| 路径 | 说明 |
|---|---|
| `src/Companions.ts` | `canDismiss`／`dismissCompanionRelation`；删 `companionRelations[苏]` 整键；幂等 noop |
| `src/CompanionFollowAi.ts` | `dismissEntity()` 仅 clearEntity；不设 destroyed；KeyV cycle 注释明示≠解散 |
| `src/scenes/GameScene.ts` | `requestCompanionDismiss`；苏师姐 `talkTo` 对话／面板同族入口（邀／解散）；KeyV 仍只 cycle |
| `data/balance/strings_zh.json` | `companion.dismiss.*`＋`companion.invite.label` |
| `src/companion-dismiss.test.ts` | 硬读／幂等／stay≠解散／KeyV 不解散／再邀 follow／gifts／无新 Flag |
| `scripts/companion-dismiss-test.mjs` | Vite SSR runner＋companions／skills SHA 守护 |
| `package.json` | `test:companion-dismiss` |
| `reports/炼器阁/20261019_同行AI_design43_wire.md` | 本 RESULT |

**未改**：`companions.json`／`skills.json`／OpenFlag／GAME_PHASE／fly_zones／gifts／#20／阵法／巢穴／夺宝／跳跃／FriendlySummons.ts／sash。

## 3. 硬读落地证据

| 键 | 定稿 | 落地证据 |
|---|---|---|
| dismiss.entry | 对话／面板单入口（与 invite 同族） | `talkTo(senior_sister_su)` 挂 `companion.dismiss.label`／`companion.invite.label` |
| dismiss.bind | ≠ KeyV；禁塞进 cycle | KeyV 仍 `companion_mode_cycle`；注释明示永不解散 |
| dismiss.api | `requestCompanionDismiss`／`dismissCompanionRelation` | GameScene＋Companions；禁 UI.dismiss* 混名 |
| dismiss.effect | 毁实体＋删整键 | dismiss → delete key；`dismissEntity` clearEntity |
| dismiss.after | 无 mode；cycle 无效；无残留 | `activeCompanion=null`；`cycleCompanionMode`→null |
| dismiss.idempotent | 已无关系 → noop | `status:'noop'`；不写脏档 |
| reinvite | 既有 invite→spawn；初始 follow；恰 1 | 测例再邀 mode=follow；关系键恰 1 |
| stay≠dismiss | stay 保关系；解散清关系 | stay 后仍有关系；仅 dismiss 清 |
| mapChange | 切图毁实例保关系 | `destroy()`／SHUTDOWN 未改；dismissEntity ≠ destroy |
| follow/free/stay | 96/320/320＋CD1200＋240＋0.35；KeyV 循环 | 测例抽检硬读常量 MATCH |

## 4. 闭环行为

1. **入口**：与苏师姐对话且可邀／可解散时出选项；≠ KeyV。  
2. **解散**：`dismissCompanionRelation` 删整键 → `dismissEntity` 毁精灵／碰撞；清后无 mode。  
3. **幂等**：无关系再解散 → noop；顺带清幽灵实体。  
4. **再邀**：`requestCompanionInvite`→`invite`→`spawnAfterInvite`；初始 follow；恰 1。  
5. **切图**：SHUTDOWN `destroy` 仍毁实例、**保**关系＋mode。  
6. **隔离**：namespace `companion_follow`；gifts 仍关；不入 FriendlySummons。

## 5. 冻结 SHA（写后＝写前）

| 文件 | SHA-256 |
|---|---|
| `data/balance/companions.json` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `data/balance/skills.json` | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` |

## 6. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 本刀文件 **PASS**（零本刀 TS error；仓内既有 `src/gen/assets.json` 缺文件与本刀无关） |
| `npm run test:companion-dismiss` | **PASS**（53 assertions × shared＋snapshot＝106） |
| `npm run test:companion-modes-free-stay` | **PASS**（79×2＝158；41／42 硬读未漂） |
| `npm run test:companion-follow-ai` | **PASS**（43×2＝86） |

## 7. 禁项自证

| 禁项 | 证据 |
|---|---|
| 无新 OpenFlag／softOpenedCompanion＊ | 未新增 Flag；测例负向断言 |
| 未改 companions／skills 字节 | SHA MATCH |
| 未改 41／42 硬读 | follow／MODES_HARD 抽检 MATCH；modes／follow 测绿 |
| 禁抬 GAME_PHASE／开 gifts／#20 | GAME_PHASE=5；gifts.enabled=false |
| ≠开态≠soft≠release≠Pages | 未合 master／未 tag／未 Pages |
| 禁捆阵法／巢穴／夺宝／跳跃／sash／FriendlySummons | 未碰 |
| 禁绑 KeyV／塞进 cycle | 入口仅对话；KeyV 仍 cycle |
| Codex／旁路 | **旁路**（403 log 如上） |

## 8. 交回

【同行AI43接线已交】tip＝542dddb47bdaef5723e5119716d3e79085baab51｜短＝542dddb｜枝＝feat/companion-dismiss｜报告＝reports/炼器阁/20261019_同行AI_design43_wire.md｜门闩＝OPEN｜无新OpenFlag｜tsc＋测＝PASS｜旁路＝是｜41／42硬读未漂｜等负责人核｜≠开态≠soft≠release
