分解一期 P1③++++++ · 开态夹具结果

2026-10-17 Asia/Shanghai；wt/dev / dev / stdin=/dev/null；基线 `29ddb7f54deb6c1439397b5d2e7c438639ceff5c`，已 fetch + pull --ff-only，包含关态 tip `5d9fa291172a8696f0daddd283bf1f2c97d679e4`。

实现 tip：`30713252ae2fb7de27ea41ff0ba1f4330304d063`，提交名 `feat(v0.6-p1): add salvage open fixture gate O01-O08`。文档提交名 `docs(v0.6-p1): hand off salvage open fixture evidence`；文档 tip/origin/dev/远端 HEAD 见 `qa/out_v06p1_salvage_open_fixture/final-tip.json`。

新增独立 SalvageGate 与完整结果袋；八入口 Flag 优先。正式 SalvageOpenFlag 恒 false，仅 SSR resolve/load 注入 true 执行只读预览与提交。唯一产量源 1/2/4/8，正式实例销毁、完整 refine_stone 入库与结果/去重同事务，不另扣灵石。正式身份不依赖 fixtureInstances 或 itemId 数量；现有绑定/精确位置字段未齐则默认整拒。成功夹具显式提供资格证明与单 SSR 原子承载器；防具通过仅内存测试配方走正式来源登记，配置字节不变。

载体验证当前全档后串行保存，旧对象不能抹去已完成分解袋；IDB complete 前不发布。保留 forge/enhance 原历史，退役所选正式来源；已附灵选中目标因关联无法安全退役整拒，未选附灵继续可用。Progress 仅四行结构授权，原 export/import/restore 不变；缺字段旧档保持 undefined。详细实现与保守拒绝边界见 [HANDOFF](V06P1_SALVAGE_OPEN_FIXTURE_HANDOFF.md)。

O01–O08 程序全执行 PASS；新开态 **4731** 断言 / **52** 独立 SSR 图，双根正式 false 图 flagLoads=0、内存 true 图 flagLoads=1、fresh SSR，22 类异常依赖。旧回归 **162193**，合计 **166924** 断言。tsc、salvage-open/closed、enchant/enhance/forge open+closed、market-closed、v06d/v06c closed、双根 datalint、diff/check 与冻结检查全部最终 exit 0。跨对象预读后的两个竞态方向、缺失/未安装载体、真实 IDB abort/complete 与未知旧档均实测。

全部旁证在 `qa/out_v06p1_salvage_open_fixture/`，含 selfcheck-summary/evidence-check/protection-check、专项 evidence、回归 pinned 内存适配审计与最终 tip。旧 QA 1305 文件 MATCH，整体 4200 文件零未授权差异；冻结表、三既有 Flag、SalvageClosed、data.ts、护符配置 MATCH；Enchant/Enhance 正式仍 true，gifts 10×false，strings 960，GAME_PHASE=5。SalvageFlag 仅注释变化，函数体恒 false。未改既有 Gate/正式存储行为或前台入口，未运行 snapshot/build/sync/release/Pages。

```json
{
  "salvageClosedTipsWired": true,
  "refineStoneMapped": true,
  "salvageOpenFixtureTableExecuted": true,
  "formalInstanceSource": true,
  "softOpenedSalvage": false,
  "SalvageOpenFlag": false,
  "released": false,
  "enchantSoftOpenPreserved": true,
  "EnhanceOpenFlagPreserved": true,
  "protectCharmSoftOpenPreserved": true
}
```

**本窗=分解开态夹具全表≠soft-open≠release≠进包；fixture≠正式；核齐备≠生产放行。** 报告与四段≤30行 status 已以 UTF-8 相同字节同步 shared。Codex 日志 `/workspace/xiantu/logs/codex/abec03625df0c1b3_20261017_152547_1768690.log`（ultra、fast=false、stdin=/dev/null）。

无程序自检阻断。下一棒交执法 design/30 §4.3 O01–O08 独立抽检；本令不授权 soft-open，执法 PASS 后仍须负责人另令。
