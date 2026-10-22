# design/45 · 同行 AI 受击反伤 · tip＋接线

> 仙途岛·炼器阁·主程序｜2026-10-22 18:24 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261020_负责人令_同行AI_design45_接线.md`（门闩 **OPEN**）  
> 核记：`reports/炼器阁/20261020_负责人核_同行AI_design45_演武定稿.md` VERIFY_PASS  
> 演武定稿：`reports/演武堂/20261020_同行AI_design45_演武定稿.md`  
> design：`design/45_v06_6b+_同行AI_受击反伤.md`  
> **半成品续跑**：枝上已有 COMPANION_REFLECT_HARD／hook／测；本刀审硬读＋tsc／测绿＋交 tip。未再调 Codex（半成品路径延续旁路直写；本刀 docs／报告旁路）。  
> **≠ 开态 ≠ soft-open ≠ release ≠ Pages ≠ 新 OpenFlag**  
> 现网仍 **v0.6.26**。未合 master。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/companion-reflect-hook` |
| 基线 | `f79ef2c`（master／V0626 口径） |
| tip SHA | `ffc63aa5617a779a264da915a877cb9267bf3797`（短 `ffc63aa`） |
| worktree | `/workspace/xiantu/wt/feat/companion-reflect-hook` |
| 旁路 | 半成品已旁路直写；本刀续审未再调 Codex |

## 2. 改动文件清单

| 路径 | 说明 |
|---|---|
| `src/CompanionFollowAi.ts` | `COMPANION_REFLECT_HARD`；`companionReflectRatioFromTable`／`ShouldApply`／`Resolve`；外层受击钩 `takeHostileHit`／`scanHostileTouchHits`／`processPendingReflect`／`applyReflect`；stay 清 pendingReflect；可见＝攻击者掉血＋跳字；forbidEmitSwordShield |
| `src/companion-reflect-hook.test.ts` | 硬读／读表 0.5／budget／合法命中／stay／Flag／41–44 回归 |
| `scripts/companion-reflect-hook-test.mjs` | Vite SSR runner＋companions／skills SHA 守护 |
| `package.json` | `test:companion-reflect-hook` |
| `reports/炼器阁/20261020_同行AI_design45_wire.md` | 本 RESULT |

**未改**：`companions.json`／`skills.json`／OpenFlag／GAME_PHASE／fly_zones／gifts／#20／阵法／巢穴／夺宝／跳跃／FriendlySummons.ts／sash／解散入口／KeyV 循环／area CD·range／schedule。

## 3. 硬读落地证据

| 键 | 定稿 | 落地证据 |
|---|---|---|
| reflect.ratio | **0.5** | `COMPANION_REFLECT_HARD.ratio`；`companionReflectRatioFromTable()` 读 `SKILLS.sword_shield.effects.reflectRatio` |
| reflect.ratioReadPath | `skills.sword_shield.effects.reflectRatio` | 常量＋测；**不用** perLevel 0.05 |
| reflect.forbidEmitSwordShield | **true** | Resolve `emitSkillId=null`；applyReflect 永不 pending／strike sword_shield；事件 id=`companion_reflect` |
| reflect.helper／formula | `companionReflectDamage`；`max(1,round(in*ratio*0.35))` | 例 100→18；测绿 |
| reflect.budgetScale／reflectAlsoScaled | **0.35**／true | 同乘一次；禁与 primary／area 二次叠乘 |
| reflect.trigger／target | 敌对命中＋incoming＞0／thatAttackerOnly | `companionReflectShouldApply`＋`applyReflect` |
| reflect.skipIf… | true | 攻击者 dead／gone／unhittable 跳过 |
| reflect.visibleFeedback | 攻击者掉血＋跳字 | `attacker.takeHit`＋`damageNumber` |
| modes.follow／free／stay.reflect | true／true／**false** | HARD.modes；stay `allowReflect=false` |
| stay.zeroDamage／cancelPending／invuln | true／true／false | `updateStay`／`clearAiFlags` 清 pendingReflect |
| follow Dist／leash／aggro | **96／320／320** | FOLLOW_HARD 未漂 |
| primary CD／engage | **1200**／w240·h48 | 未漂 |
| area CD／range／N | **4000**／w160·h80·behind32／**2** | AREA_HARD 未漂 |
| schedule／supportLocked | `primary_and_area`／**true** | 不改 |
| damage.budgetScale | **0.35** | 未漂 |

## 4. 闭环行为

1. **受击钩**：合法敌对接触命中 → 扣同伴血；follow／free 排队反伤；stay 只扣血不反伤。  
2. **结算**：读表 ratio＝0.5 → `companionReflectDamage(in, ratio, 0.35)` → 打回该攻击者；可见＝掉血＋跳字。  
3. **budget**：每一笔 reflect 只乘一次 0.35（与 primary／area 同源契约，禁二次叠乘）。  
4. **stay**：零伤含不放反伤；切入／updateStay／clearAiFlags 立即取消 pendingReflect；invulnerable=false。  
5. **forbidEmit**：永不 emit／pending／strike `sword_shield`；support 仍锁；schedule 不改。  
6. **隔离**：namespace `companion_follow`；gifts 仍关；不入 FriendlySummons；不混玩家 hurt。

## 5. 冻结 SHA（写后＝写前）

| 文件 | SHA-256 |
|---|---|
| `data/balance/companions.json` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `data/balance/skills.json` | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` |

## 6. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS**（EXIT0） |
| `npm run test:companion-reflect-hook` | **PASS**（86×2＝172） |
| `npm run test:companion-follow-ai` | **PASS**（43×2＝86） |
| `npm run test:companion-modes-free-stay` | **PASS**（79×2＝158；41／42 硬读未漂） |
| `npm run test:companion-dismiss` | **PASS**（53×2＝106；43 硬读未漂） |
| `npm run test:companion-area-whirl` | **PASS**（95×2＝190；44 硬读未漂） |

## 7. 禁项自证

| 禁项 | 证据 |
|---|---|
| 无新 OpenFlag／softOpenedCompanion＊ | 未新增 Flag；测例负向断言 |
| 未改 companions／skills 字节 | SHA MATCH |
| 未改 41／42／43／44 硬读 | follow／modes／dismiss／area 测绿 |
| 禁抬 GAME_PHASE／开 gifts／#20 | GAME_PHASE=5；gifts.enabled=false |
| ≠开态≠soft≠release≠Pages | 未合 master／未 tag／未 Pages |
| 禁捆阵法／巢穴／夺宝／跳跃／sash／FriendlySummons | 未碰 |
| 禁接 support／emit sword_shield／三技能整包 | forbidEmit；supportLocked；schedule 不改 |
| Codex／旁路 | 半成品旁路直写；本刀续审未再调 Codex（报告旁路） |

## 8. 交回

【同行AI45接线已交】tip＝ffc63aa5617a779a264da915a877cb9267bf3797｜短＝ffc63aa｜枝＝feat/companion-reflect-hook｜报告＝reports/炼器阁/20261020_同行AI_design45_wire.md｜门闩＝OPEN｜无新OpenFlag｜表SHA MATCH｜tsc＋测＝PASS｜旁路＝半成品续／本刀未再调Codex｜reflectRatio＝0.5／读表 effects／budget×0.35／stay不放反伤／forbidEmit｜41–44硬读未漂｜现网 v0.6.26｜等负责人核｜≠开态≠soft≠release
