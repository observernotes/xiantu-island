# P1③+++ 强化正式拒绝 tip 接线 · HANDOFF

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜交执法 C01–C10 抽检。

本令≠开态夹具≠soft-open≠release≠正式实例源 schema 落地；沿用既有只读入口开放。

实现 tip：`d5b385da7134e8ac14887b0efed125910b6d4802`（`feat(v0.6-p1): wire enhance formal refusal tip keys`）。文档 tip 与最终 origin/dev HEAD 见本窗 `final-tip.json` 和最终回执。
基线 `9df824dcd7adfa049b48f7fc64ff869697a214bd`，含 `ff90d18` 的只读入口；开工已 fetch + pull --ff-only。所有操作由 `/workspace/xiantu/wt/dev` 发起，stdin=/dev/null。

## 交付范围

`EnhanceGate` 新增 formalDenied，text 只读 `strings_zh[tipKey]`。shared→wt 的 strings 精确快照共 944 键（含 _meta），SHA `d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09`；剥末八键严格恢复旧 936 键完整 SHA。`game/data` 保留旧快照。本次未运行全量 snapshot：该脚本递归删除 data，会触及已有未跟踪 art pending；只复制获准的 strings 字节，详见 snapshot.log。

| 拒绝场景 | tipKey |
|---|---|
| 默认/空授权、数量或 itemId 冒充、历史袋新请求、缺 selection | enhance.formal.no_instance |
| 显式夹具授权与本档持有或历史身份不符 | enhance.formal.foreign |
| 非法 type/slot/非 equip、phase/enabled/placeholder/qualityEnabled 不符 | enhance.formal.bad_type |
| useProtectCharm=true，整笔拒绝 | enhance.formal.protect |
| 灵石或可合法消费的精炼石不足 | enhance.formal.resources |
| 满级、目标越界、非 next、过期或非法等级 | enhance.formal.max_level |
| 已提交请求再次 submit | enhance.formal.duplicate |
| loadRefresh 识别完整旧提交 | enhance.formal.load_dedupe |
| 附灵/分解混入 | enhance.closed.later_service |

重复 submit 返回 allowed:false；身份匹配才附只读 result 副本，冲突载荷不返回旧 result。loadRefresh 对完整旧结果返回 formal.load_dedupe 与 progress 副本；level/consume 保持合法旧结果只读。无授权的未知结果或坏袋读取用 formal.no_instance，保留坏袋原信息，不自动修档。历史 instances/enhancements 均不授权下一次 submit。

正式业务拒绝已有事务前预检，事务内仍复核授权、重复请求与资源；测试对顺序拒绝同时拦截 Math.random、夹具 random/ledgerId、保存/事务/延后保存方法，并核对整档、IDB rows/写入/提交、库存、实例、等级、属性、品质、经验和历史结果零增量。既有显式夹具成功/概率失败及内部 busy/save/random/rules/commit 哨兵保留。

## 执法 C01–C10 交棒（design/27 §4.2 编号）

| C 项 | 已有程序旁证与边界 |
|---|---|
| C01 | 默认入口反复只读允许；enhance/submit formal.no_instance，零写、零抽样 |
| C02 | 同 itemId 数量、itemId 冒充、空授权、历史仅 instances 或完整结果后的新请求均不授权 |
| C03 | foreign 通过显式夹具不持有/历史身份不符构造；跨槽同引用文本默认 no_instance，另有既有槽间结果隔离测试 |
| C04 | type/slot/non-equip/未知原型及 phase/phaseMin/phaseMax/enabled/placeholder/qualityEnabled 变体；运行内存改动 finally 恢复 |
| C05 | 默认及显式夹具在 +0/+5/+11 的 true 选择与提交均 protect；护符库存保留 |
| C06 | resources 与 max_level 分型、配置缺行/重复行/字段异常均阻断；配置异常保留内部夹具 rules 哨兵 |
| C07 | duplicate 不二次结算；已有同实例/共享资源争用、IDB 中断回滚与重试覆盖保留 |
| C08 | 完整旧结果 duplicate/load_dedupe 只读、副本隔离；坏袋保留；新请求继续校验实例授权 |
| C09 | 正式拒绝整档/随机/持久化零增量；later_service 原关态键继续拒绝 |
| C10 | GameScene 唯一生产消费者只调用 new EnhanceGate(this.prog).entrance()；无 fixtureInstances 注入或回退，不借 ForgeOpenFlag |

C03 只证明现有可构造的夹具所有权/身份拒绝边界，未新增正式登记/背包/槽位 instanceRef schema。设计正式 O 表须另令；本次只保留既有显式测试夹具 O01–O08 能力，不代勾 design/27 正式 O 表。

## 自检与旁证

七套件共 **115,995** 断言：enhance-open 8,568；enhance-closed 30,749；forge-open 6,378；forge-closed 20,365；market-closed 24,168；v06d-closed 15,055；v06c-closed 10,712。tsc、双根 datalint、双根 JSON、diff 检查均 exit 0。增强套件在最终默认只读拒绝补齐后重跑；其余已通过套件没有相关代码改动。摘要：[selfcheck-summary.json](../../qa/out_v06p1_enhance_formal_tips/selfcheck-summary.json)。

QA：`qa/out_v06p1_enhance_formal_tips/`；保护旁证：[protected-after.json](../../qa/out_v06p1_enhance_formal_tips/protected-after.json)。992 个数据/源码文件清单仅 strings、Gate、测试三项获准变化，未授权差异 0；167 份旧增强 QA 字节及文件集合保持。

`formalTipsWired:true / formalInstanceSource:false / released:false / softOpenedEntrance:true`；兼容 `formalOpen:true / softOpened:true / closedFixtureOnly:true`。EnhanceOpenFlag 仍正式 true，完整 SHA d7a3f688…；enhance d5b91a06…、recipes 1be644e365…、ForgeOpenFlag 0ce03554…及 ForgeGate/其余冻结表原字节不变，详见 RESULT 完整 SHA。

Codex 日志：`/workspace/xiantu/logs/codex/8d119a499246ee02_20261017_093127_1290884.log`；启动日志 `qa/out_v06p1_enhance_formal_tips/codex_launch.log`（运行中仅引用，不暂存）。

实现推送遇远端同名重复实现，逐字比对仅暂存清单行序不同；保留远端实现 `d5b385da7134e8ac14887b0efed125910b6d4802`，本地重复提交通过 rebase skip 消除，未 force-push/未 reset --hard。详见 push-integration.json；代码与测试旁证相同，无需重复回归。

无程序自检阻断。下一棒交执法按 design/27 §4.2 C01–C10 抽检，PASS 报 tip+out 后请负责人另令开态夹具/正式实例源。护符正式映射、正式 schema、附灵/分解、gifts/#20/阵法/拍卖/坊市仍禁混窗；GAME_PHASE=5；未运行 build/sync/release。
