# P1③++++++++ 完整炼器服务 UI · soft-open preamble HANDOFF

2026-10-17 Asia/Shanghai｜炼器主责｜负责人令经项目经理执行。

**程序自检 PASS；softOpenedSmithServicesUi:true；released:false；newOpenFlag:false。交接引子配合 + 执法 soft smoke；本窗不代执法、不 fan-out。smith-services soft-open ≠ release ≠ 进包 ≠ 发版；fixture ≠ 正式。下一刀 release/进包须负责人另令。**

工作目录仅 `/workspace/xiantu/wt/feat/ui-smith-services`，分支 `feat/ui-smith-services`。开工 fetch/status exit 0，工作树干净，起点 `7492dc9e96618a4187772db5e9acb4c6ef0a097b` 与 origin 一致。`git merge-base --is-ancestor abff11da3e5b251187649bc8a37ef9d7b8729fa2 HEAD` exit 0，包含合入族补刀 `ef99abb`。未改 wt/dev，仅普通推送 origin/feat/ui-smith-services。

实现 tip：`1e256ea77061d6f77b3e447c834bb17ba8682dc3`，subject：`feat(v0.6-p1): soft-open complete smith services UI preamble`。文档 tip、推送后 origin tip 与 pushExitCode 见共享权威 out 的 `final-tip.json`，于推送后生成以避免 SHA 自引用。

依据：共享 `reports/炼器阁/20261017_负责人令_P1③++++++++soft-open_完整炼器服务UI.md`、attr-ui soft-open 负责人令 / tip@77b43a4 / HANDOFF，以及 design/32 §4.3。共享 `/workspace/xiantu/reports/`、`status/`、`qa/` 为权威；wt 同步交付副本。

## 实现与口径

产品链路在 abff11d/ef99abb 基线已满足令文，**全部 src（包括磁盘测试文件）及 data/balance 字节不变**。本窗仅改八个测试 runner/聚合并新增一个 QA 输出 helper，共九个 scripts 文件。证据位 softOpenedSmithServicesUi 从 false 翻 true；该位只表示本令授权交付状态，不充当生产 OpenFlag、环境变量或 memory-closed 的实际 Flag 值。

生产仍使用 ForgeGate / EnhanceGate / EnchantGate / SalvageGate；SmithServices 默认 new Gate(progress)，空 fixture；SalvageGate.formalQualification 取正式来源及精确位置，全量存档与最终原子 CAS 保持。未注入 SalvageFixture 生产回退、未新增结算。对话→菜单→四面板→确认→正式 Gate→完整结果→回菜单保持 design/32 §4.3，明确 instanceRef，不按 itemId/数量/首条推断。GameScene、Controller、Panel 与界面主责基线 39d006d 完整字节 MATCH。

所有当前 runner 输出限定在本 wt 的 soft_<tip> 目录；旧 17 套入口改为委托现有 22 套 runner，统一当前测试适配与输出保护。已有 SMITH_SERVICES_OPEN_OUT / OUT_DIR 仅作 QA 输出路径，路径检查先于写入；无新增生产开关、配表/features 覆盖或环境变量后门。

独立夹具位于 fixture-regression，仍标 isolatedFixtureRegressionOnly:true、productionO05Claimed:false；不能代勾正式 O05。正式证据指当前生产默认代码在隔离存档中的测试结果，不等于线上发版。

## 自检与本窗证据

权威 out：`/workspace/xiantu/qa/out_v06p1_smith_services_soft_1e256ea/`；wt 同名目录。入口：evidence.json / validation.json / selfcheck-summary.json / protection-check.json / delivery-protection-check.json / PASS；原始日志为 logs、audit、regressions 子目录。所有测试子进程 stdin=/dev/null。

| 自检 | 结果 |
|---|---:|
| npx tsc --noEmit | exit 0 |
| test:v06p1-smith-services-open，O01–O11 双根 | 2980，全部 PASS |
| open-fixture companion | 2897，exit 0 |
| test:v06p1-smith-services-closed，C01–C11（含于 22 套） | 2057，exit 0 |
| test:v06p1-smith-services-services-closed，双根六图 | 17497，exit 0 |
| 22 套回归（四服务 open+closed、四 attr-ui、market/v06、save-slots） | 182314，全部 exit 0 |
| 双根 datalint | 各问题 0 条，exit 0 |
| diff --check、保护与严格 selfcheck、旧复数入口 --summarize | exit 0 |

O 表 + companion + 22 套为断言下界 188191，另加 services-closed 共至少 205688；不重复累加实现 tip 重跑。每套计数由当前报告读取；v06b 为已打印的组件合计，未计未打印的外层静态检查。

