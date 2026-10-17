import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = '/workspace/xiantu/wt/dev', out = path.join(root, 'qa/out_v06p1_salvage_closed');
const jobs = {
  tsc: ['npx', 'tsc', '--noEmit'],
  'v06p1-salvage-closed': ['npm', 'run', 'test:v06p1-salvage-closed'],
  'diff-check': ['git', 'diff', '--check'],
  'table-delta-check': ['node', path.join(out, 'table-delta-check.mjs')],
};
for (const name of process.argv.slice(2)) {
  const command = jobs[name];
  if (!command) throw new Error('Unknown check ' + name);
  const startedAt = new Date().toISOString();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd: root, env: { ...process.env, SALVAGE_CLOSED_OUT: out }, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal, output: Buffer.concat(chunks).toString() }));
  });
  await fs.writeFile(path.join(out, name + '.log'), result.output);
  const total = result.output.match(/tests ok:\s*(\d+)\s*assertions/u);
  const row = { name, command, cwd: root, stdin: '/dev/null', startedAt, finishedAt: new Date().toISOString(),
    exitCode: result.exitCode, signal: result.signal, assertions: total ? Number(total[1]) : null };
  await fs.writeFile(path.join(out, name + '.result.json'), JSON.stringify(row, null, 2) + '\n');
  console.log(JSON.stringify(row));
  if (result.exitCode !== 0) { console.error(result.output.slice(-6000)); process.exitCode = 1; break; }
}
