# 制符表接入 · RESULT

更新：2026-10-16 12:50（UTC+8）
执行：炼器阁
范围：天机缺口 1–2（`talisman.*` 文案 / `lingfu_envoy`·`talisman_craft` / `talisman_paper` 货架）接入 + 刷快照
**未开** `features.talismanCraft`（仍为 `false`）
不做：#19/#20、炼丹回归

## tip
- 推送前 tip：`0ebdb60`
- 表接入提交：`d9081c4`
- 当前 tip：`525280f`（含 RESULT sha 更正）

## 天机改动落点
共享表 `/workspace/xiantu/balance/`（mtime 约 12:44 CST）：
| 文件 | 内容 |
|---|---|
| `strings_zh.json` | 60 条 `talisman.*`（含 `paper_source`：王婶杂货铺或墨符使处） |
| `npcs.json` · `lingfu_envoy` | `services` 增 `{type:talisman_craft,sect:lingfu,config:talisman}`；`shop:true` |
| `shops.json` | `grocer_wang` / `lingfu_envoy` 字符串货品 `talisman_paper` |

刷快照前 `wt/dev/data/balance` 仍缺上述三项（文案 0、无 craft 服务、墨符使无 `shop`）。

## 程序接入
- `src/scenes/GameScene.ts`：`hasTalismanService` 改为读 `npc.services` 中 `talisman_craft`，不再写死 `lingfu_envoy`；仍受 `featureEnabled('talismanCraft')` 门禁（关态隐藏制符菜单）。
- 普通商店 / 字符串货架 / `t()` 已按表动态读；`LOCAL_STRINGS` 仅作兜底，表内 key 优先。
- `SectGrowth.services()` 白名单仍不含 `talisman_craft`（制符走独立菜单，不进宗门贡献服务列表）——符合现契约。

## 快照
- `npm run snapshot`（内置 `qa/tools/run_all.sh --pre`）通过：错误 0、datalint 问题 0。
- `data/features.json` 保留原值：`talismanCraft=false`。
- 完整冻结共享树：除目标三表外，顺带更新了共享侧已变的 `monsters.json` / `quests.json` / 6 张地图 / 7 张 player 精灵 PNG（`npm run snapshot` 惯例，非手改）。

## 自测
| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 通过 |
| `npm run test:talisman` | snapshot+shared：craft 446 / use 216 / save 167；FX 105 |
| `npm run test:shop` | 596 条通过 |

## 关态行为
- `talismanCraft=false`：对话不出现学习/制符入口（表有服务也不展示）。
- `shops=true`：王婶与墨符使普通货架可售 `talisman_paper`（字符串价走物品 `price`）。
- 宗门贡献货架对象项仍 `enabled:false`，不受影响。

## 请执法堂
- 验：快照含 60 条文案、`talisman_craft` 服务登记、两处纸货架；关 flag 无制符菜单；开态整期仍等负责人。
