# 20261017 · P1③++++++++ 开态补刀简报：Salvage 正式与 CAS

实现 tip `ef99abb76056a71ebfed6c02d8c9a5c1f175e284`；docs tip/push 结果见新 out `qa/out_v06p1_smith_services_open_ef99abb/final-tip.json`。

最终实现 `ef99abb` 上自检全部 PASS：`npx tsc --noEmit`、主跑 `npm run test:v06p1-smith-services-open`（2980 断言）、隔离 fixture 完整 runner（2897 断言）、22 套回归（182314 断言）、双根 datalint 问题 0、diff/protection/evidence 聚合 exit0。合计断言下界 **188191**；O01–O11 全 PASS，无 blocked；`allOpenCasesPassed:true`、`o05FormalProductionSuccess:true`、`o09StaleForgeEnhanceBlocked:true`。

日志与严格聚合：[selfcheck-summary.json](../../qa/out_v06p1_smith_services_open_ef99abb/selfcheck-summary.json)、[O01_O11.json](../../qa/out_v06p1_smith_services_open_ef99abb/O01_O11.json)、[回归汇总](../../qa/out_v06p1_smith_services_open_ef99abb/regressions/regression-summary.json)。

最终保护：1983 个旧 QA 产物、117 个产品源文件、双根 72 张表测试前后零变化；四 Flag/enhance/strings1013/GAME_PHASE5/gifts0、四结算回调及既有非边界方法 MATCH。UI 主责三文件对 `39d006d` 完整字节 MATCH。新 out 和报告/status 同步共享根。

负责人本令接续界面@9d00852 的 O05/O08/O09/O11 BLOCKED 与炼器@a1d645d 的隔离 fixture 对照；汇合基线@39d006d 含两轨与7b06f5a。历史两个开态 out 与所有关态 out 保留，不覆盖、不改历史判定。

A 生产分解仍默认 new SalvageGate(progress)，无 fixture qualification/carrier 可完整提交。formalSources、Forge完整结果收据与 EquipInstBinding 精确装备槽/背包 instanceRef 核实资格；无相反正式 schema 时四限制按生产 false 默认。未附灵实例的销毁/产出/收据/来源退役同事务；历史 equipInstanceRefs 保留，空槽+来源退役使 resolver empty。已附灵关联不能完整退役则 relation 拒绝，独立保留原档，不用拒绝冒充 O05 成功。

B Forge/Enhance 补全量 snapshot 读盘与 draft 复核，并把 expected 交给最终 SaveStore。同槽自定义 writer 队列、生产 IndexedDB 同一 readwrite事务CAS，避免两个服务前置检查都通过后互相覆盖；Enchant/Salvage同用正式最终CAS。O09 同槽两真实Controller/第二Progress.loadAsync，旧Forge/Enhance在新Enchant后stale，已附灵不丢、已花灵石不恢复；分解双向竞争与真正并发至多一次完整效果。无单GameScene bypass宣称，无UI第二账本。

主表最终双根2980断言、O01–O11全PASS，无blocked；O05明示productionFormalPath:true/fixtureQualificationInjected:false/fixtureCarrierInstalled:false。O08四服务重放不二扣不复活，O11四结果回真实菜单；fixture伴侣完整 runner 2897断言仅作隔离回归。最终提交的专项及全数自检全绿，见新 out 严格聚合。

四 settlement callback AST SHA 对7b06f5a MATCH，四Flag formal true与数值表字节保持，enhance d5b91a06… MATCH；strings1013/d99a88fd…、无SSR43注入、GAME_PHASE5、gifts10×false。未改Controller/Panel/GameScene路由主责文件；未新增生产OpenFlag、未回翻Flag、未另造结算。

本窗 ≠ soft-open ≠ release ≠ 进包；softOpenedSmithServicesUi/released/newOpenFlag均false，不请求soft-open。本窗不fan-out执法；交tip+out后由主程序转告接引子合入重跑，再由主程序安排独立复核。完整交接见 [HANDOFF](V06P1_SMITH_SERVICES_OPEN_FIX_HANDOFF.md) / [RESULT](V06P1_SMITH_SERVICES_OPEN_FIX_RESULT.md)。
