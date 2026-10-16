# #12c 正式翻表与开态 preamble 结果

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`

基线：`abeaa00`（完整 SHA：`abeaa00094c0b1bdb7813cfbe05b2bcb718a7a20`；含异步接线 `50d3674` / cheat FIX `abeaa00`，含 `b1342fa`）。开始时 HEAD 与 `origin/dev` 一致。

TIP_SHA：9538f1a616cb2c23a28965dec669f0ed1f2870d0

交付分支：`origin/dev`；本轮只改工作区文件，未 commit/push，未发版。

## 正式表与边界

正式 `data/features.json.indexedDbSaves=true`，仅此一个布尔值由 false 翻为 true，其它键和值不变，已开功能保持开。

| features 文件 | SHA-256 | MD5 |
| --- | --- | --- |
| 翻前（基线） | `f5326ab47ca72919592a933bcd4f77127a44f87943ddeb648a6cd5616b9ef50f` | `5bc3144f900c5962aefd868aae31ce79` |
| 翻后（本轮） | `69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8` | `16fa150878794fd82cccf76a25b48d5a` |

- 正式快照 `data/balance/npcs.json` 的 `affinity.gifts.enabled` 仍为 9/9 false；gifts 不在 features，未翻 gifts。
- 无自动档，槽仅 1/2/3；HUD overlay / SaveSlotsPanel 视觉与交互不纳入。
- 未改 Progress / SaveStore / GameScene 等玩法运行时代码，未改 balance 表或其守护；未做 6b+，未发版。
- 无关 `data/art/sprites/_pending/secret_rest_r1/` 未改动、未纳入。

## 改动要点

- `data/features.json`：仅翻 `indexedDbSaves` 为 true，哈希与负责人令指定值完全一致。
- `src/save-slots.test.ts`：套件先断言正式表和运行时默认 true；同步 localStorage 测例改为 `setFeatureFlag('indexedDbSaves', false)` 关态夹具；玩法主路径、Progress 三槽和其它开态段对齐正式 true；日志 `indexedDbSavesDefault:true`；finally 仅设置会话覆盖 false，不写正式文件。
- `src/mainline-56.test.ts`：指定回归首跑因正式默认开态进入异步奖励路径，原同步 `reward?.settled` 断言失败；仅补必要 preamble，先断言正式 true，再设关态夹具 false，保留原同步任务、奖励、试炼与 localStorage 断言主体，finally 清理会话覆盖。
- `docs/save-slots.md`：正式默认 true；删除待翻表与正式仍 false 表述；关态仅夹具，开态依正式表，`?saves=1` 继续可用。
- `scripts/encounter-runner-test.mjs`：features 固定 MD5 更新，并旁证 indexedDbSaves=true；balance 守护原样保留。
- `scripts/features-test.mjs`：names 补 indexedDbSaves；默认和缺配置夹具与 `src/features.ts` 一致，缺配置默认 false、本工程快照为 true；初始正式开态断言后，旧同步测试桥矩阵使用关态夹具，末尾保留最小会话开关与刷新恢复正式快照检查，未扩浏览器矩阵。
- `status/炼器阁.md`：记录正式开态与交执法堂抽检，保留 gifts / 6b+ / 发版边界。

## 验证

以下命令均在本工作区执行。

| 命令 | 最终退出码 | 结果 |
| --- | --- | --- |
| `npm run test:save-slots` | 0 | PASS；255 assertions；`indexedDbSavesDefault:true`、`slotKeys:[1,2,3]`、`autoSlot:false` |
| `npm run test:mainline-56` | 0 | preamble 适配后复跑 PASS；snapshot/shared 各 335 assertions |
| `npx tsc --noEmit` | 0 | PASS（包含 mainline preamble 修改） |
| `git diff --check` | 0 | PASS |
| `npm run test:smoke:cheat` | 0 | PASS；正式构建 85 项断言；使用本工作区已有 dist，未重建，未作翻表后新产物验收，未发版 |

附加检查：`npm run test:encounter-runner` exit 1，阻断于共享 `/workspace/xiantu/balance/npcs.json` 的既有「正式九人好感块」守护（实际 10，期望 9）；正式工程快照为 9，未改共享表或 balance 守护。此项不在本令五项必跑验证中，交执法堂核对共享数据差异。

附加检查：两个修改过的 scripts 均通过 `node --check`（exit 0）；实际执行 `scripts/features-test.mjs` 的 SSR 前置部分（临时执行、固定本工作区 root），正式快照及缺配置/关态三夹具均通过，14 个开关，indexedDbSavesDefault=true（exit 0）。未执行该脚本完整浏览器矩阵。

## 给执法堂的三行交接

【执法堂 1/3】#12c 正式翻表+preamble 已交检；入口 `npm run test:save-slots`（255）+ `npm run test:mainline-56`（335×2）；正式开态为真相，关态仅内存夹具；tsc / diff-check / smoke:cheat 退出码见验证表。

【执法堂 2/3】正式 indexedDbSaves=true（SHA-256=69302e3a0dec48fb963548ab5dc1e0b950b2a050864ee7a746335a8386be9fd8）；gifts 仍关；无自动档；槽 1/2/3；HUD overlay 不纳入。

【执法堂 3/3】TIP_SHA=9538f1a616cb2c23a28965dec669f0ed1f2870d0；请出 `qa/out_v06a_idb_flip_<sha>/`；入口 test:save-slots + test:mainline-56；未发版；禁 gifts/6b+。
