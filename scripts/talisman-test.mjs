import { legacySaveFixture } from './legacy-save-fixture.mjs';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';

// 每种数据模式独立模块图，避免 Vite/JSON 缓存让 shared 假读 snapshot。
if (!process.argv.includes('--single-mode')) {
  for (const mode of ['snapshot', 'shared']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [process.argv[1], '--single-mode'], {
        cwd: process.cwd(), env: { ...process.env, XT_DATA: mode }, stdio: 'inherit',
      });
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`talisman ${mode} failed: ${code}`)));
    });
  }
  await import('./talisman-fx-test.mjs');
} else {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    await legacySaveFixture(server);
    for (const file of ['talisman.test.ts', 'talisman-use.test.ts', 'talisman-save.test.ts']) await server.ssrLoadModule(`/src/${file}`);
    console.log(`talisman ${process.env.XT_DATA} suite ok`);
  } finally { await server.close(); }
}
