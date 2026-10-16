# 生活技能曲线翻表开态 preamble 适配结果

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`

基线：`c3ab595`（完整 SHA：`c3ab5959fa2d3b6536e1988d36d4869cdf23d61e`）

TIP_SHA：本 RESULT 所在提交（完整 SHA 以 `origin/dev` / 执行手回报为准；避免文档自引用）

交付分支：`origin/dev`

## 结果

- 已修改且仅修改指定的 3 个测试文件；新增本 RESULT。对齐好感 `2b7344e`、正魔 `d44fb17`、奇遇 `8576896` 的开态 preamble / 关态夹具口径。
- `data/features.json` 已由执行手复制就位，本次仅只读核对，未改内容；`lifeSkillCurve === true`。
- 指定五项验证全部 PASS，最终退出码均为 0；snapshot/shared 测试均通过。
- 未修改玩法运行时代码或正式 balance 表；未开启 #19/#20/gifts，未使用 `?cheat=1`。
- 未运行 release、未发版、未合 master、未执行 git commit/push/force push；无关 `data/art/sprites/_pending/secret_rest_r1/` 未改动、未纳入。

## features 哈希与翻表旁证

| 项目 | 核对结果 |
| --- | --- |
| 当前 SHA-256 | `8d00e0668e3fecd3510db97dc261a65cba58c39cb18069e533c43b65fa2532eb` |
| 当前 MD5 | `8b016fe74a812852e2d92e2f94857903` |
| 基线 features MD5 | `a06c3638796fd1bed9af3d45c038c954` |
| 当前 lifeSkillCurve | `true` |
| 相对基线差异 | 13 键中仅 `lifeSkillCurve: false → true`，其余 12 键及键集合不变 |

当前 features 的 13 个值均为 true；“仅 lifeSkillCurve 变 true”指相对基线的唯一变更。

只读脚本对工程快照 `data/balance/` 与共享 `/workspace/xiantu/balance/` 分别核验，结果一致：

| 文件 | 当前 tip 旁证 |
| --- | --- |
| `npcs.json` | 共 27 名 NPC，其中 9 个好感块 `affinity.enabled === true`；9 个 `affinity.gifts.enabled === false` |
| `karma_flags.json` | 恰有 `prologue_medicine` / `sect_tianjian_sword` 两题，`questHooks.enabled === true` |
| `gongfa_grades.json`（#19） | 46 个 enabled 全部严格 false，true 计数 0 |
| `qi_density.json`（#20） | 4 个 enabled 全部严格 false，true 计数 0 |
| `encounters.json` | 正式 5 个事件仍全部 enabled=true，既有守护未改 |

两套奇遇测试的前后字节及 MD5 守护均通过；`git diff --exit-code -- data/balance` 退出码 0，正式 balance 表无工作区改动。features 在测试前后均匹配上述固定哈希。

## 改动要点

- `src/life-skills.test.ts`：preamble 期望改为 true，文案为 tip 开态、发布快照已开启；仅此一处变更。显式 `setFeatureFlag('lifeSkillCurve', false)` 及 `oldSaveBaseline` 等关态测例完整保留。
- `scripts/encounter-test.mjs`：features 守护改为 `lifeSkillCurve === true` 并更新 tip 开态文案；encounters 已 true 的守护保持原样。
- `scripts/encounter-runner-test.mjs`：固定 features MD5 更新为本次开态快照，lifeSkillCurve 严格 true；按文件分别校验 9 个好感块开 / 9 个 gifts 关、指定两题 questHooks 开、#19/#20 全关。同步注释，保留正式表前后逐字节及 MD5 守护。

## 验证

以下命令均在 `/workspace/xiantu/wt/dev` 执行。

| 命令 | 最终退出码 | 结果 |
| --- | --- | --- |
| `npm run test:life-skills` | 0 | PASS；snapshot/shared 各 10690 断言，正常表及坏表模块图均通过 |
| `npm run test:encounter` | 0 | PASS；snapshot/shared 各 1445 断言，正常表及坏表模块图、字节守护均通过 |
| `npm run test:encounter-runner` | 0 | PASS；snapshot/shared 各 runner 672 + battle 135 断言，字节守护均通过 |
| `npx tsc --noEmit` | 0 | PASS |
| `git diff --check` | 0 | PASS |

runner 首轮退出码为 1：实现时误把 9 个好感块作为 NPC 总数断言；已修正为从 27 名 NPC 中提取好感块并严格断言 9 个，重跑退出码 0。其余指定验证首次退出码均为 0。

补充只读旁证脚本（features 哈希 / 基线差异 / 快照与共享开关计数）退出码 0；独立只读 diff 复核 PASS。

## 给执法堂的三行交接

- tip 含开态快照 + preamble，可交翻表抽检（完整 SHA 见 origin/dev）。
- #19/#20/gifts 仍关。
- PASS 前勿发版，PASS → v0.5.14；本次未发版。
