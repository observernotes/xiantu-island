# 美术引擎测试夹具

这些文件仅由 `scripts/art-engine-test.mjs` 通过测试页路由和 `window.__xt.art` 加载，不进入 `art/` 或发布资源。
正式主角 v2 为 192×192、displayScale=0.5、bodySize=[52,116]、origin=[0.5,1]；显示画布仍为 96×96，世界碰撞框仍为 26×58，脚底中心及所有名牌位置保持不变。测试固定主角脚底于 (320,608)，碰撞框为 (307,550,26,58)。
`player-1x.png`、`player-1x.atlas.json`、`player-1x.anims.json` 精确取自提交 `a0f37b9e4f1af41329883f168dd37b58ff5fede7` 的旧 `player_sword_m` 三件套；保留 base atlas key 与原帧名，96×96、默认 displayScale=1。
`player-2x.png` 是该旧 96 素材每个像素做 nearest 2 倍复制；图集保留原帧名、帧数、帧率，192×192、bodySize=[52,116]、displayScale=0.5。旧 1x/重复 2x 夹具继续验证缺省缩放、同一素材缩放后的像素与世界锚点，以及旧外观兼容路径；重复 2x 夹具不作为正式主角 v2 的像素基线。
背景是 5 张 64×64 色块；tiles 是 48 个 32×32 色块，16 个逻辑角色各有 3 个变体；environment 故意超出配置预算，验证灯/雾/粒子裁剪。
正常渲染基线从提交 `96e6584d26378bdef1c993faff6c62aa892f8d40` 自动在临时目录构建，使用正式主角 v2；基线截图与性能报告写 `dist/`，`ART_BASELINE_DIR` 可复用预先保存的该版本 test build。
