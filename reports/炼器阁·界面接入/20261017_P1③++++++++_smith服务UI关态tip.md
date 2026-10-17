# P1③++++++++ smith 服务 UI 关态 tip 交付

2026-10-17｜炼器阁·界面接入｜分支 `feat/ui-smith-services`｜基线 `origin/dev@0dd59efdcd288930f1bd0525d2c9e7ddf06c0814`

实现验收 TIP_SHORT：`84d4351`
实现验收 TIP_FULL：`84d4351c8a643145ee15ec4c2d5a90c589227f53`
普通提交：`feat(v0.6-p1): wire smith services UI closed tip`。随后报告/status 的 docs-only 提交不改变本实现验收 tip；最终推送 HEAD 以共享目录同名报告末尾记录为准。

欧冶匠邻近交互已从四连冒烟 tip 收敛为普通对白 → `t('ui.smith.title')` → 打造/强化/附灵/分解菜单 → 正式候选/详情与资源 → 确认 → 既有 Gate.submit → 同请求 Gate 结果再核验 → 结果/返回。入口仍消费交互并校验可见与 28×40 距离；直接 talk 路由同一入口，不改 npcs。

`SmithServicesUiAccess` 生产六 scope 恒 true；只有独立 Vite SSR 图可内存关闭 entrance/menu/单服务，生产不能被全局注入关闭。UI 关只用 ui.smith.closed；单 Gate 内存关只用对应 closed.*，不调用 laterService。新增面板请求身份深冻结，仅 UI 防连点；跨关窗保留进行中的锁，切档/换 Progress/旧 session 回调无效；未决只读原请求结果，不自动重试或补做。Enter 默认返回，Esc 提交前回上级；分解确认不默认聚焦销毁。

正式装备沿 EquipInstBinding 按 instanceRef 独立行，视图编号、位置、当前强化/五行供区分；不以 itemId/数量/唯一候选代替身份。护符默认否，缺符整拒且不静默去符，保级说明仅 Gate 只读校验通过后显示。分解正式资格/atomicCarrier 依赖本窗未适配，沿现有 Gate 拒绝；无 SalvageFixture 生产回退。Gate/收费/结算/收据/数值全部未改。

C01–C11 为本窗自检结果，待经理另派执法；未改 design/24–32 历史 C/O 勾选，未执行 design/32 O01–O11 全表。

| 编号 | 操作 | 自检证据 |
|---|---|---|
| C01 | 入口关反复交互/重读 | PASS：真实 GameScene 5 次交互，只有 ui.smith.closed，无菜单 |
| C02 | 菜单关/旧对话与菜单点击 | PASS：恢复欧冶匠普通对白；旧选项/按钮只 tip |
| C03 | 打造面板/UI 与 Gate 关 | PASS：合法、缺图纸、缺料、承载拒绝目标，零请求/扣发/品质/经验 |
| C04 | 强化面板/UI 与 Gate 关 | PASS：正式实例、无符/有符/不足/满级，零抽样/扣费/等级改写 |
| C05 | 附灵面板/UI 与 Gate 关 | PASS：首附、同元素、覆盖、防具，零消费/附着/属性改写 |
| C06 | 分解面板/UI 与 Gate 关 | PASS：正式/不合资格/未知品质/承载拒绝，零销毁/产出/关联变动 |
| C07 | UI 与四 Gate 独立 | PASS：UI 关时四 Gate true；仅单 Flag 内存 false 时其余独立；生产忽略 SSR 注入 |
| C08 | 身份冒充 | PASS：无实例、聚合 itemId、fixture、跨档、旧位置均关态优先拒绝；不补实例 |
| C09 | 连点/并发/旧回调 | PASS：24 次旧确认并发、跨服务共享资源、切 slot/同 slot 换 Progress、旧按钮全拒新写 |
| C10 | 读档/刷新/退出重进 | PASS：真实 restore 完整旧结果和损坏记录，清视图成功文本，不补做/补发/修档 |
| C11 | 全量增量与 E/I 隔离 | PASS：exportSave+公开字段逐动作比较零增量；E/I 快照保持；不串 attr/later_service |

`npm run test:v06p1-smith-services-closed` **PASS：1748 assertions**，snapshot + shared 两图；实际 GameScene、SmithServicesPanel 键鼠/旧 pointer 回调及 controller 均参与。`submitCalls/localStorageWrites/indexedDbOpens/sentinelCalls/settlementRandomCalls/fullBusinessStateDelta` 全部 **0**。

验证：`npx tsc --noEmit` PASS；`npm run test:equip` PASS 100 assertions；attr-ui closed / binding 在隔离数据根中分别 PASS 1592 / 327 assertions。四既有 Gate 的 SSR 运行回归 16 图 PASS 13684 assertions（含正式开图、内存关图及全新 SSR 刷新；只属既有 Gate 回归，不充作完整服务 UI 开态 O 全表）。

