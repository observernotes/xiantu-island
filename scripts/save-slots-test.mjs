// Vite SSR 执行三槽存档的内存后端与 IDB 事务模拟回归，无浏览器或额外依赖。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/save-slots.test.ts');
} finally {
  await server.close();
}
