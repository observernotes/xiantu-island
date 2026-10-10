// timeout 60s node scripts/classes-test.mjs：无监听端口的五宗职业逻辑断言。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/classes.test.ts');
} finally {
  await server.close();
}
