# v0.6 · P1③ 炼器一期 soft-open preamble 结果（不发版）

日期：2026-10-17（Asia/Shanghai）；工作目录：`/workspace/xiantu/wt/dev`；分支：`dev`；命令 stdin=`/dev/null`。

- 基线：`048dcf4250ec4775e1240fdefddc90cc8b97fc87`，即已 PASS 的开态夹具实现 `04c93ff17a3688387dbc536092d23ead2be73ce9` 及文档 tip `048dcf4`。开工先执行 `git fetch && git pull --ff-only origin dev`，exit 0 / Already up to date；已跟踪文件干净，既有待审未跟踪产物保留。
- 依据：经理本窗令；坊市 preamble `c01e959` / `V06P1_MARKET_OPEN_PREAMBLE_RESULT.md`；塔 preamble `de102e8` / `V06D_OPEN_PREAMBLE_RESULT.md`；炼器 `V06P1_FORGE_OPEN_FIXTURE_HANDOFF.md`；只读 design/24 §2、§4.3 O01–O08、§5。
- **实现 TIP_SHA：`e519e70f1014bbf7dbad088ff95b8360c402307d`**，仅六个授权源码/测试文件，已普通 push。文档、status 和本窗 QA 随后单独提交，文档 tip 与最终远端 SHA 见交付回执及 `origin/dev`。
- Blocker：无程序自检阻断。**formalOpen:true；closedFixtureOnly:true；softOpened:true；released:false。PASS≠release≠发版；本窗不进包，待执法堂冒烟，PASS 后也不自行 release。**

## 正式开态与关态夹具

`src/ForgeOpenFlag.ts` 精确为：

```ts
/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */
export function isForgeOpenForFixture(): boolean { return true; }
```

文件 SHA-256：`0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e`。无 import / process / 环境或配表开关；没有 forge.enabled 可翻，也没有新增 forge_*.json。

open runner 在 shared / snapshot 每根依次构造四张独立 SSR 图：formal-open → memory-closed → fresh formal-open → 带四品质历史袋的 fresh memory-closed，共八图。`openFixture=true` 使用磁盘正式 true，完全不注入 flag，flagLoads=0；false 仅由 `v06p1-forge-memory-closed` resolve/load 虚拟模块返回 false，flagLoads=1。所有图 features 覆盖调用为 0。

每根运行断言依次为 721 / 266 / 132 / 539，共 1658；双根 3316，加静态/保护 413，共 **3729**。正式开态图显式注入本地 fixtureRecipes 验 O01–O08；这份授权只在测试函数内存在，不进入正式表或 GameScene。

| O 表 | 本窗自动化与保留范围 |
| --- | --- |
| O01 | 正式 feature/entrance 只读允许；真实 GameScene.prototype 仅接既有欧冶匠提示，laterService 继续拒绝。 |
| O02 | 本地授权集仍显式提供图纸、材料、消耗及成品映射，校验数量、永久所有权和引用；不把夹具配方当正式依据。 |
| O03 | 真实 Progress / SaveStore / IDB 同一事务完成扣料、成品、四品质之一及请求/收据，forging 经验等级零变化。 |
| O04 | common/fine/spirit/treasure 四品质 export → importSave → restore → IDB load → fresh SSR 一致，重放零新写、零重抽、跨档隔离。 |
| O05 | 缺图纸/材料、非法引用/数量、无授权映射、未知品质或依赖问题明确拒绝，库存与经验保留。默认无 fixtureRecipes 的 craft/submit 另逐一断言 `forge.fixture.recipe`，零写、零抽样。 |
| O06 | 承载拒绝哨兵、实际入库失败、整数溢出、IDB complete 前不发布及 abort 回滚覆盖保留，无半提交。 |
| O07 | 连点、同请求重放、多 Gate 共用真实 Progress、争用同份库存覆盖保留，同请求不重复结算。 |
| O08 | 无袋旧档不补袋；歧义/损坏引用阻写不修档。四品质历史袋带入内存关态仍先拒绝八入口，不补做历史请求、不清空合法资产。 |

ForgeGate / ForgeProgress / Progress 本窗均保持字节不变。正式默认无 fixtureRecipes，未授予新打造提交；feature/entrance 允许只读不等于存在正式配方。强化、附灵、分解仍统一走 laterService 原拒绝；life_skills 的 forging integrationState=pending / available=false，不扩经验、等级或装备属性消费者。

