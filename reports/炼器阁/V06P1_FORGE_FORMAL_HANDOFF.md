# V06P1③+ 炼器正式配方接线交接

日期：2026-10-17（Asia/Shanghai）；cwd=`/workspace/xiantu/wt/dev`；分支 dev；命令 stdin=`/dev/null`。

**实现 TIP_SHA：`27dd0be022d46b318cc34e0235a9dbcbe8acc827`。** 基线 `801c3ab4d435748dc4942ed46612a6d7065c0760`（含实现 e519e70）；开工 `git pull --ff-only origin dev` exit 0 / Already up to date。本交接、RESULT、status 随后由第二笔 docs 提交；文档 tip 与最终 origin/dev HEAD 见交付回执。

程序自检 PASS；formalOpen:true、closedFixtureOnly:true、softOpened:true、released:false。ForgeOpenFlag 本窗未翻，GAME_PHASE 未抬，未运行 build/snapshot/sync/release，不进包。**PASS≠release≠发版。下一棒：执法堂复核并留证。**

## 正式表与映射

权威 `/workspace/xiantu/balance/recipes.json` 和实现提交中的 `data/balance/recipes.json` 镜像 SHA-256 同为：

`1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f`

两处均 12 条，forge 恰一条 `recipe_forge_bamboo_sword`；原 11 条及 rules/newItems 保留。镜像开工前已同步，本窗未再编辑内容，仅纳入实现提交。生产 `@xt` 沿既有 Vite alias 读取共享根，测试另隔离验证 wt/data；第三根 game/data 历史快照不改，不运行同步。

| 正式字段 | 内部与校验 |
| --- | --- |
| id/name/type | id 合法、与物品 id 区分且全表唯一，name 非空，严格 type===forge；缺 type、丹方、talisman、grinding 不可打造。 |
| blueprint | blueprintId，正式缺省消耗 blueprintCount=1；缺字段拒绝，不视为免图纸。 |
| materials[].item/count | 映射 itemId/count；正安全整数、非空且不重复，不与图纸/产物重叠。 |
| output | resultItemId；配置存在、当前 phase 可用且 type===equip。 |
| outputCount | 必填正安全整数，容量检查/addCraftedItem/库存增量/resultItem.count/重放/历史袋均读取该值。 |

请求沿用 blueprintId/materials/craftRequestId，通过唯一图纸匹配正式行并精确核对材料，不新增请求或装备实例 schema。图纸、材料、产物均走 configItem；永久所有权继续按 supportedItem/permanentCount，试炼临时份额不能冒充材料。

## fixture 隔离与原子提交

`options.fixtureRecipes !== undefined` 时仅用该测试授权集，空集或无匹配也不读正式表补充。否则只用正式 forge 行；默认正式无匹配或注入 `formalRecipes:[]` 时 craft/submit 拒绝，**fixtureRecipes 不作生产回退**。formalRecipes 仅为测试原始行替换钩子，生产默认读 imported recipes.recipes；GameScene 不注入测试配方。

既有夹具可省 outputCount，默认 1；显式非法数量拒绝。正式表 outputCount 必填、无默认。测试局部注入 3 验证容量调用、入库和结果，不改磁盘正式数量 1。ForgeProgress.resultItem.count 改为 number 并校验正安全整数，Gate 再核对当前配方数量；旧 count=1 合法历史袋仍兼容。

完整成本、成品、品质和唯一收据仍同次 SaveStore/IDB 事务成立；abort 不发布草稿，同请求重放不抽样、不再扣料或发物。品质只从既有 enhance.forge.grade 抽样，不复制概率、不补成功率/附词缀/等级偏移数值。affixCount/forgingLevelShift 只读、未扩展消费者；enhance/life_skills 原字节保持，forging integrationState=pending，不写 forgingLevel/Exp。laterService 继续拒绝强化/附灵/分解。

## O 覆盖与自检

