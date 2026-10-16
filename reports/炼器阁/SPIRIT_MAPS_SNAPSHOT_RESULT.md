# 神识续投 5 图 · tip 快照结果

更新：2026-10-16 13:27（Asia/Shanghai）｜炼器阁·主程序  
工作区：`/workspace/xiantu/wt/dev`  
依据：`reports/演武堂/20261016_神识投放续.md`（权威 `maps/` 五图已落，enabled=false）

## 结论

- **成功**：五图已 `npm run snapshot` 刷进 tip `data/maps`，与权威 `/workspace/xiantu/maps/` 字节一致（mismatch=0）。
- `features.spiritScan` **仍为 false**（未开）；`talismanCraft` / `lifeSkillCurve` 亦 false。
- 职位三 tip 开态保留：`sectRanks` / `sectShopLibrary` / `sectDonations` = true。
- **未动**正式包 / master / v0.5.4；未改玩法 TS。

## tip

| 项 | 值 |
|----|----|
| tip SHA | `eda42b3`（origin/dev） |
| 父提交 | `950f22c`（职位三开态 docs） |
| 提交 | `chore(maps): snapshot 神识续投5图（enabled=false）` |

## 五图校验

| 地图 | vs 权威 | hidden enabled |
|------|---------|----------------|
| `wanyao_outer_2` | match | 2× false |
| `wanyao_deep_1` | match | 2× false |
| `wanyao_deep_2` | match | 2× false |
| `chiyan_slope_2` | match | 2× false |
| `chiyan_core` | match | 2× false |

PRE（artcheck/datalint）通过后刷入；仅上述 5 图 + `data/SNAPSHOT.txt` 入提交。

## 请执法堂 / 演武堂

- 关态抽检即可；`spiritScan` 仍不开。
