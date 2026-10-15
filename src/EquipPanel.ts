import type Phaser from 'phaser';
import { ITEMS } from './data';
import { EQUIP_SLOTS, type EquipSlot, type Progress } from './Progress';
import { INK, INK_60 } from './hud';
import { ItemPanelView, equipReason, label } from './ItemPanelView';

const SLOT_NAMES = { weapon: '武器', robe: '道袍', shoes: '鞋' };
export class EquipPanel extends ItemPanelView {
  private selected: EquipSlot = 'weapon';
  private revision = '';
  constructor(scene: Phaser.Scene, prog: Progress, private onChanged: () => void) { super(scene, prog, 300, 330); }
  open() { this.selected = 'weapon'; super.open(); }
  private attributes() {
    const p = this.prog, move = p.currentMovePoints();
    return { atk: p.atk, def: p.def, hp: p.maxHp, mp: p.maxMp, speed: move.speed, matk: p.matk };
  }
  private fingerprint() { return JSON.stringify([this.prog.equip, this.attributes(), this.prog.appearance]); }
  update() { if (this.shown && this.revision !== this.fingerprint()) this.render(); }
  unequip(slot: string) {
    if (!this.shown || !EQUIP_SLOTS.some(key => key === slot)) return;
    this.selected = slot as EquipSlot;
    const id = this.prog.equip[slot], result = this.prog.unequipSlot(slot);
    this.statusOk = result.ok;
    this.status = result.ok ? label('ui.equip.removed', '已卸下{item}。', { item: ITEMS[id]?.name ?? id }) : equipReason(result);
    if (result.ok) this.onChanged();
    this.render();
  }
  snapshot() {
    return { open: this.shown, slots: EQUIP_SLOTS.map(slot => ({ slot, id: this.prog.equip[slot] ?? null,
      name: ITEMS[this.prog.equip[slot]]?.name ?? null })), selected: this.selected,
      attributes: this.attributes(), appearance: this.prog.appearance ?? null, status: this.status, statusOk: this.statusOk,
      artUsed: { ...this.artUsed }, position: { ...this.position } };
  }
  protected onKey(event: KeyboardEvent) {
    if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
      const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 2 : 1;
      this.selected = EQUIP_SLOTS[(EQUIP_SLOTS.indexOf(this.selected) + delta) % 3]; this.status = ''; this.render();
    } else if (event.key === 'Enter' || event.key.toLowerCase() === 'z') this.unequip(this.selected);
    else return false;
    return true;
  }
  protected render() {
    if (!this.shown) return;
    this.shell('equip', label('ui.equip.title', '装备'));
    this.box('ui_bestiary_inset', [90, 48, 120, 150]);
    // 简洁文字预览沿用 Progress 外观字段，不引入另一套纸娃娃或图集加载。
    this.text(150, 82, this.prog.name, 14, INK, true).setOrigin(0.5).setWordWrapWidth(104);
    this.text(150, 112, this.prog.realmName, 12, INK_60).setOrigin(0.5).setWordWrapWidth(104);
    this.text(150, 155, ITEMS[this.prog.equip.robe]?.name ?? label('ui.equip.base', '素衣'), 12, INK).setOrigin(0.5).setWordWrapWidth(104);
    const coords = { weapon: [20, 64], robe: [236, 64], shoes: [236, 144] };
    EQUIP_SLOTS.forEach(slot => {
      const [x, y] = coords[slot], id = this.prog.equip[slot];
      this.text(x + 22, y - 12, label(`ui.equip.${slot}`, SLOT_NAMES[slot]), 12, INK_60).setOrigin(0.5);
      this.box(id ? 'ui_hud_slot' : 'ui_alchemy_slot_empty', [x, y, 44, 44]);
      if (id) this.item(id, x + 6, y + 6);
      if (slot === this.selected) this.outline([x, y, 44, 44]);
      this.zone([x, y, 44, 44], () => this.unequip(slot), `equip-slot-${slot}`);
      if (id) this.text(x + 22, y + 48, ITEMS[id]?.name ?? id, 12).setOrigin(0.5, 0).setWordWrapWidth(60);
    });
    this.text(22, 215, label('ui.equip.click', '点击装备格卸下 · 方向键选择 / 回车卸下'), 12, INK_60).setOrigin(0, 0.5);
    const names = { atk: '攻击', def: '防御', hp: '气血', mp: '灵力', speed: '速度', matk: '法攻' };
    Object.entries(this.attributes()).forEach(([key, value], i) => {
      this.text(22 + i % 2 * 136, 236 + Math.floor(i / 2) * 20,
        `${label(`ui.equip.${key}`, names[key as keyof typeof names])}  ${Math.round(value * 100) / 100}`, 12);
    });
    this.statusLine(301, label('ui.equip.keys', 'Esc / E 关闭 · I 切换背包'));
    this.revision = this.fingerprint();
  }
}
