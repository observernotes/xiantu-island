# V0627_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.27/
- **master / tag^{}**：`020002d11cd4487f17a24c75f012b37faa12a439`（annotated tag `v0.6.27` → object `944aed4142978f0022a859c0f48fa2adb6c0c3d7`；其后 docs tip `4c04a7f188b4ae749b70d97e3cfbfc4e7e011bc3`）
- **内容 tip（--from）**：`c166d3ea41dd052ef2515b162085490f0ca7e4c6`（soft-open 交件；含于 master=`020002d`）
- **业务 tip**：`ffc63aa5617a779a264da915a877cb9267bf3797`（hurt→companionReflectDamage；ratio0.5 读表 effects；forbidEmit；budget×0.35；stay 不放反伤；schedule 不改；41–44 未漂）⊂ soft tip ⊂ master
- **分支 tip / origin**：发版 tip `020002d`（hotfix/qa 同＝master）；feat/companion-reflect-hook 普通快进合入
- **gh-pages**：`cafbaea6509fb67375b571d6567acf582ad0e860`（`ebce2c6..cafbaea`）
- **本地包**：`releases/v0.6.27/` + `releases/v0.6.27_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `d1da024307e5f2574317cfc576fe0b9187670e8eaa082a4eb131ee44cf3e385f`）
- **日志**：dry-run `qa/out/release_v0.6.27_20261022_185103_459363105.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `f79ef2c` → `020002d`）；实发主日志 `qa/out/release_v0.6.27_20261022_185106_185891507.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages **成功** EXIT0）。未 `--skip-precheck`；**未** force。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-22 18:52 Asia/Shanghai；URL.txt 已记）；`curl -sI` 亦 **200**；**无需**超时后续轮询／未重跑 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/45 同行 AI 受击反伤 soft-open | **开放**：hurt→`companionReflectDamage`；ratio＝**0.5** 读表 `skills.sword_shield.effects.reflectRatio`；forbidEmitSwordShield；budget 同乘 **0.35** 一次；可见＝掉血＋跳字；stay 不放反伤＋cancel pending；schedule＝primary_and_area＋supportLocked **不改** |
| softOpenedCompanion＊／CompanionOpenFlag | **无**（本发不引入；生产 HIT=0） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/44 同行 AI area whirl_sword soft | **保持**（已在 v0.6.26） |
| design/43 同行 AI 主动解散入口 soft | **保持**（已在 v0.6.25） |
| design/42 同行 AI free＋stay＋KeyV soft | **保持**（已在 v0.6.24） |
| design/41 同行 AI follow soft | **保持**（已在 v0.6.23；primary 96／320／320＋CD1200＋engage240＋×0.35） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20；本刀零夺宝 diff） |
| design/39 跳跃方向与微操 soft | **保持**（已在 v0.6.21；本刀零跳跃 diff） |
| design/40 万妖巢穴 soft | **保持**（已在 v0.6.22；本刀零巢穴 diff） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁** |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | reflectRatio**0.5**／effects 读表／forbidEmit／budget×**0.35**／stay不放反伤；41 follow96／320／320＋CD1200＋240×0.35；42 KeyV＋free／stay；43 dismiss≠KeyV；44 area CD4000／w160·h80·behind32／N＝2；companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `f79ef2c` → `020002d`（含业务 tip `ffc63aa`＋soft tip `c166d3e`＋docs soft tip 钉 `020002d`），**普通 push**；禁 force。
- soft tip 全长 `c166d3ea41dd052ef2515b162085490f0ca7e4c6` ⊂ master；业务 tip `ffc63aa…` ⊂ soft tip（零业务 diff soft←业务）。
- 执法 out `qa/out_companion_reflect_soft_c166d3e/` PASS：O01–O06／C01／C03；released=false／newOpenFlag=false／无 softOpenedCompanion＊／CompanionOpenFlag／硬读钉齐／冻结 SHA MATCH。
- 负责人核 `reports/炼器阁/20261022_负责人核_同行AI_design45_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261022_负责人令_同行AI_design45_release_v0627.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.27 --from c166d3ea41dd052ef2515b162085490f0ca7e4c6 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 全过 **EXIT0**；脚本内 Pages 已达 **200**（未超时；未重跑 release.sh／未 force／未改 tag）。
3. Pages：**HTTP 200**（2026-10-22 18:52 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Companion／其它 OpenFlag；**未**引入 softOpenedCompanion＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另枝。
- **未**开三技能整包／开 gifts／接 support。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- follow／free／stay／解散／area 保持（v0.6.23–26）；夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；巢穴保持（v0.6.22）；本令只授权 **v0.6.27** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无（Pages 脚本内已 200）。

