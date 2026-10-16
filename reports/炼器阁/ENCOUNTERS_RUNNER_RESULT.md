# 奇遇一期「真实 runner」RESULT

执行：炼器阁·主程序 Codex sol；2026-10-16，Asia/Shanghai。覆盖写入本报告。

- 工作区：`/workspace/xiantu/wt/dev`，分支 `dev`。
- 合入前基线 / `origin/dev`：`999cd9c22c18ec07b53143ae35c0ad8fd7f5261f`（`999cd9c`）。包含开态准备 `f0da58a`、RESULT `02b57e2`、UI `feat/ui-encounter@5ccb9c7`。
- runner 实现 tip：`cd9b71b0ffcb0bdf6c24022f3f2a36b25086056c`（`cd9b71b`），`feat(encounters): wire transactional runner and UI`。
- 本报告与状态另作文档提交；最终交付 tip 全量及短 SHA 见本轮 stdout 末尾和 `git rev-parse HEAD`，避免文档自引用提交 SHA。
- 结论：**可交执法堂做 runner 内存开态 / fixture 抽检**。概率、事务、扣药、真实 Progress 与 UI 联调已通过；正式五事件及其他指定门禁仍关。实体战斗、机关、扫描、地图布点和持续打坐玩法尚未完成，不能据此认定五事件已可正式全玩法开放。
- 依据：`/workspace/xiantu/design/09_奇遇一期.md`、`reports/炼器阁/ENCOUNTERS_OPEN_PREP_RESULT.md`、正式奇遇表及 `solo_pacing.encounter`；奖励取当前正式表，不取设计稿历史提案。

## 做了什么与开态矩阵

所有开启均在测试内 `structuredClone` 正式导入数据，再经 `parseEncountersConfig` 走真表资格与脚本路径；未写回 JSON。五事件 18 个结局全部沿真实步骤可达性运行，涉及挑战的步骤由受信 stub 回报。

| 事件 | 真实触发 / 概率引用 | runner 开态覆盖 | UI / 运行时边界 |
|---|---|---|---|
| `enc_stranded_cultivator` | `map_enter` / `baseChancePerMapEnter`；`lingxi_path` | `fight→rescued`、`medicine→aided`、failed、missed；medicine 预检并扣 `hp_pill_small×1`，与 exp900、善恶+1、待消费 hooks、冷却及 attempt 同事务 | medicine 经真实 Runtime + Progress + UI 联调，包含品质分桶、存储失败、重复提交；救援刷怪由 stub 回报 |
| `enc_fragrant_herb` | 同上；`wanyao_outer_2` | `guard→leaf→preserved`、`guard→root→uprooted`、failed、missed；挑战前不能直接选采摘结局 | 护草战由 stub 回报；材料/修为与 once 按真实表提交，未改常驻采集 |
| `enc_hidden_abode` | 同上；`wanyao_outer_1`；reveal=`spirit_scan` | 抽中即占额/记冷却，未显形无 offer、不记 seen；reveal 后经子场景/机关 stub 到 taken、sealed、failed、missed | 只有受信 `reveal` / `completeChallenge` 接口；未接正式扫描覆盖、洞府小图或机关实体 |
| `enc_sage_advice` | `meditation_tick` / `sageAdviceChancePerMeditationMin`；`qingyun_village`；`intervalMs=60000` | 不进进图池；连续有效 tick 一分钟作独立概率；steady→enlightened、power→failed、leave→missed；悟性 +1 进入真实 `stat('insight')` 并可读档 | Runtime 注册真实打坐 provider 才就绪；fixture 驱动 provider，抽中调用 stop 一次。当前工程尚无持续打坐玩法，默认不入池 |
| `enc_demon_whisper` | `map_enter` / `baseChancePerMapEnter`；`luoxia_town` | accept→accepted、refuse→refused、leave→missed；道心/善恶同事务即时兑现；交互前道心门槛再检查，拒绝不做抵抗概率 | 无城镇刷怪或正魔转职接线；动态道心超门槛不能借已抽中 offer 继续接受 |

