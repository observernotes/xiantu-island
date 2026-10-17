# P1③++++ 护器符正式映射 · 开态夹具 HANDOFF

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜交执法按 design/28 §4.3 O01–O06 独立抽检。

实现 tip：`be00bb185414f2aba95521e8d30a5b289dc8bdaf`，subject：`feat(v0.6-p1): execute enhance protect charm open fixture O01-O06`。文档 tip / origin/dev 最终 HEAD 见 [final-tip.json](../../qa/out_v06p1_enhance_protect_charm_open_fixture/final-tip.json) 及最终回执。基线 `720a06cbf2c1804d379f1b93c8f298a89ab462ef`，含实现祖先 `28d701f24937d7cda89b70cbebc6c9e0cafd18bb`；开工已 fetch + pull --ff-only，工作目录 `/workspace/xiantu/wt/dev`、分支 dev，检查子进程 stdin=/dev/null。

**本窗=design/28 O01–O06 护符开态夹具全表 ≠ soft-open ≠ release ≠ 进包 ≠ Pages。** `formalOpen/softOpened` 仅兼容既有无符正式结算与只读入口状态。全表程序自检已执行，执法独立抽检待下一棒；夹具成功不授予生产护符消费或发布权限。

```json
{
  "protectCharmWired": true,
  "protectCharmN": 1,
  "protectCharmOpenFixtureTableExecuted": true,
  "formalTipsWired": true,
  "formalInstanceSource": true,
  "softOpenedEntrance": true,
  "softOpenedFormalSettle": true,
  "softOpenedProtectCharm": false,
  "released": false
}
```

## 实现与正式来源

仅扩展 `src/v06p1-enhance-open.test.ts` 和必要的 `scripts/v06p1-enhance-open-test.mjs`。产品 Gate、Progress、GameScene、Flag、数据表均未改。新 O 全表只从默认 ForgeGate 完整提交成品取得原始 instanceRef 与正式来源证明；测试显式准备库存，未注入 fixtureInstances。既有显式夹具/C 表及 design/27 回归保留，生产 GameScene 仍仅 `new EnhanceGate(this.prog).entrance()`，无默认夹具或缺源回退，不从 itemId 数量发明实例身份。

runner 默认输出改为本窗目录，shared/snapshot 分别执行正式图、内存关态图、fresh SSR 读回及坏表隔离图。顶层及各正式主图的 O 全表标记据实际执行生成；非全表图标 false，保留 C 回归子段自身历史范围标记。

## design/28 §4.3 O01–O06 旁证交棒

主旁证为 [v06p1-enhance-open-evidence.json](../../qa/out_v06p1_enhance_protect_charm_open_fixture/v06p1-enhance-open-evidence.json)。每根正式主图的 `result.protectCharmOpenFixtureTable.O01` 至 `O06` 均有 `executed:true` 与非空 `evidenceKeys`，顶层六项逐一索引两根证据。以下全部为本窗实际执行。

| O 项 | 实际操作与通过事实 | 关键旁证键 |
|---|---|---|
| O01 | 合法正式实例、映射齐备、足量符，true 成功 0→1；原 rate；灵石/精炼石/N 同一 write+commit 消费一次；属性、完整结果、receipt 一致，instanceRef 不变 | `formal-protected-success`、`three-costs-one-commit`、`identity-attributes-result-receipt` |
| O02 | true 从 4→5（原 dropOnFail=false）与 5→6（原 true）正常失败；均保 fromLevel、不碎装、原 rate/原 dropOnFail 审计值不变、同扣 N；只记一次结果 | `failure-no-drop`、`failure-drop-kept`、`same-N`、`complete-result-once` |
| O03 | 零符、仅临时符、品质承载而无合法可消费符，可消费量 < N；预览/提交 resources 整笔拒绝，整档、抽样、持久写、commit、结果/receipt 零增量，未改 false | `zero`、`transient-only`、`quality-only`、`zero-business-delta-no-false-fallback` |
| O04 | 成败旧请求匹配重放只读；true↔false 冲突无 result；同 id、同实例旧等级、两正式实例共享单符、同槽两独立 Progress 争用均仅一笔完成；过时对象拒绝，无负库存或重复升档 | `same-request-replay`、`true-false-payload-conflict`、`shared-single-charm`、`independent-Progress-same-slot`、`stale-retry-denied` |
| O05 | 护符成功与两类失败保存/import/restore/IDB load，再由 fresh SSR 正式/关态图读回；每根 11 载荷，其中 6 正式来源；跨档同请求 id 不混实例/结果/库存；内存 N=2 时历史 false 不追扣，finally 恢复 | `save-import-restore-IDB-load`、`fresh-SSR-payloads`、`cross-slot-same-request-isolation`、`historical-false-no-retrocharge` |
| O06 | 承载 false/抛错/篡改草稿，三资源预检后事务前耗尽，保存后端抛错，IDB complete 前 hold/abort 均保原合法状态；显式重试完整一次；pending、缺 receipt、非法 boolean、半等级旧记录 import/submit/refresh 均拒绝，无修档补做 | `carrier-false-throw-draft-tamper`、`transaction-resource-recheck`、`save-backend-failure`、`IDB-interruption-complete-boundary`、`explicit-retry-once`、`corrupt-protected-history-no-repair` |

