import { GROWTH, EXP_TO_NEXT, MAX_LEVEL, ITEMS, BREAKTHROUGH_LEVELS, BREAKTHROUGH, REALMS, QUESTS, LIFESPAN, RECIPES, ALCHEMY_RULES, SECT_RANKS, PillQuality, QuestDef } from './data';
import type { SectGrowthState } from './SectGrowth';
import { HOTBAR_SLOTS, QUEST_SKILL_BACKFILL, SKILLS, SKILL_RULES, SkillDef, actOf, skillNumber, spEarnedFor, spBand } from './skills';
import { CLASS_RULES, classDef, classForQuest, classGiftSkills, classMinLevel, classRobe, skillsForClass } from './classes';
import { DAILY_QUEST_LIMIT, dailyQuestDay, dailyContribution, dailyRewardsReady, type DailyQuestReward } from './DailyQuests';
import { isBrewSession, type BrewSession } from './Alchemy';

/** 自动加点：加点界面做好前每级自动分配（演武堂/天机阁确认：根骨 2、身法 2、悟性 1） */
export const AUTO_STATS = { rootBone: 2, agility: 2, insight: 1, spirit: 0 } as Record<string, number>;
const SAVE_KEY = 'xiantu_save_v1';

/** 角色成长与背包（跨地图保留）。公式见 balance/player_growth.json */
export class Progress {
  level = 1; exp = 0; hp = 0; mp = 0; stones = 0;
  inventory: Record<string, number> = {};
  /** 实例内物品可供交互读取，但不能写入永久背包。 */
  private transientItems: Record<string, number> = {};
  equip: Record<string, string> = {};     // 桃木剑由任务「灵根初现」发放
  job = '';                                 // 转职后的职业 id
  /** 职业框架迁移收据；旧剑徒保留等级、技能点和自定义快捷栏。 */
  classVersion = 0;
  classRewardClaims: string[] = [];
  /** 通用入门技的付费等级在拜宗后退回当前一转点池。 */
  classRefundSp = 0;
  /** 灵根元素尚无配表/角色创建字段；仅已登记元素获得五行亲和。 */
  rootElement = '';
  completedTrials: string[] = [];
  /** 仅独立冷却使用绝对时间，切图/刷新不能绕过；剑修原后摇不写入。 */
  skillCooldowns: Record<string, { readyAt: number; total: number }> = {};
  quests: Record<string, { state: 'active' | 'done'; kills: Record<string, number>; crafted?: Record<string, number>; reached?: boolean; talked?: Record<string, boolean> }> = {};
  /** 已学配方包含丹方、研墨和符方；具体工作台按 type 筛选。 */
  learnedRecipes: string[] = [];
  alchemyLevel = 1;
  alchemyExp = 0;
  /** 品质分桶与普通背包共存，旧档未分桶的丹药视为下品。 */
  pillQualities: Record<string, Partial<Record<PillQuality, number>>> = {};
  /** 地图 id:采集对象名 → 再生的绝对毫秒时间，换图/刷新后保持。 */
  gatherRespawnAt: Record<string, number> = {};
  /** 已付料的这一炉；刷新继续火候，结算前清空防止重复领奖。 */
  pendingAlchemy: BrewSession | null = null;
  name = '少年';
  /** 已学会的功法等级。任务赠送的 1 级也写在这里。 */
  skills: Record<string, number> = {};
  /** 其中不花技能点的等级（任务直接发放）。 */
  skillGifted: Record<string, number> = {};
  skillMastery: Record<string, number> = {};
  hotbar: (string | null)[] = Array.from({ length: HOTBAR_SLOTS.length }, () => null);
  /** 增益结束的绝对时间（Date.now），换图、刷新都还在。 */
  buffs: { id: string; expireAt: number; warned?: boolean }[] = [];
  spTipShown = false;
  /** 每档只显示一次的地图教学 id。 */
  tutorialsSeen: string[] = [];
  /** 宗门贡献余额；旧档缺省 0。 */
  sectContribution = 0;
  /** 未拜入为 null；旧档只迁移缺失字段，异常值留给宗门服务诊断。 */
  sectRank: string | null = null;
  sectGrowthState: SectGrowthState = { donationBatches: {}, settledTransactions: {} };
  sectDailyContributionDay = '';
  sectDailyContributionClaims: string[] = [];
  /** 上次日常重置的本地日历日期（05:00 日界）；离线只补算到当前日。 */
  dailyQuestResetDay = '';
  dailyQuestCompletions: Record<string, string[]> = {};
  age = LIFESPAN.startAge;
  ageUpdatedAt = Date.now();
  seclusionDay = '';
  seclusionYearsToday = 0;
  seclusionHistory: { at: number; years: number; cost: number; gained: number; overflowed: number }[] = [];
  /** 瓶颈期装不下的修为，全额存进来，上限 overflowCap。旧档没有这个字段，读档时补 0 */
  overflowExp = 0;
  /** 突破失败次数（保底用，成功清零） */
  breakthroughFails = 0;
  /** 境界不稳到期时间（Date.now）与属性比例 */
  unstableUntil = 0;
  /** 已领过突破奖励（realms.json reward.hpMul/mpMul）的境界 id。按 id 去重，倍率每个境界只乘一次 */
  realmRewards: string[] = [];
  unstableRatio = 0;
  /** 境界不稳影响的属性，读 realms.json failPenalty.debuffStats */
  unstableStats: string[] = [];
  /** 刚突破时返还了多少，给界面飘字用，不参与公式 */
  lastOverflowReturned = 0;
  /** 返还的修为让新境界又升了几级 */
  breakthroughBonusLevels = 0;

  constructor() { this.hp = this.maxHp; this.mp = this.maxMp; }

  /** 属性点：每升一级按 AUTO_STATS 自动分配 */
  stat(k: string) { return (AUTO_STATS[k] ?? 0) * (this.level - 1) + this.passiveBonus(k); }
  private statBonus(attr: string) {
    let v = 0;
    for (const [k, eff] of Object.entries(GROWTH.statEffects as Record<string, Record<string, number>>)) v += (eff[attr] ?? 0) * this.stat(k);
    return v;
  }
  get realm() { return REALMS.find((r: any) => this.level >= r.levelMin && this.level <= r.levelMax) ?? REALMS[0]; }
  get realmName() {
    const r = this.realm;
    if (!r.stageLevels) return r.name;
    let i = 0; r.stageLevels.forEach((lv: number, k: number) => { if (this.level >= lv) i = k; });
    return `${r.name}·${r.stages[i]}`;
  }
  get skillsUnlocked() { return this.realm.id !== 'mortal'; }