公共抽取：先过滤地图、等级、任务 done、正式拜宗、功能、境界/道心、冷却和 once。进图只作一次共享判定 `clamp(0.08 + luck×0.002, 0, 1)`；气运接口未接，GameScene 显式传 0，不借悟性或善恶。成功后另用一次 RNG 按 `weight/总权重` 选事件，失败不逐事件补掷。打坐独立概率为 `0.005`，不叠进图概率或气运。

两类触发共用正式 `maxPerMapEnter=1`；隐藏、拒绝、失败均不退名额。冷却取事件表 `cooldownMs=1800000`，抽中时写入，终止时取 `max(旧到期, 终止时间+cooldownMs)`；同 attempt 重发不再写盘、扣药、发奖或延长冷却。

## 运行时边界与交付文件

- `src/EncounterRunner.ts`：确定性可注入 RNG、共享概率与权重、visit/active 生命周期、资格过滤、步骤/选项可达性、扣料、结算、seen、恢复与统一失败事务重试。测试使用序列 RNG 和固定种子，不依赖真随机。
- `src/EncounterSceneRuntime.ts`：GameScene 与 fixture 共用的实际适配器；接真实 Progress 存储、打坐 provider、锚点/距离、offer/step/result 与 UI 选择事件。
- `src/scenes/GameScene.ts`：挂入进图、逐帧 tick、受击/死亡、显式离图及交互。仅识别已登记且事件 id 匹配的 `encounter_anchor`/`hidden`；当前正式地图无这些锚点，开态抽中也不借出生点显示或冒记 seen。
- `src/EncounterUi.ts`：消费带 attemptId 的 runner offer，提供继续、鼠标/数字选项和结果文案。缺药在展示与点击时都复查永久库存；结果/关闭没有发奖入口；关闭只收展示、保留原节点。走近只显示标记，主动交互才开面板。
- `src/Progress.ts`：新增奇遇存档字段、永久悟性读取和 runner 快照提交适配；未使用时字段为 undefined，不改变旧档序列化形状。药走既有 `removeItem` 同步品质账本；修为走 `gainExp(...,'quest')`，沿既有升级/突破溢出池规则，不直接把裸 exp 写进真实角色。
- `src/Encounter.ts`：补一期触发类型与 chanceRef 配对、打坐正整数间隔、合法物品消耗和援手扣药门槛校验，坏表停止奇遇，不猜概率或药物数量。
- `src/encounter-runner.test.ts`、`src/encounter-ui.test.ts`、`src/encounter.test.ts`、`scripts/encounter-runner-test.mjs` 与 `package.json`：沿既有 Vite SSR、独立进程数据模式及只替换 Phaser 显示对象分配的脚本风格扩展验证。

事务口径：触发一次提交 visit、entryChecked、名额、active 和冷却，未中也保存本 visit 已检查；节点推进各自原子提交。medicine→aided 在一笔事务中固定下一节点/pendingOutcome、扣药、发奖、写 hooks/attempt/冷却并清 active。任何保存 false/抛错都回滚完整内存，localStorage 不留下半份结算；事务回滚也保留原先 undefined 字段并删除新加字段。已确认动作的失败草稿在本 runner 内保留，按原 RNG/原动作重试；外部存档已改变时拒绝覆盖旧快照，再基于新档处理。

关闭失败事务的面板或死亡结算失败，不会因后续 action 不同而卡在 pending_save：Runtime 先 `retryPending()`，完成原已授权动作一次，再处理后续操作。关闭尚未选择的对白不产生结算。药一旦在已提交步骤消耗，后续 failed/missed 不退；测试通过内存 bridge 节点证明，未改变正式 medicine 直接 aided 路径。

恢复口径：同 visit 刷新沿原节点/attempt，不重抽；真实换 visit 时原事件 missed 与新 visit 一起提交。当前不能恢复的 battle/puzzle/scene 节点刷新安全 failed，无奖励、不返还已消耗物；thank/claim 等待领奖节点继续可用。once 仅有效结局封存，failed/missed 不封存；重复救援物资可领，永久值及首次关系资格沿既有去重保护。

道心/善恶即时裁剪并结算；正式因果/好感消费未开放，runner 将 karma/affinity 写 `pendingHooks`，payload 不重复包含已应用的两轴增量，入队不冒充 hooksApplied。未打开 affinity、questHooks 或任何正魔入口。

