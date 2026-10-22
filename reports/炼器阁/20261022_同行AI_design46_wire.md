# design/46 · 同行 AI 零血复起 · 接线交件

> 2026-10-22 Asia/Shanghai
>
> 令文：`reports/天机阁/20261022_负责人令_同行AI_design46_接线.md`；门闩 **OPEN**。
>
> 依据：design/46、演武定稿及其负责人核 **VERIFY_PASS**。
>
> 分支：`feat/companion-down-revive`；基线 `bcaaf5c320a1c7f22431317ed6fa3b557580c704`。
>
> 实现 tip：`0cdb77084b9878927818435eb5c729a0196b43e6`
>
> 交件 tip（枝 HEAD／ls-remote）：`b610e159ba7532ce91ddb7aa772208778460a409`
>
> **已 `git push -u origin feat/companion-down-revive`**（禁 force）。
>
> **接线 only；未合 master；≠开态≠soft≠release≠Pages；无新 OpenFlag。**

## 改动

| 文件 | 内容 |
|---|---|
| `src/CompanionFollowAi.ts` | `COMPANION_DOWN_REVIVE_HARD`；downed／reviveAt；致命停战、清 pending；满血原地复起＋1000ms 无敌 |
| `src/companion-down-revive.test.ts` | 控制器＋scene／sprite／body 替身；倒地／计时／三态／反伤／生命周期 |
| `scripts/companion-down-revive-test.mjs` | Vite SSR；shared／snapshot；守护 companions／skills／fly_zones／features |
| `package.json` | `test:companion-down-revive` |
| 本报告 | 接线证据与交回 |

## 硬读与行为

| 项目 | 落地 |
|---|---|
| reviveMs | **30000**；读 `COMPANIONS.reviveMs` 表根；**不改表** |
| 计时 | **sceneLocal**；挂实体；切图 SHUTDOWN 中断半段 |
| 致命 | hp→0 先 down；cancel pendingStrike／pendingReflect；**fatalHitReflect=false** |
| 倒地 | 停 primary／area／反伤；可见「苏师姐力竭」 |
| 复起 | hp＝**maxHp**；**原地**；**1000ms** i-frame；可见「复起」；keepRelationAndMode |
| modes | follow／free／**stay** 均可倒地复起；stay.zeroDamage＝true／invulnerable＝false |
| 非致命反伤 | design/45：ratio0.5／budget0.35／forbidEmit／stay 不放 |

## 41–45 未漂

96／320／320＋CD1200＋engage240×48＋budget0.35／areaCD4000／w160·h80·behind32／N＝2／schedule＝primary_and_area／supportLocked＝true

无新 OpenFlag／softOpenedCompanion＊；gifts 关；PHASE 不抬；未碰 FriendlySummons／玩家复活／巢穴／夺宝／跳跃。

## 验证

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS**（本刀相关无新增错） |
| `test:companion-down-revive` | **PASS** 384×2＝768 |
| `test:companion-follow-ai` | **PASS** 43×2＝86 |
| `test:companion-modes-free-stay` | **PASS** 79×2＝158 |
| `test:companion-dismiss` | **PASS** 53×2＝106 |
| `test:companion-area-whirl` | **PASS** 95×2＝190 |
| `test:companion-reflect-hook` | **PASS** 86×2＝172 |

冻结 SHA：companions `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115`｜skills `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979`

## Push 保全

- `git push -u origin feat/companion-down-revive` **OK**
- `git ls-remote origin feat/companion-down-revive`＝`b610e159ba7532ce91ddb7aa772208778460a409`
- 前次 tip 未 push 致本地对象丢；本刀交 tip 后已立刻 push

## 交回

【同行AI46接线已交】tip＝b610e159ba7532ce91ddb7aa772208778460a409｜实现＝0cdb77084b9878927818435eb5c729a0196b43e6｜报告＝reports/炼器阁/20261022_同行AI_design46_wire.md｜门闩＝OPEN｜无新OpenFlag｜表SHA MATCH（reviveMs=30000未改表）｜tsc＋测 PASS｜已 push origin/feat/companion-down-revive｜≠开态≠soft≠release｜现网 v0.6.27｜等负责人核
