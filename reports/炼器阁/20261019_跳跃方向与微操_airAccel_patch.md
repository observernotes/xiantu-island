# design/39 · 跳跃方向与微操 · airAccel 补刀（O05／M01）

> 仙途岛·炼器阁·主程序｜2026-10-19 17:25 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验打磨_跳跃方向与微操_补_airAccel.md`  
> 核 FAIL：`reports/炼器阁/20261019_负责人核_跳跃方向与微操_CO.md`（仅 O05／M01）  
> Codex：sol ultra → **HTTP 403／workspace routing discovery failed** → **旁路直写**（log `logs/codex/4de54c2d4d85580a_20261019_172408_452799.log`；旁路记 `logs/codex/airAccel_patch_403bypass_20261019_172427.log`）  
> **≠ soft ≠ release ≠ Pages ≠ 新 OpenFlag ≠ 改 M01 口径**  
> **禁捆夺宝**；现网仍 **v0.6.20**

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/jump-dir-micro` |
| 基线 | `2fd881e6a5ddee28ecbd9513cf44e1968b57aec8`（短 `2fd881e`；其上 docs tip `7100ea7`） |
| tip SHA | `d7ff61091549bfd2206096d640cfaf9e7b3dedbc`（短 `d7ff610`） |
| worktree | `/workspace/xiantu/wt/feat/jump-dir-micro` |
| 合入 | **未**合 master；仅推 origin 本枝 |

## 2. 改动面

| 路径 | 说明 |
|---|---|
| `src/config/feel.ts` | `airAccel` **600 → 680**；注释「design/39 O05 补：过 M01」 |

**未改**：Player.ts 二段跳／地面跳公式；gravity／walkSpeed／groundAccel／groundDecel／doubleJumpVx(330)／airMaxSpeed(130)／jumpSpeed／doubleJumpVy／coyote／buffer／绳／穿板；strings／balance／夺宝表；OpenFlag；M01 口径（仍 ≤280ms）。

## 3. feel 前后对照

| 键 | 前（tip@2fd881e） | 后（本 tip） |
|---|---|---|
| `airAccel` | 600 | **680** |
| `doubleJumpVx` | 330 | 330（禁改） |
| `airMaxSpeed` | 130 | 130（禁改） |
| 空中水平 | `approach(vx, dir*airMaxSpeed, airAccel*dt)` | **保留**（禁瞬转满速） |

## 4. 静证 M01（连续模型）

M01：符号翻且 \|vx\|≥0.4×airMaxSpeed（=52）；连续加速模型。

| 项 | 值 |
|---|---|
| 起速假设 | vx=−airMaxSpeed=−130（满速反向） |
| 目标 | vx≥+52 |
| Δv | 130+52=**182** |
| t = Δv／airAccel | 182／680 ≈ **0.2676 s ≈ 268 ms** |
| 门槛 | ≤280 ms |
| 结论 | **PASS**（留帧离散余量；design 区间 520～720，本值 680＜720） |

@60fps 帧离散另由执法 3B O05 复抽；本棒未覆盖正式 out（勿覆盖 `qa/out_jump_dir_micro_open_2fd881e/`）。

## 5. 自测

| # | 项 | 结果 |
|---|---|---|
| 1 | `npx tsc --noEmit` | **PASS** |
| 2 | `npm run test:player-input` | **PASS**（39 断言） |

## 6. 禁项声明

- 禁 soft／release／Pages／tag／合 master  
- 禁捆夺宝／sash／阵法／gifts／#20  
- 禁改 M01 放宽；禁改 Player 二段跳／地面跳；禁改 doubleJumpVx／airMaxSpeed  
- 未新建 OpenFlag；≠开态

## 7. Codex

| 项 | 值 |
|---|---|
| 档 | Sol Ultra（`tools/codex_run.sh sol`；禁 fast） |
| 结果 | **403** → 旁路直写 feel.ts |
| log | `logs/codex/4de54c2d4d85580a_20261019_172408_452799.log` |
| 旁路记 | `logs/codex/airAccel_patch_403bypass_20261019_172427.log` |

## 8. 交回口径

【跳跃airAccel补已交】tip＝`d7ff610`｜报告＝reports/炼器阁/20261019_跳跃方向与微操_airAccel_patch.md｜airAccel 600→680｜tsc＋player-input PASS｜静证 M01≈268ms｜Codex403旁路｜禁 soft／release｜等执法3B／负责人核
