# 仙途岛 · 客户端（Phaser 3 + TypeScript + Vite）

- 开发：`npm install && npm run dev`（端口 5173）
- 构建：`npm run build`，产物在 `dist/`，发版复制到 `/workspace/xiantu/releases/<版本号>/`
- 手感参数：`src/config/feel.ts`（测试调手感只改这里）
- 原型地图：`src/config/maps.ts`（字符地图，后续换成 Tiled JSON，按 design/01_配置表规范.md）

## v0.1 色块手感原型
方向键移动，↑↓ 爬绳；Alt/空格/C 跳跃，空中再按为二段跳；↓+跳 穿下单向平台；
Ctrl/X 普攻（按住连打）；Z 拾取；F1 显示碰撞框；R 回出生点。

## v0.2 三种小怪与掉落
- 数值全部读 `../balance/*.json`，地图读 `../maps/*.json`（Tiled），精灵图集构建时从 `../art/sprites/` 复制（`npm run sync`）。
- 灵兔（被动）、竹叶青蛇（主动追击）、山魈（主动 + 拍地，带前摇和震屏）；受击硬直、死亡、按 respawnMs 复活。
- 修为结算按 exp_curve.json，等级差衰减按 player_growth.json，9 级修为满后停在瓶颈等突破。
- 掉落按 drops.json，Z 拾取（按住连续拾取），1/2 吃丹药，I 看背包。
- 梯子按 Tiled ladder 对象；传送门 ↑ 进入；首领区按 zone.unlockQuest 控制，任务系统 v0.3 接入。
- 地址参数 `?map=bamboo_forest` / `lingxi_path` / `field` 可直接进对应地图。
