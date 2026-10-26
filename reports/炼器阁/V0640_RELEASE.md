# V0640_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.40/
- **master / tag^{}**：`7be7fced000b35e72d2327dabc4fa4e2ef9e01cf`（annotated tag `v0.6.40` → object `af40f26e5a7083426d2cc1016c6152cd3230b5b1`）
- **内容 tip（--from）**：`7f1c304fdbe884ac13f9453bd3f3f8a3fe98af08`（天剑山门＋太虚观 GSB v1 同波接入；主提交 `9c34f8ba`，tip 为其 docs tip／status 收口；⊂ master 经 merge `7be7fced`）
- **上一正式／docs tip**：`83fefb50`（V0639 Pages200）／origin/master 分叉 docs `1c40bd03`（status 现网 v0.6.39 已发完）均 ⊂ 发版 master；剑冢 tip `44eee8fa`（v0.6.39 tag^{}）保持
- **分支 tip / origin**：发版时 master＝hotfix＝qa＝`7be7fced`；feat/tianjian-sword-tomb-gsb-v1-integrate tip `7f1c304f` **未** reset／rebase／force；合入为非 ff merge 叠 `1c40bd03`
- **gh-pages**：`84fa01ead33b9b1f54baf15ccbe0f2ae2d24d90c`（`09311f4..84fa01e`）
- **本地包**：`releases/v0.6.40/` + `releases/v0.6.40_SHA256.json`（994 文件与 dist/ghp 一致；清单文件 SHA256 `ef27692157ec8776e013739f72842373413f903c325378a003d321fff397b977`）
- **日志**：dry-run `qa/out/release_v0.6.40_20261027_060004_749718312.log`（**EXIT 0，0 阻断**；发前已 merge tip＋普通 push master `1c40bd03`→`7be7fced`）；实发主日志 `qa/out/release_v0.6.40_20261027_060007_639481657.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 06:03 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 天剑山门 GSB v1 美术接入正式地图 | **进包**：`tianjian_sect.gsbScene=tianjian_sect_gsb_v1`／`gsbGeometryRevision=tianjian-sect-final-003`；背景／可玩层／像素级 solids＋one-ways／绳梯对齐 |
| 太虚观 GSB v1 美术接入正式地图 | **进包**：`taixu_temple.gsbScene=taixu_temple_gsb_v1`／`gsbGeometryRevision=taixu-final-001` |
| 天剑剑冢 GSB v1 | **保持**（已在 v0.6.39） |
| 灵符派山门 `lingfu_pavilion` GSB | **未进本发**（无 `lingfu_pavilion_gsb*`；另续 tip／执法后再令） |
| 幽影／万寿 GSB | **未进本发**（未令不接） |
| 万妖林四图／郊野荒驿筑基／落霞片区／竹林灵溪／青云 GSB | **保持** |
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
| 硬读旁证 | 执法 smoke PASS＠`7f1c304f`：试走／碰撞／绳梯／切图正交／tsc／GSB 单测（31 checks）；OpenFlag×6／features／npcs vs v0.6.39 MATCH；gifts 10×false；发版树含 `tianjian_sect_gsb_v1`／`taixu_temple_gsb_v1`，**无** `lingfu_pavilion_gsb*` |

## follow-up（建议级，不阻断本发）

- 灵符派山门 final-003 接入继续交后续 tip，**勿挡本已发版**——本发已按 tip `7f1c304f` 发完。
- 未令不接幽影／万寿。

## 发前确认

- 发前合入：`origin/master`＝`1c40bd03` 与 tip `7f1c304f` 相对 `83fefb50` 已分叉；本地先 `merge --ff-only origin/master`→`1c40bd03`，再 `merge 7f1c304f` 得合并提交 `7be7fced`（解 status 冲突为发版态），**普通 push**；禁 force；**未** force-push／reset feat 枝 tip。
- `--from` 全长 `7f1c304fdbe884ac13f9453bd3f3f8a3fe98af08` ⊂ master；合入 diff 含 `tianjian_sect*`／`taixu_temple*` GSB 资产与绑定，**无** `lingfu_pavilion_gsb*`。
- 执法 out／报告 `reports/执法堂/20261027_天剑山门太虚观GSB_接入_smoke.md`：**PASS**＋tip **MATCH** `7f1c304f…`。
- 炼器接入报告 `reports/炼器阁/20261027_天剑山门GSB_接入正式地图.md`、`…太虚观…`；负责人核／执法 PASS 后 PM 令发美术小版本 v0.6.40。
- dry-run 0 阻断后实发；未跳过 precheck（本发依赖齐全，一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `7f1c304f…`；确认 tip 无灵符 gsbScene。
2. `merge --ff-only origin/master` → `1c40bd03`；`merge 7f1c304f` → `7be7fced`；普通 `git push origin master`。
3. `tools/release.sh v0.6.40 --from 7f1c304f --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 06:03 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20。
- **未**清空任何 gsb `work/`。
- **未**合入未 smoke 的灵符／幽影／万寿 tip；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh；**未** force-push／reset feat 枝 tip `7f1c304f`。
- 本令只授权 **v0.6.40** 一次美术迭代小版本（山门＋太虚）。
- **未** SendToAgent／**未**直推用户试玩链（链只由主程序回负责人；另报 PM Pages200）。

## blocker

无（Pages 脚本内已 200＠06:03 Asia/Shanghai）。
