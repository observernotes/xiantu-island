# 2B · 场景持续飞行成功通路＋物理 · PASS

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验债持续飞行_接线.md` §2B  
> design/34；核记 `reports/炼器阁/20261019_负责人核_design34_场景持续飞行.md`  
> Codex：仍 403 → **旁路直写**（Sol Ultra 未用）  
> **≠ soft-open ≠ release ≠ 新 OpenFlag ≠ Pages**

## 1. tip

| 项 | 值 |
|---|---|
| 分支 | `feat/sustain-flight-wire` |
| 基线 | `25ecaad`（v0.6.15／master） |
| tip SHA | `9d563f3980ab5e8e9db0d23687b1d911469c93b7`（短 `9d563f3`） |
| worktree | `/workspace/xiantu/wt/feat/sustain-flight-wire` |

## 2. 改动面

| 路径 | 说明 |
|---|---|
| `src/FlyZones.ts` | `canSustainFlight` 全条件满足 → `{ok:true}`；`requestSustainFlight` 成功 `entered`＋首秒 `mpSpent`；新增 `isPointInFlyZone`／`isFlyZoneRect` |
| `src/scenes/GameScene.ts` | 真实 `playerInFlyZone`；进入／维持／落地／击落／禁攻；冲刺输入与飞区分流 |
| `src/scenes/MapBuilder.ts` | 显式解析 Tiled `type/class=flyZone` → objects |
| `src/fly-zones.test.ts` | 成功通路＋几何命中断言 |
| `src/v06b-open.test.ts` | FlightGateResult 收窄（行为不变） |

**未改**：`fly_zones.json` 字节；maps 列表；冲刺 skills 数值；新 OpenFlag；strings。

## 3. 硬门

| 项 | 结果 |
|---|---|
| fly_zones SHA | **2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4** MATCH |
| softOpenedSustainFlight | **false**（未引入证据位／进包） |
| released | **false** |
| 冲刺隔离 | `trySwordRide` 不读 `fly_zones.enabled`；飞区外 ↑+跳仍冲刺 |
| ≠soft-open≠release | 本刀未授权 |

## 4. 对象约定（供 2A／inFlyZone）

| 约定 | 说明 |
|---|---|
| 主路径 | objects 层 `type`／`class` = `flyZone`，矩形 w/h>0 |
| 名 | `name=flyZone` 或 `flyZone_*` 亦可 |
| props | `flyZone: true`（objects 或 zones） |
| zones | `type=zone` 且 name／props 同上 |
| 现网 | 2A 报告尚未齐；白名单五图暂无对象 → `inFlyZone=false` 仍拒；查询路径真实可测（非恒 false 硬编码） |

## 5. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:v06b-closed` | **PASS**（含 fly zones 115、sword ride 56） |
| `npm run test:v06b-open` | **PASS**（formal-open 355 + sword ride 56） |

## 6. 交回

【持续飞行接线】地图=等2A `reports/演武堂/20261019_flyzone_maps.md`｜tip@9d563f3｜fly_zones SHA仍 2940fe59…｜softOpenedSustainFlight=false｜≠soft-open≠release｜等执法 C
