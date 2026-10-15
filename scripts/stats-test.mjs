// 仅加载内存逻辑测试，不监听端口、不写真实 localStorage。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/stats.test.ts');
} finally {
  await server.close();
}
