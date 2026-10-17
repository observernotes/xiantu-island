# v0.6 · P1③+++++ 附灵一期关态 tip 交接

2026-10-17 Asia/Shanghai；工作目录 `/workspace/xiantu/wt/dev`，分支 `dev`，stdin=`/dev/null`。开工先 `git fetch && git pull --ff-only origin dev`，exit 0，基线及 origin/dev 均为 `d01cae16b74a9d40d4e7ddce3d10c3dabb13328e`，含 v0.6.10 / 护符 soft-open 族。

实现 tip：`5bee47d7b81ed22ed5c28719d9c06190ea817c13`（`feat(v0.6-p1): wire enchant closed tip APIs`）。本报告、RESULT、status 及交付审计随下一笔 `docs(v0.6-p1): hand off enchant closed tip evidence` 提交。最终文档 tip 与推送后的 origin/dev HEAD 由本窗 `final-tip.json` 和交付回执记录，避免在报告内自引用提交 SHA。

依据：负责人令 `/workspace/xiantu/reports/炼器阁/20261017_负责人令_P1③+++++关态tip接线.md`；design/29 §2.3–§3、§4.2 C01–C10、§6；演武 `20261017_P1③+++++_附灵beast_core落表.md`；API 模式沿 `EnhanceClosed.ts` / `ForgeClosed.ts`。设计中禁止建代码是前一设计窗边界，本次接线令明确授权本窗新增两模块和专项测试；本次用户另明确禁止全量 snapshot，故只精确复制三表。

**本令仅关态 tip 接线 ≠ 附灵开态夹具 O ≠ soft-open ≠ release ≠ 进包 ≠ 附灵成功结算。** 程序自检 PASS 不代执法 C 表抽检，不授权附灵生产放行。

## 八 API 与接线边界

| 零参数只读 API | tipKey |
|---|---|
| `featureClosed()` | `enchant.closed.feature` |
| `refuseEntrance()` | `enchant.closed.entrance` |
| `refuseEnchant()` | `enchant.closed.enchant` |
| `refuseSubmit()` | `enchant.closed.no_submit` |
| `refuseResult()` | `enchant.closed.no_result` |
| `refuseElement()` | `enchant.closed.no_element` |
| `refuseLoadRefresh()` | `enchant.closed.load_refresh` |
| `refuseLaterService()` | `enchant.closed.later_service` |

`src/EnchantClosed.ts` 唯一 import 为 `@xt/balance/strings_zh.json`；八 API 恒返回 `{ allowed:false, tipKey, text:strings[tipKey] }`。不接收 Progress 或写入意图，不依赖结算、服务、请求、存档。`src/EnchantOpenFlag.ts` 的 `isEnchantOpenForFixture()` 恒 false，不借 Forge/Enhance Flag、不受表或环境翻转；本窗不注入 true。

未创建 EnchantGate、附灵消费者、成功结算、同事务扣费或新存档 schema；未挂 smith_ou.services、未改 NPC、未接附灵完整 UI。独立附灵提示只用 enchant.closed.*；既有强化窗附灵/分解仍用 enhance.closed.later_service（原文本字节保留），Forge 后续提示原样。分解仅 later_service 拒绝。ForgeGate / EnhanceGate / GameScene / Progress / 两既有 Flag 全部保持写前字节，打造/强化/护符路径零回退；生产没有新增 fixtureInstances 注入或回退。

## C01–C10 程序旁证

