# P1③++++++++ 开态补刀结果：Salvage 正式依赖与跨 Progress CAS

实现 tip：`ef99abb76056a71ebfed6c02d8c9a5c1f175e284`；docs tip 与普通 push 结果见新 out `final-tip.json`；out：`qa/out_v06p1_smith_services_open_ef99abb/`。

**A/B 完成，正式提交上 O01–O11 全 PASS、22 套回归全绿。** 本窗 ≠ soft-open ≠ release ≠ 进包；`softOpenedSmithServicesUi:false`、`released:false`、`newOpenFlag:false`；本窗不 fan-out 执法，不请求 soft-open。

A：生产仍 `new SalvageGate(progress)`，空 fixture 能完整提交。正式资格从本档 Forge 收据/formalSources 与 EquipInstBinding 精确位置证明；当前无对立资格 schema 时 bound/natal/bloodBound/unsalvageable 四项按生产可分解默认 false。销毁、产出、收据及来源退役同事务一次；装备历史 equipInstanceRefs 保留，但空槽+退役使 resolver empty。已附灵目标不能完整退役关联时仍 relation 整拒，O05 用未附灵正式目标成功证明，不以拒绝代勾。evidence 明示 `fixtureQualificationInjected:false`、`fixtureCarrierInstalled:false`、`productionFormalPath:true`、`o05FormalProductionSuccess:true`。

B：Forge/Enhance 全量 snapshot 读盘与 draft 核验，expected 传到最终 SaveStore；自定义后端同槽 writer 队列、生产 IndexedDB 同 readwrite 事务的 get/比较/put 封住跨服务并发窗口。Enchant/Salvage 亦沿最终 CAS。两真实 Controller、第二 Progress.loadAsync、初始完整快照相等；先附灵再旧 Forge/Enhance 均 stale，`lostCompletedEnchant:false`、`restoredSpentStones:false`。分解与强化顺序双向及分解对 Forge/Enchant 真正并发均至多一完整提交、不负库存、不复活销毁来源。`singleGameSceneCurrentProgressBypassClaimed:false`，无 UI 第二账本。

O05/O08/O09/O11 的旧 blocked 已替换为正式成功/重放/CAS拒绝覆盖/真实结果回菜单。其余既有 PASS 子项保留；Controller/Panel/GameScene 路由侧生产代码未改。主表双根最终2980断言，O01–O11全部 PASS；fixture 伴侣完整 runner 2897断言只作隔离回归，不能充生产 O05。最终提交上的全部检查已通过，详见下段及新 out。

四 Gate 唯一结算 callback AST SHA 对基线 `7b06f5a` MATCH；四 Flag formal true 字节 MATCH；enhance `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` MATCH；双根 strings1013 SHA `d99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841`，`stringsSsrInjected43:false`；GAME_PHASE=5、gifts10×false。冻结表和旧 open/fixture/closed outs 不覆盖，证据见新 out protection/audit。

最终实现 `ef99abb` 上自检全部 PASS：`npx tsc --noEmit`、主跑 `npm run test:v06p1-smith-services-open`（2980 断言）、隔离 fixture 完整 runner（2897 断言）、22 套回归（182314 断言）、双根 datalint 问题 0、diff/protection/evidence 聚合 exit0。合计断言下界 **188191**；O01–O11 全 PASS，无 blocked；`allOpenCasesPassed:true`、`o05FormalProductionSuccess:true`、`o09StaleForgeEnhanceBlocked:true`。

日志与严格聚合：[selfcheck-summary.json](../../qa/out_v06p1_smith_services_open_ef99abb/selfcheck-summary.json)、[O01_O11.json](../../qa/out_v06p1_smith_services_open_ef99abb/O01_O11.json)、[回归汇总](../../qa/out_v06p1_smith_services_open_ef99abb/regressions/regression-summary.json)。

最终保护：1983 个旧 QA 产物、117 个产品源文件、双根 72 张表测试前后零变化；四 Flag/enhance/strings1013/GAME_PHASE5/gifts0、四结算回调及既有非边界方法 MATCH。UI 主责三文件对 `39d006d` 完整字节 MATCH。新 out 和报告/status 同步共享根。

详细范围、O表、原子边界和四 settlement AST SHA 见 [HANDOFF](V06P1_SMITH_SERVICES_OPEN_FIX_HANDOFF.md)。由主程序转告接引子合入 tip 后重跑 O05→O08/O09/O11 及全表；本窗不 fan-out 执法。补刀 PASS 仍 ≠ soft-open ≠ release ≠ 进包。
