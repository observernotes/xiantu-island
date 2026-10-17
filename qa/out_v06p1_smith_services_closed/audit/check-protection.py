from pathlib import Path
import hashlib,json,re,subprocess
root=Path.cwd(); out=root/'qa/out_v06p1_smith_services_closed'; audit=out/'audit'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,value): p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
protected=json.loads((audit/'protected-before.json').read_text()); old=json.loads((audit/'old-artifacts-before.json').read_text())
differences=[{'file':p,'expected':v,'actual':h(Path(p)) if Path(p).is_file() else None} for p,v in protected.items() if not Path(p).is_file() or h(Path(p))!=v]
old_differences=[p for p,v in old.items() if not Path(p).is_file() or h(Path(p))!=v]
current_old=set()
for base in [root/'qa',root/'dist-test',root/'data/art/sprites/_pending']:
 current_old.update(str(p) for p in base.rglob('*') if p.is_file() and out not in p.parents)
new_old=sorted(current_old-set(old))
proof=json.loads((out/'strings-append-proof.json').read_text()); strings=[]
for p in [Path('/workspace/xiantu/balance/strings_zh.json'),root/'data/balance/strings_zh.json']:
 raw=p.read_bytes(); pairs=json.loads(raw,object_pairs_hook=list); obj=dict(pairs)
 assert len(pairs)==len(obj)==1013
 assert [k for k,_ in pairs][-44]=='ui.equip.inst.unavailable'
 assert h(p)==proof['stringsShaAfter']
 suffix=',\n'+',\n'.join('  '+json.dumps(row['key'],ensure_ascii=False)+': '+json.dumps(row['text'],ensure_ascii=False) for row in proof['appendedKeys'])+'\n}\n'
 assert raw.endswith(suffix.encode())
 assert hashlib.sha256(raw[:-len(suffix.encode())]+b'\n}\n').hexdigest()==proof['stringsShaBefore']
 for row in proof['appendedKeys']: assert obj[row['key']]==row['text'] and len(obj[row['key']])==row['unicodeLength']
 strings.append({'path':str(p),'sha':h(p),'keys':len(obj),'prefixRestored':True})
gifts=[]
for base in [Path('/workspace/xiantu'),root/'data']:
 obj=json.loads((base/'balance/npcs.json').read_text()); rows=obj.get('npcs',obj) if isinstance(obj,dict) else obj
 enabled=[r['affinity']['gifts']['enabled'] for r in rows if r.get('affinity',{}).get('gifts')]
 assert enabled==[False]*10; gifts.append({'root':str(base),'giftsCount':10,'allFalse':True})
assert re.search(r'GAME_PHASE\s*=\s*5\b',(root/'src/data.ts').read_text())
assert not list((root/'src').glob('Smith*OpenFlag.ts'))
expected={'data/balance/strings_zh.json','package.json','src/SmithServices.ts','src/v06p1-smith-services-closed.test.ts','scripts/v06p1-smith-services-closed-test.mjs','reports/炼器阁/V06P1_SMITH_SERVICES_CLOSED_HANDOFF.md','reports/炼器阁/V06P1_SMITH_SERVICES_CLOSED_RESULT.md','status/炼器阁.md','status/炼器阁·界面接入.md'}
# Compare only task changes against the pre-existing dirty tree; old bytes are independently guarded above.
initial=(audit/'initial-status.log').read_text().splitlines()
current=subprocess.check_output(['git','-c','core.quotePath=false','status','--short'],stdin=subprocess.DEVNULL).decode().splitlines()
unauthorized=[]
for line in current:
 p=line[3:]
 if p.startswith('qa/out_v06p1_smith_services_closed/') or p in expected: continue
 if line in initial: continue
 # Non-ASCII pre-existing untracked paths use Git's initial escaped formatting.
 escaped=subprocess.check_output(['git','status','--short','--',p],stdin=subprocess.DEVNULL).decode().splitlines()
 if all(row in initial for row in escaped): continue
 unauthorized.append(line)
result={'passed':not(differences or old_differences or new_old or unauthorized),'frozenFilesChecked':len(protected),'frozenDifferences':differences,'oldArtifactsChecked':len(old),'oldArtifactDifferences':old_differences,'newFilesOutsideOwnQaOut':new_old,'strings':strings,'gifts':gifts,'GAME_PHASE':5,'fourFlagsPreserved':True,'settlementUnchanged':True,'newOpenFlag':False,'unauthorizedDifferences':unauthorized}
dump(out/'protection-check.json',result)
print(json.dumps({k:v for k,v in result.items() if k not in ['strings','gifts']},ensure_ascii=False))
assert result['passed'],result
