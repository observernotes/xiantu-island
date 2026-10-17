#!/usr/bin/env python3
"""Read-only protection verification; outputs belong only to this salvage window."""
from pathlib import Path
import datetime
import hashlib
import io
import json
import re
import subprocess
import sys
import tarfile

ROOT = Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_salvage_closed/audit'
BASELINE = '14d6de7b39b1aab0b31a12289172e6735986f263'
EXPECTED = {
    'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
    'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
    'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
    'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
    'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
    'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
    'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
}
CODE_EXPECTED = {
    'ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
    'EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
    'EnchantOpenFlag.ts': 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
    'data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
}
STRINGS_SHA = '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda'
ALLOWED_SOURCE = {'src/SalvageClosed.ts', 'src/SalvageOpenFlag.ts', 'src/v06p1-salvage-closed.test.ts'}
ALLOWED_DATA = {'data/balance/strings_zh.json'}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def hash_file(path):
    return sha(path.read_bytes())


def tree(base):
    return {str(p.relative_to(ROOT)): hash_file(p) for p in sorted(base.rglob('*')) if p.is_file()}


def compare(before, after, allowed=frozenset()):
    return [{'path': p, 'before': before.get(p), 'after': after.get(p)}
            for p in sorted(before.keys() | after.keys())
            if p not in allowed and before.get(p) != after.get(p)]


def find_gifts(value, found):
    if isinstance(value, dict):
        if 'gifts' in value:
            found.append(value['gifts'].get('enabled'))
        for child in value.values():
            find_gifts(child, found)
    elif isinstance(value, list):
        for child in value:
            find_gifts(child, found)


