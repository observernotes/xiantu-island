# V0626_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.26/
- **master / tag^{}**：`b66a0041278aa35d08ca282c166299e9faceb293`（annotated tag `v0.6.26` → object `d8d86b7a5ee9461df2782319bd6283f88b49fcba`；其后 docs tip 另记）
- **内容 tip（--from）**：`e6edf8d56c6337df42b0a12431df362216cad5cb`（soft-open 交件；含于 master=`b66a004`）
- **业务 tip**：`b3595651c62c16b6db48ffcd9cf7ce90a95c0bae`（primary＋area＝whirl_sword；CD4000；w160·h80·behind32；prefer≥2；starve N＝2；budget同乘0.35；stay不放area；support锁）⊂ soft tip ⊂ master
- **分支 tip / origin**：发版 tip `b66a004`（hotfix/qa 同）；master 另有 V0626_RELEASE docs tip
- **gh-pages**：`ebce2c6a27092538f70eb4cf0fe86e8f91854bf8`（`6e5b5e3..ebce2c6`）
- **本地包**：`releases/v0.6.26/` + `releases/v0.6.26_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `2fd8ccd080f34766b811ce9ac4688685d8c5187b3a7865926a8b2f3ae6a68b21`）
- **日志**：dry-run `qa/out/release_v0.6.26_20261019_234410_591430146.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `d299c59` → `b66a004`）；实发主日志 `qa/out/release_v0.6.26_20261019_234413_968112453.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包 **成功**；脚本内 Pages 轮询 300s 超时 EXIT1；续轮询至 **HTTP 200** 后补 URL.txt）。未 `--skip-precheck`。
- **Pages**：续轮询 **HTTP 200**（2026-10-20 00:20 Asia/Shanghai；URL.txt 记 00:20）；`curl -sI` 亦 **200**；raw.githubusercontent 早于 github.io 已 200

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/44 同行 AI area 单技能 whirl_sword soft-open | **开放**：schedule＝primary＋area；area＝仅 whirl_sword；CD**4000**；rangeAlign **w160·h80·behind32**；prefer≥**2**；starve N＝**2**；budget 同乘 **0.35**；stay 不放 area；support 锁 |
| softOpenedCompanion＊／CompanionOpenFlag | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/43 同行 AI 主动解散入口 soft | **保持**（已在 v0.6.25；对话／面板≠KeyV；毁实体＋删关系；再邀 follow；stay≠解散） |
| design/42 同行 AI free＋stay＋KeyV soft | **保持**（已在 v0.6.24） |
| design/41 同行 AI follow soft | **保持**（已在 v0.6.23；primary 96／320／320＋CD1200＋engage240＋×0.35） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20；本刀零夺宝 diff） |
| design/39 跳跃方向与微操 soft | **保持**（已在 v0.6.21；本刀零跳跃 diff） |
| design/40 万妖巢穴 soft | **保持**（已在 v0.6.22；本刀零巢穴 diff） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | area＝whirl_sword／CD**4000**／w**160**·h**80**·behind**32**／N＝**2**／budget×**0.35**／stay不放area／support锁；41 follow96／320／320＋CD1200＋240×0.35；42 KeyV＋free／stay；43 dismiss≠KeyV；companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `d299c59` → `b66a004`（含业务 tip `b359565`＋soft tip `e6edf8d`＋docs `b66a004`），**普通 push**；禁 force。
- soft tip 全长 `e6edf8d56c6337df42b0a12431df362216cad5cb` ⊂ master；业务 tip `b359565…` ⊂ soft tip。
- 执法 out `qa/out_companion_area_soft_e6edf8d/` PASS：softOpenPreRelease=true／released=false／newOpenFlag=false／无 softOpenedCompanion＊／CompanionOpenFlag／硬读 area 钉齐／冻结 SHA MATCH。
- 负责人核 `reports/炼器阁/20261019_负责人核_同行AI_design44_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261019_负责人令_同行AI_design44_release_v0626.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.26 --from e6edf8d56c6337df42b0a12431df362216cad5cb --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；脚本内 Pages 300s 超时；续轮询至 **200** 后补 URL.txt（未重跑整段 release.sh／未 force／未改 tag）。
3. Pages：**HTTP 200**（2026-10-20 00:20 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Companion／其它 OpenFlag；**未**引入 softOpenedCompanion＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另枝。
- **未**开三技能整包／开 gifts／接 support。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）；Pages 超时后**未**重跑 release.sh。
- follow／free／stay／解散 保持（v0.6.23–25）；夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；巢穴保持（v0.6.22）；本令只授权 **v0.6.26** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无（Pages 延迟属 CDN／构建排队；raw 先 200，github.io 后续 200）。
