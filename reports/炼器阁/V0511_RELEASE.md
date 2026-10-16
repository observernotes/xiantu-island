# V0511_RELEASE

- **试玩**：https://observernotes.github.io/xiantu-island/v0.5.11/
- **基线 tip / master / tag^{}**：`d8fbc4f6a1205893b426e31f974766c2bf9516ce`（annotated tag `v0.5.11` → object `7cd1b726788c102f2773cbddc9b073a7eafde3f9`）
- **gh-pages**：`5a0e1a9`（`3d9a4ce..5a0e1a9`）
- **本地包**：`releases/v0.5.11/` + `releases/v0.5.11_SHA256.json`（938 文件与 dist/ghp 一致）
- **日志**：`qa/out/release_v0.5.11_20261016_174334_933849123.log`
- **执法堂**：翻表冒烟复验@8576896 PASS（`qa/out_encounters_flip_8576896/`；props/runner/ui 全绿）
- **宣传点**：奇遇五事件软开

## 包内容

| 项 | SHA / 说明 |
|----|------------|
| 开态 preamble + 翻表快照 | `8576896`（合入 tip `d8fbc4f`） |
| sense hidden 12→13 | `101966d` |
| 奇遇开态基线 | `1512b51` 线 |
| 奇遇 runner + UI + cloth_shade | 随 tip（v0.5.10 已含） |
| v0.5.10 基线 | `15e6088` |

## 开关旁证（正式包 / tip 源表）

| 项 | 值 | md5 |
|----|----|-----|
| v0.5c 奇遇 `encounters` 五事件 | **5 条全 `enabled:true`** | encounters.json `8bc7fb4a325ad6368bd5f2e5c15552da` |
| 包内旁证（snapshot JS） | `enabled:!0`（minified true）于 `assets/index-C6H5KlvM.js` | ↑ |
| `features.spiritScan` | **true** | features.json `a06c3638796fd1bed9af3d45c038c954` |
| `features.talismanCraft` | **true** | ↑ |
| `features.lifeSkillCurve` | **false** | ↑ |
| #19 `gongfa_grades` | **false**（未开） | （未改 features） |
| #20 `qi_density` | **false**（未开） | ↑ |
| v0.5c 好感 `npcs.affinity` | 关 | ↑ |
| v0.5c 正魔 / questHooks | 关 | ↑ |

## 发前确认

- tip `wt/dev` / `origin/dev` = `d8fbc4f`（含 `8576896` 开态 preamble+翻表）。
- 发前手动 ff：`master` `15e6088` → `d8fbc4f` 并 push（脚本不合并 dev）。
- 用 `tools/release.sh v0.5.11 --from d8fbc4f`。
- dry-run：0 阻断；precheck all --worktree master：通过；leak-check PASS（938 files）。
- **未**改回五事件 enabled；**未**开 lifeSkillCurve/#19/#20/好感/正魔；**未** force-push。

## 流程

1. `tools/release.sh v0.5.11 --from d8fbc4f --dry-run` → 0 阻断。
2. `tools/release.sh v0.5.11 --from d8fbc4f`（实发）。
3. precheck → snapshot build → annotated tag → ff hotfix/qa → push origin master/hotfix/qa/dev/v0.5.11 → gh-pages 拷贝/提交/push → 本地 releases → Pages 轮询。
4. Pages：404×4 后 **HTTP 200**（17:44 UTC+8）。
5. `releases/URL.txt` 已写入 v0.5.11 行。

## 未做 / 保持关态

- **未** 开 `lifeSkillCurve` / #19 / #20。
- **未** 开 v0.5c 好感 / 正魔。
- **已** 开奇遇五事件（软开进包；宣传点：奇遇五事件软开）。

## 给经理三行

1. **v0.5.11 已发**：master/tag^{}=`d8fbc4f`；试玩 https://observernotes.github.io/xiantu-island/v0.5.11/
2. **奇遇五事件 enabled=true 进包**；encounters.md5=`8bc7fb4a…`；features.md5=`a06c3638…`；#19#20/lifeSkillCurve/好感/正魔仍关。
3. RESULT：`reports/炼器阁/V0511_RELEASE.md`；请转负责人 Pages 链接（宣传点：奇遇五事件软开）。
