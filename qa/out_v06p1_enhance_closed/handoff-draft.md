# v0.6 · P1③++ 强化一期关态交接

更新时间：2026-10-17（Asia/Shanghai）。工作目录：`/workspace/xiantu/wt/dev`；分支：`dev`；命令 stdin 为 `/dev/null`。

- 写前基线：`d80ebb5c30fa3fe7b375a07842c6feb42d879c05`；提交前以 fetch / ff-only 核对包含该基线并与 `origin/dev` 对齐。
- 实现与自检 tip：`__IMPLEMENTATION_TIP__`（`feat(v0.6-p1): enhance closed tip APIs`）。本报告与 status 随后一笔文档提交；文档 tip 以交付回执及 `origin/dev` 为准。
- 依据：`/workspace/xiantu/design/26_v06_P1③++_关态_强化一期.md` §3、§4.2 C01–C12、§6；实现对齐 `src/ForgeClosed.ts` / `src/MarketClosed.ts` 及 `6e94f87` 关态 tip 风格。设计文中“不新建 Flag/代码”属于前一设计窗，本次经理接线令明确授权新增 `EnhanceClosed.ts`、`EnhanceOpenFlag.ts` 与测试。
- **本窗只交强化关态 tip：不开态、不软开、不 release、不 force-push；不挂 smith_ou.services，不接前台可执行强化，gifts 10×false，GAME_PHASE=5。PASS≠发版。**

## 行为表与接线

| 编号 | 真实 API 与提示 | 保持的边界 |
|---|---|---|
| C01 | `featureClosed()` → `enhance.closed.feature`，可反复读取 | 不创建服务、业务请求或可执行强化流程。 |
| C02 | `refuseEntrance()` → `enhance.closed.entrance` | smith_ou 的 dialog / quests 原字节保留，quests=[]、无 services；不借打造许可。 |
| C03 | `refuseEnhance()` → `enhance.closed.enhance`，含齐备语义与连点 | 不抽结果、不扣灵石 / 精炼石 / 护器符、不改等级 / 属性，不建去重记录或待执行队列。 |
| C04 | `refuseSubmit()` → `enhance.closed.no_submit`，合法下一档提交语义仍拒绝 | 不创建强化业务请求，不锁装备、不预留库存。 |
| C05 | `refuseSubmit()` → `enhance.closed.no_submit`，非法实例 / 缺行 / 重复行 / 非法配置语义均拒绝 | 不补配置、不猜默认放行，不先扣后返。 |
| C06 | `refuseLevel()` → `enhance.closed.no_level`，含满级、越界与非法旧等级语义 | 不升降档、不重算写入、不归零或修档；合法既有等级保留。 |
| C07 | `refuseConsume()` → `enhance.closed.no_consume`，含资源不足语义 | 三类消耗均零扣除，不冻结库存、不猜护器符消费数量。 |
| C08 | `refuseLoadRefresh()` → `enhance.closed.load_refresh`，读档 / 刷新后再拒绝 | 不补扣、不重抽、不自动升降级，不新增 localStorage 写入。 |
| C09 | `refuseLaterService()` → `enhance.closed.later_service` | 附灵 / 分解只提示，不进入流程、不消费、不改装备。 |
| C10 | `refuseEnhance()` → `enhance.closed.enhance`，旧回调与重复回调语义均拒绝 | 不重放结果、不写去重记录或待办；无前台回调不要求强弹提示。 |
| C11 | `refuseSubmit()` → `enhance.closed.no_submit`，含 `Promise.all` 多请求争用 | 同一装备与共享库存均不锁、不扣、不升级，不创建提交单。 |
| C12 | `refuseLoadRefresh()` → `enhance.closed.load_refresh`，含合法既有等级与历史请求语义旧档 | 合法已有资产 / 等级原样保留，不清空、不修复、不恢复待执行强化。 |

`src/EnhanceClosed.ts` 唯一 import 为 `@xt/balance/strings_zh.json`。八个零参数只读 API 恒返回 `{ allowed:false, tipKey, text }`；不接收 Progress 或写入意图，无 enhance 表结算、服务、请求或存档依赖。`src/EnhanceOpenFlag.ts` 的正式函数 `isEnhanceOpenForFixture()` 恒返回 false；未建立 EnhanceGate、开态结算或开态夹具。

