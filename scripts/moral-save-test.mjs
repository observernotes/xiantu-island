// timeout 60s node scripts/moral-save-test.mjs：只在内存中跑道心/善恶存档断言。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/moral-save.test.ts');
} finally {
  await server.close();
}
