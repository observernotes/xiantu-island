# P1③ 炼器一期 · 开态夹具交接

时间：2026-10-17（Asia/Shanghai）。工作目录 `/workspace/xiantu/wt/dev`，分支 `dev`，命令 stdin=/dev/null。

- 开工执行 `git fetch && git pull --ff-only origin dev`，基线为含关态 handoff 的 `348b74e2398d4cda8b0417a875e9fa916ed811b6`。
- 实现及自检 tip：`04c93ff17a3688387dbc536092d23ead2be73ce9`；关态基线 `6e94f87b60b0fb6f6c6540a97000f2badabad10b` 保留。本文和 status 随后一笔文档提交，文档 tip 与推送结果见交付回执和 `origin/dev`。
- 依据：经理本窗开态夹具令、design/24 §2 原子性 / §4.3 O01–O08 / §5、关态 handoff，以及 `189fe4c` 的正式关 + SSR 内存开 market 夹具和 `131590c` runner；没有照搬当前 market soft-open 状态。
- **正式旗恒 false；本窗 PASS≠soft-open≠进包≠release≠发版。下一棒交执法堂 O 表复核。**

`src/ForgeOpenFlag.ts` 精确为：

```ts
/** 正式恒关；仅 Vite SSR 开态夹具图可由 resolve/load 内存模块注入 true。 */
export function isForgeOpenForFixture(): boolean { return false; }
```

ForgeGate 八入口为 feature / entrance / craft / submit / result / grade / loadRefresh / laterService；每个首语句先查旗。false 原样返回 ForgeClosed 对应八 tip，不读资格或配方、不进事务、不抽样、不扣料/产物、不写品质/经验/请求/去重或延后队列。ForgeClosed.ts 与 `6e94f87` 完整字节一致。正式首图每根 248 断言、存储写入 0；正式历史刷新图每根 521 断言，其 4 次写入仅来自逐品质 importSave 准备步骤，每个 Gate 调用增量始终为 0，随机抽样为 0。无袋、pending/unknown/坏引用袋及真实四品质历史袋均覆盖。

shared 与 snapshot 各建正式图、仅 resolve/load 虚拟旗标返回 true 的开态图，再各建两个 fresh SSR 图读回历史结果，共 8 次独立建图。正式图 flagLoads=0、内存图=1，features 覆盖调用=0。数值读取各根已有 enhance.json；没有 sync、snapshot、配表写入、软开或 release。每根运行断言分别为正式 248、内存开态 686、fresh 开态 97、fresh 正式 521，总运行 3104 + 静态 397 = **3501**。

| O 表 | 自动化结果与范围 |
|---|---|
| O01 | feature/entrance 允许只读夹具说明，craft 只读选择；不建请求、不抽样。smith_ou 未挂服务，未接 GameScene/NPC/dialog/quests/ShopPanel，未宣称实机入口已存在。laterService 即使内存开态仍回原拒绝 tip。 |
| O02 | 仅本地 fixtureRecipes 显式授权：scroll_ten_thousand_swords ×1 + spirit_copper ×1 + refine_stone ×1 → bamboo_sword ×1。图纸消耗量仅为本夹具授权；提交材料集合、数量、永久所有权、引用与映射逐项核验，不使用试炼临时份额、不预扣。 |
| O03 | 真实 Progress 草稿在同次 SaveStore/IDB 提交中扣完整成本、入成品、绑定 resultGrade/resultItem.instanceRef、保存 craftResultRef 与唯一 receipts。品质仅从 enhance.forge.grade 抽样，四档逐一验证；所有成功均断言 forgingLevel/Exp 零变化。 |
| O04 | 四品质逐一 exportSave → importSave(async) → restore(false) → IDB load → fresh SSR；库存消耗、成品、品质、请求及收据一致。重放不重抽、不重复消费/发物；跨槽结果隔离，返回视图为副本。 |
| O05 | 缺图纸/材料、非法引用/数量、重复材料、未授权或缺映射、未知品质、非法或抛错随机源均明确拒绝；原库存、原 forging 经验/等级保留。随机源 null/undefined 不回退到默认抽样。 |
| O06 | 满包/承载拒绝哨兵、安全整数溢出、实际 addCraftedItem false/抛错/返回 true 但无入库均保原。IDB request 成功而 complete 前不发布草稿；abort 保持旧内存与旧磁盘，随后同请求完整重试只出一份结果。 |
| O07 | 同 Gate 连点、同请求重放、多 Gate 共享同一 Progress、不同请求争用一份库存只提交一次。Gate busy 与 Progress 事务互斥后重读草稿；重放直接只读既有结果，零新事务/抽样/扣料/产物/经验。 |
| O08 | 旧 pending/未知状态、坏 request/result/item 引用、未知品质、重复结果/收据均阻断写操作；损坏袋 import 拒绝且当前合法资产不变。正式图优先关态，历史请求不补做、不修复、不清空。缺 forge 旧档 import/restore 后仍 undefined，export 不补袋。 |

