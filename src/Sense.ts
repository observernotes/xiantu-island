/** 神识纯逻辑：不依赖 Phaser、输入、贴图或游戏时钟。所有施放事务同步提交。 */
export interface SenseState { cooldownUntil?: number; lastScanId?: string; tutorialSeen: boolean }
export interface MonsterSenseBlock { enabled: boolean; profile: string; visibleInfo: string[]; abilityKeys: string[] }
export interface SenseConfig {
  enabled: boolean; unlock: { realmMin: string };
  scan: { radiusBasePx: number; radiusPerSpiritPx: number; radiusMaxPx: number; mpCost: number; cooldownMs: number };
  reveal: { highlightMs: number }; inspect: { durationMs: number };
  targetProfiles: { id: string; kind: string; enabled: boolean; reqSpirit: number }[];
}
export type SenseBlockKey = `sense.block.${'realm' | 'unavailable' | 'dead' | 'busy' | 'cooldown' | 'mp' | 'save_failed'}`;
export interface SenseContext { instanceId: string; center: { x: number; y: number }; alive: boolean; busy: boolean; ready: boolean }
export interface SenseProgress {
  realm: { id: string }; hp: number; mp: number; stat(key: string): number; save(): boolean;
  senseState?: SenseState; senseRevealed?: Record<string, true>;
}
export interface SenseMonster {
  instance: object; alive(): boolean;
  definition: { name: string; level: number; sense?: MonsterSenseBlock };
  hp: number; maxHp: number;
}
export interface SenseTarget {
  kind: 'chest' | 'platform' | 'entrance' | 'monster_info'; instanceId: string; id: string;
  x: number; y: number; reqSpirit: number; active: boolean;
  monster?: SenseMonster;
  /** 静态地图由服务写 senseRevealed；未来事件/秘境必须由其所属系统暂存并提供回滚。 */
  persistence?: 'adapter'; revealed?(): boolean; stageReveal?(): () => void;
  applyReveal?(): void;
}
export interface MonsterIntel {
  instanceId: string; id: string; scannedAt: number; expiresAt: number;
  titleKey: 'sense.monster.title' | 'sense.ui.inspect';
  name?: string; level?: number; hp?: number; maxHp?: number; abilities?: string[];
}
export interface SenseHit { kind: SenseTarget['kind']; id: string; x: number; y: number; newlyRevealed: boolean }
export interface SenseScanSuccess {
  ok: true; scanId: string; replayed: boolean; instanceId?: string; center?: { x: number; y: number };
  radius?: number; strength?: number; count: number; result: 'found' | 'known' | 'faint' | 'empty';
  resultKey: `sense.result.${'found' | 'known' | 'faint' | 'empty'}`; faint: boolean; hits: SenseHit[];
}
export type SenseScanResult = SenseScanSuccess | { ok: false; blockKey: SenseBlockKey; scanId?: string };
export interface SensePreview {
  strength?: number; radius?: number; mpCost?: number; cooldownMs?: number; cooldownRemainingMs: number;
  ready: boolean; blockKey?: SenseBlockKey; unlocked: boolean; sources: readonly unknown[]; diagnostics: string[];
}
export interface SenseOptions {
  progress: SenseProgress; config(): unknown; realms: readonly { id: string }[]; enabled(): boolean;
  context(): SenseContext; targets(): SenseTarget[];
  sources?(): readonly unknown[]; text?(key: string): string | undefined;
  emit?(event: 'sense:scan' | 'sense:intel-expired' | 'sense:blocked', payload: unknown): void;
  now?(): number;
}
export interface SenseAdapter { targets(context: SenseContext): SenseTarget[] }
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const positive = (v: unknown): v is number => finite(v) && v > 0;
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const integer = (v: unknown): v is number => positive(v) && Number.isSafeInteger(v);
const timestamp = (v: unknown): v is number => nonnegative(v) && Number.isSafeInteger(v) && v <= 8640000000000000;
const own = (v: object, k: string) => Object.prototype.hasOwnProperty.call(v, k);
const identity = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('|');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let sequence = 0;
const loadVersions = new WeakMap<object, number>();
/** 成功导入同一 Progress 后使旧内存情报失效；没有存档字段。 */
export function invalidateSenseSession(progress: object): void { loadVersions.set(progress, (loadVersions.get(progress) ?? 0) + 1); }

