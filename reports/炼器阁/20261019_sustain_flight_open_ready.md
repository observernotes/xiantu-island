# 3A · 持续飞行开态夹具 · 零补刀 PASS

> 仙途岛·炼器阁·主程序｜2026-10-19 Asia/Shanghai（UTC+8）  
> 令文：`reports/天机阁/20261019_负责人令_体验债持续飞行_开态.md` §3A  
> **零补刀**｜不经 Codex｜**≠ soft-open ≠ release ≠ 新 OpenFlag ≠ Pages ≠ tag ≠ 合入 master**

## 1. 基线

| 项 | 值 |
|---|---|
| 分支 | `feat/sustain-flight-wire` |
| 2B tip | `9d563f3980ab5e8e9db0d23687b1d911469c93b7`（短 `9d563f3`） |
| 地图合入 | `0d4d04b` ⊂ HEAD |
| HEAD | `78b715939c3e5e2c34b75067b983e957833e73f8`（短 `78b7159`） |
| 生产改动 | **无**（本棒零补刀） |

## 2. 只读核（成功通路仍在）

| 钩子 | 状态 |
|---|---|
| `canSustainFlight` 全条件 → `{ok:true}` | 在 |
| `requestSustainFlight` → `entered`＋首秒 `mpSpent` | 在 |
| `GameScene.playerInFlyZone`／`isPointInFlyZone` | 在（消费 type=flyZone） |
| `MapBuilder` `case 'flyZone'` | 在 |
| 五图 `flyZone_1` | 各 ≥1（data/maps 与 2A 同字节） |
| `isSustainFlying`／维持耗灵／时限／离区／击落／禁攻 | 在 |
| 冲刺隔离 `trySwordRide` | 在（不受 fly_zones.enabled 二次拦截） |

## 3. O01–O09 测试钩（足够，不补）

| O | 既有钩 |
|---|---|
| O01 | 飞区落点＋`requestSustainFlight`／`canSustainFlight`；存档直设境界／技能／mp |
| O02 | `updateSustainFlight` 按 `mpPerSecond` 扣减 |
| O03 | `maxFlightMs` 结束 |
| O04 | 离区 → `endSustainFlight('leave')` |
| O05 | `hurtPlayer`＋`knockdownOnHit`＋`fly.knockdown` |
| O06 | `isSustainFlying`＋`cannotAttackWhileFlying`＋`fly.cannot_attack` |
| O07 | 区外／map∉maps → `unavailable`；失败 `mpSpent=0` |
| O08 | 非飞行态 `trySwordRide` 读 skills |
| O09 | 切图／死亡 `endSustainFlight`；技能拥有与瞬态分离 |

准许执法用测试接口／存档直设／飞区内坐标；**不需**新生产码。

## 4. 硬门

| 项 | 结果 |
|---|---|
| fly_zones SHA | **2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4** MATCH |
| softOpenedSustainFlight | **false**（未引入／不进包） |
| released | **false** |
| 新 OpenFlag | **无** |
| ≠soft-open≠release | 本令不授权；**master 不合入** |
| 现网 | 仍 v0.6.15 |

## 5. 自测

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `npm run test:v06b-closed` | **PASS** |
| `npm run test:v06b-open` | **PASS** |

## 6. 交回

【持续飞行开态】3A=**零补刀**｜基线 tip@9d563f3／HEAD@78b7159｜fly_zones SHA仍 2940fe59…｜softOpenedSustainFlight=false｜released=false｜≠soft-open≠release｜等执法 O
