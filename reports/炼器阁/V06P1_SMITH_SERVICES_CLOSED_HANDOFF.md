# v0.6 · P1③++++++++ 炼器服务关态 tip / 接线交接

2026-10-17 Asia/Shanghai；cwd=`/workspace/xiantu/wt/dev`，分支 `dev`，命令 stdin=`/dev/null`。开工执行 `git fetch && git pull --ff-only origin dev`，exit 0，HEAD=`0dd59efdcd288930f1bd0525d2c9e7ddf06c0814`，含 v0.6.13 / attr-ui soft-open。既存 dirty 保留，不纳入本窗提交。

实现 tip：`7ebf164e1dfed77f81600a70e94b1a6e541067cc`，`feat(v0.6-p1): wire smith services closed tip and gate adapters`。文档 tip、origin/dev 与远端 HEAD 推送后写本窗 `final-tip.json`，不在提交内制造自引用。HANDOFF/RESULT/两份 status 以 UTF-8 相同字节同步共享根。

依据：`/workspace/xiantu/reports/炼器阁/20261017_负责人令_P1③++++++++关态tip接线.md`、design/32 §2–§3、§4.2 C01–C11、§6.2 与天机 PASS；实例/护符/分解沿 design/28–31 及现有正式 Gate、EquipInstBinding、Progress。交接结构对齐 SALVAGE_CLOSED_HANDOFF，历史报告中的旧关旗事实不回写本窗。

**本令仅炼器①②关态 tip / 接线 ≠ design/32 开态 O01–O11 ≠ soft-open ≠ release ≠ 进包。** `smithServicesUiWired:true` 指炼器侧等价 services 路由与四 Gate 适配已交，不代表 GameScene 对话/菜单/四面板呈现已完成；`softOpenedSmithServicesUi:false`、`released:false`。程序自检不代执法，不勾设计原文 C/O，本窗不 fan-out 执法或负责人。

## ① strings 43 键仅末尾追加

先写共享权威 `/workspace/xiantu/balance/strings_zh.json`，再精确执行 `cp -f /workspace/xiantu/balance/strings_zh.json data/balance/strings_zh.json`。两根当前字节一致；没有运行全量 snapshot 或同步其他表。

- 键数（含 `_meta`）：**970→1013**，`ui.smith.*` 39 键 + `forge.grade.*` 4 键，全文、Unicode、占位符与 design/32 §6.2/负责人核准清单逐键一致。
- 写前 SHA：`ae51319b82a6486cc7f3d9b26c5ae89719e23c32ff9debdcfbb86ef7b5aea08b`。
- 写后 SHA：`d99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841`。
- 原末键 `ui.equip.inst.unavailable` 仍为第 970 键、写后倒数第 44 键；为承接新增区只补逗号，原文件末尾 `\n}\n` 前 **62,534 字节**前缀完全一致，SHA=`615f66c4cb935013d097ab413c1453e646fe8567714bcd40401a36620a0f0d77`。
- 精确剥离 43 键追加区并还原对象结束符，逐字节还原写前 SHA；既有 970 键值、顺序、缩进均保持。证据：`strings-append-proof.json`，专项 shared/snapshot 又独立验证一次。

## ② 等价 services 路由与正式 Gate 适配

新模块 `src/SmithServices.ts` 导出 `SMITH_SERVICES_ROUTE={npcId:'smith_ou', labelKey:'ui.smith.title', services}`，四意图 type 固定 forge/enhance/enchant/salvage；npcs.json 无变更、仍无 services 字段。该发现元数据定义“对话→炼器服务→四服务菜单→各面板”的接入语义，不授予开放或结算权限。

| API | 接线契约 |
|---|---|
| `entrance()` / `menu()` / `panel(service)` | 入口、菜单和单面板分别守门，生产均 `ui.smith.closed`；隔离图单服务关闭沿对应 Gate.closed 提示，其他服务独立。 |
| `choices(service)` | 打造只列正式 forge 配方与所需/持有；装备按正式本档绑定独立成行，位置为明确槽位或正式背包行，属性沿既有只读 display。 |
| `select(service, request)` | 委托 `craft/enhance/enchant/salvage` 只读核验，保存视图内明确载荷和状态快照；不生成请求身份、不写业务数据。 |
| `submit(service, request)` | 必须之前明确选择同完整请求且当前快照未变，随后只委托对应 Gate.submit；busy/epoch 只在视图内。 |
| `result(service, request)` | 委托 Gate 的 result/level，完整请求字段/schema与完整本档结果匹配才回放；额外字段、重复材料、改目标/护符/品质均不冒认旧成功。 |
| `loadRefresh(service)` | 委托 Gate 只读旧状态，不把读档状态伪装本次提交成功。 |
| `back()` / `invalidate()` | 只清视图确认；不取消或补做 Gate 事务；导航、切档和旧异步回调复核 ownerSlot/epoch。 |

生产 `routeAvailable` 固定 false，无构造开关、无新生产 OpenFlag、无 UI 开放持久字段。测试仅在独立 Vite SSR memory-closed 图替换路由方法与四 Flag 内存模块；磁盘四 Flag 仍 true。GameScene.tryInteractForgeEntrance 原四 Gate entrance 冒烟保留，未新增完整 UI 或最小前台 stub。

