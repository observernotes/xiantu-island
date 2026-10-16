import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

// 独立模块图分别验证快照与共享表；坏表模式验证 data 的降级导出与旧技能入口。
if (!process.argv.includes('--single-mode')) {
  for (const mode of ['snapshot', 'shared']) for (const invalid of [false, true]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], '--single-mode', ...(invalid ? ['--invalid-table'] : [])], {
        cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`gongfa grades ${mode}${invalid ? ' invalid table' : ''} failed: ${code}`)));
    });
  }
} else {
  const invalid = process.argv.includes('--invalid-table');
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: invalid ? [{ name: 'gongfa-grades-invalid-table', enforce: 'pre',
      resolveId(id) { if (id.endsWith('/balance/gongfa_grades.json')) return '\0gongfa-grades-invalid-table'; },
      load(id) { if (id === '\0gongfa-grades-invalid-table') return 'export default { version:"invalid", enabled:false };'; },
    }] : [],
  });
  try {
    if (!invalid) await server.ssrLoadModule('/src/gongfa-grades.test.ts');
    else {
      const { GONGFA_GRADES, GONGFA_GRADES_ERRORS } = await server.ssrLoadModule('/src/data.ts');
      const { effectMul, levelCap } = await server.ssrLoadModule('/src/GongfaGrades.ts');
      const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
      const { SKILLS, skillNumber } = await server.ssrLoadModule('/src/skills.ts');
      const disk = new Map();
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: id => disk.get(id) ?? null, setItem: (id, value) => disk.set(id, value), removeItem: id => disk.delete(id),
      } });
      assert.equal(GONGFA_GRADES, null, '坏表不可用');
      assert.ok(GONGFA_GRADES_ERRORS.some(error => error.includes('$.version')), '坏表保留字段诊断');
      const p = new Progress(); p.level = 10; p.quests.q_breakthrough = { state: 'done', kills: {} };
      // 沿 classes-test：当前无 job0 点池，夹具只注入按原 spCost 足够两次升级的通用点。
      const baseEarned = p.spEarned.bind(p);
      p.spEarned = job => job === 0 ? 2 * SKILLS.spirit_bolt.spCost : baseEarned(job);
      assert.deepEqual(p.addSkillPoint('spirit_bolt'), { ok: true }, '坏品阶表不阻塞旧技能学习');
      assert.deepEqual(p.addSkillPoint('spirit_bolt'), { ok: true }, '坏品阶表不阻塞旧技能升级');
      assert.equal(p.skillLevel('spirit_bolt'), 2, '旧技能仍正常升级');
      assert.equal(effectMul(GONGFA_GRADES, 'spirit_bolt'), 1, '坏表不修改原伤害系数');
      const ratio = skillNumber(SKILLS.spirit_bolt, 'damageRatio', p.skillLevel('spirit_bolt'));
      assert.equal(ratio * effectMul(GONGFA_GRADES, 'spirit_bolt'), ratio, '坏表根伤害系数字节相同');
      assert.equal(levelCap(GONGFA_GRADES, 'spirit_bolt', SKILLS.spirit_bolt.maxLevel), SKILLS.spirit_bolt.maxLevel, '坏表不截断旧 maxLevel');
      assert.equal(Object.hasOwn(p.exportSave(), 'gongfaState'), false, '不创建 gongfaState 存档字段');
      console.log('gongfa grades invalid table tests ok: legacy learning/upgrades/damage ratio unchanged');
    }
    console.log(`gongfa grades ${process.env.XT_DATA}${invalid ? ' invalid table' : ''} suite ok`);
  } finally { await server.close(); }
}
