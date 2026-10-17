# P1③++++ 护器符正式映射 · 开态夹具 RESULT

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜程序自检 PASS，待执法 design/28 O01–O06 独立抽检。

实现 tip：`be00bb185414f2aba95521e8d30a5b289dc8bdaf`（`feat(v0.6-p1): execute enhance protect charm open fixture O01-O06`）。文档 tip / origin/dev 最终 HEAD 见本窗 `final-tip.json` 及最终回执。基线 `720a06cbf2c1804d379f1b93c8f298a89ab462ef`，实现祖先 `28d701f24937d7cda89b70cbebc6c9e0cafd18bb`；已开工 fetch + pull --ff-only，dev 分支、本 wt/dev、stdin=/dev/null。

**本窗=护符开态夹具全表 ≠ soft-open ≠ release ≠ 进包 ≠ Pages。** formalOpen/softOpened 仅兼容既有无符正式结算和只读入口，不授予生产护符消费或发布权限。

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

| design/28 项 | 实际执行结果 |
|---|---|
| O01 | true 正式实例完整成功；原 rate、同次三项消费、属性/结果/receipt、原 instanceRef 一致 |
| O02 | 目标5（dropOnFail=false）与目标6（true）正常失败均保级不碎装，原 rate/dropOnFail 可审计，同扣 N 且只记一次 |
| O03 | 零符/临时符/品质承载不足 N 均 resources；整笔零增量，未转 false |
| O04 | 匹配旧请求只读、双向 true/false 冲突拒绝；同实例/同请求/共享单符/同槽独立对象竞争仅一次提交，无负库存或旧等级复升 |
| O05 | 成功和两类失败保存/import/restore/IDB load、fresh SSR、跨档同 id 隔离及历史 false 改 N 不追扣通过 |
| O06 | 承载失败、保存失败、中断、预检后事务资源变化、草稿篡改、坏 true 旧记录均整笔保原状态或显式重试完整一次，无修档补做 |

各项 executed:true/evidenceKeys 已列于 `v06p1-enhance-open-evidence.json / evidence-check.json`。两根各11个 fresh SSR 载荷（6个正式来源），新增三条为护符成功/两类失败。全表源为默认 ForgeGate 完整提交结果，测试显式准备库存，无 fixtureInstances；只改 open 测试/runner，产品源码/Flag/数据均未改。false 不依赖护符；附灵/分解仍 later_service。

自检全 exit 0：tsc；enhance-open **17,676**、enhance-closed **30,834**、forge-open **6,380**、forge-closed **20,413**、market-closed **24,194**、v06d-closed **15,059**、v06c-closed **10,714**，合计 **125,270** 断言；双根 datalint/三表 JSON、diff、evidence、protection 检查通过。首轮夹具错误和修正见 `attempts/`；最终全绿见 `selfcheck-summary.json`。

| 保护对象 | 指定 SHA-256（shared/wt 表；wt/game Flag） | 结果 |
|---|---|---|
| enhance.json | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 | MATCH |
| recipes.json | 1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f | MATCH |
| strings_zh.json | d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09 | MATCH |
| npcs.json | 2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6 | MATCH |
| life_skills.json | 204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b | MATCH |
| materials.json | 79c68429d763054ac1715467d1743575e179ecaecb2529e4b6ed7df137ef4052 | MATCH |
| items.json | f8b587634e5c9d43a475e85724aa34172e2945abda7654c2ef98fda07d1566f3 | MATCH |
| enhance_protect_charm.json | 0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772 | MATCH |
| EnhanceOpenFlag | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e | MATCH / true |
| ForgeOpenFlag | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e | MATCH / true |

20条权威 SHA 全 MATCH，4,068保护文件未授权差异0，761旧QA文件及集合差异0；strings944、gifts10×false、GAME_PHASE5、N1。旧 closed QA/art pending/dist-test 等待审 dirty 保留；GameScene仅只读entrance，无生产夹具默认注入/回退。并发只证同SSR/内存IDB；资源变化证预检后复核和同步草稿篡改，不外推多浏览器或任意外部直接写字段。

QA：`qa/out_v06p1_enhance_protect_charm_open_fixture/`。详细交棒见 [HANDOFF](V06P1_ENHANCE_PROTECT_CHARM_OPEN_FIXTURE_HANDOFF.md)；旁证含 selfcheck-summary/evidence-check/protection-check/protected-before|after/source-path-audit 及可重放脚本。Codex原日志：`/workspace/xiantu/logs/codex/8d58e7910ae31f5e_20261017_114710_1484247.log`。HANDOFF/RESULT/status 已 UTF-8 同步共享区；仅本窗允许文件按实现/文档两次普通提交推送dev，final-tip 推送后记录最终SHA。

未运行 snapshot/build/sync/release/Pages，无进包或发布、无 force-push/reset --hard，无附灵/分解/阵法/gifts/#20/拍卖/坊市混窗。

**无程序自检阻断。下一棒交执法 O01–O06；PASS 后请负责人 soft-open 令。PASS ≠ soft-open ≠ release ≠ 进包。**
