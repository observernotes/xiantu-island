# v0.6 · P1③++++++++ 完整炼器服务 UI 开态夹具交接

2026-10-17 Asia/Shanghai；cwd=`/workspace/xiantu/wt/dev`，分支 `dev`，执行命令 stdin=`/dev/null`。开工及实现提交前均执行 `git fetch && git pull --ff-only origin dev`，exit 0；基线 `233bdbd869f48c1de230488b36899e80a6a300ff` 包含合并 tip `7b06f5ac4e76a2c48e98431e1ccf0011a8ca0a41`。既存 dirty/untracked 保留并排除提交。

实现 tip：`a1d645d836761d2a57ce12833af95524f8e1205a`，`feat(v0.6-p1): add smith services open fixture O01-O11`，已普通 push origin/dev，exit 0。文档 tip、两笔推送及远端 HEAD 见 [final-tip.json](../../qa/out_v06p1_smith_services_open_fixture/final-tip.json)，该文件推送后落盘，避免提交自引用。

**O01–O11 本窗程序夹具全 PASS；O05 有完整成功，无夹具阻断。此结论仅适用隔离 SSR 资格/原子承载，不代表生产分解依赖齐备。**

**本窗=完整炼器服务 UI 开态夹具全表 ≠ soft-open ≠ release ≠ 进包。** `softOpenedSmithServicesUi:false`、`released:false`、`newOpenFlag:false`。本窗不 fan-out 执法，不代执法独立抽检或负责人授权，不修改 design 原表勾选，不运行 snapshot/build/sync/release/Pages，不创建 tag。

依据为共享根负责人令 `reports/炼器阁/20261017_负责人令_P1③++++++++开态夹具.md`、design/32 §4.3 O01–O11、关态 HANDOFF/RESULT 与合并 tip 关态执法 out；正式实例、护符、附灵、分解及 E/I 边界沿 design/28–31 和既有 Gate / EquipInstBinding / Progress formalSources。历史设计的旧 Flag/表状态不回写当前生产事实。

## 实现与协同范围

新增 `src/v06p1-smith-services-open.test.ts` 与 `scripts/v06p1-smith-services-open-test.mjs`；npm 入口为 `test:v06p1-smith-services-open`。增加独立回归/保护 runner 与 evidence 聚合 selfcheck。**生产源码 706 文件全部原字节 MATCH**；没有必要生产适配，四 Gate 公式、结果、收据、去重及原事务不改，无第二套结算。

真实 `GameScene.tryInteractForgeEntrance` 的对话回调驱动既有 `SmithServicesPanel`，通过其真实 pointerover/pointerup 和键盘 handler 调用既有 Controller；四服务选择/确认/submit/结果/返回均委托原 SmithServices 与 Gate。完整 Gate 返回、逐行结果文案、资产 delta 与收据均留证；概率失败仍为完整已结算结果。

接引子主责文件 `src/SmithServicesController.ts`、`src/SmithServicesPanel.ts`、`src/scenes/GameScene.ts` 只读复用，未编辑；`status/炼器阁·界面接入.md` 保持原字节，未擅自覆写。没有另造 UI。`npcs.json` MATCH，不灌 services 字段；路由沿 SMITH_SERVICES_ROUTE / UiAccess，路由可达不作为开放授权。

正式成功目标全部由默认正式 ForgeGate 实际提交产生，核 Progress formalSources 与 EquipInstBinding 精确位置；不以 fixtureInstances、itemId 数量、唯一候选、首条或最高等级补实例。护符按实际 protectCharm 正式映射消费；映射缺失/不足均整拒，不静默转无符。

## 分解 O05 的隔离证据与生产边界

只在 Vite SSR 内存图精确替换 `SmithServices.ts` 一处 `salvage: new SalvageGate(progress),`，显式传资格回调和可剥离 SalvageFixtureCarrier。测试资格证明本档来源及精确位置，bound/natal/bloodBound/unsalvageable 四项显式 false 为本图测试授权；**不声称生产已有这些资格字段**。provider/Flag/JSON 异常注入均图内使用并恢复，不写生产文件或构造默认值。

O05 背包与装备槽路径均实际完成销毁、完整 refine_stone 产出、正式来源退役和收据同事务保存；同原型未选实例及其他附灵实例/历史保留。装备槽销毁沿既有 Gate 保留历史 equipInstanceRefs 字节，空槽+来源退役使 resolver 返回 empty，目标不可再选；不声称另有引用迁移。已附灵目标因既有关联不能完整退役仍由 Gate relation 拒绝，拒绝单独留证，不充成功。

