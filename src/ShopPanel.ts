import Phaser from 'phaser';
import { ITEMS, NPCS, t } from './data';
import type { Progress } from './Progress';
import { HUD_FONT, INK, INK_60, PAPER, RED, sliced, hudSpec, sectRankIcon } from './hud';
import { featureEnabled, type FeatureName } from './features';
import { newSectTransactionId, type SectGrowth, type SectGrowthResult } from './SectGrowth';

/**
 * UI-5 商店窗：王婶/孙郎中普通买卖与宗门商店/藏经阁兑换。
 * 只调用 SectGrowth 的目录与结算接口（ordinaryCatalog/buyOrdinary/ordinarySellCatalog/sellOrdinary、catalog/exchange）；
 * 价格、库存、余额与收据规则全部归逻辑层。窗体件按可选素材加载，缺图时各件退回代码画。
 */
export type ShopTarget =
  | { kind: 'ordinary'; npcId: string; mode: 'buy' | 'sell' }
  | { kind: 'sect'; npcId: string; service: 'sect_shop' | 'sect_library' };

export interface ShopRow {
  itemId: string; name: string; price: number | null; ok: boolean; key: string;
  held?: number; reqRank?: string; rankName?: string;
}
/** 一次独立确认：确认前生成交易 ID，同次回调重试复用原 ID；结算前重读目录比对。 */
export interface ShopPending {
  target: ShopTarget; itemId: string; name: string; price: number | null; count: number;
  held?: number; reqRank?: string; transactionId: string;
}
export interface ShopHooks {
  log: (text: string, color: string) => void;
  /** 发版开关关闭时由场景弹出「暂未开放」，与对白入口一致。 */
  require: (name: FeatureName, npcId?: string) => boolean;
  rankIcon: (rankId: string) => string | undefined;
}

type Rect = [number, number, number, number];
const MAX_COUNT = 99;
const ROW_H = 26, ROW_GAP = 4;
const C = { ink: 0x3b2a20, paper: 0xfaf2dc, paper2: 0xece0c4, wood: 0x966a42, wood2: 0xa97a50, sky: 0x4096dc, skyFill: 0xd7eeff, grey: 0xe2dcd0, greyBtn: 0xb8afa4 };

