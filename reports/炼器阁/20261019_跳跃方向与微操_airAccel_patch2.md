# design/39 · 跳跃方向与微操 · airAccel 再补（O05 60fps 离散）

> 仙途岛·炼器阁·主程序｜2026-10-19 17:33 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验打磨_跳跃方向与微操_补_airAccel_2.md`  
> 3B 复抽 FAIL：`reports/执法堂/20261019_跳跃方向与微操_CO_recheck.md`（仅 O05／M01 · 60fps 离散；out `qa/out_jump_dir_micro_open_d7ff610/`）  
> Codex：sol ultra → **HTTP 403／workspace routing discovery failed** → **旁路直写**（log `logs/codex/49f439e0cd627b69_20261019_173303_461072.log`；旁路记 `logs/codex/airAccel_patch2_403bypass_20261019_173324.log`）  
> **≠ soft ≠ release ≠ Pages ≠ 新 OpenFlag ≠ 改 M01 口径 ≠ 只认连续**  
> **禁捆夺宝**；现网仍 **v0.6.20**

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/jump-dir-micro` |
| 基线 | `d7ff61091549bfd2206096d640cfaf9e7b3dedbc`（短 `d7ff610`；其上 docs tip `11a9207`） |
| tip SHA | `412138128a596f43a7b736342aaa0de4d1c3604f`（短 `4121381`） |
| worktree | `/workspace/xiantu/wt/feat/jump-dir-micro` |
| 合入 | **未**合 master；仅推 origin 本枝 |

## 2. 改动面

| 路径 | 说明 |
|---|---|
| `src/config/feel.ts` | `airAccel` **680 → 700**；注释「design/39 O05 再补：过 60fps 离散」 |

**未改**：Player.ts 二段跳／地面跳公式；gravity／walkSpeed／groundAccel／groundDecel／doubleJumpVx(330)／airMaxSpeed(130)／jumpSpeed／doubleJumpVy／coyote／buffer／绳／穿板；strings／balance／夺宝表；OpenFlag；M01 口径（仍 ≤280ms，**含 60fps 离散闸**）。

## 3. feel 前后对照

| 键 | 前（tip@d7ff610） | 后（本 tip） |
|---|---|---|
| `airAccel` | 680 | **700** |
| `doubleJumpVx` | 330 | 330（禁改） |
| `airMaxSpeed` | 130 | 130（禁改） |
| 空中水平 | `approach(vx, dir*airMaxSpeed, airAccel*dt)` | **保留**（禁瞬转满速） |

## 4. 静证 M01（连续＋60fps 离散）

M01：符号翻且 \|vx\|≥0.4×airMaxSpeed（=52）；门槛 ≤280 ms。

### 4.1 连续模型

| 项 | 值 |
|---|---|
| 起速假设 | vx=−airMaxSpeed=−130（满速反向） |
| 目标 | vx≥+52 |
| Δv | 130+52=**182** |
| t = Δv／airAccel | 182／700 = **0.260 s = 260 ms** |
| 门槛 | ≤280 ms |
| 结论 | **PASS** |

### 4.2 60fps 离散（硬闸）

`approach(vx, +130, airAccel·dt)`，dt=1/60，vx₀=−130：

| 帧 | t (ms) | vx |
|---|---|---|
| f15 | 250.0 | 45.00 |
| **f16** | **266.7** | **≈56.67** |
| f17 | 283.3 | 68.33 |

| 项 | 值 |
|---|---|
| f16 \|vx\| | **≈56.7 ≥ 52** |
| hit | f16＠**266.7 ms ≤ 280 ms** |
| 结论 | **PASS**（离散过闸；design 区间 520～720，本值 700＜720；较 680 留余量） |

旁证：680 时 f16≈51.3＜52、hit@f17≈283ms＞280 → FAIL；离散过闸需 airAccel≥682.5。本令 700 过闸。

**勿覆盖** out `qa/out_jump_dir_micro_open_d7ff610/` 与 `qa/out_jump_dir_micro_open_2fd881e/`（执法 4B 另开 `…_<新tip短>/`）。

## 5. 自测

| # | 项 | 结果 |
|---|---|---|
| 1 | `npx tsc --noEmit` | **PASS** |
| 2 | `npm run test:player-input` | **PASS**（39 断言） |

## 6. 禁项声明

- 禁 soft／release／Pages／tag／合 master  
- 禁捆夺宝／sash／阵法／gifts／#20  
- 禁改 M01 放宽；禁只认连续／放宽离散；禁改 Player 二段跳／地面跳；禁改 doubleJumpVx／airMaxSpeed  
- 禁瞬转满速；未新建 OpenFlag；≠开态

## 7. Codex

| 项 | 值 |
|---|---|
| 档 | Sol Ultra（`tools/codex_run.sh sol`；禁 fast） |
| 结果 | **403** → 旁路直写 feel.ts |
| log | `logs/codex/49f439e0cd627b69_20261019_173303_461072.log` |
| 旁路记 | `logs/codex/airAccel_patch2_403bypass_20261019_173324.log` |

## 8. 交回口径

【跳跃airAccel再补已交】tip＝`4121381`｜报告＝reports/炼器阁/20261019_跳跃方向与微操_airAccel_patch2.md｜airAccel 680→700｜tsc＋player-input PASS｜连续≈260ms｜60fps f16 vx≈56.7≥52｜Codex403旁路｜禁 soft／release｜等执法4B／负责人核
