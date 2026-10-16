# 奇遇实体接线 RESULT

执行：炼器阁·Codex sol；2026-10-16，Asia/Shanghai。工作区 `/workspace/xiantu/wt/dev`，分支 `dev`。

- 基线：`15e6088dd92db9930aa970ce0ac68f8121fee531`（已发 v0.5.10，本轮不重发）。
- 实体接线实现 tip：`c493ec036b1c4255aa4324258fd8b54cf4a71bfc`（`c493ec0`）。本 RESULT、状态及已有 `V0510_RELEASE.md` 随后作文档提交；最终 tip 全量/短 SHA 和推送结果见本轮 stdout 末尾，避免文档自引用提交 SHA。
- 结论：**可交执法堂做实体适配 / 内存开态 fixture 抽检**。救援、护草由真实场景实体死亡自动回报；洞府原地机关与四结局接通。正式五事件仍全关，不作为五事件全玩法正式开放验收。
- 依据：`/workspace/xiantu/design/09_奇遇一期.md`、正式 `encounters.json` steps/spawns/outcomes、`ENCOUNTERS_RUNNER_RESULT.md`。奖励和刷怪取正式表，开态仅在 `structuredClone` fixture。

## 实体战斗

| 事件 | 实体路径 | 结局路径 |
|---|---|---|
| 灵溪援手 | `fight → fight_start → battle`；800ms 预警后山魈 `mountain_mandrill ×2` | 本波全灭自动到 `thank`；确认后 runner 结算 `rescued` |
| 林隙留香 | `guard → battle`；800ms 预警后藤妖 `vine_imp ×1` | 本波全灭自动开放 `harvest → pick`；留根/拔根按正式表结算 |

- 新增 `EncounterBattle.ts`，GameScene 使用真实 `spawnTrialMob` 分配独立 Monster。实例复制定义并设 `respawnMs=0`、`noRespawn=true`、`grantRewards=false`；不改共享 MONSTERS 或常驻 `map.spawns`。
- 有坐标沿坐标，缺坐标取锚点两侧偏移并裁剪地图边界；缺锚点 fixture 可用玩家附近生成实体，但不借出生点伪造 offer 或 seen。
- 只计本波实例 onDead；常驻怪、其他波次、重复死亡及单纯消失均不冒充胜利。无效怪物或部分生成失败明确 failed 并清理已生成对象。
- battle 节点先落盘再启动预警；开战清模态面板，释放 GameScene 自有暂停。清波只推进 onWin，无分段奖励；最终奖励仍经 `settleEncounterOutcome`。
- `GameScene.onMobDead` 沿现有 false 门禁隔离任务、修为、掉落和击杀统计。补齐 `SkillCombat` 和 `FriendlySummons` 两条命中路径的目标奖励门禁：事件怪仍受伤、有命中反馈，熟练度为零；普通怪收益保持。
- 倒地沿 `terminate('failed')`，明确离开/离图沿 missed。取消 timer/死亡回报、清本波预警/自有 FX/血条，并原位移除 mobs 引用，保留常驻怪和 collider 持有的数组。
- `Monster.retire()` 先停止攻击、标 dead、禁用碰撞，下一拍才销毁 body。覆盖山魈 `step → doSlam → playerDie/terminate → 返回 step` 重入；胜利回报同样等死亡回调栈返回后再清场。

## 洞府最小路径

- `Runtime.reveal(attemptId)` 是受信显形入口；未显形不展示，仍占 visit 名额、记冷却。
- enter 后 Runtime 原地完成 `enter_room → inscription`，不依赖新小图、不换父 visit、不重新抽签。
- 石刻后显示沿正式 `objectNameKeys` 翻译的土/水/木按钮，支持点击和数字键单次输入；土→水→木为本 Runtime 内存进度，成功到 `open_chest → chest → claim → take/seal`。
- **错序沿正式 `onFail=end_fail` 到 failed**；sealed 由开匣后主动 seal 产生。依 design 09 和当前表保留这两个语义，不为错序改表或消耗有效结局 once。
- taken 发正式材料；sealed 当场兑现道心；failed/missed 无奖励、不封存 once，冷却后可再遇。主动 leave/终止 missed 同样经 runner。

## 事务与恢复

- Runner 仍为节点、扣料、冷却、attempt 和结算的唯一写入口。Runtime 启动已提交的实体挑战，经受信 `completeChallenge` 回报；保留该接口给 fixture，UI advance/choice 不能代报成功。
- blocked 时保留清波/机关完成事实，解除后逐帧重试；保存 false 沿原草稿重试，不重刷或重奖。外部 HP/库存改变导致 stale_save 后，保留结果并基于新档重放，测试验证新值不被覆盖。
- 终止优先于尚被阻塞的胜利。倒地即使保存失败也先清实体，后续帧重试 failed；过期 callback、重复终止、结局后输入无二次奖励。
- once、冷却 max、抽中占额、药物不退、pendingHooks 仍沿既有 runner。刷新 battle/puzzle/scene 安全 failed；领奖节点照旧恢复，不重建旧波次或猜机关进度。
- shutdown/destroy 只收实体，不另造 missed 或写盘；真实离图仍须成功提交终止，否则取消过图。

