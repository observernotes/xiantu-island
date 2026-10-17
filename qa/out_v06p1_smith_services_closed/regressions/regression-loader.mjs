// Exact test expectation adaptations only. Never intercept a product-module URL.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const out = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(out, '../../..');
const config = JSON.parse(await fs.readFile(path.join(out, 'pinned-inputs.json'), 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const helper = pathToFileURL(path.join(out, 'compat-proof.mjs')).href;
const additions = ['EquipInstBinding.ts','EquipInstReadonly.ts','SmithServices.ts','v06p1-smith-services-closed.test.ts'];
const imports = `\nimport { stripSmithKeys, stripAllLaterKeys, restorePreAttrUi, historicalExpected } from '${helper}';\n`;
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.startsWith(pathToFileURL(path.join(root, 'scripts') + path.sep).href)) return result;
  const file = 'scripts/' + path.basename(fileURLToPath(url));
  if (!config.pins[file]) return result;
  const original = String(result.source);
  assert.equal(hash(original), config.pins[file], file + ' exact pinned original test bytes');
  let source = original; const changes = [];
  const replace = (label, before, after, expected) => {
    const count = source.split(before).length - 1;
    if (expected !== undefined) assert.equal(count, expected, file + ': ' + label + ' exact occurrences');
    if (!count) return;
    source = source.split(before).join(after); changes.push({label,before,after,occurrences:count});
  };
  const name = path.basename(file, '.mjs');
  if (name === 'v06p1-attr-ui-soft-open-output') {
    replace('all attr-ui evidence redirected into this window',
      'return path.join(root, `qa/out_v06p1_attr_ui_soft_${tip}`, suite);',
      `return path.join(${JSON.stringify(out)}, 'v06p1-attr-ui-' + suite);`, 1);
  } else {
    source = imports + source;
    if (name === 'v06p1-salvage-soft-open-compat-proof') {
      replace('restore authorized suffixes before existing salvage history proof',
        'export function stripSalvageClosedAddition(raw, eq = strictEq) {',
        'export function stripSalvageClosedAddition(raw, eq = strictEq) {\n  raw = stripAllLaterKeys(raw);',1);
      replace('prove and restore pre-attr-ui bytes before original salvage proof',
        'export function stripSalvageOpenProgress(source, eq = strictEq) {',
        'export function stripSalvageOpenProgress(source, eq = strictEq) {\n  source = restorePreAttrUi(source);',1);
      replace('current disk strings use1013 SHA; historical960 proof remains',
        ')), current960, `${mode} 分解字符串冻结 SHA`);',
        `)), '${config.strings1013}', \`\${mode} 分解字符串冻结 SHA\`);`,1);
    } else {
      if (name === 'v06p1-attr-ui-closed-test') {
        replace('current frozen strings1013 SHA',config.strings970,config.strings1013,1);
        replace('current key count1013','eq(Object.keys(strings).length, 970,','eq(Object.keys(strings).length, 1013,',1);
        replace('existing970 suffix proof after exact smith43 restoration',
          "const text = await fs.readFile(stringsFile, 'utf8'), strings = JSON.parse(text);",
          "const rawCurrent = await fs.readFile(stringsFile, 'utf8'), text = stripSmithKeys(rawCurrent), strings = JSON.parse(rawCurrent);",1);
      } else {
        replace('current strings1013 SHA',config.strings960,config.strings1013);
        replace('current strings key count1013',', 960,',', 1013,');
        replace('shared/wt1013; game historical952 preserved',"mode === 'game' ? 952 : 960","mode === 'game' ? 952 : 1013");
      }
      if (name === 'v06p1-enchant-soft-open-compat-proof') {
        // Its currentShas targets current strings; historical stripping is delegated to the salvage proof above.
        replace('game prior attr-ui snapshot970 is frozen independently',
          "'game:balance/strings_zh.json': '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9'",
          "'game:balance/strings_zh.json': '" + config.strings970 + "'",1);
      } else {
        replace('game prior attr-ui snapshot970 SHA; current shared/snapshot1013',
          '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9',config.strings970);
        replace('game historical snapshot970 key count',"mode === 'game' ? 952 : 1013","mode === 'game' ? 970 : 1013");
        replace('game historical snapshot970 key count','eq(Object.keys(JSON.parse(gameStrings)).length, 952,','eq(Object.keys(JSON.parse(gameStrings)).length, 970,');
      }
      if (['v06p1-attr-ui-binding-success-test','v06p1-attr-ui-map-api-test'].includes(name)) {
        replace('user-authorized current worktree',"'/workspace/xiantu/wt/feat/ui-attr-inst'",JSON.stringify(root),1);
        replace('user-authorized current dev branch',"'feat/ui-attr-inst'","'dev'",1);
        if(name === 'v06p1-attr-ui-map-api-test') replace('prior authorized attr-ui display integration kept at exact current bytes',
          "await guard(path.join(root, file), sha(git('show', `${baseline}:${file}`)));",
          "await guard(path.join(root, file), historicalExpected(file, sha(git('show', `${baseline}:${file}`))));",1);
      }
      if(name === 'v06d-closed-test') replace('game970 equals current1013 after exact authorized smith43-only subtraction',
        "eq(gameStrings, stripSalvageClosedAddition(sharedBytes.get(name).toString('utf8'), eq),",
        "eq(gameStrings, stripSmithKeys(sharedBytes.get(name).toString('utf8')),",1);
      if (['v06p1-forge-closed-test','v06p1-enhance-closed-test','v06p1-market-closed-test'].includes(name)) {
        replace('exact authorized src additions in historical inventory',
          '...salvageSourceNames].sort()',`...salvageSourceNames, ...${JSON.stringify(additions)}].sort()`,1);
        replace('new service adapter and closed-test consumer allowlist',
          '[...enchantSourceNames, ...salvageSourceNames].includes(name)',
          `[...enchantSourceNames, ...salvageSourceNames, 'EquipInstReadonly.ts', 'SmithServices.ts', 'v06p1-smith-services-closed.test.ts'].includes(name)`,1);
        replace('earlier attr-ui panel edits retain current exact SHA in old manifest',
          'for (const [name, expected] of Object.entries(sourceBefore)) {',
          'for (const [name, originalExpected] of Object.entries(sourceBefore)) {\n    const expected = historicalExpected(name, originalExpected);');
        if (name === 'v06p1-market-closed-test') {
          replace('earlier attr-ui panel edits retain current exact SHA in old manifest',
            'for (const [key, expected] of Object.entries(baseline)) {',
            'for (const [key, originalExpected] of Object.entries(baseline)) {\n    const expected = historicalExpected(key, originalExpected);',1);
        }
      }
      if (['v06p1-forge-open-test','v06p1-enhance-open-test'].includes(name)) {
        replace('authorized new smith adapter Gate consumer',
          '...salvageSourceNames].includes(file)',
          "...salvageSourceNames, 'SmithServices.ts', 'v06p1-smith-services-closed.test.ts'].includes(file)",1);
      }
      if (name === 'v06p1-enhance-open-test') {
        const runtimeFile = 'src/v06p1-enhance-open.test.ts';
        const before = "eq(Object.keys(strings).length, 960, '正式strings快照960键含_meta，原944键完整保留');";
        const after = "eq(Object.keys(strings).length, 1013, '当前strings1013键含_meta，原944键完整保留');";
        const block = `async transform(source, id) {\n        if (id === path.join(root, '${runtimeFile}')) {\n          const originalSha = hash(source);\n          assert.equal(originalSha, '${config.pins[runtimeFile]}', 'pinned runtime test bytes');\n          const before = ${JSON.stringify(before)}, after = ${JSON.stringify(after)};\n          assert.equal(source.split(before).length - 1, 1);\n          const adapted = source.replace(before, after);\n          await fs.writeFile(path.join(out, 'runtime-test-source-adaptation.json'), JSON.stringify({path:'${runtimeFile}',originalSha,adaptedSha:hash(adapted),before,after,occurrences:1,diskWritten:false,productModuleTransformations:[],businessAssertionsChanged:false}) + '\\n');\n          return adapted;\n        }`;
        replace('only runtime test key-count assertion adapted; production modules untouched',
          'transform(source, id) {',block,1);
      }
    }
  }
  await fs.mkdir(path.join(out, 'adaptations'), {recursive:true});
  await fs.writeFile(path.join(out, 'adaptations',name+'.json'),JSON.stringify({
    file,originalSha:hash(original),pinnedOriginalSha:config.pins[file],adaptedSha:hash(source),changes,
    productModuleTransformations:[],diskWritten:false,businessAssertionsChanged:false,
    policy:'Pinned test-only historical strings SHA/count/inventory and prior attr-ui byte proof; actual Vite SSR product modules use current disk.'
  },null,2)+'\n');
  return {...result,source};
}
