# Y10 修复结果

修复提交：`e5219e9` — `fix(Y10): atomically settle quest completion and rewards`；已推送 `origin/dev`。本记录随后以独立提交一并推送，保留上述修复 SHA 供追溯。

工作区：`/workspace/xiantu/wt/dev`；开工检查工作树干净，HEAD 为 `0c533c2`。

修法：非日常交付在同步事务中完成扣料、突破、任务 done、授职及全部奖励，静默嵌套 save 后只提交一次完整存档；保存或授职失败恢复全部当前内存数据，允许重试，成功后才通知 UI。

改动文件：

- 源码：`src/Progress.ts`、`src/QuestSystem.ts`、`src/scenes/GameScene.ts`、`src/XtTestBridge.ts`。
- 测试：`src/quest-rewards.test.ts`、`src/class-entry.test.ts`、`src/trials.test.ts`、`scripts/classes-test.mjs`。
- 收据接口适配：`scripts/classes-smoke.mjs`、`scripts/daily-smoke.mjs`、`scripts/v05-smoke.mjs`。
- 验证产物：`qa/out_trial5_y10/` 下的 `storage-delivery.mjs`、`report.md`、`build-source.json`、`normal-once.json`、`first-write-success.json`、`all-writes-fail-retry.json`、`results.json`、`storage-delivery.log`、`build-test.log`、`test-classes.log`、`test-trials.log`、`test-daily.log`、`test-stats.log`、`test-features.log`、`tsc.log`、`verification.log`。
- 交付记录：`Y10_RESULT.md`。

关键命令均通过，完整摘要见 [verification.log](qa/out_trial5_y10/verification.log)：

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `XT_DATA=snapshot npm run build:test` | exit 0；本树 dist，正式 features 保持原样 |
| `npm run test:classes` | classes 12318、Y10 128、class-entry 1615、sect-entry 672 条断言 |
| `npm run test:trials` | 511 条断言 |
| `npm run test:daily` | 575 条断言 |
| `npm run test:stats` | 239 条断言 |
| `XT_DATA=snapshot npm run test:features` | 137 条断言，console/page errors=0 |
| `XT_DATA=snapshot node qa/out_trial5_y10/storage-delivery.mjs` | 正常、首写成功后续失败、全失败补领三路径 PASS |
| `node --check scripts/{classes,daily,v05}-smoke.mjs`（分别执行） | 全部通过 |
| `git diff --check` | 通过 |

浏览器通过本树快照构建、独立 preview 4698 与真实 Z 对话交付验证；只在测试会话覆盖五宗入口开关。首写成功后续失败，首次刷新仍为 done / taixu_acolyte / 710 灵石 / Lv12 exp273；全部写盘失败时内存回滚、磁盘不变，刷新仍 active / 未入宗 / 560 灵石 / Lv11 exp342，恢复后可补领一次。正常与重试成功后，再刷新、再重谈均不重复发奖；console/page/http errors=0。交付事务只有一次真实写盘，dialog 收尾可再保存完整状态。

证据：[浏览器报告](qa/out_trial5_y10/report.md)、[结构化结果](qa/out_trial5_y10/results.json)、[故障轨迹](qa/out_trial5_y10/first-write-success.json)、[全失败与补领](qa/out_trial5_y10/all-writes-fail-retry.json)。`build-source.json` 的 revision 为构建时基准提交；其中修复源码 SHA256 已核对与 `e5219e9` 完全一致。

首次 features 与构建并行时等待页面启动超时，完成 snapshot 构建后重跑通过。未运行完整 tier1。

Codex 日志提示：本次运行完整日志位于 `/workspace/xiantu/logs/codex/2e24367372736875_20261015_193007_2248508.log`；测试与复现的小型日志已随 `qa/out_trial5_y10/` 提交。
