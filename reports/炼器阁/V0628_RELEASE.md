# V0628_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.28/
- **master / tag^{}**：`ba78c6af54387528a91803d68e592644f6839740`（annotated tag `v0.6.28` → object `4d49a9eeec54842eb82109084f7b357c2b629101`）
- **内容 tip（--from）**：`1d953e2987aa050923bba7e9046a564b2546e0bd`（soft-open 交件；含于 master=`ba78c6af`）
- **业务 tip**：`3a703e7204cbb076b1efef41e2a2c195c2fd6d1b`（wire tip 钉；含实现）⊂ soft tip ⊂ master
- **实现**：`0cdb77084b9878927818435eb5c729a0196b43e6`（hp→0→down→reviveMs30000→maxHp／iFrames1000／原地／力竭＋复起；fatalHitReflect=false；sceneLocal；stay 可复起；停 primary·area·反伤＋cancel pending；41–45 未漂）⊂ soft tip ⊂ master
- **分支 tip / origin**：发版 tip `ba78c6af`（hotfix/qa 同＝master）；feat/companion-down-revive 普通快进合入
- **gh-pages**：`9f781fd9bf050557cfa382e1d965b4b527ea4a9e`（`cafbaea..9f781fd`）
- **本地包**：`releases/v0.6.28/` + `releases/v0.6.28_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `0ff123aca4102169e261283451fb637ffc8fe76ab2242533a6e2e72291354287`）
- **日志**：dry-run `qa/out/release_v0.6.28_20261022_201039_826453827.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `bcaaf5c` → `ba78c6af`）；实发主日志 `qa/out/release_v0.6.28_20261022_201105_067085282.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages **成功** EXIT0）。未 `--skip-precheck`；**未** force。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-22 20:13 Asia/Shanghai；URL.txt 已记）；`curl -sI` 亦 **200**；**无需**超时后续轮询／未重跑 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/46 同行 AI 零血复起 soft-open | **开放**：hp→0→倒地停战→reviveMs＝**30000** 复起；回血＝**maxHp**；无敌＝**1000ms**；落点＝**原地**；可见「苏师姐力竭」＋「复起」；致命同拍禁反伤（fatalHitReflect＝**false**）；sceneLocal；keep relation·mode；stay 可倒地复起；停 primary·area·反伤＋cancel pending |
| softOpenedCompanion＊／CompanionOpenFlag | **无**（本发不引入；生产 HIT=0；仅测负向断言） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/45 同行 AI 受击反伤 soft | **保持**（已在 v0.6.27） |
| design/44 同行 AI area whirl_sword soft | **保持**（已在 v0.6.26） |
| design/43 同行 AI 主动解散入口 soft | **保持**（已在 v0.6.25） |
| design/42 同行 AI free＋stay＋KeyV soft | **保持**（已在 v0.6.24） |
| design/41 同行 AI follow soft | **保持**（已在 v0.6.23；primary 96／320／320＋CD1200＋engage240＋×0.35） |
| design/38 杀人夺宝 soft | **保持**（已在 v0.6.20；本刀零夺宝 diff） |
| design/39 跳跃方向与微操 soft | **保持**（已在 v0.6.21；本刀零跳跃 diff） |
| design/40 万妖巢穴 soft | **保持**（已在 v0.6.22；本刀零巢穴 diff） |
| 既有灵纹／飞行／坊市／炼器 UI／青钢／fly 反馈 soft | **保持** |
| gifts／#20／阵法／拍卖／坊市混窗 | **仍关／禁**（senior_sister_su.affinity.gifts.enabled=false） |
| GAME_PHASE | **5（未抬）** |
| sash/shoe／outfits／阵法 | **未捆**（另枝；本 release 不合入） |
| 硬读旁证 | reviveMs**30000**／maxHp／iFrames**1000**／原地／力竭＋复起／fatalHitReflect=false／sceneLocal／stay可复起；41 follow96／320／320＋CD1200＋240×0.35；42 KeyV＋free／stay；43 dismiss≠KeyV；44 area CD4000／w160·h80·behind32／N＝2；45 reflectRatio**0.5**／forbidEmit／budget×0.35／stay不放；companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `bcaaf5c` → `ba78c6af`（含实现 `0cdb7708`＋业务 tip `3a703e72`＋soft tip `1d953e29`＋docs soft tip 钉 `ba78c6af`），**普通 push**；禁 force。
- soft tip 全长 `1d953e2987aa050923bba7e9046a564b2546e0bd` ⊂ master；实现／业务 tip ⊂ soft tip（相对实现零业务 diff soft←实现）。
- 执法 out `qa/out_companion_down_revive_soft_1d953e29/` PASS：O01–O07／C01／C03；released=false／newOpenFlag=false／无 softOpenedCompanion＊／CompanionOpenFlag／硬读钉齐／冻结 SHA MATCH。
- 负责人核 `reports/炼器阁/20261022_负责人核_同行AI_design46_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261022_负责人令_同行AI_design46_release_v0628.md`。
- dry-run 0 阻断后实发；未跳过 precheck（首跑因 master 无 node_modules／tsc 阻断；`npm ci` 补齐依赖后重跑实发 EXIT0）。

## 流程

1. `tools/release.sh v0.6.28 --from 1d953e2987aa050923bba7e9046a564b2546e0bd --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 全过 **EXIT0**；脚本内 Pages 已达 **200**（未超时；未重跑 release.sh／未 force／未改 tag）。
3. Pages：**HTTP 200**（2026-10-22 20:13 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Companion／其它 OpenFlag；**未**引入 softOpenedCompanion＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另枝。
- **未**开三技能整包／开 gifts／接 support。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- follow／free／stay／解散／area／反伤 保持（v0.6.23–27）；夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；巢穴保持（v0.6.22）；本令只授权 **v0.6.28** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无（Pages 脚本内已 200）。
