# v0.6 · 6d① 锁妖塔内存开态夹具交接

- 工作目录：`/workspace/xiantu/wt/dev`；分支 `dev`。
- TIP_SHA（实现与自检对象）：`401a3cb630276931c0f9eb030a9f3bb5fa4a5811`；最终分支 tip 为该实现之后的交接文档提交。
- 开工已执行 `git fetch && git pull --ff-only origin dev`，基线 `80fee5db0e66ab8f885eb465aa58296ce3a30a07`，保留关态实现 `051f75ee0b827431eabc3a0863c7fe33da9e403e`。
- 依据：`design/22_v06_6d关态_锁妖塔.md` §5 O01–O08、§2.2 G14；本报告为程序自检，交执法堂复核。

## 内存双开与正式关态

`src/TowerOpenFlag.ts` 正式实现恒定返回 false，没有正式 enabled 配表字段。`scripts/v06d-open-test.mjs` 为 shared 与 snapshot 各创建两个独立 Vite SSR 图：正式图不注入旗标，开态图只将旗标模块 resolve/load 为返回 true 的虚拟模块。楼层、称号、strings、任务与 features 均使用原表，不写盘、不 sync、不 snapshot；两根四图互不共享模块状态。

`TowerGate` 每个操作首先按旗标拒绝，逐一沿用 `TowerClosed` 八类 tipKey。正式入口仍只展示原说明；Z 键仍先调用 `tryInteractTowerClosed`。渡口 `youying_tower` 航线和免费抵达山门的职责保留。正式图零开爬，历史已通层、已领奖或已解锁称号均不能绕过关态。

开态最小产品链路使用 Gate 内存单房会话；`Progress.tower` 仅保存 `highestClearedFloor`、`firstClearClaimed`、`titles` 及可选山门回落点。旧档缺字段仍无塔进度；校验拒绝非法层号、重复收据/称号、未知称号、伪造房内字段及非有限坐标。`exportSave` / `importSave` / 异步加载沿用真实 Progress 与 SaveStore，房间、怪物、进行中的会话均不进档。

## O01–O08 覆盖与降级边界

| 编号 | 实现与自动化覆盖 |
|---|---|
| O01 | 只允许 `tower_climb_entrance` 且回落场景为山门 `youying_tower`；拒绝渡口、山门落点或其它对象充当爬塔入口。G14 起层读取数值字段，不执行表达式；最高通层 0/10/20/30 对应 1/1/10/20。 |
| O02 | 清层前拒绝推进；逐只 `clearMob`，至少覆盖 1→2，完整推进至30层。重复进层不会重建怪物；每日重爬保留首通记录。 |
| O03 | 10层清完仅一次首通，解锁 `title_tower_10`，展示「镇妖·十层」及既有描述，重复结算无资产增量。 |
| O04 | 20层清完仅一次首通，解锁 `title_tower_20`，展示「镇妖·二十层」及既有描述，重复结算无资产增量。 |
| O05 | 30层全部本体与小体清完才通塔，解锁 `title_tower_30`，展示「镇妖·三十层」；推进始终停在30，无31层。 |
| O06 | 已死怪不能复活或重复死亡；按 `meta.affixDefs.split` 每个分裂本体死亡产生2小体，小体不再分裂，未清小体不得清层/领奖/推进；会话返回深拷贝，不能靠外部改对象伪造清层。 |
| O07 | 最后一只怪死亡触发真实异步存档事务，一笔提交最高层、首通标记、stones、inventory/品质分堆与称号袋；重复请求、重爬、导出导入/加载均不重发。称号按正式 id 去重，名/描述只读 titles.json 与 strings，忽略 floors 的旧占位名。IDB失败不发布奖励或清层，保留最后怪活态供重试。 |
| O08 | 中途与通塔后均经 Gate 退出；未清层不算通，退出不推进、不补奖、不重开；保存并读回进度一致。回落点为正式爬塔入口 `{mapId:'youying_tower',x:入口.x,y:入口.y}`，同时写 Progress.position；刷新不自动续爬。真实 GameScene 占位、点击/键盘退出、暂停所有权与正常控制恢复均受测。 |

