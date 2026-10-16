# #19 功法品阶翻表开态 preamble 适配结果

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`

基线：`acfa94a`（完整 SHA：`acfa94a479c01dcbe41c5215a44e636c3c5d3aaf`）

TIP_SHA：`fee6cc795a4e39c748d23213bbed400d4dd1721a`

交付分支：`origin/dev`

## 结果

- 已把演武堂翻开的 `gongfa_grades.json` 逐字节同步进 tip 快照，并仅修改指定 3 个测例做开态 preamble / 关态夹具（dual-state）。对齐好感 `2b7344e`、正魔 `d44fb17`、生活技能 `2ec3265`。
- 表 SHA-256：`93348e896a40395b46a7e5637c9d5b55a004e590f7668cf0fad235f962520092`（根 true；bindings 38/38 true；future 7/7 false；true=39 / false=7）。
- 指定五项验证全部 PASS，最终退出码均为 0。
- 未改玩法运行时代码；未翻 #20/gifts；未改 future 七处 enabled（保持 false）；未发版。
- 无关 `data/art/sprites/_pending/secret_rest_r1/` 未改动、未纳入。

## 表哈希与翻表旁证

| 项目 | 核对结果 |
| --- | --- |
| tip `data/balance/gongfa_grades.json` SHA-256 | `93348e896a40395b46a7e5637c9d5b55a004e590f7668cf0fad235f962520092` |
| 共享 `/workspace/xiantu/balance/gongfa_grades.json` | 同 SHA（逐字节一致） |
| 翻前 SHA | `48cca756168dc7dabdac4d126ba61805e23139a48c857df98d0542642d9c52e1` |
| 根 / bindings / future | `enabled:true` / 38 true / 7 false |
| #20 `qi_density` | 4 enabled 全 false |
| `affinity.gifts.enabled` | 9/9 false |
| `features.lifeSkillCurve` | `true`（SHA-256 `8d00e0668e3fecd3510db97dc261a65cba58c39cb18069e533c43b65fa2532eb`） |

## 改动要点

- `data/balance/gongfa_grades.json`：仅同步演武已翻表字节，未改数值。
- `src/gongfa-grades.test.ts`：正式 tip 开态 preamble（46 门禁，39 true / 7 false）；关态倍率改走 structuredClone 关态夹具；保留根×绑定矩阵与开态内存测；文末日志改为 tip open + closed fixtures。
- `scripts/gongfa-qi-legacy-test.mjs`：正式 tip 开态旁证；`withRuntime('closed')` 注入根+bindings 全 false 关态夹具；qi 仍 allDisabled；open-clone 对已开正式表幂等。
- `scripts/encounter-runner-test.mjs`：#19 开态守护（根 true、bindings 全 true、future 全 false）；#20 仍 assertAllDisabled；注释改为 #19 已开、#20/gifts 仍关。

## 验证

以下命令均在 `/workspace/xiantu/wt/dev` 执行（Codex 与执行手各跑一轮，最终退出码均为 0）。

| 命令 | 最终退出码 | 结果 |
| --- | --- | --- |
| `npm run test:gongfa-grades` | 0 | PASS；963 assertions × snapshot/shared |
| `npm run test:gongfa-qi-legacy` | 0 | PASS；878 assertions；combatCases=540，seclusionCases=60 |
| `npm run test:encounter-runner` | 0 | PASS；runner 672 + battle 135；开态字节/MD5 守护通过 |
| `npx tsc --noEmit` | 0 | PASS |
| `git diff --check` | 0 | PASS |

## 给执法堂的三行交接

- tip 含 #19 开态快照 + preamble，可交翻表抽检（`fee6cc795a4e39c748d23213bbed400d4dd1721a`）。
- #20/gifts 仍关；lifeSkillCurve 仍 true；future 七处仍 false。
- PASS 前勿发版，PASS → v0.5.15；本次未发版；线上仍 v0.5.14。
