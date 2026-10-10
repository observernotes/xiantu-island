import { GROWTH, EXP_TO_NEXT, MAX_LEVEL, ITEMS, BREAKTHROUGH_LEVELS, BREAKTHROUGH, REALMS, QUESTS, LIFESPAN, RECIPES, ALCHEMY_RULES, PillQuality, QuestDef } from './data';
import { HOTBAR_SLOTS, QUEST_SKILL_BACKFILL, SKILLS, SKILL_RULES, SkillDef, skillNumber, spEarnedFor } from './skills';
import { SECT_SECLUSION } from './data';
import { realDay } from './Seclusion';

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
  quests: Record<string, { state: 'active' | 'done'; kills: Record<string, number>; crafted?: Record<string, number>; reached?: boolean; talked?: Record<string, boolean> }> = {};
  /** 已学配方包含丹方、研墨和符方；具体工作台按 type 筛选。 */
  learnedRecipes: string[] = [];
  alchemyLevel = 1;
  alchemyExp = 0;
  /** 品质分桶与普通背包共存，旧档未分桶的丹药视为下品。 */
  pillQualities: Record<string, Partial<Record<PillQuality, number>>> = {};
  /** 地图 id:采集对象名 → 再生的绝对毫秒时间，换图/刷新后保持。 */
  gatherRespawnAt: Record<string, number> = {};
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
  sectDailyContributionDay = '';
  sectDailyContributionClaims: string[] = [];
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
  stat(k: string) { return (AUTO_STATS[k] ?? 0) * (this.level - 1); }
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

  save() {
    const { transientItems, ...persistent } = this;
    const inventory: Record<string, number> = { ...this.inventory };
    for (const [id, count] of Object.entries(transientItems)) inventory[id] = Math.max(0, this.count(id) - count);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...persistent, inventory })); } catch { /* 无痕模式等 */ }
  }
  static load(): Progress {
    const p = new Progress();
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) Object.assign(p, JSON.parse(raw)); } catch { /* 存档损坏就重开 */ }
    p.overflowExp = Math.max(0, Math.floor(Number(p.overflowExp) || 0));
    if (Number.isFinite(p.overflowCap)) p.overflowExp = Math.min(p.overflowExp, p.overflowCap);
    p.ensureDefaults();
    p.advanceAge();
    const backfilled = [p.backfillRealmRewards(), p.backfillQuestSkills(), p.backfillQuestRecipes()].some(Boolean);
    p.hp = Math.min(p.hp || p.maxHp, p.maxHp); p.mp = Math.min(p.mp || p.maxMp, p.maxMp);
    if (backfilled) p.save();
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

  /**
   * 宗门日常完成回调：调用方须先验证日常任务来源，同日同来源只发一次。
   * TODO(策划)：quests 缺宗门日常分类、重置规则/奖励字段，NPC 也未配日常入口；暂不挂主线或虚构领取按钮。
   */
  onSectDailyQuestCompleted(sourceId: string, now = Date.now()) {
    if (!sourceId) return 0;
    const day = realDay(now);
    if (this.sectDailyContributionDay !== day) { this.sectDailyContributionDay = day; this.sectDailyContributionClaims = []; }
    if (this.sectDailyContributionClaims.includes(sourceId)) return 0;
    this.sectDailyContributionClaims.push(sourceId);
    return this.gainSectContribution(SECT_SECLUSION.dailyQuestContribution);
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
  damageTo(monLevel: number, monDef: number, ratio = 1) {
    const n = monLevel - this.level;
    const gap = n > 0 ? Math.max(0.6, 1 - 0.05 * n) : 1;
    const minRoll = Math.min(1.1, 0.9 + Math.max(0, this.passiveBonus('minDamageRatio')));
    const roll = minRoll + Math.random() * (1.1 - minRoll);
    return Math.max(1, Math.round((this.atk * ratio * roll - monDef) * gap));
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
    if ((it.reqLevel ?? 1) > this.level) { this.addItem(id, 1); return false; }
    const cur = this.equip[it.slot];
    const score = (x?: string) => x ? Object.values(ITEMS[x]?.stats ?? {}).reduce((a, b) => a + b, 0) : -1;
    if (score(id) > score(cur)) { if (cur) this.addItem(cur, 1); this.equip[it.slot] = id; return true; }
    this.addItem(id, 1); return false;
  }

  addItem(id: string, n: number) { this.inventory[id] = (this.inventory[id] ?? 0) + n; }
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
    for (const st of Object.values(this.quests)) {
      if (!st || typeof st !== 'object') continue;
      if (!st.kills || typeof st.kills !== 'object') st.kills = {};
      if (!st.crafted || typeof st.crafted !== 'object' || Array.isArray(st.crafted)) st.crafted = {};
      st.crafted = Object.fromEntries(Object.entries(st.crafted).map(([id, n]) => [id, Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0]));
    }
    if (typeof this.job !== 'string') this.job = '';
    if (typeof this.spTipShown !== 'boolean') this.spTipShown = false;
    if (!Array.isArray(this.tutorialsSeen)) this.tutorialsSeen = [];
    this.tutorialsSeen = [...new Set(this.tutorialsSeen.filter(id => typeof id === 'string' && id.length > 0))];
    const contribution = Number(this.sectContribution);
    this.sectContribution = Number.isFinite(contribution) ? Math.max(0, Math.floor(contribution)) : 0;
    if (typeof this.sectDailyContributionDay !== 'string') this.sectDailyContributionDay = '';
    if (!Array.isArray(this.sectDailyContributionClaims)) this.sectDailyContributionClaims = [];
    this.sectDailyContributionClaims = [...new Set(this.sectDailyContributionClaims.filter(id => typeof id === 'string' && id.length > 0))];
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
      for (const s of QUESTS[qid]?.rewards.skills ?? []) if (this.grantSkill(s.id, s.level)) changed = true;
    }
    return changed;
  }

  backfillQuestRecipes() {
    let changed = false;
    for (const [id, st] of Object.entries(this.quests)) {
      if (st.state === 'done' && QUESTS[id]) changed = this.grantQuestRecipes(QUESTS[id]).length > 0 || changed;
    }
    // 教学回春丹必须先于 craft 目标可用；旧进行中存档同样补上。
    if (this.quests.q_alchemy_intro?.state === 'active') changed = this.grantRecipe('recipe_hp_pill') || changed;
    return changed;
  }

  skillLevel(id: string) { return this.skills?.[id] ?? 0; }

  /** 被动心法加成。只统计 type=passive，buff 的 speed/jump 不走这里。 */
  passiveBonus(key: string) {
    let v = 0;
    for (const [id, lv] of Object.entries(this.skills ?? {})) {
      if (!(lv > 0)) continue;
      const def = SKILLS[id];
      if (!def || def.type !== 'passive') continue;
      v += skillNumber(def, key, lv);
    }
    return v;
  }

  buffActive(id: string) { return this.buffs.some(b => b.id === id && b.expireAt > Date.now()); }
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
    if (this.buffActive('light_body')) {
      const lv = this.skillLevel('light_body');
      const def = SKILLS.light_body;
      if (def && lv > 0) {
        speed += skillNumber(def, 'speed', lv);
        jump += skillNumber(def, 'jump', lv);
      }
    }
    return { speed, jump };
  }

  spEarned(job: number) { return spEarnedFor(this.level, job, !!this.job); }
  spSpent(job: number) {
    let n = 0;
    for (const [id, lv] of Object.entries(this.skills)) {
      const def = SKILLS[id];
      if (!def || def.job !== job) continue;
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
    const req = def.req;
    if (!req) return true;
    for (const [k, v] of Object.entries(req)) {
      if (k === 'realm') {
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
    if (!req) return '';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(req)) {
      if (k === 'realm') {
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
    if (!SKILLS[id] || !(level > 0)) return false;
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
    if (!this.skillsUnlocked) return { ok: false, reason: 'locked' };
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

  addMastery(id: string, hits = 1) {
    const def = SKILLS[id];
    if (!def?.masteryPerHit || hits <= 0) return;
    const cap = def.masteryToCap > 0 ? def.masteryToCap : Infinity;
    this.skillMastery[id] = Math.min(cap, (this.skillMastery[id] ?? 0) + def.masteryPerHit * hits);
  }

  /** 主动和增益放进快捷栏。default:A 优先占 A 格，被动不占格。 */
  autoBind(id: string) {
    const def = SKILLS[id];
    if (!def || def.type === 'passive' || this.skillLevel(id) <= 0) return;
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
      if (!def || def.type === 'passive' || this.skillLevel(id) <= 0) return false;
      this.hotbar = this.hotbar.map(s => (s === id ? null : s));
    }
    this.hotbar[slot] = id;
    this.save();
    return true;
  }
}
