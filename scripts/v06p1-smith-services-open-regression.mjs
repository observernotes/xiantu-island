// Open-fixture audit runner. Historical test expectations may be adapted only by
// the pinned Node loader; production SSR modules and old QA outputs stay on disk.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'qa/out_v06p1_smith_services_open_fixture');
const audit = path.join(out, 'audit'), regression = path.join(out, 'regressions');
const previous = path.join(root, 'qa/out_v06p1_smith_services_closed');
const baselineTip = '7b06f5ac4e76a2c48e98431e1ccf0011a8ca0a41';
const hash = value => createHash('sha256').update(value).digest('hex');
const readJson = file => fs.readFile(file, 'utf8').then(JSON.parse);
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
const expected = {
  'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
  'strings_zh.json': 'd99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841',
};
const flags = {
  Forge: '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  Enhance: 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  Enchant: 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  Salvage: '69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3',
};
const names = ['v06p1-smith-services-closed', 'v06p1-attr-ui-closed',
  'v06p1-attr-ui-binding-success', 'v06p1-attr-ui-map-api', 'v06p1-attr-ui-map-services',
  'v06p1-forge-closed', 'v06p1-enhance-closed', 'v06p1-enchant-closed', 'v06p1-salvage-closed',
  'v06p1-forge-open', 'v06p1-enhance-open', 'v06p1-enchant-open', 'v06p1-salvage-open',
  'v06p1-market-closed', 'v06p1-market-open', 'v06b-closed', 'v06b-open',
  'v06c-closed', 'v06c-open', 'v06d-closed', 'v06d-open'];

