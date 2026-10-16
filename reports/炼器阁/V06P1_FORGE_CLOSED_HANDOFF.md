# v0.6 · P1③ 炼器一期关态交接

更新时间：2026-10-17（Asia/Shanghai）。工作目录：`/workspace/xiantu/wt/dev`；分支：`dev`；命令 stdin 为 `/dev/null`。

- 写前基线：`b0cb745f581b1aa4ac73d4006f4217710d3d3dda`，写前核对并 fetch，与 `origin/dev` 对齐。
- 实现与自检 tip：`6e94f87b60b0fb6f6c6540a97000f2badabad10b`（`feat(v0.6-p1): forge closed tip APIs`）；本报告与 status 随后一笔文档提交，最终文档 tip 以交付回执及 `origin/dev` 为准。
- 依据：`/workspace/xiantu/design/24_v06_P1③关态_炼器一期.md` §3、§4.2 C01–C12、§6；实现范式为 MarketClosed/TowerClosed 的零参数 API，自检参考 `203cd42` 关态纯净版。
- **本窗只交炼器关态 tip：不开态、不软开、不 release、不 force-push；不挂 smith_ou.services，不接前台可执行打造，gifts 10×false，GAME_PHASE=5。**

## 行为表与接线

| 编号 | 自动化结果与提示 | 保持的边界 |
|---|---|---|
| C01 | `featureClosed()` → `forge.closed.feature`，可反复读取 | 不注册服务、不创建请求或可执行打造流程；未声称执行关闭窗口的实机操作。 |
| C02 | `refuseEntrance()` → `forge.closed.entrance` | smith_ou 保持原 dialog、quests=[]、无 services；不修改 NPC 或对象。 |
| C03 | `refuseCraft()` → `forge.closed.craft`，合法齐备语义与连点均拒绝 | 图纸材料、成品、品质、forging 经验/等级、请求/去重记录及队列零增量。 |
| C04 | `refuseSubmit()` → `forge.closed.no_submit`，合法提交语义仍拒绝 | 不提交、不预扣、不预留或锁定库存、不写请求单。 |
| C05 | `refuseSubmit()` → `forge.closed.no_submit`，缺料、非法引用/数量及缺映射语义均拒绝 | 不补配方、不先扣后返、不猜默认放行。 |
| C06 | `refuseResult()` → `forge.closed.no_result`，成品、补发及满包语义均拒绝 | 不生成、发放、补发、掉地或邮寄成品，不留延后队列。 |
| C07 | `refuseGrade()` → `forge.closed.no_grade`，含未知品质语义 | 不抽取、展示或写入本次品质；合法既有成品品质不变。 |
| C08 | `refuseLoadRefresh()` → `forge.closed.load_refresh`；真实 restore(false)、JSON 重读及新 SSR 图后仍拒绝 | 不补做、不扣料、不补经验、不重抽或发物；localStorage 写入 0。 |
| C09 | `refuseLaterService()` → `forge.closed.later_service` | 强化、附灵、分解只提示，不借炼器放行其他消耗或装备改写。 |
| C10 | `refuseCraft()` → `forge.closed.craft`，旧回调及重复回调语义全部拒绝 | 不创建结果、去重记录或关态后待执行任务。 |
| C11 | `refuseSubmit()` → `forge.closed.no_submit`，`Promise.all` 多请求争用全部拒绝 | 不扣料、不预占/锁定同份库存，forging 经验/等级不动。 |
| C12 | `refuseLoadRefresh()` → `forge.closed.load_refresh`，含既有品质、历史请求/队列语义旧档 | 合法历史资产与原始信息保留；不修档、不清空、不恢复待执行打造。 |

`src/ForgeClosed.ts` 只导入 `@xt/balance/strings_zh.json`。八个导出 API 均为零参数，恒返回 `{ allowed:false, tipKey, text }`，不接收 Progress 或写入意图；没有配方、存档或服务依赖。全量检索 forge/打造/ForgeClosed/smith_ou 的源文件结果留在 `qa/out_v06p1_forge_closed/source-search.json` 与 `forge-search.log`；未增加正式消费者，GameScene 字节保持，不存在前台可执行打造。

八类合法、异常及历史状态仅作为 `__closedForgeLegacyFixture` 测试字段存在，不扩展正式 Progress schema，不臆造正式图纸、材料、配方或产物映射。真实 Progress.restore 仅恢复正式字段，测试显式重附原始历史语义后继续验证拒绝；这不表示已有打造请求存档消费者。满包、承载拒绝和未知品质也仅为测试语义。自动化覆盖 §4.2 可执行部分，未代执法堂勾选设计 C 表，未做浏览器实机抽检。

