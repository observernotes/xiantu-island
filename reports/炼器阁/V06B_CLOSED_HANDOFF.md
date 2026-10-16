# v0.6 轨B · 6b 关态交接

更新时间：2026-10-16 23:21:26 UTC+8。工作目录：`/workspace/xiantu/wt/dev`。

- TIP_SHA（实现 + snapshot 验收对象）：`6151e51d5946693846f514cb0fd92808cc311f46`；基线 `84d475e9f139d57db67ffc8dc08ca3cb9619d53a`。
- 最终交付分支：`origin/dev`；随后一笔文档提交只包含本报告与状态页，最终 SHA 以 `git rev-parse origin/dev` 为准。
- Blocker：无。关态程序自检通过，交执法堂对本 tip 抽检；不替代执法 PASS。

## design/20 验收链

| 设计依据 | 已落实与验证 |
|---|---|
| §2.1 / §2.2 | Companions 只读解析及 data 导出；仅苏师姐映射，资格读 Affinity 的 confidant 阈值；顺序为 disabled → unavailable → already → need_confidant → ok，邀请不查询领礼。正式双关、根开但条目关、条目缺失均拒绝，提示 `companion.invite.disabled`，无按钮/关系写入/同行实体。测试始终未双开。 |
| §2.3 / §2.4 | `companionRelations` 可选存档保存原关系和 follow/free/stay mode；真实异步保存、读档、导入均保留。关态实体投影 null、模式门禁 false；旧档不补空容器。未实现同门 AI 或开态指令玩法。 |
| §3.1 / §3.3 | 筑基前拒绝 → 突破成功按旧境 reward.unlock 免费 grantSkill 御剑一级 → 原 SkillCombat.dash 可用 → 异步存读档保持技能及冷却。失败不授；重复事件与读档不升级/重发；已筑基缺技只补齐保存一次，不花 SP，非天剑角色也可用。 |
| §3.1 基础操作 | ↑ + 既有跳跃键触发冲刺，不增加物理键位、不抢快捷栏；境界读 skills.req.realm，MP/CD/距离/时长与碰撞沿用原表及原 dash。筑基前/首次授予/缺蓝提示使用 fly.locked_realm / fly.skill_granted / fly.mp_low。 |
| §3.2 | FlyZones 只读校验，持续飞行尝试按境界 → 总开关优先拒绝；筑基时返回 fly.zone_disabled、entered=false、mpSpent=0。GameScene 的失效邀请与持续飞行请求钩子输出正式文案；fly_zones 关态不拦授予或基础冲刺。 |
| §4 / §5 | npm run snapshot 含 pre，34 张 balance 快照全部与共享同字节，新两表及16提示键可达。快照同时带入既有共享对白/描述元数据；未改任何权威表、数值或地图 flyZone。 |

## 关闭位与只读证明

共享权威与 data/balance 镜像同字节、同 SHA-256，测试执行前后均断言：

| 文件 | SHA-256 | 断言 |
|---|---|---|
| companions.json | `8e1fe697721999f02723e99b109a3e6a2a12eb537cecf2993bdd81c6aa762fa5` | 根 false；唯一 companion_senior_sister_su 条目 false |
| fly_zones.json | `a55bd3cae2b057c26a5ca1842055c9b0dfc2b39910e17f8537dd971fcaca2b98` | 根 false |
| skills.json | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` | 权威原文件与 sword_ride 参数未改 |
| npcs.json | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` | 权威原文件未改；10处 gifts.enabled=false，苏 affinity.enabled=true |

## 自检结果

- `npm run snapshot`：exit 0；未使用 XT_SKIP_PRE。内置 artcheck 错误0，datalint 问题0，PRE通过。
- `npx tsc --noEmit`：exit 0。
- `npm run test:v06b-closed`：exit 0；snapshot/shared 各367断言（同门151 + 同门异步存档58 + 御剑54 + 飞行104），共734；包含保护表SHA/关闭位、16键及前后未写表检查。
- `npm run test:save-slots`：exit 0，255断言；`npm run test:classes`：exit 0，五宗技能/门禁与事务回归通过。
- 另对本 worktree 的 data 快照运行相同 `qa/tools/datalint.py`：exit 0；物品50、怪物27、任务35、NPC27、地图24、秘境房间25，问题0。
- `git diff --check`：exit 0。独立只读复核无阻断。

## 下一步与边界

交执法堂关态抽检；PASS 后的「开态 fixture」必须另令，本轮未创建或运行双开 fixture。未翻 companions/fly_zones/gifts 或任何正式 flag，未发版、未 force-push、未 reset --hard。未开展6c/6d、道侣、灵宠、多人同门、完整持续飞行或大地图代步，未落 flyZone 对象。会话原有未跟踪报告及待审美术保留，不纳入提交。
