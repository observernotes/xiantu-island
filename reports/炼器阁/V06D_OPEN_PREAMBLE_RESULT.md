# v0.6.4 · 6d① 正式 soft-open preamble 结果（不发版）

日期：2026-10-17（Asia/Shanghai）；工作区：`/workspace/xiantu/wt/dev`；分支：`dev`。

- 基线：`9aa064a592d1fb5f20408d268f32eab0bb450531`；开始时 HEAD / origin/dev / 远端 dev 一致，已跟踪文件干净；既有未跟踪产物保留。
- TIP_SHA：`de102e8f8d297907700c7a2b769a4e37968dc006`（正式旗标与测试内容提交，已普通 push）。
- BRANCH_TIP（实现推送后 origin/dev）：`de102e8f8d297907700c7a2b769a4e37968dc006`，已由 `git ls-remote origin refs/heads/dev` 核验；随后仅追加本报告/status 的 docs tip，最终 BRANCH_TIP 以交付回执及远端 dev 为准，文档补录不改源码或表。
- Blocker：无程序自检阻断。**不发版、待执法堂冒烟**；PASS 后由主程序另行 release v0.6.4，本任务未执行。

## 正式开态与关态夹具

- `src/TowerOpenFlag.ts` 的 `isTowerOpenForFixture()` 正式恒 `return true`；仅 Vite SSR 关态图可注入 false，无新增 enabled 配表字段。
- open runner 双根各先跑 `formal-open`（磁盘/SSR 均 true，无 flag 注入），再跑 `memory-closed`（仅 SSR 内存模块 false）；注入装载次数分别为 0 / 1，feature 覆盖调用均 0。TS 的 `openFixture=true` 对应正式开态，false 对应内存关态；O01–O08 与关态 Gate 全 API 拒绝覆盖保留。
- closed runner 双根各先无注入验证正式 flag=true 并 report `formal-graph`，再以内存 false 跑原 C01–C10 与独立 SSR 刷新；每根 58 个常规行为夹具 + 2 个刷新夹具，共 120 个，拒绝期间存储写入 0。
- 两 runner 聚合 evidence 均为 `formalOpen:true`、`closedFixtureOnly:true`、`softOpened:true`、`released:false`；已移除 memoryOpenOnly。TowerClosed tip 文案/API、GameScene 生产接线均未改。

## 自检

以下命令均从 `/workspace/xiantu/wt/dev` 发起，exit 0。

| 检查 | 退出码 | 结果 / 断言摘要 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | PASS |
| `npm run test:v06d-open` | 0 | PASS；3012 条 = 2842 主体 + 170 静态/保护；双根各 formal-open 1036 + memory-closed 385；O01–O08 通过 |
| `npm run test:v06d-closed` | 0 | PASS；15038 条；双根正式图与关态/刷新图通过，C01–C10 自动化部分通过 |
| `npm run test:mainline-56` | 0 | PASS；snapshot/shared 各 343 条，共 686 条 |
| `python3 /workspace/xiantu/qa/tools/datalint.py`（相对路径入口适配） | 0 / 0 | PASS；共享根与 snapshot 各跑一次，均显式断言“问题 0 条” |
| `git diff --check` | 0 | PASS；源码及报告/status；提交前另核 cached diff |

datalint 从 wt/dev 发起 Python，分别 `os.chdir('/workspace/xiantu')` / `os.chdir('/workspace/xiantu/wt/dev/data')`，再 `runpy.run_path('/workspace/xiantu/qa/tools/datalint.py', run_name='__main__')`；两根均检查物品 50、怪物 27、任务 35、NPC 27、地图 24、秘境房间 25，问题 0 条。
原始日志：`/tmp/xiantu-v06d-preamble-{tsc,open,closed,mainline-56,diff-check}.log`、`/tmp/xiantu-v06d-datalint-{shared,snapshot}.log`。本地 evidence：`qa/out_v06d_open_fixture/v06d-open-evidence.json`、`qa/out_v06d_closed/v06d-closed-evidence.json`，不提交。

## 翻旗前后保护 SHA

未改任何表字节；以下既有 expectedSha 均保留。除注明者外，数据 SHA 共享=快照=game；共享不存在 features.json，保持不创建。

| 文件 | 翻旗前后 SHA-256（不变） |
| --- | --- |
| balance/tower_floors.json | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6` |
| balance/titles.json | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c` |
| balance/strings_zh.json | `6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f` |
| maps/youying_tower.json | `6c5393853301e449482db4c3dbc140b289189a1d8d627c7e3934f5dbcfdd6f56` |
| balance/npcs.json | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| balance/companions.json | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| balance/fly_zones.json | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| balance/quests.json | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| balance/secret_boons.json | `2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f` |
| balance/secret_events.json | `41afdfd17ba787c8a5824c63279ec1d555f03188e8c269be3693e4cde2f15d37` |
| balance/secret_loot.json | `047784fe3ee5411faa5c237ebfffbb3508c8c90fcc513882cc362540b442c210` |
| balance/secret_rooms.json（共享） | `42eab7d3c19e48636e4352e7de871680c588c11e6228c82ad2c0a4cb3b6b7bb3` |
| balance/secret_rooms.json（快照/game） | `edae1c2f99837624616c2f498d54d87373abef410772191f4b9b0d582ff510d4` |
| features.json（快照/game） | `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8` |
| src/features.ts（wt/dev 与 game） | `ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130` |
| src/data.ts（wt/dev 与 game） | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` |

独立清单 `/tmp/xiantu-v06d-preamble-protection-before.json`（SHA=`47a92dc2d6e15b5a4c7a40cfcf284f818b27b53654a5e62faa76701394f013e7`）覆盖三根全部 balance JSON、塔地图/features 及两处 features/data 源码，共 111 个现存文件，复核全部未变；secret_rooms 共享与快照原有路径差异分别保全。open/closed runner 另各守护 84 / 81 个路径。
三根 npcs 各 10/10 gifts.enabled=false；companions 根/苏条目、fly_zones 根和 6c intro true/5 保留；indexedDbSaves=true，GAME_PHASE=5。未混 6b/6c 回滚，未动 #20/坊市/阵法。

## 边界与执法堂三行交接

实现仅修改 TowerOpenFlag 及指定两 runner/TS 测试；随后仅报告/status。未运行 release / Pages / force-push；dist-test、qa/out_*、art/_pending、TALISMAN 审计均未纳入提交。报告同步至 `/workspace/xiantu/reports/炼器阁/V06D_OPEN_PREAMBLE_RESULT.md`；工作树报告为准。程序自检通过，实机战斗/画面仍待执法堂冒烟。

【执法堂 1/3】TIP_SHA=de102e8f8d297907700c7a2b769a4e37968dc006，6d① 正式 soft-open preamble；冒烟入口 `npm run test:v06d-open` + `npm run test:v06d-closed`；自检 3012 / 15038 条通过，请按该 tip 冒烟。

【执法堂 2/3】formalOpen:true；closedFixtureOnly:true；正式 flag=true，关态仅 SSR 内存 false；塔表/strings/youying 及保护 SHA 不变，gifts0、GAME_PHASE=5，6b/6c 保留。

【执法堂 3/3】不发版、待执法堂冒烟；本刀未 release。PASS 后由主程序另行 release v0.6.4；FAIL 勿发，禁 gifts/#20/坊市/阵法。
