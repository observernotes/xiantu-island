`#12c` 增加三个手动存档位、文件导入导出及旧档迁移。正式 `data/features.json` 中 `indexedDbSaves` 默认 `true`。没有自动档位，也没有洞府离线结算；`lastSaveAt` 只记录写槽时间。

关态夹具通过 `setFeatureFlag('indexedDbSaves', false)` 覆盖内存开关，继续验证原有同步单槽接口：`Progress.load()`、`progress.save()`、`Progress.reset()`、`progress.importSave(data)`。主档键仍是 `localStorage.xiantu_save_v1`，不会访问 IndexedDB。

开态必须显式等待异步接口：

```ts
// 正式表默认已开；测试隔离时可幂等 setFeatureFlag('indexedDbSaves', true)。
const progress = await Progress.load({ async: true, slot: 1 });
const saved = await progress.save({ async: true });
const imported = await progress.importSave(data, { async: true });
const result = await progress.runSaveTransaction(draft => {
  draft.stones += 5;
  return true;
}, { async: true });
const deleted = await Progress.reset({ async: true, slot: 3 });
```

对应的 `loadAsync`、`saveAsync`、`importSaveAsync`、`runSaveTransactionAsync`、`resetAsync` 也可直接调用。异步接口在关态夹具中沿用 localStorage。`exportSave()` 保持同步返回当前内存字段。

IndexedDB 不能同步确认写盘。开态直接调用同步 `save()` 会返回 `false`，同步 `runSaveTransaction()` 会拒绝操作，直接调用同步 `Progress.load()` 会提示使用异步接口。已有同步玩法可在异步事务的 `draft` 上执行；只有 IDB 事务完成，草稿才发布到当前角色。回调必须同步，且只修改 `draft`。不得在等待提交期间并发修改草稿正在操作的原角色字段。

玩法主路径已异步接线：任务接取与目标进度、显式存档、换图、炼丹、闭关、战斗技能和采集等保存，在开态使用异步槽接口；原来忽略保存返回值的回调仍在发出保存请求后继续执行。任务交付、放弃以及宗门成长、神识等依赖提交结果的路径等待异步保存，失败遵守各自的回滚规则；交付成功后才通知完成。正式 `data/features.json.indexedDbSaves` 已为严格布尔 `true`；关态仅用 `setFeatureFlag('indexedDbSaves', false)` 夹具保留原同步 localStorage 回归。

本次为最小主路径接线，制符 / 用符的旧同步原子事务及测试辅助入口等边缘调用仍有后续接线债，不把本次范围扩展为全部历史入口迁移。HUD overlay / SaveSlotsPanel 的视觉和交互统一也不纳入本次任务。

活跃槽默认 `1`，可通过 `Progress.setActiveSlot(1 | 2 | 3)` 修改。异步读出的角色实例绑定所读槽；之后修改全局活跃槽不会把该实例的保存重定向。未绑定实例在发出保存请求时记录当前活跃槽，排队期间切槽不会改写目标。

`SaveStore` 固定使用数据库 `xiantu_saves`、版本 `1`、对象仓库 `slots`，主键为 `slotKey`。合法键只有 `1`、`2`、`3`。记录结构为 `{ slotKey, data, lastSaveAt }`。写入成功以 IndexedDB 事务 `complete` 事件为准，请求本身成功后若事务中止仍判失败。配额、打开、提交失败返回失败；读取失败不会伪装为空槽。

首次开态读取前尝试迁移 `xiantu_save_v1`：只有 1 号槽为空时才写入，并在同一 IDB 写事务中再次检查，避免覆盖其他窗口刚写入的数据。需要迁移关系字段时先保留原文备份。IDB 确认提交后，仅当 localStorage 主档仍与迁移原文相同时删除该主档；失败保留原档。`xiantu_save_relationship_v1_backup` 永远不覆盖、不删除。1 号槽已有存档时，旧主档继续保留，供人工恢复。

文件导出为 JSON，封装字段为 `format: "xiantu-save-slot"`、`version: 1`、`slotKey`、`lastSaveAt`、`data`。导入接受该格式或原有 `Progress.exportSave()` 的原始 JSON。目标槽由调用方指定，源文件的槽号不会改变目标，导入成功后重新记录写槽时间。应用使用的 `saveStore` 沿用 Progress 的存档校验，保留道心、善恶及 relationship 字段。

开态页面提供「存档」按钮；`?saves=1` 可直接打开面板，但查询参数不会开启功能。面板包含三槽摘要、保存、读档、删除确认、文件导入和导出，关态不显示。UI 仍是轻量 DOM overlay，尚未统一接入主 HUD 的视觉与交互规范。

开态增量验证入口：`npm run test:save-slots`。正式表已为 `true`，套件开头验证正式表和运行时默认开态；关态仅通过 `setFeatureFlag('indexedDbSaves', false)` 夹具验证同步 save/load。其中「玩法主路径」段用 `setFeatureFlag('indexedDbSaves', true)` 幂等恢复开态并注入 memory backend，断言文案包含「命中 IDB/槽」：覆盖内存变更后异步保存、draft 事务与槽一致、异步重载读回，以及真实任务接取、到达、击杀、试炼、交付成功后通知和交付 / 放弃失败回滚；另验证真实商店扣款、物品、收据原子提交与失败回滚，以及神识灵力、冷却、扫描收据和教学记录的异步保存。神识总开关只克隆内存配置。测例不写正式 features；`finally` 仅以 `setFeatureFlag('indexedDbSaves', false)` 清理会话覆盖。固定 IDB schema、事务完成和中止语义由独立 mockIndexedDB 段覆盖。

必要回归：`npx tsc --noEmit`、`npm run test:save-slots`、`npm run test:mainline-56` 和 `git diff --check`。
