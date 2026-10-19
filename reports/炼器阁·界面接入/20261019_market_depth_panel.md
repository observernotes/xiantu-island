# 2C · 完整寄售面板 tip 交付

> 炼器阁·界面接入｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验债坊市纵深_接线.md` §2C；design/33 §2.1／§2.2／§3／§6  
> **Codex=仍403旁路直写**（负责人令 `20261019_负责人令_明示例外_Codex403旁路.md` §2B/2C）  
> **≠ soft-open ≠ release ≠ 推 origin/dev ≠ 新 OpenFlag**

## tip
- 分支：`feat/ui-market-depth`（界面子 tip；合入族 `feat/market-depth-wire`）
- 基线：`origin/dev@c84cbae`
- 实现 TIP_SHA：`6696d02ae5f0dd06f5897053130e6acf35052b59`
- tip HEAD：以 `origin/feat/ui-market-depth` 为准（含本报告 docs 提交）
- 已推：`origin/feat/ui-market-depth`

## 改动文件
- 新建 `src/MarketConsignUiAccess.ts`
- 新建 `src/MarketConsignController.ts`
- 新建 `src/MarketConsignPanel.ts`
- 改 `src/scenes/GameScene.ts`（create／update／modal 门闩 + `tryInteractMarketConsign`）
- 改 `src/v06p1-market-open.test.ts`（sceneSmoke 开态开面板／关态 tip 零写）
- 改 `scripts/v06p1-market-open-test.mjs`（静态校验改认 MarketConsignPanel）
- 同步 `data/balance/market_consign.json` 与共享根同字节（2A 品类表；**七字段定值未改**）

## 面板入口路径（单列）
| 项 | 路径 |
|---|---|
| 地图对象名 | `market_consign_entrance`／`fangshi_consign` |
| GameScene 方法 | `tryInteractMarketConsign`（Z 链：`tryInteractTowerClosed || tryInteractMarketConsign || tryInteractForgeEntrance || …`） |
| 面板类 | `MarketConsignPanel` → `MarketConsignController` → 只读／写经 `MarketGate` |
| UI 可见性 | `isMarketConsignUiAccessible('entrance'|'panel')`（生产恒 true；SSR 可注入关） |
| 开态打开 | Flag／UI 允许 → `marketConsign.show()` → Controller `feature()`／`loadProgress`／`slotOrItem` 只读 |
| 关态 | `!isMarketOpenForFixture()` 或 UI 关 → tip `market.closed.feature`（`MarketClosed.featureClosed()`），**不打开面板** |
| 无对象 | 安静 `return false` |

**改 GameScene 前对齐**：炼器已划界不改 `tryInteractMarketConsign`／Panel／Controller／UiAccess；本刀改前已按「改 GameScene 前必私聊」口径对齐该划界后落笔。

## 与 shops／欧冶匠隔离旁证（单列）
| 旁证 | 代码路径 |
|---|---|
| 寄售入口对象集 | 仅 `market_consign_entrance`／`fangshi_consign`；不含 shop NPC／`smith_ou` |
| 欧冶匠入口 | `tryInteractForgeEntrance` → `smithServices?.show()`；与寄售方法分离 |
| 寄售打开 | `tryInteractMarketConsign` → `marketConsign?.show()`；不调用 `SmithServicesPanel`／`ShopPanel` |
| ShopPanel | 静态校验：源码不含 market／consign |
| 混窗禁令 | 无合并菜单；modal 门闩并列 `smithServices||marketConsign`，互斥输入 |

## 打开／浏览／取消零写旁证（单列）
| 行为 | 旁证 |
|---|---|
| Controller open／reload | 只调 `feature`／`loadProgress`／`slotOrItem`／`rewards`（只读） |
| 浏览选栏／选品／调价／back／close | 只改视图内存；无 `listItem`／`withdraw`／`claim` |
| 写操作 | 仅 confirm 后 `submit` → `listItem`／`withdraw`／`claim`；**禁 settle** |
| sceneSmoke | `exportSave` 前后相等；`idb.writes` 增量 0；关态／Gate 拒不打开面板 |
| 测试图 | memory-closed：`saveWrites:0`；formal-open-panel 冒烟零写 |

## 自测
| 命令 | 结果 |
|---|---|
| `npm run sync` + `./node_modules/.bin/tsc --noEmit` | PASS |
| `npm run test:v06p1-market-open` | PASS，2599 assertions；sceneSmoke `formal-open-panel`／`memory-closed` |

## 七字段
- 整表 SHA（含 2A `consignableItemIds`）：`12daf2e3a702dbf1068486e7b8d585b062da8a7f337b396274f9aafff6e4625d`（与共享根 MATCH）
- 七字段定值（listingPrice 规则／fee／swing／saleDelay／offline／slot／reward 公式）相对原 `e4725b…` 代 **MATCH 未改**；本 tip **未改** `MarketGate`／`MarketProgress`／`MarketClosed`／`MarketOpenFlag`／`strings_zh.json`

## 禁区复核
- 未推 origin/dev／tag／Pages／发版
- 未改 strings；缺键继续暂用 `market.closed.*`
- 未新 OpenFlag；≠soft-open≠release
