// 无监听端口：通过 Vite 的 SSR 转译直接跑逻辑回归。
import { createServer } from 'vite';

const server = await createServer({
  // hmr:false 仍会创建 Vite WebSocket；ws:false 才能保证沙箱内完全不监听。
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/v05.test.ts');
} finally {
  await server.close();
}
