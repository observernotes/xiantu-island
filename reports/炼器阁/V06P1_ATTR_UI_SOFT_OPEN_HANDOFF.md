# P1③+++++++ attr-ui · soft-open preamble HANDOFF

2026-10-17 Asia/Shanghai｜炼器主责｜负责人令经项目经理执行。

**程序自检 PASS；`softOpenedAttrUi:true`、`released:false`、`newOpenFlag:false`。交执法 soft smoke；本窗不代执法、不 fan-out。attr-ui soft-open ≠ 进包 ≠ 发版；fixture ≠ 正式 ≠ 进包依据。预期 v0.6.13 的 release/进包须负责人另令。**

工作目录仅 `/workspace/xiantu/wt/feat/ui-attr-inst`，分支 `feat/ui-attr-inst`。开工 `git fetch origin && git status -sb` exit 0，HEAD 与 origin 均为权威基线 `431743577dbcf58c738e7ee5ba6fc6aeccd1c11f`。实现 tip：`77b43a47a97e930039c54a3ab160dcfec3f38293`，subject：`feat(v0.6-p1): soft-open attr-ui readonly display preamble`。交付文档 tip 与推送后的 origin tip 见本窗 `final-tip.json`，避免提交 SHA 自引用。

依据：共享负责人令 `reports/炼器阁/20261017_负责人令_P1③+++++++_attr-ui_soft-open.md`、design/31、界面接入 resolver 确认、护器符 soft-open HANDOFF。共享 `/workspace/xiantu/reports/`、`status/` 为权威；本 wt 同步同内容副本。

## 实现与口径

产品链路在基线已满足令文，全部产品源码保持字节不变。本窗仅改四个 attr-ui runner 的证据状态和输出目录，新增一个仅供 runner 使用的输出路径 helper。`softOpenedAttrUi:true` 表示本令授权的交付状态，memory-closed 图仍实际注入双 false；该字段不充当生产开关或该图的 Flag 值。

生产 `EquipInstReadonly.resolveEquipSlotBinding` 继续直接委托 `resolveFormalEquipSlotBinding(prog, slot)`；`resolveInventoryEquipBinding` 直接委托 `resolveFormalInventoryEquipBinding(prog, row)`。映射保持 `explicit_position_binding_only_no_item_id_inference`。缺绑定为 `no_instance`，跨档为 `foreign`，双 Flag memory-closed 的 `unavailable` 优先。生产 InventoryPanel 聚合行仍诚实 `no_instance`；仅明确 instanceRef 且通过正式 API 验证的袋行可展示，不把同 itemId 的唯一/首条/最高等级或 count=1 当绑定。

展示读取在写入/服务哨兵下执行，整档与公开 Progress 字段零增量，展示写入、Gate 提交/收费调用均为 0。正式 Gate 的打造/强化/附灵准备仅发生在测试的隔离存档中，随后单独核对展示零写；不向生产 GameScene/E/I 注入 fixtureInstances。未增加 AttrUi OpenFlag、配表/features/环境覆盖，未改 Gate、完整服务 UI、smith_ou.services 或提交面板。

## 本窗证据与自检

权威 out：`/workspace/xiantu/qa/out_v06p1_attr_ui_soft_77b43a4/`；wt 内同名目录。入口为 `evidence.json`、`validation.json`、`protection-check.json`、`PASS`；四套件原始 JSON 分置 `closed/`、`binding-success/`、`map-api/`、`map-services/`。逐命令日志和 exit/计数在 `logs/*.log`、`logs/*.result.json`，自检子进程 stdin 均 `/dev/null`。

| 自检 | 结果 |
|---|---:|
| npx tsc --noEmit | exit 0 |
| test:v06p1-attr-ui-closed，C01–C10 | 1592 |
| test:v06p1-attr-ui-binding-success | 327 |
| test:v06p1-attr-ui-map-api | 1128 |
| test:v06p1-attr-ui-map-services | 175 |
| test:equip / test:appearance | 100 / 588 |
| 双根 python3 /workspace/xiantu/qa/tools/datalint.py | 各问题 0 条，exit 0 |
| git diff --check / verify-evidence.py | exit 0 |