memory-closed 每轮八 tip、重复/并发请求均比较整档、存储写计数、IDB rows 和抽样，操作增量全为 0。带历史的关态刷新图每根 result.storageWrites=4 / commits=4，仅来自四次 importSave 装载既有历史；Scene 冒烟与关态 API 操作增量仍全为 0，抽样为 0，不代表关态产生业务提交。

closed runner 每根先无注入验证正式 true / flagLoads=0，再 SSR false / flagLoads=1 跑原 C01–C12 与独立刷新。80 夹具、6720 次原 API 调用、存储写入/写哨兵调用全 0；另外验证 Gate 八入口对应原八 tip、整档零增量。ForgeClosed 保留 `6e94f87` 原字节。

两个 forge runner 的聚合 evidence 已统一 formalOpen / closedFixtureOnly / softOpened=true、released=false，无 memoryOpenOnly / fixtureOnly 开态表述。legacyFixtureOnly 只说明旧语义夹具，不表示内存开态。

## GameScene 最小冒烟接线与 closed 兼容

仅新增三 import、`tryInteractForgeEntrance()`、Z / 通用交互各一处调用，与 market 同级且在 talkNearby 前。只查当前地图 name=`smith_ou` 或 props.npc=`smith_ou` 的可见对象，横距≤28、纵距≤40 才消费交互。落霞镇既有对象仍为 name=`smith_ou`、type=npc、props.npc=`smith_ou`；无对象安静 return false。

内存关态只 log `forgeFeatureClosed().text`；正式开态只调用 `new ForgeGate(this.prog).entrance()`，允许时提示「炼器打造已开放。」，拒绝时显示 Gate 原文。无 fixtureRecipes 注入、提交调用、完整打造 UI 或提交面板，无 NPC services、无新 NPC / 地图 / 地图对象，不改 dialog/quests 或 ShopPanel。

真实 GameScene.prototype 冒烟覆盖：无对象、NPC 商店、横/纵超距、隐藏对象、name / props.npc 两种匹配、28×40 边界、正式/关态提示、Gate 拒绝路由、内存关态绕过 Gate、通用交互顺序。八图 sceneSmoke.saveWrites 均 0；Z 链另有源码断言。

forge-closed 与 market-closed 仅精确剥离本窗三 import、完整提示方法、Z/通用两处调用；方法另钉完整字节 SHA，防止夹带写操作。剥离后 GameScene 恢复夹具前 SHA `1279682ae18633aec1c0032d5a30d484f2e6de05deba34c2c80a9a423a203047`；market 再沿用其原有精确剥离与旧 SHA。其他域保护未放宽，market_consign 与所有 Market* 源码字节不变。

## 自检

以下均从 wt/dev 发起，exit 0；日志与 evidence 归 `qa/out_v06p1_forge_open_preamble/`。未运行 build / snapshot / sync / release。

| 检查 | 退出码 | 结果 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | PASS；tsc.log |
| `npm run test:v06p1-forge-open` | 0 | 3729 断言；八图 / O01–O08 / Scene 零写；open-agent.log |
| `npm run test:v06p1-forge-closed` | 0 | 20326 断言；C01–C12、80 夹具、6720 API 调用零写；forge-closed.agent.log |
| `npm run test:v06p1-market-closed` | 0 | 24148 断言；仅精确兼容欧冶匠接线；market-closed.agent.log |
| `npm run test:v06d-closed` | 0 | 15048 断言；v06d-closed.log |
| `npm run test:v06c-closed` | 0 | 10708 断言；v06c-closed.log |
| `npm run test:shop` | 0 | 596 断言；shop.log |
| 指定 datalint：共享根 / wt/dev/data | 0 / 0 | 两根均问题 0 条；datalint-shared.log / datalint-snapshot.log |
| 写前/写后保护 SHA 与目录集合 | 0 | 1379 项，1373 不变，6 项授权差异，0 未授权差异；protection.log |
| `git diff --check` / `git diff --cached --check` | 0 | 实现及文档/旁证提交前检查；diff-check.log / selfcheck.json |

datalint 使用 `PYTHONDONTWRITEBYTECODE=1`，Python `os.chdir()` 后 `runpy.run_path('/workspace/xiantu/qa/tools/datalint.py', run_name='__main__')`，并显式断言返回 P=[]。两根均检查物品50、怪物27、任务35、NPC27、地图24、秘境房间25。

聚合 `selfcheck.json`；专项 `v06p1-forge-open-evidence.json`、`closed/v06p1-forge-closed-evidence.json`、`market-closed/v06p1-market-closed-evidence.json`。独立审查已复核双图语义、默认授权拒绝、Scene 最小接线与 closed 精确保护，无实质缺漏。

