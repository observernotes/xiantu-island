# v0.6 轨B · 6b 开态 fixture 交接

更新时间：2026-10-16 23:36:31 UTC+8；工作目录 `/workspace/xiantu/wt/dev`。

- TIP_SHA（fixture 实现与自检、抽检对象）：`d40016e09ae922f17828447996317e6b0e45a8fc`。
- 基线：`e7757f44fce03d145586a0609190e81f946adbeb`；关态实现 `6151e51`、关态 PASS `qa/out_v06b_closed_e7757f4/`。
- 交付分支：`origin/dev`；实现后仅追加本报告与状态页的文档提交，最终分支 tip 以 `git rev-parse origin/dev` 为准。
- Blocker：无。请执法堂对该实现 tip 做开态抽检；本报告为程序自检，不代替执法 PASS。

## 正式表与开关

共享 `/workspace/xiantu/balance/` 与本仓库 `data/balance/` 均保持正式关态、同字节；自检前后核对 SHA-256：

| 文件 | SHA-256 | 正式状态 |
|---|---|---|
| companions.json | `8e1fe697721999f02723e99b109a3e6a2a12eb537cecf2993bdd81c6aa762fa5` | 根及唯一苏师姐条目均 false |
| fly_zones.json | `a55bd3cae2b057c26a5ca1842055c9b0dfc2b39910e17f8537dd971fcaca2b98` | 根 false |

`npcs.json` 全部 10 处 gifts.enabled=false，苏师姐赠礼仍关。`indexedDbSaves=true`；未调用 feature 覆盖，features 文件 SHA 前后不变。脚本同时保护 skills/npcs 的关态交接 SHA。

## 夹具覆盖

- `src/v06b-open.test.ts` 只以 `JSON.parse(JSON.stringify(...))` 克隆临时开启 companions 根+苏条目及 fly_zones 根；同文件保留正式关态对照。原表除三处克隆开关外完全相同。
- 邀请严格覆盖 disabled → unavailable → already → need_confidant → ok；分别验证单关、缺条目、坏映射、缺失/关闭好感、缺知交档位、已有三种 mode、知交阈值前/边界/更高档。门槛读取 tiers.min。
- gifts/unlocks、领礼收据、confidant_gift、背包与实体依赖设 getter/Proxy 读陷阱，邀请仍成功且零误读。已领/未领均写唯一 follow 关系、不改好感或物品；真实 IDB 开关下通过外层异步事务 draft 调用既有 invite，写盘一次、重载保留、再邀 already，正式关态仍 disabled 且不激活关系。
- 御剑另用独立 SSR 图注入双开内存表，复用 `runSwordRideTests({ openFixture: true })`，断言运行时确实读到开态。筑基授予、免费幂等补发、异步存读档、基础冲刺参数/碰撞/耗蓝/冷却均通过；持续飞行临时开不拦截授予或冲刺。
- 持续飞行只验拒绝门禁：境界 → 总开关 → 技能/地图白名单/inFlyZone → 灵力；白名单所有地图与技能/区域组合、缺蓝/非法灵力、getter 短路均覆盖。失败 entered=false、mpSpent=0、不改请求；正式表对照 zone_disabled。全条件满足后的成功放行与真实飞行物理未在本轮实现。

## 自检结果

- `npx tsc --noEmit`：PASS，exit 0。
- `npm run test:v06b-open`：PASS，shared/snapshot 各 406 条（开态夹具350 + 御剑56），共812条；包含正式表 SHA、gifts、IDB 及前后只读核验。
- `npm run test:v06b-closed`：PASS，shared/snapshot 各369条，共738条；原关态拒绝路径继续通过。
- `npm run test:save-slots`：PASS，255条，indexedDbSavesDefault=true。
- 正式两表及镜像 SHA：PASS，与上表及关态基线一致；`git diff --check`：PASS。
- 日志：`/workspace/xiantu/qa/out_v06b_open_fixture_d40016e/logs/`。

## 边界与交接

请执法堂开态抽检。正式仍关、开态仅内存夹具；未翻正式表/任何 features、未发版、未跑 release.sh、未 force-push、未 reset --hard；禁6c/6d，未做同门 AI、地图 flyZone 对象或大地图代步。原有待审美术、dist-test 与 TIER1 异步 harness 报告保留且不纳入 tip。本报告与 status 同步覆盖共享根目录同路径。
