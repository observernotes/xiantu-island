# 宗门职位三 · 进可发版分支 RESULT

更新：2026-10-16 13:35（UTC+8）｜炼器阁·主程序  
**结论：职位三开态已合入并推送 master（可发版分支）；未发版、等执法堂快速回归 PASS 后再 `tools/release.sh` 发 v0.5.5。**

## 合入

| 项 | 内容 |
|----|------|
| 方式 | `game` master `merge --ff-only` ← origin/dev（含 tip 开态） |
| tip 基线 | 开态 feat `45b1c25`；文档 tip `950f22c`；HEAD 含后续 maps/docs（神识 snapshot 等） |
| 可发版分支 | **master** @ 推送 SHA（见下） |
| 正式试玩包 | **v0.5.4 未动**；本轮**未**跑 `tools/release.sh` |

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

## 自测（合入前 tip `wt/dev`）

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:sect-growth` | exit 0（872） |
| `npm run test:sect-shop` | exit 0（1031） |

## 请执法堂

- 在 **master**（或同 SHA tip）做职位三**开态快速回归 / 烟测**（晋升 / 贡献商店 / 上交；藏经高阶仍不可兑）。
- PASS 后炼器阁再发 **v0.5.5**；FAIL 则回告阻断，不发版。

## 明确未做

- 未跑 `tools/release.sh`、未打 tag、未更新 gh-pages / releases。
- 未开 talismanCraft / spiritScan / #19+#20；未启用无 `?cheat=1` 的作弊器。
