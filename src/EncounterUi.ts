import type Phaser from 'phaser';
import { ENCOUNTERS, ITEMS, NPCS, t } from './data';
import type { EncounterDefinition, EncountersConfig } from './Encounter';
import { applySpriteArt } from './SpriteArt';
import type { GameScene } from './scenes/GameScene';

/** y 默认是脚底；纯坐标不带高度时视作头顶锚点。headY 是绝对世界坐标。 */
export interface EncounterUiTarget {
  readonly x: number; readonly y: number;
  readonly height?: number; readonly displayHeight?: number; readonly originY?: number; readonly headY?: number;
}
export interface EncounterOffer {
  readonly encounterId: string;
  readonly attemptId?: string;
  readonly stepId?: string;
  readonly outcomeId?: string;
  /** runner 抽中后仅提示；玩家靠近交互再展开。 */
  readonly markerOnly?: boolean;
  readonly vars?: Readonly<Record<string, string | number>>;
  readonly target?: EncounterUiTarget;
  readonly x?: number; readonly y?: number; readonly height?: number; readonly headY?: number;
  /** 从 y 到标记底边的总偏移；坐姿等特殊挂点可显式提供。 */
  readonly headOffset?: number;
  readonly config?: EncountersConfig | null;
  /** 仅用于调用方/测试展示，不启用正式配置，不触发玩法。 */
  readonly mock?: boolean;
}

type Fields = Readonly<Record<string, unknown>>;
type ChoiceView = { id: string; label: string; lack: string; preview: string; puzzle?: boolean };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const fields = (v: unknown): Fields => v && typeof v === 'object' && !Array.isArray(v) ? v as Fields : {};
const rows = (v: unknown): Fields[] => Array.isArray(v) ? v.map(fields) : [];
const keys = (v: unknown): string[] => Array.isArray(v) ? v.filter(text) : [];
const signed = (v: number) => v > 0 ? `+${v}` : String(v);
const itemName = (id: string) => ITEMS[id]?.name ?? id;
const HELP = 'fx_enc_help_mark', HELP_ANIM = `${HELP}_idle`;
const FONT = '"Noto Sans CJK SC", "Source Han Sans SC", sans-serif';

/** 只沿无分支的展示节点读配置；不跨战斗、机关或下一组选项猜结局。 */
function outcomeFor(definition: EncounterDefinition, next: unknown): EncounterDefinition['outcomes'][number] | undefined {
  const visited = new Set<string>();
  while (text(next) && !visited.has(next)) {
    visited.add(next);
    const step = definition.script.steps.find(step => step.id === next);
    if (!step) return;
    if (step.type === 'finish') return definition.outcomes.find(outcome => outcome.id === step.outcomeId);
    if (!['dialog', 'interact', 'scene'].includes(String(step.type))) return;
    next = step.next;
  }
}

function itemLines(value: unknown, label: string): string[] {
  return rows(value).flatMap(row => text(row.item) && finite(row.count)
    ? [t(label, { item: itemName(row.item), n: row.count })] : []);
}

function previewLines(definition: EncounterDefinition, choice: Fields): string[] {
  const result = itemLines(fields(choice.cost).items, 'encounter.ui.cost_item');
  const outcome = outcomeFor(definition, choice.next);
  if (!outcome) return result;
  const rewards = fields(outcome.rewards), hooks = fields(outcome.hooks);
  for (const [field, label] of [['exp', 'reward_exp'], ['spiritStone', 'reward_stones'], ['insight', 'reward_insight']] as const) {
    if (finite(rewards[field])) result.push(t(`encounter.ui.${label}`, { n: rewards[field] }));
  }
  result.push(...itemLines(rewards.items, 'encounter.ui.reward_item'));
  for (const [field, label] of [['daoHeartDelta', 'hook_dao_heart'], ['moralityDelta', 'hook_morality']] as const) {
    if (finite(hooks[field])) result.push(t(`encounter.ui.${label}`, { n: signed(hooks[field]) }));
  }
  for (const hook of rows(hooks.karma)) if (text(hook.flag) && typeof hook.value === 'boolean') {
    result.push(t('encounter.ui.hook_karma', { flag: t(`karma.flag.${hook.flag}`),
      value: t(hook.value ? 'encounter.ui.flag_on' : 'encounter.ui.flag_off') }));
  }
  for (const hook of rows(hooks.affinity)) if (text(hook.npc) && finite(hook.delta)) {
    result.push(t('encounter.ui.hook_affinity', { npc: NPCS[hook.npc]?.name ?? hook.npc, n: signed(hook.delta) }));
  }
  if (result.length && hooks.oncePerEncounter === true) result.push(t('encounter.ui.hook_once'));
  return result;
}

