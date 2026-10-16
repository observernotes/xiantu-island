# #19 功法品阶（gongfa_grades）开态抽检交接

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`；交付分支：`origin/dev`。

同步基线：`2ec326541a9bc6bf197ff81607537a92a414a381`（v0.5.14 lifeSkillCurve），已执行 `git fetch origin`、`git pull --ff-only origin dev`。

TIP_SHA：`d1b71059db4bd58441ae3abe58ef1179bcf24995`（已普通 push 至 `origin/dev`，未 force-push）。

提交：`test(gongfa): adapt qi-legacy turnIn for open questHooks choice`（测例最小修补）；本交接文档另以 docs commit 钉 SHA。

## 结果与改动范围

- `npm run test:gongfa-grades` 在 tip 上本就 PASS（关态/坏表/内存开态克隆均覆盖）。
- `npm run test:gongfa-qi-legacy` 因正魔 `questHooks`（`prologue_medicine` / `q_awaken`）正式 `enabled=true` 漂移：无显式 choice 时 `QuestSystem.turnIn` 返回 `undefined`。
- 仅修改 `scripts/gongfa-qi-legacy-test.mjs`：`turnIn('q_awaken')` → `turnIn('q_awaken', false, 'return')`，与 `src/affinity.test.ts` 开态显式选择一致。未改产品源码、未改任何正式表。
- **正式 `gongfa_grades` 根及全部 bindings / future 子项 `enabled` 保持 `false`；禁止翻开关。** #20 `qi_density` / gifts 仍关；`features.lifeSkillCurve` 保持 `true`（勿改回）。

## 开态抽检入口

在 `/workspace/xiantu/wt/dev` 执行：

```bash
npm run test:gongfa-grades
npm run test:gongfa-qi-legacy
```

开态仅内存克隆：`structuredClone` 后设根 `enabled=true` 且 `bindings[].enabled=true`（`open-clone` 变体；`spirit_bolt` 另夹 `effectMode=none` 校验不乘伤害倍率）。关态/坏表变体读正式关闭表或故意删 `grades`/`tiers`。

**禁止编辑正式 `data/balance/gongfa_grades.json`（或共享 `balance/gongfa_grades.json`）把任一 `enabled` 改 `true` 来跑开态抽检。** 内存克隆不写正式配置。

### 开态抽检要点（供执法堂）

| 场景 | 期望 |
| --- | --- |
| 关态 | 正式表全部 `enabled=false` → `effectMul=1`；战斗 / 学习 / 升级与 legacy 逐字节一致 |
| 开态夹具 | 根+bindings 内存 `enabled=true` → `damage_ratio` 技能根系数乘对应 `grade.effectMul` **一次**；`none` 不乘；legacy `levelCap` 不截断旧 `maxLevel`；`future` 仍 unavailable |
| 坏表 | 配置不可用时不阻断旧攻击 / 学习升级 / 探索落点 / 任务接取交付 |

## 关态与正式门禁旁证

以下已直接读取正式快照核对，**未写表**：

| 项目 | 当前值 / 旁证 |
| --- | --- |
| `data/balance/gongfa_grades.json` | SHA-256 `48cca756168dc7dabdac4d126ba61805e23139a48c857df98d0542642d9c52e1`；与 `/workspace/xiantu/balance/gongfa_grades.json` 同字节 |
| #19 enabled | **46/46 为 `false`**（根 1 + bindings 38 + future 子项）；`enabled:true` 计数 **0** |
| #20：`qi_density.enabled` | 正式表 SHA-256 `c1c3694179d9053652ab27f8fa2153442e33716329c8c863ecc87a020c06af16`；enabled 4/4 为 `false` |
| `npcs[].affinity.gifts.enabled` | 9/9 为 `false`，启用数 0/9 |
| `data/features.json.lifeSkillCurve` | **`true`**（v0.5.14 软开）；文件 SHA-256 `8d00e0668e3fecd3510db97dc261a65cba58c39cb18069e533c43b65fa2532eb`；**勿改回 false** |

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:gongfa-grades` | PASS，退出码 0；875 assertions（snapshot/shared × 正常表/坏表） |
| `npm run test:gongfa-qi-legacy` | PASS，退出码 0；872 assertions；combatCases=540，seclusionCases=60 |
| `npx tsc --noEmit` | PASS，退出码 0 |
| `git diff --check` | PASS，退出码 0 |
| 测例提交 | 仅 `scripts/gongfa-qi-legacy-test.mjs`，1 行；`2ec3265..d1b7105` 已普通 push |
| 本交接 | docs commit 钉 TIP（见推送后 HEAD） |

## 请执法堂（三行交接）

【执法堂 1/3】#19 开态 fixture 已交检：`npm run test:gongfa-grades`（875）+ `npm run test:gongfa-qi-legacy`（872）PASS；tsc/diff-check PASS；开态仅内存克隆根+bindings enabled=true，正式表未翻。

【执法堂 2/3】正式 gongfa_grades SHA-256=48cca756168dc7dabdac4d126ba61805e23139a48c857df98d0542642d9c52e1；46 enabled 全 false；#20/gifts 仍关；lifeSkillCurve 保持 true（勿改回）。

【执法堂 3/3】TIP_SHA=d1b71059db4bd58441ae3abe58ef1179bcf24995；本 PASS ≠ 翻开关 ≠ 进包，未发版；禁止据此改正式 gongfa_grades 任一 enabled。
