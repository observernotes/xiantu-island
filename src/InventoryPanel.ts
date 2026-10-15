import type Phaser from 'phaser';
import { ITEMS } from './data';
import type { Progress } from './Progress';
import { featureEnabled } from './features';
import { INK, INK_60 } from './hud';
import { ItemPanelView, equipReason, label } from './ItemPanelView';

const TABS = ['all', 'equip', 'consume', 'material', 'other'] as const;
type Tab = typeof TABS[number];
const TAB_NAMES = ['全部', '装备', '消耗', '材料', '其他'];
const PAGE_SIZE = 36;
export interface InventoryHooks {
  onChanged: () => void;
  openAlchemy: (id: string) => boolean;
  openSectToken: () => boolean;
}

/** UI-7 背包：分页只改变展示，穿戴与存档完全交给 Progress。 */
export class InventoryPanel extends ItemPanelView {
  private tab: Tab = 'all';
  private page = 0;
  private selected = 0;
  private revision = '';
  constructor(scene: Phaser.Scene, prog: Progress, private hooks: InventoryHooks) { super(scene, prog, 360, 440); }
  open() { this.tab = 'all'; this.page = 0; this.selected = 0; super.open(); }
  private rows() {
    return Object.entries(this.prog.inventory).filter(([, count]) => count > 0).map(([id, count]) => ({
      id, count, name: ITEMS[id]?.name ?? id, type: ITEMS[id]?.type ?? 'other',
    })).filter(row => this.tab === 'all' || (this.tab === 'other'
      ? !['equip', 'consume', 'material'].includes(row.type) : row.type === this.tab));
  }
  private fingerprint() { return JSON.stringify([this.prog.inventory, this.prog.stones, this.prog.job,
    this.prog.pendingSectTrial, featureEnabled('alchemyPhase1')]); }
  update() { if (this.shown && this.revision !== this.fingerprint()) this.render(); }
  setTab(tab: string) {
    if (!this.shown || !TABS.some(key => key === tab)) return;
    this.tab = tab as Tab; this.page = 0; this.selected = 0; this.status = ''; this.render();
  }
  setPage(page: number) {
    if (!this.shown || !Number.isSafeInteger(page)) return;
    this.page = Math.max(0, Math.min(Math.max(0, Math.ceil(this.rows().length / PAGE_SIZE) - 1), page));
    this.selected = this.page * PAGE_SIZE; this.status = ''; this.render();
  }
  select(index: number) {
    if (!this.shown || !Number.isSafeInteger(index) || index < 0 || index >= this.rows().length) return;
    this.selected = index; this.page = Math.floor(index / PAGE_SIZE); this.status = ''; this.render();
  }
  private action(id: string) {
    if (ITEMS[id]?.type === 'equip') return 'equip';
    if (ITEMS[id]?.toolType === 'furnace' && featureEnabled('alchemyPhase1')) return 'furnace';
    if (id === 'five_sect_token' && !this.prog.job && !this.prog.pendingSectTrial) return 'token';
    return '';
  }
  activate() {
    if (!this.shown) return;
    const row = this.rows()[this.selected];
    if (!row) return;
    const action = this.action(row.id);
    if (action === 'equip') {
      const result = this.prog.equipItem(row.id); this.statusOk = result.ok;
      this.status = result.ok ? label('ui.inv.equipped', '已穿上{item}。', { item: row.name }) : equipReason(result);
      if (result.ok) this.hooks.onChanged();
    } else if (action === 'furnace' || action === 'token') {
      // 场景成功打开目标 modal 时统一关闭背包；入口失败时保留选择和提示。
      const opened = action === 'furnace' ? this.hooks.openAlchemy(row.id) : this.hooks.openSectToken();
      if (opened) { this.close(); return; }
      this.statusOk = false; this.status = label('ui.inv.unavailable', '当前无法使用，请稍后再试。');
    }
    this.render();
  }
  snapshot() {
    const rows = this.rows();
    return { open: this.shown, tab: this.tab, page: this.page, pages: Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
      tabs: [...TABS], rows, selected: this.selected, selectedId: rows[this.selected]?.id ?? null,
      action: this.action(rows[this.selected]?.id ?? ''), status: this.status, statusOk: this.statusOk,
      artUsed: { ...this.artUsed }, position: { ...this.position } };
  }
  protected onKey(event: KeyboardEvent) {
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 };
    if (event.key in delta) this.select(Math.max(0, Math.min(this.rows().length - 1, this.selected + delta[event.key])));
    else if (event.key === 'PageUp' || event.key === 'PageDown') this.setPage(this.page + (event.key === 'PageUp' ? -1 : 1));
    else if (event.key === 'Tab') this.setTab(TABS[(TABS.indexOf(this.tab) + (event.shiftKey ? 4 : 1)) % TABS.length]);
    else if (event.key === 'Enter' || event.key.toLowerCase() === 'z') this.activate();
    else return false;
    return true;
  }
  protected render() {
    if (!this.shown) return;
    const rows = this.rows(), pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    this.selected = Math.max(0, Math.min(rows.length - 1, this.selected)); this.page = Math.min(this.page, pages - 1);
    this.shell('inventory', label('ui.inv.title', '背包'));
    this.box('ui_bestiary_inset', [16, 58, 328, 312]);
    TABS.forEach((tab, i) => {
      const x = 22 + i * 64;
      if (tab === this.tab) this.outline([x, 32, 56, 24]);
      this.text(x + 28, 44, label(`ui.inv.tab_${tab}`, TAB_NAMES[i]), 12, tab === this.tab ? INK : INK_60).setOrigin(0.5);
      this.zone([x, 32, 56, 24], () => this.setTab(tab), `inventory-tab-${tab}`);
    });
    for (let cell = 0; cell < PAGE_SIZE; cell++) {
      const x = 22 + cell % 6 * 52, y = 64 + Math.floor(cell / 6) * 52, index = this.page * PAGE_SIZE + cell, row = rows[index];
      this.box('ui_hud_slot', [x, y, 44, 44]);
      if (!row) continue;
      this.item(row.id, x + 6, y + 6);
      this.text(x + 40, y + 42, String(row.count), 12, INK, true).setOrigin(1).setStroke('#FAF2DC', 2);
      if (index === this.selected) this.outline([x, y, 44, 44]);
      this.zone([x, y, 44, 44], () => this.select(index), `inventory-item-${row.id}`);
    }
    if (!rows.length) this.text(180, 212, label('ui.inv.empty', '此页暂无物品'), 14, INK_60).setOrigin(0.5);
    this.text(68, 380, `${this.page + 1} / ${pages}`, 12, INK_60).setOrigin(0.5);
    this.text(338, 380, label('ui.inv.stones', '灵石 {n}', { n: this.prog.stones }), 12, INK_60).setOrigin(1, 0.5);
    this.text(30, 380, '‹', 16).setOrigin(0.5); this.zone([20, 371, 20, 18], () => this.setPage(this.page - 1), 'inventory-prev');
    this.text(106, 380, '›', 16).setOrigin(0.5); this.zone([96, 371, 20, 18], () => this.setPage(this.page + 1), 'inventory-next');
    const row = rows[this.selected], action = this.action(row?.id ?? '');
    this.text(22, 402, row ? `${row.name} ×${row.count}` : label('ui.inv.select', '选择物品查看操作'), 12, INK, true)
      .setOrigin(0, 0.5).setWordWrapWidth(230);
    const actionName = action === 'equip' ? label('ui.inv.equip', '穿上') : action === 'furnace' ? label('ui.inv.furnace', '使用丹炉')
      : action === 'token' ? label('ui.inv.token', '五宗令') : label('ui.inv.held', '持有物品');
    this.button([262, 390, 76, 24], actionName, !!action, () => this.activate(), 'inventory-activate');
    this.statusLine(419, label('ui.inv.keys', '方向键选择 · 回车使用 · Esc / I 关闭'));
    this.revision = this.fingerprint();
  }
}
