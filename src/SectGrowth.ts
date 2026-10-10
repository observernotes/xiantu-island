import { ITEMS, NPCS, REALMS, SECT_RANKS, SHOPS, inPhase, t, type ItemDef, type NpcDef, type SectRankDef, type SectRanksConfig, type SectShopGood, type ShopEntry } from './data';
import { SKILLS, type SkillDef } from './skills';
import { dailyQuestDay } from './DailyQuests';
import type { Progress } from './Progress';

type DeepReadonly<T> = T extends (...args: any[]) => any ? T : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type SectServiceType = 'sect_promotion' | 'sect_shop' | 'sect_library';
export interface SectGrowthConfig {
  ranks: SectRanksConfig;
  npcs: Record<string, NpcDef>;
  shops: Record<string, ShopEntry[]>;
  items: Record<string, ItemDef>;
  realms: { id: string; name: string; levelMin: number }[];
  skills: Record<string, SkillDef>;
}
export interface SectGrowthReceipt { kind: 'donation' | 'shop' | 'promotion'; sect: string; sourceId: string; day: string }
export interface SectGrowthState {
  donationDay?: string;
  donationBatches?: Record<string, number>;
  settledTransactions: Record<string, SectGrowthReceipt>;
}
export interface SectGrowthResult { ok: boolean; key: string; repeated?: boolean }
export interface SectIdentity {
  sect: string; rankId: string; name: string; title: string; icon: string;
  valid: boolean; diagnostic: string; libraryTiers: string[]; shopShelves: string[];
}
export interface SectPromotionPreview extends SectGrowthResult {
  target?: string; targetRankName?: string; requiredContribution?: number | null;
  requiredRealm?: string | null; requiredRealmName?: string;
  mode?: string; dialogueKeys?: Readonly<Record<string, string>>;
}
export interface SectCatalogEntry extends SectGrowthResult {
  itemId: string; name: string; reqRank: string; rankName: string; costContribution: number | null;
}
export interface SectCatalog extends SectGrowthResult { entries: SectCatalogEntry[] }

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(child => freeze(child));
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
// 冻结独立副本，既有职业/任务消费者仍可使用原表；测试只注入内存配置。
export const SECT_GROWTH_CONFIG: DeepReadonly<SectGrowthConfig> = freeze(JSON.parse(JSON.stringify({
  ranks: SECT_RANKS, npcs: NPCS, shops: SHOPS, items: ITEMS, realms: REALMS, skills: SKILLS,
})));
const V05_RANKS = ['outer_disciple', 'inner_disciple', 'direct_disciple'] as const;
const SERVICE_CONFIG: Record<SectServiceType, string> = { sect_promotion: 'sect_ranks', sect_shop: 'shops', sect_library: 'shops' };
const pending = (): SectGrowthResult => ({ ok: false, key: 'sect.ui.config_pending' });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
let transactionSequence = 0;
export function newSectTransactionId() {
  return `sect:${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}:${++transactionSequence}:${Math.random().toString(36).slice(2)}`}`;
}

/** 职位与贡献交易不调用会各自保存的贡献接口；变更和收据只保存一次。 */
export class SectGrowth {
  private busy = false;
  constructor(readonly prog: Progress, readonly config: DeepReadonly<SectGrowthConfig> = SECT_GROWTH_CONFIG) {}

  private rank(id: string) { return this.config.ranks.ranks.find(rank => rank.id === id); }
  private rankIndex(id: string) { return this.config.ranks.rules.rankOrder.indexOf(id); }
  private sect() { return this.config.ranks.sects.find(sect => sect.id === this.prog.sect); }
  private translated(key: string, fallback: string) { const value = t(key); return value === key ? fallback : value; }
  private rankName(id: string) { const rank = this.rank(id); return rank ? this.translated(rank.nameKey, rank.name) : t('sect.ui.config_pending'); }

  identity(): SectIdentity | null {
    const sectId = this.prog.sect, savedRank: unknown = this.prog.sectRank;
    if (!sectId && savedRank === null) return null;
    const rankId = typeof savedRank === 'string' ? savedRank : '', rank = this.rank(rankId), sect = this.sect();
    const index = this.rankIndex(rankId), cap = this.rankIndex('direct_disciple');
    const valid = !!sectId && !!sect && !!rank && index >= 0 && savedRank !== null;
    const title = sect?.titles[rankId];
    const accessible = valid && cap >= 0 ? this.config.ranks.rules.rankOrder.slice(0, Math.min(index, cap) + 1)
      .map(id => this.rank(id)).filter((entry): entry is DeepReadonly<SectRankDef> => !!entry && entry.availableInV05 === true) : [];
    return {
      sect: sectId, rankId, name: rank ? this.rankName(rankId) : t('sect.ui.invalid_rank'),
      title: title ? this.translated(title.nameKey, title.name) : t('sect.ui.invalid_rank'), icon: rank?.icon ?? '',
      valid, diagnostic: valid ? '' : 'sect.ui.invalid_rank',
      libraryTiers: [...new Set(accessible.map(entry => entry.unlocks.libraryTier).filter(tier => ['entry', 'advanced', 'secret'].includes(tier)))],
      shopShelves: accessible.map(entry => entry.unlocks.shopShelf),
    };
  }

  private stateReady() {
    const state: unknown = this.prog.sectGrowthState;
    if (!record(state) || !record(state.settledTransactions)) return false;
    if (state.donationDay !== undefined && typeof state.donationDay !== 'string') return false;
    if (state.donationBatches !== undefined && (!record(state.donationBatches) || !Object.values(state.donationBatches).every(integer))) return false;
    return Object.entries(state.settledTransactions).every(([id, receipt]) => id.length > 0 && record(receipt)
      && ['donation', 'shop', 'promotion'].includes(String(receipt.kind)) && typeof receipt.sect === 'string'
      && typeof receipt.sourceId === 'string' && receipt.sourceId.length > 0 && typeof receipt.day === 'string');
  }

  /** 只执行本宗已登记 NPC 的固定服务；config 不是任意资源路径。 */
  private service(npcId: string, type: SectServiceType): SectGrowthResult {
    const identity = this.identity();
    if (identity && !identity.valid) return { ok: false, key: 'sect.ui.invalid_rank' };
    if (!identity) return { ok: false, key: 'sect.ui.not_member' };
    if (!this.stateReady()) return pending();
    const npc = this.config.npcs[npcId], sect = this.sect();
    if (!npc || !sect || !inPhase(npc)) return { ok: false, key: 'sect.ui.closed' };
    const services = npc.services;
    if (!Array.isArray(services) || !services.every(entry => record(entry) && typeof entry.type === 'string'
      && typeof entry.sect === 'string' && typeof entry.config === 'string')
      || new Set(services.map(entry => entry.type)).size !== services.length) return pending();
    const entry = services.find(service => service.type === type);
    if (!entry || entry.sect !== identity.sect || entry.config !== SERVICE_CONFIG[type]) return { ok: false, key: 'sect.ui.not_member' };
    const expectedNpc = type === 'sect_shop' ? sect.stewardNpc : sect.promotionNpc;
    if (npcId !== expectedNpc) return { ok: false, key: 'sect.ui.closed' };
    return { ok: true, key: '' };
  }

  /** enabled 必须显式打开；待填、不一致门槛与后续档都不通过本期配置检查。 */
  private ranksReady() {
    const table = this.config.ranks, rules = table.rules, order = rules.rankOrder;
    if (table.enabled !== true || rules.initialRank !== 'outer_disciple' || rules.v05MaxRank !== 'direct_disciple'
      || rules.contributionBasis !== 'current_balance' || rules.promotionSpendsContribution !== false || rules.demoteOnSpend !== false
      || !Array.isArray(order) || new Set(order).size !== order.length
      || table.ranks.length !== order.length || new Set(table.ranks.map(rank => rank.id)).size !== table.ranks.length
      || table.ranks.some(rank => !order.includes(rank.id))) return false;
    if (!V05_RANKS.every((id, index) => order[index] === id)) return false;
    let previousContribution = -1, previousRealm = -1;
    for (const [index, id] of V05_RANKS.entries()) {
      const rank = this.rank(id), realmIndex = this.config.realms.findIndex(realm => realm.id === rank?.reqRealm);
      if (!rank || rank.availableInV05 !== true || !integer(rank.reqContribution) || realmIndex < 0
        || !Array.isArray(rank.balanceTodo) || rank.balanceTodo.length > 0
        || rank.reqContribution < previousContribution || realmIndex < previousRealm
        || rank.promotion.mode !== ['on_join', 'confirm', 'oath'][index]
        || typeof rank.promotion.dialogueKeys.complete !== 'string' || !rank.promotion.dialogueKeys.complete
        || !['entry', 'advanced', 'secret'].includes(rank.unlocks.libraryTier) || rank.unlocks.shopShelf !== rank.id) return false;
      if (rank.promotion.mode === 'oath' && ['question', 'accept', 'defer'].some(key => !rank.promotion.dialogueKeys[key])) return false;
      previousContribution = rank.reqContribution; previousRealm = realmIndex;
    }
    return true;
  }

  services(npcId: string): { type: SectServiceType; allowed: boolean; key: string }[] {
    const entries = this.config.npcs[npcId]?.services;
    if (!Array.isArray(entries)) return [];
    return [...new Set(entries.filter(record).map(entry => entry.type))].filter((type): type is SectServiceType => typeof type === 'string' && Object.prototype.hasOwnProperty.call(SERVICE_CONFIG, type))
      .map(type => {
        const state = type === 'sect_promotion' ? this.promotion(npcId) : this.catalog(npcId, type);
        return { type, allowed: state.ok, key: state.key };
      });
  }

  promotion(npcId: string): SectPromotionPreview {
    const access = this.service(npcId, 'sect_promotion');
    if (!access.ok) return access;
    const index = this.rankIndex(this.prog.sectRank!), cap = this.rankIndex('direct_disciple');
    if (cap < 0) return pending();
    if (index >= cap) return { ok: false, key: 'sect.ui.cap' };
    const target = this.rank(this.config.ranks.rules.rankOrder[index + 1]);
    if (!target) return pending();
    const realm = this.config.realms.find(realm => realm.id === target.reqRealm);
    const preview = { target: target.id, targetRankName: this.rankName(target.id), requiredContribution: target.reqContribution,
      requiredRealm: target.reqRealm, requiredRealmName: realm?.name ?? '', mode: target.promotion.mode, dialogueKeys: target.promotion.dialogueKeys };
    if (!this.ranksReady()) return { ...preview, ...pending() };
    const ok = integer(this.prog.sectContribution) && this.prog.sectContribution >= target.reqContribution!
      && !!realm && this.prog.level >= realm.levelMin;
    return { ...preview, ok, key: ok ? '' : 'sect.ui.requirements_unmet' };
  }

  private repeated(transactionId: string, kind: SectGrowthReceipt['kind'], sourceId: string, key: string): SectGrowthResult | undefined {
    if (!transactionId || !this.stateReady()) return pending();
    if (!Object.prototype.hasOwnProperty.call(this.prog.sectGrowthState.settledTransactions, transactionId)) return undefined;
    const receipt = this.prog.sectGrowthState.settledTransactions[transactionId];
    return receipt.kind === kind && receipt.sect === this.prog.sect && receipt.sourceId === sourceId
      ? { ok: true, key, repeated: true } : pending();
  }

  private settle(transactionId: string, receipt: SectGrowthReceipt, apply: () => boolean, key: string): SectGrowthResult {
    if (this.busy || !transactionId || ['__proto__', 'constructor', 'prototype'].includes(transactionId)) return pending();
    const previous = {
      rank: this.prog.sectRank, contribution: this.prog.sectContribution,
      inventory: { ...this.prog.inventory }, state: this.prog.sectGrowthState,
    };
    this.busy = true;
    let saved = false, applied = false;
    try {
      applied = apply();
      if (applied) {
        this.prog.sectGrowthState = { ...previous.state, settledTransactions: { ...previous.state.settledTransactions, [transactionId]: receipt } };
        saved = this.prog.save();
      }
    } catch { /* 保存或背包拒收时回滚本笔，不写成功收据。 */ }
    finally {
      if (!saved) {
        this.prog.sectRank = previous.rank; this.prog.sectContribution = previous.contribution;
        this.prog.inventory = previous.inventory; this.prog.sectGrowthState = previous.state;
      }
      this.busy = false;
    }
    return saved ? { ok: true, key } : { ok: false, key: applied ? 'sect.ui.save_failed' : 'sect.ui.bag_full' };
  }

  promote(npcId: string, targetRank: string, transactionId: string, acceptOath = false): SectGrowthResult {
    const access = this.service(npcId, 'sect_promotion');
    if (!access.ok) return access;
    const key = this.rank(targetRank)?.promotion.dialogueKeys.complete ?? 'sect.ui.config_pending';
    const repeated = this.repeated(transactionId, 'promotion', targetRank, key);
    if (repeated) return repeated;
    const preview = this.promotion(npcId);
    if (!preview.ok) return preview;
    if (targetRank !== preview.target) return { ok: false, key: 'sect.ui.invalid_rank' };
    if (preview.mode === 'oath' && !acceptOath) return { ok: false, key: preview.dialogueKeys?.defer ?? 'sect.ui.cancel' };
    return this.settle(transactionId, { kind: 'promotion', sect: this.prog.sect, sourceId: targetRank, day: dailyQuestDay() }, () => {
      this.prog.sectRank = targetRank; return true;
    }, key);
  }

  private goodReady(good: DeepReadonly<SectShopGood>, sectId: string, library: boolean) {
    if (!record(good) || good.enabled !== true || !integer(good.costContribution)
      || !Array.isArray(good.balanceTodo) || good.balanceTodo.length > 0
      || typeof good.item !== 'string' || typeof good.reqRank !== 'string') return false;
    const rank = this.rank(good.reqRank), item = this.config.items[good.item];
    if (!rank || rank.availableInV05 !== true || !V05_RANKS.includes(rank.id as typeof V05_RANKS[number])
      || !item || (item.sect && item.sect !== sectId) || (item.reqLevel !== undefined && (!integer(item.reqLevel) || item.reqLevel < 1))) return false;
    const skill = item.unlockSkill ? this.config.skills[item.unlockSkill] : undefined;
    if (item.unlockSkill && (!skill || (skill.sect && skill.sect !== sectId))) return false;
    return !library || !!item.unlockSkill;
  }

  /** 高阶书目只有五宗同档均落表、价格和功法引用齐备才开放。 */
  private libraryGroupReady(reqRank: string) {
    if (reqRank === 'outer_disciple') return true;
    if (this.config.ranks.sects.length !== 5 || new Set(this.config.ranks.sects.map(sect => sect.id)).size !== 5) return false;
    return this.config.ranks.sects.every(sect => {
      const npc = this.config.npcs[sect.promotionNpc], services = npc?.services;
      const entries = this.config.shops[sect.promotionNpc];
      return Array.isArray(services) && services.filter(service => service.type === 'sect_library').length === 1
        && services.some(service => service.type === 'sect_library' && service.sect === sect.id && service.config === 'shops')
        && Array.isArray(entries) && new Set(entries.map(entry => typeof entry === 'string' ? entry : entry.item)).size === entries.length
        && entries.some(entry => typeof entry !== 'string' && entry.reqRank === reqRank && this.goodReady(entry, sect.id, true));
    });
  }

  private entry(npcId: string, type: 'sect_shop' | 'sect_library', good: DeepReadonly<SectShopGood>): SectCatalogEntry {
    const item = this.config.items[good.item];
    const result = { itemId: good.item, name: item?.name ?? t('sect.ui.config_pending'), reqRank: good.reqRank,
      rankName: this.rankName(good.reqRank), costContribution: integer(good.costContribution) ? good.costContribution : null };
    if (!this.ranksReady() || !this.goodReady(good, this.prog.sect, type === 'sect_library')
      || (type === 'sect_library' && !this.libraryGroupReady(good.reqRank))) return { ...result, ...pending() };
    const identity = this.identity()!;
    if (!identity.shopShelves.includes(good.reqRank)) return { ...result, ok: false, key: 'sect.ui.locked_rank' };
    if (type === 'sect_library' && !identity.libraryTiers.includes(this.rank(good.reqRank)!.unlocks.libraryTier)) return { ...result, ok: false, key: 'sect.ui.locked_rank' };
    if (item?.reqLevel && this.prog.level < item.reqLevel) return { ...result, ok: false, key: 'sect.ui.requirements_unmet' };
    if (item?.unlockSkill) {
      if (this.prog.skillLevel(item.unlockSkill) > 0) return { ...result, ok: false, key: 'sect.library.learned' };
      const skill = this.config.skills[item.unlockSkill];
      // 买书不自动学会；买到的书本身不成为购买前置，其余原学习条件照常检查。
      const req = skill.req ? Object.fromEntries(Object.entries(skill.req).filter(([key, value]) => key !== 'item' || value !== good.item)) : null;
      if (!this.prog.ownsSkill(skill as SkillDef) || !this.prog.prereqMet({ ...skill, req } as SkillDef)) {
        return { ...result, ok: false, key: 'sect.ui.requirements_unmet' };
      }
    }
    if (!integer(this.prog.sectContribution) || this.prog.sectContribution < good.costContribution!) return { ...result, ok: false, key: 'sect.ui.contribution_short' };
    if (!this.prog.canReceiveItem(good.item, 1)) return { ...result, ok: false, key: 'sect.ui.bag_full' };
    return { ...result, ok: true, key: '' };
  }

  catalog(npcId: string, type: 'sect_shop' | 'sect_library'): SectCatalog {
    if (type !== 'sect_shop' && type !== 'sect_library') return { ...pending(), entries: [] };
    const access = this.service(npcId, type);
    if (!access.ok) return { ...access, entries: [] };
    const raw = this.config.shops[npcId];
    if (!Array.isArray(raw) || raw.length === 0 || new Set(raw.map(entry => typeof entry === 'string' ? entry : entry?.item)).size !== raw.length) return { ...pending(), entries: [] };
    const goods = raw.filter((entry): entry is DeepReadonly<SectShopGood> => typeof entry !== 'string' && record(entry));
    const entries = goods.map(good => this.entry(npcId, type, good));
    if (!entries.length || !this.ranksReady() || !goods.some(good => this.goodReady(good, this.prog.sect, type === 'sect_library')
      && (type !== 'sect_library' || this.libraryGroupReady(good.reqRank)))) return { ...pending(), entries };
    // 就绪货架可以打开，逐条商品再检查职位、余额和背包。
    return { ok: true, key: '', entries };
  }

  exchange(npcId: string, type: 'sect_shop' | 'sect_library', itemId: string, transactionId: string): SectGrowthResult {
    if (type !== 'sect_shop' && type !== 'sect_library') return pending();
    const access = this.service(npcId, type);
    if (!access.ok) return access;
    const key = type === 'sect_library' ? 'sect.library.complete' : 'sect.shop.complete';
    const repeated = this.repeated(transactionId, 'shop', `${npcId}|${itemId}`, key);
    if (repeated) return repeated;
    const catalog = this.catalog(npcId, type);
    if (!catalog.ok) return catalog;
    const entry = catalog.entries.find(entry => entry.itemId === itemId);
    if (!entry || !entry.ok) return entry ?? pending();
    return this.settle(transactionId, { kind: 'shop', sect: this.prog.sect, sourceId: `${npcId}|${itemId}`, day: dailyQuestDay() }, () => {
      const before = this.prog.count(itemId);
      this.prog.sectContribution -= entry.costContribution!;
      this.prog.addItem(itemId, 1);
      return this.prog.count(itemId) === before + 1;
    }, key);
  }
}
