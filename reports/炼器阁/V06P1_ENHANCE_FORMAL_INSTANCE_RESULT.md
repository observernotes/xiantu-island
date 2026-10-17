# P1③+++ 强化正式实例源 · RESULT

2026-10-17｜炼器阁·主程序｜负责人令经项目经理执行。

已完成默认正式 Forge 完整结果到本档强化实例登记、无 fixtureInstances 的生产授权及 O01–O08 程序自检。实现 tip：`4644e96c530a592c2966798805e92a304f1c907a`；文档 tip/origin/dev 最终 HEAD 见回执及 `qa/out_v06p1_enhance_formal_instance/final-tip.json`。

```json
{"formalTipsWired":true,"formalInstanceSource":true,"softOpenedEntrance":true,"released":false,"formalOpen":true,"softOpened":true,"closedFixtureOnly":true}
```

兼容 formalOpen/softOpened 沿用只读入口状态；**实例源已接线 ≠ soft-open 进包；PASS ≠ soft-open ≠ release ≠ 进包**。未运行 build/sync/release。

## 已交行为

Forge 默认正式配方完整 committed 成品、库存、receipt 与正式登记同一存档事务可见；中断整笔回滚。实例初始 0 级，ref 原样来自 `${craftResultRef}:item`，附可持久化来源证明绑定本档 Forge ledger/receipt 和 ownerSlot。正式 API 自核配方、装备资格与持有数量，不能升级历史夹具袋。现行青竹剑合法来源已跑通；未从数量或装备槽补造旧装备身份。

默认 EnhanceGate 只选本档正式登记；显式 fixture 集封闭且不能改写同名正式 ref。成功至正式 maxLevel12、目标 +5/+6 无符失败、费用/最终属性/去重同次提交、六种载荷保存读回/刷新、跨槽 foreign 均已验证。true 护符仍 protect 整笔拒绝；附灵/分解仍 later_service。首次异步事务固定槽位；同运行图按槽互斥及持久化 enhance 快照校验补齐双独立 Progress 竞争和旧对象重试。GameScene 未改，保留既有只读冒烟，无夹具注入。

## 全部自检 exit 0

| 命令 | 断言/结果 |
|---|---|
| npx tsc --noEmit | PASS |
| npm run test:v06p1-enhance-open | 11,259 |
| npm run test:v06p1-enhance-closed | 30,769 |
| npm run test:v06p1-forge-open | 6,378 |
| npm run test:v06p1-forge-closed | 20,401 |
| npm run test:v06p1-market-closed | 24,186 |
| npm run test:v06d-closed | 15,055 |
| npm run test:v06c-closed | 10,712 |
| 双根 datalint | shared/snapshot 各问题 0 |
| git diff --check | PASS |

七套件合计 **118,760** 断言。O01–O08 具体映射、并发验证范围及下一棒见 [HANDOFF](V06P1_ENHANCE_FORMAL_INSTANCE_HANDOFF.md)。旧 formal C 表、memory-closed 与 fixture 成功/失败能力保留。

QA：[本窗目录](../../qa/out_v06p1_enhance_formal_instance/)，逐命令见 `*.result.json`，汇总见 `selfcheck-summary.json`。保护前后文件及旧 QA 集合比对见 `protected-before.json` / `protected-after.json` / `prior-evidence-before.json` / `protection-check.json`。所有子进程 stdin=/dev/null，回归专用输出均定向本窗。

## 保护 SHA（写前=写后）

| 文件 | SHA-256 |
|---|---|
| EnhanceOpenFlag.ts，仍 true | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e |
| ForgeOpenFlag.ts，仍 true | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e |
| enhance.json | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 |
| recipes.json | 1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f |
| items.json | 6eb2434a31613ea3f60eaaf15906b565d2254364b1dc4f9bea96b244a8fc3b6c |
| materials.json | 0cc03119172aaf4576eb29f9cbb0b6bf8965715b9e84a512ef25ce7b34eb640e |
| npcs.json | 2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6 |
| life_skills.json | 204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b |
| shared/wt strings，944 键 | d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09 |

三根 balance/maps/features、src/data 与两 Flag 共 257 文件保护；未授权差异 0。旧强化/Forge/坊市/v06c/v06d QA 共 486 文件的字节与集合保留。GAME_PHASE=5，gifts 10×false。仅暂存本窗源码、必要 runner 兼容、新 QA 和本次报告/status；art pending、dist-test、旧 QA 待审 dirty 未纳入；未 force-push、未 reset --hard。

Codex：`/workspace/xiantu/logs/codex/fdf021ccbbe110dd_20261017_095713_1332777.log`；本窗 `codex_launch.log` 为运行中日志保留本地。HANDOFF/RESULT/status UTF-8 同步到 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。

无程序自检阻断。下一棒交执法按 design/27 §4.3 O01–O08 独立抽检；PASS 后由负责人另令 soft-open。护符有效保级成功、附灵/分解、阵法、gifts/#20、拍卖/坊市均未混窗。
