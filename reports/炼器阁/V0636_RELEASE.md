# V0636_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.36/
- **master / tag^{}**：`3eec7b06143a96607ac739d7cf9ca667302e100d`（annotated tag `v0.6.36` → object `a6f9bf9700967da6e3d60a3babbf0ae07805e82a`）
- **内容 tip（--from）**：`3eec7b06143a96607ac739d7cf9ca667302e100d`（郊野荒驿／筑基台 GSB v1 接入正式 `luoxia_outskirts_2`／`trial_foundation_altar`；含于 master=`3eec7b06`；主提交 `e8700924`，tip 为其 docs status 订正）
- **上一正式／docs tip**：`1834ffa13a10c9b5d14faaa4f913cf1740e86fa3`（V0635 已发完 status）⊂ `--from`；发版内容基线亦含 `8b68ebd8`（V0635 tag^{}）
- **分支 tip / origin**：发版 tip `3eec7b06`（hotfix/qa 同＝master）；feat/luoxia-outskirts-2-altar-gsb-v1-integrate 普通快进合入
- **gh-pages**：`0e46617a3c1b06c68f3e095eab76bcf496d8dafe`（`6d39e11e..0e46617a`）
- **本地包**：`releases/v0.6.36/` + `releases/v0.6.36_SHA256.json`（966 文件与 dist/ghp 一致；清单文件 SHA256 `ca3b19c351cbb2ef4e4b8cd578d05d8b5810387037bca5b976629140c04ab1bf`）
- **日志**：dry-run `qa/out/release_v0.6.36_20261027_035159_311834146.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `1834ffa1` → `3eec7b06`）；实发主日志 `qa/out/release_v0.6.36_20261027_035202_867130788.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 03:53 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 郊野荒驿 GSB v1 美术接入正式地图 | **进包**：`luoxia_outskirts_2.gsbScene=luoxia_outskirts_2_gsb_v1`／`gsbGeometryRevision=luoxia2-final-001`；背景／可玩层／像素级 solids＋one-ways／绳梯对齐 |
| 筑基台 GSB v1 美术接入正式地图 | **进包**：`trial_foundation_altar.gsbScene=trial_foundation_altar_gsb_v1`／`gsbGeometryRevision=trial-foundation-final-001`；同上 |
| 落霞片区（稻田＋镇）GSB v1 | **保持**（已在 v0.6.35） |
| 竹林／灵溪 GSB v1 | **保持**（已在 v0.6.34） |
| 青云村 GSB v2 | **保持**（已在 v0.6.33） |
| 美术迭代小版本 | **是**（功能刀仍停；本发不合入新玩法） |
| design/50 巢穴日倍结算 soft | **保持**（已在 v0.6.32；`secret_daily_bonus=true`） |
| design/49 巢穴机缘三选一 soft | **保持**（已在 v0.6.31；`secret_boon_runtime=true`） |
| design/41–48 同行 AI 系列 soft | **保持**（已在 v0.6.23–30） |
| design/40 万妖巢穴／39 跳跃／38 夺宝 soft | **保持** |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁**（阵法归 v0.7） |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | 执法 smoke PASS＠`3eec7b06`：试走／碰撞／绳梯／切图正交／tsc／GSB 单测；OpenFlag×6／features／npcs vs v0.6.35 MATCH；gifts 10×false；`art/scenes/luoxia_outskirts_2_gsb_v1/work/`（58 项）与 `trial_foundation_altar_gsb_v1/work/`（84 项）**未清空** |

## 发前确认

- 发前手动 ff：`master` `1834ffa1` → `3eec7b06`（含郊野荒驿／筑基台 GSB 接入 tip），**普通 push**；禁 force。
- `--from` 全长 `3eec7b06143a96607ac739d7cf9ca667302e100d` ⊂ master。
- 执法 out `qa/out_luoxia_outskirts_2_altar_gsb_v1_smoke_3eec7b06/`／报告 `reports/执法堂/20261027_郊野荒驿筑基台GSB_接入_smoke.md`：**PASS**＋tip **MATCH**。
- 炼器接入报告 `reports/炼器阁/20261027_郊野荒驿GSB_接入正式地图.md`＋`20261027_筑基台GSB_接入正式地图.md`；负责人核 PASS 后 PM 令发美术小版本。
- dry-run 0 阻断后实发；未跳过 precheck（本发依赖齐全，一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `3eec7b06…`。
2. `git merge --ff-only feat/luoxia-outskirts-2-altar-gsb-v1-integrate` → `master`；普通 `git push origin master`。
3. `tools/release.sh v0.6.36 --from 3eec7b06143a96607ac739d7cf9ca667302e100d --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 03:53 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20。
- **未**清空 `art/scenes/luoxia_outskirts_2_gsb_v1/work/` 与 `trial_foundation_altar_gsb_v1/work/`。
- **未**捆 sash/shoe／outfits png／阵法；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh。
- 本令只授权 **v0.6.36** 一次美术迭代小版本。
- **未** SendToUser／直推用户试玩链（交主程序短报经理；链由经理转负责人）。

## blocker

无（Pages 脚本内已 200＠03:53 Asia/Shanghai）。
