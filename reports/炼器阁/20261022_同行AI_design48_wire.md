# design/48 · 苏师姐 support＝sword_shield 主动 buff · 接线交件

> 2026-10-22 Asia/Shanghai（UTC+8）
>
> 令文：`reports/天机阁/20261022_负责人令_同行AI_design48_接线.md`；门闩 **OPEN**。
>
> 演武核：`reports/炼器阁/20261022_负责人核_同行AI_design48_演武定稿.md`（**VERIFY_PASS**）。
>
> 定稿：`reports/演武堂/20261022_同行AI_design48_演武定稿.md`；design＝`design/48_v06_6b+_同行AI_support单技能.md`。
>
> 分支：`feat/companion-support-sword-shield`；基线 `cd576fc2c270005b4a61c8ea5a46e1dcfe384340`（备枝＝master v0.6.29）。
>
> 实现 tip：`8738405bbc7a43579e9f6256105716e63be41088`
>
> 交件 tip（枝 HEAD／ls-remote）：`9224bb7841ef9f7c2e4005f084449102fe55b0b8`
>
> **已 `git push -u origin feat/companion-support-sword-shield`**（禁 force）。
>
> **接线 only；未合 master；≠开态≠soft≠release≠Pages；无新 OpenFlag。**
> 现网仍 **v0.6.29**。
> Codex Sol Ultra 落盘（log `logs/codex/541ab51602f86718_20261022_215711_156051.log`）。

## 改动

| 文件 | 内容 |
|---|---|
| `src/CompanionFollowAi.ts` | `COMPANION_SUPPORT_HARD`；`supportLocked→false`；`schedule→primary_area_and_support`；choose 可返 support；`pendingSupport` buff 通道；优先＜3000ms／饿死 N＝2；stay 清 pending；倒地清 buff；复起重 CD；forbidEmit 仍 |
| `src/companion-support-sword-shield.test.ts` | 硬读／优先／饿死／stay／forbidEmit／budget／倒地／41–47／Flag／SHA |
| `scripts/companion-support-sword-shield-test.mjs` | Vite SSR runner＋表 SHA 守护 |
| `package.json` | `test:companion-support-sword-shield` |
| `src/companion-area-whirl.test.ts` 等 | 旧「不调度／supportLocked／primary_and_area」→「可调度唯一 support＋forbidEmit 仍＋primary_area_and_support」 |
| 本报告 | 接线证据与交回 |

**未改**：`companions.json`／`skills.json`／`npcs.json`／`quests.json` 字节；OpenFlag／GAME_PHASE；gifts／#20；FriendlySummons；阵法／巢穴／夺宝／跳跃。

## 硬读与行为

| 项目 | 落地 |
|---|---|
| companion／supportSkillId | 仅苏师姐／仅 `sword_shield` |
| supportLocked | **false**（验收＝可主动选 support） |
| schedule | **`primary_area_and_support`**（语义＝primary＋area＋support） |
| choose／cast | 可返 support；`pendingSupport` buff 通道；同拍至多 1；**不**走 pendingReflect |
| 优先门槛 | mode≠stay 且 CD／MP 就绪且（无 buff 或剩余＜**3000ms**）→ 优先 support；否则 area→primary |
| 饿死 N | **2** |
| stay | **不放** support；切入／updateStay／clearAiFlags 立即取消 pendingSupport |
| forbidEmitSwordShield | **仍 true**；主动 cast ≠ reflect |
| 伤害预算 | support **不进**；primary／area／reflect 仍 ×0.35 各一次 |
| 倒地／复起 | 倒地清 activeSupportBuff；复起须重新 CD；reviveMs／满血／无敌 **不改** |
| 表基值 | 沿用 mpCost30／CD30000／duration60000／damageReduce0.05／damageRatio0；reflectRatio0.5 不改 |
| gifts.enabled | **false** |
| 41–47 | follow96／leash320／CD1200／area4000／w160·h80·behind32／N2／×0.35／reflect0.5／revive30000／sources100/100/100 **不漂** |
| OpenFlag／PHASE | **无新**；GAME_PHASE=5 |

## 验证

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `test:companion-support-sword-shield` | **PASS** 299 |
| `test:companion-follow-ai` | **PASS** |
| `test:companion-modes-free-stay` | **PASS** |
| `test:companion-area-whirl` | **PASS** |
| `test:companion-reflect-hook` | **PASS** |
| `test:companion-down-revive` | **PASS** |
| `test:companion-dismiss` | **PASS** |
| `test:companion-affinity-sources` | **PASS** |

冻结 SHA（写后＝写前＝MATCH）：

| 文件 | SHA-256 |
|---|---|
| `data/balance/skills.json` | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` |
| `data/balance/companions.json` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `data/balance/npcs.json` | `243109d7b2f80877e83f737f951646d1170c1c39f9929a664c4359d9cfe1d134` |
| `data/balance/quests.json` | `ec9289b5f9ecabceadf39b3bf921c11389b34d7ac18a7398d26fbd3dc3f089c4` |

## Push 保全

- `git push -u origin feat/companion-support-sword-shield` **OK**
- `git ls-remote`＝`9224bb7841ef9f7c2e4005f084449102fe55b0b8`
- 禁 force-push
- 未合 master

## 交回

【同行AI48接线已交】tip＝9224bb7841ef9f7c2e4005f084449102fe55b0b8｜实现＝8738405bbc7a43579e9f6256105716e63be41088｜报告＝reports/炼器阁/20261022_同行AI_design48_wire.md｜门闩＝OPEN｜演武核＝reports/炼器阁/20261022_负责人核_同行AI_design48_演武定稿.md｜无新OpenFlag｜stay不放＝是｜forbidEmit仍＝是｜schedule＝primary_area_and_support｜supportLocked＝false｜tsc＝PASS｜已push＝是｜等负责人核｜禁开态／soft／release｜现网 v0.6.29