/** 禁用模板不阻塞公共能力，也绝不读取 future.weakness。 */
export function validateSenseConfig(value: unknown): { config?: SenseConfig; errors: string[] } {
  const errors: string[] = [];
  if (!record(value)) return { errors: ['sense'] };
  if (typeof value.enabled !== 'boolean') errors.push('enabled');
  if (value.unlock?.realmMin !== 'foundation') errors.push('unlock.realmMin');
  const rules = { attribute: 'spirit', action: 'spirit_scan', cooldownClock: 'real_time', rangeShape: 'circle', occlusion: 'ignore_terrain', repeatReveal: 'keep_state' };
  for (const [key, expected] of Object.entries(rules)) if (value.rules?.[key] !== expected) errors.push(`rules.${key}`);
  for (const key of ['radiusBasePx', 'radiusPerSpiritPx', 'radiusMaxPx']) if (!positive(value.scan?.[key])) errors.push(`scan.${key}`);
  if (positive(value.scan?.radiusMaxPx) && positive(value.scan?.radiusBasePx) && value.scan.radiusMaxPx < value.scan.radiusBasePx) errors.push('scan.radiusMaxPx<radiusBasePx');
  for (const key of ['mpCost', 'cooldownMs']) if (!integer(value.scan?.[key])) errors.push(`scan.${key}`);
  if (!integer(value.reveal?.highlightMs)) errors.push('reveal.highlightMs');
  if (!integer(value.inspect?.durationMs)) errors.push('inspect.durationMs');
  if (!Array.isArray(value.targetProfiles)) errors.push('targetProfiles');
  else {
    const ids = new Set<string>();
    for (const p of value.targetProfiles) {
      if (!record(p) || !identity(p.id) || ids.has(p.id) || typeof p.enabled !== 'boolean'
        || !['chest', 'platform', 'monster_info'].includes(p.kind)) { errors.push('targetProfiles.schema'); continue; }
      ids.add(p.id);
      if (p.enabled && !nonnegative(p.reqSpirit)) errors.push(`targetProfiles.${p.id}.reqSpirit`);
    }
  }
  return errors.length ? { errors } : { config: value as SenseConfig, errors };
}

