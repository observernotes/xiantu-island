from pathlib import Path
import json,subprocess,hashlib
root=Path.cwd();out=root/'qa/out_v06p1_smith_services_closed';impl='7ebf164e1dfed77f81600a70e94b1a6e541067cc'
e=json.loads((out/'evidence.json').read_text());s=json.loads((out/'strings-append-proof.json').read_text());r=json.loads((out/'regressions/regression-summary.json').read_text());summary=json.loads((out/'selfcheck-summary.json').read_text());protected=json.loads((out/'audit/protected-before.json').read_text())
regrows='\n'.join('| `'+row['name']+'` | '+str(row['assertions'])+' | 0 |' for row in r['results'])
frozen=[]
for p,sha in protected.items():
 if p.startswith(str(root/'data/balance')) or p.startswith(str(root/'src')) and Path(p).name in ['ForgeOpenFlag.ts','EnhanceOpenFlag.ts','EnchantOpenFlag.ts','SalvageOpenFlag.ts','data.ts']:
  frozen.append('| `'+Path(p).name+'` | `'+sha+'` | MATCH |')
frozenrows='\n'.join(frozen)
text=f'''# v0.6 · P1③++++++++ 炼器服务关态 tip / 接线交接

2026-10-17 Asia/Shanghai；cwd=`/workspace/xiantu/wt/dev`，分支 `dev`，命令 stdin=`/dev/null`。开工执行 `git fetch && git pull --ff-only origin dev`，exit 0，HEAD=`0dd59efdcd288930f1bd0525d2c9e7ddf06c0814`，含 v0.6.13 / attr-ui soft-open。既存 dirty 保留，不纳入本窗提交。

实现 tip：`{impl}`，`feat(v0.6-p1): wire smith services closed tip and gate adapters`。文档 tip、origin/dev 与远端 HEAD 推送后写本窗 `final-tip.json`，不在提交内制造自引用。HANDOFF/RESULT/两份 status 以 UTF-8 相同字节同步共享根。

依据：`/workspace/xiantu/reports/炼器阁/20261017_负责人令_P1③++++++++关态tip接线.md`、design/32 §2–§3、§4.2 C01–C11、§6.2 与天机 PASS；实例/护符/分解沿 design/28–31 及现有正式 Gate、EquipInstBinding、Progress。交接结构对齐 SALVAGE_CLOSED_HANDOFF，历史报告中的旧关旗事实不回写本窗。

**本令仅炼器①②关态 tip / 接线 ≠ design/32 开态 O01–O11 ≠ soft-open ≠ release ≠ 进包。** `smithServicesUiWired:true` 指炼器侧等价 services 路由与四 Gate 适配已交，不代表 GameScene 对话/菜单/四面板呈现已完成；`softOpenedSmithServicesUi:false`、`released:false`。程序自检不代执法，不勾设计原文 C/O，本窗不 fan-out 执法或负责人。

## ① strings 43 键仅末尾追加

先写共享权威 `/workspace/xiantu/balance/strings_zh.json`，再精确执行 `cp -f /workspace/xiantu/balance/strings_zh.json data/balance/strings_zh.json`。两根当前字节一致；没有运行全量 snapshot 或同步其他表。

- 键数（含 `_meta`）：**970→1013**，`ui.smith.*` 39 键 + `forge.grade.*` 4 键，全文、Unicode、占位符与 design/32 §6.2/负责人核准清单逐键一致。
- 写前 SHA：`{s['stringsShaBefore']}`。
- 写后 SHA：`{s['stringsShaAfter']}`。
- 原末键 `ui.equip.inst.unavailable` 仍为第 970 键、写后倒数第 44 键；为承接新增区只补逗号，原文件末尾 `\\n}}\\n` 前 **{s['unchangedPrefixBytes']:,} 字节**前缀完全一致，SHA=`{s['unchangedPrefixSha256']}`。
- 精确剥离 43 键追加区并还原对象结束符，逐字节还原写前 SHA；既有 970 键值、顺序、缩进均保持。证据：`strings-append-proof.json`，专项 shared/snapshot 又独立验证一次。

## ② 等价 services 路由与正式 Gate 适配

新模块 `src/SmithServices.ts` 导出 `SMITH_SERVICES_ROUTE={{npcId:'smith_ou', labelKey:'ui.smith.title', services}}`，四意图 type 固定 forge/enhance/enchant/salvage；npcs.json 无变更、仍无 services 字段。该发现元数据定义“对话→炼器服务→四服务菜单→各面板”的接入语义，不授予开放或结算权限。

| API | 接线契约 |
|---|---|
| `entrance()` / `menu()` / `panel(service)` | 入口、菜单和单面板分别守门，生产均 `ui.smith.closed`；隔离图单服务关闭沿对应 Gate.closed 提示，其他服务独立。 |
| `choices(service)` | 打造只列正式 forge 配方与所需/持有；装备按正式本档绑定独立成行，位置为明确槽位或正式背包行，属性沿既有只读 display。 |
| `select(service, request)` | 委托 `craft/enhance/enchant/salvage` 只读核验，保存视图内明确载荷和状态快照；不生成请求身份、不写业务数据。 |
| `submit(service, request)` | 必须之前明确选择同完整请求且当前快照未变，随后只委托对应 Gate.submit；busy/epoch 只在视图内。 |
| `result(service, request)` | 委托 Gate 的 result/level，完整请求字段/schema与完整本档结果匹配才回放；额外字段、重复材料、改目标/护符/品质均不冒认旧成功。 |
| `loadRefresh(service)` | 委托 Gate 只读旧状态，不把读档状态伪装本次提交成功。 |
| `back()` / `invalidate()` | 只清视图确认；不取消或补做 Gate 事务；导航、切档和旧异步回调复核 ownerSlot/epoch。 |

生产 `routeAvailable` 固定 false，无构造开关、无新生产 OpenFlag、无 UI 开放持久字段。测试仅在独立 Vite SSR memory-closed 图替换路由方法与四 Flag 内存模块；磁盘四 Flag 仍 true。GameScene.tryInteractForgeEntrance 原四 Gate entrance 冒烟保留，未新增完整 UI 或最小前台 stub。

正式实例只沿 EquipInstBinding 和 Progress formalSources 核实；不以 itemId 数量、首条、最高等级或 fixture 制造实例。E/I display unavailable 只隐藏属性，不夺取独立服务身份。强化 bool 护符意图原样传 Gate，护符不足提示读取正式 enhance_protect_charm 映射，未齐/不足整拒，不静默取消护符。Gate 的完整概率失败仍是已结算结果；带 result 的 Enhance allowed=false duplicate 可以只读核实，不能按 allowed 单值判成功/关态。

**分解正式依赖缺口保留：** 当前正式资格、精确位置下的全部关联退役与生产原子承载证据尚未齐。模块只 `new SalvageGate(progress)`，无 qualification/SalvageFixtureCarrier 默认注入或回退；真实正式实例只读选择仍由原 Gate 的 qualification 拒绝，前台映射中性 `result_unknown`，保留 gate 原裁决供复核。不自删实例、不发产物、不新增资格 schema/事务。正式位置 binding 已有不等于资格、关联退役和原子承载全齐。

不改任一 Gate 公式、结果/收据/去重、Progress、SaveStore、EquipInstBinding、EquipInstReadonly 或 E/I 产品代码。`source-review.json` 记录完整载荷匹配、Flag 隔离、护符映射、非确定承载原因、同元素新请求及旧回调六项审查闭环。

## C01–C11 程序旁证

专项命令 `npm run test:v06p1-smith-services-closed` exit 0，**{e['assertions']:,} 断言**。shared/snapshot 各 production-closed、memory-closed、fresh-memory-closed，共 {e['independentGraphs']} 个独立图；生产图不转译产品路由/Flag，深层关态只在隔离图可达。逐项 cases 与 evidenceKeys 见本窗 `evidence.json`。

| 编号 | 本窗执行证据与口径 |
|---|---|
| C01 | 完整入口反复对话意图/重读，所有旧面板方法优先总 UI 关闭；只 tip，无菜单或结果。 |
| C02 | 菜单故意关，旧点击/回调不派发；真实只读选择后关菜单清旧确认，重开须重选。 |
| C03 | 打造合法/缺图纸/缺材料/满包语义上下文，面板关与 Gate 关分层，零扣料/产物/品质/经验/请求。 |
| C04 | 正式装备与护符有/无/不足、映射缺失语义及满级，关态优先，零抽样/扣料/扣符/等级变化。 |
| C05 | 首附/同元素/覆盖/非法防具意图，UI/Gate 关闭只对应 tip，零附着/属性改写。 |
| C06 | 正式装备、不可分解/未知品质/承载不足语义，关闭时零销毁/产出/关联改变。 |
| C07 | UI false + 四 Gate true；各单服务 false 不串其他旗；Enhance/Enchant 双关时独立 Salvage 候选仍有两件正式位置实例，属性隐藏；真实默认分解资格拒绝。 |
| C08 | 无实例、聚合数量、fixture-only、foreign owner、旧位置；关态优先，图内只读正式候选/选择亦拒非法来源，不迁移或补实例。 |
| C09 | 四服务共享同实例/请求/材料 48 次并发全拒；切档 owner guard；延迟旧结果的切档/invalidate/UI关三种回调均不污染新视图。 |
| C10 | 两档真实 saveAsync/loadAsync 与刷新图保留四服务完整历史结果、两个存活正式实例和第三已退役分解历史；未知版本/半结果/缺收据/旧UI记录不修档；九种载荷冲突无伪成功。 |
| C11 | 每动作比对 exportSave、全部公开字段/缓存及后端原文；真实 EquipPanel/InventoryPanel 只读 E/I 往返无状态变化，不串 attr-ui 成功或 later_service。 |

容量限制、护符映射损坏等关闭前不可达条件是**语义上下文**，不表示本窗已实现或运行正式容量/资格系统。C09 的 pending 回调是测试内存 `Gate.submit` deferred spy，返回由真实 Gate.result 取得的既有完整结果，原 submit 不执行、settlementExecuted=false；只证明视图生命周期拒旧，不声称新结算或 design/32 O 并发通过。完整历史分解 seed 经原 Gate.loadRefresh 只读核实，不以 fixture 授权生产能力。

所有关态/只读动作的 SaveBackend 写、localStorage 写、IndexedDB 打开与写接口哨兵均 **0**；普通准备保存 **{e['ordinarySaveSetupWrites']}** 次单列。没有服务请求/结果/收据/去重/队列/业务缓存持久增量，没有修档、补做、补扣或补发。

## 自检与回归

全部最终命令 exit 0，合计 **{summary['totalAssertions']:,}** 条断言（专项 {e['assertions']:,} + 回归 {r['totalAssertions']:,}）。

| 检查 | 断言 | exit |
|---|---:|---:|
| `test:v06p1-smith-services-closed` | {e['assertions']} | 0 |
{regrows}
| `npx tsc --noEmit` | — | 0 |
| 双根 datalint | 各问题 0 条 | 0 |
| `git diff --check` / 暂存差异检查 | — | 0 |
| 保护与 evidence 硬门 | 30 冻结项、2713 旧产物 | 0 |

入口：`selfcheck-summary.json`、`evidence.json`、`strings-append-proof.json`、`protection-check.json`、`source-review.json`。专项 `smith-services-closed-result.json` 与 log；回归 `regressions/regression-summary.json`、逐命令 log/result、adaptations；双根 datalint/tsc/diff 见 `audit/`。

旧测试锁历史 strings960/970、源码清单和旧 attr-ui 字节证明，使用本窗 pinned Node loader 仅在**测试脚本内存**精确适配：剥43还原970、再剥10还原960，每层固定历史 SHA；既有源码先核当前精确 SHA，再恢复历史证明链。仅 enhance-open 的测试 TS 总键数断言内存适配到1013；业务断言及产品模块不变换，原测试磁盘不写，旧输出全部重定向本窗。game 历史快照970只读保留。早期静态期望适配失败留 attempts，canonical 最终全绿。详见 `regressions/compatibility-proof.json`、`pinned-inputs.json`、`adaptations/`。

旧 Gate open 回归中的 softOpened:true 是各既有服务事实，不代表本窗 SmithServices UI 获准开放。未执行 design/32 O01–O11，不代勾旧 C/O。

## 冻结与硬门

| 对象 | SHA-256 | 写后 |
|---|---|---|
{frozenrows}

共享/wt 两根冻结表 MATCH，npcs 保持原 SHA；四 Flag 正式 true 保留，GAME_PHASE=5，gifts 10×false。全 Gate、Progress、GameScene 与实例绑定/只读模块保持原字节。`audit/protected-before.json` 与 `protection-check.json` 记录前后；2,713 个旧 QA/dist-test/art pending 文件及其集合保持，未授权差异 0。初始 salvage open old-qa-preservation.json dirty 原样保留且未暂存。

```json
{{
  "smithServicesUiWired": true,
  "newOpenFlag": false,
  "enhanceSha": "d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954",
  "stringsKeysBefore": 970,
  "stringsKeysAfter": 1013,
  "stringsShaBefore": "{s['stringsShaBefore']}",
  "stringsShaAfter": "{s['stringsShaAfter']}",
  "softOpenedSmithServicesUi": false,
  "released": false,
  "settlementUnchanged": true,
  "fourFlagsPreserved": true,
  "GAME_PHASE": 5,
  "gifts0": true
}}
```

## 下一棒与接引子待办

可交执法按 **design/32 §4.2 C01–C11** 独立抽检本实现 tip、等价路由、分层提示、正式拒绝、全量零增量、E/I 隔离与冻结 SHA；本窗只交程序旁证，不发执法/负责人外部消息。

**接引子仍须完成对话→菜单→四面板 tip**：欧冶匠对话消费 SMITH_SERVICES_ROUTE、四服务菜单、四面板选择/确认/提交/结果文案、键鼠焦点与 Esc 返回、重选清确认、关闭/切档刷新旧视图。choices/导航先于 select；select 后改选或导航需重新确认；请求身份与完整载荷沿既有 Gate 协议，不新增 UI 账本。Enter 不默认破坏性提交；分解正式依赖未齐继续拒绝，不能安装 Fixture 回退。本报告不代写接引子已实现结论。

执法 PASS 后仅经项目经理回负责人，请另令开态夹具；无新令不做 O/soft-open/release/进包/tag/Pages。未运行 snapshot/build/sync/release/Pages；禁阵法/gifts/#20/拍卖/坊市混窗、抬 GAME_PHASE、改玩法结算或回翻 Flag。两笔普通 commit + push origin dev，无 force/reset --hard。
'''
result=f'''# P1③++++++++ 炼器关态 tip / 接线结果

2026-10-17｜`/workspace/xiantu/wt/dev`｜dev｜stdin=/dev/null。基线拉齐 `0dd59efdcd288930f1bd0525d2c9e7ddf06c0814`。实现 tip：`{impl}`；文档 tip/推送结果见 `qa/out_v06p1_smith_services_closed/final-tip.json`。

本窗炼器①②程序自检完成：43 键只末尾追加并精确同步，strings **970→1013**；写后 SHA `{s['stringsShaAfter']}`。前 {s['unchangedPrefixBytes']} 字节保持，剥43逐字节还原写前 `ae51319b82a6486cc7f3d9b26c5ae89719e23c32ff9debdcfbb86ef7b5aea08b`，原末键倒数第44位。proof见本窗 `strings-append-proof.json`。

`SmithServices.ts` 提供 smith_ou 等价路由意图、四 Gate 只读选择/submit 委托/完整结果与读档接口；生产 UI 固定关态，无新 OpenFlag，不改 npcs/GameScene，不抢完整四面板。正式实例沿位置 binding 与 Progress formal 源；护符沿正式映射；分解缺正式资格、完整关联退役及生产原子承载证据，继续由原 Gate 整拒，无 Fixture 生产回退、第二套结算/收据/去重。

专项 **C01–C11 {e['assertions']:,} 断言 PASS**，六独立图；15 回归 **{r['totalAssertions']:,}**，合计 **{summary['totalAssertions']:,}**。tsc、双根 datalint（各问题0）、diff与保护硬门均 exit0。业务写入/存储哨兵0，普通准备保存{e['ordinarySaveSetupWrites']}单列；完整四服务历史与分解退役记录不修补，不串 E/I 成功。pending回调spy仅测拒旧、未执行结算；满包/映射故障等语义上下文不冒称正式系统已齐。

enhance `{protected[str(root/'data/balance/enhance.json')]}` **MATCH**；四Flag/全部冻结表/data.ts MATCH，GAME_PHASE=5、gifts10×false。30冻结项及2713旧产物保持，未授权差异0，原dirty不纳入。证据：`qa/out_v06p1_smith_services_closed/` 的 selfcheck-summary/evidence/protection-check/source-review 与 regressions。

可交执法 **C01–C11** 独立抽检（本窗未 fan-out）；**接引子仍须完成对话→菜单→四面板 tip**，完整选择/确认/键鼠/结果呈现与正式分解依赖继续待办。`smithServicesUiWired:true` 是炼器路由/适配就绪；`softOpenedSmithServicesUi:false`、`released:false`。本令≠design/32 O01–O11≠soft-open≠release≠进包，未运行 snapshot/build/sync/release/Pages，未改结算或回翻旗。详见同目录 HANDOFF。
'''
status=f'''## 当前
2026-10-17｜P1③++++++++ 炼器①②关态 tip / 接线程序自检 PASS。
实现 tip {impl}；dev，基线含0dd59ef。
smithServicesUiWired:true；softOpenedSmithServicesUi:false；released:false。

## 实现与验证
strings970→1013，43键仅末尾追加，双根同步与原前缀证明齐。
SmithServices等价路由→四Gate；正式位置绑定、护符映射沿原路径。
C01–C11 {e['assertions']} + 15回归{r['totalAssertions']}，共{summary['totalAssertions']}断言PASS。
tsc/双根datalint/diff/保护核验exit0；业务写0，准备保存{e['ordinarySaveSetupWrites']}单列。

## 交付与旁证
HANDOFF/RESULT：reports/炼器阁/V06P1_SMITH_SERVICES_CLOSED_*.md。
out：qa/out_v06p1_smith_services_closed/；最终双tip与推送见final-tip.json。
strings SHA {s['stringsShaAfter']}。
enhance/四Flag/冻结表/data.ts MATCH；GAME_PHASE5，gifts10×false。
30冻结项、2713旧产物保持；未授权差异0，旧dirty不暂存。

## 边界与下一棒
可交执法按design/32 C01–C11独立抽检，本窗不fan-out或代勾。
接引子仍须完成对话→菜单→四面板tip/确认/结果/键鼠呈现。
分解正式资格/关联退役/生产原子承载未齐，沿Gate拒绝，无Fixture回退。
本令≠O01–O11≠soft-open≠release≠进包；未运行snapshot/build/sync/release/Pages。
禁阵法/gifts/#20/拍卖/坊市、抬PHASE、改结算、回翻Flag或新生产OpenFlag。
'''
ui=f'''## 当前
2026-10-17｜炼器①②已交P1③++++++++ services/Gate关态适配。
实现 tip {impl}；softOpenedSmithServicesUi:false；released:false。

## 实现与验证
SmithServices提供欧冶匠等价路由、菜单项、关态tip、只读选择与Gate委托hook。
现有GameScene四Gate入口冒烟保留；未实现完整服务对话/菜单/操作面板。
既有E/I只读展示保留；本窗C11与attr-ui四套回归PASS。

## 交付与旁证
reports/炼器阁/V06P1_SMITH_SERVICES_CLOSED_HANDOFF.md。
qa/out_v06p1_smith_services_closed/；strings已1013，四Flag/enhance MATCH。

## 边界与下一棒
接引子仍须完成对话→菜单→四面板tip，以及选择/确认/结果/键鼠/旧视图清理。
choices/导航先于select，改选或返回须重选确认，严禁Enter默认破坏性提交。
分解正式资格/关联退役/生产承载未齐继续Gate拒绝，不注入Fixture。
本条仅炼器交接待办，不代写接引子实现结论；O/soft-open/release/进包另令。
'''
files={'reports/炼器阁/V06P1_SMITH_SERVICES_CLOSED_HANDOFF.md':text,'reports/炼器阁/V06P1_SMITH_SERVICES_CLOSED_RESULT.md':result,'status/炼器阁.md':status,'status/炼器阁·界面接入.md':ui}
assert len(status.splitlines())<=30 and all(h in status for h in ['## 当前','## 实现与验证','## 交付与旁证','## 边界与下一棒'])
for name,value in files.items():
 for base in [root,Path('/workspace/xiantu')]:
  p=base/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(value.encode('utf-8'))
 assert (root/name).read_bytes()==(Path('/workspace/xiantu')/name).read_bytes()
print('implementation',impl,'reports/status synchronized UTF-8; status lines',len(status.splitlines()))