/** 奇遇表现预接：仅读配置和背包数量，永不推进、抽签、结算或保存。 */
export class EncounterUi {
  private offer?: EncounterOffer;
  private panel?: Phaser.GameObjects.Container;
  private mark?: Phaser.GameObjects.Sprite;
  private rendered = '';
  private destroyed = false;

  constructor(private readonly scene: GameScene) {
    scene.events.on('encounter:offer', this.showOffer, this);
    scene.events.on('encounter:step', this.showOffer, this);
    scene.events.on('encounter:result', this.showOffer, this);
    scene.events.on('encounter:clear', this.clear, this);
    scene.events.on('update', this.refresh, this);
    scene.events.once('shutdown', this.destroy, this);
  }

  /** offer/step 事件均接收同一完整 payload；仅调用方可切换当前节点。 */
  showOffer(offer: EncounterOffer) {
    if (this.destroyed) return;
    this.offer = offer;
    this.rendered = '';
    this.refresh();
  }

  private definition(offer: EncounterOffer): EncounterDefinition | undefined {
    const config = offer.config === undefined ? ENCOUNTERS : offer.config;
    const definition = config?.encounters.find(row => row.id === offer.encounterId);
    if (!definition) return;
    if (offer.mock !== true && (definition.enabled !== true || !text(offer.attemptId))) return;
    return definition;
  }

  private lack(choice: Fields): string {
    const required = new Map<string, number>();
    for (const source of [choice.req, choice.cost]) {
      const totals = new Map<string, number>();
      for (const row of rows(fields(source).items)) if (text(row.item) && finite(row.count)) totals.set(row.item, (totals.get(row.item) ?? 0) + row.count);
      for (const [id, n] of totals) required.set(id, Math.max(required.get(id) ?? 0, n));
    }
    return [...required].flatMap(([item, count]) => {
      const have = this.scene.prog.permanentCount(item);
      return !finite(have) || have < count ? [t('encounter.ui.lack_item', { item: itemName(item), n: count, have })] : [];
    }).join('\n');
  }

  refresh() {
    if (this.destroyed) return;
    const offer = this.offer, definition = offer && this.definition(offer);
    const outcome = definition?.outcomes.find(row => row.id === offer?.outcomeId);
    const step = definition?.script.steps.find(step => step.id === (offer?.stepId ?? definition.script.start));
    if (!offer || !definition || !step && !outcome) { this.clearVisuals(); return; }
    if (!outcome && ['battle', 'scene'].includes(String(step?.type))) { this.clearVisuals(); return; }
    if (offer.markerOnly) { this.panel?.destroy(); this.panel = undefined; this.rendered = ''; this.refreshMark(offer); return; }
    const choices: ChoiceView[] = keys(outcome ? undefined : step?.choiceIds).flatMap(id => {
      const choice = definition.choices.find(choice => choice.id === id);
      return choice && text(choice.textKey) ? [{ id, label: t(choice.textKey, offer.vars),
        lack: this.lack(choice), preview: previewLines(definition, choice).join('\n') }] : [];
    });
    if (!outcome && step?.type === 'puzzle') {
      const names = fields(step.objectNameKeys);
      choices.push(...keys(step.objects).map(id => ({ id, label: t(String(names[id] ?? id), offer.vars),
        lack: '', preview: '', puzzle: true })));
    }
    const title = t(definition.nameKey, offer.vars);
    const repeat = !!this.scene.prog.encounters?.resolved?.[offer.encounterId] && keys(step?.repeatTextKeys).length > 0;
    const dialogKeys = keys(outcome?.textKeys ?? (repeat ? step?.repeatTextKeys : step?.textKeys));
    if (!outcome && step?.type === 'puzzle' && text(step.objectiveKey)) dialogKeys.push(step.objectiveKey);
    const dialog = dialogKeys.map(key => t(key, offer.vars)).join('\n');
    const model = JSON.stringify({ title, dialog, choices, outcome: outcome?.id, step: step?.id });
    if (model !== this.rendered) {
      this.panel?.destroy();
      this.buildPanel(offer, String(step?.id ?? ''), title, dialog, choices, !outcome && ['dialog', 'interact'].includes(String(step?.type)));
      this.rendered = model;
    }
    if (outcome) { this.mark?.destroy(); this.mark = undefined; } else this.refreshMark(offer);
  }