export class Sense {
  private readonly intel = new Map<object, { value: MonsterIntel; alive: () => boolean }>();
  private readonly committed = new Map<string, SenseScanSuccess>();
  private readonly adapters = new Map<'encounter' | 'secret_chest', SenseAdapter>();
  private pending = false;
  private loadVersion: number;
  constructor(private readonly options: SenseOptions) { this.loadVersion = loadVersions.get(options.progress) ?? 0; }
  private now() { return this.options.now?.() ?? Date.now(); }
  private emit(event: Parameters<NonNullable<SenseOptions['emit']>>[0], payload: unknown) {
    // 展示层监听者不能撤销已经成功保存的事务。
    try { this.options.emit?.(event, clone(payload)); } catch { /* 提交不依赖界面。 */ }
  }
  /** 仅预留所属系统接入；未注册时不产生候选，也不参与奇遇抽池。 */
  registerAdapter(kind: 'encounter' | 'secret_chest', adapter: SenseAdapter): () => void {
    this.adapters.set(kind, adapter);
    return () => { if (this.adapters.get(kind) === adapter) this.adapters.delete(kind); };
  }
  private diagnostics(): string[] {
    const p = this.options.progress, state: unknown = p.senseState, errors: string[] = [];
    if (state !== undefined) {
      if (!record(state)) errors.push('senseState');
      else {
        if (own(state, 'cooldownUntil') && !timestamp(state.cooldownUntil)) errors.push('senseState.cooldownUntil');
        if (own(state, 'lastScanId') && (typeof state.lastScanId !== 'string' || !state.lastScanId)) errors.push('senseState.lastScanId');
        if (typeof state.tutorialSeen !== 'boolean') errors.push('senseState.tutorialSeen');
      }
    }
    const revealed: unknown = p.senseRevealed;
    if (revealed !== undefined && (!record(revealed) || Object.entries(revealed).some(([key, v]) => key.split('|').length !== 2 || !key.split('|').every(identity) || v !== true))) errors.push('senseRevealed');
    return errors;
  }
  preview(): SensePreview {
    const o = this.options, p = o.progress;
    let raw: unknown, context: SenseContext;
    try { raw = o.config(); } catch { raw = undefined; }
    try { context = o.context(); } catch { context = { instanceId: '', center: { x: NaN, y: NaN }, alive: false, busy: false, ready: false }; }
    const checked = validateSenseConfig(raw), config = checked.config;
    let strength: number = NaN, sources: readonly unknown[] = [];
    let sourcesReady = true;
    try { strength = p.stat('spirit'); } catch { /* 缺失/未就绪属性接口。 */ }
    try { sources = o.sources?.() ?? []; } catch { sourcesReady = false; }
    const validStrength = nonnegative(strength);
    const current = o.realms.findIndex(r => r.id === p.realm.id);
    const minimum = o.realms.findIndex(r => r.id === (record(raw) && raw.unlock?.realmMin === 'foundation' ? raw.unlock.realmMin : 'foundation'));
    const unlocked = minimum >= 0 && current >= minimum;
    const diagnostics = [...checked.errors, ...this.diagnostics()];
    if (!validStrength) diagnostics.push('spirit');
    if (!sourcesReady) diagnostics.push('sources');
    const now = this.now();
    if (!timestamp(now)) diagnostics.push('now');
    if (!finite(context.center?.x) || !finite(context.center?.y) || !identity(context.instanceId)) diagnostics.push('context');
    const remaining = timestamp(p.senseState?.cooldownUntil) && timestamp(now) ? Math.max(0, p.senseState!.cooldownUntil! - now) : 0;
    let blockKey: SenseBlockKey | undefined;
    // 总开关关态的调用合同：无论人物状态，一律 unavailable，且无写盘。
    if (!o.enabled()) blockKey = 'sense.block.unavailable';
    else if (!unlocked) blockKey = 'sense.block.realm';
    else if (!config?.enabled || diagnostics.length || !context.ready || typeof o.targets !== 'function' || typeof p.save !== 'function') blockKey = 'sense.block.unavailable';
    else if (!context.alive || p.hp <= 0) blockKey = 'sense.block.dead';
    else if (context.busy || this.pending) blockKey = 'sense.block.busy';
    else if (remaining > 0) blockKey = 'sense.block.cooldown';
    else if (!nonnegative(p.mp)) blockKey = 'sense.block.unavailable';
    else if (p.mp < config.scan.mpCost) blockKey = 'sense.block.mp';
    const numeric = config && validStrength ? { strength, radius: Math.min(config.scan.radiusMaxPx, config.scan.radiusBasePx + strength * config.scan.radiusPerSpiritPx), mpCost: config.scan.mpCost, cooldownMs: config.scan.cooldownMs } : {};
    return { ...numeric, cooldownRemainingMs: remaining, ready: !blockKey, blockKey, unlocked, sources, diagnostics };
  }
  private blocked(blockKey: SenseBlockKey, source: 'key' | 'button', scanId?: string): SenseScanResult {
    const result = { ok: false as const, blockKey, ...(scanId ? { scanId } : {}) };
    this.emit('sense:blocked', { ...result, source });
    return result;
  }
  requestScan(source: 'key' | 'button', scanId?: string): SenseScanResult {
    this.syncLoadVersion();
    const o = this.options, p = o.progress, preview = this.preview();
    if (source !== 'key' && source !== 'button' || scanId !== undefined && (typeof scanId !== 'string' || !scanId)) return this.blocked('sense.block.unavailable', source, scanId);
    // 已提交重试在冷却检查前认领，但仍遵守开关/境界/配置/生存/操作检查。
    if (scanId && (!preview.blockKey || preview.blockKey === 'sense.block.cooldown' || preview.blockKey === 'sense.block.mp')) {
      const prior = this.committed.get(scanId);
      if (prior) return { ...clone(prior), replayed: true };
      if (p.senseState?.lastScanId === scanId) return { ok: true, scanId, replayed: true, count: 0, result: 'known', resultKey: 'sense.result.known', faint: false, hits: [] };
    }
    if (preview.blockKey) return this.blocked(preview.blockKey, source, scanId);
    let config: SenseConfig | undefined, context: SenseContext;
    try { config = validateSenseConfig(o.config()).config; context = o.context(); }
    catch { return this.blocked('sense.block.unavailable', source, scanId); }
    if (!config?.enabled || !context?.ready || !identity(context.instanceId) || !finite(context.center?.x) || !finite(context.center?.y)) return this.blocked('sense.block.unavailable', source, scanId);
    const center = { ...context.center }, instanceId = context.instanceId;
    const strength = preview.strength!, radius = preview.radius!;
    const operation = scanId ?? `sense-${this.now()}-${++sequence}`;
    const hits: SenseHit[] = [], reveals: SenseTarget[] = [], snapshots: { monster: SenseMonster; intel: MonsterIntel }[] = [];
    let faint = false;
    this.pending = true;
    const rollback: (() => void)[] = [];
    const previous = { mp: p.mp, state: p.senseState, revealed: p.senseRevealed };
    let mutated = false;
    try {
      const targets = [...o.targets(), ...[...this.adapters.values()].flatMap(adapter => adapter.targets(context))];
      const visited = new Set<string>();
      for (const target of targets) {
        if (!target || !target.active || target.instanceId !== instanceId || !identity(target.id) || !nonnegative(target.reqSpirit)
          || !finite(target.x) || !finite(target.y) || !['chest', 'platform', 'entrance', 'monster_info'].includes(target.kind)) continue;
        const key = `${target.kind}|${target.id}`;
        if (visited.has(key)) continue;
        visited.add(key);
        // 必须先范围，再强度；无效怪物块或无原生接口的物件不产生 faint。
        if (Math.hypot(target.x - center.x, target.y - center.y) > radius) continue;
        const monster = target.kind === 'monster_info' ? this.monsterSnapshot(target, config) : undefined;
        if (target.kind === 'monster_info' ? !monster : target.persistence === 'adapter' ? !target.stageReveal || !target.revealed : !target.applyReveal) continue;
        const requirement = monster?.reqSpirit ?? target.reqSpirit;
        if (strength < requirement) { faint = true; continue; }
        let newlyRevealed = false;
        if (monster && target.monster) snapshots.push({ monster: target.monster, intel: monster.intel });
        else {
          const known = target.persistence === 'adapter' ? target.revealed!() : p.senseRevealed?.[`${instanceId}|${target.id}`] === true;
          newlyRevealed = !known;
          if (newlyRevealed) reveals.push(target);
        }
        hits.push({ kind: target.kind, id: target.id, x: target.x, y: target.y, newlyRevealed });
      }
      // 枚举接口后，按提交顺序复检真实灵力与场景，战斗耗蓝不会被覆盖。
      const latest = o.context();
      if (!latest.ready) return this.blocked('sense.block.unavailable', source, operation);
      if (latest.instanceId !== instanceId || latest.busy || !latest.alive || !o.enabled()) return this.blocked(!o.enabled() ? 'sense.block.unavailable' : !latest.alive ? 'sense.block.dead' : 'sense.block.busy', source, operation);
      if (!nonnegative(p.mp)) return this.blocked('sense.block.unavailable', source, operation);
      if (p.mp < config.scan.mpCost) return this.blocked('sense.block.mp', source, operation);
      previous.mp = p.mp;
      const submittedAt = this.now(), until = submittedAt + config.scan.cooldownMs;
      if (!timestamp(submittedAt) || !timestamp(until)) return this.blocked('sense.block.unavailable', source, operation);
      mutated = true;
      for (const target of reveals) if (target.persistence === 'adapter') rollback.push(target.stageReveal!());
      p.mp -= config.scan.mpCost;
      p.senseState = { ...p.senseState, cooldownUntil: until, lastScanId: operation, tutorialSeen: p.senseState?.tutorialSeen ?? false };
      if (reveals.some(t => t.persistence !== 'adapter')) {
        p.senseRevealed = { ...p.senseRevealed };
        for (const target of reveals) if (target.persistence !== 'adapter') p.senseRevealed[`${instanceId}|${target.id}`] = true;
      }
      let saved = false;
      try { saved = p.save() === true; } catch { /* 统一回滚。 */ }
      if (!saved) {
        p.mp = previous.mp; p.senseState = previous.state; p.senseRevealed = previous.revealed;
        for (const undo of rollback.reverse()) undo();
        rollback.length = 0;
        return this.blocked('sense.block.save_failed', source, operation);
      }
      // 事务已写盘；表现/原生适配回调异常不得造成内存与磁盘相反的回滚。
      for (const target of reveals) { try { target.applyReveal?.(); } catch { /* 下次构图按持久状态恢复。 */ } }
      for (const snapshot of snapshots) {
        snapshot.intel.scannedAt = submittedAt;
        snapshot.intel.expiresAt = submittedAt + config.inspect.durationMs;
        this.intel.set(snapshot.monster.instance, { value: snapshot.intel, alive: snapshot.monster.alive });
      }
      const result = reveals.length ? 'found' : hits.length ? 'known' : faint ? 'faint' : 'empty';
      const success: SenseScanSuccess = { ok: true, replayed: false, scanId: operation, instanceId, center, radius, strength,
        count: reveals.length, result, resultKey: `sense.result.${result}`, faint, hits };
      this.committed.set(operation, clone(success));
      this.emit('sense:scan', { ...success, source, highlightMs: config.reveal.highlightMs });
      return success;
    } catch {
      // 候选/所属系统适配器异常必须在提交之前停止，不把异常当作空扫。
      if (mutated) { p.mp = previous.mp; p.senseState = previous.state; p.senseRevealed = previous.revealed; }
      for (const undo of rollback.reverse()) undo();
      return this.blocked('sense.block.unavailable', source, operation);
    } finally { this.pending = false; }
  }
  private monsterSnapshot(target: SenseTarget, config: SenseConfig): { reqSpirit: number; intel: MonsterIntel } | undefined {
    const monster = target.monster, block = monster?.definition.sense;
    if (!monster || !monster.alive() || !block || block.enabled !== true) return;
    const profile = config.targetProfiles.find(p => p.id === block.profile && p.kind === 'monster_info' && p.enabled && nonnegative(p.reqSpirit));
    const allowed = ['name', 'level', 'hp', 'abilities'];
    if (!profile || !Array.isArray(block.visibleInfo) || new Set(block.visibleInfo).size !== block.visibleInfo.length || block.visibleInfo.some(v => !allowed.includes(v))
      || !Array.isArray(block.abilityKeys) || new Set(block.abilityKeys).size !== block.abilityKeys.length || block.abilityKeys.some(key => typeof key !== 'string' || !key || !this.options.text?.(key) || this.options.text(key) === key)) return;
    const intel: MonsterIntel = { instanceId: target.instanceId, id: target.id, scannedAt: 0, expiresAt: 0,
      titleKey: block.visibleInfo.includes('name') ? 'sense.monster.title' : 'sense.ui.inspect' };
    for (const field of block.visibleInfo) {
      if (field === 'name') { if (typeof monster.definition.name !== 'string') return; intel.name = monster.definition.name; }
      if (field === 'level') { if (!nonnegative(monster.definition.level)) return; intel.level = monster.definition.level; }
      if (field === 'hp') { if (!positive(monster.hp) || !positive(monster.maxHp) || monster.hp > monster.maxHp) return; intel.hp = monster.hp; intel.maxHp = monster.maxHp; }
      if (field === 'abilities') intel.abilities = block.abilityKeys.length ? block.abilityKeys.map(key => this.options.text!(key)!) : [this.options.text?.('sense.monster.unknown') ?? 'sense.monster.unknown'];
    }
    return { reqSpirit: profile.reqSpirit, intel };
  }
  private syncLoadVersion(): void {
    const version = loadVersions.get(this.options.progress) ?? 0;
    if (version !== this.loadVersion) { this.loadVersion = version; this.clearIntel(); this.committed.clear(); }
  }
  tick(): void {
    this.syncLoadVersion();
    const now = this.now(), instance = this.options.context().instanceId;
    for (const [monster, entry] of this.intel) {
      if (entry.value.instanceId !== instance || !entry.alive() || now >= entry.value.expiresAt) this.removeMonsterIntel(monster);
    }
  }
  removeMonsterIntel(monster: object): void {
    const entry = this.intel.get(monster);
    if (!entry) return;
    this.intel.delete(monster);
    this.emit('sense:intel-expired', { instanceId: entry.value.instanceId, id: entry.value.id });
  }
  clearIntel(): void { for (const monster of this.intel.keys()) this.removeMonsterIntel(monster); }
  monsterIntel(monster: object): MonsterIntel | undefined { this.tick(); const entry = this.intel.get(monster); return entry ? clone(entry.value) : undefined; }
  intelList(): MonsterIntel[] { this.tick(); return [...this.intel.values()].map(entry => clone(entry.value)); }
  revealedHidden(mapId: string): string[] {
    if (!identity(mapId) || !record(this.options.progress.senseRevealed)) return [];
    const prefix = `${mapId}|`;
    return Object.entries(this.options.progress.senseRevealed).filter(([key, value]) => key.startsWith(prefix) && value === true).map(([key]) => key.slice(prefix.length));
  }
  /** 由界面在实际展示教学后调用；保存失败不把教学标为已看。 */
  markTutorialSeen(): boolean {
    const p = this.options.progress;
    if (!this.options.enabled() || this.diagnostics().length) return false;
    if (p.senseState?.tutorialSeen) return true;
    const previous = p.senseState;
    p.senseState = { ...previous, tutorialSeen: true };
    try { if (p.save()) return true; } catch { /* 恢复原记录。 */ }
    p.senseState = previous;
    return false;
  }
}
