import { legacySaveFixture } from './legacy-save-fixture.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

// 独立进程/模块图确保 snapshot 与 shared 真正读取各自的数据根目录。
if (!process.argv.includes('--single-mode')) {
  for (const mode of ['snapshot', 'shared']) for (const invalid of [false, true]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], '--single-mode', ...(invalid ? ['--invalid-table'] : [])], {
        cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`life skills ${mode}${invalid ? ' invalid table' : ''} failed: ${code}`)));
    });
  }
} else {
  const invalid = process.argv.includes('--invalid-table');
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: invalid ? [{ name: 'life-skills-invalid-table', enforce: 'pre',
      resolveId(id) { if (id.endsWith('/balance/life_skills.json')) return '\0life-skills-invalid-table'; },
      load(id) { if (id === '\0life-skills-invalid-table') return 'export default {schemaVersion:99, integrationState:"pending", skills:[]};'; },
    }] : [],
  });
  try {
    await legacySaveFixture(server);
    if (!invalid) await server.ssrLoadModule('/src/life-skills.test.ts');
    else {
      const { LIFE_SKILLS, LIFE_SKILL_ERRORS } = await server.ssrLoadModule('/src/data.ts');
      const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
      const { AlchemySystem } = await server.ssrLoadModule('/src/Alchemy.ts');
      const { TalismanSystem } = await server.ssrLoadModule('/src/Talisman.ts');
      const { setFeatureFlag } = await server.ssrLoadModule('/src/features.ts');
      const disk = new Map();
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: id => disk.get(id) ?? null, setItem: (id, value) => disk.set(id, value), removeItem: id => disk.delete(id),
      } });
      assert.equal(LIFE_SKILLS, null, '坏表不得生成零值配置');
      assert.ok(LIFE_SKILL_ERRORS.some(message => message.includes('schemaVersion')), '配置错误包含字段路径');
      setFeatureFlag('alchemyPhase1', true); setFeatureFlag('talismanCraft', true); setFeatureFlag('lifeSkillCurve', true);
      const p = new Progress(); p.level = 15; p.stones = 100;
      p.inventory = { spirit_herb: 100, rabbit_fur: 100, talisman_paper: 100, spirit_ink: 100, snake_gall: 100 };
      p.learnedRecipes = ['recipe_hp_pill', 'recipe_talisman_fire', 'recipe_spirit_ink'];
      const alchemy = new AlchemySystem(p), talisman = new TalismanSystem(p, undefined, () => 0, { report: () => {} });
      const before = JSON.stringify(p.exportSave());
      assert.equal(alchemy.start('recipe_hp_pill').reason, 'config', '坏生活表禁用炼丹消费');
      assert.equal(talisman.start('recipe_talisman_fire').reason, 'config', '坏生活表禁用制符消费');
      assert.equal(talisman.grind().reason, 'config', '坏生活表不默认为免费研墨');
      assert.equal(p.gainAlchemyExp(100), 0, '坏表不授炼丹经验');
      assert.equal(p.gainTalismanExp(100), 0, '坏表不授制符经验');
      assert.equal(JSON.stringify(p.exportSave()), before, '配置错误不扣材料、不发经验、不改变存档');
      setFeatureFlag('lifeSkillCurve', false);
      assert.equal(alchemy.check('recipe_hp_pill').ok, true, '开关关时坏新表不改变旧炼丹');
      assert.equal(talisman.check('recipe_talisman_fire').ok, true, '开关关时坏新表不改变一期制符');
      assert.equal(alchemy.start('recipe_hp_pill').ok, true, '旧逻辑先付料开炉');
      assert.equal(talisman.start('recipe_talisman_fire').ok, true, '一期逻辑先付料开画');
      setFeatureFlag('lifeSkillCurve', true);
      const paid = JSON.stringify(p.exportSave());
      const restoredAlchemy = new AlchemySystem(p);
      assert.ok(restoredAlchemy.active, '坏新表保留既有已付费丹炉');
      assert.equal(restoredAlchemy.skipFire(), null, '坏新表禁止已付费炉继续消费配置结算');
      assert.equal(JSON.stringify(p.exportSave()), paid, '坏新表不删除已付费丹炉或重复扣料');
      const loaded = Progress.load();
      assert.ok(loaded.pendingAlchemy, '坏新表读档仍保留已付费丹炉');
      assert.equal(new AlchemySystem(loaded).skipFire(), null, '坏新表读档后仍禁止结算');
      const strokes = talisman.view().draw.strokes;
      talisman.input([], 0, 0);
      for (const [i, stroke] of strokes.entries()) {
        talisman.input([stroke], 10 + i * 20, i * 2 + 1);
        talisman.input([], 11 + i * 20, i * 2 + 2);
      }
      assert.equal(JSON.stringify(p.exportSave()), paid, '坏新表保留已付费制符记录，不提交半份结果或经验');
      console.log('life skills invalid table tests ok: runtime configuration errors block consumption; feature off preserves legacy behavior');
    }
    console.log(`life skills ${process.env.XT_DATA}${invalid ? ' invalid table' : ''} suite ok`);
  } finally { await server.close(); }
}
