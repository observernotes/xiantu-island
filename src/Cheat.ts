import { CLASS_LIST, classRobe } from './classes';
import { BREAKTHROUGH_LEVELS, ITEMS, MAX_LEVEL, MONSTERS, QUEST_HOOKS, QUESTS, REALMS, TILED_MAPS } from './data';
import { SKILLS } from './skills';
import { FIELD_TEST } from './config/maps';
import { FEEL } from './config/feel';
import { installPanel, type CheatPanelApi } from './CheatPanel';
import { isCheatEnabled, isCheatGod, onCheatSceneReady, setCheatGod, unlockCheatSkills } from './cheatFlags';
import { parseQuery } from './cheatQuery';
import type { GameScene } from './scenes/GameScene';

export { parseQuery } from './cheatQuery';
export interface CheatApi extends CheatPanelApi { readonly enabled: boolean }
declare global { interface Window { __cheat?: CheatApi } }

const registered = (table: object, id: string) => Object.prototype.hasOwnProperty.call(table, id);
const integer = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min;
let installed = false;

/** main 在创建游戏前按 URL 动态加载；普通入口不会执行此模块。 */
export function installCheat() {
  if (!isCheatEnabled() || installed) return;
  installed = true;
  const query = parseQuery(location.search);
  setCheatGod(query.god);
  let scene: GameScene | undefined;
  let booted = false, travelling = false;
  const current = () => {
    if (!scene || travelling) throw new Error('场景尚未就绪');
    return scene;
  };
  const log = (message: string, failed = false) => {
    console[failed ? 'warn' : 'info'](`[Cheat] ${message}`);
    scene?.log(`[作弊] ${message}`, failed ? '#ffbe91' : '#ffe680');
  };
  const run = async (label: string, action: (s: GameScene) => boolean | Promise<boolean>) => {
    try {
      const ok = await action(current());
      if (!ok) log(`${label}未执行（条件不符或存档失败）`, true);
      return ok;
    } catch (error) {
      log(`${label}失败：${error instanceof Error ? error.message : String(error)}`, true);
      return false;
    }
  };
  const persist = async (s: GameScene) => {
    await s.prog.flushSaves();
    s.player.hp = s.prog.hp; s.player.maxHp = s.prog.maxHp;
    s.player.syncAppearance(); s.skillWindow.refresh();
    return await s.prog.setPosition(s.map.id, s.player.x, s.player.y, { async: true });
  };
  const applyLevel = (s: GameScene, level: number) => {
    if (!integer(level, 1)) return false;
    const p = s.prog;
    p.level = Math.min(MAX_LEVEL, level); p.exp = 0; p.overflowExp = 0;
    // 与读档补发同一规则；已经领取的境界奖励不会重复乘算。
    p.backfillRealmRewards();
    p.hp = p.maxHp; p.mp = p.maxMp;
    return true;
  };
  const accept = (s: GameScene, id: string) => {
    if (!registered(QUESTS, id)) throw new Error(`未知任务 ${id}`);
    const state = s.quests.state(id);
    if (state === 'done') return false;
    if (state === 'active' || s.quests.accept(id)) return true;
    s.prog.quests[id] = { state: 'active', kills: {}, crafted: {} };
    if (id === 'q_alchemy_intro') s.prog.grantRecipe('recipe_hp_pill');
    return true;
  };
  const giveItem = (s: GameScene, id: string, n: number) => {
    if (!registered(ITEMS, id) || !s.prog.canReceiveItem(id, n)) throw new Error(`未知物品或非法数量 ${id} x ${n}`);
    s.prog.addItem(id, n);
  };
  const complete = async (s: GameScene, id: string) => {
    if (!registered(QUESTS, id)) throw new Error(`未知任务 ${id}`);
    if (s.quests.state(id) === 'done') return false;
    if (!accept(s, id)) return false;
    const q = QUESTS[id], p = s.prog, st = p.quests[id];
    if (p.level < q.reqLevel) applyLevel(s, q.reqLevel);
    for (const { o, cur, need } of s.quests.objectiveProgress(q)) {
      switch (o.type) {
        // 直接补当前任务目标，不把模拟击杀/交谈传播给其他任务。
        case 'kill': st.kills[o.target!] = Math.max(st.kills[o.target!] ?? 0, need); break;
        case 'collect': if (need > cur) giveItem(s, o.target!, need - cur); break;
        case 'reach': st.reached = true; break;
        case 'talk': (st.talked ??= {})[o.target!] = true; break;
        case 'craft':
          if (need > cur) giveItem(s, o.target!, need - cur);
          (st.crafted ??= {})[o.target!] = Math.max(st.crafted?.[o.target!] ?? 0, need);
          break;
        case 'trial': if (o.trial && !p.completedTrials.includes(o.trial)) p.completedTrials.push(o.trial); break;
        case 'breakthrough': {
          // realm 是目标境界；已经越过旧任务时不能再突破当前境界。
          const target = REALMS.find(r => r.id === o.realm);
          if (target && p.level >= target.levelMin) break;
          const level = target ? target.levelMin - 1 : BREAKTHROUGH_LEVELS.find(level => level >= p.level);
          if (level === undefined) throw new Error('当前境界已无突破关口');
          if (p.level !== level) applyLevel(s, level);
          p.exp = p.expNeed;
          break;
        }
        default: throw new Error(`暂不支持的任务目标 ${o.type}`);
      }
    }
    // 强制完成没有选择 UI，使用已开启交付节点的首项选择。
    const hook = QUEST_HOOKS?.questHooks.find(candidate => candidate.quest === id
      && candidate.on === 'turn_in' && candidate.enabled);
    await s.prog.flushSaves();
    const reward = await s.quests.turnInAsync(id, true, hook?.choices[0].id);
    if (reward) s.giveRewards(reward.quest, reward.broke, reward.daily, reward.settled);
    const saved = await persist(s);
    return !!reward && saved;
  };

  const api: CheatApi = {
    enabled: true,
    get god() { return isCheatGod(); },
    setGod: value => run('无敌切换', s => { setCheatGod(!!value); return persist(s); }),
    setStones: (n = 999999) => run('设置灵石', s => {
      if (!integer(n)) return false;
      s.prog.stones = n; return persist(s);
    }),
    setContrib: (n = 999999) => run('设置贡献', s => {
      if (!integer(n)) return false;
      s.prog.sectContribution = n; return persist(s);
    }),
    setLevel: n => run('设置等级', s => applyLevel(s, n) && persist(s)),
    setRealm: value => run('设置境界', s => {
      const name = String(value).trim().replace(/期$/, '');
      const realm = REALMS.find(r => r.id === name || String(r.name).replace(/期$/, '') === name);
      if (!realm) throw new Error(`未知境界 ${value}`);
      return applyLevel(s, realm.levelMin) && persist(s);
    }),
    nextRealm: () => run('提升境界', s => {
      const realm = REALMS[REALMS.findIndex(r => r.id === s.prog.realm.id) + 1];
      return !!realm && applyLevel(s, realm.levelMin) && persist(s);
    }),
    fillExp: () => run('修为圆满', s => {
      if (!Number.isFinite(s.prog.expNeed)) return false;
      s.prog.exp = s.prog.expNeed; return persist(s);
    }),
    acceptQuest: id => run(`接取 ${id}`, s => accept(s, id) && persist(s)),
    completeQuest: id => run(`完成 ${id}`, s => complete(s, id)),
    skipQuests: () => run('完成当前主支线', async s => {
      const ids = Object.keys(s.prog.quests).filter(id => registered(QUESTS, id)
        && !QUESTS[id].daily && s.prog.quests[id].state === 'active');
      let ok = true;
      for (const id of ids) ok = await api.completeQuest(id) && ok;
      return await persist(s) && ok;
    }),
    spawnMon: id => run(`生成怪物 ${id}`, s => {
      if (!registered(MONSTERS, id)) throw new Error(`未知怪物 ${id}`);
      const x = Math.min(s.map.width - 32, Math.max(32, s.player.x + 100));
      const mob = s.spawnTrialMob(id, x, s.player.y);
      return !!mob && persist(s);
    }),
    spawnItem: (id, n = 1) => run(`发放物品 ${id}`, s => { giveItem(s, id, n); return persist(s); }),
    unlockSkills: () => run('解锁技能', s => {
      unlockCheatSkills();
      for (const def of Object.values(SKILLS)) {
        s.prog.grantSkill(def.id, 1);
        s.prog.autoBind(def.id);
      }
      s.prog.hp = s.prog.maxHp; s.prog.mp = s.prog.maxMp;
      return persist(s);
    }),
    unlockOutfits: () => run('解锁五宗道袍', s => {
      for (const cls of CLASS_LIST) {
        const id = classRobe(cls);
        if (id && s.prog.count(id) < 1) giveItem(s, id, 1);
      }
      return persist(s);
    }),
    teleport: id => run(`传送 ${id}`, async s => {
      if (!registered(TILED_MAPS, id) && id !== 'field_test') throw new Error(`未知地图 ${id}`);
      const row = FIELD_TEST.rows.findIndex(row => row.includes('P'));
      const pos = id === 'field_test'
        ? { x: (FIELD_TEST.rows[row].indexOf('P') + 0.5) * FEEL.tile, y: (row + 1) * FEEL.tile }
        : TILED_MAPS[id].layers.flatMap((layer: { objects?: { type: string; x: number; y: number }[] }) => layer.objects ?? [])
          .find((object: { type: string }) => object.type === 'playerStart') ?? { x: 64, y: 64 };
      s.prog.pendingSectTrial = null; s.prog.endTrialSkills();
      await s.prog.flushSaves();
      if (!await s.prog.setPosition(id, pos.x, pos.y, { async: true })) return false;
      travelling = true;
      s.scene.restart({ map: id, pos: { x: pos.x, y: pos.y } });
      return true;
    }),
  };

  onCheatSceneReady(async s => {
    scene = s; travelling = false;
    if (booted) return;
    booted = true;
    await s.prog.flushSaves();
    if (query.stones !== undefined) await api.setStones(query.stones);
    if (query.contrib !== undefined) await api.setContrib(query.contrib);
    if (query.realm) await api.setRealm(query.realm);
    if (query.level !== undefined) await api.setLevel(query.level);
    if (query.fillExp) await api.fillExp();
    for (const action of query.quests) {
      if (action === 'skip') await api.skipQuests();
      else if (action.startsWith('accept:')) await api.acceptQuest(action.slice(7));
      else if (action.startsWith('complete:')) await api.completeQuest(action.slice(9));
      else log(`未知任务指令 ${action}`, true);
    }
    for (const action of query.spawns) {
      if (action.startsWith('mon:')) await api.spawnMon(action.slice(4));
      else if (action.startsWith('item:')) {
        const value = action.slice(5);
        // 优先认完整物品 id，避免合法 id 本身以 x数字结尾时被拆错。
        const match = registered(ITEMS, value) ? null : value.match(/^(.*)x(\d+)$/);
        await api.spawnItem(match ? match[1] : value, match ? Number(match[2]) : 1);
      } else log(`未知生成指令 ${action}`, true);
    }
    for (const unlock of query.unlocks) {
      if (unlock === 'skills') await api.unlockSkills();
      else if (unlock === 'outfits') await api.unlockOutfits();
      else log(`未知解锁项 ${unlock}`, true);
    }
    // API 和面板出现即代表 URL 夹具已经逐项提交，测试入口可据此等待就绪。
    window.__cheat = api;
    const removePanel = installPanel(api);
    const panel = document.getElementById('xt-cheat-panel')!;
    panel.addEventListener('focusin', () => scene?.input.keyboard?.resetKeys());
    s.game.events.once('destroy', () => { removePanel(); delete window.__cheat; });
    log('已启用；操作将写入当前存档');
  });
}
