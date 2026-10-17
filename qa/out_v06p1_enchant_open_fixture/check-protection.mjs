// 本窗独立只读审计；不修改任何业务文件。命令 stdin 均忽略。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../..');
const baselineTip = '2ad6367f4b5fd70caa01e8cb1df392db3971fb7d';
const closedTip = '5bee47d7b81ed22ed5c28719d9c06190ea817c13';
const shared = '/workspace/xiantu';
const hash = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
};
const read = file => fs.readFile(path.join(root, file));
const checks = [];
const check = (id, actual, expected = true) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ id, passed, actual, expected });
  return passed;
};
const frozenTables = {
  'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'strings_zh.json': '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
  'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
};
const frozenSources = {
  'src/ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  'src/EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  'src/data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
  'src/EnchantClosed.ts': hash(git('show', `${closedTip}:src/EnchantClosed.ts`)),
};
const baselineSourcePaths = git('ls-tree', '-r', '-z', '--name-only', baselineTip, 'src', 'data').toString().split('\0').filter(Boolean)
  .filter(file => !['src/EnchantOpenFlag.ts', 'src/Progress.ts'].includes(file));
const baselineHashes = Object.fromEntries(baselineSourcePaths.map(file => [file, hash(git('show', `${baselineTip}:${file}`))]));
const baseline = { baselineTip, closedTip, authoritativeFrozenTables: frozenTables, authoritativeFrozenSources: frozenSources,
  baselineHashes, EnchantOpenFlag: false, EnhanceOpenFlag: true, ForgeOpenFlag: true,
  sharedDataRoot: shared, snapshotDataRoot: path.join(root, 'data'),
  scope: '本窗=附灵开态夹具全表；不授权 soft-open、release、进包、snapshot/build/sync。',
  commandStdin: '/dev/null', businessSourcesReadOnlyExcept: ['src/Progress.ts 最小结构承载', 'src/EnchantOpenFlag.ts 仅注释'] };
