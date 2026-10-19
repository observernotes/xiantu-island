# V0624_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.24/
- **master / tag^{}**：`84526c11b04fee124e5fba334d0df8cdd6b02c0f`（annotated tag `v0.6.24` → object `d34766ba4bf4cdd67f96d5db81cda0f72af69b09`）
- **内容 tip（--from）**：`84e6b4253a50b4e27537158c7e64cb68a5142833`（soft-open 交件；含于 master=`84526c1`）
- **业务 tip**：`da77e4a2c60671d4981363eb4b9c5cc7e7b7eaa7`（KeyV 循环 follow→free→stay；free aggro320／engage240；stay 零伤停手≠无敌；切回 follow 96/320/320＋CD1200＋240＋×0.35）⊂ soft tip ⊂ master
- **分支 tip / origin**：`84526c1`（docs + design/42 同行 AI free＋stay soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`506f20d540dc2bb0edf3f4f9c8f0ecfbd7bd8d04`（`250de58..506f20d`）
- **本地包**：`releases/v0.6.24/` + `releases/v0.6.24_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `665e7f177d618ee15ef36cb17486ae2811023724cee63705819227fa0ba72059`）
- **日志**：dry-run `qa/out/release_v0.6.24_20261019_215426_305132429.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `d012f27` → `84526c1`）；实发主日志 `qa/out/release_v0.6.24_20261019_215431_457584464.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 21:56 Asia/Shanghai；URL.txt 记 21:56）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/42 同行 AI free＋stay＋KeyV soft-open | **开放**：知交＋邀请后 KeyV 循环 follow→free→stay；free＝aggro320／engage240×48／无 leash 瞬移／仅 primary；stay＝零伤停手≠无敌；切回 follow 硬读回归；mode 保留切图／读档 |
| softOpenedCompanion＊／CompanionOpenFlag | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/41 同行 AI follow soft | **保持**（已在 v0.6.23；切回 follow＝96/320/320＋CD1200＋240＋×0.35） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20；本刀零夺宝 diff） |
| design/39 跳跃方向与微操 soft | **保持**（已在 v0.6.21；本刀零跳跃 diff） |
| design/40 万妖巢穴 soft | **保持**（已在 v0.6.22；本刀零巢穴 diff） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | KeyV＋free＝aggro**320**／engage**240**；stay＝零伤停手≠无敌；切回 follow／leash／aggro＝**96／320／320**；primary CD＝**1200**；engage w＝**240**；伤害×**0.35**；companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `d012f27` → `84526c1`（含 soft tip `84e6b42`+docs `84526c1`），**普通 push**；禁 force。
- soft tip 全长 `84e6b4253a50b4e27537158c7e64cb68a5142833` ⊂ master；业务 tip `da77e4a…` ⊂ soft tip。
- 执法 out `qa/out_companion_modes_free_stay_soft_84e6b42/` PASS：softOpenPreRelease=true／released=false／newOpenFlag=false／无 softOpenedCompanion＊／CompanionOpenFlag／硬读 KeyV＋free320/240＋stay零伤＋切回96/320/320＋CD1200＋240＋0.35／冻结 SHA MATCH。
- 负责人核 `reports/炼器阁/20261019_负责人核_同行AI_design42_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261019_负责人令_同行AI_design42_release_v0624.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.24 --from 84e6b4253a50b4e27537158c7e64cb68a5142833 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（21:56 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Companion／其它 OpenFlag；**未**引入 softOpenedCompanion＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另枝。
- **未**开三技能整包／开 gifts。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- follow 保持（v0.6.23）；夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；巢穴保持（v0.6.22）；本令只授权 **v0.6.24** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无。
