# 精灵图集 v0.3（程序化占位版；主角已改为分层拼装烘焙）

| sprite 键 | 帧尺寸 | 动画（帧数） |
|---|---|---|
| `player_sword_m` 剑徒（男） | 96×96 | idle3 walk4 jump1 djump2 rope2 ladder2 attack3 hit1 die2 sit2 gather3（**分层烘焙**，见下；gather = 蹲下采集，8fps 循环，占位） |
| `player_sword_m__fox_robe` 剑徒（男）·狐裘道袍 | 96×96 | 同上，帧数/帧率/循环完全一致，帧名和动画键前缀换成 `player_sword_m__fox_robe` |
| `mon_spirit_rabbit` 灵兔 | 64×64 | idle2 walk3 hit1 die3（被动怪，无 attack） |
| `mon_bamboo_snake` 竹叶青蛇 | 64×64 | idle2 walk3 attack3 hit1 die3 |
| `mon_mountain_mandrill` 山魈 | 80×80 | idle2 walk3 attack3 hit1 die3 |
| `npc_village_elder` 李村长 | 96×96 | idle3 talk2（**v2 分层精修**，见下） |
| `npc_grocer_wang` 王婶 | 96×96 | idle3 talk2（**v2 分层精修**） |
| `npc_doctor_sun` 孙郎中 | 96×96 | idle3 talk2（**v2 分层精修**） |
| `npc_tianjian_elder` 传功长老 | 96×96 | idle3 talk2（占位：白衣天青边、白须） |
| `npc_tianjian_envoy` 天剑宗接引使（v0.4 补） | 96×96 | idle3 talk2（青年剑修：月白袍藏青边、高马尾天青发带、背负长剑；**v2 分层精修**，见下） |
| `fx_sword_slash` 剑修普攻刀光 | 128×96 | play5（20fps，不循环）。原点 (0.5,1) 对齐角色脚底，朝左；建议 `setBlendMode(ADD)`，在普攻第 2 帧播放 |
| `fx_sword_qi_slash` 剑气斩·剑气月牙（v0.3） | 96×64 | fly4（16fps，**循环**）hit4（20fps，不循环）。**原点 (0.5,0.5)**（投射物，月牙中心在帧内偏左 x≈30，拖尾向右）。朝左飞，向右飞时 `setFlipX(true)`。角色普攻第 2 帧在剑尖处生成、沿面朝方向飞行，命中第一个目标后切 `hit` 播一次再销毁。建议 NORMAL 混合 |
| `fx_whirl_sword` 回风剑·环形剑风+竹叶（v0.3） | 192×128 | play6（20fps，不循环，约 300ms）。原点 (0.5,1) 对齐角色脚底；剑风两圈（腰、胸），后半圈已画暗，可直接一层盖在角色上（depth = 角色 + 1）。竹叶是实色，**建议 NORMAL 混合**（ADD 会把竹叶洗白） |
| `fx_light_body` 轻身术·脚下云气（v0.3） | 96×48 | start4（12fps，不循环）→ loop4（8fps，**循环**）。原点 (0.5,1) 对齐角色脚底，每帧跟随角色；建议放在角色身后（depth = 角色 − 1）。增益结束时 200ms 淡出后销毁；结束前 5 秒可配合图标闪烁。建议 NORMAL 混合 |
| `mon_demon_fox` 首领妖狐（v0.4） | 192×160 | idle4 walk4 fox_fire4 phantom_dash4 fox_summon4 hit1 die5（原点 (0.5,1)，面朝左；详见下方“首领妖狐”一节） |
| `fx_fox_fox_fire` / `fx_fox_phantom_dash` / `fx_fox_phantom_dash_warn` / `fx_fox_fox_summon` | 见下 | 妖狐技能特效（紫色狐火，NORMAL 混合） |
| `mon_training_dummy` 木人桩（v0.4） | 64×80 | idle2 hit2（打不死、不移动；见下方“落霞郊野小怪”一节） |
| `mon_wild_boar_spirit` 野猪精（v0.4） | 96×80 | idle2 walk3 attack3 charge2 hit1 die3 |
| `mon_straw_puppet` 稻草傀儡（v0.4） | 64×80 | idle2 walk3 hit1 die3（被动怪，无 attack） |
| `mon_black_robe_minion` 黑袍人（v0.4） | 80×88 | idle2 walk3 attack3 hit1 die3 |
| `fx_boar_charge` / `fx_black_robe_projectile` | 见下 | 野猪精冲锋尘土 / 黑袍人飞符（NORMAL 混合） |

