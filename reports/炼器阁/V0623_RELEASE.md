# V0623_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.23/
- **master / tag^{}**：`e6402346f33dcbcbe1aeb0b73f07e58133a38e28`（annotated tag `v0.6.23` → object `29b8f709d72a092f07746585d456843ac2b4f69e`）
- **内容 tip（--from）**：`6aa00aab73a7a3b708a4863be091d293459e206f`（soft-open 交件；含于 master=docs tip `e640234`）
- **业务 tip**：`1508298ee236b5a7bbc995f11070ed0b232b8c1a`（邀请→spawn＋follow／primary CD1200／engage240／伤害×0.35）⊂ soft tip ⊂ master
- **分支 tip / origin**：`e640234`（docs + design/41 同行 AI follow soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`250de584c906a00f433efeeee1d2ec22924baf08`（`dd6fd41..250de58`）
- **本地包**：`releases/v0.6.23/` + `releases/v0.6.23_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `946051120dc173dad45426b3e1dc4b487fd30b3da0b6c354b255ba07349a7493`）
- **日志**：dry-run `qa/out/release_v0.6.23_20261019_204646_010296841.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `1434c1e` → `e640234`）；实发主日志 `qa/out/release_v0.6.23_20261019_204649_073921191.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 20:48 Asia/Shanghai；URL.txt 记 20:48）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/41 同行 AI follow soft-open | **开放**：知交＋邀请成功 → spawn 1 苏师姐 follow 实体 → primary 合法伤害（×0.35）→ 切图／读档恰 1 实体；mode=follow only |
| softOpenedCompanion＊／CompanionOpenFlag | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20；本刀零夺宝 diff） |
| design/39 跳跃方向与微操 soft | **保持**（已在 v0.6.21；本刀零跳跃 diff） |
| design/40 万妖巢穴 soft | **保持**（已在 v0.6.22；本刀零巢穴 diff） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | follow／leash／aggro＝**96／320／320**；primary CD＝**1200**；engage w＝**240**；伤害×**0.35**；companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `1434c1e` → `e640234`（含 soft tip `6aa00aa`+docs `e640234`），**普通 push**；禁 force。
- soft tip 全长 `6aa00aab73a7a3b708a4863be091d293459e206f` ⊂ master；业务 tip `1508298…` ⊂ soft tip。
- 执法 out `qa/out_companion_follow_ai_soft_6aa00aa/` PASS：softOpenPreRelease=true／released=false／newOpenFlag=false／无 softOpenedCompanion＊／CompanionOpenFlag／硬读 96/320/320＋CD1200＋240＋0.35／冻结 SHA MATCH。
- 负责人核 `reports/炼器阁/20261019_负责人核_同行AI_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261019_负责人令_同行AI_release_v0623.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.23 --from 6aa00aab73a7a3b708a4863be091d293459e206f --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（20:48 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Companion／其它 OpenFlag；**未**引入 softOpenedCompanion＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另枝。
- **未**开三模式 UI／gifts。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- 夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；巢穴保持（v0.6.22）；本令只授权 **v0.6.23** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无。
