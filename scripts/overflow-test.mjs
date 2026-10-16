import { legacySaveFixture } from './legacy-save-fixture.mjs';
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await legacySaveFixture(server);
  await server.ssrLoadModule('/src/overflow.test.ts');
} finally {
  await server.close();
}
