# UI-4 本地交付结果

- Worktree：`/workspace/xiantu/wt/feat/ui-4`，分支 `feat/ui-4`，基线 `c8d69f3`（含 UI-2）。
- 功能提交：`312b15649682ac3b448b8ab537057c1762e4d560` — `feat(UI-4): talisman abandon/continue secondary button art`。
- 开发自测日期：2026-10-15，Asia/Shanghai。
- 仅本地提交；未 push、未合入其他分支、未联系其他 bot。

## 实现范围

先经 `rg` 核实原代码没有完整制符窗/正式制符入口，本次新增 `src/TalismanPanel.ts` 最小受控窗壳，复用 bestiary 窗体、标题、内框和关闭钮。`preloadHud` 加载 `talisman_ui.json` 到 JSON 缓存。

「放弃画符/继续画符」读 `detail.buttons.abandonOrContinueImage`：normal 对话选项 normal，hover/pressed 对话选项 selected，disabled 对话选项 disabled；`hud/` 映射实际纹理 key。九切片与 normal/disabled 字色读取该字段，坐标读取 `abandonOrContinue`，当前 `[342,346,112,28]`。主按钮「开始制符/再来」继续读 `detail.buttons.image/nineSlice/startOrAgain`，使用 alchemy 按钮图。未修改素材或把主按钮换成对话图。

相关图片沿用 UI-2 `preloadHud` 与 `preloadAlchemy` 的 `loadOptionalImage`；按状态/部件独立回退代码矩形或 ×，保留禁用与交互。鼠标按下显示 pressed，松开执行一次意图；拖出取消；disabled 无交互区域。按钮只发动作，不扣料、不判品质、不发奖；关闭请求也留给控制器决定是否确认。

测试桥提供 `openTalismanPanel`、`setTalismanPanelState`、`setTalismanButtonDisabled`、`talismanSnapshot`（含 artUsed、实际切片/矩形/纹理/状态及 actions）。只在测试构建实例化窗壳，无正式 NPC/快捷键入口。

接入与主程序接口说明：[docs/制符放弃继续按钮接入.md](docs/制符放弃继续按钮接入.md)。

没有修改 GameScene、Progress、共享/快照 balance、features 开关、`~/.codex` 或 `tools/codex_run.sh`。

## 实际自测

| 命令/检查 | 结果 |
| --- | --- |
| `npm run sync` | PASS，当前 feat 分支按既有规则同步共享素材 |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS，含 sync、tsc、正式 Vite 构建 |
| 正式 `xt-leak-check` | PASS，903 files |
| `npm run test:optional-assets` | PASS，100 assertions，fetchCalls=0 |
| `npm run test:smoke:talisman-ui` | PASS，2908 assertions，13 个浏览器上下文，216618ms |
| `node --check scripts/talisman-ui-smoke.mjs`、`git diff --cached --check` | PASS |

同步时仍有原有 12 个技能 @64 图片缺失跳过提示，Vite 仍有大 chunk 提示；命令均正常退出。

smoke 使用独立 snapshot 临时工程和独立 preview，不覆盖本树正式 dist 或修改共享素材。验证放弃/继续、开始/再来四态、九切片、坐标、字色、点击/松开/拖出、禁用/恢复、×/Esc 及材料/灵石不变。另修改浏览器内存中的制符 JSON 缓存，确认窗口尺寸、两组按钮坐标、各自切片、图片引用和字色均读表。

缺图覆盖全部 11 张相关图片一起移出浏览器清单（无请求），以及 11 张 PNG 逐件移走临时 dist 实体、保留清单（preview 返回 200 text/html，静默解码失败）。逐状态断言只有缺件回退，其他部件仍用 art。文件均在 finally 中还原，临时工程与 preview 已清理。

13 个上下文原始 **console.error=0、pageerror=0、requestfailed=0、HTTP error=0**，未过滤浏览器错误。机器报告：[talisman-ui-smoke.json](/workspace/reports/ui4/talisman-ui-smoke.json)。

## 截图

截图目录 `/workspace/reports/ui4/`，共 29 张。主要复核入口：

- [放弃 normal，主按钮保持炼丹皮肤](/workspace/reports/ui4/ui4_abandonOrContinue_normal.png)
- [放弃 hover / selected](/workspace/reports/ui4/ui4_abandonOrContinue_hover.png)
- [放弃 pressed](/workspace/reports/ui4/ui4_abandonOrContinue_pressed.png)
- [放弃 disabled](/workspace/reports/ui4/ui4_abandon_disabled.png)
- [继续 normal / 再来](/workspace/reports/ui4/ui4_continue.png)
- [继续 disabled](/workspace/reports/ui4/ui4_disabled.png)
- [清单缺图 normal 回退](/workspace/reports/ui4/ui4_missing_manifest_abandonOrContinue_normal.png)
- [清单缺图 hover 回退](/workspace/reports/ui4/ui4_missing_manifest_abandonOrContinue_hover.png)
- [清单缺图 disabled 回退](/workspace/reports/ui4/ui4_missing_manifest_disabled.png)

其余包含主按钮四态、清单缺图状态和 11 件实体缺图时的整窗截图，完整列表见机器报告。

## 是否需要主程序补制符逻辑

**需要。** 本次 UI-4 界面件可通过测试桥独立验收；正式制符仍需主程序接入入口与控制器，提供预检/按钮状态、放弃及退出二次确认、attemptId/扣料持久化、QTE、独立 UI Scene 的暂停及 modal 输入隔离、品质与幂等入包结算、中断恢复。确认文案与不退料语义参考 `design/12_制符一期.md`；动作回调不代表已经确认或结算。本次没有实现这些完整玩法，也没有联系主程序 bot。
