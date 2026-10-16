# P1② 坊市寄售开态夹具交接

- 时间：2026-10-17 04:05:45 CST；工作目录 `/workspace/xiantu/wt/dev`；分支 `dev`。
- TIP_SHA（实现及自检对象）：`189fe4cab72902f2eddd57df8137f946671dbbd2`；分支最终 tip 为其后的交接文档提交，见最终回报。
- 开工已执行 `git fetch && git pull --ff-only origin dev`，基线 `9258487a1e8d2740e0917c49f32fdcb54b9ea4c2`；保留关态 tip `9258487` / 实现 `203cd42`。
- 依据：负责人开态夹具令、design/23 §5 O01–O10 / §2状态机 / §2.4字段；对齐6d当时「正式关 + SSR内存开」，不沿用目前塔的正式true。
- 本交付为程序自检，交执法堂复核；PASS≠soft-open≠进包≠release≠发版。

正式磁盘旗标 `src/MarketOpenFlag.ts` 为：

```ts
/** 正式恒关；仅 Vite SSR 开态夹具图可由 resolve/load 内存模块注入 true。 */
export function isMarketOpenForFixture(): boolean { return false; }
```

`MarketGate` 八入口 feature/listItem/withdraw/settle/claim/rewards/loadProgress/slotOrItem 第一项检查均为上述旗标；false 原样返回 `MarketClosed` 对应八 tip，不读资格、不调用时钟/随机/承载依赖、不进入事务。正式图对无袋、歧义袋及真实四态旧单据验证整档、inventory、stones、引用/栏位/收据及既有存档零增量，写入入口哨兵遇调用即抛错。正式首图每根152条断言且存储写0；正式刷新图每根329条断言，其4笔提交仅为逐态 importSave 准备历史档，Gate拒绝增量均0，抽样0。

`MarketGate` 只由新测试导入，未改 GameScene 或 ShopPanel，未连城镇对象/NPC/shops，未运行构建或部署。生产 Progress 仅引入纯结构 `MarketProgress` 校验，没有对寄售数值表或成交 Gate 的运行依赖；快照缺表不影响原有商店/存档图。

shared 与 snapshot 各有独立正式图（不注入旗标）及开态夹具图（仅 resolve/load 虚拟旗标返回true）；再各建新SSR图读回四态，合计8次独立建图。模块、SaveStore及内存IDB均隔离，无 sync、snapshot、磁盘配表改写或 features 覆盖调用。现有 shared/game `market_consign.json` 同字节且 enabled=false；wt/dev/data 原本缺表，保持缺席。snapshot四图内仅由SSR虚拟模块只读装入共享原表的完整内容，不修改enabled、不生成快照；因此本次不宣称已验证独立快照寄售参数随包分发。

全部定价/费率/波动/时限/收益/容量只读演武表：玩家价按 `items.price × [0.5,2.0]` 钳制，费率0.06，波动0.15，最短等待1800秒，离线窗28800秒，容量5。成交时抽样一次marketFactor并保存成交事实；`reward = listingPrice*(1-consignFee)*marketFactor`，领取与重试不重抽，不新增取整规则。未读取solo_pacing或GDD占位作为寄售参数。

| 编号 | 自动化结果与边界 |
|---|---|
| O01 | 开态feature允许只读说明；Gate独立于shops，未接前台。真实城镇入口、美术和实机交互未验，属最小服务夹具。 |
| O02 | 空栏上架扣离一份永久可用库存，建立新listingId/held引用/栏位；同份重复与多Gate并发上架仅扣一次。 |
| O03 | 撤回返原配置的一份、held disposition=returned、终态留存并释放栏位；重复不二返，新单不复用listingId。 |
| O04 | 等待不足拒绝；达到表中时限后显式系统回调只转sold_pending_claim，held=departed、唯一待领与成交引用同次保存，不自动领取。 |
| O05 | 领取发stones、收益claimed标记、claimRef同次提交；释放活动栏位；重复及读档后重复不重发。 |
| O06 | 无物、非法id/份额/价格、未授权品类、满栏、已成交撤回、无可领/外来单据均给market.fixture业务拒绝并零写；listed+pending合计占5栏，领取后可再上架。 |
| O07 | 返物哨兵拒绝保留listed，收益哨兵拒绝保留pending；四类写操作均用真实IDB后端测试request成功但complete前不发布，abort保留完整内存/旧档，随后重试成功。 |
| O08 | 两个Gate共用真实Progress，撤回先达与成交先达分别仅一笔提交，终态/重复系统与离线回调不二返或重生收益。未声明跨浏览器标签页的存储仲裁能力。 |
| O09 | listed/withdrawn/pending/claimed分别exportSave→importSave→restore→异步load及fresh SSR保持状态、引用/资产与去重事实；slot1/2账本与外来listing隔离，刷新终态再重放不发物/收益。 |
| O10 | 缺身份/引用、未知状态、重复单、损坏收益、非法栏位/收据等拒绝写入且保原；纯结构损坏档import失败不覆盖当前档，表语义错误由Gate拒绝。真实四态旧单带入正式关态图仍八tip零写，不借读档推进。 |

