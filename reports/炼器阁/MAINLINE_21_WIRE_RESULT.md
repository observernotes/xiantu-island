# #21 卷一主线 1–4 章 · 程序接线结果

更新：2026-10-16 15:42（Asia/Shanghai）｜炼器阁·主程序  
工作区：`/workspace/xiantu/wt/dev`  
依据：`design/17_卷一主线1-4章.md`、`reports/天机阁/20261016_21_卷一主线1-4章落地.md`

## 结论

- **成功**：`q_main_01`–`04` 展示字段与 NPC 入口已接到 tip；tracker 展示主线 `questDescription`；dialogueKeys→`t()` 与日常同路。
- **未发版、未合 master**；`features.json` **未改**；奖励数值未改。
- `#19`/`#20`/`lifeSkillCurve`/v0.5c 开态 **仍关**（本轮未动开关）。
- tip SHA：`a4654b1`

## 做了什么

1. **共享 NPC 挂载**（最小改表，对齐日常「NPC.quests 登记」）：
   - `luoxia_mayor`：+`q_main_04`（发布）
   - `sect_master_ling`：+`q_main_02`（交付）
   - `tree_spirit`：+`q_main_04`（交付）
2. **Codex sol**：`GameScene` tracker 凡有 `questDescription` 即展示（含主线）；确认 `QuestSystem` 无需改（已吃 NPC.quests + dialogueKeys）。
3. **测例**：`src/mainline-21.test.ts` + `npm run test:mainline-21`（349 断言）：字段/挂载/三态对白/01 双 talk/02 扣残片/03 击杀/04 双目标无先后锁/奖励原值/tracker 描述。
4. **`npm run snapshot`**（含 `--pre`）：把共享 quests/strings/npcs 等刷进 tip `data/`；features 快照保留未改。

## 关态证明

| 项 | 状态 |
|----|------|
| `data/features.json` | 本轮 **未改** |
| `lifeSkillCurve` | `false` |
| 未新开 encounter/affinity/questHooks 等 v0.5c 开态 | 是 |
| 奖励 `q_main_01`–`04` exp/spiritStone/items | 与共享原表一致 |
| SCRIPTS | 仍只解析 design/02；未解析 design/17 |

## 改动文件

| 路径 | 说明 |
|------|------|
| `balance/npcs.json`（共享） | 主线 NPC 挂载 |
| `data/balance/quests.json` | snapshot：四条 G2 字段 |
| `data/balance/strings_zh.json` | snapshot：20 个 main key（及共享侧其它已有文案同步） |
| `data/balance/npcs.json` | snapshot：挂载 |
| `data/SNAPSHOT.txt` 等 | 全量 snapshot 附带同步 |
| `src/scenes/GameScene.ts` | tracker 主线描述 |
| `src/mainline-21.test.ts` / `scripts/mainline-21-test.mjs` / `package.json` | 测入口 |
| 本 RESULT / `status/炼器阁.md` | 文档 |

## 测过命令

```bash
npx tsc --noEmit
npm run test:mainline-21   # 349 PASS（Codex 另跑过 test:v05 / test:daily）
npm run snapshot           # PRE 0 问题后刷入
```

## 请执法堂（关态抽检）

1. tip 上 `q_main_01`–`04`：NPC 标记/接取/进行中/交付对白读 `dialogueKeys`；01 接取后再谈柳知县；02 交付扣 `pillar_shard_1`；04 击杀+talk 齐备后古树灵交付。
2. tracker 显示主线 description；**勿**要求开任何新 flag。
3. 确认 `features`/`lifeSkillCurve` 仍关、奖励未变；**非发版**。

## tip

- `origin/dev` @ `a4654b1`
- 推送目标：`origin/dev`（本任务有权推 tip，不发版）
