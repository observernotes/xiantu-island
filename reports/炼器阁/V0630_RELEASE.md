# V0630_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.30/
- **master / tag^{}**：`ccb06af0c410f04edec54215398ebdeed82ee5d5`（annotated tag `v0.6.30` → object `7ca629e809b5f9752b64961e90452eb31c651ab9`）
- **内容 tip（--from）**：`e951b229ab1eaa44b5f7dbc79dec50c846c6dc96`（soft-open 交件；含于 master=`ccb06af0`）
- **业务 tip**：`2e0ca04d365d8e7b208aa2aa3976e45cfde62b41`（wire tip 钉；含实现）⊂ soft tip ⊂ master
- **实现**：`8738405bbc7a43579e9f6256105716e63be41088`（苏师姐 support＝sword_shield：supportLocked=false／schedule＝primary_area_and_support／仅 sword_shield 主动 buff／stay 默认不放／forbidEmit 仍；表 30／30000／60000／0.05／damageRatio0／reflect0.5／不进预算／N＝2／＜3000ms／倒地清；无新 OpenFlag／无 softOpenedCompanion＊；41–47 未漂）⊂ soft tip ⊂ master
- **分支 tip / origin**：发版 tip `ccb06af0`（hotfix/qa 同＝master）；feat/companion-support-sword-shield 普通快进合入（含 soft tip `e951b229`＋docs tip 钉 `ccb06af0`）
- **gh-pages**：`51e66326a6c8928110af942eb28e9ca84a2e31dc`（`4a72657..51e6632`）
- **本地包**：`releases/v0.6.30/` + `releases/v0.6.30_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `6efc99a4b14e3d254242c8802e349947a2955b35c8ae125b6be0ff56e1e50dbe`）
- **日志**：dry-run `qa/out/release_v0.6.30_20261022_223337_450811711.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `cd576fc2` → `ccb06af0`）；实发主日志 `qa/out/release_v0.6.30_20261022_223339_650728697.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包 **成功**；脚本内 Pages 轮询 300s 超时仍 404→EXIT1；**未** force／**未** skip-precheck／**未**重跑 release.sh）。后续独立轮询至 **HTTP 200**（2026-10-22 22:45 Asia/Shanghai）后补记 URL.txt。
- **Pages**：脚本内超时后独立 `curl` 轮询至 **HTTP 200**（2026-10-22 22:45 Asia/Shanghai；URL.txt 已记）；`curl -sI` 亦 **200**；**无需**重跑 release.sh／未改 tag。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/48 同行 AI 苏师姐 support＝sword_shield soft-open | **开放**：supportLocked=false；schedule＝`primary_area_and_support`；仅 `sword_shield` 主动 buff；stay 默认不放；forbidEmitSwordShield **仍 true**；表 mpCost**30**／CD**30000**／duration**60000**／damageReduce**0.05**／damageRatio**0**；reflectRatio**0.5**；support **不进**伤害预算；饿死 N＝**2**；优先门槛＝无 buff 或剩余＜**3000ms**；倒地清 `activeSupportBuff`；复起重 CD |
| softOpenedCompanion＊／CompanionOpenFlag | **无**（本发不引入；生产 dist HIT=0；仅测负向断言） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
| design/47 同行 AI 好感来源 soft | **保持**（已在 v0.6.29） |
| design/46 同行 AI 零血复起 soft | **保持**（已在 v0.6.28） |
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
| 硬读旁证 | supportLocked=false／schedule＝primary_area_and_support／仅 sword_shield／stay不放／forbidEmit仍；表 30／30000／60000／0.05／damageRatio0／reflect0.5／N＝2／＜3000ms／倒地清；41–47未漂；companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `cd576fc2` → `ccb06af0`（含实现 `8738405b`＋业务 tip `2e0ca04d`＋soft tip `e951b229`＋docs soft tip 钉 `ccb06af0`），**普通 push**；禁 force。
- soft tip 全长 `e951b229ab1eaa44b5f7dbc79dec50c846c6dc96` ⊂ master；实现／业务 tip ⊂ soft tip（相对实现零业务 diff soft←实现）。
- 执法 out `qa/out_companion_support_sword_shield_soft_e951b229/` PASS：O01–O07／C01／C02／C04／C05；released=false／newOpenFlag=false／无 softOpenedCompanion＊／CompanionOpenFlag／硬读钉齐／冻结 SHA MATCH。
- 负责人核 `reports/炼器阁/20261022_负责人核_同行AI_design48_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261022_负责人令_v0.6.30_release.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.30 --from e951b229ab1eaa44b5f7dbc79dec50c846c6dc96 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包全过；脚本内 Pages 300s 超时仍 404→脚本 EXIT1（已完成步骤保留；**未** force／**未**改 tag／**未**重跑 release.sh）。
3. 独立轮询 Pages 至 **HTTP 200**（2026-10-22 22:45 Asia/Shanghai）；补记 `releases/URL.txt`。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Companion／其它 OpenFlag；**未**引入 softOpenedCompanion＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另枝。
- **未**开三技能整包／开 gifts／另开未登记 support／解除 forbidEmit。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）；**未**重跑 release.sh。
- follow／free／stay／解散／area／反伤／复起／好感来源 保持（v0.6.23–29）；夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；巢穴保持（v0.6.22）；本令只授权 **v0.6.30** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无（Pages 独立轮询已 200＠22:45 Asia/Shanghai；脚本超时不阻断已发产物）。
