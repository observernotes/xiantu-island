import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// 与 overflow-test 一样由 Vite 加载实际源码。Phaser 的渲染/物理接口用替身，
// 断言调用真实 Monster / GameScene 方法；真实 Arcade 物理另做无头冒烟。
const root = fileURLToPath(new URL('../', import.meta.url));
const phaserId = '\0fox-hotfix-phaser';
const server = await createServer({
  root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', ssr: { noExternal: ['phaser'] },
  plugins: [{
    name: 'fox-hotfix-phaser', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return phaserId; },
    load(id) {
      if (id !== phaserId) return;
      return `
        class Sprite {
          setFlipX(v) { this.flipX = v; return this; }
          setVisible(v) { this.visible = v; return this; }
          setAlpha(v) { this.alpha = v; return this; }
          setFrame(v) { this.frame = { name: v }; return this; }
          clearTint() { return this; }
          destroy() { this.active = false; this.body = null; }
        }
        class Rectangle {
          constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
          get left() { return this.x; } get right() { return this.x + this.width; }
          get top() { return this.y; } get bottom() { return this.y + this.height; }
          contains(x, y) { return x >= this.left && x <= this.right && y >= this.top && y <= this.bottom; }
        }
        export default {
          Scene: class {}, Physics: { Arcade: { Sprite } }, BlendModes: { NORMAL: 0 },
          Input: { Keyboard: { JustDown: () => false } },
          Math: { Clamp: (v, lo, hi) => Math.max(lo, Math.min(v, hi)) },
          Geom: { Rectangle, Intersects: { RectangleToRectangle: (a, b) =>
            a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y } },
        };
      `;
    },
  }],
});

