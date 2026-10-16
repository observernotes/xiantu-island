# v0.6 · P1② 坊市寄售 soft-open preamble 结果（不发版）

日期：2026-10-17（Asia/Shanghai）；工作区：`/workspace/xiantu/wt/dev`；分支：`dev`。

- 基线：`131590c31af81bc2fb4f81d00bd15152f2e55ab2`（开态夹具实现 `189fe4c` / 交接 `131590c` 已 PASS，保留）。开工执行 `git fetch && git pull --ff-only origin dev`，结果 Already up to date；已跟踪文件干净，既有待审未跟踪产物保留。
- 范式：对齐 6d soft-open tip `de102e8f8d297907700c7a2b769a4e37968dc006` 及 `reports/炼器阁/V06D_OPEN_PREAMBLE_RESULT.md`；设计只读 `design/23_v06_P1②关态_坊市寄售.md`。
- TIP_SHA：`c01e959406b151b2b2fa17bd9c0909550f9ad58e`（源码 / 测试 / dev 快照表实现提交，已普通 push）。
- BRANCH_TIP（实现推送后 origin/dev）：`c01e959406b151b2b2fa17bd9c0909550f9ad58e`，已由 `git ls-remote origin refs/heads/dev` 核验；随后仅追加本报告、status 和 QA 证据的 docs tip，最终 BRANCH_TIP 见交付回执与远端 dev；文档补录不改源码或表。
- Blocker：无程序自检阻断。**本窗是 soft-open preamble，不是 release、发版或进包；待执法堂冒烟，PASS 后也不自行 release。**

## 正式开态与关态夹具

`src/MarketOpenFlag.ts` 现为：

```ts
/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */
export function isMarketOpenForFixture(): boolean { return true; }
```

该文件 SHA-256：`c56249abe10afc6db77d9aebbe28e0656229606f5b2ecb636ed24239729ca59b`。`MarketGate.validRules()` 仅将 `rules.enabled === false` 改为 `rules.enabled === true`，其余数值校验与事务实现不变；所有入口仍首先拦截内存关态并返回原 `MarketClosed` 八 tip。

- open runner：shared / snapshot 各先 `formal-open`（磁盘与 SSR 均 true，无 flag 注入，flagLoads=0），再 `memory-closed`（SSR 虚拟模块 false，flagLoads=1）；随后各建新 SSR 图，按相同顺序读回 listed / withdrawn / sold_pending_claim / claimed 四状态，合计八图。每根运行断言 505 + 169 + 82 + 346 = 1102；双根主体 2204 + 静态/保护 373 = 2577。
- closed runner：每根先无注入验证正式 flag=true，report `v06p1-market-closed-formal-graph` / `formal-open`，再内存 false 跑原 C01–C12 自动化与独立 SSR 刷新；每根 33 + 22 个行为夹具，双根 110 个，八 API 调用总计 7920，存储写入 0。C12 仍保护原有源码与禁改表，不以 soft-open 放宽其他域。
- 两套聚合 evidence 均为 `formalOpen:true`、`closedFixtureOnly:true`、`softOpened:true`、`released:false`；已移除 `memoryOpenOnly` / `fixtureOnly` 开态表述及正式关态误称。关态 legacyFixtureOnly 仅说明旧单据测试字段，不代表内存开态。
- 开态 O01–O10 的上架、撤回、成交待领、领取、异常 / 重复 / 竞争、跨档、四状态刷新、IDB complete 前不发布与 abort 回滚覆盖保留。内存关态八入口优先拒绝，不求值时钟 / 随机 / 承载哨兵，不发物或收益，不推进单据。
- 内存关态刷新图的每根 4 次提交只用于 importSave 准备四状态旧档；Gate 拒绝与 Scene 冒烟增量均 0，抽样 0；不是关态产生业务写入。

## 演武翻表与前台最小接线

写前记录：shared / game 均 `enabled=false`，SHA=`5bd59bbed50ea437c96e9e3b6712e68fed7d956bfc02c8c21b322e856b93bed1`；wt/dev/data 缺表。取证后观察到演武共享与 game 交接表已翻 `enabled=true` 并更新获准的 meta.status 软开说明，本窗随接并将其原样复制到原缺席的 dev 快照；未覆盖或重写演武数值。

三根最终同字节：

| 根 | 文件 | enabled | SHA-256 |
| --- | --- | --- | --- |
| shared | `/workspace/xiantu/balance/market_consign.json` | true | `e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde` |
| game | `/workspace/xiantu/game/data/balance/market_consign.json` | true | `e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde` |
| snapshot | `/workspace/xiantu/wt/dev/data/balance/market_consign.json` | true | `e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde` |

