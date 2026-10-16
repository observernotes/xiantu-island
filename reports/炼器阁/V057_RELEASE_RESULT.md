# V057_RELEASE_RESULT

- **试玩**：https://observernotes.github.io/xiantu-island/v0.5.7/
- **基线 tip / master / tag^{}**：`72be6eb821800157867d17cee499af8400f04df0`（annotated tag `v0.5.7` → object `5d54b85fbe34e829e6aa776ea35881dfa98acd8a`）
- **gh-pages**：`e2dcf77`（`dcfd136..e2dcf77`）
- **本地包**：`releases/v0.5.7/` + `releases/v0.5.7_SHA256.json`（904 文件与 dist/ghp 一致）
- **日志**：`qa/out/release_v0.5.7_20261016_143552_112128729.log`
- **执法堂进包回归**：`qa/out_spirit_release_72be6eb/report.md` **PASS**

## 开关旁证（正式包）

| 项 | 值 | md5 |
|----|----|-----|
| `features.spiritScan` | **true** | features.json `a06c3638796fd1bed9af3d45c038c954` |
| `features.talismanCraft` | **true** | ↑ |
| `features.sectRanks` | **true** | ↑ |
| `features.sectShopLibrary` | **true** | ↑ |
| `features.sectDonations` | **true** | ↑ |
| `features.lifeSkillCurve` | **false** | ↑ |
| #19 `gongfa_grades` / #20 `qi_density` | 仍关 | （执法堂旁证一致） |

## 发前确认

- HEAD/`master` = `72be6eb`（spiritScan 开态 + sense-smoke 关态 preamble `77047a8`）。
- tip `origin/dev` 超前 master（含 `ui-tiles-secret`）；**未** ff 进本次发版。
- 故用 `tools/release.sh v0.5.7 --from 72be6eb`（非默认 `--from master`）。
- precheck all --worktree master：0 阻断；dry-run 0 阻断。
- 执法堂进包回归@`72be6eb` PASS；PASS 前未发版。
- 发版前已清 master 未跟踪 `reports/炼器阁/V056_RELEASE_RESULT.md`（workspace 已有副本）。

## 流程

1. `tools/release.sh v0.5.7 --from 72be6eb --dry-run` → 0 阻断。
2. `tools/release.sh v0.5.7 --from 72be6eb`（非 dry-run）。
3. precheck → snapshot build（leak-check PASS，904 files）→ annotated tag → ff hotfix/qa → push origin master/hotfix/qa/dev/v0.5.7 → gh-pages 拷贝/提交/push → 本地 releases → Pages 轮询。
4. Pages：404×8 后 **HTTP 200**（14:37 UTC+8）。
5. `releases/URL.txt` 已写入 v0.5.7 行。

## 未做

- **未** 开 `lifeSkillCurve` / #19 / #20。
- **未** 把 tip 的 `ui-tiles-secret` 强合进 master / 本次发版包。
- **未** 启用无 `?cheat=1` 的作弊。

## 给后续

- 试玩链接已可转负责人与项目经理；lifeSkillCurve / #19#20 仍关。
- tip `origin/dev` 仍含 ui-tiles（未进 v0.5.7）；进正式包另等令。
