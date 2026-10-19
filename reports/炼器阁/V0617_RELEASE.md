# V0617_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.17/
- **master / tag^{}**：`ea86c0f9c7ddde2f2a76ccc2078a8fadd18ed8f7`（annotated tag `v0.6.17` → object `05b641c686457b34257d9e7d808e032bb75b3186`）
- **内容 tip（--from）**：`0bd78a59c546438b6290b7b4e2f410886310e685`（soft-open Access 正式开＋证据位；含于 master=docs tip `ea86c0f`）
- **分支 tip / origin/dev**：`ea86c0f`（docs + spirit-rune soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`c4c1e4343ba8c6b7e482eb7de1aa90492e8b589d`（`ae757dd..c4c1e43`）
- **本地包**：`releases/v0.6.17/` + `releases/v0.6.17_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `f096a80dee986eb07d0ca88b33d50f2e9a2c7fb9f992239c36428e2239992af7`）
- **日志**：dry-run `qa/out/release_v0.6.17_20261019_124842_979810069.log`（**EXIT 0，0 阻断**；发前已将 master/dev 普通快进 `fad2be9` → `ea86c0f`）；实发主日志 `qa/out/release_v0.6.17_20261019_124846_994316198.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 12:50 Asia/Shanghai；URL.txt 记 12:50）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 灵纹祭炼 soft-open | **开放**：正式开默认 true；炼化／淬炼／锁／FX1–3／祭炼窗；`softOpenedSpiritRune:true` 进包 |
| SpiritRune OpenFlag 文件 | **无**（本发不新建任何 OpenFlag；Flag 名仅登记） |
| softOpenedSpiritRune | **true**（本发进包证据；≠ 运行时二次门禁） |
| released / newOpenFlag（发前证据位） | false / false |
| spirit_rune／materials／items／fly_zones | **未改** 四表 SHA：`cfdc93aede5345c1d9b8664f31b3283306ef3f54df3c7df2bf47a94b82555c88`／`1055536f181ae0a1f94d1a25e20473ea6f4be0b8289655dc4007c9c0295f6d4a`／`0ea68e4b289b07fadb5d81516efc4796a102c3dbe14f793158a83aa41dd4e8e0`／`2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| Market／Forge／Enhance／Enchant／Salvage／Tower | **保持 true**（六 Flag 未回翻） |
| softOpenedSustainFlight | **保持 true** |
| softOpenedMarketDepth | **保持 true** |
| softOpenedSmithServicesUi | **保持 true** |
| 飞行另枝 | **已销；禁捆本发包** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |

## 发前确认

- 发前手动 ff：`master`/`dev` `fad2be9` → `ea86c0f`（含 `0bd78a5`+docs），**普通 push**；禁 force。
- local/origin `dev`/`master`/`hotfix`/`qa` 均在 `ea86c0f`。
- dry-run 0 阻断后实发；未跳过 precheck。
- 发前清 master dirty（丢弃误改 items/materials 工作区；`spirit_rune.json` 未跟踪副本与 tip SHA 一致，ff 后由 tip 接管）。

## 流程

1. `tools/release.sh v0.6.17 --from 0bd78a59c546438b6290b7b4e2f410886310e685 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（12:50 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 SpiritRune／其它 OpenFlag；**未**改四表字节；**未**开 gifts；**未**混 #20/阵法/拍卖/坊市混窗；**未**捆飞行另枝。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- 本令只授权 **v0.6.17** 一次；销账可后置（`qa/out_v0617_close/`），不挡 Pages 汇报。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无（发前：master 工作区误改 items/materials 已 restore；未跟踪 spirit_rune.json 已移除后 ff）。
