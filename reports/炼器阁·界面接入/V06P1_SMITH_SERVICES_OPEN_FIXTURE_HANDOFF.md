# P1③++++++++ 完整炼器服务 UI · 开态夹具交接

2026-10-17 Asia/Shanghai；界面接入主责；分支 `feat/ui-smith-services`。

实现 tip：`9d00852` / `9d008527cf618f14a4717876b679095e3d728248`。启动 HEAD `233bdbd869f48c1de230488b36899e80a6a300ff`，实现基线 `7b06f5ac4e76a2c48e98431e1ccf0011a8ca0a41`；始终在本 wt，未合并或推送 dev。

**O01–O11 均已执行并具逐项 evidenceKeys；7 PASS、4 BLOCKED。执行器 exit 0 表示夹具按约完成，不表示四项阻断验收通过；`allOpenCasesPassed:false`。待经理派执法 O01–O11，未代勾执法。≠ soft-open ≠ release ≠ 进包。**

主证据：`qa/out_v06p1_smith_services_open_9d00852/v06p1-smith-services-open-evidence.json`；表：`O01_O11.json`；冻结：`protection-check.json`；逐图完整结果、请求、存档与 SHA 均在主证据 `graphs` / `cases`；`evidence-index.json` 将全部72个 evidenceKeys 映射至实际 payload。

## 本次代码

新增 npm 开态命令、双根 Vite SSR 夹具、保护核验和回归输出隔离脚本。沿真实 Controller/Panel/SmithServices/Gates、Progress、正式 binding 与 E/I；Phaser 只替换渲染节点，保存后端为内存隔离载体。无真实浏览器验收宣称。

唯一生产补丁为 SmithServices 拒绝提示分层：Gate 已明确拒绝缺资源后，只读区分打造缺图纸/材料和附灵缺灵石/材料。无第二结算、重抽、账本、目标替换或 Gate 公式改动。

## O 表

| 项 | 结论 | 实际范围与阻断 | 证据键 |
|---|---|---|---|
| O01 | PASS | 真实 GameScene 欧冶匠对话→菜单→四面板；真实 pointer/方向键/Enter/Esc、未选/改选/取消/返回均只读；确认页默认返回，不自动提交。 | `cases.O01.evidenceKeys` |
| O02 | PASS | Controller→SmithServices→正式 ForgeGate；完整成品/品质/实例与图纸材料扣除逐字段对等，唯一抽样一次，无 UI 经验账本。 | `cases.O02.evidenceKeys` |
| O03 | PASS | 正式实例无符/有符成功及概率失败；掉级档保护/无符掉级；正式逐级提交至满级拒绝；实际费用与结果文字沿 Gate。 | `cases.O03.evidenceKeys` |
| O04 | PASS | 五行首附及异元素覆盖、同元素拒绝、过期目标拒绝；完整结果、材料和灵石对等，不叠层。 | `cases.O04.evidenceKeys` |
| O05 | BLOCKED / 子项已执行 | 正式打造实例和精确背包位置已核实；生产分解资格/关联退役/原子承载证据未齐，Gate qualification 整拒，未执行成功销毁。 | `cases.O05.evidenceKeys` |
| O06 | PASS | 真实 Forge 生成同原型两件，正式装备事务和 binding 区分槽/包；只结算显式 instanceRef；真实 E/I 提交前无预写、重开不串结果。 | `cases.O06.evidenceKeys` |
| O07 | PASS | 缺图纸/材料/灵石/护符、非法引用/五行/品质及真实整数容量溢出整拒；独立 SSR 护符映射异常拒绝且不取消已选护符。生产无有限格数背包，未伪造格数满包。 | `cases.O07.evidenceKeys` |
| O08 | BLOCKED / 子项已执行 | 打造/强化/附灵真实保存→loadAsync→刷新→完整旧结果重放/同 id 冲突，零再扣、零重抽；分解成功后的重放受 O05 阻断。 | `cases.O08.evidenceKeys` |
| O09 | BLOCKED / 子项已执行 | 连点/同实例多请求/共享材料与灵石/整数容量/既有装备操作竞争已执行；另复现正式 Forge/Enhance 跨 Progress 旧写覆盖已提交 Enchant，且分解竞争受 O05 阻断。 | `cases.O09.evidenceKeys` |
| O10 | PASS | 真实 Gate 配合保存延迟/失败、关窗/切档/同档换对象/UiAccess 关闭、丢回包、未知/半份旧档；未决不伪成功、不自动重试，旧异步不渲染新档。 | `cases.O10.evidenceKeys` |
| O11 | BLOCKED / 子项已执行 | 三服务真实完整结果经渲染按钮回菜单；六 scope 故意关闭零写、四 Flag true 和 E/I 保持；分解结果回菜单受 O05 阻断，C01–C11 另已复跑。 | `cases.O11.evidenceKeys` |

