# P1③+++ 强化正式结算 · soft-open HANDOFF

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜负责人令经项目经理执行。

**正式实例源 soft-open 已固化，交执法在正式 soft-open 磁盘图重抽 O01–O08 + 入口冒烟。PASS≠进包≠发版；released:false。** 本窗不授权 release、进包、打 tag 或 Pages，未运行 build/sync/release。

基线文档 tip `7f75f7b80ee4ad5203a89d2628f604551eafa73b`，含正式实例源实现祖先 `4644e96c530a592c2966798805e92a304f1c907a`。开工在 `/workspace/xiantu/wt/dev` 执行 `git fetch && git pull --ff-only origin dev`，Already up to date，确认分支 dev、非 detached。命令及自检 stdin=/dev/null。

本窗实现 tip：`18a7a0c37a719a22a426acb0002312d6b82f24da`；提交 `feat(v0.6-p1): soft-open formal enhance settle preamble`。文档 tip、origin/dev 最终 HEAD 见最终回执与本窗本地 `final-tip.json`，避免自引用 SHA。

```json
{"formalTipsWired":true,"formalInstanceSource":true,"softOpenedEntrance":true,"softOpenedFormalSettle":true,"released":false,"formalOpen":true,"softOpened":true,"closedFixtureOnly":true}
```

兼容 `formalOpen/softOpened` 本窗统一表示**正式实例源 soft-open，≠进包≠发版**。`closedFixtureOnly:true` 表示 false 仅在隔离 SSR 内存关态图注入；这些状态字段描述正式磁盘口径，不表示 memory-closed 图可结算。显式 fixture 成功保留作兼容测试，fixture≠正式，也不作进包依据。

## 正式路径与本窗改动

默认正式 Forge 的成品、库存、完整 committed 结果与 receipt 写入同一 draft 后，`registerFormalEnhanceInstance` 同事务登记等级 0 实例及 `formalSources`。默认 EnhanceGate 无 `fixtureInstances`，只认本档 `formalEnhanceInstances()` 的来源证明；原 instanceRef 逐字来自打造成品，itemId 数量与装备槽只校验已登记资产持有，不生成身份。现行正式配方已有青竹剑路径，不补造甲类配方。

缺登记、历史袋或 itemId/数量冒充仍 `enhance.formal.no_instance`；跨档来源 foreign；`useProtectCharm=true` 仍 `enhance.formal.protect`，护符零扣，未补映射。附灵/分解仍 `enhance.closed.later_service`。只读 enhance.json 唯一 next 行，不补表、不外推。正式成功/正常失败的费用、最终等级/属性、result 与 receipt 一次提交。

实现接线已在基线满足，本窗**仅改 open runner 与 open TS 测试两个文件**：默认 OUT 改为本窗 QA；显式新增 `softOpenedFormalSettle:true`；runner 强制核实正式 Forge 来源、同事务登记、无 fixture 依赖和 O01–O08；补核本档 registered 状态、来源 ref 及 12 档成功后来源证明不变。未修改产品源码、两 Flag 或数据字节。

GameScene 保留 smith_ou 同一次命中先打造提示再强化「装备强化已开放。」，仅末尾 return true。没有夹具注入，入口只读零写；未挂完整强化 UI、services 或提交面板，未改 dialog/quests/地图/NPC。

## 正式 O01–O08 与执法接棒

| 编号 | 本窗正式磁盘图已执行证据 |
|---|---|
| O01 | 默认正式 Forge 完整提交并同事务登记；无 fixture 选择；同原型两件独立；背包/合法槽位保持 ref；来源证明绑定本档 Forge。 |
| O02 | 无符成功自 0 至 12，唯一 next 行费用/属性/receipt 一次完整提交，原实例与 formalSources 保持。 |
| O03 | 无符目标 +5 失败不掉、+6 失败掉 1；照扣本次费用、不碎装、最终属性一致。 |
| O04 | true 仍 protect 整笔拒绝、护符原样保留；false 不依赖护符。未验有效护符保级路径。 |
| O05 | 正式成功与两种失败 export/import/restore/IDB load/fresh SSR 读回；旧结果不重抽、不补扣、不改级。 |
| O06 | 缺登记、数量/itemId 冒充、资格、foreign、资源、满级/过期/越界及九种 SSR 坏表整笔拒绝；零写零抽、不补配置。 |
| O07 | 重复/冲突、同对象跨 Gate、同槽双 Progress、不同实例共享资源争用、过时对象重试、Forge/Enhance complete 前后与 abort；至多一次完整提交。 |
| O08 | 绑定 A 后切 activeSlot2 仍写 A；新 B 缺源拒绝；整袋跨档复制仍 foreign；历史纯袋不升格、未知引用阻断写入、合法资产保留。 |