## strings 同步与 SHA-256 旁证

共享根 `/workspace/xiantu/balance/strings_zh.json` 保持未写。wt/dev 的 `data/balance/strings_zh.json` 与 `/workspace/xiantu/game/data/balance/strings_zh.json` 只同步共享已有的 forge 八键：原末项加逗号、按原缩进追加，既有键值字节不动。三根最终 928 键、同字节，SHA-256 均为 `fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967`。

末尾 `slice(920)` 恰为 forge 八键，文案逐字且每句 Unicode≤40；原 market 八键保持 `slice(912,920)`。剥离 forge 八行还原原 920 键完整字节 SHA `c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27`，再剥 market 八行还原 912 键 SHA `6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f`。market/6c/6d 回归的 strings SHA、键数及尾键区间随新增文案更新；既有玩法断言和 market 软开 preamble 保持。

写前/写后旁证为 `qa/out_v06p1_forge_closed/protected-before.json`、`protected-after.json` 与 `boundary-check.log`。基线共 318 项，包含 311 个文件/缺席状态及 7 项元数据；仅 wt/game 两份 strings 快照变化，其余保护字节零变化。补充的 `source-before.json` 保护全部 140 份既有源码完整字节，`data-files-before.json` 保护三根 balance/maps 文件集合；只新增 ForgeClosed.ts。既有忽略目录 `src/gen` 保留原位，不作为正式源码验收依赖。

| 文件 | 写前 SHA-256 | 写后 SHA-256 |
|---|---|---|
| `balance/shops.json`（三根） | `4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2` | `4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2` |
| `balance/npcs.json`（三根） | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| `balance/solo_pacing.json`（三根） | `cf4aabe15efcdec8b4d1e4448b931a1cf31b970c0fa175fd6e339d12ca59da3f` | `cf4aabe15efcdec8b4d1e4448b931a1cf31b970c0fa175fd6e339d12ca59da3f` |
| `balance/tower_floors.json`（三根） | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6` | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6` |
| `balance/titles.json`（三根） | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c` | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c` |
| `balance/secret_boons.json`（三根） | `2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f` | `2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f` |
| `balance/secret_events.json`（三根） | `41afdfd17ba787c8a5824c63279ec1d555f03188e8c269be3693e4cde2f15d37` | `41afdfd17ba787c8a5824c63279ec1d555f03188e8c269be3693e4cde2f15d37` |
| `balance/secret_loot.json`（三根） | `047784fe3ee5411faa5c237ebfffbb3508c8c90fcc513882cc362540b442c210` | `047784fe3ee5411faa5c237ebfffbb3508c8c90fcc513882cc362540b442c210` |
| `balance/secret_rooms.json`（shared） | `42eab7d3c19e48636e4352e7de871680c588c11e6228c82ad2c0a4cb3b6b7bb3` | `42eab7d3c19e48636e4352e7de871680c588c11e6228c82ad2c0a4cb3b6b7bb3` |
| `balance/secret_rooms.json`（wt/game） | `edae1c2f99837624616c2f498d54d87373abef410772191f4b9b0d582ff510d4` | `edae1c2f99837624616c2f498d54d87373abef410772191f4b9b0d582ff510d4` |
| `balance/companions.json`（三根） | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `balance/fly_zones.json`（三根） | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| `balance/quests.json`（三根） | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| `balance/life_skills.json`（三根） | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` |
| `balance/enhance.json`（三根） | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` |
| `balance/market_consign.json`（三根） | `e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde` | `e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde` |
| `features.json`（wt/game） | `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8` | `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8` |
| `features.json`（shared） | 缺席（null） | 缺席（null） |
| `balance/strings_zh.json`（shared） | `fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967` | `fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967` |
| `balance/strings_zh.json`（wt/game） | `c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27` | `fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967` |
| `src/scenes/GameScene.ts` | `1279682ae18633aec1c0032d5a30d484f2e6de05deba34c2c80a9a423a203047` | `1279682ae18633aec1c0032d5a30d484f2e6de05deba34c2c80a9a423a203047` |
| `src/Progress.ts` | `3e1f4a258b384d5f0d1a2967d0228fcd792cb9a58979efcd5648d9baf9f2e7da` | `3e1f4a258b384d5f0d1a2967d0228fcd792cb9a58979efcd5648d9baf9f2e7da` |
| `src/ShopPanel.ts` | `419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c` | `419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c` |

