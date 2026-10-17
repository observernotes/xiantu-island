# P1③+++ 强化正式实例源 · HANDOFF

2026-10-17｜炼器阁·主程序｜负责人令经项目经理执行。

已完成正式实例源接线及开态自动化 O01–O08，交执法独立抽检。基线 `2d98d66ed56775795a3204e339817fcc276433b3`，包含关态 tip 实现 `d5b385da7134e8ac14887b0efed125910b6d4802`。开工在本 wt/dev 执行 `git fetch && git pull --ff-only origin dev`，结果 Already up to date；所有自检 stdin=/dev/null。

实现 tip：`4644e96c530a592c2966798805e92a304f1c907a`；文档 tip 与 origin/dev 最终 HEAD 见最终回执及本窗 QA `final-tip.json`。

```json
{"formalTipsWired":true,"formalInstanceSource":true,"softOpenedEntrance":true,"released":false,"formalOpen":true,"softOpened":true,"closedFixtureOnly":true}
```

`formalOpen/softOpened` 兼容字段沿用既有只读入口状态；**实例源已接线 ≠ soft-open 进包。PASS ≠ soft-open ≠ release ≠ 进包**。本窗未运行 build/sync/release，未做护器符映射或有效护符保级成功路径。

## 实现与来源边界

- `ForgeGate` 只在默认正式 recipes 的完整 committed 成品已入库、forge 结果及 receipt 已写入同一 draft 后调用 `Progress.registerFormalEnhanceInstance`；任一步失败或 IDB abort 均整笔回滚。显式 fixtureRecipes/formalRecipes 不自动登记，Forge 既有开放语义与品质概率不变。
- 最小等级记录为 `instanceRef / itemId / type / enhanceLevel`。身份逐字采用 `${craftResultRef}:item`；ITEMS 的 weapon→weapon，robe/shoes→armor，初始等级 0。当前正式表只有青竹剑打造行，本窗已实证该条合法路径；未补造甲类正式配方。
- 可选 `enhance.formalSources` 保存 `{instanceRef, source:'forge', forgeLedgerId, craftResultRef, ownerSlot}`，绑定本档完整 Forge 结果、receipt、原 itemId 与槽位。登记 API 自身再核唯一正式配方、图纸/材料/产物数量及装备资格；重复登记保留当前等级。合法 Forge 双 128 字符 ID 形成的 268 字符引用可完整保存。
- 历史纯 instances、仅数量、仅槽位 itemId、甚至长得像打造引用的历史袋均不产生正式授权；缺袋旧档不补空袋。历史同名记录不能借登记 API 升格。损坏/外档来源不自动修复、不清资产。
- 无 fixtureInstances 时 Gate 只选本档 formalSources 对应的 instances；显式夹具授权集封闭，不回退正式源，且不能借同名正式 ref 改写正式等级。正式选择只读；背包与合法装备槽计数仅作已登记资产持有校验，不生成身份、不新增槽位实例映射。
- 正式成功/失败均只读 enhance.json 唯一 next 行，费用、最终等级/属性、结果、receipt 同次提交，instanceRef 保持不变。true 护符仍整笔 `enhance.formal.protect`；laterService 仍 `enhance.closed.later_service`；不读 ForgeOpenFlag 放行强化。
- 首次异步保存成功后固定 Progress 所属槽位。正式强化按槽共享互斥，并在抽样前核对已保存的 enhance 快照；同一运行图内不同 Progress 的竞争最多一次提交，旧对象随后重试也不能覆盖新结果。并发验证范围为同运行图；fresh SSR 验证保存后刷新读回，不把它外推为多浏览器并发事务验收。

## O01–O08 程序自检与执法接棒

| 编号 | 本窗已执行证据 | 执法下一棒 |
|---|---|---|
| O01 | 默认正式 Forge 成功同事务登记；无 fixture 选择；同原型两件独立；背包/合法槽位位置不改 ref；268/269 引用边界 | 对实现 tip 独立复核合法来源与选择 |
| O02 | 真实打造实例自 0 连续成功至 12，正式费用/属性/receipt 一次完整，原 ref 不变；旧 armor fixture 全档兼容 | 复核无护符正式成功链 |
| O03 | 正式目标 +5 失败不掉、+6 失败掉 1；照扣费用、不碎装，最终属性一致；旧 fixture 全档失败兼容 | 复核两个失败边界 |
| O04 | 正式/夹具 true 均拒且符库存不动；false 不依赖护符 | 只抽当前拒绝边界，不测有效护符成功路径 |
| O05 | 正式和 fixture 各成功/两种失败，共六载荷 export/import/restore/IDB load/fresh SSR 与 memory-closed 回读 | 复核旧结果不重抽、不补扣 |
| O06 | 缺登记、itemId/数量冒充、资格/slot/type、foreign、资源、满级/过期/越界、九类 SSR 坏表整笔拒；拒绝零写零抽 | 复核正式键、未知袋保留与零副作用 |
| O07 | 重复/冲突、同对象跨 Gate、同槽双独立 Progress 的同请求及不同实例共享资源竞争、过时对象重试、Forge/Enhance IDB complete 前后及 abort | 复核至多一次完整提交和中断回滚 |
| O08 | A 档绑定后切 activeSlot2 仍写 A；新 B 缺源拒绝；连 forge/source 整袋复制到 B 仍 foreign；历史纯袋不升格、合法资产保留 | 复核实例与去重的跨槽隔离 |

此表记录程序自检，不代勾 design/27 的执法验收项。旧 C 表 formal tip、memory-closed 首旗八入口与显式 fixture O 表能力均保留。

## 自检、QA 与冻结

全部 exit 0：tsc；enhance-open **11,259**；enhance-closed **30,769**；forge-open **6,378**；forge-closed **20,401**；market-closed **24,186**；v06d-closed **15,055**；v06c-closed **10,712**；双根 datalint 各问题 0；git diff --check。七套件合计 **118,760** 断言。

QA：[qa/out_v06p1_enhance_formal_instance/](../../qa/out_v06p1_enhance_formal_instance/)，入口为 `selfcheck-summary.json`、`protection-check.json`、`enhance-open/v06p1-enhance-open-evidence.json` 与 `regression/enhance-closed/v06p1-enhance-closed-evidence.json`。逐命令参数、cwd、stdin、exit、断言数及受测源码 SHA 均可追溯，`run-selfcheck.py` 可重放。旧 closed runner 精确剥离本窗新增接线后仍核原 SHA，不以整文件豁免放宽保护。

EnhanceOpenFlag 仍 true，SHA `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e`；ForgeOpenFlag true，SHA `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e`。enhance.json 三根写前=写后 SHA `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954`；recipes `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f`。items/materials/npcs/life_skills、maps/features/src/data 与两 Flag 均未改。shared/wt strings 保持 944 键与 `d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09`，game 旧 936 键快照未改；GAME_PHASE 仍 5，gifts 10×false。

Codex 原日志：`/workspace/xiantu/logs/codex/fdf021ccbbe110dd_20261017_095713_1332777.log`；启动日志：`qa/out_v06p1_enhance_formal_instance/codex_launch.log`（运行中日志保留本地，不纳入静态源码提交）。HANDOFF/RESULT/status 同步共享根同路径 UTF-8。

无程序自检阻断。下一棒交执法按 design/27 §4.3 O01–O08 抽检，PASS 报 tip+out 后请负责人另下 soft-open 令。附灵/分解/阵法/gifts/#20/拍卖/坊市与护符映射继续按原边界隔离。
