# v0.5c 就绪缺口表

更新：2026-10-16 14:43（UTC+8）｜炼器阁·主程序  
对照 `ROADMAP.md` v0.5c：卷一主线 1–4、功法品阶、灵气浓度、奇遇一期、NPC 好感、正魔选择。  
**只列缺口与建议下一动作；未实现、未改 enabled。** tip=`88daea0`。

---

## 总览

| ROADMAP 项 | 表是否齐 | 程序是否已接 | 关态门禁 | 阻塞谁 | 建议下一动作 |
|------------|----------|--------------|----------|--------|--------------|
| 卷一主线 1–4 | 部分齐 | 通用任务链已接 | 无独立 features | 玩法体验/对话抽检 | 执法堂或主程抽检 `q_main_01`→`04` 链；对齐 `design/04` 第八节（奖励已非 0，文档过时） |
| 功法品阶（#19） | ✅ | ✅ 关态最小接入 | 表根+绑定 **46×false**（无 features 名） | **负责人开态令** | 继续关；开态前另排开态矩阵 |
| 灵气浓度（#20） | ✅ | ✅ 关态最小接入 | 表 **4×false** | **负责人开态令** | 继续关；UI/打坐叠乘未接 |
| 奇遇一期 | ✅ 5 事件 / 44 字段 | ❌ 无 Encounter 运行时 | 5×`enabled:false` | **炼器阁实现** | 设计 `design/09`；数值确认 `reports/演武堂/20261016_奇遇交接确认.md`；**勿改 enabled** |
| NPC 好感一期 | ✅ NPC affinity 块（9）+ 文案 | ❌ 无 Affinity 模块/存档字段 | 9×`affinity.enabled:false` | **炼器阁实现** | `design/10_好感与因果.md`；数值 backlog 已勾好感项 |
| 正魔选择题 | ✅ `karma_flags` 两轴+hooks | 半接：存档两轴有；**选择题结算未接** | hooks `enabled:false`；`moral_state` 就绪标识 | **炼器阁接线** | 先接 `questHooks` 关态门禁+预览；启用另等令 |

---

## 分项实查

### 1. 卷一主线第 1–4 章

- **表**：`data/balance/quests.json` 有 `q_main_01`…`04`（及 `q_main_06` 深处）；`phase:5`；奖励已填（非 design/04 §八 的 0）。
- **程序**：走通用 `QuestSystem`/`Progress`；未见独立「主线章」模块。
- **门禁**：无单独 feature；依赖地图/NPC/怪已在表。
- **引用**：`design/04_区域与主线.md` §七–八；`balance/10_奇遇与主线数值.md`。
- **缺口**：设计文档 §八「待填 0」过时；章节剧情/对话完整度与实机链未在本空档验收。
- **建议**：抽检主线链与 NPC/地图引用；更新 design §八或 backlog 勾选；**不在本轮改任务表**。

### 2. 功法品阶（21.6 / #19）

- **表**：`gongfa_grades.json`（`enabled:false`，46 处门禁）。
- **程序**：`src/GongfaGrades.ts` + `data.ts` 加载；战斗乘区关态恒 1。
- **证据**：`reports/炼器阁/GONGFA_QI_DENSITY_RESULT.md`；执法堂关态 PASS。
- **阻塞**：负责人 — **继续关**（经理空档令）。
- **建议**：维持关态；开态令到后再排研习/UI。

### 3. 地图灵气浓度（21.7 / #20）

- **表**：`qi_density.json`（根/display/meditation/gathering 全 false）。
- **程序**：`src/QiDensity.ts`；关态 display=pending、meditation=legacy；**未**叠入原闭关/打坐公式。
- **阻塞**：负责人 — **继续关**。
- **建议**：同 #19；开态前再接 UI 与公式。

### 4. 奇遇一期（15.2，5 事件）

- **表**：`data/balance/encounters.json` — 5 事件（`enc_stranded_cultivator` 等），演武确认 **44/44** 字段齐、`balanceTodo` 空、**全部 enabled:false**（`reports/演武堂/20261016_奇遇交接确认.md`）。
- **程序**：**无** `Encounter*.ts`；`data.ts` **未** import encounters；`Sense` 仅预留 `encounter` 适配器槽；`MapBuilder` 仅校验 hidden `encounter` 字段。
- **门禁**：事件级 `enabled:false`（无 features 名）。
- **阻塞**：**炼器阁** — 缺运行时（触发/脚本步/战斗/结局 hooks）。
- **建议**：按 `design/09_奇遇一期.md` 做关态可加载运行时骨架；**保持 enabled:false**；适配器与神识联调另排。

### 5. NPC 好感一期（15.6）

- **表**：`npcs.json` 中 9 名含 `affinity`（皆 `enabled:false`，`balanceTodo` 空）；`strings_zh` 已有 `affinity.ui.*` / tier 文案。
- **程序**：**无** Affinity 源码；`Progress` 无好感字典读写。
- **门禁**：NPC 块 `affinity.enabled`。
- **阻塞**：**炼器阁**。
- **建议**：按 `design/10_好感与因果.md` 关态接入读写+UI 占位；启用另等令。

### 6. 正魔选择题（21.9）

- **表**：`karma_flags.json` — `moralState` 两轴；`questHooks`（序章药囊、天剑问剑等）均 **enabled:false**；奇遇相关 flags 已登记。
- **程序**：`Progress` 已持久化 `daoHeart`/`morality`/`moralVersion`；`MORAL_STATE` 只读边界；**未见** 读取 `questHooks` 弹出选择并写 hooks 的运行时。
- **门禁**：hook.`enabled` + 功能就绪标识 `moral_state`（非 features.json 项）。
- **阻塞**：**炼器阁**（选择 UI/结算）；启用策略等负责人。
- **建议**：关态接线（featuresAll/enabled 短开）；与奇遇 hooks 共用结算内核；**勿改 hook enabled**。

---

## 不做（本轮 / 空档令）

- 不改 `features.json` / 各表 `enabled`
- 不开 #19#20 / `lifeSkillCurve`
- 不开始实现上表程序缺口（本文仅缺口清单）
