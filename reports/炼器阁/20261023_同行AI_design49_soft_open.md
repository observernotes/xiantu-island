# design/49 · 巢穴机缘三选一 · soft-open 3A PASS（炼器）

> Soft OpenPreRelease｜released:false｜newOpenFlag:false  
> 依据：reports/天机阁/20261023_负责人令_同行AI_design49_soft.md；开态核 VERIFY_PASS＠673e62ca。  
> 现网 v0.6.30；建议 v0.6.31 未授权；≠release≠Pages≠tag≠合master。等执法 soft smoke／负责人核。

## tip 与配置

- soft tip：`0173a102dc62bbd379e039ab23f58d7cad42d41e`（短 `0173a102`）；枝 `feat/secret-boon-runtime`。
- 业务基线：`673e62ca1f6bd9b9d4e9a09295ab4259b2dfda40`（673e62ca）；无 rebase／amend。
- commit：`soft(nest): design/49 secret_boon_runtime=true Soft OpenPreRelease`。
- 普通 `git push origin feat/secret-boon-runtime` 成功：673e62ca → 0173a102；无 force-push。
- 本 wt `data/features.json.secret_boon_runtime` 严格布尔落盘 **true**；其余 14 项键值、键集合与顺序不漂。
- features SHA256：`67e07b6cc4f9b10dc766fdf6438d6d564085fb730ea9dd4a9888801c35d5d83f`。
- features.ts 只读本工程快照；snapshot.mjs 保留本枝 features。共享根缺键仍关，`/workspace/xiantu/game/data/features.json` 属另一工程，未跨 wt 同步。

## 改动与硬读

业务 soft tip@0173a102 仅含 features 与必要测试改动；生产 TS、balance 表、其它既有 Flag 无改动。docs tip@9b8098ee 另交本报告＋status（四段≤30行）；普通 push 至 origin/feat/secret-boon-runtime。

- runtime／features：工程快照预期 true；C01 缺文件／缺键／false 及全 false 临时夹具保留，均关闸。
- min-loop：开头断言落盘 true；design/40 关闸兼容段会话 `setFeatureFlag(false)`，finally 恢复；随后 true 清房三选一、pending 阻结算、选卡及退出清层。
- v06c-open：正式 true → 清房三卡 → pending 拒结算 → 选择真实候选 → 原 exp12／stones20 结算；关态 JSON 对照保留。
- companion support／down-revive runner 对齐 snapshot true 与新 features SHA；两根 runtime 均读本工程 true；其余同行硬读、冻结断言保留。
- allowlist 6 common＋3 fallback；rare／epic 仍关；倒地／通关／退出清层；pending 阻结算；玩家、其它角色、召唤／同行隔离；40 最小及 41–48 不漂。
- 无 softOpenedNest＊／NestOpenFlag／BoonOpenFlag／任何新 OpenFlag；GAME_PHASE=5；gifts 仍关。
- 无日倍／loot／boss／扩房／gifts／#20／阵法改动；无 release／Pages／tag／合 master／force-push；开态 out 未覆盖。

## 自测（全部 exit 0）

| 命令 | 结果 |
|---|---|
| npx tsc --noEmit | PASS |
| XT_DATA=snapshot npm run build:test | PASS；测试构建，非 release |
| npm run test:secret-boon-runtime | PASS，406 assertions，shared／snapshot |
| npm run test:secret-nest-min-loop | PASS，148 assertions，shared／snapshot |
| npm run test:features | PASS，176 assertions，15 flags，3 关态快照夹具，刷新恢复 true；console/page errors=0 |
| npm run test:v06c-open | PASS，708 assertions，正式开态＋内存关态，79 文件 SHA 守护 |
| npm run test:companion-support-sword-shield | PASS，301 assertions |
| npm run test:companion-follow-ai | PASS，86 assertions |
| npm run test:companion-modes-free-stay | PASS，162 assertions |
| npm run test:companion-dismiss | PASS，106 assertions |
| npm run test:companion-area-whirl | PASS，192 assertions |
| npm run test:companion-reflect-hook | PASS，174 assertions |
| npm run test:companion-down-revive | PASS，768 assertions |
| npm run test:companion-affinity-sources | PASS，262 assertions |
| git diff --check／独立 diff 复核 | PASS；仅 features false→true 与必要测 |

程序侧 O 等价回归已绿；本交件不代执法独立 soft smoke，不作 release／Pages 授权。未另建 soft out，未覆盖 `qa/out_secret_boon_runtime_open_673e62ca/`。

## 冻结 SHA（共享／game snapshot／本 wt snapshot 三根 MATCH）

| 表 | SHA256 | 结果 |
|---|---|---|
| secret_boons.json | `2f721cd4179b9dc2d78f45fe45239761331ad31fe3b2c68ef4cb72c4a349684f` | MATCH |
| companions.json | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` | MATCH |
| skills.json | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` | MATCH |

【同行AI49soft已交】炼器＝本报告／tip `0173a102dc62bbd379e039ab23f58d7cad42d41e`｜落盘true／无softOpenedNest＊／newOpenFlag:false／released:false／冻结MATCH／6c+3f／倒地清／40+41–48不漂｜普通push成功｜≠release≠Pages≠合master｜现网v0.6.30｜建议v0.6.31未授权｜等执法soft smoke及负责人核。