secret_rooms 的共享根与 wt/game 原本不同，分别守护而未做全表同步。GAME_PHASE 定义于既有 `src/data.ts`，运行时保持 5；`src/features.ts` 全文保护，未新增炼器开态字段。smith_ou 无 services、quests=[]，NPC 全表及 dialog 未改。坊市既有软开状态、6b/6c/6d 既有状态与本窗分开；market_consign 未改，不把坊市软开解释为炼器授权。禁 gifts/#20 gathering/阵法/拍卖/坊市开态混窗。

## 自检命令结果

| 命令 | 结果与日志（均位于 qa/out_v06p1_forge_closed） |
|---|---|
| `npx tsc --noEmit` | exit 0；`tsc.log` / `tsc.result.json` |
| `npm run test:v06p1-forge-closed` | exit 0，20207 断言、80 组夹具、6720 次真实 API 调用、存储写入 0；`v06p1-forge-closed.log` / `v06p1-forge-closed-evidence.json` |
| `npm run test:v06p1-market-closed` | exit 0，24116 断言；已应用授权的 src 清单单行窄例外；`v06p1-market-closed.log` / `v06p1-market-closed.result.json` / `v06p1-market-closed-evidence.json` |
| `npm run test:v06d-closed` | exit 0，15048 断言；`v06d-closed.log` / `v06d-closed.result.json` |
| `npm run test:v06c-closed` | exit 0，10708 断言；`v06c-closed.log` / `v06c-closed.result.json` |
| `npm run test:v06d-open` | 前一棒已回归 exit 0，3014 断言；保留该次既有正式/内存图结果，不改玩法或开态；`v06d-open.log` / `v06d-open.result.json` |
| 共享根 `PYTHONDONTWRITEBYTECODE=1 python3 /workspace/xiantu/qa/tools/datalint.py` | exit 0，问题 0 条；`datalint-shared.log` / `datalint-shared.result.json` |
| wt/dev/data 同一 datalint 命令 | exit 0，问题 0 条；`datalint-snapshot.log` / `datalint-snapshot.result.json` |

专项命令由 package.json 的 `timeout 120s node scripts/v06p1-forge-closed-test.mjs` 执行。shared/snapshot 各使用真实 Vite SSR 模块及刷新后新 SSR 图，加载真实 ForgeClosed、Progress/exportSave 与 restore(false)。persistSoon/save/事务/加减物/forging 经验/结果/品质/请求/去重/排队入口均设为抛错哨兵，调用次数 0；拒绝前后 inventory、stones、完整 clone、exportSave 序列化字节及 forging 经验/等级均零增量。localStorage set/remove/clear 写入 0，不依赖写后回滚或延后队列。

market 实际脚本除 strings 相关预期外，已按本棒明确授权应用 `qa/out_v06p1_forge_closed/market-source-allowlist-proposal.patch`，仅向既有 src 允许清单追加 `ForgeClosed.ts` 一项；玩法断言及既有软开接线保持。正式 `npm run test:v06p1-market-closed` 已重跑 exit 0、24116 断言，七项必跑检查全部 exit 0，见 `validation-summary.json`。`market-proposal.log` 与 `market-proposal.result.json` 仅保留前一棒临时脚本预演的历史记录，以本棒正式命令结果验收。market 自检默认输出的证据另复制至本窗 `v06p1-market-closed-evidence.json`，旧窗已跟踪证据恢复原字节。

## 工作区与下一棒

- `/workspace/xiantu` 不是 Git 仓库；wt/dev 与 `/workspace/xiantu/game` 是同一仓库的不同 worktree。报告/status 在 wt/dev 可追踪路径提交，并向项目根同路径覆盖写 UTF-8 同内容副本；game 只同步指定 strings 文件，未操作其索引或其他脏文件。
- 实现及自检已提交至上述实现 tip；本报告、status 与提交信息随文档提交归档，以普通 `git push origin dev` 交付，最终文档 tip 及推送状态见交付回执和 `origin/dev`。仅暂存本窗授权文件；pending art、dist-test、既有 src/gen 缓存、旧 qa/out_* 与 talisman 审计原位保留。未暂存 game worktree。共享 strings 不写，不新增 ForgeGate/OpenFlag、配方表、services 或可执行打造。
- 下一棒为执法堂：实现提交推送后，请按 design/24 §4.2 C01–C12 对照实现 tip，抽检八 API 的提示、零资产/品质/经验/请求/队列增量、旧档保留、三根 strings SHA 与无前台打造接线，并另留实际提示和前后状态证据。本报告不代执法 PASS，设计表仍由执法抽检后处理。
- 将来前台入口、图纸/配方/产物映射、原子提交、存档去重与开态/软开/release 均需经理另令；本交付不开态、不软开、不发布，禁混窗。