try {
  const { Monster } = await server.ssrLoadModule('/src/scenes/Monster.ts');
  const { GameScene } = await server.ssrLoadModule('/src/scenes/GameScene.ts');
  const { MONSTERS, GAME_PHASE } = await server.ssrLoadModule('/src/data.ts');
  const packs = Object.fromEntries(['mon_demon_fox', 'fx_fox_phantom_dash_warn', 'fx_summon_despawn'].map(key =>
    [key, JSON.parse(fs.readFileSync(new URL(`../data/art/sprites/${key}.anims.json`, import.meta.url), 'utf8'))]));
  const zone = { name: 'fox', x: 3000, y: 600, w: 840, h: 424, props: {} };

  function fxSprite(x, y, key) {
    return {
      x, y, key, width: key === 'fx_fox_phantom_dash_warn' ? 448 : 96, height: 48,
      scaleX: 1, scaleY: 1, data: {}, active: true,
      setData(k, v) { this.data[k] = v; return this; }, getData(k) { return this.data[k]; },
      setOrigin(x, y) { this.originX = x; this.originY = y; return this; },
      setFlipX(v) { this.flipX = v; return this; }, setDepth() { return this; },
      setBlendMode() { return this; }, play() { return this; },
      setPosition(x, y) { this.x = x; this.y = y; return this; },
      setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; },
      setDisplaySize(w, h) { this.scaleX = w / this.width; this.scaleY = h / this.height; return this; },
      destroy() { this.active = false; },
    };
  }

  function fixture({ boss = true, zones = [zone], x = 3700, y = 960, homeX = 3400 } = {}) {
    const fx = [];
    const floor = { active: true, body: { enable: true, x: 0, y: 960, left: 0, right: 3840, top: 960, bottom: 1024, width: 3840, height: 64 } };
    const scene = {
      map: { width: 3840, height: 1024, zones, solids: { getChildren: () => [floor] }, oneWays: { getChildren: () => [] }, spawn: { x: 64, y: 960 } },
      physics: { world: { bounds: { x: 0, y: 0, left: 0, top: 0, right: 3840, bottom: 1224, width: 3840, height: 1224 } }, overlapRect: () => [floor] },
      time: { now: 0 }, cache: { json: { get: key => packs[key.replace(/_anims$/, '')] } },
      textures: { exists: () => true }, anims: { exists: () => true },
      add: { sprite: (x, y, key) => { const s = fxSprite(x, y, key); fx.push(s); return s; } },
    };
    const m = Object.assign(Object.create(Monster.prototype), {
      scene, x, y, active: true, visible: true, atlas: false,
      def: MONSTERS[boss ? 'demon_fox' : 'wild_boar_spirit'], hp: 1271,
      home: { x: homeX, y: 960 }, st: 'patrol', dir: 1, usedOnce: new Set(), summons: [],
      cast: null, charge: null, fxTimers: [], cooldowns: {}, suppressTouch: false, dashing: false, despawning: false,
      bar: { clear() {} }, anim() {},
    });
    const vector = (x, y) => ({ x, y, copy(v) { this.x = v.x; this.y = v.y; return this; } });
    m.body = {
      width: 48, height: 64, enable: true, blocked: { down: true }, touching: {}, velocity: { x: 0, y: 0 },
      // 192×160 图贴图左上角到 48×64 碰撞体的非零 offset。
      offset: { x: 72, y: 96 }, position: vector(x - 24, y - 64), prev: vector(x - 24, y - 64), prevFrame: vector(x - 24, y - 64),
      get x() { return this.position.x; }, get y() { return this.position.y; },
      get left() { return this.x; }, get right() { return this.x + this.width; },
      get top() { return this.y; }, get bottom() { return this.y + this.height; }, get center() { return { x: this.x + 24, y: this.y + 32 }; },
      // Phaser Body.reset 初始坐标为贴图左上角，暂时不加碰撞体 offset。
      reset(x, y) {
        m.x = x; m.y = y; this.position.x = x - 96; this.position.y = y - 160;
        this.prev.copy(this.position); this.prevFrame.copy(this.position);
        this.velocity.x = 0; this.velocity.y = 0;
      },
      updateFromGameObject() { this.position.x = m.x - 96 + this.offset.x; this.position.y = m.y - 160 + this.offset.y; },
      setVelocityX(v) { this.velocity.x = v; return this; }, setVelocityY(v) { this.velocity.y = v; return this; },
      setVelocity(x, y) { this.velocity.x = x; this.velocity.y = y; return this; },
    };
    const player = { x: x + 100, y: 960, dead: false, body: { x: -100, y: 896, width: 26, height: 64,
      reset(x, y) { player.x = x; player.y = y; }, setVelocityX() {} } };
    return { m, scene, player, fx };
  }

  const dash = MONSTERS.demon_fox.skills.find(s => s.id === 'phantom_dash');
  assert.equal(GAME_PHASE, 5, 'dev 保留 v0.5 地图阶段');

  // 后续断言只依赖可观测目标、位置与状态，不自行重实现夹取算法。
  for (const [zones, x, direction, expected, label] of [
    [[zone], 3700, 1, 3816, '首领区右边缘'],
    [[zone], 3100, -1, 3024, '首领区左边缘'],
    [[], 3700, 1, 3816, '世界右边缘'],
    [[], 100, -1, 24, '世界左边缘'],
    [[zone], 3200, 1, 3584, '区域内正常向右突袭'],
    [[zone], 3500, -1, 3116, '区域内正常向左突袭'],
  ]) {
    const { m, player } = fixture({ zones, x });
    player.x = x + direction * 100;
    m.startSkill(dash, 0, player);
    assert.equal(m.cast.targetX, expected, `${label}：突袭目标夹住并留半碰撞体`);
    const warn = m.cast.warn;
    assert.ok(warn, `${label}：创建实际预警特效`);
    assert.equal(warn.key, 'fx_fox_phantom_dash_warn', `${label}：预警使用原有图集`);
    assert.equal(warn.x, expected, `${label}：预警落点是夹过的目标`);
    // 图集两端各留 32px，384px 的有效预警路径缩放至夹过的突袭距离。
    assert.ok(Math.abs(warn.scaleX - Math.abs(expected - x) / dash.distance) < 1e-6, `${label}：预警长度匹配夹过的目标`);
    m.tickDash(m.cast.releaseAt, player);
    // 模拟 Arcade 先积分 Body，Sprite 尚未在 postUpdate 同步的真实时序。
    m.body.position.x = (direction > 0 ? 3900 : zones.length ? 2900 : -100) - 24;
    m.tickDash(800, player);
    assert.equal(m.x, expected, `${label}：每帧夹住突袭位置`);
    assert.equal(m.body.center.x, expected, `${label}：物理碰撞体也夹住`);
    assert.equal(m.body.bottom, 960, `${label}：reset 后碰撞体保留贴图 offset，脚底仍在地面`);
    assert.equal(m.body.prev.x, m.body.x, `${label}：消掉本帧待同步水平位移`);
    assert.equal(m.body.prevFrame.y, m.body.y, `${label}：消掉本帧待同步垂直位移`);
    assert.equal(m.body.velocity.x, 0, `${label}：到边界停止突袭`);
    assert.equal(m.dashing, false, `${label}：冲刺状态结束`);
  }

  for (const [x, direction, expected] of [[3800, 1, 3816], [40, -1, 24]]) {
    const { m, player } = fixture({ boss: false, x });
    m.dir = direction; m.st = 'attack'; m.startCharge(0);
    assert.equal(m.charge.targetX, expected, '普通 charge 目标按世界边界夹取');
    m.body.position.x = (direction > 0 ? 3900 : -100) - 24;
    m.tickCharge(100, player);
    assert.equal(m.x, expected, '普通 charge 每帧夹住位置');
    assert.equal(m.body.center.x, expected, '普通 charge 同步碰撞体 offset');
    assert.equal(m.body.bottom, 960, '普通 charge 夹取后脚底仍在地面');
    assert.equal(m.body.velocity.x, 0, '普通 charge 到边界停下');
    assert.equal(m.charge, null, '普通 charge 收招');
  }

  for (const [zones, x, y, label] of [
    [[zone], 3900, 970, '横向越界'], [[zone], 3400, 1300, '掉出世界底部'],
    [[], 3400, 1100, '无 zone 时掉入地图底部缓冲区'],
  ]) {
    const { m, player } = fixture({ zones });
    m.startSkill(dash, 0, player); m.dashing = true; m.body.setVelocity(1280, 670);
    m.body.position.x = x - 24; m.body.position.y = y - 64;
    m.step(800, player);
    assert.ok(m.x >= (zones.length ? 3024 : 24) && m.x <= 3816, `${label}：拉回区域内`);
    assert.equal(m.y, 960, `${label}：回到区域内真实地面`);
    assert.equal(m.body.bottom, m.y, `${label}：重置后碰撞体脚底和 Sprite 同步`);
    assert.equal(m.body.prevFrame.y, m.body.y, `${label}：postUpdate 不会再偏移 Sprite`);
    assert.equal(m.body.velocity.x, 0, `${label}：停止水平冲刺`);
    assert.equal(m.body.velocity.y, 0, `${label}：停止下坠`);
    assert.equal(m.cast, null, `${label}：取消冲刺施法`);
    assert.equal(m.dashing, false, `${label}：取消冲刺标记`);
  }

  function sceneFixture() {
    const { m: boss, scene, player } = fixture();
    const kept = fixture({ boss: false }).m;
    const summoned = fixture({ boss: false }).m;
    summoned.scene = boss.scene; summoned.owner = boss; summoned.despawnWithOwner = true;
    kept.owner = boss; kept.despawnWithOwner = false;
    boss.summons = [summoned, kept]; boss.usedOnce.add('fox_summon');
    boss.startSkill(dash, 0, player);
    const game = Object.assign(Object.create(GameScene.prototype), scene, {
      player, mobs: [boss, summoned, kept], portalVisuals: [],
      prog: { hp: 0, mp: 0, maxHp: 194, maxMp: 46 }, log() {},
    });
    const calls = [];
    game.time = { now: 100, delayedCall: (ms, fn) => calls.push({ ms, fn }) };
    return { game, boss, summoned, kept, calls, cast: boss.cast };
  }

  for (const action of ['death', 'leave']) {
    const { game, boss, summoned, kept, calls, cast } = sceneFixture();
    if (action === 'death') game.playerDie();
    else { game.player.x = 2999; game.clearAbandonedBossSummons(); }
    assert.equal(summoned.despawning, true, `${action}：清 despawnWithOwner 召唤物`);
    assert.equal(summoned.body.enable, false, `${action}：立即关召唤物碰撞`);
    assert.ok(summoned.fxTimers.some(f => f.sprite.key === 'fx_summon_despawn'), `${action}：播放 fx_summon_despawn`);
    assert.equal(kept.dead, false, `${action}：保留 despawnWithOwner:false 的召唤物`);
    assert.equal(boss.hp, 1271, `${action}：首领血量保持`);
    assert.equal(boss.cast, cast, `${action}：首领当前技能保持`);
    assert.equal(boss.usedOnce.has('fox_summon'), true, `${action}：首领 once 状态保持`);
    const count = game.mobs.length;
    game.spawnSummon(boss, 'spirit_rabbit', 3400, 960, false, true);
    assert.equal(game.mobs.length, count, `${action}：清场后首领在途召唤不重新落下`);
    summoned.step(1000, game.player);
    assert.equal(summoned.active, false, `${action}：消散动画后销毁召唤物`);
    if (action === 'death') {
      assert.equal(calls[0].ms, 3000, '死亡沿用现有三秒复活');
      calls[0].fn();
      assert.equal(game.player.dead, false, '按现有逻辑复活玩家');
      assert.equal(summoned.active, false, '复活后召唤物不残留');
      assert.equal(boss.hp, 1271, '复活后首领血量仍保持');
    }
  }

  // 技能窗口打开时正常 AI 暂停，但清场动画与越界兜底仍须更新。
  {
    const { game, boss, summoned, cast } = sceneFixture();
    const keys = Object.fromEntries(['z', 'left', 'right', 'up', 'down', 'space', 'alt', 'c', 'ctrl', 'x']
      .map(key => [key, { isDown: false }]));
    Object.assign(game, { keys, parallax: [], combat: { update() {} }, skillWindow: { open: true }, dialog: { open: false },
      quests: { refreshDaily() {} }, nextDailyUpdateAt: 0, nextAgeUpdateAt: 0, interactionPrompts: [],
      alchemy: { isOpen: () => false, update() {} }, gathering: { update() {} },
      updateShots() {}, regenMp() {}, drawHud() {} });
    Object.assign(game.prog, { advanceAge() {}, save() {} });
    game.player.syncAppearance = () => {};
    game.player.step = () => {};
    game.player.x = 2999;
    game.update(1000, 16);
    assert.equal(summoned.active, false, '技能窗口打开也完成召唤物消散');
    assert.equal(boss.cast, cast, '技能窗口打开保留区域内首领技能状态');
    boss.body.position.x = 2900 - 24; boss.dashing = true;
    game.update(1016, 16);
    assert.equal(boss.x, 3024, '技能窗口打开时首领越出 zone 左边界也拉回');
    assert.equal(boss.body.bottom, 960, '技能窗口打开时恢复到区域内地面');
    assert.equal(boss.dashing, false, '技能窗口打开时越界兜底停止冲刺');

    // 旧测试未建 ShopPanel 时可更新；正常商店作为模态窗时仍逐帧更新。
    let shopUpdates = 0;
    game.skillWindow.open = false;
    game.shop = { isOpen: () => true, update() { shopUpdates++; } };
    game.update(1032, 16);
    assert.equal(shopUpdates, 1, '商店打开时 GameScene 仍调用商店 update');
  }

  console.log('fox hotfix tests ok');
} finally {
  await server.close();
}
