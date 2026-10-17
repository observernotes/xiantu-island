# Salvage 正式依赖 + 跨 Progress CAS · ef99abb

实现 tip：`ef99abb76056a71ebfed6c02d8c9a5c1f175e284`；基线 `39d006d` 已含 `9d00852`、`a1d645d`、`b81af61`、`7b06f5a`。

本目录为本窗新证据，≠ soft-open ≠ release ≠ 进包。原 `open_9d00852`、`open_fixture` 与全部 smith-services closed out 保留；本窗不 fan-out 执法。主程序转告接引子合入后重跑 O05→O08/O09/O11 及全表。

- `evidence.json` / `O01_O11.json`：双根真实生产路径主表；默认 `new SalvageGate(progress)`，无资格/承载注入。`allOpenCasesPassed:true`。
- `selfcheck-summary.json`：主表、22 套回归、fixture 回归、双根 datalint、tsc、冻结门的严格聚合。
- `regressions/`：每套命令、退出码、完整日志、精确 pinned inputs、静态历史字节恢复与 loader provenance。SSR 始终加载当前产品模块。旧日志保留历史命名，当前数据口径以本目录主表和冻结证据为准。
- `fixture-regression/`：显式 fixture 对照，`isolatedFixtureRegressionOnly:true`，`productionO05Claimed:false`。
- `protection-check.json`：四 Flag/enhance/strings1013/GAME_PHASE/gifts、四 Gate 结算回调及既有非边界方法、冻结表、历史 open/closed 清单。
- `delivery-protection-check.json`：最终测试运行前后全部旧 QA 产物、产品源、双根表字节比较。
- `final-tip.json`：实现 tip、docs tip、普通 push 结果、祖先和交付字段。

全部命令 cwd 必须为本 wt，stdin 为 `/dev/null`。在合入后的新 tip 上重跑时使用该 tip 默认的新 out，勿指向任何历史保留目录：

```sh
exec </dev/null
smith_open_before=$(mktemp /tmp/xiantu-smith-open-before.XXXXXX)
node scripts/v06p1-smith-services-open-protection.mjs --snapshot "$smith_open_before"
export SMITH_SERVICES_OPEN_BASELINE="$smith_open_before"
npm run test:v06p1-smith-services-open
node scripts/v06p1-smith-services-open-regression.mjs prepare
node scripts/v06p1-smith-services-open-regression.mjs regressions
node scripts/v06p1-smith-services-open-regression.mjs audit
node scripts/v06p1-smith-services-open-fixture-test.mjs
node scripts/v06p1-smith-services-open-regression.mjs protection
node scripts/v06p1-smith-services-open-selfcheck.mjs
```

关态及历史服务脚本须通过上述统一 regression runner 执行，才能保留历史 out、按当前授权源码做精确静态证明，并读取当前双根真实数据。不得直接沿旧脚本默认 out 覆盖历史证据；不需要改 Flag、数值表或 UI 主责文件。