生产仍精确 `new SalvageGate(progress)`，空 fixture；正式资格/关联退役与生产原子承载未齐时继续沿 Gate 拒绝。**O05 开态夹具成功不安装生产授权，也不代替正式分解依赖补齐。** 详见 [source-review.json](../../qa/out_v06p1_smith_services_open_fixture/source-review.json)。

写后丢 ACK 时原对象内存尚未发布，玩家收到 result_unknown；不伪成功或宣称确认未提交。仅显式 `Progress.loadAsync` 后核实已持久完整结果，无自动重试/补做/修档。关闭或切档不撤销已开始的 Gate 事务，旧回调不渲染到新视图。

## O01–O11 逐项旁证

snapshot/shared 各开态与独立故意关态，共 **4 个独立 Vite SSR 图、6 个证据组**。专项 **2897** 断言，其中 O 表 **2764**，冻结/图计数/元数据另 **133**。每个 evidenceKey 都能解析到 evidence[].label；逐项证据在 `cases/O01.json` 至 `O11.json`，总入口 [evidence.json](../../qa/out_v06p1_smith_services_open_fixture/evidence.json)。

| 编号 | 状态 | 断言 | evidenceKeys 数 | 已执行内容 |
|---|---|---:|---:|---|
| O01 | PASS | 336 | 2 | 真实 GameScene 欧冶匠对话回调→真实 Panel 菜单→四面板；未选、改选、确认取消、返回与键鼠焦点，全程提交前只读。 |
| O02 | PASS | 102 | 4 | 正式图纸/材料打造，费用、成品数量、品质、正式登记与 Gate 完整返回逐项一致；结果回菜单不重抽或另写经验。 |
| O03 | PASS | 782 | 10 | 真实 UI 成功/概率失败×有符/无符四组合；Gate 另覆盖掉级档、护符保级与满级零扣拒绝。 |
| O04 | PASS | 360 | 14 | 正式武器五行首附与覆盖、同元素拒绝、非法/过期目标；完整费用材料与当前单元素一致，不叠层。 |
| O05 | PASS | 184 | 6 | 真实背包与装备槽销毁成功；显式 SSR 资格、精确位置、来源退役、全部产出及收据同事务；附灵关联不能退役则拒绝。 |
| O06 | PASS | 22 | 2 | 同原型多件分列装备槽/背包正式引用；选中目标独立，真实 E/I 往返与服务刷新保持只读展示。 |
| O07 | PASS | 166 | 14 | 缺图纸/材料/灵石/护符、映射异常、非法类型/资格、未知品质、有限容量与产物溢出整拒；Gate 原裁决与 UI 中性/专用提示同留证。 |
| O08 | PASS | 168 | 8 | 四服务提交后保存/读档/刷新；原请求重放、同 id 改载荷通过 Gate.submit 及 Services.result 验证，零二次扣发/重抽/复活。 |
| O09 | PASS | 52 | 8 | 连点、同实例不同请求、跨服务资源及有限容量竞争、既有装备操作竞争和旧 writer CAS；至多一次效果，无负库存或复活。 |
| O10 | PASS | 218 | 26 | 四服务写前中断与写后丢 ACK；显式读档核实持久完整结果，无自动重试；真实 Controller 关窗/切档/同槽换角色拒旧回调，未知版本/半份结果不修档。 |
| O11 | PASS | 374 | 4 | 四服务完整结果均回真实菜单；独立故意关态图覆盖六 UI scope 与四单 Flag，零提交/结算；关态 C 回归仍绿，冻结与授权硬门保持。 |

这是 SSR/mock Phaser 呈现与真实业务/API 的程序证据，未声称浏览器实机/截图验收。O11 独立图故意关闭 UI 或单服务 Flag；磁盘四 Flag 正式 true，零回翻。

## 最终自检

专项与 21 组回归全部 exit 0，已记录至少 **185605** 条断言（专项 2897 + 回归 182708）。v06b± 计数为两根组件打印总和，未打印的外层静态断言未计，故总数为下界；各命令运行均为本窗，不借旧 PASS。

