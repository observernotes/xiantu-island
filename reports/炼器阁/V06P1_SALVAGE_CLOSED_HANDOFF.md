# v0.6 · P1③++++++ 分解一期关态 tip 交接

2026-10-17 Asia/Shanghai；工作目录 `/workspace/xiantu/wt/dev`，分支 `dev`，stdin=`/dev/null`。开工已执行 `git fetch && git pull --ff-only origin dev`，exit 0，HEAD 与 origin/dev 均为 `14d6de7b39b1aab0b31a12289172e6735986f263`，含 v0.6.11 / 附灵 soft-open 族。

实现 tip：`5d9fa291172a8696f0daddd283bf1f2c97d679e4`（`feat(v0.6-p1): wire salvage closed tip APIs`）。本报告、RESULT、status 及交付审计随下一笔 `docs(v0.6-p1): hand off salvage closed tip evidence` 提交。最终文档 tip、origin/dev 与远端 HEAD 由本窗 `final-tip.json` 记录，避免提交自引用。

依据：负责人令 `/workspace/xiantu/reports/炼器阁/20261017_负责人令_P1③++++++关态tip接线.md`；design/30 §2.3–§3、§4.2 C01–C10、§6；演武 `20261017_P1③++++++_分解核齐备.md` PASS。API 与交接模式沿 `EnchantClosed.ts` 和 tip `5bee47d` 的附灵关态 HANDOFF。设计窗不建代码的限制已由本次接线令明确授权新增模块和专项测试；用户明确禁止全量 snapshot，本窗只精确复制 strings。

**本令仅关态 tip 接线 ≠ 开态夹具 O ≠ soft-open ≠ release ≠ 进包 ≠ 分解成功结算。核齐备≠生产分解授权。** 程序自检不代执法抽检，不勾选设计原文 C/O。

## 八 API 与独立关态

| 零参数只读 API | tipKey |
|---|---|
| `featureClosed()` | `salvage.closed.feature` |
| `refuseEntrance()` | `salvage.closed.entrance` |
| `refuseSalvage()` | `salvage.closed.salvage` |
| `refuseSubmit()` | `salvage.closed.no_submit` |
| `refuseResult()` | `salvage.closed.no_result` |
| `refuseOutput()` | `salvage.closed.no_output` |
| `refuseLoadRefresh()` | `salvage.closed.load_refresh` |
| `refuseLaterService()` | `salvage.closed.later_service` |

`src/SalvageClosed.ts` 唯一 import 为 `@xt/balance/strings_zh.json`；八 API 恒返回 `{ allowed:false, tipKey, text:strings[tipKey] }`。不接收 Progress、目标或写入意图，无结算、服务、请求、存档依赖。`src/SalvageOpenFlag.ts` 的 `isSalvageOpenForFixture()` 正式恒 false，既有 Forge/Enhance/Enchant Flag 正式 true 均不能授权分解。本窗无 Salvage true 内存注入。

未创建 SalvageGate、成功结算、同事务销毁入库、分解消费者或存档 schema；不挂 smith_ou.services、不改 NPC、不接完整分解 UI。现网打造/强化/附灵窗混入分解继续原 `forge/enhance/enchant.closed.later_service`，原模块及文案字节保留。独立分解只读 API 使用 salvage.closed.*，其中 later_service 仅拒绝更后续服务，不替换现网混入提示。三个既有 Gate、Progress、GameScene 均保留；未注入生产 fixtureInstances。

## C01–C10 程序旁证