## 验证

| 命令 | 结果 |
|---|---|
| `npm run test:encounter` | PASS；snapshot/shared 各 1444 断言，另坏表模式安全拒绝 |
| `npm run test:encounter-runner` | PASS；snapshot/shared 各 runner 665 + 实体 119 断言，11 个关态文件逐字节守护通过 |
| `npm run test:encounter-ui` | PASS；snapshot/shared 各 656 断言（原 229），真实 Runtime + Progress + UI |
| `npx tsc --noEmit` | PASS；0 错误 |
| `npm run test:moral-save` / `test:stats` | PASS；153 / 239 断言 |
| `npm run test:v04-save` / `test:mainline-21` | PASS；160（snapshot 旧档）/ 349 断言 |
| `npm run test:trials` | PASS；660 断言 |
| `npm run test:gongfa-qi-legacy` | PASS；752 断言，含 540 战斗和 60 闭关用例 |
| `npm run test:talisman` | PASS；snapshot/shared 及 FX 105 断言 |
| `git diff --check` / staged diff 检查 | PASS |

实体测例运行真实 GameScene provider 桥接、onMobDead、Monster.step/retire、SkillCombat、FriendlySummons 和 Progress；替换计时、显示/物理容器及部分实体分配。波次测试通过实体死亡回调计数，不以手动 runner stub 代替执行器。UI 测试覆盖选择到 provider、自动清面板、缺锚点、blocked、保存失败/外部变更、死亡优先及洞府四结局。

## 关态证明

`data/features.json` MD5：**`a06c3638796fd1bed9af3d45c038c954`**，`lifeSkillCurve=false`。未改 features、正式平衡表、作弊入口或正魔入口。

`data/balance` 与 `/workspace/xiantu/balance` 两目录结果相同：

| 表 / 门禁 | enabled=true | enabled=false | MD5 |
|---|---:|---:|---|
| encounters 五事件 | **0** | 5 | `d17c551ffcd684846cfad565a49dd75b` |
| #19 gongfa_grades | 0 | 46 | `1216c1807fbfd6ead71cfadf31bdf66d` |
| #20 qi_density | 0 | 4 | `76824aef9f71d46206bfb61344abe031` |
| npcs affinity/gifts | 0 | 18 | `d0c2cea601ab34aa019e845f31926efe` |
| karma_flags questHooks | 0 | 2 | `604be023b747d28c5be80312e2f85ecc` |

全关 runner/Runtime 的 enter、tick/update 及新增 reveal/challenge/puzzle 等入口在抛错 Proxy 下验证：0 RNG、0 Progress 读写、0 provider 启动、0 UI 发射。未开放好感、因果消费、questHooks、正魔或 lifeSkillCurve/#19/#20。

## 执法堂抽检要点

- [ ] features MD5 固定，两目录五事件 enabled 计数均 0；只内存开态，关态入口不碰上下文/随机/存档/provider。
- [ ] fight 出战对白确认后才开始 800ms 预警；救援两只、护草一只，常驻怪/重复死亡不计波次，未清波不能领奖或采摘。
- [ ] 事件怪无重生和普通击杀收益；直接技能、友方灵兽均不涨熟练度，普通怪仍有收益。
- [ ] 胜利自动推进正式 onWin，最终仍经 runner 结算；重复回报无二次奖励或冷却延长。
- [ ] 预警/交战/排队胜利时倒地或离开均清场；山魈攻击回调中退场不提前销毁 body，不动常驻对象和 collider 数组。
- [ ] 入战/清波/机关最后一步注入保存失败；核完整回滚与一次重试、外部 HP/库存保留、blocked 不丢结果及死亡优先。
- [ ] 洞府 reveal→enter→石刻→土水木→开匣，可到 taken/sealed；错序 failed、离开 missed。失败冷却后可再遇，有效结局 once，父 visit 不变、不重抽。
- [ ] 缺锚点 fixture 可驱动挑战但不伪造可见提示/seen；刷新挑战仍 failed；关闭对白不代选。

## 未覆盖项与交付

1. 正式扫描覆盖、五事件地图锚点/演员仍未布置；reveal 仅受信入口，不能认定正式扫描已接。
2. 洞府为原地对话/按钮机关，未建单室子图、平台机关、出口或父子场景真实切换；属于本轮授权的最小接线路径。
3. 未跑浏览器 Phaser 键鼠端到端、正式地图落脚点/净空视觉验收或性能压测；实体桥接和真实攻击调用栈由上述模块 fixture 验证。
4. 持续打坐、其余事件实体表现及 karma/affinity 正式消费仍沿既有报告的未覆盖范围；本轮没有开启正式事件。

本轮按请求本地提交后普通 push `origin/dev`；不 force push、不合 master、不发版、不发送外部私信。已有未入库 `V0510_RELEASE.md` 一并作文档提交，未执行发版动作。

原有 MAINLINE_21_WIRE_RESULT、TALISMAN_UI_STRINGS_MERGE_RESULT、两份 UI_TIP_PUSH 文档及 pending 美术保留工作区，不纳入本任务提交。状态覆盖前备份及测试日志：`/tmp/xiantu-encounters-entity-20261016/`。
