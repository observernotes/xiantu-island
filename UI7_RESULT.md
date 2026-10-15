# UI-7 开发交付（待验收）

- 日期：2026-10-15；worktree：`/workspace/xiantu/wt/feat/ui-7`；分支：`feat/ui-7`。
- 基线：`0c533c2`（已含 UI-6）。
- 实现提交：`ebb765e08ea30a092482749ca2d8f1a148f30727` — `feat(UI-7): add inventory and equipment panels with manual equip interfaces`。
- 本文件在实现提交之后单独提交，以准确记录上述提交号；提交作者沿用环境默认。
- 已完成本地开发与自测；未合入、未 push、未联系其他 bot。未改共享/快照 balance JSON、`~/.codex` 或 `tools/codex_run.sh`。

I 背包、E 装备互斥切换；正式 6×6 背包提供分类、超过 36 种物品的分页、数量、选中穿戴、持炉使用与五宗令入口。装备三槽点击卸下，属性只读 Progress 派生值；成功穿脱保存并同步场景外观和 HP，失败回滚。两窗纳入 modal，覆盖其他窗口、采集/水平移动和首领延迟对白。各件可独立代码回退，新增测试桥仅限测试构建。

接入约定、键位、缺图行为及配合项见 [背包装备窗接入.md](docs/背包装备窗接入.md)。**需主程序过眼 `Progress.equipItem/unequipSlot/changeEquip` 薄接口；需天机阁补 `ui.inv.*` / `ui.equip.*` 文案。** 属性公式、appearance getter、gainEquip 自动掉落逻辑及旧档/导入规则保持兼容。

## 测试结果

| 检查 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS；正式 `xt leak-check PASS (903 files)` |
| `npm run test:optional-assets` | PASS，100 条 |
| `npm run test:appearance` | PASS，588 条 |
| `npm run test:equip` | PASS，100 条；三槽、弱装替换、五宗限制、永久库存、数量守恒、存读/导入、保存失败原子回滚 |
| `npm run test:stats` | PASS，239 条 |
| `npm run test:smoke:inv-ui` | PASS，141 条；50 种物品分页、真实 I/E/鼠标、穿脱/存读/HP/外观、modal、丹炉/五宗令、全代码、G17/G18 |
| `npm run test:smoke:attr-ui` | PASS，76 条 |
| 炼丹原冒烟脚本回归 | PASS，21 项；隔离快照构建/preview，正式背包持炉入口与开关检查 |
| 五宗试炼原冒烟脚本回归 | PASS，30 项；隔离快照构建/preview，正式背包五宗帖选择与完整试炼流程 |
| `git diff --check` | PASS |

UI-7 的 6 个浏览器上下文均 `consoleErrors=0/pageErrors=0/requestFailures=0/httpErrors=0`。G17 关闭钮、G18 窗体实体 PNG 只在隔离 dist 中临时移走，清单保留，请求真实返回 `200 text/html`，两窗独立回退，穿脱、× 关闭与 Esc 仍可用，PNG 已还原。全代码案例额外移除会话内物品图集，验证缺图标文字回退。UI-6、炼丹与试炼回归也无浏览器报错。

## 截图与日志

截图目录：`/workspace/reports/ui7/`（`XT_INV_UI_SHOTS` 可覆盖）。以下 12 张均已生成，并检查了正式布局、全代码及缺关闭图的截图：

- `/workspace/reports/ui7/ui7_inventory_open.png`
- `/workspace/reports/ui7/ui7_inventory_equipped.png`
- `/workspace/reports/ui7/ui7_inventory_page2.png`
- `/workspace/reports/ui7/ui7_inventory_empty.png`
- `/workspace/reports/ui7/ui7_equip_open.png`
- `/workspace/reports/ui7/ui7_equip_removed.png`
- `/workspace/reports/ui7/ui7_inventory_all_code.png`
- `/workspace/reports/ui7/ui7_equip_all_code.png`
- `/workspace/reports/ui7/ui7_inventory_g17_missing.png`
- `/workspace/reports/ui7/ui7_equip_g17_missing.png`
- `/workspace/reports/ui7/ui7_inventory_g18_missing.png`
- `/workspace/reports/ui7/ui7_equip_g18_missing.png`

最终通过日志：同目录 `inv-ui-smoke.log`、`build.log`、`stats.log`、`attr-ui-regression.log`、`alchemy-regression.log`、`trials-regression.log`。隔离冒烟未覆盖本 worktree 正式 dist。

原有未跟踪文件 `.codex_prompt_ui7.txt` 保留，未加入提交。
