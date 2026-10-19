# V0619_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.19/
- **master / tag^{}**：`1e20179b3a0778f23b7be95524afd1686a1eab3b`（annotated tag `v0.6.19` → object `49a27f616132987644b8fdf1fabfe75af029cade`）
- **内容 tip（--from）**：`156d3bbf904d33d31d0d050dda8f5442fd7a57f8`（soft-open 交件／status；含于 master=docs tip `1e20179`）
- **业务 tip**：`31bd9bd61351676e2dc82b57a44f744ebb6c923f`（三键＋GameScene）⊂ soft tip ⊂ master
- **分支 tip / origin/dev**：`1e20179`（docs + fly sustain feedback soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`2ea0ecfe000eea3e2e238e05fc4f13038fd625ec`（`7b7f877..2ea0ecf`）
- **本地包**：`releases/v0.6.19/` + `releases/v0.6.19_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `7ce7b6a3d1728ad8f9335192d797b5257f296e3043414abf5fb48c71f419dde5`）
- **日志**：dry-run `qa/out/release_v0.6.19_20261019_153356_591508195.log`（**EXIT 0，0 阻断**；发前已将 master/dev 普通快进 `09ddf9b` → `1e20179`）；实发主日志 `qa/out/release_v0.6.19_20261019_153359_383351996.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 15:35 Asia/Shanghai；URL.txt 记 15:35）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/37 持续飞行进入／结束 tip 反馈 soft-open | **开放**：成功进入／主动落地／超时落地各一次 tip；复用既有飞行路径 |
| 三键文案 | 御剑升空。／御剑落地。／御剑力尽，缓缓落地。 |
| softOpenedFlyFeedback＊ | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| FlyFeedback OpenFlag 文件 | **无新建** |
| fly_zones | **未改** 冻结 SHA：`2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| ForgeOpenFlag | **保持 true**（SHA `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` 冻结） |
| recipes | **保持**（SHA `3182fff563b5f5f5341af79f64b93026c43ae45aaa1c6248e7f6276af6c38bfd`；青钢＋竹剑） |
| items／materials／enhance／spirit_rune | **未改** 冻结 SHA：`0ea68e4b…`／`1055536f…`／`d5b91a06…`／`cfdc93ae…` |
| Market／Forge／Enhance／Enchant／Salvage／Tower | **保持 true**（六 Flag 未回翻） |
| softOpenedSpiritRune | **保持 true** |
| softOpenedSustainFlight | **保持 true** |
| softOpenedMarketDepth | **保持 true** |
| softOpenedSmithServicesUi | **保持**（既有口径） |
| 第二 forge 青钢剑 soft-open | **保持**（v0.6.18 进包） |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits sash | **未捆**（另枝 `0ea8fad`／`76b5b25`；本 release 不合入） |

## 发前确认

- 发前手动 ff：`master`/`dev` `09ddf9b` → `1e20179`（含 `156d3bb`+docs `1e20179`），**普通 push**；禁 force。
- local/origin `dev`/`master`/`hotfix`/`qa` 均在 `1e20179`。
- dry-run 0 阻断后实发；未跳过 precheck。
- 发前清 master 未跟踪冲突（挪开会覆盖的 wire report 工作区副本后 ff）。

## 流程

1. `tools/release.sh v0.6.19 --from 156d3bbf904d33d31d0d050dda8f5442fd7a57f8 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（15:35 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 FlyFeedback／其它 OpenFlag；**未**引入 softOpenedFlyFeedback＊；**未**改 fly_zones／冲刺数值。
- **未**捆 sash/shoe（`0ea8fad`）与 outfits sash（`76b5b25`）。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- 本令只授权 **v0.6.19** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无。