正式实例只沿 EquipInstBinding 和 Progress formalSources 核实；不以 itemId 数量、首条、最高等级或 fixture 制造实例。E/I display unavailable 只隐藏属性，不夺取独立服务身份。强化 bool 护符意图原样传 Gate，护符不足提示读取正式 enhance_protect_charm 映射，未齐/不足整拒，不静默取消护符。Gate 的完整概率失败仍是已结算结果；带 result 的 Enhance allowed=false duplicate 可以只读核实，不能按 allowed 单值判成功/关态。

**分解正式依赖缺口保留：** 当前正式资格、精确位置下的全部关联退役与生产原子承载证据尚未齐。模块只 `new SalvageGate(progress)`，无 qualification/SalvageFixtureCarrier 默认注入或回退；真实正式实例只读选择仍由原 Gate 的 qualification 拒绝，前台映射中性 `result_unknown`，保留 gate 原裁决供复核。不自删实例、不发产物、不新增资格 schema/事务。正式位置 binding 已有不等于资格、关联退役和原子承载全齐。

不改任一 Gate 公式、结果/收据/去重、Progress、SaveStore、EquipInstBinding、EquipInstReadonly 或 E/I 产品代码。`source-review.json` 记录完整载荷匹配、Flag 隔离、护符映射、非确定承载原因、同元素新请求及旧回调六项审查闭环。

## C01–C11 程序旁证

专项命令 `npm run test:v06p1-smith-services-closed` exit 0，**17,425 断言**。shared/snapshot 各 production-closed、memory-closed、fresh-memory-closed，共 6 个独立图；生产图不转译产品路由/Flag，深层关态只在隔离图可达。逐项 cases 与 evidenceKeys 见本窗 `evidence.json`。

| 编号 | 本窗执行证据与口径 |
|---|---|
| C01 | 完整入口反复对话意图/重读，所有旧面板方法优先总 UI 关闭；只 tip，无菜单或结果。 |
| C02 | 菜单故意关，旧点击/回调不派发；真实只读选择后关菜单清旧确认，重开须重选。 |
| C03 | 打造合法/缺图纸/缺材料/满包语义上下文，面板关与 Gate 关分层，零扣料/产物/品质/经验/请求。 |
| C04 | 正式装备与护符有/无/不足、映射缺失语义及满级，关态优先，零抽样/扣料/扣符/等级变化。 |
| C05 | 首附/同元素/覆盖/非法防具意图，UI/Gate 关闭只对应 tip，零附着/属性改写。 |
| C06 | 正式装备、不可分解/未知品质/承载不足语义，关闭时零销毁/产出/关联改变。 |
| C07 | UI false + 四 Gate true；各单服务 false 不串其他旗；Enhance/Enchant 双关时独立 Salvage 候选仍有两件正式位置实例，属性隐藏；真实默认分解资格拒绝。 |
| C08 | 无实例、聚合数量、fixture-only、foreign owner、旧位置；关态优先，图内只读正式候选/选择亦拒非法来源，不迁移或补实例。 |
| C09 | 四服务共享同实例/请求/材料 48 次并发全拒；切档 owner guard；延迟旧结果的切档/invalidate/UI关三种回调均不污染新视图。 |
| C10 | 两档真实 saveAsync/loadAsync 与刷新图保留四服务完整历史结果、两个存活正式实例和第三已退役分解历史；未知版本/半结果/缺收据/旧UI记录不修档；九种载荷冲突无伪成功。 |
| C11 | 每动作比对 exportSave、全部公开字段/缓存及后端原文；真实 EquipPanel/InventoryPanel 只读 E/I 往返无状态变化，不串 attr-ui 成功或 later_service。 |

容量限制、护符映射损坏等关闭前不可达条件是**语义上下文**，不表示本窗已实现或运行正式容量/资格系统。C09 的 pending 回调是测试内存 `Gate.submit` deferred spy，返回由真实 Gate.result 取得的既有完整结果，原 submit 不执行、settlementExecuted=false；只证明视图生命周期拒旧，不声称新结算或 design/32 O 并发通过。完整历史分解 seed 经原 Gate.loadRefresh 只读核实，不以 fixture 授权生产能力。

所有关态/只读动作的 SaveBackend 写、localStorage 写、IndexedDB 打开与写接口哨兵均 **0**；普通准备保存 **8** 次单列。没有服务请求/结果/收据/去重/队列/业务缓存持久增量，没有修档、补做、补扣或补发。

## 自检与回归

全部最终命令 exit 0，合计 **190,423** 条断言（专项 17,425 + 回归 172,998）。

