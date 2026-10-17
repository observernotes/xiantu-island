import hashlib, json, pathlib, re, subprocess, sys

ROOT = pathlib.Path('/workspace/xiantu/wt/dev')
OUT = ROOT / 'qa/out_v06p1_salvage_open_fixture'
BASE = '29ddb7f54deb6c1439397b5d2e7c438639ceff5c'
ALLOWED = {
    'src/Progress.ts', 'src/SalvageOpenFlag.ts', 'src/SalvageGate.ts', 'src/SalvageProgress.ts',
    'src/v06p1-salvage-open.test.ts', 'scripts/v06p1-salvage-open-test.mjs', 'package.json',
    'reports/炼器阁/V06P1_SALVAGE_OPEN_FIXTURE_HANDOFF.md',
    'reports/炼器阁/V06P1_SALVAGE_OPEN_FIXTURE_RESULT.md', 'status/炼器阁.md',
}
FROZEN = {
    'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
    'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
    'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
    'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
    'strings_zh.json': '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda',
    'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
    'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
    'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
}
SOURCES = {
    'ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
    'EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
    'EnchantOpenFlag.ts': 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
    'SalvageClosed.ts': '287a55d7025018629235d45ca4386d75134fc39362532a4c47bf121b574ae211',
    'data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def frozen():
    rows = []
    for folder in [ROOT / 'data/balance', pathlib.Path('/workspace/xiantu/balance')]:
        for name, expected in FROZEN.items():
            p = folder / name
            rows.append({'path': str(p), 'expected': expected, 'actual': sha(p), 'MATCH': sha(p) == expected})
    for name, expected in SOURCES.items():
        p = ROOT / 'src' / name
        rows.append({'path': str(p), 'expected': expected, 'actual': sha(p), 'MATCH': sha(p) == expected})
    assert all(r['MATCH'] for r in rows), rows
    return rows

if sys.argv[1] == 'before':
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT).decode().split('\0')
    paths = {ROOT / n for n in names if n and not n.startswith('qa/out_v06p1_salvage_open_fixture/')}
    paths |= {p for p in pathlib.Path('/workspace/xiantu/balance').rglob('*') if p.is_file()}
    before = {str(p): sha(p) for p in sorted(paths) if p.is_file()}
    assert sha(ROOT / 'src/SalvageOpenFlag.ts') == '9cfa606a5fed71451cab6675bde0ce3ffad2dd780cb502e4d842d54beeeff1d8'
    write('protected-before.json', {'baseline': BASE, 'files': before, 'frozen': frozen()})
    print('protection before:', len(before), 'files, frozen MATCH')
else:
    before = json.loads((OUT / 'protected-before.json').read_text())
    unexpected = []
    for name, expected in before['files'].items():
        p = pathlib.Path(name)
        rel = str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else None
        if rel in ALLOWED: continue
        if not p.is_file() or sha(p) != expected: unexpected.append(name)
    assert not unexpected, unexpected
    flag = (ROOT / 'src/SalvageOpenFlag.ts').read_text()
    assert re.sub(r'/\*\*[\s\S]*?\*/\s*', '', flag) == 'export function isSalvageOpenForFixture(): boolean { return false; }\n'
    current = (ROOT / 'src/Progress.ts').read_text()
    allowed_lines = [
        "import { isValidSalvageProgress, type SalvageProgress } from './SalvageProgress';\n",
        "  if (has('salvage') && !isValidSalvageProgress(saved.salvage)) return false;\n",
        '  /** 仅 SSR 开态夹具完整提交产生；缺字段旧档保持 undefined，读档不补做。 */\n  salvage: SalvageProgress | undefined = undefined;\n',
    ]
    for line in allowed_lines:
        assert current.count(line) == 1, line
        current = current.replace(line, '', 1)
    baseline = subprocess.check_output(['git', 'show', BASE + ':src/Progress.ts'], cwd=ROOT).decode()
    assert current == baseline, 'Progress must differ by only exact structural authorized lines'
    rows = frozen()
    write('protection-check.json', {'passed': True, 'baseline': BASE, 'protectedFileCount': len(before['files']),
        'unauthorizedDifferences': unexpected, 'frozen': rows, 'SalvageOpenFlag': False,
        'SalvageOpenFlagCommentOnly': True, 'ProgressExactStructuralChangesOnly': True,
        'EnhanceOpenFlag': True, 'EnchantOpenFlag': True, 'GAME_PHASE': 5,
        'oldQaAndPendingPreserved': True})
    print('protection after: MATCH,', len(before['files']), 'files, no unauthorized differences')
