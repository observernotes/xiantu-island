# v0.6 · P1③++ 强化一期关态交接

更新时间：2026-10-17（Asia/Shanghai）。工作目录：`/workspace/xiantu/wt/dev`；分支：`dev`；命令 stdin 为 `/dev/null`。

- 写前基线：`d80ebb5c30fa3fe7b375a07842c6feb42d879c05`；提交前以 fetch / ff-only 核对包含该基线并与 `origin/dev` 对齐。
- 实现与自检 tip：`64c26a4d692d0edbd8e211c9f4de87334c3125e4`（`feat(v0.6-p1): enhance closed tip APIs`）；本报告与 status 随后一笔文档提交，最终文档 tip 以交付回执及 `origin/dev` 为准。
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

装备实例、等级 / 属性、历史请求 / 去重 / 队列等仅登记在测试字段 `__enhanceClosedSemanticFixture` 中，用于表达 C 表输入语义，不代表已登记正式强化存档 schema 或已有业务消费者。正式 Progress 不登记该字段；真实 `restore(false)` 仅恢复正式字段，测试显式验证未知测试字段不在正式恢复结果中，再重附原始历史语义继续验证拒绝。自动化仅覆盖 §4.2 可执行部分，不能替代浏览器实机抽检或执法堂勾选 C 表；本窗不运行 §4.3 的开态 O 表。

## strings 与保护旁证

共享根 `/workspace/xiantu/balance/strings_zh.json` 未写。调用方在接线前将共享既有 enhance 八键同步到 wt/dev 与 game 快照；三根均为 936 键，SHA-256 均为 `92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab`。

`slice(928)` 恰为 enhance 八键，文案逐字且每句 Unicode≤40；forge 八键仍在 `slice(920,928)`。剥离 enhance 八行还原 928 键完整字节 SHA `fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967`。三根 forge 行块规范化哈希维持写前 `fa6451ac7be94a0e`，forge 八键值及既有行块字节不动。

写前证据为 `qa/out_v06p1_enhance_closed/protected-before-key.json`、`source-before.json` 与 `data-files-before.json`；写后以同目录 `protected-after-key.json`、`boundary-check.log` 为准。仅新增 `EnhanceClosed.ts` / `EnhanceOpenFlag.ts` 与本窗测试 / 证据；`ForgeOpenFlag.ts` SHA `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e`、三根 `enhance.json` SHA `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954`、GameScene / ForgeClosed / ForgeGate 原字节保持。

为让 forge/market 关态回归接受已同步为正式配方 SHA 的 `game:balance/recipes.json`，本窗对两脚本 `formalRecipeKeys` 精确追加 `game:balance/recipes.json`（见 `qa/out_v06p1_enhance_closed/recipes-expectation-applied.patch`）；不改 recipes 字节、不削弱玩法断言。

## 自检命令结果

| 命令 | 结果与日志（均位于 qa/out_v06p1_enhance_closed） |
|---|---|
| `npx tsc --noEmit` | exit 0；`tsc.log` |
| `npm run test:v06p1-enhance-closed` | exit 0，30625 断言、90 组语义状态、7560 次 API 调用、存储写入 0；`v06p1-enhance-closed.log` / `v06p1-enhance-closed-evidence.json` |
| `npm run test:v06p1-forge-closed` | exit 0，20334 断言；`v06p1-forge-closed.log` |
| `npm run test:v06p1-market-closed` | exit 0，24152 断言；`v06p1-market-closed.log` |
| `npm run test:v06d-closed` | exit 0，15052 断言；`v06d-closed.log` |
| `npm run test:v06c-closed` | exit 0，10708 断言；`v06c-closed.log` |
| 共享根 datalint | exit 0，问题 0 条；`datalint-shared.log` |
| wt/dev/data datalint | exit 0，问题 0 条；`datalint-snapshot.log` |

专项命令由 package.json 的 `timeout 120s node scripts/v06p1-enhance-closed-test.mjs` 执行。shared/snapshot 各使用真实 Vite SSR 模块及刷新后新 SSR 图，加载真实 EnhanceClosed、EnhanceOpenFlag、Progress/exportSave 与 restore(false)。persistSoon/save/事务/加减物等写成抛错哨兵，调用次数 0；拒绝前后 inventory、stones、完整 clone、exportSave 序列化字节零增量。localStorage 写入 0。互不串门：Enhance tipKey 仅 enhance.closed.*；ForgeClosed 仍返回 forge.closed.*。

## 工作区与下一棒

- `/workspace/xiantu` 不是 Git 仓库；wt/dev 与 `/workspace/xiantu/game` 是同一仓库的不同 worktree。报告/status 在 wt/dev 可追踪路径提交，并向项目根同路径覆盖写 UTF-8 同内容副本；game 仅同步指定 strings 文件到磁盘，未操作其 master 索引。
- 实现 tip `64c26a4d692d0edbd8e211c9f4de87334c3125e4` 已普通提交；本报告与 status 随文档 tip 归档，以普通 `git push origin dev` 交付。仅暂存本窗授权文件；pending art、dist-test、旧 qa/out_* 与 talisman 审计原位保留。共享 strings 不写，不新增 EnhanceGate、不开态夹具、不 soft-open、不 release。
- 下一棒为执法堂：推送后请按 design/26 §4.2 C01–C12 对照实现 tip，抽检八 API 提示、零资产/等级/属性/消耗/请求增量、旧档保留、三根 strings SHA、ForgeOpenFlag/enhance.json 未变、无前台强化接线，并另留实际提示和前后状态证据。本报告不代执法 PASS。
- 将来前台入口、EnhanceGate 开态结算、护器符合法映射、存档去重与 soft-open/release 均需经理另令；本交付不开态、不软开、不发布，禁混窗。PASS≠发版。
