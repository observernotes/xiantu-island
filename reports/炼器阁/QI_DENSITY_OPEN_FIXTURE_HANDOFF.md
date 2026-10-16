# #20 灵气浓度（qi_density）开态抽检交接

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`；交付分支：`origin/dev`。

同步基线：`d5edaed275b0c1ae28f384ad6ab8c07a86642e41`（v0.5.15 / #19 已软开），已执行 `git fetch origin`、`git pull --ff-only origin tip/dev`（`git checkout -B tip origin/dev` 后 `git pull --ff-only origin dev`），Already up to date。

TIP_SHA：`2bd2e58ff94c6d915e184442ba4071123ecf8791`（docs-only；基线测例绿于 `d5edaed`，无产品/测例改动；已普通 push 至 `origin/dev`，未 force-push）。

## 结果与改动范围

- `npm run test:qi-density`、`npm run test:gongfa-qi-legacy` 在 tip `d5edaed` 上本就 PASS（关态/坏表/内存开态克隆均覆盖）。
- `npx tsc --noEmit`、`git diff --check` PASS。
- **未修改产品源码、测例或任何正式表。** 仅本 RESULT + `status/炼器阁.md` docs 钉 SHA。
- **正式 `qi_density` 根及 display / meditation / future.gathering 共 4 个 `enabled` 保持 `false`；禁止翻开关。** gifts 仍关；#19 `gongfa_grades` 保持开态（根+bindings true，future 仍 false）；`features.lifeSkillCurve` 保持 `true`（勿改回）。

## 开态抽检入口

在 `/workspace/xiantu/wt/dev` 执行：

```bash
npm run test:qi-density
npm run test:gongfa-qi-legacy
```

开态仅内存克隆：`structuredClone` / `clonedConfig` 后设根 `enabled=true` 且按场景打开子门禁：

| 夹具 | 内存开关 | 期望 |
| --- | --- | --- |
| 根+display | `enabled`+`display.enabled` | `resolveTier` 可按 Tiled `qiDensity` 分档（`ready`） |
| 根+meditation | `enabled`+`meditation.enabled` | `meditationFactor` 可读浓度因子（非 legacy） |
| 仅子开关 / 仅根 | 单独开 display 或 meditation / 仅根 | 无法绕过：仍 `pending` 或 `legacy/1` |
| future.gathering | 即便根+gathering 全开 | `gatheringAvailability` 仍 `unavailable`（未实现） |

关态/坏表变体读正式关闭表或 `parseQiDensityConfig(null)`；坏表不阻断旧学习/闭关（`qi-density` invalid-table + `gongfa-qi-legacy` 旁证）。Seclusion 闭关公式仍不叠地图浓度（关/开态 helper 旁证，未改闭关收益公式）。

**禁止编辑正式 `data/balance/qi_density.json`（或共享 `balance/qi_density.json`）把任一 `enabled` 改 `true` 来跑开态抽检。** 内存克隆不写正式配置。

### 开态抽检要点（供执法堂）

| 场景 | 期望 |
| --- | --- |
| 关态 | 正式表 4 enabled 全 false → `resolveTier`=`pending`；`meditationFactor`=`legacy`/1；gathering=`unavailable`；不写 `qiContext` 存档 |
| 开态夹具 | 根+display → 可分档；根+meditation → 可读浓度因子；子开关无法绕过根；坏表不阻断旧学习/闭关 |
| future.gathering | 即使打开仍 `unavailable`（未实现） |

## 关态与正式门禁旁证

以下已直接读取正式快照核对，**未写表**：

| 项目 | 当前值 / 旁证 |
| --- | --- |
| `data/balance/qi_density.json` | SHA-256 `c1c3694179d9053652ab27f8fa2153442e33716329c8c863ecc87a020c06af16`；与 `/workspace/xiantu/balance/qi_density.json` **同字节** |
| #20 enabled | **4/4 为 `false`**（根 + display + meditation + future.gathering）；`enabled:true` 计数 **0** |
| #19：`gongfa_grades` | SHA-256 `93348e896a40395b46a7e5637c9d5b55a004e590f7668cf0fad235f962520092`；根 true、bindings 38 true、future 7 false（共 true=39 / false=7）；**勿改回 false** |
| `npcs[].affinity.gifts.enabled` | 9/9 为 `false`，启用数 0/9（`data/balance/npcs.json`） |
| `data/features.json.lifeSkillCurve` | **`true`**（v0.5.14 起软开）；文件 SHA-256 `8d00e0668e3fecd3510db97dc261a65cba58c39cb18069e533c43b65fa2532eb`；**勿改回 false** |

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:qi-density` | PASS，退出码 0；snapshot/shared 各 303 assertions（含 invalid-table 原宗门闭关逐年输入一致） |
| `npm run test:gongfa-qi-legacy` | PASS，退出码 0；878 assertions；combatCases=540，seclusionCases=60 |
| `npx tsc --noEmit` | PASS，退出码 0 |
| `git diff --check` | PASS，退出码 0 |
| 产品/测例改动 | **无**（测例本就绿） |
| 交接文档 | `reports/炼器阁/QI_DENSITY_OPEN_FIXTURE_HANDOFF.md` + `status/炼器阁.md` docs-only 普通 push |

## 请执法堂（三行交接）

【执法堂 1/3】#20 开态 fixture 已交检：`npm run test:qi-density`（303×2）+ `npm run test:gongfa-qi-legacy`（878）PASS；tsc/diff-check PASS；开态仅内存克隆根+display / 根+meditation，正式表未翻。

【执法堂 2/3】正式 qi_density SHA-256=c1c3694179d9053652ab27f8fa2153442e33716329c8c863ecc87a020c06af16；4 enabled 全 false；gifts 仍关；#19 保持开（勿改回）；lifeSkillCurve 保持 true。

【执法堂 3/3】TIP_SHA=2bd2e58ff94c6d915e184442ba4071123ecf8791（基线 d5edaed275b0c1ae28f384ad6ab8c07a86642e41）；本 PASS ≠ 翻开关 ≠ 进包，未发版；禁止据此改正式 qi_density 任一 enabled。
