# 场景美术能力测试夹具

这些合成配置只供 Node 测试使用，不会复制进正式 `art/`、`data/` 或生产包。

- `background-fade.json` 定义 128×128 透明前景中的 8×8 不透明区域，测试前景透明区、遮挡淡出、缩放、平铺与视差坐标。
- `props.layout.json` 定义装饰物摆放，测试地图筛选、层级、变换、缺帧、清理和可选加载清单；测试额外注入 NaN 坐标。
- `environment.atlas.json` 提供命名帧和底部 pivot 的独立图集契约，测试灯光居中、混合模式、闪烁与缺图/缺帧时的内存纹理回退，不依赖正式青云环境图集。

`qingyun-r2-capture.mjs` 是 toon3d r2 的专用生产截图验收。正式青云不再交付五盏图集灯光时，它明确输出 `skipped: true` 和原因；环境引擎仍由 `environment-frame-test.mjs` 的夹具断言与 `art-engine-test.mjs` 覆盖。
