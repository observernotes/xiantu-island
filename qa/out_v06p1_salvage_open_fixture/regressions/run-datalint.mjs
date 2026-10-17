import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../../..');
const commands = [['shared', '/workspace/xiantu'], ['snapshot', path.join(root, 'data')]];
await Promise.all(commands.map(async ([mode, cwd]) => {
  const command = ['python3', '/workspace/xiantu/qa/tools/datalint.py'], startedAt = new Date().toISOString();
  const environment = { PYTHONDONTWRITEBYTECODE: '1' };
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', data => chunks.push(data)); child.stderr.on('data', data => chunks.push(data));
    child.on('error', reject); child.on('close', (exitCode, signal) => resolve({ exitCode, signal, output: Buffer.concat(chunks).toString() }));
  });
  const row = { name: 'datalint-' + mode, command, cwd, environment, stdin: '/dev/null', startedAt,
    finishedAt: new Date().toISOString(), exitCode: result.exitCode, signal: result.signal,
    zeroProblems: /；问题 0 条/u.test(result.output) };
  await fs.writeFile(path.join(out, row.name + '.log'), result.output);
  await fs.writeFile(path.join(out, row.name + '.result.json'), JSON.stringify(row, null, 2) + '\n');
  assert.equal(row.exitCode, 0); assert.equal(row.zeroProblems, true); console.log(JSON.stringify(row));
}));
