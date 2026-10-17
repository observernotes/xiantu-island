# 分解一期 P1③++++++ soft-open 结果

2026-10-17 Asia/Shanghai；wt/dev / dev / stdin=/dev/null / ultra / fast=false；已 fetch + pull --ff-only，基线15b66e3包含1c02199与3071325。

**分解 soft-open 程序自检 PASS；实现 tip `0057e61a64732103da651296103e0578ce7f5ec0`。PASS≠进包≠发版；fixture≠正式；release 预期 v0.6.12，另令。本窗无程序自检阻断。** 文档 tip 与推送后 origin/dev HEAD 见本窗 final-tip.json / 最终回执。

正式 SalvageOpenFlag 精确恒 true；GameScene 同次 smith_ou 命中依次 forge→enhance→enchant→salvage，末尾 return。分解允许提示「装备分解已开放。」、拒绝用 Gate 原文；内存关态直接 tip 绕 Gate。仅 Flag 与 Scene 生产字节改变，不接完整 UI、不挂services；原 Gate/Progress/存储/ShopPanel 保持。

唯一只读产量1/2/4/8；本档正式 instanceRef，禁 fixtureInstances 默认或 itemId 数量造实例；字段未齐默认整拒。成功测试显式提供 qualification/capacity/atomicCarrier，不能视为生产绑定 schema 或完整生产提交已齐备。正式磁盘无防具配方的来源拒绝与独立防具成功夹具分开留证。

```json
{
  "salvageClosedTipsWired": true,
  "refineStoneMapped": true,
  "salvageOpenFixtureTableExecuted": true,
  "formalInstanceSource": true,
  "softOpenedSalvage": true,
  "SalvageOpenFlag": true,
  "released": false,
  "EnhanceOpenFlagPreserved": true,
  "EnchantOpenFlagPreserved": true,
  "protectCharmSoftOpenPreserved": true
}
```

open **7145**断言、54图：正式4图 flagLoads=0 / productModuleTransformations=[]（双根正式 O01–O08 全表+fresh SSR），内存关态4图 flagLoads=1，异常依赖44图，独立armor夹具2图。8图真实Scene冒烟四tip顺序、四角28×40、隐藏/安静、双身份识别、拒绝路由及零写均PASS。
closed **19413**断言、C01–C10、232夹具、3380调用，关态零写。其余 enchant open/closed **4643/12621**、enhance **17804/30980**、forge **6496/20558**、market-closed **24300**、v06d-closed **15087**、v06c-closed **10730**；全套 **169777**断言。tsc、双根datalint、diff-check、evidence/保护与独立审阅全部通过。

三旧 Flag 仍 true 且 SHA MATCH（Enhance d7a3f688…099e / Enchant bd5445b8…505a / Forge 0ce03554…cc3e）；enhance.json 未改 d5b91a06…71954；SalvageFlag 写后 `69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3`。29项原字节保持+1授权翻旗，622旧QA文件保持，未授权差异0；GAME_PHASE5、strings960、gifts10×false、护符soft-open保留。

QA `qa/out_v06p1_salvage_soft_open/`；完整实现、限制、冻结SHA及抽检说明见 [HANDOFF](V06P1_SALVAGE_SOFT_OPEN_HANDOFF.md)。旧salvage关态/夹具及执法out保留，初始dirty未纳入。报告/status已UTF-8同步shared。Codex日志 `/workspace/xiantu/logs/codex/0b875a44baa0e747_20261017_155607_1813566.log`。

未运行snapshot/build/sync/release/Pages。**下一棒交执法正式 soft-open 磁盘图重抽 design/30 §4.3 O01–O08+入口冒烟；PASS≠进包≠发版；release预期v0.6.12须负责人另令。**