降级与未验范围：forging 在 life_skills 中仍 integrationState=pending，Progress.available=false，因此完全不写 forgingLevel/Exp，不臆造经验消费者。现有背包为配置 id→数量，没有格数上限或正式装备实例系统；resultItem.instanceRef 是夹具提交品质引用，库存仍按既有计数，不新增装备属性/附词缀消费者，不把夹具袋当正式物品实例 schema。满包通过明确哨兵模拟；存储介质为内存 IDB 工厂，但调用真实 createIndexedDbBackend 的 complete/abort 路径，未做浏览器实机或跨标签存储仲裁。并发保证范围为多个 Gate 共用真实 Progress，与 market 夹具一致。

Progress.ts 只增加 4 行：纯结构 import、validSaveData 校验、注释和可选 forge 字段；已有 export/import/restore 机制承载完整事实。ForgeProgress 不读配置、不写盘，严格检查完成状态、四档枚举、材料/结果/收据强引用、重复和未知字段；不自动修复损坏袋。没有正式配方表，默认 fixtureRecipes 缺省拒绝所有新提交。enhance.forge.grade 维持 common:0.6 / fine:0.3 / spirit:0.09 / treasure:0.01，不新增成功率、费用、品质偏移或经验规则。

旧 forge/market closed 套件仅精确允许 ForgeOpenFlag.ts / ForgeGate.ts / ForgeProgress.ts / v06p1-forge-open.test.ts，并对 Progress 精确剥除 4 个完整授权行后核旧 SHA；原八 tip、零写、GameScene 无炼器接线、表和地图断言保留，另加强 ForgeClosed 字节及正式旗 false 检查。既有 market 正式 soft-open 与 6b/6c/6d 状态仅做保护和回归，没有混入本窗开态。

| 自检命令 | 结果；日志与 result.json 均在 qa/out_v06p1_forge_open_fixture/ |
|---|---|
| npx tsc --noEmit | exit 0；tsc.log。 |
| npm run test:v06p1-forge-open | exit 0；3501 断言，O01–O08、双根四种图、270 文件/6 目录运行前后不变；v06p1-forge-open.log。 |
| npm run test:v06p1-forge-closed | exit 0；20218 断言、80 夹具、6720 API 调用，存储/写哨兵调用 0；v06p1-forge-closed.log。 |
| npm run test:v06p1-market-closed | exit 0；24120 断言；v06p1-market-closed.log。 |
| npm run test:v06d-closed / test:v06c-closed | 均 exit 0；15048 / 10708 断言。 |
| 指定 datalint.py，共享根 / wt/dev/data | PYTHONDONTWRITEBYTECODE=1，均 exit 0、问题 0 条；datalint-shared/snapshot.log。 |
| git diff --check；git diff --cached --check | exit 0；新文件暂存后再次核完整差异，diff-check.log。 |
| 写前/写后 SHA 和目录集合 | 572 项保护，571 项完整字节/缺席不变；唯一授权差异为 Progress 4 行；0 未授权差异。 |

完整旁证：protected-before-task.json / protected-after-task.json / protected-directories-before-task.json / protected-diff.json / validation-summary.json。三根全 balance/maps 文件集合不变，features/data、GameScene/ShopPanel、增强/生活技能/NPC/shops/quests/strings 等逐项保护。原 qa/out_v06p1_forge_closed/ 共 31 个文件的路径与字节完整保留；新运行输出复制至本窗 v06p1-forge-closed-evidence/，旧窗全部恢复。其他旧回归输出也备份后原字节恢复。

| 关键保护（写前=写后，除注明者） | SHA-256 |
|---|---|
| enhance.json（三根） | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 |
| life_skills.json（三根） | 204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b |
| npcs.json（三根） | 2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6；每根 gifts 10×false，smith_ou 无 services、quests=[]。 |
| shops.json（三根） | 4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2 |
| quests.json（三根） | c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b |
| strings_zh.json（三根） | fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967 |
| ForgeClosed.ts | f7e4216be7767f481c96ae7f1dc5796574fe9b231ada91d57a137c1dc8a8c90c |
| GameScene.ts / ShopPanel.ts | 1279682ae18633aec1c0032d5a30d484f2e6de05deba34c2c80a9a423a203047 / 419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c |
| Progress.ts（唯一授权变化） | 3e1f4a258b384d5f0d1a2967d0228fcd792cb9a58979efcd5648d9baf9f2e7da → 24472642b862963303e2f148d51cb755a4cbf75009358055085a8dab87de263d |

报告和 ≤30 行 status 已同步 UTF-8 同内容副本到 /workspace/xiantu/reports/炼器阁/ 与 /workspace/xiantu/status/炼器阁.md。仅暂存本窗源码/脚本/package/新旁证及两份文档；pending art、dist-test、旧 qa/out_*、talisman 审计、codex_prompt 和辅助脚本均留原位不纳入。两笔普通提交后执行 git push origin dev；禁 force-push/reset --hard。

下一棒：执法堂按实现 tip 复核 design/24 §4.3 O01–O08 的 API 夹具、正式图八 tip 零写、历史袋与保护 SHA，结合上述降级另留执法证据。本报告不代执法勾选设计 O 表。前台入口、正式配方与装备实例、forging 经验、soft-open/release 均待另令；GAME_PHASE=5，gifts/#20 gathering/阵法/拍卖/坊市及 6b/6c/6d 开态窗未混入。