- 每个键 3 个文件：`<key>.png` 图集、`<key>.json`（Phaser JSONHash）、`<key>.anims.json`（动画键、帧名、帧率、是否循环）。
- 帧名 `<key>_<动作>_<两位帧号>`，动画键 `<key>_<动作>`。
- **全部面朝左**，向右走时 `setFlipX(true)`；原点 `setOrigin(0.5, 1)`，脚底在帧底边中心。
- 剑徒普攻第 2 帧是出剑判定帧；山魈和青蛇也是第 2 帧。

```ts
// preload
this.load.atlas(key, `art/sprites/${key}.png`, `art/sprites/${key}.json`);
this.load.json(`${key}_anims`, `art/sprites/${key}.anims.json`);
// create
for (const a of this.cache.json.get(`${key}_anims`).anims)
  this.anims.create({ key: a.key, frames: a.frames.map((f: string) => ({ key, frame: f })), frameRate: a.frameRate, repeat: a.repeat });
```

## 主角：分层拼装 + 离线烘焙（v0.2 起）
- `player_sword_m*` 不再由 `gen_sprites.py` 生成，而是由部件 `art/parts/player_sword_m/`（骨架 `skeleton.json`、姿势 `poses/*.json`）经 `art/tools/assemble.py` 按锚点拼装后烘焙。格式、帧名、帧数、帧率、repeat、帧尺寸、帧在图集里的位置都和旧版逐项一致（已 diff 验证），**程序不用改代码**。
- 换装变体：`player_sword_m__fox_robe` 只换了 robe 槽（袍身、袖子）。游戏里换装时把图集键换掉即可，例如 `sprite.play(\`${atlasKey}_walk\`)`。
- 爬绳、爬梯（rope/ladder）用的是背面图层顺序（`skeleton.json` 的 `views.back`：背面头、只留发髻、背面袍，隐藏五官和剑），**没有沿用旧帧**。所以狐裘版的爬绳、爬梯也是狐裘外观。
- 和旧版的差别：普攻第 2 帧不再把刀光画进角色帧里，刀光统一由 `fx_sword_slash` 播放；打坐时剑隐藏（收剑）。判定帧仍是普攻第 2 帧，剑向前下方斩出。
- 旧版备份在 `_backup/`。
- 重建（v1，已被 v2 取代，见下节）：`python3 art/tools/gen_parts_player.py`（重画部件）→ `python3 art/tools/assemble.py --out art/sprites --no-extras`（烘焙正式图集和预览）；不带参数运行会输出到 `sprites/_layered_sample/`，带 GIF、换装对比图、锚点调试图和抖动报告，用来验收。方案见 `art/01_连贯角色方案.md`。
- 注意：`gen_sprites.py` 现在已不再输出 `player_sword_m`（`__main__` 里已去掉），且第一行有 `import polish_guard`，重跑不会覆盖分层/精修版。

重新生成其他精灵：`python3 art/tools/gen_sprites.py`。这一版是用代码画的占位图，比例、锚点和帧数已经按正式规格定好；之后换手绘精灵时文件名和帧名不变，程序那边不用改代码。

## 主角精修 v2（2026-10-09，丹青阁·画风精修）
- 部件全部重画：`python3 art/tools/gen_parts_player_v2.py`（代码原创绘制，16x 超采样 → 赛璐璐上色 → 遮罩膨胀描边 → 4x 母版；未使用任何外部/官方素材）。旧占位部件脚本 `gen_parts_player.py` 不要再跑（会把部件冲回 v1）。
- 新增部件槽（`skeleton.json`）：`skirt` 下摆（可绕腰摆动）、`sash` 腰带垂尾+玉佩（二级摆动）、`cloud` 二段跳祥云（`parent:"_frame"` 固定在帧坐标、默认 `hidden`，帧里 `_show` 打开）；新表情 `face.shout`（出剑/二段跳）。`groundY` 改为 96（sole 锚点 = 鞋底外描边），`postSharpen` 对 1x 成品轻度锐化。
- `assemble.py` 新增：`--anims` 只烘焙指定动画、`hidden`/`_show`、`_frame` 父级、缺变体回落默认图；旧功能不变。
- 重写了 idle/walk/jump/djump/attack 的姿势（帧数/帧率/repeat 不变）；rope/ladder/hit/die/sit/gather 沿用原姿势、换成 v2 部件。普攻判定帧仍是第 2 帧（剑向前平斩到最远）。
- 重建：`XT_POLISH_OVERRIDE=1 python3 art/tools/assemble.py --out art/sprites --no-extras && python3 art/tools/annotate_anims.py`（`player_sword_m*` 已登记在 `art/polished.lock`，不带环境变量会被精修锁跳过）。
- 校验：`python3 art/tools/verify_player_sprites.py art/sprites/_backup/player_sword_m_20261009_203152`（帧名/帧矩形/pivot/动画表与旧版逐项比对 + 逐帧脚底行、头颈锚点、部件连通性）；预览：`python3 art/tools/preview_player_v2.py <同上备份目录>` → `preview/07_player_sword_m_v2_*`。
- 旧版备份：`_backup/player_sword_m_20261009_203152/`（图集、部件、assemble.py、gen_parts_player.py）。

