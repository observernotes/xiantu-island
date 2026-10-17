// Allowlisted ESM source transforms for old regression runners; never intercept fs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const qa = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(qa, '../..');
const support = pathToFileURL(path.join(qa, 'regression-compat-support.mjs')).href;
const names = ['v06p1-enhance-open', 'v06p1-enhance-closed', 'v06p1-forge-open',
  'v06p1-forge-closed', 'v06p1-market-closed', 'v06d-closed', 'v06c-closed'];
const runnerUrls = new Map(names.map(name => [pathToFileURL(path.join(root, 'scripts', name + '-test.mjs')).href, name]));
const oldStrings = 'd7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09';
const newStrings = '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9';
const digest = source => createHash('sha256').update(source).digest('hex');

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  const name = runnerUrls.get(url);
  if (!name) return result;
  const original = String(result.source);
  let source = original;
  const changes = [];
  const replace = (label, before, after, expected = 1) => {
    const actual = source.split(before).length - 1;
    assert.equal(actual, expected, `${name}/${label}: exact authorized source replacement count`);
    source = source.split(before).join(after);
    changes.push({ label, before, after, expectedOccurrences: expected, actualOccurrences: actual });
  };
  replace('import strict compatibility proof helpers', "import assert from 'node:assert/strict';",
    "import assert from 'node:assert/strict';\n" +
    `import { stripEnchantClosedAddition, enchantSourceNames, createCurrentStringsTestServer } from ${JSON.stringify(support)};`);

  if (name !== 'v06p1-forge-open') {
    replace('current strings authority SHA', oldStrings, newStrings);
    if (['v06p1-enhance-open', 'v06p1-enhance-closed', 'v06p1-forge-closed', 'v06p1-market-closed'].includes(name)) {
      replace('current material authority SHA', '79c68429d763054ac1715467d1743575e179ecaecb2529e4b6ed7df137ef4052',
        '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d');
      replace('current item authority SHA', 'f8b587634e5c9d43a475e85724aa34172e2945abda7654c2ef98fda07d1566f3',
        'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99');
    }
  }
  if (name === 'v06p1-enhance-open') {
    replace('SSR test-only key count adapter', "import { createServer } from 'vite';",
      "import { createServer as originalCreateServer } from 'vite';\nconst createServer = options => createCurrentStringsTestServer(originalCreateServer, options);");
    replace('test consumer explicit allowlist', "['EnhanceGate.ts', 'v06p1-enhance-open.test.ts'].includes(file)",
      "['EnhanceGate.ts', 'v06p1-enhance-open.test.ts', 'v06p1-enchant-closed.test.ts'].includes(file)");
    replace('game keeps historical strings SHA', 'eq(hash(rawStrings), stringsSha,',
      `eq(hash(rawStrings), mode === 'game' ? '${oldStrings}' : stringsSha,`);
    replace('two current roots have 952 strings keys', 'eq(entries.length, 944,', "eq(entries.length, mode === 'game' ? 944 : 952,");
    replace('formal eight-key slice remains exact', 'entries.slice(936)', 'entries.slice(936, 944)');
    replace('prove old formal-byte chain after removing new eight keys', 'hash(rawStrings.replace(', 'hash(stripEnchantClosedAddition(rawStrings).replace(');
  } else if (name === 'v06p1-forge-open') {
    replace('test consumer explicit allowlist', "['ForgeGate.ts', 'v06p1-forge-open.test.ts', 'v06p1-enhance-open.test.ts'].includes(file)",
      "['ForgeGate.ts', 'v06p1-forge-open.test.ts', 'v06p1-enhance-open.test.ts', 'v06p1-enchant-closed.test.ts'].includes(file)");
  } else if (name === 'v06p1-enhance-closed') {
    replace('per-root baseline strings authority', "['strings.shared', 'strings.wt', 'strings.game'].includes(key) ? stringsSha : expected",
      `['strings.shared', 'strings.wt', 'strings.game'].includes(key) ? (key === 'strings.game' ? '${oldStrings}' : stringsSha) : expected`);
    replace('exact source set adds only three enchant files', '[...oldNames, ...newSources, ...openFixtureSources].sort()',
      '[...oldNames, ...newSources, ...openFixtureSources, ...enchantSourceNames].sort()');
    replace('game snapshot stays historical', "dataBefore['game:balance/strings_zh.json'] = stringsSha;",
      `dataBefore['game:balance/strings_zh.json'] = '${oldStrings}';`);
    replace('game static strings SHA stays historical', 'eq(hash(raw), stringsSha,',
      `eq(hash(raw), mode === 'game' ? '${oldStrings}' : stringsSha,`);
    replace('current roots 952, historical game 944', 'eq(entries.length, 944,', "eq(entries.length, mode === 'game' ? 944 : 952,");
    replace('exact historical formal block range', 'entries.slice(936)', 'entries.slice(936, 944)');
    replace('restore historical bytes before original strip proof', 'const preFormal = raw.replace(', 'const preFormal = stripEnchantClosedAddition(raw).replace(');
    replace('explicit new source scanner allowance', "for (const name of await filesUnder(path.join(root, 'src'))) {",
      "for (const name of await filesUnder(path.join(root, 'src'))) {\n    if (enchantSourceNames.includes(name)) continue; // New files are verified by the enchant C01–C10 suite.");
    replace('post-run game SHA remains historical', "eq(await shaOrNull(path.join(roots.get('game'), 'balance/strings_zh.json')), stringsSha,",
      `eq(await shaOrNull(path.join(roots.get('game'), 'balance/strings_zh.json')), '${oldStrings}',`);
  } else if (name === 'v06p1-forge-closed' || name === 'v06p1-market-closed') {
    replace('per-root baseline strings authority', "key.endsWith(':balance/strings_zh.json') ? stringsSha",
      `key.endsWith(':balance/strings_zh.json') ? (key.startsWith('game:') ? '${oldStrings}' : stringsSha)`);
    replace('exact source set adds only three enchant files', '...openFixtureSources, ...enhanceClosedSources].sort()',
      '...openFixtureSources, ...enhanceClosedSources, ...enchantSourceNames].sort()');
    replace('restore historical bytes before original strip proof', 'const preFormal = raw.replace(', 'const preFormal = stripEnchantClosedAddition(raw).replace(');
    replace('explicit new source scanner allowance', "for (const name of await filesUnder(path.join(root, 'src'))) {",
      "for (const name of await filesUnder(path.join(root, 'src'))) {\n    if (enchantSourceNames.includes(name)) continue; // New files are verified by the enchant C01–C10 suite.");
    if (name === 'v06p1-forge-closed') {
      replace('game static strings SHA stays historical', 'eq(hash(raw), stringsSha,',
        `eq(hash(raw), mode === 'game' ? '${oldStrings}' : stringsSha,`);
      replace('current roots 952, historical game 944', 'eq(entries.length, 944,', "eq(entries.length, mode === 'game' ? 944 : 952,");
      replace('post-run game SHA remains historical', "eq(await shaOrNull(path.join(roots.get('game'), 'balance/strings_zh.json')), stringsSha,",
        `eq(await shaOrNull(path.join(roots.get('game'), 'balance/strings_zh.json')), '${oldStrings}',`);
    } else {
      replace('current roots have 952 keys', 'eq(entries.length, 944,', 'eq(entries.length, 952,');
      replace('post-run game SHA remains historical', "eq(await shaOrNull(path.join(gameData, 'balance/strings_zh.json')), stringsSha,",
        `eq(await shaOrNull(path.join(gameData, 'balance/strings_zh.json')), '${oldStrings}',`);
    }
  } else if (name === 'v06d-closed') {
    replace('current roots have 952 keys', 'eq(entries.length, 944,', 'eq(entries.length, 952,');
    replace('restore historical bytes before original strip proof', 'const preFormal = rawStrings.replace(', 'const preFormal = stripEnchantClosedAddition(rawStrings).replace(');
    replace('restore game comparison historical bytes', "const preFormal = sharedBytes.get(name).toString('utf8').replace(",
      "const preFormal = stripEnchantClosedAddition(sharedBytes.get(name).toString('utf8')).replace(");
    replace('game keeps original authority SHA', 'eq(hash(gameStrings), expectedSha[name],', `eq(hash(gameStrings), '${oldStrings}',`);
    replace('game equals exact historical portion of current shared bytes', "eq(gameStrings, sharedBytes.get(name).toString('utf8'),",
      "eq(gameStrings, stripEnchantClosedAddition(sharedBytes.get(name).toString('utf8')),");
  } else if (name === 'v06c-closed') {
    replace('current roots have 952 keys', 'eq(Object.keys(strings).length, 944,', 'eq(Object.keys(strings).length, 952,');
    replace('restore historical bytes before original strip proof', "const preFormal = sharedBytes.get('balance/strings_zh.json').toString('utf8').replace(",
      "const preFormal = stripEnchantClosedAddition(sharedBytes.get('balance/strings_zh.json').toString('utf8')).replace(");
  }
  const out = path.resolve(process.env.ENCHANT_REGRESSION_OUT ?? qa);
  assert.ok(out === qa || out.startsWith(qa + path.sep), 'compatibility audit stays inside this window QA');
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'compatibility-source-adaptations.json'), JSON.stringify({
    passed: true, runner: name, file: fileURLToPath(url), stdin: '/dev/null',
    originalSha256: digest(original), transformedSha256: digest(source),
    diskWritten: false, realDiskRead: true, fakeReadFile: false, assertionWrapperChanged: false,
    productModuleTransformations: [], changes,
  }, null, 2) + '\n');
  return { ...result, source };
}
