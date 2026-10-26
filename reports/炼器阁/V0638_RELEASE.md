# V0638_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.38/
- **master / tag^{}**：`1055f039cf6a6208a2538165786dcf8c3a44feb6`（annotated tag `v0.6.38` → object `bf49cbfb9948aa87d530a2dca1b9de481c358099`）
- **内容 tip（--from）**：`1055f039cf6a6208a2538165786dcf8c3a44feb6`（万妖林魔猿岭／古树心 GSB v1 接入正式 `wanyao_deep_1`／`wanyao_deep_2`；含于 master=`1055f039`；主提交 `d8ab3054`，tip 为其 docs 报告订正）
- **上一正式／docs tip**：`3cbe5aed3ec470c55436cb6cd2c8eaa9f8046c9d`（V0637 已发完 status）⊂ `--from`；发版内容基线亦含 `24b8e204`（V0637 tag^{}）
- **分支 tip / origin**：发版 tip `1055f039`（hotfix/qa 同＝master）；feat/wanyao-deep-gsb-v1-integrate 普通快进合入
- **gh-pages**：`04574bc3df1d748b8d2823d382ca5a580c8554df`（`9636f9c6..04574bc3`）
- **本地包**：`releases/v0.6.38/` + `releases/v0.6.38_SHA256.json`（982 文件与 dist/ghp 一致；清单文件 SHA256 `a6afaa8d847c322e3d37e1f7747924fec4e48514676b1de3da0da74490045521`）
- **日志**：dry-run `qa/out/release_v0.6.38_20261027_050114_773317122.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `3cbe5aed` → `1055f039`）；实发主日志 `qa/out/release_v0.6.38_20261027_050119_297591252.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 05:04 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 万妖林魔猿岭 GSB v1 美术接入正式地图 | **进包**：`wanyao_deep_1.gsbScene=wanyao_deep_1_gsb_v1`／`gsbGeometryRevision=deep1-final-001`；背景／可玩层／像素级 solids＋one-ways／绳梯对齐 |
| 万妖林古树心 GSB v1 美术接入正式地图 | **进包**：`wanyao_deep_2.gsbScene=wanyao_deep_2_gsb_v1`／`gsbGeometryRevision=wanyao-deep2-final-001`；同上 |
| 万妖林林缘／蛛网谷 GSB v1 | **保持**（已在 v0.6.37） |
| 郊野荒驿／筑基台 GSB v1 | **保持**（已在 v0.6.36） |
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
| 硬读旁证 | 执法 smoke PASS＠`1055f039`：试走／碰撞／绳梯／切图正交／tsc／GSB 单测；OpenFlag×6／features／npcs vs v0.6.37 MATCH；gifts 10×false；`art/scenes/wanyao_deep_1_gsb_v1/work/`（47 项）与 `wanyao_deep_2_gsb_v1/work/`（53 项）**未清空** |

## follow-up（建议级，不阻断本发）

- 两图 runtime oneWays 各较 scene-data 多 1（深1：12 vs 11；深2：8 vs 7）；后续 surfacesToBodies 可核对多出 one-way 来源。
- `wanyao_deep_1` scene-data 另有 3 ladder climbs（c_step*）未进正式图对象——运行时无梯子，不硬造。

## 发前确认

- 发前手动 ff：`master` `3cbe5aed` → `1055f039`（含万妖林 deep GSB 接入 tip），**普通 push**；禁 force。
- `--from` 全长 `1055f039cf6a6208a2538165786dcf8c3a44feb6` ⊂ master。
- 执法 out `qa/out_wanyao_deep_gsb_v1_smoke_1055f039/`／报告 `reports/执法堂/20261027_万妖林deepGSB_接入_smoke.md`：**PASS**＋tip **MATCH**。
- 炼器接入报告 `reports/炼器阁/20261027_万妖林魔猿岭GSB_接入正式地图.md`＋`20261027_万妖林古树心GSB_接入正式地图.md`；负责人核 PASS 后 PM 令发美术小版本。
- dry-run 0 阻断后实发；未跳过 precheck（本发依赖齐全，一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `1055f039…`。
2. `git merge --ff-only feat/wanyao-deep-gsb-v1-integrate` → `master`；普通 `git push origin master`。
3. `tools/release.sh v0.6.38 --from 1055f039cf6a6208a2538165786dcf8c3a44feb6 --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 05:04 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20。
- **未**清空 `art/scenes/wanyao_deep_1_gsb_v1/work/` 与 `wanyao_deep_2_gsb_v1/work/`。
- **未**捆 sash/shoe／outfits png／阵法；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh。
- 本令只授权 **v0.6.38** 一次美术迭代小版本。
- **未** SendToUser／直推用户试玩链（交主程序短报经理；链由经理转负责人）。

## blocker

无（Pages 脚本内已 200＠05:04 Asia/Shanghai）。
