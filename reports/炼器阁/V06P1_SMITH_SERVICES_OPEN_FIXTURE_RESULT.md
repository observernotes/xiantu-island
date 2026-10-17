# v0.6 · P1③++++++++ 完整炼器服务 UI 开态夹具结果

**程序自检 PASS；O01–O11 全执行且逐项 PASS，O05 完整成功，无夹具阻断。** O05 资格与原子承载仅显式隔离 SSR 注入；生产仍 `new SalvageGate(progress)`，正式依赖未齐保持 Gate 拒绝。

**本窗=开态夹具全表 ≠ soft-open ≠ release ≠ 进包。** `softOpenedSmithServicesUi:false`、`released:false`、`newOpenFlag:false`；不代执法独立抽检或负责人授权，本窗不 fan-out 执法。

实现 tip `a1d645d836761d2a57ce12833af95524f8e1205a` 已普通 push origin/dev，exit 0；文档 tip/两笔 push/最终远端 HEAD 见 `qa/out_v06p1_smith_services_open_fixture/final-tip.json`。基线 `233bdbd` 包含 `7b06f5a`，两次 fetch+ff-only pull 均 exit 0。cwd 本 wt/dev，stdin=/dev/null。

专项 `test:v06p1-smith-services-open` **2897** 断言；双根 **4 独立 SSR 图、6 证据组**；O 表分项 **2764** 断言，另 133 冻结/元数据断言。21 组回归全部 exit 0，记录至少 182708 断言；连专项至少 **185605**。v06b未打印的外层静态断言未计。tsc、双根 datalint（各问题0）、diff、保护和 evidence 聚合全部 exit 0。

真实 GameScene→菜单→Panel 选择/确认/submit/完整 Gate 结果→回菜单，覆盖键鼠、改选/取消、护符概率成败、五行覆盖、正式实例与 E/I 隔离；原请求重放、改载荷、资源/容量竞争、装备操作竞争、保存中断/丢 ACK、旧异步与未知半份记录均有本窗运行证据。O01–O11 的状态、断言数与 evidenceKeys 详见 [HANDOFF](V06P1_SMITH_SERVICES_OPEN_FIXTURE_HANDOFF.md) 和 [cases](../../qa/out_v06p1_smith_services_open_fixture/cases)。

协同只读复用接引子 Controller/Panel/GameScene，**三个 UI 文件与界面侧 status 未改**；未另造 UI。正式实例只沿真实 ForgeGate 成品登记、Progress formalSources 与 EquipInstBinding；护符正式映射异常/不足整拒，不转无符。分解关联已附灵目标仍 relation 拒绝；装备销毁保留历史引用字节，但空槽及来源退役使目标不可达。不把这些拒绝算作 O05 成功。

全部 706 生产源码、72 双根表、2902 旧文件 MATCH；四 Flag 正式 true 字节保留、enhance MATCH、npcs MATCH 无 services 灌入；strings 双根1013/SHA MATCH，无SSR43注入；GAME_PHASE5、gifts10×false。既存 dirty/untracked 不纳入提交，旧关态/attr-ui/服务/market输出保持。

```json
{
  "smithServicesUiWired": true,
  "smithServicesOpenFixtureTableExecuted": true,
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

旁证入口：[evidence](../../qa/out_v06p1_smith_services_open_fixture/evidence.json)、[selfcheck](../../qa/out_v06p1_smith_services_open_fixture/selfcheck-summary.json)、[protection](../../qa/out_v06p1_smith_services_open_fixture/protection-check.json)、[source-review](../../qa/out_v06p1_smith_services_open_fixture/source-review.json)。最终两个报告与炼器 status UTF-8 同步共享根；不覆盖接引子 status。下一棒由主程序转交 tip+out，请独立抽检；PASS 不代 soft-open/release/进包。
