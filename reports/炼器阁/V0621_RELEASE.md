# V0621_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.21/
- **master / tag^{}**：`7b61b3cf4a226f42035ef7844ae24958c88cdad0`（annotated tag `v0.6.21` → object `71decbdc0d6774be8a08ad1089914fba4bc8f6c1`）
- **内容 tip（--from）**：`4ba9ffdbdc7259c7ea6408e31b87671667f717fc`（soft-open 交件；含于 master=docs tip `7b61b3c`）
- **业务 tip**：`412138128a596f43a7b736342aaa0de4d1c3604f`（airAccel=700＋dir 二段跳）⊂ soft tip ⊂ master
- **分支 tip / origin/dev**：`7b61b3c`（docs + design/39 跳跃 soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`445ec3624b1f0341665a692bbca1e88be7725afb`（`20f1d51..445ec36`）
- **本地包**：`releases/v0.6.21/` + `releases/v0.6.21_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `45857e644689d2f6d3e623896fa664262bfcd827f3b191677c88278202cc559f`）
- **日志**：dry-run `qa/out/release_v0.6.21_20261019_175514_470535215.log`（**EXIT 0，0 阻断**；发前已将 master/dev 普通快进 `7ae82de` → `7b61b3c`）；实发主日志 `qa/out/release_v0.6.21_20261019_175516_912004100.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 17:57 Asia/Shanghai；URL.txt 记 17:57）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/39 跳跃方向与微操 soft-open | **开放**：有向二段跳 `dir×doubleJumpVx`；无向纯竖；空中 approach 微操；`airAccel=700`／`doubleJumpVx=330`／`airMaxSpeed=130` |
| softOpenedJump＊／JumpOpenFlag | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20；本刀零夺宝 diff） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |

## 发前确认

- 发前手动 ff：`master`/`dev` `7ae82de` → `7b61b3c`（含 soft tip `4ba9ffd`+docs `7b61b3c`），**普通 push**；禁 force。
- soft tip 全长 `4ba9ffdbdc7259c7ea6408e31b87671667f717fc` ⊂ master；业务 tip `4121381…` ⊂ soft tip。
- 执法 out `qa/out_jump_dir_micro_soft_4ba9ffd/` PASS：softOpenPreRelease=true／released=false／newOpenFlag=false／无 softOpenedJump＊／airAccel=700／330／130。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.21 --from 4ba9ffdbdc7259c7ea6408e31b87671667f717fc --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（17:57 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Jump／其它 OpenFlag；**未**引入 softOpenedJump＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- 夺宝保持（v0.6.20）；本令只授权 **v0.6.21** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无。
