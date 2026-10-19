import { FLY_ZONES, REALMS, t } from './data';
import { Progress } from './Progress';
import { GameScene } from './scenes/GameScene';

/** design/37 tip 接线关态自测：enter／land／timeout 各一次；失败零 enter；互斥。 */
export function runFlySustainFeedbackTests() {
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    }
  };
  const ok = (value: unknown, message: string) => { eq(!!value, true, message); };

  eq(t('fly.sustain_enter'), '御剑升空。', 'enter 文案 MATCH');
  eq(t('fly.sustain_land'), '御剑落地。', 'land 文案 MATCH');
  eq(t('fly.sustain_timeout'), '御剑力尽，缓缓落地。', 'timeout 文案 MATCH');
  ok(FLY_ZONES, '正式飞区表可用');

  const foundation = REALMS.find(r => r.id === FLY_ZONES!.unlockRealm)!;
  function makeScene(opts: { inZone?: boolean; mapId?: string; mp?: number; level?: number; skill?: boolean; now?: number } = {}) {
    const logs: string[] = [];
    const progress = new Progress();
    progress.level = opts.level ?? foundation.levelMin;
    progress.mp = opts.mp ?? Math.max(50, FLY_ZONES!.mpPerSecond * 4);
    if (opts.skill !== false) progress.skills.sword_ride = 1;
    const body = { setAllowGravity(_v?: boolean) {}, setVelocityY(_v?: number) {} };
    const player = { x: 10, y: 10, state2: 'ground' as string, body };
    const now = opts.now ?? 1_000;
    const scene = Object.assign(Object.create(GameScene.prototype), {
      prog: progress,
      player,
      map: {
        id: opts.mapId ?? FLY_ZONES!.maps[0],
        objects: opts.inZone === false ? [] : [{ type: 'flyZone', name: 'flyZone_1', x: 0, y: 0, w: 100, h: 100 }],
        zones: [],
      },
      time: { now },
      log: (message: string) => { logs.push(message); },
    }) as GameScene;
    return { scene, logs, progress };
  }

  // C：失败进入 — 区外 → 既有 tip，零 enter
  {
    const h = makeScene({ inZone: false });
    const r = h.scene.requestSustainFlight();
    eq(r.ok, false, '区外拒绝进入');
    eq(h.logs.filter(m => m === t('fly.sustain_enter')).length, 0, '失败进入零 enter');
    ok(h.logs.includes(t('fly.zone_unavailable')) || h.logs.includes(t('fly.zone_disabled')),
      '失败进入仍既有 tip');
    eq(h.scene.isSustainFlying(), false, '失败不进飞行态');
  }

  // O01：成功进入 → 一次 enter
  {
    const h = makeScene({ inZone: true });
    const beforeMp = h.progress.mp;
    const r = h.scene.requestSustainFlight();
    eq(r.ok, true, '区内成功进入');
    eq(('entered' in r) && r.entered, true, 'entered=true');
    eq(h.logs.filter(m => m === t('fly.sustain_enter')).length, 1, '成功进入一次 enter');
    eq(h.logs.filter(m => m === t('fly.sustain_land')).length, 0, '进入不叠 land');
    eq(h.scene.isSustainFlying(), true, '进入后处于飞行');
    eq(h.progress.mp, beforeMp - FLY_ZONES!.mpPerSecond, '首秒扣蓝不变');
  }

  // O02：再按取消 → 一次 land
  {
    const h = makeScene({ inZone: true });
    h.scene.requestSustainFlight();
    const enterCount = h.logs.filter(m => m === t('fly.sustain_enter')).length;
    eq(enterCount, 1, '取消前已一次 enter');
    const r2 = h.scene.requestSustainFlight();
    eq(r2.ok, true, '取消路径 ok');
    eq(('entered' in r2) && r2.entered, false, '取消不标 entered');
    eq(h.logs.filter(m => m === t('fly.sustain_enter')).length, 1, '取消不复打 enter');
    eq(h.logs.filter(m => m === t('fly.sustain_land')).length, 1, '取消一次 land');
    eq(h.logs.filter(m => m === t('fly.sustain_timeout')).length, 0, '取消不叠 timeout');
    eq(h.scene.isSustainFlying(), false, '取消后落地');
  }

  // O03：timeout → 一次 timeout（非 land）
  {
    const now = 5_000;
    const h = makeScene({ inZone: true, now });
    h.scene.requestSustainFlight();
    eq(h.scene.isSustainFlying(), true, 'timeout 前在飞');
    (h.scene as unknown as { updateSustainFlight(t: number): void })
      .updateSustainFlight(now + FLY_ZONES!.maxFlightMs);
    eq(h.scene.isSustainFlying(), false, 'timeout 后落地');
    eq(h.logs.filter(m => m === t('fly.sustain_timeout')).length, 1, 'timeout 一次');
    eq(h.logs.filter(m => m === t('fly.sustain_land')).length, 0, 'timeout 不叠 land');
    eq(h.logs.filter(m => m === t('fly.sustain_enter')).length, 1, 'timeout 路径仍仅一次 enter');
  }

  // O04 互斥：leave 既有 tip，不叠 land／timeout／enter
  {
    const now = 2_000;
    const h = makeScene({ inZone: true, now });
    h.scene.requestSustainFlight();
    // 清空飞区 → leave
    (h.scene as unknown as { map: { objects: unknown[] } }).map.objects = [];
    (h.scene as unknown as { updateSustainFlight(t: number): void })
      .updateSustainFlight(now + 500);
    eq(h.logs.filter(m => m === t('fly.zone_unavailable')).length, 1, 'leave 既有 tip');
    eq(h.logs.filter(m => m === t('fly.sustain_land')).length, 0, 'leave 不叠 land');
    eq(h.logs.filter(m => m === t('fly.sustain_timeout')).length, 0, 'leave 不叠 timeout');
    eq(h.logs.filter(m => m === t('fly.sustain_enter')).length, 1, 'leave 不复打 enter');
  }

  // O04 互斥：mp 既有 tip，不叠 land／timeout
  {
    const now = 3_000;
    const h = makeScene({ inZone: true, now, mp: FLY_ZONES!.mpPerSecond }); // 仅够首秒
    h.scene.requestSustainFlight(); // 扣首秒 → mp=0
    eq(h.progress.mp, 0, '首秒后蓝尽');
    (h.scene as unknown as { updateSustainFlight(t: number): void })
      .updateSustainFlight(now + 1000); // nextDrainAt
    eq(h.logs.filter(m => m === t('fly.mp_low')).length, 1, 'mp 既有 tip');
    eq(h.logs.filter(m => m === t('fly.sustain_land')).length, 0, 'mp 不叠 land');
    eq(h.logs.filter(m => m === t('fly.sustain_timeout')).length, 0, 'mp 不叠 timeout');
  }

  console.log(`fly sustain feedback tests ok: ${assertions} assertions (enter/land/timeout once; fail zero enter; leave/mp mutex)`);
  return assertions;
}
