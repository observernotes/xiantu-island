#!/usr/bin/env python3
"""在实现提交及全部自检通过后生成本窗交棒文件，并以 UTF-8 同步共享区。"""
import json
from pathlib import Path
import subprocess

ROOT = Path('/workspace/xiantu/wt/dev')
SHARED = Path('/workspace/xiantu')
OUT = ROOT / 'qa/out_v06p1_enhance_protect_charm_closed'
summary = json.loads((OUT / 'selfcheck-summary.json').read_text())
protection = json.loads((OUT / 'protection-check.json').read_text())
assert summary['passed'] and protection['passed']
tip = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, stdin=subprocess.DEVNULL, text=True).strip()
subject = subprocess.check_output(['git', 'log', '-1', '--format=%s'], cwd=ROOT, stdin=subprocess.DEVNULL, text=True).strip()
assert subject == 'feat(v0.6-p1): wire enhance protect charm closed mapping'
ev = {n: summary[n] for n in ['protectCharmWired','protectCharmN','formalTipsWired','formalInstanceSource',
    'softOpenedEntrance','softOpenedFormalSettle','softOpenedProtectCharm','released']}
evidence_text = json.dumps(ev, ensure_ascii=False, indent=2)
counts = summary['suiteAssertions']
total = summary['totalSuiteAssertions']
table = '\n'.join(f'| npm run test:{n} | 0 | {v:,} |' for n, v in counts.items())
frozen = '\n'.join(f'| {Path(n).name} | {r["actual"]} | MATCH |'
    for n, r in protection['boundary']['frozen'].items()
    if n.startswith(str(SHARED / 'balance')) or n.startswith(str(ROOT / 'src')))
targets = '\n'.join(f'| {Path(n).name} | {r["actual"]} | MATCH |'
    for n, r in protection['boundary']['targets'].items() if n.startswith(str(SHARED / 'balance')))