## 保护 SHA

完整 `protected-before.json` / `protected-after.json` 覆盖三根全部 balance / maps 文件和 features 存在或缺席、wt/dev 与 game 的全部源码、必要 runner / package，以及原炼器 closed / open_fixture 两目录。`protected-diff.json` 显示唯一六项授权差异：ForgeOpenFlag、GameScene、open runner、open TS 测试、forge-closed / market-closed 兼容；Gate / Progress 未改。`authorized-source.diff` 留存实现差异。

| 关键保护 | 写前=写后 SHA-256（除注明者） |
| --- | --- |
| enhance.json（三根） | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` |
| life_skills.json（三根） | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` |
| npcs.json（三根） | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6`；各 gifts 10×false、smith_ou 无 services、quests=[] |
| shops.json（三根） | `4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2` |
| quests.json（三根） | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| strings_zh.json（三根） | `fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967` |
| market_consign.json（三根） | `e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde` |
| ForgeClosed.ts | `f7e4216be7767f481c96ae7f1dc5796574fe9b231ada91d57a137c1dc8a8c90c`，与 `6e94f87` 原字节一致 |
| ForgeGate.ts / ForgeProgress.ts | `d5382594f9672319f34a2cc1b18e05cb0e810140360c95b5692ad70158f227a0` / `1e1bcd7a248b8b5e93a4c03e062d86ecdbce90ee3a1b40045b92fd76484f5224` |
| Progress.ts | `24472642b862963303e2f148d51cb755a4cbf75009358055085a8dab87de263d` |
| features.ts / data.ts | `ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130` / `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` |
| GameScene.ts（授权最小接线） | `1279682ae18633aec1c0032d5a30d484f2e6de05deba34c2c80a9a423a203047` → `294b934b52a8b6537214360fffb93497643ce8261bea03aba8caf405cf5fcedf` |

清单自身 SHA：before=`cb22ce963d200077423de5555b4cfa264c4c2518e08bd78dabf1fb0244c23b4a`；after=`ed16d939376eb56c4e8af8dd79df964af5f416c899362accbe44af34e76f306b`。三根 recipes/items/materials/NPC、全部 maps、features、Market*、强化/生活技能等均逐项不变；GAME_PHASE=5。

原 `qa/out_v06p1_forge_closed/` 31 文件、`qa/out_v06p1_forge_open_fixture/` 40 文件（含既有未跟踪产物）路径与字节完整保留。forge 两套仅输出本窗；market-closed 输出迁本窗子目录。6d/6c 可选回归先完整备份原输出，复制新 evidence 到本窗后按 SHA 和文件集合恢复，见 regression-results.json。

## 边界与下一棒

没有 forge_*.json、forge.enabled 或正式配方授权；无 smith_ou.services、无新 NPC / 地图 / 地图对象、无完整 UI；未改 market_consign 或 Market*；gifts 10×false；enhance / life_skills / shops / quests / strings 字节不变；forging pending；强化/附灵/分解仍关；ForgeClosed 原字节保留；GAME_PHASE=5。未混 gifts/#20 gathering/阵法/拍卖/坊市或 6b/6c/6d 开态窗。

夹具仍沿用配置 id→数量库存、显式承载哨兵及内存 IDB 工厂调用真实 complete/abort 路径；不宣称完整装备实例系统、跨浏览器标签仲裁或实机全流程验收。程序自检不代执法堂在 design O 表勾选。

报告与 ≤30 行 status 以 UTF-8 同内容同步 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。提交仅六个实现文件及本窗报告/status/QA；pending art、dist-test、旧 qa/out_*、talisman 审计、codex_prompt 等未纳入。普通 push；无 force-push / reset --hard / release / 发版 / 进包。

【执法堂 1/3】TIP_SHA=`e519e70f1014bbf7dbad088ff95b8360c402307d`，P1③ 炼器一期 soft-open preamble；请按 forge-open / forge-closed 及真实 smith_ou 邻近提示冒烟，程序自检 3729 / 20326，market-closed 回归 24148 条通过。

【执法堂 2/3】formalOpen:true；closedFixtureOnly:true；softOpened:true；released:false；正式 flag=true，关态仅 SSR false；默认无 fixtureRecipes 拒绝提交；核对四品质刷新、八 tip 零增量与 Scene 零写旁证、三根保护 SHA。

【执法堂 3/3】下一棒仅执法堂冒烟并留证；本窗 PASS≠release≠发版，不进包，PASS 后也不自行 release。正式配方、完整打造 UI、装备实例、forging 经验及后续服务均须另令。
