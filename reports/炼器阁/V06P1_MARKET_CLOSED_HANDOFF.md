# v0.6 · P1② 坊市寄售关态交接

更新时间：2026-10-17 03:48:28 CST。工作目录：`/workspace/xiantu/wt/dev`；分支：`dev`。

- 写前基线：`8ea3466f89fecfc39a8eca1f9888d27d72aa669d`，fetch 后与 `origin/dev` 对齐。
- 实现与自检 tip：`203cd42234a0baaefa3f24f0369a814c750eed5f`；本报告与 status 随后一笔文档提交，最终 tip 以交付回执及 `origin/dev` 为准。
- 依据：`/workspace/xiantu/design/23_v06_P1②关态_坊市寄售.md` §3、§4.2 C01–C12、§6；范式为 TowerClosed、SecretNestClosed 与 V06D_CLOSED_HANDOFF。
- **本窗只交寄售关态 tip：不开态、不软开、不 release、不 force-push。shops 仍为 NPC 商店，gifts 10×false，GAME_PHASE=5。**

## 行为表与接线

| 编号 | 自动化结果与提示 | 保持的边界 |
|---|---|---|
| C01 | `featureClosed()` → `market.closed.feature`，重复读取一致 | 无前台寄售 UI，不建地图对象、NPC、坐标或服务；未声称执行关闭窗口的实机操作。 |
| C02 | `refuseList()` → `market.closed.list`，首次/重复请求均拒绝 | 不扣物、不扣费、不占栏、不建单、不排队。 |
| C03 | `refuseSlotOrItem()` → `market.closed.slot_or_item` | 只读异常说明，不为校验扣押或建单，不推断未知品类可寄售。 |
| C04 | `refuseWithdraw()` → `market.closed.withdraw` | listed、withdrawn、已成交及无单夹具均不返物、不解除扣押、不回滚成交。 |
| C05 | `refuseClaim()` → `market.closed.claim` | sold_pending_claim 与重复确认均不发收益、不清待领、不写 claimed 或收据。 |
| C06 | `refuseReward()` → `market.closed.no_reward` | 无待领、claimed 及历史收据均保留原状，不补发、不重领。 |
| C07 | `refuseDeal()` → `market.closed.no_deal` | 系统/离线语义与重放均不成交、不生成收益或收据，不接离线结算。 |
| C08 | 撤回/领取 API 在满包与收益承载拒绝语义夹具下仍拒绝 | 不调用 addItem/removeItem 等写入口；不掉地、不补偿、不安排延后。 |
| C09 | `Promise.all` 重放撤回/成交及重复上架/领取，每个分支拒绝 | 单据、扣押物、待领项、收据与资产完整 clone 零增量。 |
| C10 | `refuseLoadRefresh()` → `market.closed.load_refresh`；真实无持久化 restore、JSON 重读及新 SSR 图后重试均拒绝 | 不借读档/刷新返物、成交、补领或写存储。 |
| C11 | 未知状态、丢引用、非法收益、同物双归属夹具均保留原记录 | 不猜空单、不清空、不修档、不补账；操作仍按对应 API 提示。 |
| C12 | 三根固定 SHA/文件集合与真实模块复核通过 | shops/禁改表/既有源码/地图不变；无拍卖、无寄售开态字段或新入口。 |

`src/MarketClosed.ts` 只导入 `@xt/balance/strings_zh.json`。八个导出 API 均为零参数，恒返回 `{ allowed:false, tipKey, text }`；没有 Progress、写入意图、寄售表、存档结构或服务依赖。全量搜索 consign/listing/寄售/Market 未发现正式消费者或寄售 stub，故只交 API 与自检，GameScene 未接线，未创造可执行寄售流程。

11 种历史/异常状态只在 `__closedMarketLegacyFixture` 测试字段中存在，不扩展正式 schema。真实 Progress.restore 仅恢复正式字段，测试随后显式重附原始夹具再验证拒绝；这不表示已经实现寄售存档恢复。C08 满包/承载失败也仅为测试语义，不臆造正式背包容量或收益承载规则。自动化覆盖 §4.2 可执行部分，未代执法堂勾选设计表、未做浏览器实机抽检。

## strings 同步与 SHA-256 旁证

共享 strings 未写；wt/data 与 game/data 只同步共享已存在的 market 八键，保留原末项加逗号及原缩进追加。三根最终 920 键、同字节，SHA-256 均为 `c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27`。八键文案逐字一致且每句 ≤40 字；剥离 market 八行还原原 912 键 SHA `6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f`，再剥 tower 八行还原原 904 键 SHA `4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385`，原 904 键语义 SHA 也通过。6c/6d 回归仅修补 strings SHA、键数与尾键区间，玩法断言保留。

写前/写后：`qa/out_v06p1_market_closed/protected-before.json`、`protected-after.json`、`boundary-check.log`；共 977 个文件/缺席状态，除两份授权 strings 快照外，其余保护字节零变化。既有全部 src 与三根地图、balance 文件集合也有守护。固定写前基线是新测试必需输入，随 tip 入仓；写后旁证、专项 evidence 与命令结果一并入仓，命令原始日志留在同目录工作区。

