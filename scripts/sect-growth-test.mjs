// timeout 60s node scripts/sect-growth-test.mjs：只使用内存配置与存档。
// QA_TIER_GATE_AWARE: fiveSectClasses sectRanks sectShopLibrary
import { legacySaveFixture } from './legacy-save-fixture.mjs';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
});
try {
  await legacySaveFixture(server);
  await server.ssrLoadModule('/src/sect-growth.test.ts');
} finally {
  await server.close();
}
