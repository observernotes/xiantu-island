import { gameNow } from '../GameClock';
import Phaser from 'phaser';
import { FEEL, SPEC } from '../config/feel';
import { FIELD_TEST } from '../config/maps';
import { MONSTERS, DROPS, ITEMS, TILED_MAPS, ATLASES, MAP_AREA, AREAS, TILE_METADATA, BACKGROUNDS, BACKGROUND_CONFIGS, SKILL_ICONS, NPCS, SCRIPTS, t, questName, questDescription, MP_REGEN_FRACTION_PER_5S, BREAKTHROUGH_LEVELS } from '../data';
import { QuestSystem } from '../QuestSystem';
import type { DailyQuestReward } from '../DailyQuests';
import { QUESTS as QUESTS_REF } from '../data';
import { DialogBox, SkillBar, SkillWindow, type DialogChoice } from '../UI';
import { AltarTrial, type TrialResult } from './AltarTrial';
import { TRIALS, TRIAL_BY_MAP, REALMS, BREAKTHROUGH, SECT_SECLUSION, inPhase, type TrialDef } from '../data';
import { preloadHud, registerHudFonts, hasHud, sliced, setSlicedWidth, HudBar, hudText, hudSpec, sectRankIcon, HUD_FONT, INK, INK_60, PAPER } from '../hud';
import { SkillCombat } from '../SkillCombat';
import { HOTBAR_SLOTS, SKILLS } from '../skills';
import { classDef, classForQuest } from '../classes';
import { installKeyGuard } from '../keyguard';
import { buildTiledMap, buildCharMap, BuiltMap, MapObj } from './MapBuilder';
import { Player, Input } from './Player';
import { Monster, type SkillVolley } from './Monster';
import { Progress } from '../Progress';
import { Seclusion, realDay } from '../Seclusion';
import { LIFESPAN } from '../data';
import { SectTrialObjects } from './SectTrialObjects';
import { StealthVision } from './StealthVision';
import { ferryLockedReason, mapEntryOpen, FIRST_CLASS_TRIAL_MAPS } from '../Ferry';
import { Gathering } from './Gathering';
import { interactionPrompt } from '../InteractionPrompt';
import { AlchemySystem, ALCHEMY_RULES } from '../Alchemy';
import { AlchemyPanel, preloadAlchemy, registerAlchemy } from '../AlchemyPanel';
import { BackgroundArt, type BackgroundConfig } from './BackgroundArt';
import { EnvironmentArt, type EnvironmentArtConfig } from './EnvironmentArt';
import { applySpriteArt } from '../SpriteArt';
import { SectGrowth, newSectTransactionId } from '../SectGrowth';
import { featureEnabled, FEATURE_UNAVAILABLE, type FeatureName } from '../features';

const MAP_FALLBACK: Record<string, string> = {};
type Drop = Phaser.Physics.Arcade.Sprite & { itemId: string; count: number; bornAt: number; label?: Phaser.GameObjects.Text; shadow?: Phaser.GameObjects.Ellipse; floatTw?: Phaser.Tweens.Tween; landed?: boolean };
/** 掉落物：图标 32px，影子 20×6 墨褐 30%，上下浮动 2px、1 秒一个来回（丹青阁） */
const DROP_ICON_PX = 32, DROP_SHADOW = { w: 20, h: 6, color: 0x3b2a1e, alpha: 0.3 }, DROP_FLOAT = { px: 2, periodMs: 1000 };
interface HudKit {
  panel: Phaser.GameObjects.GameObject; hp: HudBar; mp: HudBar; exp: HudBar; expGlow?: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;
  lv: Phaser.GameObjects.Text; info: Phaser.GameObjects.Text; hpT: Phaser.GameObjects.Text; mpT: Phaser.GameObjects.Text; expT: Phaser.GameObjects.Text;
  boss?: { plate: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image; bar: HudBar; name: Phaser.GameObjects.Text; num: Phaser.GameObjects.Text };
  expRight: number;
}
interface Shot {
  sprite: Phaser.Physics.Arcade.Sprite; state: 'fly' | 'hit'; until: number;
  ratio: number; kb: number; atk: number; hitAnim?: string; hitMs: number; dead?: boolean;
  fromX?: number; maxDist?: number;
}

/** ?debug=trial：直接进筑基台；&speed=N 试炼时钟加速；&skip=held|broken|dead 直接结算；&roll=win|lose 固定成功率判定 */
const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const DEBUG_TRIAL = QS.get('debug') === 'trial';
/** ?debug=class=tianjian_disciple（其余 id 见职业登记表）；调试角色独立于真实存档。 */
const DEBUG_CLASS = QS.get('debug')?.startsWith('class=') ? classDef(QS.get('debug')!.slice(6)) : undefined;
/** 试炼结束后传回的位置：传功长老身边 */
const TRIAL_RETURN = { map: 'tianjian_sect', x: 2476, y: 768 };

const QUEST_MARK_KEYS = ['ui_hud_quest_available', 'ui_hud_quest_turnin', 'ui_hud_quest_progress'];

export class GameScene extends Phaser.Scene {
  map!: BuiltMap;
  player!: Player;
  prog!: Progress;
  sectGrowth!: SectGrowth;
  mobs: Monster[] = [];
  drops!: Phaser.Physics.Arcade.Group;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  hud!: Phaser.GameObjects.Graphics;
  hudText!: Phaser.GameObjects.Text;
  debugText!: Phaser.GameObjects.Text;
  logs: Phaser.GameObjects.Text[] = [];
  private logBadges = new Map<Phaser.GameObjects.Text, Phaser.GameObjects.Image>();
  nextPickAt = 0;
  openedChests = new Set<string>();
  breakthroughNotified = false;
  private travelling = false;
  trialObjects?: SectTrialObjects;
  stealth?: StealthVision;
  private nextAgeUpdateAt = 0;
  private nextDailyUpdateAt = 0;
  gathering!: Gathering;
  alchemySystem!: AlchemySystem;
  alchemy!: AlchemyPanel;
  private interactionPrompts: { object: MapObj; prompt: Phaser.GameObjects.Container; marker?: Phaser.GameObjects.Image | Phaser.GameObjects.Text }[] = [];
  private sectTitle!: Phaser.GameObjects.Text;
  private sectBadge!: Phaser.GameObjects.Image;
  private portalVisuals: { object: MapObj; art: Phaser.GameObjects.Ellipse; label?: Phaser.GameObjects.Text }[] = [];
  private seclusionLabels: Phaser.GameObjects.Text[] = [];

  constructor() { super('game'); (window as any).__scene = this; }

  private createDebugClass() {
    const prog = new Progress();
    // 独立调试档不写 localStorage；换图继续用 registry 内同一角色。
    prog.save = () => true;
    prog.level = 29;
    prog.advanceClass(DEBUG_CLASS!.id);
    for (const def of prog.classSkills) prog.grantSkill(def.id, 1);
    prog.addItem('talisman_paper', 999);
    prog.hp = prog.maxHp; prog.mp = prog.maxMp;
    return prog;
  }

  preload() {
    for (const a of AREAS) {
      this.load.image(`tiles_${a}`, `art/tiles/tiles_${a}.png`);
      this.load.spritesheet(`tiles_${a}_ss`, `art/tiles/tiles_${a}.png`, { frameWidth: 32, frameHeight: 32 });
    }
    for (const metadata of TILE_METADATA) this.load.json(metadata.key, metadata.path);
    for (const config of BACKGROUND_CONFIGS) this.load.json(config.key, config.path);
    for (const background of BACKGROUNDS) this.load.image(background.key, background.path);
    for (const k of ATLASES) {
      this.load.atlas(k, `art/sprites/${k}.png`, `art/sprites/${k}.json`);
      this.load.json(`${k}_anims`, `art/sprites/${k}.anims.json`);
    }
    this.load.atlas('icons_skills', 'art/icons/icons_skills.png', 'art/icons/icons_skills.json');
    for (const icon of SKILL_ICONS) this.load.image(icon.key, icon.path);
    // 葫芦三态：hud/ 目录里还没有，继续读 art/icons/ui/
    for (const tier of ['empty', 'half', 'full']) this.load.image(`icon_overflow_gourd_${tier}`, `art/icons/ui/icon_overflow_gourd_${tier}.png`);
    this.load.atlas('icons_items', 'art/icons/icons_items.png', 'art/icons/icons_items.json');
    preloadHud(this);
    preloadAlchemy(this);
  }

  create(data: { map?: string; portal?: string; pos?: { x: number; y: number } }) {
    installKeyGuard();
    for (const k of ATLASES) {
      const a = this.cache.json.get(`${k}_anims`);
      if (!a) continue;
      for (const an of a.anims) if (!this.anims.exists(an.key))
        this.anims.create({ key: an.key, frames: an.frames.map((f: string) => ({ key: k, frame: f })), frameRate: an.frameRate, repeat: an.repeat });
    }
    if (!DEBUG_CLASS && new URLSearchParams(location.search).get('reset') === '1' && !this.registry.get('progress')) Progress.reset();
    this.prog = this.registry.get('progress') ?? (DEBUG_CLASS ? this.createDebugClass() : Progress.load());
    this.sectGrowth = new SectGrowth(this.prog);
    this.quests = new QuestSystem(this.prog);
    const trialComplete = (id: string) => this.quests.onTrialComplete(id);
    this.events.on('trial:complete', trialComplete);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('trial:complete', trialComplete));
    this.registry.set('progress', this.prog);
    this.openedChests = this.registry.get('chests') ?? new Set();
    this.registry.set('chests', this.openedChests);
    this.mobs = []; this.logs = []; this.logBadges.clear(); this.hudTexts = undefined; this.hudKit = undefined;
    this.travelling = false; this.curZone = undefined; this.nextDailyUpdateAt = 0;
    registerHudFonts(this);
    registerAlchemy(this);
    this.interactionPrompts = [];
    this.portalVisuals = []; this.seclusionLabels = [];

    const q = new URLSearchParams(location.search).get('map');
    const debugTrial = DEBUG_CLASS && QUESTS_REF[DEBUG_CLASS.joinQuest]?.objectives.find(o => o.type === 'trial')?.trial;
    const debugMap = DEBUG_CLASS && (TILED_MAPS[DEBUG_CLASS.map ?? ''] ? DEBUG_CLASS.map : debugTrial ? TRIALS[debugTrial]?.map : undefined);
    let mapId = data.map ?? (q === 'test' || q === 'field' ? 'field_test' : q && TILED_MAPS[q] ? q : debugMap ?? this.prog.position?.mapId ?? 'qingyun_village');
    mapId = TILED_MAPS[mapId] ? mapId : (MAP_FALLBACK[mapId] ?? mapId);
    // 本版本没有的地图（存档或传送门指过去）一律回青云村，不再掉进测试图
    if (!TILED_MAPS[mapId] && mapId !== 'field_test') { mapId = 'qingyun_village'; data.portal = undefined; }

    const area = MAP_AREA[mapId] ?? 'qingyun';
    this.drawBackground(area, TILED_MAPS[mapId]?.width * FEEL.tile || Math.max(...FIELD_TEST.rows.map(row => row.length)) * FEEL.tile,
      TILED_MAPS[mapId]?.height * FEEL.tile || FIELD_TEST.rows.length * FEEL.tile);
    this.map = TILED_MAPS[mapId] ? buildTiledMap(this, TILED_MAPS[mapId], `tiles_${area}`)
      : buildCharMap(this, FIELD_TEST.id, FIELD_TEST.name, FIELD_TEST.rows, FIELD_TEST.portals, `tiles_${area}`);
    this.npcMarks = [];
    this.physics.world.setBounds(0, 0, this.map.width, this.map.height + 200);
    // 地图 npc 对象的 phaseMin / phaseMax：不在当前版本阶段的不创建（没填不限制）
    this.map.objects = this.map.objects.filter(o => o.type !== 'npc' || inPhase(o.props));
    this.configureEnvironment(this.cache.json.get(`bg_${area}_config`)?.environment);
    this.mountDailyEnvoys();
    this.map.objects.forEach(o => this.drawObject(o));

    const savedPosition = !data.map && !q && this.prog.position?.mapId === mapId ? this.prog.position : undefined;
    const at = data.portal ? this.map.objects.find(o => o.type === 'portal' && o.name === data.portal) : data.pos ?? savedPosition;
    this.player = new Player(this, at ? at.x : this.map.spawn.x, at ? at.y : this.map.spawn.y);
    this.player.hp = this.prog.hp; this.player.maxHp = this.prog.maxHp;
    this.player.getMovePoints = () => this.prog.currentMovePoints();
    this.player.getAirJumpBonus = () => ({ extra: this.prog.passiveBonus('extraAirJumps'), distanceRatio: this.prog.passiveBonus('doubleJumpDistanceRatio') });
    this.player.getSkillAlpha = () => this.prog.hasBuffEffect('invisible') ? 0.35 : 1;
    this.player.getAppearance = () => this.prog.appearance;
    this.player.syncAppearance();
    this.gathering = new Gathering(this);
    this.combat = new SkillCombat(this);

    const oneWayCheck = (a: any, plat: any) => {
      const body: Phaser.Physics.Arcade.Body = a.body;
      if (a === this.player && (this.player.state2 === 'rope' || this.time.now < this.player.dropUntil)) return false;
      const top = (plat.body as Phaser.Physics.Arcade.StaticBody).top;
      return body.velocity.y >= 0 && body.prev.y + body.height <= top + 2;
    };
    this.physics.add.collider(this.player, this.map.solids);
    this.physics.add.collider(this.player, this.map.oneWays, () => { if (this.player.body.touching.down) this.player.oneWayAt = this.time.now; }, oneWayCheck);

    this.trialObjects = new SectTrialObjects(this);
    this.stealth = new StealthVision(this);
    this.stealth.update(0, false);
    for (const sp of this.map.trial ? [] : this.map.spawns) {
      const def = MONSTERS[sp.monster];
      if (!def) { console.warn(`[spawn] 没有怪物 ${sp.monster}`); continue; }
      // 首领区：接了 unlockQuest 才刷（任务系统 v0.3 接入，v0.2 先不刷）
      const zone = this.map.zones.find(z => sp.x >= z.x && sp.x <= z.x + z.w && sp.y >= z.y && sp.y <= z.y + z.h);
      if (zone?.props.unlockQuest && !this.quests.isActive(zone.props.unlockQuest)) continue;
      for (let i = 0; i < sp.count; i++) {
        // 刷怪点是一段平台宽度，怪在这段上均匀打散
        const x = sp.w > 0 ? sp.x + (sp.w * (i + 0.5)) / sp.count + Phaser.Math.Between(-16, 16) : sp.x + i * 24;
        const m = new Monster(this, x, sp.y, def);
        if (sp.w > 0) m.patrolBounds = [sp.x, sp.x + sp.w];
        this.wireMob(m);
        this.mobs.push(m);
      }
    }
    this.physics.add.collider(this.mobs, this.map.solids);
    this.physics.add.collider(this.mobs, this.map.oneWays, undefined, oneWayCheck);
    this.physics.add.overlap(this.player, this.mobs, (_p, mo) => {
      const m = mo as Monster;
      if (m.dead || m.suppressTouch || !m.def.touchDamage || this.map.safeZone && false) return;
      this.hurtPlayer(this.prog.damageFrom(m.def.atk, m.def.touchDamageMul ?? 1), m.x, m.def.knockback);
    });