| 覆盖 | 本窗旁证 |
| --- | --- |
| O01/O02 | 默认无 fixture 的正式 craft 允许且只读；图纸材料校验；保留既有 smith_ou Scene 提示零写。 |
| O03 | 正式 submit 扣图纸材料、按 outputCount 出成品及唯一收据；四品质与经验等级零变化。 |
| O04 | 原四品质 export/import/restore/IDB/fresh SSR 回归保留；新增多数量真实 import、数量与当前配方不符拒绝。 |
| O05 | 正式空集/无匹配、缺字段、无 type/错类型、非法引用/数量、重复和跨类型同 id 均拒绝且零写零抽样；fixture 显式隔离。 |
| O06/O07 | 原承载/add 失败、complete/abort、连点重放、多 Gate 争用保留；新增 outputCount=3 溢出整笔拒绝。 |
| O08 | 旧档/歧义袋/坏引用及收据保护保留；内存关态 false 注入仍八 tip 首句返回，合法历史资产不变。 |

全部最终自检 exit 0；日志根 `qa/out_v06p1_forge_formal/`：

| 检查 | 结果 / 日志 |
| --- | --- |
| npx tsc --noEmit | PASS；tsc.log |
| test:v06p1-forge-open | **6354** 断言；forge-open.log、v06p1-forge-open-evidence.json |
| test:v06p1-forge-closed | **20326** 断言，80 夹具/6720 API，写入0；forge-closed.agent.log、closed/ |
| test:v06p1-market-closed | **24148** 断言；market-closed.agent.log、market-closed/ |
| test:v06d-closed / test:v06c-closed | **15048 / 10708** 断言；v06d-closed.log / v06c-closed.log |
| 指定 datalint.py：共享根 / wt/dev/data | PYTHONDONTWRITEBYTECODE=1，两根问题0；datalint-shared.log / datalint-snapshot.log |
| json.tool / recipes SHA | PASS；recipes-check.log |
| diff --check / diff --cached --check | PASS；diff-check.log / staged-diff-check.log |
| 独立源码复核 | PASS；review.md |

聚合 selfcheck.json。双根各 formal-open、memory-closed 及两次 fresh SSR，共八图；正式图无 Flag 注入，关态仅内存 false，features 覆盖0。历史刷新图已有 importSave 写入与关态业务零增量分别记录，不把装载历史称为关态业务提交。

## 保护与下一棒

protected-before.json / protected-after.json 覆盖三根 balance/maps、两处源码、scripts/package、features 存在/缺席和旧三处 forge QA，共 **1528 文件、6 项授权差异、0 未授权差异**。镜像写前已同步、写后同 SHA。见 protection-diff.json、boundary-check.json、protection.log；可选回归旧输出备份后逐字恢复，见 regressions.json。

- ForgeOpenFlag 未改、正式 true，SHA `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e`；ForgeClosed 保留原 SHA `f7e4216be7767f481c96ae7f1dc5796574fe9b231ada91d57a137c1dc8a8c90c`。
- GAME_PHASE=5；三根 gifts 各 10×false；smith_ou 无 services、quests=[]；无 forge_*.json。
- GameScene 全字节未动，仅保留既有 tryInteractForgeEntrance 最小提示；无完整打造 UI。
- market_consign/Market*、features/data、enhance/life_skills/npcs/shops/quests/strings/dialog 及地图未改；禁混阵法/gifts/#20/拍卖/坊市。
- 旧 qa/out_v06p1_forge_closed、open_fixture、open_preamble 文件集合/字节全保留；pending art、dist-test、旧 QA、talisman 审计、codex_prompt 未暂存。

报告与四段 ≤30 行 status 以 UTF-8 同内容同步共享根 reports/炼器阁/ 和 status/炼器阁.md。两提交模式：实现含镜像/QA，随后 docs 仅 HANDOFF/RESULT/status；普通 git push origin dev，禁 force。

请执法堂按实现 tip 核 design/25 默认正式闭环、空表/fixture 隔离和 outputCount，以及 design/24 原子性/关态八 tip 零写和欧冶匠最小提示。程序自检不代执法勾 O 表。当前仍为配置 id→数量背包，品质引用不等于完整装备实例系统；内存 IDB 工厂调用真实 complete/abort，未宣称浏览器全流程或跨标签仲裁。**PASS≠release≠发版，不进包。**
