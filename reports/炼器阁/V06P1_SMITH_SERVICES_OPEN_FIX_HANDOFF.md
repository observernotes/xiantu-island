# P1③++++++++ 开态补刀交接：Salvage 正式依赖与跨 Progress CAS

实现 tip：`ef99abb76056a71ebfed6c02d8c9a5c1f175e284`；文档 tip：见新 out `final-tip.json`；新 out：`qa/out_v06p1_smith_services_open_ef99abb/`。分支 `feat/smith-services-open-fix`，工作目录 `/workspace/xiantu/wt/v06p1-smith-services-open-fix`。普通 commit/push 的最终状态以新 out 的 `final-tip.json` 为准。

**A 正式分解与 B 跨 Progress CAS 完成；实现 tip 上 O01–O11、22 套回归及全部自检已通过。** 本窗 ≠ soft-open ≠ release ≠ 进包；`softOpenedSmithServicesUi:false`、`released:false`、`newOpenFlag:false`。不请求 soft-open，不抬 GAME_PHASE，不 fan-out 执法。

## 权威基线与范围

依据共享根负责人令 `reports/炼器阁/20261017_负责人令_P1③++++++++开态补刀_Salvage正式与CAS.md`、`design/32` §4.3 O01–O11，以及只读阻断基线 `qa/out_v06p1_smith_services_open_9d00852/blockers.md`。起点 `39d006dadd0b9937a81d9a6bf41caaa7e4ad01d7` 已汇合界面 `9d008527cf618f14a4717876b679095e3d728248`、炼器 `a1d645d836761d2a57ce12833af95524f8e1205a` / 文档 `b81af6107e908219132c830def29570d85620a66` 和基线 `7b06f5ac4e76a2c48e98431e1ccf0011a8ca0a41`；最终 ancestry 核验见 `final-tip.json`。

旧界面 out 的 O05/O08/O09/O11 BLOCKED 是本次问题依据，保留原字节；旧 `out_v06p1_smith_services_open_fixture` 仅隔离 SSR 对照，不能抵消生产阻断。本次完整成功来自生产默认 `new SalvageGate(progress)`，不由旧 fixture 成功推定。未改 `SmithServicesController.ts`、`SmithServicesPanel.ts`、`scenes/GameScene.ts` 的路由/面板侧实现。

## A：默认生产分解完整路径

`SalvageGate` 无 `fixture.qualification` 时从本档 `formalSources`、完整 Forge 成品/收据和正式实例核实资格。装备槽用 `resolveFormalEquipSlotBinding`；背包用 `listBagFormalEquipBindings` 与 `resolveFormalInventoryEquipBinding` 核实所选 `instanceRef`。不从 itemId、数量、唯一候选或首条记录选择实例。

当前正式装备没有相反的 bound/natal/bloodBound/unsalvageable schema；合法正式来源加精确位置核实后，生产资格四项按可分解默认 false。`SalvageFixtureQualification` 回调仍仅是显式隔离回归覆盖，生产适配层没有 provider、fixture 回退或自动授权来源。

未附灵实例成功销毁时，装备/背包持有、全部精炼石产出、`formalSources` 退役、完整结果与收据在同一 `runSaveTransactionAsync` 事务内提交。装备槽销毁沿原有结算保留历史 `equipInstanceRefs` 字节；槽为空且正式来源退役，resolver 返回 `empty`，背包 resolver 不再提供销毁目标。历史 Forge/Enhance 结果和未选实例保留。

已有附灵袋要求关联实例保留正式来源；无法完整退役附灵历史的目标继续 `salvage.fixture.relation` 整拒，原存档不变。此拒绝另作保护证据，O05 成功由未附灵正式实例的完整提交证明。生产无 `fixture.atomicCarrier` 时直接使用正式 Progress/SaveStore 承载；不自动安装 `SalvageFixtureCarrier`。

O05 evidence 明示 `fixtureQualificationInjected:false`、`fixtureCarrierInstalled:false`、`productionFormalPath:true`、`o05FormalProductionSuccess:true`。先验证同原型三件中的明确背包实例完整提交，再经真实 Controller 分解正式装备槽实例并返回菜单，未选已附灵实例保持。

## B：全量存档 CAS 与最终原子边界

