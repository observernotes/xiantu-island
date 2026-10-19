# hero_sash_shoe_shade_r1 纯 PNG sync tip（2026-10-19）
结论：精修转正 PNG 已写入可追踪 `data/art/` 并推 tip `0ea8fad`；`npm run sync` 后 public=data=art（atlas）；json/anims/features 未改；Codex 未用（纯素材，先例 4cbc01e／79804d6 同范式）。

## tip
- 分支：`feat/ui-hero-sash-shoe-shade-r1` @ `0ea8faddc3834eacc890cd7f0ad586ebc47b4bb5`（短 `0ea8fad`）
- 基线：`origin/dev@09ddf9b`；干净 worktree `/workspace/xiantu/wt/feat/ui-hero-sash-shoe-shade-r1`（未碰 wt/dev）
- 作者：炼器阁·界面接入 <xiantu@local>
- **已推** `origin/feat/ui-hero-sash-shoe-shade-r1`；**未推 origin/dev**；不发版；不改 features；≠产品刀；现网 v0.6.18
- 令文：`reports/炼器阁·界面接入/20261019_负责人令_hero_sash_shoe_shade_r1_png_sync.md`（收口待命明示例外）

## 转正核验
- 备份：`art/sprites/_backup/hero_sash_shoe_shade_r1_promote_20261019_145611/`
- 正式 vs 合入前 data：atlas `player_sword_m.png` **png DIFF**（bb55… ≠ 5abe…）；**json/anims MATCH**
- parts：`disciple_robe/sash.png`＋`cloth_shoes/shoe.png` 已转正于 `art/parts/player_sword_m/`；与 pending polish **MATCH**；json 与 pending MATCH（本 tip **只推 png**，json 不动）
- 执法基线：`reports/执法堂/20261019_hero_sash_shoe_shade_r1_baseline.md`（PASS；768×384／帧格 96×96；sash 56×72、shoe 64×48）
- 规格：只换 png；帧名/原点/json/anims 未改

## data/art 同步（本 tip，3 png）
1. `data/art/sprites/player_sword_m.png`（218221 bytes）
2. `data/art/parts/player_sword_m/equip/robe/disciple_robe/sash.png`（1730 bytes；新增）
3. `data/art/parts/player_sword_m/equip/shoes/cloth_shoes/shoe.png`（1231 bytes；新增目录＋png）
- json/anims/features/OpenFlag/balance/业务代码/package.json：**未改**
- 禁动：狐袍／五宗 outfit／发型五官／其它无关素材

## sync / 自测（`wt/feat/ui-hero-sash-shoe-shade-r1`）
- `npm run sync` → EXIT 0；manifest 147 图集（shared `/workspace/xiantu`）
- public / data/art / art 三方 atlas `player_sword_m.png` sha256 **一致**
- parts：art＝data（parts 不入 sync sprites 拷贝；未纳入 manifest）
- `npm run test:appearance`：588 assertions PASS
- `npm run test:optional-assets`：204 assertions PASS；fetchCalls=0
- `npm run test:smoke:missing-assets`：67 assertions PASS；missing 阶段 missingAssetRequests=0

## sha256
- atlas `player_sword_m.png` `bb55c2bc9822123b9d1a47dc08c593783799888bce1301b1940381bde2265ce7`
- sash `6cd44508cea17e67b33e8e2f162615cd22343371ef687965a6524e83160e9d9b`
- shoe `80c12e0f12c3b5a0e232eb7fcf8f1b6be6ac5c5ab8dddf5f8bd7afe137aba216`
- json `73977aa57a69b3d4e84a1618a4e3ddb21f649aef8123497f1a64307bb50b130d`（未改）
- anims `50ee41e30ca903b95db22b9290a49ac2220d243ca37dba3876fdec784271df92`（未改）

## 阻塞
- 无。请执法记艺术基线（appearance／optional-assets／missing-assets）。≠发版≠产品刀。
