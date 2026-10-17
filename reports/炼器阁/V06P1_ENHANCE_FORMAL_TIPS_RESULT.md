# P1③+++ 强化正式拒绝 tip 接线 · RESULT

2026-10-17｜炼器阁·主程序｜负责人令经项目经理执行。

本令≠开态夹具≠soft-open≠release≠正式实例源 schema 落地；沿用既有只读入口开放。

已完成 strings 快照、EnhanceGate 八个正式拒绝键及读表文案、C01–C10 自动化旁证、相关回归与保护核验。实现 tip：`d5b385da7134e8ac14887b0efed125910b6d4802`。文档 tip/origin/dev 最终 HEAD 见最终回执与 `qa/out_v06p1_enhance_formal_tips/final-tip.json`。

## 状态

```json
{"formalTipsWired":true,"formalInstanceSource":false,"released":false,"softOpenedEntrance":true,"formalOpen":true,"softOpened":true,"closedFixtureOnly":true}
```

EnhanceOpenFlag 磁盘仍 true；GameScene 仍是无 fixtureInstances 的只读入口。默认/空授权、itemId/数量冒充、历史袋新请求均 formal.no_instance。护符 true 显式 protect 整笔拒绝。foreign/bad_type/resources/max_level 分型可在显式测试夹具边界核验；正式实例源未落地。重复 submit 为 formal.duplicate，loadRefresh 完整结果为 formal.load_dedupe；只读副本不授权新结算。附灵/分解仍 enhance.closed.later_service。

## 回归结果（全部 exit 0）

| 命令 | 断言/结果 |
|---|---|
| npx tsc --noEmit | PASS |
| npm run test:v06p1-enhance-open | 8,568 |
| npm run test:v06p1-enhance-closed | 30,749 |
| npm run test:v06p1-forge-open | 6,378 |
| npm run test:v06p1-forge-closed | 20,365 |
| npm run test:v06p1-market-closed | 24,168 |
| npm run test:v06d-closed | 15,055 |
| npm run test:v06c-closed | 10,712 |
| 双根 datalint / python3 -m json.tool | 各 2 次 PASS；datalint 各问题 0 |
| git diff --check / 暂存 diff --check | PASS |

七套件合计 **115,995** 断言。增强套件覆盖 shared/snapshot 正式 true + SSR memory-closed、fresh SSR 读回、默认 formal 拒绝、显式夹具 O 表、真实 IDB 提交/中断/争用和 smith_ou 同命中只读冒烟。C03 边界、各 C 项及不代勾正式 O 表说明见 [HANDOFF](V06P1_ENHANCE_FORMAL_TIPS_HANDOFF.md)。

QA 日志、逐命令 exitCode/assertions、evidence 与可重放脚本均位于 [本窗 QA](../../qa/out_v06p1_enhance_formal_tips/)。`selfcheck-summary.json` 锁定最终受测源码 SHA。各 runner 只兼容获准新增的八键，剥八行完整还原原 936 键字节；旧 game/data 字符串保持 936 键。

## 保护 SHA（写前=写后）

| 文件 | SHA-256 |
|---|---|
| src/EnhanceOpenFlag.ts，正式 true | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e |
| src/ForgeOpenFlag.ts | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e |
| src/ForgeGate.ts | 44f556147408019188da0cd793076993491653d62e7e9996c67a20303ecbee86 |
| data/balance/enhance.json | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 |
| data/balance/recipes.json | 1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f |
| data/balance/items.json | 6eb2434a31613ea3f60eaaf15906b565d2254364b1dc4f9bea96b244a8fc3b6c |
| data/balance/materials.json | 0cc03119172aaf4576eb29f9cbb0b6bf8965715b9e84a512ef25ce7b34eb640e |
| data/balance/npcs.json | 2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6 |
| data/balance/life_skills.json | 204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b |

strings 唯一获准数据差异：shared 与 wt/data 均 `d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09`，944 键（含 _meta）；精确复制方式保留既有 art pending。992 个数据/源码保护项未授权差异 **0**；此前 closed/open_fixture/open_preamble 的 167 份 QA 字节及集合不变。gifts 10×false；GAME_PHASE=5；Progress/schema/地图及其余正式配置未改。旁证：protected-before.json / protected-after.json / prior-evidence-before.json。

仅暂存本窗允许的 strings/Gate/测试/runner/QA 与本次 HANDOFF/RESULT/status；art pending、dist-test、旧 QA 未跟踪文件和 V068 等待审项均未纳入。普通推送遇远端已存在逐字同代码/同旁证的同名实现，唯一差异为清单行序；通过 rebase skip 去掉本地重复提交，沿用远端实现 tip，详见 push-integration.json。未 force-push、未 reset --hard。

Codex：`/workspace/xiantu/logs/codex/8d119a499246ee02_20261017_093127_1290884.log`；启动旁证：`qa/out_v06p1_enhance_formal_tips/codex_launch.log`。HANDOFF/RESULT/status UTF-8 同步共享根同路径。

无程序自检阻断。下一棒交执法 C01–C10；PASS 后由负责人另令开态夹具/正式实例源。护符 items 正式映射、附灵/分解、gifts/#20/阵法/拍卖/坊市均未放行；未运行 build/sync/release，未发版。
