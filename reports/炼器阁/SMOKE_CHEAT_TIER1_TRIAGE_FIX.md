# tier1 smoke:cheat 分诊修复

更新时间：2026-10-16 21:27:29 UTC+8

## 结论

- **根因一句话**：`karma_flags` 开态后 `q_awaken`（及 `q_sect_tianjian`）的 `turn_in` questHook 要求显式 `choiceId`，而 `Cheat.complete` 强制 `turnIn(id, true)` 未传选择 → `skipQuests()` 返回 false。
- **FIX_SHA**=`b1342fa2a4be7e8c6cdf7728a70165c878f0839a`（`fix(cheat): pass default choice for forced quest hooks`）
- **TIP_SHA**=`d22d06a7c715dc19ba0b536e990aef51e9943931`（docs pin；代码 FIX `b1342fa` 已在祖先；普通 push origin/dev）
- **验证**：`npm run test:smoke:cheat` → **exit 0**（85 项断言）。Codex 另跑 build / quest-hooks / cheat 相关均绿。
- **建议执法堂复跑**：是，建议对含 `b1342fa` 的 tip 复跑 `test:smoke:cheat`（tier1 该项）；不挡线上 v0.6.0。
- **blocker**：无。未翻 `indexedDbSaves` / gifts；未发版；未派 6b+。

## 证据链

- 执法堂 triage：`qa/out_tier1/dda7852/triage.md`；日志 `logs/selftest-test_smoke_cheat-attempt{1,2}.log`；断言 `cheat-smoke.mjs:155`。
- 正式表：`data/balance/karma_flags.json` → `prologue_medicine`（quest=`q_awaken`）与 `sect_tianjian_sword`（quest=`q_sect_tianjian`）均为 `enabled: true`。
- `QuestSystem.questHookTurnIn`：hook 开态且 moral 就绪时，`choiceId === undefined` → `false`（正式玩法「未选择不交付」语义正确）。
- 冒烟路径：`acceptQuest('q_awaken')` 后 `skipQuests()` 批量 `completeQuest` → 撞上上述 hook。

## 修复

- `src/Cheat.ts`：强制完成时若存在 enabled 的 `turn_in` hook，传 `choices[0].id` 给 `turnIn(id, true, choiceId)`。正式无 choice 的 `turnIn` 语义不变。
- `scripts/cheat-smoke.mjs`：覆盖双 hook（awaken / tianjian）默认首项选择落档，并仍断言日常保留。

## 未改

- `data/features.json.indexedDbSaves` 仍 false；gifts 未动；无发版。
