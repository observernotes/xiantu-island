# TD-V06-01 卷一第 5–6 章接线与筑基体验打磨

日期：2026-10-16｜工作区：`/workspace/xiantu/wt/dev`（dev）

依据：共享 `design/18_卷一主线5-6章.md` 全文；对照 `MAINLINE_21_WIRE_RESULT.md` 与 `src/mainline-21.test.ts`。

## 实现

- 共享 `balance/npcs.json` 仅把 `hunter_lei.quests` 从 `[]` 改为 `["q_main_06"]`；传功长老原挂载不动。
- 等价定向 snapshot：tip 两任务各同步 `nameKey`、`descriptionKey`、`dialogueKeys`，追加规定的 10 条 strings，并同步雷猎户挂载。逐字段比对确认三表其余数据不变；不带入共享的秘境描述、苏师姐 affinity、同门或御剑配置。未运行会删除并重建整个 `data/` 的全量 snapshot，保留已有未跟踪美术目录。
- `QuestSystem` 已支持三态读键、接取后再次交谈与 `consume:false`，无需改动；tracker 已展示所有有描述的任务。普通 NPC 任务菜单补 `questDescription()`。
- 确认入台回调扣丹前复核持丹；缺筑基丹时不扣清心丹、不切图。接取、交谈和考核交付不扣丹，交付只解锁筑基台。
- 筑基失败日志说明守阵失败不扣修为、保底不变及重试方式；守住后突破失败另作说明，保留原有惩罚明细。结果横幅启用中文长句折行。
- 苏师姐护法与黑袍偷袭仅保留表内叙事。深林地图入口原 `reqLevel:30`、任务接取 `reqLevel:35`，均未改动，也未增加御剑、筑基或宗门前置。

## 边界

- 未新增任务 id，未改任务奖励、目标、前后置或试炼数值、时长、波次、成功率、惩罚与保底。
- 共享和 tip 的 NPC gifts 均为 `false`。`data/features.json` 字节保持原样，`indexedDbSaves:false`；当前已有 `lifeSkillCurve:true`、`spiritScan:true` 原样保留，不沿用 #21 报告的历史开关状态。
- 未实施 6b+；未发版、未合 master。仅提交本任务文件并推送 `origin/dev`。
- 开始工作前已有 `status/炼器阁.md` 修改及 `data/art/sprites/_pending/secret_rest_r1/` 未跟踪目录，保留且不纳入本提交。

## 验证

测试入口：`src/mainline-56.test.ts`、`scripts/mainline-56-test.mjs`、`npm run test:mainline-56`。

| 验证 | 结果／退出码 |
|---|---|
| `npx tsc --noEmit` | 0 |
| `npm run test:mainline-56` | snapshot 333＋shared 333 条断言通过／0 |
| `npm run test:mainline-21` | 349 条断言通过／0 |
| `git diff --check` | 0 |

测例调用真实 QuestSystem、tracker、NPC 菜单及筑基场景方法；只替换渲染、计时器和切图对象，未宣称浏览器实机验收。runner 同时核验两数据模式展示同步、gifts 关闭及 features 哈希不变。

提交推送后 stdout 记录实际 TIP_SHA、改动摘要、上述退出码及执法堂三行草稿：

1. 抽检传功长老／雷猎户任务入口、三态对白、tracker 与菜单描述；深林交付仍发原值奖励。
2. 考核持丹＋talk，交付不扣丹；入台才扣丹，缺丹复检；守阵失败与突破判定失败反馈分明，原惩罚不变。
3. 任务 35 级／地图门 30 级，无御剑前置；gifts 关、features 原样；仅 dev tip，不发版、不合 master、不做 6b+。
