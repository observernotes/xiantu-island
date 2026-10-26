# V0633_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.33/
- **master / tag^{}**：`a7a22300e2adaf9f06a6448e398854a7a53da8c9`（annotated tag `v0.6.33` → object `45deac99844a48637ff2176eb4d5ca753145e727`）
- **内容 tip（--from）**：`a7a22300e2adaf9f06a6448e398854a7a53da8c9`（青云 GSB v2 接入正式 `qingyun_village`；含于 master=`a7a22300`）
- **上一正式／docs tip**：`dfc4cbf46a51c3b63ff78e922a1fd5a9a3dd2e8c`（V0632_RELEASE Pages200 tip；ff 前 master）⊂ `--from`
- **分支 tip / origin**：发版 tip `a7a22300`（hotfix/qa 同＝master）；feat/qingyun-gsb-v2-integrate 普通快进合入
- **gh-pages**：`757641be8486d2516fbf9acbdade3ab3e79dafd6`（`8bfa3f0..757641b`）
- **本地包**：`releases/v0.6.33/` + `releases/v0.6.33_SHA256.json`（942 文件与 dist/ghp 一致；清单文件 SHA256 `573d7815cd6d8fc534239ff0787cd37445445b0948c4bff637d13e0efd45afa5`）
- **日志**：dry-run `qa/out/release_v0.6.33_20261027_015744_593226156.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `dfc4cbf4` → `a7a22300`）；首次实发因 master 缺 `node_modules/typescript` 预检停于 `…_015754_256069738.log`（EXIT 1；**未** `--skip-precheck`）；`npm ci` 后实发主日志 `qa/out/release_v0.6.33_20261027_015854_153345266.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 02:00 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 青云村 GSB v2 美术接入正式地图 | **进包**：`qingyun_village.gsbScene=qingyun_village_gsb_v2`／`gsbGeometryRevision=v2-final-001`；背景／可玩层／像素级 solids＋one-ways／绳梯对齐；非 GSB 地图（竹林等）路径不变 |
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
| 硬读旁证 | 执法 smoke PASS＠`a7a22300`：试走／碰撞／绳梯／切图正交／tsc／GSB 单测；OpenFlag×6／features／npcs vs v0.6.32 MATCH；gifts 10×false；`art/scenes/qingyun_village_gsb_v2/work/` **未清空**（仍 135 项） |

## 发前确认

- 发前手动 ff：`master` `dfc4cbf4` → `a7a22300`（含 GSB 接入 tip），**普通 push**；禁 force。
- `--from` 全长 `a7a22300e2adaf9f06a6448e398854a7a53da8c9` ⊂ master。
- 执法 out `qa/out_qingyun_gsb_v2_smoke_a7a22300/`／报告 `reports/执法堂/20261027_青云GSB_接入_smoke.md`：**PASS**＋tip **MATCH**。
- 炼器接入报告 `reports/炼器阁/20261027_青云GSB_接入正式地图.md`；负责人核 PASS 后 PM 令发美术小版本。
- dry-run 0 阻断后实发；未跳过 precheck（首次实发缺依赖→装依赖后重跑，仍走完整 precheck）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `a7a22300…`。
2. `git merge --ff-only feat/qingyun-gsb-v2-integrate` → `master`；普通 `git push origin master`。
3. `tools/release.sh v0.6.33 --from a7a22300e2adaf9f06a6448e398854a7a53da8c9 --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 02:00 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20。
- **未**清空 `art/scenes/qingyun_village_gsb_v2/work/`。
- **未**捆 sash/shoe／outfits png／阵法；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh。
- 本令只授权 **v0.6.33** 一次美术迭代小版本。
- **未** SendToUser／直推用户试玩链（交主程序短报经理；链由经理转负责人）。

## blocker

无（Pages 脚本内已 200＠02:00 Asia/Shanghai）。