false 路径继续不依赖护符映射/资格/拥有量；原失败规则与完整结算保持。附灵/分解混入仍 `enhance.closed.later_service`。并发证据范围为同一 SSR realm 的 Gate/Progress/slot 与内存 IDB，不外推多浏览器。事务资源变化覆盖预检后草稿复核与同步承载回调草稿篡改，不声称任意外部直接写字段均已验收。

## 自检、冻结与重放

| 套件 | 绿断言数 |
|---|---:|
| enhance-open | 17,676 |
| enhance-closed | 30,834 |
| forge-open | 6,380 |
| forge-closed | 20,413 |
| market-closed | 24,194 |
| v06d-closed | 15,059 |
| v06c-closed | 10,714 |
| 合计 | 125,270 |

tsc、七套件、双根 datalint（各问题 0）、双根三表 JSON、git diff --check 均 exit 0。详见 [selfcheck-summary.json](../../qa/out_v06p1_enhance_protect_charm_open_fixture/selfcheck-summary.json)、`evidence-check.json`、逐命令 `*.result.json / *.log`。首轮失败为跨档测试中未知结果拒绝类型的错误预期，复查同时修正跨档前 A 档磁盘基线；原始失败保留于 `attempts/`，修正后完整重跑全绿。

五张冻结表、护符三表、两 Flag 全 MATCH；shared/wt 八表与 wt/game 两 Flag 共 20 条权威 SHA 匹配指定值。EnhanceOpenFlag/ForgeOpenFlag 正式 true，strings944、gifts10×false、GAME_PHASE5、N1。4,068 保护文件未授权差异 0；761 旧 QA 文件及集合差异 0，旧 closed 目录/art pending 保留。完整 SHA 见 `boundary-before.json / protection-check.json`，写前写后见 `protected-before.json / protected-after.json / prior-evidence-before.json / prior-evidence-after.json`；生产只读边界见 `source-path-audit.json`。

重放（本 wt/dev、stdin=/dev/null）：

```sh
python3 qa/out_v06p1_enhance_protect_charm_open_fixture/run-open-selfcheck.py </dev/null
python3 qa/out_v06p1_enhance_protect_charm_open_fixture/run-regression.py </dev/null
python3 qa/out_v06p1_enhance_protect_charm_open_fixture/run-regression.py protection source-audit summary </dev/null
python3 qa/out_v06p1_enhance_protect_charm_open_fixture/verify-evidence.py </dev/null
```

QA：`qa/out_v06p1_enhance_protect_charm_open_fixture/`。Codex 原日志：`/workspace/xiantu/logs/codex/8d58e7910ae31f5e_20261017_114710_1484247.log`，另有 `codex-log-reference.json`；运行中 `codex_launch.log` 仅引用、不暂存。HANDOFF/RESULT/status 以 UTF-8 同步共享 `/workspace/xiantu/reports/炼器阁/` 和 `/workspace/xiantu/status/炼器阁.md`。

未运行 snapshot/build/sync/release/Pages；未进包、打 tag、发布。未混入附灵/分解/阵法/gifts/#20/拍卖/坊市；普通实现/文档两次 commit 后 git push origin dev，无 force-push/reset --hard，仅暂存本窗允许文件。

**无程序自检阻断。下一棒交执法 design/28 O01–O06 独立抽检；PASS 后报 tip+out，请负责人另下 soft-open 令。PASS ≠ soft-open ≠ release ≠ 进包。**
