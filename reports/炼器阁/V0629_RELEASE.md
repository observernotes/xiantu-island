# V0629_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.6.29/
- **master / tag^{}**：`e2e38ea163784a7af3ea2645c6a1e0108811830d`（annotated tag `v0.6.29` → object `17523353ae6684c6aecaf5f9d94306326a8b5327`）
- **内容 tip（--from）**：`1bdbc822f49d926c701c4e9c00eaac3e5918e368`（soft-open 交件；含于 master=`e2e38ea1`）
- **业务 tip**：`22881f72f766d4b96f9016dc4e1a521fb71e3d21`（wire tip 钉；含实现）⊂ soft tip ⊂ master
- **实现**：`a09fc8fc9b0b340ccb8caebc783a57d7a3027376`（苏师姐三引导 meet／tour／confide＋sources 恰 3／delta＝100／100／100→confidant→invite；gifts 关；邀请只比档位不查礼；无新 OpenFlag／无 softOpenedCompanion＊；41–46 未漂）⊂ soft tip ⊂ master
- **分支 tip / origin**：发版 tip `e2e38ea1`（hotfix/qa 同＝master）；feat/companion-affinity-sources 普通快进合入（含 soft tip `1bdbc822`＋docs tip 钉 `e2e38ea1`）
- **gh-pages**：`4a72657095d49ebba578ba2c7c5d1ffa8a604ca7`（`9f781fd..4a72657`）
- **本地包**：`releases/v0.6.29/` + `releases/v0.6.29_SHA256.json`（938 文件与 dist/ghp 一致；清单文件 SHA256 `4f954524b7aff033647eb3ca968ee67963c8a5296631d81364a99735acb22b15`）
- **日志**：dry-run `qa/out/release_v0.6.29_20261022_212829_891196593.log`（**EXIT 0，0 阻断**；发前已将 master 普通快进 `e9290228` → `e2e38ea1`）；实发主日志 `qa/out/release_v0.6.29_20261022_212832_372559584.log`（precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages **成功** EXIT0）。未 `--skip-precheck`；**未** force。
- **Pages**：脚本内轮询至 **HTTP 200**（2026-10-22 21:30 Asia/Shanghai；URL.txt 已记）；`curl -sI` 亦 **200**；**无需**超时后续轮询／未重跑 release.sh。

## 宣传点 / 开关

| 项 | 值 |
|----|----|
| design/47 同行 AI 苏师姐好感来源 soft-open | **开放**：三引导 `q_su_fellow_meet`／`q_su_fellow_tour`／`q_su_fellow_confide` done→sources once→affinity delta＝**100／100／100**（合计 **300**）→档位 confidant→invite；gifts 仍关；邀请只看档位不查礼；无第四 sources／kill／encounter 刷好感；禁挂 `q_main_02`／`q_elder_exam` |
| softOpenedCompanion＊／CompanionOpenFlag | **无**（本发不引入；生产 HIT=0；仅测负向断言） |
| 新 OpenFlag | **无**（六 Flag 仍：Market／Forge／Enhance／Enchant／Salvage／Tower） |
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
| 硬读旁证 | sources 恰 **3**／delta**100／100／100**／gifts.enabled=false／禁挂／invite 只比档位；41 follow96／320／320＋CD1200＋240×0.35；42 KeyV＋free／stay；43 dismiss≠KeyV；44 area CD4000／w160·h80·behind32／N＝2；45 reflectRatio**0.5**／forbidEmit／budget×0.35／stay不放；46 reviveMs**30000**／maxHp／iFrames**1000**／原地；companions `e4eb87c1…`／skills `d80abaf1…` MATCH |

## 发前确认

- 发前手动 ff：`master` `e9290228` → `e2e38ea1`（含实现 `a09fc8fc`＋业务 tip `22881f72`＋soft tip `1bdbc822`＋docs soft tip 钉 `e2e38ea1`），**普通 push**；禁 force。
- soft tip 全长 `1bdbc822f49d926c701c4e9c00eaac3e5918e368` ⊂ master；实现／业务 tip ⊂ soft tip（相对实现零业务 diff soft←实现）。
- 执法 out `qa/out_companion_affinity_sources_soft_1bdbc822/` PASS：O01–O06／C01／C02／C04；released=false／newOpenFlag=false／无 softOpenedCompanion＊／CompanionOpenFlag／硬读钉齐／冻结 SHA MATCH。
- 负责人核 `reports/炼器阁/20261022_负责人核_同行AI_design47_soft.md` VERIFY_PASS；令文 `reports/天机阁/20261022_负责人令_v0.6.29_release.md`。
- dry-run 0 阻断后实发；未跳过 precheck。

## 流程

1. `tools/release.sh v0.6.29 --from 1bdbc822f49d926c701c4e9c00eaac3e5918e368 --dry-run` → **0 阻断**。
2. 实发：precheck/build/tag/hotfix+qa ff／push／gh-pages／本地包／Pages 全过 **EXIT0**；脚本内 Pages 已达 **200**（未超时；未重跑 release.sh／未 force／未改 tag）。
3. Pages：**HTTP 200**（2026-10-22 21:30 Asia/Shanghai）。

## 未做 / 禁项

- **未**抬 GAME_PHASE；**未**改六 OpenFlag 任意字节；**未**回翻 Flag=false。
- **未**新建 Companion／其它 OpenFlag；**未**引入 softOpenedCompanion＊。
- **未**捆 sash/shoe／outfits png／阵法／gifts／#20；**未**捆夺宝／跳跃／巢穴另枝。
- **未**开三技能整包／开 gifts／接 support。
- **未** force-push；**未**跳过 dry-run／precheck（`--skip-precheck` 未用）。
- follow／free／stay／解散／area／反伤／复起 保持（v0.6.23–28）；夺宝保持（v0.6.20）；跳跃保持（v0.6.21）；巢穴保持（v0.6.22）；本令只授权 **v0.6.29** 一次。
- **未** SendToUser／直推用户试玩链（交主程序短报经理+负责人）。

## blocker

无（Pages 脚本内已 200）。
