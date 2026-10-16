# 好感一期最小路径 RESULT

日期：2026-10-16（Asia/Shanghai）｜执行：炼器阁·主程序

- 工作区：`/workspace/xiantu/wt/dev`；基线：`57f7684`。
- 实现 tip 短 SHA：`dc41740`（运行时、存档和全部测例）。本 RESULT 随后独立文档提交；最终交付 tip 由结束 stdout 的 `TIP_SHA` 给出。
- 交付分支：`origin/dev`；普通 `git push origin dev`，网络失败按 2/4/8 秒退避，禁止 force。
- 结论：最小路径完成，可交执法堂用内存/fixture 开门禁抽检；正式好感及送礼仍全关，未发版。

## 实现

| 文件 | 行为 |
| --- | --- |
| `src/RelationshipState.ts`、`src/Progress.ts` | 顶层 `affinity` 整数映射、version 1 关系结构及三类收据/队列；严格导入校验；缺失补空；不追溯历史完成任务。首次迁移前原 JSON 保存到 `xiantu_save_relationship_v1_backup`，保留首份备份；备份失败暂停关系迁移与结算。 |
| `src/Affinity.ts` | `getAffinity` 经 Progress 原子懒初始化；档位取最高已达阈值；纯预览；安全整数增量裁剪；来源及奖励去重；返回值深冻结。关闭门禁先于参数/存档读取。 |
| `src/QuestSystem.ts` | 首次真实交付未完成→done 时登记来源；关闭配置入任务 pending，启用时结算。任务状态、奖励、好感及收据同次保存；日常交付也经事务。第 3 构造参数支持注入 fixture 配置。 |
| 来源消费者 | `consumeQuestAffinitySources(config, progress)` 整批原子消费已登记任务来源；`consumeEncounterAffinityHooks(config, progress)` 只消费既有 `encounters.pendingHooks[].payload.affinity`，不从 NPC 来源重复加值。未就绪项及其它 payload 保留，无可消费项不写盘；重复奇遇队列拒绝。 |
| 奖励接口 | `claimAffinityUnlock(config, npcId, unlockId, progress)` 达档后主动领取；背包拒绝、无到账、异常或保存失败全部回滚，收据 `npcId\|unlockId` 只落一次。 |

任务来源收据为 `npcId|quest|questId`，不得与同 id pending 并存；未登记来源不能污染收据。显式损坏关系收据保留并暂停消费，无好感来源的任务仍可交付。加载时丢弃非法好感数值，保留合法历史整数；未登记 NPC 不提供关系能力。已存越界整数查询返回 `invalid_save` 并保留原值，显式 preview/apply 可裁剪修复。

仅传数字映射的 `getAffinity` 会返回 `needsInitialization`，不会伪造持久化成功；正式持久写入传入 Progress，复用 `runSaveTransaction`。本期提供可测 API，未接送礼完整 UI、头顶图标或正魔 questHooks 结算。

## 验收

| 命令 | 结果 |
| --- | --- |
| `npm run test:affinity` | PASS；snapshot/shared 各 541 条好感断言、80 条关系存档断言，另各跑坏表模块图。 |
| `npm run test:encounter` | PASS；snapshot/shared 各 1445 条断言与坏表矩阵，producer 排队语义保持。 |
| `npm run test:encounter-runner` | PASS；snapshot/shared 各 runner 672 + battle 135 条。 |
| `npm run test:moral-save` | PASS；153 条。 |
| `npm run test:daily` | PASS；575 条。 |
| `npm run test:v04-save` | PASS；169 条，真实 v0.4.3 全档迁移，无历史好感补发，主档一次提交与原档备份分别核验。 |
| `npm run test:classes` | PASS；职业 9200、发布门禁 3990、任务原子奖励 128、职业入口 1747、宗门入口 1484 条。 |
| `npm run test:mainline-21` / `npm run test:v05` | PASS；349 / 479 条。 |
| `npm run test:quest-hooks` / `npm run test:cheat` | PASS；questHooks 双模式各 152 条及坏表矩阵；作弊 URL 113 条。 |
| `npm run test:gongfa-qi-legacy` | PASS；872 条、540 个战斗场景、60 个闭关场景。 |
| `npx tsc --noEmit` / `git diff --check` / `git diff --cached --check` | PASS。 |

好感矩阵覆盖 initial 原子初始化、上下裁剪及精确档位、预览无副作用、任务与奇遇 once、任务关态延期消费、整批保存失败回滚、混合奇遇 payload 保留、奖励重复领取与背包/保存失败重试、非法形状/坏表/缺 NPC、关态 poison 优先。

两处既有测试随新增存档结构调整：奇遇旧 preamble 改为核验当前正式五事件已开启，关态只用克隆 fixture；历史公式测试先严格核验两个新增关系字段为空默认，再仅排除这两个字段继续对历史预览、收益及其余完整存档逐字节比较。公式比较未放宽，奇遇 producer 未改。

## 正式门禁与文件旁证

| 范围 | affinity.enabled:false | gifts.enabled:false |
| --- | --- | --- |
| `data/balance/npcs.json` | 9/9 | 9/9 |
| `/workspace/xiantu/balance/npcs.json` | 9/9 | 9/9 |

两份 NPC 表 SHA-256 均为 `6311a287cfe55bb27371f043c53b2ac72aa491db99357d8d607960159ede07b7`，与任务开始时一致。features 及共享/快照的 npcs、encounters、gongfa_grades、qi_density、karma_flags 共 11 个文件全部核验 SHA-256 未变；未刷新 data 快照。`#19`、`#20`、正魔 questHooks 的 enabled 仍全 false，`lifeSkillCurve=false`。未改战力公式或作弊门禁；无 `?cheat=1` 不启作弊。

可复核的 Node 一行（同时检查共享表及快照）：

```sh
node -e 'const fs=require("node:fs"),a=require("node:assert/strict"); for(const p of ["data/balance/npcs.json","/workspace/xiantu/balance/npcs.json"]){const n=JSON.parse(fs.readFileSync(p)).filter(x=>x.affinity);a.equal(n.length,9);a(n.every(x=>x.affinity.enabled===false&&x.affinity.gifts.enabled===false));console.log(p,"AFFINITY_FALSE=9/9 GIFTS_FALSE=9/9");}'
```

## 执法堂开态抽检

运行 `npm run test:affinity` 即执行 snapshot/shared 开态矩阵；只在 `structuredClone(npcsRaw)` 中将目标 NPC 的 `affinity.enabled` 置 true，经 `parseAffinityIndex` 后传入 API，`gifts.enabled` 继续 false。不得改正式 JSON。

可在现有 Vite SSR 测试宿主内复现：

```ts
const raw = structuredClone(npcsRaw);
raw.find(npc => npc.id === 'village_elder')!.affinity!.enabled = true;
const config = parseAffinityIndex(raw).config!;
const progress = new Progress(); // 宿主使用独立内存 localStorage
getAffinity(config, 'village_elder', progress);
applyAffinityDelta(config, 'village_elder', 300, progress);
claimAffinityUnlock(config, 'village_elder', 'confidant_gift', progress);
claimAffinityUnlock(config, 'village_elder', 'confidant_gift', progress); // duplicate
```

真实任务交付、奇遇 producer→commit→pending 消费、失败注入与重试见 `src/affinity.test.ts`；旧档与坏结构见 `src/relationship-save.test.ts`。只交付最小运行时及抽检能力，后续正式启用需另行安排。
