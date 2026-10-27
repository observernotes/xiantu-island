# V0643_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.43/
- **master / tag^{}**：`b20f3467e9372ffe3d6e4346d7128c825753c6e3`（annotated tag `v0.6.43` → object `9866aeae320f0a9e62a6d7997f4f7ee3d1aba787`）
- **内容 tip（--from）**：`85ecf18dbf7c19c81db1a606206c51b375775318`（灵符靶场＋太虚演法台 GSB v1；主提交 `46b2f12deed8cdf96ce95127b5dfe285c392078c`；叠 docs 收口至 tip `85ecf18d`；祖先含已发 v0.6.42 的 `--from` tip `65e48a8b`；⊂ master 经 merge `b20f3467`）
- **上一正式／docs tip**：`9875e16f`（V0642 Pages200）／v0.6.42 tag^{} `b9eb2a04` ⊂ 发版 master 祖先链
- **分支 tip / origin**：发版时 master＝hotfix＝qa＝`b20f3467`；feat/tianjian-sword-tomb-gsb-v1-integrate tip `85ecf18d` **未** reset／rebase／force；合入为非 ff merge 叠 `9875e16f`；**未** merge feat HEAD／**未**并幽影 tip
- **gh-pages**：`86740e597bb91d2050427688dd4bb64badfcda8d`（`997ddc6..86740e5`）
- **本地包**：`releases/v0.6.43/` + `releases/v0.6.43_SHA256.json`（1014 文件与 dist/ghp 一致；清单文件 SHA256 `e95001503da5aeacc49d593b983f4a693679a14958443a15049c8bb62a06d864`）
- **日志**：dry-run `qa/out/release_v0.6.43_20261027_092154_323918345.log`（**EXIT 0，0 阻断**；发前已 merge tip＋普通 push master `9875e16f`→`b20f3467`）；实发主日志 `qa/out/release_v0.6.43_20261027_092157_179721433.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 09:24 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**＠09:24:51 Asia/Shanghai；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 灵符靶场 GSB v1 美术接入正式地图 | **进包**：`trial_lingfu_range.gsbScene=trial_lingfu_range_gsb_v1`／`gsbGeometryRevision=trial-lingfu-final-002`；发版树含 `trial_lingfu_range_gsb_v1` |
| 太虚演法台 GSB v1 美术接入正式地图 | **进包**：`trial_taixu_stage.gsbScene=trial_taixu_stage_gsb_v1`／`gsbGeometryRevision=taixu-stage-final-003`；发版树含 `trial_taixu_stage_gsb_v1` |
| 幽影宝阁试炼 GSB | **未进**（另 tip 接入中；包内无 `trial_youying_vault_gsb*`） |
| 万兽试炼 GSB | **未进**（未令；包内无新增万兽试炼 GSB；万兽山门 GSB 已在 v0.6.42 保持） |
| 万兽山门 GSB | **保持**（已在 v0.6.42；`wanshou-final-003`） |
| 灵符派山门／幽影楼山门 GSB | **保持**（已在 v0.6.41） |
| 天剑山门／太虚观／天剑剑冢 GSB | **保持** |
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
| 硬读旁证 | 执法 smoke PASS＠`85ecf18d`：`reports/执法堂/20261027_灵符靶场太虚演法台GSB_同波_smoke.md`（59 checks；tip MATCH `85ecf18dbf7c19c81db1a606206c51b375775318`）；发版树含两试炼 GSB、**无** `trial_youying_vault_gsb*` |

## 发前确认

- 发前合入：`origin/master`＝`9875e16f` 与 tip `85ecf18d` 相对 `65e48a8b` 已分叉（tip 不含 `b9eb2a04`／`9875e16f`）；本地干净 master 对齐 `origin/master` 后 `merge 85ecf18d` 得合并提交 `b20f3467`（解 status 冲突为发版态），**普通 push**；禁 force；**未** force-push／reset feat 枝 tip；**未** merge feat HEAD。
- `--from` 全长 `85ecf18dbf7c19c81db1a606206c51b375775318` ⊂ master；主提交 `46b2f12d` ⊂；合入 diff 含 `trial_lingfu_range_gsb_v1`＋`trial_taixu_stage_gsb_v1` 资产与绑定。
- 执法 smoke `reports/执法堂/20261027_灵符靶场太虚演法台GSB_同波_smoke.md`：**PASS**＋tip **MATCH** `85ecf18d…`（checks=59）。
- 炼器接入报告 `reports/炼器阁/20261027_灵符靶场GSB_接入正式地图.md`＋`20261027_太虚演法台GSB_接入正式地图.md`；负责人／PM 准发美术小版本 v0.6.43（令文 `handoff/pm/20261027_令炼器发版_v0643.md`／准发 `handoff/pm/20261027_负责人令_准发_灵符太虚试炼GSB.md`）。
- dry-run 0 阻断后实发；未跳过 precheck（一次实发过）。

## 流程

1. 硬读执法 smoke：**PASS**＋tip MATCH `85ecf18d…`；确认 tip 含灵符靶场／太虚演法台 gsbScene／revision，**无**幽影宝阁试炼 GSB／未令万兽试炼 GSB。
2. master 对齐 `origin/master`→`9875e16f`；`merge 85ecf18d`→`b20f3467`；普通 `git push origin master`。
3. `tools/release.sh v0.6.43 --from 85ecf18d… --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 09:24 Asia/Shanghai；URL.txt 已记；独立 curl 200＠09:24:51 Asia/Shanghai。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20。
- **未**清空任何 gsb `work/`。
- **未**合入幽影宝阁试炼 GSB／万兽试炼／无关 WIP；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh；**未** force-push／reset feat 枝 tip `85ecf18d`。
- 本令只授权 **v0.6.43** 一次美术迭代小版本（灵符靶场＋太虚演法台 GSB）。
- **未** SendToAgent／**未**直推用户试玩链（请主程序报负责人＋PM：tip／tag／Pages／包清单）。

## blocker

无（Pages 脚本内已 200＠09:24 Asia/Shanghai；独立 curl 亦 200＠09:24:51 Asia/Shanghai）。
