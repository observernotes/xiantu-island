import Phaser from 'phaser';
import type { Line } from './data';

/** 冒险岛式 NPC 对话框：底部居中，左侧头像，Z / 空格 / 回车 / ↑ 翻页 */
export class DialogBox {
  private c: Phaser.GameObjects.Container;
  private name: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private portrait: Phaser.GameObjects.Sprite;
  private lines: Line[] = [];
  private i = 0;
  private done?: () => void;
  private onCue?: (cue: string, next: () => void) => void;
  private waiting = false;
  open = false;

  constructor(private scene: Phaser.Scene) {
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

  show(lines: Line[], portraitKey: string | null, done?: () => void, onCue?: (cue: string, next: () => void) => void) {
    if (!lines.length) { done?.(); return; }
    this.lines = lines; this.i = 0; this.done = done; this.onCue = onCue; this.open = true;
    if (portraitKey && this.scene.textures.exists(portraitKey)) this.portrait.setTexture(portraitKey, this.scene.textures.get(portraitKey).getFrameNames().sort()[0]).setVisible(true).setFlipX(true);
    else this.portrait.setVisible(false);
    this.c.setVisible(true);
    this.render();
  }

  private render() {
    const l = this.lines[this.i];
    if (l.cue) {                               // 演出：先收起对话框，演完再继续
      this.c.setVisible(false); this.waiting = true;
      this.onCue?.(l.cue, () => { this.waiting = false; this.c.setVisible(true); this.advance(); });
      if (!this.onCue) { this.waiting = false; this.c.setVisible(true); this.advance(); }
      return;
    }
    this.name.setText(l.speaker ?? '【提示】').setColor(l.speaker ? (l.player ? '#1a5a8a' : '#6b2a00') : '#2a7a3a');
    this.body.setText(l.text).setColor(l.speaker ? '#2b2b2b' : '#2a7a3a');
    this.hint.setText(this.i < this.lines.length - 1 ? 'Z / 空格 继续 ▼' : 'Z / 空格 结束');
  }

  advance() {
    if (!this.open || this.waiting) return;
    this.i++;
    if (this.i >= this.lines.length) { this.close(); return; }
    this.render();
  }

  close() {
    this.open = false; this.c.setVisible(false);
    const d = this.done; this.done = undefined; d?.();
  }
}

/** 技能快捷栏骨架：6 个槽位（A S D F G H），突破炼气前锁定；技能数据等演武堂填表后接入 */
export class SkillBar {
  static KEYS = ['A', 'S', 'D', 'F', 'G', 'H'];
  private g: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private lock: Phaser.GameObjects.Text;
  slots: ({ id: string; name: string; cooldownMs: number; readyAt: number } | null)[] = [null, null, null, null, null, null];

  constructor(private scene: Phaser.Scene) {
    const x0 = 860, y = 720 - 96;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(100);
    SkillBar.KEYS.forEach((k, i) => this.labels.push(scene.add.text(x0 + i * 66 + 4, y + 2, k, { fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setScrollFactor(0).setDepth(101)));
    this.lock = scene.add.text(x0 + 195, y + 28, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0).setDepth(101);
  }

  draw(unlocked: boolean, now: number) {
    const x0 = 860, y = 720 - 96, g = this.g.clear();
    this.slots.forEach((s, i) => {
      const x = x0 + i * 66;
      g.fillStyle(unlocked ? 0x2a3a52 : 0x3a3a3a, 0.85).fillRoundedRect(x, y, 58, 50, 8).lineStyle(2, unlocked ? 0x9fd0ff : 0x777777).strokeRoundedRect(x, y, 58, 50, 8);
      if (s && unlocked && now < s.readyAt) g.fillStyle(0x000000, 0.55).fillRect(x, y + 50 * (1 - (s.readyAt - now) / s.cooldownMs), 58, 50 * (s.readyAt - now) / s.cooldownMs);
    });
    this.lock.setText(unlocked ? '' : '突破炼气期后解锁技能栏');
  }
}
