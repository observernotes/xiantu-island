import Phaser from 'phaser';
import { type TrialDef } from '../data';
import { FriendlySummons } from '../FriendlySummons';
import { SectTrialState, type SectTrialConfig, type SectTrialResult, type TrialDirection } from '../SectTrialState';
import type { GameScene } from './GameScene';
import type { Monster } from './Monster';

interface TrialObjectEvent { trial?: string; action: string; object?: string; targetId?: string }
const ARROWS: Record<TrialDirection, string> = { up: '↑', right: '→', down: '↓', left: '←' };
const KEY_DIRECTIONS: Record<string, TrialDirection> = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };

/** 四宗试炼场景控制；任务完成、返回位置及存档由 GameScene 统一结算。 */
export class SectTrial {
  readonly state: SectTrialState;
  private readonly status: Phaser.GameObjects.Text;
  private drawPanel?: Phaser.GameObjects.Container;
  private drawHint?: Phaser.GameObjects.Text;
  private strokesText: Phaser.GameObjects.Text[] = [];
  private drawing = false;
  private dispatched = false;
  private destroyed = false;
  private waveMobs: Monster[] = [];
  private tameMob?: Monster;
  private tamePoint?: { x: number; y: number };
  private pets?: FriendlySummons;
  private lastHp: number;
  private lastPosition: { x: number; y: number };
  private fluteInterrupted = false;