Forge/Enhance 正式路径将 `Progress.exportSave()` 的全量规范化快照作为 expected；先 `readSlot` 核对持久整槽，再于 draft 内复核。不同服务的 enchant/stones/forge/inventory/equip/formalSources/salvage 等任一持久事实变化都不能被旧 Progress 整槽写回覆盖。`Progress.getSaveSlot()` 使用已绑定实例槽，不以全局当前界面槽替代归属。

单次前置读盘不足以阻止不同服务同时通过核验。本次把 expected 继续传到 `Progress.runSaveTransactionAsync` → `SaveStore.writeSlot`：自定义后端的同槽全部普通 writer 共用 SaveStore 队列，并在最终写入前比较；生产 IndexedDB 用 `compareAndWrite` 在同一个 `readwrite` 事务中 get/比较/put，只有 transaction complete 才返回成功。最终 CAS 失败不发布 draft，不留下半扣半发。

Enchant 原有全量 snapshot 范式也接入最终 SaveStore CAS，Salvage 使用同一正式承载；没有 UI 第二账本。旧对象预检冲突返回 `*.fixture.stale`；两服务真正并发、预检均已通过而最终 CAS 失配时，沿既有 `*.fixture.save` 保存拒绝。二者均 `allowed:false`，完整新状态保持。

O09 以同槽两个真实 Controller、第二对象 `Progress.loadAsync(1)` 重现：先 Enchant 完整成功，再旧 Forge/Enhance 均 stale；`lostCompletedEnchant:false`、`restoredSpentStones:false`。分解与强化双方向顺序竞争，以及不同 Progress 分解对 Forge/Enchant 的 `Promise.all` 同时竞争，均保留唯一完整提交、无负库存、无销毁来源复活。隔离测试固定 GameClock 并保存正式读档规范化基线，断言竞争前两个完整快照相等，排除 age/daily 元数据造成的假 stale；测试结束恢复时间源。`singleGameSceneCurrentProgressBypassClaimed:false`。

## O 表补刀与隔离对照

| 项 | 新正式路径证据 |
|---|---|
| O05 | 默认 Gate 无资格/承载注入，背包与装备槽完整销毁、产出/收据同事务、来源退役；已附灵拒绝另留证。 |
| O08 | 四服务完整提交后真实保存/读档/刷新；原请求完整重放和同 id 改载荷拒绝；分解不二扣、不复活、不新增销毁收据。 |
| O09 | 旧 Forge/Enhance 不覆盖已提交附灵；分解连点、多请求、跨 Progress 顺序/真正并发均受正式 CAS 保护。 |
| O11 | 四服务真实完整结果经实际 Panel 菜单指针回菜单，回程零写入；故意关态和 E/I 独立子项保持。 |

打造/强化/附灵既有 PASS 子项保留。主表读取双根真实 strings1013，O11 仅隔离 SSR false closure，不改正式四 Flag。`src/v06p1-smith-services-open-fixture.test.ts` 保留显式资格/载体对照，并补正式 Forge 首次提交前的存档基线；此图仅作隔离回归，不作为生产 O05 证据。

主表最终运行 2980 断言：snapshot 正式图1474+异常护符图16、shared 同数，O01–O11 全 PASS，无 blocked。隔离 fixture 完整 runner 2897 断言 PASS，只作回归对照。全部结果见下文与新 out 最终 evidence。

## 结算与冻结保护

授权改动只补资格与事务边界。`checkSettlement` 从基线 `7b06f5a` 与当前代码各取四 Gate 唯一 `this.transact` 结算回调，使用 TypeScript AST 打印、去注释后比 SHA-256；四项均 MATCH。该检查不声称整份 Gate 源码未变。

| 结算回调 | 基线/当前 AST SHA-256（MATCH） |
|---|---|
| Forge | `1136c416c238ee16c1daa552202e67d2d0f1e114d911b4cce059c105d011c57c` |
| Enhance | `1fc8a5a5df6a6b5167370828820443e72010ce423bef2b925a48a6faa8ff11bb` |
| Enchant | `9a199a3cc5edb153906bc7ed45f47bacb929759c3c584a525c1d7971646a973c` |
| Salvage | `3da72e2ed1f427d76271e732ad3164d66d02abd13e619e8706568da680097e7d` |

四 Flag formal true 字节保持：Forge `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e`；Enhance `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e`；Enchant `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a`；Salvage `69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3`。不新建生产 OpenFlag。

