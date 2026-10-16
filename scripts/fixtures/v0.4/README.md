# v0.4.3 独立全档迁移样档

`full-fox-tianjian.json` 是 **v0.4.3 原代码实际写出的完整 `xiantu_save_v1`**，用于 `backlog/测试.md #27④` 的真实旧档迁移回归。

来源 tag 为 `v0.4.3`，固定 commit 为 `d343ea537bd8e83e267491ba48241a90792c63fd`。角色、成长公式、怪物、掉落、物品、任务和技能均从该 commit 的独立 detached worktree 读取，数据根固定为该 tag 内 `data/`，不读取 dev 共享配表。

## 生成和复现

在已安装工程开发依赖的仓库根目录运行：

```sh
node scripts/fixtures/v0.4/generate.mjs
node scripts/fixtures/v0.4/generate.mjs --check
npm run test:v04-save
```

第一条生成样档，第二条重新执行旧代码并逐字节比较仓库样档，第三条运行现行迁移回归。生成脚本会核对 tag commit，使用 `git worktree add --detach` 创建独立临时工作树，通过现有 Vite SSR 加载其中的模块，在 `finally` 关闭 Vite 并删除临时工作树；无需浏览器、安装额外依赖或运行 `npm run sync`。只复用现有 `node_modules` 的转译工具，不导入现行 `Progress`、`QuestSystem` 或 `GameScene`。

输出文件 SHA-256：

```text
6ccfae48c213a67f3d4f522ca74ca0cbfbc430095c47cdee64def33a707b8d9d
```

## 写档口径与源码证据

旧 `src/Progress.ts:59` 的原方法为：

```ts
save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this)); } catch { /* 无痕模式等 */ } }
```

生成器调用这个旧 `save()`，截取内存 `localStorage` 收到的 `xiantu_save_v1` 原始字符串，并断言其等于 `JSON.stringify(p)`。落盘只缩进 JSON；再次去除缩进后必须与原始字符串完全相等。没有删字段、挑字段或调用现行 `exportSave()`。

这份全档包含旧 `Progress` 的全部 24 个 own fields：

```text
level exp hp mp stones inventory equip job quests name
skills skillGifted skillMastery hotbar buffs spTipShown
overflowExp breakthroughFails unstableUntil realmRewards unstableRatio
unstableStats lastOverflowReturned breakthroughBonusLevels
```

`questRewardVersion`、`classVersion`、`moralVersion`、`senseState`、`talismanLevel` 均不存在；生成器也断言角色 own fields 与旧 `new Progress()` 的字段集合严格一致。

**位置例外：v0.4.3 不持久化 position。** 旧 `Progress.ts:9–39` 没有位置或地图字段，旧 `GameScene.ts:112–113` 只用场景参数 `data.portal` / `data.pos` 决定角色出生坐标；换图和试炼返回通过 `scene.restart({ map, portal/pos })` 传递瞬时参数。若人为补入 `position`，就超出了旧代码真实全档口径。因此本样档如实保留“无 position”，现行迁移应使用默认位置。可复核：

```sh
git show v0.4.3:src/Progress.ts
git show v0.4.3:src/scenes/GameScene.ts
git grep -n 'position\|lastMap\|pos:' v0.4.3 -- src/Progress.ts src/scenes/GameScene.ts
```

## 推进路径与模拟边界

依次通过旧 `QuestSystem.talk()` 接取/交付、`onReach()` / `onKill()` 登记目标和 `GameScene.giveRewards()` 发放奖励，完成：灵根初现 → 竹林兔患 → 蛇胆入药 → 引气入体 → 斩妖入宗。交付前逐次检查旧 `available()` / `complete()`，突破由旧 `QuestSystem.turnIn()` 内真实 `Progress.breakthrough()` 执行。

