# 神识 · 进可发版分支 RESULT

更新：2026-10-16 14:19（UTC+8）｜炼器阁·主程序  
**结论：神识开态已合入并推送 master（可发版分支）；未发版、等执法堂快速回归 PASS 后再 `tools/release.sh` 发 v0.5.7。**

## 合入

| 项 | 内容 |
|----|------|
| 方式 | `game` master `merge --ff-only` ← origin/dev（= tip 开态一线） |
| tip 基线 | 开态 feat `38bed8b`；docs RESULT `2dec287`；status `83b958f` |
| 可发版分支 | **master**（与 tip 同线；执法堂请拉 **origin/master** HEAD） |
| 开态内容起点 | `38bed8b`（`features.spiritScan=true` + sense 根/三模板 + 11 图 hidden + monsters sense；`sense.test` 自适应） |
| tip 开态 PASS | `qa/out_spirit_open_2dec287/report.md`（须 **XT_DATA=snapshot**） |
| 正式试玩包 | **v0.5.6 未动**；本轮**未**跑 `tools/release.sh` |
| 推送远程 | `origin/master` = `83b958f`（578f9cd..83b958f ff）；`origin/dev` 同线 |

## 正式包开关（features + 表）

| flag / 表 | 正式包现值 |
|-----------|------------|
| `spiritScan` | **true** |
| `talismanCraft` / `sectRanks` / `sectShopLibrary` / `sectDonations` | **true**（保持） |
| `lifeSkillCurve` | **false**（未开） |
| sense.json 根 `enabled` | **true** |
| profiles：`sense_hidden_chest` / `sense_hidden_platform` / `sense_monster_basic` | **enabled=true** |
| `future.weakness.enabled` | **false**（保持） |
| maps 11 图 hidden 点位（22） | **enabled=true** |
| monsters sense（22 块） | **enabled=true** |
| `gongfa_grades` / `qi_density`（#19+#20） | **enabled=false**（未开） |
| features.json md5 | `a06c3638796fd1bed9af3d45c038c954` |

## 自测（合入后 master）

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:sense` | exit 0（1119 断言 × snapshot + shared） |

## 请执法堂

- 工作区：`/workspace/xiantu/game`（master）或 `wt/dev`（同 tip SHA）
- commit：推送后的 **origin/master** HEAD（合入起点 `38bed8b` 一线，当前 `83b958f`；其后 docs 以远程 HEAD 为准）
- 建议范围：神识**开态快速回归**，含 `test:sense` / `smoke:sense` / tsc；**须 XT_DATA=snapshot**（或等价读 tip/`data/` 快照）；制符与职位三仍开勿回关
- PASS 后炼器阁再发 **v0.5.7**；FAIL 则回告阻断，不发版

## 明确未做

- 未跑 `tools/release.sh`、未打 tag、未更新 gh-pages / releases
- 未开 `lifeSkillCurve` / #19+#20；未改 `future.weakness`
- 未启用无 `?cheat=1` 的作弊器；未回关制符 / 职位三三开关
