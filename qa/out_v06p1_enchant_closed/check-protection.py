#!/usr/bin/env python3
"""只读保护检查；本窗仅允许三表快照、新附灵模块和专项测试变化。"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path('/workspace/xiantu/wt/dev')
SHARED = Path('/workspace/xiantu')
OUT = ROOT / 'qa/out_v06p1_enchant_closed'
FROZEN = {
    'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
    'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
    'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
    'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
    'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
}
SOURCE = {
    'ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
    'EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
    'data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
}
TARGETS = {
    'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
    'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
    'strings_zh.json': '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9',
}
ALLOWED = {str(ROOT/'data/balance'/n) for n in TARGETS} | {
    str(ROOT/n) for n in ['src/EnchantClosed.ts', 'src/EnchantOpenFlag.ts',
        'src/v06p1-enchant-closed.test.ts', 'scripts/v06p1-enchant-closed-test.mjs']}

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None

def write(name, data):
    (OUT/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def capture():
    files = {}
    for base in [ROOT/'src', ROOT/'scripts', ROOT/'data', SHARED/'balance', SHARED/'maps',
            SHARED/'game/src', SHARED/'game/data']:
        for p in sorted(base.rglob('*')):
            if p.is_file() and p.suffix != '.pyc': files[str(p)] = sha(p)
    return files

def prior():
    # 全部既有 QA，包括未跟踪文件；启动中的 Codex 日志仅引用，不作为静态旁证。
    return {str(p):sha(p) for p in sorted((ROOT/'qa').rglob('*'))
        if p.is_file() and not p.is_relative_to(OUT)}

def compare(before, after):
    return [{'path':n, 'before':before.get(n), 'after':after.get(n)}
        for n in sorted(before.keys() | after.keys()) if before.get(n) != after.get(n)]

def boundary(snapshot_required):
    frozen = {}
    for base in [SHARED, ROOT/'data', SHARED/'game/data']:
        for n,h in FROZEN.items(): frozen[str(base/'balance'/n)] = dict(expected=h, actual=sha(base/'balance'/n))
    for base in [ROOT/'src', SHARED/'game/src']:
        for n,h in SOURCE.items(): frozen[str(base/n)] = dict(expected=h, actual=sha(base/n))
    for row in frozen.values(): row['match'] = row['expected'] == row['actual']
    targets = {str(base/'balance'/n):dict(expected=h, actual=sha(base/'balance'/n))
        for base in [SHARED, ROOT/'data'] for n,h in TARGETS.items()}
    for row in targets.values(): row['match'] = row['expected'] == row['actual']
    npcs = json.loads((ROOT/'data/balance/npcs.json').read_text())
    gifts = []
    def walk(v):
        if isinstance(v,dict):
            for k,x in v.items():
                if k == 'gifts': gifts.append(x.get('enabled'))
                walk(x)
        elif isinstance(v,list):
            for x in v: walk(x)
    walk(npcs)
    strings = {str(base):len(json.loads((base/'balance/strings_zh.json').read_text())) for base in [SHARED, ROOT/'data']}
    phase = bool(re.search(r'GAME_PHASE\s*=\s*5\b',(ROOT/'src/data.ts').read_text()))
    passed = all(r['match'] for r in frozen.values()) and phase and len(gifts)==10 and all(x is False for x in gifts)
    if snapshot_required: passed = passed and all(r['match'] for r in targets.values()) and all(n==952 for n in strings.values())
    else: passed = passed and all(r['match'] for n,r in targets.items() if n.startswith(str(SHARED/'balance')))
    return dict(passed=passed,frozen=frozen,targets=targets,stringsKeys=strings,gifts=gifts,GAME_PHASE=5 if phase else None)

if sys.argv[1:] == ['before']:
    assert not (OUT/'protected-before.json').exists(), '不能覆盖写前证据'
    write('protected-before.json',capture())
    write('prior-evidence-before.json',prior())
    result = boundary(False)
    write('boundary-before.json',result)
    write('status-before.json', dict(encoding='utf-8', sha256=sha(ROOT/'status/炼器阁.md'), text=(ROOT/'status/炼器阁.md').read_text()))
    (OUT/'initial-status.log').write_bytes(subprocess.check_output(['git','status','--short'],cwd=ROOT,stdin=subprocess.DEVNULL))
    def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT,stdin=subprocess.DEVNULL,text=True).strip()
    write('initial-git.json',dict(head=git('rev-parse','HEAD'),originDev=git('rev-parse','origin/dev'),branch=git('branch','--show-current'),
        fetchPullExit=0,fetchPull='git fetch && git pull --ff-only origin dev',stdin='/dev/null'))
else:
    after, old = capture(), prior()
    differences = compare(json.loads((OUT/'protected-before.json').read_text()),after)
    unauthorized = [r for r in differences if r['path'] not in ALLOWED]
    prior_delta = compare(json.loads((OUT/'prior-evidence-before.json').read_text()),old)
    write('protected-after.json',after)
    write('prior-evidence-after.json',old)
    result = boundary(True)
    result.update(authorizedDifferences=[r for r in differences if r['path'] in ALLOWED],
        unauthorizedDifferences=unauthorized,priorEvidenceDifferences=prior_delta,
        priorEvidenceFiles=len(old), protectedFiles=len(after),
        notRun=['snapshot','build','sync','release','Pages'],protectCharmSoftOpenPreserved=not prior_delta)
    result['passed'] = result['passed'] and not unauthorized and not prior_delta
    write('protection-check.json',result)
print(json.dumps({'passed':result['passed'],'phase':'before' if sys.argv[1:]==['before'] else 'after'},ensure_ascii=False))
sys.exit(0 if result['passed'] else 1)
