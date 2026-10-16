# tier1 smoke:classes 正魔任务选择双态修测结果

日期：2026-10-16（Asia/Shanghai）

TIP_SHA：`bbb6ed594f8181aa36cf538a9edf5820969c0060`（修复与验收提交；后续文档提交仅写本报告及短状态，最终推送 tip 见 stdout）

工作区：`/workspace/xiantu/wt/dev`；交付分支：`origin/dev`。

起始已执行 `git fetch && git pull --ff-only origin dev`，基线为 `bc01f3de79f7251faa3e522b20f3a9ebed2998d4`，包含原失败点 `d44fb17`；提交前再次同步，仍为最新。

## 确认与根因

**确认与正魔翻表相关。** 正式 `sect_tianjian_sword.enabled=true`，对应 `q_sect_tianjian`。`talk()` 通过 `onTalk` 推进交谈目标，其 `after` 调用 `turnIn(id)` 不带 choice。双轴就绪且 hook 开态时，该调用保留 active 节点等待玩家选择，是既定产品语义。原职业冒烟直接期待 done，导致误报。

Vite SSR 已复现：正式开态下 `talk().after()` 返回 undefined、任务仍 active；随后显式 `protect` 返回奖励、任务 done、职业为 `tianjian_disciple`。关闭 hook 的内存夹具中，原无 choice 对话路径直接 done，且无选择收据。

## 修法与范围

采用**显式 choice**，保留关态旧路径：

- `scripts/classes-smoke.mjs`：读取同一快照的正式 hook 门禁；对话先推进目标，再检查无 choice 开态 active／关态 done；开态显式 `turnIn(id, false, 'protect')`，检查 done、选择收据、授职、赠技、奖励及存档保护。
- `scripts/sect-growth-smoke.mjs`：保留真实长老菜单与对白，先确认无 choice 未替玩家选择，再在开态显式 protect；保留双轴未就绪时的旧交付语义。
- `src/class-entry.test.ts`、`src/sect-entry.test.ts`：开态先验证无 choice 保留 active、不发奖、不写盘，再显式 protect／seek_dao；关态继续原路径。
- 完整 `test:classes` 又暴露同因的 `scripts/classes-test.mjs`、`src/classes.test.ts`、`src/quest-rewards.test.ts`，一并补显式选择，使授职及原子写盘用例实际进入奖励事务。

仅修改上述 7 个测试文件。未改 `QuestSystem.ts`、`QuestHooks.ts`、`talk()`、UI、features 或 karma 正式 enabled；未翻 #19／#20／lifeSkillCurve／gifts。额外关态回归仅由 Vite 内存插件注入，正式 JSON 保持不变。他人未跟踪美术目录 `data/art/sprites/_pending/secret_rest_r1/` 保留且不提交。

## 测试摘要

| 验证 | 结果 |
| --- | --- |
| `XT_DATA=snapshot npm run build` | PASS；含 TypeScript、Vite 正式包及 xt leak-check（938 文件） |
| `npm run test:smoke:classes` | PASS；5 职业、15 次技能施放；天剑 noChoiceState=active → protect → done；console/page/request 错误均 0 |
| `npm run test:quest-hooks` | PASS；snapshot/shared 各 756 hooks + 295 turn-in 断言，且两模式坏表回归通过 |
| `npm run test:classes` | PASS；runner 3994、classes 9204（630 DPS 场景）、quest-rewards 128、class-entry 1751、sect-entry 1490，共 16567 断言 |
| Vite SSR 内存关态夹具 | PASS；classes 9200、quest-rewards 128、class-entry 1747、sect-entry 1486，共 12561 断言；正式数据未改 |
| `XT_DATA=snapshot npm run build:test` | PASS |
| `XT_DATA=snapshot SMOKE_PORT=4215 npm run test:smoke:sect-growth` | PASS；5 天 15 日常、贡献 500、内门晋升、兑换、刷新保留、上交限额与跨日重确认；console/page/request/http 错误均 0 |
| `npx tsc --noEmit`、3 个脚本 `node --check`、`git diff --check` | PASS |

本机日志：`/tmp/xiantu-smoke-classes-questhook/`，含 `build.log`、`classes-smoke.log`、`classes-closed-ssr.log`、`build-test.log`、`sect-growth-smoke.log`。

交付采用普通 `git push origin dev`；无 force push。
