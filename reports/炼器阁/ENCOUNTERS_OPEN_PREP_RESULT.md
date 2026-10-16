# 奇遇一期「开态准备」RESULT

执行：炼器阁 Codex sol（程序）；2026-10-16，Asia/Shanghai。

- 工作区：`wt/dev`（既有 git worktree），分支 `dev`。
- 基线 SHA：`ce8816e30bc340caec765681baeb0366d0554af8`。
- tip SHA（实现/验证提交，提交后 `git rev-parse HEAD`）：`f0da58aa0a42f4891955c1aaee61ade7412a3b73`。本报告与状态随后另作文档提交，最终交付HEAD见stdout第1行及 `git rev-parse HEAD`，避免报告自引用提交SHA。
- 结论：**可交执法堂开态抽检**。5事件18结局fixture预览/结算、资格与冷却过滤、重复提交和首次hooks保护均验证通过；正式五事件保持关闭。
- 依据：`/workspace/xiantu/design/09_奇遇一期.md`、`V05C_CLOSED_SKELETON_RESULT.md`、当前奇遇表及功法品阶内存克隆开态先例。下表奖励取正式表当前值，不取设计稿历史提案。

## 开态矩阵

五事件共同：`weight=1`、`timeSlots=["any"]`、`cooldownMs=1800000`；确定性过滤不掷概率。下表所有有效结局 hooks 均为 `oncePerEncounter:true`。

| 事件 | 触发 type / 地图 / chanceRef | cooldownMs / once / req 摘要 | 主要结局奖励与 hooks | 关态行为 | fixture 开态行为 |
|---|---|---|---|---|---|
| `enc_stranded_cultivator` 灵溪援手 | `map_enter` / `lingxi_path` / `baseChancePerMapEnter` | `1800000` / `false`；等级≥12，`q_fox` done，正式拜宗，`moral_state` | `rescued`：exp1200、灵石648；karma `enc_wanderer_rescued=true`、affinity `enc_wanderer+2`、善恶+1。`aided`：exp900；karma `enc_wanderer_aided=true`、affinity+2、善恶+1。failed/missed：奖励/hooks均空 | preview=`unavailable/disabled`；trigger=`rejected/disabled`；不读ctx、不写save | 合格 available/accepted；首次关系即时兑现或入队；再次救援可发物资，不能补另一结局flag或叠关系 |
| `enc_fragrant_herb` 林隙留香 | `map_enter` / `wanyao_outer_2` / `baseChancePerMapEnter` | `1800000` / `true`；等级≥26，`q_main_04` done，`moral_state` | `preserved`：exp1584、`nine_leaf_ganoderma×1`；karma `enc_herb_preserved=true`、善恶+1。`uprooted`：`nine_leaf_ganoderma×2`；karma `enc_herb_uprooted=true`、善恶−1。failed/missed空 | 同上 | 地图/等级/任务/功能/冷却/once过滤；有效结局封存，failed/missed不封存 |
| `enc_hidden_abode` 石隙旧居 | `map_enter` / `wanyao_outer_1` / `baseChancePerMapEnter`；reveal=`spirit_scan`，reqSpirit=0 | `1800000` / `true`；等级≥30，境界≥`foundation`，`q_main_04` done，`moral_state`+`spirit_scan` | `taken`：`spirit_copper×3`、`refine_stone×2`；karma `enc_abode_taken=true`。`sealed`：无物资；karma `enc_abode_sealed=true`、道心+2。failed/missed空 | 同上 | 境界按境界表顺序比较；缺神识功能不入候选；道心即时裁剪；本轮无洞府/机关runner |
| `enc_sage_advice` 槐下问道 | `meditation_tick` / `qingyun_village` / `sageAdviceChancePerMeditationMin`；intervalMs=`60000` | `1800000` / `true`；等级≥10，`q_fox` done，正式拜宗，`meditation`+`insight_reward` | `enlightened`：永久悟性+1（`bonusStats.insight`）；karma `enc_sage_enlightened=true`。failed/missed空 | 同上 | 只做确定性资格过滤，不累计打坐时间、不掷概率；悟性只结算一次 |
| `enc_demon_whisper` 灯背低语 | `map_enter` / `luoxia_town` / `baseChancePerMapEnter` | `1800000` / `true`；等级≥12，`q_main_01` done，正式拜宗，`moral_state`，有效道心≤30 | `accepted`：exp1800；karma `enc_whisper_accepted=true`、道心−2、善恶−2。`refused`：无物资；karma `enc_whisper_refused=true`、道心+3。只有missed，无failed；missed空 | 同上 | 道心30可入、31或缺失/无效值不入；道心/善恶当次写入，不能先领修为以后补扣 |