并发验证范围为同 SSR/module 运行图内的槽位互斥与保存快照重检；fresh SSR 验证保存刷新读回，不外推为多浏览器并发验收。程序自检不代勾 design/27 §4.3 的执法表。

open runner 对齐 ff90d18 范式，双根 shared/snapshot 共 **28 图**：22 张正式磁盘图 flagLoads=0；6 张 SSR memory-closed 注入 false、flagLoads=1；features 覆盖调用全部 0。正式 O 表双根实跑。8 张正常表图均运行真实 GameScene 方法的 smith_ou 冒烟，先 Forge 后 Enhance，Scene saveWrites=0。

关态图八 tip 首旗拒绝、业务零写/零抽。fresh memory-closed 每根有 6 次测试准备 importSave 写入，用来装载正式/夹具各三种已完成历史结果；不是关态业务结算。每次八 tip 及历史读回前后均断言零增量。独立 closed runner 仍在正式磁盘 true 下 SSR false 跑原 C 表，30,769 断言，数量级未回退。

## 自检、QA 与冻结

全部 exit 0：tsc；enhance-open 11,389；enhance-closed 30,769；forge-open 6,378；forge-closed 20,401；market-closed 24,186；v06d-closed 15,055；v06c-closed 10,712；双根 datalint 各问题 0；git diff --check。七套件共 **118,890** 断言。

QA：`qa/out_v06p1_enhance_formal_soft_open/`。入口 `selfcheck-summary.json`、`evidence-check.json`、`v06p1-enhance-open-evidence.json`、`protection-check.json`；逐命令 `*.result.json` 与日志含 cwd、参数、stdin、exit 和断言数，`run-selfcheck.py` 可重放。`source-path-audit.json` 记录独立源码审阅及 O 表行号；`authorized-source.diff` 为两个授权测试文件变更。

946 个三根 balance/maps/features 与本 wt/dev 非测试 src 保护文件，未授权 SHA 差异/路径增删均 0；534 个旧强化/Forge/坊市/v06c/v06d QA 文件及集合全部保留，含 `qa/out_v06p1_enhance_formal_instance/`。完整清单见 protected-before/after 与 prior-evidence-before/after。

EnhanceOpenFlag 正式 true，写前=写后 `d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e`；ForgeOpenFlag true 原字节 `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e`。三根 enhance.json `d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954`、recipes `1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f` 均未改。items/materials/npcs/life_skills 不变；shared/wt strings 944 键、`d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09` 不变，game 保留旧 936 键快照。GAME_PHASE 仍 5，gifts 10×false。

Codex：`/workspace/xiantu/logs/codex/a695c0e74a0e311b_20261017_103112_1374565.log`；运行中的 `codex_launch.log` 保留本地，不纳入静态提交。HANDOFF/RESULT 与 ≤30 行四段 status 已 UTF-8 同步共享根同路径。仅暂存本窗两个测试文件、新 QA、报告与 status；待审 dirty 不纳入。普通提交/push；未 force-push、未 reset --hard。

**无程序自检阻断。下一棒交执法按 design/27 §4.3，在正式 soft-open 磁盘图重抽 O01–O08 + 入口冒烟，PASS 报实现 tip+out，再请负责人另下 release/进包令。PASS≠进包≠发版。** 护符映射、附灵/分解、阵法、gifts/#20、拍卖/坊市继续原边界隔离。
