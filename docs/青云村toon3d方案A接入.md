# 青云村批 0 toon3d 方案 A 接入

正式区域为 `qingyun`，地图仍用 `qingyun_village`，碰撞和交互坐标沿用基线。主角继续使用正式 hero v2。

## 正式素材与 sync

共享正式根为 `/workspace/xiantu/art/`，feat/dev 的 sync 从共享根读取。共享根不在游戏仓内，本提交将本次 15 个正式文件同时保存到可追踪的 `data/art/tiles/` 与 `data/art/sprites/`，供快照/无共享目录环境使用；没有更新其他游戏数据或发版开关。

旧 `tiles_qingyun.*`、`bg_qingyun_far/mid.png` 备份于共享根 `tiles/_backup/20261010_qingyun/`，sync 跳过该目录。正式 key 无试样区域名，无 art.overrides.json 覆盖。

`bg_qingyun.json` 合并交付 layers 与转换后的 E-4 environment。背景层系数、底边定位、透明度沿用交付；深度由引擎固定（fg=20），配置中的 depth 仅记录交付值。5 灯、2 雾、40 萤火；预算 16/4/96。光源 intensity 转 alpha、flicker.amp 转数字；雾补范围并转换速度/视差；粒子补 kind/范围/count，速度取区间中值、alpha 取 start。E-4 没有逐帧生命周期和 flicker.hz 接口，因此沿用其固定运动/闪烁行为。

首轮 E-4 只支持独立纹理 key，省略 environment.texture，采用内存生成光晕、雾带和萤火。r2 为灯光增加图集帧支持，见下节。props_qingyun 与 fx_qingyun_env 提供最小 anims.json，以正式 key 登记图集。

## r2 小改接入

本分支 rebase 到本地 dev `c036c89` 后接入。交付根为 `/workspace/xiantu/art/trial_v2/qingyun_3d/`；仅替换 `tiles/bg_qingyun_mid.png` 并重新转换 `tiles/fx_qingyun.json` 的 environment，两份正式 `bg_qingyun.json` 保持一致。旧 mid 与背景配置备份于共享根 `tiles/_backup/20261010_qingyun_r2/`；r2 mid 的交付、共享根、仓内快照 MD5 均为 `d3678516d254d04d02820fa67f7b5236`。

5 盏灯 radius 为 `56/48/48/56/48`，alpha 为 `0.4/0.35/0.35/0.4/0.35`。位置及暖色 color 沿用 r2，intensity 转 alpha、flicker.amp 转数字；所有灯配置 `texture: "fx_qingyun_env", frame: "glow_soft"`。交付 JSON 原有 3 盏 `glow_window`、2 盏 `glow_soft`，按总监口径及接入指令统一为 `glow_soft`。

EnvironmentArt 在创建灯光 Image 前检查纹理及帧是否存在；缺图集或缺帧时静默回退内存光晕，不请求帧名 PNG，也不将缺帧传给 Phaser。有效显式 frame 使用中心锚点，避免交付图集的底部 pivot 将灯光上移半径。未指定 frame 的既有独立纹理保持原行为。snapshot 的 lightDetails 返回实际纹理、帧、tint、当前 alpha、配置 baseAlpha、半径和 blendMode，供生产包采证。

生产截图发现原 E-4 的 ADD 会把绿色山背景叠成黄绿亮斑，即使交付 tint 已是暖色。r2 灯光没有指定 blend，青云 5 灯显式增加 `blend: "NORMAL"`，消除明显的荧光绿亮斑并保留柔和暖光；E-4 未配置 blend 仍默认 ADD，其他地图、雾和粒子沿用原行为。缺素材回退也使用配置的合成方式。

r2 的 fog/particles 按首轮转换后与原配置一致。粒子未交付 color，保留原 E-4 萤火默认 tint `#D8FF8E`；小萤火偏黄绿在报告中注明，不修改其颜色。光源使用交付的 `#FFB060/#FFE8A0/#FFD080`，不会采用萤火 tint。

帧贴图回归运行 `node scripts/environment-frame-test.mjs`；生产包截图与原生走跳验收运行 `node scripts/qingyun-r2-capture.mjs`。r2 截图、左右对照及运行证据分别位于 `/workspace/reports/qingyun_toon3d_a/r2_spawn.png`、`r2_compare.png`、`r2_evidence.json`，完整验收见同目录 `r2_验收.md`。

## 道具布局

sync 扫描 `art/tiles/props_*.layout.json`，仅存在的文件进入 assets.json 的 propLayouts 清单。GameScene 使用 optionalAssets 加载 JSON；PropLayout 按布局的 map 限定地图，在地图绘制完成后摆放装饰 Image。

坐标为世界像素，默认原点 `[0.5,1]`（脚底），支持 origin、flipX 和 scale。back=-2、mid=2、front=15；无物理 body、碰撞或输入处理。缺布局、缺 atlas、缺帧或无效坐标会静默跳过。场景关闭时释放对象。交付 16 件道具，无 front 层，不覆盖主角/NPC/交互提示深度。

## 前景淡出

BackgroundArt 对显式配置 fadeNearPlayer 的 fg 预采样一次低分辨率 alpha 掩码；每帧用主角身体附近与不透明区域的距离计算淡出，接近时平滑到约 0.35、远离后恢复配置 alpha。查询包含相机视差、显示缩放和 TileSprite 回绕，透明空区不会使整个前景一直淡出；深度仍为 20。无法读取 alpha 时保持原透明度。

## 验收与参考差异

美术 `FINAL_A_spawn.png` 是合成图：camX=40/camY=48、连续地面，无游戏 HUD/NPC/环境效果。实机使用既有 ui-cam 及地图，出生镜头约 camX=0/camY=164，包含真实平台、HUD、NPC 和传送门；不能作为逐像素零差异基准。E-2 既有非平铺背景按地图 coverage 缩放，交付层原宽与实机显示宽也有差异，保持原引擎策略。

r2 mid 已压暗绿台并露出台基；桥/水缸仍待后续交付。测试、截图、控制台、提交状态位于 `/workspace/reports/qingyun_toon3d_a/`。
