# P1③+++++ 附灵一期 soft-open preamble 交接

2026-10-17 Asia/Shanghai；工作目录 `/workspace/xiantu/wt/dev`，分支 `dev`，命令 stdin=`/dev/null`，ultra，未启 fast。

**附灵 soft-open 程序自检 PASS；PASS≠进包≠发版≠release；fixture≠正式≠进包依据。无程序自检阻断。**

开工执行 `git fetch origin && git pull --ff-only origin dev`，exit 0 / Already up to date。基线 HEAD=`feece9916733dbc705d4d57882ff924449e2efd7`，包含开态夹具实现 `b4764a83261aec8521a80eecd06527abc61d03eb`。
实现 tip：`217a5a6e6dde33cbe0f711076adfc6053349551e`。文档 tip、最终 origin/dev 与远端 HEAD 见推送后 `qa/out_v06p1_enchant_soft_open/final-tip.json` 及最终回执；两笔普通 commit 后普通 push，不使用 force。

依据：负责人令 `/workspace/xiantu/reports/炼器阁/20261017_负责人令_P1③+++++soft-open.md`；design/29 §4.3 O01–O08；开态夹具 HANDOFF/RESULT；强化 preamble `git show ff90d189fa4688506986ff4aa3180343e1aacbd2` 与指定 prompt、HANDOFF/RESULT。

## 正式旗与最小入口

`src/EnchantOpenFlag.ts` 精确为：

```ts
/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */
export function isEnchantOpenForFixture(): boolean { return true; }
```

写前 SHA `825776ba9adcf7f085806bf54ed35ef4254f0a40be64851e2fa66e37f71e5994`（false），写后 `bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a`（true）。无 import/process/环境变量、配表或 features 覆盖。

GameScene 仅追加三个 import 与一个完整只读提示块，在既有 `tryInteractForgeEntrance` 同一次 smith_ou 命中末尾、唯一 `return true` 前执行。顺序为 forge→enhance→enchant；前两 Gate 拒绝时仍显示附灵，避免提前消费命中。正式开态调用 `new EnchantGate(this.prog).entrance()`，允许显示「装备附灵已开放。」，拒绝显示 Gate 原文；SSR 内存 false 直接显示 `enchantFeatureClosed().text`，绕过 Gate 资格与结算。

name=smith_ou / props.npc=smith_ou、横距≤28、纵距≤40、senseMap 隐藏、无对象安静、Z 与通用交互调用点均保持。精确剥除新增三个 import 与完整提示块后，GameScene 恢复 feece99 全部原字节。打造/强化原文、颜色、距离和先后语义保持。

未挂 smith_ou.services，未接完整 UI/提交面板，未改 ShopPanel、NPC/dialog/quests/地图。生产 GameScene 无 fixtureInstances 注入，不从 itemId 数量生成实例。EnchantGate / EnchantProgress / Progress 结算与承载字节全部保持。

## 正式 O 表与双图

open 专项 **4622** 断言（runner 754 / runtime 3868），shared/snapshot 共 **36** 个隔离 Vite SSR 图：**32 正式图全部 flagLoads=0**，**4 memory-closed 图全部 flagLoads=1**。每根包括正式完整 O 表、正式 fresh SSR、14 类非法依赖正式图，以及初始/带历史的内存关态图。只有关态图 resolve/load 注入 false，未为附灵创建 memory-open 图。

双根正式完整表逐项硬断言 O01–O08 已执行且 evidenceKeys 非空；全表仅用默认 ForgeGate 完整提交登记正式武器，再由默认 EnchantGate 沿 formalEnhanceInstances / formalEnhanceInstanceStatus 校验当前档武器。fixtureInstances 仅用于显式隔离或负测，生产默认与缺源回退均无依赖。

| 项 | 正式磁盘图程序旁证 |
|---|---|
| O01 | 五行首次附着、独立许可、正式登记与持有关系、元素/0.05/2000+1/结果/去重同事务一次完成。 |
| O02 | 同根额外只读 sameRootBonus=0.05，异根为0，不叠历史属性。 |
| O03 | 缺灵石/内丹、仅登记/映射未齐、非法配置、itemId冒充、armor/foreign/非法资格整笔拒绝，零扣；不借 Forge/Enhance 旗。 |
| O04 | 同元素新请求拒绝；匹配原成功请求只读完整结果、零补料，冲突不冒认。 |
| O05 | 不同元素覆盖再次完整支付2000+1，保留instanceRef；缺料/过期fromElement零扣，原元素与属性保留。 |
| O06 | 首次及覆盖 export/import/restore/真实 SaveStore 与 IDB 后端/fresh SSR 读回一致，跨档不混认，不补扣补做。 |
| O07 | 同请求/实例及共享库存并发、载荷冲突、事务内复核；至多一次完整结果，无负库存或重复覆盖。 |
| O08 | 保存/承载失败、真实 IDB abort、中断、未知/损坏记录、锁释放后重试及关态旧回调；完整成功一次或保留原态，既有强化/护符保留。 |

8 个正常表图均运行真实 `GameScene.prototype` 冒烟：无对象、非 smith_ou、±29 横超距、±41 纵超距、隐藏、name/props.npc、±28×40 边界、通用交互、三 tip 原文/顺序、附灵 Gate 拒绝、关态绕过 Gate、打造/强化拒绝不饿死附灵。各图 sceneSmoke.saveWrites=0，整档/IDB rows/完整提交/localStorage 均无入口写入。

