# 美术引擎测试夹具

这些文件仅由 `scripts/art-engine-test.mjs` 通过测试页路由和 `window.__xt.art` 加载，不进入 `art/` 或发布资源。
正式主角的画布、displayScale 和源像素 bodySize 从 `XT_DATA` 选择的 `art/sprites` 或 `data/art/sprites` 读取；缺省 displayScale=1、bodySize=[26,58]。世界碰撞体必须等于 bodySize×displayScale，保持旧 1x 的 26×58。测试固定主角脚底于 (320,608)，碰撞框为 (307,550,26,58)。
`player-1x.png`、`player-1x.atlas.json`、`player-1x.anims.json` 是 `2e44eb6` 回退后恢复的旧精修 `player_sword_m` 三件套；保留 base atlas key 与原帧名，96×96、默认 displayScale=1。正式素材仍为该 96 规格时，测试逐项校验当前数据源与这套夹具的 SHA-256 并写入报告，避免只因对照两端共用新素材而丢失旧精修基准。它们不用于构造 2x 测试资源。
`synthetic-player-1x.*` 与 `player-2x.*` 是独立的合成几何图案，透明背景、纯色矩形和单像素交替线，不使用正式美术像素。两者均保留主角的 11 个动作、25 帧及各动作帧率。合成 1x 为 96×96，atlas key 为 `player_sword_m`，省略 displayScale/bodySize/pixelArt，用于验证缺省元数据；合成 2x 是 1x 的 nearest 逐像素 2 倍复制，192×192、bodySize=[52,116]、displayScale=0.5、pixelArt=true，atlas key 为 `player_sword_m__art_test_2x`。配对夹具验证缩放后像素、世界锚点、移动中换装，以及 192 本体对 96 外观的兼容回退，均不依赖正式主角的分辨率或风格。
背景是 5 张 64×64 色块；tiles 是 48 个 32×32 色块，16 个逻辑角色各有 3 个变体；environment 故意超出配置预算，验证灯/雾/粒子裁剪。
正常渲染基线冻结为 `0dc2834a995f1cf2ed293f8b1b3823e1751b51dc`：已包含 96 旧精修回退及丹炉/五宗帖背包入口，早于 UI-5 商店窗；Player、BackgroundArt 和 EnvironmentArt 与待修复提交 `770c5a4` 相同。原 `5f5b341` 基线缺少两个隐藏背包入口 Text，导致全状态比较失败，世界碰撞框、脚底和 96 画布实际没有变化。基线自动在临时目录构建，两端共用当前数据源的地图和正式素材，继续比较全部状态、名牌/HUD 与整屏像素；基线截图与性能报告写 `dist/`，`ART_BASELINE_DIR` 可复用预先保存的基线 test build。
