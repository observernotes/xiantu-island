# UI-4 本地合入结果

- 日期：2026-10-15，Asia/Shanghai。
- 工作树：`/workspace/xiantu/wt/dev`；分支：`dev`。合前 dev 与 feat/ui-4 两个工作树均干净，未 stash。
- 已执行 `git fetch origin dev`，成功。
- 合前 HEAD：`c8d69f3b1006c2482a43fb764417511d59d8f374`。
- Fetch 后 origin/dev：`c8d69f3b1006c2482a43fb764417511d59d8f374`，包含 UI-2；dev 已处于该基线。
- 合入提交（merge commit）：`339e37e072c0b5eccc37499f8350cb84d00ed68f`。
- 合入命令：`git merge --no-ff feat/ui-4 -m "merge: feat/ui-4（制符放弃/继续次级按钮 UI-4）"`。
- Merge 第一父提交：`c8d69f3b1006c2482a43fb764417511d59d8f374`；第二父提交（UI-4 tip）：`b88af0e4b5dc526244a6acdc3ee73bfb0c5e70ac`。

## Rebase 与冲突

已在 `/workspace/xiantu/wt/feat/ui-4` 执行 `git rebase origin/dev`，返回 `Current branch feat/ui-4 is up to date.`。无需重放或改写提交，rebase 前后 tip 均为 `b88af0e4b5dc526244a6acdc3ee73bfb0c5e70ac`。

仅合入指定分支的两个提交：

| 提交 | 内容 |
| --- | --- |
| `312b15649682ac3b448b8ab537057c1762e4d560` | UI-4 制符放弃/继续次级按钮功能 |
| `b88af0e4b5dc526244a6acdc3ee73bfb0c5e70ac` | UI-4 本地交付记录 |

Rebase 与 merge 均无冲突；冲突文件：无；无需手工解决。

相对合前 HEAD，仅引入 `src/TalismanPanel.ts`、`src/hud.ts`、`src/XtTestBridge.ts`、`scripts/talisman-ui-smoke.mjs`、`package.json`、`docs/制符放弃继续按钮接入.md`、`UI4_RESULT.md` 共 7 个文件的 UI-4 变更。未合入其他分支，保留基线中的 UI-2 和其他修复，未调整 features 开关。

## 合后自测

以下四项按顺序在 `/workspace/xiantu/wt/dev` 执行，均退出码 0。运行环境：Node v20.19.2、npm 9.2.0。

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `npx tsc --noEmit` | PASS | [tsc.log](/workspace/reports/ui4_merge/tsc.log) |
| `npm run build` | PASS；sync、类型检查、正式构建与 leak-check（903 files）全部通过 | [build.log](/workspace/reports/ui4_merge/build.log) |
| `npm run test:optional-assets` | PASS；100 项断言，fetchCalls=0 | [optional-assets.log](/workspace/reports/ui4_merge/optional-assets.log) |
| `XT_TALISMAN_UI_SHOTS=/workspace/reports/ui4_merge npm run test:smoke:talisman-ui` | PASS；2908 项断言，13 个浏览器上下文，耗时 145.566 秒 | [talisman-ui.log](/workspace/reports/ui4_merge/talisman-ui.log) |

Smoke 覆盖放弃/继续、开始/再来四态，按下/松开/拖出/禁用/恢复/关闭回调，无扣料，内存换表，清单缺图，以及逐件实体 PNG 缺失时的回退和还原。13 个上下文的 consoleErrors、pageErrors、requestFailures、httpErrors 全部为 0。

机器结果：[talisman-ui-smoke.json](/workspace/reports/ui4_merge/talisman-ui-smoke.json)。29 张截图均已核验存在且非空，保存于 `/workspace/reports/ui4_merge/`，包括[放弃按钮](/workspace/reports/ui4_merge/ui4_abandonOrContinue_normal.png)、[继续状态](/workspace/reports/ui4_merge/ui4_continue.png)、[禁用状态](/workspace/reports/ui4_merge/ui4_disabled.png)和[清单缺图回退](/workspace/reports/ui4_merge/ui4_missing_manifest_continue.png)。Smoke 使用隔离 snapshot 工程及独立 preview；临时 PNG 已还原，临时工程已清理。

构建输出有 12 个技能 `@64` 图标缺失并回退、产物 chunk 超过 500 kB 的提示，均未影响通过。`git diff --check` 通过，构建与测试后两个工作树均干净。

## 交付记录

本报告保存至 `/workspace/xiantu/wt/dev/UI4_MERGE_RESULT.md` 与 `/workspace/reports/ui4/UI4_MERGE_RESULT.md`，内容相同；以 `chore: record UI-4 local merge result` 单独提交工作树内报告。

本次仅本地合入，未 push、未 force push、未执行 `reset --hard`、未联系其他 bot，未修改 `~/.codex`、`tools/codex_run.sh`、backlog 或 features 开关。树外 status 由调用方更新，本轮跳过。

`UI4_RESULT.md` 中“未合入 wt/dev”等文字属于功能开发时的历史记录，当前合入事实以上述 merge commit 为准。origin/dev 为本轮 fetch 得到的基线；本报告记录本机检查结果。
