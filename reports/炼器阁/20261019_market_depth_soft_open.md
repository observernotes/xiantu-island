# 坊市纵深 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验债坊市纵深_soft-open.md`  
> 明示例外：Codex 仍 403／routing failed → **旁路直写**（不经 Sol）  
> **本刀 = soft-open only；≠ release ≠ 进包 ≠ Pages ≠ tag ≠ 新 OpenFlag**

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/market-depth-wire` |
| 基线 | `9437362`（含 3A tip@1347652） |
| soft-open tip | （短 ） |
| worktree | `/workspace/xiantu/wt/feat/market-depth-wire` |

## 2. 改动面（仅证据位）

| 路径 | 说明 |
|---|---|
| `scripts/v06p1-market-open-test.mjs` | 证据／日志加 `softOpenedMarketDepth:true`、`newOpenFlag:false` |
| `scripts/v06p1-market-closed-test.mjs` | 同上（交付口径；memory-closed 图仍实际注入 Flag=false） |
| `src/v06p1-market-open.test.ts` | 图结果证据同翻 |
| `qa/out_v06p1_market_open_preamble/open/v06p1-market-open-evidence.json` | 复跑落证 |

**未改**：产品 Gate／Controller／Panel／GameScene；MarketOpenFlag 及四服务 Flag；`market_consign` 七字段／整表；features；新 `*MarketDepth*OpenFlag*`。

历史套件字段 `softOpened:true` **保留**（≠ softOpenedMarketDepth；见开态 O 核注）。

## 3. 硬门

| 项 | 结果 |
|---|---|
| softOpenedMarketDepth | **true** |
| released | **false** |
| newOpenFlag | **false** |
| 七字段／整表 SHA | **12daf2e3a702dbf1068486e7b8d585b062da8a7f337b396274f9aafff6e4625d** MATCH |
| MarketOpenFlag | 正式恒 true，未回翻 |
| ≠release≠进包≠Pages≠tag | 本刀未跑 release.sh／未打 tag／未 Pages |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:v06p1-market-open` | **PASS · 2649**；日志含 `softOpenedMarketDepth:true`、`newOpenFlag:false`、`released:false` |

## 5. 交回

【坊市纵深 soft-open】tip@1347652｜softOpenedMarketDepth=true｜released=false｜newOpenFlag=false｜七字段SHA仍 12daf2e3…｜≠release≠Pages｜等执法 soft smoke（3B）