/** strings 表缺 key 时用中文兜底，便于天机阁之后补文案。 */
function label(key: string, fallback: string, vars: Record<string, string | number> = {}) {
  const value = t(key, vars);
  if (value !== key) return value;
  return fallback.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

export class ShopPanel {
  private c?: Phaser.GameObjects.Container;
  private shown = false;
  private target?: ShopTarget;
  private rows: ShopRow[] = [];
  private catalogKey = '';
  private selected = 0;
  private scroll = 0;
  private quantity = 1;
  private openedAt = 0;
  pending: ShopPending | null = null;
  status = '';
  statusOk = true;
  /** 本次渲染用了哪些精修件、哪些退回代码画（供自测与快检）。 */
  artUsed: Record<string, 'art' | 'code'> = {};
  position = { x: 0, y: 0, width: 600, height: 420 };

  constructor(private scene: Phaser.Scene, private prog: Progress, private growth: () => SectGrowth, private hooks: ShopHooks) {
    const kb = scene.input.keyboard;
    kb?.on('keydown', this.onKey, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.close(); kb?.off('keydown', this.onKey, this); });
  }

  isOpen() { return this.shown; }
  get mode() { return this.target?.kind === 'ordinary' ? this.target.mode : 'exchange'; }

  open(target: ShopTarget) {
    if (!this.allowed(target)) return;
    this.target = target; this.shown = true; this.pending = null; this.status = ''; this.statusOk = true;
    this.selected = 0; this.scroll = 0; this.quantity = 1; this.openedAt = this.scene.time.now;
    this.reload(); this.render();
  }
  close() { this.shown = false; this.pending = null; this.clear(); }

  /** 每帧检查发版开关；测试或热切换关闭时只收起窗口，不结算。 */
  update() { if (this.shown && this.target && !this.allowed(this.target)) this.close(); }

  setMode(mode: 'buy' | 'sell') {
    if (!this.target || this.target.kind !== 'ordinary' || this.target.mode === mode) return;
    this.open({ ...this.target, mode });
  }
  select(index: number) {
    if (!this.rows.length) return;
    this.selected = Phaser.Math.Clamp(index, 0, this.rows.length - 1);
    const visible = this.visibleRows();
    if (this.selected < this.scroll) this.scroll = this.selected;
    if (this.selected >= this.scroll + visible) this.scroll = this.selected - visible + 1;
    this.pending = null; this.quantity = 1; this.render();
  }
  setQuantity(n: number) {
    if (this.pending) return;
    this.quantity = Phaser.Math.Clamp(Math.floor(n), 1, this.maxQuantity());
    this.render();
  }
  maxQuantity() {
    const row = this.rows[this.selected];
    if (!row || this.target?.kind !== 'ordinary') return 1;
    if (this.target.mode === 'sell') return Math.max(1, Math.min(MAX_COUNT, row.held ?? 1));
    const price = row.price ?? 0;
    let max = price > 0 ? Math.min(MAX_COUNT, Math.floor(this.prog.stones / price)) : MAX_COUNT;
    while (max > 1 && !this.prog.canReceiveItem(row.itemId, max)) max--;
    return Math.max(1, max);
  }
  /** 当前选择能否发起确认，以及不能时显示的原因（灵石不足等）。 */
  check(): { ok: boolean; reason: string } {
    const row = this.rows[this.selected];
    if (!row) return { ok: false, reason: t(this.catalogKey || 'sect.ui.config_pending') };
    if (this.target?.kind === 'ordinary' && this.target.mode === 'buy' && row.price !== null) {
      if (this.prog.stones < row.price * this.quantity) return { ok: false, reason: t('ui.shop.not_enough') };
      if (!this.prog.canReceiveItem(row.itemId, this.quantity)) return { ok: false, reason: t('sect.ui.bag_full') };
    }
    if (!row.ok) return { ok: false, reason: t(row.key, { rank: row.rankName ?? '' }) };
    return { ok: true, reason: '' };
  }
  /** 第一步：生成交易 ID，显示确认语。 */
  requestConfirm() {
    const row = this.rows[this.selected];
    if (!this.target || !row || !this.check().ok) { this.render(); return null; }
    this.pending = { target: this.target, itemId: row.itemId, name: row.name, price: row.price, count: this.quantity,
      held: row.held, reqRank: row.reqRank, transactionId: newSectTransactionId() };
    this.render();
    return this.pending;
  }
  cancelConfirm() { this.pending = null; this.render(); }
  /** 第二步：重读目录比对价格/数量/职位，再交给逻辑层结算。可用同一 pending 重放，由收据去重。 */
  commit(pending = this.pending): SectGrowthResult | null {
    if (!pending) return null;
    const target = pending.target;
    if (!this.allowed(target, true)) return { ok: false, key: 'closed' };
    const g = this.growth();
    let result: SectGrowthResult;
    const vars: Record<string, string | number> = { item: pending.name };
    if (target.kind === 'ordinary') {
      const selling = target.mode === 'sell';
      const catalog = selling ? g.ordinarySellCatalog(target.npcId) : g.ordinaryCatalog(target.npcId);
      const current = catalog.entries.find(row => row.itemId === pending.itemId);
      const held = current && 'count' in current ? (current as { count: number }).count : undefined;
      if (!current || current.price !== pending.price || (selling && (held !== pending.held || (held ?? 0) < pending.count)))
        return this.stale(pending);
      result = selling ? g.sellOrdinary(target.npcId, pending.itemId, pending.transactionId, pending.count)
        : g.buyOrdinary(target.npcId, pending.itemId, pending.transactionId, pending.count);
      vars.price = (pending.price ?? 0) * pending.count;
      vars.item = pending.count > 1 ? `${pending.name} ×${pending.count}` : pending.name;
    } else {
      const current = g.catalog(target.npcId, target.service).entries.find(row => row.itemId === pending.itemId);
      if (current && (current.costContribution !== pending.price || current.reqRank !== pending.reqRank)) return this.stale(pending);
      result = g.exchange(target.npcId, target.service, pending.itemId, pending.transactionId);
    }
    if (this.pending === pending) this.pending = null;
    this.status = t(result.key, { ...vars, rank: '' });
    this.statusOk = result.ok;
    if (result.ok && !result.repeated) this.hooks.log(this.status, '#ffd23a');
    if (this.shown && this.target === target) { this.reload(); this.render(); }
    return result;
  }
  /** 测试与快检读取的只读状态。 */
  snapshot() {
    return { open: this.shown, target: this.target ?? null, mode: this.mode, catalogKey: this.catalogKey,
      rows: this.rows.map(row => ({ ...row })), selected: this.selected, quantity: this.quantity, maxQuantity: this.maxQuantity(),
      check: this.check(), pending: this.pending ? { ...this.pending } : null, status: this.status, statusOk: this.statusOk,
      artUsed: { ...this.artUsed }, position: { ...this.position } };
  }

  private stale(pending: ShopPending): SectGrowthResult {
    if (this.pending === pending) this.pending = null;
    this.status = label('ui.shop.changed', '货架有变动，已刷新，请重新确认。');
    this.statusOk = false;
    if (this.shown) { this.reload(); this.render(); }
    return { ok: false, key: 'ui.shop.changed' };
  }
  private allowed(target: ShopTarget, prompt = false) {
    const need: FeatureName[] = target.kind === 'ordinary' ? ['shops']
      : target.service === 'sect_shop' ? ['sectShopLibrary', 'shops'] : ['sectShopLibrary'];
    for (const name of need) {
      if (featureEnabled(name)) continue;
      if (prompt) { this.close(); this.hooks.require(name, target.npcId); }
      return false;
    }
    return true;
  }
  private reload() {
    const target = this.target; if (!target) return;
    const g = this.growth();
    if (target.kind === 'ordinary') {
      const catalog = target.mode === 'sell' ? g.ordinarySellCatalog(target.npcId) : g.ordinaryCatalog(target.npcId);
      this.catalogKey = catalog.ok ? '' : catalog.key;
      this.rows = catalog.entries.map(entry => ({ itemId: entry.itemId, name: entry.name, price: entry.price, ok: entry.ok, key: entry.key,
        held: 'count' in entry ? (entry as { count: number }).count : undefined }));
    } else {
      const catalog = g.catalog(target.npcId, target.service);
      const order = g.config.ranks.rules.rankOrder;
      this.catalogKey = catalog.ok ? '' : catalog.key;
      this.rows = [...catalog.entries].sort((a, b) => order.indexOf(a.reqRank) - order.indexOf(b.reqRank))
        .map(entry => ({ itemId: entry.itemId, name: entry.name, price: entry.costContribution, ok: entry.ok, key: entry.key,
          reqRank: entry.reqRank, rankName: order.includes(entry.reqRank) ? entry.rankName : undefined }));
    }
    if (this.selected >= this.rows.length) this.selected = Math.max(0, this.rows.length - 1);
    this.quantity = Phaser.Math.Clamp(this.quantity, 1, this.maxQuantity());
  }

  // ---------------- 输入 ----------------
  private onKey(event: KeyboardEvent) {
    if (!this.shown || this.scene.time.now - this.openedAt < 120) return;
    const key = event.key;
    if (this.pending) {
      if (key === 'Enter' || key === 'z' || key === 'Z' || key === ' ') this.commit();
      else if (key === 'Escape' || key === 'x' || key === 'X') this.cancelConfirm();
      else return;
    } else if (key === 'Escape') this.close();
    else if (key === 'ArrowUp') this.select(this.selected - 1);
    else if (key === 'ArrowDown') this.select(this.selected + 1);
    else if (key === 'ArrowLeft') this.setQuantity(this.quantity - 1);
    else if (key === 'ArrowRight') this.setQuantity(this.quantity + 1);
    else if (key === 'PageUp') this.setQuantity(this.quantity - 10);
    else if (key === 'PageDown') this.setQuantity(this.quantity + 10);
    else if (key === 'Tab' && this.target?.kind === 'ordinary') this.setMode(this.target.mode === 'buy' ? 'sell' : 'buy');
    else if (key === 'Enter' || key === 'z' || key === 'Z') this.requestConfirm();
    else return;
    event.preventDefault();
  }

  // ---------------- 绘制 ----------------
  private clear() { this.c?.destroy(); this.c = undefined; }
  private visibleRows() { return Math.max(1, Math.floor((this.position.height - 108 - 12) / (ROW_H + ROW_GAP))); }
  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    (o as T & { setScrollFactor?: (factor: number) => unknown }).setScrollFactor?.(0);
    this.c!.add(o); return o;
  }
  private text(x: number, y: number, s: string, size = 12, color = INK, bold = false) {
    return this.add(this.scene.add.text(x, y, s, { fontFamily: HUD_FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' }));
  }
  /** 精修件优先；缺图（或缺切片表）时画同色系圆角框。 */
  private box(key: string, rect: Rect, fill: number, stroke: number, radius = 6, strokeWidth = 1, alpha = 1) {
    const art = sliced(this.scene, key, ...rect) ?? this.slicedLike(key, rect);
    if (art) { this.artUsed[key] = 'art'; return this.add(art); }
    this.artUsed[key] = 'code';
    const [x, y, w, h] = rect;
    const g = this.add(this.scene.add.graphics());
    g.fillStyle(fill, alpha).fillRoundedRect(x, y, w, h, radius);
    g.lineStyle(strokeWidth, stroke, 1).strokeRoundedRect(x + strokeWidth / 2, y + strokeWidth / 2, w - strokeWidth, h - strokeWidth, radius);
    return g;
  }
  /** `_active` 等状态图与底图同尺寸同切片，素材表只登记了底图。 */
  private slicedLike(key: string, rect: Rect) {
    const base = key.replace(/_(active|hover|pressed)$/, '');
    const spec = base !== key ? hudSpec(this.scene, base) : undefined;
    if (!spec?.nineSlice || !this.scene.textures.exists(key)) return null;
    const [x, y, w, h] = rect, n = spec.nineSlice;
    const o = this.scene.game.renderer.type === Phaser.WEBGL
      ? this.scene.add.nineslice(x, y, key, undefined, w, h, n.left, n.right, n.top, n.bottom)
      : this.scene.add.image(x, y, key).setDisplaySize(w, h);
    return o.setOrigin(0, 0).setScrollFactor(0);
  }
  private zone(rect: Rect, run: () => void) {
    const [x, y, w, h] = rect;
    return this.add(this.scene.add.zone(x, y, w, h).setOrigin(0, 0)).setInteractive({ useHandCursor: true }).on('pointerdown', run);
  }
  private button(rect: Rect, text: string, enabled: boolean, run: () => void, name?: string) {
    const [x, y, w, h] = rect;
    const bg = this.box(enabled ? 'ui_alchemy_btn_normal' : 'ui_alchemy_btn_disabled', rect, enabled ? C.wood : C.greyBtn, C.ink, 6);
    this.text(x + w / 2, y + h / 2, text, 14, enabled ? PAPER : '#F2EEE8', true).setOrigin(0.5).setStroke(INK, enabled ? 2 : 0);
    if (!enabled) return;
    const hit = this.zone(rect, run);
    if (name) hit.setName(name);
    if (bg instanceof Phaser.GameObjects.NineSlice || bg instanceof Phaser.GameObjects.Image) {
      hit.on('pointerover', () => this.scene.textures.exists('ui_alchemy_btn_hover') && bg.setTexture('ui_alchemy_btn_hover'));
      hit.on('pointerout', () => bg.setTexture('ui_alchemy_btn_normal'));
    }
  }
  private icon(itemId: string, x: number, y: number, size: number) {
    const key = itemId === 'spirit_stone' ? 'icon_spirit_stone' : ITEMS[itemId]?.icon;
    if (key && size > 32 && this.scene.textures.exists(`${key}@64`))
      return this.add(this.scene.add.image(x, y, `${key}@64`).setOrigin(0, 0).setDisplaySize(size, size));
    if (key && this.scene.textures.exists('icons_items') && this.scene.textures.get('icons_items').has(key))
      return this.add(this.scene.add.image(x, y, 'icons_items', key).setOrigin(0, 0).setDisplaySize(size, size));
    const g = this.add(this.scene.add.graphics());
    g.fillStyle(C.paper2, 1).fillRoundedRect(x, y, size, size, 4).lineStyle(1, C.ink, 0.4).strokeRoundedRect(x, y, size, size, 4);
    return g;
  }
  private priceText(price: number | null) {
    if (price === null) return '—';
    return this.target?.kind === 'sect' ? label('ui.shop.price_contribution', '{n} 贡献', { n: price }) : label('ui.shop.price_stones', '{n} 灵石', { n: price });
  }
  private title() {
    const target = this.target!;
    if (target.kind === 'sect') return t(target.service === 'sect_library' ? 'sect.library.menu' : 'sect.shop.menu');
    return label('ui.shop.title', '{npc}的货摊', { npc: NPCS[target.npcId]?.name ?? '' });
  }
  private balance() {
    return this.target?.kind === 'sect' ? t('sect.ui.contribution', { contribution: this.prog.sectContribution })
      : label('ui.shop.balance', '灵石：{n}', { n: this.prog.stones });
  }

  private render() {
    if (!this.shown || !this.target) return;
    this.clear(); this.artUsed = {};
    const { width: W, height: H } = this.position;
    this.position.x = Math.round((this.scene.scale.width - W) / 2);
    this.position.y = Math.round((this.scene.scale.height - H) / 2);
    this.c = this.scene.add.container(this.position.x, this.position.y).setDepth(232).setScrollFactor(0).setName('shop-panel');
    // 吃掉窗外点击，避免穿透到场景。
    this.add(this.scene.add.zone(-this.position.x, -this.position.y, this.scene.scale.width, this.scene.scale.height).setOrigin(0, 0).setInteractive());
    this.box('ui_bestiary_window', [0, 0, W, H], C.paper, C.wood, 8, 2, 0.97);
    const [tw, th] = hudSpec(this.scene, 'ui_bestiary_title')?.size ?? [160, 28];
    const titleW = Math.max(tw, 180);
    this.box('ui_bestiary_title', [(W - titleW) / 2, -12, titleW, th], C.paper2, C.ink, 6);
    this.text(W / 2, -12 + th / 2, this.title(), 18, INK, true).setOrigin(0.5).setName('shop-title');
    // 关闭钮
    if (this.scene.textures.exists('ui_bestiary_btn_close')) {
      this.artUsed.ui_bestiary_btn_close = 'art';
      const close = this.add(this.scene.add.image(W - 26, 6, 'ui_bestiary_btn_close').setOrigin(0, 0)).setName('shop-close');
      close.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close())
        .on('pointerover', () => this.scene.textures.exists('ui_bestiary_btn_close_hover') && close.setTexture('ui_bestiary_btn_close_hover'))
        .on('pointerout', () => close.setTexture('ui_bestiary_btn_close'));
    } else {
      this.artUsed.ui_bestiary_btn_close = 'code';
      this.box('ui_bestiary_btn_close__code', [W - 26, 6, 20, 20], C.paper2, C.ink, 4);
      this.text(W - 16, 16, '×', 14, INK, true).setOrigin(0.5);
      this.zone([W - 26, 6, 20, 20], () => this.close()).setName('shop-close');
    }
    delete this.artUsed.ui_bestiary_btn_close__code;
    // 页签（仅普通商店）与余额
    const target = this.target;
    if (target.kind === 'ordinary') {
      (['buy', 'sell'] as const).forEach((mode, i) => {
        const rect: Rect = [16 + i * 104, 32, 96, 30], active = target.mode === mode;
        this.box(active ? 'ui_bestiary_tab_active' : 'ui_bestiary_tab', rect, active ? C.paper : C.paper2, active ? C.sky : C.ink, 6);
        this.text(rect[0] + 48, rect[1] + 15, t(mode === 'buy' ? 'ui.shop.buy' : 'ui.shop.sell'), 14, active ? INK : INK_60, active).setOrigin(0.5);
        this.zone(rect, () => this.setMode(mode)).setName(`shop-tab-${mode}`);
      });
    }
    this.text(W - 16, 47, this.balance(), 14, INK, true).setOrigin(1, 0.5).setName('shop-balance');
    // 列表
    const list: Rect = [16, 76, 300, H - 108];
    this.box('ui_bestiary_inset', list, C.paper2, C.ink, 6, 1, 0.6);
    const visible = this.visibleRows();
    if (!this.rows.length) this.text(list[0] + list[2] / 2, list[1] + 40, t(this.catalogKey || 'sect.ui.config_pending'), 14, INK_60).setOrigin(0.5);
    this.rows.slice(this.scroll, this.scroll + visible).forEach((row, i) => {
      const index = this.scroll + i;
      const rect: Rect = [list[0] + 6, list[1] + 6 + i * (ROW_H + ROW_GAP), list[2] - 12, ROW_H];
      const selected = index === this.selected;
      const key = !row.ok ? 'ui_alchemy_list_row_disabled' : selected ? 'ui_alchemy_list_row_selected' : 'ui_alchemy_list_row_normal';
      this.box(key, rect, !row.ok ? C.grey : selected ? C.skyFill : C.paper, selected ? C.sky : C.ink, 5, 1, !row.ok ? 1 : 0.95);
      if (selected && !row.ok) {
        const g = this.add(this.scene.add.graphics()); g.lineStyle(1, C.sky, 1).strokeRoundedRect(rect[0], rect[1], rect[2], rect[3], 5);
      }
      this.icon(row.itemId, rect[0] + 6, rect[1] + 3, 20);
      const color = row.ok ? INK : INK_60;
      const name = row.held !== undefined ? `${row.name} ×${row.held}` : row.name;
      this.text(rect[0] + 32, rect[1] + ROW_H / 2, name, 14, color, selected).setOrigin(0, 0.5);
      let right = rect[0] + rect[2] - 8;
      const price = this.text(right, rect[1] + ROW_H / 2, this.priceText(row.price), 12, row.ok ? INK : RED).setOrigin(1, 0.5);
      right -= price.width + 6;
      const badgeKey = row.reqRank ? this.hooks.rankIcon(row.reqRank) : undefined;
      const badge = badgeKey ? sectRankIcon(this.scene, badgeKey) : null;
      if (badge) this.add(this.scene.add.image(right - 18, rect[1] + 4, badge.texture, badge.frame).setOrigin(0, 0).setDisplaySize(18, 18));
      this.zone(rect, () => this.select(index)).setName(`shop-row-${index}`);
    });
    if (this.rows.length > visible)
      this.text(list[0] + list[2] - 8, list[1] + list[3] - 4, `${this.scroll + 1}-${Math.min(this.rows.length, this.scroll + visible)} / ${this.rows.length}`, 12, INK_60).setOrigin(1, 1);
    this.detail([328, 76, W - 344, H - 108]);
    this.text(W / 2, H - 16, label('ui.shop.keys', '↑↓ 选货  ←→ 数量  Z/回车 确认  Esc 关闭') + (target.kind === 'ordinary' ? '  Tab 买/卖' : ''), 12, INK_60).setOrigin(0.5).setName('shop-keys');
  }

  private detail(panel: Rect) {
    const [px, py, pw, ph] = panel;
    this.box('ui_bestiary_inset', panel, C.paper2, C.ink, 6, 1, 0.6);
    const row = this.rows[this.selected], target = this.target!;
    const cx = px + 12;
    if (row) {
      this.icon(row.itemId, cx, py + 12, 48);
      this.text(cx + 60, py + 14, row.name, 18, INK, true);
      const lines = [`${label('ui.shop.unit_price', '单价')}：${this.priceText(row.price)}`];
      if (row.held !== undefined) lines.push(`${label('ui.shop.held', '持有')}：${row.held}`);
      if (row.rankName) lines.push(`${label('ui.shop.req_rank', '需职位')}：${row.rankName}`);
      this.text(cx + 60, py + 40, lines.join('   '), 12, INK_60);
      // 数量
      const qy = py + 92;
      const sect = target.kind === 'sect';
      this.text(cx, qy + 14, label('ui.shop.quantity', '数量'), 14, INK).setOrigin(0, 0.5);
      const max = this.maxQuantity();
      this.button([cx + 48, qy, 32, 28], '－', !sect && !this.pending && this.quantity > 1, () => this.setQuantity(this.quantity - 1), 'shop-qty-minus');
      this.box('ui_bestiary_inset', [cx + 86, qy, 56, 28], C.paper, C.ink, 4);
      this.text(cx + 114, qy + 14, String(this.quantity), 14, INK, true).setOrigin(0.5).setName('shop-qty');
      this.button([cx + 148, qy, 32, 28], '＋', !sect && !this.pending && this.quantity < max, () => this.setQuantity(this.quantity + 1), 'shop-qty-plus');
      if (!sect) this.text(cx + 188, qy + 14, `${label('ui.shop.max', '最多')} ${max}`, 12, INK_60).setOrigin(0, 0.5);
      const total = row.price === null ? null : row.price * this.quantity;
      this.text(cx, qy + 46, `${label('ui.shop.total', '合计')}：${this.priceText(total)}`, 14, INK, true).setName('shop-total');
      const check = this.check();
      if (!check.ok) this.text(cx, qy + 70, check.reason, 14, RED, true).setName('shop-reason');
      const verb = target.kind === 'sect' ? label('ui.shop.exchange', '兑换') : t(target.mode === 'sell' ? 'ui.shop.sell' : 'ui.shop.buy');
      if (!this.pending) this.button([px + pw - 132, py + ph - 48, 120, 32], verb, check.ok, () => this.requestConfirm(), 'shop-confirm');
    } else this.text(px + pw / 2, py + 40, t(this.catalogKey || 'sect.ui.config_pending'), 14, INK_60).setOrigin(0.5);
    if (this.pending) this.confirmBox(panel);
    else if (this.status) this.text(cx, py + ph - 72, this.status, 14, this.statusOk ? '#2E7D32' : RED, true)
      .setWordWrapWidth(pw - 24).setName('shop-status');
  }

  private confirmBox(panel: Rect) {
    const p = this.pending!, [px, py, pw, ph] = panel;
    const rect: Rect = [px + 12, py + ph - 126, pw - 24, 100];
    this.box('ui_bestiary_window', rect, C.paper, C.wood, 8, 2, 0.98);
    const item = p.count > 1 ? `${p.name} ×${p.count}` : p.name;
    const total = (p.price ?? 0) * p.count;
    const target = p.target;
    const text = target.kind === 'sect'
      ? t(`${target.service === 'sect_library' ? 'sect.library' : 'sect.shop'}.confirm`, { contribution: total, item })
      : t(target.mode === 'sell' ? 'ui.shop.sell_confirm' : 'ui.shop.confirm', { item, price: total });
    this.text(rect[0] + 12, rect[1] + 12, text, 14, INK, true).setWordWrapWidth(rect[2] - 24).setName('shop-confirm-text');
    this.button([rect[0] + rect[2] - 228, rect[1] + rect[3] - 40, 104, 30], t('sect.ui.confirm'), true, () => this.commit(), 'shop-commit');
    this.button([rect[0] + rect[2] - 116, rect[1] + rect[3] - 40, 104, 30], t('sect.ui.cancel'), true, () => this.cancelConfirm(), 'shop-cancel');
  }
}
