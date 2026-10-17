import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const out = path.dirname(fileURLToPath(import.meta.url));
const roots = [['shared', '/workspace/xiantu'], ['snapshot', '/workspace/xiantu/wt/dev/data']];
const results = await Promise.all(roots.map(async ([mode, cwd]) => {
  const command = ['python3', '/workspace/xiantu/qa/tools/datalint.py'];
  const startedAt = new Date().toISOString();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => chunks.push(chunk));
    child.once('error', reject);
    child.once('close', (exitCode, signal) => resolve({ exitCode, signal, output: Buffer.concat(chunks).toString() }));
  });
  await fs.writeFile(path.join(out, `datalint-${mode}.log`), result.output);
  const row = { command, cwd, environment: {}, stdin: '/dev/null', startedAt, exitCode: result.exitCode, signal: result.signal, assertions: null };
  await fs.writeFile(path.join(out, `datalint-${mode}.result.json`), `${JSON.stringify(row, null, 2)}\n`);
  return { mode, ...row };
}));
console.log(JSON.stringify(results));
process.exitCode = results.every(row => row.exitCode === 0) ? 0 : 1;