主 closed 的所有提交/随机/持久化哨兵为 0、完整业务增量 0。services-closed 双根六图的服务写入/localStorageWrites/indexedDbOpens/sentinelCalls 均 0；普通保存准备 8 次写入单列，非服务副作用。memory-closed 图仍实际注入关态，证据位 true 不改变该图值。

按 attr-ui 范式，精确待提交源码先跑全表，提交实现后将临时 soft_7492dc9 out 重命名为 soft_1e256ea；352 个脚本/src/表输入逐文件 SHA 与实现 Git 树 MATCH。实现 tip 上又重跑 O 表、companion、保护及聚合。原始预提交日志、旧路径与执行环境保留，原始记录归档在 precommit；audit/implementation-tree-and-relocation.json 与 log-path-relocation.json 记录重命名、源码树验证和日志链接迁移。当前证据 tipFull 为实现 tip；22 套运行的精确源码与实现树一致，不冒称测试在文档提交后执行。

额外 services-closed 首跑 exit 1：历史 C07 仍期望 salvage.fixture.qualification，基线正式资格已齐，已附灵样本实际到既有 salvage.fixture.relation 拒绝。仅 runner 对**磁盘字节精确钉住 abff11d 的测试模块**做定点 Vite 内存预期适配；保留原 Gate/UI 完整拒绝比较、逐动作全状态比较及所有零写断言。产品模块和磁盘测试文件未改。原失败日志保存在 logs/attempts/services-closed-before-c07-adapter；原因/最终重跑见 audit/services-closed-c07-adaptation.json。最终六图全 PASS，无未解决阻断。

## evidence / validation 硬门

- softOpenedSmithServicesUi:true；released:false；newOpenFlag:false；allOpenCasesPassed:true。
- smithServicesOpenFixtureTableExecuted:true；O01–O11 全 executed/passed，blocked={}。
- o05FormalProductionSuccess:true；productionFormalPath:true；fixtureQualificationInjected:false；fixtureCarrierInstalled:false。
- O05 默认 Gate 实际 committed/destroyed，精确来源/位置，销毁、全部产出与收据同事务，所选正式来源退役；已附灵关联不能完整退役仍 relation 拒绝。
- o09StaleForgeEnhanceBlocked:true；lostCompletedEnchant:false；singleGameSceneCurrentProgressBypassClaimed:false。两真实 Controller / 两 Progress 跨对象，旧 Forge/Enhance 拒绝，附灵及已花资源保留；正式分解竞争至多一次写入。
- 四 Flag MATCH；enhance MATCH；strings1013 MATCH；stringsSsrInjected43:false；GAME_PHASE=5；gifts0:true、十条 gifts false；settlementUnchanged:true。

| 冻结项 | SHA-256（MATCH） |
|---|---|
| ForgeOpenFlag.ts | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e |
| EnhanceOpenFlag.ts | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e |
| EnchantOpenFlag.ts | bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a |
| SalvageOpenFlag.ts | 69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3 |
| enhance.json（双根） | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 |
| strings_zh.json，1013（双根） | d99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841 |
| data.ts，GAME_PHASE=5 | aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a |

117 个产品源文件、72 个双根表与 3070 个旧文件运行前后 MATCH，全部未授权差异 0。recipes/materials/items/npcs/life_skills/enhance_protect_charm 均冻结；四 Gate 结算回调分别与历史实现 SHA MATCH。

历史保护在 root 与共享两侧显式包括 closed、closed_7b06f5a、open_abff11d、open_9d00852、open_ef99abb、open_fixture、open_a1d645d（如存在），以及既存 smith soft out；文件内容和目录存在性保持。未覆盖任何历史关/开/夹具/soft out，未改旧 design 的历史 C/O 勾选。

## 交接与边界

**接引子配合合入/对齐 soft-open tip**；本窗未改 UI 产品源码，不冒充界面轨已做新 UI。交由经理安排独立 wt、独立 out 的执法 soft smoke；本窗只交程序自检，不代执法、不 fan-out、不发送外部通知。

本次 soft-open ≠ release ≠ 进包 ≠ 发版；fixture ≠ 正式。下一刀 release 须负责人另令。未运行资源 snapshot / build / sync / release / Pages / release.sh，未打 tag、未抬 GAME_PHASE；无阵法/gifts/#20/坊市混窗，无新 OpenFlag、无回翻四 Flag、无第二套结算、无 SalvageFixture 生产回退，未 push origin/dev、未 force-push/reset --hard。
