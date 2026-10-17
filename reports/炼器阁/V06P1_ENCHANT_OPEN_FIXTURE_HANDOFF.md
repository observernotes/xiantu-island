# P1③+++++ 附灵一期 · 开态夹具交接

2026-10-17 Asia/Shanghai；工作目录 `/workspace/xiantu/wt/dev`，分支 dev，stdin=/dev/null。

开工已 `git fetch && git pull --ff-only origin dev`，基线 HEAD=`2ad6367f4b5fd70caa01e8cb1df392db3971fb7d`，包含关态 tip `5bee47d7b81ed22ed5c28719d9c06190ea817c13`。
实现 tip：`b4764a83261aec8521a80eecd06527abc61d03eb`；文档 tip / origin/dev / 远端 HEAD 见推送后的 `qa/out_v06p1_enchant_open_fixture/final-tip.json` 和最终回执。

依据负责人令 `/workspace/xiantu/reports/炼器阁/20261017_负责人令_P1③+++++开态夹具.md`、design/29 §2.1–§2.3 / §4.3 O01–O08、关态 HANDOFF/RESULT，以及强化原开态夹具的独立 Flag / SSR 内存图范式。
**本窗=附灵开态夹具全表 ≠ soft-open ≠ release ≠ 进包。正式 EnchantOpenFlag 恒 false。**

## 实现与事务

`EnchantGate` 的 feature / entrance / enchant / submit / result / element / loadRefresh / laterService 八入口首语句均查 `isEnchantOpenForFixture()`；false 原样返回 `EnchantClosed` 对应八 tip，零资格/费用结算、零扣费、零元素属性修改、零业务写入或排队。
Flag 只改说明注释，函数体仍 `return false`；`EnchantClosed` 与关态 tip 字节 MATCH。只有新 runner 的 Vite SSR resolve/load 内存图注入 true。
开态 feature/entrance 只读允许，enchant 只读预览，submit 才能写入；result/element/loadRefresh 只读完整事实，laterService 仍 `enchant.closed.later_service`。

唯一费用与效果来自只读 `enhance.enchant`：elementDamage=0.05、sameRootBonus=0.05、stones=2000、beast_core×1。服务确定性成功，无rate或概率失败，不读取打造/强化旗授权附灵。beastCoreMapped 只表示登记与合并记录齐备，不能代替生产开放依据。
默认仅沿 `formalEnhanceInstances()` 和 `formalEnhanceInstanceStatus()` 核对本档正式武器 instanceRef、来源、资格与真实持有；itemId数量、历史袋、foreign、armor不可授权。不提供生产默认 fixtureInstances 或缺源回退。

可选 `EnchantProgress` 仅保存完整结果链、最终元素属性、ownerSlot与去重收据；完整成功一次才扣、才建袋。覆盖要求精确 fromElement，换元素再付全额费用，同元素新请求拒绝。成功请求重放只读完整原结果，载荷冲突拒绝。
事务对同槽并发加锁，提交前和草稿内复核完整依赖/状态；失败不发布草稿，不先扣后返。完整存档序列化亦处于try/finally内，抛错仍释放Gate/槽锁；恢复后须显式重试，至多完整成功一次。Progress.ts 仅新增结构 import、validSaveData 校验、字段与注释四完整行；剥离后逐字节恢复基线。既有 export/import/restore 承载事实，缺字段旧档保持 undefined。

## O01–O08 实际旁证

主证据 `qa/out_v06p1_enchant_open_fixture/v06p1-enchant-open-evidence.json`；每行均已程序执行，执行图、各case键与实际断言详见该文件。

| 项 | 实测场景 | 结论 | 旁证键 |
|---|---|---|---|
| O01 | 独立许可；五行各自首次附着 | API feature/entrance 与预览只读；本档正式武器确定成功；元素、0.05、全额2000+1、完整结果及收据同事务；无生产夹具实例回退 | `cases.O01` / 各图同名case |
| O02 | 同根与异根 | 同根额外读取0.05，异根为0；最终属性替换，不累加历史属性 | `cases.O02` / 各图同名case |
| O03 | 资格、映射、配置与资源异常 | 缺灵石/内丹、仅登记/映射异常、非法配置、itemId冒充、armor、foreign及非法武器资格均整笔零扣拒绝；不借打造/强化旗 | `cases.O03` / 各图同名case |
| O04 | 同元素与请求重放 | 新请求选同元素拒绝；已完整成功请求载荷匹配才只读回原结果，零补料、零二次消费；冲突不冒认 | `cases.O04` / 各图同名case |
| O05 | 不同元素覆盖 | 足量且门禁通过再次完整付2000+1并保留instanceRef；缺料或过期fromElement原态不变；旧元素属性不叠加 | `cases.O05` / 各图同名case |
| O06 | 首次/覆盖保存、读档、刷新与跨档 | 真实存档承载完整结果、最终元素/属性与去重；全新SSR图重读；跨档同引用不混认，不补扣、不补做 | `cases.O06` / 各图同名case |
| O07 | 请求、实例与共享库存竞争 | 并发至多一次；稳定请求载荷冲突拒绝；事务内复核原元素、来源、库存；同槽锁与过期全态拒绝防止双付/重复覆盖或负库存 | `cases.O07` / 各图同名case |
| O08 | 中断、承载/保存失败、未知记录、关态回调 | 完整成功一次或原合法状态；草稿拒绝与真实IDB abort不发布半态；未知/损坏链阻断写入，不修档或补做；强化/护符结果保留 | `cases.O08` / 各图同名case |

