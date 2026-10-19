# 持续飞行 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验债持续飞行_soft-open.md`  
> 明示例外：Codex 仍 403／routing failed → **旁路直写**（不经 Sol）  
> **本刀 = soft-open only；≠ release ≠ 进包 ≠ Pages ≠ tag ≠ 新 OpenFlag**

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/sustain-flight-wire` |
| 基线 | tip@`9d563f3`／HEAD@`6cb127c`（含 3A 零补刀 docs） |
| soft-open tip | `8341e6e2db33076e8997a81333381e6cbc424fdc`（短 `8341e6e`） |
| worktree | `/workspace/xiantu/wt/feat/sustain-flight-wire` |

> 注：本文件若经后续 docs 补 SHA，以 `git rev-parse origin/feat/sustain-flight-wire` 与 status 为准。

## 2. 改动面（仅证据位）

| 路径 | 说明 |
|---|---|
| `scripts/v06b-open-test.mjs` | 证据／日志加 `softOpenedSustainFlight:true`、`newOpenFlag:false`、`released:false` |
| `scripts/v06b-closed-test.mjs` | 同上（交付口径；memory-closed 图仍实际注入 fly_zones.enabled=false） |
| `src/fly-zones.test.ts` | 结束日志注明证据位 only，非运行时门禁 |

**未改**：`FlyZones.ts`／`GameScene.ts`／`MapBuilder.ts`；`canSustainFlight`／`requestSustainFlight`；`fly_zones.json` 数值／结构；maps；冲刺 skills；gifts；GAME_PHASE；任何 OpenFlag。

对齐坊市纵深 tip@60755d6 `softOpenedMarketDepth` 范式：证据／HANDOFF／RESULT／status 口径；**不**接成生产门禁。

## 3. 硬门

| 项 | 结果 |
|---|---|
| softOpenedSustainFlight | **true** |
| released | **false** |
| newOpenFlag | **false** |
| fly_zones SHA | **2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4** MATCH（`2940fe59…`） |
| ≠release≠进包≠Pages≠tag | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:v06b-closed` | **PASS**；fly 115／sword 56；日志含 `softOpenedSustainFlight:true`、`newOpenFlag:false`、`released:false` |
| `npm run test:v06b-open` | **PASS**；formal 355／sword 56；同上证据位 |

## 5. 交回

【持续飞行 soft-open】tip@8341e6e｜softOpenedSustainFlight=true｜released=false｜newOpenFlag=false｜fly_zones SHA仍 2940fe59…｜≠release≠Pages｜等执法 soft smoke（3B）
