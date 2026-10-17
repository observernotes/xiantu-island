# P1③+++ 强化正式结算 · soft-open RESULT

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜负责人令经项目经理执行。

**正式实例源 soft-open 已固化；softOpenedFormalSettle:true，released:false；PASS≠进包≠发版。**

实现 tip：`18a7a0c37a719a22a426acb0002312d6b82f24da`；基线 `7f75f7b80ee4ad5203a89d2628f604551eafa73b`，包含实例源祖先 `4644e96c530a592c2966798805e92a304f1c907a`。开工 fetch/pull exit 0 / Already up to date，分支 dev，目录 `/workspace/xiantu/wt/dev`，所有命令 stdin=/dev/null。文档 tip/origin/dev 最终 HEAD 见交付回执与本窗本地 `final-tip.json`。

```json
{"formalTipsWired":true,"formalInstanceSource":true,"softOpenedEntrance":true,"softOpenedFormalSettle":true,"released":false,"formalOpen":true,"softOpened":true,"closedFixtureOnly":true}
```

兼容 formalOpen/softOpened 现表示**正式实例源 soft-open，≠进包≠发版**；false 只在隔离 SSR memory-closed 图注入，磁盘始终 true。fixture≠正式，fixture 成功不作进包依据。

## 交付行为

基线正式链路已经满足令文：默认 Forge 完整 committed → 同事务 `registerFormalEnhanceInstance` → 默认无 fixture 的 EnhanceGate 仅认本档 formalSources/formalEnhanceInstances。缺登记/数量冒充 no_instance，护符 true protect，附灵分解 later_service；仅读 enhance.json 唯一 next 行。GameScene 同次 smith_ou 先打造后强化提示、入口零写保持。

本窗只修改 `scripts/v06p1-enhance-open-test.mjs` 与 `src/v06p1-enhance-open.test.ts`：默认 QA 转本窗、显式状态字段和口径翻转、正式 O 表来源/无 fixture/同事务证据必验、本档来源与强化后来源不变断言。产品源码、两 Flag、数据未改。正式磁盘图 O01–O08 全覆盖，原 fixture 兼容与 C 表完整保留。

## 全部自检 exit 0

| 命令 | exit | 断言/结果 |
|---|---|---|
| npx tsc --noEmit | 0 | PASS |
| npm run test:v06p1-enhance-open | 0 | 11,389 |
| npm run test:v06p1-enhance-closed | 0 | 30,769 |
| npm run test:v06p1-forge-open | 0 | 6,378 |
| npm run test:v06p1-forge-closed | 0 | 20,401 |
| npm run test:v06p1-market-closed | 0 | 24,186 |
| npm run test:v06d-closed | 0 | 15,055 |
| npm run test:v06c-closed | 0 | 10,712 |
| 双根 datalint | 0 | shared/snapshot 各问题 0 |
| git diff --check | 0 | PASS |
| 保护 SHA/文件集合 | 0 | 未授权差异 0 |

七套件 **118,890** 断言；open 较基线 11,259 增加 130，closed 仍 30,769。双根 28 图中正式磁盘 22 图 flagLoads=0、memory-closed 6 图 flagLoads=1；features 覆盖 0。8 图 smith_ou 同次双入口冒烟 saveWrites=0；memory-closed 八 tip / 零业务写。带历史关态每根 6 次 importSave 是测试准备写入，业务调用零增量。

详细 O 表、fresh SSR 历史读回与同运行图并发验证限制见 [HANDOFF](V06P1_ENHANCE_FORMAL_SOFT_OPEN_HANDOFF.md)。不将 SSR 并发自检外推为多浏览器事务验收。

QA：`qa/out_v06p1_enhance_formal_soft_open/`；`selfcheck-summary.json` / `evidence-check.json` / `protection-check.json` 全 PASS，命令日志与 `*.result.json` 可追溯且可重放。946 个保护文件未授权差异 0；534 个旧 QA 文件/集合不变。

## 写前=写后保护 SHA

| 文件 | SHA-256 |
|---|---|
| EnhanceOpenFlag.ts，正式 true | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e |
| ForgeOpenFlag.ts，正式 true | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e |
| enhance.json（三根未改） | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 |
| recipes.json（三根未改） | 1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f |
| items.json | 6eb2434a31613ea3f60eaaf15906b565d2254364b1dc4f9bea96b244a8fc3b6c |
| materials.json | 0cc03119172aaf4576eb29f9cbb0b6bf8965715b9e84a512ef25ce7b34eb640e |
| npcs.json | 2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6 |
| life_skills.json | 204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b |
| shared/wt strings，944 键 | d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09 |

GAME_PHASE=5、gifts 10×false；game strings 旧 936 键快照不动。无 features/环境开关后门，无护符映射放行、附灵/分解或其它服务混窗。无完整强化 UI/services/提交面板；未运行 build/sync/release，未进包、发版、打 tag 或 Pages。

Codex 原日志：`/workspace/xiantu/logs/codex/a695c0e74a0e311b_20261017_103112_1374565.log`；`codex_launch.log` 为运行中日志保留本地。HANDOFF/RESULT/status UTF-8 同步 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。只提交本窗允许文件，待审 dirty 保留；普通 commit/push，无 force-push/reset --hard。

**无程序自检阻断。下一棒交执法在正式 soft-open 磁盘图重抽 design/27 §4.3 O01–O08 + 入口冒烟；PASS 报 tip+out 后等负责人 release/进包令。PASS≠进包≠发版。**
