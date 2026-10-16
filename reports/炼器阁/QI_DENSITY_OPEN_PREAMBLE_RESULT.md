# #20 灵气浓度翻表开态 preamble 适配结果

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`

基线：`5fd80bc`（完整 SHA：`5fd80bc6dd41479dc75f1884f826f09ead35c6f6`）

TIP_SHA：（提交后回填）

交付分支：`origin/dev`

## 结果

- 已把演武堂翻开的 `qi_density.json` 逐字节同步进 tip 快照，并仅修改指定测例做开态 preamble / 关态夹具（dual-state）。对齐 #19 `fee6cc7`。
- 表 SHA-256：`03b685a33089fe3350fd1ab83204f344d6b49e7f92aec42fcf6f87c8af8252b0`（根/display/meditation true；future.gathering false；true=3 / false=1）。
- 指定验证全部 PASS，最终退出码均为 0；`test:encounter-runner` 亦 PASS。
- 未改玩法运行时代码；未改正式表数值/结构（仅同步演武已翻字节）；未翻 gifts；未关 #19/lifeSkillCurve；未发版。
- 无关 `data/art/sprites/_pending/secret_rest_r1/` 未改动、未纳入。

## 表哈希与翻表旁证

| 项目 | 核对结果 |
| --- | --- |
| tip `data/balance/qi_density.json` SHA-256 | `03b685a33089fe3350fd1ab83204f344d6b49e7f92aec42fcf6f87c8af8252b0` |
| 共享 `/workspace/xiantu/balance/qi_density.json` | 同 SHA（逐字节一致） |
| `game/data/balance/qi_density.json` | 同 SHA |
| 翻前 SHA | `c1c3694179d9053652ab27f8fa2153442e33716329c8c863ecc87a020c06af16` |
| 根 / display / meditation / gathering | true / true / true / **false** |
| #19 `gongfa_grades` | 保持开（根+bindings true，future 7 false；SHA `93348e89…`） |
| `affinity.gifts.enabled` | 9/9 false |
| `features.lifeSkillCurve` | `true`（SHA-256 `8d00e0668e3fecd3510db97dc261a65cba58c39cb18069e533c43b65fa2532eb`） |

## 改动要点

- `data/balance/qi_density.json`：仅同步演武已翻表字节，未手改 enabled。
- `src/qi-density.test.ts`：正式 tip 开态 preamble（4 门禁，3 true / 1 false）；关态与选择性开态改走全关 `closedRaw` 夹具；正式 config 旁证 resolveTier/meditationFactor 开态与 gathering unavailable。
- `scripts/gongfa-qi-legacy-test.mjs`：正式 tip 开态旁证 4/3/1；`withRuntime('closed')` 同时关 qi 四处；open-clone 对已开正式表幂等且 gathering 保持 false。
- `scripts/encounter-runner-test.mjs`：#20 开态守护（根/display/meditation true、gathering false）；注释改为 #20 已开、gifts 仍关。

## 验证

以下命令均在 `/workspace/xiantu/wt/dev` 执行，最终退出码均为 0。

| 命令 | 最终退出码 | 结果 |
| --- | --- | --- |
| `npm run test:qi-density` | 0 | PASS；snapshot/shared 各 313 assertions |
| `npm run test:gongfa-qi-legacy` | 0 | PASS；881 assertions；combatCases=540，seclusionCases=60 |
| `npm run test:encounter-runner` | 0 | PASS；runner 672 + battle 135；开态字节/MD5 守护通过 |
| `npx tsc --noEmit` | 0 | PASS |
| `git diff --check` | 0 | PASS |

## 给执法堂的三行交接

- tip 含 #20 开态快照 + preamble，可交翻表抽检（入口：`npm run test:qi-density` + `npm run test:gongfa-qi-legacy`；正式表 SHA `03b685a…`；开态真相；关态仅夹具）。
- gifts 仍关；#19 / lifeSkillCurve 保持开；future.gathering 仍 false。
- 本 PASS 后由经理转负责人令进包（建议 v0.5.16）；本次未发版；线上仍 v0.5.15。
