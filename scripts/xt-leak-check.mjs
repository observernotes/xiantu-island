import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url)));
const identifiers = ['__xt', 'XT_TEST_INTERFACE_V1', 'XtTestBridge', 'startTestGame', 'VITE_XT_TEST'];
let checked = 0;
const leaks = [];
async function scan(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`产物含符号链接：${file}`);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (!entry.isFile()) continue;
    const content = await fs.readFile(file);
    checked++;
    for (const id of identifiers) {
      if (entry.name.includes(id) || content.includes(Buffer.from(id))) leaks.push(`${path.relative(root, file)}: ${id}`);
    }
  }
}
try {
  await fs.access(path.join(root, 'index.html'));
  await scan(root);
  if (leaks.length) {
    console.error(`xt leak-check FAIL\n${leaks.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`xt leak-check PASS (${checked} files)`);
  }
} catch (error) {
  console.error(`xt leak-check FAIL: ${error.message}`);
  process.exitCode = 1;
}
