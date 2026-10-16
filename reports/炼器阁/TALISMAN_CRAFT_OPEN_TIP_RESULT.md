# 制符 · tip 临时开态 RESULT

更新：2026-10-16 13:48（UTC+8）｜炼器阁·主程序  
**结论：origin/dev tip 已临时打开 `talismanCraft`；正式包 / master / v0.5.5 未动。**

## tip / 范围

| 项 | 内容 |
|----|------|
| 起始 tip | `ca3e0ee`（与 master / v0.5.5 同线） |
| 本提交 tip | 见下方 push 后 SHA（本 RESULT 随提交进 tip） |
| 工作区 | `wt/dev`（branch `dev`） |
| 正式试玩包 | **v0.5.5** 未动（不开制符、不合 master、不发版） |
| 目的 | 交执法堂做制符开态正向矩阵；进包等负责人下一令 |

## 改了哪些 flag / 表

### features.json（tip 管）

| flag | 原值 | 现值 |
|------|------|------|
| `talismanCraft` | false | **true** |
| `sectRanks` / `sectShopLibrary` / `sectDonations` | true | **未改**（正式包已开，tip 保留） |
| `spiritScan` / `lifeSkillCurve` | false | **未改** |
| #19 `#20`（`gongfa_grades` / `qi_density` 根 enabled） | false | **未改** |

### 表 / NPC

- 制符文案、NPC `talisman_craft`、纸货架此前已接入，**本轮未改 balance 表**。
- 无额外制符专用根 `enabled` 门禁需开（仅 `features.talismanCraft`）。

### 测试断言（开态对齐）

- `scripts/talisman-fx-test.mjs`：序言由「release talismanCraft remains false」改为 tip 临时开态期望 `talismanCraft === true`（Codex `sol`）。
- 单测夹具（`talisman.test.ts` / `talisman-use` / `talisman-save` 等）本就手设 flag，关态负例保留；**未改玩法源码**。

## 自测

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:talisman` | exit 0（snapshot+shared craft/use/save + fx 105） |
| `node scripts/talisman-fx-test.mjs` | exit 0（105 断言） |

## 请执法堂

在 tip 开态下跑**制符开态正向矩阵**建议范围：

1. **学习 / 制符入口**：灵符阁墨符使等对话出现学习/制符菜单（关态无菜单）
2. **制符面板**：选方、耗材、绘制、品质产出、中断/恢复
3. **用符**：火符投射/命中、护符环绕、聚气 buff、回城施法与落地（含回城地图字段）
4. **任务**：`q_talisman_intro` 可接；关态负例可 fixture 验证
5. **回归边界**：职位三（晋升/贡献店/上交）仍开；`spiritScan` / #19+#20 / `lifeSkillCurve` 仍关；**正式包不开制符**

工作区：`/workspace/xiantu/wt/dev`；拉 `origin/dev` 最新 tip。

## 明确未做

- 未 push master、未 ff master、未跑 `release.sh`、未改 v0.5.5 发布物。
- 未开 `spiritScan` / `lifeSkillCurve` / `gongfa_grades` / `qi_density`。
- 未回关职位三三开关。
