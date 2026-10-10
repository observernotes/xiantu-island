import Phaser from 'phaser';
import type { Line } from './data';
import type { Progress } from './Progress';
import { HOTBAR_SLOTS, SKILLS, describeSkill, typeLabel } from './skills';
import { hasHud, hudSpec, sliced, HUD_FONT, INK, INK_60, PAPER, RED, NAVY } from './hud';

interface DialogChoice { label: string; onSelect: () => void; disabled?: boolean; reason?: string; }

/** 冒险岛式 NPC 对话框：底部居中，左侧头像，Z / 空格 / 回车 / ↑ 翻页 */
export class DialogBox {
  private c!: Phaser.GameObjects.Container;
  private name!: Phaser.GameObjects.Text;
  private body!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private portrait!: Phaser.GameObjects.Sprite;
  private lines: Line[] = [];
  private i = 0;
  private done?: () => void;
  private onCue?: (cue: string, next: () => void) => void;
  private waiting = false;
  private kit = false;
  private choices: DialogChoice[] = [];
  private choiceObjects: Phaser.GameObjects.GameObject[] = [];
  open = false;

  constructor(private scene: Phaser.Scene) {
    if (hasHud(scene, 'ui_hud_dialog')) { this.buildKit(); return; }
    const W = 760, H = 170, x = 640, y = 520;
    this.c = scene.add.container(x, y).setScrollFactor(0).setDepth(200).setVisible(false);
    const bg = scene.add.graphics();
    bg.fillStyle(0xfdf6e3, 0.97).fillRoundedRect(-W / 2, -H / 2, W, H, 14).lineStyle(3, 0x6b4b2a).strokeRoundedRect(-W / 2, -H / 2, W, H, 14);
    bg.fillStyle(0xe9dcbc).fillRoundedRect(-W / 2 + 14, -H / 2 + 14, 120, 142, 10);
    this.portrait = scene.add.sprite(-W / 2 + 74, -H / 2 + 150, '__DEFAULT').setOrigin(0.5, 1);
    this.name = scene.add.text(-W / 2 + 150, -H / 2 + 16, '', { fontFamily: 'sans-serif', fontSize: '18px', color: '#6b2a00', fontStyle: 'bold' });
    this.body = scene.add.text(-W / 2 + 150, -H / 2 + 46, '', { fontFamily: 'sans-serif', fontSize: '17px', color: '#2b2b2b', wordWrap: { width: W - 180, useAdvancedWrap: true }, lineSpacing: 6 });
    this.hint = scene.add.text(W / 2 - 16, H / 2 - 12, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#8a6a40' }).setOrigin(1, 1);
    this.c.add([bg, this.portrait, this.name, this.body, this.hint]);
  }

  /** 精修对话框：ui_hud_dialog (260,404, 760×168)，切片读 hud_ui.json；排版按 hud/README */
  private buildKit() {
    const scene = this.scene, W = 760, H = 168, L = -W / 2, T = -H / 2;
    this.kit = true;
    this.c = scene.add.container(260 + W / 2, 404 + H / 2).setScrollFactor(0).setDepth(200).setVisible(false);
    const bg = sliced(scene, 'ui_hud_dialog', L, T, W, H)!;
    const deco = scene.add.graphics();
    deco.fillStyle(0xECE0C4).fillRoundedRect(L + 16, T + 16, 112, 136, 8);
    deco.lineStyle(1, 0x3B2A20, 0.2).lineBetween(L + 144, T + 44.5, L + W - 16, T + 44.5);
    this.portrait = scene.add.sprite(L + 16 + 56, T + 16 + 136 - 4, '__DEFAULT').setOrigin(0.5, 1);
    this.name = scene.add.text(L + 144, T + 18, '', { fontFamily: HUD_FONT, fontSize: '16px', color: INK, fontStyle: 'bold' });
    this.body = scene.add.text(L + 144, T + 56, '', { fontFamily: HUD_FONT, fontSize: '16px', color: INK, wordWrap: { width: 592, useAdvancedWrap: true }, lineSpacing: 8 });
    this.hint = scene.add.text(W / 2 - 16, H / 2 - 16, '', { fontFamily: HUD_FONT, fontSize: '12px', color: INK_60 }).setOrigin(1, 1);
    this.c.add([bg, deco, this.portrait, this.name, this.body, this.hint]);
  }

  show(lines: Line[], portraitKey: string | null, done?: () => void, onCue?: (cue: string, next: () => void) => void) {
    this.clearChoices();
    if (!lines.length) { done?.(); return; }
    this.lines = lines; this.i = 0; this.done = done; this.onCue = onCue; this.open = true;
    if (portraitKey && this.scene.textures.exists(portraitKey)) this.portrait.setTexture(portraitKey, this.scene.textures.get(portraitKey).getFrameNames().sort()[0]).setVisible(true).setFlipX(true);
    else this.portrait.setVisible(false);
    this.c.setVisible(true);
    this.render();
  }

  /** 航线等少量选项：点击或按 1 / 2 / 3 选择，保留现有对白框。 */
  choose(line: Line, portraitKey: string | null, choices: DialogChoice[]) {
    this.show([line], portraitKey);
    this.choices = choices;
    // 选项在对白框上方纵排，原因随行换行，不挤占 NPC 台词或底部提示。
    const rows = choices.map((choice, i) => {
      const text = `${i + 1}. ${choice.label}${choice.reason ? `\n${choice.reason}` : ''}`;
      const label = this.scene.add.text(-224, 0, text, { fontFamily: HUD_FONT, fontSize: '14px',
        color: choice.disabled ? INK_60 : INK, wordWrap: { width: 560, useAdvancedWrap: true } }).setOrigin(0, 0.5);
      return { choice, label, height: Math.max(30, label.height + 12) };
    });
    let top = -90 - rows.reduce((sum, row) => sum + row.height + 6, 0);
    rows.forEach(({ choice, label, height }, i) => {
      const y = top + height / 2;
      const bg = this.scene.add.rectangle(60, y, 592, height, choice.disabled ? 0xd4cec0 : 0xece0c4)
        .setStrokeStyle(1, choice.disabled ? 0xaaa399 : 0x6b4b2a).setName(`dialog-choice:${i}`);
      label.setY(y);
      if (!choice.disabled) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerdown', () => this.selectChoice(i));
        bg.on('pointerover', () => bg.setFillStyle(0xe0cd9e));
        bg.on('pointerout', () => bg.setFillStyle(0xece0c4));
      }
      this.c.add([bg, label]); this.choiceObjects.push(bg, label);
      top += height + 6;
    });
    this.hint.setText('点击或按数字选择 · Esc 告辞');
  }

