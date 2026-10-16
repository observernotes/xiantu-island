# 神识烟测 · 开态 preamble 适配 RESULT

日期：2026-10-16（UTC+8）｜工作区：`/workspace/xiantu/wt/dev`
基线：`9746ef3`；tip：本提交（`dev`）。

**结论：对照 talisman `dbe0a36`，关态负例先显式关闭会话内 flag，再断言 unavailable；sense smoke PASS。仅本地提交，勿发版、勿 push。**

## 原因与对照

执法堂神识进包 `@9746ef3` FAIL：首个 session 假定 bake 默认 `spiritScan=false`，但正式包已开 `spiritScan=true`，首条断言实际得到 `sense.block.busy`，预期为 `sense.block.unavailable`。

`dbe0a36` 在 talisman 负例前显式 `setFlag('talismanCraft', false)`，并将断言文案改为「关闭开关后…」。本次沿用该方式，使关态负例不再依赖包内默认开关；只改浏览器测试会话内状态，正式包 `spiritScan=true` 保持。

## 改动位置（修改后行号）

仅改 `scripts/sense-smoke.mjs` 三处：

| 行 | 改动 |
|---|---|
| L95 | 首个 session 创建后、`senseScan` 与 unavailable 断言前，新增 `await page.evaluate(() => window.__xt.setFlag('spiritScan', false));` |
| L100 | 断言文案改为「关闭开关后 requestScan 必须 unavailable」 |
| L108 | checks 文案改为「关闭开关后 unavailable…」 |

第二段 L113 原有 `setFlag('spiritScan', true)` 及后续内容逐字未改。未改玩法源码、features、sense 表、maps、monsters 或其他文件的逻辑；新增文档仅本 RESULT，未改 status。

## 验证

| 命令 | 结果 |
|---|---|
| `node --check scripts/sense-smoke.mjs` | PASS |
| `XT_DATA=snapshot npm run build:test` | PASS（含 tsc；仅本地测试构建） |
| `XT_DATA=snapshot npm run test:smoke:sense` | PASS：118 断言；consoleErrors=0、pageErrors=0；首段关态及后续开态、fallback 均通过 |
| `git diff --check` | PASS |

## 交付边界

- 本提交只含 `scripts/sense-smoke.mjs` 与本 RESULT；原有未跟踪 `TALISMAN_UI_STRINGS_MERGE_RESULT.md` 保留，不纳入提交。
- `data/features.json` 的 `spiritScan` 仍为 `true`，未回关正式包开关。
- 仅在 tip/dev 本地提交；未合 master、未发版、未运行 `tools/release.sh`、未打 tag、未 push（由外层 push）。