const baselinePath = path.join(out, 'protection-baseline.json');
try { check('baseline-record-stable', JSON.parse(await fs.readFile(baselinePath, 'utf8')), baseline); }
catch (error) { if (error.code !== 'ENOENT') throw error; await fs.writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`); }

check('working-directory', root, '/workspace/xiantu/wt/dev');
check('branch-dev', git('branch', '--show-current').toString().trim(), 'dev');
check('baseline-is-ancestor', spawnSync('git', ['merge-base', '--is-ancestor', baselineTip, 'HEAD'],
  { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] }).status, 0);
for (const [file, expected] of Object.entries(frozenSources)) check(`frozen:${file}`, hash(await read(file)), expected);
for (const [file, expected] of Object.entries(baselineHashes)) check(`baseline-byte-match:${file}`, hash(await read(file)), expected);
for (const [mode, dataRoot] of [['shared', shared], ['snapshot', path.join(root, 'data')]]) {
  for (const [name, expected] of Object.entries(frozenTables)) check(`${mode}:frozen:${name}`, hash(await fs.readFile(path.join(dataRoot, 'balance', name))), expected);
  const json = async name => JSON.parse(await fs.readFile(path.join(dataRoot, 'balance', name), 'utf8'));
  const strings = await json('strings_zh.json');
  check(`${mode}:strings-count`, Object.keys(strings).length, 952);
  const npcs = await json('npcs.json'), npcRows = npcs.npcs ?? npcs;
  const gifts = npcRows.filter(row => row.affinity?.gifts);
  check(`${mode}:gifts-count`, gifts.length, 10);
  check(`${mode}:gifts-ten-false`, gifts.every(row => row.affinity.gifts.enabled === false));
  const smith = npcRows.find(row => row.id === 'smith_ou');
  check(`${mode}:smith-has-no-services`, !!smith && !Object.hasOwn(smith, 'services'));
  const items = await json('items.json'), materials = await json('materials.json');
  const item = (items.items ?? items).filter(row => row.id === 'beast_core');
  const material = (materials.materials ?? materials).filter(row => row.id === 'beast_core');
  check(`${mode}:beast-core-item`, item, [{ id: 'beast_core', name: '妖兽内丹', phase: 5, icon: 'icon_beast_core' }]);
  check(`${mode}:beast-core-material-phase`, material.map(row => [row.id, row.type, row.phase]), [['beast_core', 'material', 5]]);
  const enhance = await json('enhance.json');
  check(`${mode}:enchant-unique-values`, enhance.enchant, { elementDamage: 0.05, sameRootBonus: 0.05, cost: { stones: 2000, materials: [{ item: 'beast_core', count: 1 }] } });
  check(`${mode}:no-enhance-enchant-table`, await fs.stat(path.join(dataRoot, 'balance/enhance_enchant.json')).then(() => false, error => error.code === 'ENOENT'));
}

const flagText = (await read('src/EnchantOpenFlag.ts')).toString();
const flagAst = ts.createSourceFile('EnchantOpenFlag.ts', flagText, ts.ScriptTarget.Latest, true);
check('enchant-flag-no-import', flagAst.statements.filter(ts.isImportDeclaration).length, 0);
const flagFns = flagAst.statements.filter(ts.isFunctionDeclaration);
check('enchant-flag-only-function', flagFns.map(fn => fn.name?.text), ['isEnchantOpenForFixture']);
check('enchant-flag-no-parameters', flagFns[0]?.parameters.length, 0);
check('enchant-flag-body-frozen-false', flagFns[0]?.body?.getText(flagAst).replace(/\s/gu, ''), '{returnfalse;}');
check('enchant-flag-only-existing-statements', flagAst.statements.length, 1);
const dataText = (await read('src/data.ts')).toString();
check('GAME_PHASE-five', /export\s+const\s+GAME_PHASE\s*=\s*5\s*;/u.test(dataText));

// 删除本窗最小新增的结构行后，Progress 必须与基线逐字节一致；既有承载路径不可改写。
const progressBefore = git('show', `${baselineTip}:src/Progress.ts`).toString();
const progressAfter = (await read('src/Progress.ts')).toString();
let progressStripped = progressAfter;
const progressRemoved = [];
for (const regex of [
  /^import \{ isValidEnchantProgress, type EnchantProgress \} from '\.\/EnchantProgress';\n/gmu,
  /^  if \(has\('enchant'\) && !isValidEnchantProgress\(saved\.enchant\)\) return false;\n/gmu,
  /^  \/\*\*[^\n]*\*\/\n(?=  enchant: EnchantProgress \| undefined = undefined;\n)/gmu,
  /^  enchant: EnchantProgress \| undefined = undefined;\n/gmu,
]) progressStripped = progressStripped.replace(regex, match => { progressRemoved.push(match.trim()); return ''; });
check('Progress-minimum-authorized-additions-only', progressStripped, progressBefore);
check('Progress-authorized-addition-count', progressRemoved.length <= 4);

const scene = (await read('src/scenes/GameScene.ts')).toString();
check('GameScene-no-enchant-or-fixture-injection', !/EnchantClosed|EnchantOpenFlag|EnchantGate|fixtureInstances/u.test(scene));
const packageBefore = JSON.parse(git('show', `${baselineTip}:package.json`).toString());
const packageAfter = JSON.parse((await read('package.json')).toString());
const enchantScript = packageAfter.scripts['test:v06p1-enchant-open'];
delete packageAfter.scripts['test:v06p1-enchant-open'];
check('package-only-open-test-script-added', packageAfter, packageBefore);
check('package-open-test-script-shape', enchantScript === undefined || /^timeout 180s node scripts\/v06p1-enchant-open-test\.mjs$/u.test(enchantScript));

const result = { passed: checks.every(row => row.passed), assertions: checks.length, baselineTip, closedTip,
  frozenByteMatch: checks.filter(row => /frozen:|baseline-byte-match:/u.test(row.id)).every(row => row.passed),
  EnchantOpenFlag: false, softOpenedEnchant: false, released: false, protectCharmSoftOpenPreserved: true,
  EnhanceOpenFlagPreserved: true, beastCoreMapped: true, GAME_PHASE: 5, stringsKeys: 952,
  giftsDisabled: 10, smithServicesAdded: false, progressAuthorizedAdditions: progressRemoved,
  frozenSourceShas: frozenSources, frozenTableShas: frozenTables,
  checks: checks.map(row => row.passed ? { id: row.id, passed: true } : row) };
await fs.writeFile(path.join(out, 'protection-check.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ passed: result.passed, assertions: result.assertions,
  frozenByteMatch: result.frozenByteMatch, failed: checks.filter(row => !row.passed).map(row => row.id),
  EnchantOpenFlag: false, softOpenedEnchant: false, released: false }));
process.exitCode = result.passed ? 0 : 1;
