# design/47 · 苏师姐好感来源 · 接线交件

> 2026-10-22 Asia/Shanghai（UTC+8）
>
> 令文：`reports/天机阁/20261022_负责人令_同行AI_design47_接线.md`；门闩 **OPEN**。
>
> 依据：design/47、演武定稿 `reports/演武堂/20261022_同行AI_design47_演武定稿.md` 及其负责人核 **VERIFY_PASS**。
>
> 分支：`feat/companion-affinity-sources`；基线 `e9290228c2cba837a1a61b538b7dec28844cd1d8`（origin/master）。
>
> 实现 tip：`a09fc8fc9b0b340ccb8caebc783a57d7a3027376`
>
> 交件 tip（枝 HEAD／ls-remote）：`HEAD_TIP`
>
> **已 `git push -u origin feat/companion-affinity-sources`**（禁 force）。
>
> **接线 only；未合 master；≠开态≠soft≠release≠Pages；无新 OpenFlag。**
> 现网仍 **v0.6.28**。

## 改动

| 文件 | 内容 |
|---|---|
| `data/balance/quests.json` | 新增三引导：`q_su_fellow_meet`→`tour`→`confide`；苏 giver＋turnIn；talk 苏；`reqLevel=null`／`rewards={}`／`phase=5`；prereq／next 链 |
| `data/balance/npcs.json` | `senior_sister_su.quests` 挂三 id；`affinity.sources` 恰 3 行 delta **100／100／100** |
| `data/balance/strings_zh.json` | 补 `quest.su_fellow_{meet,tour,confide}.{name,description,offer,progress,complete}` 共 15 键 |
| `scripts/companion-affinity-sources-test.mjs` | 静证＋闭环：三 sources 消费／once／达 confidant／invite 不查礼／gifts 关／禁挂禁口／SHA 冻结 |
| `package.json` | `test:companion-affinity-sources` |
| `src/affinity.test.ts` | 适配正式表 10 NPC 名单（基线已有；逐项门禁断言） |
| `src/v05.test.ts`／`src/v06c-open.test.ts` | 各一行收窄 reqLevel 类型推断（nullable JSON）；不改玩法 |
| 本报告 | 接线证据与交回 |

玩法源码（Affinity／Companions／QuestSystem）**未改**；复用既有 `consumeQuestAffinitySources`／`canInvite`。

## 硬读与行为

| 项目 | 落地 |
|---|---|
| npcId／companionId | `senior_sister_su`／`companion_senior_sister_su` |
| quests | meet／tour／confide；链 meet→tour→confide；苏接／交；talk→苏 |
| npc.quests | 挂三 id（均可合法接取并 done 一次） |
| sources | 恰 3 行：`type:quest`／`on:done`／`once:true`；delta＝**100／100／100**；合计 **300** |
| 档位轨迹 | 0→100(acquaintance)→200(acquaintance)→300(confidant) |
| reqLevel／rewards | `null`／`{}` |
| gifts.enabled | **false**（likedItems 仍空） |
| invite | 达 confidant 走既有 invite；**不查** confidant_gift |
| forbidHang | 未挂 `q_main_02`／`q_elder_exam`；无第四行；无 kill／encounter 刷好感 |
| schedule／supportLocked／reviveMs | **不改**（primary_and_area／true／30000） |

## 41–46 未漂

96／320／320＋CD1200＋engage240×48＋budget0.35／areaCD4000／w160·h80·behind32／N＝2／schedule＝primary_and_area／supportLocked＝true／reflectRatio0.5／reviveMs30000／满血／无敌1000

无新 OpenFlag／softOpenedCompanion＊；gifts 关；PHASE 不抬；未碰 FriendlySummons／阵法／巢穴／夺宝／跳跃。

## 验证

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `test:companion-affinity-sources` | **PASS** 262 |
| `test:affinity` | **PASS**（snapshot／shared） |
| `test:companion-follow-ai` | **PASS** 86 |
| `test:companion-modes-free-stay` | **PASS** 158 |
| `test:companion-dismiss` | **PASS** 106 |
| `test:companion-area-whirl` | **PASS** 190 |
| `test:companion-reflect-hook` | **PASS** 172 |
| `test:companion-down-revive` | **PASS** 768 |

冻结 SHA（写后＝写前）：companions `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115`｜skills `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979`

| 文件 | 写前 SHA256 | 写后 |
|---|---|---|
| `npcs.json` | `2533a87d…5f9c23c6` | `243109d7b2f80877e83f737f951646d1170c1c39f9929a664c4359d9cfe1d134` |
| `quests.json` | `c4546682…463482b` | `ec9289b5f9ecabceadf39b3bf921c11389b34d7ac18a7398d26fbd3dc3f089c4` |
| `strings_zh.json` | （基线） | `ed38339083e3c7e2aac15d95ef9143465510d1e06f6da2f5dcd5983cf20bce79` |

Codex：`tools/codex_run.sh sol` Ultra 落盘（log `logs/codex/1565a223e701ee12_20261022_204625_78149.log`）；本执行器复跑 tsc＋指定测全绿后补全交件／push。

## Push 保全

- `git push -u origin feat/companion-affinity-sources` **OK**
- `git ls-remote origin feat/companion-affinity-sources`＝`a09fc8fc9b0b340ccb8caebc783a57d7a3027376`
- 禁 force-push

## 交回

【同行AI47接线已交】tip＝a09fc8fc9b0b340ccb8caebc783a57d7a3027376｜报告＝reports/炼器阁/20261022_同行AI_design47_wire.md｜门闩＝OPEN｜无新OpenFlag｜delta＝100/100/100｜已 push｜≠开态≠soft≠release｜现网 v0.6.28｜等负责人核
