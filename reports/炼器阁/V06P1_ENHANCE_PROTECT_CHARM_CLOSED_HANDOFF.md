# P1③++++ 护器符正式映射 · 关态 tip 接线 HANDOFF

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜交执法按 design/28 §4.2 C01–C08 抽检。

实现 tip：`28d701f24937d7cda89b70cbebc6c9e0cafd18bb`（`feat(v0.6-p1): wire enhance protect charm closed mapping`）。文档 tip / origin/dev 最终 HEAD 见本窗 `final-tip.json` 及最终回执。基线 `0cd3fc9`，含 v0.6.9 / `18a7a0c` 正式结算 soft-open；开工已 fetch + pull --ff-only，在 `/workspace/xiantu/wt/dev`、分支 dev 操作，所有子进程 stdin=/dev/null。

**本令=护符映射接线 ≠ design/28 O01–O06 开态夹具全表 ≠ soft-open ≠ release ≠ 进包。** 本次仅程序自检与执法交棒，不代勾设计原表或执法 PASS；既有无符正式路径与只读入口继续保持。兼容 `formalOpen:true / softOpened:true` 只描述既有状态，不授予本窗护符 soft-open / 发布权限。

```json
{
  "protectCharmWired": true,
  "protectCharmN": 1,
  "formalTipsWired": true,
  "formalInstanceSource": true,
  "softOpenedEntrance": true,
  "softOpenedFormalSettle": true,
  "softOpenedProtectCharm": false,
  "released": false
}
```

## 已接行为

只复制获准三表 shared→wt snapshot；未运行全量 snapshot。Gate 运行时只读映射与合并后的 ITEMS 资格；N 为合法正整数、本窗 1。false 不读取护符映射或库存；true 映射未齐返回 protect，齐备缺可消费符返回 resources；实例、等级、基础资源先依既有正式门禁拒绝，携符不能获得装备授权。

true 齐备足量时保持目标行原 rate；成功升到 to，正常失败保 fromLevel、不碎装。结果记录 true 与配置原 dropOnFail；灵石、精炼石、护符 N、结果、等级/属性与 receipt 同一隔离草稿事务，持久化完成后发布。库存校验对齐 refine_stone：永久库存足量、count 等于永久量且不在 pillQualities。预检及事务内均复核，消费使用 removeItem。拒绝零扣、零抽样、零业务记录。

duplicate 只认 committed，核对 instanceRef/from/to/useProtectCharm；匹配只读旧结果，冲突不附 result。读档 load_dedupe 不补扣、不重抽，原 false 历史结果仍合法。Progress 仅放开 boolean 与护符失败保级公式，formalSources / 其他 schema 字段未动。GameScene 无改动，只读 entrance；无生产 fixtureInstances 默认注入、回退或从 itemId 数量构造 instanceRef。附灵/分解继续 later_service；正式 tip 文案只读 strings_zh。

## C01–C08 程序旁证交棒

| C 项 | 可重放旁证与通过口径 |
|---|---|
| C01 | open / closed 两 runner 的独立 memory-closed 图，true/false、合法显式实例与足量符仍 closed.*；Forge 正式 true 不授权强化；零抽样、事务及库存变化 |
| C02 | open `protectCharmMapping` 的映射字段删除/非法 N 及 ITEMS 缺失、phase/enabled/placeholder/qualityEnabled 矩阵；有库存仍 protect，finally 恢复 |
| C03 | false 下映射 getter 哨兵和护符库存读取计数；缺实例 no_instance、缺基础资源 resources，不误报 protect |
| C04 | 携符无实例、itemId 冒充、foreign、bad_type、非法或过期等级仍整笔拒绝；正式来源与显式夹具授权独立 |
| C05 | 拒绝前后整档、IDB 行/写入/commit、随机、库存/等级/属性/品质/经验零增量；品质或临时护符不能补永久库存；附灵/分解 later_service |
| C06 | true 已提交匹配重放只读，useProtectCharm 与其他载荷冲突 duplicate 且无旧 result；连点不二次消费，不给拒绝请求写 receipt |
| C07 | 原无符与护符成功/失败载荷各经 fresh SSR 导入/读回，load_dedupe、不补扣或重抽；关态保留历史、跨档隔离；不补做坏记录 |
| C08 | `source-path-audit.json`、生产唯一消费者静态核验及齐备/未齐对照；夹具仅测试显式注入，无生产依赖或缺源回退 |

本窗额外的最小接线旁证为成功扣 N、dropOnFail=true 的失败保级且扣 N、缺符 resources，支持 C 表语义自洽。既有 design/27 回归继续运行；**这些重叠运行项不代替或代勾 design/28 O01–O06 开态全表**。SSR 与内存 IDB 证明程序测试边界，不外推为多浏览器并发验收。

## 自检与冻结

七套件合计 **122,752** 断言。tsc、七套件、shared/snapshot 双根 datalint（各问题 0）、三表双根 python3 -m json.tool、git diff --check 全 exit 0；详见 [selfcheck-summary.json](../../qa/out_v06p1_enhance_protect_charm_closed/selfcheck-summary.json)。所有 QA 输出定向本窗，旧 QA 文件/集合保持。

三表 shared 与 snapshot 均 MATCH：

| 表 | SHA-256 | 结果 |
|---|---|---|
| materials.json | 79c68429d763054ac1715467d1743575e179ecaecb2529e4b6ed7df137ef4052 | MATCH |
| items.json | f8b587634e5c9d43a475e85724aa34172e2945abda7654c2ef98fda07d1566f3 | MATCH |
| enhance_protect_charm.json | 0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772 | MATCH |

冻结五表与两 Flag 全 MATCH，strings 944→944、GAME_PHASE=5、gifts 10×false。4,057 个保护文件未授权差异 0，683 份旧 QA 文件及集合差异 0；art pending 原字节保留。详见 `protected-before.json / protected-after.json / protection-check.json / prior-evidence-before.json / prior-evidence-after.json`。

QA：`qa/out_v06p1_enhance_protect_charm_closed/`；逐命令 `*.log / *.result.json` 可重放，`evidence-check.json` 核八键、C 表与运行图；`run-selfcheck.py` 记录命令、cwd、环境和 stdin。Codex 原日志：`/workspace/xiantu/logs/codex/c3576e037cb1901c_20261017_112303_1451537.log`；本窗 `codex_launch.log` 为运行中日志仅引用、不暂存。HANDOFF/RESULT/status 以 UTF-8 同步共享区。

首轮五个 runner 因 game strings 的旧 936 键前提失败；写前保护清单证明 game 在开工前已为指定 944 键。只适配 runner 到现有 SHA，shared/wt 剥八键还原历史字节的验证保留，未写任何 strings。其后 enhance/forge closed 的旧全树清单还需认可 shared 已有的演武生成器，按精确路径及固定 SHA 白名单适配；未修改或复制生成器至 wt/game。两轮失败日志保存在 `attempts/`，最终受影响套件已重跑通过。

未运行 snapshot/build/sync/release，未进包、发版、打 tag 或推 Pages；未混入附灵/分解/阵法/gifts/#20/拍卖/坊市。普通两次 commit + push，无 force-push/reset --hard；仅暂存本窗允许文件，待审 dirty 保留。

**无程序自检阻断。下一棒交执法按 design/28 C01–C08 独立抽检；PASS 报 tip+out 后，请负责人另下开态夹具令。PASS ≠ 开态夹具 ≠ soft-open ≠ release。**
