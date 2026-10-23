# design/50 · 巢穴日倍结算 · soft-open 3A PASS（炼器）

> Soft OpenPreRelease｜released:false｜newOpenFlag:false  
> 依据：reports/天机阁/20261023_负责人令_同行AI_design50_soft.md；开态核 VERIFY_PASS＠473ca3d5。  
> 现网 v0.6.31；建议 v0.6.32 未授权；≠release≠Pages≠tag≠合master。等执法 soft smoke／负责人核。

## tip 与配置

- soft tip：`f5efb16517c70f2fd73eac4a1bb655126f062b03`（短 `f5efb165`）；枝 `feat/secret-daily-bonus`。
- 业务基线：接线 `473ca3d592e9341032aff5b1b5a133bd0f1e2c1c`（473ca3d5）；夹具祖先 `364cd494364af3b55551bab8b7d575d07d15931c`（364cd494）；无 rebase／amend。
- commit：`soft(nest): design/50 secret_daily_bonus=true Soft OpenPreRelease`。
- 普通 `git push origin feat/secret-daily-bonus` 成功：364cd494 → f5efb165；无 force-push；远端 HEAD＝本地。
- 本 wt `data/features.json.secret_daily_bonus` 严格布尔落盘 **true**；其余 15 项键值、键集合与顺序不漂（含 `secret_boon_runtime=true`）。
- features SHA256：`5d29ebe9b239298779f1d3f9ed9ae3fdb4019b9391753b124e6069efb21ad9f0`。
- features.ts 只读本工程快照；缺键／false／非 boolean 仍关闸。共享根缺键仍关，`/workspace/xiantu/game/data/features.json` 属另一工程，未跨 wt 同步。

## 改动与硬读

业务 soft tip@f5efb165 仅含 features 与必要测试改动；生产 TS、balance 表、其它既有 Flag 无改动。

- runtime／features：工程快照预期 true；C01 缺文件／缺键／false 及全 false 临时夹具保留，均关闸；会话可关回。
- secret-daily-bonus：开头按 closedOnly／正式期望；O01–O06＝24/40、满额回 12/20、05:00、pending 阻结算、仍不开 loot、boon 正交；关回会话 false＝基线零副作用。
- min-loop／boon-runtime／v06c-open：会话关回日倍保留 12/20 基线段，finally 恢复落盘 true。
- companion support／down-revive：snapshot 承认真＝`secret_daily_bonus:true`＋features SHA→5d29ebe9…；shared 语义保持。
- 无 softOpenedNest＊／NestOpenFlag／DailyBonusOpenFlag／任何新 OpenFlag；GAME_PHASE=5；gifts 仍关。
- 无 loot／boss／扩房／gifts／#20／阵法改动；无 release／Pages／tag／合 master／force-push；开态 out `qa/out_secret_daily_bonus_open_473ca3d5/` 未覆盖。

## 自测（全部 exit 0）

| 命令 | 结果 |
|---|---|
| npx tsc --noEmit | PASS |
| XT_DATA=snapshot npm run build:test | PASS；测试构建，非 release |
| npm run test:secret-daily-bonus | PASS，487 assertions |
| npm run test:secret-nest-min-loop | PASS，150 assertions |
| npm run test:secret-boon-runtime | PASS，408 assertions |
| npm run test:features | PASS，182 assertions |
| npm run test:v06c-open | PASS，712 assertions |
| npm run test:companion-support-sword-shield | PASS，303 assertions |
| npm run test:companion-down-revive | PASS，768 assertions |
| git diff --check／独立 diff 复核 | PASS；仅 features false→true 与必要测 |

程序侧 O 等价回归已绿；本交件不代执法独立 soft smoke，不作 release／Pages 授权。未另建 soft out，未覆盖开态 out。

## 冻结 SHA（共享／game snapshot／本 wt snapshot MATCH）

| 表 | SHA256 | 结果 |
|---|---|---|
| secret_rooms.json（权威 shared） | `42eab7d3c19e48636e4352e7de871680c588c11e6228c82ad2c0a4cb3b6b7bb3` | MATCH |
| secret_boons.json | `2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f` | MATCH |
| companions.json | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` | MATCH |
| skills.json | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` | MATCH |

【同行AI50soft已交】炼器＝本报告／tip `f5efb16517c70f2fd73eac4a1bb655126f062b03`｜落盘true／无softOpenedNest＊／newOpenFlag:false／released:false／冻结MATCH｜普通push成功｜≠release≠Pages≠合master｜现网v0.6.31｜建议v0.6.32未授权｜等执法soft smoke及负责人核。
