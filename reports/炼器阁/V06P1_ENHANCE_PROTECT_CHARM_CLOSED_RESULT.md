# P1③++++ 护器符正式映射 · 关态 tip 接线 RESULT

2026-10-17｜炼器阁·主程序｜负责人令经项目经理执行。

已完成三表精确快照、Gate 护符映射/资源分型与同事务结算、Progress 必要 boolean/保级放开，以及 design/28 C01–C08 程序旁证。实现 tip：`28d701f24937d7cda89b70cbebc6c9e0cafd18bb`；文档 tip / origin/dev 最终 HEAD 见本窗 `final-tip.json` 与最终回执。

**本窗=护符映射接线 ≠ 开态夹具全表 ≠ soft-open ≠ release ≠ 进包。** 既有 `formalOpen / softOpened` 兼容字段只沿用入口与无符正式结算状态；design/28 O01–O06 待负责人另令，未代勾。

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

false 不依赖护符映射/库存；true 未齐 protect、齐备缺符 resources、足量按原 rate 结算。成功/正常失败均扣 N=1，失败保原等级且审计 dropOnFail 原值；灵石/精炼石/符、等级/属性、结果及去重同事务。去重新增 useProtectCharm 一致性核对；冲突不附旧 result；fresh SSR 读档不追扣、不重抽。生产 GameScene 仍只读入口，无夹具注入/回退、无 itemId 数量造实例。附灵/分解仍 later_service；正式文案取既有 strings 键，未追加或改字节。

## 全部自检 exit 0

| 命令 | exit | 断言/结果 |
|---|---|---|
| npx tsc --noEmit | 0 | PASS |
| npm run test:v06p1-enhance-open | 0 | 15,158 |
| npm run test:v06p1-enhance-closed | 0 | 30,834 |
| npm run test:v06p1-forge-open | 0 | 6,380 |
| npm run test:v06p1-forge-closed | 0 | 20,413 |
| npm run test:v06p1-market-closed | 0 | 24,194 |
| npm run test:v06d-closed | 0 | 15,059 |
| npm run test:v06c-closed | 0 | 10,714 |
| 双根 datalint | 0 | shared/snapshot 各问题 0 |
| 双根三文件 python3 -m json.tool | 0 | 6×PASS |
| git diff --check | 0 | PASS |
| 冻结 / 三表 / 文件集合保护 | 0 | MATCH，未授权差异 0 |

七套件 **122,752** 断言。QA：`qa/out_v06p1_enhance_protect_charm_closed/`；`selfcheck-summary.json / evidence-check.json / protection-check.json` 均 PASS。C01–C08 对应运行证据与验证边界见 [HANDOFF](V06P1_ENHANCE_PROTECT_CHARM_CLOSED_HANDOFF.md)。齐备成功扣 N、失败保级扣 N、缺符拒绝均有最小运行旁证；不作为 design/28 开态全表验收。

首轮五个 runner 的 game 旧 936 键假设与写前已存在的 944 键不符；仅适配 runner 固定 SHA/计数，未改字符串。enhance/forge closed 的旧全树清单也补认可 shared 已有演武生成器的精确路径/固定 SHA，未复制至 wt/game。历史剥八键校验仍保留，两轮失败日志在 `attempts/`；最终均重跑通过。

## 三表与冻结 SHA

下列三表 shared 与 snapshot 均匹配目标 SHA；仅三次 cp，未全量 snapshot，未触及 art pending。

| 文件 | SHA-256 | 结果 |
|---|---|---|
| materials.json | 79c68429d763054ac1715467d1743575e179ecaecb2529e4b6ed7df137ef4052 | MATCH |
| items.json | f8b587634e5c9d43a475e85724aa34172e2945abda7654c2ef98fda07d1566f3 | MATCH |
| enhance_protect_charm.json | 0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772 | MATCH |

下列冻结值写前=写后；shared/wt 五表及 wt/game 两 Flag 分别核验：

| 文件 | SHA-256 | 结果 |
|---|---|---|
| enhance.json | d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954 | MATCH |
| recipes.json | 1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f | MATCH |
| strings_zh.json | d7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09 | MATCH |
| npcs.json | 2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6 | MATCH |
| life_skills.json | 204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b | MATCH |
| EnhanceOpenFlag.ts | d7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e | MATCH |
| ForgeOpenFlag.ts | 0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e | MATCH |

strings 仍 944 键；gifts 10×false；GAME_PHASE=5；EnhanceOpenFlag、ForgeOpenFlag 仍正式 true。game 旧数据快照字节保持。4,057 个保护文件、683 份旧 QA 文件与集合均无未授权差异。旧 formal_tips / formal_instance / formal_soft_open / open_fixture / closed QA 不变，待审 art pending、dist-test、V068/V069 等未纳入提交。

Codex 原日志：`/workspace/xiantu/logs/codex/c3576e037cb1901c_20261017_112303_1451537.log`；`qa/out_v06p1_enhance_protect_charm_closed/codex_launch.log` 为运行中日志仅引用。HANDOFF/RESULT/status UTF-8 同步 `/workspace/xiantu/reports/炼器阁/` 与 `/workspace/xiantu/status/炼器阁.md`。

未运行 snapshot/build/sync/release、未进包、未发版、未打 tag/推 Pages；两次普通 commit/push，无 force-push/reset --hard。

**无程序自检阻断。下一棒交执法 C01–C08；PASS 报 tip+out 后请负责人下开态夹具令。**
