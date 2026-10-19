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

## 4. 对象约定／2A 合入

| 约定 | 说明 |
|---|---|
| 主路径 | objects 层 `type`／`class` = `flyZone`，矩形 w/h>0 |
| 名 | `name=flyZone_1`（2A 实落）；亦认 `flyZone`／`flyZone_*`／`props.flyZone=true` |
| 2A | **VERIFY_PASS** 已合入 tip（见 `reports/演武堂/20261019_flyzone_maps.md`） |
| 落点 | worktree `data/maps/<id>.json`（feat 快照；与共享 `maps/`／`game/data/maps/` 同字节） |

| mapId | 写后 SHA-256 | 对象 |
|---|---|---|
| wanyao_deep_1 | `15e5e33dc84828bce0c29ce1bc8b30f7c7be0f43e7376106a156730b543d47f5` | flyZone_1 @ 640,448,2240,288 |
| wanyao_deep_2 | `2264cac0937eeeb370bf56560cff12714f040c7b8255d3589265bcd9d6c7cc0e` | flyZone_1 @ 640,448,2400,288 |
| chiyan_core | `34e4feee077b9cc0fa99425b9620ed04fcd443355ca9f75eb018fb8b698e5f52` | flyZone_1 @ 480,448,1400,288 |
| chiyan_slope_1 | `e8a10fdb4f4d8d1153a7b21c493f241313fc2598f237deb9bca2cb96db9e25cc` | flyZone_1 @ 480,384,2000,256 |
| chiyan_slope_2 | `ef1e5d31987abde9c7bb3d1002738791e9bf95fb13d78c378bae74c38632f754` | flyZone_1 @ 480,400,2200,272 |

每图 ≥1× `type==flyZone`／`name=flyZone_1`；MapBuilder 已认 `flyZone` → 可测。

## 4.1 地图合入（本补刀）

- 提交：`chore(maps): sync 2A flyZone objects into sustain-flight-wire`（SHA 见 git／status）
- 2B 产品逻辑未改；仅五图快照与 2A 同字节
- 可测：2B tip@9d563f3 ⊂ HEAD；含地图合入后的 HEAD 可开 2C

## 5. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:v06b-closed` | **PASS**（含 fly zones 115、sword ride 56） |
| `npm run test:v06b-open` | **PASS**（formal-open 355 + sword ride 56） |

## 6. 交回

【持续飞行接线】地图=2A VERIFY_PASS 已合入 `data/maps`（旁证 `reports/演武堂/20261019_flyzone_maps.md`）｜tip@9d563f3｜fly_zones SHA仍 2940fe59…｜softOpenedSustainFlight=false｜≠soft-open≠release｜等执法 C
