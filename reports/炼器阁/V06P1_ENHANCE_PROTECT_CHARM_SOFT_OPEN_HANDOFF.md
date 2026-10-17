# P1③++++ 护器符正式映射 · soft-open HANDOFF

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜负责人令经项目经理执行。

**护器符正式映射已固化为 soft-open 生产口径，`softOpenedProtectCharm:true`、`released:false`。交执法在正式 soft-open 磁盘图重抽 design/28 §4.3 O01–O06 + 入口冒烟；PASS ≠ 进包 ≠ 发版。** 本窗不授权 release、进包、打 tag 或 Pages。

基线文档 tip `6f26f449ee3b19336e9f31c674eac7d43c9ee601`，含开态夹具实现祖先 `be00bb185414f2aba95521e8d30a5b289dc8bdaf`。开工在 `/workspace/xiantu/wt/dev` 执行 `git fetch && git pull --ff-only origin dev`，确认分支 dev；自检子进程 stdin=/dev/null。实现 tip：`9c7278c4ac49163085cc35d7174a735c4ca653c7`，subject：`feat(v0.6-p1): soft-open enhance protect charm preamble`。文档 tip / origin/dev 最终 HEAD 见本窗 [final-tip.json](../../qa/out_v06p1_enhance_protect_charm_soft_open/final-tip.json) 与最终回执，避免自引用 SHA。

```json
{
  "protectCharmWired": true,
  "protectCharmN": 1,
  "protectCharmOpenFixtureTableExecuted": true,
  "formalTipsWired": true,
  "formalInstanceSource": true,
  "softOpenedEntrance": true,
  "softOpenedFormalSettle": true,
  "softOpenedProtectCharm": true,
  "released": false
}
```

开态夹具窗曾记录 `softOpenedProtectCharm:false`，当时只执行候选映射 O 全表；本窗依据负责人 soft-open 令翻为 true，表示正式磁盘图采用护符 soft-open 生产口径。兼容 `formalOpen/softOpened` 字段沿既有正式入口/结算状态；统一解释为**护符 soft-open ≠ 进包 ≠ 发版**。`protectCharmOpenFixtureTableExecuted` 保留既有证据键名，本窗值来自正式磁盘图实际重跑 O01–O06，不把 fixture 当正式来源或进包依据。

## 实现范围与正式语义

基线产品链路已满足令文，本窗仅调整 `src/v06p1-enhance-open.test.ts`、open runner 与 closed runner 的证据口径、输出目录及必要断言，未修改产品源码、两 Flag 或数据表。closed runner 默认输出转本窗 `regression/enhance-closed/`，避免覆盖历史关态 QA。

映射为 `enhance_protect_charm` 的 `protect_charm × N=1`，有效 ITEMS 资格与 Gate 消费接线齐备。正式 `useProtectCharm=true` 成功与正常概率失败同扣 N；失败不掉级、不碎装，目标行原 rate 不变；灵石、精炼石、护符、最终等级/属性、result、receipt 与去重事实同事务完整提交一次。映射齐备但缺符/不足返回 `enhance.formal.resources` 整笔拒绝；正式磁盘图不再将齐备映射误判为 `enhance.formal.protect`。未齐映射仍拒 protect，false 路径继续不依赖护符登记/N/库存，既有无符规则不回退。

O 全表只从默认 ForgeGate 完整 committed 成品取得原始 instanceRef 和本档正式来源证明，显式准备库存，无 `fixtureInstances` 生产依赖。生产 GameScene 无夹具默认注入、缺源回退或从 itemId 数量发明实例。附灵/分解仍 `enhance.closed.later_service`。

smith_ou 同一次命中仍先打造 entrance、后强化 entrance，末尾才返回；入口只读零结算副作用。未挂完整强化 UI、`smith_ou.services` 或提交面板，未改 dialog/quests/地图/NPC。两 Flag 保持正式 true，未加配表/features/环境开关后门。

## 正式磁盘图 O01–O06 与关态回归

open runner 双根共 28 图：22 张正式磁盘图 `flagLoads=0`，6 张 SSR memory-closed 图只在隔离内存注入 false、`flagLoads=1`。以下六项由双根正式主图实际执行。独立 closed runner 共 6 图：2 张正式图 flagLoads=0，4 张 memory-closed 图 flagLoads=1，storageWrites=0；磁盘 true 下 SSR false 的原 C 表仍有 30,834 断言，数量级未回退。

