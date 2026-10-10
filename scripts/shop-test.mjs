// 只使用内存配置与存档；Vite SSR 不监听端口、不写真实 localStorage。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/shop.test.ts');
} finally {
  await server.close();
}
