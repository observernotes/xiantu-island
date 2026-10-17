# P1③+++++ 附灵一期 soft-open 结果

2026-10-17 Asia/Shanghai；wt/dev、dev、ultra、stdin=/dev/null、未启fast。

**附灵 soft-open 程序自检PASS；实现tip `217a5a6e6dde33cbe0f711076adfc6053349551e`。PASS≠进包≠发版≠release；fixture≠正式。无程序自检阻断。**
文档tip与origin/dev最终HEAD见推送后的本窗final-tip.json及最终回执。

正式EnchantOpenFlag精确恒true，无配表/features/环境后门。GameScene只在既有smith_ou同次命中末尾增加附灵只读入口，顺序forge→enhance→enchant，最后return；正式允许文案「装备附灵已开放。」，拒绝原文路由，内存关态绕过Gate直接显示关态tip。不挂services、不接完整UI，不改ShopPanel/NPC/地图。

正式源仅本档武器instanceRef；生产不注入fixtureInstances、不从itemId数量造实例；EnchantGate/EnchantProgress/Progress字节不动。enhance.enchant仍唯一只读0.05/0.05/2000+1，完整成功一次才扣，覆盖全额再付，重复/非法/中断整笔保持。

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

open **4622**断言；32正式图flagLoads=0、4内存关态图flagLoads=1；双根O01–O08全表硬门PASS，8图真实Scene冒烟零写。closed **12600**断言、C01–C10、176夹具、2136API调用，关态零写。
其余：enhance-open17767 / enhance-closed30910 / forge-open6443 / forge-closed20489 / market-closed24251 / v06d-closed15059 / v06c-closed10714。共 **142855**断言；tsc、双根datalint、diff-check及保护均exit0。

写前后1653既有文件与旧QA保持，20项权威冻结SHA MATCH、未授权差异0。EnhanceOpenFlag仍true（d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e），ForgeOpenFlag MATCH（0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e），enhance.json未改（d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954）。EnchantOpenFlag写后bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a。GAME_PHASE=5、strings952、gifts10×false、护符soft-open保留。

详见[HANDOFF](V06P1_ENCHANT_SOFT_OPEN_HANDOFF.md)；QA：`qa/out_v06p1_enchant_soft_open/`，含selfcheck-summary/evidence-check/protection-check/independent-review与各命令日志、result。旧关态@5bee47d及开态夹具@b4764a8、本wt原附灵out保留不覆盖。报告/status已UTF-8同步共享根。

Codex日志 `/workspace/xiantu/logs/codex/44bf3e1b3f39c7ab_20261017_140615_1666238.log`。未运行snapshot/build/sync/release/Pages，未进包发版；无分解/阵法/gifts/#20/拍卖/坊市混窗。

**下一棒交执法正式soft-open磁盘图重抽design/29 §4.3 O01–O08+入口冒烟。PASS≠进包≠发版；执法PASS后仍等负责人release/进包另令。**
