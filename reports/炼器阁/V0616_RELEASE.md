# V0616_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.16/
- **master / tag^{}**：`360391757f7b5140fc9af0857985f797788cc543`（annotated tag `v0.6.16` → object `45f970a0e959101b5c8ee98156560d32927b5dfe`）
- **内容 tip（--from）**：`8341e6e2db33076e8997a81333381e6cbc424fdc`（soft-open sustain flight evidence bit；含于 master=docs tip `3603917`）
- **分支 tip / origin/dev**：`3603917`（docs + sustain-flight soft-open；hotfix/qa/master 同 tip）
- **gh-pages**：`ae757dd8d33eca5f4cb4a1cf2c3c0ccf592001a4`（`ace1217..ae757dd`）
- **本地包**：`releases/v0.6.16/` + `releases/v0.6.16_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `65704d4ced95464d9d5d376d8726c62fad4d1a897215a2cfcacdc847c53ce3dd`）
- **日志**：dry-run 首轮 `qa/out/release_v0.6.16_20261019_114645_153425105.log`（1 阻断：master 未跟踪 V0615_RELEASE.md → 已移出／shared 已有同内容）；dry-run 次轮 `…114649_458972469.log`（**EXIT 0，0 阻断**；发前已将 master/dev 普通快进 `25ecaad` → `3603917`）；实发主日志 `…114651_947839649.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包 **成功**；Pages 轮询中途被中断 → 手工补轮询首轮即 **HTTP 200**，已记 `releases/URL.txt`；**整体等价 EXIT 0／Pages 200**）。发前 master 缺 `node_modules/typescript`，已 `npm ci` 后实发（未 `--skip-precheck`）。
- **Pages**：手工轮询 **HTTP 200**（2026-10-19 11:48 Asia/Shanghai；URL.txt 记 11:48）；`curl -sI` 亦 **200**

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 场景持续飞行 soft-open | **开放**：飞区成功进入／维持／结束／击落／禁攻／冲刺隔离；五图 flyZone；`softOpenedSustainFlight:true` 进包 |
| SustainFlight／Flight OpenFlag | **无**（本发不新建任何 OpenFlag） |
| softOpenedSustainFlight | **true**（本发进包证据；≠ 运行时二次门禁） |
| released / newOpenFlag（发前证据位） | false / false |
| fly_zones 整表 | **未改** `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| 五图 flyZone | **各 ≥1**（wanyao_deep_1/2、chiyan_core、chiyan_slope_1/2） |
| Market／Forge／Enhance／Enchant／Salvage／Tower | **保持 true**（六 Flag 未回翻） |
| 坊市纵深 soft-open | **保持**（`softOpenedMarketDepth:true`） |
| 完整炼器服务 UI soft-open | **保持**（`softOpenedSmithServicesUi:true`） |
| attr-ui | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| strings_zh | **1013** **MATCH**（发前 soft 核） |

## 发前确认

- 发前手动 ff：`master`/`dev` `25ecaad` → `3603917`（含 `8341e6e`+docs），**普通 push**；禁 force。
- local/origin `dev`/`master`/`hotfix`/`qa` 均在 `3603917`。
- dry-run 0 阻断后实发；master 曾缺本地 TS 依赖，已 `npm ci` 后重跑（未跳过 precheck）。

## 流程

1. `tools/release.sh v0.6.16 --from 8341e6e2db33076e8997a81333381e6cbc424fdc --dry-run` → 清未跟踪后 **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；Pages 手工补验 **200**。
3. Pages：**HTTP 200**（11:48 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Flight／Sustain OpenFlag；**未**改 fly_zones 字节；**未**开 gifts；**未**混 #20/阵法/拍卖/坊市混窗；**未**碰 design/35。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- 本令只授权 **v0.6.16** 一次；销账可后置（`qa/out_v0616_close/`），不挡 Pages 汇报。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无（过程中：dry-run 首轮未跟踪 V0615 已移出；缺 TS 依赖已 npm ci；Pages 轮询中断后手工 200）。
