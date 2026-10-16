# 6c mainline-56 mark 优先级修复结果（不发版）

更新：2026-10-17 01:29:26 UTC+8；工作目录：`/workspace/xiantu/wt/dev`；分支：`dev`。

- TIP_SHA（修复与回归内容提交）：`cf1e36000da0effe588a7f705aeb2f27e12fc748`；基线 `d454aa621f53c3781be6ef0399eb6c0fd069a563`。
- 原冒烟对象 `8feda19` 的 mainline-56 FAIL 已修，开发自检通过，待执法堂对新 TIP_SHA 冒烟；blocker=无。
- 根因：正式 intro 与 main_06 共用 `hunter_lei` 和前置 `q_main_04`；main_06 active 时 intro 仍 available，原 `? → ! → …` 顺序返回 `!`，盖住进行中标记。
- 改动：仅交换 `QuestSystem.mark()` 后两条判断，改为 `? → … → !`；可交付仍最高优先，资格条件与 `talk()` 均保留。
- 专用回归确认正式 intro=true/5、同 NPC/前置；完成04前置后真实接取06，intro 仍可接而 mark 为 `…`；击杀达成后 mark 为 `?`。修复前该新断言已复现 `"!" != "…"`（exit 1），修复后通过。

| 检查 | 退出码 | 结果 |
| --- | --- | --- |
| `npm run test:mainline-56` | 0 | shared / snapshot 各343条断言 |
| `npm run test:v06c-open` | 0 | 682条断言；formalOpen=true |
| `npm run test:v06c-closed` | 0 | 10706条断言；关态仅内存夹具 |
| `npm run test:save-slots` | 0 | 255条断言 |
| `npx tsc --noEmit` | 0 | PASS |
| `git diff --check` / 暂存检查 | 0 | PASS |

三处 quests（共享 `/workspace/xiantu/balance/quests.json`、快照 `data/balance/quests.json`、game `/workspace/xiantu/game/data/balance/quests.json`）保持同字节，SHA-256 均为 `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b`；intro 仍 enabled=true、phase=5，giver/turnIn/prereq 未变，formalOpen=true。三根各10处 gifts 均为 false；425项 balance/maps/features 及 features 源码文件或缺失状态记录前后不变。

未改 gifts、6d、GAME_PHASE、features、companions/fly_zones、secret_* 玩法表或 maps；未运行 release.sh、未发版、未 force-push、未 reset --hard。停发 v0.6.3，等待执法堂冒烟；禁 gifts/6d。

推送方式：普通 `git push origin dev`；修复之后仅补录本报告/status，最终 BRANCH_TIP 见交付回执。报告与状态页同步共享根。测试及SHA旁证：`/tmp/v06c-ml56-mark-fix/`。