| 命令 | 已记录断言 | exit |
|---|---:|---:|
| `test:v06p1-smith-services-open` | 2897 | 0 |
| `test:v06p1-smith-services-closed` | 2057 | 0 |
| `test:v06p1-attr-ui-closed` | 1592 | 0 |
| `test:v06p1-attr-ui-binding-success` | 327 | 0 |
| `test:v06p1-attr-ui-map-api` | 1128 | 0 |
| `test:v06p1-attr-ui-map-services` | 175 | 0 |
| `test:v06p1-forge-closed` | 20556 | 0 |
| `test:v06p1-enhance-closed` | 30978 | 0 |
| `test:v06p1-enchant-closed` | 12623 | 0 |
| `test:v06p1-salvage-closed` | 19413 | 0 |
| `test:v06p1-forge-open` | 6468 | 0 |
| `test:v06p1-enhance-open` | 17805 | 0 |
| `test:v06p1-enchant-open` | 4586 | 0 |
| `test:v06p1-salvage-open` | 7052 | 0 |
| `test:v06p1-market-closed` | 24297 | 0 |
| `test:v06p1-market-open` | 2580 | 0 |
| `test:v06b-closed` | 744 | 0 |
| `test:v06b-open` | 816 | 0 |
| `test:v06c-closed` | 10730 | 0 |
| `test:v06c-open` | 682 | 0 |
| `test:v06d-closed` | 15083 | 0 |
| `test:v06d-open` | 3016 | 0 |
| `npx tsc --noEmit` | — | 0 |
| 双根 datalint | 各问题 0 | 0 |
| `git diff --check` / `git diff --cached --check` | — | 0 |
| protection / evidence selfcheck | MATCH | 0 |

最终汇总：[selfcheck-summary.json](../../qa/out_v06p1_smith_services_open_fixture/selfcheck-summary.json)；逐回归 log/result、精确 pin 与内存适配在 `regressions/`；tsc/datalint/diff 在 `audit/`。可复核 `node scripts/v06p1-smith-services-open-selfcheck.mjs < /dev/null`；保护复核 `node scripts/v06p1-smith-services-open-regression.mjs protection < /dev/null`。旧测试重跑须沿 `regressions/README.md` 的新 out 重定向，避免覆盖旧证据。

历史测试仅在 Node loader 内存精确适配静态 SHA/键数/源码清单和合并入口证明，并重定向输出；原/当前 SHA、替换次数、来源与恢复链可审。生产 SSR 模块与业务断言不为回归通过而变换；本专项另有显式资格/承载和故意关态图注入，已单列。历史 strings 追加证明按来源只读复制并标 borrowed；当前真实双根 strings1013/SHA 由专项和保护独立核验。

## 冻结与硬门

2902 个旧 QA/art/dist-test 文件（含共享合并 tip 关态执法 out）及文件集合保持；706 个生产源码、72 张双根 balance 表全部 MATCH，未授权差异 0。共享 `qa/out_v06p1_smith_services_closed_7b06f5a/` 与分棒 `qa/out_v06p1_smith_services_closed/` 只读。运行器本窗既存 codex_launch.log 仅运行器实时 append，原前缀 MATCH 单列，不暂存；原 codex_prompt、art pending、dist-test、旧 out 日志和待审 release 报告均不纳入提交。

| 对象（表均双根 MATCH） | SHA-256 | 写后 |
|---|---|---|
| `enhance.json` | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` | MATCH |
| `recipes.json` | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` | MATCH |
| `materials.json` | `86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d` | MATCH |
| `items.json` | `dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99` | MATCH |
| `life_skills.json` | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` | MATCH |
| `enhance_protect_charm.json` | `0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772` | MATCH |
| `strings_zh.json` | `d99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841` | MATCH |
| `ForgeOpenFlag.ts` | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` | MATCH |
| `EnhanceOpenFlag.ts` | `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e` | MATCH |
| `EnchantOpenFlag.ts` | `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a` | MATCH |
| `SalvageOpenFlag.ts` | `69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3` | MATCH |
| `data.ts` | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` | MATCH |

`npcs.json`、全部其余表亦 MATCH；strings 两根各 **1013** 键且 `stringsSsrInjected43:false`，GAME_PHASE=5，gifts 两根各 10×false。完整写前/写后证据：[protection-check.json](../../qa/out_v06p1_smith_services_open_fixture/protection-check.json)。

```json
{
  "smithServicesUiWired": true,
  "smithServicesOpenFixtureTableExecuted": true,
  "softOpenedSmithServicesUi": false,
  "released": false,
  "newOpenFlag": false,
  "settlementUnchanged": true,
  "fourFlagsPreserved": true,
  "stringsDiskKeys": 1013,
  "stringsSsrInjected43": false,
  "GAME_PHASE": 5,
  "gifts0": true
}
```

HANDOFF、RESULT 与四段≤30行 `status/炼器阁.md` 以 UTF-8 相同字节同步共享根。实现与文档分别普通 commit+push，未 force/reset --hard；最终双 tip、推送 exit 及 origin/dev HEAD 见 final-tip.json。

下一棒由主程序转交 tip+out，按 design/32 §4.3 独立抽检；本窗不 fan-out 执法。程序 PASS 仍须另获负责人 soft-open / release / 进包授权。禁阵法/洞府/gifts/#20/拍卖/坊市混窗、抬 GAME_PHASE、新生产 OpenFlag 或第二套结算。