  private buildPanel(offer: EncounterOffer, stepId: string, title: string, dialog: string, choices: ChoiceView[], canAdvance: boolean) {
    const scene = this.scene, width = 760, wrap = width - 48;
    const panel = this.panel = scene.add.container(0, 0).setScrollFactor(0).setDepth(205).setName('encounter-panel');
    const background = scene.add.rectangle(0, 0, width, 1, 0xfaf2dc, 0.98).setOrigin(0, 0).setStrokeStyle(2, 0x6b4b2a);
    panel.add(background);
    let y = 18;
    const line = (value: string, name: string, color = '#3B2A20', size = 15) => {
      const label = scene.add.text(24, y, value, { fontFamily: FONT, fontSize: `${size}px`, color,
        wordWrap: { width: wrap, useAdvancedWrap: true }, lineSpacing: 4 }).setName(name);
      panel.add(label); y += label.height + 10;
      return label;
    };
    line(title, 'encounter-title', '#6B2A00', 18);
    if (dialog) line(dialog, 'encounter-dialog');
    if (choices.some(choice => choice.preview)) line(t('encounter.ui.preview_title'), 'encounter-preview-title', '#65584A', 12);
    for (const choice of choices) {
      const label = line(choice.label, `encounter-${choice.puzzle ? 'puzzle' : 'choice'}:${choice.id}`, '#2B4C7E')
        .setData('disabled', !!choice.lack).setAlpha(choice.lack ? 0.45 : 1);
      if (!choice.lack) label.setInteractive({ useHandCursor: true });
      label.on('pointerdown', (pointer?: Phaser.Input.Pointer) => {
        if (pointer && pointer.button !== 0 || this.offer !== offer) return;
        // 点击时再次读门禁/材料，避免本帧库存变化后沿用旧的可点状态。
        const current = this.definition(offer)?.choices.find(row => row.id === choice.id);
        if (!choice.puzzle && (!current || this.lack(current))) { this.refresh(); return; }
        this.selectChoice(choices.findIndex(row => row.id === choice.id));
      });
      if (choice.lack) line(choice.lack, `encounter-lack:${choice.id}`, '#9C3932', 12);
      if (choice.preview) line(choice.preview, `encounter-preview:${choice.id}`, '#65584A', 12);
    }
    if (canAdvance) line(t('ui.dialog.next'), 'encounter-continue', '#2B4C7E')
      .setInteractive({ useHandCursor: true }).on('pointerdown', (pointer?: Phaser.Input.Pointer) => {
        if (!pointer || pointer.button === 0) this.advance();
      });
    line(t('encounter.ui.close_hint'), 'encounter-close', '#65584A', 12)
      .setInteractive({ useHandCursor: true }).on('pointerdown', (pointer?: Phaser.Input.Pointer) => {
        if (!pointer || pointer.button === 0) this.clear();
      });
    background.setSize(width, y + 8);
    panel.setPosition(((scene.scale?.width ?? 1280) - width) / 2, Math.max(20, ((scene.scale?.height ?? 720) - y - 8) / 2));
  }