互斥口径：主线对白、演出、突破、试炼及其他模态期间推迟检查；恢复已有 offer 时也遵守 blocked。奇遇面板打开时暂停地图物理/战斗，关闭恢复自有暂停；实时冷却照走。移动、攻击、受击、开窗/对白中断本分钟；暂停、后台不累计，长帧不补时间或补掷。场景 shutdown 只清理展示，显式离图才 missed；离图保存失败取消该次过图。

## 本地验证

以下为最终实现提交前、全部实现文件冻结后的本地结果：

| 命令 / 检查 | 结果 |
|---|---|
| `npm run test:encounter` | PASS；snapshot/shared 各 **1444** 断言，另两模式坏表注入均安全拒绝 |
| `npm run test:encounter-runner` | PASS；snapshot/shared 各 **665** 断言；五事件 18 结局真实步骤、概率/权重、事务/重试、扣药、恢复、独立打坐 |
| `npm run test:encounter-ui` | PASS；snapshot/shared 各 **229** 断言；真实 Runtime + Progress + UI，包含品质账本、结果、悟性、存储故障后关闭/死亡自动恢复 |
| `npx tsc --noEmit` | PASS，0 错误 |
| `npm run test:moral-save` | PASS，153 断言 |
| `npm run test:stats` | PASS，239 断言 |
| `npm run test:mainline-21` | PASS，349 断言 |
| `npm run test:v04-save` | PASS，160 断言，snapshot 旧档 fixture |
| `git diff --check` / `git diff --cached --check` | PASS；最终恢复受保护脏文件后再次检查 |
| 正式文件原始字节 / MD5 / SHA256 | PASS；runner 脚本守护 features 及 snapshot/shared 五表共 11 文件；另任务前后 16 个配置/作弊文件 MD5+SHA256 相同 |

补充覆盖：概率 0.08/0.005 边界、气运缺省与裁剪、1:3 权重边界、进图未中仍可在同 visit 打坐、非法 step/attempt/choice、保存重试不重掷、外部背包变化不被旧草稿覆盖、冷却回拨 max、挑战不能用 UI 继续跳过、未显形占额不记 seen、缺锚点/远距离 0 可见、已打开面板不被逐帧 offer 覆盖、首次 hooks 去重与 once。

## 关态未改证明

features 测前与测后均为：

```text
a06c3638796fd1bed9af3d45c038c954  data/features.json
lifeSkillCurve=false
```

两目录分别检查：`data/balance` 与 `/workspace/xiantu/balance`。表的原始字节、MD5 与 SHA256 均和本轮开始相同：

| 表 / 门禁 | false 数量（每目录） | true 数量 | MD5（两目录相同） |
|---|---:|---:|---|
| encounters 五事件 | 5 | 0 | `d17c551ffcd684846cfad565a49dd75b` |
| #19 gongfa_grades 全部 enabled | 46 | 0 | `1216c1807fbfd6ead71cfadf31bdf66d` |
| #20 qi_density 全部 enabled | 4 | 0 | `76824aef9f71d46206bfb61344abe031` |
| npcs.affinity 及 gifts | 18（9+9） | 0 | `d0c2cea601ab34aa019e845f31926efe` |
| karma_flags.questHooks | 2 | 0 | `604be023b747d28c5be80312e2f85ecc` |

正式五事件在 snapshot/shared 均严格 `enabled=false`：`enc_stranded_cultivator`、`enc_fragrant_herb`、`enc_hidden_abode`、`enc_sage_advice`、`enc_demon_whisper`。未改 features、正式配置表、`GongfaGrades.ts`、`QiDensity.ts` 或作弊入口；未接主线任务推进或正魔转职。

## 执法堂抽检要点

