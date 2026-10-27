# V0644_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.44/
- **master / tag^{}**：`a4904f56bc13d0d2ee1bceb029a137d79397c3c4`（annotated tag `v0.6.44` → object `69701f2e17d9e22b51d8c106bd45953087926d3b`）
- **内容 tip（--from）**：`42b6d254d09c896799fa7561cae1767330663d90`（幽影宝阁＋万兽兽栏 GSB v1；主提交 `d04a2eaeb6c8b4083d35b8ccc4bb4497f1360148`；叠 docs 收口至 tip `42b6d254`；祖先含已发 v0.6.43 的 `--from` tip `85ecf18d`；⊂ master 经 merge `a4904f56`）
- **上一正式／docs tip**：`9faad8a0`（V0643 Pages200）／v0.6.43 tag^{} `b20f3467` ⊂ 发版 master 祖先链
- **分支 tip / origin**：发版时 master＝hotfix＝qa＝`a4904f56`；feat/tianjian-sword-tomb-gsb-v1-integrate tip `42b6d254` **未** reset／rebase／force；合入为非 ff merge 叠 `9faad8a0`；**未** merge 比 tip 更新的无关 WIP
- **gh-pages**：`a270adc64d6a2e696ee74afa267de08093f31a76`（`86740e5..a270adc`）
- **本地包**：`releases/v0.6.44/` + `releases/v0.6.44_SHA256.json`（1022 文件与 dist/ghp 一致；清单文件 SHA256 `9ed90cfde2f659bd423cba71568523b56ff7551ffe5280c79226ce088805ca2a`）
- **日志**：dry-run `qa/out/release_v0.6.44_20261027_100009_061657466.log`（**EXIT 0，0 阻断**；发前已 merge tip＋普通 push master `9faad8a0`→`a4904f56`）；实发主日志 `qa/out/release_v0.6.44_20261027_100026_117801348.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 10:04 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**＠10:04:28 Asia/Shanghai；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 幽影宝阁 GSB v1 美术接入正式地图 | **进包**：`trial_youying_vault.gsbScene=trial_youying_vault_gsb_v1`／`gsbGeometryRevision=trial-youying-final-002`；发版树含 `trial_youying_vault_gsb_v1` |
| 万兽兽栏 GSB v1 美术接入正式地图 | **进包**：`trial_wanshou_pen.gsbScene=trial_wanshou_pen_gsb_v1`／`gsbGeometryRevision=trial-wanshou-final-002`；发版树含 `trial_wanshou_pen_gsb_v1` |
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
| 硬读旁证 | 执法 smoke PASS＠`42b6d254`：`reports/执法堂/20261027_幽影宝阁万兽兽栏GSB_同波_smoke.md`（50 checks；tip MATCH `42b6d254d09c896799fa7561cae1767330663d90`）；发版树含幽影宝阁＋万兽兽栏 GSB；灵符／太虚保持 |

## 发前确认

- 发前合入：`origin/master`＝`9faad8a0` 与 tip `42b6d254` 相对 `85ecf18d` 已分叉（tip 不含 `b20f3467`／`9faad8a0`）；本地干净 master 对齐 `origin/master` 后 `merge 42b6d254` 得合并提交 `a4904f56`（解 status 冲突为发版态），**普通 push**；禁 force；**未** force-push／reset feat 枝 tip；**未** merge 比 tip 更新的无关 WIP。
- `--from` 全长 `42b6d254d09c896799fa7561cae1767330663d90` ⊂ master；主提交 `d04a2eae` ⊂；合入 diff 含 `trial_youying_vault_gsb_v1`＋`trial_wanshou_pen_gsb_v1` 资产与绑定。
- 执法 smoke `reports/执法堂/20261027_幽影宝阁万兽兽栏GSB_同波_smoke.md`：**PASS**＋tip **MATCH** `42b6d254…`（checks=50）。
- 炼器接入报告 `reports/炼器阁/20261027_幽影宝阁GSB_接入正式地图.md`＋`20261027_万兽兽栏GSB_接入正式地图.md`；负责人／PM 准发美术小版本 v0.6.44（令文 `handoff/pm/20261027_令炼器发版_v0644.md`／准发 `handoff/pm/20261027_负责人令_准发_幽影万兽试炼GSB.md`）。
- dry-run 0 阻断后实发；未跳过 precheck（一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `42b6d254…`；确认 tip 含幽影宝阁／万兽兽栏 gsbScene／revision；灵符／太虚保持；P3勿开。
2. master 对齐 `origin/master`→`9faad8a0`；`merge 42b6d254`→`a4904f56`；普通 `git push origin master`。
3. `tools/release.sh v0.6.44 --from 42b6d254… --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 10:04 Asia/Shanghai；URL.txt 已记；独立 curl 200＠10:04:28 Asia/Shanghai。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20；**P3勿开**。
- **未**清空任何 gsb `work/`。
- **未**合入无关 WIP；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh；**未** force-push／reset feat 枝 tip `42b6d254`。
- 本令只授权 **v0.6.44** 一次美术迭代小版本（幽影宝阁＋万兽兽栏 GSB）。
- **未** SendToAgent／**未**直推用户试玩链（请主程序报负责人＋PM：tip／tag／Pages／包清单）。

## blocker

无（Pages 脚本内已 200＠10:04 Asia/Shanghai；独立 curl 亦 200＠10:04:28 Asia/Shanghai）。
