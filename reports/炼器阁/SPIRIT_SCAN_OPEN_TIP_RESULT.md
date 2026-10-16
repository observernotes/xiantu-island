# 神识 · tip 临时开态 RESULT

更新：2026-10-16 14:12（UTC+8）｜炼器阁·主程序  
**结论：origin/dev tip 已临时打开 `spiritScan` 与开态所需表/点位；正式包 / master / 权威 shared 仍关；未发版。**

## tip / 范围

| 项 | 内容 |
|----|------|
| 起始 tip | `578f9cd`（与 master / v0.5.6 同线） |
| 本提交 tip | `38bed8b`（origin/dev） |
| 工作区 | `/workspace/xiantu/wt/dev`（branch `dev`） |
| 正式试玩包 | **v0.5.6** @`578f9cd` **未动**（不开神识、不合 master、不发版） |
| 目的 | 交执法堂做神识**开态正向矩阵**；进包等负责人下一令 |

## 改了哪些 flag / 表 / 点位（仅 tip `data/`）

### features.json（tip 管）

| flag | 原值 | 现值 |
|------|------|------|
| `spiritScan` | false | **true** |
| `talismanCraft` / `sectRanks` / `sectShopLibrary` / `sectDonations` | true | **未改** |
| `lifeSkillCurve` | false | **未改** |
| #19 / #20（`gongfa_grades` / `qi_density` 根 enabled） | false | **未改** |

### sense.json（tip `data/balance`）

| 项 | 原值 | 现值 |
|----|------|------|
| 根 `enabled` | false | **true** |
| `targetProfiles.sense_hidden_chest` | false | **true** |
| `targetProfiles.sense_hidden_platform` | false | **true** |
| `targetProfiles.sense_monster_basic` | false | **true** |
| `future.weakness.enabled` | false | **false（保持）** |

### 点位 hidden（tip `data/maps`，11 图 × 2 = 22）

全部 `properties.enabled`：**false → true**（权威 `/workspace/xiantu/maps` **未改**，仍 false）。

| 地图 | 点位 |
|------|------|
| bamboo_forest / lingxi_path / luoxia_outskirts_1 / luoxia_outskirts_2 | sense_hidden_chest_01 + sense_hidden_platform_01 |
| wanyao_outer_1 / wanyao_outer_2 / wanyao_deep_1 / wanyao_deep_2 | 同上 |
| chiyan_slope_1 / chiyan_slope_2 / chiyan_core | 同上 |

### 怪物 sense（tip `data/balance/monsters.json`，22 块）

全部 `sense.enabled`：**false → true**（共享 `/workspace/xiantu/balance/monsters.json` 与正式包 **未改**，仍 false）。

spirit_rabbit, bamboo_snake, mountain_mandrill, demon_fox, wild_boar_spirit, straw_puppet, black_robe_minion, vine_imp, shadow_wolf, poison_spider, demonized_ape, tree_demon_sapling, millennium_tree_demon, lava_lizard, fire_crow, flame_puppet, black_robe_guard, flame_envoy, heart_demon_imp, heart_demon_wisp, paper_puppet, wild_wolf

### 测试断言（开态对齐）

- `src/sense.test.ts`：真实投放断言按 `senseTable.enabled` 自适应 tip 开态 / 权威关态；门控矩阵（模板关→零候选等）保留（Codex `sol`）。

## 数据模式说明（执法堂必读）

- tip/`dev` 默认 `XT_DATA=shared` 读权威 shared（**仍关**）。
- tip 开态表/点位在 **`data/` 快照**；开态正向请用 **`XT_DATA=snapshot`**（或等价只读 tip `data/`）。
- `features.spiritScan` 始终读 tip `data/features.json`（已 true）。
- **未**改权威 maps / 共享 balance / 正式包 `game/`。

## 自测

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | exit 0 |
| `npm run test:sense` | exit 0（snapshot + shared 各 1119 断言） |
| `XT_DATA=snapshot npm run test:smoke:sense` | exit 0（118 断言） |

## 请执法堂

工作区：`/workspace/xiantu/wt/dev`；拉 `origin/dev` 最新 tip；**开态矩阵请 `XT_DATA=snapshot`**。

建议范围：

1. **扫描开/关态**：开态可扫；运行期关 `spiritScan` / 表根 → unavailable；正式包仍关
2. **显形箱/平台**：11 图 hidden 显形、平台碰撞与半透明本体、读档恢复
3. **怪物辨识**：22 登记怪情报白名单；临时情报不写盘
4. **门控与存档**：冷却/扣蓝/同标识重试；关态不渲染 hidden；`future.weakness` 仍关
5. **边界**：职位三 / 制符正式已开可保持；`lifeSkillCurve` / #19+#20 仍关；**正式包不开神识**

## 明确未做

- 未 push master、未 ff master、未跑 `release.sh`、未改 v0.5.6
- 未改权威 `/workspace/xiantu/maps`、共享 `/workspace/xiantu/balance`、正式包 `game/data`
- 未开 `lifeSkillCurve` / `gongfa_grades` / `qi_density` / `future.weakness`
