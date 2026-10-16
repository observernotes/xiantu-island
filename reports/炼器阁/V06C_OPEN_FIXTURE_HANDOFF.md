# v0.6 · 6c 万妖巢穴开态 fixture 交接

更新时间：2026-10-17 00:56:43 UTC+8；工作目录 `/workspace/xiantu/wt/dev`。

- TIP_SHA（实现、自检及开态抽检对象）：`fa7102fe1c8ce6d44e7701d3126aacbfae6e24fb`。
- 基线：`ec0575607fc04faec2eb670ef391c9fbd014a249`，开工已执行 `git fetch origin && git pull --ff-only origin dev`；包含关态实现 `0187b19e8ef89ff83fe2528b8c0c93277cccda16`。
- 关态 tip@0187b19 执法堂已 PASS，旁证 `/workspace/xiantu/qa/out_v06c_closed_0187b19/`；本轮保留其正式关态行为并重新跑绿原套件。
- 实现已普通推送至 `origin/dev`，随后仅追加本报告和状态页的文档提交；最终分支 tip 以 `git rev-parse origin/dev` 为准。
- Blocker：无。请执法堂对实现 TIP_SHA 做开态抽检；本报告为程序自检，不代替执法堂开态 PASS。

## 内存双开与产品最小路径

依据经理令、design/11 §6–§7.2 及 design/21 的正式关态对照；本刀只做到门禁级最小进巢与退出。

`scripts/v06c-open-test.mjs` 对 shared、snapshot 分别建立两个独立 Vite SSR 图：正式关态图完全不注入 quests；开态图将 `@xt/balance/quests.json` 替换成 JSON 深克隆，只将唯一 intro 的 `enabled` 改为 true、`phase` 改为 5。后者只为适配当前 `GAME_PHASE=5` 的任务可见性；全局 GAME_PHASE 不变，正式条目仍为 `phase:6/enabled:false`。反向还原这两个字段后与正式表逐项相等；从未伪改运行时 QUESTS，也没有写盘、sync 或 snapshot。

| 路径 | 本轮实现与覆盖 |
|---|---|
| 接取与交付 | `QuestSystem.npcQuestIds` 按开关和任务 giver/turnIn 补入口，GameScene 复用现有任务菜单。雷猎户普通交互在 q_main_06 active/done 两态均可选择 intro；真实 offer/complete 对话回调走 accept、异步 turnIn。rewards={}，没有修为、灵石或物品增量。任务目标显示“阅读巢穴路牌”。 |
| 路牌 | 点击和 Z/↑ 共用开关分支。开态展示既有 sign_a/b/c 三句，可反复阅读；仅 active intro 调用 `quests.onReach('secret_nest_sign')`，重读不重复写进度。关态仍展示原 sign_readable，不派发 reach。 |
| 入口门禁 | `SecretNestGate.enterSecretNest` 先读导入 JSON 开关，再检查 intro done、境界至少 foundation 及正式任务 reqLevel。未接取、已读未交付、等级不足、境界不足或未知境界均拒绝；高于筑基仍可进入。不要求 q_main_06 done。 |
| 最小进巢 | 当前 GameScene 内创建独立“万妖巢穴·入口石室”全屏单房占位容器；有石室、玩家位置标记与出口。占位只存在于 Scene 内存，营地地图不替换；不注册假 portal/目标地图，不建 runId 或种子。房内暂停物理与 Phaser 计时器，update 直接返回，不更新营地、战斗、寿元或任务。 |
| 退出 | 点击出口或 Z/↑/Esc 回到正式地图 `secret_nest_return`（缺席时用营地 spawn）；清除占位容器、房间状态和输入残留，恢复本房拥有的暂停。营地原先已暂停则保持原状态；SHUTDOWN 清理占位与暂停所有权。进出不写持久位置或新建存档事务。 |
| 禁止完整开局/收益 | `startSecretNest`、`rewardSecretNest` 在开态也只返回拒绝。intro 关闭时进巢/伪造房间退出/开局/收益分别沿用 refuseEnter/refuseStart/refuseReward。无房间池、boon、loot、日奖、修为/灵石/物品发放。 |
| 正式关态对照 | `src/v06c-open.test.ts` 同文件在不注入的 SSR 图验证 disabled、遗留 active/reached/done、既有拒绝 tipKey、路牌/入口说明、伪造房间、return 不抢猎户交互。原 `test:v06c-closed` C01–C10 覆盖继续通过。 |

没有新增 strings 表键；门禁新增短句直接随拒绝结果返回，均不超过40字，`secret.gate.*` 仅为结果标识。既有 intro 8 条、closed 8 条原文及整份 strings JSON 均未改。

