# 美术引擎测试夹具

这些文件仅由 `scripts/art-engine-test.mjs` 通过测试页路由和 `window.__xt.art` 加载，不进入 `art/` 或发布资源。
`player-2x.png` 是任务开始时 `player_sword_m` 的每个像素做 nearest 2 倍复制；图集保留原帧名、帧数、帧率，192×192、bodySize=[52,116]、displayScale=0.5。
背景是 5 张 64×64 色块；tiles 是 48 个 32×32 色块，16 个逻辑角色各有 3 个变体；environment 故意超出配置预算，验证灯/雾/粒子裁剪。
测试从原引擎提交 `a0f37b9` 自动在临时目录构建旧版，基线截图与性能报告写 `dist/`；`ART_BASELINE_DIR` 可复用预先保存的旧版 test build。
