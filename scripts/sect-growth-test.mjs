// timeout 60s node scripts/sect-growth-test.mjs：只使用内存配置与存档。
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await server.ssrLoadModule('/src/sect-growth.test.ts');
} finally {
  await server.close();
}