  selectChoice(index: number) {
    const choice = this.open ? this.choices[index] : undefined;
    if (!choice || choice.disabled) return;
    this.close();
    choice.onSelect();
  }

  dismissChoices() {
    if (this.choices.length) this.close();
  }

  private clearChoices() {
    this.choiceObjects.forEach(o => o.destroy());
    this.choiceObjects = []; this.choices = [];
  }

  private render() {
    const l = this.lines[this.i];
    if (l.cue) {                               // 演出：先收起对话框，演完再继续
      this.c.setVisible(false); this.waiting = true;
      this.onCue?.(l.cue, () => { this.waiting = false; this.c.setVisible(true); this.advance(); });
      if (!this.onCue) { this.waiting = false; this.c.setVisible(true); this.advance(); }
      return;
    }
    if (this.kit) {
      this.name.setText(l.speaker ?? '【提示】').setColor(l.speaker ? (l.player ? NAVY : INK) : RED);
      this.body.setText(l.text).setColor(INK);
    } else {
      this.name.setText(l.speaker ?? '【提示】').setColor(l.speaker ? (l.player ? '#1a5a8a' : '#6b2a00') : '#2a7a3a');
      this.body.setText(l.text).setColor(l.speaker ? '#2b2b2b' : '#2a7a3a');
    }
    this.hint.setText(this.i < this.lines.length - 1 ? 'Z / 空格 继续 ▼' : 'Z / 空格 结束');
  }