## 阻断必须保留

- `O05_blocked_formal_qualification`：真实正式来源和精确位置不自动授予分解资格；无 SalvageFixture 生产回退，拒绝零销毁/零产出。O08 分解重放、O09 分解竞争、O11 分解结果回菜单均未冒充成功。
- `O09_blocked_stale_forge_and_enhance_overwrite_other_service`：同槽 loadAsync 得到独立 Progress/Controller，各自绑定本对象；新对象附灵已提交后，旧 Forge/Enhance 仍 allowed 并覆盖持久状态。旧 Forge：灵石 `998000→1000000`、内丹 `49→50`、附灵结果 `1→0`、打造结果 `1→2`；旧 Enhance：灵石 `998000→999900`、内丹 `49→50`、附灵结果 `1→0`、强化结果 `0→1`。每项有完整前后 save 与 SHA256。此为正式 Gate 跨对象事务边界复现，**未宣称绕过单 GameScene 的 currentProgress 防护**。交炼器主责补正式 CAS/承载证据，本窗保持 Gate 冻结，未以 UI 第二事务修账。

## 硬门与冻结

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
  "gifts0": true,
  "giftsFalseCount": 10
}
```

enhance `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` MATCH。
Forge `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` / Enhance `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e` / Enchant `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a` / Salvage `69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3` 全 MATCH，正式仍 true。
strings1013 `d99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841`，data.ts `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` 全 MATCH。写前启动快照 `protection-task-start.json`、执行前/后 171 文件核验齐；全部命名数值表不改。

本 wt `qa/out_v06p1_smith_services_closed/`、共享 `qa/out_v06p1_smith_services_closed_7b06f5a/` 与共享 `qa/out_v06p1_smith_services_closed/` 三个目录逐文件 SHA/存在性 MATCH；关态重跑仅写本次 open out 的 regressions。故意关闭与异常护符映射仅在隔离 SSR 图注入，磁盘表、Flag 和生产默认路径不变。

## 自检

`npm run test:v06p1-smith-services-open`：**2382 assertions**，双根真实主图 + 双根护符异常图，exit 0（含明确 BLOCKED 证据）。

| 命令 / suite（均 stdin=/dev/null） | assertions | exit |
|---|---|---|
| `v06p1-smith-services-closed` | 2057 | 0 |
| `v06p1-forge-closed` | 20471 | 0 |
| `v06p1-enhance-closed` | 30939 | 0 |
| `v06p1-enchant-closed` | 12623 | 0 |
| `v06p1-salvage-closed` | 19421 | 0 |
| `v06p1-forge-open` | 6472 | 0 |
| `v06p1-enhance-open` | 17809 | 0 |
| `v06p1-enchant-open` | 4586 | 0 |
| `v06p1-salvage-open` | 7052 | 0 |
| `v06p1-attr-ui-closed` | 1592 | 0 |
| `v06p1-attr-ui-binding-success` | 327 | 0 |
| `v06p1-attr-ui-map-api` | 1128 | 0 |
| `v06p1-attr-ui-map-services` | 175 | 0 |
| `v06p1-market-closed` | 23058 | 0 |
| `v06p1-market-open` | 2580 | 0 |
| `v06c-closed` | 10730 | 0 |
| `v06d-closed` | 15083 | 0 |
| `tsc` | — | 0 |
| `datalint-shared` | — | 0 |
| `datalint-snapshot` | — | 0 |

宽回归合计 176103 断言；旧回归只在新 out 复用 pinned historical loader，按合并基线精确适配 strings1013、授权源清单/Scene 完整 SHA 与测试输出路径；每次变换及 SHA/次数见 regressions/adaptations、reuse-proof.json。产品模块及结算/业务断言未替换。tsc、双根 datalint 和 diff 检查均 PASS；未跑 snapshot/build/sync/release/Pages。

同期炼器 `dev@a1d645d836761d2a57ce12833af95524f8e1205a` 的 Gate 开态旁证见 `reports/炼器阁/V06P1_SMITH_SERVICES_OPEN_FIXTURE_HANDOFF.md`：该图在隔离 SSR 注入分解资格与 SalvageFixtureCarrier；本 wt 的正式默认 Gate 未获这些生产依赖，保留 O05 及相关子项阻断。此处只读引用，未合并或推送 dev、未复制结算。

HANDOFF / RESULT / 报告同步至共享 reports/炼器阁·界面接入；status 两份保留既有关态 tip。下一棒：经理派执法复核全表及阻断，炼器跟进 O05 正式依赖与 O09 旧写覆盖；不得据本次夹具宣称 soft-open。