`market-flip.json` 和 `market_consign.before.json` 提供前后字节旁证；反向还原 enabled 与 meta.status 即命中写前 SHA。除这两字段外，所有 JSON 内容相等；rationale 保持原样。listingPrice 自定价参考 items.price、[0.5,2.0] 倍钳制，consignFee=0.06，swing=0.15，saleDelaySec=1800，offlineSettlementWindowSec=28800，rewardAmount 公式 / 市场因子与 slotCapacity=5 均只读演武原定值，未抄 solo_pacing 占位。

GameScene 只增加三个 import、`tryInteractMarketConsign()` 与 Z / 通用交互链调用。只查询当前地图既有 name=`market_consign_entrance` 或 `fangshi_consign` 的可见对象，28×40 范围内才消费交互；无对象安静 return false。本窗未增加地图对象或改 maps JSON。flag=false 显示 `MarketClosed.featureClosed()` tip；true 仅调用 `new MarketGate(this.prog).feature()`，允许时 log「坊市寄售已开放。」，拒绝时 log 原拒绝文案。入口与塔同级且位于 talkNearby 前，无完整寄售 UI / 上架交互面板。

SSR 以真实 GameScene.prototype 冒烟：无对象、NPC 商店、横纵超距、隐藏对象、双别名、正式开态 / 内存关态 tip、Gate 拒绝路由与通用交互顺序均通过；各图 Scene 存档写入 0。Z 链由源码断言核查。C12 精确剥离该方法、三 import 与两处调用后，GameScene 仍命中原 SHA，不跳过保护。

表 meta.status 中“仍未接线”保留演武交接字节，此处指完整玩法入口尚未接入；本窗仅冒烟最小接线。正式品类未新增，默认无 fixtureAllowedItemIds 的 Gate 仍拒绝所有新上架；沿用前窗 itemId#序号份额模型、内存 IDB 工厂与承载哨兵，未声明完整物品实例、跨浏览器标签仲裁或实机全流程验收。无生产计时器、离线调度或自动领取。

## 自检

以下命令均从 wt/dev 发起，exit 0；日志全部归 `qa/out_v06p1_market_open_preamble/`。

| 检查 | 退出码 | 结果 / 断言摘要 |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | PASS；最终源码 / TS 测试编辑完成后复验 |
| `npm run test:v06p1-market-open` | 0 | PASS；2577 断言，formal-open + memory-closed 双根与四状态刷新；GameScene 冒烟零写 |
| `npm run test:v06p1-market-closed` | 0 | PASS；24112 断言，C01–C12 自动化、正式图 / 内存关态 / 刷新，7920 API 调用零写 |
| `npm run test:shop` | 0 | PASS；596 断言，NPC 商店语义保持 |
| `npm run test:v06d-closed` | 0 | PASS；15044 断言，保留塔 soft-open 及内存关态 |
| `npm run test:v06c-closed` | 0 | PASS；10708 断言，保留既有 soft-open 及内存关态 |
| `PYTHONDONTWRITEBYTECODE=1 python3 /workspace/xiantu/qa/tools/datalint.py`（共享根 chdir/runpy） | 0 | PASS；问题 0 条 |
| 同上（wt/dev/data chdir/runpy） | 0 | PASS；问题 0 条 |
| 写前 / 写后保护 SHA | 0 | PASS；1121 项，1114 不变，7 项授权差异，0 未授权差异；三根表同字节 |
| `git diff --check` / 提交前 cached diff | 0 | PASS；源码 / 表及报告 / status / QA |

datalint 由 Python `os.chdir()` 后 `runpy.run_path('/workspace/xiantu/qa/tools/datalint.py', run_name='__main__')` 适配相对路径，并额外断言 `P` 为空；两根均检查物品50、怪物27、任务35、NPC27、地图24、秘境房间25，问题0条。未运行 build / snapshot / sync / release。

日志：`tsc.log`、`open/agent-validation.log`、`closed/selfcheck.log`、`shop.log`、`v06d-closed.log`、`v06c-closed.log`、`datalint-{shared,snapshot}.log`、`diff-check.log`、`protection.log`。聚合记录 `selfcheck.json`；专项 evidence 位于 `open/v06p1-market-open-evidence.json` 与 `closed/v06p1-market-closed-evidence.json`。

## 翻旗前后保护 SHA

