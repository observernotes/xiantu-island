# P1③++++++++ smith 服务 UI 关态 tip 交付（strings1013 + SmithServices 合入）

2026-10-17｜炼器阁·界面接入｜分支 `feat/ui-smith-services`

实现验收 TIP_SHORT：`7b06f5a`
实现验收 TIP_FULL：`7b06f5ac4e76a2c48e98431e1ccf0011a8ca0a41`
合入基线：`origin/dev@f87e1c2`（`f87e1c276ad3116e37f9f50132dd5174ed681713`）。

已通过 merge 提交 `ed8d83e` 合入炼器 `7ebf164/f87e1c2` 的 strings1013、SmithServices 与 services closed 套件；实现提交为 `feat(v0.6-p1): merge smith services and consume disk strings1013`。随后本报告、HANDOFF 和两份 status 由 docs-only 提交交付；普通推送目标 `origin/feat/ui-smith-services`，最终推送 HEAD 见交付回执。未 rebase、未 force-push。

欧冶匠普通对白 → 四服务菜单 → 选择/详情与资源 → 确认 → SmithServices.submit → 结果/返回已接。`SmithServicesUiAccess` 保留生产六 scope 恒 true，独立 SSR 图可关闭入口/menu/单服务。`SmithServices.routeAvailable` 已委托 UiAccess，原恒 false 不再封死生产 UI；Gate 可用性与结算仍由既有四 Gate 控制。

Controller 持有唯一 `SmithServices` 实例，消费 `choices/select/submit/result/loadRefresh` 与 services tip 键；新增 services 只读 `availability` 供 guard/poll 使用，正常轮询不清除确认选择。Controller 已移除独立 Gate 实例、提交分派及重复结果身份匹配，只负责请求视图、会话安全与结果文案。改选/五行/护符/返回/关闭均失效旧确认；隐藏、切档、换 Progress 防旧回调；throws/unknown/stale 保留固定未决意图，只读原请求结果且不自动重试。

`SmithServicesPanel` 选择→确认→结果、键鼠、旧视图清理与 GameScene 对话入口均保留。Enter 默认返回；Esc 提交前回上级；分解确认不默认聚焦销毁。正式实例来自 services 的 EquipInstBinding 选择，E/I 只读显示独立。分解正式资格/atomicCarrier 未齐时继续沿既有 Gate 拒绝，无 fixture 回退。

磁盘字符串已经接通：

- `stringsDiskKeys:1013`（含 `_meta`），worktree 与权威 `/workspace/xiantu/balance/strings_zh.json` 字节一致。
- strings SHA-256：`d99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841`。
- 生产 `t('ui.smith.*')` / `t('forge.grade.*')` 读取磁盘表；43 键逐键对 design/32 §6.2 全文 MATCH，并实际经 `t()` 验证。
- 原 970 键前缀字节 MATCH；43 键 SSR 虚拟 JSON 注入已删除，`stringsSsrInjected43:false`，`stringsInjectionSource:none`。仅保留测试预期对象作 MATCH 校验。
- 未运行 `npm run snapshot`；未改既有 970 键字节。

`npm run test:v06p1-smith-services-closed` **PASS：2057 assertions**，覆盖实际 GameScene、Panel 键鼠/旧 pointer、Controller 与 snapshot/shared 两图。各动作比较 exportSave 和全部公开字段，实际 Gate submit、localStorage 写、indexedDB 打开、写接口哨兵、结算抽样、业务增量全部 **0**。

| 编号 | 关态自检内容 | 结果 |
|---|---|---|
| C01 | 入口关闭、真实交互反复触发/重读 | PASS |
| C02 | 菜单关闭、旧对白/菜单/面板 pointer 回调 | PASS |
| C03 | 打造 UI/Gate 关闭，合法及缺图纸/料/承载拒绝目标 | PASS |
| C04 | 强化 UI/Gate 关闭，护符默认否、资源/满级、Enter/Esc | PASS |
| C05 | 附灵 UI/Gate 关闭，首附/同元素/覆盖/防具 | PASS |
| C06 | 分解 UI/Gate 关闭，正式/不合资格/未知品质/承载拒绝 | PASS |
| C07 | UI 与四 Gate 独立；生产六 scope 忽略 SSR 注入且菜单/面板路由可达 | PASS |
| C08 | 无实例、itemId 冒充、fixture、跨档及旧位置身份 | PASS |
| C09 | 连点/并发/旧回调；确认后五次 poll；throws/unknown/stale 禁重试 | PASS |
| C10 | 完整/损坏旧档 restore、刷新与退出重进；固定意图经 services.result | PASS |
| C11 | 全业务状态零增量、E/I 快照隔离、无 attr/later_service 串用 | PASS |

补充验证：

| 命令/范围 | 结果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run test:v06p1-smith-services-closed` | PASS，2057 断言 |
| `npm run test:v06p1-smith-services-services-closed` | PASS，17425 断言，6 个独立图 |
| `npm run test:equip` | PASS，100 断言 |
| attr-ui closed（已钉 SHA 的 test-only loader） | PASS，1592 断言，真实产品模块读磁盘1013 |
| `git diff --check` | PASS |

同名脚本冲突已拆开：默认命令始终指向 UI C01–C11；炼器原套件改为 `test:v06p1-smith-services-services-closed`，TS services 测试保留。其原 production-closed 图现在仅在 SSR 内存关闭 UiAccess 入口，其他隔离图继续独立测试路由和 Gate 关态；未改生产 Flag。炼器原证据保存在 `qa/out_v06p1_smith_services_services_closed/origin-dev-evidence.json`，本次复跑写独立 `evidence.json`。两侧报告目录均保留，本次只改界面接入侧报告/status。

attr-ui closed 原脚本冻结 strings970，复跑使用已钉 SHA 的 loader，仅适配历史测试 SHA/count 与精确回剥43键证明；继续校验970→960原字节，不拦截产品模块或替换真实数据。命令、适配记录与零写入证据在 `qa/out_v06p1_smith_services_ui_merge1013/regressions/`。旧回归与历史 C/O 记录保留。

| 保护项 | SHA-256 / 结果 |
|---|---|
| enhance.json | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` MATCH |
| ForgeOpenFlag.ts | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` MATCH |
| EnhanceOpenFlag.ts | `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e` MATCH |
| EnchantOpenFlag.ts | `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a` MATCH |
| SalvageOpenFlag.ts | `69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3` MATCH |
| Gate/Closed/Progress、SaveStore、data.ts、E/I、指定 balance | 39 个保护文件运行前后 SHA MATCH；GAME_PHASE=5 |

`smithServicesUiWired:true`；`productionIgnoresSsrInjection:true`；`productionServicesRoutesAccessible:true`；`newOpenFlag:false`；`settlementUnchanged:true`；`softOpenedSmithServicesUi:false`；`released:false`。enhance、四 Flag、Gate/结算/收据均未改，未接阵法/gifts/#20。

主证据：`qa/out_v06p1_smith_services_closed/evidence.json`；汇总：同目录 `validation-summary.json`。本次交付阻断项：无。**待经理派执法 C01–C11**；本窗自检不代执法结论，未代勾历史 C/O，未执行 design/32 O01–O11 全表。**≠开态O ≠soft-open ≠release ≠进包**。未通知其他 bot，未 fan-out 执法。
