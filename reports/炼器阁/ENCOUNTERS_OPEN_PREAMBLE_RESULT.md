# 奇遇翻表开态 preamble 适配结果

日期：2026-10-16（Asia/Shanghai）

工作区：`/workspace/xiantu/wt/dev`

代码 tip 短 SHA：`8576896`（翻表快照与开态 preamble 实现提交；本 RESULT 随后一条文档提交归档）

交付分支：`origin/dev`

## 结果

- 正式五事件全部严格 `enabled=true`，仓库 `data/balance/encounters.json` 翻表快照已纳入代码提交。
- runner / props / UI 的 preamble 均以正式五事件开态为真相；关态行为只使用克隆、全 false、经 `parseEncountersConfig` 校验的内存夹具及 null 验证。
- 三项冒烟在 snapshot/shared 双模式全部 PASS，`npx tsc --noEmit` PASS。
- **未发版，未运行 release。** 玩法运行时代码未改。

## 五事件 true 旁证

共享 `/workspace/xiantu/balance/encounters.json` 与仓库 `data/balance/encounters.json` 逐字节一致；两者 MD5 均为 `8bc7fb4a325ad6368bd5f2e5c15552da`。执行测试前后均保持此值。

| 正式事件 | enabled |
| --- | --- |
| `enc_stranded_cultivator` | `true` |
| `enc_fragrant_herb` | `true` |
| `enc_hidden_abode` | `true` |
| `enc_sage_advice` | `true` |
| `enc_demon_whisper` | `true` |

## 改动与验证

- `scripts/encounter-runner-test.mjs` 改为五事件严格 true 的 open-table guard，保留双模式及全部文件字节/MD5 守护。
- 三份主测保留关态静默、零读盘/写盘/随机、零精灵/扫描候选/UI 控件等覆盖，改用显式关态夹具；业务开态用例继续使用内存配置。UI 的两处单事件运行时夹具显式关闭其它事件。
- runner 脚本还加载 `src/encounter-battle.test.ts`。其 GameScene provider/Sense 桥接简化宿主原本隐含依赖正式关态；现两次 `setupEncounters` 显式传入关态夹具，保留 provider、Monster 清理、Sense 注册注销覆盖。

| 命令 | snapshot | shared |
| --- | --- | --- |
| `npm run test:encounter-props` | PASS，111 断言 | PASS，111 断言 |
| `npm run test:encounter-runner` | PASS，runner 672 + battle 135 断言 | PASS，runner 672 + battle 135 断言 |
| `npm run test:encounter-ui` | PASS，658 断言 | PASS，658 断言 |
| `npx tsc --noEmit` | PASS（退出码 0） | 同一次类型检查 |

`git diff --check` PASS。runner 的 11 个守护文件（features 及共享/快照 balance 表）执行前后 MD5 全部与任务开始时一致；其中 `features.json` 固定 MD5 为 `a06c3638796fd1bed9af3d45c038c954`。

`#19` / `#20` / affinity / questHooks 的全 false 守护未改，`lifeSkillCurve=false` 与 features 原 MD5 守护未改；未修改好感、正魔或其它功能开关。工作区原有的无关报告与素材改动未纳入本轮提交。