    this.drops = this.physics.add.group();
    this.physics.add.collider(this.drops, this.map.solids);
    this.physics.add.collider(this.drops, this.map.oneWays, undefined, oneWayCheck);

    this.player.onAttack = rect => this.doAttack(rect);
    this.player.on('doublejump', () => this.puff(this.player.x, this.player.y - 10));

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      left: K.LEFT, right: K.RIGHT, up: K.UP, down: K.DOWN, alt: K.ALT, space: K.SPACE, c: K.C,
      ctrl: K.CTRL, x: K.X, z: K.Z, f1: K.F1, r: K.R, one: K.ONE, two: K.TWO, three: K.THREE, four: K.FOUR, five: K.FIVE, i: K.I,
      a: K.A, s: K.S, d: K.D, f: K.F, g: K.G, h: K.H, q: K.Q, w: K.W, k: K.K, l: K.L, esc: K.ESC,
    }, true) as any;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.width, this.map.height);
    cam.startFollow(this.player, true, 0.12, 0.1, 0, 40);
    cam.fadeIn(250);

    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hudText = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff' }).setScrollFactor(0).setDepth(101);
    this.sectTitle = this.add.text(1264, 164, '', { fontFamily: HUD_FONT, fontSize: '13px', color: INK,
      backgroundColor: '#faf2dcee', padding: { x: 6, y: 4 }, lineSpacing: 3 }).setOrigin(1, 0).setScrollFactor(0).setDepth(101).setVisible(false);
    this.sectBadge = this.add.image(0, 0, '__DEFAULT').setName('sect-rank-hud').setDisplaySize(24, 24).setScrollFactor(0).setDepth(101).setVisible(false);
    this.debugText = this.add.text(16, 200, '', { fontFamily: 'monospace', fontSize: '12px', color: '#1d2a3a', backgroundColor: '#ffffffaa', padding: { x: 6, y: 4 } }).setScrollFactor(0).setDepth(100).setVisible(false);
    this.add.text(16, 14, `${this.map.name}${this.map.safeZone ? '（安全区）' : ''}`, { fontFamily: 'sans-serif', fontSize: '18px', color: '#1d2a3a', stroke: '#ffffff', strokeThickness: 4 }).setScrollFactor(0).setDepth(100);
    this.add.text(1264, 14,
      '方向键 移动 / ↑↓ 爬绳梯  ↑ 传送 / 上船 / 闭关\nAlt / 空格 / C 跳跃（空中再按 = 二段跳）\n↓ + 跳 穿下单向平台\nCtrl / X 普攻   Z 对话 / 拾取 / 采集 / 开宝箱\nA S D F G H Q W 技能   K 功法  L 丹炉\n1 回春丹  2 回气丹  I 背包  F1 调试',
      { fontFamily: 'sans-serif', fontSize: '13px', color: '#1d2a3a', backgroundColor: '#ffffffaa', padding: { x: 8, y: 6 }, align: 'right' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.dialog = new DialogBox(this);
    this.alchemySystem = new AlchemySystem(this.prog, this.quests);
    this.alchemy = new AlchemyPanel(this, this.prog, this.alchemySystem);
    if (this.alchemySystem.active) this.alchemy.open(this.alchemySystem.active.furnaceId);
    this.skillBar = new SkillBar(this);
    this.skillWindow = new SkillWindow(this, () => this.prog, id => this.tryAddPoint(id));
    this.skillBar.onSlot = i => { if (this.skillWindow.open) this.skillWindow.assign(i); };
    this.maybeSpTip();
    this.tracker = this.add.text(16, 44, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', backgroundColor: '#1d2a3aaa', padding: { x: 8, y: 6 }, lineSpacing: 3 }).setScrollFactor(0).setDepth(100);
    this.bossIntroShown = false;
    this.input.keyboard!.addKey(K.ENTER).on('down', () => this.dialog.advance());
    this.invText = this.add.text(1264, 130, '', { fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', backgroundColor: '#1d2a3acc', padding: { x: 10, y: 8 } }).setOrigin(1, 0).setScrollFactor(0).setDepth(100).setVisible(false);
    this.gourd = this.add.image(1220, 718, 'icon_overflow_gourd_empty').setOrigin(0.5, 1).setScrollFactor(0).setDepth(103).setVisible(false).setInteractive({ useHandCursor: true });
    this.gourdTip = this.add.text(1220, 680, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#fff8e8', backgroundColor: '#1d2a3aee', padding: { x: 6, y: 3 } }).setOrigin(1, 1).setScrollFactor(0).setDepth(140).setVisible(false);
    this.gourd.on('pointerover', () => { if (this.gourd.visible) this.gourdTip.setVisible(true); });
    this.gourd.on('pointerout', () => this.gourdTip.setVisible(false));
    this.bossName = this.add.text(0, 0, '', { fontFamily: 'serif', fontSize: '18px', color: '#fff6e8', stroke: '#3a1020', strokeThickness: 4 }).setScrollFactor(0).setDepth(130).setVisible(false);
    this.bossHpText = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffe0e0', stroke: '#000000', strokeThickness: 3 }).setScrollFactor(0).setDepth(130).setVisible(false);
    this.buildHudKit();
    this.trial = undefined; this.bossOverride = null;
    this.setupTrial(mapId);
    this.applyFeatureFlags();
    this.prog.setPosition(this.map.id, this.player.x, this.player.y);
  }

  // ---------------- 筑基台试炼 ----------------
  trial?: AltarTrial;
  bossOverride: { name: string; hp: number; max: number } | null = null;

  private setupTrial(mapId: string) {
    const def = TRIAL_BY_MAP[mapId];
    const pending = this.registry.get('trialPending');
    if (def && (pending === def.id || (DEBUG_TRIAL && !this.registry.get('debugTrialUsed')))) {
      this.registry.set('trialPending', null); this.registry.set('debugTrialUsed', true);
      if (!this.registry.get('trialRate')) this.registry.set('trialRate', this.prog.breakthroughRate(false));
      const speed = Math.max(0.1, Number(QS.get('speed') ?? 1) || 1);
      this.trial = new AltarTrial(this, def, DEBUG_TRIAL ? speed : 1);
      this.log(t('trial.countdown', { sec: Math.round(def.durationMs / 1000) }), '#ffe680');
      const skip = DEBUG_TRIAL ? QS.get('skip') : null;
      if (skip === 'held' || skip === 'broken' || skip === 'dead') this.time.delayedCall(500, () => this.trial?.end(skip));
      return;
    }
    if (DEBUG_TRIAL && !def && !this.registry.get('debugTrialUsed')) {
      // 直接准备一个 29 级瓶颈、带筑基丹、考核已完成的角色
      const tr = Object.values(TRIALS).find(x => x.type === 'defend');
      const realm = REALMS.find((r: any) => r.trial === tr?.id);
      if (!tr || !realm) return;
      const pr = this.prog;
      pr.level = realm.levelMax; pr.exp = pr.expNeed;
      if (realm.breakthroughItem && pr.count(realm.breakthroughItem) < 1) pr.addItem(realm.breakthroughItem, 1);
      if (realm.breakthroughQuest) pr.quests[realm.breakthroughQuest] = { state: 'done', kills: {} };
      pr.hp = pr.maxHp; pr.mp = pr.maxMp;
      this.time.delayedCall(50, () => this.enterTrial(tr));
    }
  }

  /** 生成一只试炼怪（respawnMs 0，打死就消失） */
  spawnTrialMob(id: string, x: number, y: number) {
    const def = MONSTERS[id];
    if (!def) return null;
    const m = new Monster(this, x, y, def);
    m.noRespawn = true;
    this.wireMob(m);
    this.mobs.push(m);
    return m;
  }

  /** 和长老对话时：考核已完成、正卡在该境界瓶颈 → 可进试炼 */
  private trialOfferFor(npcId: string): TrialDef | null {
    const realm = this.prog.realm;
    if (!realm?.trial || !this.prog.atBreakthrough) return null;
    const qid = realm.breakthroughQuest, q = qid ? QUESTS_REF[qid] : null;
    if (!q || q.giver !== npcId || this.quests.state(qid) !== 'done') return null;
    const tr = TRIALS[realm.trial];
    return tr && tr.type === 'defend' && TILED_MAPS[tr.map] && mapEntryOpen(tr.map, this.map.id) ? tr : null;
  }

  offerTrial(npcId: string, tr: TrialDef) {
    if (!mapEntryOpen(tr.map, this.map.id)) {
      this.log(FEATURE_UNAVAILABLE, '#aaaaaa');
      const npc = NPCS[npcId];
      this.dialog.show([{ speaker: npc?.name ?? null, text: FEATURE_UNAVAILABLE }], npc?.sprite ?? null); return;
    }
    const npc = NPCS[npcId], realm = this.prog.realm, item = realm.breakthroughItem as string | null;
    const speaker = npc?.name ?? npcId;
    if (item && this.prog.count(item) < 1) {
      this.dialog.show([{ speaker, text: t('trial.need_pill', { item: ITEMS[item]?.name ?? item }) }], npc?.sprite ?? null);
      return;
    }
    const r = this.prog.breakthroughRate(undefined, item ? this.prog.pillQuality(item) : 'low');
    const pct = (v: number) => Math.round(v * 100);
    const lines = [
      { speaker, text: npc?.dialog?.[1] ?? '' },
      { speaker: null, text: t('realm.rate_detail', { rate: pct(r.rate), base: pct(r.base), pill: pct(r.pill), insight: pct(r.insight), clear: pct(r.clear), pity: pct(r.pity) }) },
      { speaker, text: t('trial.enter_hint', { sec: Math.round(tr.durationMs / 1000) }) },
    ].filter(l => l.text);
    this.dialog.show(lines, npc?.sprite ?? null, () => this.enterTrial(tr));
  }

  /** 进试炼：消耗突破丹药（和清心丹），记下本次成功率，载入试炼图 */
  enterTrial(tr: TrialDef) {
    if (!mapEntryOpen(tr.map, this.map.id)) { this.log(FEATURE_UNAVAILABLE, '#aaaaaa'); return; }
    const pr = this.prog, item = pr.realm.breakthroughItem as string | null;
    const itemConsumed = !!item && pr.count(item) > 0;
    const withClear = pr.count('clear_mind_pill') > 0;
    const itemQuality = item ? pr.pillQuality(item) : 'low', clearQuality = pr.pillQuality('clear_mind_pill');
    const rate = pr.breakthroughRate(withClear, itemQuality);
    if (item) { pr.removeItem(item, 1); this.log(t('trial.consume', { item: ITEMS[item]?.name ?? item }), '#c8c8c8'); }
    if (withClear) { pr.removeItem('clear_mind_pill', 1); this.log(t('trial.consume', { item: ITEMS.clear_mind_pill?.name ?? '清心丹' }), '#c8c8c8'); }
    pr.hp = pr.maxHp; pr.mp = pr.maxMp; pr.save();
    this.registry.set('trialPending', tr.id); this.registry.set('trialRate', rate);
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(220, () => {
      if (!mapEntryOpen(tr.map, this.map.id)) {
        if (item && itemConsumed) pr.addCraftedPill(item, 1, itemQuality);
        if (withClear) pr.addCraftedPill('clear_mind_pill', 1, clearQuality);
        pr.save(); this.registry.remove('trialPending'); this.registry.remove('trialRate');
        this.cameras.main.fadeIn(100); this.log(FEATURE_UNAVAILABLE, '#aaaaaa'); return;
      }
      this.scene.restart({ map: tr.map });
    });
  }

  /** 试炼结束：守不住只扣丹药（进场时已扣）；守住了按成功率掷骰 */
  onTrialEnd(result: TrialResult) {
    const pr = this.prog, p = this.player;
    const realm = pr.realm, pen = realm.failPenalty ?? {};
    const banner = (text: string, color = '#fff6c8') => {
      const tx = this.add.text(640, 250, text, { fontFamily: 'serif', fontSize: '40px', color, stroke: '#3b2a20', strokeThickness: 6 }).setOrigin(0.5).setScrollFactor(0).setDepth(170);
      this.tweens.add({ targets: tx, alpha: { from: 0, to: 1 }, duration: 400, hold: 1600, yoyo: true, onComplete: () => tx.destroy() });
    };
    this.registry.set('lastTrialResult', null);
    if (result !== 'held') {
      const msg = result === 'broken' ? t('trial.altar_broken') : t('trial.player_down');
      this.log(msg, '#ff8080'); banner(msg, '#ffb0b0');
      this.registry.set('lastTrialResult', result);
      this.time.delayedCall(2600, () => this.returnFromTrial());
      return;
    }
    this.log(t('trial.success'), '#ffe680'); banner(t('trial.success'));
    const rate = (this.registry.get('trialRate') as { rate: number } | undefined)?.rate ?? pr.breakthroughRate(false).rate;
    const forced = DEBUG_TRIAL ? QS.get('roll') : null;
    const win = forced === 'win' ? true : forced === 'lose' ? false : Math.random() < rate;
    this.time.delayedCall(2200, () => {
      if (win) {
        const next = REALMS[REALMS.indexOf(realm) + 1];
        this.playCue('breakthrough', () => {
          pr.breakthrough(); pr.breakthroughFails = 0; pr.unstableUntil = 0;
          pr.hp = pr.maxHp; pr.mp = pr.maxMp;
          this.player.maxHp = pr.maxHp; this.player.hp = pr.hp;
          this.log(`突破成功，当前境界 ${pr.realmName}`, '#ffb0ff');
          if (pr.lastOverflowReturned > 0) this.log(`溢出修为返还 ${pr.lastOverflowReturned}`, '#c8c8c8');
          this.registry.set('lastTrialResult', 'win');
          pr.save();
          this.time.delayedCall(1200, () => this.returnFromTrial());
        }, t('realm.breakthrough_ok', { realm: next?.name ?? '' }));
      } else {
        this.playBreakthroughFail(p.x, p.y);
        this.cameras.main.shake(300, 0.008);
        const gray = this.add.rectangle(640, 360, 1280, 720, 0x6a6a6a, 0).setScrollFactor(0).setDepth(149);
        this.tweens.add({ targets: gray, fillAlpha: 0.45, duration: 400 });
        const lost = pr.applyBreakthroughFail(Number(pen.expLossRatio ?? 0));
        pr.breakthroughFails++;
        if (pen.debuffMs) { pr.unstableUntil = gameNow() + Number(pen.debuffMs); pr.unstableRatio = Number(pen.debuffStatRatio ?? 0); pr.unstableStats = Array.isArray(pen.debuffStats) ? [...pen.debuffStats] : []; }
        const bonus = Math.round((BREAKTHROUGH.pityPerFail ?? 0) * 100);
        banner(t('realm.breakthrough_fail'), '#d0d0d0');
        this.log(t('realm.breakthrough_fail'), '#d0d0d0');
        this.log(t('realm.next_bonus', { bonus }), '#ffe680');
        if (lost.lost > 0) this.log(`修为 −${lost.lost}${lost.fromPool ? `（溢出池 −${lost.fromPool}）` : ''}`, '#c8c8c8');
        if (pen.debuffMs) this.log(t('realm.unstable', { min: Math.round(Number(pen.debuffMs) / 60000) }), '#ffb0b0');
        this.registry.set('lastTrialResult', 'lose');
        pr.save();
        this.time.delayedCall(3000, () => this.returnFromTrial());
      }
    });
  }

  private returnFromTrial() {
    const pr = this.prog;
    pr.hp = pr.maxHp; pr.mp = pr.maxMp; pr.save();
    this.registry.set('trialRate', null);
    this.cameras.main.fadeOut(250);
    this.time.delayedCall(270, () => this.scene.restart({ map: TRIAL_RETURN.map, pos: { x: TRIAL_RETURN.x, y: TRIAL_RETURN.y } }));
  }
  invText!: Phaser.GameObjects.Text;

  update(time: number, delta: number) {
    this.environmentArt?.update(delta);
    if (time >= this.nextDailyUpdateAt) {
      this.quests.refreshDaily(); this.nextDailyUpdateAt = time + 1000;
    }
    this.player.syncAppearance();
    const k = this.keys, J = Phaser.Input.Keyboard.JustDown;
    this.clearAbandonedBossSummons();
    this.backgroundArt?.update();
    for (const p of this.parallax) p.ts.tilePositionX = this.cameras.main.scrollX * p.f;
    this.updateShots(time);
    this.regenMp(delta);
    this.combat.update(time, delta);
    this.trialObjects?.update(delta);
    if (time >= this.nextAgeUpdateAt) { this.prog.advanceAge(); this.nextAgeUpdateAt = time + 60000; this.prog.save(); }
    if (J(k.k) && !this.dialog.open && !this.alchemy.isOpen()) this.skillWindow.toggle();
    if (J(k.l) && !this.dialog.open && !this.skillWindow.open) this.openAlchemy();
    const escDown = J(k.esc);
    if (escDown && this.skillWindow.open) this.skillWindow.close();
    const modal = this.dialog.open || this.skillWindow.open || this.alchemy.isOpen();
    this.updateInteractionPrompts(modal);
    this.gathering.update(delta, k.z.isDown, modal || this.hasNearbyDrop(),
      k.left.isDown || k.right.isDown || k.up.isDown || k.down.isDown || k.space.isDown || k.alt.isDown || k.c.isDown || k.ctrl.isDown || k.x.isDown);
    if (modal) {
      this.alchemy.update(delta);
      if (this.dialog.open) {
        [k.one, k.two, k.three, k.four, k.five].forEach((key, i) => { if (J(key)) this.dialog.selectChoice(i); });
        if (escDown) this.dialog.dismissChoices();
      }
      if (this.dialog.open && (J(k.z) || J(k.space) || J(k.up))) this.dialog.advance();
      if (this.skillWindow.open) {
        const jobs = this.prog.classSkills;
        const nums = [k.one, k.two, k.three, k.four, k.five];
        nums.forEach((key, i) => { if (J(key) && jobs[i]) this.tryAddPoint(jobs[i].id); });
      }
      J(k.alt); J(k.c);
      J(k.space); J(k.z); J(k.up);
      this.player.body.setVelocityX(0);
      this.player.step(time, delta / 1000, { left: false, right: false, up: false, down: false, jumpDown: false, attackDown: false }, this.map.ropes);
      this.stealth?.update(0, false);
      for (const m of this.mobs) {
        if (m.despawning) m.step(time, this.player);
        else if (m.def.isBoss) m.recoverInBounds();
      }
      this.drawHud(); return;
    }
    this.trial?.update(delta);
    const inp: Input = {
      left: k.left.isDown, right: k.right.isDown, up: k.up.isDown, down: k.down.isDown,
      jumpDown: J(k.alt) || J(k.space) || J(k.c),
      attackDown: k.ctrl.isDown || k.x.isDown,
    };
    if (J(k.f1)) this.toggleDebug();
    if (J(k.r)) { this.player.leaveRope(time); this.player.body.reset(this.map.spawn.x, this.map.spawn.y); }
    if (J(k.i)) this.invText.setVisible(!this.invText.visible);
    if (J(k.one)) this.usePill('hp_pill_small');
    if (J(k.two)) this.usePill('qi_pill');
    if (J(k.z) && this.player.state2 === 'ground' && !this.gathering.active && !this.hasNearbyDrop()
      && (this.interactTrialObject() || this.openNearbyFurnace() || this.talkNearby())) return;
    if (k.z.isDown && !this.gathering.active && time >= this.nextPickAt) { this.nextPickAt = time + 150; this.tryPickup(); }
    if (J(k.up) && this.player.state2 === 'ground' && this.tryInteract()) return;
    const slotKey: Record<string, Phaser.Input.Keyboard.Key> = { A: k.a, S: k.s, D: k.d, F: k.f, G: k.g, H: k.h, Q: k.q, W: k.w };
    HOTBAR_SLOTS.forEach((s, i) => { if (J(slotKey[s.label]) && !this.gathering.active) this.combat.tryCast(i); });
    this.checkReach();
    if (this.player.y > this.map.height + 100) this.player.body.reset(this.map.spawn.x, this.map.spawn.y);

    this.player.step(time, delta / 1000, inp, this.map.ropes);
    for (const m of this.mobs) m.step(time, this.player, this.prog.hasBuffEffect('invisible'));
    for (let i = this.mobs.length - 1; i >= 0; i--) if (!this.mobs[i].active) this.mobs.splice(i, 1);
    this.stealth?.update(delta, true);
    for (const d of this.drops.getChildren() as Drop[]) {
      if (!d.landed && d.shadow && (d.body as Phaser.Physics.Arcade.Body).blocked.down) this.landDrop(d);
      d.label?.setPosition(d.x, d.y - (d.shadow ? 34 : 22));
      if (time - d.bornAt > 60000) this.removeDrop(d);
    }
    const z = this.map.zones.find(z => this.player.x >= z.x && this.player.x <= z.x + z.w && this.player.y >= z.y && this.player.y <= z.y + z.h);
    if (z?.name !== this.curZone) {
      this.curZone = z?.name;
      if (z?.props.label) this.log(`进入 ${z.props.label}`, '#ffd0ff');
      const boss = this.mobs.find(m => m.def.isBoss && !m.dead && z && m.x >= z.x && m.x <= z.x + z.w);
      if (boss && !this.bossIntroShown && z?.props.unlockQuest) { this.bossIntroShown = true; this.dialog.show(SCRIPTS[z.props.unlockQuest]?.bossIntro ?? [], null); }
    }
    // 独立检查教学区，重叠 zone 也能触发；对白空闲后才记入存档并弹出。
    if (!this.dialog.open) for (const tutorialZone of this.map.zones) {
      const id = tutorialZone.props.tutorial;
      if (typeof id !== 'string' || !id || this.player.x < tutorialZone.x || this.player.x > tutorialZone.x + tutorialZone.w
        || this.player.y < tutorialZone.y || this.player.y > tutorialZone.y + tutorialZone.h) continue;
      if (!this.prog.markTutorialSeen(id)) continue;
      const text = t(`tip.${id}`);
      this.log(text, '#ffe680');
      this.dialog.show([{ speaker: null, text }], null);
      break;
    }
    this.drawHud();
  }
  curZone?: string;
  quests!: QuestSystem;
  npcMarks: { id: string; text: Phaser.GameObjects.Text; img?: Phaser.GameObjects.Image }[] = [];
  hudKit?: HudKit;
  parallax: { ts: Phaser.GameObjects.TileSprite; f: number }[] = [];
  dialog!: DialogBox;
  skillBar!: SkillBar;
  skillWindow!: SkillWindow;
  combat!: SkillCombat;
  private mpPool = 0;
  tracker!: Phaser.GameObjects.Text;
  bossIntroShown = false;
  hudTexts?: Phaser.GameObjects.Text[];
  /** 当前地图上的首领（含已死、尚未重生的那只），测试从 window.__scene.boss 拿 */
  get boss(): Monster | null { return this.mobs.find(m => m.def.isBoss && !m.owner) ?? null; }
  gourd!: Phaser.GameObjects.Image;
  gourdTip!: Phaser.GameObjects.Text;
  bossName!: Phaser.GameObjects.Text;
  bossHpText!: Phaser.GameObjects.Text;
  private shots: Shot[] = [];
  private shotOf = new Map<Phaser.GameObjects.GameObject, Shot>();
  private shotGroup?: Phaser.Physics.Arcade.Group;

  // ---------------- 战斗 ----------------
  private wireMob(m: Monster) {
    m.onDead = mm => this.onMobDead(mm);
    m.onSlam = (mm, rect) => this.onSlam(mm, rect);
    m.onVolley = v => this.launchVolley(v);
    m.onSkillDamage = (mm, ratio, kb, fromX) => this.hurtPlayer(this.prog.damageFrom(mm.def.atk, ratio), fromX, kb);
    m.onSummon = (owner, id, x, y, grant, despawn) => this.spawnSummon(owner, id, x, y, grant, despawn);
  }

  private spawnSummon(owner: Monster, id: string, x: number, y: number, grantRewards: boolean, despawnWithOwner: boolean) {
    const def = MONSTERS[id];
    if (!def || !owner.active) return;
    // 召唤阵延迟到第 4 帧才刷怪；败北或离区后仍让首领动作正常结束，但不补刷随主清场的召唤物。
    if (despawnWithOwner && this.bossSummonsShouldDespawn(owner)) return;
    const m = new Monster(this, x, y, def);
    m.owner = owner; m.grantRewards = grantRewards; m.despawnWithOwner = despawnWithOwner; m.noRespawn = true;
    this.wireMob(m);
    owner.summons.push(m);
    this.mobs.push(m);
  }

  private bossSummonsShouldDespawn(owner: Monster) {
    if (!owner.def.isBoss || owner.owner) return false;
    if (this.player.dead) return true;
    const zone = owner.arenaZone;
    return !!zone && (this.player.x < zone.x || this.player.x > zone.x + zone.w
      || this.player.y < zone.y || this.player.y > zone.y + zone.h);
  }

  private clearAbandonedBossSummons() {
    for (const m of this.mobs) if (this.bossSummonsShouldDespawn(m)) m.clearSummons();
  }

  private launchVolley(v: SkillVolley) {
    if (!this.shotGroup) {
      this.shotGroup = this.physics.add.group();
      this.physics.add.collider(this.shotGroup, this.map.solids, obj => { const s = this.shotOf.get(obj as Phaser.GameObjects.GameObject); if (s) this.impactShot(s, false); });
      this.physics.add.overlap(this.player, this.shotGroup, (_p, obj) => { const s = this.shotOf.get(obj as Phaser.GameObjects.GameObject); if (s) this.impactShot(s, true); });
    }
    const pack = this.cache.json.get(`${v.fx}_anims`);
    const anims = (pack?.anims ?? []) as { key: string; frames: string[]; frameRate: number }[];
    const fly = anims.find(a => a.key.includes('fly')) ?? anims[0];
    const hit = anims.find(a => a.key.includes('hit'));
    const origin = (pack?.origin ?? [0.5, 0.5]) as [number, number];
    const hitMs = hit ? hit.frames.length * (1000 / hit.frameRate) : 200;
    let tex = v.fx;
    if (!this.textures.exists(tex)) {
      if (!v.maxDist) return;
      // 没有弹道图集时：小黄色矩形占位（黑袍人的符）
      tex = 'ph_talisman';
      if (!this.textures.exists(tex)) { const g = this.make.graphics({}, false); g.fillStyle(0xf2d04a).fillRect(0, 0, 20, 12).lineStyle(2, 0x8a5a10).strokeRect(0, 0, 20, 12); g.generateTexture(tex, 20, 12); g.destroy(); }
    }
    for (const sh of v.shots) {
      const s = this.physics.add.sprite(sh.x, sh.y, tex);
      s.setOrigin(origin[0], origin[1]).setDepth(12).setBlendMode(Phaser.BlendModes.NORMAL).setFlipX(sh.vx > 0);
      this.shotGroup.add(s);   // 先进组：PhysicsGroup 加入时会把重力、速度重置成组默认值，所以之后再设
      const body = s.body as Phaser.Physics.Arcade.Body;
      const bw = v.body?.w ?? 22, bh = v.body?.h ?? 18;
      body.setAllowGravity(false).setSize(bw, bh).setOffset((s.width - bw) / 2, (s.height - bh) / 2).setVelocity(sh.vx, sh.vy);
      if (fly && this.anims.exists(fly.key)) s.play(fly.key);
      const shot: Shot = { sprite: s, state: 'fly', until: 0, ratio: v.ratio, kb: v.knockback, atk: v.atk, hitAnim: hit?.key, hitMs, fromX: sh.x, maxDist: v.maxDist };
      this.shots.push(shot); this.shotOf.set(s, shot);
    }
  }

  private impactShot(s: Shot, hitPlayer: boolean) {
    if (s.state !== 'fly') return;
    s.state = 'hit';
    const body = s.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0); body.enable = false;
    if (hitPlayer) this.hurtPlayer(this.prog.damageFrom(s.atk, s.ratio), s.sprite.x, s.kb);
    if (s.hitAnim && this.anims.exists(s.hitAnim)) s.sprite.play(s.hitAnim);
    s.until = this.time.now + s.hitMs;
  }

  private updateShots(time: number) {
    for (const s of this.shots) {
      const gone = s.state === 'hit' ? time >= s.until
        : (s.maxDist && Math.abs(s.sprite.x - (s.fromX ?? s.sprite.x)) >= s.maxDist) ? (this.impactShot(s, false), false)
        : s.sprite.x < -80 || s.sprite.x > this.map.width + 80 || s.sprite.y < -120 || s.sprite.y > this.map.height + 120;
      if (!gone) continue;
      this.shotOf.delete(s.sprite); s.sprite.destroy(); s.dead = true;
    }
    if (this.shots.some(s => s.dead)) this.shots = this.shots.filter(s => !s.dead);
  }

  doAttack(rect: Phaser.Geom.Rectangle) {
    const p = this.player, s = p.facing;
    if (this.anims.exists('fx_sword_slash_play')) {      // 刀光：第 2 帧播放，普通混合（加色在白云背景上看不见）
      const fx = this.add.sprite(p.x + s * 36, p.y + 10, 'fx_sword_slash').setOrigin(0.5, 1).setDepth(12).setFlipX(s > 0);
      fx.play('fx_sword_slash_play'); fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    } else {
      const fx = this.add.graphics().setDepth(12);
      fx.lineStyle(6, 0xbfefff, 0.9);
      fx.beginPath(); fx.arc(p.x, p.y - SPEC.bodyH / 2, FEEL.attackRange - 8, s > 0 ? -1.2 : Math.PI - 1.0, s > 0 ? 1.0 : Math.PI + 1.2); fx.strokePath();
      this.tweens.add({ targets: fx, alpha: 0, duration: 200, onComplete: () => fx.destroy() });
    }

    let best: Monster | null = null, bestD = Infinity;   // 普攻只打最近的一只
    for (const m of this.mobs) {
      if (m.dead) continue;
      const mb = m.body;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(mb.x, mb.y, mb.width, mb.height))) continue;
      const d = Math.abs(m.x - p.x);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (!best) return;
    const dmg = this.prog.damageTo(best.def.level, best.def.def);
    best.takeHit(this.time.now, dmg, s);
    this.damageNumber(best.x, best.y - best.body.height - 10, dmg, '#ffb02e', '#6b2a00');
  }

  onSlam(m: Monster, rect: Phaser.Geom.Rectangle) {
    const fx = this.add.rectangle(rect.centerX, rect.centerY, rect.width, rect.height, 0xff7a3a, 0.35).setDepth(9);
    this.tweens.add({ targets: fx, alpha: 0, duration: 300, onComplete: () => fx.destroy() });
    this.cameras.main.shake(120, 0.004);
    const pb = this.player.body;
    if (Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height)))
      this.hurtPlayer(this.prog.damageFrom(m.def.atk, m.def.attack!.damageRatio), m.x, m.def.attack!.knockback);
  }

  hurtPlayer(dmg: number, fromX: number, knock: number) {
    if (this.player.dead || this.time.now < this.player.invulnUntil) return;
    if (Math.random() < this.prog.passiveBonus('evade')) return;
    const shield = Math.min(1, Math.max(0, this.prog.buffBonus('damageToMpRatio')));
    const mpPerDamage = this.prog.buffBonus('mpPerAbsorbedDamage') || 1;
    const absorbed = Math.min(Math.floor(dmg * shield), Math.floor(this.prog.mp / mpPerDamage));
    dmg = Math.max(0, dmg - absorbed);
    if (!this.player.hurt(this.time.now, fromX, dmg, knock)) return;
    this.prog.mp = Math.max(0, this.prog.mp - absorbed * mpPerDamage);
    this.gathering.cancel();
    this.prog.hp = Math.max(0, this.prog.hp - dmg);
    this.player.hp = this.prog.hp;
    this.damageNumber(this.player.x, this.player.y - 70, dmg, '#c45cff', '#2a0040');
    if (this.prog.hp <= 0) this.playerDie();
  }

  playerDie() {
    const p = this.player;
    p.dead = true; p.state2 = 'hurt'; p.hurtUntil = Infinity;
    this.clearAbandonedBossSummons();
    if (p.atlas) p.play(p.animationKey('die'));
    if (this.trial && !this.trial.ended) { this.trial.end('dead'); return; }
    if (this.trial) return;
    if (this.map.trial) {
      this.events.emit('trial:object', { trial: this.map.trial, action: 'player_down' });
      this.time.delayedCall(1000, () => {
        this.prog.hp = this.prog.maxHp; this.prog.mp = this.prog.maxMp;
        this.scene.restart({ map: this.map.id });
      });
      return;
    }
    this.log('你被击倒了，3 秒后在出生点复活', '#ff8080');
    this.time.delayedCall(3000, () => {
      this.prog.hp = this.prog.maxHp; this.prog.mp = this.prog.maxMp;
      p.dead = false; p.hp = this.prog.hp; p.hurtUntil = 0; p.state2 = 'air'; p.invulnUntil = this.time.now + 2000;
      p.body.reset(this.map.spawn.x, this.map.spawn.y);
    });
  }

  onMobDead(m: Monster) {
    // grantRewards 默认 false 的召唤物：不给修为、不掉落、不计任务击杀，也不进任何击杀统计
    if (!m.grantRewards) return;
    const d = m.def;
    this.quests.onKill(d.id);
    if (d.isBoss) this.time.delayedCall(600, () => this.dialog.show(SCRIPTS.q_fox?.bossDeath ?? [], null));
    if (d.exp > 0) this.applyExp(this.prog.gainExp(d.exp, d.level));
    const t = d.dropTable ? DROPS[d.dropTable] : null;
    if (!t) return;
    const out: [string, number][] = [];
    const [lo, hi] = t.spiritStone ?? [0, 0];
    if (hi > 0) out.push(['spirit_stone', Phaser.Math.Between(lo, hi)]);
    for (const it of t.items) if (Math.random() < it.chance) out.push([it.item, Phaser.Math.Between(it.count[0], it.count[1])]);
    out.forEach(([id, n], i) => this.spawnDrop(m.x + (i - (out.length - 1) / 2) * 22, m.y - 20, id, n));
  }

  // ---------------- 掉落与拾取 ----------------
  private hasNearbyDrop() {
    return (this.drops.getChildren() as Drop[]).some(d => d.active
      && Math.abs(d.x - this.player.x) < 40 && Math.abs(d.y - this.player.y) < 40);
  }

  private updateInteractionPrompts(blocked: boolean) {
    for (const { object: o, prompt, marker } of this.interactionPrompts) {
      const furnace = o.type === 'furnace' || o.type === 'alchemy';
      if (o.type === 'npc' && (o.props.npc ?? o.name) === 'doctor_sun') {
        const label = prompt.list[prompt.list.length - 1] as Phaser.GameObjects.Text;
        const text = featureEnabled('alchemyPhase1') ? '对话 / L 炼丹' : '对话';
        if (label.text !== text) {
          label.setText(text);
          prompt.setX(o.x - ((hudSpec(this, 'ui_hud_keycap')?.size?.[0] ?? 20) + 4 + label.width) / 2);
        }
      }
      if (marker) {
        const marked = !!this.quests.mark(o.props.npc ?? o.name);
        const capHeight = hudSpec(this, 'ui_hud_keycap')?.size?.[1] ?? 20;
        prompt.setY(marked ? o.y + marker.y - marker.displayHeight - capHeight - 4 : o.y - 52);
      }
      prompt.setVisible((!furnace || featureEnabled('alchemyPhase1')) && !blocked && !this.player.dead && !this.hasNearbyDrop()
        && Math.abs(o.x - this.player.x) < 40 && Math.abs(o.y - this.player.y) < 48);
    }
  }

  openAlchemy(publicFurnace?: string) {
    if (!this.requireFeature('alchemyPhase1')) return false;
    if (this.player.dead || this.trial || this.map.trial || this.dialog.open || this.skillWindow.open) return false;
    const near = this.nearNpc();
    const owned = ['dark_iron_furnace', 'purple_copper_furnace', 'bronze_furnace'].find(id => this.prog.count(id) > 0);
    const furnace = publicFurnace ?? (near === 'doctor_sun' ? 'bronze_furnace' : owned);
    if (!furnace) { this.log('请到孙郎中处使用丹炉，或先获得丹炉。', '#ffb0b0'); return false; }
    this.gathering.cancel(); this.player.body.setVelocityX(0);
    this.alchemy.open(furnace); return true;
  }

  private openNearbyFurnace() {
    const o = this.map.objects.find(o => (o.type === 'furnace' || o.type === 'alchemy')
      && Math.abs(o.x - this.player.x) < 40 && Math.abs(o.y - this.player.y) < 48);
    return !!o && this.openAlchemy(String(o.props.furnace ?? o.props.item ?? 'bronze_furnace'));
  }

  spawnDrop(x: number, y: number, id: string, count: number) {
    const icon = this.dropIcon(id);
    const d = (icon ? this.physics.add.sprite(x, y, 'icons_items', icon) : this.physics.add.sprite(x, y, this.dropTex(id))).setOrigin(0.5, 1).setDepth(7) as Drop;
    this.drops.add(d);
    d.itemId = id; d.count = count; d.bornAt = this.time.now;
    if (icon) {
      d.setDisplaySize(DROP_ICON_PX, DROP_ICON_PX);
      // 碰撞体 16×16 贴图标底边（拾取判定不变）
      d.body!.setSize(16 / d.scaleX, 16 / d.scaleY).setOffset((d.width - 16 / d.scaleX) / 2, d.height - 16 / d.scaleY);
      d.shadow = this.add.ellipse(x, y, DROP_SHADOW.w, DROP_SHADOW.h, DROP_SHADOW.color, DROP_SHADOW.alpha).setDepth(6).setVisible(false);
    } else d.body!.setSize(16, 16);
    (d.body as Phaser.Physics.Arcade.Body).setVelocity(Phaser.Math.Between(-30, 30), -300).setDragX(300);
    if (id !== 'spirit_stone') d.label = this.add.text(x, y, ITEMS[id]?.name ?? id, { fontSize: '11px', color: '#ffffff', backgroundColor: '#00000088', padding: { x: 3, y: 1 } }).setOrigin(0.5, 1).setDepth(7);
  }

  tryPickup() {
    const p = this.player;
    let best: Drop | null = null, bd = Infinity;
    for (const d of this.drops.getChildren() as Drop[]) {
      const dist = Math.abs(d.x - p.x) + Math.abs(d.y - p.y) * 0.5;
      if (Math.abs(d.x - p.x) < 40 && Math.abs(d.y - p.y) < 40 && dist < bd) { bd = dist; best = d; }
    }
    if (best) { this.collect(best); return; }
    this.tryOpenChest();
  }

  collect(d: Drop) {
    (d.body as Phaser.Physics.Arcade.Body).enable = false;
    this.drops.remove(d);
    d.label?.destroy(); d.floatTw?.stop(); d.shadow?.destroy();
    this.tweens.add({ targets: d, x: this.player.x, y: this.player.y - 70, alpha: 0, duration: 200, onComplete: () => d.destroy() });
    if (d.itemId === 'spirit_stone') { this.prog.stones += d.count; this.log(`获得灵石 ${d.count}`, '#7ff0d0'); }
    else if (ITEMS[d.itemId]?.type === 'equip') { const on = this.prog.gainEquip(d.itemId); this.player.syncAppearance(); this.log(`获得 ${ITEMS[d.itemId].name}${on ? '（已自动装备）' : ''}`, '#9fd0ff'); }
    else { this.prog.addItem(d.itemId, d.count); this.log(`获得 ${ITEMS[d.itemId]?.name ?? d.itemId} ×${d.count}`, '#ffffff'); }
  }

  usePill(id: string) {
    if (!this.prog.inventory[id]) { this.log(`没有${ITEMS[id]?.name ?? id}`, '#aaaaaa'); return; }
    const eff = ITEMS[id]?.effect ?? {};
    const quality = this.prog.pillQuality(id), mul = ALCHEMY_RULES.quality.effectMul[quality];
    this.prog.removeItem(id, 1);
    if (eff.hp || id === 'hp_pill_small') this.prog.hp = Math.min(this.prog.maxHp, this.prog.hp + Math.round((eff.hp ?? 60) * mul));
    if (eff.mp || id === 'qi_pill') this.prog.mp = Math.min(this.prog.maxMp, this.prog.mp + Math.round((eff.mp ?? 50) * mul));
    this.player.hp = this.prog.hp;
    this.log(`服用 ${ITEMS[id]?.name ?? id}`, '#9fffb0');
    this.prog.save();
  }

  // ---------------- 地图物件 ----------------
  private requireFeature(name: FeatureName, npcId?: string) {
    if (featureEnabled(name)) return true;
    this.log(FEATURE_UNAVAILABLE, '#aaaaaa');
    const npc = npcId ? NPCS[npcId] : undefined;
    this.dialog.show([{ speaker: npc?.name ?? null, text: FEATURE_UNAVAILABLE }], npc?.sprite ?? null);
    return false;
  }

  /** 测试覆盖即时撤下旧回调；存档身份、材料、贡献与待炼炉次均保留。 */
  applyFeatureFlags() {
    this.dialog?.dismiss(); this.skillWindow?.close();
    if (!featureEnabled('alchemyPhase1')) {
      this.alchemy?.suspend(); this.gathering?.update(0, false, true);
    }
    if (featureEnabled('sectDaily')) {
      const count = this.map.objects.length;
      this.mountDailyEnvoys();
      this.map.objects.slice(count).forEach(o => this.drawObject(o));
    }
    const exitName = '__feature_return';
    const needsExit = FIRST_CLASS_TRIAL_MAPS.has(this.map.id)
      && (!featureEnabled('v05Maps') || !featureEnabled('fiveSectClasses'));
    const exit = this.map.objects.find(o => o.name === exitName);
    if (needsExit && !exit) {
      const object: MapObj = { type: 'portal', name: exitName, x: this.map.spawn.x, y: this.map.spawn.y,
        w: 0, h: 0, props: { target: 'qingyun_village', featureExit: true } };
      this.map.objects.unshift(object); this.drawObject(object);
    } else if (!needsExit && exit) {
      this.map.objects = this.map.objects.filter(o => o !== exit);
      this.portalVisuals = this.portalVisuals.filter(visual => {
        if (visual.object !== exit) return true;
        this.tweens.killTweensOf(visual.art); visual.art.destroy(); visual.label?.destroy(); return false;
      });
    }
    for (const visual of this.portalVisuals) {
      const shut = !this.portalOpen(visual.object);
      visual.art.setFillStyle(shut ? 0x888888 : 0x8fe3ff, 0.55).setStrokeStyle(3, shut ? 0x555555 : 0x3a9fd8);
      const text = visual.object.props.featureExit ? '回青云村 ↑'
        : mapEntryOpen(visual.object.props.target, this.map.id) ? '' : FEATURE_UNAVAILABLE;
      if (text) (visual.label ??= this.portalStatusLabel(visual.object, text)).setText(text);
      else { visual.label?.destroy(); visual.label = undefined; }
    }
    for (const label of this.seclusionLabels) label.setText(featureEnabled('seclusion') ? '闭关室 ↑' : FEATURE_UNAVAILABLE);
  }

  /** NPC 表已登记日常，地图点位尚缺；四宗山门未发布时只给本宗弟子在落霞镇补同一接引人。 */
  private mountDailyEnvoys() {
    if (!featureEnabled('sectDaily')) return;
    for (const npc of Object.values(NPCS)) {
      if (!inPhase(npc)) continue;
      const daily = (npc.quests ?? []).map(id => QUESTS_REF[id]).find(q => q?.daily && q.giver === npc.id);
      if (!daily) continue;
      const atRegisteredMap = npc.map === this.map.id;
      const atFallback = !TILED_MAPS[npc.map] && this.map.id === 'luoxia_town' && this.prog.sect === daily.sect;
      if (!(atRegisteredMap || atFallback) || this.map.objects.some(o => o.type === 'npc' && (o.props.npc ?? o.name) === npc.id)) continue;
      this.map.objects.push({ type: 'npc', name: npc.id, x: this.map.spawn.x + 96, y: this.map.spawn.y,
        w: 0, h: 0, props: { npc: npc.id } });
    }
  }

  drawObject(o: MapObj) {
    if (o.type === 'npc') {
      const npc = NPCS[o.props.npc ?? o.name];
      const c = this.add.container(o.x, o.y).setDepth(5).setAlpha(o.props.phantom ? 0.55 : 1);
      let h = 70;
      if (npc && this.textures.exists(npc.sprite)) {
        const sp = this.add.sprite(0, 0, npc.sprite).setOrigin(0.5, 1).setFlipX(o.x < this.map.width / 2);
        if (this.anims.exists(`${npc.sprite}_idle`)) sp.play(`${npc.sprite}_idle`);
        applySpriteArt(sp);
        c.add(sp); h = sp.displayHeight - 10;
      } else {
        c.add(this.add.rectangle(0, -28, 30, 56, 0xf2d9a0).setStrokeStyle(2, 0x5a4020));
        c.add(this.add.circle(0, -62, 16, 0xffe0c2).setStrokeStyle(2, 0x5a4020));
      }
      c.add(this.add.text(0, 6, npc?.name ?? o.name, { fontFamily: 'sans-serif', fontSize: '12px', color: '#fff', backgroundColor: '#3a2a10cc', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0));
      const mark = this.add.text(0, -h - 8, '', { fontFamily: 'Arial Black, sans-serif', fontSize: '26px', color: '#ffd23a', stroke: '#6b3a00', strokeThickness: 5 }).setOrigin(0.5, 1);
      c.add(mark);
      this.tweens.add({ targets: mark, y: mark.y - 6, yoyo: true, repeat: -1, duration: 500 });
      // 任务标记图（hud_ui.json 的 origin），三张都在才换图，否则保留文字
      let img: Phaser.GameObjects.Image | undefined;
      if (QUEST_MARK_KEYS.every(k => this.textures.exists(k))) {
        const sp = hudSpec(this, 'ui_hud_quest_available');
        img = this.add.image(0, -h - 8, 'ui_hud_quest_available').setOrigin(sp?.origin?.[0] ?? 0.5, sp?.origin?.[1] ?? 1).setVisible(false);
        c.add(img);
        this.tweens.add({ targets: img, y: img.y - 6, yoyo: true, repeat: -1, duration: 500 });
      }
      if (npc) this.npcMarks.push({ id: npc.id, text: mark, img });
      const label = npc?.id === 'doctor_sun' && featureEnabled('alchemyPhase1') ? '对话 / L 炼丹' : '对话';
      const prompt = interactionPrompt(this, o.x, o.y - h - 38, 'Z', label);
      this.interactionPrompts.push({ object: o, prompt, marker: img ?? mark });
    } else if (o.type === 'furnace' || o.type === 'alchemy') {
      const furnace = String(o.props.furnace ?? o.props.item ?? 'bronze_furnace');
      const image = `ui_alchemy_furnace_${furnace}`;
      if (this.textures.exists(image)) this.add.image(o.x, o.y, image).setOrigin(0.5, 1).setDisplaySize(64, 64).setDepth(4);
      const prompt = interactionPrompt(this, o.x, o.y - 76, 'Z', t('alchemy.title'));
      this.interactionPrompts.push({ object: o, prompt });
    } else if (o.type === 'portal') {
      const shut = !this.portalOpen(o);
      const g = this.add.ellipse(o.x, o.y - 40, 46, 80, shut ? 0x888888 : 0x8fe3ff, 0.55).setStrokeStyle(3, shut ? 0x555555 : 0x3a9fd8).setDepth(4);
      if (!shut) this.tweens.add({ targets: g, scaleX: 0.85, yoyo: true, repeat: -1, duration: 700 });
      const text = o.props.featureExit ? '回青云村 ↑' : mapEntryOpen(o.props.target, this.map.id) ? '' : FEATURE_UNAVAILABLE;
      const label = text ? this.portalStatusLabel(o, text) : undefined;
      this.portalVisuals.push({ object: o, art: g, label });
    } else if (o.type === 'chest') {
      const opened = this.openedChests.has(`${this.map.id}:${o.name}`);
      this.add.rectangle(o.x, o.y - 14, 34, 28, opened ? 0x7a5a3a : 0xd9a43a).setStrokeStyle(2, 0x5a3418).setDepth(4).setName('chest:' + o.name);
    } else if (o.type === 'ferry' && this.textures.exists('prop_ferry_boat')) {
      // 落霞镇的 y 是甲板面，其他停靠点的 y 是船底；图片只做演出。
      const boat = this.add.sprite(o.x + o.w / 2, o.y + (this.map.id === 'luoxia_town' ? 96 : 0), 'prop_ferry_boat')
        .setOrigin(0.5, 1).setDepth(3).setName(`ferry:${o.name}`);
      if (this.anims.exists('prop_ferry_boat_idle')) boat.play('prop_ferry_boat_idle');
    } else if (o.type === 'seclusion') {
      this.seclusionLabels.push(this.add.text(o.x, o.y - 48, featureEnabled('seclusion') ? '闭关室 ↑' : FEATURE_UNAVAILABLE,
        { fontSize: '13px', color: '#fff8d0', stroke: '#3b2a20', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(4));
    }
  }

  /** G7/G8：等级先判；locked 永久关闭；任务须已完成；目标地图须已注册。 */
  private portalStatusLabel(o: MapObj, text: string) {
    return this.add.text(o.x, o.y - 92, text,
      { fontSize: '13px', color: '#fff8d0', stroke: '#3b2a20', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(4);
  }

  portalOpen(o: { props: any }) {
    if (!mapEntryOpen(o.props.target, this.map.id)) return false;
    if (this.prog.level < Number(o.props.reqLevel ?? 0)) return false;
    if (o.props.locked) return false;
    if (o.props.unlockQuest && this.quests.state(o.props.unlockQuest) !== 'done') return false;
    const tgt = o.props.target;
    return !!tgt && (!!TILED_MAPS[tgt] || tgt === 'field_test');
  }

  tryInteract(): boolean {
    if (this.travelling) return true;
    const p = this.player;
    for (const o of this.map.objects) {
      const nearX = o.type === 'ferry' && o.w > 0 ? p.x >= o.x - 28 && p.x <= o.x + o.w + 28 : Math.abs(o.x - p.x) <= 28;
      if (!nearX || Math.abs(o.y - p.y) > 40) continue;
      if (this.trialObjects?.interact(o)) return true;
      if (o.type === 'portal') {
        if (!mapEntryOpen(o.props.target, this.map.id)) { this.log(FEATURE_UNAVAILABLE, '#aaaaaa'); return true; }
        if (this.prog.level < Number(o.props.reqLevel ?? 0)) { this.log(t('sys.portal_level', { lv: o.props.reqLevel }), '#aaaaaa'); return true; }
        if (!this.portalOpen(o)) { this.log(t('sys.portal_locked'), '#aaaaaa'); return true; }
        this.travelToMap(o.props.target, o.props.targetPortal);
        return true;
      }
      if (o.type === 'ferry') {
        if (o.props.returnTo) this.travelToMap(o.props.returnTo, o.props.targetPortal, true);
        else if (o.props.npc) this.talkTo(o.props.npc);
        return true;
      }
      if (o.type === 'seclusion') {
        this.offerSeclusion(o);
        return true;
      }
      if (o.type === 'npc') { this.talkTo(o.props.npc ?? o.name); return true; }
    }
    return false;
  }

  private interactTrialObject() {
    for (const o of this.map.objects) {
      if (Math.abs(o.x - this.player.x) <= 40 && Math.abs(o.y - this.player.feet) <= 48
        && this.trialObjects?.interact(o)) return true;
    }
    return false;
  }

  private travelToMap(map: string, portal?: string, returning = false, onCancelled?: () => void) {
    if (!mapEntryOpen(map, this.map.id, returning)) { onCancelled?.(); this.log(FEATURE_UNAVAILABLE, '#aaaaaa'); return; }
    if (!TILED_MAPS[map] && map !== 'field_test') { onCancelled?.(); this.log(t('sys.portal_locked'), '#aaaaaa'); return; }
    if (this.travelling) { onCancelled?.(); return; }
    this.travelling = true;
    this.player.body.setVelocityX(0);
    this.prog.save();
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(220, () => {
      if (!mapEntryOpen(map, this.map.id, returning)) {
        onCancelled?.();
        this.travelling = false; this.cameras.main.fadeIn(100); this.log(FEATURE_UNAVAILABLE, '#aaaaaa'); return;
      }
      this.scene.restart({ map, portal });
    });
  }

  /** 配表选项确认后逐年结算；退出对白不消耗资源。 */
  private offerSeclusion(o: MapObj) {
    if (!this.requireFeature('seclusion')) return;
    this.player.body.setVelocityX(0);
    const seclusion = new Seclusion(this.prog);
    if (seclusion.locked(o.props)) {
      const text = t('sys.seclusion_locked'); this.log(text, '#ffe680');
      this.dialog.show([{ speaker: null, text }], null); return;
    }
    const costs = SECT_SECLUSION.options.map(years => t('sys.seclusion_cost', {
      years, cost: SECT_SECLUSION.contributionCost[String(years)], have: this.prog.sectContribution,
    }));
    this.dialog.choose({ speaker: null, text: costs.join('\n') }, null, [
      ...SECT_SECLUSION.options.map(years => ({ label: `闭关 ${years} 年`, onSelect: () => this.completeSeclusion(o, years) })),
      { label: t('ui.dialog.close'), onSelect: () => {} },
    ]);
  }

  private completeSeclusion(o: MapObj, years: number) {
    if (!this.requireFeature('seclusion')) return;
    const result = new Seclusion(this.prog).settle(o.props, years);
    if (!result.ok) {
      const vars = { years, cost: SECT_SECLUSION.contributionCost[String(years)], have: this.prog.sectContribution,
        used: this.prog.seclusionDay === realDay() ? this.prog.seclusionYearsToday : 0, max: SECT_SECLUSION.maxYearsPerRealDay };
      const text = result.reason === 'closed' ? FEATURE_UNAVAILABLE : t(result.reason === 'locked' ? 'sys.seclusion_locked' : result.reason === 'daily'
        ? 'sys.seclusion_daily' : result.reason === 'life' ? 'sys.seclusion_life' : 'sys.seclusion_cost', vars);
      this.log(text, '#ffe680'); this.dialog.show([{ speaker: null, text }], null); return;
    }
    this.applyExp(result);
    this.log(t('sys.seclusion_done', { years: result.years, cost: result.cost, exp: result.gained,
      overflow: result.overflowed, age: Math.floor(this.prog.age) }), '#ffe680');
    if (this.prog.remainingLife <= LIFESPAN.warnAtRemaining) this.log(t('sys.lifespan_warn', { years: Math.floor(this.prog.remainingLife) }), '#ffb0b0');
  }

  // ---------------- NPC 对话与任务 ----------------
  nearNpc(): string | null {
    const p = this.player;
    for (const o of this.map.objects) if (o.type === 'npc' && Math.abs(o.x - p.x) < 40 && Math.abs(o.y - p.y) < 48) return o.props.npc ?? o.name;
    return null;
  }

  talkNearby() {
    const hasDrop = this.hasNearbyDrop();
    const id = hasDrop ? null : this.nearNpc();
    if (!id) return false;
    this.talkTo(id); return true;
  }

  talkTo(npcId: string, questId?: string, skipMenu = false) {
    const npc = NPCS[npcId]; if (!npc) return;
    if (this.trial || this.map.trial || TRIAL_BY_MAP[this.map.id]) return;   // 试炼图里的长老虚影只护法，不对话
    if (npcId === 'ferry_master') {
      // 航线菜单也算与船老大交谈，供幽影宗问讯日常记录目标。
      this.quests.onTalk(npcId);
      this.player.body.setVelocityX(0);
      this.dialog.choose({ speaker: npc.name, text: npc.dialog[0] ?? '' }, npc.sprite, [
        ...(npc.ferryRoutes ?? []).map(route => {
          const reason = ferryLockedReason(route, this.prog);
          const label = `${t(route.label)}${route.cost > 0 ? `（${route.cost} ${t('ui.stone')}）` : ''}`;
          return { label, disabled: !!reason, reason, onSelect: () => {
            const locked = ferryLockedReason(route, this.prog);
            if (locked) { this.log(locked, '#aaaaaa'); return; }
            if (this.travelling) return;
            this.prog.stones -= route.cost;
            this.travelToMap(route.targetMap, route.targetPortal ?? undefined, false, () => {
              this.prog.stones += route.cost; this.prog.save();
            });
          } };
        }),
        { label: t('ui.dialog.close'), onSelect: () => {} },
      ]);
      return;
    }
    const dailyIds = this.quests.npcDailyQuestIds(npcId);
    const services = this.sectGrowth.services(npcId).filter(service => featureEnabled(service.type === 'sect_promotion'
      ? 'sectRanks' : service.type === 'sect_donation' ? 'sectDonations' : 'sectShopLibrary'));
    const ordinaryShop = this.sectGrowth.ordinaryCatalog(npcId);
    if (!questId && !skipMenu && (dailyIds.length || services.length || ordinaryShop.entries.length)) {
      this.player.body.setVelocityX(0);
      const ordinaryIds = this.quests.npcQuestIds(npcId).filter(id => QUESTS_REF[id] && !QUESTS_REF[id].daily
        && (this.quests.available(id) || this.quests.isActive(id)));
      const menuTitle = t(dailyIds.length ? 'ui.quests' : services.length ? 'sect.ui.title' : 'ui.shop.menu');
      this.dialog.choose({ speaker: npc.name, text: services.length ? `${this.sectOverview()}\n${menuTitle}` : menuTitle }, npc.sprite, [
        ...dailyIds.map(id => {
          const q = QUESTS_REF[id], state = this.quests.state(id);
          const disabled = !this.quests.isActive(id) && !this.quests.available(id);
          return { label: questName(q), disabled,
            reason: disabled ? state === 'done' ? t('quest.complete', { name: questName(q) }) : t('sect.ui.config_pending') : questDescription(q),
            onSelect: () => this.talkTo(npcId, id) };
        }),
        ...ordinaryIds.map(id => ({ label: questName(QUESTS_REF[id]), onSelect: () => this.talkTo(npcId, id) })),
        ...services.map(service => ({ label: t(service.type === 'sect_promotion' ? 'sect.promotion.menu'
          : service.type === 'sect_library' ? 'sect.library.menu' : service.type === 'sect_donation' ? 'sect.donation.menu' : 'sect.shop.menu'),
          reason: service.allowed ? undefined : t(service.key),
          onSelect: () => service.type === 'sect_promotion' ? this.openSectPromotion(npcId)
            : service.type === 'sect_donation' ? this.openSectDonations(npcId) : this.openSectCatalog(npcId, service.type) })),
        ...(ordinaryShop.entries.length ? [{ label: t('ui.shop.menu'), onSelect: () => this.openOrdinaryShop(npcId) }] : []),
        ...(!dailyIds.length ? [{ label: t('ui.dialog.next'), onSelect: () => this.talkTo(npcId, undefined, true) }] : []),
        { label: t('ui.dialog.close'), onSelect: () => {} },
      ], services.length ? this.sectRankBadgeKey() : undefined);
      return;
    }
    const offer = !questId ? this.trialOfferFor(npcId) : null;
    if (offer) { this.offerTrial(npcId, offer); return; }
    const talked = this.quests.talk(npcId, questId);
    const after = talked.after;
    // 任务没有对白脚本时，用 NPC 的通用台词兜底
    const intro = this.quests.isActive('q_alchemy_intro') || this.quests.available('q_alchemy_intro');
    const lines = talked.lines.length ? talked.lines : npcId === 'doctor_sun' && intro ? [
      { speaker: npc.name, text: '你如今入了炼气，该学学炼丹了。修仙路上，丹药就是半条命。' },
      { speaker: npc.name, text: '可先试炼回春丹：每炉用灵草二株、灵兔绒一份、灵石十枚。交付入门任务时，还须留足三株灵草。丹炉可在我这里用，学成后再送你。' },
    ] : npc.dialog.map(tx => ({ speaker: npc.name, text: tx }));
    this.player.body.setVelocityX(0);
    this.dialog.show(lines, npc.sprite, () => {
      const r = after?.();
      if (r) {
        this.giveRewards(r.quest, r.broke, r.daily);
        const ut = (r.quest.rewards as { unlockTrial?: string }).unlockTrial;
        if (ut && TRIALS[ut]) this.time.delayedCall(150, () => { const o = this.trialOfferFor(npcId); if (o) this.offerTrial(npcId, o); });
      }
      else if (after && (!questId || this.quests.isActive(questId))) this.log(t('quest.accept', {
        name: questId ? questName(QUESTS_REF[questId]) : this.quests.activeIds.map(i => questName(QUESTS_REF[i])).slice(-1)[0] ?? '',
      }), '#ffe680');
      this.prog.save();
      if (npcId === 'doctor_sun' && this.quests.state('q_alchemy_intro')) this.openAlchemy('bronze_furnace');
    }, (cue, next) => this.playCue(cue, next));
  }

  private sectOverview() {
    const identity = this.sectGrowth.identity();
    return [featureEnabled('sectRanks') && identity?.title ? t('sect.ui.rank', { title: identity.title }) : '',
      t('sect.ui.contribution', { contribution: this.prog.sectContribution })].filter(Boolean).join('\n');
  }

  /** 只读取现有身份与职位表；无效身份不展示当前或目标职位徽记。 */
  private sectRankBadgeKey(rankId?: string) {
    if (!featureEnabled('sectRanks')) return undefined;
    const identity = this.sectGrowth.identity();
    if (!identity?.valid) return undefined;
    return rankId ? this.sectGrowth.config.ranks.ranks.find(rank => rank.id === rankId)?.icon : identity.icon;
  }

  openSectPromotion(npcId: string) {
    if (!this.requireFeature('sectRanks', npcId)) return;
    const npc = NPCS[npcId]; if (!npc) return;
    const offer = this.sectGrowth.promotion(npcId);
    const conditions = typeof offer.requiredContribution === 'number' && Number.isInteger(offer.requiredContribution) && offer.requiredRealmName
      ? t('sect.ui.requirements', { contribution: offer.requiredContribution, realm: offer.requiredRealmName }) : '';
    const reason = [conditions, conditions ? t('sect.ui.promotion_free') : '',
      offer.ok && offer.dialogueKeys?.offer ? t(offer.dialogueKeys.offer) : t(offer.key)].filter(Boolean).join('\n');
    this.dialog.choose({ speaker: npc.name, text: this.sectOverview() || t('sect.ui.title') }, npc.sprite, [
      { label: offer.targetRankName ? `${t('sect.ui.confirm')}（${offer.targetRankName}）` : t('sect.ui.confirm'), rankIcon: offer.target ? this.sectRankBadgeKey(offer.target) : undefined,
        disabled: !offer.ok, reason, onSelect: () => {
          if (!this.requireFeature('sectRanks', npcId)) return;
          const target = offer.target; if (!target) return;
          const transactionId = newSectTransactionId();
          const promote = (acceptOath = false) => {
            if (!this.requireFeature('sectRanks', npcId)) return;
            const result = this.sectGrowth.promote(npcId, target, transactionId, acceptOath);
            this.sectResult(npcId, result, {});
          };
          if (offer.mode === 'oath') {
            const keys = offer.dialogueKeys;
            this.dialog.choose({ speaker: npc.name, text: keys?.question ? t(keys.question) : t('sect.ui.config_pending') }, npc.sprite, [
              { label: keys?.accept ? t(keys.accept) : t('sect.ui.confirm'), rankIcon: this.sectRankBadgeKey(target), onSelect: () => promote(true) },
              { label: keys?.defer ? t(keys.defer) : t('sect.ui.cancel'), onSelect: () => {} },
            ], this.sectRankBadgeKey(target));
          } else promote();
        } },
      { label: t('sect.ui.cancel'), onSelect: () => {} },
    ], this.sectRankBadgeKey());
  }

  openSectCatalog(npcId: string, service: 'sect_shop' | 'sect_library') {
    if (!this.requireFeature('sectShopLibrary', npcId)) return;
    const npc = NPCS[npcId]; if (!npc) return;
    const catalog = this.sectGrowth.catalog(npcId, service);
    const prefix = service === 'sect_library' ? 'sect.library' : 'sect.shop';
    const rankOrder = this.sectGrowth.config.ranks.rules.rankOrder;
    const entries = [...catalog.entries].sort((a, b) => rankOrder.indexOf(a.reqRank) - rankOrder.indexOf(b.reqRank));
    const choices: DialogChoice[] = entries.map(entry => {
      const preview = entry.costContribution !== null
        ? t(`${prefix}.confirm`, { contribution: entry.costContribution, item: entry.name }) : '';
      const rankLabel = rankOrder.includes(entry.reqRank) ? entry.rankName : '';
      return { label: rankLabel ? `${entry.name}（${rankLabel}）` : entry.name, rankIcon: rankLabel ? this.sectRankBadgeKey(entry.reqRank) : undefined, disabled: !entry.ok,
        reason: [preview, entry.ok ? '' : t(entry.key, { rank: entry.rankName })].filter(Boolean).join('\n'),
        onSelect: () => {
          if (!this.requireFeature('sectShopLibrary', npcId)) return;
          const transactionId = newSectTransactionId();
          this.dialog.choose({ speaker: npc.name, text: this.sectOverview() }, npc.sprite, [
            { label: t('sect.ui.confirm'), rankIcon: rankLabel ? this.sectRankBadgeKey(entry.reqRank) : undefined, reason: preview, onSelect: () => {
              if (!this.requireFeature('sectShopLibrary', npcId)) return;
              const current = this.sectGrowth.catalog(npcId, service).entries.find(row => row.itemId === entry.itemId);
              if (current && (current.costContribution !== entry.costContribution || current.reqRank !== entry.reqRank)) {
                this.openSectCatalog(npcId, service); return;
              }
              const result = this.sectGrowth.exchange(npcId, service, entry.itemId, transactionId);
              this.sectResult(npcId, result, { item: entry.name });
            } },
            { label: t('sect.ui.cancel'), onSelect: () => this.openSectCatalog(npcId, service) },
          ], this.sectRankBadgeKey());
        } };
    });
    if (!choices.length) choices.push({ label: t(catalog.key || 'sect.ui.config_pending'), disabled: true, onSelect: () => {} });
    choices.push({ label: t('ui.dialog.close'), onSelect: () => {} });
    this.dialog.choose({ speaker: npc.name, text: `${this.sectOverview()}\n${t(`${prefix}.menu`)}` }, npc.sprite, choices, this.sectRankBadgeKey());
  }

  openOrdinaryShop(npcId: string) {
    const npc = NPCS[npcId]; if (!npc) return;
    const catalog = this.sectGrowth.ordinaryCatalog(npcId);
    const choices: DialogChoice[] = catalog.entries.map(entry => {
      const preview = t('ui.shop.confirm', { item: entry.name, price: entry.price });
      return { label: entry.name, disabled: !entry.ok, reason: entry.ok ? preview : t(entry.key), onSelect: () => {
        const transactionId = newSectTransactionId();
        this.dialog.choose({ speaker: npc.name, text: preview }, npc.sprite, [
          { label: t('sect.ui.confirm'), reason: preview, onSelect: () => {
            const current = this.sectGrowth.ordinaryCatalog(npcId).entries.find(row => row.itemId === entry.itemId);
            if (current && current.price !== entry.price) { this.openOrdinaryShop(npcId); return; }
            this.sectResult(npcId, this.sectGrowth.buyOrdinary(npcId, entry.itemId, transactionId), { item: entry.name });
          } },
          { label: t('sect.ui.cancel'), onSelect: () => this.openOrdinaryShop(npcId) },
        ]);
      } };
    });
    if (!choices.length) choices.push({ label: t(catalog.key || 'sect.ui.config_pending'), disabled: true, onSelect: () => {} });
    choices.push({ label: t('ui.dialog.close'), onSelect: () => {} });
    this.dialog.choose({ speaker: npc.name, text: t('ui.shop.menu') }, npc.sprite, choices);
  }

  openSectDonations(npcId: string) {
    if (!this.requireFeature('sectDonations', npcId)) return;
    const npc = NPCS[npcId]; if (!npc) return;
    const catalog = this.sectGrowth.donations(npcId);
    const warning = t('sect.donation.quest_warning');
    const choices: DialogChoice[] = catalog.entries.map(entry => {
      const values = { item: entry.name, count: entry.count, contribution: entry.contribution };
      const preview = t('sect.donation.confirm', values);
      const remaining = t('sect.donation.remaining', { remaining: entry.remaining });
      const reason = [preview, remaining, warning, entry.ok ? '' : t(entry.key, { rank: entry.rankName })].filter(Boolean).join('\n');
      return { label: `${entry.name}（${entry.rankName}）`, rankIcon: this.sectRankBadgeKey(entry.reqRank), disabled: !entry.ok, reason,
        onSelect: () => {
          if (!this.requireFeature('sectDonations', npcId)) return;
          // 一次预览绑定一次确认；缓存回调重试继续使用同一事务和日界。
          const transactionId = newSectTransactionId(), previewDay = entry.day;
          this.dialog.choose({ speaker: npc.name, text: `${this.sectOverview()}\n${reason}` }, npc.sprite, [
            { label: t('sect.ui.confirm'), rankIcon: this.sectRankBadgeKey(entry.reqRank), reason, onSelect: () => {
              if (!this.requireFeature('sectDonations', npcId)) return;
              const current = this.sectGrowth.donations(npcId).entries.find(row => row.offerId === entry.offerId);
              if (current && (current.itemId !== entry.itemId || current.count !== entry.count
                || current.contribution !== entry.contribution || current.reqRank !== entry.reqRank)) {
                this.openSectDonations(npcId); return;
              }
              const result = this.sectGrowth.donate(npcId, entry.offerId, transactionId, previewDay);
              if (result.key === 'sect.donation.day_changed') {
                this.dialog.show([{ speaker: npc.name, text: t(result.key) }], npc.sprite, () => this.openSectDonations(npcId));
                return;
              }
              this.sectResult(npcId, result, values);
            } },
            { label: t('sect.ui.cancel'), onSelect: () => this.openSectDonations(npcId) },
          ], this.sectRankBadgeKey());
        } };
    });
    if (!choices.length) choices.push({ label: t(catalog.key || 'sect.ui.config_pending'), disabled: true, onSelect: () => {} });
    choices.push({ label: t('ui.dialog.close'), onSelect: () => {} });
    this.dialog.choose({ speaker: npc.name, text: `${this.sectOverview()}\n${t('sect.donation.menu')}\n${warning}` }, npc.sprite, choices, this.sectRankBadgeKey());
  }

  private sectResult(npcId: string, result: { ok: boolean; key: string; repeated?: boolean }, vars: Record<string, string | number>) {
    const text = t(result.key, { ...vars, title: this.sectGrowth.identity()?.title ?? '' });
    const rankIcon = result.key.startsWith('sect.promotion.') ? this.sectRankBadgeKey() : undefined;
    if (result.ok && !result.repeated) this.log(text, '#ffd23a', rankIcon);
    const npc = NPCS[npcId];
    this.dialog.show([{ speaker: npc?.name ?? null, text }], npc?.sprite ?? null, undefined, undefined, rankIcon);
  }

  applyExp(r: { gained: number; levels: number; blocked: boolean; overflowed?: number; overflowFilled?: boolean }) {
    if (r.gained > 0) this.log(t('sys.exp_gain', { exp: r.gained }), '#ffe680');
    if ((r.overflowed ?? 0) > 0) this.log(`${t('sys.exp_gain', { exp: r.overflowed ?? 0 })}${t('realm.overflow_gain')}`, '#9a9a9a');
    if (r.overflowFilled) this.log(t('realm.overflow_full'), '#ffb0ff');
    if (r.levels) {
      this.levelUpFx(); this.log(t('sys.level_up', { level: this.prog.level }), '#7fffd4');
      this.player.maxHp = this.prog.maxHp; this.player.hp = this.prog.hp; this.prog.save();
      this.maybeSpTip();
    }
    if (r.blocked) {
      if (r.gained === 0) this.log(t('realm.bottleneck'), '#ffb0ff');
      if (!this.breakthroughNotified) { this.breakthroughNotified = true; this.log(t('realm.bottleneck_tip', { realm: this.prog.realm.name, npc: '天剑宗接引使' }), '#ffb0ff'); }
    }
  }

  giveRewards(q: typeof QUESTS_REF[string], broke: boolean, daily?: DailyQuestReward) {
    // 日常由 QuestSystem 完整结算并保存；没有本次收据时不走普通任务发奖路径。
    if (q.daily) {
      if (!daily) return;
      this.log(t('quest.complete', { name: questName(q) }), '#ffe680');
      this.applyExp(daily.exp);
      if (q.rewards.spiritStone) this.log(t('sys.stone_gain', { n: q.rewards.spiritStone }), '#7ff0d0');
      for (const it of daily.items) this.log(t('sys.item_gain', { item: ITEMS[it.item]?.name ?? it.item, n: it.count }), '#ffffff');
      for (const id of daily.skills) this.log(t('skill.learned', { skill: SKILLS[id]?.name ?? id }), '#9fd0ff');
      this.log(t('sect.ui.contribution', { contribution: this.prog.sectContribution }), '#ffd23a');
      this.player.syncAppearance(); this.skillWindow.refresh();
      this.player.maxHp = this.prog.maxHp; this.player.hp = this.prog.hp;
      this.maybeSpTip();
      return;
    }
    const rw = q.rewards;
    const cls = classForQuest(q.id);
    // 新角色在正式拜入任务交付时定宗；旧档已有剑徒由 Progress.load 保留。
    const job = cls?.id ?? (q.id === 'q_fox' ? undefined : rw.job);
    if (job && !this.prog.advanceClass(job)) return;
    this.log(t('quest.complete', { name: questName(q) }), '#ffe680');
    if (broke) {
      this.player.maxHp = this.prog.maxHp; this.player.hp = this.prog.hp;
      this.log(`突破成功，当前境界 ${this.prog.realmName}`, '#ffb0ff');
      if (this.prog.lastOverflowReturned > 0) this.log(`溢出修为返还 ${this.prog.lastOverflowReturned}`, '#c8c8c8');
      if (this.prog.breakthroughBonusLevels > 0) { this.levelUpFx(); this.log(t('sys.level_up', { level: this.prog.level }), '#7fffd4'); }
    }
    if (rw.exp) this.applyExp(this.prog.gainExp(rw.exp, this.prog.level));
    if (rw.spiritStone) { this.prog.stones += rw.spiritStone; this.log(`获得灵石 ${rw.spiritStone}`, '#7ff0d0'); }
    for (const it of rw.items ?? []) {
      // advanceClass 已按拜入奖励发本宗道袍并换装。
      if (it.item === cls?.robeId) continue;
      if (ITEMS[it.item]?.type === 'equip') { const on = this.prog.gainEquip(it.item); this.player.syncAppearance(); this.log(`获得 ${ITEMS[it.item].name}${on ? '（已自动装备）' : ''}`, '#9fd0ff'); }
      else { this.prog.addItem(it.item, it.count); this.log(`获得 ${ITEMS[it.item]?.name ?? it.item} ×${it.count}`, '#ffffff'); }
    }
    const granted = rw.skills ?? [];
    this.prog.grantQuestRecipes(q);
    for (const s of granted) this.prog.grantSkill(s.id, s.level);
    const ids = granted.map(s => s.id);
    if (job && ids.includes('whirl_sword') && ids.includes('light_body')) this.log(t('skill.job_advance'), '#ffd23a');
    else if (ids.includes('sword_qi_slash')) this.log(t('skill.learned_first'), '#9fd0ff');
    else for (const id of ids) this.log(t('skill.learned', { skill: SKILLS[id]?.name ?? id }), '#9fd0ff');
    if (job && !(ids.includes('whirl_sword') && ids.includes('light_body'))) this.log(`拜入${cls?.name ?? job}，已学本宗一转功法`, '#ffd23a');
    this.player.syncAppearance();
    this.skillWindow.refresh();
    this.player.maxHp = this.prog.maxHp; this.player.hp = this.prog.hp;
    this.maybeSpTip();
    this.prog.save();
  }

  /** 突破失败演出（v0.4 筑基台用）：同样放在 dim 层上方 */
  playBreakthroughFail(x: number, y: number) {
    if (!this.textures.exists('fx_breakthrough_fail')) return;
    const fx = this.add.sprite(x, y, 'fx_breakthrough_fail').setOrigin(0.5, 1).setDepth(165);
    fx.play('fx_breakthrough_fail_play'); fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
  }

  tryAddPoint(id: string) {
    const r = this.prog.addSkillPoint(id);
    if (r.ok) this.log(t('skill.sp_left', { n: this.prog.spLeftFor(1) }), '#ffe680');
    else if (r.reason === 'req') this.log(t('skill.req_block', { req: r.req || '前置不足' }), '#ffb0b0');
    else if (r.reason === 'sp') this.log(t('skill.no_sp'), '#ffb0b0');
    else if (r.reason === 'max') this.log(t('skill.maxed'), '#ffb0b0');
    else if (r.reason === 'locked') this.log(t('skill.locked'), '#ffb0b0');
    this.skillWindow.refresh();
  }

  maybeSpTip() {
    if (this.prog.spTipShown || this.prog.spLeftFor(1) <= 0) return;
    this.prog.spTipShown = true;
    this.log(t('tip.first_sp'), '#ffe680');
    this.prog.save();
  }

  /** 自然回蓝：每 5 秒最大灵力 × MP_REGEN_FRACTION_PER_5S，再加上被动的 mpRegenPer10s。 */
  private regenMp(deltaMs: number) {
    const pr = this.prog;
    if (this.player.dead) return;
    if (pr.mp >= pr.maxMp) { pr.mp = pr.maxMp; this.mpPool = 0; return; }
    const perMs = pr.maxMp * MP_REGEN_FRACTION_PER_5S / 5000 + pr.passiveBonus('mpRegenPer10s') / 10000;
    this.mpPool += perMs * deltaMs;
    if (this.mpPool >= 1) {
      const add = Math.floor(this.mpPool);
      this.mpPool -= add;
      pr.mp = Math.min(pr.maxMp, pr.mp + add);
    }
  }

  /** 演出：突破 / 转职 */
  playCue(cue: string, next: () => void, title?: string) {
    const p = this.player, cam = this.cameras.main;
    const dim = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0).setScrollFactor(0).setDepth(150);
    this.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 400 });
    if (p.atlas) p.play(p.animationKey('sit'));
    // 主角和突破特效都要在 dim 层（150）上方，否则会被一起压暗：back 155 < 主角 158 < front 165
    const pDepth = p.depth; p.setDepth(158);
    if (cue === 'breakthrough' && this.textures.exists('fx_breakthrough_success')) {
      // front_07 爆光对准 1900ms 的闪白：8fps 下第 7 帧在 750ms，所以 1150ms 开播
      this.time.delayedCall(1150, () => {
        for (const [layer, d] of [['back', 155], ['front', 165]] as const) {
          const fx = this.add.sprite(p.x, p.y, 'fx_breakthrough_success').setOrigin(0.5, 1).setDepth(d);
          fx.play('fx_breakthrough_success_' + layer); fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
        }
      });
    }
    const col = cue === 'breakthrough' ? 0xfff0a0 : 0x9fe8ff;
    for (let i = 0; i < 24; i++) {                       // 灵气从四周汇入
      const a = (i / 24) * Math.PI * 2, r = 220;
      const dot = this.add.circle(p.x + Math.cos(a) * r, p.y - 40 + Math.sin(a) * r, 5, col).setDepth(160).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: dot, x: p.x, y: p.y - 40, alpha: 0.2, delay: i * 40, duration: 900, onComplete: () => dot.destroy() });
    }
    this.time.delayedCall(1900, () => {
      cam.flash(400, 255, 240, 180);
      const ring = this.add.circle(p.x, p.y - 40, 30, col, 0.7).setDepth(160).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: ring, scale: 8, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
      const t = this.add.text(640, 260, title ?? (cue === 'breakthrough' ? '突破成功 · 炼气期' : '拜入天剑宗 · 剑徒'), { fontFamily: 'serif', fontSize: '44px', color: '#fff6c8', stroke: '#7a4a00', strokeThickness: 6 }).setOrigin(0.5).setScrollFactor(0).setDepth(170).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, y: 240, duration: 500, hold: 1200, yoyo: true, onComplete: () => {
        t.destroy(); this.tweens.add({ targets: dim, fillAlpha: 0, duration: 300, onComplete: () => { dim.destroy(); p.setDepth(pDepth); next(); } });
      } });
    });
  }

  /** reach 目标：走到对应地图物件附近就算到达 */
  checkReach() {
    const p = this.player;
    for (const o of this.map.objects) if (o.type === 'chest' && Math.abs(o.x - p.x) < 48 && Math.abs(o.y - p.y) < 48) this.quests.onReach(o.name);
  }

  tryOpenChest() {
    const p = this.player;
    for (const o of this.map.objects) {
      if (o.type !== 'chest' || Math.abs(o.x - p.x) > 32 || Math.abs(o.y - p.y) > 40) continue;
      const key = `${this.map.id}:${o.name}`;
      if (this.openedChests.has(key)) return;
      this.openedChests.add(key);
      (this.children.getByName('chest:' + o.name) as Phaser.GameObjects.Rectangle)?.setFillStyle(0x7a5a3a);
      this.spawnDrop(o.x, o.y - 30, o.props.loot, o.props.count ?? 1);
      return;
    }
  }

  // ---------------- 表现 ----------------
  log(msg: string, color: string, rankIcon?: string) {
    const hist = ((window as any).__logs ??= []) as string[]; hist.push(msg); if (hist.length > 100) hist.shift();   // 测试读系统消息
    const badge = sectRankIcon(this, rankIcon);
    const t = this.add.text(badge ? 42 : 16, 0, msg, { fontFamily: 'sans-serif', fontSize: '14px', color, stroke: '#000000', strokeThickness: 3 }).setOrigin(0, 1).setScrollFactor(0).setDepth(102);
    const image = badge ? this.add.image(26, 0, badge.texture, badge.frame).setName('sect-rank-log').setDisplaySize(20, 20).setScrollFactor(0).setDepth(102) : undefined;
    if (image) {
      this.logBadges.set(t, image);
      t.once(Phaser.GameObjects.Events.DESTROY, () => { image.destroy(); this.logBadges.delete(t); });
    }
    this.logs.push(t);
    if (this.logs.length > 6) this.logs.shift()!.destroy();
    const base = this.hudKit ? 596 : 668;   // 新 HUD 状态区从 y=604 开始，系统消息挪到它上面
    this.logs.forEach((l, i) => {
      l.setY(base - (this.logs.length - 1 - i) * 20);
      this.logBadges.get(l)?.setY(l.y - l.height / 2);
    });
    this.time.delayedCall(4000, () => { this.tweens.add({ targets: image ? [t, image] : t, alpha: 0, duration: 400, onComplete: () => { this.logs = this.logs.filter(x => x !== t); t.destroy(); } }); });
  }

  levelUpFx() {
    const t = this.add.text(this.player.x, this.player.y - 100, 'LEVEL UP', { fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#fff27a', stroke: '#8a5a00', strokeThickness: 5 }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 1500, onComplete: () => t.destroy() });
    const ring = this.add.circle(this.player.x, this.player.y - 30, 20, 0xfff27a, 0.5).setDepth(9);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
  }

  damageNumber(x: number, y: number, n: number, color: string, stroke: string) {
    // 位图字：玩家受伤用朱红，其余用伤害白（只含 0–9、+、升级）
    const font = color === '#c45cff' ? 'ui_hud_font_hurt' : 'ui_hud_font_white';
    if (this.cache.bitmapFont.exists(font)) {
      const bt = this.add.bitmapText(x, y, font, String(n)).setOrigin(0.5).setDepth(50);
      this.tweens.add({ targets: bt, y: y - 40, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => bt.destroy() });
      return;
    }
    const t = this.add.text(x, y, String(n), { fontFamily: 'Arial Black, sans-serif', fontSize: '24px', color, stroke, strokeThickness: 4 }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  puff(x: number, y: number) {
    const c = this.add.circle(x, y, 10, 0xffffff, 0.8).setDepth(9);
    this.tweens.add({ targets: c, scale: 2.5, alpha: 0, duration: 250, onComplete: () => c.destroy() });
  }

  /** 掉落图标键：配表 icon，灵石固定 icon_spirit_stone；图集里没有就返回 null（退回色块） */
  dropIcon(id: string): string | null {
    const key = id === 'spirit_stone' ? 'icon_spirit_stone' : ITEMS[id]?.icon;
    return key && this.textures.exists('icons_items') && this.textures.get('icons_items').has(key) ? key : null;
  }

  /** 落地：停掉物理，影子贴地不动，图标上下浮动 */
  landDrop(d: Drop) {
    d.landed = true;
    const b = d.body as Phaser.Physics.Arcade.Body;
    b.setVelocity(0, 0); b.setAllowGravity(false); b.moves = false;
    d.shadow!.setPosition(d.x, d.y).setVisible(true);
    d.floatTw = this.tweens.add({ targets: d, y: d.y - DROP_FLOAT.px, duration: DROP_FLOAT.periodMs / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  removeDrop(d: Drop) { d.label?.destroy(); d.floatTw?.stop(); d.shadow?.destroy(); d.destroy(); }

  dropTex(id: string) {
    const key = id === 'spirit_stone' ? 'drop_stone' : 'drop_' + (ITEMS[id]?.type ?? 'misc');
    if (this.textures.exists(key)) return key;
    const g = this.make.graphics({}, false);
    if (id === 'spirit_stone') {
      g.fillStyle(0x7ff0d0).fillTriangle(8, 0, 16, 8, 8, 16).fillTriangle(8, 0, 0, 8, 8, 16).lineStyle(1, 0x2a8f7a).strokeTriangle(8, 0, 16, 8, 8, 16).strokeTriangle(8, 0, 0, 8, 8, 16);
    } else {
      const col = ({ consume: 0xff6a6a, equip: 0x6aa8ff, material: 0xe0c070 } as Record<string, number>)[ITEMS[id]?.type ?? ''] ?? 0xcccccc;
      g.fillStyle(col).fillRoundedRect(1, 1, 14, 14, 4).lineStyle(2, 0x333333).strokeRoundedRect(1, 1, 14, 14, 4);
    }
    g.generateTexture(key, 16, 16); g.destroy();
    return key;
  }

  /** 精修 HUD（art/icons/ui/hud/README 建议布局，1280×720）。必需件缺任何一个就整套退回代码绘制 */
  buildHudKit() {
    const need = ['ui_hud_panel', 'ui_hud_bar_frame', 'ui_hud_bar_hp', 'ui_hud_bar_mp', 'ui_bar_cultivation_frame', 'ui_bar_cultivation'];
    if (!need.every(k => hasHud(this, k))) return;
    const D = 100;
    const panel = sliced(this, 'ui_hud_panel', 16, 604, 400, 88)!.setDepth(D);
    const lv = hudText(this, 28, 616, 14, { fontStyle: 'bold' }).setDepth(D + 2);
    const info = hudText(this, 404, 618, 12, { color: INK_60 }).setOrigin(1, 0).setDepth(D + 2);
    hudText(this, 28, 650, 12).setText('气血').setOrigin(0, 0.5).setDepth(D + 2);
    hudText(this, 28, 674, 12).setText('灵力').setOrigin(0, 0.5).setDepth(D + 2);
    const hp = new HudBar(this, 'ui_hud_bar_frame', 'ui_hud_bar_hp', 64, 640, 340, 20, D + 1);
    const mp = new HudBar(this, 'ui_hud_bar_frame', 'ui_hud_bar_mp', 64, 664, 340, 20, D + 1);
    const num = (x: number, y: number) => hudText(this, x, y, 12, { color: '#ffffff', stroke: INK, strokeThickness: 2 }).setOrigin(0.5).setDepth(D + 3);
    const hpT = num(64 + 170, 650), mpT = num(64 + 170, 674);
    const EXP_X = 16, EXP_Y = 698, EXP_W = 1200, EXP_H = 16;
    const exp = new HudBar(this, 'ui_bar_cultivation_frame', 'ui_bar_cultivation', EXP_X, EXP_Y, EXP_W, EXP_H, D + 1);
    let expGlow: HudKit['expGlow'];
    const gs = hudSpec(this, 'ui_bar_cultivation_bottleneck_glow');
    if (gs && this.textures.exists('ui_bar_cultivation_bottleneck_glow')) {
      const pad = gs.pad ?? 0;
      const glow = sliced(this, 'ui_bar_cultivation_bottleneck_glow', EXP_X - pad, EXP_Y - pad, EXP_W + 2 * pad, EXP_H + 2 * pad)!.setDepth(D).setVisible(false);
      this.tweens.add({ targets: glow, alpha: { from: 0.35, to: 1 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      expGlow = glow;
    }
    const expT = num(EXP_X + EXP_W / 2, EXP_Y + EXP_H / 2);
    let boss: HudKit['boss'];
    if (['ui_hud_boss_bar_frame', 'ui_hud_boss_bar_fill', 'ui_hud_boss_nameplate'].every(k => hasHud(this, k))) {
      const plate = sliced(this, 'ui_hud_boss_nameplate', 640, 8, 48, 24)!.setDepth(130);
      const bar = new HudBar(this, 'ui_hud_boss_bar_frame', 'ui_hud_boss_bar_fill', 340, 44, 600, 24, 130);
      const name = hudText(this, 640, 20, 14, { fontStyle: 'bold' }).setOrigin(0.5).setDepth(132);
      const bnum = hudText(this, 640, 56, 12, { fontStyle: 'bold', color: '#ffffff', stroke: INK, strokeThickness: 2 }).setOrigin(0.5).setDepth(133);
      boss = { plate, bar, name, num: bnum };
      plate.setVisible(false); bar.setVisible(false); name.setVisible(false); bnum.setVisible(false);
    }
    this.hudKit = { panel, hp, mp, exp, expGlow, lv, info, hpT, mpT, expT, boss, expRight: EXP_X + EXP_W };
  }

  drawHud() {
    const pr = this.prog, W = 1280, H = 720;
    const g = this.hud.clear();
    const kit = this.hudKit;
    const jobName0 = pr.job ? t('job.' + pr.job) : '';
    if (kit) {
      const need = pr.expNeed, ratio = Number.isFinite(need) ? Math.min(1, pr.exp / need) : 1;
      kit.lv.setText(`Lv.${pr.level}  ${pr.realmName}${jobName0 && !jobName0.startsWith('job.') ? '  ' + jobName0 : ''}`);
      kit.info.setText(`灵石 ${pr.stones}  攻 ${pr.atk.toFixed(0)}  防 ${pr.def.toFixed(1)}`);
      kit.hp.set(pr.hp / pr.maxHp); kit.hpT.setText(`${pr.hp} / ${pr.maxHp}`);
      kit.mp.set(pr.mp / pr.maxMp); kit.mpT.setText(`${Math.floor(pr.mp)} / ${pr.maxMp}`);
      kit.exp.set(ratio, pr.atBreakthrough ? 'ui_bar_cultivation_bottleneck' : 'ui_bar_cultivation');
      kit.expGlow?.setVisible(pr.atBreakthrough);
      kit.expT.setText(`修为 ${pr.exp}/${need}${pr.atBreakthrough ? `（${t('realm.bottleneck')}）` : ''}`);
      const boss = this.hudBoss();
      if (kit.boss) {
        const b = kit.boss, on = !!boss;
        b.name.setVisible(on); b.num.setVisible(on); b.plate.setVisible(on); b.bar.setVisible(on);
        if (boss) {
          b.name.setText(boss.def.name);
          const pw = b.name.width + 24;
          setSlicedWidth(this, b.plate, 'ui_hud_boss_nameplate', pw); b.plate.setX(640 - pw / 2);
          b.bar.set(Math.max(0, boss.hp) / boss.def.hp);
          b.num.setText(`${Math.max(0, Math.ceil(boss.hp))} / ${boss.def.hp}`);
        }
        this.bossName.setVisible(false); this.bossHpText.setVisible(false);
      } else this.drawBossFallback(g, boss);
      this.drawGourd(kit.expRight + 24, H - 2);
      this.drawHudTail();
      return;
    }
    g.fillStyle(0x1d2a3a, 0.85).fillRect(0, H - 44, W, 44);
    g.fillStyle(0x333333).fillRect(130, H - 38, 220, 18).fillStyle(0xe8443a).fillRect(130, H - 38, 220 * pr.hp / pr.maxHp, 18);
    g.fillStyle(0x333333).fillRect(366, H - 38, 180, 18).fillStyle(0x3a8af0).fillRect(366, H - 38, 180 * pr.mp / pr.maxMp, 18);
    const need = pr.expNeed, ratio = Number.isFinite(need) ? Math.min(1, pr.exp / need) : 1;
    const expW = 1200;
    g.fillStyle(0x333333).fillRect(0, H - 10, expW, 10).fillStyle(pr.atBreakthrough ? 0xd080ff : 0xf2d24a).fillRect(0, H - 10, expW * ratio, 10);
    this.drawBossFallback(g, this.hudBoss());
    this.drawGourd(expW + 20, H - 2);
    if (!this.hudTexts) {
      const mk = (x: number, o = 0) => this.add.text(x, H - 29, '', { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(o, 0.5).setScrollFactor(0).setDepth(101);
      this.hudTexts = [mk(14), mk(240, 0.5), mk(456, 0.5), mk(566)];
    }
    const [lv, hp, mp, info] = this.hudTexts;
    const jobName = jobName0;
    lv.setText(`Lv.${pr.level}  ${pr.realmName}${jobName && !jobName.startsWith('job.') ? '  ' + jobName : ''}`); hp.setText(`气血 ${pr.hp}/${pr.maxHp}`); mp.setText(`灵力 ${Math.floor(pr.mp)}/${pr.maxMp}`);
    info.setText(`修为 ${pr.exp}/${need}${pr.atBreakthrough ? `（${t('realm.bottleneck')}）` : ''}    灵石 ${pr.stones}    攻击 ${pr.atk.toFixed(0)}  防御 ${pr.def.toFixed(1)}`);
    this.drawHudTail();
  }

  /** 旧版首领血条（hud 素材缺失时） */
  /** 顶部大血条显示谁：试炼时是阵眼，否则是场上的首领 */
  private hudBoss(): { hp: number; def: { name: string; hp: number } } | undefined {
    if (this.bossOverride) return { hp: this.bossOverride.hp, def: { name: this.bossOverride.name, hp: this.bossOverride.max } };
    return this.mobs.find(m => m.def.isBoss && !m.owner && !m.dead);
  }

  private drawBossFallback(g: Phaser.GameObjects.Graphics, boss: { hp: number; def: { name: string; hp: number } } | undefined) {
    const W = 1280;
    if (boss) {
      const bw = 420, x = (W - bw) / 2;
      g.fillStyle(0x1a1020, 0.88).fillRoundedRect(x - 12, 10, bw + 24, 46, 8);
      g.fillStyle(0x3a1820).fillRect(x, 36, bw, 12);
      g.fillStyle(0xd04048).fillRect(x, 36, bw * Math.max(0, boss.hp) / boss.def.hp, 12);
      this.bossName.setPosition(x, 14).setOrigin(0, 0).setText(boss.def.name).setVisible(true);
      this.bossHpText.setPosition(x + bw, 14).setOrigin(1, 0).setText(`${Math.max(0, Math.ceil(boss.hp))} / ${boss.def.hp}`).setVisible(true);
    } else { this.bossName.setVisible(false); this.bossHpText.setVisible(false); }
  }

  /** 溢出池葫芦：修为条右侧 */
  private drawGourd(x: number, y: number) {
    const pr = this.prog, W = 1280;
    const showGourd = BREAKTHROUGH_LEVELS.includes(pr.level) || pr.overflowExp > 0;
    if (this.gourd && this.textures.exists('icon_overflow_gourd_empty')) {
      this.gourd.setVisible(showGourd);
      if (showGourd) {
        const cap = pr.overflowCap, n = pr.overflowExp;
        const key = `icon_overflow_gourd_${pr.overflowTier}`;
        if (this.gourd.texture.key !== key && this.textures.exists(key)) this.gourd.setTexture(key);
        this.gourd.setPosition(x, y);
        this.gourdTip.setText(t('realm.overflow_tip', { n, max: cap })).setPosition(Math.min(this.gourd.x + 16, W - 8), this.gourd.y - 36);
      } else this.gourdTip.setVisible(false);
    }
  }

  private drawHudTail() {
    const pr = this.prog;
    const identity = this.sectGrowth.identity();
    const badge = identity?.valid ? sectRankIcon(this, identity.icon) : null;
    const visible = featureEnabled('sectRanks') && !!identity && !this.invText.visible;
    // 徽记置于称号底板内；两行文字共用左侧留白，贡献再长也不会压住徽记。
    if (this.sectTitle.padding.left !== (badge ? 38 : 6))
      this.sectTitle.setPadding({ left: badge ? 38 : 6, right: 6, top: badge ? 6 : 4, bottom: badge ? 6 : 4 });
    this.sectTitle.setVisible(visible).setText(identity
      ? `${identity.title || t('sect.ui.invalid_rank')}\n${t('sect.ui.contribution', { contribution: pr.sectContribution })}` : '');
    this.sectBadge.setVisible(visible && !!badge);
    if (badge) this.sectBadge.setTexture(badge.texture, badge.frame).setDisplaySize(24, 24)
      .setPosition(this.sectTitle.x - this.sectTitle.width + 18, this.sectTitle.y + 18);
    this.skillBar.draw(pr.skillsUnlocked, gameNow(), pr.hotbar, this.combat.cds, pr);
    for (const m of this.npcMarks) {
      const mk = this.quests.mark(m.id);
      if (m.img) { m.text.setText(''); m.img.setVisible(!!mk); if (mk) m.img.setTexture(mk === '!' ? 'ui_hud_quest_available' : mk === '?' ? 'ui_hud_quest_turnin' : 'ui_hud_quest_progress'); }
      else m.text.setText(mk ?? '').setColor(mk === '…' ? '#cccccc' : '#ffd23a');
    }
    const tl: string[] = [];
    for (const id of this.quests.activeIds) {
      const def = QUESTS_REF[id], q = this.quests.objectiveProgress(def);
      tl.push(def.daily && this.quests.complete(id)
        ? t('quest.complete_ready', { name: questName(def), npc: NPCS[def.turnIn]?.name ?? def.turnIn })
        : `【${questName(def)}】${!def.daily && this.quests.complete(id) ? '  可交付' : ''}`);
      if (def.daily && questDescription(def)) tl.push(`  ${questDescription(def)}`);
      for (const o of q) {
        const target = def.daily ? (o.o.type === 'kill' ? MONSTERS[o.o.target ?? '']?.name
          : o.o.type === 'collect' ? ITEMS[o.o.target ?? '']?.name : NPCS[o.o.target ?? '']?.name) ?? o.o.target ?? '' : o.label;
        tl.push(def.daily ? `  ${t('quest.progress', { target, cur: o.cur, max: o.need })}` : `  ${target} ${o.cur}/${o.need}`);
      }
    }
    this.tracker.setText(tl.join('\n')).setVisible(tl.length > 0);
    if (this.invText.visible) {
      const lines = Object.entries(pr.inventory).filter(([, n]) => n > 0).map(([id, n]) => `${ITEMS[id]?.name ?? id} ×${n}`);
      this.invText.setText(['背包', `灵石 ${pr.stones}`, `武器 ${ITEMS[pr.equip.weapon]?.name ?? '无'}`, `属性 根骨 ${pr.stat('rootBone')} 身法 ${pr.stat('agility')} 悟性 ${pr.stat('insight')}`, ...lines].join('\n'));
    }
    if (this.debugText.visible) {
      const p = this.player, b = p.body;
      this.debugText.setText(`状态 ${p.state2}  二段跳 ${p.canDouble ? '可用' : '已用'}  单向平台 ${p.onOneWay}\n速度 vx ${b.velocity.x.toFixed(0)} vy ${b.velocity.y.toFixed(0)}  位置 ${p.x.toFixed(0)},${p.y.toFixed(0)}  FPS ${this.game.loop.actualFps.toFixed(0)}`);
    }
  }

  toggleDebug() {
    const w = this.physics.world;
    w.drawDebug = !w.drawDebug;
    if (!w.debugGraphic) w.createDebugGraphic();
    w.debugGraphic.clear();
    this.debugText.setVisible(w.drawDebug);
  }

  backgroundArt?: BackgroundArt;
  environmentArt?: EnvironmentArt;
  configureEnvironment(config?: EnvironmentArtConfig | null) {
    this.environmentArt?.destroy();
    const area = MAP_AREA[this.map.id] ?? 'qingyun';
    const areas = { ...config?.areas, ...this.registry.get('art.environment.areas') };
    this.environmentArt = new EnvironmentArt(this, area, this.map.width, this.map.height,
      { ...config, enabled: this.registry.get('art.environment.enabled') ?? config?.enabled, areas }, this.map.objects);
  }
  setEnvironmentEnabled(enabled: boolean) {
    this.registry.set('art.environment.enabled', enabled); this.environmentArt?.setEnabled(enabled);
  }
  setEnvironmentAreaEnabled(area: string, enabled: boolean) {
    this.registry.set('art.environment.areas', { ...this.registry.get('art.environment.areas'), [area]: enabled });
    this.environmentArt?.setAreaEnabled(area, enabled);
  }
  private backgroundObjects: Phaser.GameObjects.GameObject[] = [];
  drawBackground(area: string, width = this.map.width, height = this.map.height) {
    this.backgroundArt?.destroy(); this.backgroundArt = undefined;
    for (const object of this.backgroundObjects) object.destroy();
    this.backgroundObjects = []; this.parallax = [];
    const config: BackgroundConfig | undefined = this.cache.json.get(`bg_${area}_config`);
    if (config?.layers) {
      this.backgroundArt = new BackgroundArt(this, area, width, height, config);
      if (this.backgroundArt.layers.length) return;
      this.backgroundArt.destroy(); this.backgroundArt = undefined;
    }
    const sky = this.add.graphics().setScrollFactor(0).setDepth(-10);
    this.backgroundObjects.push(sky);
    sky.fillGradientStyle(0x7cc8f2, 0x7cc8f2, 0xdff3ff, 0xdff3ff, 1).fillRect(0, 0, 1280, 720);
    this.parallax = [];
    for (const [layer, f, d] of [['far', 0.2, -9], ['mid', 0.5, -8]] as [string, number, number][]) {
      const key = `bg_${area}_${layer}`;
      if (!this.textures.exists(key)) continue;
      const img = this.textures.get(key).getSourceImage() as HTMLImageElement;
      const ts = this.add.tileSprite(0, 720, 1280, img.height, key).setOrigin(0, 1).setScrollFactor(0).setDepth(d);
      this.backgroundObjects.push(ts);
      this.parallax.push({ ts, f });
    }
    if (this.parallax.length) return;
    const far = this.add.graphics().setScrollFactor(0.15, 0.1).setDepth(-9);
    this.backgroundObjects.push(far);
    far.fillStyle(0xb7d9ec);
    for (let i = 0; i < 12; i++) far.fillTriangle(i * 260 - 100, 620, i * 260 + 60, 260 + (i % 3) * 50, i * 260 + 220, 620);
  }
}
