import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

// 两种数据根分别启动模块图；坏表只替换新表，不改正式 JSON。
if (!process.argv.includes('--single-mode')) {
  for (const mode of ['snapshot', 'shared']) for (const invalid of [false, true]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], '--single-mode', ...(invalid ? ['--invalid-table'] : [])], {
        cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`qi density ${mode}${invalid ? ' invalid table' : ''} failed: ${code}`)));
    });
  }
} else {
  const invalid = process.argv.includes('--invalid-table');
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: invalid ? [{ name: 'qi-density-invalid-table', enforce: 'pre',
      resolveId(id) { if (id.endsWith('/balance/qi_density.json')) return '\0qi-density-invalid-table'; },
      load(id) { if (id === '\0qi-density-invalid-table') return 'export default {version:"invalid", enabled:false};'; },
    }] : [],
  });
  try {
    if (!invalid) await server.ssrLoadModule('/src/qi-density.test.ts');
    else {
      const data = await server.ssrLoadModule('/src/data.ts');
      const { Seclusion, realDay } = await server.ssrLoadModule('/src/Seclusion.ts');
      const { setFeatureFlag, featureEnabled } = await server.ssrLoadModule('/src/features.ts');
      assert.equal(data.QI_DENSITY, null, '坏表配置不可用');
      assert.ok(data.QI_DENSITY_ERRORS.some(error => error.includes('$.version')), '坏表保留路径诊断');
      const enabled = featureEnabled('seclusion');
      setFeatureFlag('seclusion', true);
      try {
        const now = 1_800_000_000_000, realm = data.REALMS.find(candidate => candidate.id === data.SECT_SECLUSION.unlockRealm);
        const years = data.SECT_SECLUSION.options[0], bases = [];
        const progress = {
          level: realm.levelMin, realm, sectContribution: data.SECT_SECLUSION.contributionCost[String(years)],
          seclusionDay: realDay(now), seclusionYearsToday: 0, age: 16, remainingLife: 1000, expNeed: 1000,
          seclusionHistory: [], advanceAge() {}, save() { return true; },
          persistSoon() { return this.save(); },
          spendSectContribution(cost) { this.sectContribution -= cost; return true; },
          gainCultivation(base) { bases.push(base); return { gained: base, overflowed: 0, levels: 0, blocked: false, overflowFilled: false }; },
        };
        const expectedBase = progress.expNeed * data.SECLUSION_RULES.perYearRatio * data.SECT_SECLUSION.density
          / data.DENSITY_REF * data.SECLUSION_RULES.realmMul[realm.id] * data.SECT_SECLUSION.roomMul;
        const result = new Seclusion(progress).settle({ mode: 'sect', reqRealm: realm.id }, years, now);
        assert.equal(result.ok, true, '坏灵气表不阻塞原宗门闭关');
        assert.equal(JSON.stringify(bases), JSON.stringify(Array(years).fill(expectedBase)), '原闭关逐年只用宗门室既有浓度，浮点字节相同');
        assert.equal(result.gained, expectedBase * years, '坏灵气表没有新倍率或零收益回退');
      } finally { setFeatureFlag('seclusion', enabled); }
      console.log('qi density invalid table tests ok: original sect seclusion remains available with identical yearly inputs');
    }
    console.log(`qi density ${process.env.XT_DATA}${invalid ? ' invalid table' : ''} suite ok`);
  } finally { await server.close(); }
}
