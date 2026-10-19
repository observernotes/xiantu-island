# V0618_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.18/
- **master / tag^{}**：`e6bff92d3892893e30df0918c99be5262087052a`（annotated tag `v0.6.18` → object `e69d687a143e0542657c7e96fab75a28c936f9f7`）
- **内容 tip（--from）**：`4415c06c8d7e1792c9ae089617a00bc468267a6b`（soft-open 交件／status；含于 master=docs tip `e6bff92`）
- **分支 tip / origin/dev**：`e6bff92`（docs + 第二 forge 青钢剑 soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`7b7f877d66019083e4c87701e3b35eb5efffd831`（`c4c1e43..7b7f877`）
- **本地包**：`releases/v0.6.18/` + `releases/v0.6.18_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `50a0c3e57977407e4106d2cf0a8e0ed300a5354746bf817f510b85163887bcdb`）
- **日志**：dry-run `qa/out/release_v0.6.18_20261019_135910_436669750.log`（**EXIT 0，0 阻断**；发前已将 master/dev 普通快进 `fd583d2` → `e6bff92`）；实发主日志 `qa/out/release_v0.6.18_20261019_135914_427375447.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 14:00 Asia/Shanghai；URL.txt 记 14:00）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 第二 forge 青钢剑 soft-open | **开放**：正式开路径复用 ForgeOpenFlag；材料消歧锻出青钢；recipes 含青钢行（forge=2） |
| softOpenedAzure＊ | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| Forge／Azure OpenFlag 文件 | **无新建**（复用既有 ForgeOpenFlag；Flag 名仅登记） |
| ForgeOpenFlag | **保持 true**（SHA `0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e` 冻结；禁改字节） |
| recipes | **进包已落定值**（SHA `3182fff563b5f5f5341af79f64b93026c43ae45aaa1c6248e7f6276af6c38bfd`；forge=2；青钢＋竹剑；禁再改数值） |
| items／materials／enhance／fly_zones／spirit_rune | **未改** 冻结 SHA：`0ea68e4b289b07fadb5d81516efc4796a102c3dbe14f793158a83aa41dd4e8e0`／`1055536f181ae0a1f94d1a25e20473ea6f4be0b8289655dc4007c9c0295f6d4a`／`d5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954`／`2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4`／`cfdc93aede5345c1d9b8664f31b3283306ef3f54df3c7df2bf47a94b82555c88` |
| Market／Forge／Enhance／Enchant／Salvage／Tower | **保持 true**（六 Flag 未回翻） |
| softOpenedSpiritRune | **保持 true** |
| softOpenedSustainFlight | **保持 true** |
| softOpenedMarketDepth | **保持 true** |
| softOpenedSmithServicesUi | **保持**（既有口径） |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |

## 发前确认

- 发前手动 ff：`master`/`dev` `fd583d2` → `e6bff92`（含 `4415c06`+docs），**普通 push**；禁 force。
- local/origin `dev`/`master`/`hotfix`/`qa` 均在 `e6bff92`。
- dry-run 0 阻断后实发；未跳过 precheck。
- 发前清 master dirty（restore 误改 `data/balance/recipes.json` 工作区；ff 后由 tip 接管，SHA=`3182fff5…`）。

## 流程

1. `tools/release.sh v0.6.18 --from 4415c06c8d7e1792c9ae089617a00bc468267a6b --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（14:00 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Azure／ForgeAzure／其它 OpenFlag；**未**引入 softOpenedAzure＊；**未**改冻结表字节；**未**改 recipes 已落定值；**未**开 gifts；**未**混 #20/阵法/拍卖/坊市混窗。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- 本令只授权 **v0.6.18** 一次；销账可后置（`qa/out_v0618_close/`），不挡 Pages 汇报。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无（发前：master 工作区误改 recipes 已 restore 后 ff）。
