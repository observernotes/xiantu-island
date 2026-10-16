# v0.6.3 · 6c intro 正式软开 preamble 结果（不发版）

日期：2026-10-17 01:17:46 UTC+8；工作区：`/workspace/xiantu/wt/dev`；分支：`dev`。

- 基线：`c532e8f44555d574eaec2cd809460651654a09e8`；开始及 fetch 后 HEAD / origin/dev 一致。
- TIP_SHA：`待提交后补录`（本 preamble 的翻表、测试与自检内容提交；随后仅用极短文档提交补录该 SHA）。
- BRANCH_TIP（origin/dev）：最终包含上述 TIP_SHA 与本报告补录的远端 dev tip；普通 `git push origin dev`，最终值以交付回执及 `git ls-remote origin refs/heads/dev` 为准，文档补录不改变表或测试。
- Blocker：无。程序自检通过，交执法堂冒烟本 preamble tip；待执法堂 PASS。本刀未 release、未发版。

## 翻前快照与三处同字节旁证

翻前快照 SHA-256：`22d443c17df97906e87c947b21adad94136006dccb6973e13877448105d2334e`。
共享与 game 起始已为正式开态，仅将共享 quests 逐字节 cp 至工作树快照；未运行 gen / sync / snapshot。对照基线确认只有 `q_secret_nest_intro.enabled: false → true`（bool）、`phase: 6 → 5`（int）变化，恢复这两字段后全表 deepEqual 基线。

写后立即 sha256sum，测试后再次核对：

| 路径 | 翻后 SHA-256 |
| --- | --- |
| 共享 `/workspace/xiantu/balance/quests.json` | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| 快照 `/workspace/xiantu/wt/dev/data/balance/quests.json` | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| game `/workspace/xiantu/game/data/balance/quests.json` | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |

共享=快照=game 逐字节一致。intro 的 rewards/giver/turnIn/prereq/reqRealm/reqLevel/objectives/next 及其余字段均未变；奖励仍为 `{}`。

## 正式开态与关态夹具

- `formalOpen:true`；`closedFixtureOnly:true`。open runner 的 `runGraph(..., null)` 无 quests 注入，正式 JSON 与实际门禁均读到 true/5；TS 仍用 `openFixture=true` 表示 SSR 图读到开态，标签为 `formal-open` / `memory-closed`。
- 两 runner 的关态图只注入正式 quests 内存克隆，intro 改为 false/6；恢复 true/5 后 deepEqual 正式全表。原接取→猎户回调→路牌 reach→空奖励交付→最小单房→退出覆盖保留，主线06 active/done 均不串线。
- closed runner 先验证无注入正式 SSR 图开态，再以关态 JSON 图跑拒绝接取/推进/交付/入巢/开局/收益、路牌与入口可读、旧档/伪开 QUESTS 拒绝、保存重载及零写档；每根 33 个行为夹具。最终重读磁盘 intro 仍为 true/5；所有保护文件 SHA 不变。
- gifts 两根各 10/10 false；companions 根/苏条目及 fly_zones 根保持已软开，未回滚；`indexedDbSaves=true`，features 与 GAME_PHASE=5 未改。
- 两 runner 各保护 73 个正式 balance/地图/features 路径（含缺失共享 features 的不创建守护）。另对共享/快照/game 的 108 个既有文件核对，只有本轮获准快照 quests 改变，其他 107 个 SHA 均未变。

## 自检

以下命令均从 `/workspace/xiantu/wt/dev` 发起，exit 0。

| 检查 | 退出码 | 结果 / 断言摘要 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | PASS |
| `npm run test:v06c-open` | 0 | PASS；双根各 formal-open 242 + memory-closed 99，共 682 条主体断言；formalOpen:true / closedFixtureOnly:true |
| `npm run test:v06c-closed` | 0 | PASS；10706 assertions（含静态/图前置/保护检查）；双根各 33 个行为夹具，共 66 个 |
| `python3 /workspace/xiantu/qa/tools/datalint.py`（按相对路径入口适配，见下） | 0 | PASS；snapshot / shared 均问题 0 条 |
| `git diff --check` | 0 | PASS，含报告/status；提交前另核 cached diff |

共享 datalint 脚本使用相对 balance/maps/art 路径，从工作树发起 Python runpy，内部依次 chdir 至 `data/`、`/workspace/xiantu/` 再执行该脚本；显式断言两次输出均为“问题 0 条”，避免仅凭该脚本退出码判断。open 的 682 条为主体计数，另有脚本 SHA/字节/夹具纯度守护；closed 的 10706 为脚本总计数。
原始日志：`/tmp/v06c-open-preamble-{tsc,open,closed,datalint,diff-check}.log`；额外基线保护清单：`/tmp/v06c-open-preamble-protected-before.json`。

## 边界与执法堂三行交接

本刀未修改玩法生产代码；未扩房/boon/loot，禁 gifts/6d；未改 companions/fly_zones/features/GAME_PHASE、secret_* 玩法四表或 maps。未运行 release.sh / 发版 / Pages / force-push。dist-test、qa/out_*、待审 sprites/_pending、无关 TALISMAN/TIER1 报告均未纳入提交。报告同步到 `/workspace/xiantu/reports/炼器阁/V06C_OPEN_PREAMBLE_RESULT.md`；工作树内报告为准。

【执法堂 1/3】以本报告 TIP_SHA 的 6c intro 正式软开 preamble 为冒烟基线（含同步 snapshot）；入口 `npm run test:v06c-open` + `npm run test:v06c-closed`；程序自检 682 / 10706 条通过，请对该 tip 冒烟。

【执法堂 2/3】formalOpen:true；closedFixtureOnly:true；intro 正式 true/5，quests SHA=c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b；共享=快照=game；gifts 仍关，companions/fly 未回滚，IDB true。

【执法堂 3/3】本刀未 release、禁 gifts/6d；tip 已出待执法堂冒烟。PASS 后由主程序另行 ff master→release v0.6.3；本任务不执行，FAIL 勿发。