## 青云村 NPC 精修 v2（2026-10-09，丹青阁·画风精修）
- 范围：`npc_village_elder` 李村长、`npc_grocer_wang` 王婶、`npc_doctor_sun` 孙郎中、`npc_tianjian_envoy` 天剑宗接引使（依据 `maps/qingyun_village.json` 的 4 个 npc 对象和 `balance/npcs.json` 里 `map: qingyun_village` 的条目；`npc_tianjian_elder` 传功长老属于 `tianjian_sect`、phase 3，本批未动）。
- 改为与主角相同的分层拼装：`python3 art/tools/gen_npc_qingyun.py` 生成 `art/parts/<key>/`（部件 + skeleton.json + poses/idle、talk），再 `XT_POLISH_OVERRIDE=1 python3 art/tools/assemble.py --char art/parts/<key> --out art/sprites --no-extras`，最后 `annotate_anims.py`。画笔、色板、描边参数直接复用 `gen_parts_player_v2.py`，头型与主角共用。
- 帧名、帧尺寸、图集布局（480×96）、idle 3 帧 3fps / talk 2 帧 4fps、原点 (0.5,1)、kind 均不变（`verify_rig_sprites.py` 逐项比对）。`gen_sprites.py` 里的 NPC 画法仍在，但这 4 个 key 已登记在 `art/polished.lock`，重跑不会覆盖。
- 动作：idle 呼吸 + 第 3 帧眨眼；talk：李村长抬杖、白须随说话动；王婶笑眼、后手招呼、菜篮一颠；孙郎中竖指叮嘱；接引使抬手作“请”。
- 校验：`python3 art/tools/verify_rig_sprites.py art/sprites/_backup/npc_qingyun_20261009_204023 npc_village_elder npc_grocer_wang npc_doctor_sun npc_tianjian_envoy`；预览：`python3 art/tools/preview_npc_qingyun.py <同上备份目录>` → `preview/08_npc_*`。

## 剑徒一转技能特效与图标（v0.3，`art/tools/gen_fx_icons.py`）
- 重建：`python3 art/tools/gen_fx_icons.py`。只写 `fx_sword_qi_slash`、`fx_whirl_sword`、`fx_light_body`、技能图标和预览 `preview/02_skill_fx_icons_preview.png`，**不碰 `player_sword_m*`，也不改 `gen_sprites.py`**（预览里只读 `player_sword_m` 的 idle 帧当比例参照）。
- 三个特效的 `.anims.json` 里 `origin` 字段写的就是建议原点；`frameSize` 写成 `[宽, 高]`。剑气斩是唯一原点 (0.5,0.5) 的，创建时记得 `setOrigin(0.5, 0.5)`，不要套用角色的 (0.5,1)。
- **混合模式**：风格指南原写“加色混合”，实测在青云村白云底上 ADD 会让天青白几乎消失（见预览第 2 段）。所以这三个特效都自带辉光和一圈深天青细边，**默认用 NORMAL**，在竹林这类偏暗的底上可以改 ADD 更亮。普攻刀光 `fx_sword_slash` 在白云底上也有同样的问题，后面会补一圈细边。
- **技能图标**：键名就是 `skills.json` 的 `icon` 字段。
  - 单张：`art/icons/skills/<icon key>.png`（32×32，快捷栏/提示）和 `<icon key>@64.png`（64×64，技能窗口）。
  - 图集：`art/icons/icons_skills.png` + `icons_skills.json`（Phaser JSONHash，32×32，帧名 = icon 键），`this.load.atlas('icons_skills', 'art/icons/icons_skills.png', 'art/icons/icons_skills.json')`。
  - 主动技能（剑气斩、回风剑、轻身术）是天青蓝框，被动（天剑心法·初、剑术精通）是金框；底都是宣纸色。**UI v2 精修（2026-10-09）**：外框改成 1px 墨褐 + 单色细框，去掉了四角云点，图案放大到 86%，32px 下更好认。重建用 `XT_POLISH_OVERRIDE=1 python3 art/tools/gen_ui_polish.py`；`gen_fx_icons.py` 重跑时会被精修锁跳过。
  - 注意：现在的 `npm run sync` 只拷 `art/sprites` 和 `art/tiles`，要再加一行把 `art/icons`（含 `skills/` 子目录）拷进 `public/art/icons`。

