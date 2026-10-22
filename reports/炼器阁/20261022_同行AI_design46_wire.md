# design/46 · 同行 AI 零血复起 · 接线交件

> 2026-10-22 Asia/Shanghai
>
> 令文：`reports/天机阁/20261022_负责人令_同行AI_design46_接线.md`；门闩 **OPEN**。
>
> 依据：design/46、演武定稿及其负责人核 **VERIFY_PASS**。
>
> 分支：`feat/companion-down-revive`；基线 `bcaaf5c`。
>
> 实现 tip：`0cdb77084b9878927818435eb5c729a0196b43e6`；报告提交在实现 tip 之后。
>
> **接线 only；未合 master；≠开态≠soft≠release≠Pages；无新 OpenFlag。**

## 改动

| 文件 | 内容 |
|---|---|
| `src/CompanionFollowAi.ts` | 新增 `COMPANION_DOWN_REVIVE_HARD`；实体本地 downed／reviveAt／倒地点；致命停战、清 pending、倒地与复起反馈；满血原地复起及短暂无敌 |
| `src/companion-down-revive.test.ts` | 真实控制器搭配 scene／sprite／body 替身，验证倒地、计时、三态、反伤及生命周期 |
| `scripts/companion-down-revive-test.mjs` | Vite SSR runner；显式切换 shared／snapshot 数据别名；守护 companions／skills／fly_zones／features 字节 |
| `package.json` | 新增 `test:companion-down-revive` |
| 本报告 | 接线证据与交回 |

## 硬读与行为

| 项目 | 落地 |
|---|---|
| reviveMs | **30000**；deadline 实际读取 `COMPANIONS.reviveMs` 表根；HARD 中数字仅旁证；不改表 |
| 计时归属 | **sceneLocal**；只挂实体，不进关系／存档，无跨场景回调 |
| 致命受击 | hp 扣至 0 后立即 down；取消 pendingStrike／pendingReflect、恢复期与索敌瞬态；不排本击反伤，**fatalHitReflect=false** |
| 倒地停战 | 停 primary／area／反伤，冻结速度与位移；受击扫描致命后本帧立即返回，不能继续结算或 leash |
| 复起 | hp＝**maxHp**；保存的**倒地位置原地**；**1000ms** i-frame；复起帧不执行移动／战斗，下一帧按既有 mode 调度 |
| 可见 | 倒下角度＋「**苏师姐力竭**」日志；复起站直＋「**复起**」日志；不改 strings 表 |
| follow／free／stay | 三态均可倒地复起；倒地中 KeyV 不清计时；关系与 mode 保留；stay 复起后仍零伤、短窗结束仍可受击 |
| 玩家倒地 | 同伴到期复起先于玩家停战门禁，不修改玩家死亡／复活链 |
| 解散／切图／读档 | 毁实体清 pending 与本地计时；再邀／新图／读档投影为满血新实体，不继承半段倒地，无幽灵复起 |
| 非致命反伤 | 仍按 45：ratio0.5、budget×0.35 一次、forbidEmit、stay 不反伤；扫描先于结算，长帧两笔非致命反伤均保留 |

## 41–45 保持

followDist **96**；leash／aggro **320／320**；primary CD **1200**、engage **240×48**；KeyV follow→free→stay→follow；free 不绑玩家 leash／目标；stay 零伤≠永久无敌；解散入口不改。area 仍 `whirl_sword`、CD **4000**、w160／h80／behind32、prefer≥2、starve N＝**2**；CD 独立且切态／倒地／复起不重置。schedule 仍 **primary_and_area**＋**supportLocked=true**；budget **0.35**；反伤 effects 基值 **0.5**；永不 emit `sword_shield`。

未修改：companions／skills／strings／features／fly_zones／GAME_PHASE；gifts 仍关；未新增 OpenFlag／softOpenedCompanion＊；未碰 FriendlySummons、玩家复活、巢穴、夺宝、跳跃、#20 或 support 调度。

## 验证

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:companion-down-revive` | **PASS**，384×2＝768；shared／snapshot 实际数据根 |
| `npm run test:companion-follow-ai` | **PASS**，43×2＝86 |
| `npm run test:companion-modes-free-stay` | **PASS**，79×2＝158 |
| `npm run test:companion-dismiss` | **PASS**，53×2＝106 |
| `npm run test:companion-area-whirl` | **PASS**，95×2＝190 |
| `npm run test:companion-reflect-hook` | **PASS**，86×2＝172 |
| `git diff --check` | **PASS** |

共 **1480** 条断言通过。新行为测试明确绑定 shared／snapshot 两个实际数据根；既有五套回归沿用原 runner。四份既有 `COMPANION_*_HARD` 与基线逐字节一致。上述为控制器行为及单测验证，未宣称实机 C／O、开态或 soft 验收。

首次验证发现本 worktree 的依赖相对软链失效，且缺少生成素材清单；已仅修正本地忽略软链并运行 `npm run sync` 生成忽略产物，之后执行检查，不涉及表字节或依赖版本变动。

冻结 SHA-256（共享根／快照均一致）：

| 文件 | SHA-256 |
|---|---|
| `balance/companions.json` | `e4eb87c1f9400514a084d630f179903e0926d706c85614481f1e2618a01bb115` |
| `balance/skills.json` | `d80abaf18204a7472a67bf74b6d08eda5e213fc170b5e1c905e8e971e9462979` |

## 交回

【同行AI46接线已交】实现 tip＝0cdb77084b9878927818435eb5c729a0196b43e6｜枝＝feat/companion-down-revive｜报告＝reports/炼器阁/20261022_同行AI_design46_wire.md｜门闩＝OPEN｜无新OpenFlag｜gifts关｜reviveMs＝30000读表根／满血／无敌1000／原地／致命不反伤｜表SHA MATCH｜41–45未漂｜等负责人核｜未合master｜≠开态≠soft≠release
