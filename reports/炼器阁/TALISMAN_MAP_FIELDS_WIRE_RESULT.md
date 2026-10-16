# 制符回城地图字段 · 快照刷入与接线结果

更新：2026-10-16 13:14（Asia/Shanghai）｜炼器阁·主程序  
工作区：`/workspace/xiantu/wt/dev`  
依据：`reports/演武堂/20261016_制符回城地图字段.md`（共享 `maps/` 24/24 已落表）

## 结论

- **成功**：共享 maps 两字段已刷进 tip `data/maps`；读表逻辑以表为准，缺字段仍有旧硬编码兜底。
- `talismanCraft` **仍为 false**（未开）。
- 首领封闭继续靠运行时 `closedBossFight`（`bossOnly` 区域），**未**用地图字段替代。
- 试炼禁遁地：`isTrialMap`（`trial_` 前缀 / `trial` 属性）保留；试炼 5 张另有 `allowTalismanReturn=false`。

## 做了什么

1. **核对差异**：共享 `/workspace/xiantu/maps` 与 tip `data/maps` 24 张均有内容差；共享侧已有 `returnTown`/`allowTalismanReturn`，tip 侧原为 0。
2. **`npm run snapshot`**（内置 `--pre`）：artcheck/datalint 0 问题后刷入；刷后 tip 与共享 24 张字节一致。
3. **程序接线**：`src/TalismanUse.ts` 既有实现已满足本轮契约，本轮未再改玩法码：
   - `isTalismanTown`：布尔字段优先；仅当缺失时对 `qingyun_village`/`luoxia_town` 硬编码兜底。
   - `mapAllowsReturn`：显式 `false` 拒绝；缺失或 `true` 允许。
   - `nearestTalismanTown`：试炼图直接禁；再读 `allowTalismanReturn`。
   - `GameScene.setupTalismanUse`：`closedBossFight` 仍为运行时 arena/`bossOnly` 判定。
4. **测例**：真实 TILED_MAPS 现已无缺口；将「缺字段列入 gap」断言改为夹具覆盖，并断言生产表 `talismanMapGaps().length === 0`。
5. 自测：`tsc --noEmit` 通过；`npm run test:talisman` 通过（snapshot+shared 两模式 + FX 105）。

## 字段核对（tip `data/maps`）

| 项 | 值 |
|----|----|
| 运行图 | 24 |
| `returnTown=true` | 2（青云村、落霞镇） |
| `allowTalismanReturn=false` | 5（全部 `trial_*`） |
| `allowTalismanReturn=true` | 19（含 `chiyan_core`/`youying_tower`） |
| `talismanMapGaps()` | **0** |
| `features.talismanCraft` | **false** |

## 改动文件

| 路径 | 说明 |
|------|------|
| `data/maps/*.json`（24） | snapshot 自共享刷入两字段 |
| `data/SNAPSHOT.txt` | snapshot 元数据 |
| `src/talisman-use.test.ts` | 缺口断言对齐已落表状态 |
| 本 RESULT / 缺口清单 / V05B 短注 / `status/炼器阁.md` | 文档 |

## 请执法堂

- 关态抽检：表字段存在、`talismanCraft=false`、试炼仍禁遁地文案/逻辑；开态整期仍等负责人。
- tip：`99ec29c`（origin/dev）。
