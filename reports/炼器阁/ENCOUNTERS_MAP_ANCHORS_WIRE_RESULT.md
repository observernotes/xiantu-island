# 奇遇地图锚点与 battle sense fixture RESULT

- 时间：2026-10-16 Asia/Shanghai。
- 基线 tip：`3f8db968c403981e8ea7b2eb406f9c393d1f12d9`（`3f8db96`）；交付 tip 为本 RESULT 所在提交，完整 SHA 见交付 stdout / origin/dev。
- 本 tip 已含实体接线（实现 `c493ec0`、验收记录 `415833e`）、锚点 UI（`7a39b90` 经 merge `dae2f76` 合入）、五图 `data/maps` 快照（`8ba32cf`）及交接文档（`3f8db96`）。
- 五图：`lingxi_path`、`luoxia_town`、`qingyun_village`、`wanyao_outer_1`、`wanyao_outer_2`。
- 洞府 `enc_hidden_abode_anchor`：type=hidden，enabled=false，reveal=entrance，reqSpirit=0，encounter=enc_hidden_abode；事件表 trigger.reveal=spirit_scan（Sense/Props 读事件表）。

## 本次补齐

- 已核对 `/workspace/xiantu/qa/out_encounters_entity_415833e/report.md:60` 的合入提醒与 `GameScene.setupEncounters()`。
- `src/encounter-battle.test.ts` 的 Object.create GameScene 桥接已提供 `sense.registerAdapter(name, adapter)` mock，记录注册、保存 adapter 并返回 unregister。
- 断言验证注册次数、`encounter` 名称、真实 targets 回调、返回注销函数的保存；再次 setup 真实调用旧 unregister 并替换 adapter；末尾注销新 adapter 后无残留，重复清理安全。
- 保留原有 799/800ms 预警、清波判胜、普通击杀隔离、`grantRewards=false`、取消清理与真实技能/灵兽熟练度断言。
- Object.create fixture 按 SHUTDOWN 使用的 `runtime.destroy → unregister → 清空引用` 顺序验证清理；真实 Phaser `create()` / SHUTDOWN 事件派发仍属实机验证范围。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:encounter-runner` | PASS；snapshot/shared 各 runner 665 + battle 133 断言 |
| `npm run test:encounter-ui` | PASS；snapshot/shared 各 656 断言 |
| `npm run test:encounter-props` | PASS；snapshot/shared 各 109 断言 |
| `npx tsc --noEmit` | PASS |

- features.md5：`a06c3638796fd1bed9af3d45c038c954`；测试前后字节一致。
- 正式五事件 enabled：false=5、true=0，enabled=0；snapshot/shared 正式表守护均通过。
- 本次改动仅为 battle fixture、此 RESULT 与 `status/炼器阁.md`。
- 演武交接：`reports/演武堂/20261016_奇遇锚点地图.md`。
- 可交执法堂复验：实体 + 锚点 UI + 五图齐备，battle sense mock 已补，指定检查全绿，五事件保持关态。
