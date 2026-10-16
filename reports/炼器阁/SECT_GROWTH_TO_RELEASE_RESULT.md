# 宗门职位三 · 进可发版分支 RESULT

更新：2026-10-16 13:40（UTC+8）｜炼器阁·主程序  
**结论：职位三开态已合入并推送 master（可发版分支）；未发版、等执法堂快速回归 PASS 后再 `tools/release.sh` 发 v0.5.5。**

## 合入

| 项 | 内容 |
|----|------|
| 方式 | `game` master `merge --ff-only` ← origin/dev（含 tip 开态） |
| tip 基线 | 开态 feat `45b1c25`；文档 tip `950f22c`；其后含神识 maps snapshot 等 docs |
| 可发版分支 | **master**（与 tip 同线；执法堂请拉 **origin/master** HEAD） |
| 开态内容起点 | `45b1c25`（features+表）；执法堂 PASS 报告参考 `qa/out_sect_growth_open_950f22c/` |
| 正式试玩包 | **v0.5.4 未动**；本轮**未**跑 `tools/release.sh` |
| 推送远程 | `origin/master` + `origin/dev` 已含开态（已推送；开态起自 `45b1c25`，请拉 **origin/master**（本轮推送点 `093b18d`，其后 docs 以远程 HEAD 为准）） |

## 正式包开关（features + 表）

| flag / 表 | 正式包现值 |
|-----------|------------|
| `sectRanks` | **true** |
| `sectShopLibrary` | **true** |
| `sectDonations` | **true** |
| `sect_ranks.json` enabled | **true** |
| `sect_donations.json` enabled + 5 offer | **true** |
| shops 五宗使者贡献 15 项 | **true** |
| `tianjian_elder.scroll_ten_thousand_swords` | **false**（藏经高阶仍筹备） |
| `talismanCraft` / `spiritScan` / `lifeSkillCurve` | **false**（未开） |
| `gongfa_grades` / `qi_density`（#19+#20） | **enabled=false**（未开） |

## 自测（合入前后 tip / master `wt/dev`·`game`）

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:sect-growth` | exit 0（872） |
| `npm run test:sect-shop` | exit 0（1031） |

## 请执法堂

- 工作区：`/workspace/xiantu/game`（master）或 `wt/dev`（同 SHA tip）
- 跑职位三**开态快速回归 / 烟测**（晋升 / 贡献商店 / 上交；藏经高阶仍不可兑）
- PASS 后炼器阁再发 **v0.5.5**；FAIL 则回告阻断，不发版

## 明确未做

- 未跑 `tools/release.sh`、未打 tag、未更新 gh-pages / releases
- 未开 talismanCraft / spiritScan / #19+#20；未启用无 `?cheat=1` 的作弊器