  isOpen(): boolean { return !!this.panel; }
  advance() {
    const offer = this.offer, definition = offer && this.definition(offer);
    const step = definition?.script.steps.find(row => row.id === (offer?.stepId ?? definition.script.start));
    if (!offer || offer.markerOnly || offer.outcomeId || !step || !['dialog', 'interact'].includes(String(step.type))) return;
    this.scene.events.emit('encounter:ui-advance', { encounterId: offer.encounterId, stepId: step.id,
      ...(offer.attemptId ? { attemptId: offer.attemptId } : {}), mock: offer.mock === true });
  }
  selectChoice(index: number) {
    const offer = this.offer, definition = offer && this.definition(offer);
    const step = definition?.script.steps.find(row => row.id === (offer?.stepId ?? definition.script.start));
    if (offer && !offer.markerOnly && !offer.outcomeId && step?.type === 'puzzle') {
      const objectId = keys(step.objects)[index];
      if (objectId) this.scene.events.emit('encounter:ui-puzzle', { encounterId: offer.encounterId, stepId: step.id,
        ...(offer.attemptId ? { attemptId: offer.attemptId } : {}), objectId, mock: offer.mock === true });
      return;
    }
    const id = keys(step?.choiceIds)[index], choice = definition?.choices.find(row => row.id === id);
    if (!offer || offer.markerOnly || offer.outcomeId || !step || !choice || this.lack(choice)) { this.refresh(); return; }
    this.scene.events.emit('encounter:ui-choice', { encounterId: offer.encounterId, stepId: step.id, choiceId: id,
      ...(offer.attemptId ? { attemptId: offer.attemptId } : {}), mock: offer.mock === true });
  }

  private refreshMark(offer: EncounterOffer) {
    const target = offer.target ?? offer;
    if (!finite(target.x) || !finite(target.y)) { this.mark?.destroy(); this.mark = undefined; return; }
    const scene = this.scene;
    if (!this.mark && scene.textures.exists(HELP)) {
      const texture = scene.textures.get(HELP);
      const frame = texture.has(`${HELP}_idle_01`) ? `${HELP}_idle_01` : texture.getFrameNames().sort()[0];
      this.mark = scene.add.sprite(0, 0, HELP, frame).setDepth(12).setName('encounter-help-mark');
      applySpriteArt(this.mark);
      this.mark.setOrigin(0.5, 1);
      if (scene.anims.exists(HELP_ANIM)) {
        const animation = scene.anims.get(HELP_ANIM);
        if (animation.frames.length && animation.frames.every(frame => frame.textureKey === HELP && texture.has(String(frame.textureFrame))))
          this.mark.play(HELP_ANIM);
      }
    }
    const height = 'displayHeight' in target && finite(target.displayHeight) ? target.displayHeight : target.height ?? 0;
    const origin = 'originY' in target && finite(target.originY) ? target.originY : 1;
    const headY = finite(target.headY) ? target.headY : target.y - height * origin;
    this.mark?.setPosition(target.x, finite(offer.headOffset) ? target.y - offer.headOffset : headY - 4);
  }

  private clearVisuals() {
    this.panel?.destroy(); this.mark?.destroy();
    this.panel = undefined; this.mark = undefined; this.rendered = '';
  }

  /** 关闭仅撤下展示；不替玩家选项，不发送结算事件。 */
  clear() { this.offer = undefined; this.clearVisuals(); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events.off('encounter:offer', this.showOffer, this);
    this.scene.events.off('encounter:step', this.showOffer, this);
    this.scene.events.off('encounter:result', this.showOffer, this);
    this.scene.events.off('encounter:clear', this.clear, this);
    this.scene.events.off('update', this.refresh, this);
    this.scene.events.off('shutdown', this.destroy, this);
    this.clear();
  }
}
