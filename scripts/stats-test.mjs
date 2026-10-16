// 仅加载内存逻辑测试，不监听端口、不写真实 localStorage。
import { legacySaveFixture } from './legacy-save-fixture.mjs';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await legacySaveFixture(server);
  await server.ssrLoadModule('/src/stats.test.ts');
} finally {
  await server.close();
}