  constructor(private readonly scene: GameScene, readonly def: TrialDef) {
    this.state = new SectTrialState(def as unknown as SectTrialConfig);
    this.status = scene.add.text(640, 144, '', { fontSize: '18px', color: '#fff8d0', stroke: '#211b2d', strokeThickness: 4,
      align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
    this.lastHp = scene.prog.hp;
    this.lastPosition = { x: scene.player.x, y: scene.player.feet };
    scene.events.on('trial:object', this.onObject, this);
    scene.input.keyboard?.on('keydown', this.onKey, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.drawStatus();
  }
  get ended() { return this.state.ended; }
  get stage() { return this.state.stage; }
  get blocksInput() { return this.drawing; }

  update(delta: number) {
    if (this.ended || this.destroyed) return;
    if (this.stage === 'tame' || this.stage === 'flute') this.updateTame(delta);
    if (this.ended) { this.finish(); return; }
    this.state.tick(delta);
    for (const request of this.state.takeSpawnRequests()) {
      if (this.ended) break;
      const gate = this.scene.map.objects.find(o => o.type === 'spawnGate'
        && (o.name === `gate_${request.side}` || o.props.side === request.side));
      const mob = this.scene.spawnTrialMob(request.monster, gate?.x ?? (request.side === 'left' ? 80 : this.scene.map.width - 80),
        gate?.y ?? this.scene.map.spawn.y);
      if (!mob) { this.state.playerDown(); break; }
      mob.grantRewards = false;
      mob.setName(`sect-wave:${request.id}`);
      const onDead = mob.onDead;
      mob.onDead = dead => {
        onDead?.(dead);
        if (this.state.waveDead(request.id)) { this.drawStatus(); this.finish(); }
      };
      this.waveMobs.push(mob);
    }
    this.pets?.update(this.scene.time.now);
    this.lastHp = this.scene.prog.hp;
    this.lastPosition = { x: this.scene.player.x, y: this.scene.player.feet };
    this.drawStatus(); this.finish();
  }
  playerDown() { this.state.playerDown(); this.finish(); }
  exit() { this.state.exit(); this.finish(); }

  private onObject(event: TrialObjectEvent) {
    if (this.destroyed || this.ended || event.trial !== this.def.id) return;
    if (event.action === 'lamp_lit' && event.object) this.state.light(event.object);
    else if (event.action === 'draw_start' && this.stage === 'draw') this.openDrawing();
    else if (event.action === 'draw_leave') this.closeDrawing();
    else if (event.action === 'target_dead' && event.targetId) this.state.targetDead(event.targetId);
    else if (event.action === 'token_taken') this.state.takeToken();
    else if (event.action === 'return_token') this.state.returnToken();
    else if (event.action === 'detected') this.state.detected();
    else if (event.action === 'player_down') this.state.playerDown();
    this.drawStatus(); this.finish();
  }
  private onKey(event: KeyboardEvent) {
    if (this.destroyed || this.ended) return;
    const direction = KEY_DIRECTIONS[event.code];
    // 画符输入不能遗留给移动/交互，尤其是最后一笔关闭面板的这一帧。
    if (this.drawing && direction) this.scene.keys[direction]?.reset();
    if (event.repeat) return;
    if (event.code === 'Escape' && !this.scene.dialog?.open && !this.scene.skillWindow?.open && !this.scene.alchemy?.isOpen()) {
      event.preventDefault(); this.exit(); return;
    }
    if (!this.drawing || !direction) return;
    event.preventDefault();
    const result = this.state.drawStroke(direction);
    if (result === 'wrong') {
      this.drawHint?.setText('笔画错了，这道符重画');
      this.scene.log('笔画错了，这道符重画', '#ffb0b0');
    } else this.drawHint?.setText('依次按亮起的方向键');
    if (result === 'done') {
      for (const key of Object.keys(ARROWS)) this.scene.keys[key]?.reset();
      this.closeDrawing();
      this.scene.trialObjects?.finishDrawing();
      this.scene.log('三道符画成了，开始靶场试炼。', '#ffe680');
    } else this.drawStrokes();
    this.drawStatus(); this.finish();
  }
  private openDrawing() {
    if (this.drawing) return;
    this.drawing = true;
    const panel = this.scene.add.container(640, 350).setScrollFactor(0).setDepth(180);
    panel.add(this.scene.add.rectangle(0, 0, 560, 184, 0x211b2d, 0.96).setStrokeStyle(2, 0xd9a441));
    this.drawHint = this.scene.add.text(0, 52, '依次按亮起的方向键', { fontSize: '18px', color: '#fff8d0' }).setOrigin(0.5);
    panel.add(this.drawHint); this.drawPanel = panel;
    this.drawStrokes();
  }
  private closeDrawing() {
    this.drawing = false;
    this.drawPanel?.destroy(); this.drawPanel = undefined; this.drawHint = undefined; this.strokesText = [];
  }
  private drawStrokes() {
    if (!this.drawPanel) return;
    for (const text of this.strokesText) text.destroy();
    const { strokes, strokeIndex } = this.state;
    this.strokesText = strokes.map((direction, index) => {
      const text = this.scene.add.text((index - (strokes.length - 1) / 2) * 62, -12, ARROWS[direction], { fontSize: '42px',
        color: index === strokeIndex ? '#ffe680' : index < strokeIndex ? '#7fe0c0' : '#777080' }).setOrigin(0.5);
      this.drawPanel!.add(text); return text;
    });
  }
  private updateTame(delta: number) {
    const scene = this.scene;
    this.tameMob ??= scene.mobs.find(mob => mob.def.id === this.def.tame?.monster && !mob.dead);
    const mob = this.tameMob;
    if (!mob?.active) { this.state.playerDown(); return; }
    const threshold = Number((mob.def as unknown as { kneelBelow?: number }).kneelBelow ?? 0.5);
    if (this.stage === 'tame' && mob.hp <= mob.def.hp * threshold) {
      this.state.tameReady();
      this.tamePoint = { x: mob.x, y: mob.y };
      mob.manualMotion = true; mob.suppressTouch = true; mob.st = 'idle';
      mob.onSlam = undefined; mob.onVolley = undefined; mob.onSkillDamage = undefined;
      mob.body.setAllowGravity(false).setVelocity(0, 0);
      mob.anim(scene.anims.exists(`${mob.texture.key}_kneel`) ? 'kneel' : 'idle');
      scene.log('山魈没力气了！靠近后按住 Z 吹骨笛安抚它。', '#ffe680');
    }
    if (this.stage !== 'flute') return;
    if (this.tamePoint) mob.body.reset(this.tamePoint.x, this.tamePoint.y);
    mob.body.setVelocity(0, 0); mob.st = 'idle';
    mob.anim(scene.anims.exists(`${mob.texture.key}_kneel`) ? 'kneel' : 'idle');
    const keys = scene.keys;
    const near = Math.abs(scene.player.x - mob.x) <= 112 && Math.abs(scene.player.feet - mob.y) <= 72;
    const causes = this.def.tame?.interruptOn ?? [];
    const moving = keys.left.isDown || keys.right.isDown || keys.up.isDown || keys.down.isDown || keys.space.isDown
      || keys.alt.isDown || keys.c.isDown || scene.player.state2 !== 'ground'
      || Math.abs(scene.player.x - this.lastPosition.x) > 2 || Math.abs(scene.player.feet - this.lastPosition.y) > 2;
    const attacking = keys.ctrl.isDown || keys.x.isDown || ['a', 's', 'd', 'f', 'g', 'h', 'q', 'w'].some(key => keys[key]?.isDown);
    const hurt = scene.prog.hp < this.lastHp || scene.player.state2 === 'hurt';
    const interrupted = !near || causes.includes('move') && moving || causes.includes('attack') && attacking || causes.includes('hurt') && hurt;
    const wasPlaying = this.state.fluteMs > 0;
    const tamed = this.state.flute(delta, keys.z.isDown && near, interrupted);
    if (wasPlaying && interrupted && !this.fluteInterrupted) scene.log('骨笛声被打断了，再吹一次', '#ffb0b0');
    this.fluteInterrupted = interrupted;
    if (!tamed) return;
    mob.despawn();
    const companion = (this.def as unknown as SectTrialConfig).companion;
    if (companion) {
      this.pets = new FriendlySummons(scene);
      this.pets.summonTrialCompanion(companion);
    }
    scene.log('山魈愿意跟着你了！一起击退野狼。', '#7fe0c0');
  }
  private drawStatus() {
    const state = this.state;
    let text = this.stage === 'lamps' ? `点亮全部试炼灯（${state.lit}/${this.def.lamps?.count ?? 5}）`
      : this.stage === 'draw' ? `按提示画符（第 ${state.drawn + 1}/${this.def.draw?.talismans ?? 3} 道），到桌前按 Z`
      : this.stage === 'targets' ? `打碎木靶（${state.targets}/${this.def.targets?.total ?? 10}）`
      : this.stage === 'stealth' ? '避开灯笼视线，取出令牌后回起点'
      : this.stage === 'return' ? '拿到令牌了，原路返回'
      : this.stage === 'tame' ? '把发狂的山魈打到半血以下'
      : this.stage === 'flute' ? `靠近山魈，按住 Z 吹骨笛（${Math.round(state.fluteRatio * 100)}%）`
      : this.stage === 'waves' ? `击退 ${state.waveCount} 波（第 ${state.waveIndex + 1} 波，已击退 ${state.waveKilled}）` : '';
    if (state.timeLeftMs !== undefined) text += `  剩余 ${Math.ceil(state.timeLeftMs / 1000)} 秒`;
    this.status.setText(text ? `${text}\nEsc 退出试炼` : '').setVisible(!this.ended);
  }
  private finish() {
    if (!this.state.result || this.dispatched || this.destroyed) return;
    this.dispatched = true;
    this.closeDrawing(); this.status.setVisible(false);
    for (const mob of this.waveMobs) if (mob.active && !mob.dead) mob.despawn();
    this.pets?.destroy(); this.pets = undefined;
    this.scene.onSectTrialEnd(this.state.result as SectTrialResult);
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('trial:object', this.onObject, this);
    this.scene.input.keyboard?.off('keydown', this.onKey, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.closeDrawing(); this.status.destroy(); this.pets?.destroy(); this.pets = undefined;
  }
}