  save(): boolean {
    const { transientItems, ...persistent } = this;
    const inventory: Record<string, number> = { ...this.inventory };
    for (const [id, count] of Object.entries(transientItems)) inventory[id] = Math.max(0, this.count(id) - count);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...persistent, inventory })); return true; } catch { return false; }
  }
  static load(): Progress {
    const p = new Progress();
    let hadStoredRank = false, storedRank: string | null = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        hadStoredRank = Object.prototype.hasOwnProperty.call(saved, 'sectRank');
        if (hadStoredRank) storedRank = saved.sectRank;
        Object.assign(p, saved);
      }
    } catch { /* 存档损坏就重开 */ }
    p.overflowExp = Math.max(0, Math.floor(Number(p.overflowExp) || 0));
    if (Number.isFinite(p.overflowCap)) p.overflowExp = Math.min(p.overflowExp, p.overflowCap);
    p.ensureDefaults();
    p.resetDailyQuests();
    p.advanceAge();
    const backfilled = [p.backfillRealmRewards(), p.backfillQuestSkills(), p.backfillQuestRecipes(), p.backfillClass(false)].some(Boolean);
    // 原职业/已交付拜入任务是正式入宗事实；试炼、帖和山门位置不参与迁移。
    p.sectRank = hadStoredRank ? storedRank : p.sect ? SECT_RANKS.rules.initialRank : null;
    p.hp = Math.min(p.hp || p.maxHp, p.maxHp); p.mp = Math.min(p.mp || p.maxMp, p.maxMp);
    if (backfilled || !hadStoredRank) p.save();
    return p;
  }
  static reset() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

  /** 教学首次触发就存档，换图与刷新后都不重复弹出。 */
  markTutorialSeen(id: string): boolean {
    if (!id || this.tutorialsSeen.includes(id)) return false;
    this.tutorialsSeen.push(id);
    this.save();
    return true;
  }

  gainSectContribution(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const gained = Math.floor(amount);
    this.sectContribution += gained; this.save();
    return gained;
  }

  spendSectContribution(amount: number) {
    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount) || this.sectContribution < amount) return false;
    this.sectContribution -= amount; this.save();
    return true;
  }

  /** 登录、接取、交付及在线检查共用；过期未交付任务也作废，不扣背包材料。 */
  resetDailyQuests(now = Date.now()) {
    const day = dailyQuestDay(now);
    if (this.dailyQuestResetDay === day) return false;
    this.dailyQuestResetDay = day;
    for (const id of Object.keys(this.quests)) if (QUESTS[id]?.daily) delete this.quests[id];
    if (this.sectDailyContributionDay !== day) {
      this.sectDailyContributionDay = day;
      this.sectDailyContributionClaims = [];
    }
    this.dailyQuestCompletions = {};
    // 缺重置日期的旧档仍保留当天已领取收据，避免迁移时重新开放同一奖励。
    for (const id of this.sectDailyContributionClaims) {
      const q = QUESTS[id];
      if (q?.daily && q.sect) (this.dailyQuestCompletions[q.sect] ??= []).push(id);
    }
    this.save();
    return true;
  }

  canCompleteSectDailyQuest(sourceId: string, now = Date.now()) {
    this.resetDailyQuests(now);
    const q = QUESTS[sourceId];
    return !!q?.daily && dailyRewardsReady(q) && this.sect === q.sect
      && !this.sectDailyContributionClaims.includes(sourceId)
      && !(this.dailyQuestCompletions[q.sect!] ?? []).includes(sourceId)
      && (this.dailyQuestCompletions[q.sect!] ?? []).length < DAILY_QUEST_LIMIT;
  }

  /** 唯一领取判定：新交付与旧贡献回调共用任务 id、日界、每宗限额及存档收据。 */
  private claimSectDailyQuest(sourceId: string, now: number): number | undefined {
    if (!this.canCompleteSectDailyQuest(sourceId, now) || this.quests[sourceId]?.state !== 'done') return undefined;
    const q = QUESTS[sourceId], amount = dailyContribution(q)!;
    this.sectDailyContributionClaims.push(sourceId);
    (this.dailyQuestCompletions[q.sect!] ??= []).push(sourceId);
    return amount;
  }

  onSectDailyQuestCompleted(sourceId: string, now = Date.now()) {
    const amount = this.claimSectDailyQuest(sourceId, now);
    if (amount === undefined) return 0;
    const gained = this.gainSectContribution(amount);
    this.save(); // 显式 0 也必须落领取记录。
    return gained;
  }

  /** 交付已验证目标并扣材料；整条日常的普通奖励与贡献在同一同步事务内保存。 */
  settleSectDailyQuest(sourceId: string, now = Date.now()): DailyQuestReward | undefined {
    const contribution = this.claimSectDailyQuest(sourceId, now);
    if (contribution === undefined) return undefined;
    const q = QUESTS[sourceId], rw = q.rewards;
    const exp = rw.exp ? this.gainExp(rw.exp, this.level)
      : { gained: 0, levels: 0, blocked: false, overflowed: 0, overflowFilled: false };
    this.stones += rw.spiritStone;
    const items = (rw.items ?? []).map(it => {
      if (ITEMS[it.item]?.type === 'equip') return { ...it, equipped: this.gainEquip(it.item) };
      this.addItem(it.item, it.count);
      return { ...it };
    });
    this.grantQuestRecipes(q);
    for (const skill of rw.skills ?? []) this.grantSkill(skill.id, skill.level);
    // 贡献接口负责余额及最后的完整存档，0 时另存，不能再由旧回调追加奖励。
    this.gainSectContribution(contribution);
    this.save();
    return { exp, contribution, items, skills: (rw.skills ?? []).map(skill => skill.id) };
  }

  private equipSum(stat: string) {
    return Object.values(this.equip).reduce((s, id) => s + (ITEMS[id]?.stats?.[stat] ?? 0), 0);
  }
  /** 外观派生自当前装备，不额外存档；旧狐裘表没有 appearance，在代码中兼容。 */
  get appearance(): string | undefined {
    for (const id of Object.values(this.equip)) {
      const appearance = ITEMS[id]?.appearance ?? (id === 'fox_robe' ? 'fox_robe' : undefined);
      if (typeof appearance === 'string' && appearance.length > 0) return appearance;
    }
    return undefined;
  }
  get maxHp() { return Math.round((GROWTH.base.hp + GROWTH.perLevel.hp * (this.level - 1) + this.statBonus('hp') + this.equipSum('hp')) * this.realmMul('hpMul') * this.debuffMul('hp')); }
  get maxMp() { return Math.round((GROWTH.base.mp + GROWTH.perLevel.mp * (this.level - 1) + this.statBonus('mp')) * (1 + this.passiveBonus('mpMaxRatio')) * this.realmMul('mpMul') * this.debuffMul('mp')); }
  /** 突破奖励倍率：已领奖励的境界各乘一次（同一境界重复记录也只算一次） */
  realmMul(key: 'hpMul' | 'mpMul') {
    let m = 1;
    for (const id of new Set(this.realmRewards)) { const v = Number((REALMS.find((r: any) => r.id === id) as any)?.reward?.[key]); if (Number.isFinite(v) && v > 0) m *= v; }
    return m;
  }
  /** 旧存档补发：已经越过的境界（levelMax < 当前等级）都应领过奖励 */
  backfillRealmRewards() {
    if (!Array.isArray(this.realmRewards)) this.realmRewards = [];
    const before = this.realmRewards.length;
    const set = new Set(this.realmRewards);
    for (const r of REALMS as any[]) if (r.levelMax < this.level) set.add(r.id);
    this.realmRewards = [...set];
    return this.realmRewards.length !== before;
  }
  get atk() { return (GROWTH.base.atk + GROWTH.perLevel.atk * (this.level - 1) + this.statBonus('atk') + this.equipSum('atk') + this.passiveBonus('atk')) * this.debuffMul('atk'); }
  /** matk 基础成长尚未落表：登记表显式指定沿 atk 基础，心法神识仍按 statEffects.spirit.matk 换算。 */
  get matk() {
    const fallback = CLASS_RULES.damageBaseFallback;
    const fallbackStats = GROWTH.base.matk == null ? this.statBonus(fallback) : 0;
    const base = GROWTH.base.matk ?? GROWTH.base[fallback] ?? 0;
    const growth = GROWTH.perLevel.matk ?? GROWTH.perLevel[fallback] ?? 0;
    const equipment = Object.values(this.equip).reduce((sum, id) => {
      const stats = ITEMS[id]?.stats ?? {};
      return sum + (stats.matk ?? stats[fallback] ?? 0);
    }, 0);
    return (base + growth * (this.level - 1) + fallbackStats + this.statBonus('matk') + equipment + this.passiveBonus('matk')) * this.debuffMul('matk');
  }
  get def() { return (GROWTH.base.def + GROWTH.perLevel.def * (this.level - 1) + this.statBonus('def') + this.equipSum('def')) * this.debuffMul('def'); }
  /** 突破失败的「境界不稳」：到期前攻防 × (1 + debuffStatRatio)。暂只作用于攻击、防御（气血/灵力上限不动，免得回血逻辑乱） */
  get unstable() { return Date.now() < this.unstableUntil; }
  /** 境界不稳：只对 unstableStats 里列出的属性生效 */
  debuffMul(stat: string) { return Array.isArray(this.unstableStats) && this.unstableStats.includes(stat) ? this.unstableMul : 1; }
  get unstableMul() { return this.unstable ? 1 + this.unstableRatio : 1; }
  /** 突破成功率明细（03 文档 1.3 节 + breakthrough.json）。丹药品质暂按 low（物品还没有品质字段） */
  breakthroughRate(withClearMind = this.count('clear_mind_pill') > 0, quality = 'low') {
    const B = BREAKTHROUGH, r = this.realm;
    const base = Number(r.baseRate ?? 0);
    const pill = Number(B.pillQualityBonus?.[quality] ?? 0);
    const insight = Math.min(B.insightBonusCap ?? 0, this.stat('insight') * (B.insightBonusPerPoint ?? 0));
    const clear = withClearMind ? (B.clearMindPillBonus ?? 0) : 0;
    const pity = this.breakthroughFails * (B.pityPerFail ?? 0);
    const rate = Math.min(B.maxRate ?? 1, base + pill + insight + clear + pity);
    return { rate, base, pill, insight, clear, pity };
  }
  get expNeed() { return EXP_TO_NEXT[String(this.level)] ?? Infinity; }
  get atBreakthrough() { return BREAKTHROUGH_LEVELS.includes(this.level) && this.exp >= this.expNeed; }
  /**
   * 上限 = 卡住这一级、修为条正要填满的数 × overflowPoolRatio。
   * 9 级瓶颈取 exp_curve 的 9→10（382），不用 10→11（312）。
   */
  get overflowCap() {
    const bar = EXP_TO_NEXT[String(this.level)];
    if (bar == null || !Number.isFinite(bar)) return 0;
    return Math.max(0, Math.round(bar * (BREAKTHROUGH.overflowPoolRatio ?? 0.5)));
  }

  /** 葫芦三态：0 空、未满半、到上限满。池子被扣回去时跟着切 */
  get overflowTier(): 'empty' | 'half' | 'full' {
    if (this.overflowExp <= 0) return 'empty';
    if (this.overflowCap > 0 && this.overflowExp >= this.overflowCap) return 'full';
    return 'half';
  }

  /** 玩家打怪伤害：max(1, round(atk·ratio·rand(0.9,1.1) − def))，怪高 n 级 ×max(0.6, 1−0.05n) */
  damageTo(monLevel: number, monDef: number, ratio = 1, damageStat: 'atk' | 'matk' = 'atk', crit = false, critMultiplier = 1.5) {
    const n = monLevel - this.level;
    const gap = n > 0 ? Math.max(0.6, 1 - 0.05 * n) : 1;
    const minRoll = Math.min(1.1, 0.9 + Math.max(0, this.passiveBonus('minDamageRatio')));
    const roll = minRoll + Math.random() * (1.1 - minRoll);
    const attack = damageStat === 'matk' ? this.matk : this.atk;
    return Math.max(1, Math.round((attack * ratio * roll * (crit ? critMultiplier : 1) - monDef) * gap));
  }
  /** 单次技能伤害：元素和暴击先乘攻击，之后每段分别扣防。剑修旧公式保持原样。 */
  skillDamageTo(id: string, level: number, monLevel: number, monDef: number, ratio: number, forceCrit = false) {
    const def = SKILLS[id];
    if (!def) return this.damageTo(monLevel, monDef, ratio);
    const stat = def.effects.damageStat === 'matk' ? 'matk' : 'atk';
    const sameElement = !!this.rootElement && def.effects.element === this.rootElement;
    const elementBonus = sameElement ? this.effectBonus('sameElementDamageBonus') : 0;
    const critMultiplier = skillNumber(def, 'critDamage', level) || 1.5;
    return this.damageTo(monLevel, monDef, ratio * (1 + elementBonus + this.buffBonus('damageBonus')), stat, forceCrit, critMultiplier);
  }
  /** 怪打玩家：同一公式 */
  damageFrom(monAtk: number, ratio = 1) {
    return Math.max(1, Math.round(monAtk * ratio * (0.9 + Math.random() * 0.2) - this.def));
  }

  /** 加修为，返回升了几级。怪比玩家低 5 级以上按 max(0.2, 1−0.1(n−4)) 衰减；突破关口停住 */
  gainExp(base: number, monLevel: number): { gained: number; levels: number; blocked: boolean; overflowed: number; overflowFilled: boolean } {
    const n = this.level - monLevel;
    const raw = Math.max(1, Math.round(base * (n >= 5 ? Math.max(0.2, 1 - 0.1 * (n - 4)) : 1) * (1 + this.statBonus('expBonus'))));
    return this.settleExp(raw);
  }

  /** 闭关公式已经包含境界/灵气/房间倍率，不再套击杀衰减或悟性倍率。 */
  gainCultivation(base: number) { return this.settleExp(Math.max(0, Math.round(base))); }

  private settleExp(raw: number) {
    const before = this.totalExpMark();
    const poolBefore = this.overflowExp;
    const capBefore = this.overflowCap;
    const wasFull = capBefore > 0 && poolBefore >= capBefore;
    this.exp += raw;
    let levels = 0, blocked = false;
    while (this.level < MAX_LEVEL && this.exp >= this.expNeed) {
      if (BREAKTHROUGH_LEVELS.includes(this.level)) {
        const leftover = this.exp - this.expNeed;
        this.exp = this.expNeed; blocked = true;
        if (leftover > 0) this.storeOverflow(leftover);
        break;
      }
      this.exp -= this.expNeed; this.level++; levels++;
    }
    if (levels) { this.hp = this.maxHp; this.mp = this.maxMp; }   // G2：升级回满（瓶颈级本身不升级，不会走到这里）
    // G3：瓶颈期没进修为条的部分不算“获得”；溢出池另计
    const gained = blocked ? Math.max(0, this.totalExpMark() - before) : raw;
    const overflowed = this.overflowExp - poolBefore;
    const overflowFilled = !wasFull && this.overflowCap > 0 && this.overflowExp >= this.overflowCap;
    return { gained, levels, blocked, overflowed, overflowFilled };
  }

  /** G12：修为条满了之后的结余全额存入，到上限（卡住那级 × overflowPoolRatio）截断 */
  private storeOverflow(leftover: number) {
    const want = Math.max(0, Math.round(leftover));
    const space = Math.max(0, this.overflowCap - this.overflowExp);
    this.overflowExp += Math.min(want, space);
  }

  /** 当前等级之前累计的修为 + 本级修为，用来算实际加了多少 */
  private totalExpMark() { let t = this.exp; for (let lv = 1; lv < this.level; lv++) t += EXP_TO_NEXT[String(lv)] ?? 0; return t; }

  /**
   * 突破失败扣修为。失败演出还没接进来，先把扣法定死：
   * 扣减量 = round(当前修为条 × ratio)，先扣溢出池，不够的部分再扣修为条。
   * ratio 由调用方传入（realms.json 的 failPenalty.expLossRatio）。
   */
  applyBreakthroughFail(ratio: number): { lost: number; fromPool: number; fromBar: number } {
    const r = Number.isFinite(ratio) ? Math.max(0, ratio) : 0;
    const loss = Math.max(0, Math.round(this.exp * r));
    const fromPool = Math.min(this.overflowExp, loss);
    const fromBar = Math.min(this.exp, loss - fromPool);
    this.overflowExp -= fromPool;
    this.exp -= fromBar;
    return { lost: fromPool + fromBar, fromPool, fromBar };
  }

  /** 突破：瓶颈级修为满 → 进入下一级，溢出池全部返还进新境界的修为（上限是瓶颈级修为条的一半） */
  breakthrough() {
    if (!this.atBreakthrough) return false;
    const pool = this.overflowExp;
    const left = this.realm.id;
    if (!this.realmRewards.includes(left)) this.realmRewards.push(left);
    this.overflowExp = 0;
    this.lastOverflowReturned = pool;
    this.exp = 0; this.level++;
    this.exp = pool;
    let bonus = 0;
    while (this.level < MAX_LEVEL && this.exp >= this.expNeed) {
      if (BREAKTHROUGH_LEVELS.includes(this.level)) { this.exp = this.expNeed; break; }
      this.exp -= this.expNeed; this.level++; bonus++;
    }
    this.breakthroughBonusLevels = bonus;
    this.hp = this.maxHp; this.mp = this.maxMp;
    return true;
  }

  count(id: string) { return this.inventory[id] ?? 0; }
  removeItem(id: string, n: number) {
    if (!Number.isFinite(n) || n <= 0) return;
    let left = Math.min(this.count(id), Math.floor(n));
    if (this.pillQualities[id]) {
      const qualities = this.pillQualityCounts(id);
      for (const quality of ['low', 'mid', 'high', 'supreme'] as PillQuality[]) {
        const used = Math.min(left, qualities[quality]); qualities[quality] -= used; left -= used;
      }
      this.pillQualities[id] = qualities;
    }
    this.inventory[id] = Math.max(0, this.count(id) - Math.floor(n));
  }

  pillQualityCounts(id: string): Record<PillQuality, number> {
    const counts: Record<PillQuality, number> = { low: 0, mid: 0, high: 0, supreme: 0 };
    let remaining = Math.max(0, this.count(id));
    for (const quality of ['low', 'mid', 'high', 'supreme'] as PillQuality[]) {
      const raw = Number(this.pillQualities[id]?.[quality]);
      const n = Number.isFinite(raw) ? Math.min(remaining, Math.max(0, Math.floor(raw))) : 0;
      counts[quality] = n; remaining -= n;
    }
    counts.low += remaining;
    return counts;
  }
  /** 与 removeItem 消耗顺序一致；老丹药及材料没有分桶时按下品。 */
  pillQuality(id: string): PillQuality {
    const counts = this.pillQualityCounts(id);
    return (['low', 'mid', 'high', 'supreme'] as PillQuality[]).find(quality => counts[quality] > 0) ?? 'low';
  }
  addCraftedPill(id: string, n: number, quality: PillQuality) {
    if (!Number.isFinite(n) || n <= 0) return;
    const counts = this.pillQualityCounts(id);
    this.addItem(id, Math.floor(n)); counts[quality] += Math.floor(n);
    this.pillQualities[id] = counts;
  }

  grantRecipe(id: string) {
    if (!RECIPES[id] || this.learnedRecipes.includes(id)) return false;
    this.learnedRecipes.push(id); return true;
  }
  grantQuestRecipes(q: QuestDef) {
    const granted: string[] = [];
    for (const id of q.rewards.recipes ?? []) if (this.grantRecipe(id)) granted.push(id);
    return granted;
  }
  /** 公式字段当前是说明文本；只解析明确的乘数，不执行表内表达式。 */
  get alchemyExpNeed() {
    const multiplier = Number(ALCHEMY_RULES.alchemyExp.toNext.match(/(\d+(?:\.\d+)?)\s*×/)?.[1] ?? 50);
    return this.alchemyLevel >= ALCHEMY_RULES.alchemyExp.maxLevel ? Infinity : multiplier * this.alchemyLevel;
  }
  gainAlchemyExp(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0 || this.alchemyLevel >= ALCHEMY_RULES.alchemyExp.maxLevel) return 0;
    this.alchemyExp += Math.floor(amount);
    let levels = 0;
    while (this.alchemyLevel < ALCHEMY_RULES.alchemyExp.maxLevel && this.alchemyExp >= this.alchemyExpNeed) {
      this.alchemyExp -= this.alchemyExpNeed; this.alchemyLevel++; levels++;
    }
    if (this.alchemyLevel >= ALCHEMY_RULES.alchemyExp.maxLevel) this.alchemyExp = 0;
    return levels;
  }
  /** 获得装备：对应栏位空着或新装备更强就自动换上（装备界面做好前的过渡） */
  gainEquip(id: string) {
    const it = ITEMS[id] as any; if (!it?.slot) return false;
    if (it.sect && it.sect !== this.sect) { this.addItem(id, 1); return false; }
    if ((it.reqLevel ?? 1) > this.level) { this.addItem(id, 1); return false; }
    const cur = this.equip[it.slot];
    const score = (x?: string) => x ? Object.values(ITEMS[x]?.stats ?? {}).reduce((a, b) => a + b, 0) : -1;
    if (score(id) > score(cur)) { if (cur) this.addItem(cur, 1); this.equip[it.slot] = id; return true; }
    this.addItem(id, 1); return false;
  }

  addItem(id: string, n: number) { this.inventory[id] = (this.inventory[id] ?? 0) + n; }
  /** 当前背包没有槽位上限；调用方先查物品表，此处拒绝非法和溢出数量。 */
  canReceiveItem(id: string, n = 1) {
    const count = this.count(id);
    return !!id && Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger(count) && count >= 0
      && Number.isSafeInteger(count + n);
  }
  addTrialItem(id: string, n: number) {
    this.addItem(id, n);
    this.transientItems[id] = (this.transientItems[id] ?? 0) + n;
  }
  removeTrialItem(id: string, n: number) {
    const count = Math.min(n, this.transientItems[id] ?? 0);
    this.removeItem(id, count);
    this.transientItems[id] = Math.max(0, (this.transientItems[id] ?? 0) - count);
  }

  /** 旧档缺字段时补上，避免 Object.assign 把后面新增的数组弄丢或弄短。 */
  ensureDefaults() {
    if (!this.skills || typeof this.skills !== 'object') this.skills = {};
    if (!this.skillGifted || typeof this.skillGifted !== 'object') this.skillGifted = {};
    if (!this.skillMastery || typeof this.skillMastery !== 'object') this.skillMastery = {};
    if (!this.inventory || typeof this.inventory !== 'object') this.inventory = {};
    if (!this.equip || typeof this.equip !== 'object') this.equip = {};
    if (!this.quests || typeof this.quests !== 'object') this.quests = {};
    if (!Array.isArray(this.learnedRecipes)) this.learnedRecipes = [];
    this.learnedRecipes = [...new Set(this.learnedRecipes.filter(id => typeof id === 'string' && !!RECIPES[id]))];
    const alchemyLevel = Number(this.alchemyLevel), alchemyExp = Number(this.alchemyExp);
    this.alchemyLevel = Number.isFinite(alchemyLevel) ? Math.min(ALCHEMY_RULES.alchemyExp.maxLevel, Math.max(1, Math.floor(alchemyLevel))) : 1;
    this.alchemyExp = Number.isFinite(alchemyExp) ? Math.max(0, Math.floor(alchemyExp)) : 0;
    if (!this.pillQualities || typeof this.pillQualities !== 'object' || Array.isArray(this.pillQualities)) this.pillQualities = {};
    for (const id of Object.keys(this.pillQualities)) {
      if (!ITEMS[id] || this.count(id) <= 0) delete this.pillQualities[id];
      else this.pillQualities[id] = this.pillQualityCounts(id);
    }
    if (!this.gatherRespawnAt || typeof this.gatherRespawnAt !== 'object' || Array.isArray(this.gatherRespawnAt)) this.gatherRespawnAt = {};
    this.gatherRespawnAt = Object.fromEntries(Object.entries(this.gatherRespawnAt).filter(([, at]) => typeof at === 'number' && Number.isFinite(at) && at > 0));
    if (!isBrewSession(this.pendingAlchemy, this.learnedRecipes)) this.pendingAlchemy = null;
    for (const st of Object.values(this.quests)) {
      if (!st || typeof st !== 'object') continue;
      if (!st.kills || typeof st.kills !== 'object') st.kills = {};
      if (!st.crafted || typeof st.crafted !== 'object' || Array.isArray(st.crafted)) st.crafted = {};
      st.crafted = Object.fromEntries(Object.entries(st.crafted).map(([id, n]) => [id, Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0]));
    }
    if (typeof this.job !== 'string') this.job = '';
    if (!Number.isFinite(this.classVersion)) this.classVersion = 0;
    if (!Array.isArray(this.classRewardClaims)) this.classRewardClaims = [];
    this.classRewardClaims = [...new Set(this.classRewardClaims.filter(id => typeof id === 'string' && !!classDef(id)))];
    this.classRefundSp = Math.max(0, Math.floor(Number(this.classRefundSp) || 0));
    if (typeof this.rootElement !== 'string') this.rootElement = '';
    if (!Array.isArray(this.completedTrials)) this.completedTrials = [];
    this.completedTrials = [...new Set(this.completedTrials.filter(id => typeof id === 'string' && id.length > 0))];
    if (!this.skillCooldowns || typeof this.skillCooldowns !== 'object' || Array.isArray(this.skillCooldowns)) this.skillCooldowns = {};
    this.skillCooldowns = Object.fromEntries(Object.entries(this.skillCooldowns).filter(([id, cd]) => SKILLS[id] && cd
      && Number.isFinite(cd.readyAt) && cd.readyAt > Date.now() && Number.isFinite(cd.total) && cd.total > 0));
    if (typeof this.spTipShown !== 'boolean') this.spTipShown = false;
    if (!Array.isArray(this.tutorialsSeen)) this.tutorialsSeen = [];
    this.tutorialsSeen = [...new Set(this.tutorialsSeen.filter(id => typeof id === 'string' && id.length > 0))];
    const contribution = Number(this.sectContribution);
    this.sectContribution = Number.isFinite(contribution) ? Math.max(0, Math.floor(contribution)) : 0;
    if (typeof this.sectDailyContributionDay !== 'string') this.sectDailyContributionDay = '';
    if (!Array.isArray(this.sectDailyContributionClaims)) this.sectDailyContributionClaims = [];
    this.sectDailyContributionClaims = [...new Set(this.sectDailyContributionClaims.filter(id => typeof id === 'string' && id.length > 0))];
    if (typeof this.dailyQuestResetDay !== 'string') this.dailyQuestResetDay = '';
    if (!this.dailyQuestCompletions || typeof this.dailyQuestCompletions !== 'object' || Array.isArray(this.dailyQuestCompletions)) this.dailyQuestCompletions = {};
    for (const [sect, ids] of Object.entries(this.dailyQuestCompletions)) {
      this.dailyQuestCompletions[sect] = Array.isArray(ids) ? [...new Set(ids.filter(id => typeof id === 'string' && QUESTS[id]?.daily && QUESTS[id].sect === sect))] : [];
    }
    this.age = Number.isFinite(Number(this.age)) ? Math.max(LIFESPAN.startAge, Number(this.age)) : LIFESPAN.startAge;
    this.ageUpdatedAt = Number.isFinite(Number(this.ageUpdatedAt)) && this.ageUpdatedAt > 0 ? Math.min(Date.now(), this.ageUpdatedAt) : Date.now();
    if (typeof this.seclusionDay !== 'string') this.seclusionDay = '';
    this.seclusionYearsToday = Math.max(0, Math.floor(Number(this.seclusionYearsToday) || 0));
    if (!Array.isArray(this.seclusionHistory)) this.seclusionHistory = [];
    this.seclusionHistory = this.seclusionHistory.filter(x => x && Number.isFinite(x.at) && x.years > 0).slice(-20);
    if (!Array.isArray(this.hotbar)) this.hotbar = [];
    while (this.hotbar.length < HOTBAR_SLOTS.length) this.hotbar.push(null);
    if (this.hotbar.length > HOTBAR_SLOTS.length) this.hotbar.length = HOTBAR_SLOTS.length;
    if (!Array.isArray(this.buffs)) this.buffs = [];
    const now = Date.now();
    this.buffs = this.buffs.filter(b => b && typeof b.expireAt === 'number' && b.expireAt > now);
  }

  get lifespanCap() { return Number((LIFESPAN.cap as Record<string, number>)[this.realm.id] ?? LIFESPAN.cap.mortal); }
  get remainingLife() { return Math.max(0, this.lifespanCap - this.age); }
  advanceAge(now = Date.now()) {
    const elapsed = Math.max(0, now - this.ageUpdatedAt);
    this.age += elapsed / 3600000 * LIFESPAN.agePerRealHour;
    this.ageUpdatedAt = now;
  }

  /**
   * 已完成 q_breakthrough / q_fox、但存档里没有对应功法时补发。
   * 和任务交付走同一条 grantSkill：不检查前置。
   */
  backfillQuestSkills() {
    let changed = false;
    for (const qid of QUEST_SKILL_BACKFILL) {
      if (this.quests[qid]?.state !== 'done') continue;
      for (const s of QUESTS[qid]?.rewards.skills ?? []) {
        const def = SKILLS[s.id];
        // 转职后的刷新不可再把灵气弹/其他宗门的旧任务技能塞回快捷栏。
        if (this.job && (!def || CLASS_RULES.replaceCommonSkills.includes(s.id) || !this.ownsSkill(def))) continue;
        if (this.grantSkill(s.id, s.level)) changed = true;
      }
    }
    return changed;
  }

  backfillQuestRecipes() {
    let changed = false;
    for (const [id, st] of Object.entries(this.quests)) {
      if (st?.state === 'done' && QUESTS[id]) changed = this.grantQuestRecipes(QUESTS[id]).length > 0 || changed;
    }
    // 教学回春丹必须先于 craft 目标可用；旧进行中存档同样补上。
    if (this.quests.q_alchemy_intro?.state === 'active') changed = this.grantRecipe('recipe_hp_pill') || changed;
    return changed;
  }

  skillLevel(id: string) { return this.skills?.[id] ?? 0; }

  get classSkills() { return skillsForClass(this.job); }
  get sect() { return classDef(this.job)?.sect ?? ''; }
  /** 未拜入沿用原剑修技能窗口；拜宗后过滤其他宗门的技能和被动。 */
  ownsSkill(def: SkillDef) { return !def.sect || def.sect === (this.sect || CLASS_RULES.unjoinedSkillSect); }

  /**
   * 拜入只能发生一次。技能点来自已得点数减去现有已花点数，删入门技自然退点；
   * 剑徒迁移不重排等级/熟练度/快捷键，其他职业重新生成本宗快捷栏。
   */
  advanceClass(job: string, initializeSectRank = true): boolean {
    const c = classDef(job);
    if (!c || this.level < classMinLevel(c) || (this.job && this.job !== c.id)) return false;
    const firstJoin = !this.job;
    const migrating = this.classVersion < 1;
    let changed = firstJoin || migrating;
    this.job = c.id;
    if (initializeSectRank && firstJoin && this.sectRank === null) this.sectRank = SECT_RANKS.rules.initialRank;
    if (firstJoin || migrating) {
      for (const id of Object.keys(this.skills)) {
        const def = SKILLS[id];
        if (CLASS_RULES.replaceCommonSkills.includes(id) || (def?.sect && def.sect !== c.sect)) {
          if (CLASS_RULES.replaceCommonSkills.includes(id)) this.classRefundSp += Math.max(0, this.skillLevel(id) - (this.skillGifted[id] ?? 0)) * (def?.spCost ?? 1);
          delete this.skills[id]; delete this.skillGifted[id]; delete this.skillMastery[id];
          this.hotbar = this.hotbar.map(bound => bound === id ? null : bound);
          this.buffs = this.buffs.filter(buff => buff.id !== id);
          changed = true;
        }
      }
      // 未入宗/已有剑徒的自定义栏位保留；四宗按本宗技能树重新绑定。
      if (c.sect !== CLASS_RULES.unjoinedSkillSect) this.hotbar = Array.from({ length: HOTBAR_SLOTS.length }, () => null);
    }
    for (const gift of classGiftSkills(c)) changed = this.grantSkill(gift.id, gift.level) || changed;
    if (c.sect !== CLASS_RULES.unjoinedSkillSect && (firstJoin || migrating)) for (const skill of this.classSkills) this.autoBind(skill.id);
    if (!this.classRewardClaims.includes(c.id)) {
      const robe = classRobe(c);
      if (robe && this.equip.robe !== robe) {
        if (!firstJoin && c.sect === CLASS_RULES.unjoinedSkillSect) {
          // 老剑徒的穿戴保持原样，未领过的宗门道袍补进背包。
          if (this.count(robe) <= 0) this.addItem(robe, 1);
        } else {
          if (this.count(robe) > 0) this.removeItem(robe, 1);
          if (this.equip.robe) this.addItem(this.equip.robe, 1);
          this.equip.robe = robe;
        }
      }
      this.classRewardClaims.push(c.id); changed = true;
    }
    this.classVersion = 1;
    if (changed) this.save();
    return true;
  }

  /** 旧档已有职业或已交付拜入任务，自动补登记/奖励；q_fox 本身不替未入宗者选宗。 */
  backfillClass(initializeSectRank = true): boolean {
    const c = classDef(this.job) ?? Object.keys(this.quests).map(classForQuest).find(candidate => candidate && this.quests[candidate.joinQuest]?.state === 'done');
    if (!c) return false;
    const before = JSON.stringify({ job: this.job, classVersion: this.classVersion, skills: this.skills, hotbar: this.hotbar, claims: this.classRewardClaims, equip: this.equip });
    this.advanceClass(c.id, initializeSectRank);
    return before !== JSON.stringify({ job: this.job, classVersion: this.classVersion, skills: this.skills, hotbar: this.hotbar, claims: this.classRewardClaims, equip: this.equip });
  }

  /** 被动心法加成。只统计 type=passive，buff 的 speed/jump 不走这里。 */
  passiveBonus(key: string) {
    let v = 0;
    for (const [id, lv] of Object.entries(this.skills ?? {})) {
      if (!(lv > 0)) continue;
      const def = SKILLS[id];
      if (!def || def.type !== 'passive' || !this.ownsSkill(def)) continue;
      v += skillNumber(def, key, lv);
    }
    return v;
  }

  buffActive(id: string) { return this.buffs.some(b => b.id === id && b.expireAt > Date.now()); }
  /** 布尔效果不经过 skillNumber，避免 invisible 被当成数字 0。 */
  hasBuffEffect(key: string) {
    return this.buffs.some(buff => {
      const def = SKILLS[buff.id];
      return buff.expireAt > Date.now() && !!def && this.ownsSkill(def) && this.skillLevel(def.id) > 0 && def.effects[key] === true;
    });
  }
  buffBonus(key: string) {
    let value = 0;
    const counted = new Set<string>();
    for (const buff of this.buffs) {
      if (buff.expireAt <= Date.now() || counted.has(buff.id)) continue;
      const def = SKILLS[buff.id], level = this.skillLevel(buff.id);
      if (!def || !this.ownsSkill(def) || level <= 0) continue;
      counted.add(buff.id); value += skillNumber(def, key, level);
    }
    return value;
  }
  effectBonus(key: string) { return this.passiveBonus(key) + this.buffBonus(key); }
  buffRemaining(id: string) {
    const b = this.buffs.find(x => x.id === id);
    return b ? Math.max(0, b.expireAt - Date.now()) : 0;
  }

  /**
   * 当前速度 / 跳跃点数。基础 100，加上装备 stats，轻身术生效时再把 perLevel×等级加进去（加法，不是倍率）。
   */
  currentMovePoints() {
    let speed = (GROWTH.base.speed ?? 100) + this.equipSum('speed') + this.statBonus('speed');
    let jump = (GROWTH.base.jump ?? 100) + this.equipSum('jump') + this.statBonus('jump');
    speed += this.effectBonus('speed'); jump += this.effectBonus('jump');
    return { speed, jump };
  }

  spEarned(job: number) { return spEarnedFor(this.level, job, !!this.job) + (job === CLASS_RULES.advanceJob ? this.classRefundSp : 0); }
  spSpent(job: number) {
    let n = 0;
    for (const [id, lv] of Object.entries(this.skills)) {
      const def = SKILLS[id];
      if (!def || def.job !== job || !this.ownsSkill(def)) continue;
      const gifted = Math.min(this.skillGifted[id] ?? 0, lv);
      n += Math.max(0, lv - gifted) * (def.spCost ?? 1);
    }
    return n;
  }
  spLeftFor(job: number) { return Math.max(0, this.spEarned(job) - this.spSpent(job)); }

  skillCap(def: SkillDef) {
    let cap = def.maxLevel;
    const mastery = this.skillMastery[def.id] ?? 0;
    if (def.masteryToCap > 0 && mastery >= def.masteryToCap) cap += SKILL_RULES.masteryCapBonus ?? 0;
    return cap;
  }

  /** 玩家自己加点才检查前置和等级上限。 */
  prereqMet(def: SkillDef) {
    const band = spBand(def.job);
    if (band && this.level < band.min) return false;
    const c = classDef(this.job);
    if (c && this.level < classMinLevel(c)) return false;
    const req = def.req;
    if (!req) return true;
    for (const [k, v] of Object.entries(req)) {
      if (k === 'level' || k === 'reqLevel') {
        if (this.level < Number(v)) return false;
      } else if (k === 'realm') {
        const realm = REALMS.find((r: { id: string; levelMin: number }) => r.id === v);
        if (realm ? this.level < realm.levelMin : this.realm?.id !== v) return false;
      } else if (k === 'item') {
        if (this.count(String(v)) <= 0) return false;
      } else if (this.skillLevel(k) < Number(v)) return false;
    }
    return true;
  }

  reqText(def: SkillDef) {
    const req = def.req;
    const parts: string[] = [];
    const minLevel = Math.max(spBand(def.job)?.min ?? 0, classDef(this.job) ? classMinLevel(classDef(this.job)!) : 0);
    if (this.level < minLevel) parts.push(`角色 ${minLevel}级`);
    for (const [k, v] of Object.entries(req ?? {})) {
      if (k === 'level' || k === 'reqLevel') {
        if (this.level < Number(v)) parts.push(`角色 ${v}级`);
      } else if (k === 'realm') {
        const realm = REALMS.find((r: { id: string; name?: string; levelMin: number }) => r.id === v);
        if (realm && this.level < realm.levelMin) parts.push(realm.name ?? String(v));
      } else if (k === 'item') {
        if (this.count(String(v)) <= 0) parts.push(ITEMS[String(v)]?.name ?? String(v));
      } else if (this.skillLevel(k) < Number(v)) parts.push(`${SKILLS[k]?.name ?? k} ${v}级`);
    }
    return parts.join('、');
  }

  /**
   * 直接学会到至少 level 级。任务奖励用这条，不检查前置。
   * 新给的等级记进 skillGifted，升级不花技能点。
   */
  grantSkill(id: string, level: number) {
    if (!SKILLS[id] || !this.ownsSkill(SKILLS[id]) || !(level > 0)) return false;
    const cur = this.skillLevel(id);
    if (level <= cur) return false;
    this.skillGifted[id] = (this.skillGifted[id] ?? 0) + (level - cur);
    this.skills[id] = level;
    this.autoBind(id);
    return true;
  }

  addSkillPoint(id: string): { ok: true } | { ok: false; reason: 'missing' | 'locked' | 'max' | 'req' | 'sp'; req?: string } {
    const def = SKILLS[id];
    if (!def) return { ok: false, reason: 'missing' };
    if (!this.skillsUnlocked || !this.ownsSkill(def)) return { ok: false, reason: 'locked' };
    if (this.skillLevel(id) >= this.skillCap(def)) return { ok: false, reason: 'max' };
    if (!this.prereqMet(def)) return { ok: false, reason: 'req', req: this.reqText(def) };
    const cost = def.spCost ?? 1;
    if (this.spLeftFor(def.job) < cost) return { ok: false, reason: 'sp' };
    this.skills[id] = this.skillLevel(id) + 1;
    if (def.type !== 'passive') this.autoBind(id);
    this.save();
    return { ok: true };
  }

  skillMpCost(id: string) {
    const def = SKILLS[id];
    const lv = this.skillLevel(id);
    if (!def || lv <= 0) return 0;
    const raw = Math.max(0, skillNumber(def, 'mpCost', lv));
    const reduce = Math.min(0.9, Math.max(0, this.passiveBonus('mpCostReduce')));
    return raw * (1 - reduce);
  }

  skillAttackRate(def: SkillDef) {
    return def.effects.attackSpeedAffectsCooldown ? 1 + Math.max(0, this.effectBonus('attackSpeedRatio')) : 1;
  }
  skillRecoverMs(id: string) {
    const def = SKILLS[id];
    return def ? actOf(def).recoverMs / this.skillAttackRate(def) : 0;
  }
  /** 0 独立冷却仍受后摇约束，快捷栏也沿用原来的后摇遮罩。 */
  skillCooldownMs(id: string) {
    const def = SKILLS[id], lv = this.skillLevel(id);
    if (!def || lv <= 0) return 0;
    return Math.max(0, skillNumber(def, 'cooldownMs', lv), actOf(def).recoverMs) / this.skillAttackRate(def);
  }

  addMastery(id: string, hits = 1) {
    const def = SKILLS[id];
    if (!def?.masteryPerHit || hits <= 0) return;
    const cap = def.masteryToCap > 0 ? def.masteryToCap : Infinity;
    this.skillMastery[id] = Math.min(cap, (this.skillMastery[id] ?? 0) + def.masteryPerHit * hits);
  }

  /** 主动和增益放进快捷栏。default:A 优先占 A 格，被动不占格。 */
  autoBind(id: string) {
    const def = SKILLS[id];
    if (!def || !this.ownsSkill(def) || def.type === 'passive' || this.skillLevel(id) <= 0) return;
    if (this.hotbar.includes(id)) return;
    let idx = -1;
    const label = def.key?.match(/^default:(.+)$/)?.[1];
    if (label) {
      const i = HOTBAR_SLOTS.findIndex(s => s.label === label);
      if (i >= 0 && !this.hotbar[i]) idx = i;
    }
    if (idx < 0) idx = this.hotbar.findIndex(s => !s);
    if (idx >= 0) this.hotbar[idx] = id;
  }

  bindHotbar(slot: number, id: string | null) {
    if (slot < 0 || slot >= this.hotbar.length) return false;
    if (id) {
      const def = SKILLS[id];
      if (!def || !this.ownsSkill(def) || def.type === 'passive' || this.skillLevel(id) <= 0) return false;
      this.hotbar = this.hotbar.map(s => (s === id ? null : s));
    }
    this.hotbar[slot] = id;
    this.save();
    return true;
  }
}
