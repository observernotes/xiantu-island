import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = '/workspace/xiantu/wt/dev';
const base = '14d6de7b39b1aab0b31a12289172e6735986f263';
const expected = '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const before = execFileSync('git', ['show', base + ':data/balance/strings_zh.json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const shared = await fs.readFile('/workspace/xiantu/balance/strings_zh.json');
const snapshot = await fs.readFile(path.join(root, 'data/balance/strings_zh.json'));
const oldRows = JSON.parse(before), rows = JSON.parse(snapshot);
const keys = ['feature', 'entrance', 'salvage', 'no_submit', 'no_result', 'no_output', 'load_refresh', 'later_service'].map(key => 'salvage.closed.' + key);
assert.equal(Object.keys(oldRows).length, 952);
assert.equal(Object.keys(rows).length, 960);
assert.deepEqual(shared, snapshot);
assert.equal(sha(snapshot), expected);
assert.deepEqual(Object.keys(rows).slice(-8), keys);
for (const [key, value] of Object.entries(oldRows)) assert.deepEqual(rows[key], value);
const stripped = snapshot.toString().replace(/,\n  "salvage\.closed\.feature":[\s\S]*?(?=\n\}\n?$)/u, '');
assert.equal(stripped, before.toString(), 'Removing exactly the appended eight-key block restores every old byte');
const result = { passed: true, base, beforeKeys: 952, afterKeys: 960, addedKeys: keys,
  beforeSha: sha(before), sharedSha: sha(shared), snapshotSha: sha(snapshot),
  restoredOriginalBytes: true, prior952ValuesPreserved: true, authoritativeStringsWritten: false,
  method: 'One exact cp of authoritative strings; materials/items already MATCH and read only' };
await fs.writeFile(path.join(root, 'qa/out_v06p1_salvage_closed/table-delta-check.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