升级和收集使用旧 `GameScene.onMobDead()`、掉落表和 `collect()`；固定 RNG 种子 `0x043f0a`，累计灵兔 18、竹叶青蛇 20、山魈 29、妖狐 1。山魈中 11 只用于升到可接突破任务的等级，接取后记录 18 只。妖狐交付时旧 `data/balance/quests.json` 奖励直接写 `job = tianjian_disciple`，不是由现行宗门入口反向构造。

模拟范围是**无渲染的旧业务逻辑执行**，不是人工游玩录档：注入怪物死亡、抵达目标和技能命中事件；Phaser 场景基类、精灵、掉落飞行动画、日志、升级特效与延迟对白使用 stub。tag 未跟踪的 `src/gen/assets.json` 只有图集、地图美术区域及技能图标清单，也以空渲染清单代替。不会执行寻路、键盘输入、碰撞判定或战斗动画；任务状态、击杀计数、掉落随机抽取、经验/突破、奖励、装备、技能和写档均执行 tag 原代码。

领取旧天剑三项赠技后，通过旧 `addSkillPoint()` 花 4 SP：剑气斩加 2 级、回风剑加 1 级、天剑心法学 1 级。旧 `addMastery()` 记录剑气斩 23 / 回风剑 7 次模拟命中；旧 `bindHotbar()` 自定义绑定 F/Q/W。最后按旧 `damageFrom(mountain_mandrill.atk)` 扣 10 HP、`skillMpCost(sword_qi_slash)` 扣 6 MP，保留正数非满血蓝，便于检查读档无损。

## 可供迁移测试断言的原值

| 项目 | 旧档值 |
| --- | --- |
| level / exp | 12 / 287 |
| hp / mp | 216 / 48（旧 maxHp 226 / maxMp 54） |
| stones / job | 1567 / `tianjian_disciple` |
| skills | `sword_qi_slash:3, whirl_sword:2, light_body:1, tianjian_heart:1` |
| skillGifted | `sword_qi_slash:1, whirl_sword:1, light_body:1` |
| skillMastery | `sword_qi_slash:23, whirl_sword:7` |
| hotbar | `[null,null,null,"whirl_sword",null,null,"sword_qi_slash","light_body"]` |
| 旧一转 SP | earned 10 / spent 4 / left 6 |
| equip | `weapon:azure_steel_sword` |
| inventory | 桃木剑 1、回春丹小 17、山魈獠牙 9、回气丹 6、筑基丹残片 1、天柱残片 1；已消耗兔绒/蛇胆/狐尾保留 0 项 |
| quests | 五个主链任务全部 `done`；首任务 `reached:true`；兔 18 / 突破山魈 18 / 妖狐 1 |
| 突破 | `realmRewards:["mortal"]`, `lastOverflowReturned:21`, `overflowExp:0` |

旧妖狐奖励包括青钢剑、筑基丹残片和天柱残片，旧 `giveRewards()` 自动装备青钢剑并把替换的桃木剑放回背包；旧技能直接赠送剑气斩、回风剑、轻身术，没有五宗帖、宗袍或新宗门任务版本标记。因此现行 load/import 应按照已有 class-entry 规则补迁移状态，并对重复读档保持幂等。

## 本次验证记录（2026-10-16）

生成器最初连续两次运行均退出 `1`：tag 忽略了生成目录 `src/gen/`，导致旧 `data.ts` 引用的 `src/gen/assets.json` 无法加载。修复仅增加上述纯渲染清单 stub；随后生成命令与 `--check` 均退出 `0`，完整样档 SHA-256 如上。每次退出均已清理本次临时 worktree。

现行 `npm run test:v04-save` 在 snapshot/shared 数据模式首轮均通过 160 项断言，退出 `0`。覆盖 `Progress.load()` 与 `importSave()` 可迁移、job/sect 合理、技能/赠级/掌握度/自定义热键和关键数值保留、迁移版本补齐、旧妖狐/天剑 backfill 与 class-entry 一致、宗袍仅补背包一次、重复 load/import 幂等，以及旧档缺失位置迁移为 `position = null`。
