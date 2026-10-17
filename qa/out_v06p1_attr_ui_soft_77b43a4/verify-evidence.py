#!/usr/bin/env python3
"""Verify this window's evidence and frozen bytes; no product writes or overrides."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
SHARED = Path('/workspace/xiantu')
BASELINE = '431743577dbcf58c738e7ee5ba6fc6aeccd1c11f'
FLAGS = {
    'Forge': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
    'Enhance': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
    'Enchant': 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
    'Salvage': '69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3',
}
ENHANCE = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954'
STRINGS = 'ae51319b82a6486cc7f3d9b26c5ae89719e23c32ff9debdcfbb86ef7b5aea08b'
CHECKS = ['typecheck', 'closed', 'binding-success', 'map-api', 'map-services',
          'equip', 'appearance', 'datalint-shared', 'datalint-snapshot', 'diff-check']


def read(file):
    return json.loads(file.read_text())


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, stdin=subprocess.DEVNULL)


assert str(ROOT) == '/workspace/xiantu/wt/feat/ui-attr-inst'
assert git('branch', '--show-current').decode().strip() == 'feat/ui-attr-inst'
tip = read(OUT / 'implementation-tip.json')['implementationTip']
assert git('merge-base', BASELINE, tip).decode().strip() == BASELINE
for file, expected in read(OUT / 'tested-source.json').items():
    assert sha(ROOT / file) == expected, file
    assert hashlib.sha256(git('show', f'{tip}:{file}')).hexdigest() == expected, file

results = {name: read(OUT / 'logs' / f'{name}.result.json') for name in CHECKS}
assert all(row['exitCode'] == 0 and row['passed'] and row['stdin'] == '/dev/null'
           for row in results.values())
closed = read(OUT / 'closed/evidence.json')
binding = read(OUT / 'binding-success/evidence.json')
mapping = read(OUT / 'map-api/evidence.json')
services = read(OUT / 'map-services/services-evidence.json')
for row in [closed, binding, mapping, services]:
    assert row['passed'] and row['softOpenedAttrUi'] is True
    assert row['released'] is False and row['newOpenFlag'] is False
    assert row['fixtureInstancesProductionFallback'] is False
assert closed['assertions'] >= 1592
assert set(closed['cases']) == {f'C{i:02}' for i in range(1, 11)}
assert all(row['executed'] and row['passed'] and row['evidenceKeys']
           for row in closed['cases'].values())
assert [closed[k] for k in ['localStorageWrites', 'indexedDbOpens', 'sentinelCalls', 'serviceCalls',
                           'readOnlyFullSaveDelta', 'publicProgressFieldDelta']] == [0] * 6
for field in ['formalApiWired', 'attrUiOpenPass', 'eSlotToInstanceRefApiExists',
              'iRowToInstanceRefApiExists', 'readonlyZeroWrites', 'foreignPassthrough',
              'closedPriorityUnavailable', 'missingBindingAndAggregateRowNoInstance']:
    assert binding[field] is True, field
for field in ['eSlotToInstanceRefApiExists', 'iRowToInstanceRefApiExists',
              'displayResolversMatchFormalApi', 'multipleSameItemIdNotImpersonated',
              'countOneNotImpersonated', 'oldSaveNoBackfill', 'readonlyZeroWrites']:
    assert mapping[field] is True, field
assert mapping['mappingStrategy'] == 'explicit_position_binding_only_no_item_id_inference'
for mode in ['shared', 'snapshot']:
    graphs = [row for row in binding['evidence'] if row['dataMode'] == mode]
    assert len(graphs) == 2
    for row in graphs:
        assert row['passed'] and row['displayZeroWrites']
        expected = 0 if row['graph'] == 'formal-source' else 1
        assert row['flagLoads'] == {'Enhance': expected, 'Enchant': expected}
    cgraphs = [row for row in closed['evidence']
               if row.get('suite') == 'ssr-graph' and row['dataMode'] == mode]
    assert len(cgraphs) == 3
    for row in cgraphs:
        expected = int(row['memoryClosed'])
        assert row['passed'] and row['flagLoads'] == {'Enhance': expected, 'Enchant': expected}
        assert row['initialEnhanceOpen'] is (not row['memoryClosed'])
        assert row['initialEnchantOpen'] is (not row['memoryClosed'])

before = read(OUT / 'protected-before.json')
after = {file: sha(Path(file)) for file in before}
assert before == after, 'protected bytes changed'
protected_roots = [ROOT / 'src', ROOT / 'data/balance', ROOT / 'data/maps',
                   SHARED / 'balance', SHARED / 'maps', SHARED / 'game/data/balance',
                   SHARED / 'game/data/maps', ROOT / 'qa',
                   SHARED / 'qa/out_v06p1_attr_ui_closed_a3f0c19',
                   SHARED / 'qa/out_v06p1_attr_ui_open_4317435']
current = set()
for base in protected_roots:
    for file in base.rglob('*'):
        if file.is_file() and OUT not in file.parents:
            current.add(str(file))
assert current == set(before), 'unexpected protected file additions/removals'
write('protected-after.json', after)

frozen = {}
for name, expected in FLAGS.items():
    file = ROOT / f'src/{name}OpenFlag.ts'
    assert sha(file) == expected
    assert re.search(r'export function is\w+OpenForFixture\(\): boolean \{ return true; \}', file.read_text())
    frozen[str(file)] = expected
for data_root in [SHARED, ROOT / 'data']:
    for name in ['enhance', 'strings_zh', 'recipes', 'materials', 'items', 'npcs',
                 'life_skills', 'enhance_protect_charm']:
        file = data_root / f'balance/{name}.json'
        expected = ENHANCE if name == 'enhance' else STRINGS if name == 'strings_zh' else \
            hashlib.sha256(git('show', f'{BASELINE}:data/balance/{name}.json')).hexdigest()
        assert sha(file) == expected, file
        frozen[str(file)] = expected
    assert len(read(data_root / 'balance/strings_zh.json')) == 970
    npcs = read(data_root / 'balance/npcs.json')
    npcs = npcs.get('npcs', []) if isinstance(npcs, dict) else npcs
    gifts = [row['affinity']['gifts'] for row in npcs if row.get('affinity', {}).get('gifts')]
    assert len(gifts) == 10 and all(row['enabled'] is False for row in gifts)
    assert all('services' not in row for row in npcs if row['id'] == 'smith_ou')
assert re.search(r'GAME_PHASE\s*=\s*5\b', (ROOT / 'src/data.ts').read_text())
readonly = (ROOT / 'src/EquipInstReadonly.ts').read_text()
assert 'return resolveFormalEquipSlotBinding(prog, slot);' in readonly
assert 'return resolveFormalInventoryEquipBinding(prog, row);' in readonly
for name in ['src/EquipInstReadonly.ts', 'src/EquipPanel.ts', 'src/InventoryPanel.ts', 'src/scenes/GameScene.ts']:
    assert 'fixtureInstances' not in (ROOT / name).read_text()
protection = {'passed': True, 'protectedFiles': len(before), 'unauthorizedDifferences': [],
              'protectedFileSetMatch': True, 'fourFlagsMatch': True, 'SalvageOpenFlag': True,
              'enhanceMatch': True, 'strings970Match': True, 'frozenBaselineMatches': frozen,
              'priorClosedAndOpenEvidenceUnchanged': True, 'allProductSourcesUnchanged': True}
write('protection-check.json', protection)

hard_gates = {
    'softOpenedAttrUi': True, 'attrUiOpenPass': binding['attrUiOpenPass'],
    'formalApiWired': binding['formalApiWired'],
    'eSlotToInstanceRefApiExists': mapping['eSlotToInstanceRefApiExists'],
    'iRowToInstanceRefApiExists': mapping['iRowToInstanceRefApiExists'],
    'mappingStrategy': mapping['mappingStrategy'], 'newOpenFlag': False,
    'fixtureInstancesProductionFallback': False, 'released': False,
    'fourFlagsMatch': True, 'SalvageOpenFlag': True, 'enhanceMatch': True,
    'strings970Match': True, 'gifts0': True, 'giftsTrue': 0, 'giftsFalse': 10,
    'GAME_PHASE': 5, 'closedAssertions': closed['assertions'],
}
write('evidence.json', {
    'passed': True, 'verdict': 'PASS', 'role': '炼器程序自检；不代执法 soft smoke',
    'implementationTip': tip, 'baselineTip': BASELINE, **hard_gates,
    'formalGraphs': [row for row in binding['evidence'] if row['graph'] == 'formal-source'],
    'memoryClosedGraphs': [row for row in binding['evidence'] if row['graph'] == 'memory-closed'],
    'closedCases': closed['cases'], 'displayWrites': 0, 'displayServiceCalls': 0,
    'servicePreparationIsIsolatedTestSetup': True, 'fixtureIsNotFormalOrReleaseEvidence': True,
    'priorIndependentOpenEvidence': 'qa/out_v06p1_attr_ui_open_4317435/',
    'priorIndependentClosedEvidence': 'qa/out_v06p1_attr_ui_closed_a3f0c19/',
    'sourceAudit': 'formal resolver delegation preserved; all product sources SHA MATCH',
    'protection': protection, 'suiteEvidence': ['closed/evidence.json', 'binding-success/evidence.json',
                                             'map-api/evidence.json', 'map-services/services-evidence.json'],
    'legacyEnhanceEnchantClosedRerun': False,
    'legacyRegressionNote': 'Historical runners require strings960; no compatibility bypass. Fresh map-services verifies existing Gate behavior with strings970.',
    'releaseAuthorization': 'none; expected v0.6.13 needs a separate order',
})
write('validation.json', {
    'passed': True, 'verdict': 'PASS', 'implementationTip': tip, **hard_gates,
    'checks': results, 'totalAssertions': sum(row['assertions'] or 0 for row in results.values()),
    'protectedFiles': len(before), 'unauthorizedDifferences': 0,
    'priorEvidenceUnchanged': True, 'snapshotBuildSyncReleasePagesExecuted': False,
    'independentSoftSmokeExecuted': False,
})
(OUT / 'PASS').write_text('PASS — 炼器 soft-open preamble 自检；交执法 soft smoke；≠进包≠发版\n')
print(json.dumps({'passed': True, 'implementationTip': tip, **hard_gates,
                  'protectedFiles': len(before), 'unauthorizedDifferences': 0}, ensure_ascii=False))
