# 宗门职位烟测 · 开态 preamble 适配 RESULT

更新：2026-10-16 13:38（UTC+8）｜炼器阁·主程序  
**结论：已修 `scripts/sect-growth-smoke.mjs` 开态 preamble；自测 `test:smoke:sect-growth` PASS；未发版。**

## 根因

执法堂进包回归 `f7e75c4`：`smoke:sect-growth` 仍按正式表**关门**断言 `sect.ui.config_pending`；职位三开态后外门、贡献 0 实测为 `sect.ui.requirements_unmet`（功能已开、门槛未满）。tsc / sect-growth / sect-shop / open-matrix 均已 PASS，仅 smoke 阻断。

## 改动

文件：`scripts/sect-growth-smoke.mjs`（烟测 harness，未改玩法 TS / 未回关开关）

按 `ranks.enabled && donations.enabled` 分支：

| 场景 | 期望 |
|------|------|
| **关** | 维持原断言：promotion/catalog/exchange → `config_pending`；donations/donate 不可用 |
| **开**（当前正式包） | promotion → `requirements_unmet`；catalog.ok=true 但条目均不可兑；exchange 内门货 → `locked_rank`；donations.ok=true；donate → `material_short`；余额/背包/收据不变 |
| 其后 | 仍装内存夹具，正向日常→内门→兑换→上交不变 |

## 自测（`/workspace/xiantu/game` @ 本提交前工作区）

| 命令 | 结果 |
|------|------|
| `npm run build:test` | exit 0 |
| `npm run test:smoke:sect-growth` | **PASS**（passed:true，内门、兑换、上交、跨日重确认，报错全 0） |

## 明确未做

- **未**跑 `tools/release.sh`、未打 tag、未更新 gh-pages
- 未改 `talismanCraft` / `spiritScan` / #19+#20
- 未改 `SectGrowth.ts` 玩法逻辑

## 请执法堂

- 在 origin/master（及同线 origin/dev）本提交上重跑进包快速回归（含 `build:test` + `test:smoke:sect-growth`）
- **PASS 前勿发 v0.5.5**；PASS 后由炼器阁发版
