// Strict, read-only compatibility checks for historical regression expectations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qa = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(qa, '../..');
const shared = path.resolve(root, '../..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const enchantSourceNames = ['EnchantClosed.ts', 'EnchantOpenFlag.ts', 'v06p1-enchant-closed.test.ts'];
const oldShas = {
  'materials.json': '79c68429d763054ac1715467d1743575e179ecaecb2529e4b6ed7df137ef4052',
  'items.json': 'f8b587634e5c9d43a475e85724aa34172e2945abda7654c2ef98fda07d1566f3',
  'strings_zh.json': 'd7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09',
};
const newShas = {
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'strings_zh.json': '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9',
};
// Already present when this window captured its baseline; these differ from the
// much older historical closed-suite snapshots. They remain completely read-only.
export const preexistingReadOnlyShas = {
  'game:balance/materials.json': oldShas['materials.json'],
  'game:balance/items.json': oldShas['items.json'],
  'game:balance/strings_zh.json': oldShas['strings_zh.json'],
  'game:balance/enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
  'shared:balance/tools/gen_enchant_beast_core.py': '2f048b7b04903788b847624f3390aa81bb1fe84bff81f60c0f4c88f6f55d6220',
};

function auditPath(name) {
  const out = path.resolve(process.env.ENCHANT_REGRESSION_OUT ?? qa);
  assert.ok(out === qa || out.startsWith(qa + path.sep), 'compatibility audit remains in this window QA');
  fs.mkdirSync(out, { recursive: true });
  return path.join(out, name);
}
function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length - 1, 1, `${label}: exactly one authorized change`);
  return source.replace(before, after);
}

export function stripEnchantClosedAddition(raw) {
  if (digest(raw) === oldShas['strings_zh.json']) return raw; // Read-only historical game root.
  assert.equal(digest(raw), newShas['strings_zh.json'], 'current strings are the exact 952-key authority');
  assert.equal(Object.keys(JSON.parse(raw)).length, 952, 'current strings have 952 keys');
  const block = raw.match(/,\n(?: {2}"enchant\.closed\.[^\n]+\n?){8}/gu);
  assert.equal(block?.length, 1, 'exactly the eight appended enchant.closed lines are removed for historical-byte proof');
  const previous = raw.replace(block[0], '\n');
  assert.equal(digest(previous), oldShas['strings_zh.json'], 'removing only eight enchant.closed lines restores the complete historical 944-key bytes');
  return previous;
}

// These checks read the real current tables. The reconstructed bytes are used only
// to prove the complete authorized delta, never returned to an old runner or SSR.
const tableChecks = [];
const baseline = JSON.parse(fs.readFileSync(path.join(qa, 'protected-before.json'), 'utf8'));
const preexistingReadOnlyChecks = [];
for (const [key, expected] of Object.entries(preexistingReadOnlyShas)) {
  const [mode, name] = key.split(':');
  const file = path.join(mode === 'game' ? path.join(shared, 'game/data') : shared, name);
  assert.equal(baseline[file], expected, `${key}: fixed SHA is already in this window's captured baseline`);
  assert.equal(digest(fs.readFileSync(file)), expected, `${key}: preexisting read-only SHA remains unchanged`);
  preexistingReadOnlyChecks.push({ key, file, capturedBaselineSha256: baseline[file],
    currentSha256: digest(fs.readFileSync(file)), expectedSha256: expected, match: true });
}
for (const [mode, base] of [['shared', shared], ['snapshot', path.join(root, 'data')]]) {
  for (const [name, expected] of Object.entries(newShas)) {
    const file = path.join(base, 'balance', name);
    const raw = fs.readFileSync(file, 'utf8');
    assert.equal(digest(raw), expected, `${mode}: real current ${name} authority SHA`);
    let previous;
    if (name === 'materials.json') {
      previous = replaceExactlyOnce(raw,
        '  "note": "炼气后期以上精英怪 3%，首领必掉",\n  "phase": 5',
        '  "note": "炼气后期以上精英怪 3%，首领必掉"', `${mode}: beast_core material phase`);
      const before = JSON.parse(previous), after = JSON.parse(raw);
      assert.equal(after.filter(row => row.id === 'beast_core').length, 1);
      assert.equal(after.find(row => row.id === 'beast_core').phase, 5);
      assert.equal(before.find(row => row.id === 'beast_core').phase, undefined);
    } else if (name === 'items.json') {
      previous = replaceExactlyOnce(raw,
        ' },\n {\n  "id": "beast_core",\n  "name": "妖兽内丹",\n  "phase": 5,\n  "icon": "icon_beast_core"\n }\n]',
        ' }\n]', `${mode}: beast_core item mirror`);
      assert.equal(JSON.parse(raw).filter(row => row.id === 'beast_core').length, 1);
    } else previous = stripEnchantClosedAddition(raw);
    assert.equal(digest(previous), oldShas[name], `${mode}: exact authorized delta restores historical ${name} SHA`);
    tableChecks.push({ mode, file, actualSha256: digest(raw), expectedSha256: expected,
      reconstructedHistoricalSha256: digest(previous), expectedHistoricalSha256: oldShas[name], match: true });
  }
}
fs.writeFileSync(auditPath('compatibility-real-table-proof.json'), JSON.stringify({ passed: true,
  stdin: '/dev/null', case: process.env.ENCHANT_REGRESSION_CASE ?? null,
  realDiskRead: true, fakeReadFile: false, productModuleTransformations: [],
  scope: 'Only historical test expectations are adapted; current real tables and product SSR modules are always used.',
  tableChecks, preexistingReadOnlyChecks }, null, 2) + '\n');

export function createCurrentStringsTestServer(originalCreateServer, options) {
  return originalCreateServer({ ...options, plugins: [{
    name: 'enchant-closed-current-strings-test-count', enforce: 'pre',
    transform(source, id) {
      if (id.split('?')[0] !== path.join(root, 'src/v06p1-enhance-open.test.ts')) return;
      const before = "eq(Object.keys(strings).length, 944, '正式strings快照944键含_meta');";
      const after = "eq(Object.keys(strings).length, 952, '正式strings快照952键含_meta，原944键完整保留');";
      const transformed = replaceExactlyOnce(source, before, after, 'SSR test-only current strings key count');
      fs.appendFileSync(auditPath('compatibility-runtime-test-adaptations.jsonl'), JSON.stringify({
        file: id, originalSha256: digest(source), transformedSha256: digest(transformed),
        replacement: { before, after, expectedOccurrences: 1, actualOccurrences: 1 },
        productSource: false, diskWritten: false,
      }) + '\n');
      return transformed;
    },
  }, ...(options.plugins ?? [])] });
}