| O 项 | 本窗正式磁盘图已执行事实 |
|---|---|
| O01 | 合法正式实例、映射及足量符，true 完整成功；目标原 rate，三资源同次消费 N=1，等级/属性/result/receipt 与原 instanceRef 一致。 |
| O02 | 覆盖目标 5 与 6 的两种原 dropOnFail；正常失败均保级、不碎装、同扣 N，只成立一次完整结果。 |
| O03 | 零符、仅临时符或仅品质承载导致可消费量不足 N，resources 整笔拒绝；资源/等级/结果/receipt 零增量，不转 false。 |
| O04 | 匹配请求重放只读；true↔false 载荷冲突拒绝；同实例/同请求/共享单符及同槽独立 Progress 争用至多一次，无负库存或旧等级复升。 |
| O05 | 护符成功与两类失败保存/import/restore/IDB load/fresh SSR 读回；跨档同 id 隔离；历史 false 不按新 N 追扣。 |
| O06 | 承载/保存失败、事务资源变化、草稿篡改、IDB complete 前 hold/abort 与损坏历史记录，均保原合法状态或显式重试完整一次，无半扣费/半等级或修档补做。 |

主旁证 [v06p1-enhance-open-evidence.json](../../qa/out_v06p1_enhance_protect_charm_soft_open/v06p1-enhance-open-evidence.json) 的每根正式主图 `result.protectCharmOpenFixtureTable.O01` 至 `O06` 均有 `executed:true` 且 `evidenceKeys` 非空；顶层逐项索引双根证据。非全表图的 table-executed 标记按实际执行范围为 false，不以全局 soft-open 状态冒充该图执行结果。fresh memory-closed 历史载荷 import 属测试准备，关态业务调用前后零写/零抽，不将准备写入算作结算。

并发证据范围为同 SSR realm 的 Gate/Progress/slot 和内存 IDB；事务资源变化覆盖预检后草稿复核及同步承载回调篡改，不外推多浏览器或任意外部直接写字段的验收。

## 自检、旁证与冻结

tsc、七套件、双根 datalint（各问题 0）、双根护符三表 JSON、git diff --check、evidence 和 protection 全部 exit 0。

| 套件 | 绿断言数 |
|---|---:|
| enhance-open | 17,728 |
| enhance-closed | 30,834 |
| forge-open | 6,380 |
| forge-closed | 20,413 |
| market-closed | 24,194 |
| v06d-closed | 15,059 |
| v06c-closed | 10,714 |
| 合计 | 125,322 |

enhance-open 较开态夹具窗增加 52 断言；closed 数量保持。QA：`qa/out_v06p1_enhance_protect_charm_soft_open/`。入口为 [selfcheck-summary.json](../../qa/out_v06p1_enhance_protect_charm_soft_open/selfcheck-summary.json)、[evidence-check.json](../../qa/out_v06p1_enhance_protect_charm_soft_open/evidence-check.json)、[protection-check.json](../../qa/out_v06p1_enhance_protect_charm_soft_open/protection-check.json)。逐命令 `*.result.json / *.log` 记录命令、cwd、stdin、exit 和计数；`protected-before.json / protected-after.json`、`prior-evidence-before.json / prior-evidence-after.json` 固化写前写后和旧集合，`source-path-audit.json` 固化生产只读/正式来源边界。

五张冻结表 + 护符三表 + 两 Flag 的 20 条权威 SHA 全 MATCH；4,068 个保护文件未授权差异 0，896 个旧 QA 文件及集合差异 0（本 wt 历史 QA 831、共享执法 out 65）。指定 SHA 见 RESULT 完整表及 protection-check；strings944、gifts10×false、GAME_PHASE5、N1。shared/wt 的护符三表保持指定字节；game/data 原本没有护符映射，本窗不补写或扩成三根映射。

原关态 `qa/out_v06p1_enhance_protect_charm_closed/`（执法 @28d701f）与开态 `qa/out_v06p1_enhance_protect_charm_open_fixture/`（执法 @be00bb1）及相关执法 out 保留不覆盖。

重放（本 wt/dev、stdin=/dev/null）：

```sh
python3 qa/out_v06p1_enhance_protect_charm_soft_open/run-open-selfcheck.py </dev/null
python3 qa/out_v06p1_enhance_protect_charm_soft_open/run-regression.py </dev/null
python3 qa/out_v06p1_enhance_protect_charm_soft_open/run-regression.py protection source-audit summary </dev/null
python3 qa/out_v06p1_enhance_protect_charm_soft_open/verify-evidence.py </dev/null
```

Codex 原日志：`/workspace/xiantu/logs/codex/3b759c69c9cc0848_20261017_122227_1519813.log`，另见 `codex-log-reference.json`；运行中日志只引用、不暂存。HANDOFF/RESULT/status 以 UTF-8 同步共享 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。

未运行 snapshot/build/sync/release/Pages；未进包、发布或打 tag；未混入附灵/分解/阵法/gifts/#20/拍卖/坊市。仅暂存本窗允许文件，待审 dirty 保留；按指定实现/文档两次普通 commit 后 `git push origin dev`，无 force-push/reset --hard。

**无程序自检阻断。下一棒交执法按 design/28 §4.3，在正式 soft-open 磁盘图重抽 O01–O06 + smith_ou 同次双入口冒烟；PASS 报实现 tip+out，请负责人另下 release/进包令。PASS ≠ 进包 ≠ 发版。**
