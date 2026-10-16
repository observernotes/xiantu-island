# v0.5c 关态骨架结果

执行：炼器阁·主程序；时间：2026-10-16 14:53（Asia/Shanghai）。

- 分支：`feat/v05c-closed-skeleton`
- 基线：`origin/dev@005b33ff938e35867297f86ab3b5cf28e5fc5c69`
- feat 实现 SHA：`d3eda7fdfa21a4565d154a9c04d08e46346318a7`
- 本 RESULT 与 status 在实现提交后另作文档提交；最终分支 HEAD 以 `git rev-parse HEAD` 为准。

结论：奇遇、好感、正魔 questHooks 已完成关态最小接入。三块配置经 `data.ts` 统一加载、校验并建立独立深冻结快照；坏表返回 `config:null` 和字段路径诊断，仅停止对应新查询。正式表保持全关，未接入游戏场景或存档结算。

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/Encounter.ts` | `parseEncountersConfig` 校验规则及事件关键结构；`listEncounters` 返回已加载元数据；预览 unavailable、触发 rejected |
| `src/Affinity.ts` | `parseAffinityIndex` 收录显式 affinity 块；只读查询/增量预览不可用、应用被拒；仅预留 `SaveAffinity` 类型 |
| `src/QuestHooks.ts` | `parseQuestHooks` 校验两题与 choices/hooks；预览 unavailable、结算 rejected；沿用既有两轴归属，不另建边界或第三轴 |
| `src/data.ts` | 经 `@xt` 加载并导出 `ENCOUNTERS` / `AFFINITY` / `QUEST_HOOKS` 及各自 `*_ERRORS`；保留原 `MORAL_STATE` |
| `src/encounter.test.ts`、`src/affinity.test.ts`、`src/quest-hooks.test.ts` | 真表、关态、坏表、深冻结、独立快照、禁止上下文读取及无状态副作用检查 |
| `scripts/encounter-test.mjs`、`scripts/affinity-test.mjs`、`scripts/quest-hooks-test.mjs` | snapshot/shared 各跑真表与内存坏表注入，不修改 JSON |
| `package.json` | 新增 `test:encounter` / `test:affinity` / `test:quest-hooks` |
| `reports/炼器阁/V05C_CLOSED_SKELETON_RESULT.md`、`status/炼器阁.md` | 验收记录及覆盖状态 |

## 关态证明

快照 `data/balance/` 与共享 `/workspace/xiantu/balance/` 均通过 Python 断言，且下列五表与基线逐字节一致：

| 表 / 门禁 | 登记数量 | enabled:false | enabled:true |
|---|---:|---:|---:|
| encounters 事件 | 5 | 5 | 0 |
| npcs.affinity 根块 | 9 | 9 | 0 |
| npcs.affinity.gifts | 9 | 9 | 0 |
| karma_flags.questHooks（也是全表所有 enabled） | 2 | 2 | 0 |
| gongfa_grades（#19，含绑定/future） | — | 46 | 0 |
| qi_density（#20，含 display/meditation/gathering） | — | 4 | 0 |

- `data/features.json` 与基线字节一致；`lifeSkillCurve:false`，未新增或开启任何 flag。
- 奇遇列表仍可读到五条 id/nameKey/maps/enabled 元数据。关态预览为 `{status:'unavailable',reason:'disabled'}`，触发为 `{status:'rejected',reason:'disabled'}`。
- 好感九块均已加载，get/preview 返回 unavailable，apply 返回 rejected；没有好感块的 NPC 返回 missing，不补零、不隐式初始化。
- 两题所有选项的 preview 均 unavailable，settle 均 rejected；门禁先于选项及状态读取。`daoHeart`、`morality`、`karmaFlags` 保持原值。
- 所有操作 API 都显式接收 config，避免数据模块循环依赖；无配置为 invalid、缺登记为 missing。测试使用会抛错的上下文/存档 Proxy 验证短路。
- 内存克隆开启门禁后仍返回 `not_implemented`；未实现脚本步进、战斗、发奖、好感成长或选择题结算。
- `src/Progress.ts`、`src/GongfaGrades.ts`、`src/QiDensity.ts` 与基线字节一致；未接地图刷锚、UI、任务奖励或真实存档读写。

## 自测

| 命令 | 结果 |
|---|---|
| `npm run sync` | PASS；生成本地忽略的素材清单供类型检查/SSR 使用，未更新数据快照 |
| `npx tsc --noEmit` | PASS |
| `npm run test:encounter` | PASS；snapshot/shared 各 200 条断言，并分别通过坏表注入 |
| `npm run test:affinity` | PASS；snapshot/shared 各 154 条断言，并分别通过单块好感坏表注入；原 NPC/任务数据仍可用 |
| `npm run test:quest-hooks` | PASS；snapshot/shared 各 152 条断言，并分别通过坏 hooks 注入；原两轴配置/Progress 初值/存档数据不受影响 |
| `npm run test:moral-save` | PASS；153 条断言 |
| `npm run test:gongfa-qi-legacy` | PASS；752 条断言、540 个战斗场景、60 个闭关场景 |
| `npm run test:v05` | PASS；451 条断言 |
| `python3` 内联只读断言 | PASS；共享/快照启用计数、五表与基线字节一致、features/Progress/既有两模块未变、lifeSkillCurve 关闭 |
| `git diff --check`、`git diff --cached --check` | PASS |

仅完成本地 feat 与文档提交；未 push、未合 master 或 tip/dev、未发版，未修改 `tools/codex_run.sh`。开态玩法和任何启用操作仍需后续任务。

## 天机对照（合 tip 时补记）

- 已对照 `reports/天机阁/20261016_v05c关态_09_10与主线文案抽检.md`：表齐、enabled 仍 false、运行时由本骨架关态接入。
- 已对照 `reports/天机阁/20261016_v05b收尾_lifeSkillCurve口径与炼丹文案.md` + `design/12`：**lifeSkillCurve 保持关**，关态等同无等级；本骨架未开该开关、未改 features。

## tip 合入

- 已 ff 合入 origin/dev；实现 SHA：`6c1f957df8c706d7e8cf6eeb36fa4b90f583b6fd`；最终 tip SHA：`60b47594e46ad4174dabb3561a603c5a1943618f`（Asia/Shanghai 2026-10-16）。
- 已对照天机 `20261016_v05c关态_09_10与主线文案抽检.md`、`20261016_v05b收尾_lifeSkillCurve口径与炼丹文案.md` + design/12。
- lifeSkillCurve 仍 false；encounters/affinity/questHooks 全 enabled:false；未发版。
