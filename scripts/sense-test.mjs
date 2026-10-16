// 每个数据模式用独立进程，避免 Vite / 模块缓存串用 @xt 根目录。
import { legacySaveFixture } from './legacy-save-fixture.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

if (process.env.XT_SENSE_TEST_CHILD !== '1') {
  for (const mode of ['snapshot', 'shared']) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      stdio: 'inherit', env: { ...process.env, XT_DATA: mode, XT_SENSE_TEST_CHILD: '1' },
    });
    if (child.error) throw child.error;
    if (child.status !== 0) process.exit(child.status ?? 1);
  }
} else {
  const server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom', logLevel: 'error',
  });
  try {
    await legacySaveFixture(server);
    await server.ssrLoadModule('/src/sense.test.ts');
    console.log(`sense-test XT_DATA=${process.env.XT_DATA}: passed`);
  } finally {
    await server.close();
  }
}