| 编号 | API | 已验证口径 | 旁证 |
|---|---|---|---|
| C01 | `featureClosed / refuseEntrance` | 查看、关闭重读与 smith_ou 意图仅提示；无 services、新请求。 | `v06p1-enchant-closed-evidence.json` 对应 `C01` 及各图 runtime 旁证 |
| C02 | `refuseEnchant / refuseSubmit` | 本档正式旧武器、足量灵石/内丹及连点全拒，完整状态零增量。 | `v06p1-enchant-closed-evidence.json` 对应 `C02` 及各图 runtime 旁证 |
| C03 | `refuseSubmit` | 无实例、itemId/数量/槽位/历史袋/fixtureInstances/foreign 语义均不能授权。 | `v06p1-enchant-closed-evidence.json` 对应 `C03` 及各图 runtime 旁证 |
| C04 | `refuseSubmit` | 非武器、armor、slot/资格/五行/灵根异常语义均拒，不补默认值。 | `v06p1-enchant-closed-evidence.json` 对应 `C04` 及各图 runtime 旁证 |
| C05 | `refuseSubmit` | 缺灵石、缺内丹、部分映射或异常数量语义均零扣、无预留。 | `v06p1-enchant-closed-evidence.json` 对应 `C05` 及各图 runtime 旁证 |
| C06 | `refuseSubmit / refuseResult / refuseElement` | 同元素/覆盖/结果/属性改写均拒，原元素属性语义原样保留。 | `v06p1-enchant-closed-evidence.json` 对应 `C06` 及各图 runtime 旁证 |
| C07 | `refuseEnchant / refuseSubmit` | 旧界面、重复/冲突回调、同实例/共享库存并发全拒，无请求/去重/队列。 | `v06p1-enchant-closed-evidence.json` 对应 `C07` 及各图 runtime 旁证 |
| C08 | `refuseLoadRefresh / refuseSubmit` | 普通保存、真实 restore(false)/loadAsync、独立 SSR 刷新及跨档同引用保留合法旧资产。 | `v06p1-enchant-closed-evidence.json` 对应 `C08` 及各图 runtime 旁证 |
| C09 | `featureClosed / refuseEntrance / refuseEnchant` | Forge/Enhance 正式 true，Enchant 独立 false；两既有入口仍开放、护符保留、提示分层。 | `v06p1-enchant-closed-evidence.json` 对应 `C09` 及各图 runtime 旁证 |
| C10 | `refuseLaterService + 全八 API` | 分解仅 later_service 拒绝；灵石/材料/实例/五行/等级/属性/品质/经验/业务记录零增量。 | `v06p1-enchant-closed-evidence.json` 对应 `C10` 及各图 runtime 旁证 |

以上为 design/29 §4.2 的程序自动化部分。专项 runner 在 shared 与 snapshot 两根各建真实 Vite SSR 初始图及全新刷新图，执行 `src/v06p1-enchant-closed.test.ts`。所有 API 零参数，业务意图/目标/元素异常只作测试上下文；恒拒 API 不实施目标、映射、覆盖或成功事务的业务校验，不应把语义夹具当作已实现的 EnchantGate。C08 使用已有正式 forge/enhance schema 的合法旧完整记录，经真实 exportSave/saveAsync/restore(false)/loadAsync 保留；普通 saveAsync 建档写入单列 ordinarySaveSetupWrites，拒绝动作存储写入和写哨兵均 0。

附灵旧元素/未完成/未知/损坏记录置于测试专用 `__enchantClosedSemanticFixture` 原文中。真实 restore 不认识该字段，测试明确断言其未进入正式 schema，再复挂原文验证只读拒绝；不宣称未知附灵字段已正式持久化、不修档、不补做。跨档相同引用文本保持两档库存/完整旧结果隔离。未执行 design/29 O01–O08，未做浏览器实机抽检或替执法勾选。

## 三快照与冻结

仅执行三次 `cp -f /workspace/xiantu/balance/<file> data/balance/<file>`；未运行 snapshot/build/sync/release，game worktree 快照与共享权威表均未写。

| 文件 | SHA-256 | 结论 |
|---|---|---|
| `materials.json` | `86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d` | shared / wt snapshot MATCH |
| `items.json` | `dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99` | shared / wt snapshot MATCH |
| `strings_zh.json` | `6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9` | shared / wt snapshot MATCH |

strings 共 952 键，enchant.closed.* 恰 8 键；无追加或改写权威 strings。`table-delta-check.json` 严格撤销本窗 phase/镜像/末尾八键后，还原 materials `79c68429…`、items `f8b58763…`、原 944 键 strings `d7361af3…` 完整字节，证明既有护符行及 forge/enhance 文案保留。

`protection-check.json` 冻结 21 项及三表 6 项全部 MATCH：enhance.json / recipes.json / npcs.json / life_skills.json / enhance_protect_charm.json、ForgeOpenFlag.ts / EnhanceOpenFlag.ts / data.ts；GAME_PHASE=5，gifts 10×false。生产源码及非本窗数据零未授权差异；既有 QA 897 文件零变化，art pending 保留。完整 SHA/写前后清单见 protected-before/after.json、prior-evidence-before/after.json。

## 测试与 evidence

输出根：`qa/out_v06p1_enchant_closed/`，全部命令实际 exit 0。

