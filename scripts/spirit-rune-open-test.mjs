import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const out = process.env.SPIRIT_RUNE_OPEN_OUT
  ?? path.join(root, 'qa/out_spirit_rune_open_local');

await fs.mkdir(out, { recursive: true });
const server = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
  resolve: { alias: { '@xt': findRoot(root) } },
});
try {
  const suite = await server.ssrLoadModule('/src/spirit-rune-open.test.ts');
  const result = await suite.runSpiritRuneOpenTests();
  await fs.writeFile(path.join(out, 'evidence.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ suite: 'spirit-rune-open', ...result }, null, 2));
  if (result.verdict !== 'PASS' && result.failed > 0) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await server.close();
}
