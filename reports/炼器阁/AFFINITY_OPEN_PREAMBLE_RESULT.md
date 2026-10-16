# 好感翻表开态 preamble 适配结果

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`

基线：`6850cdc`（好感最小路径）

交付分支：`origin/dev`

## 结果

- 已适配 `src/affinity.test.ts` 开态 preamble + 关态全 false 夹具（对齐奇遇 `8576896` 先例）。
- 演武共享 `/workspace/xiantu/balance/npcs.json` 已翻：**9 人 `affinity.enabled=true`，`gifts.enabled` 仍全 false**；已同步进仓库 `data/balance/npcs.json` 并纳入本提交。
- `npm run test:affinity` PASS（snapshot/shared 双模式，各 547 好感断言 + 80 存档断言 + 坏表模块图）。
- **未发版，未运行 release。** 玩法运行时代码未改；未开 gifts；未碰正魔 / #19 / #20 / lifeSkillCurve。

## 翻表旁证

共享与快照逐字节一致；SHA-256：`de767143b64be96b01e3c01fcf4c3a1411087068ef3cd01454e8ff68134eb5cd`。

| 正式 NPC | affinity.enabled | gifts.enabled |
| --- | --- | --- |
| village_elder / grocer_wang / doctor_sun / tianjian_elder / taixu_elder / lingfu_elder / youying_elder / wanshou_elder / enc_wanderer | true | false |

## 改动要点

- preamble：根门禁只允许 0 或 9（双态）；9 true 走 tip 开态断言；送礼始终全 false。
- 关态：`structuredClone` 后强制 `affinity.enabled=false`，经 `parseAffinityIndex` 得 `closed`；poison 读档/预览/结算、关态任务交付与 pending 消费、关态奇遇消费、关态领取均改用夹具（文案「关态夹具」）。
- 开态 fixture 业务测例保留；fixture 仍断言不开启 gifts。
- 文末旁证：gifts 全 false；enabled 为 0 或 9 且与 preamble 计数一致。
- `scripts/affinity-test.mjs` 无正式 enabled=false 硬断言，未改。

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:affinity` | PASS；snapshot/shared 各 547 + 80 + invalid-table |
| `git diff --check` | PASS |

## 请执法堂

- tip 含翻表快照 + 开态 preamble，**可交执法堂翻后冒烟**。
- PASS 前勿发 v0.5.12；PASS 后由炼器阁发版（宣传：好感一期软开，送礼仍关）。