- [ ] 对照合入前基线 `999cd9c`；正式 features MD5 固定，lifeSkillCurve=false；snapshot/shared 五事件 enabled 计数均 0，#19/#20/affinity/questHooks 仍关。
- [ ] 真表关态时 runner enter/tick/advance/choose/terminate/offer 零随机、零存档读写、零可见；抛错 Proxy 上下文也应短路。
- [ ] 仅 `structuredClone` fixture 开启；五事件 18 结局沿步骤运行，战斗/机关/子图只能受信 stub 回报，不能用 UI advance/伪造 choice 跳过。
- [ ] 进图合格池共享一次概率；失败不逐事件补掷；气运默认 0，权重归一；同 visit 成败均不重抽。
- [ ] 打坐 59999ms 不检查、满 60000ms 独立 0.005；移动/受击/对白中断、暂停/后台不累计、无离线补掷；命中停止 provider 一次。
- [ ] map_enter/meditation_tick 共用 1 名额；隐藏未显形也占额/记冷却但无 offer/seen；seen 只在真实展示或受信显形后记录。
- [ ] 无药选项禁用、点击再验；medicine 实扣 hp_pill_small×1，品质账本同步；扣药/奖励/hooks/attempt/冷却同一次真实保存。
- [ ] 注入存储 false/抛错，核触发/节点/结算/死亡/离图完整回滚；关闭失败选择面板后下一帧可恢复原事务，不重掷、不重扣、不重复发奖。
- [ ] 外部库存变化不会被失败草稿覆盖；已提交扣药后失败/错过不退；同 attempt 重发不延冷却。
- [ ] 刷新同 visit 选择/领奖节点可继续；挑战节点按当前 stub 边界 failed；failed/missed 不写有效 resolved，不消耗 once，冷却后可重遇。
- [ ] 真实 Progress 的 gainExp/升级/溢出池、永久悟性 stat 与读档持续有效；道心/善恶即时，karma/affinity 仅排队且不重复增量。
- [ ] 缺正式地图锚点不借出生点展示；走近才见标记、主动交互开面板；关闭不代选，结果点击不发奖；主线/试炼/突破互斥。
- [ ] 识别下列未覆盖项，本报告只交 runner/fixture 抽检，不作为正式 enabled 开启或实体五事件全验收依据。

## 未覆盖项与阻塞项

1. **实体执行器**：未实现救援/护草独立事件怪、800ms 预警、掉落/任务/图鉴/熟练度隔离的实机验证；未实现洞府单室、父子场景实际跳转、土水木机关/宝匣实体。对应 runner 路径均用受信 `completeChallenge` stub，不自动判胜。
2. **扫描与布点**：`reveal` 是受信接口，未接正式神识扫描覆盖；五个地图锚点和事件演员仍待布置，正式地图没有奇遇显示对象。
3. **持续打坐**：当前工程无持续打坐玩法；已提供真实 provider 注册/停止及逐帧接线，默认缺 meditation 就绪，不把突破坐姿或即时闭关年数代入。开态通过 fixture provider 验证。
4. **实机表现**：未跑浏览器 Phaser 渲染/键鼠端到端或性能压测；UI 测试仅替换显示对象分配，runner、Runtime、Progress、读表、翻译及事务是真实模块。
5. **关系消费**：未开放正式 karma/affinity 消费器、好感入口、questHooks 或正魔玩法；pendingHooks 保持待消费。

本轮 runner/fixture 抽检无阻塞项。上述未覆盖项仍是正式全玩法开放的后续工作；本轮未请求或执行开启。

## 提交、工作区与日志

实现提交 `cd9b71b0ffcb0bdf6c24022f3f2a36b25086056c`；本 RESULT 和覆盖状态随后独立文档提交。

原有 MAINLINE_21_WIRE_RESULT、TALISMAN_UI_STRINGS_MERGE_RESULT、UI_TIP_PUSH_82984b9、UI_TIP_PUSH_9cb74b7 及 `data/art/sprites/_pending/secret_rest_r1/` 先限定路径 `stash -u` 保护，文档提交后原样恢复，不纳入本任务提交。用户原有状态稿按本轮覆盖要求替换，覆盖前备份位于 `/tmp/xiantu-encounters-runner-20261016/status-before.md`。

Codex 日志：`/home/box/.codex/sessions/2026/10/16/rollout-2026-10-16T16-36-47-01a143db-4cf3-7131-975d-e1d928594152.jsonl`。最终四项主验证日志与保护文件哈希在 `/tmp/xiantu-encounters-runner-20261016/`。

本轮仅本地提交；未 push / force push、未发版、未合 master、未私聊执法堂。`origin/dev` 保持合入前基线。
