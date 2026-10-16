# v0.6 · 6d① 锁妖塔关态交接

更新时间：2026-10-17 02:22:10 CST。工作目录：`/workspace/xiantu/wt/dev`；分支：`dev`，普通推送至 `origin/dev`。

- 代码基线：`e065320b4c4bbba352073ca4045bab0f65c1ff97`，开工 fetch 后与 `origin/dev` 一致。
- 实现与测试 tip：`051f75ee0b827431eabc3a0863c7fe33da9e403e`；本报告与 status 紧随纯文档提交，最终远端 tip 以交付回执为准。
- 依据：`/workspace/xiantu/design/22_v06_6d关态_锁妖塔.md` §3、§4.2 C01–C10、§6；参照 6c 关态 tip `0187b19`。
- **锁妖塔永久关态；本窗不开态、不软开、不 release、不 force-push。** 程序自动化自检与实机执法抽检分开登记，不代替执法 PASS。

## 行为与接线

| 行为 | 提示与边界 |
|---|---|
| C01 功能说明 | `featureClosed()` → `tower.closed.feature`；入口常显，说明可关闭重读。 |
| C02 山门入口 | 渡口仍到 `youying_tower` 山门，原航线与 label 不动。新增 `tower_climb_entrance` 可点击、邻近 Z/↑，只展示 `tower.closed.entrance` 与 feature 两行，无执行选项或 after 回调。 |
| C03 开爬/每日重爬/旧档续爬 | `refuseClimb()` → `tower.closed.no_climb`；资格与历史均不授权开爬，不建流程、不扣费、不计次。 |
| C04 进层/逐层推进 | `refuseFloor()` → `tower.closed.no_floor`；不进层、不传送、不写最高通层或通塔。 |
| C05 首通结算/重复请求 | `refuseReward()` → `tower.closed.no_reward`；不发奖、不补发、不写首通标记。 |
| C06 三条塔称号 | `refuseTitle()` → `tower.closed.no_title`；不解锁、不重发、不写领取记录，既有记录不因拒绝而清空。 |
| C07 退出/存档推进 | `refuseExitOrSaveClimbAdvance()` → `tower.closed.exit_or_save`；只拒绝借退出或保存推进爬塔，不接管既有普通保存及非爬塔返回。 |
| C08 读档/刷新 | `refuseLoadRefresh()` → `tower.closed.load_refresh`；旧档或重新加载模块仍关态，重试走各交互原键。 |
| C09 旧怪物/分裂清层 | 未实现塔内怪物流程；死亡、复活、分裂小体未清及全清旧状态均不能绕过开爬/进层拒绝 API。 |
| C10 配表边界 | 楼层表只读核对 30 层连续、首通与房间契约；三条正式塔称号和原 title/ferry 字符串保留；全部 10 处 gifts 仍 false。 |

`src/TowerClosed.ts` 八个 API 均为零参数、恒返回 `{ allowed:false, tipKey, text }`，文案只从 strings 表读取。无 Progress、写入意图、存储或收益依赖；没有新增 tower enabled 字段、开态开关、正式塔存档结构或爬塔实现。全量搜索未发现既有真正爬塔/进层/首通/塔称号/退出推进消费者，本窗只交只读 API 与入口说明。

地图仅追加对象 id11、type=`tower_climb`、坐标 `(880,512)` 与 `nextobjectid=12`；右侧地面站位，避开接引 NPC、长老、渡口和绳梯。对象无 target 或 portal；拒绝交互先于通用传送/试炼分派。共享地图、wt 快照与 game 快照同字节，其余对象及地形保持原样。

strings 仅把共享已存在的末尾 8 键同步到 wt 与 game 两份快照；共享 strings 未写。验证了“原末项加逗号＋按原缩进追加”，剥离八键还原后的整文件 SHA 为原 904 键 SHA `4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385`；既有 904 键、`title.tower_*` 与 `ferry.route_youying_tower` 原文均未改。6c 测试只更新 strings 预期 SHA，原正式状态与关态夹具断言保留。

## SHA-256 旁证

写前旁证：`qa/out_v06d_closed/protected-before.json`；写后：`protected-after.json`、`boundary-check.log`。覆盖共享、wt/data、game/data 和相关源码共 116 个文件/缺席状态，除本窗授权变更外均与写前一致。

| 文件 | 写前 SHA-256 | 写后 SHA-256 |
|---|---|---|
| `balance/tower_floors.json`（三根） | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6` | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6` |
| `balance/titles.json`（三根） | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c` | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c` |
| `balance/npcs.json`（三根，含 gifts） | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| 共享 `balance/strings_zh.json` | `6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f` | `6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f` |
| wt/game `data/balance/strings_zh.json` | `4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385` | `6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f` |
| `maps/youying_tower.json`（三根） | `ffd64da97d4850047149c047943c0db9ab850b641142b8035c798645bda8f68d` | `6c5393853301e449482db4c3dbc140b289189a1d8d627c7e3934f5dbcfdd6f56` |

## 自检结果

| 命令 | 结果 / 日志 |
|---|---|
| `npx tsc --noEmit` | exit 0；`tsc.log` |
| `npm run test:v06d-closed` | exit 0，15,031 断言、120 组夹具、80 文件前后 SHA 守护，存储写入 0 次；`v06d-closed.log` |
| 共享根 `PYTHONDONTWRITEBYTECODE=1 python3 /workspace/xiantu/qa/tools/datalint.py` | exit 0，问题 0 条；`datalint-shared.log` |
| 在 wt/dev/data 运行同一 datalint | exit 0，问题 0 条；`datalint-snapshot.log` |
| `npm run test:v06c-closed` | exit 0，10,706 断言；`v06c-closed.log` |
| `npm run test:mainline-56` | exit 0，双根各 343 断言；`mainline-56.log` |
| `npm run test:mainline-21` | exit 0，349 断言；`mainline-21.log` |
| `git diff --check` / 最终暂存范围核对 | exit 0；`diff-check.log` / `staged-files.log` |

全部日志位于 `qa/out_v06d_closed/`。新关态测试对 shared/snapshot 各跑 58 组与新 SSR 图 2 组，共 120 组，使用真实模块与 GameScene 方法、Progress/exportSave，替换 Phaser 渲染与存储边界；测试前后 SHA 守护双根正式表与目标地图，未调用会写正式表的保存。旧塔记录仅为测试夹具，不声称已有正式塔存档或恢复流程；拒绝前后逐项及完整状态必须无增量。自动化覆盖 C01–C10 可执行部分，未做真实浏览器操作或执法截图，后续按 design/22 §4.2 留实机证据。

## 工作区与交接边界

- 仅指定文件逐项暂存；遗留 pending art、dist-test、旧 QA 输出及 talisman 审计均原位保留，未混入提交。原脏 status 先留证后按本令覆盖。
- 未改 companions/fly_zones、secret_rooms/boons/events/loot、quests intro、npcs/gifts、features 或 GAME_PHASE；6b/6c 原有状态保持，不混开态或翻表。
- 禁 gifts / #20 gathering / 坊市 / 阵法；未实现真正爬塔、楼层战斗、发奖或称号解锁；tower_floors/titles 任何字节均未修改。
- 共享与 game 的指定 strings/地图快照已同步；本报告与 status 同步到 `/workspace/xiantu/` 对应路径；未运行全量 snapshot 或 release。
- Blocker：无程序自检阻断；下一棒为执法堂关态实机抽检。将来开态/软开另需明确接入令，本窗未执行。
