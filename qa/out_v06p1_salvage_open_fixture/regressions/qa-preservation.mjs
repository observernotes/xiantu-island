import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../../..');
const baselineFile = path.join(out, 'old-qa-before.json');
const sha = value => createHash('sha256').update(value).digest('hex');
async function walk(directory, rows = {}) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (file === path.dirname(out)) continue;
    if (entry.isDirectory()) await walk(file, rows);
    else if (entry.isFile()) rows[path.relative(root, file)] = sha(await fs.readFile(file));
  }
  return rows;
}
if (process.argv[2] === 'capture') {
  await assert.rejects(fs.stat(baselineFile), { code: 'ENOENT' }, 'baseline captured once');
  const files = await walk(path.join(root, 'qa'));
  await fs.writeFile(baselineFile, JSON.stringify({ capturedAt: new Date().toISOString(), files }, null, 2) + '\n');
  console.log('Captured existing QA:', Object.keys(files).length);
} else {
  const before = JSON.parse(await fs.readFile(baselineFile, 'utf8'));
  const after = await walk(path.join(root, 'qa'));
  const changed = Object.keys(before.files).filter(file => after[file] !== before.files[file]);
  const added = Object.keys(after).filter(file => !(file in before.files));
  const result = { passed: !changed.length && !added.length, existingFiles: Object.keys(before.files).length, changed, added,
    checkedAt: new Date().toISOString(), onlyNewSalvageFixtureOutAllowed: true };
  await fs.writeFile(path.join(out, 'old-qa-preservation.json'), JSON.stringify(result, null, 2) + '\n');
  assert.equal(result.passed, true, 'every preexisting QA file retained exact bytes and no new writes outside current output');
  console.log(JSON.stringify(result));
}