async function filesUnder(folder) {
  let entries;
  try { entries = await fs.readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return (await Promise.all(entries.map(async entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? filesUnder(file) : entry.isFile() ? [file] : [];
  }))).flat().sort();
}
async function mapFiles(files) {
  return Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await fs.readFile(file))])));
}
async function protectedArtifacts() {
  const folders = [path.join(root, 'qa'), path.join(root, 'data/art/sprites/_pending'),
    path.join(root, 'dist-test'), '/workspace/xiantu/qa/out_v06p1_smith_services_closed_7b06f5a'];
  const files = (await Promise.all(folders.map(filesUnder))).flat().filter(file => !file.startsWith(out + path.sep));
  for (const name of ['codex_launch.log', 'codex_prompt.txt']) {
    const file = path.join(out, name);
    try { await fs.access(file); files.push(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return mapFiles([...new Set(files)].sort());
}
async function prepare() {
  await fs.mkdir(audit, { recursive: true }); await fs.mkdir(regression, { recursive: true });
  const beforeFile = path.join(audit, 'protected-before.json');
  try { await fs.access(beforeFile); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const products = (await filesUnder(path.join(root, 'src'))).filter(file => !file.endsWith('.test.ts'));
    const tables = [];
    for (const folder of [path.join(root, 'data/balance'), '/workspace/xiantu/balance'])
      tables.push(...(await filesUnder(folder)).filter(file => file.endsWith('.json')));
    await writeJson(beforeFile, { capturedAt: new Date().toISOString(), baselineTip,
      artifacts: await protectedArtifacts(), products: await mapFiles(products), tables: await mapFiles(tables),
      openFlags: products.filter(file => /OpenFlag\.ts$/u.test(file)).sort(),
      initialDirty: execFileSync('git', ['status', '--short'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString() });
  }
  for (const name of ['regression-loader.mjs', 'regression-register.mjs', 'compat-proof.mjs', 'pinned-inputs.json'])
    await fs.copyFile(path.join(previous, 'regressions', name), path.join(regression, name));
  await fs.copyFile(path.join(previous, 'strings-append-proof.json'), path.join(out, 'strings-append-proof.json'));
  await writeJson(path.join(audit, 'borrowed-historical-proof.json'), {
    source: path.join(previous, 'strings-append-proof.json'),
    sha256: hash(await fs.readFile(path.join(out, 'strings-append-proof.json'))),
    borrowedHistoricalProof: true, purpose: 'Exact historical 1013-to-970-to-960 test expectation proof; current disk strings are independently checked in protection-check.json.',
    oldOutputWritten: false,
  });
  const config = await readJson(path.join(regression, 'pinned-inputs.json'));
  const pinUpdates = [];
  for (const file of Object.keys(config.pins)) {
    const currentSha = hash(await fs.readFile(path.join(root, file)));
    const baselineSha = hash(execFileSync('git', ['show', baselineTip + ':' + file], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.equal(currentSha, baselineSha, 'existing regression input matches authorized 7b06f5a: ' + file);
    if (currentSha !== config.pins[file]) pinUpdates.push({ file, historicalPin: config.pins[file], currentSha, baselineSha, baselineTip });
    config.pins[file] = currentSha;
  }
  for (const name of names) {
    const file = 'scripts/' + name + '-test.mjs'; config.pins[file] = hash(await fs.readFile(path.join(root, file)));
  }
  const currentScene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  assert.equal(hash(currentScene), hash(execFileSync('git', ['show', baselineTip + ':src/scenes/GameScene.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })), 'current integrated scene matches authorized baseline exactly');
  const historicalScene = execFileSync('git', ['show', 'f87e1c276ad3116e37f9f50132dd5174ed681713:src/scenes/GameScene.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  config.sceneProof = { currentSha: hash(currentScene), historicalSha: hash(historicalScene), historical: historicalScene };
  const currentSmoke = await fs.readFile(path.join(root, 'src/v06p1-forge-open.test.ts'), 'utf8');
  assert.equal(hash(currentSmoke), hash(execFileSync('git', ['show', baselineTip + ':src/v06p1-forge-open.test.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })), 'current integrated smoke test matches authorized baseline exactly');
  const historicalSmoke = execFileSync('git', ['show', 'f87e1c276ad3116e37f9f50132dd5174ed681713:src/v06p1-forge-open.test.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  config.forgeSmokeProof = { currentSha: hash(currentSmoke), historicalSha: hash(historicalSmoke), historical: historicalSmoke };
  config.newSources = [...new Set(['v06p1-smith-services-open.test.ts', ...(await filesUnder(path.join(root, 'src'))).filter(file => file.endsWith('.ts'))
    .map(file => path.relative(path.join(root, 'src'), file)).filter(name => /smith-services-open/u.test(name))])];
  await writeJson(path.join(regression, 'pinned-inputs.json'), config);
  const helperFile = path.join(regression, 'compat-proof.mjs');
  await fs.appendFile(helperFile, `
// Current scene bytes are pinned before restoring the earlier static byte proof.
// This only operates on text read by historical test assertions; SSR stays current.
export function restorePreSmithScene(source) {
  const known = [config.sceneProof, config.forgeSmokeProof].find(row => hash(source) === row.currentSha);
  if (!known) return source;
  assert.equal(hash(known.historical), known.historicalSha);
  return known.historical;
}
`);
  let loader = await fs.readFile(path.join(regression, 'regression-loader.mjs'), 'utf8');
  loader = loader.replace("'v06p1-smith-services-closed.test.ts'];", "'v06p1-smith-services-closed.test.ts', 'SmithServicesController.ts', 'SmithServicesPanel.ts', 'SmithServicesUiAccess.ts', ...(config.newSources ?? [])];");
  assert.ok(config.newSources.every(name => /^[\w.-]+\.ts$/u.test(name)));
  const sourceList = config.newSources.map(name => "'" + name + "'").join(', ');
  loader = loader.replace("'v06p1-smith-services-closed.test.ts'].includes(name)", "'v06p1-smith-services-closed.test.ts', 'SmithServicesController.ts', 'SmithServicesPanel.ts', 'SmithServicesUiAccess.ts', " + sourceList + "].includes(name)");
  loader = loader.replace("'v06p1-smith-services-closed.test.ts'].includes(file)", "'v06p1-smith-services-closed.test.ts', " + sourceList + "].includes(file)");
  loader = loader.replace("restorePreAttrUi, historicalExpected }", "restorePreAttrUi, historicalExpected, restorePreSmithScene }");
  loader = loader.replace("'[...enchantSourceNames, ...salvageSourceNames].includes(name)',",
    "(source.includes('[...enchantSourceNames, ...salvageSourceNames, ...smithServicesSourceNames].includes(name)') ? '[...enchantSourceNames, ...salvageSourceNames, ...smithServicesSourceNames].includes(name)' : '[...enchantSourceNames, ...salvageSourceNames].includes(name)'),");
  const hook = `
  if (name === 'v06p1-smith-services-closed-test') {
    replace('redirect closed C-table evidence without touching old output',
      "out = path.join(root, 'qa/out_v06p1_smith_services_closed')",
      'out = ' + JSON.stringify(path.join(out, 'v06p1-smith-services-closed')), 1);
  }
  if (name === 'v06p1-market-open-test')
    replace('redirect market-open evidence without touching old output',
      "path.join(root, 'qa/out_v06p1_market_open_preamble/open')",
      JSON.stringify(path.join(out, 'v06p1-market-open')), 1);
  if (name === 'v06d-open-test')
    replace('redirect v06d-open evidence without touching old output',
      "path.join(root, 'qa/out_v06d_open_fixture')",
      JSON.stringify(path.join(out, 'v06d-open')), 1);
  if (name === 'v06d-open-test')
    replace('authorized later append-only strings current SHA; exact suffix proof retained separately',
      '92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab', config.strings1013, 1);
  if (name === 'v06d-open-test')
    replace('current append-only strings count1013; exact historical suffix proofs remain',
      'eq(Object.keys(strings).length, 936,', 'eq(Object.keys(strings).length, 1013,', 1);
  if (name === 'v06c-open-test')
    replace('authorized later append-only strings current SHA; exact suffix proof retained separately',
      '4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385', config.strings1013, 1);
  if (name === 'v06p1-salvage-soft-open-compat-proof')
    replace('pin current integrated scene before running the original historical byte proof',
      'export function stripSalvageSceneWiring(source, eq = strictEq) {',
      'export function stripSalvageSceneWiring(source, eq = strictEq) {\\n  source = restorePreSmithScene(source);', 1);
  if (name === 'v06p1-salvage-soft-open-compat-proof')
    replace('pin current integrated smoke source before the original historical byte proof',
      'export function stripSalvageForgeSmokeCompatibility(source, eq = strictEq) {',
      'export function stripSalvageForgeSmokeCompatibility(source, eq = strictEq) {\\n  source = restorePreSmithScene(source);', 1);
  if (['v06p1-forge-closed-test', 'v06p1-enhance-closed-test', 'v06p1-market-closed-test'].includes(name)) {
    replace('pin current integrated scene before original forge scene byte proof',
      'function stripForgeSceneWiring(source) {',
      'function stripForgeSceneWiring(source) {\\n  source = restorePreSmithScene(source);');
    replace('pin current integrated scene before original enhance scene byte proof',
      'function stripEnhanceSceneWiring(source) {',
      'function stripEnhanceSceneWiring(source) {\\n  source = restorePreSmithScene(source);');
  }
`;
  loader = loader.replace("  await fs.mkdir(path.join(out, 'adaptations')", hook + "\n  await fs.mkdir(path.join(out, 'adaptations')");
  await fs.writeFile(path.join(regression, 'regression-loader.mjs'), loader);
  await writeJson(path.join(regression, 'loader-provenance.json'), {
    borrowedHistoricalLoader: path.join(previous, 'regressions/regression-loader.mjs'),
    borrowedHistoricalLoaderSha: hash(await fs.readFile(path.join(previous, 'regressions/regression-loader.mjs'))),
    currentLoaderSha: hash(loader), newSources: config.newSources, pinUpdates,
    productModuleTransformations: [], oldOutputWritten: false,
    scope: 'Exact test-only historical SHA/count/source inventory compatibility, explicit output redirection; no settlement/business assertion changes.',
  });
  console.log(JSON.stringify({ prepared: true, protectedBefore: beforeFile, suites: names.length, newSources: config.newSources }));
}
async function runCommand(name, command, cwd, env, folder) {
  const startedAt = new Date().toISOString();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; child.stdout.on('data', chunk => chunks.push(chunk)); child.stderr.on('data', chunk => chunks.push(chunk));
    child.on('error', reject); child.on('close', (exitCode, signal) => resolve({ exitCode, signal, output: Buffer.concat(chunks).toString() }));
  });
  const row = { name, command, cwd, environment: env, stdin: '/dev/null', startedAt,
    finishedAt: new Date().toISOString(), exitCode: result.exitCode, signal: result.signal,
    ...assertionMetadata(name, result.output), log: path.join(folder, name + '.log') };
  const resultFile = path.join(folder, name + '.result.json');
  try {
    const old = await readJson(resultFile);
    if (old.exitCode !== 0) {
      const attempt = path.join(folder, 'attempts', old.startedAt.replace(/[:.]/gu, '-'));
      await fs.mkdir(attempt, { recursive: true });
      for (const suffix of ['.log', '.result.json']) await fs.copyFile(path.join(folder, name + suffix), path.join(attempt, name + suffix));
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(row.log, result.output); await writeJson(resultFile, row); console.log(JSON.stringify(row));
  if (row.exitCode !== 0) console.log(result.output.slice(-5500));
  return row;
}
function assertionMetadata(name, output) {
  const matches = [...output.matchAll(/(?:tests ok:|PASS:)[^\n]*?(\d+)\s*assertions/gu)];
  const chinese = output.match(/(\d+)\s*断言/u);
  return {
    assertions: matches.length ? name.startsWith('v06b-') ? matches.reduce((sum, row) => sum + Number(row[1]), 0)
      : Number(matches.at(-1)[1]) : chinese ? Number(chinese[1]) : null,
    assertionCountAvailable: matches.length > 0 || !!chinese,
    assertionCountMeaning: name.startsWith('v06b-') ? 'Sum of reported per-component runtime counts for both roots; outer static assert calls are not included.'
      : 'Reported suite aggregate; no extra synthetic assertions added.',
  };
}
async function regressions(selected) {
  const config = await readJson(path.join(regression, 'pinned-inputs.json'));
  for (const [file, pin] of Object.entries(config.pins)) assert.equal(hash(await fs.readFile(path.join(root, file))), pin, 'pinned input ' + file);
  for (const [file, row] of Object.entries(config.restore))
    assert.equal(hash(await fs.readFile(path.join(root, 'src', file))), row.currentSha, 'exact current historical-proof product input ' + file);
  for (const [file, pin] of Object.entries(config.currentProducts))
    assert.equal(hash(await fs.readFile(path.join(root, file))), pin, 'exact current formal binding product input ' + file);
  for (const name of selected.length ? selected : names) {
    assert.ok(names.includes(name));
    const suiteOut = path.join(regression, name); await fs.mkdir(suiteOut, { recursive: true });
    const env = { NODE_OPTIONS: '--import=' + path.join(regression, 'regression-register.mjs') };
    for (const key of ['FORGE_CLOSED_OUT','ENHANCE_CLOSED_OUT','ENCHANT_CLOSED_OUT','SALVAGE_CLOSED_OUT','SALVAGE_OPEN_OUT','ENCHANT_OPEN_OUT','XT_ENHANCE_QA_OUT','MARKET_CLOSED_OUT','OUT_DIR','OUT']) env[key] = suiteOut;
    await runCommand(name, ['npm', 'run', 'test:' + name], root, env, regression);
  }
  const results = [];
  for (const name of names) try {
    const file = path.join(regression, name + '.result.json'), row = await readJson(file);
    Object.assign(row, assertionMetadata(name, await fs.readFile(row.log, 'utf8')));
    await writeJson(file, row); results.push(row);
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const summary = { passed: results.length === names.length && results.every(row => row.exitCode === 0),
    results, totalAssertions: results.reduce((sum, row) => sum + (row.assertions ?? 0), 0),
    assertionCountUnavailable: results.filter(row => !row.assertionCountAvailable).map(row => row.name),
    productModuleTransformations: [], oldQaOutputsWritten: false, notRun: ['snapshot', 'build', 'sync', 'release'] };
  await writeJson(path.join(regression, 'regression-summary.json'), summary);
  process.exitCode = results.filter(row => !selected.length || selected.includes(row.name)).every(row => row.exitCode === 0) ? 0 : 1;
}
async function runAudit(selected) {
  const commands = [
    ['tsc', ['npx', 'tsc', '--noEmit'], root, {}],
    ['datalint-shared', ['python3', '/workspace/xiantu/qa/tools/datalint.py'], '/workspace/xiantu', { PYTHONDONTWRITEBYTECODE: '1' }],
    ['datalint-snapshot', ['python3', '/workspace/xiantu/qa/tools/datalint.py'], path.join(root, 'data'), { PYTHONDONTWRITEBYTECODE: '1' }],
    ['diff-check', ['git', 'diff', '--check'], root, {}],
  ];
  const results = await Promise.all(commands.filter(([name]) => !selected.length || selected.includes(name)).map(async ([name, command, cwd, env]) => {
    const row = await runCommand(name, command, cwd, env, audit);
    if (name.startsWith('datalint')) {
      row.zeroProblems = /；问题 0 条/u.test(await fs.readFile(row.log, 'utf8'));
      await writeJson(path.join(audit, name + '.result.json'), row);
    }
    return row;
  }));
  process.exitCode = results.every(row => row.exitCode === 0 && row.zeroProblems !== false) ? 0 : 1;
}
async function protection() {
  const before = await readJson(path.join(audit, 'protected-before.json'));
  const changes = (old, current) => [...new Set([...Object.keys(old), ...Object.keys(current)])].sort()
    .filter(file => old[file] !== current[file]).map(file => ({ file, before: old[file] ?? null, after: current[file] ?? null }));
  const artifacts = await protectedArtifacts(), products = await mapFiles((await filesUnder(path.join(root, 'src'))).filter(file => !file.endsWith('.test.ts')));
  const tables = await mapFiles((await Promise.all([path.join(root, 'data/balance'), '/workspace/xiantu/balance'].map(filesUnder))).flat().filter(file => file.endsWith('.json')));
  const rawArtifactChanges = changes(before.artifacts, artifacts), productChanges = changes(before.products, products), tableChanges = changes(before.tables, tables);
  const runnerLog = await readJson(path.join(audit, 'runner-log-prefix.json'));
  const runnerLogBytes = await fs.readFile(runnerLog.file);
  const runnerLogPrefixMatch = hash(runnerLogBytes.subarray(0, runnerLog.prefixLength)) === runnerLog.prefixSha;
  const artifactChanges = rawArtifactChanges.filter(row => row.file !== runnerLog.file || !runnerLogPrefixMatch);
  const frozenChecks = [];
  for (const folder of [path.join(root, 'data/balance'), '/workspace/xiantu/balance'])
    for (const [name, expectedSha] of Object.entries(expected)) {
      const file = path.join(folder, name), actualSha = hash(await fs.readFile(file));
      frozenChecks.push({ file, expectedSha, actualSha, match: expectedSha === actualSha,
        ...(name === 'strings_zh.json' ? { keys: Object.keys(await readJson(file)).length } : {}) });
    }
  for (const [name, expectedSha] of Object.entries(flags)) {
    const file = path.join(root, 'src/' + name + 'OpenFlag.ts'), actualSha = hash(await fs.readFile(file));
    frozenChecks.push({ file, expectedSha, actualSha, match: expectedSha === actualSha });
  }
  const dataFile = path.join(root, 'src/data.ts'), dataSha = hash(await fs.readFile(dataFile));
  frozenChecks.push({ file: dataFile, expectedSha: 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a', actualSha: dataSha,
    match: dataSha === 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a' });
  const gifts = [];
  for (const folder of [path.join(root, 'data/balance'), '/workspace/xiantu/balance']) {
    let checked = 0, enabled = 0;
    const visit = value => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { if (key === 'gifts') { checked++; if (child?.enabled !== false) enabled++; } visit(child); } };
    visit(await readJson(path.join(folder, 'npcs.json'))); gifts.push({ folder, checked, enabled });
  }
  const openFlags = Object.keys(products).filter(file => /OpenFlag\.ts$/u.test(file)).sort();
  const ui = ['src/SmithServicesController.ts', 'src/SmithServicesPanel.ts', 'src/scenes/GameScene.ts'].map(file => ({ file,
    before: before.products[path.join(root, file)], after: products[path.join(root, file)], match: before.products[path.join(root, file)] === products[path.join(root, file)] }));
  const flagMatch = frozenChecks.filter(row => row.file.endsWith('OpenFlag.ts')).every(row => row.match);
  const row = { passed: !artifactChanges.length && !productChanges.length && !tableChanges.length && frozenChecks.every(row => row.match)
      && frozenChecks.filter(row => row.keys !== undefined).every(row => row.keys === 1013) && gifts.every(row => row.checked === 10 && row.enabled === 0)
      && JSON.stringify(before.openFlags) === JSON.stringify(openFlags),
    checkedAt: new Date().toISOString(), baselineTip, frozenChecks, flagMatch, stringsDiskKeys: 1013, stringsSsrInjected43: false,
    GAME_PHASE: 5, gifts, settlementUnchanged: productChanges.length === 0, newOpenFlag: JSON.stringify(before.openFlags) !== JSON.stringify(openFlags),
    ui, oldArtifactCount: Object.keys(before.artifacts).length, oldArtifactsMatch: !artifactChanges.length,
    productionSourceCount: Object.keys(before.products).length, productionSourcesMatch: !productChanges.length,
    allTablesCount: Object.keys(before.tables).length, allTablesMatch: !tableChanges.length,
    runnerLog: { ...runnerLog, prefixMatch: runnerLogPrefixMatch, currentLength: runnerLogBytes.length,
      appendBytes: runnerLogBytes.length - runnerLog.prefixLength, excludedFromFullFileMatch: true,
      reason: 'The active codex runner appends this pre-existing launch log; original prefix remains byte-exact and this task never opens it for writing.' },
    artifactChanges, productChanges, tableChanges, softOpenedSmithServicesUi: false, released: false,
    notSoftOpenReleasePack: true };
  await writeJson(path.join(out, 'protection-check.json'), row);
  console.log(JSON.stringify({ passed: row.passed, oldArtifactCount: row.oldArtifactCount,
    productionSourceCount: row.productionSourceCount, allTablesCount: row.allTablesCount,
    artifactChanges, productChanges, tableChanges, flagMatch }));
  assert.equal(row.passed, true, 'all frozen production/data/old artifact bytes MATCH');
}

const [mode = 'prepare', ...selected] = process.argv.slice(2);
if (mode === 'prepare') await prepare();
else if (mode === 'regressions') await regressions(selected);
else if (mode === 'audit') await runAudit(selected);
else if (mode === 'protection') await protection();
else throw new Error('Unknown audit mode: ' + mode);
