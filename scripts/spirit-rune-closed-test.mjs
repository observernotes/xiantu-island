import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const out = process.env.SPIRIT_RUNE_CLOSED_OUT
  ?? path.join(root, 'qa/out_spirit_rune_closed_local');

await fs.mkdir(out, { recursive: true });
const server = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
  resolve: { alias: { '@xt': findRoot(root) } },
});
try {
  const suite = await server.ssrLoadModule('/src/spirit-rune-closed.test.ts');
  const result = await suite.runSpiritRuneClosedTests();
  await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ suite: 'spirit-rune-closed', ...result }, null, 2));
} finally {
  await server.close();
}