| icon 键 | 类型 | 图案 |
|---|---|---|
| `icon_skill_sword_qi_slash` | 主动 | 天青月牙 + 三道速度线 |
| `icon_skill_whirl_sword` | 主动 | 三层旋风 + 竹叶 |
| `icon_skill_light_body` | 主动（增益） | 灵云 + 羽毛 |
| `icon_skill_tianjian_heart` | 被动 | 淡金光轮里立剑于经卷之上 |
| `icon_skill_sword_mastery` | 被动 | 双剑交叉 + 金色交点 |


## 首领妖狐 `mon_demon_fox` 与狐火特效（v0.4，`art/tools/gen_boss_fox.py`）
依据：样张 `samples/04_首领妖狐.jpg`（白/淡紫毛、三尾尾尖紫狐火、红色额纹和眼下纹、金发簪红穗、破边紫围巾）和 `balance/monsters.json` 里 `demon_fox.skills`（fox_fire / phantom_dash / fox_summon）。
- 重建：`python3 art/tools/gen_boss_fox.py`。只写下表 5 个键和 `preview/03_boss_fox_preview.png`、`preview/03_boss_fox_scene.png`、各自的 `<key>_preview.png`；**不改 `gen_sprites.py`，也不碰其他精灵**（已 md5 校验）。脚本末尾会自检：非 die 帧脚底都在帧底边、任何帧都不贴边。

| 键 | 帧尺寸 | 原点 | 动画（帧数 / fps / 循环） | 用法 |
|---|---|---|---|---|
| `mon_demon_fox` | 192×160 | (0.5,1) | idle 4/5/循环，walk 4/8/循环，fox_fire 4/8，phantom_dash 4/8，fox_summon 4/6，hit 1/1，die 5/7 | 面朝左，朝右 `setFlipX(true)`。身体约 64×145（含耳朵），尾巴在身后右侧占位；建议 `BODY` 碰撞盒 **64×110**（脚底对齐，`anims.json` 的 `bodySize`） |
| `fx_fox_fox_fire` | 64×48 | **(0.5,0.5)** | fly 4/12/循环，hit 4/16 | 狐火弹，火球中心在帧内偏左 (22,24)，拖尾向右；朝左飞，朝右飞 `setFlipX(true)`。`fox_fire` 第 3 帧在妖狐脚底 + `(-64,-44)`（朝右时 x 取反）生成 3 枚（count 3，speed 260），命中切 hit 播一次后销毁 |
| `fx_fox_phantom_dash_warn` | 448×48 | **(0.9286,1)** | loop 4/12/循环 | 幻影突袭**预警**：原点放妖狐脚下，色带向左覆盖 384px 冲刺距离 + 身宽，左端圆圈是落点。`telegraphMs`（600ms）期间播放，冲刺开始时销毁。朝右冲时 `setFlipX(true)` 并把原点改成 `(1-0.9286, 1)` |
| `fx_fox_phantom_dash` | 448×160 | (0.5,1) | play 5/12 | 冲刺**残影**：三道紫色妖狐残影 + 速度线，冲刺结束后放在**路径中点**（起点与终点中间、地面），播一次销毁；左边的残影最实（靠近终点） |
| `fx_fox_fox_summon` | 96×112 | (0.5,1) | play 6/12 | 唤狐召唤阵：紫焰地环 → 火柱 → 散开。`fox_summon` 第 3 帧在 3 个刷兔点各播一个，**召唤阵第 4 帧时刷出灵兔** |

妖狐动作说明（关键帧也写在 `mon_demon_fox.anims.json` 的 `skillFrames` 字段里，程序可以直接读）：
- `fox_fire`：①抬爪聚火 ②三团火成形 ③前推释放（**判定帧 = 第 3 帧**）④收势。
- `phantom_dash`：①②下伏蓄力、双眼发紫光，**预警 600ms 内在 1→2 帧之间停留**（可 `setFrame` 定格第 2 帧）；③前扑冲刺，**位移阶段定格第 3 帧**；④落地收势。
- `fox_summon`：①双爪上举 ②尾焰大盛 ③仰头长啸（**判定帧 = 第 3 帧**）④收势。`hpBelow 0.5、once`，只播一次。
- `die`：受击 → 瘫倒 → 化作紫烟淡出（对应剧情“化作紫烟”），第 3 帧起身体下伏，第 4、5 帧半透明加紫烟；建议播完后再生成掉落。
- 首领战登场台词气泡建议挂在妖狐脚底 y−170 处。

