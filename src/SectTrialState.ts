export type SectTrialResult = 'win' | 'fail' | 'exit';
export type TrialDirection = 'up' | 'right' | 'down' | 'left';
export type SectTrialStage = 'lamps' | 'draw' | 'targets' | 'stealth' | 'return' | 'tame' | 'flute' | 'waves' | 'ended';
export interface SectTrialWave { monster: string; count: number; side: 'both' | 'alternate' | 'left' | 'right' }
export interface SectTrialCompanion {
  id: string; name: string; sprite: string; hp: number; atk: number; def: number;
  moveSpeed: number; followDist: number; leashDist: number; aggroRange: number;
  attack: { type: string; damageRatio: number; range: { w: number; h: number }; telegraphMs: number; recoverMs: number; cooldownMs: number; knockback: number };
  onZeroHp: string;
}
export interface SectTrialConfig {
  id: string; type: string;
  lamps?: { count: number; timeLimitMs: number; hitSkill: string };
  draw?: { talismans: number; strokesMin: number; strokesMax: number; wrongStroke: string; timeLimitMs: number };
  targets?: { total: number; timeLimitMs: number };
  tame?: { fluteMs: number; interruptOn: string[] };
  waves?: SectTrialWave[];
  waveGapMs?: number; spawnIntervalMs?: number; companion?: SectTrialCompanion;
}
export interface TrialSpawnRequest { id: string; monster: string; side: 'left' | 'right'; index: number }
const DIRECTIONS: TrialDirection[] = ['up', 'right', 'down', 'left'];
const count = (value: number | undefined, fallback = 0) => Math.max(0, Math.floor(value ?? fallback));

/** 每次进图建立新的实例；完成目标及结束入口幂等，不依赖 Phaser 或存档。 */
export class SectTrialState {
  stage: SectTrialStage;
  result?: SectTrialResult;
  lit = 0;
  drawn = 0;
  targets = 0;
  strokeIndex = 0;
  strokes: TrialDirection[] = [];
  waveIndex = 0;
  waveSpawned = 0;
  waveKilled = 0;
  fluteMs = 0;
  private elapsed = 0;
  private waveElapsed = 0;
  private gapLeft = 0;
  private readonly lampIds = new Set<string>();
  private readonly targetIds = new Set<string>();
  private readonly liveWaveIds = new Set<string>();
  private requests: TrialSpawnRequest[] = [];

  constructor(readonly def: SectTrialConfig) {
    this.stage = def.type === 'lamps_then_waves' ? 'lamps' : def.type === 'draw_then_targets' ? 'draw'
      : def.type === 'stealth' ? 'stealth' : 'tame';
    this.prepareStrokes();
  }
  get ended() { return this.result !== undefined; }
  get timeLeftMs(): number | undefined {
    const limit = this.stage === 'lamps' ? this.def.lamps?.timeLimitMs : this.stage === 'targets' ? this.def.targets?.timeLimitMs
      : this.stage === 'draw' ? this.def.draw?.timeLimitMs : undefined;
    return limit && limit > 0 ? Math.max(0, limit - this.elapsed) : undefined;
  }
  get waveCount() { return this.def.waves?.length ?? 0; }
  get fluteRatio() { return Math.min(1, this.fluteMs / Math.max(1, this.def.tame?.fluteMs ?? 3000)); }

