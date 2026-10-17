# P1③++ 强化一期 · 开态夹具交接

时间：2026-10-17（Asia/Shanghai）；目录 `/workspace/xiantu/wt/dev`，分支 `dev`，stdin=/dev/null。

- 开工已执行 `git fetch && git pull --ff-only origin dev`，基线 HEAD=`c5738a9a12f8bf05e5320485788330cfdae7612b`，含关态实现 `64c26a4`。
- 实现 / 自检 tip：`b2ef999ac22f549bad30e8a257e7acbeaca5c8fd`。本文、RESULT 与 status 为随后一笔文档 tip；完整文档 SHA 和 origin/dev HEAD 见最终回执及本窗 QA 的 final-tip.json。
- 依据：负责人令 `/workspace/xiantu/reports/炼器阁/20261017_负责人令_强化开态夹具.md`、design/26 §2.2 / §4.3 O01–O08 / §5、关态 handoff；范式对齐 Forge 开态夹具 `04c93ff`，不沿用当前 Forge soft-open 开放许可。
- **EnhanceOpenFlag 正式恒 false；formalOpen:false / softOpened:false / released:false。PASS≠soft-open≠翻表≠进包≠release。**

## 交付与授权边界

`EnhanceGate` 的 feature / entrance / enhance / submit / level / consume / loadRefresh / laterService 八入口，首语句均查独立 Enhance 旗。false 原样返回 EnhanceClosed 对应八 tip，不读资格或结算行、不抽样、不入事务、不扣费、不改级、不写业务事实或延后队列。EnhanceClosed 与 `64c26a4` 完整字节相同。正式旗只更新说明注释，函数仍恒 false；仅独立 Vite SSR resolve/load 内存模块能注入 true。未改 features、配表旗、ForgeOpenFlag 或 GAME_PHASE=5。

开态图 feature/entrance 只读允许，enhance 只读预览，submit 才执行完整结算；level/consume 只读既有完整结果。laterService 即使开态仍返回 `enhance.closed.later_service`，不进入附灵或分解。强化只用 enhance.* / Enhance*；没有借 Forge Flag 或 forge.closed.* 放行。

`fixtureInstances` 只授权测试明确列出的 instanceRef / itemId / weapon或armor / 合法当前等级。首次完整提交才承载 `enhance` 夹具袋，并核对当前档真实永久物品数量及类型/slot；有袋以袋内实例当前等级为准。默认没有装备授权时拒绝所有新提交；历史袋不替代新请求授权。**现网没有正式装备实例 schema，本实现不宣称该系统落地。** 无新装备生成或碎装，未接正式战斗属性。

数值唯一来自 `@xt/balance/enhance.json` 的 levels[] / maxLevel / statPerLevel / milestoneBonus，下一档严格要求唯一 `to=fromLevel+1` 行。无 fixture rate/费用回退，不读取 enhance.forge / recipes 作为强化数值。属性视图按最终合法等级重算正式 perLevel 比例，并单列已达成里程碑 allRatio 之和；这些是相对基础属性的只读比例事实，不修改玩家基础战斗属性，也不在重载时再次叠加。

Progress 仅增加精确四行：纯结构 import、validSaveData 校验、注释、可选 enhance 字段。既有 export/import/restore 承载完整事实；缺字段旧档保持 undefined，export 不补袋。EnhanceProgress 不读配置、不写盘；严格检查 committed、实例/请求/结果引用、逐实例历史等级链、唯一请求与一一对应 receipts。未知、pending、破链及歧义不猜空、不自动修复、不补做。

## O01–O08 自动化旁证

| 编号 | 已验证的结果 |
|---|---|
| O01 | 独立内存旗授权后 API feature/entrance 只读允许；当前档拥有的 weapon/armor 夹具实例可只读选择。默认无授权新提交拒绝；预览零写零抽样。laterService 仍拒绝。仅验 API，不断言实机 NPC 服务已存在。 |
| O02 | weapon/armor 各覆盖正式 12 个目标档成功；rate/stones/refineStones/dropOnFail 原样来自唯一正式行，完整扣灵石+精炼石、升档、最终属性、确定性 resultRef / receipt 同次提交。另验 rate 阈值两侧。 |
| O03 | 正式 12 行均覆盖无符正常失败；to≤5 的 false 不掉，to≥6 的 true 掉 1 级；照扣当次费用，不碎装。等级/属性/结果/去重及磁盘完整一致。 |
| O04 | 请求使用护器符时因正式映射/消费依据缺失整次拒绝，零扣零抽样；不编造 item id 或数量。本窗没有测试“有效护器符保级成功”。 |
| O05 | 成功、低档失败、高档失败三种完整载荷经 export/import(async)/restore(false)/真实 SaveStore 读回及 fresh SSR，费用/等级/属性/去重一致；最早历史请求重放不重抽、不重复消费或升降级。覆盖成功→失败→成功历史链、跨槽隔离与返回视图副本。 |
| O06 | 满级、非法/非当前档实例、不可强化类型、越界、重复授权、缺行/重复行/坏数值/缺属性依赖、资源不足及非法随机结果，整次拒绝。坏表仅在独立 SSR 内存模块替换；正式表磁盘不写。已有合法袋也拒绝越界授权等级。 |
| O07 | 同 Gate 连点、多 Gate 共用 Progress、同装备不同请求、两装备争用一份库存，至多一笔完整结算。真实 Progress 草稿走 SaveStore/createIndexedDbBackend complete/abort：request成功而complete前保原；abort、扣除端无效/抛错、哨兵false/抛错/true但改草稿均保原，重试只留一份完整结果。 |
| O08 | 正式 false 图覆盖无袋、pending/unknown/损坏袋及 fresh SSR 三种完整历史袋；八 tip 原样、每次 Gate 调用增量零写零抽样，合法等级资产保留，不补做旧请求。损坏袋导入拒绝并保留当前合法资产；开态相关写操作亦阻断歧义。 |

