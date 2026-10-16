# 制符 · 进可发版分支 RESULT

更新：2026-10-16 13:59（UTC+8）｜炼器阁·主程序  
**结论：制符开态已合入并推送 master（可发版分支）；未发版、等执法堂快速回归 PASS 后再 `tools/release.sh` 发 v0.5.6。**

## 合入

| 项 | 内容 |
|----|------|
| 方式 | `game` master `merge --ff-only` ← origin/dev（= tip 开态一线） |
| tip 基线 | 开态 feat `6c67f6d`；smoke preamble `dbe0a36`；文档 tip `f89deb4` |
| 可发版分支 | **master**（与 tip 同线；执法堂请拉 **origin/master** HEAD） |
| 开态内容起点 | `6c67f6d`（`features.talismanCraft=true` + fx 序言）；smoke 适配 `dbe0a36` |
| tip 开态 PASS | `qa/out_talisman_open_f89deb4/report.md` |
| 正式试玩包 | **v0.5.5 未动**；本轮**未**跑 `tools/release.sh` |
| 推送远程 | 见下方「推送」；合入后 HEAD = tip `f89deb4` 一线（其后 docs 以远程 HEAD 为准） |

## 正式包开关（features + 表）

| flag / 表 | 正式包现值 |
|-----------|------------|
| `talismanCraft` | **true** |
| `sectRanks` / `sectShopLibrary` / `sectDonations` | **true**（v0.5.5 已开，保持） |
| `lifeSkillCurve` / `spiritScan` | **false**（未开） |
| `gongfa_grades` / `qi_density`（#19+#20） | **enabled=false**（未开） |
| features.json md5 | `cc23e86107b447dea41dac90afd5a9d9` |

## 自测（合入后 master）

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:talisman` | exit 0（craft 446 + use 219 + save 288 + fx 105） |

## 请执法堂

- 工作区：`/workspace/xiantu/game`（master）或 `wt/dev`（同 tip SHA）
- commit：推送后的 **origin/master** HEAD（合入起点 `f89deb4` 一线）
- 建议范围：制符**开态快速回归**，含 `smoke:talisman-ui` / `test:talisman` / tsc；职位三仍开勿回关
- PASS 后炼器阁再发 **v0.5.6**；FAIL 则回告阻断，不发版

## 明确未做

- 未跑 `tools/release.sh`、未打 tag、未更新 gh-pages / releases
- 未开 `lifeSkillCurve` / `spiritScan` / #19+#20
- 未启用无 `?cheat=1` 的作弊器；未回关职位三三开关
