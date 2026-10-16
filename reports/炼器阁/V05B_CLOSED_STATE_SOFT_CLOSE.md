# v0.5b 关态软收口总表

更新：2026-10-16 14:43（UTC+8）｜炼器阁·主程序  
**相对旧表 13:06：正式包已升 v0.5.7；职位三 / 制符 / 神识已正式开；#19#20 / lifeSkillCurve 继续关。**  
**本轮只刷新文档，不改码、不开开关、不发版。**

## 总览

| 项 | 现状 |
|----|------|
| tip / origin/dev | `88daea0`（与 origin/master 对齐） |
| 正式试玩包 | **v0.5.7** @`72be6eb` → https://observernotes.github.io/xiantu-island/v0.5.7/ |
| tiles_secret | tip 合入 `391d069`；**已 ff 进 origin/master**（内容落地含 `5fbd7b5`；**未**进 v0.5.7 tag） |
| 本表范围 | v0.5b 已开项标「正式已开」；仍关项标「继续关」；剩余缺口单列 |
| 禁开（负责人令） | `#19` 功法品阶 / `#20` 灵气浓度 / `lifeSkillCurve` — **勿开** |

---

## 总表（相对 13:06）

| 块 | 开关 / 表 | 13:06 | 现况 | 标 |
|----|-----------|-------|------|----|
| 宗门职位三 | `sectRanks` / `sectShopLibrary` / `sectDonations` | false | tip+正式包 **true** | **正式已开** |
| 制符一期 | `talismanCraft` | false | tip+正式包 **true** | **正式已开** |
| 生活技能曲线 | `lifeSkillCurve` | false | **false** | **继续关** |
| 神识 | `spiritScan` + sense 表/模板 | false | tip+正式包 **true**（sense 根 enabled） | **正式已开** |
| #19 功法品阶 | `gongfa_grades.*`（无 features 名） | 全 false | 根+绑定+future **46×false**；模块已关态接入 | **继续关** |
| #20 灵气浓度 | `qi_density.*` | 全 false | 根/display/meditation/gathering **4×false**；模块已关态接入 | **继续关** |

证据：`reports/炼器阁/V057_RELEASE_RESULT.md`；执法堂进包 PASS `qa/out_spirit_release_72be6eb/`；#19#20 `reports/炼器阁/GONGFA_QI_DENSITY_RESULT.md`。

---

## v0.5b 剩余缺口（未开玩法外）

| 缺口 | tip 实查 | 说明 / 建议 |
|------|----------|-------------|
| **四宗山门图** | `taixu_temple` / `lingfu_pavilion` / `youying_tower` / `wanshou_mountain` JSON 已在 `data/maps` 且 `SECT_GATE_MAPS` 注册（40×20） | 演武 20261010 已交布局；**美术运行构图确认仍待收口**。`Ferry.sectEntryMap` 仍保留「山门未注册 → trial_*」兜底 |
| **航线完整化** | `ferry_master` 已挂 6 航线（万妖外 + 天剑 + 四宗） | 去程已挂；**试炼进出回山门 / 体验验收**未单独收口。见 `reports/演武堂/20261010_四宗山门.md`、`art/_mech_out/v05b_sect_gate_gap.md` |
| tiles_secret | 已合 master | 正式试玩仍 v0.5.7；新包另等令 |

---

## 软收口判定

| 块 | 关态软收口 | 正式包 | 备注 |
|----|------------|--------|------|
| 职位/服务 | ✅（历史关态 PASS） | **已开** | 开态进 v0.5.7 |
| 制符 | ✅ | **已开** | `lifeSkillCurve` 仍关 |
| 神识 | ✅ | **已开** | smoke preamble 修后进包 PASS |
| #19+#20 | ✅ 关态+表加载 | **继续关** | 开态须负责人令 |
| 山门+航线 | 图/航线已接线 | 体验未收口 | **v0.5b 主剩余** |
| **总判** | 已开项勿回退；仍关项勿擅自开 | 正式包 **v0.5.7** | 空档推缺口文档 / 山门体验收口，**勿开禁开项** |