| 编号 | API | 自动化验证口径 |
|---|---|---|
| C01 | featureClosed / refuseEntrance | 查看、关闭重读和独立入口意图仅提示；不挂服务或创建请求。 |
| C02 | refuseSalvage / refuseSubmit | 正式武器/防具、四品质及足量收纳语义与连点均拒；零销毁、零产出。 |
| C03 | refuseSubmit | 无实例、itemId/数量/槽位/历史袋、fixtureInstances、跨档同引用均不能授权。 |
| C04 | refuseSubmit | 非装备、非法资格/槽位、绑定/本命标记或缺字段均拒；不补系统或默认资格。 |
| C05 | refuseSubmit / refuseOutput | 未知/缺失品质、异常数量、仅登记/映射未齐与收纳不足均拒，不补默认品质或部分发放。 |
| C06 | refuseResult / refuseOutput | 结果、精炼石及关联持有引用改写意图均拒；既有实例、槽位、库存、结果保留。 |
| C07 | refuseSalvage / refuseSubmit | 旧回调、重复、冲突和同实例/容量并发语义均零写，无建单、去重、排队、锁定或预留。 |
| C08 | refuseLoadRefresh | 普通建档、真实保存/读档与独立刷新图保留合法旧记录及资产，跨档隔离；不补做/补发/复活/修档。 |
| C09 | 独立 Flag + 既有 laterService | 三既有正式 Flag 仍 true，Salvage false；既有入口与混入分解提示保持，护符与附灵 soft-open 保留。 |
| C10 | refuseLaterService + 全八 API | 更后续服务仅拒绝；资源、实例、槽位、五行、等级、属性、品质、经验及业务记录增量全零。 |

逐项证据见 `qa/out_v06p1_salvage_closed/v06p1-salvage-closed-evidence.json` 的 cases 与两根运行图。专项采用 shared/snapshot 真实 Vite SSR 初始图及全新刷新图；不注入 Salvage true、不执行分解 O01–O08。

八 API 为零参数只读函数，目标、品质、资格、并发及收纳载荷只作测试上下文；本窗不实现这些业务校验、容量算法或分解事务。C08 通过已有正式 forge/enhance/enchant schema 的合法完整记录验证真实保存/恢复；普通建档写入与拒绝动作写入分别计数。未知/未完成/损坏分解记录仅保留于测试专用语义原文；不把未知字段写成已正式持久化，不自动修档。未执行浏览器实机或替执法勾表。

## 快照与冻结

仅执行 `cp -f /workspace/xiantu/balance/strings_zh.json data/balance/strings_zh.json`；materials/items 已 MATCH，只核不写。未运行全量 snapshot/build/sync/release，未写共享权威表或 game 历史快照。

strings 共 **960** 键（含 _meta），salvage.closed.* 恰 8 键；shared 与 wt snapshot SHA 均为 `9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda`。`table-delta-check.json` 移除末尾精确八键后逐字节还原基线 952 键 SHA `6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9`，既有三服务文案无变化，无追加权威 strings。