双根 `enhance.json` SHA `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954`、strings1013 SHA `d99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841` 保持；`stringsSsrInjected43:false`、GAME_PHASE=5、gifts10×false。recipes/materials/items/life_skills/enhance_protect_charm、data.ts 及其余冻结表保留。旧 `open_9d00852`、`open_fixture`、所有关态 out 与共享 `closed_7b06f5a` 不覆盖；完整目录清单及字节证据见新 out 的 protection/audit。

## 最终自检与交付（主责定稿）

最终实现 `ef99abb` 上自检全部 PASS：`npx tsc --noEmit`、主跑 `npm run test:v06p1-smith-services-open`（2980 断言）、隔离 fixture 完整 runner（2897 断言）、22 套回归（182314 断言）、双根 datalint 问题 0、diff/protection/evidence 聚合 exit0。合计断言下界 **188191**；O01–O11 全 PASS，无 blocked；`allOpenCasesPassed:true`、`o05FormalProductionSuccess:true`、`o09StaleForgeEnhanceBlocked:true`。

日志与严格聚合：[selfcheck-summary.json](../../qa/out_v06p1_smith_services_open_ef99abb/selfcheck-summary.json)、[O01_O11.json](../../qa/out_v06p1_smith_services_open_ef99abb/O01_O11.json)、[回归汇总](../../qa/out_v06p1_smith_services_open_ef99abb/regressions/regression-summary.json)。

最终保护：1983 个旧 QA 产物、117 个产品源文件、双根 72 张表测试前后零变化；四 Flag/enhance/strings1013/GAME_PHASE5/gifts0、四结算回调及既有非边界方法 MATCH。UI 主责三文件对 `39d006d` 完整字节 MATCH。新 out 和报告/status 同步共享根。

实现与文档采用普通 commit；仅普通 push `origin feat/smith-services-open-fix`，不修改 dev，不 force。docs tip 与实际 pushExitCode 由推送后写入的 [final-tip.json](../../qa/out_v06p1_smith_services_open_ef99abb/final-tip.json) 记录；其中实现 tip 固定为 `ef99abb76056a71ebfed6c02d8c9a5c1f175e284`，祖先包含 `9d00852` / `a1d645d` / `b81af61` / `7b06f5a`。

主程序收到 tip+out 后转告接引子合入，按 O05→O08→O09→O11 分解子项及全表重跑。本窗不 fan-out 执法；独立执法复核由主程序后续转交。补刀 PASS 仍 ≠ soft-open ≠ release ≠ 进包；不混入阵法/gifts/#20/坊市，不请求 soft-open。

## 逐回归结果

| 套件 | 退出码 | 记录断言 |
|---|---:|---:|
| v06p1-smith-services-closed | 0 | 2057 |
| v06p1-attr-ui-closed | 0 | 1592 |
| v06p1-attr-ui-binding-success | 0 | 327 |
| v06p1-attr-ui-map-api | 0 | 1128 |
| v06p1-attr-ui-map-services | 0 | 175 |
| v06p1-forge-closed | 0 | 20556 |
| v06p1-enhance-closed | 0 | 30978 |
| v06p1-enchant-closed | 0 | 12619 |
| v06p1-salvage-closed | 0 | 19413 |
| v06p1-forge-open | 0 | 6488 |
| v06p1-enhance-open | 0 | 17901 |
| v06p1-enchant-open | 0 | 4692 |
| v06p1-salvage-open | 0 | 7344 |
| v06p1-market-closed | 0 | 23119 |
| v06p1-market-open | 0 | 2580 |
| v06b-closed | 0 | 744 |
| v06b-open | 0 | 816 |
| v06c-closed | 0 | 10730 |
| v06c-open | 0 | 682 |
| v06d-closed | 0 | 15083 |
| v06d-open | 0 | 3016 |
| save-slots | 0 | 274 |

既有测试源的授权更新包括正式 Forge 前保存、读档规范化基线、隔离固定时钟、全量 stale 优先与生产空 fixture 成功；统一 loader 只改测试准备/静态历史字节证明，不改生产 SSR 模块或结算业务断言。恢复缺失的 `src/gen/assets.json` 使用 game 既有清单，仅在 gitignored 目录供 tsc/SSR 读取；未 build/sync/进包。
