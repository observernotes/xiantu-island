# 游戏内测试接口 window.__xt（P1）
依据：`/workspace/xiantu/docs/验收提速方案.md` P1 首行、新规则第 1 条。
仅 `VITE_XT_TEST=1` 编入；`npm run build:test` 生成测试 dist，随后 `npm run test:xt` 无头验全部方法。
`npm run build` 强制 `VITE_XT_TEST=0`，以 `import.meta.env` 条件和动态 import 裁掉整个测试模块。
正式构建自动执行 `node scripts/xt-leak-check.mjs`；扫描 dist 全文件及文件名，发现 `__xt` 或接口标识即非零退出。
`release.sh` 现有 `XT_DATA=snapshot npm run build` 已经过该闸门；也可在拷贝发行包前独立调用上述检查命令。
缺 dist/index.html、不可读产物或符号链接同样失败；测试构建应被泄漏检查拒绝。
等待游戏场景就绪后访问接口；`loadSave`、`teleport` 必须 await，切图期间拒绝其他状态操作。
状态复用同一 Progress 实例和 QuestSystem，写操作调用业务 API、既有奖励路径并保存，不维护另一份角色状态。

| 方法签名 | 含义 |
|---|---|
| `getState(): State` | 独立 JSON 快照：mapId/x/y、level/realm/realmName、hp/mp/maxHp/maxMp、inventory、quests/questProgress、sect/rank/contribution、flags、time。 |
| `loadSave(obj: object): Promise<void>` | 经正式迁移和规范化导入，保存并重建场景；position 指定地图与落点。 |
| `exportSave(): object` | 正式存档格式的独立 JSON 对象，采样当前 position 并保存；排除试炼临时物品。 |
| `joinSect(id: string): void` | 五宗 ID：tianjian/taixu/lingfu/youying/wanshou；走 advanceClass，保留等级与已入宗限制。 |
| `setRank(rank: string): void` | 已入宗角色设置配表登记职位，如 inner_disciple、direct_disciple。 |
| `teleport(mapId: string, x?: number, y?: number): Promise<void>` | 切图；省略坐标取目标图出生点；仅传一轴时另一轴取出生点。 |
| `giveItem(id: string, n: number): void` | 已登记物品与正安全整数数量，调用 addItem 后保存。 |
| `acceptQuest(id: string): void` | 走 QuestSystem.accept，保留前置、等级、宗门与每日额度限制。 |
| `completeQuest(id: string): boolean` | 自动接取可接任务，经目标推进 API 和 turnIn/giveRewards 交付；重复完成返回 false，不重复奖励。 |
| `setFlag(key: string, val: boolean): void` | 保存 flags；现已实际接入 sect_ranks.enabled、sect_donations.enabled，其他合法键留给后续消费者。 |
| `clock.pause(): number` | 冻结绝对游戏时间，返回当前毫秒时间戳。 |
| `clock.resume(): number` | 从当前虚拟时间恢复随系统时间推进。 |
| `clock.advance(ms: number): number` | 推进非负毫秒，保持暂停状态；立即刷新日常/年龄并保存。 |
| `clock.setNow(ts: number): number` | 设置正毫秒时间戳，保持暂停状态；立即刷新日常/年龄并保存。 |
| `seed(n: number): void` | 安全整数种子；同时固定 Math.random 与 Phaser.Math.RND，重设同种子复现消费序列。 |
| `events.on(type: string, fn: (event: Event) => void): () => void` | 订阅并返回取消函数；`*` 订阅全部类型。 |
| `events.off(type: string, fn: (event: Event) => void): void` | 用原函数解除订阅。 |
| `events.drain(): Event[]` | 读取并清空队列，与订阅独立；Event 为 `{type,time,data}`。 |

事件类型：`loaderror`（key/type/url/src，首轮 preload 前安装）、`console.error`、`error`（未捕获异常）、`unhandledrejection`、`scene`（from/to）、`quest:complete`（id/daily）。
非法参数、业务条件不满足或保存失败抛错；种子和虚拟时间为本次运行设置，不写另一套存档。
已覆盖：全部业务 Date.now 入口、日常本地 05:00 重置/捐献、闭关午夜额度、寿命、buff/不稳、技能冷却、采集再生。
时钟未覆盖项共 **10 类**，P3 全量迁移：
1. Player 普攻、硬直、无敌、跳跃与绳索。
2. Monster AI、技能、复活、特效及 performance.now 诊断（10 处）。
3. SkillCombat/FriendlySummons 前后摇、投射、位移、召唤寿命、攻击、受击和 hitstop。
4. GameScene 回蓝、掉落、拾取、死亡、重生、切图、渡船、闭关动画与定时轮询频率。
5. AltarTrial 试炼累计时间、雷击预警与动画。
6. SectTrialObjects 木桩移动与补充时间。
7. StealthVision/TrialMotion 巡逻、察觉与影子动画。
8. Alchemy/AlchemyPanel 火候 delta 与炼丹动画。
9. Gathering 采集施法 delta 与表现计时。
10. UI/Appearance 与场景 anim/tween/camera 表现；clock.pause 不暂停 Phaser 帧/物理。

执法堂用例：用夹具直达宗门商店，再用真实键盘验证打开商店这一被测步骤：
```js
const xt = window.__xt;
xt.clock.pause(); xt.clock.setNow(new Date(2026, 9, 10, 5).getTime()); xt.seed(42);
await xt.loadSave({level: 30, sectContribution: 1000, quests: {}, job: ''});
xt.joinSect('tianjian'); xt.setRank('inner_disciple'); xt.setFlag('sect_ranks.enabled', true);
await xt.teleport('tianjian_sect', 224, 832); // 天剑山门接引人，兼本宗管事
// Playwright: await page.keyboard.press('z'); 验证真实 NPC 服务菜单及商店选项。
const evidence = {state: xt.getState(), save: xt.exportSave(), events: xt.events.drain()};
```
