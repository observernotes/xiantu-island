# hero_sash_shade_r1_outfits 纯 PNG sync tip（2026-10-19）
结论：精修转正 PNG 已写入可追踪 `data/art/` 并推 tip `76b5b25`；`npm run sync` 后 public=data=art（六套 atlas）；json/anims/features 未改；Codex 未用（纯素材，先例 0ea8fad／4cbc01e 同范式）。

## tip
- 分支：`feat/ui-hero-sash-shade-r1-outfits` @ `76b5b253f84b0458685df2cae02a20bac10155bb`（短 `76b5b25`）
- 基线：`origin/dev@09ddf9b`；干净 worktree `/workspace/xiantu/wt/feat/ui-hero-sash-shade-r1-outfits`（未碰 wt/dev）
- 作者：炼器阁·界面接入 <xiantu@local>
- **已推** `origin/feat/ui-hero-sash-shade-r1-outfits`；**未推 origin/dev**；不发版；不改 features；≠产品刀；≠捆 v0.6.19；现网 v0.6.18
- 令文：`reports/炼器阁·界面接入/20261019_负责人令_hero_sash_shade_r1_outfits_png_sync.md`（收口待命明示例外）

## 转正核验
- 备份：`art/sprites/_backup/hero_sash_shade_r1_outfits_promote_20261019_152545/`
- 正式 vs 合入前 data：六套 atlas **png DIFF**；六套 **json/anims MATCH**
- parts：`equip/robe/{fox_robe,outfit_tianjian_1,outfit_taixu_1,outfit_lingfu_1,outfit_youying_1,outfit_wanshou_1}/sash.png` 已转正于 `art/parts/player_sword_m/`；与 pending MATCH；json 本就 MATCH（本 tip **只推 png**，json 不动）
- 执法基线：`reports/执法堂/20261019_hero_sash_shade_r1_outfits_baseline.md`（PASS；768×384／帧格 96×96；sash 56×72）
- 规格：只换 png；帧名/原点/json/anims/shoe 未改

## data/art 同步（本 tip，12 png）
### atlas（6）
1. `data/art/sprites/player_sword_m__fox_robe.png`（221235 bytes）
2. `data/art/sprites/player_sword_m__outfit_tianjian_1.png`（227235 bytes）
3. `data/art/sprites/player_sword_m__outfit_taixu_1.png`（236569 bytes）
4. `data/art/sprites/player_sword_m__outfit_lingfu_1.png`（231099 bytes）
5. `data/art/sprites/player_sword_m__outfit_youying_1.png`（216669 bytes）
6. `data/art/sprites/player_sword_m__outfit_wanshou_1.png`（221853 bytes）
### parts sash（6；目录新建＋仅 sash.png）
7. `data/art/parts/player_sword_m/equip/robe/fox_robe/sash.png`（1672 bytes）
8. `data/art/parts/player_sword_m/equip/robe/outfit_tianjian_1/sash.png`（1633 bytes）
9. `data/art/parts/player_sword_m/equip/robe/outfit_taixu_1/sash.png`（1169 bytes）
10. `data/art/parts/player_sword_m/equip/robe/outfit_lingfu_1/sash.png`（1158 bytes）
11. `data/art/parts/player_sword_m/equip/robe/outfit_youying_1/sash.png`（1037 bytes）
12. `data/art/parts/player_sword_m/equip/robe/outfit_wanshou_1/sash.png`（1036 bytes）
- json/anims/features/OpenFlag/balance/业务代码/package.json：**未改**
- 禁动：shoe／disciple_robe／发型五官／coat·skirt·sleeve／其它无关素材

## sync / 自测（`wt/feat/ui-hero-sash-shade-r1-outfits`）
- `npm run sync` → EXIT 0；manifest 147 图集（shared `/workspace/xiantu`）
- public / data/art / art 三方六套 atlas sha256 **一致**
- parts：art＝data（parts 不入 sync sprites 拷贝；未纳入 manifest）
- `npm run test:appearance`：588 assertions PASS
- `npm run test:optional-assets`：204 assertions PASS；fetchCalls=0
- `npm run test:smoke:missing-assets`：67 assertions PASS；missing 阶段 missingAssetRequests=0

## sha256（atlas；public=data=art）
- fox_robe `6a93cdd4281a2898de1c9cd65f079ca1bed7dda1518759492f74545305cfbb62`
- outfit_tianjian_1 `3207cfa71a2de4baca697d943f8e6dd0cc5829a4850e32abf8274e1b2ae6b9b8`
- outfit_taixu_1 `efbfd995b27e7cf14b2cc57a476de34e4b6fcae16f2a8052eaf165f1df5a976e`
- outfit_lingfu_1 `94b61fb83a017e2eedfcf470fd13434718b0d5d5772e00c64d8cae50b4622f70`
- outfit_youying_1 `f45e6ccf76180d70a7c9c36c9bdd1289bf2f1f74dde23e3e4a75562777edc742`
- outfit_wanshou_1 `123094a0fec50719e8efa06f7972eb67a71634ac29723860beccb9c4fb8464ca`

## sha256（sash parts；art=data）
- fox_robe/sash `50ff5e32e66c36d378a926ae8d532967e3474e87bfa21eccdadb492ec2f176d7`
- outfit_tianjian_1/sash `60d441285f405de51c8bb62546afec8ee2197cd57416fd5ff31e23264fdcca1a`
- outfit_taixu_1/sash `f0d298e3729d8a55d77cbbcd94f7fd56bccf9abd8acc70a22c31e866f0c1ea85`
- outfit_lingfu_1/sash `c63b019ea445a701b2727d25fe277f918144f13e31886b86e1353ef67dbf4068`
- outfit_youying_1/sash `931fe34de8f6926b4b5052b490da3172ceea5e2c344d25ecba3439f987838399`
- outfit_wanshou_1/sash `7ce8c722ed821f1f89f9adb8f1a6b0b1d3d9ce835c031381791718d42a64344d`

## 阻塞
- 无。请执法记艺术基线（appearance／optional-assets／missing-assets）。≠发版≠产品刀≠捆 v0.6.19。
