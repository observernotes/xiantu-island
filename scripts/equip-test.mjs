import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try { await server.ssrLoadModule('/src/equip.test.ts'); } finally { await server.close(); }
