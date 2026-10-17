// Reuse the preserved closed handoff's pinned historical test adapters in a new output directory.
// Only test expectations/output paths are adapted; product modules and business assertions stay intact.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotProtection, checkProtection, closedOutDirs } from './v06p1-smith-services-open-protection.mjs';
import { stripSmithServicesScene } from './v06p1-smith-services-scene-compat.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tip = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const openOut = path.resolve(root, process.env.SMITH_SERVICES_OPEN_OUT ?? `qa/out_v06p1_smith_services_open_${tip}`);
const out = path.join(openOut, 'regressions');
for (const closed of closedOutDirs)
  assert.ok(out !== closed && !out.startsWith(closed + path.sep), 'regressions cannot write a preserved closed out');
const protectedBefore = await snapshotProtection();
const historical = path.join(root, 'qa/out_v06p1_smith_services_closed');
const hash = value => createHash('sha256').update(value).digest('hex');
const productionSourceFiles = execFileSync('git', ['ls-files', 'src'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  .toString().trim().split('\n').filter(file => file && !file.endsWith('.test.ts')).sort();
const sourceManifest = async () => Object.fromEntries(await Promise.all(productionSourceFiles.map(async file =>
  [file, hash(await fs.readFile(path.join(root, file)))])));
const productionSourceHashes = await sourceManifest();
const productionSourceManifestSha256 = hash(JSON.stringify(productionSourceHashes));
await fs.mkdir(out, { recursive: true });
const reuse = [];
for (const name of ['regression-register.mjs', 'compat-proof.mjs', 'pinned-inputs.json']) {
  const bytes = await fs.readFile(path.join(historical, 'regressions', name));
  await fs.writeFile(path.join(out, name), bytes);
  reuse.push({ source: path.relative(root, path.join(historical, 'regressions', name)), sha256: hash(bytes), copiedTo: name });
}
await fs.copyFile(path.join(historical, 'strings-append-proof.json'), path.join(openOut, 'strings-append-proof.json'));
const configPath = path.join(out, 'pinned-inputs.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const mergedSceneFile = path.join(root, 'src/scenes/GameScene.ts');
const mergedSceneBytes = execFileSync('git', ['show', '233bdbd869f48c1de230488b36899e80a6a300ff:src/scenes/GameScene.ts'],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
assert.equal(hash(await fs.readFile(mergedSceneFile)), hash(mergedSceneBytes), 'GameScene exactly matches authorized merged baseline');
config.mergedScene = { file: mergedSceneFile, baseline: '233bdbd869f48c1de230488b36899e80a6a300ff',
  sha256: hash(mergedSceneBytes), strippedSha256: hash(stripSmithServicesScene(mergedSceneBytes.toString('utf8'))) };
const historicalSceneExpectations = [];
for (const [file, key] of [
  ['qa/out_v06p1_forge_closed/protected-before.json', 'wt:src/scenes/GameScene.ts'],
  ['qa/out_v06p1_forge_closed/source-before.json', 'src/scenes/GameScene.ts'],
  ['qa/out_v06p1_enhance_closed/protected-before-key.json', 'GameScene.ts'],
  ['qa/out_v06p1_enhance_closed/source-before.json', 'scenes/GameScene.ts'],
  ['qa/out_v06p1_market_closed/protected-before.json', 'wt:src/scenes/GameScene.ts'],
]) {
  const bytes = await fs.readFile(path.join(root, file)), old = JSON.parse(bytes);
  assert.match(old[key], /^[a-f0-9]{64}$/u, 'preserved historical GameScene expectation');
  historicalSceneExpectations.push({ file, fileSha256: hash(bytes), key, originalExpectedSha256: old[key],
    adaptedExpectedSha256: config.mergedScene.strippedSha256 });
}
historicalSceneExpectations.push({ file: 'scripts/v06p1-salvage-closed-test.mjs', key: 'src/scenes/GameScene.ts',
  originalExpectedSha256: 'f5d7defb24dda3ef1956e331479e9ee96794f1f45515bbb7951f3c3e19a0726c',
  adaptedExpectedSha256: config.mergedScene.strippedSha256 });
for (const name of ['v06p1-smith-services-closed', 'v06p1-market-open']) {
  const file = `scripts/${name}-test.mjs`;
  config.pins[file] = hash(await fs.readFile(path.join(root, file)));
}
config.pins['src/v06p1-forge-open.test.ts'] = hash(await fs.readFile(path.join(root, 'src/v06p1-forge-open.test.ts')));
const baselinePinUpdates = [];
for (const [file, previous] of Object.entries(config.pins)) {
  const current = hash(await fs.readFile(path.join(root, file)));
  const mergedBaseline = hash(execFileSync('git', ['show', '233bdbd869f48c1de230488b36899e80a6a300ff:' + file], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }));
  assert.equal(current, mergedBaseline, 'existing test exactly matches authorized merged baseline: ' + file);
  config.pins[file] = current;
  if (current !== previous) baselinePinUpdates.push({ file, previous, current, baseline: '233bdbd869f48c1de230488b36899e80a6a300ff' });
}
await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
const compatPath = path.join(out, 'compat-proof.mjs');
const compatOriginal = await fs.readFile(compatPath, 'utf8');
const compatNeedle = 'export function historicalExpected(name, expected) {';
assert.equal(compatOriginal.split(compatNeedle).length - 1, 1, 'historical scene comparison hook exact once');
const compatAdapted = compatOriginal.replace(compatNeedle, compatNeedle + `
  if (path.basename(name) === 'GameScene.ts') {
    assert.equal(hash(fs.readFileSync(config.mergedScene.file)), config.mergedScene.sha256, 'merged GameScene full source pin');
    return config.mergedScene.strippedSha256;
  }
  if (path.basename(name) === 'v06p1-forge-open.test.ts') return config.pins['src/v06p1-forge-open.test.ts'];`);
await fs.writeFile(compatPath, compatAdapted);
const originalLoader = await fs.readFile(path.join(historical, 'regressions/regression-loader.mjs'), 'utf8');
let loader = originalLoader;
const extend = (before, after) => {
  assert.equal(loader.split(before).length - 1, 1, `exact loader extension: ${before}`);
  loader = loader.replace(before, after);
};
const newTests = ['v06p1-smith-services-open.test.ts', 'v06p1-smith-services-open-ui.test.ts', 'v06p1-smith-services-open-gates.test.ts'];
extend('const additions = ', 'const newTests = ' + JSON.stringify(newTests) + ';\nconst additions = ');
extend("'v06p1-smith-services-closed.test.ts'];", "'v06p1-smith-services-closed.test.ts', 'SmithServicesPanel.ts', 'SmithServicesController.ts', 'SmithServicesUiAccess.ts', ..." + JSON.stringify(newTests) + '];');
extend('const name = path.basename(file, \'.mjs\');', `const name = path.basename(file, '.mjs');
  if (name === 'v06p1-smith-services-closed-test') {
    replace('closed rerun writes only this open window', "out = path.join(root, 'qa/out_v06p1_smith_services_closed')", 'out = ' + JSON.stringify(path.join(out, 'v06p1-smith-services-closed')), 1);
  }
  if (name === 'v06p1-market-open-test') {
    replace('market rerun writes only this open window', "path.join(root, 'qa/out_v06p1_market_open_preamble/open')", JSON.stringify(path.join(out, 'v06p1-market-open')), 1);
  }
  // These exact additions are test modules, never settlement consumers in production.
  replace('open fixture and type-only Controller imports excluded from historical consumer list', "...salvageSourceNames].includes(file)", "...salvageSourceNames, 'SmithServicesController.ts', 'v06p1-smith-services-closed.test.ts', ..." + JSON.stringify(${JSON.stringify(newTests)}) + "].includes(file)");
  replace('canonical merged adapter owns Gates', "eq(consumers, ['SmithServicesController.ts'],", "eq(consumers, ['SmithServices.ts'],");
  if (name === 'v06p1-forge-closed-test') {
    replace('merged GameScene full source pinned; historical stripped-byte expectation updated', 'preexistingReadOnlyShas[key] ?? protectCharmSha(key) ?? expected,', 'preexistingReadOnlyShas[key] ?? protectCharmSha(key) ?? historicalExpected(key, expected),', 1);
    replace('merged smith dialogue helper may name smith_ou; no direct closed Gate or historical tip consumers', 'ForgeClosed|smith_ou|forge', 'ForgeClosed|forge', 1);
  }
  if (name === 'v06p1-enhance-closed-test') {
    replace('merged GameScene full source pinned; historical stripped-byte expectation updated', ': stringsSha) : expected,', ': stringsSha) : historicalExpected(key, expected),', 1);
    replace('merged forge runtime test exact pin replaces its superseded smoke-source strip', "hash(stripForgeSceneSmokeCompatibility(await fs.readFile(file, 'utf8')))", "hash(await fs.readFile(file, 'utf8'))", 1);
  }
  if (name === 'v06p1-salvage-closed-test') replace('merged GameScene full source pinned; historical stripped-byte expectation updated', 'eq(historical, expected,', 'eq(historical, historicalExpected(file, expected),', 1);
  if (name === 'v06p1-market-closed-test') {
    source = "import { hasSmithServicesScene, stripSmithServicesScene } from './v06p1-smith-services-scene-compat.mjs';\\n" + source;
    replace('historical ignored src/gen QA artifacts are not current inputs; tracked gen/assets.json remains guarded', 'function protectedPath(key) {', "function protectedPath(key) {\\n  if (key.startsWith('wt:src/gen/') && key !== 'wt:src/gen/assets.json') return null;", 1);
    replace('historical source inventory excludes ignored QA artifacts and retains tracked gen/assets.json', "filter(key => key.startsWith('wt:src/'))", "filter(key => key.startsWith('wt:src/') && (!key.startsWith('wt:src/gen/') || key === 'wt:src/gen/assets.json'))", 1);
    replace('merged GameScene full exact baseline SHA replaces superseded combined scene-strip expectation', "eq(hash(stripMarketSceneWiring(stripForgeSceneWiring(await fs.readFile(file, 'utf8')))), authorizedSha,", "eq(hash(await fs.readFile(file, 'utf8')), " + JSON.stringify(config.mergedScene.sha256) + ",", 1);
    const original = 'function stripForgeSceneWiring(source) {';
    const replacement = original + "\\n  if (hasSmithServicesScene(source)) {\\n    let adjusted = stripSmithServicesScene(source, eq);\\n    const zCall = 'this.tryInteractMarketConsign() || this.tryInteractForgeEntrance() || this.tryInteractSecretNest()';\\n    eq(adjusted.split(zCall).length - 1, 1, 'merged smith route call exact once');\\n    adjusted = adjusted.replace(zCall, 'this.tryInteractMarketConsign() || this.tryInteractSecretNest()');\\n    const direct = '    if (this.tryInteractForgeEntrance()) return true;\\\\n';\\n    eq(adjusted.split(direct).length - 1, 1, 'merged smith direct route exact once');\\n    return adjusted.replace(direct, '');\\n  }";
    replace('strip current authorized smith route before unchanged market-source scan', original, replacement, 1);
  }`);
extend("'[...enchantSourceNames, ...salvageSourceNames].includes(name)'", "name === 'v06p1-market-closed-test' ? '[...enchantSourceNames, ...salvageSourceNames].includes(name)' : '[...enchantSourceNames, ...salvageSourceNames, ...smithServicesSourceNames].includes(name)'");
extend("`[...enchantSourceNames, ...salvageSourceNames, 'EquipInstReadonly.ts', 'SmithServices.ts', 'v06p1-smith-services-closed.test.ts'].includes(name)`", "`[...enchantSourceNames, ...salvageSourceNames, ...${JSON.stringify(additions)}].includes(name)`");
// Gate tests now include the previously merged UI source names; permit the new exact test modules too.
extend("\"...salvageSourceNames, 'SmithServices.ts', 'v06p1-smith-services-closed.test.ts'].includes(file)\",1);", "\"...salvageSourceNames, 'SmithServices.ts', 'v06p1-smith-services-closed.test.ts', ...\" + JSON.stringify(newTests) + \"].includes(file)\");");
// Prior attr-ui adapters intentionally pinned their old worktree and branch. Use this authorized worktree.
extend('"\'feat/ui-attr-inst\'","\'dev\'",1);', '"\'feat/ui-attr-inst\'","\'feat/ui-smith-services\'",1);');
await fs.writeFile(path.join(out, 'regression-loader.mjs'), loader);
await fs.writeFile(path.join(out, 'reuse-proof.json'), JSON.stringify({
  reuse, baselinePinUpdates, originalLoaderSha256: hash(originalLoader), extendedLoaderSha256: hash(loader), newTestSources: newTests,
  mergedScene: config.mergedScene, historicalSceneExpectations, compatProofAdaptation: { originalSha256: hash(compatOriginal), adaptedSha256: hash(compatAdapted), occurrences: 1,
    reason: 'Each GameScene historical comparison retains its original expected SHA in adaptation evidence; current full GameScene must exactly match merged baseline before the updated stripped expectation is accepted.' },
  productModuleTransformations: [], businessAssertionsChanged: false, closedArtifactsWritten: false,
}, null, 2) + '\n');

const suites = ['v06p1-smith-services-closed', 'v06p1-forge-closed', 'v06p1-enhance-closed',
  'v06p1-enchant-closed', 'v06p1-salvage-closed', 'v06p1-forge-open', 'v06p1-enhance-open',
  'v06p1-enchant-open', 'v06p1-salvage-open', 'v06p1-attr-ui-closed',
  'v06p1-attr-ui-binding-success', 'v06p1-attr-ui-map-api', 'v06p1-attr-ui-map-services',
  'v06p1-market-closed', 'v06p1-market-open', 'v06c-closed', 'v06d-closed'];
const arguments_ = process.argv.slice(2);
const selected = arguments_.length === 1 && arguments_[0] === '--summarize' ? []
  : arguments_.length ? arguments_ : [...suites, 'tsc', 'datalint-shared', 'datalint-snapshot'];
for (const name of selected) {
  assert.ok([...suites, 'tsc', 'datalint-shared', 'datalint-snapshot'].includes(name), name);
  const suiteOut = path.join(out, name);
  await fs.mkdir(suiteOut, { recursive: true });
  try {
    const previous = JSON.parse(await fs.readFile(path.join(out, name + '.result.json'), 'utf8'));
    if (previous.exitCode !== 0) {
      const attempt = path.join(out, 'attempts', previous.startedAt.replace(/[:.]/gu, '-'), name);
      await fs.mkdir(attempt, { recursive: true });
      for (const suffix of ['.log', '.result.json'])
        await fs.copyFile(path.join(out, name + suffix), path.join(attempt, name + suffix));
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
  let command, cwd = root;
  if (name === 'tsc') command = ['npx', 'tsc', '--noEmit'];
  else if (name.startsWith('datalint-')) {
    command = ['python3', '-c', "import runpy; result = runpy.run_path('/workspace/xiantu/qa/tools/datalint.py', run_name='__main__'); assert result['P'] == [], result['P']"];
    cwd = name === 'datalint-shared' ? '/workspace/xiantu' : path.join(root, 'data');
  } else {
    command = ['npm', 'run', 'test:' + name];
    env.NODE_OPTIONS = '--import=' + path.join(out, 'regression-register.mjs');
    for (const key of ['FORGE_CLOSED_OUT', 'ENHANCE_CLOSED_OUT', 'ENCHANT_CLOSED_OUT', 'SALVAGE_CLOSED_OUT',
      'SALVAGE_OPEN_OUT', 'ENCHANT_OPEN_OUT', 'XT_ENHANCE_QA_OUT', 'MARKET_CLOSED_OUT', 'OUT_DIR', 'OUT']) env[key] = suiteOut;
  }
  const startedAt = new Date().toISOString();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => chunks.push(chunk));
    child.on('error', reject); child.on('close', (exitCode, signal) => resolve({ exitCode, signal, output: Buffer.concat(chunks).toString() }));
  });
  await fs.writeFile(path.join(out, name + '.log'), result.output);
  const matches = [...result.output.matchAll(/(?:tests ok:|PASS:)[^\n]*?(\d+)\s*assertions/gu)];
  const row = { name, command, cwd, stdin: '/dev/null', startedAt, finishedAt: new Date().toISOString(),
    exitCode: result.exitCode, signal: result.signal, assertions: matches.length ? Number(matches.at(-1)[1]) : null,
    log: path.relative(root, path.join(out, name + '.log')), productModuleTransformations: [], productionSourceManifestSha256 };
  await fs.writeFile(path.join(out, name + '.result.json'), JSON.stringify(row, null, 2) + '\n');
  console.log(JSON.stringify(row));
  if (row.exitCode !== 0) console.log(result.output.slice(-4500));
}
const results = [];
for (const name of [...suites, 'tsc', 'datalint-shared', 'datalint-snapshot']) {
  try { results.push(JSON.parse(await fs.readFile(path.join(out, name + '.result.json'), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const summary = { passed: results.length === suites.length + 3 && results.every(row => row.exitCode === 0),
  results, totalAssertions: results.reduce((n, row) => n + (row.assertions ?? 0), 0),
  notRun: [...suites, 'tsc', 'datalint-shared', 'datalint-snapshot'].filter(name => !results.some(row => row.name === name)),
  productModuleTransformations: [], businessAssertionsChanged: false, closedArtifactsWritten: false };
const protection = await checkProtection(protectedBefore);
assert.deepEqual(await sourceManifest(), productionSourceHashes, 'production source bytes unchanged during regression run');
summary.closedArtifactsWritten = !protection.closedOutUnchanged;
summary.protectionPassed = protection.passed;
summary.testedHeadFull = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
summary.productionSourceManifestSha256 = productionSourceManifestSha256;
summary.productionSourcesUnchangedDuringRun = true;
await fs.writeFile(path.join(out, 'validation-source-hashes.json'), JSON.stringify({
  testedHeadFull: summary.testedHeadFull, productionSourceManifestSha256, productionSourceHashes,
  existingTestInputPins: config.pins, mergedScene: config.mergedScene,
}, null, 2) + '\n');
await fs.writeFile(path.join(out, 'protection-check.json'), JSON.stringify(protection, null, 2) + '\n');
await fs.writeFile(path.join(out, 'regression-summary.json'), JSON.stringify(summary, null, 2) + '\n');
process.exitCode = results.filter(row => selected.includes(row.name)).every(row => row.exitCode === 0) ? 0 : 1;