**假设（请程序/数值确认）**
1. `monsters.json` 的技能里没有 fx 字段，所以特效键按 `fx_fox_<技能 id>` 命名：`fx_fox_fox_fire`、`fx_fox_phantom_dash`、`fx_fox_fox_summon`；预警是额外加的 `fx_fox_phantom_dash_warn`（只有 phantom_dash 有 `telegraphMs`）。以后配表加 `fx` 字段时直接填这些键即可。
2. 风格指南写的是“技能 2 种各 4 帧”，但配表有 3 个技能，所以出了 3 套各 4 帧；动画键用技能 id（`mon_demon_fox_fox_fire` 等），没有通用的 `attack` 动画——碰撞伤害（touchDamage）不需要单独动作。
3. 狐火颜色：主色 `#B07CFF`、深紫外辉 `#5C28A4`、芯 `#EEE2FF`。全部特效自带深紫外辉，**默认 NORMAL 混合**，奶油底、白云底、深色底都看得清（见 `03_boss_fox_preview.png` 底部三条对比）。
4. 妖狐整体高约 145px（含耳朵和尾焰约 150），在风格指南首领 128～192px 区间内，约为剑徒的 2.2 倍。


## 落霞郊野小怪与木人桩（v0.4，`art/tools/gen_mobs_v04.py`）
依据：`balance/monsters.json`（training_dummy / wild_boar_spirit / straw_puppet / black_robe_minion）、`balance/04_第三阶段怪物与试炼.md`、`maps/README.md`。
- 重建：`python3 art/tools/gen_mobs_v04.py`。只写下表 6 个键、各自的 `<key>_preview.png` 和总览 `preview/04_mobs_v04_preview.png`（左边放剑徒当比例参照，红线是地面）；只从 `gen_sprites.py` 导入画笔，**不改它的任何输出**（md5 已校验）。随机量全部固定，重跑逐字节一致。脚本末尾自检：非 walk/die 帧脚底都在帧底边，任何帧都不贴边。
- 全部面朝左，原点 (0.5,1)；`anims.json` 里的 `bodySize` 是建议的 `BODY` 碰撞盒，`attackFrames` 写明前摇帧和判定帧。
- **前摇约定**（和山魈一致，正好对上 `Monster.ts` 现有逻辑：在 attack 第 1 帧暂停 `telegraphMs`、第 2 帧判定）：`attack_01` = 前摇定格帧，`attack_02` = 出手/判定帧，`attack_03` = 收势。

| 键 | 帧尺寸 | 原点 | 动画（帧数 / fps / 循环） | 用法 |
|---|---|---|---|---|
| `mon_training_dummy` 木人桩 | 64×80 | (0.5,1) | idle 2/2/循环，hit 2/12 | `moveSpeed 0`、打不死，平时只播 idle。hit 是桩身左右摇两下（底座不动），想要反馈可以在 `takeHit` 里播一次再回 idle（现在 `respawnMs 0` 时直接 return，不播也不影响）。建议 `BODY` **28×60** |
| `mon_wild_boar_spirit` 野猪精 | 96×80 | (0.5,1) | idle 2/3/循环，walk 3/8/循环，attack 3/8，**charge 2/12/循环**，hit 1/1，die 3/6 | `attack.type: charge`、`telegraphMs 600`。①**前摇**：后坐、低头、前蹄刨地扬尘、鼻孔喷白气、眼放红光 ②起冲（判定帧）③收势。冲锋位移 192px 期间循环 `charge`（四蹄交替 + 速度线），停下后播 `attack_03`。建议 `BODY` **60×40** |
| `mon_straw_puppet` 稻草傀儡 | 64×80 | (0.5,1) | idle 2/3/循环，walk 3/8/循环，hit 1/1，die 3/6 | 被动怪，没有 attack（`touchDamage` 不需要动作）。walk 是独脚蹦跳，第 2 帧在帧内离地 5px，物理体不用跳。额前黄符暗示受黑袍人操控；die 是散架压扁成草堆后淡出。建议 `BODY` **30×52** |
| `mon_black_robe_minion` 黑袍人 | 80×88 | (0.5,1) | idle 2/3/循环，walk 3/8/循环，attack 3/8，hit 1/1，die 3/6 | `attack.type: projectile`、`telegraphMs 400`。①**前摇**：举符到脸侧，符上聚紫黑灵光，红眼放光 ②掷出（符离手，**在这一帧生成飞符**）③收势。飞符生成点 = 脚底 + `projectileSpawn` **(-22,-30)**（朝右时 x 取反）。建议 `BODY` **34×60** |
| `fx_boar_charge` 冲锋尘土 | 96×48 | **(0.12,1)** | loop 3/12/循环 | 冲锋期间挂在野猪精脚底**身后**：朝左冲时放在 `x+20`，尘土向右拖；朝右冲时 `setFlipX(true)`、原点改 `(0.88,1)`、放在 `x−20`。冲锋结束 150ms 淡出 |
| `fx_black_robe_projectile` 飞符 | 48×32 | **(0.5,0.5)** | fly 4/12/循环，hit 4/16 | 黄符裹紫黑灵光，符头朝左、拖尾向右；朝右飞 `setFlipX(true)`。speed 240、射程 320（`range.w`），命中或飞满射程后切 `hit` 播一次再销毁 |

