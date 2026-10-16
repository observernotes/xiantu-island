# #19 功法品阶 / #20 灵气浓度最小接入结果

执行：炼器阁·主程序 <xiantu@local>；日期：2026-10-16（Asia/Shanghai）。

起始 dev tip：`8cca2a4090b044e0bb6468d2369f38334200dfae`。
接入 tip sha（实现与快照提交）：`615f0788999d3451dbe58540633170c433c00255`。
本报告及状态文件在该 tip 上另作文档提交；最终分支 tip 可由 `git rev-parse HEAD` 核对。

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/GongfaGrades.ts` | 结构、引用和门禁校验，独立深冻结快照；effectMul、legacy 上限及 future 不可用查询 |
| `src/QiDensity.ts` | 结构校验及深冻结；mapDensity、resolveTier、meditationFactor、future gathering 不可用查询 |
| `src/data.ts` | 统一通过 @xt 加载两表，导出 GONGFA_GRADES / QI_DENSITY 及对应 *_ERRORS |
| `src/SkillCombat.ts` | 等级求值后的根 damageRatio 乘一次品阶倍率，再沿原派生 multiplier 与战斗公式 |
| `src/gongfa-grades.test.ts`、`src/qi-density.test.ts` | 真表、坏表、缺字段、关态、内存开态、只读及边界单测 |
| `scripts/gongfa-grades-test.mjs`、`scripts/qi-density-test.mjs` | snapshot/shared 分别运行正常表与内存坏表注入 |
| `scripts/gongfa-qi-legacy-test.mjs` | 从起始 SHA 加载原版 SkillCombat / Progress / Seclusion，逐项比较行为 |
| `package.json` | 新增 test:gongfa-grades / test:qi-density / test:gongfa-qi-legacy |
| `data/balance/gongfa_grades.json`、`data/balance/qi_density.json`、`data/SNAPSHOT.txt` | 按 npm run snapshot 冻结原表及更新时间戳 |
| `reports/炼器阁/GONGFA_QI_DENSITY_RESULT.md`、`status/炼器阁.md` | 结果与状态交接 |

## 测试

| 命令 | 结果 |
|---|---|
| `npm run snapshot` | 内置 --pre 通过：artcheck 错误 0；datalint 问题 0；未用 XT_SKIP_PRE |
| `npx tsc --noEmit` | 全部新增测试纳入后通过 |
| `node scripts/gongfa-grades-test.mjs`（test:gongfa-grades） | snapshot/shared 各 875 条断言；各自坏表旧学习、升级、系数及存档检查通过 |
| `node scripts/qi-density-test.mjs`（test:qi-density） | snapshot/shared 各 303 条断言；各自坏表原闭关逐年输入与结算通过 |
| `npm run test:gongfa-qi-legacy` | 752 条断言，540 个战斗场景、60 个闭关场景，通过 |
| `npm run test:features` | 164 条断言，consoleErrors / pageErrors 均为 0 |
| `npm run test:classes` | 职业逻辑 9200、关口 3990、任务原子保存 128、职业替换 1747、入宗 1056 条检查通过 |
| `npm run test:v05` | 451 条检查通过，含 G2/G8 与原宗门闭关 |
| `git diff --check` | 通过 |

## 关态证明

- 共享源与快照逐字节一致；功法根、38 个绑定及 future 共 **46** 个 enabled:false，灵气根、display、meditation、gathering 共 **4** 个 enabled:false。未新增 features 名称，`data/features.json` 与起始 tip 一致。
- 功法根或绑定关闭、缺绑定、坏表均返回 effectMul=1；none 在查询时不读取 grades，legacy 上限不读取 levelCap。原 maxLevel、熟练度追加上限、学习条件和 SP 继续由原模块负责。
- 战斗 gradeMul=1 时跳过新增乘法，保留原运算顺序。对照起始 SHA 的真实实现，覆盖全部 15 个正根 damageRatio 非被动技能、三个等级、暴击与根/派生段。关态及坏表的根系数 IEEE754 字节、真实伤害、命中事件 JSON 完全一致。开态只使用内存克隆，证明 damage_ratio 只乘一次、none 不乘；正式表未开启。
- `src/Progress.ts`、`src/skills.ts`、`src/Seclusion.ts`、`src/features.ts` 均与起始 tip 无差异。闭关仍逐年只用 solo_pacing.sectSeclusion 的室内浓度与 roomMul，不叠地图浓度；前后真实资格检查、收益与存档 JSON 完全一致。
- 灵气根或 display 关闭时 resolveTier 返回 pending；根或 meditation 关闭时 meditationFactor 返回 legacy / 1，且不读取浓度及节奏参数。helper 未接入 UI 或原打坐/闭关公式。
- 两表同时损坏时，真实技能学习/升级、攻击、地图落点保存、任务接交与宗门闭关仍通过。future 接口始终不可执行；不创建 gongfaState 或 qiContext 存档字段。
- 只读核对全部 49 张真图：根 properties 按 name 唯一 qiDensity、type=int、合法域内；无缺失/重复/非法值。分档按 [min,nextMin)，末档覆盖至合法域上限。

| 表 | 共享源与快照共同 SHA-256（与演武报告一致） |
|---|---|
| gongfa_grades.json | `48cca756168dc7dabdac4d126ba61805e23139a48c857df98d0542642d9c52e1` |
| qi_density.json | `c1c3694179d9053652ab27f8fa2153442e33716329c8c863ecc87a020c06af16` |

## 缺口清单与边界

- 本次接入必需字段：无缺项；两张真表无 null，所属 balanceTodo 全空。未猜测、补写或修改平衡值。
- 文案：设计所列 gongfa.* 71 条、qi.* 39 条全部存在且非空，无缺项；关态未新增展示。
- 后期内容沿正式表保持 future.recipes=[]、future.variants=[]、future.gathering.bindings=[]；未补配方、材料池、投放或默认数值。
- 研习、顿悟、升阶、拼合、变体与采集品质仅保留校验/不可用门禁；grade 上限模式和成长存档迁移未实施，须后续专项接入。
- 未改 master/hotfix/release、共享平衡源、地图、~/.codex 或 tools/codex_run.sh；起始未跟踪的 TALISMAN_UI_STRINGS_MERGE_RESULT.md 原样保留，不纳入本任务。