  advance() {
    if (!this.open || this.waiting) return;
    if (this.choices.length) return;
    this.i++;
    if (this.i >= this.lines.length) { this.close(); return; }
    this.render();
  }

  close() {
    this.open = false; this.c.setVisible(false);
    this.clearChoices();
    const d = this.done; this.done = undefined; d?.();
  }
}

let SLOT_W = 44, SLOT_H = 44, SLOT_GAP = 4;
/** 精修快捷栏：README 建议 ui_hud_panel 底板 y=632，内边距 8，格子间距 8（每格 +52），右边距 16 */
const KIT = { panelY: 632, pad: 8, gap: 8, right: 16 };
let kitMode = false;

function hotbarLayout() {
  const n = HOTBAR_SLOTS.length;
  const total = n * SLOT_W + (n - 1) * SLOT_GAP;
  if (kitMode) return { x: 1280 - KIT.right - KIT.pad - total, y: KIT.panelY + KIT.pad, total };
  return { x: 1280 - 16 - total, y: 720 - 98, total };
}

/** 八格快捷栏（A S D F G H Q W）。学会主动/增益后图标亮起，冷却期间盖一层遮罩。 */
export class SkillBar {
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private icons: Phaser.GameObjects.Image[] = [];
  private lvs: Phaser.GameObjects.Text[] = [];
  private lock: Phaser.GameObjects.Text;
  /** 精修格子：每格 normal / active / locked 三张九切片，按状态切显示 */
  private slots: { n: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible; a: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible; l: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible }[] = [];
  private keys: (Phaser.Input.Keyboard.Key | undefined)[] = [];
  private iconOff: [number, number] = [6, 6];
  onSlot?: (index: number) => void;