份额与承载降级：当前背包仍为配置id→数量，夹具用 `itemId#正整数` 表示可追踪份额；同配置历史份额不复用，撤回后的物品可赋新份额身份复挂。这不是正式物品实例schema。只有显式 `fixtureAllowedItemIds`（测试为rabbit_fur/wood_sword）获准，本地默认拒绝所有新上架；未制定正式可寄售品类。已有品质桶、qualityEnabled、装备中配置及含试炼临时物的同配置份额拒绝，避免丢失不能表达的属性。held/pending历史引用不清空，分别以returned/departed与claimed标记终止可返/可领资格，保留收据去重。

当前Progress没有背包格数上限；O07满包和收益承载拒绝使用夹具哨兵，未臆造「灵石占格」。存储介质使用6d式内存IDB工厂，执行真实createIndexedDbBackend的complete/abort路径，未验真实浏览器介质、刷新崩溃或截图。计时为受控毫秒时钟与显式回调，在线最短等待和离线 `min(实际时间差,传入时间,寄售专属窗)` 均受测；没有生产计时器、离线调度、关态补算、自动领取或写队列。

`Progress.ts` 仅新增4行：类型/校验import、validSaveData校验、注释及可选market字段。缺字段旧档保持undefined且export不补袋；已有袋通过真实export/import/restore机制保存。未知或损坏字段不自动转empty、不补偿、不清空。旧closed套件仅扩展四个精确源码允许项、钉新Progress SHA及两条已授权market字段扫描豁免，原消费者全量扫描、八零参API、零副作用、shops/gifts/strings保护均保留；另增加现有演武表SHA/缺席与false守护。

写前/写后262项保护：三根全balance/maps JSON、features/缺席、GameScene/ShopPanel/data/Progress/TowerOpenFlag/MarketClosed等，261项字节/缺席不变；唯一授权差异是Progress四行新增。目录集合无新增/删除JSON。完整旁证为 `protected-before-task.json`、`protected-after-task.json`、`protected-diff.json`。专项运行另守护265项不变。

| 关键保护 | SHA-256 / 结果 |
|---|---|
| shared/game market_consign.json | `5bd59bbed50ea437c96e9e3b6712e68fed7d956bfc02c8c21b322e856b93bed1`，enabled=false；snapshot缺席不变。 |
| 三根strings_zh.json | `c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27`，920键及八tip原文不变。 |
| 三根shops.json | 写前/写后相等，仍NPC货单；逐根SHA见before/after。 |
| 三根npcs.json | `2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6`，每根gifts 10×false。 |
| Progress.ts | before `3ca4967394c7b3a5cceaf0afdf4f4b7ce66450e49c639323e6645d33c536238d` → after `3e1f4a258b384d5f0d1a2967d0228fcd792cb9a58979efcd5648d9baf9f2e7da`。 |
| GAME_PHASE / features / 禁改域 | GAME_PHASE=5；features未改；solo_pacing/tower_*/titles/quests/secret_*/companions/fly_zones等SHA不变，未混6b/6c/6d窗。 |

| 自检 | 实际结果 |
|---|---|
| npx tsc --noEmit | exit0。 |
| npm run test:v06p1-market-open | exit0；2435断言（静态367+运行2068）；每根正式152+开态488+开态刷新65+正式刷新329。 |
| npm run test:v06p1-market-closed | exit0；24075断言，7920 API调用，Gate外既有八API全部零存储写；977项原保护仍验。 |
| npm run test:shop | exit0；596断言。 |
| npm run test:v06d-closed | exit0；15043断言。 |
| npm run test:v06c-closed | exit0；10707断言。 |
| 指定datalint.py，共享根 / wt/dev/data | 均exit0，均问题0条；PYTHONDONTWRITEBYTECODE=1。 |
| git diff --check | exit0。 |
| 写前/写后SHA与目录集合 | 通过，0未授权差异；market表同字节且false，快照缺席不变。 |

全部日志与JSON证据：`qa/out_v06p1_market_open_fixture/`；before/after/diff、两套专项evidence与selfcheck纳入交接，原始log留工作区。未纳入art pending、dist-test、旧qa/out_*、talisman审计、codex_prompt或本地辅助脚本。报告及≤30行状态UTF-8副本同步到 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。实现与交接两笔普通提交，普通推送 `origin dev`，禁force/reset --hard。

下一棒：执法堂按实现TIP_SHA复核O01–O10可自动化部分、上述降级与正式关态旁证；前台入口、正式实例/品类、跨期处理和开放另令。坊市仍关，shops未改寄售，gifts/#20/阵法/炼器一期/拍卖均未启用；本窗不soft-open、不release、不进包、不发版。
