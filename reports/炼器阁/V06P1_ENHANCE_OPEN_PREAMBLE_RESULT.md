# P1③++ 强化一期 · soft-open preamble 结果（不进包、不发版）

日期：2026-10-17（Asia/Shanghai）；工作目录 `/workspace/xiantu/wt/dev`；分支 `dev`；命令 stdin=`/dev/null`。

- 开工执行 `git fetch && git pull --ff-only origin dev`，exit 0 / Already up to date；基线 `cc3f1d570f95a6907a7177a02b969d7716ffc438`，包含开态夹具实现 `b2ef999ac22f549bad30e8a257e7acbeaca5c8fd`。
- **实现 tip：`ff90d189fa4688506986ff4aa3180343e1aacbd2`**；实现已普通 push。本文、RESULT/HANDOFF、status 与本窗 QA 为随后文档 tip；文档完整 SHA、最终 `origin/dev HEAD` 见交付回执及本地 `final-tip.json`。
- 依据：负责人令 `/workspace/xiantu/reports/炼器阁/20261017_负责人令_强化soft-open.md`；范式 `git show e519e70` 及指定五文件 diff、Forge preamble RESULT/QA；只读 design/26 §4.3 O01–O08；当前 EnhanceGate/Progress 与开态夹具能力保留。
- **EnhanceOpenFlag 正式值 true；formalOpen:true / closedFixtureOnly:true / softOpened:true / released:false。PASS≠进包≠release≠发版；本令不授权 release。无程序自检阻断。**

## 结果与接线

`src/EnhanceOpenFlag.ts` 精确为：

```ts
/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */
export function isEnhanceOpenForFixture(): boolean { return true; }
```

无 import/process/环境/配表或 features 后门。GameScene 只增加三 import，并在既有 `tryInteractForgeEntrance()` 的 smith_ou 查找成功后、同一个 return true 前追加 Enhance 提示：先完整执行原 Forge 提示，再处理强化。Z 与通用交互链的调用点及顺序均保持原字节，因此强化不会被打造入口提前返回饿死。

name=smith_ou 或 props.npc=smith_ou、senseMap 可见性、横距≤28/纵距≤40、无对象安静等均沿用原查找。正式开态调用 `new EnhanceGate(this.prog).entrance()`，允许显示「装备强化已开放。」，拒绝显示 Gate 原文；memory-closed false 直接显示 `enhanceFeatureClosed().text`，绕过 Gate 资格检查，不结算。强化不借 ForgeOpenFlag 放行、不使用 forge.closed.*。

真实 Scene 冒烟覆盖无对象、非欧冶匠、横纵超距、隐藏、name/props.npc 匹配、28×40 边界、两条提示的顺序、正式与内存关态文案、Gate 拒绝及关态绕过、通用交互先于遭遇/NPC；八个正常表图 sceneSmoke.saveWrites 均为 0，整档、IDB rows、抽样与 localStorage 增量均为 0。Z 链另有源码保护。

剥除精确三 import 与追加完整提示块后，GameScene 与 cc3f1d5 的全部字节相同。Forge 原提示文案、颜色、距离、隐藏对象、无对象安静、匹配规则及顺序保持。为让既有 forge-open 冒烟兼容新增第二条日志，仅把两处原 Forge 日志索引前移一条，并追加两条精确 Enhance 提示断言；原 Forge 开/关态、Gate 拒绝原文和颜色断言全部保留。enhance-closed 精确剥除两条新增断言并恢复两处索引后，继续核对旧 Forge 测试完整 SHA；未跳过文件。forge-closed/market-closed 仍校验原 Forge 方法 SHA 与旧完整 Scene SHA。

## 双图与 O 表

双根 shared/snapshot 各 14 个隔离 SSR 图，共 28 图：正式开态→内存关态→fresh 正式→带历史 fresh 内存关态，外加九种坏表正式图和一个坏表内存关态图。正式图 22 张，完全不注入 Flag，flagLoads=0；内存关态图 6 张，仅 resolve/load 注入 false，flagLoads=1。features 覆盖调用全部为 0。

open 总 6225 断言（静态 563 / 运行 5662）；每根正常表四图依次 1522 / 281 / 128 / 498。九类坏表各 16、坏表关态 258。正式图含 O01–O08 全部夹具授权结算路径；memory-closed 八 tip、重复/并发请求与历史袋零增量。带历史关态图各有 3 次测试准备 importSave 写入；每个 Gate 调用单独比较操作增量均为 0，不表示关态业务提交。