强化与打造互不串门：强化八 API 只用 `enhance.closed.*`，附灵 / 分解只用 `enhance.closed.later_service`；打造既有 `ForgeClosed` 仍返回 `forge.closed.*`，`ForgeGate.laterService` 仍用 `forge.closed.later_service`。`ForgeOpenFlag.ts` 与 Forge 路径均保持写前字节，其既有状态不授权强化。全量 enhance / 强化 / EnhanceClosed / EnhanceOpenFlag 搜索作为无前台可执行接线证据归档，GameScene 原字节保持。

装备实例、等级 / 属性、历史请求 / 去重 / 队列等仅登记在测试字段 `__enhanceClosedSemanticFixture` 中，用于表达 C 表输入语义，不代表已登记正式强化存档 schema 或已有业务消费者。正式 Progress 不登记该字段；真实 `restore(false)` 仅恢复正式字段，测试显式验证未知测试字段不在正式恢复结果中，再重附原始历史语义继续验证拒绝。JSON 重读完整保留测试原文；不能据此宣称正式读档已支持强化业务记录。自动化仅覆盖 §4.2 可执行部分，不能替代浏览器实机抽检或执法堂勾选 C 表；本窗不运行 §4.3 的开态 O 表。

## strings 与保护旁证

共享根 `/workspace/xiantu/balance/strings_zh.json` 未写。调用方已在接线前将共享既有增强文案同步到 wt/dev 与 game 快照；本窗以三根现有同字节为写前基线，不手改任何文案。三根均为 936 键，SHA-256 均为 `92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab`。

`slice(928)` 恰为 enhance 八键，文案逐字且每句 Unicode≤40；forge 八键仍在 `slice(920,928)`。剥离 enhance 八行还原 928 键完整字节 SHA `fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967`。三根 forge 行块规范化哈希维持写前 `fa6451ac7be94a0e`，forge 八键值及既有行块字节不动。

写前证据为 `qa/out_v06p1_enhance_closed/protected-before-key.json`、`source-before.json`（145 项）与 `data-files-before.json`（428 项）；写后以同目录 `protected-after-key.json`、`boundary-check.log` 为准。下表值来自本窗前后证据；目前 boundary-check 记录零差异，正式交付前应再核一次。

