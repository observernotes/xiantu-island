# 宗门职位/服务 · tip 临时开态 RESULT

更新：2026-10-16 13:24（UTC+8）｜炼器阁·主程序  
**结论：origin/dev tip 已临时打开三开关与相关表；正式包仍关、未发版、未合 master。**

## tip / 范围

| 项 | 内容 |
|----|------|
| 起始 tip | `996227c` |
| 本提交 tip | `45b1c25`（origin/dev HEAD `8dbee83` 含文档对齐） |
| 工作区 | `wt/dev` |
| 正式试玩包 | **v0.5.4** 未动（不开开关、不合 master、不发版） |
| 目的 | 交执法堂做开态正向矩阵；PASS 前不进正式包 |

## 改了哪些 flag / 表

### features.json（tip 管，snapshot 保留）

| flag | 原值 | 现值 |
|------|------|------|
| `sectRanks` | false | **true** |
| `sectShopLibrary` | false | **true** |
| `sectDonations` | false | **true** |
| 其余（含 `talismanCraft` / `spiritScan` / `lifeSkillCurve`） | 原值 | **未改** |

### 共享 balance + tip `data/balance`（已 `npm run snapshot`，--pre 过）

| 表 | 改动 |
|----|------|
| `sect_ranks.json` | 根 `enabled` → **true** |
| `sect_donations.json` | 根 `enabled` → **true**；5 条 offer 全部 → **true** |
| `shops.json` | 五宗使者贡献对象共 **15** 项 → **true**（`hp_pill_small` / `clear_mind_pill` / `protect_charm`） |
| `shops.json` · 藏经阁 | `tianjian_elder.scroll_ten_thousand_swords` **保持 false**（契约：五宗同档齐备才成组启用；其余四宗长老无同档秘籍） |
| 字符串货架 | 未改（如 `talisman_paper`） |

### 测试断言（开态对齐）

- `src/sect-growth.test.ts` / `src/sect-shop.test.ts`：序言由「真实表关闭」改为 tip 临时开态期望；关态负例（fixture 手关）保留。
- **未改** `SectGrowth.ts` 玩法逻辑。

## 自测

| 命令 | 结果 |
|------|------|
| `npm run snapshot`（含 --pre） | exit 0；datalint 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run test:sect-growth` | exit 0（872 断言） |
| `npm run test:sect-shop` | exit 0（1031 断言） |

## 请执法堂

- 在 tip 开态下跑宗门职位/服务**正向矩阵**（晋升 / 贡献商店 / 上交；藏经阁高阶书目应仍筹备不可兑）。
- **正式包不开**；回关三开关须负责人令。

## 明确未做

- 未发版、未合 master、未改 v0.5.4 发布物。
- 未开 `talismanCraft` / `spiritScan` / `lifeSkillCurve`。
- 未补四宗同档高阶秘籍（仍等演武/天机）。
