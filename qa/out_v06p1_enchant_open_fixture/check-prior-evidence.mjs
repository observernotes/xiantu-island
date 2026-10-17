// 旧 QA 与待审 art 的只读清单；本窗 out 始终排除。所有子命令 stdin ignore。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../..');
const baselineTip = '2ad6367f4b5fd70caa01e8cb1df392db3971fb7d', ownOut = 'qa/out_v06p1_enchant_open_fixture/';
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
};
const list = bytes => bytes.toString().split('\0').filter(Boolean);
const trackedRows = list(git('ls-tree', '-rz', '--full-tree', baselineTip, 'qa'))
  .map(row => { const [meta, file] = row.split('\t'); return { file, object: meta.split(' ')[2] }; })
  .filter(row => !row.file.startsWith(ownOut));
const oldQaTrackedHashes = {}, oldQaTrackedByteChanges = [];
for (const row of trackedRows) {
  const actualObject = git('hash-object', '--no-filters', '--', row.file).toString().trim();
  oldQaTrackedHashes[row.file] = actualObject;
  if (actualObject !== row.object) oldQaTrackedByteChanges.push(row.file);
}
const oldQaUntracked = list(git('ls-files', '--others', '--exclude-standard', '-z', '--', 'qa'))
  .filter(file => !file.startsWith(ownOut));
async function pendingFiles(dir, pending = false) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name), inPending = pending || entry.name === '_pending';
    if (entry.isDirectory()) files.push(...await pendingFiles(full, inPending));
    else if (inPending && entry.isFile()) files.push(full);
  }
  return files;
}
const pending = [...await pendingFiles(path.join(root, 'data/art')), ...await pendingFiles('/workspace/xiantu/art')];
const files = [...new Set([...oldQaUntracked.map(file => path.join(root, file)), ...pending])].sort();
const current = {};
for (const file of files) current[file] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
const beforePath = path.join(out, 'prior-evidence-before.json');
let before;
try { before = JSON.parse(await fs.readFile(beforePath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  before = { baselineTip, capturedAt: new Date().toISOString(), commandStdin: '/dev/null',
    oldQaTrackedCount: trackedRows.length, oldQaTrackedHashes, oldQaTrackedByteChanges,
    oldQaUntrackedCount: oldQaUntracked.length, artPendingCount: pending.length, sha256: current,
    captureScope: '此清单捕获时点起保护既有 untracked QA 与 data/art/**/_pending 及共享 art/**/_pending；tracked 旧 QA 独立逐文件匹配权威提交。',
    captureLimit: 'untracked 文件没有 Git 历史；写前清单只证明捕获后未变，不能追溯捕获前历史。' };
  await fs.writeFile(beforePath, `${JSON.stringify(before, null, 2)}\n`);
}
const changed = Object.entries(before.sha256).filter(([file, expected]) => current[file] !== expected).map(([file]) => file);
const newFiles = Object.keys(current).filter(file => !Object.hasOwn(before.sha256, file));
const trackedDiff = list(git('diff', '--name-only', '-z', baselineTip, '--', 'qa', `:(exclude)${ownOut.slice(0, -1)}`));
const result = { passed: oldQaTrackedByteChanges.length === 0 && trackedDiff.length === 0 && changed.length === 0,
  baselineTip, commandStdin: '/dev/null', oldQaTrackedCount: trackedRows.length,
  oldQaTrackedMatchesAuthoritativeCommit: oldQaTrackedByteChanges.length === 0,
  oldQaTrackedByteChanges, oldQaTrackedDiff: trackedDiff, oldQaTrackedHashes,
  baselineUntrackedAndPendingCount: Object.keys(before.sha256).length, currentUntrackedAndPendingCount: Object.keys(current).length,
  oldQaUntrackedCount: oldQaUntracked.length, artPendingCount: pending.length, changedOrMissing: changed, newFiles,
  untrackedAndPendingBeforeAfterMatch: changed.length === 0, sha256: current,
  captureScope: before.captureScope, captureLimit: before.captureLimit };
await fs.writeFile(path.join(out, 'prior-evidence-after.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ passed: result.passed, oldQaTrackedCount: result.oldQaTrackedCount,
  oldQaUntrackedCount: result.oldQaUntrackedCount, artPendingCount: result.artPendingCount,
  trackedChanges: oldQaTrackedByteChanges, changedOrMissing: changed, newFiles }));
process.exitCode = result.passed ? 0 : 1;
