# V0622_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.22/
- **master / tag^{}**：`1dda24a60e4edda47fdbb79d6c28938a6388346d`（annotated tag `v0.6.22` → object `a665cd325f1f4ba73c75103eb67b0d51c4d58936`）
- **内容 tip（--from）**：`92063f9448f699746b6176ef37223b8138148fda`（soft-open 交件；含于 master=docs tip `1dda24a`）
- **业务 tip**：`706b0ebc990f6bed46023f7209246ba06eed3ea9`（start／清房／exit／reward 12·20／slots 2/1／levelClip[30,34]）⊂ soft tip ⊂ master
- **分支 tip / origin/dev**：`1dda24a`（docs + design/40 万妖巢穴 soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`dd6fd410db65b6e54791964e80d48e2d90033172`（`445ec36..dd6fd41`）
- **本地包**：`releases/v0.6.22/` + `releases/v0.6.22_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `7dc30199876e5625b06d3d56385e62e756349232dfe988ef4d6bdb6418b2d4aa`）
- **日志**：dry-run `qa/out/release_v0.6.22_20261019_195957_989851759.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `3dba307` → `1dda24a`）；实发主日志 `qa/out/release_v0.6.22_20261019_200002_281635427.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 轮询 **成功**；**EXIT 0／Pages 200**）。未 `--skip-precheck`。
- **Pages**：轮询 **HTTP 200**（2026-10-19 20:02 Asia/Shanghai；URL.txt 记 20:02）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/40 万妖巢穴最小可玩闭环 soft-open | **开放**：资格满足后 `startSecretNest` → `combat_01`（slots 2/1）可清 → exit＋`rewardSecretNest` exp12／stones20；theme=`wanyao_nest`；levelClip[30,34] |
| softOpenedNest＊／NestOpenFlag | **无**（本发不引入；证据口径＝softOpenPreRelease 交件／status） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20；本刀零夺宝 diff） |
| design/39 跳跃方向与微操 soft | **保持**（已在 v0.6.21；本刀零跳跃 diff） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |

## 发前确认

- 发前手动 ff：`master` `3dba307` → `1dda24a`（含 soft tip `92063f9`+docs `1dda24a`），**普通 push**；禁 force。
- soft tip 全长 `92063f9448f699746b6176ef37223b8138148fda` ⊂ master；业务 tip `706b0eb…` ⊂ soft tip。
- 执法 out `qa/out_secret_nest_min_loop_soft_92063f9/` PASS：softOpenPreRelease=true／released=false／newOpenFlag=false／无 softOpenedNest＊／NestOpenFlag／硬读 2/1＋12/20＋[30,34]／冻结 SHA MATCH。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.22 --from 92063f9448f699746b6176ef37223b8138148fda --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 轮询 **200**。
3. Pages：**HTTP 200**（20:02 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Nest／其它 OpenFlag；**未**引入 softOpenedNest＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃另枝。
- **未**开 secret_loot／日倍／boon 全量。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- 夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；本令只授权 **v0.6.22** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无。
