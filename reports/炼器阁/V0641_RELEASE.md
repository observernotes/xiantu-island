# V0641_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.41/
- **master / tag^{}**：`7b0bd0e622fb1a8ae9df76d4f4a70bc304a0246d`（annotated tag `v0.6.41` → object `a679c6ed900fd90ab5dcc6c8d4c8df3110cf99d1`）
- **内容 tip（--from）**：`6121a231ba3bad051e14fda17c2141758184506c`（灵符＋幽影 GSB v1 同波；主提交 `9845990b`，叠灵符 tip `177ee437`／主 `dac606c8`；docs tip `6121a231` 为其 status 收口；⊂ master 经 merge `7b0bd0e6`）
- **上一正式／docs tip**：`9a1a5836`（V0640 Pages200）／v0.6.40 tag^{} `7be7fced` ⊂ 发版 master 祖先链
- **分支 tip / origin**：发版时 master＝hotfix＝qa＝`7b0bd0e6`；feat/tianjian-sword-tomb-gsb-v1-integrate tip `6121a231` **未** reset／rebase／force；合入为非 ff merge 叠 `9a1a5836`
- **gh-pages**：`5ef0b7e2e187f43a39dad0ba77ef77ed6a37bed8`（`84fa01e..5ef0b7e`）
- **本地包**：`releases/v0.6.41/` + `releases/v0.6.41_SHA256.json`（1002 文件与 dist/ghp 一致；清单文件 SHA256 `49097b5e9528b1649436f291cfa634055493745ec347ff85913690fb7e86ff7b`）
- **日志**：dry-run `qa/out/release_v0.6.41_20261027_063844_514653662.log`（**EXIT 0，0 阻断**；发前已 merge tip＋普通 push master `9a1a5836`→`7b0bd0e6`）；实发主日志 `qa/out/release_v0.6.41_20261027_063847_584746949.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-27 06:41 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑成功后的 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| 灵符派山门 GSB v1 美术接入正式地图 | **进包**：`lingfu_pavilion.gsbScene=lingfu_pavilion_gsb_v1`／`gsbGeometryRevision=lingfu-final-003` |
| 幽影楼山门 GSB v1 美术接入正式地图 | **进包**：`youying_tower.gsbScene=youying_tower_gsb_v1`／`gsbGeometryRevision=youying-final-002` |
| 天剑山门／太虚观／天剑剑冢 GSB | **保持**（已在 v0.6.39–40） |
| 万兽山门 `wanshou_mountain` GSB | **未进本发**（无 `wanshou_mountain_gsb*`；另 tip／下一小版本） |
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
| 硬读旁证 | 执法同波 smoke PASS＠`6121a231`：`reports/执法堂/20261027_灵符幽影GSB_同波_smoke.md`（43 checks；tip MATCH `6121a231ba3bad051e14fda17c2141758184506c`）；发版树含 `lingfu_pavilion_gsb_v1`／`youying_tower_gsb_v1`，**无** `wanshou_mountain_gsb*` |

## follow-up（建议级，不阻断本发）

- 旁注：灵符 dock 绳 x=176 与 ferry_landing 争 ArrowUp，可后评估。
- 万兽山门 GSB 另 tip／下一小版本，**勿挡本已发版**。

## 发前确认

- 发前合入：`origin/master`＝`9a1a5836` 与 tip `6121a231` 相对 `7f1c304f` 已分叉（tip 不含 `7be7fced`／`9a1a5836`）；本地干净 master 对齐 `origin/master` 后 `merge 6121a231` 得合并提交 `7b0bd0e6`（解 status 冲突为发版态），**普通 push**；禁 force；**未** force-push／reset feat 枝 tip。
- `--from` 全长 `6121a231ba3bad051e14fda17c2141758184506c` ⊂ master；合入 diff 含 lingfu＋youying GSB 资产与绑定，**无** `wanshou_mountain_gsb*`（feat HEAD 仍钉 tip，万兽仅未跟踪 WIP）。
- 执法 out／报告 `reports/执法堂/20261027_灵符幽影GSB_同波_smoke.md`：**PASS**＋tip **MATCH** `6121a231…`。
- 炼器接入报告 `reports/炼器阁/20261027_灵符派GSB_接入正式地图.md`、`…幽影楼…`；负责人／PM 准发美术小版本 v0.6.41。
- dry-run 0 阻断后实发；未跳过 precheck（一次实发过）。

## 流程

1. 硬读执法同波 smoke：**PASS**＋tip MATCH `6121a231…`；确认 tip 无万兽 gsbScene。
2. master 对齐 `origin/master`→`9a1a5836`；`merge 6121a231`→`7b0bd0e6`；普通 `git push origin master`。
3. `tools/release.sh v0.6.41 --from 6121a231 --dry-run` → **0 阻断**。
4. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
5. Pages **HTTP 200**＠2026-10-27 06:41 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 OpenFlag；**未**动功能刀／design 新玩法／gifts／#20。
- **未**清空任何 gsb `work/`。
- **未**合入万兽 tip／WIP；阵法仍 v0.7。
- **未** force-push／reset --hard／--no-verify；**未** `--skip-precheck`；成功后**未**重跑 release.sh；**未** force-push／reset feat 枝 tip `6121a231`。
- 本令只授权 **v0.6.41** 一次美术迭代小版本（灵符＋幽影）。
- **未** SendToAgent／**未**直推用户试玩链（请主程序报负责人＋PM：tip／tag／Pages／包清单）。

## blocker

无（Pages 脚本内已 200＠06:41 Asia/Shanghai）。
