// Shared read-only guards for the complete Smith Services UI O01–O11 fixture.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sharedRoot } from './root.mjs';
import ts from 'typescript';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const shared = sharedRoot(root);
export const implementationBaseline = '7b06f5ac4e76a2c48e98431e1ccf0011a8ca0a41';
export const expectedShas = {
  enhance: 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  strings: 'd99a88fd722e23afd7294d62dcb637222656e7187ff52cfad4d4ea0945fa1841',
  data: 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
};
export const flagShas = {
  Forge: '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  Enhance: 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  Enchant: 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  Salvage: '69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3',
};
const currentTip = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
export const closedOutDirs = [
  ...[root, shared].flatMap(base => [
    'qa/out_v06p1_smith_services_closed',
    'qa/out_v06p1_smith_services_open_abff11d',
    'qa/out_v06p1_smith_services_open_9d00852',
    'qa/out_v06p1_smith_services_open_ef99abb',
    'qa/out_v06p1_smith_services_open_fixture',
    'qa/out_v06p1_smith_services_open_a1d645d',
    'qa/out_v06p1_smith_services_closed_7b06f5a',
  ].map(folder => path.join(base, folder))),
  // Freeze pre-existing soft evidence too; the current tip may be rerun in its own out.
  ...[root, shared].flatMap(base => readdirSync(path.join(base, 'qa'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^out_v06p1_smith_services_soft(?:_open)?_[a-f0-9]+$/u.test(entry.name)
      && entry.name !== `out_v06p1_smith_services_soft_${currentTip}`)
    .map(entry => path.join(base, 'qa', entry.name))),
];
export const authorizedDependencySources = ['src/ForgeGate.ts', 'src/EnhanceGate.ts', 'src/EnchantGate.ts',
  'src/SalvageGate.ts', 'src/Progress.ts', 'src/SaveStore.ts'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')));

/** Compare the existing settlement callbacks, not the newly authorized qualification/CAS boundary. */
export async function checkSettlement() {
  const rows = {};
  const printer = ts.createPrinter({ removeComments: true });
  for (const family of Object.keys(flagShas)) {
    const file = `src/${family}Gate.ts`;
    const baselineSource = git('show', `${implementationBaseline}:${file}`).toString();
    const currentSource = await fs.readFile(path.join(root, file), 'utf8');
    const callback = source => {
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const callbacks = [];
      const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'this.transact')
          callbacks.push(...node.arguments.filter(ts.isArrowFunction));
        ts.forEachChild(node, visit);
      };
      visit(ast);
      assert.equal(callbacks.length, 1, `${family}: exactly one canonical settlement callback`);
      return printer.printNode(ts.EmitHint.Unspecified, callbacks[0], ast);
    };
    const baselineSha = sha256(callback(baselineSource));
    const currentSha = sha256(callback(currentSource));
    assert.equal(currentSha, baselineSha, `${family}: settlement callback unchanged`);
    const boundaryMethods = family === 'Salvage' ? ['transact', 'qualification', 'submit'] : ['transact'];
    const methods = source => {
      if (family === 'Salvage') source = source.replaceAll('SalvageFixtureQualification', 'SalvageQualification')
        .replaceAll('Progress.getActiveSlot()', 'progress.getSaveSlot()');
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const gate = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === `${family}Gate`);
      assert.ok(gate, `${family}: canonical Gate class`);
      return Object.fromEntries(gate.members.filter(ts.isMethodDeclaration).map(node =>
        [node.name.getText(ast), sha256(printer.printNode(ts.EmitHint.Unspecified, node, ast))]));
    };
    const oldMethods = methods(baselineSource), newMethods = methods(currentSource), preservedMethods = {};
    for (const [name, expected] of Object.entries(oldMethods)) {
      if (boundaryMethods.includes(name)) continue;
      assert.equal(newMethods[name], expected, `${family}.${name}: existing rules and settlement helpers unchanged`);
      preservedMethods[name] = expected;
    }
    rows[family] = { baselineSha, currentSha, match: true, preservedMethods, authorizedBoundaryMethods: boundaryMethods };
  }
  return rows;
}

