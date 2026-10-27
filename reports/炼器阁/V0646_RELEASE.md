# V0646_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.46/
- **master / tag^{}**：`3cb1c96ef9eb944eb80ad8d37c38087c6cb71999`（annotated tag `v0.6.46` → object `ad1805fcaf81453a08532b8d09996a88119fd42c`）
- **内容 tip（--from）**：`bf049da027cebb259115ceafe1e5c0bd4b61e45b`（赤炎炎魔殿 GSB v1；主提交 `bf049da0`；叠 docs 收口至 tip `fa57b68e`；祖先含已发 v0.6.45 的 `--from` tip `9f0292c6`；⊂ master 经 merge `3cb1c96e`）
- **上一正式／docs tip**：`055972ca`（V0645 status 对齐）／v0.6.45 tag^{} `55502dd0` ⊂ 发版 master 祖先链
- **分支 tip / origin**：发版时 master＝hotfix＝qa＝`3cb1c96e`；feat/tianjian-sword-tomb-gsb-v1-integrate tip `fa57b68e` **未** reset／rebase／force；合入为非 ff merge 叠 `055972ca`；**未**改写 tip `9f0292c6`／`bf049da0`
- **gh-pages**：`a6444e4a847bf497683f4c1460b601204ac9cd95`（`f9bb8f7..a6444e4`）
- **本地包**：`releases/v0.6.46/` + `releases/v0.6.46_SHA256.json`（1034 文件与 dist/ghp 一致；清单文件 SHA256 `5bcf03e6e1e2f175c90af6b9676effce6ea91ef479bea15c7a43e5c2bb365b9d`）
- **日志**：dry-run `qa/out/release_v0.6.46_20261027_122202_452054693.log`（**EXIT 0，0 阻断**；发前已 merge tip＋普通 push master `055972ca`→`3cb1c96e`）；实发主日志 `qa/out/release_v0.6.46_20261027_122205_696665545.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 12:25 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**＠12:25:27 Asia/Shanghai；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 赤炎炎魔殿 GSB v1 美术接入正式地图 | **进包**：`chiyan_core.gsbScene=chiyan_core_gsb_v1`／`gsbGeometryRevision=chiyan-core-final-002`；scene-data SHA `55fcec53…`；发版树含 `chiyan_core_gsb_v1` |
| 赤炎山麓 GSB v1 | **保持**（已在 v0.6.45；`chiyan_slope_1_gsb_v1`／`chiyan1-final-002`） |
| 赤炎熔岩道 GSB v1 | **保持**（已在 v0.6.45；`chiyan_slope_2_gsb_v1`／`slope2-geometry-003`） |
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
| 硬读旁证 | 执法 smoke PASS＠`bf049da0`：`reports/执法堂/20261027_赤炎炎魔殿GSB_分波_smoke.md`（43 checks；TIP_MATCH）；发版树／包内含 `chiyan_core_gsb_v1`＋`chiyan_slope_1_gsb_v1`＋`chiyan_slope_2_gsb_v1` |

## 发前确认

- 发前合入：`origin/master`＝`055972ca` 与 tip `bf049da0`／docs tip `fa57b68e` 相对 `9f8f126e` 已分叉；本地干净 master 对齐 `origin/master` 后 `merge fa57b68e` 得合并提交 `3cb1c96e`（解 status 冲突为发版态），**普通 push**；禁 force；**未** force-push／reset feat 枝 tip；**未**改写 tip `9f0292c6`。
- `--from` 全长 `bf049da027cebb259115ceafe1e5c0bd4b61e45b` ⊂ master；docs tip `fa57b68e` ⊂；合入 diff 含 `chiyan_core_gsb_v1` 资产与绑定；包内三图 GSB 均在。
- 执法 smoke `reports/执法堂/20261027_赤炎炎魔殿GSB_分波_smoke.md`：**PASS**＋tip **MATCH** `bf049da0…`（checks=43）。
- 炼器接入报告 `reports/炼器阁/20261027_赤炎炎魔殿GSB_接入正式地图.md`；负责人／PM 准发美术小版本 v0.6.46（令文 `handoff/pm/20261027_负责人令_准发_赤炎炎魔殿GSB.md`）。
- dry-run 0 阻断后实发；未跳过 precheck（一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `bf049da0…`；确认 tip 含炎魔殿 gsbScene／revision；山麓／熔岩道仍为祖先；功能刀仍停。
2. master 对齐 `origin/master`→`055972ca`；清理本地脏 status／未跟踪报告拷贝；`merge fa57b68e`→`3cb1c96e`；普通 `git push origin master`。
3. `tools/release.sh v0.6.46 --from bf049da0… --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 12:25 Asia/Shanghai；URL.txt 已记；独立 curl 200＠12:25:27 Asia/Shanghai。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20；**P3勿开**。
- **未**清空任何 gsb `work/`。
- **未**改写 tip `9f0292c6`／`bf049da0`；山麓＋熔岩道保持进包；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh；**未** force-push／reset feat 枝 tip `fa57b68e`；**未**打断 feat wt。
- 本令只授权 **v0.6.46** 一次美术迭代小版本（赤炎炎魔殿 GSB）。
- **未**直推用户试玩链（请主程序报负责人＋PM：tip／tag／Pages／包清单）。

## blocker

无（Pages 脚本内已 200＠12:25 Asia/Shanghai；独立 curl 亦 200＠12:25:27 Asia/Shanghai）。