**假设（请程序/策划确认）**
1. 这四只是普通 `attack`，不是 `skills[]`，所以规范 G6 不直接适用；特效键按同一格式取 `fx_<短名>_<attack.type>`：`fx_boar_charge`、`fx_black_robe_projectile`。没有单独做 `_warn` 预警特效——前摇已经由 `attack_01` 的姿势加程序现有的闪红表现，野猪精冲锋距离只有 192px，暂时不画地面预警带；数值觉得需要再补 `fx_boar_charge_warn`。
2. 稻草傀儡、木人桩没有攻击动作；木人桩不做 walk/die（不移动、打不死）。
3. 帧尺寸：野猪精是四足横向身形，用 96×80；黑袍人兜帽较高，用 80×88；另外两只 64×80。高度都在风格指南小怪 48～80px 内（黑袍人连兜帽约 70px）。
4. 背景里的稻草人（`bg_luoxia_mid`）特意做成无脸、无黄符的暮色剪影，和怪物稻草傀儡区分开。

## 自动加载约定（给 sync 扫描用）
- 每个 `<key>.anims.json` 都带这几个字段：`atlas`（图集 key）、`kind`（monster / npc / fx / player / prop）、`origin`、`frameSize`、`anims`；怪物还有 `bodySize: [宽, 高]`。
- 下划线开头的目录（`_backup`、`_layered_sample`）不是正式素材，扫描时要跳过。
- 不管跑了哪个生成脚本，最后都要再跑一次 `python3 art/tools/annotate_anims.py`，把 kind 和 bodySize 补齐。

## 筑基台试炼（v0.4，`art/tools/gen_trial_altar.py`）
依据：`design/06_突破与炼丹一期.md` 第一、二节，`maps/trial_foundation_altar.json` 和 `maps/README.md` 最后一节，`balance/trials.json`，`balance/monsters.json`（heart_demon_imp / heart_demon_wisp），规范附录 G6。
- 重建：`python3 art/tools/gen_trial_altar.py`，然后 `python3 art/tools/annotate_anims.py`。只写下表 9 个键、`icons/ui/ui_bar_cultivation*` 和预览；只从 `gen_sprites.py`、`gen_mobs_v04.py`、`gen_boss_fox.py` 导入函数，**不改任何已有输出**（md5 已校验）。随机量固定，重跑逐字节一致。脚本末尾自检：任何帧都不贴边（天雷顶边除外，雷从天上来），地面心魔非 die 帧脚底在帧底边，飞行心魔最低点离帧底 ≤4px。
- 预览：`preview/05_trial_altar_preview.png`（全部帧，红十字 = 原点；特效和道具放在暗紫底上看，最后一行是修为条 9-slice 拉伸效果）、`preview/05_trial_altar_scene.png`（按地图 json 实际坐标拼的 1600×704 全图：阵眼、长老虚影、4 个刷怪口、地面/飞行心魔、预警圈、落雷、底部瓶颈修为条）、`preview/05_trial_altar_breakthrough.png`（成功第 3/7/10 帧、失败第 4/6 帧叠在主角身上）。
- 心魔配色：墨紫身 `#2E2242`、淡紫外辉 `#B28CF0`、红眼 `#EC2C40`。身子是暗色，所以描边外再加一圈淡紫外辉，暗夜底和奶油底都分得清。
- `annotate_anims.py` 多认一个前缀：`prop_` → `kind: "prop"`（场景里可交互/有血条、但不是怪的物件）。

