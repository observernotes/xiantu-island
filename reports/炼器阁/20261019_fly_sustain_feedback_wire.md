# design/37 · 持续飞行进入／结束反馈 · tip 落键＋接线

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验打磨_持续飞行进入结束反馈_接线.md`  
> design/37 §2／§3／§3.1／§4；核记 `reports/炼器阁/20261019_负责人核_design37_飞行进入结束反馈.md`  
> Codex：sol **403／workspace routing discovery failed** → **旁路直写**（log `logs/codex/51ffea7d4732de4c_20261019_150358_278614.log`）  
> **≠ soft-open ≠ release ≠ Pages ≠ 新 OpenFlag ≠ 重挂 B′**  
> 现网仍 **v0.6.18**。

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/fly-sustain-feedback-wire` |
| 基线 | `09ddf9b`（master／v0.6.18） |
| tip SHA | `31bd9bd61351676e2dc82b57a44f744ebb6c923f`（短 `31bd9bd`） |
| worktree | `/workspace/xiantu/wt/feat/fly-sustain-feedback-wire` |
| origin | 已推 `origin/feat/fly-sustain-feedback-wire` |
| 旁路 | 是（Codex 403） |

## 2. 改动文件清单

| 路径 | 说明 |
|---|---|
| `data/balance/strings_zh.json` | 仅新增三键（文案一字不改）；既有七个 `fly.*` 未动 |
| `/workspace/xiantu/balance/strings_zh.json` | 共享镜像同字节同步（惯例；不进本 git 提交） |
| `src/scenes/GameScene.ts` | enter／cancel→land／timeout 各一次 tip；mp／leave／knockdown／map／die 不叠 |
| `src/fly-sustain-feedback.test.ts` | 关态自测 34 断言（新建） |
| `scripts/v06b-closed-test.mjs` | 挂载本测＋formal 断言含三新键 |
| `reports/炼器阁/20261019_fly_sustain_feedback_wire.md` | 本 RESULT（docs 提交） |

**未改**：`fly_zones.json`／`mpPerSecond`／`maxFlightMs`／冲刺 `trySwordRide`／skills／OpenFlag／maps／sash-shoe／Encounter。

## 3. 三键（MATCH）

| key | 中文 | 校验 |
|---|---|---|
| `fly.sustain_enter` | 御剑升空。 | MATCH |
| `fly.sustain_land` | 御剑落地。 | MATCH |
| `fly.sustain_timeout` | 御剑力尽，缓缓落地。 | MATCH |

- strings SHA-256（shared＝snapshot）：`3bf31277a928679b7c4e3b796d8baf67e9837198c45ac656f37d42217166d16e`
- 既有七键文案字节未变；无第四成功键。

## 4. 接线摘要

1. **enter**：`requestSustainFlight` 成功设 `sustainFlight` 后 `this.log(t('fly.sustain_enter'), '#d0d0d0')` **一次**；失败路径仍 `messageKey`，**零** enter。  
2. **cancel**：`endSustainFlight('cancel')` 内 tip `fly.sustain_land` **一次**。  
3. **timeout**：`endSustainFlight('timeout')` 内 tip `fly.sustain_timeout` **一次**。  
4. **互斥**：`mp`／`leave`／`knockdown`／`map`／`die` 不 tip land／timeout／enter（mp／leave／knockdown 仍走既有 tip）。

## 5. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:v06b-closed` | **PASS**（含 fly sustain feedback **34** assertions × shared＋snapshot；sword ride 56；fly zones 115） |

抽检口径：失败进入既有 tip＋零 enter；成功一次 enter；再按一次 land；timeout 一次 timeout；leave／mp 不叠 land／timeout。

## 6. 禁项自证

| 禁项 | 证据 |
|---|---|
| 不改 `fly_zones.json` | SHA 仍 `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4` |
| 不改 skills／冲刺 | skills SHA 仍 `d80abaf1…`；`trySwordRide` 未改 |
| 无新 OpenFlag | 未引入／未翻 Flag |
| ≠soft／≠release／≠Pages | 本刀未授权；未合 master／dev 快进发版 |
| 勿捆 sash/shoe／Encounter | 独立枝 `feat/fly-sustain-feedback-wire` |
| 禁重挂 B′ | 仅 tip＋反馈接线 |

## 7. 交回

【fly反馈接线已交】tip＝31bd9bd61351676e2dc82b57a44f744ebb6c923f｜报告＝`reports/炼器阁/20261019_fly_sustain_feedback_wire.md`｜自测＝v06b-closed PASS（34 feedback）｜禁项＝守｜阻断＝无｜等负责人核 tip SHA → 另令开态／执法 C·O
