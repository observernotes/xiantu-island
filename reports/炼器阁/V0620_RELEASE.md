# V0620_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.20/
- **master / tag^{}**：`437b67ea8b50ac51bb7e42c7b0068fc8d8a997fc`（annotated tag `v0.6.20` → object `c902773c001bdfa4e4dcdae96391e262366dd077`）
- **内容 tip（--from）**：`fb7c19c3cca2875341d75c0e1aab1d960f645085`（soft-open 交件；含于 master=docs tip `437b67e`）
- **业务 tip**：`957c6c3c64f66a58c8995c3f6b379db3a23228ac`（loot.seize＋生成器接线）⊂ soft tip ⊂ master
- **分支 tip / origin/dev**：`437b67e`（docs + 杀人夺宝 soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`20f1d51cb7622d7f961937b18b8e8bda3336a291`（`2ea0ecf..20f1d51`）
- **本地包**：`releases/v0.6.20/` + `releases/v0.6.20_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `cef5bcedbee7f730394ff275f09bbfb8960e3283a5db8b268b831569fef62f5d`）
- **日志**：dry-run `qa/out/release_v0.6.20_20261019_170730_515216227.log`（**EXIT 0，0 阻断**；发前已将 master/dev 普通快进 `7e8e4c6` → `437b67e`）；实发主日志 `qa/out/release_v0.6.20_20261019_170738_527664630.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 17:09 Asia/Shanghai；URL.txt 记 17:09）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/38 杀人夺宝 soft-open | **开放**：锚图≤2 随机散修／名号／t1·t2 可拾／一次 `loot.seize`／45s 再刷／黑袍与友善回归 |
| loot.seize | 「夺得随身之物。」**MATCH** |
| softOpenedSeize＊／SeizeOpenFlag | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| monsters／drops | **未改** 冻结 SHA：`4a6f9b4ec8d95b10f86ed46598775be4a294b9b2689d72f587ef323d07971521`／`72147189e2bec55a08b94fad8b54c2460b4ca65a85a52aac7f5b6f369d73f233` |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| softOpenedSpiritRune／SustainFlight／MarketDepth／SmithServicesUi／青钢 | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／design39 | **未捆**（另枝；本 release 不合入） |

## 发前确认

- 发前手动 ff：`master`/`dev` `7e8e4c6` → `437b67e`（含 soft tip `fb7c19c`+docs `437b67e`），**普通 push**；禁 force。
- soft tip 全长 `fb7c19c3cca2875341d75c0e1aab1d960f645085` ⊂ master；业务 tip `957c6c3…` ⊂ soft tip。
- 执法 out `qa/out_seize_rogue_soft_fb7c19c/` PASS：softOpenPreRelease=true／released=false／newOpenFlag=false／无 softOpenedSeize＊。
- dry-run 0 阻断后实发；未跳过 precheck。
- 发前清 master 未跟踪冲突（挪开会覆盖的 fly 核记工作区副本后 ff）。

## 流程

1. `tools/release.sh v0.6.20 --from fb7c19c3cca2875341d75c0e1aab1d960f645085 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（17:09 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Seize／其它 OpenFlag；**未**引入 softOpenedSeize＊；**未**改冻结 monsters／drops 字节。
- **未**捆 sash/shoe／outfits png／design39／阵法／gifts／#20。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- 本令只授权 **v0.6.20** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无。

