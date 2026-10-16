# v0.6 · 6c 万妖巢穴关态交接

更新时间：2026-10-17 00:38:58 UTC+8。工作目录：`/workspace/xiantu/wt/dev`。

- 实现与双根验收 tip：`0187b19e8ef89ff83fe2528b8c0c93277cccda16`；干净代码基线：`43dcd4bd2fb559896bb2b16af73769366423790a`。
- 交付分支：`origin/dev`；本报告与状态随后以纯文档提交交付，最终分支 tip 见本会话末行回执或 `git rev-parse origin/dev`。
- 已交执法堂关态抽检；程序自检通过，实机抽检待执法执行，不代替执法 PASS。Blocker：无。
- **未令不开 intro / 不翻 / 不发版；gifts 仍关；不接 6d。**

## 设计与实现

依据共享 `design/21_v06_6c关态_万妖巢穴.md` §3、§6，以及 design/19 P0②、design/11 §6。

| 行为 | 接线与边界 |
|---|---|
| C01 入口说明 | `wanyao_outer_1` 石门可点击、Z 或 ↑ 查看 `secret.closed.entrance`；常显 `secret.closed.feature`。无 portal target、入境、建局或接任务。 |
| C02 路牌重读 | 同样支持点击、Z、↑；只展示 `secret.closed.sign_readable`，不播放 intro sign_a/b/c，不调用 reach，不保存。 |
| C03 接取/推进/交付 | `QuestSystem` 对 intro 的 available、accept、complete、turnIn/turnInAsync、activeIds、目标推进均有正式关态门禁；显式对话仅有 offer/progress 关态说明且无 after。直接调用接受/推进/交付也经 onBlocked 展示对应 tip。 |
| C04 资格与旧档 | `SecretNestClosed.isSecretNestIntroEnabled()` 直接读取正式 quests，只有该条 `enabled===true` 才视为开；先于等级/前置/境界/旧档状态判断。运行时 QUESTS 被 phase 过滤并非验收依据；伪开注入也被拒绝。 |
| C05 开局/抽房间 | 只读 `refuseStart()` → `secret.closed.no_start`；未实现 runId、种子、抽房间或 boon 流程，界面无可执行开局操作。 |
| C06 收益 | `refuseEnter()` / `refuseReward()` 分别给 no_enter / no_reward；API 无 Progress 参数和写入依赖，不结算 boon、loot、日奖、修为、灵石或物品。 |
| C07 主线隔离 | 普通雷猎户主线对白和 after 保留；秘境关态提示通过事件日志展示，闲聊可显示关态单行。q_main_06 两态均测试，无击杀/交付串线。 |
| C08 存读后重试 | 正式表仍关；真实 Progress 保存/载入 done 旧档后再测仍拒绝，不续入、不重抽或补发收益。 |
| C09 返回 | return 仅作落点占位，不参加邻近交互、不抢雷猎户 Z；失效返回说明使用 feature，仅显示说明，不开局/通关/结算。 |
| C10 配表边界 | intro 全条不变；gifts 仍全关；features、companions/fly_zones、秘境玩法表未修改。 |

地图对象：路牌 id27 `(392,832)`、入口 id28 `(456,832)`、return id29 `(464,832)`；nextobjectid=30。均位于营地同一安全站面，避开 NPC、飞舟、采集与隐藏奇遇锚；牌/门各有独立交互站位。入口使用既有关闭门图集，缺材时用色块降级；没有把 SecretProps 房间换皮当入口门禁。

## 正式表与双根旁证

下列共享与快照文件同字节、同 SHA-256：

| 文件 | SHA-256 |
|---|---|
| balance/quests.json | `22d443c17df97906e87c947b21adad94136006dccb6973e13877448105d2334e` |
| balance/strings_zh.json | `4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385` |
| maps/wanyao_outer_1.json | `9c05955fb39631e1236f2583f3be65e66823be2da3b30efaafc10ff443074b10` |

`q_secret_nest_intro` 仍是唯一既有条目：enabled=false、rewards={}、giver/turnIn=hunter_lei、prereq=q_main_04、reqRealm=foundation、reqLevel=30、objectives=[reach wanyao_outer_1/secret_nest_sign]、next=null，整份 quests 与基线同字节。既有 intro 8 条原文逐字不变；本轮只将共享既有 closed 8 键同步到快照，未改共享 strings 或其他键。

测试对两根全部 balance JSON、features 和目标地图共 72 个文件/缺席状态做执行前后 SHA 守护，全部未写表。另核对本轮基线保护记录与 Git diff：npcs/gifts、companions、fly_zones、features、secret_rooms/secret_boons/secret_events/secret_loot 未改。共享 secret_rooms 既有并行 `themes.wanyao_nest.bossDisplayName=巢心妖影` 与快照差异保留，未同步或触碰；其余玩法表无漂移。

## 最终自检

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:v06c-closed` | exit 0；10660 断言；shared/snapshot 各33状态夹具；全部保护表前后 SHA 不变 |
| `python3 qa/tools/datalint.py`（共享根） | exit 0；问题0条 |
| 同一 datalint 脚本在 `wt/dev/data` 运行 | exit 0；问题0条 |
| `npm run test:mainline-56` | exit 0；双根各335断言，雷猎户正常主线对白与交付保留 |
| `npm run test:mainline-21` | exit 0；349断言 |
| `npm run test:quest-hooks` | exit 0；双根正常与坏表夹具均通过 |
| `git diff --check` / 暂存检查 | exit 0 |

关态测试加载真实模块、QuestSystem 和 GameScene 方法，仅替换 Phaser 渲染容器；覆盖有/缺门素材、关闭动画、提示/点击/反复阅读、伪 portal、正式 phase 表与注入 enabled:true/phase:5、资格两态、main_06 两态、none/active/reached/done、存读档后再试。比较完整 Progress、序列化存档、任务/场景/资产/已有 boon/日奖，拒绝路径不得调用保存、事务或收益函数。实机操作与截图交执法按 design/21 C01–C10 抽检。

日志：`/workspace/xiantu/wt/dev/qa/out_v06c_closed/`，含 `v06c-closed.log`、`tsc.log`、双根 datalint、主线与 quest-hooks 日志、`protected-before.json`、`diff-check.log`。

## 工作区与交接边界

开工已确认 talisman tip `43dcd4b` 推至远端；遗留状态与两份报告存入 `talisman-wip` stash，未弹回。待审 `data/art/sprites/_pending/secret_rest_r1/`、`dist-test/` 和旧 `qa/out_*` 保留原位，未纳入本提交。只同步指定地图与 strings 快照，未运行全量 snapshot，未使用 XT_SKIP_PRE。

交接报告和状态已分别覆盖同步至工作树与 `/workspace/xiantu/` 同路径。普通推送 origin dev；未 force-push、未运行 release、未改 companions/fly_zones/gifts 或 features、未实现完整开态房间与收益流程。经理另令前保持关态。
