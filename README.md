# 仙途岛 · 客户端（Phaser 3 + TypeScript + Vite）

- 开发：`npm install && npm run dev`（端口 5173）
- 构建：`npm run build`，产物在 `dist/`，发版复制到 `/workspace/xiantu/releases/<版本号>/`
- 手感参数：`src/config/feel.ts`（测试调手感只改这里）
- 原型地图：`src/config/maps.ts`（字符地图，后续换成 Tiled JSON，按 design/01_配置表规范.md）

## v0.1 色块手感原型
方向键移动，↑↓ 爬绳；Alt/空格/C 跳跃，空中再按为二段跳；↓+跳 穿下单向平台；
Ctrl/X 普攻（按住连打）；Z 拾取；F1 显示碰撞框；R 回出生点。