closed 专项 **12600** 断言、176 语义夹具、2136 次 API 调用；两根先无注入验证正式 true / flagLoads=0，再用四个独立 SSR false / flagLoads=1 图跑 C01–C10 与 fresh 读回。八 tip 原文、首旗拒绝、拒绝零写保持；ordinarySaveSetupWrites 仅 C08 测试准备普通保存，不计为拒绝业务写入。

唯一数值源 enhance.enchant（0.05 / 0.05 / 2000+beast_core×1）不变；确定性无rate，完整成功一次才扣。强化混入附灵/分解仍 enhance.closed.later_service；独立分解仍 enchant.closed.later_service。

```json
{
  "enchantClosedTipsWired": true,
  "beastCoreMapped": true,
  "enchantOpenFixtureTableExecuted": true,
  "formalInstanceSource": true,
  "softOpenedEnchant": true,
  "EnchantOpenFlag": true,
  "released": false,
  "EnhanceOpenFlagPreserved": true,
  "protectCharmSoftOpenPreserved": true
}
```

主证据：`qa/out_v06p1_enchant_soft_open/v06p1-enchant-open-evidence.json`；聚合 `evidence-check.json` / `selfcheck-summary.json` / `protection-check.json` / `independent-review.json`。

## 自检与历史兼容

全部最终命令 exit 0，共 **142855** 条测试断言；tsc、双根 datalint（各问题0条）、diff-check 与独立保护另计。日志与同名 result.json 位于本窗 QA 根。

| 命令 | 断言 / 结果 |
|---|---:|
| npx tsc --noEmit | PASS |
| npm run test:v06p1-enchant-open | 4622 |
| npm run test:v06p1-enchant-closed | 12600 |
| npm run test:v06p1-enhance-open | 17767 |
| npm run test:v06p1-enhance-closed | 30910 |
| npm run test:v06p1-forge-open | 6443 |
| npm run test:v06p1-forge-closed | 20489 |
| npm run test:v06p1-market-closed | 24251 |
| npm run test:v06d-closed | 15059 |
| npm run test:v06c-closed | 10714 |
| 双根 python3 /workspace/xiantu/qa/tools/datalint.py | PASS / 0问题 |
| git diff --check | PASS |

五个 forge/enhance/market runner 通过本窗 `scripts/v06p1-enchant-soft-open-compat-proof.mjs` 精确兼容已经存在的附灵源码、952键、内丹映射与新增第三tip。真实表固定SHA，逐字逆变换恢复历史944/材料/道具SHA；只剥授权四行Progress承载、三import和完整Scene提示块；保留原Forge/Enhance提示与颜色断言、完整历史源码SHA及关态零副作用套件，不跳过整个文件。

v06c/v06d runner 磁盘源码未改；本窗 QA 的 legacy-regression-register/loader 只在测试进程精确适配历史字符串期望，逐字证明新增八键之外全部字节保持，不替换fs、断言包装器或任何产品SSR模块。替换前后SHA、次数与内容写 regressions/v06c-closed、v06d-closed 的 compatibility-source-adaptations.json。所有旧out均保留；初始兼容预检失败日志保存在 attempts，修正后最终命令均exit 0。

## 保护、交付与下一棒

写前/写后 `protected-before.json` / `protected-after.json` 捕获 **1653** 个文件：三根 balance/maps、指定生产模块、全部既有本wt QA、指定执法旧out与待审art；固定权威SHA检查用于当前shared/snapshot，game保留自身历史快照。文件内容和路径集合不变，未授权差异 **0**，20项权威冻结SHA MATCH。EnchantOpenFlag 是唯一翻旗，EnhanceOpenFlag仍正式true，ForgeOpenFlag保持。

| 保护项 | 写前=写后 SHA-256 |
|---|---|
| EnhanceOpenFlag.ts（true） | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e |
| ForgeOpenFlag.ts | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e |
| EnchantClosed.ts | 15870998e95f8f41ab4fb3e6c30dc17a82019502276084f4610800be5927e730 |
| data.ts（GAME_PHASE=5） | aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a |
| enhance.json（含enchant只读） | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 |
| recipes.json | 1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f |
| materials.json | 86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d |
| items.json | dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99 |
| strings_zh.json（952） | 6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9 |
| npcs.json（gifts 10×false） | 2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6 |
| life_skills.json | 204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b |
| enhance_protect_charm.json | 0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772 |

`qa/out_p13ppppp_enchant_closed_5bee47d/` @5bee47d、`qa/out_p13ppppp_enchant_open_b4764a8/` @b4764a8，以及本wt `qa/out_v06p1_enchant_closed/` / `qa/out_v06p1_enchant_open_fixture/` 保留不覆盖；强化与护符soft-open旁证保持。当前所有旁证只写 `qa/out_v06p1_enchant_soft_open/`。待审art/dist-test/旧QA/talisman审计/codex_prompt及动态启动日志不纳入提交。

Codex日志：`/workspace/xiantu/logs/codex/44bf3e1b3f39c7ab_20261017_140615_1666238.log`，只引用；启动信息见codex-log-reference.json（gpt-6.1-sol / ultra / stdin=/dev/null / fast=false）。HANDOFF、RESULT、四段≤30行status以UTF-8同内容同步 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。

未运行 snapshot/build/sync/release/Pages，未进包发版、未抬GAME_PHASE，未混入分解/阵法/gifts/#20/拍卖/坊市工作，未force-push/reset --hard。

**下一棒交执法：按 design/29 §4.3，在实现tip的正式 soft-open 磁盘图独立重抽 O01–O08 + 真实 smith_ou 入口冒烟，并核对正式零注入、关态八tip零写、冻结SHA与强化/护符保留。程序PASS不代执法；执法PASS≠进包≠发版，release/进包仍待负责人另令。无程序自检阻断。**
