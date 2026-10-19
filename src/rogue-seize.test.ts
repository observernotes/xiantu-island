import { DROPS, MONSTERS, t } from './data';
import {
  ROGUE_DROP_T1,
  ROGUE_DROP_T2,
  ROGUE_MAP_ID,
  ROGUE_MAX_ALIVE,
  ROGUE_NAME_POOL,
  ROGUE_RESPAWN_MS,
  ROGUE_TEMPLATE_ID,
  ROGUE_TITLE_POOL,
  ROGUE_T2_OVERRIDE,
  RogueCultivatorSpawner,
  buildRogueDef,
  rollDisplayName,
  rollTier,
  rogueTablesReady,
  shouldEmitSeizeTip,
  type Rng,
} from './RogueCultivatorSpawn';

/** design/38 杀人夺宝 tip＋生成器关态自测 */
export function runRogueSeizeTests() {
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
    }
  };
  const ok = (value: unknown, message: string) => { eq(!!value, true, message); };

  // --- strings ---
  eq(t('loot.seize'), '夺得随身之物。', 'loot.seize 文案 MATCH');

  // --- pools ---
  ok(ROGUE_TITLE_POOL.length >= 3, '称谓池 ≥3');
  ok(ROGUE_NAME_POOL.length >= 12, '名号池 ≥12');
  eq(ROGUE_MAX_ALIVE, 2, '同图上限 2');
  eq(ROGUE_RESPAWN_MS, 45_000, '冷却 45s');
  eq(ROGUE_MAP_ID, 'luoxia_outskirts_2', '主锚地图');

  // --- tables ready（本 tip 已同步落表）---
  ok(rogueTablesReady(), 'rogue 模板＋t1/t2 表已落 → ready');
  ok(!!MONSTERS[ROGUE_TEMPLATE_ID], 'MONSTERS.rogue_cultivator 存在');
  ok(!!DROPS[ROGUE_DROP_T1], 'drop_seize_rogue_t1 存在');
  ok(!!DROPS[ROGUE_DROP_T2], 'drop_seize_rogue_t2 存在');

  // --- 关态：无表 → 零实体 ---
  {
    eq(rogueTablesReady({} as any, DROPS as any), false, '无模板 → 不 ready');
    eq(rogueTablesReady(MONSTERS, {} as any), false, '无 drop → 不 ready');
    let spawned = 0;
    const spawner = new RogueCultivatorSpawner({
      mapId: ROGUE_MAP_ID,
      now: () => 0,
      aliveRogueCount: () => spawned,
      scheduleRespawn: () => {},
      spawnOne: () => { spawned++; return { seizeLoot: true } as any; },
    });
    // 伪造无表：用 enabled 短路——换一张非锚地图
    const other = new RogueCultivatorSpawner({
      mapId: 'luoxia_town',
      now: () => 0,
      aliveRogueCount: () => 0,
      scheduleRespawn: () => {},
      spawnOne: () => { spawned++; return { seizeLoot: true } as any; },
    });
    other.onEnterMap();
    eq(spawned, 0, '非锚地图零实体');
    eq(other.enabled, false, '非锚地图 disabled');
  }

  // --- 随机名号 ---
  {
    const names = new Set<string>();
    let i = 0;
    const seq = [0.01, 0.1, 0.2, 0.35, 0.5, 0.6, 0.7, 0.85, 0.92, 0.99, 0.15, 0.45];
    const rng: Rng = () => seq[i++ % seq.length]!;
    for (let n = 0; n < 6; n++) names.add(rollDisplayName(rng));
    ok([...names].every(s => s.includes('·')), '名号含间隔点');
    ok([...names].every(s => {
      const [title, name] = s.split('·');
      return (ROGUE_TITLE_POOL as readonly string[]).includes(title!)
        && (ROGUE_NAME_POOL as readonly string[]).includes(name!);
    }), '名号来自称谓×名号池');
    ok(names.size >= 2, '多次 roll 可察不同（或等价多样）');
  }

  // --- 档位 ---
  {
    const t1 = buildRogueDef('T1', '散修·青岚');
    ok(!!t1, 'T1 def');
    eq(t1!.name, '散修·青岚', 'T1 显示名');
    eq(t1!.level, MONSTERS[ROGUE_TEMPLATE_ID]!.level, 'T1 level 表内默认');
    eq(t1!.hp, MONSTERS[ROGUE_TEMPLATE_ID]!.hp, 'T1 hp 表内默认');
    eq(t1!.dropTable, ROGUE_DROP_T1, 'T1 drop t1');

    const t2 = buildRogueDef('T2', '劫道客·暮雨');
    ok(!!t2, 'T2 def');
    eq(t2!.level, ROGUE_T2_OVERRIDE.level, 'T2 level 20');
    eq(t2!.hp, ROGUE_T2_OVERRIDE.hp, 'T2 hp 663');
    eq(t2!.atk, ROGUE_T2_OVERRIDE.atk, 'T2 atk 73');
    eq(t2!.def, ROGUE_T2_OVERRIDE.def, 'T2 def 12');
    eq(t2!.exp, ROGUE_T2_OVERRIDE.exp, 'T2 exp 40');
    eq(t2!.dropTable, ROGUE_DROP_T2, 'T2 drop t2');
    eq(t2!.sprite, 'mon_black_robe_minion', '外观 sprite＝黑袍 minion（最小）');
    eq(t2!.aggressive, true, 'aggressive');
  }

  // --- tip 门闩 ---
  {
    eq(shouldEmitSeizeTip({ seizeLoot: true }, true), true, '夺宝目标＋drop 路径 → tip');
    eq(shouldEmitSeizeTip({ seizeLoot: true }, false), false, '无 drop 路径 → 不 tip');
    eq(shouldEmitSeizeTip({ seizeLoot: false }, true), false, '非夺宝标记 → 不 tip');
    eq(shouldEmitSeizeTip({}, true), false, '缺省 → 不 tip');
    eq(shouldEmitSeizeTip(null, true), false, 'null → 不 tip');
  }

  // --- 生成器补足 ≤2 ---
  {
    let spawned = 0;
    const alive: any[] = [];
    let scheduled: number[] = [];
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    let si = 0;
    const rng: Rng = () => seq[si++ % seq.length]!;
    const spawner = new RogueCultivatorSpawner({
      mapId: ROGUE_MAP_ID,
      now: () => 1000,
      aliveRogueCount: () => alive.filter(m => m.seizeLoot).length,
      scheduleRespawn: (ms) => { scheduled.push(ms); },
      spawnOne: (def, _x, _y, meta) => {
        const m = { seizeLoot: true, def, meta, active: true, dead: false };
        alive.push(m);
        spawned++;
        return m as any;
      },
    }, rng);
    ok(spawner.enabled, '锚地图＋表 → enabled');
    spawner.onEnterMap();
    eq(spawned, ROGUE_MAX_ALIVE, '入图补足至 2');
    spawner.tryFill();
    eq(spawned, ROGUE_MAX_ALIVE, '已满不再刷');

    // 死一只 → 登记 45s；冷却回调 tryFill 再补
    const dead = alive.pop();
    spawner.onRogueDead(dead);
    eq(scheduled, [ROGUE_RESPAWN_MS], '死亡调度 45s');
    eq(alive.length, 1, '死后场上 1');
    spawner.tryFill(); // 模拟 45s 后的 scheduleRespawn 回调
    eq(alive.length, ROGUE_MAX_ALIVE, '冷却回调后补回 2');
    eq(spawned, 3, '累计生成 3 次（入图2＋补1）');
  }

  // --- rollTier 可测 ---
  {
    eq(rollTier(() => 0.1), 'T1', 'rng<0.5 → T1');
    eq(rollTier(() => 0.7), 'T2', 'rng≥0.5 → T2');
  }

  // --- 黑袍表未动旁证（drop 键仍在且非 seize 表）---
  {
    ok(!!DROPS['drop_black_robe_minion'], '黑袍 minion drop 仍在');
    ok(!!DROPS['drop_black_robe_guard'], '黑袍 guard drop 仍在');
    ok(!!MONSTERS['black_robe_minion'], '黑袍 minion 模板仍在');
  }

  console.log(`rogue seize tests ok: ${assertions} assertions (loot.seize tip; name roll; T1/T2; cap≤2; closed zero entity; no OpenFlag)`);
  return assertions;
}