| 检查 | 断言 | exit |
|---|---:|---:|
| `test:v06p1-smith-services-closed` | 17425 | 0 |
| `v06p1-attr-ui-closed` | 1592 | 0 |
| `v06p1-attr-ui-binding-success` | 327 | 0 |
| `v06p1-attr-ui-map-api` | 1128 | 0 |
| `v06p1-attr-ui-map-services` | 175 | 0 |
| `v06p1-forge-closed` | 20560 | 0 |
| `v06p1-enhance-closed` | 30981 | 0 |
| `v06p1-enchant-closed` | 12621 | 0 |
| `v06p1-salvage-closed` | 19413 | 0 |
| `v06p1-forge-open` | 6496 | 0 |
| `v06p1-enhance-open` | 17804 | 0 |
| `v06p1-enchant-open` | 4643 | 0 |
| `v06p1-salvage-open` | 7145 | 0 |
| `v06p1-market-closed` | 24300 | 0 |
| `v06c-closed` | 10730 | 0 |
| `v06d-closed` | 15083 | 0 |
| `npx tsc --noEmit` | — | 0 |
| 双根 datalint | 各问题 0 条 | 0 |
| `git diff --check` / 暂存差异检查 | — | 0 |
| 保护与 evidence 硬门 | 30 冻结项、2713 旧产物 | 0 |

入口：`selfcheck-summary.json`、`evidence.json`、`strings-append-proof.json`、`protection-check.json`、`source-review.json`。专项 `smith-services-closed-result.json` 与 log；回归 `regressions/regression-summary.json`、逐命令 log/result、adaptations；双根 datalint/tsc/diff 见 `audit/`。

旧测试锁历史 strings960/970、源码清单和旧 attr-ui 字节证明，使用本窗 pinned Node loader 仅在**测试脚本内存**精确适配：剥43还原970、再剥10还原960，每层固定历史 SHA；既有源码先核当前精确 SHA，再恢复历史证明链。仅 enhance-open 的测试 TS 总键数断言内存适配到1013；业务断言及产品模块不变换，原测试磁盘不写，旧输出全部重定向本窗。game 历史快照970只读保留。早期静态期望适配失败留 attempts，canonical 最终全绿。详见 `regressions/compatibility-proof.json`、`pinned-inputs.json`、`adaptations/`。

旧 Gate open 回归中的 softOpened:true 是各既有服务事实，不代表本窗 SmithServices UI 获准开放。未执行 design/32 O01–O11，不代勾旧 C/O。

## 冻结与硬门

| 对象 | SHA-256 | 写后 |
|---|---|---|
| `enhance.json` | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` | MATCH |
| `recipes.json` | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` | MATCH |
| `materials.json` | `86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d` | MATCH |
| `items.json` | `dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99` | MATCH |
| `life_skills.json` | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` | MATCH |
| `enhance_protect_charm.json` | `0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772` | MATCH |
| `npcs.json` | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` | MATCH |
| `ForgeOpenFlag.ts` | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` | MATCH |
| `EnhanceOpenFlag.ts` | `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e` | MATCH |
| `EnchantOpenFlag.ts` | `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a` | MATCH |
| `SalvageOpenFlag.ts` | `69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3` | MATCH |
| `data.ts` | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` | MATCH |

共享/wt 两根冻结表 MATCH，npcs 保持原 SHA；四 Flag 正式 true 保留，GAME_PHASE=5，gifts 10×false。全 Gate、Progress、GameScene 与实例绑定/只读模块保持原字节。`audit/protected-before.json` 与 `protection-check.json` 记录前后；2,713 个旧 QA/dist-test/art pending 文件及其集合保持，未授权差异 0。初始 salvage open old-qa-preservation.json dirty 原样保留且未暂存。

```json
{
  "smithServicesUiWired": true,
  "newOpenFlag": false,
  "enhanceSha": "d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954",
  "stringsKeysBefore": 970,
  "stringsKeysAfter": 1013,
  "stringsShaBefore": "ae51319b82a6486cc7f3d9b26c5ae89719e23c32ff9debdcfbb86ef7b5aea08b",
  "stringsShaAfter": "d99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841",
  "softOpenedSmithServicesUi": false,
  "released": false,
  "settlementUnchanged": true,
  "fourFlagsPreserved": true,
  "GAME_PHASE": 5,
  "gifts0": true
}
```

## 下一棒与接引子待办

可交执法按 **design/32 §4.2 C01–C11** 独立抽检本实现 tip、等价路由、分层提示、正式拒绝、全量零增量、E/I 隔离与冻结 SHA；本窗只交程序旁证，不发执法/负责人外部消息。

**接引子仍须完成对话→菜单→四面板 tip**：欧冶匠对话消费 SMITH_SERVICES_ROUTE、四服务菜单、四面板选择/确认/提交/结果文案、键鼠焦点与 Esc 返回、重选清确认、关闭/切档刷新旧视图。choices/导航先于 select；select 后改选或导航需重新确认；请求身份与完整载荷沿既有 Gate 协议，不新增 UI 账本。Enter 不默认破坏性提交；分解正式依赖未齐继续拒绝，不能安装 Fixture 回退。本报告不代写接引子已实现结论。

执法 PASS 后仅经项目经理回负责人，请另令开态夹具；无新令不做 O/soft-open/release/进包/tag/Pages。未运行 snapshot/build/sync/release/Pages；禁阵法/gifts/#20/拍卖/坊市混窗、抬 GAME_PHASE、改玩法结算或回翻 Flag。两笔普通 commit + push origin dev，无 force/reset --hard。