log = '/workspace/xiantu/logs/codex/c3576e037cb1901c_20261017_112303_1451537.log'
handoff = f'''# P1③++++ 护器符正式映射 · 关态 tip 接线 HANDOFF

2026-10-17 Asia/Shanghai｜炼器阁·主程序｜交执法按 design/28 §4.2 C01–C08 抽检。

实现 tip：`{tip}`（`{subject}`）。文档 tip / origin/dev 最终 HEAD 见本窗 `final-tip.json` 及最终回执。基线 `0cd3fc9`，含 v0.6.9 / `18a7a0c` 正式结算 soft-open；开工已 fetch + pull --ff-only，在 `/workspace/xiantu/wt/dev`、分支 dev 操作，所有子进程 stdin=/dev/null。

**本令=护符映射接线 ≠ design/28 O01–O06 开态夹具全表 ≠ soft-open ≠ release ≠ 进包。** 本次仅程序自检与执法交棒，不代勾设计原表或执法 PASS；既有无符正式路径与只读入口继续保持。兼容 `formalOpen:true / softOpened:true` 只描述既有状态，不授予本窗护符 soft-open / 发布权限。

```json
{evidence_text}
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

七套件合计 **{total:,}** 断言。tsc、七套件、shared/snapshot 双根 datalint（各问题 0）、三表双根 python3 -m json.tool、git diff --check 全 exit 0；详见 [selfcheck-summary.json](../../qa/out_v06p1_enhance_protect_charm_closed/selfcheck-summary.json)。所有 QA 输出定向本窗，旧 QA 文件/集合保持。

三表 shared 与 snapshot 均 MATCH：

| 表 | SHA-256 | 结果 |
|---|---|---|
{targets}

冻结五表与两 Flag 全 MATCH，strings 944→944、GAME_PHASE=5、gifts 10×false。{protection['protectedFiles']:,} 个保护文件未授权差异 0，{protection['oldEvidenceFiles']:,} 份旧 QA 文件及集合差异 0；art pending 原字节保留。详见 `protected-before.json / protected-after.json / protection-check.json / prior-evidence-before.json / prior-evidence-after.json`。

QA：`qa/out_v06p1_enhance_protect_charm_closed/`；逐命令 `*.log / *.result.json` 可重放，`evidence-check.json` 核八键、C 表与运行图；`run-selfcheck.py` 记录命令、cwd、环境和 stdin。Codex 原日志：`{log}`；本窗 `codex_launch.log` 为运行中日志仅引用、不暂存。HANDOFF/RESULT/status 以 UTF-8 同步共享区。

首轮五个 runner 因 game strings 的旧 936 键前提失败；写前保护清单证明 game 在开工前已为指定 944 键。只适配 runner 到现有 SHA，shared/wt 剥八键还原历史字节的验证保留，未写任何 strings。其后 enhance/forge closed 的旧全树清单还需认可 shared 已有的演武生成器，按精确路径及固定 SHA 白名单适配；未修改或复制生成器至 wt/game。两轮失败日志保存在 `attempts/`，最终受影响套件已重跑通过。

未运行 snapshot/build/sync/release，未进包、发版、打 tag 或推 Pages；未混入附灵/分解/阵法/gifts/#20/拍卖/坊市。普通两次 commit + push，无 force-push/reset --hard；仅暂存本窗允许文件，待审 dirty 保留。

**无程序自检阻断。下一棒交执法按 design/28 C01–C08 独立抽检；PASS 报 tip+out 后，请负责人另下开态夹具令。PASS ≠ 开态夹具 ≠ soft-open ≠ release。**
'''
result = f'''# P1③++++ 护器符正式映射 · 关态 tip 接线 RESULT

2026-10-17｜炼器阁·主程序｜负责人令经项目经理执行。

已完成三表精确快照、Gate 护符映射/资源分型与同事务结算、Progress 必要 boolean/保级放开，以及 design/28 C01–C08 程序旁证。实现 tip：`{tip}`；文档 tip / origin/dev 最终 HEAD 见本窗 `final-tip.json` 与最终回执。

**本窗=护符映射接线 ≠ 开态夹具全表 ≠ soft-open ≠ release ≠ 进包。** 既有 `formalOpen / softOpened` 兼容字段只沿用入口与无符正式结算状态；design/28 O01–O06 待负责人另令，未代勾。

```json
{evidence_text}
```

false 不依赖护符映射/库存；true 未齐 protect、齐备缺符 resources、足量按原 rate 结算。成功/正常失败均扣 N=1，失败保原等级且审计 dropOnFail 原值；灵石/精炼石/符、等级/属性、结果及去重同事务。去重新增 useProtectCharm 一致性核对；冲突不附旧 result；fresh SSR 读档不追扣、不重抽。生产 GameScene 仍只读入口，无夹具注入/回退、无 itemId 数量造实例。附灵/分解仍 later_service；正式文案取既有 strings 键，未追加或改字节。

## 全部自检 exit 0

| 命令 | exit | 断言/结果 |
|---|---|---|
| npx tsc --noEmit | 0 | PASS |
{table}
| 双根 datalint | 0 | shared/snapshot 各问题 0 |
| 双根三文件 python3 -m json.tool | 0 | 6×PASS |
| git diff --check | 0 | PASS |
| 冻结 / 三表 / 文件集合保护 | 0 | MATCH，未授权差异 0 |

七套件 **{total:,}** 断言。QA：`qa/out_v06p1_enhance_protect_charm_closed/`；`selfcheck-summary.json / evidence-check.json / protection-check.json` 均 PASS。C01–C08 对应运行证据与验证边界见 [HANDOFF](V06P1_ENHANCE_PROTECT_CHARM_CLOSED_HANDOFF.md)。齐备成功扣 N、失败保级扣 N、缺符拒绝均有最小运行旁证；不作为 design/28 开态全表验收。

首轮五个 runner 的 game 旧 936 键假设与写前已存在的 944 键不符；仅适配 runner 固定 SHA/计数，未改字符串。enhance/forge closed 的旧全树清单也补认可 shared 已有演武生成器的精确路径/固定 SHA，未复制至 wt/game。历史剥八键校验仍保留，两轮失败日志在 `attempts/`；最终均重跑通过。

## 三表与冻结 SHA

下列三表 shared 与 snapshot 均匹配目标 SHA；仅三次 cp，未全量 snapshot，未触及 art pending。

| 文件 | SHA-256 | 结果 |
|---|---|---|
{targets}

下列冻结值写前=写后；shared/wt 五表及 wt/game 两 Flag 分别核验：

| 文件 | SHA-256 | 结果 |
|---|---|---|
{frozen}

strings 仍 944 键；gifts 10×false；GAME_PHASE=5；EnhanceOpenFlag、ForgeOpenFlag 仍正式 true。game 旧数据快照字节保持。{protection['protectedFiles']:,} 个保护文件、{protection['oldEvidenceFiles']:,} 份旧 QA 文件与集合均无未授权差异。旧 formal_tips / formal_instance / formal_soft_open / open_fixture / closed QA 不变，待审 art pending、dist-test、V068/V069 等未纳入提交。

Codex 原日志：`{log}`；`qa/out_v06p1_enhance_protect_charm_closed/codex_launch.log` 为运行中日志仅引用。HANDOFF/RESULT/status UTF-8 同步 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。

未运行 snapshot/build/sync/release、未进包、未发版、未打 tag/推 Pages；两次普通 commit/push，无 force-push/reset --hard。

**无程序自检阻断。下一棒交执法 C01–C08；PASS 报 tip+out 后请负责人下开态夹具令。**
'''
status = f'''# 炼器阁·主程序 状态（2026-10-17）

## 当前
P1③++++ 护器符正式映射关态 tip 接线已交；基线含 v0.6.9 / 正式结算 soft-open。
实现 `{tip}`；文档 tip / origin/dev HEAD 见本窗 final-tip.json。
本令≠开态全表≠soft-open≠release≠进包；softOpenedProtectCharm:false，released:false。

## 实现与验证
三表精确复制、N=1；false 不查护符；true 未齐 protect、缺符 resources。
齐备成功/失败同扣 N，失败保级；结果/库存/等级/去重同事务，载荷冲突不附旧 result。
tsc + 七套件 {total:,} 断言 + 双根 lint/JSON + diff/保护全绿。
protectCharmWired/formalTipsWired/formalInstanceSource/softOpenedEntrance/softOpenedFormalSettle:true。

## 交付与旁证
reports/炼器阁/V06P1_ENHANCE_PROTECT_CHARM_CLOSED_HANDOFF.md / RESULT.md。
qa/out_v06p1_enhance_protect_charm_closed/；summary/evidence/protection 全 PASS。
冻结五表/两 Flag MATCH；strings944、GAME_PHASE5、gifts10×false；旧 QA/art pending 保留。
HANDOFF/RESULT/status 已 UTF-8 同步共享区；未运行 snapshot/build/sync/release。

## 边界与下一棒
GameScene 仅只读 entrance，无生产 fixtureInstances；不从 itemId 数量造 instanceRef。
禁附灵/分解/阵法/gifts/#20/拍卖/坊市混窗；无 force-push/reset --hard。
无程序自检阻断。下一棒交执法 design/28 C01–C08；PASS 后请负责人下开态夹具令。
'''
assert len(status.splitlines()) <= 30
files = {
    'reports/炼器阁/V06P1_ENHANCE_PROTECT_CHARM_CLOSED_HANDOFF.md': handoff,
    'reports/炼器阁/V06P1_ENHANCE_PROTECT_CHARM_CLOSED_RESULT.md': result,
    'status/炼器阁.md': status,
}
for name, content in files.items():
    for base in [ROOT, SHARED]:
        (base / name).write_text(content, encoding='utf-8')
print(json.dumps({'implementationTip':tip,'files':list(files),'statusLines':len(status.splitlines()),'utf8Synced':True},ensure_ascii=False))