| 文件 | 写前 SHA-256 | 写后 SHA-256 |
|---|---|---|
| `balance/shops.json`（三根） | `4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2` | `4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2` |
| `balance/npcs.json`（三根） | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| `balance/solo_pacing.json`（三根） | `cf4aabe15efcdec8b4d1e4448b931a1cf31b970c0fa175fd6e339d12ca59da3f` | `cf4aabe15efcdec8b4d1e4448b931a1cf31b970c0fa175fd6e339d12ca59da3f` |
| `balance/tower_floors.json`（三根） | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6` | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6` |
| `balance/titles.json`（三根） | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c` | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c` |
| `balance/companions.json`（三根） | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `balance/fly_zones.json`（三根） | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| `balance/quests.json`（三根） | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| `balance/secret_boons.json`（三根） | `2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f` | `2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f` |
| `balance/secret_events.json`（三根） | `41afdfd17ba787c8a5824c63279ec1d555f03188e8c269be3693e4cde2f15d37` | `41afdfd17ba787c8a5824c63279ec1d555f03188e8c269be3693e4cde2f15d37` |
| `balance/secret_loot.json`（三根） | `047784fe3ee5411faa5c237ebfffbb3508c8c90fcc513882cc362540b442c210` | `047784fe3ee5411faa5c237ebfffbb3508c8c90fcc513882cc362540b442c210` |
| `secret_rooms（shared）` | `42eab7d3c19e48636e4352e7de871680c588c11e6228c82ad2c0a4cb3b6b7bb3` | `42eab7d3c19e48636e4352e7de871680c588c11e6228c82ad2c0a4cb3b6b7bb3` |
| `secret_rooms（wt/game）` | `edae1c2f99837624616c2f498d54d87373abef410772191f4b9b0d582ff510d4` | `edae1c2f99837624616c2f498d54d87373abef410772191f4b9b0d582ff510d4` |
| `features（wt/game）` | `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8` | `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8` |
| `strings（shared）` | `c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27` | `c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27` |
| `strings（wt/game）` | `6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f` | `c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27` |
| `GameScene.ts` | `2b3ffc4e33a80ee1571210a37490d4603a1cfba3c3a97a677e6899675d46ec10` | `2b3ffc4e33a80ee1571210a37490d4603a1cfba3c3a97a677e6899675d46ec10` |
| `Progress.ts` | `3ca4967394c7b3a5cceaf0afdf4f4b7ce66450e49c639323e6645d33c536238d` | `3ca4967394c7b3a5cceaf0afdf4f4b7ce66450e49c639323e6645d33c536238d` |
| `ShopPanel.ts` | `419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c` | `419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c` |

secret_rooms 的共享根与 wt/game 原本不同，逐根保持，未做全表同步。外部写前旁证中 shared:features.json 误标为快照 SHA；现场 `/workspace/xiantu/features.json` 不存在，按本令允许现场重算，在本仓 before/after 记 null 并留 baseline_notes，外部原件未改。`src/features.ts` 固定读取当前工程快照，wt/game features SHA 仍按原值保护。

演武另窗的 `balance/market_consign.json` 与 design/23 没有写入、删除或接线；测试不读取这张表，不能以其存在或 enabled=false/未来字段放行任何寄售写操作。#20 gathering、阵法、炼器一期及 6b/6c/6d 开态均未混入；不改变既有正式开态状态。

## 自检命令结果

| 命令 | 结果与日志（均位于 qa/out_v06p1_market_closed） |
|---|---|
| `npx tsc --noEmit` | exit 0；`tsc.log` |
| `npm run test:v06p1-market-closed` | exit 0，24065 断言、110 组夹具、7920 次真实 API 调用、存储写入 0；`v06p1-market-closed.log` |
| `npm run test:v06d-closed` | exit 0，15043 断言；`v06d-closed.log` |
| `npm run test:v06c-closed` | exit 0，10707 断言；`v06c-closed.log` |
| `npm run test:shop` | exit 0，596 断言；`shop.log` |
| 共享根 `PYTHONDONTWRITEBYTECODE=1 python3 /workspace/xiantu/qa/tools/datalint.py` | exit 0，问题 0；`datalint-shared.log` |
| wt/dev/data 同一 datalint 命令 | exit 0，问题 0；`datalint-snapshot.log` |
| `git diff --check` / 暂存允许清单检查 | exit 0；`diff-check.log` / `staged-files.log` |

专项在 shared/snapshot 两数据根各运行原始图与新 SSR 图，使用真实 MarketClosed、Progress/exportSave、restore(false)；persistSoon/save/saveAsync/事务/加减物/收益等入口均为抛错哨兵，拒绝前后 inventory、stones、完整 clone、exportSave 及内存存档原文零增量。localStorage 的 set/remove/clear 写入均为 0；没有写后回滚或延后队列。

## 工作区与下一棒

- `/workspace/xiantu` 不是 Git 仓库；wt/dev 与 game 是同一仓库的不同 worktree。报告/status 在 wt/dev 可追踪路径提交，并向项目根同路径写 UTF-8 副本；game strings 指定快照只同步文件，不动主工作树索引或其他脏文件。
- 本窗仅暂存允许文件；pending art、dist-test、旧 qa/out_*、talisman 审计及主工作树其他窗口产物均原位保留。
- 关态 tip 已交执法堂：请按 design/23 §4.2 C01–C12 对照本 tip，复核八 API、零增量、三根 SHA 与无前台入口证据，另留实际提示及前后状态证据。设计抽检表仍未勾选，本报告不代执法 PASS。
- 程序自检无阻断；将来 UI、正式寄售 schema、成交/离线结算及开态/软开需另令确认。本窗禁开态，不发布。
