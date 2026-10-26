# V0634_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.34/
- **master / tag^{}**：`bba4c901abb1d4d2435eb2537696bfa71252600e`（annotated tag `v0.6.34` → object `8dc41af10d960d79a2369f6b0039c6e7f1cf2955`）
- **内容 tip（--from）**：`bba4c901abb1d4d2435eb2537696bfa71252600e`（竹林／灵溪 GSB v1 接入正式 `bamboo_forest`／`lingxi_path`；含于 master=`bba4c901`）
- **上一正式／docs tip**：`9538c17942bee4990f46eeb3c1dd8de52b7e3f1c`（V0633_RELEASE Pages200 tip；ff 前 master）⊂ `--from`
- **分支 tip / origin**：发版 tip `bba4c901`（hotfix/qa 同＝master）；feat/bamboo-lingxi-gsb-v1-integrate 普通快进合入
- **gh-pages**：`a1ef680f90da8afe3fee05498558e36281ed6dc5`（`757641be..a1ef680f`）
- **本地包**：`releases/v0.6.34/` + `releases/v0.6.34_SHA256.json`（950 文件与 dist/ghp 一致；清单文件 SHA256 `f489fd733d0ab9e998dd3a193b2afb3dd2d03a4d376c738da904ef8da593d487`）
- **日志**：dry-run `qa/out/release_v0.6.34_20261027_023555_447938984.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `9538c179` → `bba4c901`）；实发主日志 `qa/out/release_v0.6.34_20261027_023600_869297997.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 02:38 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 竹林 GSB v1 美术接入正式地图 | **进包**：`bamboo_forest.gsbScene=bamboo_forest_gsb_v1`／`gsbGeometryRevision=bamboo-final-001`；背景／可玩层／像素级 solids＋one-ways／绳梯对齐 |
| 灵溪 GSB v1 美术接入正式地图 | **进包**：`lingxi_path.gsbScene=lingxi_path_gsb_v1`／`gsbGeometryRevision=lingxi-final-001`；同上 |
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
| 硬读旁证 | 执法 smoke PASS＠`bba4c901`：试走／碰撞／绳梯／切图正交／tsc／GSB 单测；OpenFlag×6／features／npcs vs v0.6.33 MATCH；gifts 10×false；`art/scenes/bamboo_forest_gsb_v1/work/`（92 项）与 `lingxi_path_gsb_v1/work/`（72 项）**未清空** |

## 发前确认

- 发前手动 ff：`master` `9538c179` → `bba4c901`（含竹林／灵溪 GSB 接入 tip），**普通 push**；禁 force。
- `--from` 全长 `bba4c901abb1d4d2435eb2537696bfa71252600e` ⊂ master。
- 执法 out `qa/out_bamboo_lingxi_gsb_v1_smoke_bba4c901/`／报告 `reports/执法堂/20261027_竹林灵溪GSB_接入_smoke.md`：**PASS**＋tip **MATCH**。
- 炼器接入报告 `reports/炼器阁/20261027_竹林灵溪GSB_接入正式地图.md`；负责人核 PASS 后 PM 令发美术小版本。
- dry-run 0 阻断后实发；未跳过 precheck（本发依赖齐全，一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `bba4c901…`。
2. `git merge --ff-only feat/bamboo-lingxi-gsb-v1-integrate` → `master`；普通 `git push origin master`。
3. `tools/release.sh v0.6.34 --from bba4c901abb1d4d2435eb2537696bfa71252600e --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 02:38 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20。
- **未**清空 `art/scenes/bamboo_forest_gsb_v1/work/` 与 `lingxi_path_gsb_v1/work/`。
- **未**捆 sash/shoe／outfits png／阵法；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh。
- 本令只授权 **v0.6.34** 一次美术迭代小版本。
- **未** SendToUser／直推用户试玩链（交主程序短报经理；链由经理转负责人）。

## blocker

无（Pages 脚本内已 200＠02:38 Asia/Shanghai）。
