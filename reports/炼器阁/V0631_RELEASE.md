# V0631_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.31/
- **master / tag^{}**：`f8c6a1052cdedefa21ab526fd7aed0944bad5255`（annotated tag `v0.6.31` → object `ae06701bbcd8e9ea39f1f9f20e29d0c36b089fde`）
- **内容 tip（--from）**：`0173a102dc62bbd379e039ab23f58d7cad42d41e`（soft-open 交件；含于 master=`f8c6a105`）
- **业务 tip**：`673e62ca1f6bd9b9d4e9a09295ab4259b2dfda40`（wire tip 钉；含实现）⊂ soft tip ⊂ master
- **分支 tip / origin**：发版 tip `f8c6a105`（hotfix/qa 同＝master）；feat/secret-boon-runtime 普通快进合入（含 soft tip `0173a102`＋docs tip 钉 `f8c6a105`）
- **gh-pages**：`c169b1e679d06952fcb79da1c86591aa5a5598ef`（`51e6632..c169b1e`）
- **本地包**：`releases/v0.6.31/` + `releases/v0.6.31_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `a43f482cbc4ce61bb29124a49cb04087b1db1f661270d062039cc856c136a110`）
- **日志**：dry-run `qa/out/release_v0.6.31_20261023_154140_526265135.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `75f0916c` → `f8c6a105`）；实发主日志 `qa/out/release_v0.6.31_20261023_154144_641801457.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-23 15:44 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/49 巢穴机缘三选一 soft-open | **开放**：`secret_boon_runtime=true`；清 combat_01 三选一；allowlist＝**6 common＋3 fallback**；rare／epic **关**；倒地／通关／退出清层；pending 阻结算；passive 只玩家；同伴／召唤读 baseMaxHp |
| softOpenedNest＊／NestOpenFlag／BoonOpenFlag | **无**（本发不引入；生产 dist HIT=0；仅测负向断言） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/48 同行 AI 苏师姐 support＝sword_shield soft | **保持**（已在 v0.6.30） |
| design/47 同行 AI 好感来源 soft | **保持**（已在 v0.6.29） |
| design/46 同行 AI 零血复起 soft | **保持**（已在 v0.6.28） |
| design/45 同行 AI 受击反伤 soft | **保持**（已在 v0.6.27） |
| design/44 同行 AI area whirl_sword soft | **保持**（已在 v0.6.26） |
| design/43 同行 AI 主动解散入口 soft | **保持**（已在 v0.6.25） |
| design/42 同行 AI free＋stay＋KeyV soft | **保持**（已在 v0.6.24） |
| design/41 同行 AI follow soft | **保持**（已在 v0.6.23） |
| design/40 万妖巢穴 soft | **保持**（已在 v0.6.22；本刀最小进清结退不漂） |
| design/39 跳跃方向与微操 soft | **保持**（已在 v0.6.21） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁**（senior_sister_su.affinity.gifts.enabled=false） |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | allowlist 6c+3f／rare·epic关／倒地清／pending阻结算／玩家隔离；40／41–48未漂；secret_boons `2f721cd4…`／companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `75f0916c` → `f8c6a105`（含业务 tip `673e62ca`＋soft tip `0173a102`＋docs tip 钉 `f8c6a105`），**普通 push**；禁 force。
- soft tip 全长 `0173a102dc62bbd379e039ab23f58d7cad42d41e` ⊂ master；业务 tip ⊂ soft tip。
- 执法 out `qa/out_secret_boon_runtime_soft_0173a102/` PASS：O01–O06／C01–C03；released=false／newOpenFlag=false／无 softOpenedNest＊／NestOpenFlag／硬读钉齐／冻结 SHA MATCH；开态 out 未覆盖。
- 负责人核 `reports/天机阁/20261023_负责人核_同行AI_design49_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261023_负责人令_v0.6.31_release.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.31 --from 0173a102dc62bbd379e039ab23f58d7cad42d41e --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
3. Pages **HTTP 200**＠2026-10-23 15:44 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Nest／Boon／其它 OpenFlag；**未**引入 softOpenedNest＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另扩／日倍／loot／boss／扩房。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）；**未**重跑 release.sh。
- 同行 AI 41–48 soft 保持（v0.6.23–30）；夺宝／跳跃／巢穴最小保持；本令只授权 **v0.6.31** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人；链由负责人另转）。

## blocker

无（Pages 脚本内已 200＠15:44 Asia/Shanghai）。