  light(id: string): boolean {
    if (this.stage !== 'lamps' || this.lampIds.has(id)) return false;
    this.lampIds.add(id); this.lit++;
    if (this.lit >= count(this.def.lamps?.count, 5)) this.beginWaves();
    return true;
  }
  drawStroke(direction: TrialDirection): 'ignored' | 'wrong' | 'stroke' | 'talisman' | 'done' {
    if (this.stage !== 'draw') return 'ignored';
    if (direction !== this.strokes[this.strokeIndex]) { this.strokeIndex = 0; return 'wrong'; }
    this.strokeIndex++;
    if (this.strokeIndex < this.strokes.length) return 'stroke';
    this.drawn++; this.strokeIndex = 0;
    if (this.drawn >= count(this.def.draw?.talismans, 3)) { this.setStage('targets'); return 'done'; }
    this.prepareStrokes(); return 'talisman';
  }
  targetDead(id: string): boolean {
    if (this.stage !== 'targets' || this.targetIds.has(id)) return false;
    this.targetIds.add(id); this.targets++;
    if (this.targets >= count(this.def.targets?.total, 10)) this.end('win');
    return true;
  }
  takeToken(): boolean {
    if (this.stage !== 'stealth') return false;
    this.setStage('return'); return true;
  }
  returnToken() { if (this.stage === 'return') this.end('win'); }
  detected() { if (this.stage === 'stealth' || this.stage === 'return') this.end('fail'); }
  playerDown() { this.end('fail'); }
  exit() { this.end('exit'); }
  tameReady() { if (this.stage === 'tame') this.setStage('flute'); }
  /** 松键也停止读条；配置中的移动、攻击、受伤由场景判断后传入。 */
  flute(delta: number, holding: boolean, interrupted: boolean): boolean {
    if (this.stage !== 'flute') return false;
    if (!holding || interrupted) { this.fluteMs = 0; return false; }
    this.fluteMs += Number.isFinite(delta) ? Math.max(0, delta) : 0;
    if (this.fluteMs < (this.def.tame?.fluteMs ?? 3000)) return false;
    this.beginWaves(); return true;
  }
  tick(delta: number) {
    if (this.ended) return;
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.elapsed += dt;
    if (this.timeLeftMs === 0) { this.end('fail'); return; }
    if (this.stage !== 'waves') return;
    let available = dt;
    if (this.gapLeft > 0) {
      const waited = Math.min(available, this.gapLeft);
      this.gapLeft -= waited; available -= waited;
      if (this.gapLeft > 0) return;
    }
    this.waveElapsed += available;
    const wave = this.def.waves?.[this.waveIndex];
    if (!wave) { this.end('win'); return; }
    const interval = Math.max(1, this.def.spawnIntervalMs ?? 600);
    while (this.waveSpawned < count(wave.count) && this.waveElapsed >= this.waveSpawned * interval) {
      const index = this.waveSpawned++;
      const id = `${this.waveIndex}:${index}`;
      const side = wave.side === 'left' || wave.side === 'right' ? wave.side : index % 2 ? 'right' : 'left';
      this.liveWaveIds.add(id);
      this.requests.push({ id, monster: wave.monster, side, index });
    }
  }
  takeSpawnRequests(): TrialSpawnRequest[] { const requests = this.requests; this.requests = []; return requests; }
  waveDead(id: string): boolean {
    if (this.stage !== 'waves' || !this.liveWaveIds.delete(id)) return false;
    this.waveKilled++;
    const wave = this.def.waves?.[this.waveIndex];
    if (this.waveSpawned >= count(wave?.count) && this.waveKilled >= count(wave?.count)) {
      this.waveIndex++;
      if (this.waveIndex >= this.waveCount) this.end('win');
      else { this.waveSpawned = 0; this.waveKilled = 0; this.waveElapsed = 0; this.gapLeft = Math.max(0, this.def.waveGapMs ?? 0); }
    }
    return true;
  }
  private prepareStrokes() {
    const min = Math.max(1, count(this.def.draw?.strokesMin, 4));
    const max = Math.max(min, count(this.def.draw?.strokesMax, 6));
    const length = min + this.drawn % (max - min + 1);
    this.strokes = Array.from({ length }, (_, index) => DIRECTIONS[(index + this.drawn) % DIRECTIONS.length]);
  }
  private beginWaves() { this.setStage('waves'); if (!this.waveCount) this.end('win'); }
  private setStage(stage: SectTrialStage) { this.stage = stage; this.elapsed = 0; }
  private end(result: SectTrialResult) {
    if (this.ended) return;
    this.result = result; this.stage = 'ended'; this.requests = [];
  }
}
