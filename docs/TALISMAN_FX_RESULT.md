# 制符用符 FX 接线结果

结论：PASS。四符有图时播放已有 atlas；缺图或缺动画保留火符黄块／其余纯逻辑回退；默认开关仍关闭。

- 日期：2026-10-16。
- 工作区：`/workspace/xiantu/wt/dev`，分支 `dev`，基线 `c11adb4`。
- 提交说明：`制符用符 FX 接线`；仅本地提交，不 push。

## 接线范围

| 用符 | atlas 与行为 |
| --- | --- |
| 火 | `fx_talisman_fire_projectile` 循环 fly，向右翻转；首次敌人接触点播 `fx_talisman_fire_hit` 的 hit，一次结束销毁。撞地形／超射程只清弹体。 |
| 护 | `fx_talisman_guard_orbit` 的 start → loop；到期／死亡移除状态后播 end 并销毁。按 `talisman_ui.hud.icons` 显示已有 guard 图标。 |
| 聚 | `fx_talisman_gather_buff` 的 loop，低透明度随脚底；按实际 `expireAt` 清理，死亡遵循原逻辑保留到期。显示已有 gather 图标。 |
| 遁 | 读条播 `fx_talisman_return_cast` 的 loop，中断立即清理；成功保存后随 restart 传递一次性标记，目的地图与实际坐标确认后播 `fx_talisman_return_land` 的 land。 |

- 复用现有 optional 加载、动画注册和 `applySpriteArt` 原点／比例；混合模式为 NORMAL。
- 同时验证纹理、动画及对应帧，资源不足时不创建坏实例；buff 图标也按表项与已加载纹理逐件可选。
- 护／聚刷新和替换复用单实例；场景关闭、重启与功能关闭清理全部 FX、图标及弹体。
- 火弹保留原保存失败回滚；遁地保留原 timer 回滚，保存失败不携带落地标记。
- 源码只改 `src/scenes/GameScene.ts`；无需改 `TalismanUse.ts`，未改伤害、增益、消耗、冷却、传送判定或数值。
- 保留现有帧更新顺序，跟随视觉最多晚一帧；护符结束动画在移除时位置短暂收尾。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:talisman` | 退出码 0。snapshot／shared 各通过 craft 446、use 216、save 167 条断言；新增 FX 105 条断言通过。 |
| `npm run test:smoke:talisman-ui` | 退出码 0，1519 条断言；20 个页面，浏览器 console／page／request／HTTP 错误均为 0。 |
| `./node_modules/.bin/tsc --noEmit` | 退出码 0。 |
| `git diff --check` | 通过。 |
| 真实 Chromium FX 专项 | 53 条断言通过；六套 atlas 播放与推进、原点／朝向、真实动画事件完成销毁、护 start→loop→end、buff 复用／跟随、两枚图标、缺图回退及全部清理均通过；浏览器错误为 0。此专项未覆写开关，`talismanCraft` 全程 false。 |

FX 回归脚本为 `scripts/talisman-fx-test.mjs`，已串入 `scripts/talisman-test.mjs`。脚本提取真实 GameScene 方法，复用真实 SpriteArt 与 Phaser 碰撞几何，覆盖缺纹理／缺动画／缺帧、首次命中、撞墙／超程、buff 到期／死亡、读条中断、功能关闭清理及传送 timer 回滚。

配置核对：`data/features.json` 的 `talismanCraft` 为 **false**；`features.json` 和 balance JSON 均无本次改动。

验证日志：`/tmp/xiantu-talisman-fx-unit.log`、`/tmp/xiantu-talisman-ui-fx.log`；额外浏览器验证脚本：`/tmp/talisman-fx-browser.mjs`。

## 报告位置

指定报告：`/workspace/xiantu/reports/炼器阁/TALISMAN_FX_RESULT.md`。

该位置可写，但在 wt/dev 的 Git 仓库边界之外，不能从本 worktree 执行 git add；因此同内容副本保存为 `/workspace/xiantu/wt/dev/docs/TALISMAN_FX_RESULT.md`，随相关源码与测试一起提交。