| 键 | 帧尺寸 | 原点 | 动画（帧数 / fps / 循环） | 用法 |
|---|---|---|---|---|
| `mon_heart_demon_imp` 心魔·地 | 88×72 | (0.5,1) | idle 2/3/循环，walk 3/8/循环，attack 3/8，hit 1/1，die 3/6 | `attack.type: melee`、`telegraphMs 300`。①**前摇**：后仰、前爪举到脑后、瞳心发亮、张嘴 ②前扑横扫（**判定帧**，爪前的紫色月牙画在帧内）③收势。打阵眼和打主角用同一套。die 是化成墨点往上飘，不倒地。`bodySize` **36×46** |
| `mon_heart_demon_wisp` 心魔·飞 | 84×76 | **(0.5,1) = 悬浮体最低点** | idle 4/6/循环，walk 4/8/循环（飞行移动），attack 3/8，hit 1/1，die 3/6 | 见下方“飞行怪说明”。`attack.type: projectile`、`telegraphMs 300`：①**前摇**：嘴前聚一颗红芯墨珠 ②吐出（**这一帧生成弹体**，生成点 = 原点 + `projectileSpawn` **(-21,-18)**，朝右 x 取反）③收势。`bodySize` **34×34** |
| `fx_heart_wisp_projectile` 墨珠弹 | 48×36 | **(0.375,0.5)** = 弹头中心 | fly 4/12/循环，hit 4/16 | 弹头朝左、墨尾向右；朝右飞时 `setFlipX(true)` 并把原点改成 (0.625,0.5)。speed 220，飞满 `range.w` 256 或命中后播 hit 再销毁 |
| `prop_formation_eye` 阵眼 | 128×128 | (0.5,1) | idle 6/6/循环，damaged 4/6/循环，hit 2/16，broken 5/8 | 放在地图 `objective` 坐标（聚灵台台面中心，x=800,y=576）。八角石盘 + 浮空灵晶 + 旋转符环 + 淡金光柱。气血 <30% 换 `damaged`（晶核裂纹、少两枚符、变暗）；受击播一次 `hit`（白闪 + 红色裂光）再回 idle/damaged；破阵播 `broken` 一次并停在最后一帧。建议受击矩形 `hitArea` **64×100**（脚底居中），血条画在原点上方 112px |
| `fx_trial_thunder_warn` 天雷预警圈 | 144×144 | (0.5,0.5) = 圆心 | warn 6/5（=1.2s，不循环） | 半径 64 = `trials.json` 的 `hazard.radius`。红色虚线圈 + 金色倒计时弧（走满一圈就落雷）+ 中心雷纹。telegraphMs 改了的话用 `play({ key, duration: telegraphMs })` |
| `fx_trial_thunder` 天雷 | 160×400 | **(0.5,0.8)** = 落点 = 圆心 | strike 6/16 | 和预警圈放同一个坐标。雷从落点上方 320px 劈下；**判定帧 = strike_02**；strike_04 冲击环正好半径 64；05、06 是余电和焦烟。建议同时震屏 80ms |
| `fx_spawn_gate` 刷怪口 | 96×128 | 地面 (0.5,1)；**空中 (0.5,0.5)** | open 4/12，loop 6/10/循环，close 4/12 | 地图 `spawnGate` 对象。墨紫漩涡，漩涡中心 = 帧中心，所以地面口（`gate_left/right`，y = 地面）用 (0.5,1)，空中口（`flying: true`）改成 `setOrigin(0.5,0.5)`。开场播 open 再循环 loop（漩涡里偶尔闪一对红眼），最后 5 秒 `despawnAll` 时播 close |
| `fx_breakthrough_success` 突破成功 | 192×320 | (0.5,1) = 主角脚底 | **back 12/8 + front 12/8**（同时播，1.5s） | 两层：`back` 放在主角身后（地面阵纹、淡金光柱、漩涡后半圈），`front` 放在主角身前（漩涡前半圈、旋入的灵气、祥云、光点）。0–3 帧灵气旋入，3–5 光柱升起，**第 7 帧爆光**（适合飘 `realm.breakthrough_ok`），5–10 祥云向两侧散开，9–12 淡出、光点上升 |
| `fx_breakthrough_fail` 突破失败 | 192×256 | (0.5,1) = 主角脚底 | play 10/8（1.25s） | 放在主角身前。1–3 帧灰紫光柱聚起又闪烁，第 4 帧裂开（裂纹只在头顶以上，不划过角色），5–9 碎成灰紫碎屑和气丝四散下坠，脚下一团灰烟。配合震屏和画面发灰 |