降级边界：采用真实 Gate 的 `clearMob` / `fixtureClearRemainingMobs` 可控清怪代替实机战斗；只验怪物死亡、分裂数量与清层口径，未验证伤害、狂暴/护盾或分裂子体血攻百分比等战斗数值。GameScene 房内为显示当前层、剩余怪和出口的占位容器，提供逐层推进按钮，不接实机怪物攻击与美术房间。Phaser 渲染及按键被替换，存储介质为内存 IDB 夹具，运行真实 IndexedDB backend 的 complete/abort 路径；不宣称真实浏览器介质、实机手感或截图验收。高品质奖励仅验真实品质袋及持久化，既有背包汇总行的品质展示不在本轮验收内。

房内暂停山门物理与计时器，update 只处理退出键；退出销毁视图、恢复本房拥有的暂停并消费残留退出键。场景销毁丢弃内存会话，不借销毁补奖或建新房。原本已有暂停保持原状态。

## SHA 旁证与硬禁核对

开工与交付对共享根、wt/dev/data、game/data 全部 balance JSON、features/缺席状态、山门地图及受保护源码共111项做 SHA 前后核对；完整记录见 `qa/out_v06d_open_fixture/protected-before-task.json` 与 `protected-after-task.json`。新套件另有运行前后守护，包含正式旗标文件。tower_floors、titles 全程只读；以下各根已有文件同字节且写前写后一致：

| 文件 | SHA-256 |
|---|---|
| balance/tower_floors.json | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6` |
| balance/titles.json | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c` |
| balance/strings_zh.json | `6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f` |
| balance/npcs.json | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| balance/companions.json | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| balance/fly_zones.json | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| balance/quests.json | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| maps/youying_tower.json | `6c5393853301e449482db4c3dbc140b289189a1d8d627c7e3934f5dbcfdd6f56` |

strings 的既有904键和关态八键原文、缩进及全部字节未改；npcs 十处 gifts.enabled 全 false（gifts0）。companions、fly_zones、secret_*、quests intro、地图均未改。GAME_PHASE 仍5，features 无覆盖调用、无开放调整；快照 features SHA `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8`，源码 features SHA `ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130`。

## 自检与交接

| 自检 | 结果 |
|---|---|
| `npx tsc --noEmit` | PASS，exit 0。 |
| `npm run test:v06d-open` | PASS，exit 0；3012条断言：每根正式关态385 + 内存开态1036，另有静态170；双根四图及84项运行前后SHA守护通过。 |
| `npm run test:v06d-closed` | PASS，exit 0；15031条断言，原套件未修改、未回退。 |
| 共享根运行指定 `datalint.py` | PASS，exit 0；问题0条，设置 PYTHONDONTWRITEBYTECODE=1。 |
| wt/dev/data 运行同一 `datalint.py` | PASS，exit 0；问题0条，同上。 |
| `git diff --check` | PASS，exit 0。 |

新套件正式关态图每根15笔IDB提交用于准备、加载与导入历史塔袋；Gate拒绝均另验写入增量为0，并设写入入口替身遇调用即抛错。

旧 closed 套件中的 `legacyFixtureOnly/formalTowerSchemaAdded:false` 是该套件既有夹具报告口径；本轮新增可选 Progress.tower 字段，真实字段的正式关态拒绝、导入与加载另由新四图套件覆盖，没有修改旧断言掩盖回归。

日志：`/workspace/xiantu/wt/dev/qa/out_v06d_open_fixture/`，含 open/closed、tsc、双根lint、diff-check、SHA前后、自检JSON与开工基线。报告及状态同步至 `/workspace/xiantu/reports/炼器阁/`、`/workspace/xiantu/status/炼器阁.md`；状态页≤30行。

未 soft-open、未进包、未 release、未抬 GAME_PHASE；禁 gifts / #20 gathering / 坊市 / 阵法保持，未混6b/6c。实现与交接文档普通提交并 `git push origin dev`，未 force-push。待审 art、dist-test、旧 qa/out_*、talisman 审计及本轮本地日志均未纳入提交。下一棒由执法堂按 TIP_SHA 复核内存开态覆盖及正式关态，正式开放与发版另令。