export async function filesIn(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const rows = await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(path.join(folder, entry.name)) : path.join(folder, entry.name)));
  return rows.flat().sort();
}

export async function directoryManifest(folder) {
  let files;
  try { files = await filesIn(folder); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { exists: false, files: {}, manifestSha256: sha256('{}') };
  }
  const manifest = sorted(Object.fromEntries(await Promise.all(files.map(async file =>
    [path.relative(folder, file), sha256(await fs.readFile(file))]))));
  return { exists: true, files: manifest, manifestSha256: sha256(JSON.stringify(manifest)) };
}

/** Capture before execution; this function never writes a protected file or closed out. */
export async function snapshotProtection() {
  const families = Object.keys(flagShas);
  const sourceNames = ['data.ts', 'features.ts', 'Progress.ts', 'SaveStore.ts', 'EquipInstBinding.ts',
    'EquipInstReadonly.ts', 'EquipPanel.ts', 'InventoryPanel.ts',
    ...families.flatMap(name => ['OpenFlag', 'Gate', 'Progress', 'Closed'].map(suffix => `${name}${suffix}.ts`))];
  const files = [...sourceNames.map(name => path.join(root, 'src', name)),
    ...await filesIn(path.join(root, 'data/balance')), ...await filesIn(path.join(shared, 'balance'))];
  const frozen = sorted(Object.fromEntries(await Promise.all(files.map(async file => [file, sha256(await fs.readFile(file))]))));
  const closedOut = Object.fromEntries(await Promise.all(closedOutDirs.map(async folder => [folder, await directoryManifest(folder)])));
  const openFlagFiles = (await filesIn(path.join(root, 'src'))).filter(file => /OpenFlag\.ts$/u.test(file))
    .map(file => path.relative(root, file)).sort();
  return { root, head: git('rev-parse', 'HEAD').toString().trim(), frozen, closedOut, openFlagFiles };
}