## 运行时边界与交付文件

- `src/Encounter.ts`：资格过滤、合格列表、事件与结局只读预览、触发草稿、内存结算及必要配置校验。
- `src/encounter.test.ts`：保留关态/坏表校验，逐事件内存克隆开启；覆盖过滤、奖励、失败/错过、冷却、once、重复提交与hooks去重。
- `scripts/encounter-test.mjs`：snapshot/shared独立模块图、坏表内存注入；测试前后对正式features/奇遇表作原始字节和MD5比较。
- 结算返回新的只读 `save`，调用方使用返回值继续下一次内存操作；输入存档不被改写或冻结。`rewards.spiritStone` 对应 `save.stones`；物品写 `inventory`，悟性写 `bonusStats.insight`。
- `opts` 显式携带 `attemptId` 和 `nowMs`；同attempt重复提交拒绝且不延冷却；事件冷却取 `max(已有到期, nowMs+cooldownMs)`。有效结局写 `resolved`；failed/missed只写结算记录和冷却，不覆盖有效结局。
- 道心/善恶即时裁剪至0..100 / −100..100；karma默认写顶层 `karmaFlags`，未就绪karma可排队；affinity全部进入 `encounters.pendingHooks`，未调用正式好感消费器。
- pending项保留 `{attemptId,encounterId,payload}`；payload不重复包含已应用的道心/善恶。入队不标 `hooksApplied`，通过 `resolved`/pending记录保护首次关系，剩余消费器留后续任务。
- preview/trigger先做门禁与资格过滤，accepted只返回草稿，不预约真实进图名额、不落盘、不推进脚本。结算是供受信fixture结果调用的内存变换，不重验进场资格/冷却；尚未提供真实attempt生命周期或结局可达性验证。
- 未接真实gainExp、属性重算、Phaser、地图锚点、UI、战斗实例、概率或脚本步进；消耗型选项扣药留脚本runner后续实现。

## 本地验证

| 命令 / 检查 | 结果 |
|---|---|
| `npm run test:encounter`（`src/encounter.test.ts`、`scripts/encounter-test.mjs`） | PASS；snapshot/shared各**1402条断言**，各自坏表注入的7个API均安全拒绝；5事件18结局均做预览与结算 |
| `npx tsc --noEmit` | PASS |
| `npm run test:affinity` | PASS；snapshot/shared各154条断言及两套坏表注入；新增奇遇只读registry依赖不改变好感关态行为 |
| `npm run test:quest-hooks` | PASS；snapshot/shared各152条断言及两套坏表注入；两轴初值和旧存档保持原行为 |
| `git diff --check`、实现提交前 `git diff --cached --check` | PASS |
| Python只读断言与MD5/SHA256比对 | PASS；19个受保护文件与任务基线哈希相同；两目录正式门禁全部false |

测例包含：逐项前置条件与边界、Set/Record任务与功能就绪、缺失/未知境界、道心上界、冷却到期与时间回拨、resolved与failed/missed、物资与悟性、两轴裁剪、karma立即/延后消费、好感排队、重复attempt、救援跨结局首次关系互斥、旧档pending保护及输入深层对象不冻结。严格拒绝坏奖励/hooks和数组型结局status。

runner在测试前后对正式 `data/features.json` 及snapshot/shared两份 `encounters.json` 比较Buffer原始字节和MD5，三份全部不变；测试内再次断言五事件enabled计数=0，所有开启仅发生在 `structuredClone` 内存fixture。无共享目录时沿用既有root解析的snapshot回退行为。