| 冻结对象 | SHA-256（完整期望，写后须 MATCH） |
|---|---|
| enhance.json | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` |
| recipes.json | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` |
| materials.json | `86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d` |
| items.json | `dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99` |
| npcs.json | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| life_skills.json | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` |
| enhance_protect_charm.json | `0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772` |
| ForgeOpenFlag.ts | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` |
| EnhanceOpenFlag.ts | `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e` |
| EnchantOpenFlag.ts | `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a` |
| data.ts | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` |

完整两根冻结与源码前后核验、旧 QA、待审产物字节保护见 `audit/protected-before.json`、`audit/protection-check.json`。GAME_PHASE=5，gifts 10×false，三既有 Flag 仍 true。enhance.salvage.refineStonesByGrade=1/2/4/8 只读；refine_stone 登记齐不表示销毁、产出、请求去重或保存事务齐备。

## 自检与 evidence

全部最终命令 exit 0；测试共 **162165** 断言（分解专项 **19306**）。专项 232 场景、3380 次零参数 API 调用，4 个正式 false SSR 图；拒绝/读档写入 0，普通建档准备写入 4 次单列。

| 检查 | 断言/结果 | 旁证（本窗 out 相对路径） |
|---|---|---|
| `tsc` | exit 0 | `tsc.result.json` |
| `v06p1-salvage-closed` | 19306，exit 0 | `v06p1-salvage-closed.result.json` |
| `v06p1-enchant-open` | 4622，exit 0 | `regressions/v06p1-enchant-open.result.json` |
| `v06p1-enchant-closed` | 12600，exit 0 | `regressions/v06p1-enchant-closed.result.json` |
| `v06p1-enhance-open` | 17767，exit 0 | `regressions/v06p1-enhance-open.result.json` |
| `v06p1-enhance-closed` | 30912，exit 0 | `regressions/v06p1-enhance-closed.result.json` |
| `v06p1-forge-open` | 6443，exit 0 | `regressions/v06p1-forge-open.result.json` |
| `v06p1-forge-closed` | 20491，exit 0 | `regressions/v06p1-forge-closed.result.json` |
| `v06p1-market-closed` | 24251，exit 0 | `regressions/v06p1-market-closed.result.json` |
| `v06d-closed` | 15059，exit 0 | `regressions/v06d-closed.result.json` |
| `v06c-closed` | 10714，exit 0 | `regressions/v06c-closed.result.json` |
| `datalint-shared` | exit 0 | `audit/datalint-shared.result.json` |
| `datalint-snapshot` | exit 0 | `audit/datalint-snapshot.result.json` |
| `json-tool-shared` | exit 0 | `audit/json-tool-shared.result.json` |
| `json-tool-snapshot` | exit 0 | `audit/json-tool-snapshot.result.json` |
| `diff-check` | exit 0 | `diff-check.result.json` |
| `table-delta-check` | exit 0 | `table-delta-check.result.json` |

护符没有独立命名的 package 测试；enhance-open/closed 实际执行既有护符相关断言及正式 N=1 映射验证。旧回归 142859 断言，保持其原业务行为；其中历史 game 快照本来已是已提交的 952 键（6f244…），本窗未同步 game/data。适配先核其 HEAD=14d6de7 及全部快照字节，再核 shared/wt 的 960 键；强化开态 TS 测试仅一处历史总键数适配，固定源码 SHA 与单次替换审计见 `regressions/v06p1-enhance-open/runtime-test-source-adaptation.json`。

全部输出仅在 `qa/out_v06p1_salvage_closed/`。主证据：`selfcheck-summary.json`、`evidence-check.json`、`audit/protection-check.json`、专项 evidence、回归日志与每命令 result。旧回归历史 SHA/键数/源码全集期望通过本窗 `regressions/regression-loader.mjs` 在内存逐项严格适配；原文件 SHA 固定、替换次数精确验证、原/变换 SHA 与替换项见 `regressions/adaptations/`。真实业务断言及生产 SSR 仍读取当前真实表，无产品模块变换、断言绕过或旧测试磁盘修改。历史字符串块还原分别验证精确旧 SHA，game 历史快照保持只读。

```json
{
  "salvageClosedTipsWired": true,
  "SalvageOpenFlag": false,
  "softOpenedSalvage": false,
  "released": false,
  "refineStoneMapped": true,
  "enchantSoftOpenPreserved": true,
  "EnhanceOpenFlagPreserved": true,
  "protectCharmSoftOpenPreserved": true
}
```

`refineStoneMapped:true` 仅指正式登记与有效 ITEMS/库存引用一致，核齐备≠生产放行。既有三 Flag 与历史 soft-open 旁证字节保护，结合本次真实回归支持保留结论；不是重新授权既有服务发布。

## 交付与下一棒

Codex 原日志：`/workspace/xiantu/logs/codex/f406ace5944d4bcb_20261017_150020_1731896.log`；启动日志 `qa/out_v06p1_salvage_closed/codex_launch.log`，引用 `codex-log-reference.json`。实际 model=gpt-6.1-sol、reasoning effort=ultra、stdin=/dev/null，fast=false；动态日志仅引用，不暂存。

HANDOFF/RESULT/status 在 wt/dev 提交，并以 UTF-8 相同字节同步至 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`；status 覆写为四段且≤30行。只暂存本窗允许文件，预存 art pending、dist-test、旧 out 与未跟踪 release 等待审文件保留原位。两笔普通 commit 后 `git push origin dev`，无 force 或 reset --hard；`final-tip.json` 在推送后记录本地/远端 HEAD，不另造自引用提交。

无程序自检阻断。下一棒交执法按 **design/30 §4.2 C01–C10** 对实现 tip、八提示、状态零增量、旧档与冻结 SHA 独立抽检并留实际证据；执法 PASS 后请负责人另下开态夹具令。**本令不授权开态夹具**，亦不授权 soft-open、release、进包或成功结算；禁阵法/gifts/#20/拍卖/坊市混窗，禁抬 GAME_PHASE。