| 检查 | 结果 | 旁证（本窗 out 相对路径） |
|---|---|---|
| `tsc` | exit 0 | `tsc.log` / `tsc.result.json` |
| `v06p1-enchant-closed` | exit 0，12519 断言 | `v06p1-enchant-closed.log` / `v06p1-enchant-closed.result.json` |
| `v06p1-enhance-open` | exit 0，17729 断言 | `v06p1-enhance-open.log` / `v06p1-enhance-open.result.json` |
| `v06p1-enhance-closed` | exit 0，30836 断言 | `v06p1-enhance-closed.log` / `v06p1-enhance-closed.result.json` |
| `v06p1-forge-open` | exit 0，6381 断言 | `v06p1-forge-open.log` / `v06p1-forge-open.result.json` |
| `v06p1-forge-closed` | exit 0，20413 断言 | `v06p1-forge-closed.log` / `v06p1-forge-closed.result.json` |
| `v06p1-market-closed` | exit 0，24194 断言 | `v06p1-market-closed.log` / `v06p1-market-closed.result.json` |
| `v06d-closed` | exit 0，15059 断言 | `v06d-closed.log` / `v06d-closed.result.json` |
| `v06c-closed` | exit 0，10714 断言 | `v06c-closed.log` / `v06c-closed.result.json` |
| `datalint-shared` | exit 0 | `datalint-shared.log` / `datalint-shared.result.json` |
| `datalint-snapshot` | exit 0 | `datalint-snapshot.log` / `datalint-snapshot.result.json` |
| `json-shared` | exit 0 | `json-shared.log` / `json-shared.result.json` |
| `json-snapshot` | exit 0 | `json-snapshot.log` / `json-snapshot.result.json` |
| `diff-check` | exit 0 | `diff-check.log` / `diff-check.result.json` |

共 137845 条测试断言；本窗附灵专项 12519 条。package 无独立 protect 命名测试；既有护符相关断言由 enhance-open/closed 实际运行，保留护符 soft-open 证据。其历史 O01–O06 仅为护符回归，不是附灵 O 表。

旧回归钉住原三表 SHA、944 键、原 src 文件全集与 game 历史快照。本窗不改旧测试磁盘或旧 QA；在本窗 QA 通过 NODE_OPTIONS 加载严格、逐项记录的内存期望适配。适配仅纳入三表授权增量、附灵新增源码白名单与 shared/wt 952 对 game 历史 944 的分根期望；game 四表及 shared 内丹落表生成器的既有只读差异，均先匹配本窗 protected-before.json 与当前 SHA，再纳入精确基线。旧业务断言与真实 Vite 生产 SSR 均执行当前真实表。原/变换 SHA、精确替换项见 regression-register.mjs、regression-loader.mjs 及 regression 下审计。当前真实三表与旧块还原另由新专项、table-delta-check、protection-check 独立核验。不能将旧报告中的历史 SHA/944 字样解释为当前盘面。

```json
{
  "enchantClosedTipsWired": true,
  "EnchantOpenFlag": false,
  "softOpenedEnchant": false,
  "released": false,
  "beastCoreMapped": true,
  "protectCharmSoftOpenPreserved": true
}
```

`beastCoreMapped:true` 仅指 items 同 id 与合并后有效材料登记齐，不代表附灵消费者、消费/保存/去重完整齐备或生产放行。protectCharmSoftOpenPreserved 由既有旁证字节保护与本次真实强化回归共同支持。主证据：selfcheck-summary.json、evidence-check.json、protection-check.json、v06p1-enchant-closed-evidence.json。

## 交付与下一棒

Codex 原日志：`/workspace/xiantu/logs/codex/149e470df7669a9b_20261017_131906_1588895.log`；启动日志 `qa/out_v06p1_enchant_closed/codex_launch.log`，引用见 codex-log-reference.json。实际 model=gpt-6.1-sol、reasoning effort=ultra、stdin=/dev/null，未启 fast、未重开同题 Codex。动态日志只引用，不暂存进行中的日志。

HANDOFF/RESULT/status 在 wt/dev 提交并以 UTF-8 同内容同步至 `/workspace/xiantu/reports/炼器阁/` 和 `/workspace/xiantu/status/炼器阁.md`；status 覆写为四段且≤30行。仅暂存本窗允许文件；原待审 dirty、旧 out、dist-test、art pending 原位保留。两次普通 commit 后普通 `git push origin dev`，无 force-push / reset --hard。final-tip.json 为推送后本地交付元数据，记录实现/文档/origin/dev/远端 HEAD，不另造自引用提交。

无程序自检阻断。下一棒交执法按 design/29 §4.2 C01–C10 对实现 tip、八提示、前后状态及冻结 SHA 独立抽检并留实际证据；执法 PASS 后由负责人另下附灵开态夹具令。禁分解流程、阵法、gifts/#20、拍卖/坊市混窗，禁抬 GAME_PHASE；本窗不授权开态、soft-open、release 或进包。
