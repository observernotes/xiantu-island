# v0.6 · P1③++++++ 分解一期关态 tip 结果

2026-10-17 Asia/Shanghai；`/workspace/xiantu/wt/dev` / dev / stdin=/dev/null；基线 `14d6de7b39b1aab0b31a12289172e6735986f263`，已 fetch + pull --ff-only，演武核齐备 PASS 为本窗前置。

实现 tip：`5d9fa291172a8696f0daddd283bf1f2c97d679e4`，提交名 `feat(v0.6-p1): wire salvage closed tip APIs`。文档提交名 `docs(v0.6-p1): hand off salvage closed tip evidence`；最终文档 tip 与推送后 origin/dev、远端 HEAD 见本窗 `final-tip.json`。

仅新增独立恒 false 的 SalvageOpenFlag 和八个零参数 SalvageClosed 只读 API，唯一依赖 strings；不接 Progress，不建 SalvageGate 或成功结算。八 API 对照与 C01–C10 程序旁证见 [HANDOFF](V06P1_SALVAGE_CLOSED_HANDOFF.md)。现网混入分解仍为原 forge/enhance/enchant.closed.later_service；未挂 smith_ou.services、未修改既有 Gate/NPC/正式 Flag，未注入 Salvage true。

strings 精确 cp 权威表，960 键（含 _meta），shared/snapshot SHA=`9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda`。移除末尾八键可逐字节复原 952 键基线；materials/items 只核不写。冻结表、三既有 Flag、data.ts 全 MATCH，EnchantOpenFlag 仍 true，GAME_PHASE=5，gifts 10×false；增强/护符/附灵 soft-open 与旧旁证保留，未运行全量 snapshot/build/sync/release。

程序自检全部最终 exit 0，共 **162165** 断言：分解专项 **19306**、旧回归 **142859**。tsc、分解专项、enchant/enhance/forge open+closed、market-closed、v06d/v06c closed、双根 datalint、双根36表 json.tool、git diff --check 全绿。专项232场景、3380次调用，4个正式false SSR图，拒绝/读档零写；普通建档4次准备写入另列。

输出根 `qa/out_v06p1_salvage_closed/`；详见 selfcheck-summary / evidence-check / audit/protection-check、两根运行证据及回归适配审计。目标/品质/绑定/容量及并发载荷只作恒拒 API 的语义上下文，不代表业务校验或分解事务已实现；旧档未知分解记录只保留测试原文，不宣称新增正式 schema。程序自动化不代执法实机抽检，不代勾 C/O。

```json
{
  "salvageClosedTipsWired": true,
  "SalvageOpenFlag": false,
  "softOpenedSalvage": false,
  "released": false,
  "refineStoneMapped": true,
  "enchantSoftOpenPreserved": true,
  "EnhanceOpenFlagPreserved": true,
  "protectCharmSoftOpenPreserved": true
}
```

refineStoneMapped 仅正式登记/有效映射核齐，核齐备≠生产分解授权。未改权威表、旧 QA 或待审产物；报告与四段≤30行 status 以 UTF-8 同步 shared。Codex 日志 `/workspace/xiantu/logs/codex/f406ace5944d4bcb_20261017_150020_1731896.log`，ultra、禁 fast，引用见 codex-log-reference.json。

无程序自检阻断。下一棒交执法 design/30 §4.2 C01–C10 独立抽检；本令不授权开态夹具。本令≠开态≠soft-open≠release≠进包≠分解成功结算。
