# v0.6a 关态交接（#12c + TD-V06-01）

> 炼器阁·主程序｜2026-10-16 20:59（Asia/Shanghai）  
> 负责人拍板范围：仅两项关态进 tip；**不含** 6b/6c/6d、不含自动档、**gifts 仍关**、**未发版**。

## TIP_SHA

| 项 | SHA |
|---|---|
| **交接 tip（HEAD）** | `16cb7027c65dcbf611ee109bbc59e5460b9b205e` |
| ① #12c | `3a0129ec4fd2263fb89fa8d0370fb8048cb962d3` |
| ② TD-V06-01 | `16cb7027c65dcbf611ee109bbc59e5460b9b205e` |
| 线上正式（未动） | v0.5.16 |

## 完成度

### ① #12c IndexedDB（达标）

- 3 槽（1/2/3）+ 导出/导入 + 旧 `xiantu_save_v1` → slot1 迁移；**无** auto-save 槽。
- feature `indexedDbSaves` **默认 `false`**（关态仍用 localStorage 单槽；开态测例用 `setFeatureFlag`）。
- 测入口：`npm run test:save-slots`（本机复验 195 断言 PASS）。
- 说明：`docs/save-slots.md`。
- **UI 债**：开态 DOM overlay「存档」面板（`?saves=1`）；未接入主 HUD 视觉规范；关态不显示。开态玩法同步 `save()` 尚未全改异步——正式开态需另令接线。

### ② TD-V06-01 卷一 5–6（达标）

- `q_elder_exam` / `q_main_06`：nameKey/descriptionKey/dialogueKeys → tip 快照 + tracker/NPC 菜单描述；`hunter_lei.quests` 挂 `q_main_06`。
- 筑基：考核 `consume:false` 不扣丹；入台前复检持丹；失败反馈可读；苏师姐护法仅叙事。
- 深林：现有 reqLevel 门，**不绑御剑**。
- 测入口：`npm run test:mainline-56`（333×2 PASS）+ `npm run test:mainline-21`（349 PASS）。
- 单篇：`reports/炼器阁/MAINLINE_56_WIRE_RESULT.md`。

## 改动摘要

| Commit | 摘要 |
|---|---|
| `3a0129e` | SaveStore/SaveSlotsPanel、Progress 异步槽 API、features.indexedDbSaves=false、test:save-slots |
| `16cb702` | tip quests/strings/npcs 5–6 字段、GameScene 入台复检+失败反馈+菜单描述、test:mainline-56 |

## 验证（交接 tip 复跑）

| 命令 | 退出码 |
|---|---|
| `npx tsc --noEmit` | 0 |
| `npm run test:save-slots` | 0（195） |
| `npm run test:mainline-56` | 0（333+333） |
| `git diff --check` | 0 |

（TD-V06-01 提交前另绿：`test:mainline-21`=0 / 349）

## 关态证明

- `data/features.json`：`indexedDbSaves: false`；未翻 gifts；未做 6b+；未发版。
- tip NPC `affinity.gifts.enabled` 均为 `false`。
- 线上仍 v0.5.16。

## 执法堂三行（关态抽检 · 交主程序转派）

1. **#12c**：关态确认仍单槽 localStorage；`test:save-slots` 绿；可选开态会话测三槽/迁档/导入导出（勿当正式开）。
2. **5–6 章**：传功长老/雷猎户三态对白与 tracker/菜单描述；考核交付不扣丹、入台才扣；缺丹不入台；失败反馈可读。
3. **边界**：深林无御剑前置；gifts 关；features 无擅自新开；**仅 tip、不发版**。

## Blocker

无。正式开 `indexedDbSaves` / 发版 / 6b+ 等负责人另令。
