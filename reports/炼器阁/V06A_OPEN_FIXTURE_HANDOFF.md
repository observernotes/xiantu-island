# v0.6a IndexedDB 存档（#12c）开态 fixture 抽检交接

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`；交付分支：`origin/dev`。

同步基线：`22006bec08aecf59921697d413216bd541ef5008`（v0.6a 关态 handoff / #12c + TD-V06-01），已执行 `git fetch origin`、`git pull --ff-only origin dev`，Already up to date。

TIP_SHA：`0bd0442174f9daa9db0641c1f7e8c09cbd96084e`（docs-only；基线测例绿于 `22006bec08aecf59921697d413216bd541ef5008`，无产品/测例改动；已普通 push 至 `origin/dev`，未 force-push）。

## 结果与改动范围

- `npm run test:save-slots`、`npm run test:mainline-56` 在 tip `22006be` 上本就 PASS（关态覆盖正式 `indexedDbSaves=false`；开态仅 `setFeatureFlag('indexedDbSaves', true)` 内存克隆）。
- `npx tsc --noEmit`、`git diff --check` PASS。
- **未修改产品源码、测例或任何正式表。** 仅本 RESULT + `status/炼器阁.md` docs 钉 SHA。
- **正式 `data/features.json.indexedDbSaves` 保持严格布尔 `false`；禁止翻开关。** gifts 仍关；未做 6b+；未发版。

## 开态抽检入口

在 `/workspace/xiantu/wt/dev` 执行：

```bash
npm run test:save-slots
npm run test:mainline-56
```

开态仅内存克隆：`setFeatureFlag('indexedDbSaves', true)`（`src/save-slots.test.ts` 开态 Progress 段）；测三槽独立读写、文件导出/导入、旧 `xiantu_save_v1` → slot1 迁移、无 auto 槽；`finally` 恢复 `indexedDbSaves=false`。关态段开头断言正式配置默认关闭并强制 `setFeatureFlag(..., false)`。

**禁止编辑正式 `data/features.json` 把 `indexedDbSaves` 改 `true` 来跑开态抽检。** `setFeatureFlag` 不写正式配置。

### 开态抽检要点（供执法堂）

| 场景 | 期望 |
| --- | --- |
| 关态 | 正式 `indexedDbSaves=false` → 同步 localStorage 单槽；不创建槽键/自动档 |
| 开态夹具 | `setFeatureFlag(true)` → 三槽（1/2/3）独立；导出/导入跨槽；旧档迁 1 号；无 auto 槽 |
| 边界 | 配额/事务失败不半写；迁移失败保留旧主档；非法字段导入不覆盖 |

## 关态与正式门禁旁证

以下已直接读取正式快照核对，**未写表**：

| 项目 | 当前值 / 旁证 |
| --- | --- |
| `data/features.json.indexedDbSaves` | **`false`**；文件 SHA-256 `f5326ab47ca72919592a933bcd4f77127a44f87943ddeb648a6cd5616b9ef50f` |
| `data/features.json.lifeSkillCurve` | **`true`**（保持；勿改回） |
| `npcs[].affinity.gifts.enabled` | 9/9 为 `false`，启用数 0/9 |
| 自动档 | `SAVE_SLOT_KEYS=[1,2,3]`；测例 `autoSlot:false` |

## UI 债（旁注 · 不挡交接）

- 开态 DOM overlay「存档」面板（`?saves=1`）；未接入主 HUD 视觉规范；关态不显示。
- 开态玩法同步 `save()` 尚未全改异步——正式开态需另令接线。
- 记下不挡本开态 fixture PASS / 执法堂抽检。

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:save-slots` | PASS，退出码 0；195 assertions；`indexedDbSavesDefault:false`，`slotKeys:[1,2,3]`，`autoSlot:false` |
| `npm run test:mainline-56` | PASS，退出码 0；snapshot/shared 各 333 assertions |
| `npx tsc --noEmit` | PASS，退出码 0 |
| `git diff --check` | PASS，退出码 0 |
| 产品/测例改动 | **无**（测例本就绿；开态路径已在 #12c@`3a0129e`） |
| 交接文档 | `reports/炼器阁/V06A_OPEN_FIXTURE_HANDOFF.md` + `status/炼器阁.md` docs-only 普通 push |

## 请执法堂（三行交接）

【执法堂 1/3】v0.6a 开态 fixture 已交检：`npm run test:save-slots`（195）+ `npm run test:mainline-56`（333×2）PASS；tsc/diff-check PASS；开态仅 `setFeatureFlag(indexedDbSaves=true)` 内存克隆（三槽+导出导入+旧档迁1号；无自动档），正式表未翻。

【执法堂 2/3】正式 `features.indexedDbSaves=false`（SHA-256=f5326ab47ca72919592a933bcd4f77127a44f87943ddeb648a6cd5616b9ef50f）；gifts 仍关 9/9 false；lifeSkillCurve 保持 true；UI 债（overlay/异步）旁注不挡。

【执法堂 3/3】TIP_SHA=0bd0442174f9daa9db0641c1f7e8c09cbd96084e（基线 22006bec08aecf59921697d413216bd541ef5008；或其后含本 RESULT 的 origin/dev HEAD）；请出 `qa/out_v06a_open_<sha>/`；本 PASS ≠ 翻开关 ≠ 进包，未发版；禁止据此改正式 features.indexedDbSaves。