def main():
    interim = '--interim' in sys.argv
    before = json.loads((OUT / 'protected-before.json').read_text())
    frozen = []
    strings = []
    registration = []
    gifts = []
    for label, balance in [('shared', Path('/workspace/xiantu/balance')), ('snapshot', ROOT / 'data/balance')]:
        for name, expected in EXPECTED.items():
            actual = hash_file(balance / name)
            frozen.append({'root': label, 'file': str(balance / name), 'expected': expected,
                           'actual': actual, 'match': actual == expected})
        raw = (balance / 'strings_zh.json').read_bytes()
        parsed = json.loads(raw)
        strings.append({'root': label, 'file': str(balance / 'strings_zh.json'), 'sha256': sha(raw),
                        'keyCount': len(parsed), 'salvageClosedKeys': sorted(k for k in parsed if k.startswith('salvage.closed.')),
                        'match': sha(raw) == STRINGS_SHA and len(parsed) == 960
                                 and len([k for k in parsed if k.startswith('salvage.closed.')]) == 8})
        items = json.loads((balance / 'items.json').read_text())
        materials = json.loads((balance / 'materials.json').read_text())
        item = [row for row in items if row.get('id') == 'refine_stone']
        material = [row for row in materials if row.get('id') == 'refine_stone']
        effective = {row['id']: row for row in items + materials}['refine_stone']
        quantities = json.loads((balance / 'enhance.json').read_text())['salvage']
        mapped = (len(item) == len(material) == 1 and effective == material[0]
                  and effective.get('type') == 'material' and effective.get('enabled') is not False
                  and effective.get('placeholder') is not True and effective.get('qualityEnabled') is not True
                  and quantities == {'refineStonesByGrade': {'common': 1, 'fine': 2, 'spirit': 4, 'treasure': 8}})
        registration.append({'root': label, 'itemsRows': item, 'materialsRows': material, 'effectiveRecord': effective,
                             'salvageReadOnlyConfig': quantities, 'refineStoneMapped': mapped,
                             'meaning': 'Existing registration and effective ITEMS only; no production salvage authorization or transaction evidence.'})
        flags = []
        find_gifts(json.loads((balance / 'npcs.json').read_text()), flags)
        gifts.append({'root': label, 'count': len(flags), 'enabledValues': flags,
                      'pass': len(flags) == 10 and all(v is False for v in flags)})
    for name, expected in CODE_EXPECTED.items():
        actual = hash_file(ROOT / 'src' / name)
        frozen.append({'root': 'wt/dev/src', 'file': 'src/' + name, 'expected': expected,
                       'actual': actual, 'match': actual == expected})
    flags = {name.removesuffix('.ts'): bool(re.search(r'return true;', (ROOT / 'src' / name).read_text()))
             for name in ['ForgeOpenFlag.ts', 'EnhanceOpenFlag.ts', 'EnchantOpenFlag.ts']}
    flags['SalvageOpenFlag'] = bool(re.search(r'return true;', (ROOT / 'src/SalvageOpenFlag.ts').read_text()))
    flags['GAME_PHASE'] = int(re.search(r'export const GAME_PHASE = (\d+);', (ROOT / 'src/data.ts').read_text()).group(1))
    flag_pass = flags == {'ForgeOpenFlag': True, 'EnhanceOpenFlag': True, 'EnchantOpenFlag': True,
                          'SalvageOpenFlag': False, 'GAME_PHASE': 5}
    source_now = tree(ROOT / 'src')
    data_now = tree(ROOT / 'data')
    qa_now = {str(p.relative_to(ROOT)): hash_file(p)
              for d in sorted((ROOT / 'qa').glob('out_*'))
              if d.is_dir() and d.name != 'out_v06p1_salvage_closed'
              for p in sorted(d.rglob('*')) if p.is_file()}
    shared_now = {str(p): hash_file(p) for p in sorted(Path('/workspace/xiantu/balance').rglob('*.json')) if p.is_file()}
    pending_now = {p: hash_file(ROOT / p) if (ROOT / p).is_file() else None
                   for p in before['preexistingUntrackedFiles']}
    changes = {
        'sourceOutsideThreeAllowedAdditions': compare(before['sourceFiles'], source_now, ALLOWED_SOURCE),
        'dataOutsideExactStringsSnapshot': compare(before['dataFiles'], data_now, ALLOWED_DATA),
        'previousQaOutputs': compare(before['previousQaFiles'], qa_now),
        'sharedBalanceJson': compare(before['sharedBalanceFiles'], shared_now),
        'preexistingUntrackedFiles': compare(before['preexistingUntrackedFiles'], pending_now),
    }
    external_before = json.loads((OUT / 'external-protected-before.json').read_text())
    game_now = {str(p): hash_file(p) for p in sorted(Path('/workspace/xiantu/game/data').rglob('*')) if p.is_file()}
    tools_now = {}
    for base in [Path('/workspace/xiantu/balance/tools'), Path('/workspace/xiantu/qa/tools'),
                 Path('/workspace/xiantu/tools'), Path('/workspace/xiantu/scripts')]:
        if base.exists():
            tools_now.update({str(p): hash_file(p) for p in sorted(base.rglob('*')) if p.is_file()})
    changes['externalGameData'] = compare(external_before['gameDataFiles'], game_now)
    changes['sharedTools'] = compare(external_before['sharedToolFiles'], tools_now)
    archive = subprocess.check_output(['git', 'archive', BASELINE, 'src', 'data'], cwd=ROOT, stdin=subprocess.DEVNULL)
    baseline_tree = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as stream:
        for member in stream:
            if member.isfile():
                baseline_tree[member.name] = sha(stream.extractfile(member).read())
    baseline_current = {p: hash_file(ROOT / p) if (ROOT / p).is_file() else None for p in baseline_tree}
    baseline_changes = compare(baseline_tree, baseline_current)
    baseline_unauthorized = [row for row in baseline_changes if row['path'] not in ALLOWED_DATA]
    before_baseline = {p: before['sourceFiles'].get(p, before['dataFiles'].get(p)) for p in baseline_tree}
    before_baseline_unauthorized = [row for row in compare(baseline_tree, before_baseline)
                                    if row['path'] not in ALLOWED_DATA]
    passed = (all(row['match'] for row in frozen + strings)
              and all(row['refineStoneMapped'] for row in registration)
              and all(row['pass'] for row in gifts) and flag_pass
              and not any(changes.values()) and not baseline_unauthorized and not before_baseline_unauthorized
              and not external_before['gameDataVsOwnHeadMismatches'])
    doc = {'passed': passed, 'interim': interim, 'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'stdin': '/dev/null', 'frozen': frozen, 'strings': strings, 'flagsAndPhase': flags,
           'flagsAndPhasePass': flag_pass, 'gifts': gifts, 'registration': registration,
           'changesOutsideAllowlist': changes, 'unauthorizedDifferenceCount': sum(map(len, changes.values())),
           'baseline': {'head': BASELINE, 'trackedSourceDataFileCount': len(baseline_tree),
                        'trackedChanges': baseline_changes, 'unauthorizedTrackedChanges': baseline_unauthorized,
                        'beforeCaptureUnauthorizedTrackedChanges': before_baseline_unauthorized},
           'externalBaseline': {'gameHead': external_before['gameHead'],
                                'gameDataFileCount': len(game_now), 'sharedToolFileCount': len(tools_now),
                                'gameDataVsOwnCommittedHeadMismatches': external_before['gameDataVsOwnHeadMismatches'],
                                'gameStringsSha256': game_now['/workspace/xiantu/game/data/balance/strings_zh.json'],
                                'meaning': 'game data remains its own committed 14d6de7 baseline (952 strings); no write or synchronization authorized.'},
           'preservedCounts': {'sourceFilesBefore': len(before['sourceFiles']), 'dataFilesBefore': len(before['dataFiles']),
                               'previousQaFilesBefore': len(before['previousQaFiles']), 'sharedBalanceJsonBefore': len(shared_now),
                               'preexistingUntrackedFilesBefore': len(before['preexistingUntrackedFiles'])},
           'scope': 'Only independently checks read-only evidence and frozen boundaries; no snapshot/build/sync/release.'}
    prefix = 'protection-interim' if interim else 'protection-check'
    (OUT / (prefix + '.json')).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    (OUT / (prefix + '.log')).write_text(json.dumps({'passed': passed, 'frozenChecks': len(frozen),
        'stringsChecks': len(strings), 'unauthorizedDifferenceCount': doc['unauthorizedDifferenceCount'],
        'baselineUnauthorizedChanges': len(baseline_unauthorized), 'flagsAndPhase': flags}, ensure_ascii=False, indent=2) + '\n')
    if not interim:
        (OUT / 'protected-after.json').write_text(json.dumps({'sourceFiles': source_now, 'dataFiles': data_now,
            'previousQaFiles': qa_now, 'sharedBalanceFiles': shared_now, 'preexistingUntrackedFiles': pending_now,
            'externalGameDataFiles': game_now, 'sharedToolFiles': tools_now},
            ensure_ascii=False, indent=2) + '\n')
    print((OUT / (prefix + '.log')).read_text())
    raise SystemExit(0 if passed else 1)


if __name__ == '__main__':
    main()
