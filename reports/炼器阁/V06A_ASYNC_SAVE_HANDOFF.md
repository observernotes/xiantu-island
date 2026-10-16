# v0.6a 玩法 save 异步接线交接

更新时间：2026-10-16 21:26:36 UTC+8

- TIP_SHA=50d3674fbd2d9e2484132eb94f6c987af666dfad（docs pin；接线 feat 63f4a3dc64c9fd89fb7a80d82ea9adbc4b36aca5；已 push origin/dev）
- 基线：dda785288f71b7ca5008e35760ad0155a295cd14；仅修改 `/workspace/xiantu/wt/dev` 的代码工作树，报告/status 按指令写共享根目录。
- Commit：`feat(v0.6a): wire gameplay saves to async slots`。

## 异步 API 与改动摘要

复用既有权威 API：`progress.save({ async: true })` / `saveAsync()`、`runSaveTransaction(..., { async: true })` / `runSaveTransactionAsync()`、`Progress.load({ async: true })` / `loadAsync()`，未重造存储后端或事务架构。

- `src/Progress.ts`：增加极小 `persistSoon()`，开态发出异步槽保存，关态仍同步 localStorage；原本忽略返回值的内部进度保存共用 helper。落点保存增加 async options，依赖提交结果的入口可 await。
- `src/QuestSystem.ts`：onTalk / accept / onKill / onReach / onTrialComplete / onCraft 使用 helper；turnIn / abandon 开态等待隔离 draft 的异步事务，业务回调同步且只修改 draft；提交成功后才通知。旧同步入口继续供关态和 draft 使用。
- `src/scenes/GameScene.ts`：显式保存、拾取/服药、换图、试炼、关键进度走 helper；对话交付、放弃、选宗与宗门服务开态等待结果。无 registry 的开态 create 防御性异步读档，等待时跳过 update，shutdown 后不重启旧场景。重访地图不启动空事务，以免挡住落点保存。
- `src/Alchemy.ts`、`src/Seclusion.ts`、`src/SkillCombat.ts`、`src/scenes/Gathering.ts`：原先忽略保存返回值的高频入口走 helper。
- `src/SectGrowth.ts`、`src/ShopPanel.ts`：六类宗门/商店结算复用同步 draft 业务，开态等待 IDB 提交后反馈结果，失败不扣款、不发物品/收据；关态保留同步结算。
- `src/Sense.ts`、`src/SenseUi.ts`：开态真正 await 保存，提交成功后发布扫描事件；失败恢复扫描字段并退还本次灵力消耗。
- `src/save-slots.test.ts`：新增正式 JSON false 断言和「玩法主路径」开态增量段，使用内存开关克隆与 memory backend；覆盖真实任务、商店、神识调用及失败重试。
- `docs/save-slots.md`：改为主路径已异步接线、正式 features 仍 false、待负责人翻表令；保留范围外债。

原本不检查保存返回值的 Phaser 回调仍是 fire-and-forget，不额外增加重试/自动档架构。制符 / 用符的旧同步原子事务、未纳入本轮的历史返回值型入口（如装备、加点、奇遇及测试辅助）仍属后续接线范围；本次不声称全部历史入口均已迁移。

## 开态增量抽检入口与证明点

工作目录：`/workspace/xiantu/wt/dev`。

```sh
npx tsc --noEmit
npm run test:save-slots
npm run test:mainline-56
git diff --check
python3 -c "import json;assert json.load(open('data/features.json'))['indexedDbSaves'] is False"
```

- save-slots：252 断言，exit 0。文案含「玩法主路径」「命中 IDB/槽」；内存改动后 async save 命中 backend / saveStore.readSlot，async draft 事务提交后槽与内存完整一致，async load 再读回。
- 真实 QuestSystem 接取、到达、连续击杀、试炼完成写槽；延迟提交前不通知、不发布 done/奖励；失败保留材料、旧槽及通知数；重试后仅提交一次。放弃任务失败保留原任务与试炼，成功才清除。
- 真实 SectGrowth 商店购买的扣款、物品和收据同槽提交，失败全部保留；神识失败恢复灵力、冷却与扫描收据，成功重试只扣一次，教学记录也落槽。开态不回写 localStorage 主档。
- 套件开头继续断言正式默认严格 false，同步 save/load 和失败回滚不破；独立 mockIndexedDB 段继续检查 IDB schema、transaction complete / abort 语义。
- mainline-56：snapshot / shared 各 333 断言，exit 0；tsc、diff-check、正式 false 断言均 exit 0。
- 额外轻量场景探针 exit 0：真实 GameScene create 在无 registry 时异步载入，等待期间 update 不崩溃；shutdown 取消重启；重复访问地图后最新 position 命中槽。
- 相关回归均 exit 0：quest-hooks（双数据根）、daily（575）、sense（双数据根各 1119）、sect-growth（872）、sect-shop（1031）、shop（596）、alchemy / gather（189 + 148 / 33）。

## 正式开关与边界

- 正式 `data/features.json.indexedDbSaves` 仍为严格布尔 `false`；文件未修改。
- SHA-256：`f5326ab47ca72919592a933bcd4f77127a44f87943ddeb648a6cd5616b9ef50f`。
- gifts 仍关：快照 9/9、共享配置 10/10 均严格 false；没有修改 gifts。
- 未发版；未翻正式 features；禁 6b+；没有增加自动档。
- UI 债：HUD overlay / SaveSlotsPanel 视觉与交互统一不纳入本任务。
- 工作树原有未跟踪 `data/art/sprites/_pending/secret_rest_r1/` 未改动、未纳入提交。
- blocker：无（本次最小主路径接线与必检范围）。

## 执法堂三行（开态增量）

【执法堂 1/3】TIP_SHA=50d3674fbd2d9e2484132eb94f6c987af666dfad（接线 63f4a3d）；请做开态增量 `npm run test:save-slots`（252 断言），核查「玩法主路径」「命中 IDB/槽」：save → 槽/backend、draft 事务 → 内存一致、load 读回及交付成功后通知/失败回滚。

【执法堂 2/3】tsc / save-slots / mainline-56 / diff-check / 正式 false 断言均 exit 0；正式 indexedDbSaves=false，SHA-256=f5326ab47ca72919592a933bcd4f77127a44f87943ddeb648a6cd5616b9ef50f；gifts 仍关，未发版，禁 6b+。

【执法堂 3/3】仅测例 setFeatureFlag 内存克隆开态；请出 `qa/out_v06a_async_50d3674/`，保存命令、退出码和证明点；HUD overlay / SaveSlotsPanel 视觉不纳入；不得据此翻正式表或加自动档。
