# UI4_FINISH_RESULT

2026-10-16，炼器阁·界面接入。

- worktree：`/workspace/xiantu/wt/feat/ui-4`
- 分支：`feat/ui-4`；接入基线：`4f772c10f112bfd412b9107632f0d4b19cbd7965`
- 实现提交：`7f31ff39289e52a3a628d3ca2f2ba26ed2627b7f` — `feat(UI-4): complete talisman craft panel layout`
- 本报告另作本地补记提交；未 push，未执行 force push 或 reset --hard。
- `data/features.json` 保持 `talismanCraft=false`、`lifeSkillCurve=false`；测试仅通过测试桥切换运行时开关，没有改默认 JSON。

## 完成内容

按 `talisman_ui.json` 接入四种符卡、研墨页、材料槽与来源、制作预览、宗门加成与品质上限、独立预览纸与绘制累计帧、方向序列与当前笔、剩余时间条、正确/错误/超时反馈、品质结果及再来/关闭按钮。中文窄列按字换行，已目视核对截图。

Scene 把完整 `TalismanSystem.view()`、规则 `qualityMin`、确认状态和 `Progress.lifeSkillView('talisman')` 映射到 Panel；Panel 只展示并发 `select/action` 意图。未修改 `src/Talisman.ts` 结算/事务核心、共享或快照 balance 数值、默认功能开关。待领取继续由 Scene update 调 `claimPending()`，结果按钮不发奖。

绘制时隐藏独立纸，累计正确数为 0 用 blank；正确才更新 stroke 帧，错误/超时只叠提示特效。成功播 done，凝符失败先撤下旧纸与累计 sprite 再播 craft_fail。保留放弃确认与暂停原因叠加，补失焦残键清理、忽略 repeat，以及重开保留所选配方。

制符静图、单张物品图标与布局 JSON 通过 optional load 接入；两套 FX 继续使用已有 optional atlas。按件缺失退回代码绘制；布局 JSON 缺失使用默认布局，同时保留仍存在的静图。

接口与排版说明：`docs/制符界面收尾.md`。

## 测试

| 命令 | 结果 | 日志 |
|---|---|---|
| `npm run sync` | 通过 | `sync.log` |
| `npx tsc --noEmit` | 通过，退出码 0 | `tsc.log` |
| `npm run build` | 通过，含 `xt leak-check PASS (903 files)` | `build.log` |
| `npm run test:optional-assets` | 通过，128 断言，fetchCalls=0 | `test-optional-assets.log` |
| `npm run test:talisman` | 通过，snapshot/shared 各 725 断言，共 1450 | `test-talisman.log` |
| `XT_TALISMAN_UI_SHOTS=/workspace/reports/ui4_finish npm run test:smoke:talisman-ui` | 通过，1412 断言，退出码 0，125.198 秒 | `talisman-ui-smoke.log` |
| `git diff --check` | 通过 | 本地检查 |

日志均位于 `/workspace/reports/ui4_finish/`。最终机器报告为 `talisman-ui-smoke.json`，退出码见 `talisman-ui-smoke-exit-code.log`。构建仅有既有的大包体积提示。

最终烟测共 20 页、10 个 context、29 张截图；全部 20 个浏览器 session 的 consoleErrors/pageErrors/requestFailures/httpErrors 均为 0。

覆盖壳态双按钮四态与回调、真实 NPC 教学与自然入口、材料足缺/锁卡/研墨、完整画符序列、正确/错笔/真实超时、成符与两类失败、再制与确认放弃/继续/关闭、全局暂停及失焦丢 keyup、重开配方记忆、待领取自动恢复、等级开关只读显示、集中专属资源缺图、布局 JSON 缺失、11 件共用窗体/按钮逐件实体 PNG 缺失。

## 截图

输出目录：`/workspace/reports/ui4_finish/`。完整清单同时写在 `talisman-ui-smoke.json`。

- `/workspace/reports/ui4_finish/ui4.png`
- `/workspace/reports/ui4_finish/ui4_material_lack.png`
- `/workspace/reports/ui4_finish/ui4_ink.png`
- `/workspace/reports/ui4_finish/ui4_preview.png`
- `/workspace/reports/ui4_finish/ui4_drawing_blank.png`
- `/workspace/reports/ui4_finish/ui4_stroke_miss.png`
- `/workspace/reports/ui4_finish/ui4_stroke_timeout.png`
- `/workspace/reports/ui4_finish/ui4_result_mid.png`
- `/workspace/reports/ui4_finish/ui4_abandon_confirm.png`
- `/workspace/reports/ui4_finish/ui4_life_skill.png`
- `/workspace/reports/ui4_finish/ui4_fail_condense.png`
- `/workspace/reports/ui4_finish/ui4_fail_completion.png`
- `/workspace/reports/ui4_finish/ui4_output_pending.png`
- `/workspace/reports/ui4_finish/ui4_missing_layout_json.png`
- `/workspace/reports/ui4_finish/ui4_craft_missing_preview.png`
- `/workspace/reports/ui4_finish/ui4_craft_missing_drawing.png`
- `/workspace/reports/ui4_finish/ui4_craft_missing_result.png`
- `/workspace/reports/ui4_finish/ui4_missing_manifest.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_hud_dialog_option_normal.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_hud_dialog_option_selected.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_hud_dialog_option_disabled.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_alchemy_btn_normal.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_alchemy_btn_hover.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_alchemy_btn_pressed.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_alchemy_btn_disabled.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_bestiary_window.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_bestiary_title.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_bestiary_inset.png`
- `/workspace/reports/ui4_finish/ui4_missing_ui_bestiary_btn_close.png`

## 已知缺口

制符等级条专用坐标待美术补 JSON。目前在 sectInfo 右侧只读显示等级/经验，仅 `lifeSkillCurve` 开启且 `available` 时展示；没有向 balance 添加字段。

## 验收自检

- [x] `feat/ui-4` 已含指定收尾实现提交，报告也本地提交，工作树干净。
- [x] 未 push。
- [x] talismanCraft / lifeSkillCurve 默认仍为 false。
- [x] sync / tsc / build / optional-assets / talisman / talisman-ui smoke 通过。
- [x] 按 JSON 展示材料、画符与结果，消费 view/action，未改结算核心。
- [x] 文档、截图与 RESULT 已写，RESULT 同步保存到 worktree 根与报告目录。
