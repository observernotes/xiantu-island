# V0635_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.35/
- **master / tag^{}**：`8b68ebd8ad433be445d7d98539e5a46019f35b03`（annotated tag `v0.6.35` → object `d3e79a021db3ead32f3bc1ecfaeea50e9fd94c33`）
- **内容 tip（--from）**：`8b68ebd8ad433be445d7d98539e5a46019f35b03`（郊野稻田／落霞镇 GSB v1 接入正式 `luoxia_outskirts_1`／`luoxia_town`；含于 master=`8b68ebd8`）
- **上一正式／docs tip**：`6bbcc7f443f86bc824f4775881499ad21160b98d`（V0634_RELEASE Pages200 tip；ff 前 master）⊂ `--from`
- **分支 tip / origin**：发版 tip `8b68ebd8`（hotfix/qa 同＝master）；feat/luoxia-outskirts-1-gsb-v1-integrate 普通快进合入
- **gh-pages**：`6d39e11e672ed45e9baaa3e9dd5e0f5d066a8922`（`a1ef680f..6d39e11e`）
- **本地包**：`releases/v0.6.35/` + `releases/v0.6.35_SHA256.json`（958 文件与 dist/ghp 一致；清单文件 SHA256 `2ca61f1873f6425be3f09afcf263f869b3dc6f0189748729936755aa0de73192`）
- **日志**：dry-run `qa/out/release_v0.6.35_20261027_031619_414915035.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `6bbcc7f4` → `8b68ebd8`）；实发主日志 `qa/out/release_v0.6.35_20261027_031624_260995393.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 03:18 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 郊野稻田 GSB v1 美术接入正式地图 | **进包**：`luoxia_outskirts_1.gsbScene=luoxia_outskirts_1_gsb_v1`／`gsbGeometryRevision=outskirts1-final-001`；背景／可玩层／像素级 solids＋one-ways／绳梯对齐 |
| 落霞镇 GSB v1 美术接入正式地图 | **进包**：`luoxia_town.gsbScene=luoxia_town_gsb_v1`／`gsbGeometryRevision=luoxia-final-001`；同上 |
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
| 硬读旁证 | 执法 smoke PASS＠`8b68ebd8`：试走／碰撞／绳梯／切图正交／tsc／GSB 单测；OpenFlag×6／features／npcs vs v0.6.34 MATCH；gifts 10×false；`art/scenes/luoxia_outskirts_1_gsb_v1/work/`（62 项）与 `luoxia_town_gsb_v1/work/`（99 项）**未清空** |

## 发前确认

- 发前手动 ff：`master` `6bbcc7f4` → `8b68ebd8`（含郊野稻田／落霞镇 GSB 接入 tip），**普通 push**；禁 force。
- `--from` 全长 `8b68ebd8ad433be445d7d98539e5a46019f35b03` ⊂ master。
- 执法 out `qa/out_luoxia_gsb_v1_smoke_8b68ebd8/`／报告 `reports/执法堂/20261027_落霞片区GSB_接入_smoke.md`：**PASS**＋tip **MATCH**。
- 炼器接入报告 `reports/炼器阁/20261027_郊野稻田GSB_接入正式地图.md`＋`20261027_落霞镇GSB_接入正式地图.md`；负责人核 PASS 后 PM 令发美术小版本。
- dry-run 0 阻断后实发；未跳过 precheck（本发依赖齐全，一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `8b68ebd8…`。
2. `git merge --ff-only feat/luoxia-outskirts-1-gsb-v1-integrate` → `master`；普通 `git push origin master`。
3. `tools/release.sh v0.6.35 --from 8b68ebd8ad433be445d7d98539e5a46019f35b03 --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 03:18 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20。
- **未**清空 `art/scenes/luoxia_outskirts_1_gsb_v1/work/` 与 `luoxia_town_gsb_v1/work/`。
- **未**捆 sash/shoe／outfits png／阵法；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh。
- 本令只授权 **v0.6.35** 一次美术迭代小版本。
- **未** SendToUser／直推用户试玩链（交主程序短报经理；链由经理转负责人）。

## blocker

无（Pages 脚本内已 200＠03:18 Asia/Shanghai）。