| 文件 | 写前 SHA-256 | 写后 SHA-256 |
|---|---|---|
| `src/ForgeOpenFlag.ts` | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` |
| `src/ForgeClosed.ts` | `f7e4216be7767f481c96ae7f1dc5796574fe9b231ada91d57a137c1dc8a8c90c` | `f7e4216be7767f481c96ae7f1dc5796574fe9b231ada91d57a137c1dc8a8c90c` |
| `src/ForgeGate.ts` | `44f556147408019188da0cd793076993491653d62e7e9996c67a20303ecbee86` | `44f556147408019188da0cd793076993491653d62e7e9996c67a20303ecbee86` |
| `src/Progress.ts` | `24472642b862963303e2f148d51cb755a4cbf75009358055085a8dab87de263d` | `24472642b862963303e2f148d51cb755a4cbf75009358055085a8dab87de263d` |
| `src/scenes/GameScene.ts` | `294b934b52a8b6537214360fffb93497643ce8261bea03aba8caf405cf5fcedf` | `294b934b52a8b6537214360fffb93497643ce8261bea03aba8caf405cf5fcedf` |
| `src/data.ts` | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` |
| `src/features.ts` | `ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130` | `ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130` |
| `balance/enhance.json（三根）` | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` |
| `balance/recipes.json（三根）` | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` |
| `balance/life_skills.json（三根）` | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` |
| `balance/npcs.json（三根）` | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| `balance/quests.json（三根）` | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| `balance/market_consign.json（三根）` | `e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde` | `e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde` |
| `features.json（wt/game）` | `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8` | `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8` |
| `features.json（shared）` | 缺席（null） | 缺席（null） |
| `balance/strings_zh.json（三根）` | `92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab` | `92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab` |

`recipes.json` 三根写前均已是正式配方 SHA `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f`；不能套用前一棒较旧 game 快照值。enhance / recipes / life_skills / npcs / quests / features / phase / market_consign 等保护文件不因本窗变化。smith_ou 无 services、quests=[]，GAME_PHASE=5，gifts 10×false。禁 gifts / #20 gathering / 阵法 / 拍卖 / 坊市混窗。

回归只同步 strings SHA / 936 键 / 尾键区间，并向既有源码 allowlist 精确追加 `EnhanceClosed.ts` 与 `EnhanceOpenFlag.ts`；不削弱零副作用或玩法断言。旧 forge / market 回归中的 game recipes SHA 预期已落后于本窗写前正式 1be6 状态：该两行预期修正的额外授权与最终处理结果须由主代理在此补实，未取得授权不得改测试或 recipes。

## 自检命令结果

已完成的真实结果（截至本草稿更新；最终汇总待 `__VALIDATION__`）：

| 命令 | 结果与本窗日志 |
|---|---|
| `npx tsc --noEmit` | exit 0；`tsc.log` |
| `npm run test:v06p1-enhance-closed` | exit 0，30625 断言，90 组语义夹具，7560 次真实 API 调用，shared/snapshot 与 fresh SSR 共 4 张模块图，localStorage 写入 0、哨兵调用 0；`v06p1-enhance-closed.log` / `v06p1-enhance-closed-evidence.json` |
| `npm run test:v06p1-forge-closed` | 当前未通过：被 game recipes 已过时 SHA 预期阻断；两行窄修补中的本项待用户额外授权，`v06p1-forge-closed.log` |
| `npm run test:v06p1-market-closed` | 当前未通过：被 game recipes 已过时 SHA 预期阻断；两行窄修补中的本项待用户额外授权，`v06p1-market-closed.log` |
| `npm run test:v06d-closed` | exit 0，15052 断言；`v06d-closed.log` |
| `npm run test:v06c-closed` | exit 0，10708 断言；`v06c-closed.log` |
| `npm run test:v06d-open` | exit 0，3014 断言；`v06d-open.log`，只回归既有流程，不授权强化开态 |
| 共享根 datalint | exit 0；`datalint-shared.log` |
| wt/dev/data datalint | exit 0；`datalint-snapshot.log` |

__VALIDATION__

强化自检累计断言：`__ASSERTIONS__`。结果必须从真实运行日志填入，不能用本草稿的行为表代替通过证据。必跑项为 `npx tsc --noEmit`、`npm run test:v06p1-enhance-closed`、`npm run test:v06p1-forge-closed`、`npm run test:v06p1-market-closed`、`npm run test:v06d-closed`、`npm run test:v06c-closed`，以及共享根与 wt/dev/data 各一轮 `PYTHONDONTWRITEBYTECODE=1 python3 /workspace/xiantu/qa/tools/datalint.py`。日志保存在 `qa/out_v06p1_enhance_closed/*.log`。

专项脚本使用 package.json 的 `timeout 120s node scripts/v06p1-enhance-closed-test.mjs`。运行时以 Vite SSR 加载真实 EnhanceClosed / EnhanceOpenFlag，反复调用八 API，包含连点与 Promise.all，并比对调用前后 inventory、stones、exportSave 与完整 clone。persistSoon / save / addItem / removeItem 等设抛错哨兵，localStorage set / remove / clear 统计写入；具体轮次、零增量与哨兵 0 次应以专项证据为准。

## 工作区与下一棒

- 实现与测试在 wt/dev 提交；正式报告 / RESULT / status 同步 UTF-8 到项目根同路径副本。只暂存本窗授权文件；pending art、dist-test、既有旧 qa/out_* 与 talisman 审计保留原位，不混入提交，不操作 game 索引。
- 交付以普通 `git push origin dev` 完成，禁止 force。实现 tip 为 `__IMPLEMENTATION_TIP__`；最终文档 tip 与 `origin/dev` HEAD 见交付回执。共享 strings 根不写，三根 enhance.json 与 ForgeOpenFlag 维持写前 SHA。
- 下一棒为执法堂：按 `/workspace/xiantu/design/26_v06_P1③++_关态_强化一期.md` §4.2 C01–C12，对照实现 tip 抽检八类实际提示、资源 / 等级 / 属性 / 请求 / 去重 / 队列零增量、旧档保留、独立 Flag=false、三根 strings 与无前台可执行强化接线，另留提示与状态证据。本报告不代执法 PASS，不代勾设计 C 表。
- 前台强化服务、装备实例与护器符映射、真实结算 / 原子提交 / 存档去重、开态夹具 / soft-open / release 均需经理另令。本窗不开态、不软开、不发布，PASS≠发版，禁混窗。