closed runner 每根先独立无注入验证正式 true / flagLoads=0，再 memory-closed false / flagLoads=1 跑 C01–C12 和 fresh 读回；30711 断言、90 语义夹具、7560 次原 API 调用。另逐一验证 Gate 八入口匹配原八 tip，存档与存储写入、写哨兵增量全 0，未削弱原数量级。

EnhanceGate / EnhanceProgress / Progress / EnhanceClosed 字节全部不变。enhance.json levels/maxLevel/statPerLevel/milestoneBonus 仍为唯一数值源；没有夹具费用概率回退。默认没有 fixtureInstances 授权时新 submit 继续 `enhance.fixture.selection` 拒绝，不从数量发明装备实例。默认拒绝证据 defaultGateDenied.submitDenied=true、saveWrites=0；历史袋也不能授权新请求。laterService 正式开态仍返回 `enhance.closed.later_service`。未落地正式装备实例系统或战斗属性消费者。

| O 表 | 本窗正式开态自动化旁证 |
|---|---|
| O01 | 正式磁盘 true、feature/entrance 只读允许；真实 GameScene.prototype 同次 smith_ou 命中先打造再强化。weapon/armor 仅以 fixtureInstances 显式授权选择；默认未授权新 submit 拒绝。 |
| O02 | weapon/armor 各覆盖正式 12 行成功；唯一 to 行提供 rate/stones/refineStones/dropOnFail；完整费用、升档、最终属性、结果引用及去重事实同次提交。 |
| O03 | 正式 12 行均覆盖 useProtectCharm=false 正常失败；to≤5 不掉，to≥6 掉 1 级，照扣费用、不碎装；等级、属性、结果与保存一致。 |
| O04 | items 缺护器符正式映射与消费依据，useProtectCharm=true 必须整次拒绝，零扣费零抽样；未测试“有效护符保级成功”，未编造 item。 |
| O05 | 成功、低档失败、高档失败三份载荷 export→importSave→restore→真实 SaveStore/IDB load→fresh SSR 一致；历史请求重放不重抽、不重复扣费或升降级，跨槽隔离。 |
| O06 | 满级、非法/过期/非当前档实例、越界、重复授权、缺行/重复行、坏配置/依赖和资源不足整次拒绝。九类坏表只经独立 SSR 内存模块替换；正式表未写。 |
| O07 | 同 Gate 连点、多 Gate 共享 Progress、同装备并发、共享库存争用与提交中断覆盖保留。真实事务 complete 前不发布，abort/扣除失败/哨兵异常保持原合法状态，至多一次完整结果。 |
| O08 | 内存关态图八 tip 首旗拒绝，无袋、旧 pending/unknown/异常袋及三种完整历史资产不补做、不归零。合法历史读回保留，歧义拒绝导入及写操作，不自动修档。 |

## 自检

以下全部 exit 0；共 113602 条自动化断言（含追加 forge-open 回归），不是 release 验收。日志均在 `qa/out_v06p1_enhance_open_preamble/`，selfcheck.json 为聚合旁证。

| 检查 | exit | 断言 / 结果 | 日志 |
|---|---|---|---|
| `npm run test:v06p1-enhance-open` | 0 | 6225 | `v06p1-enhance-open.log` |
| `npm run test:v06p1-enhance-closed` | 0 | 30711 | `enhance-closed.log` |
| `npm run test:v06p1-forge-closed` | 0 | 20362 | `forge-closed.log` |
| `npm run test:v06p1-market-closed` | 0 | 24166 | `market-closed.log` |
| `npm run test:v06d-closed` | 0 | 15052 | `v06d-closed.log` |
| `npm run test:v06c-closed` | 0 | 10708 | `v06c-closed.log` |
| `npm run test:v06p1-forge-open` | 0 | 6378 | `forge-open.log` |
| `npx tsc --noEmit` | 0 | PASS | `tsc.log` |
| `PYTHONDONTWRITEBYTECODE=1 python3 /workspace/xiantu/qa/tools/datalint.py（shared）` | 0 | 问题 0 条 | `datalint-shared.log` |
| `PYTHONDONTWRITEBYTECODE=1 python3 /workspace/xiantu/qa/tools/datalint.py（snapshot）` | 0 | 问题 0 条 | `datalint-snapshot.log` |
| `git diff --check` | 0 | PASS | `diff-check.log` |
| `protection SHA before/after and path-set comparison` | 0 | 未授权差异 0 | `protection.log` |