  constructor(private scene: Phaser.Scene) {
    kitMode = ['ui_hud_panel', 'ui_hud_slot', 'ui_hud_slot_active', 'ui_hud_slot_locked'].every(k => hasHud(scene, k));
    if (kitMode) {
      const sp = hudSpec(scene, 'ui_hud_slot')!;
      [SLOT_W, SLOT_H] = sp.size ?? [44, 44]; SLOT_GAP = KIT.gap;
      this.iconOff = sp.iconOffset ?? [6, 6];
    } else { SLOT_W = 44; SLOT_H = 44; SLOT_GAP = 4; }
    if (!scene.textures.exists('__blank')) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 0).fillRect(0, 0, 4, 4);
      g.generateTexture('__blank', 4, 4); g.destroy();
    }
    const iconKey = scene.textures.exists('icons_skills') ? 'icons_skills' : '__blank';
    const iconFrame = iconKey === 'icons_skills' ? scene.textures.get('icons_skills').getFrameNames()[0] : undefined;
    const { x: x0, y, total } = hotbarLayout();
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(kitMode ? 102 : 100);
    if (kitMode) sliced(scene, 'ui_hud_panel', x0 - KIT.pad, KIT.panelY, total + 2 * KIT.pad, SLOT_H + 2 * KIT.pad)!.setDepth(100);
    HOTBAR_SLOTS.forEach((s, i) => {
      const x = x0 + i * (SLOT_W + SLOT_GAP);
      if (kitMode) {
        const mk = (k: string) => sliced(scene, k, x, y, SLOT_W, SLOT_H)!.setDepth(100.5);
        this.slots.push({ n: mk('ui_hud_slot'), a: mk('ui_hud_slot_active').setVisible(false), l: mk('ui_hud_slot_locked').setVisible(false) });
        this.keys.push(scene.input.keyboard?.addKey(s.label, false));
        this.labels.push(scene.add.text(x + 4, y + 2, s.label, { fontFamily: HUD_FONT, fontSize: '11px', fontStyle: 'bold', color: INK, stroke: PAPER, strokeThickness: 2 }).setScrollFactor(0).setDepth(103));
      } else this.labels.push(scene.add.text(x + 3, y + 1, s.label, { fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setScrollFactor(0).setDepth(103));
      const icon = kitMode
        ? scene.add.image(x + this.iconOff[0], y + this.iconOff[1], iconKey, iconFrame).setOrigin(0, 0).setDisplaySize(32, 32).setScrollFactor(0).setDepth(101).setVisible(false)
        : scene.add.image(x + SLOT_W / 2, y + SLOT_H / 2 + 2, iconKey, iconFrame).setDisplaySize(32, 32).setScrollFactor(0).setDepth(101).setVisible(false);
      this.icons.push(icon);
      this.lvs.push(kitMode
        ? scene.add.text(x + 40, y + 40, '', { fontFamily: HUD_FONT, fontSize: '12px', fontStyle: 'bold', color: INK, stroke: PAPER, strokeThickness: 2 }).setOrigin(1, 1).setScrollFactor(0).setDepth(103)
        : scene.add.text(x + SLOT_W - 2, y + SLOT_H - 1, '', { fontSize: '11px', color: '#fff6c8', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 1).setScrollFactor(0).setDepth(103));
      const zone = scene.add.zone(x, y, SLOT_W, SLOT_H).setOrigin(0, 0).setScrollFactor(0).setDepth(104).setInteractive();
      zone.on('pointerdown', () => this.onSlot?.(i));
    });
    this.lock = kitMode
      ? scene.add.text(x0 + total / 2, y + SLOT_H / 2, '', { fontFamily: HUD_FONT, fontSize: '12px', color: INK, stroke: PAPER, strokeThickness: 2 }).setOrigin(0.5).setScrollFactor(0).setDepth(103)
      : scene.add.text(x0 + total / 2, y + 22, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
  }

  draw(unlocked: boolean, now: number, hotbar: (string | null)[], cds: Map<string, { readyAt: number; total: number }>, prog: Progress) {
    const { x: x0, y } = hotbarLayout();
    const g = this.g.clear();
    const atlas = this.scene.textures.exists('icons_skills') ? this.scene.textures.get('icons_skills') : null;
    HOTBAR_SLOTS.forEach((_, i) => {
      const x = x0 + i * (SLOT_W + SLOT_GAP);
      const id = hotbar[i];
      const def = id ? SKILLS[id] : undefined;
      const level = id ? prog.skillLevel(id) : 0;
      const show = !!(unlocked && def && level > 0);
      if (kitMode) {
        const st = this.slots[i], active = unlocked && !!this.keys[i]?.isDown;
        st.l.setVisible(!unlocked); st.a.setVisible(active); st.n.setVisible(unlocked && !active);
      } else g.fillStyle(unlocked ? 0x2a3a52 : 0x3a3a3a, 0.85).fillRoundedRect(x, y, SLOT_W, SLOT_H, 6).lineStyle(2, show ? 0x9fd0ff : unlocked ? 0x6a849c : 0x777777).strokeRoundedRect(x, y, SLOT_W, SLOT_H, 6);
      const icon = this.icons[i];
      if (show && atlas && def!.icon && atlas.has(def!.icon)) {
        icon.setTexture('icons_skills', def!.icon).setVisible(true);
        if (kitMode) icon.setPosition(x + this.iconOff[0], y + this.iconOff[1]).setDisplaySize(32, 32);
        else icon.setPosition(x + SLOT_W / 2, y + SLOT_H / 2 + 2);
      } else {
        icon.setVisible(false);
        if (show) {
          const ix = kitMode ? x + this.iconOff[0] : x + SLOT_W / 2 - 16;
          const iy = kitMode ? y + this.iconOff[1] : y + SLOT_H / 2 + 2 - 16;
          g.lineStyle(1, kitMode ? 0x6b4b2a : 0x9fd0ff, 0.65).strokeRect(ix, iy, 32, 32);
        }
      }
      const cd = id ? cds.get(id) : undefined;
      const left = cd ? cd.readyAt - now : 0;
      if (show && cd && left > 0 && cd.total > 0) {
        const r = Math.min(1, left / cd.total);
        if (kitMode) g.fillStyle(0x3B2A20, 0.55).fillRect(x, y + SLOT_H * (1 - r), SLOT_W, SLOT_H * r);   // README：墨褐 55% 从上往下退
        else g.fillStyle(0x000000, 0.62).fillRect(x, y + SLOT_H * (1 - r), SLOT_W, SLOT_H * r);
      }
      const remain = id ? prog.buffRemaining(id) : 0;
      const blink = show && remain > 0 && remain <= 5000;
      icon.setAlpha(!show ? 1 : blink && Math.floor(now / 160) % 2 ? 0.3 : 1);
      this.lvs[i].setText(show && level > 0 ? String(level) : '');
      if (!kitMode) this.lvs[i].setPosition(x + SLOT_W - 2, y + SLOT_H - 1);
    });
    this.lock.setText(unlocked ? '' : '突破炼气期后解锁技能栏');
  }
}

/** 功法窗口（K）。加点检查前置；点击功法再点槽位可改快捷栏。数字键 1–5 给前五个一转功法加点。 */
export class SkillWindow {
  open = false;
  selected: string | null = null;
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene, private getProg: () => Progress, private onAdd: (id: string) => void) {}

  private queued = false;
  toggle() { this.open ? this.close() : this.show(); }
  show() { this.open = true; this.refresh(); }
  close() { this.open = false; this.selected = null; this.clear(); }

  assign(slot: number) {
    const prog = this.getProg();
    if (this.selected) prog.bindHotbar(slot, this.selected);
    else if (prog.hotbar[slot]) prog.bindHotbar(slot, null);
    this.selected = null;
    this.refresh();
  }

  /** 下一帧再重建，避免在点击回调里拆掉正在处理的按钮。 */
  refresh() {
    if (this.queued) return;
    this.queued = true;
    this.scene.time.delayedCall(0, () => { this.queued = false; this.rebuild(); });
  }

  private rebuild() {
    this.clear();
    if (!this.open) return;
    const prog = this.getProg();
    const W = 780, H = 520, x = 640, y = 318;
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(210);
    g.fillStyle(0x000000, 0.45).fillRect(0, 0, 1280, 720);
    g.fillStyle(0xfdf6e3, 0.98).fillRoundedRect(x - W / 2, y - H / 2, W, H, 16).lineStyle(3, 0x6b4b2a).strokeRoundedRect(x - W / 2, y - H / 2, W, H, 16);
    this.objs.push(g);
    const title = this.scene.add.text(x - W / 2 + 28, y - H / 2 + 16, '功法', { fontFamily: 'serif', fontSize: '28px', color: '#6b2a00' }).setScrollFactor(0).setDepth(211);
    const sp = this.scene.add.text(x + W / 2 - 28, y - H / 2 + 24, `剩余技能点 ${prog.spLeftFor(1)}`, { fontFamily: 'sans-serif', fontSize: '18px', color: '#1a5a8a' }).setOrigin(1, 0).setScrollFactor(0).setDepth(211);
    this.objs.push(title, sp);
    const list = prog.classSkills;
    const atlas = this.scene.textures.exists('icons_skills') ? this.scene.textures.get('icons_skills') : null;
    list.forEach((def, i) => {
      const ry = y - H / 2 + 64 + i * 72;
      const learned = prog.skillLevel(def.id);
      const selected = this.selected === def.id;
      const row = this.scene.add.graphics().setScrollFactor(0).setDepth(211);
      row.fillStyle(selected ? 0xf3e2b8 : 0xf7efe0, 1).fillRoundedRect(x - W / 2 + 20, ry, W - 40, 66, 8);
      this.objs.push(row);
      const iconKey = `${def.icon}@64`;
      if (def.icon && this.scene.textures.exists(iconKey)) {
        this.objs.push(this.scene.add.image(x - W / 2 + 56, ry + 33, iconKey).setDisplaySize(52, 52).setScrollFactor(0).setDepth(212));
      } else if (def.icon && atlas?.has(def.icon)) {
        this.objs.push(this.scene.add.image(x - W / 2 + 56, ry + 33, 'icons_skills', def.icon).setDisplaySize(32, 32).setScrollFactor(0).setDepth(212));
      } else row.lineStyle(1, 0x9a8766, 0.8).strokeRoundedRect(x - W / 2 + 40, ry + 17, 32, 32, 4);
      const head = `${def.name}  ${typeLabel(def.type)}  Lv ${learned}/${prog.skillCap(def)}`;
      const req = prog.reqText(def);
      const body = `${learned > 0 ? describeSkill(def, learned) : '未学  ' + describeSkill(def, 1)}${req ? '   需要 ' + req : ''}`;
      this.objs.push(
        this.scene.add.text(x - W / 2 + 92, ry + 8, head, { fontFamily: 'sans-serif', fontSize: '16px', color: '#3a2a10', fontStyle: 'bold' }).setScrollFactor(0).setDepth(212),
        this.scene.add.text(x - W / 2 + 92, ry + 34, body, { fontFamily: 'sans-serif', fontSize: '13px', color: '#5a4630', wordWrap: { width: 500 } }).setScrollFactor(0).setDepth(212),
      );
      const hit = this.scene.add.zone(x - W / 2 + 20, ry, W - 150, 66).setOrigin(0, 0).setScrollFactor(0).setDepth(213).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { this.selected = this.selected === def.id ? null : def.id; this.refresh(); });
      this.objs.push(hit);
      const btn = this.scene.add.text(x + W / 2 - 36, ry + 33, '加点', { fontFamily: 'sans-serif', fontSize: '16px', color: '#fff', backgroundColor: '#2a6a4a', padding: { x: 10, y: 6 } }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(212).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => this.onAdd(def.id));
      this.objs.push(btn);
    });
    const hint = this.scene.add.text(x, y + H / 2 - 78, '点击功法后再点格子放入快捷栏；再点已放入的格子卸下。1–5 加点，K / Esc 关闭', { fontFamily: 'sans-serif', fontSize: '13px', color: '#6b4b2a' }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(212);
    this.objs.push(hint);
    HOTBAR_SLOTS.forEach((s, i) => {
      const sx = x - (HOTBAR_SLOTS.length * 52) / 2 + i * 52;
      const sy = y + H / 2 - 48;
      const id = prog.hotbar[i];
      const box = this.scene.add.graphics().setScrollFactor(0).setDepth(212);
      box.fillStyle(0x2a3a52, 1).fillRoundedRect(sx, sy, 46, 40, 6).lineStyle(2, 0x9fd0ff).strokeRoundedRect(sx, sy, 46, 40, 6);
      this.objs.push(box);
      const iconFrame = id ? SKILLS[id]?.icon : undefined;
      if (iconFrame && atlas?.has(iconFrame)) {
        this.objs.push(this.scene.add.image(sx + 23, sy + 22, 'icons_skills', iconFrame).setDisplaySize(28, 28).setScrollFactor(0).setDepth(213));
      }
      this.objs.push(this.scene.add.text(sx + 3, sy + 1, s.label, { fontSize: '11px', color: '#fff', stroke: '#000', strokeThickness: 2 }).setScrollFactor(0).setDepth(214));
      const zone = this.scene.add.zone(sx, sy, 46, 40).setOrigin(0, 0).setScrollFactor(0).setDepth(215).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.assign(i));
      this.objs.push(zone);
    });
  }

  private clear() {
    this.objs.forEach(o => o.destroy());
    this.objs = [];
  }
}
