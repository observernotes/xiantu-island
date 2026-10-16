# v0.5b 航线 / 试炼回程体验收口 RESULT

更新：2026-10-16（UTC+8）｜炼器阁·主程序
结论：已修真实回程缺口，必跑自测通过；仅提交并推送 origin/dev，待执法堂复验。未发版，正式 features 默认值未改。

## 基线与提交

- 起点：`005b33ff938e35867297f86ab3b5cf28e5fc5c69`（任务开始时 origin/dev）。
- 本轮代码 / 测试 tip：`08ed28e8eb4597b759bd413b12011c4670b4ce1e`。
- 本 RESULT、status、软收口表随后单独文档提交；含交付文档的最终 tip 以 `git rev-parse origin/dev` 为准，任务回报另列最终 SHA。

## 审计与修复

| 点 | 本轮结果 |
|----|----------|
| 四宗飞舟去程 | 确认六航线已含四山门；已注册时 `sectEntryMap` 保留山门。原正确代码不重写 |
| 关闭 v05Maps 的回程链 | `RETURN_MAPS` 补四条 `trial_* → 本宗山门`；允许再由山门返落霞，仍禁止新航线、反向进试炼和跨宗借道 |
| 无 pending 误落试炼图 | 普通 URL、场景参数或旧 position 在建图前软回本宗山门长老；合法 pending 入场保留本局试炼，已有独立职业调试夹具保留 |
| 旧 pending / position | 共用落点归一：试炼旧返回位置优先升本宗长老，缺长老用山门出生点，缺山门保持原试炼兜底；load/import 迁移并保存，二次读档稳定 |
| win / fail / exit / 中断 | 结算及中断恢复再次归一，覆盖 registry 内的旧 pending；均回山门，不再回 `trial_*`；失败/退出不伪造胜利或拜入 |
| 试炼图入口 / 出口 | 山门已注册时不挂兜底接引/长老，只留回本宗山门出口；缺山门保留原 NPC + 落霞出口；活动 pending 不挂入口/逃生门；已有山门出口时不再优先挂临时青云出口 |
| 关态兼容 | 五宗/制符单开、双关准入不变；无已注册山门时保留原青云安全出口；不改正式开关与禁开项 |

## 体验清单

开态 `fiveSectClasses=true`、`v05Maps=true`，满足航线等级/任务/灵石门槛后，在落霞镇选择下列航线；长老确认进入独立试炼，win/fail/exit 或刷新后回表内长老落点，山门飞舟返落霞镇。

| 航线山门 | 独立试炼图 | 回程长老坐标 px |
|----------|------------|----------------|
| `taixu_temple` | `trial_taixu_stage` | `(976,512)` |
| `lingfu_pavilion` | `trial_lingfu_range` | `(1040,512)` |
| `youying_tower` | `trial_youying_vault` | `(1008,512)` |
| `wanshou_mountain` | `trial_wanshou_pen` | `(1072,512)` |

普通误入上述试炼图、读入无 pending 的旧试炼 position、读入 returnPosition 仍为试炼图的中断旧档，均应软回对应山门。关闭 v05Maps 时允许试炼→本宗山门→落霞回程，新入场仍锁；五宗/制符关闭后未注册的山门仍安全降级。

## 改动文件

- `src/Ferry.ts`：回程映射、共用旧落点归一。
- `src/Progress.ts`：读档 / 导入迁移。
- `src/scenes/GameScene.ts`：误落、中断、结算与出口。
- `src/sect-entry.test.ts`、`src/v05.test.ts`、`src/trials.test.ts`：四宗返程、旧档与关态回归。
- `scripts/classes-test.mjs`：真实 create 前段测试所需 Phaser 事件桩；`test:classes` 会加载 sect-entry。
- `scripts/v05-smoke.mjs`：四宗真实航线、误落及旧档回山门；原试炼渲染用已有独立调试夹具保留。
- `scripts/trials-smoke.mjs`：试炼 suite 显式会话关闭制符菜单分流并恢复，适配当前正式制符开态，不改默认配置。
- 本 RESULT、`status/炼器阁.md`、`reports/炼器阁/V05B_CLOSED_STATE_SOFT_CLOSE.md`。

## 自测

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | PASS |
| `npm run test:v05` | PASS，479 assertions |
| `npm run test:classes` | PASS，含 sect-entry 1484 assertions |
| `npm run test:trials` | PASS，660 assertions |
| `XT_DATA=snapshot npm run build:test` | PASS，仅本地测试构建 |
| `XT_DATA=snapshot npm run test:smoke:v05` | PASS，15 地图 / 27 交互检查，四宗航线往返、误入及旧 position/pending 恢复，浏览器错误 0 |
| `XT_DATA=snapshot npm run test:smoke:trials` | PASS，46 项检查，四宗真实目标胜利、失败、Esc 退出、中断、跨图回程及门控，浏览器错误 0 |
| `XT_DATA=snapshot node scripts/talisman-test.mjs --single-mode` | PASS，craft 446 / use 219 / save 288 assertions |
| `git diff --check` | PASS |

补充实跑：`npm run test:talisman` 的 snapshot 通过，shared 在既有文案数量断言失败（快照 60 条、共享表 61 条，多 `talisman.level`）；这条断言与共享文案不在本轮改动范围，已保留。试炼 smoke 首跑也暴露制符已开与旧门槛夹具的冲突，已仅修本 suite 的会话前置，结果以上表最终复跑为准。

## 范围

`data/features.json`、`src/features.ts`、#19 功法品阶 / #20 灵气浓度配置均未修改；`lifeSkillCurve=false`，#19 全 46 个布尔开关、#20 全 4 个布尔开关仍 false。不改无关玩法、不合 master、不建 tag、不调用 release。山门美术构图仍由美术另验，本报告收口程序航线与回程体验。

请执法堂：验开态五宗+v05Maps 下飞舟去四山门；试炼 win/fail/exit 回山门非 trial_*；无 pending 误落试炼图软回山门或有出口；关 features 行为不回归。
tip SHA：代码/测试 `08ed28e`；含文档最终 tip `45a5bc5`（= origin/dev HEAD）。
SCOPE：#19#20/lifeSkillCurve 勿开；本轮非发版。
