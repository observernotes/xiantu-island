# 刷装灵纹 · soft-open · PASS（炼器）

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_刷装快感_灵纹_soft-open.md`  
> 核记：`reports/炼器阁/20261019_负责人核_3B复抽_spirit_rune_open.md`（VERIFY_PASS）  
> 明示例外：Codex 403／routing failed → **旁路直写**（不经 Sol；与坊市／飞行 soft 同）  
> **本刀 = soft-open only；≠ release ≠ 进包 ≠ Pages ≠ tag ≠ 新 OpenFlag ≠ 合 master**  
> 现网仍 **v0.6.16**。飞行销账另枝勿捆。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/spirit-rune-wire` |
| 基线产品 tip | `aa4b85872f2a425531dcad90d30cc92503b0e84b`（Gate 写路径补刀） |
| 基线 HEAD docs | `7a24b7c93a34c2f6176b37930daf3c22c05b6fc1`（open_ready） |
| soft-open tip | `0bd78a59c546438b6290b7b4e2f410886310e685`（短 `0bd78a5`） |
| worktree | `/workspace/xiantu/wt/feat/spirit-rune-wire` |

> 注：本文件若经后续 docs 补 SHA，以 `git rev-parse origin/feat/spirit-rune-wire` 与 status 为准。

## 2. 改动面（Access 正式开＋证据位）

| 路径 | 说明 |
|---|---|
| `src/SpiritRuneAccess.ts` | `softOpenedSpiritRune()`→**true**；`isSpiritRuneOpen()` 正式默认 **true**；仅 `__XT_SPIRIT_RUNE_OPEN__===false`（严格 false）关回；保留 `===true` 兼容；文件头注释同步 soft-open |
| `src/spirit-rune-closed.test.ts` | 关态前先注入严格 false；soft 期望 true；evidence `softOpenedSpiritRune:true`／`released:false`／`newOpenFlag:false` |
| `src/spirit-rune-open.test.ts` | 默认开＝true；soft＝true；O10 关回改 inject false（delete 不再关）；证据位 true |
| `scripts/spirit-rune-open-test.mjs` | 纳入自测 runner（既有本地稿；本刀随口径入库） |
| `package.json` | 加 `test:spirit-rune-open`（timeout 同 closed） |

**未改**：`SpiritRuneGate.ts` 三写业务规则／词条池／成本；四表字节；任何 `*SpiritRune*OpenFlag*`（**未新建**）；Enchant／Enhance／Forge／Market／Salvage／Tower OpenFlag；SMITH_SERVICES；飞行／maps；GAME_PHASE；gifts／阵法／洞府／本命胚。

对齐强化／附灵 soft-open：**正式开路径翻 true＋证据位 true**；对齐坊市／飞行：**无新 OpenFlag 文件**；证据位≠二次配表后门。

## 3. 硬门

| 项 | 结果 |
|---|---|
| softOpenedSpiritRune | **true** |
| released | **false** |
| newOpenFlag | **false** |
| SpiritRuneOpenFlag.ts | **未建** |
| spirit_rune SHA | **cfdc93aede5345c1d9b8664f31b3283306ef3f54df3c7df2bf47a94b82555c88** MATCH |
| materials SHA | **1055536f181ae0a1f94d1a25e20473ea6f4be0b8289655dc4007c9c0295f6d4a** MATCH |
| items SHA | **0ea68e4b289b07fadb5d81516efc4796a102c3dbe14f793158a83aa41dd4e8e0** MATCH |
| fly_zones SHA | **2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4** MATCH |
| ≠release≠进包≠Pages≠tag≠合 master | 本刀未跑 release.sh／未打 tag／未 Pages／未合 master |

## 4. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:spirit-rune-closed` | **PASS · 211**；softOpenedSpiritRune=true；newOpenFlag=false；SSR 注入 false 关回绿 |
| `npm run test:spirit-rune-open` | **PASS · 243**；O01–O10 全 PASS；soft=true；isSpiritRuneOpen_default=true；released=false |

## 5. 交回

【刷装灵纹 soft-open】tip@0bd78a5｜softOpenedSpiritRune=true｜released=false｜newOpenFlag=false｜表SHA仍 cfdc93ae…／1055536f…／0ea68e4b…／2940fe59…｜≠release≠Pages｜现网v0.6.16｜等执法 soft smoke（3B）
