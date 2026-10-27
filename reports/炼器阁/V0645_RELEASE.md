# V0645_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.45/
- **master / tag^{}**：`55502dd0fa2859313d140d77d8d6f819b0e1c0f5`（annotated tag `v0.6.45` → object `161a518780f3139cd874093bc1f6c527e20d48a9`）
- **内容 tip（--from）**：`9f0292c6dc439c60b3301dd4bdd19d591f6b6340`（赤炎山麓＋赤炎熔岩道 GSB v1；主提交 `9f0292c6`；叠 docs 收口至 tip `9f8f126e`；祖先含已发 v0.6.44 的 `--from` tip `42b6d254`；⊂ master 经 merge `55502dd0`）
- **上一正式／docs tip**：`56b2f136`（V0644 status 对齐）／v0.6.44 tag^{} `a4904f56` ⊂ 发版 master 祖先链
- **分支 tip / origin**：发版时 master＝hotfix＝qa＝`55502dd0`；feat/tianjian-sword-tomb-gsb-v1-integrate tip `9f8f126e` **未** reset／rebase／force；合入为非 ff merge 叠 `56b2f136`；**未** merge 比 docs tip 更新的炎魔殿 WIP（feat wt 并行中的 `chiyan_core` 本地改动未进包）
- **gh-pages**：`f9bb8f78b29e7ac01542ebd32b6383319c04eeed`（`a270adc..f9bb8f7`）
- **本地包**：`releases/v0.6.45/` + `releases/v0.6.45_SHA256.json`（1030 文件与 dist/ghp 一致；清单文件 SHA256 `19a67268900cba2d19fd67e6503d7a02c0af8d5114d8c5382229bf4713b725c9`）
- **日志**：dry-run `qa/out/release_v0.6.45_20261027_120328_382237358.log`（**EXIT 0，0 阻断**；发前已 merge tip＋普通 push master `56b2f136`→`55502dd0`）；实发主日志 `qa/out/release_v0.6.45_20261027_120333_134318914.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 12:06 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**＠12:06:57／12:07:11 Asia/Shanghai；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 赤炎山麓 GSB v1 美术接入正式地图 | **进包**：`chiyan_slope_1.gsbScene=chiyan_slope_1_gsb_v1`／`gsbGeometryRevision=chiyan1-final-002`；发版树含 `chiyan_slope_1_gsb_v1` |
| 赤炎熔岩道 GSB v1 美术接入正式地图 | **进包**：`chiyan_slope_2.gsbScene=chiyan_slope_2_gsb_v1`／`gsbGeometryRevision=slope2-geometry-003`；发版树含 `chiyan_slope_2_gsb_v1` |
| 赤炎炎魔殿／`chiyan_core_gsb_v1` | **未进包**（分波接入另路；包内无 `chiyan_core_gsb_v1`；`chiyan_core` 无 gsb 绑定） |
| 幽影宝阁／万兽兽栏 GSB | **保持**（已在 v0.6.44） |
| 灵符靶场／太虚演法台 GSB | **保持**（已在 v0.6.43） |
| 万兽山门／灵符山门／幽影楼／太虚观／剑冢 GSB | **保持** |
| 万妖林四图／郊野荒驿筑基／落霞片区／竹林灵溪／青云 GSB | **保持** |
| 美术迭代小版本 | **是**（功能刀仍停；本发不合入新玩法；P3勿开） |
| design/50 巢穴日倍结算 soft | **保持**（已在 v0.6.32；`secret_daily_bonus=true`） |
| design/49 巢穴机缘三选一 soft | **保持**（已在 v0.6.31；`secret_boon_runtime=true`） |
| design/41–48 同行 AI 系列 soft | **保持**（已在 v0.6.23–30） |
| design/40 万妖巢穴／39 跳跃／38 夺宝 soft | **保持** |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁**（阵法归 v0.7） |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | 执法 smoke PASS＠`9f0292c6`：`reports/执法堂/20261027_赤炎山麓熔岩道GSB_同波_smoke.md`（77 checks；TIP_MATCH）；发版树含山麓＋熔岩道 GSB；**无** `chiyan_core_gsb_v1` |

## 发前确认

- 发前合入：`origin/master`＝`56b2f136` 与 tip `9f0292c6`／docs tip `9f8f126e` 相对 `42b6d254` 已分叉；本地干净 master 对齐 `origin/master` 后 `merge 9f8f126e` 得合并提交 `55502dd0`（解 status 冲突为发版态），**普通 push**；禁 force；**未** force-push／reset feat 枝 tip；**未** merge 比 docs tip 更新的炎魔殿 WIP。
- `--from` 全长 `9f0292c6dc439c60b3301dd4bdd19d591f6b6340` ⊂ master；docs tip `9f8f126e` ⊂；合入 diff 含 `chiyan_slope_1_gsb_v1`＋`chiyan_slope_2_gsb_v1` 资产与绑定；`git ls-tree`／包清单均 **无** `chiyan_core_gsb`。
- 执法 smoke `reports/执法堂/20261027_赤炎山麓熔岩道GSB_同波_smoke.md`：**PASS**＋tip **MATCH** `9f0292c6…`（checks=77）。
- 炼器接入报告 `reports/炼器阁/20261027_赤炎山麓GSB_接入正式地图.md`＋`20261027_赤炎熔岩道GSB_接入正式地图.md`；负责人／PM 准发美术小版本 v0.6.45（令文 `handoff/pm/20261027_负责人令_准发_赤炎山麓熔岩道GSB.md`）。
- dry-run 0 阻断后实发；未跳过 precheck（一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `9f0292c6…`；确认 tip 含山麓／熔岩道 gsbScene／revision；**无** `chiyan_core_gsb_v1`；功能刀仍停。
2. master 对齐 `origin/master`→`56b2f136`；清理本地脏 status／未跟踪报告拷贝；`merge 9f8f126e`→`55502dd0`；普通 `git push origin master`。
3. `tools/release.sh v0.6.45 --from 9f0292c6… --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 12:06 Asia/Shanghai；URL.txt 已记；独立 curl 200＠12:06:57／12:07:11 Asia/Shanghai。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20；**P3勿开**。
- **未**清空任何 gsb `work/`。
- **未**合入炎魔殿／`chiyan_core_gsb_v1`／比 `9f8f126e` 更新的 feat WIP；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh；**未** force-push／reset feat 枝 tip `9f8f126e`；**未**打断炎魔殿执行手 feat wt。
- 本令只授权 **v0.6.45** 一次美术迭代小版本（赤炎山麓＋赤炎熔岩道 GSB）。
- **未** SendToAgent／**未**直推用户试玩链（请主程序报负责人＋PM：tip／tag／Pages／包清单）。

## blocker

无（Pages 脚本内已 200＠12:06 Asia/Shanghai；独立 curl 亦 200＠12:06:57／12:07:11 Asia/Shanghai）。
