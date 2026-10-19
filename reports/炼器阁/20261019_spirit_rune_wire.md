# 炼器阁 · 2B·刷装快感·灵纹祭炼接线

> 2026-10-19 Asia/Shanghai（UTC+8）｜炼器阁·主程序执行器  
> 令：`reports/天机阁/20261019_负责人令_刷装快感_灵纹_接线.md` §2B  
> 设计：`design/35` 宿主 B｜文案降级强制  
> 2A：`reports/演武堂/20261019_spirit_rune_tables.md`  
> **≠ soft-open ≠ release ≠ 建 OpenFlag 文件 ≠ 抬 GAME_PHASE**｜现网 **v0.6.16**  
> Codex：sol 未跑（403 旁路直写，同接线令明示例外）。

## 结论

**PASS（关态可测 tip）**｜独立「灵纹祭炼」窗＋Gate／槽／炼化·淬炼·锁定拒写＋FX1–3 关态不出现｜消费 2A 表｜`SpiritRuneOpenFlag` 仅登记名、消费者恒关、无 OpenFlag 文件｜`softOpenedSpiritRune=false`｜文案降级抽检 PASS｜未碰飞行／Pages／v0.6.16 发版枝。

## tip

| 项 | 值 |
|---|---|
| 分支 | `feat/spirit-rune-wire` |
| tip SHA | 1ed64eec8af24861f6a3ec72d4c50eac81e9f036 |
| 基线 | `origin/master` @ fad2be9（V0616_RELEASE 文档后） |
| worktree | `/workspace/xiantu/wt/feat/spirit-rune-wire` |

## 2A 表 SHA（消费核对 MATCH）

| 文件 | SHA-256 |
|---|---|
| `balance/spirit_rune.json` | `cfdc93aede5345c1d9b8664f31b3283306ef3f54df3c7df2bf47a94b82555c88` |
| `balance/materials.json` | `1055536f181ae0a1f94d1a25e20473ea6f4be0b8289655dc4007c9c0295f6d4a` |
| `balance/items.json` | `0ea68e4b289b07fadb5d81516efc4796a102c3dbe14f793158a83aa41dd4e8e0` |
| wt `data/balance/*` 上述三文件 | 同字节 MATCH |
| `fly_zones.json` | `2940fe5952246a3669f87d8b9f3fc6226c2adf7080353be7de94da81e031b8e4`（未改） |

## Flag／soft 证据

| 项 | 值 |
|---|---|
| `SpiritRuneOpenFlag` 文件 | **未建** |
| 登记名 | `SpiritRuneOpenFlag`（`SpiritRuneAccess.ts`） |
| `isSpiritRuneOpen()` | **false**（关态默认） |
| `softOpenedSpiritRune()` | **false** |
| `released` | false |
| `newOpenFlag` | false |

## 改动面

### 新增

- `src/SpiritRuneAccess.ts` — Flag 名登记；消费者恒关；soft 证据位恒 false
- `src/SpiritRuneClosed.ts` — 关态 tip API
- `src/SpiritRuneProgress.ts` — `spiritRune.slots[]`／hostInstanceRef／计数
- `src/SpiritRuneRules.ts` — 读 2A `spirit_rune.json`（`spirit_rune_affixes`／消耗／slotCount）
- `src/SpiritRuneGate.ts` — refine／quench／lock／unlock；关态只 tip、零扣、零改槽
- `src/SpiritRuneFx.ts` — FX1 跳字标签／FX2 灵光／FX3 拖尾；关态全灭
- `src/SpiritRuneUiAccess.ts` — 独立 UI 壳可见性
- `src/SpiritRuneController.ts` — 祭炼窗状态机（选宿主→槽→炼化／淬炼／锁）
- `src/SpiritRunePanel.ts` — 独立窗「灵纹祭炼」／副标「试炼灵纹」
- `src/spirit-rune-closed.test.ts` + `scripts/spirit-rune-closed-test.mjs`
- `data/balance/spirit_rune.json`（2A 镜像）

### 修改

- `src/Progress.ts` — `spiritRune?:` 袋；存档结构校验
- `src/scenes/GameScene.ts` — 构造独立面板；`tryInteractSpiritRune`（不挂坊市、不塞欧冶匠）
- `data/balance/strings_zh.json` — §5.2 缺键＋窗名／词条名（文案降级）
- `data/balance/items.json`／`materials.json` — 同步 2A 残页镜像
- `package.json` — `test:spirit-rune-closed`

### 未改（硬门）

- 无 `SpiritRuneOpenFlag.ts`
- `SMITH_SERVICES` 仍 `forge/enhance/enchant/salvage`
- 未改 `fly_zones`／持续飞行源／`release.sh`／Pages／design/34
- 未 soft-open、未合 master、未抬 `GAME_PHASE`

## 自测

| 项 | 结果 |
|---|---|
| `tsc --noEmit`（本刀文件） | 无 SpiritRune／spirit-rune 报错（既有 `gen/assets` 缺图无关） |
| `npm run test:spirit-rune-closed` | **PASS** 211 assertions｜`qa/out_spirit_rune_closed_local/evidence.json` |
| 文案降级 | 禁「本命法宝本体／已获本命／已解锁本命法宝／本命未开」抽检 PASS |
| FX 关态 | FX1–3 全 false／null |

## 边界／下棒

- 开态写路径骨架在 Gate 内，Flag 恒关不会落事务；开态／O／soft 另令。
- 地图祭炼台对象（`spirit_rune_altar`）缺则入口安静 no-op；关态靠 Gate／Controller tip。
- 请经理开 **2C 执法关态 C**（含 FX＋文案降级）。
