# 制符 UI 烟测 · 开态 preamble 适配 RESULT

更新：2026-10-16 13:54（UTC+8）｜炼器阁·主程序  
**结论：已修 `scripts/talisman-ui-smoke.mjs` 开态 preamble；自测 `test:smoke:talisman-ui` PASS；只推 tip/dev；正式包仍关制符、未发版、未合 master。**

## 根因

执法堂制符开态 `@6c67f6d`：`smoke:talisman-ui` 阶段 `craft-gameplay-save` 约 L503 仍断言  
`openTalismanCraft(...) === false`（「默认开关关闭仍可进入正式制符」）。  
tip 上 `features.talismanCraft===true`，默认即可打开 → `true !== false`，exit 1。  
tsc / `test:talisman` / fx 已 PASS，仅 smoke 阻断。报告：`qa/out_talisman_open_6c67f6d/report.md`。

## 改动

文件：`scripts/talisman-ui-smoke.mjs`（烟测 harness；**未**改玩法 TS / features / 正式包）

| 场景 | 做法 |
|------|------|
| **闭态负例** | 会话开始显式 `setFlag('talismanCraft', false)`，再断言 `openTalismanCraft === false`（文案改为「关闭开关后仍可进入正式制符」） |
| **开态正向** | 其后原有 `setFlag(true)` + loadSave + 绘制/结算/存档路径不变 |
| 其它闭态 | 五宗会话等已显式 `setFlag(false)`，未改 |

合规：改测走 `tools/codex_run.sh sol "…" wt/dev`。

## 自测（`/workspace/xiantu/wt/dev`）

| 命令 | 结果 |
|------|------|
| `npm run test:smoke:talisman-ui` | **PASS**（1519 断言；浏览器错误 0） |

## 分支 / 开关旁证

| 项 | tip（wt/dev） | origin/master / 正式包 |
|----|---------------|------------------------|
| HEAD | 本提交（本 RESULT 对应 tip） | **`ca3e0ee`**（v0.5.5 同线） |
| `talismanCraft` | **true**（临时开态矩阵） | **false** |
| `spiritScan` / #19 / #20 | false | false |
| 职位三（sectRanks/Shop/Donations） | true | true |

- **只** `git push origin dev`
- **未**合 master、**未** `release.sh`、**未**改正式 `data/features.json`
- **未**开 spiritScan/#19#20；**未**回关职位三

## 请执法堂

- 在 tip / `origin/dev` 本提交上重跑制符开态矩阵（含 `test:smoke:talisman-ui`）
- 工作区：`/workspace/xiantu/wt/dev`
- **正式包 / master 仍不开制符；进包等负责人下一令**
