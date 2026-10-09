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

## v0.3 骨架：NPC 对话、任务链、突破、技能栏、图块
- 修复：Alt / Ctrl 组合键触发浏览器后退或菜单（`src/keyguard.ts`，必须挂在 Phaser 键盘监听之后）。
- 山魈拍地加前摇 `attack.telegraphMs`（缺省 500ms，抬手停顿 + 闪红）。
- NPC 读 npcs.json（中文名、精灵、头顶 ! / ? / …），Z 或 ↑ 对话；对白从 design/02_新手任务.md 解析。
- 任务读 quests.json：kill / collect / reach / breakthrough 目标，左上角追踪，交付奖励（装备自动穿戴）。
- 突破：瓶颈等级读 realms.json 的 levelMax；接引使交付时播放突破演出进入炼气期；转职演出。
- 首领区按 zone.unlockQuest 刷怪，首次进入播放登场台词，首领死亡播放战败台词（妖狐技能 AI 待做）。
- 自动加点：每级根骨 2、身法 2、悟性 1，statEffects 计入气血、攻防、修为加成。
- 图块按邻格自动选择（art/tiles），远景、中景视差；刀光特效第 2 帧加色播放。
- 技能快捷栏骨架（A S D F G H），炼气期解锁，技能数据待接 skills.json。
- 存档在浏览器 localStorage，地址加 `?reset=1` 重新开始。

## 分支与发版（v0.3.1 起）
- 主工作区 `/workspace/xiantu/game` 固定在 master，只做合并和打 tag；worktree 在 `/workspace/xiantu/wt/`：`dev`（日常开发）、`hotfix`（线上修复）、`qa`（给执法堂的待测版本）、`feat-*`（大功能分支，如 `feat/skills`）。
- 项目根目录（balance/、maps/、design/、art/）由 `scripts/root.mjs` 自动向上查找，代码里用 `@xt/...` 引用，所以每个 worktree 都读同一份配置和素材。
- 新 worktree 第一次用：`ln -s /workspace/xiantu/game/node_modules node_modules`。
- 发版：合到 master，打 `vX.Y.Z` tag，构建产物复制到 `releases/<版本>/` 再推到 gh-pages。

## v0.3.1
- G2 卡在瓶颈级的升级也会回满气血和灵力；G3 瓶颈期提示改成「修为已满，需突破」，只显示实际加上的修为。
- 文案改从 `balance/strings_zh.json` 读取（`t(key, vars)`）。
- 抓绳判定半宽 14 改成 18；出刀期间锁朝向。
- 刀光改用普通混合；sync 增加 `art/icons`。