## 禁改旁证

写前/写后 `qa/out_v06p1_enhance_open_preamble/protected-before.json` / `protected-after.json` 覆盖三根全部 balance/maps 文件与目录集合、features 存在或缺席、wt/dev 和 game 全部 src、wt/dev scripts/package/tsconfig，以及旧强化 closed/open_fixture 的所有文件（含待审未跟踪产物）。共 1565 项、11 组目录，1557 项不变、8 项授权源码/测试差异、**0 未授权差异、0 目录集合差异**；详见 protected-diff.json / protection.log / authorized-source.diff。

8 个文件为 EnhanceOpenFlag、GameScene、enhance open TS/runner、enhance/forge/market 三个 closed runner、forge open TS 的两处日志兼容。保护范围未加入例外数据表；EnhanceClosed 与 64c26a4 完整字节相同。

| 保护项 | 写前=写后 SHA-256 |
|---|---|
| enhance.json（三根） | `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954` |
| recipes.json（三根） | `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` |
| ForgeOpenFlag.ts | `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` |
| ForgeGate.ts | `44f556147408019188da0cd793076993491653d62e7e9996c67a20303ecbee86` |
| EnhanceClosed.ts | `c52ffbfc269f3a41c309184d9781f23cf2511d5acec7570ebb44b84683b3e821` |
| EnhanceGate.ts | `4ef1018348b5927259892c5d84513a8a530f72ef0d719c7ebe8ecd6ab304d096` |
| EnhanceProgress.ts | `92393de87d71fe2d02a35adeb52bbca359df66f13284f51df9eee616e6a8d822` |
| life_skills.json（三根） | `204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b` |
| npcs.json（三根） | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6` |
| shops.json（三根） | `4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2` |
| quests.json（三根） | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b` |
| strings_zh.json（三根） | `92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab` |
| features.ts | `ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130` |
| data.ts | `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a` |
| ShopPanel.ts | `419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c` |

GameScene：`294b934b52a8b6537214360fffb93497643ce8261bea03aba8caf405cf5fcedf` → `9b62f76b8a3e76b2438cfacf42d9fe15525f50a9a0427eab25d5c10d6de119f3`（仅授权追加提示）。EnhanceOpenFlag 新 SHA：`d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e`。

旧 `qa/out_v06p1_enhance_open_fixture/` 与 `qa/out_v06p1_enhance_closed/` 的路径与字节完整保留。本窗三个 closed runner 只输出新目录子路径；6d/6c 与补跑 forge-open 先备份旧输出，复制本次 evidence 后恢复原路径集合与 SHA，均验证一致。未纳入 pending art、dist-test、旧 qa/out_*、talisman 审计、codex_prompt 或 codex_launch 原始日志。

## 提交、同步与下一棒

HANDOFF/RESULT 与 ≤30 行四段 status 已以 UTF-8 同内容同步 `/workspace/xiantu/reports/炼器阁/` 和 `/workspace/xiantu/status/炼器阁.md`。Codex 日志：`/workspace/xiantu/logs/codex/0773028038367e79_20261017_084947_1228831.log`。

无 smith_ou.services、无完整强化 UI/提交面板、无 ShopPanel 接线、无 dialog/quests/地图/NPC 改动；打造 soft-open 未回退，三根 gifts 均 10×false，GAME_PHASE=5。无 #20 gathering/阵法/拍卖/坊市混窗，无 6b/6c/6d 开态窗。未运行 build/snapshot/sync/release，未进包、打 tag、Pages 发版；没有 force-push/reset --hard。

下一棒：交执法堂针对实现 tip `ff90d189fa4688506986ff4aa3180343e1aacbd2`，在正式开态图按 design/26 §4.3 重抽 O01–O08 + 真实 smith_ou 入口冒烟，并核验默认授权拒绝、护符必拒、memory-closed 八 tip 零写与保护 SHA。本程序 PASS 不代执法勾选；执法 PASS≠进包≠release，仍须负责人另令。