完整 before / after 覆盖三根全部 balance / maps JSON、features 存在或缺席，以及 wt/dev 与 game 的所有 src 文件，共1121项。1114项不变；7项授权差异为三根 market_consign 表及 wt/dev 的 MarketOpenFlag / MarketGate / GameScene / open TS 测试。两 runner 的 diff 随实现提交可审。`protected-diff.json` 无未授权变更，`authorized-source.diff` 留存源码授权差异。game 源码未改。

| 关键文件 | 写前 / 写后 SHA-256 |
| --- | --- |
| 三根 shops.json | `4da7ad757130f4a9c6ee12f2b7b45e4ebd21283193a2529c5aea933fdd6a5cb2`，不变，仍 NPC 货单 |
| 三根 npcs.json | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6`，不变，各10处 gifts.enabled=false |
| 三根 solo_pacing.json | `cf4aabe15efcdec8b4d1e4448b931a1cf31b970c0fa175fd6e339d12ca59da3f`，不变 |
| 三根 tower_floors.json | `735000b538b06142053fc2aa8e106a1e9e4f500755712b4df095e690b80c37b6`，不变 |
| 三根 titles.json | `d765004ff1c75e11c0f64bc05d5eb07b96b00122264692140c01233df96fdb8c`，不变 |
| 三根 quests.json | `c45466827247b9e61260bbd2b681ae7207bf84a017aff5d8b028c0ec3463482b`，不变 |
| 三根 strings_zh.json | `c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27`，不变，920键及八tip原文保持 |
| wt/dev ShopPanel.ts | `419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c`，不变 |
| wt/dev Progress.ts | `3e1f4a258b384d5f0d1a2967d0228fcd792cb9a58979efcd5648d9baf9f2e7da`，不变 |
| wt/dev GameScene.ts | `2b3ffc4e33a80ee1571210a37490d4603a1cfba3c3a97a677e6899675d46ec10` → `1279682ae18633aec1c0032d5a30d484f2e6de05deba34c2c80a9a423a203047`，仅授权最小接线 |
| features.ts / data.ts | `ff1cce0e298eeb57e5052048220b56f9490d3e172fbeab5ba9dc9f755c45e130` / `aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a`，不变 |

companions / fly_zones / 全部 secret_* / tower_* / features.json / maps 等逐根 SHA 详见完整清单，原有根间差异保持；共享 features.json 仍缺席。GAME_PHASE=5，indexedDbSaves=true，6b/6c/6d soft-open 不回滚。

清单自身 SHA：before=`c6aec924c28424afaf21679d3651ed4a9d25d6d12d27eae0d8dd0cedfaaae60b`；after=`dc8f9d3b2b5c0fa345499bbd06ac280390ba80f845af45017d9b0869d22d4b9c`。

## 边界与执法堂三行交接

实现提交只含旗标 / Gate / GameScene / 两 runner / TS 测试 / dev 新表，后续 docs 提交仅报告 / status / 本窗 QA JSON 与保护脚本 / 差异旁证。未纳入 art pending、dist-test、旧 qa/out_*、talisman 审计或 codex_prompt。未改 shops/npcs/solo_pacing/tower_*/titles/quests/secret_*/companions/fly_zones/features/strings，不抬 GAME_PHASE，不混 gifts/#20 gathering/阵法/炼器一期/拍卖。未执行 release、进包、Pages、force-push 或 reset --hard。

报告与≤30行 status 同步 UTF-8 副本至 `/workspace/xiantu/reports/炼器阁/V06P1_MARKET_OPEN_PREAMBLE_RESULT.md` 和 `/workspace/xiantu/status/炼器阁.md`；本窗 QA 位于 `/workspace/xiantu/wt/dev/qa/out_v06p1_market_open_preamble/`。实现已普通 push；文档 tip 普通 push 后再次 ls-remote 核验，最终 SHA 见交付回执。

【执法堂 1/3】TIP_SHA=c01e959406b151b2b2fa17bd9c0909550f9ad58e，P1② 坊市寄售 soft-open preamble；按 `test:v06p1-market-open` / `test:v06p1-market-closed` 冒烟，程序自检2577 / 24112条通过。

【执法堂 2/3】formalOpen:true；closedFixtureOnly:true；softOpened:true；released:false；正式 flag / enabled=true，三根表 SHA=e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde；关态仅SSR内存false；shops仍NPC货单、gifts10×false、GAME_PHASE=5。

【执法堂 3/3】核对前台无对象安静no-op及邻近入口tip、四态刷新与零增量旁证；无完整寄售UI。本窗不release/进包/发版，PASS后也不自行release；后续动作另令，禁混gifts/#20/阵法/炼器一期/拍卖。