shared/snapshot 两根各运行正式 false 图（flagLoads=0）、内存 true 图（flagLoads=1），并建立 fresh SSR 图读回完整存档。异常配置与映射在内存测试图隔离，不改真实表或产品模块。测试使用真实 Progress/SaveStore/IndexedDB 后端事务代码，IDB介质由夹具工厂提供；程序PASS不代替浏览器实机或执法独立结论。

## 自检与保护

全部最终自检命令 exit 0；专项 4219 条断言，含回归共 142079 条测试断言；独立冻结保护 1603 条检查另计。

| 检查 | 结果 | 本窗out旁证 |
|---|---|---|
| `tsc` | exit 0 | `tsc.log` / `tsc.result.json` |
| `v06p1-enchant-open` | exit 0，4219 断言 | `v06p1-enchant-open.log` / `v06p1-enchant-open.result.json` |
| `v06p1-enchant-closed` | exit 0，12534 断言 | `v06p1-enchant-closed.log` / `v06p1-enchant-closed.result.json` |
| `v06p1-enhance-open` | exit 0，17729 断言 | `v06p1-enhance-open.log` / `v06p1-enhance-open.result.json` |
| `v06p1-enhance-closed` | exit 0，30836 断言 | `v06p1-enhance-closed.log` / `v06p1-enhance-closed.result.json` |
| `v06p1-forge-open` | exit 0，6381 断言 | `v06p1-forge-open.log` / `v06p1-forge-open.result.json` |
| `v06p1-forge-closed` | exit 0，20413 断言 | `v06p1-forge-closed.log` / `v06p1-forge-closed.result.json` |
| `v06p1-market-closed` | exit 0，24194 断言 | `v06p1-market-closed.log` / `v06p1-market-closed.result.json` |
| `v06d-closed` | exit 0，15059 断言 | `v06d-closed.log` / `v06d-closed.result.json` |
| `v06c-closed` | exit 0，10714 断言 | `v06c-closed.log` / `v06c-closed.result.json` |
| `datalint-shared` | exit 0 | `datalint-shared.log` / `datalint-shared.result.json` |
| `datalint-snapshot` | exit 0 | `datalint-snapshot.log` / `datalint-snapshot.result.json` |
| `diff-check` | exit 0 | `diff-check.log` / `diff-check.result.json` |

既有回归的历史SHA、944键与源码全集期望，在本窗QA副本 `regression-register.mjs` / `regression-loader.mjs` / `regression-compat-support.mjs` 进行逐项精确内存适配。
当前真实表始终由原fs读取，真实产品SSR模块照常执行；没有替换fs、断言包装器或产品业务逻辑。新源码白名单与四行Progress承载另由独立保护脚本核实，剥离后仍核完整历史SHA；每项原/变换SHA与精确替换均写回归旁证。旧runner/旧QA保留；附灵关态runner仅适配获准新增Gate/袋的历史静态缺文件判断，C01–C10继续执行且关态过程零写。源码尚未齐备时的静态预检失败留在 attempts，最终结果见上表。

旧QA tracked文件逐个对基线blob MATCH，既有untracked QA与art pending在本次捕获前后SHA MATCH；详见 prior-evidence-before/after.json（untracked时间限度已单列）。独立补充探针26断言复核跨档缺源、非附灵事实stale和同槽不同Progress并发，见 independent-review.json。
双根冻结 enhance/recipes/materials/items/strings/npcs/life_skills/enhance_protect_charm SHA 全 MATCH；ForgeOpenFlag/EnhanceOpenFlag、EnchantClosed、data.ts完整字节 MATCH，EnchantOpenFlag 函数体 MATCH。完整SHA在 `protection-check.json` / `protection-baseline.json`。
EnhanceOpenFlag正式true及护符soft-open保留，Forge路径无回退；GAME_PHASE=5、strings952、gifts10×false、smith_ou无services。不改NPC/dialog/quests/地图，不接GameScene附灵入口；强化混入附灵/分解仍 `enhance.closed.later_service`，独立分解仍 `enchant.closed.later_service`。

```json
{
  "enchantClosedTipsWired": true,
  "beastCoreMapped": true,
  "enchantOpenFixtureTableExecuted": true,
  "formalInstanceSource": true,
  "softOpenedEnchant": false,
  "EnchantOpenFlag": false,
  "released": false,
  "protectCharmSoftOpenPreserved": true,
  "EnhanceOpenFlagPreserved": true
}
```

`selfcheck-summary.json` / `evidence-check.json` / `protection-check.json` 汇总对应实际命令和旁证。未运行 snapshot/build/sync/release；未做分解流程、阵法、gifts/#20、拍卖/坊市，不抬阶段。

## 交付与下一棒

Codex日志：`/workspace/xiantu/logs/codex/a27afaff41c16b87_20261017_134128_1620212.log`；启动参数与引用见本窗 `codex-log-reference.json`，model=gpt-6.1-sol，reasoning effort=ultra，stdin=/dev/null，未启fast。动态日志只引用，不暂存进行中的文件。
HANDOFF/RESULT/status 均UTF-8同步至 `/workspace/xiantu/reports/炼器阁/` 和 `/workspace/xiantu/status/炼器阁.md`；status四段≤30行。本窗仅暂存授权源码、测试/runner/package、QA与上述报告/status；原dirty、art pending与旧QA保留。实现、文档两笔普通提交后 `git push origin dev`，禁force-push/reset --hard。

无程序自检阻断。下一棒交执法按 design/29 §4.3 O01–O08 对实现tip、事务前后事实及冻结SHA独立抽检。执法PASS后请负责人另下soft-open令；本令不授权正式翻旗、soft-open、release或进包。
