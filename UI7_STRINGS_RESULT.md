UI-7 文案快照同步结果（2026-10-15）

分支：`feat/ui-7`；基线：`a24501119605030d9b8ead099355bac36047fc5a`。

文案与断言提交：`f6cf311d6bda26809bfb9a858ea49c77ffb0293c`

提交信息：`chore(data): sync UI-7 ui.inv.* / ui.equip.* strings into snapshot`

从 `/workspace/xiantu/balance/strings_zh.json` 向本 worktree 的
`data/balance/strings_zh.json` 尾部追加指定的 37 条文案：`ui.inv.*` 16 条、
`ui.equip.*` 21 条。逐项校验值与共享表一致，原有 691 条 key/value 全部保留，
JSON 合法；除指定 37 条外没有新增、删除或更改其他条目。

`scripts/inv-ui-smoke.mjs` 增加最小断言，检查上述 37 个 key 在快照中均为非空字符串。
窗体逻辑已使用 `label(key, 中文兜底)`，无需修改。

自测均通过（退出码均为 0）：

- `npx tsc --noEmit`：通过。
- `npm run build`：通过；`xt leak-check PASS (903 files)`。
- `XT_INV_UI_SHOTS=/tmp/xiantu-ui7-strings-a245011 npm run test:smoke:inv-ui`：
  通过，共 178 条断言（含新增的 37 条快照文案断言）。冒烟使用隔离快照构建，
  6 个浏览器场景的 console/page/request/HTTP 错误均为 0；G17/G18 实体缺图回退通过。
- 与基线比较的专项校验：恰好新增指定 37 条、全部等于共享值、原有 691 条完全不变；
  `git diff --check` 通过。

未运行 `npm run snapshot`，未整表覆盖，未合入或 push。
本记录通过后续独立文档提交保存；上面的提交号指文案与断言提交。
