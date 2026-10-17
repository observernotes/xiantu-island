# P1③++++ 护器符正式映射 · soft-open RESULT

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜负责人令经项目经理执行。

**护符正式映射已固化为 soft-open 生产口径，`softOpenedProtectCharm:true`、`released:false`；PASS ≠ 进包 ≠ 发版。**

实现 tip：`9c7278c4ac49163085cc35d7174a735c4ca653c7`（`feat(v0.6-p1): soft-open enhance protect charm preamble`）。基线 `6f26f449ee3b19336e9f31c674eac7d43c9ee601`，包含开态夹具实现祖先 `be00bb185414f2aba95521e8d30a5b289dc8bdaf`；开工 fetch + pull --ff-only、分支 dev、本 `/workspace/xiantu/wt/dev`、自检 stdin=/dev/null。文档 tip / origin/dev 最终 HEAD 见本窗 [final-tip.json](../../qa/out_v06p1_enhance_protect_charm_soft_open/final-tip.json) 及最终回执。

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

旧开态夹具窗 `softOpenedProtectCharm:false` 在本窗依据负责人令翻为 true。`formalOpen/softOpened` 兼容字段统一注明**护符 soft-open ≠ 进包 ≠ 发版**；SSR false 仅为隔离 memory-closed 回归，不改变磁盘 Flag。fixture≠正式，fixture 成功不作进包依据。

## 交付行为与正式图

基线已具备映射 N=1、有效 ITEMS 资格及 Gate 同事务消费；本窗仅改 open 测试、open/closed runner 的证据口径、输出目录和必要断言，产品源码、两 Flag、数据表零改。true 成功/正常失败同扣 N，失败保级不碎装、原 rate 不变，三资源与结果/receipt 一次提交；齐备但缺符/不足返回 resources，false 不依赖护符。附灵/分解仍 later_service。

双根 open 共 28 图：22 张正式磁盘图 flagLoads=0，6 张 SSR memory-closed 注入 false、flagLoads=1。正式主图重跑 design/28 O01–O06，来源为默认 Forge 完整提交的正式实例，无 fixtureInstances 生产默认/回退。O01 成功、O02 两类失败、O03 缺符拒绝、O04 去重/冲突/争用、O05 存档/刷新/跨档、O06 中断/异常/坏记录均逐项留证。closed 共 6 图，2 张正式图 flagLoads=0、4 张 memory-closed flagLoads=1 且 storageWrites=0，原 C 表数量级保留。smith_ou 同次打造 + 强化双入口只读冒烟保持，无完整强化 UI/services/提交面板。

## 自检与旁证

| 检查 | exit | 断言/结果 |
|---|---:|---|
| npx tsc --noEmit | 0 | PASS |
| npm run test:v06p1-enhance-open | 0 | 17,728 |
| npm run test:v06p1-enhance-closed | 0 | 30,834 |
| npm run test:v06p1-forge-open | 0 | 6,380 |
| npm run test:v06p1-forge-closed | 0 | 20,413 |
| npm run test:v06p1-market-closed | 0 | 24,194 |
| npm run test:v06d-closed | 0 | 15,059 |
| npm run test:v06c-closed | 0 | 10,714 |
| 双根 datalint / 护符三表 JSON | 0 | 各问题 0 / PASS |
| git diff --check | 0 | PASS |
| evidence / protection | 0 | PASS / 未授权差异 0 |

七套件共 **125,322** 绿断言，open 较上窗增加 52、closed 保持 30,834。QA：`qa/out_v06p1_enhance_protect_charm_soft_open/`；selfcheck-summary/evidence-check/protection-check、逐命令日志与可重放脚本固化结果。详细 O01–O06、fresh SSR 读回与验证范围见 [HANDOFF](V06P1_ENHANCE_PROTECT_CHARM_SOFT_OPEN_HANDOFF.md)；SSR/内存 IDB 自检不外推为多浏览器验收。

## 冻结 MATCH

| 保护对象 | 指定 SHA-256（shared/wt 表；wt/game Flag） |
|---|---|
| enhance.json | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 |
| recipes.json | 1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f |
| strings_zh.json | d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09 |
| npcs.json | 2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6 |
| life_skills.json | 204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b |
| materials.json | 79c68429d763054ac1715467d1743575e179ecaecb2529e4b6ed7df137ef4052 |
| items.json | f8b587634e5c9d43a475e85724aa34172e2945abda7654c2ef98fda07d1566f3 |
| enhance_protect_charm.json | 0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772 |
| EnhanceOpenFlag，正式 true | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e |
| ForgeOpenFlag，正式 true | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e |

20 条权威 SHA 全 MATCH；4,068 个保护文件未授权差异 0，896 个旧 QA 文件及集合差异 0（本 wt 历史 QA 831 + 共享执法 out 65）。strings944、gifts10×false、GAME_PHASE5、N1；写前写后见 protected-before/after 与 protection-check，旧证据集合见 prior-evidence-before/after。game/data 原本无护符映射，本窗不补写；shared/wt 三表均保持指定字节。旧 closed/open_fixture QA 与执法 @28d701f/@be00bb1 out 保留不覆盖，待审 dirty 未纳入。

Codex 原日志：`/workspace/xiantu/logs/codex/3b759c69c9cc0848_20261017_122227_1519813.log`，另见 `codex-log-reference.json`。HANDOFF/RESULT/status UTF-8 同步共享区；普通实现/文档两次提交与 push dev，文档 subject：`docs(v0.6-p1): hand off enhance protect charm soft-open evidence`。未运行 snapshot/build/sync/release/Pages，无进包/发布/tag、force-push/reset --hard；无附灵/分解/阵法/gifts/#20/拍卖/坊市混窗。

**无程序自检阻断。下一棒交执法正式 soft-open 磁盘图 design/28 O01–O06 + smith_ou 同次双入口冒烟；PASS 报实现 tip+out，请负责人另下 release/进包令。PASS ≠ 进包 ≠ 发版。**
