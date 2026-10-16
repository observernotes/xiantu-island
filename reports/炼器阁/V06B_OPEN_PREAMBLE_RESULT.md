# v0.6.2 · companions + fly_zones 正式软开 preamble 结果

日期：2026-10-16（Asia/Shanghai）；工作区：`/workspace/xiantu/wt/dev`。

- 基线：`80b1174e2b1292b8b4fb3bbc9509d40c9f5e8118`，含开态 fixture `d40016e09ae922f17828447996317e6b0e45a8fc`；开始时 HEAD、origin/dev 及 fetch 后远端 dev 一致。
- TIP_SHA：翻表内容提交，提交后在极短交接文档提交中补录完整 SHA。
- 交付分支：`origin/dev`（普通 push）；最终 BRANCH_TIP 以远端 dev 为准，文档补录不再改变表或测试。
- Blocker：无。翻表 tip 已交执法堂冒烟；本报告是程序自检，等待执法堂 PASS；未发版。

## 翻前核对与翻后同字节旁证

仓库快照翻前 SHA 符合指定基线。实测共享目录起始已把三处 enabled 置 true，因此与“翻前已同字节”的任务描述不同；逐项 diff 确认差异仅这三处开关，未还原共享开关，按本令统一正式开态及获准 meta 文案。起始实际 SHA 如下，未将其记作已同字节：

| 表 | 快照翻前 SHA-256（指定基线，已核对） | 共享起始实际 SHA-256 |
| --- | --- | --- |
| companions.json | `8e1fe697721999f02723e99b109a3e6a2a12eb537cecf2993bdd81c6aa762fa5` | `60865cad14f75e43d12a1e8edf75063c7fc796f13bba763edc3c91da4d40e015` |
| fly_zones.json | `a55bd3cae2b057c26a5ca1842055c9b0dfc2b39910e17f8537dd971fcaca2b98` | `e5c8160336ee2c9d691f6551cfc49bb1b08ed6e62e9b2908cbda1a5e145606e9` |

两侧写入后立即分别执行 sha256sum 并核对原始 bytes；自检前后再次核验，最终共享 `/workspace/xiantu/balance/` = 快照 `data/balance/`，逐字节一致：

| 表 | 翻后 SHA-256（两侧相同） | 正式状态 |
| --- | --- | --- |
| companions.json | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` | 根 true，唯一 `companion_senior_sister_su` 条目 true |
| fly_zones.json | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` | 根 true |

## 改动与保护

- 两表仅三处 enabled 翻 true，另改 meta.status 和 companions.meta.affinityDependency 的开态说明；递归对照基线确认其余字段、数值、结构不变。共享表与仓库快照同步，未运行 sync/snapshot/release。
- `src/v06b-open.test.ts`：正式三开为真相，开态克隆与正式深等；structuredClone 后三开关 false 构成关态对照，恢复三开后与正式深等，保留内存与导入表不污染检查。
- companions / companions-save / fly-zones 单测：正式开态旁证 true；拒绝、无写入、旧档关系保留、坏表与门禁短路改用显式关态克隆，根关、条目关、缺条目覆盖保留。
- sword-ride 默认读取正式开态；open 套件继续传 true，closed 套件以独立 SSR 模块图注入仅三处 false 的克隆并传 false，运行时前置断言确认实际读到关态。模块图隔离，筑基授予、幂等补发、真实异步存读档及基础冲刺链继续覆盖。
- 两脚本 protectedSha 更新为正式开态 SHA，skills / npcs SHA 不变；双根同字节、测试前后磁盘只读、夹具仅三处 enabled 的纯度检查保留。正式 npcs 共 10 处 gifts.enabled 全 false；`indexedDbSaves=true`，features 文件未改，也未创建共享 features 文件。
- 除本次两表外，共享与快照的 balance JSON 以及正式 features 共 65 个既有文件的 SHA 保护检查通过。无必跑失败，未扩改 features-test / encounter-runner 或 talisman-ui / maps / sense-ui。

## 自检结果

以下命令均在 `/workspace/xiantu/wt/dev` 执行，最终 exit 0。

| 命令 | 退出码 | 结果 / 关键日志 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | PASS |
| `npm run test:v06b-open` | 0 | PASS；snapshot/shared 各 408 条（正式开态 352 + 御剑 56），共 816 条；`formalOpen:true`、`closedFixtureOnly:true`、`giftsEnabled:false`、`indexedDbSaves:true` |
| `npm run test:v06b-closed` | 0 | PASS；snapshot/shared 各 372 条（同门 151 + 存档 60 + 飞行 105 + 御剑 56），共 744 条；正式开态 SHA 守护 + 关态夹具行为 + gifts 仍关 |
| `npm run test:save-slots` | 0 | PASS；255 assertions；`indexedDbSavesDefault:true`、`slotKeys:[1,2,3]`、`autoSlot:false` |
| `git diff --check` | 0 | PASS，含报告与 status；提交时另核 cached diff |

脚本语法检查、独立只读 diff 审查及三开关夹具纯度检查通过。断言数为测试主体计数，不含脚本额外 SHA/字节/赠礼/IDB 守护。原始命令日志在 `/tmp/v06b-open-preamble-{tsc,open,closed,save-slots}.log`。

## 边界与执法堂三行交接

未手改玩法运行时代码；仅翻 companions 与 fly_zones，gifts 全关、indexedDbSaves 保持 true，其它表与 features 未翻，未开 6c/6d。未落地图 flyZone 对象、未扩同行 AI 或大地图代步。未运行 release.sh，未 force-push，未做 Pages 发版。既有 secret_rest_r1、dist-test、qa/out_talisman_ui_*、TALISMAN_*、TIER1_* 未改动、未纳入提交。报告同步到 `/workspace/xiantu/reports/炼器阁/V06B_OPEN_PREAMBLE_RESULT.md`。

【执法堂 1/3】翻表 tip 以本报告 TIP_SHA 为准，分支 origin/dev；冒烟入口 `npm run test:v06b-open` + `npm run test:v06b-closed`；自检 816 / 744 条通过。

【执法堂 2/3】正式 companions 根+苏条目、fly_zones 根均 true；共享=快照逐字节一致，SHA 见上表；gifts 10/10 false，IDB true；关态走显式内存夹具。

【执法堂 3/3】未发版，禁 gifts/其它 features/6c/6d；等待执法堂 PASS 后，由主程序另行执行 release.sh v0.6.2；本轮不执行。
