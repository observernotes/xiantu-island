# v0.5b 关态软收口总表

更新：2026-10-16（UTC+8）｜炼器阁·主程序，本轮航线/试炼回程收口
**相对旧表 13:06：正式包已升 v0.5.7；职位三 / 制符 / 神识已正式开；#19#20 / lifeSkillCurve 继续关。**  
**本轮只修航线/试炼回程真实缺口并补测；正式 features 默认值不改，不发版。**

## 总览

| 项 | 现状 |
|----|------|
| 本轮代码/测试 tip | `08ed28e8eb4597b759bd413b12011c4670b4ce1e`；交付文档随后提交，最终 tip 见 origin/dev HEAD |
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
| **四宗山门图** | 四山门已注册（40×20）；普通无 pending 误落试炼图、旧 position / pending 返回位置优先升到本宗长老/出生点；缺山门仍保留试炼兜底 | **本轮程序回程收口、自测通过，待执法堂复验**；美术运行构图确认仍另验 |
| **航线完整化** | 六航线保留；补 `trial_* → 山门 → 落霞` 关新地图后的回程链；win/fail/exit/中断归一到山门，注册山门时不挂旧入口 NPC，逃生出口优先本宗山门 | **本轮航线/试炼回程已修并补测**；tsc / v05 / classes（含 sect-entry）/ trials 绿。体验清单与浏览器证据见 `FERRY_TRIAL_RETURN_RESULT.md`；只推 dev，未发版 |
| tiles_secret | 已合 master | 正式试玩仍 v0.5.7；新包另等令 |

---

## 软收口判定

| 块 | 关态软收口 | 正式包 | 备注 |
|----|------------|--------|------|
| 职位/服务 | ✅（历史关态 PASS） | **已开** | 开态进 v0.5.7 |
| 制符 | ✅ | **已开** | `lifeSkillCurve` 仍关 |
| 神识 | ✅ | **已开** | smoke preamble 修后进包 PASS |
| #19+#20 | ✅ 关态+表加载 | **继续关** | 开态须负责人令 |
| 山门+航线 | ✅ 本轮程序航线/回程收口，自测绿 | 正式包未变，待执法堂复验 dev | 美术构图另验；缺图兜底保留 |
| **总判** | 已开项勿回退；仍关项勿擅自开 | 正式包 **v0.5.7** | 本轮仅 dev 航线/回程修复；**勿开禁开项、勿发版** |
