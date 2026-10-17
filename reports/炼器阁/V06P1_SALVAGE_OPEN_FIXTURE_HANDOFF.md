分解一期 P1③++++++ · 开态夹具交接（O01–O08）

2026-10-17 Asia/Shanghai；工作目录 `/workspace/xiantu/wt/dev`，分支 dev，stdin=/dev/null。开工已 fetch + pull --ff-only；基线 `29ddb7f54deb6c1439397b5d2e7c438639ceff5c` 包含关态实现 `5d9fa291172a8696f0daddd283bf1f2c97d679e4`。

实现 tip：`30713252ae2fb7de27ea41ff0ba1f4330304d063`，`feat(v0.6-p1): add salvage open fixture gate O01-O08`。文档提交 `docs(v0.6-p1): hand off salvage open fixture evidence`；文档 tip、origin/dev 与远端 HEAD 见推送后的 [final-tip.json](../../qa/out_v06p1_salvage_open_fixture/final-tip.json)。

**本窗=分解开态夹具全表 ≠ soft-open ≠ release ≠ 进包；fixture≠正式；核齐备≠生产放行。正式 SalvageOpenFlag 恒 false。** 依据负责人令 `20261017_负责人令_P1③++++++开态夹具.md`、design/30 §2.1–§2.3 / §4.3、关态 HANDOFF/RESULT、演武核齐备报告，模式对齐 b4764a8 的附灵历史开态夹具（当时正式 Flag=false），保留当前附灵/强化 soft-open。

`SalvageGate` 八入口 feature / entrance / salvage / submit / result / output / loadRefresh / laterService 均首语句检查独立 Flag；false 时原样返回 SalvageClosed 对应八 tip，不读业务规则、不销毁、不产出、不建袋或保存。SSR resolve/load 才注入 true；feature/entrance 只读，salvage 预览已存品质的产量，只有 submit 结算；laterService 即使开态仍为 `salvage.closed.later_service`。不借三既有旗，不挂 smith_ou.services，不接 GameScene/NPC/地图/任务或 UI；混入既有窗的分解询问仍走原 forge/enhance/enchant.closed.later_service。

唯一数量源是冻结 enhance.salvage.refineStonesByGrade，common/fine/spirit/treasure→1/2/4/8。校验 items.refine_stone 独立 phase=5 登记、materials 与 ITEMS 的整行覆盖有效记录；materials 未继承 items.phase，按真实 inPhase 语义判断。无 rate、概率抽取、新数值 JSON 或额外灵石费用。材料登记齐仅作为映射证据。

身份始终回查本档 formalEnhanceInstanceStatus / formalEnhanceInstances 与完整 Forge 结果，品质从 craft.resultGrade 读取，等级核对当前实例；不以 itemId、数量、槽位或 fixtureInstances 补造正式来源。提交原子退役所选 enhance.formalSources，保留原 forge/enhance 历史行；对应背包数量减一或精确装备槽引用移除，HP/MP 沿现有装备语义限至新上限，全部 refine_stone、完整销毁结果与 receipt 同一 Progress 保存事务成立。旧 ref 的正式状态变为 missing，重复登记拒绝；同原型未选实例继续有效。

现有正式 schema 缺可靠绑定/本命/精血与实例级位置证明，因此缺字段默认整拒；测试显式提供可剥离 qualification，四个选中标记须全 false，同原型其它正式实例的位置也须完整一致。该适配器不提供实例身份，也不进入存档。正式 recipes 只有武器配方；robe/shoes 仅在内存 SSR 配方图中以既有装备 id 扩充两条测试行，再走默认 ForgeGate 与正式登记 API；磁盘 recipes 不变，此证据不放行生产防具打造。有限容量也仅由显式测试选项施加，正式背包原无槽上限，始终检查真实安全整数承载。

现有已附灵实例的历史依赖正式来源，本窗禁止改变 EnchantGate 行为；选中此类目标按 design/30 §2.2“接线无法保证则整拒”，保留装备与完整附灵事实。未选附灵实例在分解其它装备后仍可继续附灵；已有强化/护符结果、收据保留并经实测。此边界不补本命系统或扩展属性 UI。