## 正式表与 SHA 旁证

共享 `/workspace/xiantu/` 与快照 `/workspace/xiantu/wt/dev/data/` 下六份保护文件开工、运行夹具及交付前均命中以下 SHA，双根同字节：

| 文件 | SHA-256 |
|---|---|
| balance/quests.json | `22d443c17df97906e87c947b21adad94136006dccb6973e13877448105d2334e` |
| balance/strings_zh.json | `4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385` |
| maps/wanyao_outer_1.json | `9c05955fb39631e1236f2583f3be65e66823be2da3b30efaafc10ff443074b10` |
| balance/companions.json | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| balance/fly_zones.json | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| balance/npcs.json | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |

正式 `q_secret_nest_intro` 仍唯一且整条不变：enabled=false、phase=6、rewards={}、giver/turnIn=hunter_lei、prereq=q_main_04、reqRealm=foundation、reqLevel=30、objectives=[reach wanyao_outer_1/secret_nest_sign]、next=null。

每根逐项核对10处 gifts.enabled=false；companions 根+苏条目仍 true，fly_zones 根仍 true，均未回滚。

features 未翻：`indexedDbSaves=true`，开态测试运行期间也不调用 feature 覆盖。`data/features.json` SHA 为 `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8`；`src/features.ts` SHA 为 `ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130`。共享根 features.json 原先缺席，交付时仍缺席。

对双根全部 balance JSON、目标地图、features 的文件/缺席状态及 features 源码共73项做前后 SHA 守护，全部一致。secret_rooms/secret_boons/secret_events/secret_loot 未触碰；共享根已有 secret_rooms 与快照差异原样保留。

## 自检

| 命令/检查 | 结果 |
|---|---|
| `npm run test:v06c-open` | PASS，exit 0；双根四图共682条运行时断言，每根正式关态99 + 内存开态242；73项保护记录不变。 |
| `npm run test:v06c-closed` | PASS，exit 0；10660断言，双根各33状态夹具；原关态行为与保护表守护通过。 |
| `npx tsc --noEmit` | PASS，exit 0。 |
| `python3 qa/tools/datalint.py`（共享根） | PASS，exit 0，问题0条。 |
| 同一脚本在 `wt/dev/data` 运行 | PASS，exit 0，问题0条。 |
| `npm run test:mainline-56` | PASS，exit 0；双根各335断言，雷猎户主线对白和交付保留。 |
| `npm run test:quest-hooks` | PASS，exit 0；双根正常及坏表对照通过。 |
| `git diff --check` / 暂存检查 | PASS，exit 0。 |

测试执行真实 Gate、QuestSystem、Progress 与 GameScene 方法，仅替换 Phaser 渲染/按键容器及存储介质。indexedDbSaves=true 下产品异步事务和存读档真实执行，存储后端为内存夹具；本轮不宣称浏览器 IndexedDB 介质或实机截图验收。

覆盖真实普通猎户菜单接取/交付、active 路牌 reach/重复阅读、有图/缺图点击、资格拒绝、最小进出、update 房内长帧隔离陷阱、三退出键、既有暂停保留、重复进出零写盘，以及 done 异步重载后不自动建房、再次通过入口进出。比较完整 exportSave：接取/reach/交付只改变 intro 进度；拒绝及进出连同资产、boon、日奖、位置存档、主线完全不变；导入表、运行时 QUESTS 和 features 不变。

日志目录：`/workspace/xiantu/wt/dev/qa/out_v06c_open_fixture/`，含 `v06c-open.log`、`v06c-closed.log`、`tsc.log`、双根 datalint、mainline-56、quest-hooks、`diff-check.log`、`protected-before.json`、`protected-after.json`、`selfcheck.json` 和 `baseline.txt`。

## 边界与交接

正式 intro/gifts 仍关；只在 Vite 内存夹具临时开启 intro 与门禁。未翻任何正式 enabled/features，未回滚 companions/fly_zones/IDB，未扩6–10房、boon/loot/日奖结算或6d；未运行 release.sh，未发版，未 force-push，未 reset --hard。

开工已有状态页按本轮授权刷新；待审 `_pending/secret_rest_r1/`、`dist-test/`、旧 `qa/out_*` 和本轮本地自检日志均未纳入实现/文档提交。报告与状态页覆盖同步到 `/workspace/xiantu/reports/炼器阁/` 和 `/workspace/xiantu/status/` 对应路径。后续交执法堂按实现 TIP_SHA 抽检；经理未另令前不翻正式表、不发版。