## 关态未改证明

`md5sum data/features.json`（基线与最终测试后相同）：

```text
a06c3638796fd1bed9af3d45c038c954  data/features.json
```

`data/features.json` 中 `lifeSkillCurve:false`。正式表未写入任何enabled=true；快照与共享表测试后MD5逐表一致，且与任务基线相同：

| 表 / 门禁（快照与共享分别检查） | enabled:false | enabled:true | MD5（两目录相同） |
|---|---:|---:|---|
| encounters五事件 | 5 | 0 | `d17c551ffcd684846cfad565a49dd75b` |
| #19 gongfa_grades（全部enabled） | 46 | 0 | `1216c1807fbfd6ead71cfadf31bdf66d` |
| #20 qi_density（全部enabled） | 4 | 0 | `76824aef9f71d46206bfb61344abe031` |
| npcs.affinity根块 | 9 | 0 | `d0c2cea601ab34aa019e845f31926efe` |
| npcs.affinity.gifts | 9 | 0 | 同上 |
| karma_flags.questHooks | 2 | 0 | `604be023b747d28c5be80312e2f85ecc` |

正式奇遇五事件摘录（`data/balance/encounters.json`、`/workspace/xiantu/balance/encounters.json`均如此）：

```text
enc_stranded_cultivator enabled=false
enc_fragrant_herb       enabled=false
enc_hidden_abode       enabled=false
enc_sage_advice         enabled=false
enc_demon_whisper       enabled=false
```

最终再次用MD5+SHA256核对上述两目录五表、features以及Progress/GongfaGrades/QiDensity/作弊相关文件，共19个文件与任务开始时哈希相同；`git diff --exit-code ce8816e30bc340caec765681baeb0366d0554af8 -- data/features.json data/balance/encounters.json data/balance/gongfa_grades.json data/balance/qi_density.json data/balance/npcs.json data/balance/karma_flags.json src/Progress.ts src/GongfaGrades.ts src/QiDensity.ts src/Cheat.ts src/CheatPanel.ts src/cheatFlags.ts src/cheatQuery.ts src/cheat.test.ts` 通过。未改作弊入口、妖狐结案锁、地图、UI或战斗源码。

## 执法堂开态抽检要点

- [ ] 正式snapshot/shared均五事件false；features字节未变、lifeSkillCurve=false；#19/#20/affinity/questHooks仍关。
- [ ] 真表preview/trigger保持disabled；向ctx/save/opts传入抛错Proxy仍短路返回，不读取、不初始化存档。
- [ ] 每事件只在内存clone开启；合格为available/accepted，逐一改变地图、等级、任务、拜宗、功能、境界/道心、冷却、resolved检查拒绝原因。
- [ ] 任务Record仅done算完成；缺/未知境界不猜测；低语道心30/31、缺值/NaN边界明确；冷却到期边界可遇、时钟回拨不刷新。
- [ ] 预览与返回配置深只读，原始JSON和输入存档不变；不掷概率、不触发场景。
- [ ] exp/stones/items/bonusStats.insight按表兑现，两轴即时裁剪；未就绪hooks入队且payload不含已应用数值增量。
- [ ] 同attempt不重发奖、不刷新冷却；once有效结局后封存；failed/missed奖励/hooks为空、不消耗once且更新冷却与settledAttempts。
- [ ] 救援once=false第二次物资可领；同/不同结局均不叠首次关系、不补另一karma flag、不重复入队；pending存在时hooksApplied不冒充已消费。
- [ ] 抽检范围为门禁/资格/冷却/内存结算；真实runner、扣药、概率、持久化事务、地图/UI/战斗另行交接。

## 提交与工作区

实现已提交：`f0da58aa0a42f4891955c1aaee61ade7412a3b73`（`feat(encounters): 准备内存开态资格与结算`）；本RESULT与覆盖状态随后作独立文档提交。

原有脏文件（MAINLINE_21_WIRE_RESULT、待定素材及三份UI报告）保留且不纳入本任务提交。本轮未push；未发版、未合master、未私聊执法堂。