成功提交还须显式安装 `createSalvageFixtureCarrier` 包装的同一测试存储后端，并开启现有 indexedDbSaves；缺失或未安装载体整拒。载体串行处理一个 SSR 图的所有后端 writer，在写入前比较当前完整存档与期望快照，并要求销毁袋仅追加一笔；旧普通 writer 不得抹去已完成袋或恢复退役来源。通过现有 Progress.runSaveTransactionAsync，只有 IDB complete 才发布完整内存，abort/承载失败保留原合法状态。载体不自动安装，不改变 SaveStore 或既有 Gate，不宣称生产或跨浏览器窗口原子支持。

Progress 仅新增结构 import、validSaveData 校验、可选 salvage 字段和一行注释（四行）；精确剥除恢复基线全部字节。export/import/restore 保持原实现承载完整事实，缺字段旧档为 undefined，未知/半份记录拒绝并保留原存储信息，不修档、不补偿、不自动重做。

| O 表 | 状态 | 实测口径 | 专项 evidence 定位 |
|---|---|---|---|
| O01 | 程序已执行 PASS | feature/entrance 与预览只读；凡/良/灵/宝 1/2/4/8；正式实例销毁、全部产物与完整结果/收据同事务，不另扣灵石。 | `cases.O01` / `evidence[*].cases.O01` |
| O02 | 程序已执行 PASS | 正式武器与 robe/shoes；背包/装备槽、同原型不同实例精确选择；所选来源失效、旧 ref 不可重登记，未选保留。 | `cases.O02` / `evidence[*].cases.O02` |
| O03 | 程序已执行 PASS | 缺实例/itemId 冒充/foreign/资格/品质/绑定字段未齐整拒；22 类非法配置或映射经双根独立 SSR 注入实测。 | `cases.O03` / `evidence[*].cases.O03` |
| O04 | 程序已执行 PASS | 满背包可完整堆叠才成功；不足空间、非法容量/库存与安全整数溢出整拒，无部分发放。 | `cases.O04` / `evidence[*].cases.O04` |
| O05 | 程序已执行 PASS | 同请求匹配只读完整旧结果；冲突与新请求指向已毁 ref 拒绝，不要求补容量或二次发物。 | `cases.O05` / `evidence[*].cases.O05` |
| O06 | 程序已执行 PASS | 真实保存/读档/export/import/restore 与全新 SSR 保持销毁、库存、完整结果和去重；跨档同文本不混认。 | `cases.O06` / `evidence[*].cases.O06` |
| O07 | 程序已执行 PASS | 同请求/同实例/共享收纳竞争及既有强化操作；跨对象普通写先完成则分解 CAS 拒，分解先完成则旧普通写拒覆盖。 | `cases.O07` / `evidence[*].cases.O07` |
| O08 | 程序已执行 PASS | 承载拒绝/异常/篡改、销毁或发物失败、IDB complete 前不可见/abort/显式重试、序列化失败、缺失/未安装载体、未知旧档与正式关态旧回调均实测。 | `cases.O08` / `evidence[*].cases.O08` |

主证据 [v06p1-salvage-open-evidence.json](../../qa/out_v06p1_salvage_open_fixture/v06p1-salvage-open-evidence.json) 记录逐图 cases/evidenceKeys。双根 shared+snapshot，共 **52** 个独立 Vite SSR 图：4 个正式 false 图（flagLoads=0），48 个内存 true 图（flagLoads=1），含 fresh SSR 读回及 22 类异常依赖×2 根。程序 O01–O08 已全执行；此证据不代执法独立抽检或实机勾表。

全部最终自检 exit 0，共 **166924** 条断言（新开态 **4731** + 既有回归 **162193**）。

| 命令 | 断言 | exit | 本窗 out 相对路径 |
|---|---|---|---|
| `test:v06p1-salvage-open` | 4731 | 0 | `test-v06p1-salvage-open-run.json` |
| `test:v06p1-salvage-closed` | 19314 | 0 | `regressions/v06p1-salvage-closed.result.json` |
| `test:v06p1-enchant-open` | 4622 | 0 | `regressions/v06p1-enchant-open.result.json` |
| `test:v06p1-enchant-closed` | 12600 | 0 | `regressions/v06p1-enchant-closed.result.json` |
| `test:v06p1-enhance-open` | 17767 | 0 | `regressions/v06p1-enhance-open.result.json` |
| `test:v06p1-enhance-closed` | 30918 | 0 | `regressions/v06p1-enhance-closed.result.json` |
| `test:v06p1-forge-open` | 6443 | 0 | `regressions/v06p1-forge-open.result.json` |
| `test:v06p1-forge-closed` | 20501 | 0 | `regressions/v06p1-forge-closed.result.json` |
| `test:v06p1-market-closed` | 24255 | 0 | `regressions/v06p1-market-closed.result.json` |
| `test:v06d-closed` | 15059 | 0 | `regressions/v06d-closed.result.json` |
| `test:v06c-closed` | 10714 | 0 | `regressions/v06c-closed.result.json` |
| `npx tsc --noEmit` | — | 0 | `tsc.result.json` |
| 双根 datalint | 0 问题 | 0 | `regressions/datalint-{shared,snapshot}.result.json` |
| `git diff --check` / `git diff --cached --check` | — | 0 | `diff-check.result.json` / `staged-diff-check.result.json` |
| 冻结与未授权差异保护 | MATCH | 0 | `protection-check.json` |