**飞行怪说明（`mon_heart_demon_wisp`）**
- 原点还是 (0.5,1)，但它指的是**悬浮体最低点**（下摆的尖），不是脚。`flyHeight [96,128]` 就按这个点离地算。`Monster.ts` 现在的做法（物理体贴帧底、居中）正好让 34×34 的物理体罩住头部，不用改偏移。
- 上下浮动已经画在帧里（idle 4 帧：0 → −1.5 → −3 → −1.5px），程序不用再做 bob；想要更飘，可以在这之上再叠一个周期 1.5s 左右、幅度 4px 的慢速正弦。
- 飞行移动没有单独的 `fly` 键，用 `walk`（前倾、尾巴摆动），这样 `Monster.anim('walk')` 直接能用。
- die 是原地化墨上飘，不往下掉，播完直接销毁。

**假设（请程序/策划确认）**
1. 两种心魔都是普通 `attack`，不是 `skills[]`。地面心魔的爪击月牙画在帧里，不另做特效；飞行心魔的弹体键沿用 `fx_<短名>_<attack.type>`，短名取 `heart_wisp` → `fx_heart_wisp_projectile`。前摇只有 300ms，又有 attack_01 姿势加程序闪红，所以两只都没做 `_warn`。
2. 天雷不是怪物技能，是试炼的 hazard，所以不套 G6 的怪物短名，键取 `fx_trial_thunder` / `fx_trial_thunder_warn`（`_warn` 后缀照 G6）。预警做成**以落点为圆心的整圆**（半径 64），因为 `thunder_area` 覆盖了台面和上方平台，雷可能落在任何高度；如果程序想让雷只落在地面/平台表面，也可以把圆心放在表面上，下半圈会被图块挡住，不影响阅读。
3. 阵眼是 `objective` 不是怪，键用 `prop_` 前缀，`kind: "prop"`；`hitArea`、`hpBarOffsetY` 写在 anims.json 里，只是建议值。
4. 长老虚影没有出新图：建议直接用 `npc_tianjian_elder`，`alpha 0.5` 加淡金 tint（`0xFFECAA`），见场景预览。
5. 筑基成功演出做成两层是为了让光柱在身后、漩涡和祥云在身前；如果程序只想挂一个精灵，单挂 `front` 也能看，只是少了光柱。

## 采集点 `prop_gather_<item id>`（v0.4，`art/tools/gen_alchemy_ui.py`）
| sprite 键 | 帧尺寸 | 动画 | 用在 |
|---|---|---|---|
| `prop_gather_spirit_herb` 灵草 | 48×48 | idle4（6fps 循环）harvested1 | bamboo_forest、lingxi_path、luoxia_outskirts_1/2 |
| `prop_gather_cold_heart_lotus` 寒心莲 | 48×48 | 同上 | lingxi_path（溪边） |
| `prop_gather_iron_essence` 铁精 | 48×48 | 同上 | lingxi_path、luoxia_outskirts_2 |

- 脚本扫描 `maps/*.json` 里 `type: gather` 的对象，按 `item` 出图；以后地图加了新的采集物，再跑一次就会补（没有专属画法的会借用同名物品图标的画法）。
- 原点 (0.5,1)，放在对象坐标，脚底 = 地面；`kind: prop`（`annotate_anims.py` 自动标）。可采时循环 `idle`（底光呼吸 + 上浮灵光点，灵草和莲花会轻轻摆）；采完切 `harvested` 停住（灵草剩茬、莲花剩荷叶、矿石剩碎石），`respawnMs` 到了切回 `idle`。也可以采完直接隐藏，但留个茬更像冒险岛。
- `anims.json` 额外字段：`hitArea` [32,32]（交互判定，脚底居中）、`promptOffsetY` −52（「Z 采集」文字位置）、`gatherItem`、`maps`。读条和读条图标见 `art/icons/ui/alchemy/README.md`。

## v0.4 新增预览
- `preview/06_bestiary_mockup.png`：妖兽图鉴整窗示意（7 种 v0.4 怪，分别处在不同档位）+ 卡片四档、徽章、全部自动头像。
- `preview/07_alchemy_mockup.png`：丹炉窗口示意（成丹 + 上品的瞬间）+ 采集点帧和实景 + 部件。
- `preview/07_items_icons_preview.png`：全部物品图标 @64 / 32 / 深色格子里的 32 / 32 放大。
