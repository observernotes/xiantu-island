# V0625_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.25/
- **master / tag^{}**：`8dddf80b78f824e061294b3785d8dc5103ca1937`（annotated tag `v0.6.25` → object `33a72efb27b44f9fe6e97aee18e8608d3ad17e60`）
- **内容 tip（--from）**：`95e555c841e28731ceb2bbab505ef1e16027e099`（soft-open 交件；含于 master=`8dddf80`）
- **业务 tip**：`dcf78c8099244bd718b0496e45ae25925a469597`（对话／面板解散≠KeyV；毁实体＋删 companionRelations[苏]；再邀 invite→follow；stay≠解散）⊂ soft tip ⊂ master
- **分支 tip / origin**：`8dddf80`（docs + design/43 同行 AI 主动解散入口 soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`6e5b5e31149f0a636e0e6ce2f323e8809b73403a`（`506f20d..6e5b5e3`）
- **本地包**：`releases/v0.6.25/` + `releases/v0.6.25_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `1727fc690b549146857fcd0a40101c9eb22157d5a8900b385576fa0160294f3e`）
- **日志**：dry-run `qa/out/release_v0.6.25_20261019_225030_954885370.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `047820c` → `8dddf80`）；实发主日志 `qa/out/release_v0.6.25_20261019_225034_727324108.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 22:52 Asia/Shanghai；URL.txt 记 22:52）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/43 同行 AI 主动解散入口 soft-open | **开放**：对话／面板单入口（≠KeyV）→ `requestCompanionDismiss`／`dismissCompanionRelation` → 毁实体＋删 `companionRelations[苏]` 整键；再邀既有 invite→follow 恰 1；stay≠解散；切图 SHUTDOWN＝毁实例保关系＋mode |
| softOpenedCompanion＊／CompanionOpenFlag | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/42 同行 AI free＋stay＋KeyV soft | **保持**（已在 v0.6.24；KeyV 循环 follow→free→stay；free＝aggro320／engage240；stay 零伤≠无敌） |
| design/41 同行 AI follow soft | **保持**（已在 v0.6.23；切回 follow＝96/320/320＋CD1200＋240＋×0.35） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20；本刀零夺宝 diff） |
| design/39 跳跃方向与微操 soft | **保持**（已在 v0.6.21；本刀零跳跃 diff） |
| design/40 万妖巢穴 soft | **保持**（已在 v0.6.22；本刀零巢穴 diff） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | 对话／面板≠KeyV；stay≠解散；再邀 follow；KeyV＋free＝aggro**320**／engage**240**；stay＝零伤停手≠无敌；切回 follow／leash／aggro＝**96／320／320**；primary CD＝**1200**；engage w＝**240**；伤害×**0.35**；companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `047820c` → `8dddf80`（含 soft tip `95e555c`+docs `8dddf80`），**普通 push**；禁 force。
- soft tip 全长 `95e555c841e28731ceb2bbab505ef1e16027e099` ⊂ master；业务 tip `dcf78c8…` ⊂ soft tip。
- 执法 out `qa/out_companion_dismiss_soft_95e555c/` PASS：softOpenPreRelease=true／released=false／newOpenFlag=false／无 softOpenedCompanion＊／CompanionOpenFlag／硬读 对话／面板≠KeyV＋stay≠解散＋再邀 follow＋KeyV 三态未漂／冻结 SHA MATCH。
- 负责人核 `reports/炼器阁/20261019_负责人核_同行AI_design43_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261019_负责人令_同行AI_design43_release_v0625.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.25 --from 95e555c841e28731ceb2bbab505ef1e16027e099 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（22:52 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Companion／其它 OpenFlag；**未**引入 softOpenedCompanion＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另枝。
- **未**开三技能整包／开 gifts。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- follow／free／stay 保持（v0.6.23／v0.6.24）；夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；巢穴保持（v0.6.22）；本令只授权 **v0.6.25** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无。
