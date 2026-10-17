# 分解一期 P1③++++++ soft-open 交接

2026-10-17 Asia/Shanghai；负责人令经项目经理；工作目录 `/workspace/xiantu/wt/dev`，分支 dev，stdin=/dev/null，ultra，fast=false。

**分解 soft-open 程序自检 PASS；PASS≠进包≠发版≠release。下一刀 release 预期 v0.6.12，本令不授权。fixture≠正式≠进包依据。无程序自检阻断。**

实现 tip：`0057e61a64732103da651296103e0578ce7f5ec0`，`feat(v0.6-p1): soft-open salvage entrance preamble`。文档提交：`docs(v0.6-p1): hand off salvage soft-open evidence`；文档 tip 与推送后 origin/dev HEAD 见本窗 `final-tip.json` 及最终回执。
开工已 `git fetch && git pull --ff-only origin dev`，HEAD=`15b66e34a9fc24bc38b8e701172694756a6cc62a`；祖先包含 docs `1c0219933954666b8757bde54b5b1aab2a64c6b6` 与夹具实现 `30713252ae2fb7de27ea41ff0ba1f4330304d063`。

## 实现与边界

`src/SalvageOpenFlag.ts` 精确恒 true，无 import、配表、features 或环境开关；仅 Vite SSR memory-closed 注入 false。写前 SHA `1b8b9f0b2d8e3e1df86ca740a156aa119406fe99ee26246842c967928198453e`，写后 `69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3`。

GameScene 仅新增三个 import 与同次 smith_ou 命中末尾五行分解提示：forge→enhance→enchant→salvage，最后唯一 return true；允许显示「装备分解已开放。」，拒绝显示 SalvageGate 原文；关态直接显示 SalvageClosed.featureClosed，不读 Gate 资格、不结算。原 28×40 距离、name/props.npc、隐藏、无对象安静与通用交互保持；前三服务原提示/颜色及拒绝行为保持。精确剥新增字节后恢复基线 Scene SHA。

SalvageGate / SalvageProgress / Progress / SaveStore / 既有三 Gate / ShopPanel / features 原字节保持。唯一数值源仍只读 enhance.salvage.refineStonesByGrade：common/fine/spirit/treasure→1/2/4/8 refine_stone，无 rate、不另扣灵石。正式身份仅本档 formalEnhanceInstances/formalSources 的 instanceRef；不从 itemId 或数量造实例，无 fixtureInstances 生产默认注入。完整成功才一次销毁所选实例、全额入库与结果/去重同事务；校验失败零销毁零产出。绑定/本命/精血或位置资格未齐仍整拒。既有窗混入分解仍 later_service，独立分解之后的更后续服务仍 salvage.closed.later_service。

本窗是最小入口 preamble。成功提交测试显式提供既有 qualification / capacity / atomicCarrier 测试证据与存储承载，**这些不是生产默认依赖注入，也不等同已接生产绑定 schema、完整提交 UI 或全量生产分解放行**；默认 `new SalvageGate(p)` 字段未齐拒绝，新事务无载体拒绝。不挂 smith_ou.services、不改 NPC/dialog/quests/地图、不接完整面板。

## 测试图与结果

open：**7145 断言 / 54 SSR 图**；正式磁盘图 4（双根全表 2 + fresh SSR 2），flagLoads=0、产品模块/配方转换清单=[]；memory-closed 4 图只注入 false，flagLoads=1，八 tip 与零写保留；异常依赖 44 图隔离注入；显式 armor 夹具 2 图独立计数。

正式双根全表 O01–O08 全实际执行。磁盘没有 robe/shoes 打造配方，正式 O02 覆盖缺正式来源防具整拒，不由数量/槽位补身份；另两个显式防具配方图保留原 robe/shoes 成功消费者、实例注册/销毁、产物和同事务证据，**不计正式全表、不修改磁盘 recipes、不授权防具生产打造**。同原型选择、绑定未齐、容量争用、去重冲突、跨档、保存/刷新、中断与未知旧档等保留。O07 正式图使用两个正式武器竞争共享容量；原武器/防具装备容量场景在显式图保留。

真实 GameScene.prototype 冒烟共 8 图：无对象、非 smith_ou、横/纵超距、隐藏、name 与 props.npc、28×40 四角、通用交互；同次四 tip 顺序、前三拒绝仍到分解、分解 Gate 拒绝原文、内存关态绕 Gate、完整存档零增量和零写均 PASS。

closed：**19413 断言 / C01–C10 / 232 semantic/state fixtures / 3380 API calls**；先正式 true / flagLoads=0，再 memory false / flagLoads=1；初始与 fresh SSR 八 tip、关态零副作用保持。旧七 runner 与 v06c/v06d 将历史清单/字符串 SHA 断言通过精确剥离授权增量兼容；真实业务 SSR 始终读磁盘，既有业务断言未放宽。