全部本次输出仅在 `qa/out_v06p1_salvage_open_fixture/`。旧回归因历史 SHA、键数、源码清单与“无 SalvageGate”断言不适用于本令，使用新 out 的 pinned regression-loader 在内存逐项精确适配，并记录原 SHA、变换 SHA、替换次数和内容；Progress 四行剥离还原旧 SHA；业务断言和产品模块均未变换，当前真实表仍由 Vite 读取。旧 QA 1305 文件逐字节 MATCH，整体保护基线 4200 文件零未授权差异。旧关态/附灵/护符 out、art pending、dist-test 和待审 release 均未纳入提交。

| 冻结对象（表为双根） | SHA-256 | 结果 |
|---|---|---|
| `enhance.json` | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` | MATCH |
| `recipes.json` | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` | MATCH |
| `materials.json` | `86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d` | MATCH |
| `items.json` | `dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99` | MATCH |
| `strings_zh.json` | `9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda` | MATCH |
| `npcs.json` | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` | MATCH |
| `life_skills.json` | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` | MATCH |
| `enhance_protect_charm.json` | `0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772` | MATCH |
| `ForgeOpenFlag.ts` | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` | MATCH |
| `EnhanceOpenFlag.ts` | `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e` | MATCH |
| `EnchantOpenFlag.ts` | `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a` | MATCH |
| `SalvageClosed.ts` | `287a55d7025018629235d45ca4386d75134fc39362532a4c47bf121b574ae211` | MATCH |
| `data.ts` | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` | MATCH |

strings 共 960 键（含 _meta），gifts 10×false，GAME_PHASE=5；EnhanceOpenFlag 与 EnchantOpenFlag 正式仍 true。SalvageOpenFlag 原 SHA `9cfa606a5fed71451cab6675bde0ce3ffad2dd780cb502e4d842d54beeeff1d8`，仅更新 SSR 注释，写后 SHA `1b8b9f0b2d8e3e1df86ca740a156aa119406fe99ee26246842c967928198453e`；函数体精确保持 `return false`，零 import、无环境后门。详见 [protection-check.json](../../qa/out_v06p1_salvage_open_fixture/protection-check.json)。

```json
{
  "salvageClosedTipsWired": true,
  "refineStoneMapped": true,
  "salvageOpenFixtureTableExecuted": true,
  "formalInstanceSource": true,
  "softOpenedSalvage": false,
  "SalvageOpenFlag": false,
  "released": false,
  "enchantSoftOpenPreserved": true,
  "EnhanceOpenFlagPreserved": true,
  "protectCharmSoftOpenPreserved": true
}
```

总核验见 [selfcheck-summary.json](../../qa/out_v06p1_salvage_open_fixture/selfcheck-summary.json) 与 [evidence-check.json](../../qa/out_v06p1_salvage_open_fixture/evidence-check.json)。未运行 snapshot/build/sync/release/Pages，未抬 GAME_PHASE 或修改权威表。Codex 原日志 `/workspace/xiantu/logs/codex/abec03625df0c1b3_20261017_152547_1768690.log`，模型 gpt-6.1-sol，reasoning effort=ultra，fast=false，stdin=/dev/null；动态日志仅引用，见 codex-log-reference.json。

HANDOFF/RESULT 与四段≤30行 status 以 UTF-8 相同字节同步到 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。两笔普通 commit 后 push origin dev，无 force/reset --hard；推送结果记录 final-tip.json。

**无程序自检阻断。下一棒交执法按 design/30 §4.3 O01–O08 对实现 tip、双根旁证、事务/跨档/故障边界与冻结 SHA 独立抽检。执法 PASS 后仍须负责人另下 soft-open 令；本令不授权 soft-open。**