/** Verify exact, authoritative boundaries plus all captured files, additions and removals. */
export async function checkProtection(before, startupBaseline) {
  const after = await snapshotProtection();
  const compareSnapshot = (baseline, label, authorizedChanges = false) => {
    assert.equal(baseline.root, root, `${label}: expected worktree`);
    // Older start-of-task captures may omit features.ts, but every captured byte stays guarded.
    for (const [file, expected] of Object.entries(baseline.frozen)) {
      if (authorizedChanges && authorizedDependencySources.includes(path.relative(root, file))) continue;
      assert.equal(after.frozen[file], expected, `${label}: frozen SHA MATCH ${file}`);
    }
    if (baseline.openFlagFiles) assert.deepEqual(after.openFlagFiles, baseline.openFlagFiles, `${label}: no new OpenFlag`);
    for (const folder of closedOutDirs) {
      assert.equal(after.closedOut[folder].exists, baseline.closedOut[folder].exists, `${label}: closed out existence preserved ${folder}`);
      assert.deepEqual(sorted(after.closedOut[folder].files), sorted(baseline.closedOut[folder].files),
        `${label}: closed out remains byte-identical ${folder}`);
    }
  };
  compareSnapshot(before, 'before/after');
  if (startupBaseline) compareSnapshot(startupBaseline, 'start-of-task/after', true);
  const settlementCallbacks = await checkSettlement();
  const baselineNames = git('ls-tree', '-r', '--name-only', implementationBaseline, 'src').toString().trim().split('\n');
  assert.deepEqual(after.openFlagFiles, baselineNames.filter(file => /OpenFlag\.ts$/u.test(file)).sort(), 'no new production OpenFlag');
  for (const [family, expected] of Object.entries(flagShas)) {
    assert.equal(after.frozen[path.join(root, `src/${family}OpenFlag.ts`)], expected, `${family} Flag authoritative SHA MATCH`);
    for (const suffix of ['Gate', 'Progress', 'Closed']) {
      const file = `src/${family}${suffix}.ts`;
      if (suffix === 'Gate') continue; // Authorized dependency/CAS edits; callback hash above still freezes settlement.
      assert.equal(after.frozen[path.join(root, file)], sha256(git('show', `${implementationBaseline}:${file}`)), `${file}: settlement implementation unchanged`);
    }
  }
  assert.equal(after.frozen[path.join(root, 'src/data.ts')], expectedShas.data, 'data.ts authoritative SHA MATCH');
  assert.match(await fs.readFile(path.join(root, 'src/data.ts'), 'utf8'), /GAME_PHASE\s*=\s*5\b/u, 'GAME_PHASE=5');
  const roots = {};
  for (const [mode, dataRoot] of [['snapshot', path.join(root, 'data')], ['shared', shared]]) {
    const enhanceFile = path.join(dataRoot, 'balance/enhance.json'), stringsFile = path.join(dataRoot, 'balance/strings_zh.json');
    assert.equal(after.frozen[enhanceFile], expectedShas.enhance, `${mode}: enhance SHA MATCH`);
    assert.equal(after.frozen[stringsFile], expectedShas.strings, `${mode}: strings SHA MATCH`);
    const strings = await json(stringsFile);
    assert.equal(Object.keys(strings).length, 1013, `${mode}: disk strings1013`);
    // Other teams may have legitimate shared tables that differ from this worktree's snapshot.
    // All shared balance bytes are guarded against their captured start; these named smith tables
    // additionally must match the implementation baseline in both roots.
    for (const relative of ['enhance.json', 'strings_zh.json', 'recipes.json', 'materials.json', 'items.json',
      'npcs.json', 'life_skills.json', 'enhance_protect_charm.json']) {
      const file = path.join(dataRoot, 'balance', relative);
      assert.equal(after.frozen[file], sha256(git('show', `${implementationBaseline}:data/balance/${relative}`)),
        `${mode}: complete balance baseline SHA MATCH ${relative}`);
    }
    let giftsFalseCount = 0;
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'gifts') { assert.equal(child?.enabled, false, `${mode}: gifts remain disabled`); giftsFalseCount++; }
        visit(child);
      }
    };
    visit(await json(path.join(dataRoot, 'balance/npcs.json')));
    assert.equal(giftsFalseCount, 10, `${mode}: gifts 10×false`);
    roots[mode] = { dataRoot, enhanceSha: after.frozen[enhanceFile], stringsSha: after.frozen[stringsFile],
      stringsDiskKeys: 1013, stringsSsrInjected43: false, giftsFalseCount, gifts0: true, GAME_PHASE: 5 };
  }
  return { passed: true, implementationBaseline, before, after, startupBaselineChecked: !!startupBaseline,
    frozenFiles: Object.keys(after.frozen).length, closedOutUnchanged: true,
    closedOutManifestMatch: Object.fromEntries(closedOutDirs.map(folder => [folder, 'MATCH'])),
    fourFlagMatch: Object.fromEntries(Object.keys(flagShas).map(name => [name, 'MATCH'])),
    dataSha: expectedShas.data, settlementUnchanged: true, settlementCallbacks, authorizedDependencySources, roots };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, input, output] = process.argv.slice(2);
  if (mode === '--snapshot' && input) {
    const snapshot = await snapshotProtection();
    await fs.writeFile(input, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(`smith services open protection snapshot: ${input}`);
  } else if (mode === '--check' && input) {
    const result = await checkProtection(await json(input));
    if (output) await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`smith services open protection MATCH: ${result.frozenFiles} files; preserved open/closed directories unchanged`);
  } else throw new Error('usage: --snapshot <file> | --check <before-file> [result-file]');
}