| 套件 | 断言数 |
|---|---:|
| salvage-open | 7145 |
| salvage-closed | 19413 |
| v06p1-forge-open | 6496 |
| v06p1-forge-closed | 20558 |
| v06p1-enhance-open | 17804 |
| v06p1-enhance-closed | 30980 |
| v06p1-enchant-open | 4643 |
| v06p1-enchant-closed | 12621 |
| v06p1-market-closed | 24300 |
| v06c-closed | 10730 |
| v06d-closed | 15087 |

总计 **169777** 断言。`npx tsc --noEmit`、上述 11 项 npm 专项、shared `/workspace/xiantu` 与 snapshot `/workspace/xiantu/wt/dev/data` 双根 datalint、`git diff --check` 全部 exit 0；独立代码/旁证审阅 PASS，0 阻断。早期适配失败仅留 attempts，canonical log/result 均为最终通过运行。

```json
{
  "salvageClosedTipsWired": true,
  "refineStoneMapped": true,
  "salvageOpenFixtureTableExecuted": true,
  "formalInstanceSource": true,
  "softOpenedSalvage": true,
  "SalvageOpenFlag": true,
  "released": false,
  "EnhanceOpenFlagPreserved": true,
  "EnchantOpenFlagPreserved": true,
  "protectCharmSoftOpenPreserved": true
}
```

## 保护与旁证

29 项写前记录原字节 MATCH，另 1 项 SalvageOpenFlag 按令翻转；未授权差异 0。622 个开工既有 QA 文件前后 SHA 保持，含本 wt salvage closed/open fixture、附灵/强化/护符 soft-open，以及执法关态 @5d9fa29 / 开态夹具 @3071325。初始旧 QA `old-qa-preservation.json` dirty 保持，未暂存；art pending / dist-test / 其他旧 out / release 报告 / codex_prompt 等待审项未纳入。

| 冻结本 wt 文件 | SHA-256 | 写后 |
|---|---|---|
| `src/EnhanceOpenFlag.ts` | `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e` | MATCH |
| `src/EnchantOpenFlag.ts` | `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a` | MATCH |
| `src/ForgeOpenFlag.ts` | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` | MATCH |
| `data/balance/enhance.json` | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` | MATCH |
| `data/balance/recipes.json` | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` | MATCH |
| `data/balance/materials.json` | `86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d` | MATCH |
| `data/balance/items.json` | `dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99` | MATCH |
| `data/balance/strings_zh.json` | `9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda` | MATCH |
| `data/balance/npcs.json` | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` | MATCH |
| `data/balance/life_skills.json` | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` | MATCH |
| `data/balance/enhance_protect_charm.json` | `0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772` | MATCH |
| `src/SalvageClosed.ts` | `287a55d7025018629235d45ca4386d75134fc39362532a4c47bf121b574ae211` | MATCH |
| `src/data.ts` | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` | MATCH |

Enhance/Enchant/Forge 三 Flag 仍正式 true（上述 SHA MATCH），enhance.json 未改；GAME_PHASE=5，strings=960，gifts=10×false。shared 当前表同权威 SHA；game/data/strings 仍历史 952 键 `6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9`，独立只读保护，不进行同步改表。

QA：`qa/out_v06p1_salvage_soft_open/`；见 [selfcheck-summary](../../qa/out_v06p1_salvage_soft_open/selfcheck-summary.json)、[open evidence](../../qa/out_v06p1_salvage_soft_open/v06p1-salvage-open-evidence.json)、[evidence-check](../../qa/out_v06p1_salvage_soft_open/evidence-check.json)、[protection-check](../../qa/out_v06p1_salvage_soft_open/protection-check.json)、[independent-review](../../qa/out_v06p1_salvage_soft_open/independent-review.json)。每条命令有 canonical log/result；保护清单、前后 SHA、旧 QA manifest 与 Codex 日志引用一并留证。

Codex 日志：`/workspace/xiantu/logs/codex/0b875a44baa0e747_20261017_155607_1813566.log`；prompt：`/workspace/xiantu/logs/codex/prompt_p1_salvage_soft_open_20261017.txt`。本 HANDOFF、RESULT 与四段≤30行 status 已 UTF-8 同字节同步 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。

未运行 snapshot / build / sync / release / Pages；未进包、未发版、未打 tag，未抬阶段，无阵法/gifts/#20/拍卖/坊市混窗。

## 下一棒

交执法在**正式 soft-open 磁盘图**重抽 design/30 §4.3 **O01–O08 + 入口冒烟**，回报 tip+out。依据 `/workspace/xiantu/reports/炼器阁/20261017_负责人令_P1③++++++soft-open.md`、design/30 与开态夹具 HANDOFF/RESULT，范式对齐附灵 soft-open tip@217a5a6。PASS≠进包≠发版；执法 PASS 后仍须负责人 release/进包另令，下一刀 release 预期 **v0.6.12**，本令不授权。
