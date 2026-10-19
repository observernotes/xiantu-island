# 3A · consignPanelReady 开态补刀 · PASS（炼器验证）

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验债坊市纵深_开态O.md` §3A  
> 明示例外：`reports/天机阁/20261019_负责人令_明示例外_Codex403旁路.md`（界面旁路直写一行；本阁本棒**零改码**，只验证＋报告）  
> **≠ soft-open ≠ release ≠ 新 OpenFlag ≠ Pages ≠ tag**

## 1. tip／HEAD

| 项 | 值 |
|---|---|
| 接线 tip（一行改动） | `50cfdb7b2be390042e6038ae311caf0d9b1d23f5`（`feat(ui): pass consignPanelReady in MarketConsignController.gate (3A)`） |
| 分支 HEAD | `c68d5a26de4834c9c0df35380944e88831bbacf0`（`docs(ui): fill 3A consignPanelReady tip SHA in open_ready_ui report`；含 tip@50cfdb7） |
| 分支 | `feat/market-depth-wire` |
| worktree | `/workspace/xiantu/wt/feat/market-depth-wire` |
| 基线 | `3a4e03b`（2C merge 后）→ `50cfdb7`（3A 接线）→ `c68d5a2`（UI 报告 SHA 补全） |

## 2. 改动面

| 路径 | 说明 | 责任 |
|---|---|---|
| `src/MarketConsignController.ts` | `private gate()`：`new MarketGate(this.progress)` → `new MarketGate(this.progress, { consignPanelReady: true })` | **界面**（tip@50cfdb7） |
| 本阁本棒 | **零产品码改动**；只读核 Gate L1 + 复跑自测 + 本报告 | 炼器·主程序 |

**未改**：`MarketGate` 语义／七字段／`market_consign.json`／strings／新 Flag／`softOpenedMarketDepth`／GameScene／Panel 其它逻辑／fixture 白名单回退。

## 3. 只读核

- Controller：`gate()` 确传 `{ consignPanelReady: true }`（面板会话正式写路径清 L1）。
- Gate：`MarketFixtureOptions.consignPanelReady`；`refuseFormalDepth` 在 `!== true` 时 list／withdraw／claim／deal 走 `MarketClosed.refuse*`（只 tip、零写）；品类 L2／计时／claim 不重抽等 2B 语义不变。
- 七字段／整表 SHA 仍 **`12daf2e3a702dbf1068486e7b8d585b062da8a7f337b396274f9aafff6e4625d`** MATCH（`data/balance/market_consign.json`）。
- `softOpenedMarketDepth=false`（源码／data／包位无该字段；本 tip 未引入）。
- `released=false`；现网仍 v0.6.14。

## 4. 自测（本机复跑）

| 命令 | cwd | 结果 |
|---|---|---|
| `npx tsc --noEmit` | `wt/feat/market-depth-wire` | **PASS**（exit 0） |
| `npm run test:v06p1-market-open` | 同上 | **PASS** · **2649** assertions；`marketTableSha=12daf2e3…`；`released:false`；formal-open 图 `panelOpenPath:true` |

与 UI 旁证一致（2649）。经 Controller／Panel 正式 list／withdraw／claim 路径不再因漏传 ready 被 L1 误拒。

## 5. 旁证引用

- UI 一行接线旁证：`reports/炼器阁·界面接入/20261019_market_depth_open_ready_ui.md`（只读核，未改）
- 关态 C／2B 前序：`reports/炼器阁/20261019_负责人核_market_depth_C.md`／`20261019_market_depth_wire.md`

## 6. 交回口径

【坊市纵深开态】补刀 tip@50cfdb7｜HEAD@c68d5a2｜炼器验证 PASS｜七字段SHA仍 12daf2e3…｜softOpenedMarketDepth=false｜released=false｜≠soft-open≠release｜等经理开 3B 执法 O
