# 第二 forge 青钢剑 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 13:46 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_第二forge青钢剑_soft-open.md`  
> 核记：`reports/炼器阁/20261019_负责人核_3B_第二forge青钢剑_open.md`（VERIFY_PASS）  
> 明示例外：Codex 403／routing failed → **旁路直写**（不经 Sol；与坊市／飞行／灵纹 soft 同）  
> **本刀 = soft-open 交件 only；≠ release ≠ 进包 ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master**  
> 现网仍 **v0.6.17**。飞行／灵纹／坊市 soft **保持**——本刀未改 fly_zones／spirit_rune／market_consign。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/forge-azure-steel-wire` |
| 业务基线 tip | `a5e5d48cba584d953c6af1c43a653ad152b6ff6f`（短 `a5e5d48`；2B 接线） |
| 基线 HEAD docs | `27a6267a11db6ff7447ec13e069a7241e225dc48`（3A open_ready 零补刀） |
| soft-open tip | `4415c06c8d7e1792c9ae089617a00bc468267a6b`（短 `4415c06`） |
| worktree | `/workspace/xiantu/wt/feat/forge-azure-steel-wire` |

> 注：本文件若经后续 docs 补 SHA，以 `git rev-parse origin/feat/forge-azure-steel-wire` 与 status 为准。

## 2. 改动面（仅交件／status／测口径 · **无** softOpenedAzure＊）

| 路径 | 说明 |
|---|---|
| `scripts/forge-azure-steel-wire-test.mjs` | evidence／日志标 `softOpenPreRelease:true`／`released:false`／`newOpenFlag:false`／`businessTip=a5e5d48…`；**无** softOpenedAzure＊ |
| `src/forge-azure-steel-wire.test.ts` | 图结果证据同翻（仅返回字段；**无** softOpenedAzure＊ 符号） |
| `reports/炼器阁/20261019_第二forge青钢剑_soft_open.md` | 本报告 |
| `status/炼器阁.md` | soft-open 可发版前态 |

**未改**：`src/ForgeOpenFlag.ts`（字节保持）；`ForgeGate`／`Progress` 消歧业务码；recipes／items／materials／enhance／fly_zones／spirit_rune 任意字节；任何 `*Azure*OpenFlag*`（**未新建**）；Enchant／Enhance／Market／Salvage／Tower OpenFlag；GAME_PHASE；gifts／阵法／洞府／本命胚。

**与坊市／飞行 soft-open 的差异（对齐令文／design/36）**：本刀**不**引入 `softOpenedAzure＊`／`softOpenedForgeAzure＊` 源码位；**复用**既有 `ForgeOpenFlag`／`isForgeOpenForFixture()`（正式路径**已**恒 true——仅确认进包证据，**不**改 Flag 字节）。证据＝HANDOFF／RESULT／status／soft smoke evidence 口径同步；**≠** 二次配表后门／新 Flag 文件／ENV 对抗门禁。

## 3. 硬门

| 项 | 结果 |
|---|---|
| softOpenedAzure＊／softOpenedForgeAzure＊ | **未引入**（源码／测断言均无该符号） |
| softOpenPreRelease（测／报告口径） | **true**（soft-open **可发版前态**） |
| released | **false** |
| newOpenFlag | **false** |
| AzureSteelOpenFlag／ForgeAzureOpenFlag | **未建** |
| ForgeOpenFlag.ts SHA | **`0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` MATCH** |
| recipes SHA | **`3182fff563b5f5f5341af79f64b93026c43ae45aaa1c6248e7f6276af6c38bfd` MATCH** |
| items／materials／enhance／fly_zones／spirit_rune | 全 MATCH（`0ea68e4b…`／`1055536f…`／`d5b91a06…`／`2940fe59…`／`cfdc93ae…`） |
| 青钢成功通路旁证 | tip@`a5e5d48`（evidence `businessTip`） |
| ≠release≠进包≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS**（见 commit 前复跑） |
| `npm run test:forge-azure-steel-wire` | **PASS**：open≈**29**／closed≈**14**；softOpenPreRelease=true；released=false；newOpenFlag=false；ForgeOpenFlag／recipes SHA MATCH |

## 5. 交回

【第二forge青钢剑 soft-open】tip@4415c06｜softOpenPreRelease=true｜released=false｜newOpenFlag=false｜无softOpenedAzure＊｜ForgeOpenFlag=0ce03554…MATCH｜recipesSHA仍3182fff5…｜≠release≠Pages｜现网v0.6.17｜等执法 soft smoke（3B）
