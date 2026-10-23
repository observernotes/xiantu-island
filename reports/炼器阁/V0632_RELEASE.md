# V0632_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.32/
- **master / tag^{}**：`6809d977073dc249106d4169ac7e1c4daeb800d1`（annotated tag `v0.6.32` → object `6b9492eb6cfa3ee0ac733826e4ea58d36d3088b3`）
- **内容 tip（--from）**：`f5efb16517c70f2fd73eac4a1bb655126f062b03`（soft-open 交件；含于 master=`6809d977`）
- **业务 tip**：`473ca3d592e9341032aff5b1b5a133bd0f1e2c1c`（wire tip 钉；含实现）⊂ soft tip ⊂ master
- **夹具祖先**：`364cd494`；**docs 枝头／发版 tip**：`6809d977`（⊇ soft；随枝合入）
- **分支 tip / origin**：发版 tip `6809d977`（hotfix/qa 同＝master）；feat/secret-daily-bonus 普通快进合入（含 soft tip `f5efb165`＋docs tip 钉 `6809d977`）
- **gh-pages**：`8bfa3f0a9bfd826b2a35bb96f6df74228c10da95`（`c169b1e..8bfa3f0`）
- **本地包**：`releases/v0.6.32/` + `releases/v0.6.32_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `b1d85d0a2797c88734c9fd38b0225a0d8b6de89b5f6af219dd03a01d00493e76`）
- **日志**：dry-run `qa/out/release_v0.6.32_20261023_234804_374229552.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `ec6702c9` → `6809d977`）；实发主日志 `qa/out/release_v0.6.32_20261023_234808_290442044.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 **成功** EXIT 0）。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-23 23:50 Asia/Shanghai；URL.txt 已记）；独立 `curl -sI` 亦 **200**；**未** force／**未** skip-precheck／**未**重跑 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/50 巢穴日倍结算 soft-open | **开放**：`secret_daily_bonus=true`；runs／mul＝**3／2.0**；基线 12／20 → 开闸 **24／40**；满额回基线；失败／pending 不占额；日界 **05:00**；与 boon **正交**；仍不开 loot／chest／boss／扩房／rare·epic |
| softOpenedNest＊／NestOpenFlag／DailyBonusOpenFlag | **无**（本发不引入；生产 dist HIT=0；仅测负向断言） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/49 巢穴机缘三选一 soft | **保持**（已在 v0.6.31；`secret_boon_runtime=true`） |
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
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁**（senior_sister_su.affinity.gifts.enabled=false；阵法归 v0.7） |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | runs/mul=3/2.0；12/20→24/40；满额回基线；05:00；pending 阻结算；boon 正交；40／41–49 未漂；features SHA `5d29ebe9…`；secret_rooms 权威 `42eab7d3…`／boons `2f721cd4…`／companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `ec6702c9` → `6809d977`（含业务 tip `473ca3d5`＋夹具 `364cd494`＋soft tip `f5efb165`＋docs tip 钉 `6809d977`），**普通 push**；禁 force。
- soft tip 全长 `f5efb16517c70f2fd73eac4a1bb655126f062b03` ⊂ master；业务 tip ⊂ soft tip。
- 执法 out `qa/out_secret_daily_bonus_soft_f5efb165/` PASS：O01–O06／C01–C03；released=false／newOpenFlag=false／无 softOpenedNest＊／NestOpenFlag／DailyBonusOpenFlag／硬读钉齐／冻结 SHA MATCH；开态 out＠`qa/out_secret_daily_bonus_open_473ca3d5/` 未覆盖。
- 负责人核 `reports/天机阁/20261023_负责人核_同行AI_design50_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261023_负责人令_v0.6.32_release.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.32 --from f5efb16517c70f2fd73eac4a1bb655126f062b03 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages200 全过（EXIT 0）。
3. Pages **HTTP 200**＠2026-10-23 23:50 Asia/Shanghai；URL.txt 已记。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Nest／DailyBonus／其它 OpenFlag；**未**引入 softOpenedNest＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另扩／loot／boss／扩房。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）；**未**重跑 release.sh。
- 同行 AI 41–49 soft 保持（v0.6.23–31）；夺宝／跳跃／巢穴最小保持；本令只授权 **v0.6.32** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人；链由负责人另转）。

## blocker

无（Pages 脚本内已 200＠23:50 Asia/Shanghai）。
