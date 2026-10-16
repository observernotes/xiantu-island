export interface EncounterBattleAnchor { readonly x: number; readonly y: number; readonly height?: number }
export interface EncounterBattleSpawn {
  readonly monster: string; readonly count: number; readonly x?: number; readonly y?: number;
}
export interface EncounterBattleRequest {
  readonly attemptId: string; readonly encounterId: string; readonly stepId: string;
  readonly spawns: readonly EncounterBattleSpawn[]; readonly warningMs: number;
  readonly respawnMs: 0; readonly grantRewards: false; readonly anchor?: EncounterBattleAnchor;
}
export interface EncounterBattleHandle { dispose(): void }
export interface EncounterBattleProvider {
  start(request: EncounterBattleRequest, complete: (success: boolean) => void): EncounterBattleHandle;
}
interface BattleMob { grantRewards: boolean; noRespawn: boolean; def: { respawnMs: number } }
/** Phaser 只负责计时、显示与实体分配；计数只能来自本波实体的死亡回调。 */
export interface EncounterBattleHost<M extends BattleMob> {
  fallbackAnchor(): EncounterBattleAnchor;
  schedule(delayMs: number, callback: () => void): EncounterBattleHandle;
  warn(anchor: EncounterBattleAnchor): EncounterBattleHandle;
  spawn(monster: string, x: number, y: number): M | null;
  onDeath(mob: M, callback: () => void): EncounterBattleHandle;
  destroy(mob: M): void;
}

export function createEncounterBattleProvider<M extends BattleMob>(host: EncounterBattleHost<M>): EncounterBattleProvider {
  return { start(request, complete) {
    let disposed = false, completed = false;
    let spawnTimer: EncounterBattleHandle | undefined, resultTimer: EncounterBattleHandle | undefined;
    const warnings: EncounterBattleHandle[] = [], subscriptions: EncounterBattleHandle[] = [], mobs: M[] = [];
    const alive = new Set<M>();
    const handle: EncounterBattleHandle = { dispose() {
      if (disposed) return;
      disposed = true;
      spawnTimer?.dispose(); resultTimer?.dispose();
      for (const warning of warnings) warning.dispose();
      for (const subscription of subscriptions) subscription.dispose();
      for (const mob of mobs) host.destroy(mob);
      alive.clear();
    } };
    const finish = (success: boolean) => {
      if (disposed || completed) return;
      completed = true;
      // Monster.die 在 onDead 后还要登记死亡动画的 timer，回到下一拍再让 Runtime 清场。
      resultTimer = host.schedule(0, () => { resultTimer = undefined; if (!disposed) complete(success); });
    };
    if (!Array.isArray(request.spawns) || !request.spawns.length || request.spawns.some(row =>
      !row || typeof row.monster !== 'string' || !row.monster.trim() || !Number.isSafeInteger(row.count) || row.count <= 0)
      || !Number.isFinite(request.warningMs) || request.warningMs < 0) {
      finish(false); return handle;
    }
    const anchor = request.anchor ?? host.fallbackAnchor();
    const points = request.spawns.flatMap(row => Array.from({ length: row.count }, () => ({ monster: row.monster, x: row.x, y: row.y })))
      .map((row, index) => ({ monster: row.monster,
        x: row.x ?? anchor.x + (index % 2 === 0 ? -1 : 1) * (88 + Math.floor(index / 2) * 64), y: row.y ?? anchor.y }));
    try {
      for (const point of points) warnings.push(host.warn(point));
      spawnTimer = host.schedule(request.warningMs, () => {
        spawnTimer = undefined;
        if (disposed || completed) return;
        for (const warning of warnings) warning.dispose();
        warnings.length = 0;
        try {
          for (const point of points) {
            const mob = host.spawn(point.monster, point.x, point.y);
            if (!mob) { finish(false); return; }
            mob.grantRewards = false; mob.noRespawn = true;
            // 每只实例复制定义，不能污染 MONSTERS 或 map.spawns 的常驻配置。
            mob.def = { ...mob.def, respawnMs: 0 };
            mobs.push(mob); alive.add(mob);
            subscriptions.push(host.onDeath(mob, () => {
              if (disposed || completed || !alive.delete(mob)) return;
              if (mobs.length === points.length && !alive.size) finish(true);
            }));
          }
        } catch { finish(false); }
      });
    } catch { finish(false); }
    return handle;
  } };
}
