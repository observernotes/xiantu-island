# UI-2 本地交付结果

- Worktree：`/workspace/xiantu/wt/feat/ui-2`，分支 `feat/ui-2`，基线 `d449ad0`（已含 UI-7）。
- 功能提交：`f94f8ef0e199a20dd78de44cfb2098c3066f9334` — `feat(UI-2): dialog option three-state slices`。
- 开发自测时间：2026-10-15，Asia/Shanghai；Node v20.19.2，Google Chrome 154.0.8037.97，无头 Chromium + SwiftShader。
- 仅本地提交；未 push、未合入 wt/dev，未联系其他 bot。

## 实现

`UI.ts` 将对话选项改为 selected/normal/disabled 三态。按钮保留对白框上方纵排、宽 592、换行行高、分页、数字键 1–5、disabled 拦截和 rankIcon。首个可用项默认选中，悬停切换并保留焦点；选中项左侧显示金 ▶，坐标为按钮左缘 −14、按钮中心 y。切片使用 `hudSpec/sliced` 从 `nineSlice/slice` 读取，文字 size/color/x 读取当前状态的 HUD 配置。

`hud.ts` 对三态和 cursor 分别使用 `loadOptionalImage`。缺单件时只让对应状态/光标回退代码画；矩形维持原填色/字色，缺 cursor 则画金色 ▶。旧 borrowed `ui_hud_dialog_option` 记录未改。同步后确认四件都在 public 与 uiImages；正式共享素材、public 副本和已提交快照的四件 PNG SHA-256 一致。

GameScene、Progress、QuestSystem、共享/快照 balance JSON、strings 均未修改；未改 ~/.codex 或 tools/codex_run.sh。仅 `XtTestBridge.ts` 新增测试构建专用 `openDialogChoices` 夹具，供真实 choose/分页/键鼠 smoke 使用。

接入说明：[docs/对话选项三态接入.md](docs/对话选项三态接入.md)。

## 实际执行的自测

| 命令/检查 | 结果 |
|---|---|
| `npm run sync` | PASS；共享正式图同步，四件 uiImages 登记齐全 |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS；含再次 sync、tsc 和正式 `VITE_XT_TEST=0` 构建 |
| 正式 `xt-leak-check` | PASS，903 files |
| `npm run test:optional-assets` | PASS，100 assertions，fetchCalls=0 |
| `npm run test:smoke:dialog-ui` | PASS，171 assertions，6 个浏览器上下文，约 67.6 秒 |
| `node --check scripts/dialog-option-smoke.mjs`、`git diff --check` | PASS |

sync 仍提示原有 12 个技能 @64 PNG 缺失并跳过；正式 Vite 仍有大 chunk 提示，均未影响退出状态。

smoke 在临时 snapshot 工程构建并启动独立 preview，未覆盖本树正式 dist。自动断言实际对象为 NineSlice、三态纹理/字号/字色/缩进、按钮高度/布局、cursor 的 −14 坐标及原点；覆盖 rankIcon、默认跳过禁用项、全禁用菜单、真实悬停/点击/数字键/Esc、8 项分页与翻页焦点重置。另改浏览器内存中的 slice 数组、素材高度与文本配置，确认切片和排版读表。

缺图覆盖：四件一起从浏览器收到的清单移除，断言无请求、全代码回退且可选择；四件分别移走临时 dist 的 PNG，清单保留，逐个确认收到 **200 text/html** 后解码失败并静默按件回退，其余部件继续使用 art。四份临时 PNG 均已 finally 还原，临时工程已清理。

六个上下文原始 **console.error=0、pageerror=0、requestfailed=0、HTTP error=0**，未过滤或屏蔽浏览器错误。可复核机器结果：[dialog-ui-smoke.json](/workspace/reports/ui2/dialog-ui-smoke.json)。以上是本次环境的开发自测事实；正式验收和其他设备上的视觉/输入结论仍待验收方确认。

## 截图

默认目录 `/workspace/reports/ui2/`，共 10 张；可用 `XT_DIALOG_UI_SHOTS` 覆盖。

- [三态整体布局](/workspace/reports/ui2/ui2_three_states.png)
- [normal](/workspace/reports/ui2/ui2_normal.png)
- [selected + cursor](/workspace/reports/ui2/ui2_selected.png)
- [disabled](/workspace/reports/ui2/ui2_disabled.png)
- [分页](/workspace/reports/ui2/ui2_paged.png)
- [清单缺图：全代码回退](/workspace/reports/ui2/ui2_missing_fallback.png)
- [selected PNG 缺失](/workspace/reports/ui2/ui2_missing_ui_hud_dialog_option_selected.png)
- [normal PNG 缺失](/workspace/reports/ui2/ui2_missing_ui_hud_dialog_option_normal.png)
- [disabled PNG 缺失](/workspace/reports/ui2/ui2_missing_ui_hud_dialog_option_disabled.png)
- [cursor PNG 缺失](/workspace/reports/ui2/ui2_missing_ui_hud_cursor.png)

## 是否需要主程序补对话选项逻辑

**本次 UI-2 无需主程序补逻辑即可验收。** 当前 choose/selectChoice/分页/disabled/reason/rankIcon 接口已足够。

若后续要“上下键切换焦点、确认键执行焦点项”，需要主程序提供：按 modal 约束分发上下键/确认键的入口、焦点移动/确认调用约定，并确定 ↑ 与现有对白 advance 的优先级及确认键规则；数字键直接选择应保留。本次按需求使用默认首个可用项 + 鼠标悬停选中，没有扩展上下键输入语义，也没有私聊主程序。
