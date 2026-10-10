// timeout 60s node scripts/daily-test.mjs：只在内存中跑宗门日常逻辑断言。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/daily.test.ts');
} finally {
  await server.close();
}
