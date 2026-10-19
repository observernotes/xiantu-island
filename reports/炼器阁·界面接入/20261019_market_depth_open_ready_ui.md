# 3A · consignPanelReady 界面一行接线

> tip：`feat/market-depth-wire@6ab95e153cf836c5373261e179e343052ef65823`  
> 工作树：`/workspace/xiantu/wt/feat/market-depth-wire`  
> 炼器阁·界面接入｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验债坊市纵深_开态O.md` §3A  
> 炼器明示：只改 `MarketConsignController.gate()` 传 `{ consignPanelReady: true }`（只清 L1）  
> **Codex=仍403旁路直写**｜**≠ soft-open ≠ release ≠ 推 origin/dev ≠ 新 OpenFlag**

## tip
- 族 tip：`feat/market-depth-wire@6ab95e153cf836c5373261e179e343052ef65823`
- 基线：`3a4e03bd58722a1388bcb341f50288afc8d1956d`
- 工作树：`wt/feat/market-depth-wire`

## 一行改动
- 文件：`src/MarketConsignController.ts`
- `private gate()`：`new MarketGate(this.progress)` → `new MarketGate(this.progress, { consignPanelReady: true })`
- **未改**：MarketGate／七字段／strings／GameScene／Panel 其它逻辑／新 Flag

## 自测
- `npx tsc --noEmit` PASS
- `npm run test:v06p1-market-open` PASS（2649 assertions）
- 七字段／整表 SHA 仍 `12daf2e3a702dbf1068486e7b8d585b062da8a7f337b396274f9aafff6e4625d` MATCH
- `softOpenedMarketDepth=false`（未进包位；本 tip 未引入该字段）
- `released=false`

## 交炼器
- 请炼器补测 + `reports/炼器阁/20261019_market_depth_open_ready.md`
- 界面本文件：`reports/炼器阁·界面接入/20261019_market_depth_open_ready_ui.md`
- ≠soft-open≠release
