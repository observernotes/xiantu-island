# P1③++++++++ 开态补刀合入交接（界面侧）

2026-10-17 20:32 Asia/Shanghai (UTC+8)；界面接入主责；分支 `feat/ui-smith-services`。

合并 tip：`abff11d` / `abff11da3e5b251187649bc8a37ef9d7b8729fa2`（`--no-ff` 合入炼器实现 tip `ef99abb76056a71ebfed6c02d8c9a5c1f175e284`）。祖先含界面开态夹具 `9d00852`、炼器开态夹具 `a1d645d`、基线 `7b06f5a`。始终在本 wt；**未** merge/push `origin/dev`；≠ soft-open ≠ release ≠ 进包。

**O01–O11 全 PASS；`allOpenCasesPassed:true`。** 本窗真实重跑证据：`qa/out_v06p1_smith_services_open_abff11d/`（共享同路径）。旧 `open_9d00852` / `open_ef99abb` / `open_fixture` / 关态 outs **保留不覆盖**。未代勾执法；交经理派执法全表。

## 合入与代码

1. `git merge --no-ff ef99abb` → 合并 tip `abff11d`。
2. 业务 Gate/Progress/SaveStore 正式分解依赖与跨 Progress CAS 来自炼器 tip；Controller/Panel/GameScene 路由侧本窗未改。
3. 仅 QA harness：`scripts/v06p1-smith-services-open-regression.mjs` 分支锁改回授权本窗 `feat/ui-smith-services`（避免 attr-ui 回归误锁 `feat/smith-services-open-fix`）。经 `codex_run.sh sol`；未改 Flag/结算/数值表。

## O 表（本窗重跑）

| 项 | 结论 | 要点 |
|---|---|---|
| O01–O04 / O06 / O07 / O10 | PASS | 打造/强化/附灵既有 PASS 子项保持，未回退。 |
| O05 | PASS | 正式路径完整提交成功；`o05FormalProductionSuccess:true`；`productionFormalPath:true`；`fixtureQualificationInjected:false`；`fixtureCarrierInstalled:false`。非 SalvageFixture 生产回退。 |
| O08 | PASS | 四服务完整提交后保存/读档/刷新重放；分解成功重放随 O05 齐。 |
| O09 | PASS | `o09StaleForgeEnhanceBlocked:true`；旧 Forge/Enhance 未覆盖已提交 Enchant；`lostCompletedEnchant:false`；`singleGameSceneCurrentProgressBypassClaimed:false`。 |
| O11 | PASS | 四服务真实完整结果回菜单；故意关态与四 Flag 不回翻保持。 |

## 硬门

```json
{
  "smithServicesOpenFixtureTableExecuted": true,
  "allOpenCasesPassed": true,
  "softOpenedSmithServicesUi": false,
  "released": false,
  "newOpenFlag": false,
  "settlementUnchanged": true,
  "fourFlagsPreserved": true,
  "stringsDiskKeys": 1013,
  "stringsSsrInjected43": false,
  "GAME_PHASE": 5,
  "gifts0": true
}
```

四 Flag formal true MATCH：Forge `0ce03554…` / Enhance `d7a3f688…` / Enchant `bd5445b8…` / Salvage `69aace85…`。
enhance `d5b91a06…` MATCH；strings1013 `d99a88fd…`；四 Gate 结算 callback AST 对基线 `7b06f5a` MATCH。

## 自检

| 项 | 结果 |
|---|---|
| `npm run test:v06p1-smith-services-open` | 2980 assertions，O01–O11 全 PASS，exit 0 |
| fixture companion | 2897 assertions PASS（隔离对照） |
| 22 套回归 | 182314 assertions，全部 exit 0 |
| tsc / datalint 双根 / protection | exit 0 |
| 合计断言下界 | **188191** |

未跑 snapshot/build/sync/release/Pages。未抬 GAME_PHASE；未新建生产 OpenFlag；未请 soft-open。

## 交付路径

- out：`qa/out_v06p1_smith_services_open_abff11d/`（共享 `/workspace/xiantu/qa/out_v06p1_smith_services_open_abff11d/`）
- HANDOFF：`reports/炼器阁·界面接入/V06P1_SMITH_SERVICES_OPEN_FIX_HANDOFF.md`
- RESULT：`reports/炼器阁·界面接入/V06P1_SMITH_SERVICES_OPEN_FIX_RESULT.md`
- 报告：`reports/炼器阁·界面接入/20261017_P1③++++++++_smith开态补刀合入重跑.md`
- 炼器对照（只读）：`reports/炼器阁/V06P1_SMITH_SERVICES_OPEN_FIX_*.md`；炼器 out `…_ef99abb/`

下一棒：经理派执法独立 wt 全表 O01–O11；PASS 且硬门仍 false 后再请负责人 soft-open 令（本窗不授权）。