原命令阻塞保留：8 个旧 forge/enhance/enchant/salvage JS 包装脚本中 7 个仍钉历史 strings960 SHA，salvage-closed 钉历史 Progress SHA；attr-ui closed 钉 shared970 SHA，binding 钉另一 worktree/branch。未改这些历史数据冻结口径来冒认 PASS。Gate 运行断言全部保留，仅 sceneSmoke 改为正式入口/菜单；强化历史960测试仅通过 Vite 内存移除只读实例10键隔离，磁盘仍970；attr 隔离保留全部 Gate/E/I 断言。原失败日志、隔离参数与结果在 regressions/；旧 qa 的已跟踪证据原字节保留。

strings 分工：本 worktree `data/balance/strings_zh.json` **970（含 _meta）**，SHA `ae51319b82a6486cc7f3d9b26c5ae89719e23c32ff9debdcfbb86ef7b5aea08b`。43 键由炼器主责，**未并入本分支**；本窗未写盘、未 snapshot。新关态套件仅将43键作为 Vite 虚拟 JSON 的内存对象注入，逐键全文与 design/32 §6.2 MATCH：`stringsDiskKeys:970`、`stringsSsrInjected43:true`。共享权威表当前已被炼器并行窗口增至1013，43键只读比对 MATCH，不由本窗同步至快照。

| 冻结项 | SHA-256 / 结果 |
|---|---|
| enhance.json | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 MATCH |
| ForgeOpenFlag.ts | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e MATCH |
| EnhanceOpenFlag.ts | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e MATCH |
| EnchantOpenFlag.ts | bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a MATCH |
| SalvageOpenFlag.ts | 69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3 MATCH |
| 其余数据与原结算 | 写前冻结569文件，变化0；四 Gate/Progress/SaveStore/EquipInstBinding/EquipInstReadonly/data.ts MATCH |

`smithServicesUiWired:true`；`newOpenFlag:false`；`productionIgnoresSsrInjection:true`；`settlementUnchanged:true`；`softOpenedSmithServicesUi:false`；`released:false`。GAME_PHASE=5，recipes/materials/items/life_skills/enhance_protect_charm/npcs 均未改，未接阵法/gifts/#20/拍卖/坊市。本窗≠soft-open≠release≠进包≠完整开态 O。

证据根：`qa/out_v06p1_smith_services_closed/`；主证据 `evidence.json`，汇总 `validation-summary.json`。下一棒：经理派执法 C01–C11；炼器43键/正式 Gate 适配独立合入；之后再按另令开态夹具与放行。本窗不声明完整运行销账。

实现提交文件列表（报告/status 随 docs-only 提交另附）：

- `package.json`
- `qa/out_v06p1_smith_services_closed/evidence.json`
- `qa/out_v06p1_smith_services_closed/regressions/attr-binding-success/evidence.json`
- `qa/out_v06p1_smith_services_closed/regressions/attr-closed/evidence.json`
- `qa/out_v06p1_smith_services_closed/regressions/attr-isolation.json`
- `qa/out_v06p1_smith_services_closed/regressions/enchant-closed.log`
- `qa/out_v06p1_smith_services_closed/regressions/enchant-open.log`
- `qa/out_v06p1_smith_services_closed/regressions/enhance-closed.log`
- `qa/out_v06p1_smith_services_closed/regressions/enhance-gate-runtime-isolated-evidence.json`
- `qa/out_v06p1_smith_services_closed/regressions/enhance-gate-runtime-isolated.log`
- `qa/out_v06p1_smith_services_closed/regressions/enhance-isolated-runtime.mjs`
- `qa/out_v06p1_smith_services_closed/regressions/enhance-open.log`
- `qa/out_v06p1_smith_services_closed/regressions/forge-closed.log`
- `qa/out_v06p1_smith_services_closed/regressions/forge-open.log`
- `qa/out_v06p1_smith_services_closed/regressions/gate-runtime-evidence.json`
- `qa/out_v06p1_smith_services_closed/regressions/gate-runtime-retry.log`
- `qa/out_v06p1_smith_services_closed/regressions/gate-runtime.log`
- `qa/out_v06p1_smith_services_closed/regressions/gate-runtime.mjs`
- `qa/out_v06p1_smith_services_closed/regressions/salvage-closed.log`
- `qa/out_v06p1_smith_services_closed/regressions/salvage-open.log`
- `qa/out_v06p1_smith_services_closed/validation-summary.json`
- `scripts/v06p1-enchant-closed-test.mjs`
- `scripts/v06p1-enchant-open-test.mjs`
- `scripts/v06p1-enchant-soft-open-compat-proof.mjs`
- `scripts/v06p1-enhance-closed-test.mjs`
- `scripts/v06p1-enhance-open-test.mjs`
- `scripts/v06p1-forge-closed-test.mjs`
- `scripts/v06p1-forge-open-test.mjs`
- `scripts/v06p1-salvage-open-test.mjs`
- `scripts/v06p1-salvage-soft-open-compat-proof.mjs`
- `scripts/v06p1-smith-services-closed-test.mjs`
- `scripts/v06p1-smith-services-scene-compat.mjs`
- `src/SmithServicesController.ts`
- `src/SmithServicesPanel.ts`
- `src/SmithServicesUiAccess.ts`
- `src/scenes/GameScene.ts`
- `src/v06p1-enchant-open.test.ts`
- `src/v06p1-enhance-open.test.ts`
- `src/v06p1-forge-open.test.ts`
- `src/v06p1-salvage-open.test.ts`
