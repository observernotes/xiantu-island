# V0510_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.5.10/
- **基线 tip / master / tag^{}**：`15e6088dd92db9930aa970ce0ac68f8121fee531`（annotated tag `v0.5.10` → object `6c7fa5802f7d4c71daa7918d530d4a0fbd12803e`）
- **gh-pages**：`3d9a4ce`（`4aa7ebb..3d9a4ce`）
- **本地包**：`releases/v0.5.10/` + `releases/v0.5.10_SHA256.json`（938 文件与 dist/ghp 一致）
- **日志**：`qa/out/release_v0.5.10_20261016_165543_995201956.log`
- **执法堂**：奇遇 runner@15e6088 PASS（qa/out_encounters_runner_15e6088/）；开态准备@2fc18d1 PASS；奇遇 UI@5ccb9c7 PASS

## 包内容

| 项 | SHA / 说明 |
|----|------------|
| 奇遇 runner + 开态准备 | `cd9b71b` / `f0da58a`（tip `15e6088`） |
| 奇遇 UI | `5ccb9c7`（合入 `999cd9c` / tip `cba0938` 线） |
| cloth_shade_r1 | `79804d6`（合入 `69c2a90`） |
| v0.5.9 基线 | `ce8816e`（#21 主线 + alchemy） |

## 开关旁证（正式包）

| 项 | 值 | md5 |
|----|----|-----|
| `features.spiritScan` | **true** | features.json `a06c3638796fd1bed9af3d45c038c954` |
| `features.talismanCraft` | **true** | ↑ |
| `features.lifeSkillCurve` | **false** | ↑ |
| #19 `gongfa_grades` | **false**（未开） | （未改 features） |
| #20 `qi_density` | **false**（未开） | ↑ |
| v0.5c 奇遇 `encounters` | 5 条全 `enabled:false` | ↑ |
| v0.5c 好感 `npcs.affinity` | 关 | ↑ |
| v0.5c 正魔 / questHooks | 关 | ↑ |

## 发前确认

- tip `wt/dev` / `origin/dev` = `15e6088`。
- 发前手动 ff：`master` `ce8816e` → `15e6088` 并 push（脚本不合并 dev）。
- 用 `tools/release.sh v0.5.10 --from 15e6088`。
- dry-run：0 阻断；precheck all --worktree master：通过；leak-check PASS（938 files）。
- **未**改 features.json；**未**翻 encounters 五事件 enabled；**未** force-push。

## 流程

1. `tools/release.sh v0.5.10 --from 15e6088 --dry-run` → 0 阻断。
2. `tools/release.sh v0.5.10 --from 15e6088`（实发）。
3. precheck → snapshot build → annotated tag → ff hotfix/qa → push origin master/hotfix/qa/dev/v0.5.10 → gh-pages 拷贝/提交/push → 本地 releases → Pages 轮询。
4. Pages：404×4 后 **HTTP 200**（16:56 UTC+8）。
5. `releases/URL.txt` 已写入 v0.5.10 行。

## 未做 / 保持关态

- **未** 开 `lifeSkillCurve` / #19 / #20。
- **未** 开 v0.5c 奇遇五事件 / 好感 / 正魔（关态骨架进包；runner+UI 预接）。
- **未** 宣传奇遇开放。

## 给经理三行

1. **v0.5.10 已发**：master/tag^{}=`15e6088`；试玩 https://observernotes.github.io/xiantu-island/v0.5.10/
2. 含奇遇 runner+UI+cloth_shade；**五事件 enabled 仍 false**；features.md5=`a06c3638…`；#19#20/lifeSkillCurve/好感/正魔仍关。
3. RESULT：`reports/炼器阁/V0510_RELEASE.md`；请转负责人 Pages 链接。