六套件合计 3910 断言。四个 attr-ui 套件合计 3222，closed 数量保持 1592。binding-success 双根共四图：两张正式成功图双 Flag `flagLoads={Enhance:0,Enchant:0}`，两张独立 memory-closed 图 `{Enhance:1,Enchant:1}`。closed 双根六图：两张正式图 loads=0，四张 memory-closed/fresh-memory-closed 图 loads=1；C01–C10 均 executed/passed 且有 evidenceKeys，毒值、旧缓存和跨档不泄漏，写/服务哨兵全为 0。

旧 enhance/enchant closed runner 有历史 strings960 SHA 前置，本窗未重跑或修改该 guard；不将其标为本窗 PASS。新增本窗 map-services 175 断言实际重核四正式 Gate、护符成功/失败、重放、保存失败与分解映射回归，未修改产品或表来绕过旧套件。

测试在实现提交前对精确待提交源码运行，提交后 `tested-source.json` 的五个源文件 SHA 与实现 tip 的 git blob 逐一 MATCH；仅将临时 out 改名为实现 tip，未重写测试结果。原关态 `qa/out_v06p1_attr_ui_closed_a3f0c19/` 的 C01–C10 与开态 `qa/out_v06p1_attr_ui_open_4317435/` 的 O01–O08 保留不覆盖；本窗程序自检不冒充独立执法 O 表或 soft smoke。

```json
{
  "softOpenedAttrUi": true,
  "attrUiOpenPass": true,
  "formalApiWired": true,
  "eSlotToInstanceRefApiExists": true,
  "iRowToInstanceRefApiExists": true,
  "mappingStrategy": "explicit_position_binding_only_no_item_id_inference",
  "newOpenFlag": false,
  "fixtureInstancesProductionFallback": false,
  "released": false,
  "fourFlagsMatch": true,
  "SalvageOpenFlag": true,
  "enhanceMatch": true,
  "strings970Match": true,
  "gifts0": true,
  "GAME_PHASE": 5,
  "closedAssertions": 1592
}
```

## 冻结与保护

`protected-before.json` / `protected-after.json` 固化 1897 个文件及路径集合，未授权差异 0：包括全部产品 src、双根及 game 历史快照 balance/maps、本 wt 旧 QA、指定共享关/开态 out。全部产品源码、四 Gate、recipes/materials/items/npcs/life_skills/enhance_protect_charm/data.ts 均写后 MATCH。gifts 为 true=0/false=10，GAME_PHASE=5；完整冻结 SHA 见 protection-check。

| 保护项 | 写前=写后 SHA-256 |
|---|---|
| ForgeOpenFlag.ts，正式 true | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e |
| EnhanceOpenFlag.ts，正式 true | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e |
| EnchantOpenFlag.ts，正式 true | bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a |
| SalvageOpenFlag.ts，保持 true | 69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3 |
| enhance.json，shared/snapshot | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 |
| strings_zh.json，970，shared/snapshot | ae51319b82a6486cc7f3d9b26c5ae89719e23c32ff9debdcfbb86ef7b5aea08b |

未运行 snapshot/build/sync/release/Pages/release.sh，未进包、打 tag 或发版；未改 wt/dev，未混阵法/gifts/#20/拍卖/坊市，未抬 GAME_PHASE。仅普通 commit 与 `git push origin feat/ui-attr-inst`，不使用 force-push/reset --hard，不推 origin/dev。`final-tip.json` 在推送成功后记录实现 tip 和最终 origin tip，作为提交后旁证保存，避免自引用。

**交执法 soft smoke：基于已 push 的交付 tip，在独立 wt 重核正式磁盘成功图、双 Flag memory-closed、显式位置绑定/缺绑定/foreign、零写与冻结 SHA；勿覆盖历史 out。执法结果经项目经理回负责人，PASS 后仍须另等 release/进包令。本窗不代执法、不 fan-out。**