双根 shared + snapshot 各执行正式图、内存开态图、fresh 开态/正式读回图，以及 9 种坏表开态图和 1 种坏表正式图，合计 **28 个独立 SSR 图**；正式图 flagLoads=0、内存图=1，features 覆盖调用=0。总 **5979 断言（静态553 / 运行5426）**。fresh 正式历史图每根的 3 次 storageWrites 全来自预先 import 三种载荷的测试准备；每个 Gate 调用前后均单独断言增量 0，不重抽。其余正式图 storageWrites=0。

并发保证范围沿 Forge/Market 范式：多个 Gate 共享同一真实 Progress；未新增跨标签或不同 Progress 副本的 CAS。测试用内存 IDB 工厂替换介质，但走真实后端 complete/abort；未做浏览器实机 NPC/UI 验收。此限制不作为开放正式服务的依据。

## 自检与保护

全部命令 exit 0，日志与 JSON 在 `qa/out_v06p1_enhance_open_fixture/`：

| 命令 | 结果 / 日志 |
|---|---|
| `npx tsc --noEmit` | PASS；tsc.log |
| `npm run test:v06p1-enhance-open` | 5979；v06p1-enhance-open.log / v06p1-enhance-open-evidence.json |
| `npm run test:v06p1-enhance-closed` | 30630，90语义夹具、7560次API、存储/写哨兵0；enhance-closed.log |
| `npm run test:v06p1-forge-closed` | 20342；forge-closed.log |
| `npm run test:v06p1-market-closed` | 24156；market-closed.log |
| `npm run test:v06d-closed` / `test:v06c-closed` | 15052 / 10708；v06d-closed.log / v06c-closed.log |
| 指定 datalint.py，共享根 / wt/dev/data | PYTHONDONTWRITEBYTECODE=1；均问题0条；datalint-shared.log / datalint-snapshot.log |
| `git diff --check` / `git diff --cached --check` | PASS；diff-check.log / staged-diff-check.log |
| 写前 / 写后 SHA、目录集合 | 665项保护、7组目录，只有 Flag 注释和 Progress 四行是授权差异，**0 未授权差异**；protected-before/after-task.json / protected-diff.json |

三套 closed runner 只精确允许 EnhanceGate.ts / EnhanceProgress.ts / v06p1-enhance-open.test.ts，并对 Progress 精确剥除四个完整授权行后核旧 SHA；EnhanceOpenFlag 精确字符串同步更新，另加强 EnhanceClosed 权威 SHA。八 tip、零副作用、GameScene 无强化接线等断言保留。输出可用 *_CLOSED_OUT 指向新 QA，旧基线只读。旧 `qa/out_v06p1_enhance_closed/` 的路径集合及每个文件完整字节保持；6c/6d 旧输出亦备份后原样恢复。

| 冻结项（写前=写后） | SHA-256 |
|---|---|
| enhance.json（三根） | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` |
| recipes.json（三根） | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` |
| ForgeOpenFlag.ts | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` |
| ForgeGate.ts | `44f556147408019188da0cd793076993491653d62e7e9996c67a20303ecbee86` |
| EnhanceClosed.ts | `c52ffbfc269f3a41c309184d9781f23cf2511d5acec7570ebb44b84683b3e821` |
| GameScene.ts | `294b934b52a8b6537214360fffb93497643ce8261bea03aba8caf405cf5fcedf` |
| ShopPanel.ts | `419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c` |
| life_skills.json（三根） | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` |
| npcs.json（三根） | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| shops.json（三根） | `4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2` |
| quests.json（三根） | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| strings_zh.json（三根） | `92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab` |

三根 balance/maps 全文件集合、features/data、SaveStore 与原前台均受完整 SHA 保护。smith_ou 无 services、quests=[]；没有 GameScene/ShopPanel 强化接线或 dialog/quests/地图/NPC 修改；gifts 保持每根 10×false，GAME_PHASE=5。

## 提交、日志与下一棒

实现 tip `b2ef999ac22f549bad30e8a257e7acbeaca5c8fd` + 随后的文档 tip，以普通 `git push origin dev` 交付；完整文档 SHA、推送结果和 origin/dev HEAD 见最终回执及 QA/final-tip.json。只暂存本窗10个实现/测试/兼容文件、新QA旁证、HANDOFF/RESULT 与 status；pending art、dist-test、旧 qa/out_*、talisman 审计及 codex_prompt 留原位，不纳入。

本 HANDOFF / RESULT 与 ≤30 行、四段 status 以 UTF-8 同内容副本同步到 `/workspace/xiantu/reports/炼器阁/` 及 `/workspace/xiantu/status/炼器阁.md`。Codex 日志：`/workspace/xiantu/logs/codex/46eb5faf5f35b279_20261017_074203_1175678.log`。

下一棒交执法堂按 **design/26 §4.3 O01–O08** 抽检本实现 tip、正式图八 tip 零写、正式数值源、实例授权/护符拒绝、事务与禁改 SHA。本报告不代执法勾选 O 表。强化 soft-open、前台入口、正式实例系统、有效护符映射、进包/release 均等待负责人另令。未混 gifts / #20 gathering / 阵法 / 拍卖 / 坊市及6b/6c/6d开态窗；本窗 PASS≠soft-open≠release。
