# design/44 · 同行 AI area 单技能（whirl_sword）· tip＋接线

> 仙途岛·炼器阁·主程序｜2026-10-19 23:17 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_同行AI_design44_接线.md`（门闩 **OPEN**）  
> 核记：`reports/炼器阁/20261019_负责人核_同行AI_design44_演武定稿.md` VERIFY_PASS  
> 演武定稿：`reports/演武堂/20261019_同行AI_design44_演武定稿.md`  
> design：`design/44_v06_6b+_同行AI_area单技能.md`  
> **Codex：sol ultra → HTTP 403／workspace routing discovery failed → 旁路直写**（log `logs/codex/a1fd8d8fa93cdf70_20261019_231401_748703.log`）  
> **≠ 开态 ≠ soft-open ≠ release ≠ Pages ≠ 新 OpenFlag**  
> 现网仍 **v0.6.25**。未合 master。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-area-whirl` |
| 基线 | `d299c59`（origin/master／v0.6.25 docs tip） |
| tip SHA | `b3595651c62c16b6db48ffcd9cf7ce90a95c0bae`（短 `b359565`） |
| worktree | `/workspace/xiantu/wt/feat/companion-area-whirl` |
| 旁路 | **是**（Codex 403） |

## 2. 改动文件清单

| 路径 | 说明 |
|---|---|
| `src/CompanionFollowAi.ts` | `COMPANION_AREA_HARD`；`schedule→primary_and_area`；独立 primary／area CD；朝向盒／prefer≥2／饿死 N＝2；strikeArea；stay 清 pending 含 area |
| `src/companion-area-whirl.test.ts` | 硬读／几何／优先级／budget／stay／support／41·42·43／Flag |
| `scripts/companion-area-whirl-test.mjs` | Vite SSR runner＋companions／skills SHA 守护 |
| `package.json` | `test:companion-area-whirl` |
| `src/companion-modes-free-stay.test.ts` | schedule 断言 `primary_only`→`primary_and_area`（其余硬读不漂） |
| `reports/炼器阁/20261019_同行AI_design44_wire.md` | 本 RESULT |

**未改**：`companions.json`／`skills.json`／OpenFlag／GAME_PHASE／fly_zones／gifts／#20／阵法／巢穴／夺宝／跳跃／FriendlySummons.ts／sash／解散入口／KeyV 循环数字。

## 3. 硬读落地证据

| 键 | 定稿 | 落地证据 |
|---|---|---|
| schedule.semantic | primary＋area | `COMPANION_MODES_HARD.schedule='primary_and_area'` |
| schedule.support | false | `COMPANION_AREA_HARD.supportLocked`；候选仅 primary／area |
| follow Dist／leash／aggro | 96／320／320 | `COMPANION_FOLLOW_HARD` 未改；测例 MATCH |
| free.aggro | 320 | `COMPANION_MODES_HARD.free.aggroRange` |
| primary | sword_qi_slash；CD1200；240×48；tele／rec 200／200 | 硬读未漂 |
| area.skillId | 仅 whirl_sword | `COMPANION_AREA_HARD.skillId` |
| area.effectiveAiCooldownMs | **4000** | 常量＋测 |
| area.tele／rec | 250／250 | 常量＋测 |
| area.rangeAlign | w**160**／h**80**／behind**32** | `rangeAlign`＋`inAreaFacingBox` 对齐 SkillCombat；表旁证 MATCH |
| area.preferThreshold | **2** | `areaPreferCondition`／`chooseCompanionCombatSkill` |
| starveGuard.N | **2** | `starveAllowsPrimary`／streak |
| maxPendingPerTick | 1 | 本拍至多一 pendingStrike |
| cd.independent | true | primaryReadyAt／areaReadyAt 各推各的 |
| stay.zeroDamage 含不放 area | true | `updateStay` 清 pending；`modes.stay=false`／`stopArea` |
| damage.budgetScale | **0.35** 同乘一次 | `companionDealtDamage` primary／area／reflect 同源；禁 0.35² |
| 41／42／43 | KeyV；stay≠无敌；解散≠KeyV | follow／modes／dismiss 测仍绿 |

## 4. 闭环行为

1. **schedule**：follow／free 下可调度 primary 或 area；support／`sword_shield` 永不候选。  
2. **优先级**：area CD 就绪且朝向盒合法敌 ≥2 → `whirl_sword`；否则 primary（条件同 41／42）。  
3. **索敌**：只读对齐表 range（前 160／高 80／身后 32）；与 primary engage 240×48 几何独立。  
4. **饿死 N＝2**：连续 2 拍 area 条件假 → 契约允许 primary（若自身就绪）。  
5. **budget**：每一笔 primary／area／reflect 只乘一次 0.35。  
6. **stay**：零伤含不放 area；切入清 pending；invulnerable=false。  
7. **隔离**：namespace `companion_follow`；gifts 仍关；不入 FriendlySummons。

## 5. 冻结 SHA（写后＝写前）

| 文件 | SHA-256 |
|---|---|
| `data/balance/companions.json` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `data/balance/skills.json` | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` |

## 6. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 本刀文件 **PASS**（零本刀 TS error；仓内既有 `src/gen/assets.json` 缺文件与本刀无关） |
| `npm run test:companion-area-whirl` | **PASS**（95×2＝190） |
| `npm run test:companion-follow-ai` | **PASS**（43×2＝86） |
| `npm run test:companion-modes-free-stay` | **PASS**（79×2＝158；41／42 硬读未漂） |
| `npm run test:companion-dismiss` | **PASS**（53×2＝106；43 硬读未漂） |

## 7. 禁项自证

| 禁项 | 证据 |
|---|---|
| 无新 OpenFlag／softOpenedCompanion＊ | 未新增 Flag；测例负向断言 |
| 未改 companions／skills 字节 | SHA MATCH |
| 未改 41／42／43 硬读 | follow／MODES／dismiss 测绿；KeyV／解散未重挂 |
| 禁抬 GAME_PHASE／开 gifts／#20 | GAME_PHASE=5；gifts.enabled=false |
| ≠开态≠soft≠release≠Pages | 未合 master／未 tag／未 Pages |
| 禁捆阵法／巢穴／夺宝／跳跃／sash／FriendlySummons | 未碰 |
| 禁接 support／三技能整包／面板三选一 | supportLocked；仅 whirl_sword |
| Codex／旁路 | **旁路**（403 log 如上） |

## 8. 交回

【同行AI44接线已交】tip＝b3595651c62c16b6db48ffcd9cf7ce90a95c0bae｜短＝b359565｜枝＝feat/companion-area-whirl｜报告＝reports/炼器阁/20261019_同行AI_design44_wire.md｜门闩＝OPEN｜无新OpenFlag｜tsc＋测＝PASS｜旁路＝是｜areaCD＝4000／N＝2／range160×80×behind32｜budget同乘0.35｜stay不放area｜support锁｜41／42／43硬读未漂｜等负责人核｜≠开态≠soft≠release
